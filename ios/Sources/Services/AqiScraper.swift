import Foundation

// 美国标准 AQI 原生直抓与聚合（移植自 functions/_lib/aqi.ts）。
// 浏览器受 CORS 限制需服务端代抓；原生 URLSession 直接抓取 air-quality.com / iqair.cn。
enum AqiScraper {
    // 各城市站点页路径（精确到本地监测站）
    static let amPath: [String: String] = [
        "番禺": "place/china/fanyudaxuecheng/3b401494",                 // 番禺大学城
        "安福": "place/china/anfuxianwenhuaguangchang/cd272b77",        // 安福县文化广场
    ]
    static let iqairPath: [String: String] = [
        "番禺": "cn/china/guangdong/guangzhou/panyu-university-town",
        "安福": "cn/china/jiangxi/jian/anfu-county-environmental-protection-bureau", // 安福县环保局
    ]

    private static let pol: [String: String] = [
        "O3": "O₃", "PM2.5": "PM2.5", "PM10": "PM10", "NO2": "NO₂", "SO2": "SO₂", "CO": "CO",
    ]
    private static let iqairCats = "优秀|优|良好|良|中等|对敏感人群不健康|不健康|非常不健康|危险|危害"

    /// 聚合某城市多源 AQI，返回逐源结果（含失败项）。
    static func aggregate(cityName: String) async -> [AqiResult] {
        var collected: [AqiResult] = []
        await withTaskGroup(of: AqiResult?.self) { group in
            if let p = amPath[cityName] {
                group.addTask { try? await fetchAirMatters(path: p) }
            }
            if let p = iqairPath[cityName] {
                group.addTask { try? await fetchIQAir(path: p) }
            }
            for await r in group { if let r { collected.append(r) } }
        }
        // 稳定排序：在意空气在前
        return collected.sorted { ($0.id == "airmatters" ? 0 : 1) < ($1.id == "airmatters" ? 0 : 1) }
    }

    // MARK: - 在意空气（air-quality.com）

    static func fetchAirMatters(path: String) async throws -> AqiResult {
        let urlStr = "https://air-quality.com/\(path)?lang=zh-Hans&standard=aqi_us"
        guard let url = URL(string: urlStr) else { throw FetchError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 12)
        req.setValue("Mozilla/5.0 (compatible; WeatherWidget/1.0)", forHTTPHeaderField: "User-Agent")
        req.setValue("https://air-quality.com/", forHTTPHeaderField: "Referer")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw FetchError.httpError((resp as? HTTPURLResponse)?.statusCode ?? 0)
        }
        let html = String(data: data, encoding: .utf8) ?? ""
        guard let aqiM = firstMatch(html, "AQI \\(美国标准\\)\\s*(\\d+)"), let aqi = Int(aqiM[1]) else {
            throw FetchError.decodingError("解析失败")
        }

        // 各污染物含 ratio-bar 贡献度，取最大者为主要污染物
        let items = allMatches(html, "<div class='name'>([^<]+)</div><div class='unit'>[^<]*</div><div class='value'>([\\d.]+)</div><div class='ratio-bar' style='[^']*\\*([\\d.]+)\\)")
            .compactMap { g -> (name: String, value: Double, ratio: Double)? in
                guard g.count >= 4, let v = Double(g[2]), let r = Double(g[3]) else { return nil }
                return (g[1], v, r)
            }
        let dom = items.max { $0.ratio < $1.ratio }
        let pm = items.first { $0.name == "PM2.5" }

        // 观测时间：air-quality.com 内嵌 UTC 时间，+8h 换算成北京墙上时间
        let s = html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        var observedAt: String?
        if let tm = firstMatch(s, "(\\d{4})-(\\d{2})-(\\d{2})\\s+(\\d{1,2}):(\\d{2})\\s*AQI \\(美国标准\\)"),
           let y = Int(tm[1]), let mo = Int(tm[2]), let d = Int(tm[3]), let h = Int(tm[4]), let mi = Int(tm[5]) {
            observedAt = utcToBeijingISO(y, mo, d, h, mi)
        }

        let dominant = dom.map { pol[$0.name] ?? $0.name }
        return AqiResult(
            id: "airmatters", providerId: "airmatters", providerName: "在意空气", color: "#f59e0b",
            url: URL(string: urlStr),
            air: AirQuality(aqi: aqi, dominant: dominant, pm25: pm?.value, observedAt: observedAt),
            error: nil
        )
    }

    // MARK: - IQAir（iqair.cn）

    static func fetchIQAir(path: String) async throws -> AqiResult {
        let urlStr = "https://www.iqair.cn/\(path)"
        guard let url = URL(string: "\(urlStr)?t=\(Int(Date().timeIntervalSince1970 * 1000))") else { throw FetchError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 12)
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        req.setValue("no-cache, no-store", forHTTPHeaderField: "Cache-Control")
        req.setValue("no-cache", forHTTPHeaderField: "Pragma")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw FetchError.httpError((resp as? HTTPURLResponse)?.statusCode ?? 0)
        }
        let s = (String(data: data, encoding: .utf8) ?? "")
            .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)

        var aqi: Int
        var dominant: String?
        var pm25: Double?
        if let m = firstMatch(s, "(\\d+)\\s*美国 AQI⁺?\\s*(?:\(iqairCats))\\s*主要污染物[：:]\\s*(\\S+)\\s*([\\d.]+)\\s*µg"),
           let a = Int(m[1]) {
            aqi = a
            dominant = m[2]
            pm25 = m[2].contains("2.5") ? Double(m[3]) : nil
        } else if let l = firstMatch(s, "(\\d+)\\s*美国 AQI"), let a = Int(l[1]) {
            aqi = a
        } else {
            throw FetchError.decodingError("解析失败")
        }

        // 观测时间：「HH:MM, M月 D日 当地时间」（无年份，按当前年补全）
        var observedAt: String?
        if let tm = firstMatch(s, "(\\d{1,2}):(\\d{2})\\s*,?\\s*(\\d{1,2})月\\s*(\\d{1,2})日\\s*当地时间"),
           let h = Int(tm[1]), let mi = Int(tm[2]), let mo = Int(tm[3]), let d = Int(tm[4]) {
            let year = Calendar(identifier: .gregorian).component(.year, from: Date())
            observedAt = beijingToISO(year, mo, d, h, mi)
        }

        return AqiResult(
            id: "iqair", providerId: "iqair", providerName: "IQAir", color: "#0ea5e9",
            url: URL(string: urlStr),
            air: AirQuality(aqi: aqi, dominant: dominant, pm25: pm25, observedAt: observedAt),
            error: nil
        )
    }

    // MARK: - 时间换算（北京墙上时间原样写入 UTC 字段，前端按 UTC 渲染即原样显示）

    private static func beijingToISO(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int) -> String {
        isoString(y, mo, d, h, mi)
    }

    private static func utcToBeijingISO(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        var comps = DateComponents()
        comps.year = y; comps.month = mo; comps.day = d; comps.hour = h; comps.minute = mi
        let base = cal.date(from: comps) ?? Date()
        let shifted = base.addingTimeInterval(8 * 3600)
        let fmt = ISO8601DateFormatter()
        fmt.timeZone = TimeZone(identifier: "UTC")
        return fmt.string(from: shifted)
    }

    private static func isoString(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int) -> String {
        String(format: "%04d-%02d-%02dT%02d:%02d:00Z", y, mo, d, h, mi)
    }

    // MARK: - 正则辅助

    private static func firstMatch(_ s: String, _ pattern: String) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (0..<m.numberOfRanges).map {
            m.range(at: $0).location != NSNotFound ? ns.substring(with: m.range(at: $0)) : ""
        }
    }

    private static func allMatches(_ s: String, _ pattern: String) -> [[String]] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = s as NSString
        return re.matches(in: s, range: NSRange(location: 0, length: ns.length)).map { m in
            (0..<m.numberOfRanges).map {
                m.range(at: $0).location != NSNotFound ? ns.substring(with: m.range(at: $0)) : ""
            }
        }
    }
}
