import Foundation

// 广州市气象局·番禺 — 原生直抓 www.tqyb.com.cn（无需 Cloudflare 代理）。
//
// 番禺页面由 require.js 驱动，实况/预报来自形如 `try{ var X = {...};}catch(e){}`
// 的 JS 数据文件（UTF-8）：
//  1) 实况数值：/data/latestWeather/gz_latestWeather.js
//     gzObtInfo（番禺本地站）为主、baseObtInfo（广州基本站）备用；
//     temp 温度℃ / rh 湿度% / wd2dd 风向(度) / wd2ds 风速(m/s)；-999.9 等为缺测。
//  2) 番禺短时预报文字：/data/shorttime/GDPY_shorttime.js（content 正文 / ddatetime 发布时间）
//  3) 预警信号：渲染在番禺主页 #panyuAlarmList，需抓 HTML 解析。
//
// 浏览器受 CORS 限制只能经服务端代抓；原生 URLSession 无此限制，直接抓取。
struct GZQXProvider: WeatherProvider {
    let id = "gzqx"
    let name = "番禺气象台"
    let color = "#bf5af2"
    let requiresKey = false
    func isConfigured() -> Bool { true }
    func appliesTo(_ loc: GeoLocation) -> Bool { loc.cityName == "番禺" }

    private static let origin = "http://www.tqyb.com.cn"
    private var dataURL: String { "\(Self.origin)/data/latestWeather/gz_latestWeather.js" }
    private var forecastURL: String { "\(Self.origin)/data/shorttime/GDPY_shorttime.js" }
    private var homeURL: String { "\(Self.origin)/gzpanyu/" }

    private let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    private var fetchHeaders: [String: String] {
        ["User-Agent": ua, "Referer": "\(Self.origin)/gzpanyu/", "X-Requested-With": "XMLHttpRequest"]
    }
    private var pageHeaders: [String: String] {
        ["User-Agent": ua, "Referer": "\(Self.origin)/gzpanyu/", "Cache-Control": "no-cache", "Pragma": "no-cache"]
    }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        // 实况必需；短时预报 / 预警失败不影响实况返回。
        async let rtTask = fetchObject(dataURL, varName: "gz_latestWeather")
        async let fcTask = fetchObjectOptional(forecastURL, varName: "GDPY_shorttime")
        async let homeTask = fetchTextOptional(homeURL)

        let rt = try mapData(try await rtTask)
        let fc = await fcTask
        let html = await homeTask

        var forecast: String?
        var forecastIssuedAt: String?
        if let fc {
            let content = (fc["content"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let issued = fc["ddatetime"] as? String
            if let content, !content.isEmpty, isForecastCurrent(content: content, issued: issued) {
                forecast = content
                forecastIssuedAt = issued
            }
        }

        var warnings: [WeatherWarning]?
        if let html {
            let w = parseWarnings(html)
            if !w.isEmpty { warnings = w }
        }

        // 基本站实况没有天气现象描述（rt.text 恒为 nil）；若短时预报也不在时效内、
        // 且无生效预警，这张信源卡无实质内容（仅温度/湿度/风），与 PWA 一致：静默隐藏。
        // 注意：预报须包含「X时到Y时」时间窗口或注意事项关键词，
        // 才能让 NoticeCardView 实际渲染，否则等同于无内容。
        let hasForecastContent: Bool
        if let fc = forecast {
            hasForecastContent = fc.range(of: "\\d{1,2}时到\\d{1,2}时", options: .regularExpression) != nil ||
                fc.range(of: "注意|防范|防御|局部|短时强|冰雹|建议", options: .regularExpression) != nil
        } else {
            hasForecastContent = false
        }
        if rt.text == nil && !hasForecastContent && (warnings?.isEmpty ?? true) {
            throw FetchError.noData
        }

        return CurrentWeather(
            temp: rt.temp,
            feelsLike: nil,
            text: rt.text ?? "未知",
            humidity: rt.humidity,
            windSpeed: rt.windSpeed,
            windDir: rt.windDir,
            observedAt: rt.observedAt,
            forecast: forecast,
            forecastIssuedAt: forecastIssuedAt,
            uvIndex: nil,
            warnings: warnings,
            minutelyRain: nil,
            pop: nil
        )
    }

    // MARK: - 网络抓取

    private func fetchObject(_ urlStr: String, varName: String) async throws -> [String: Any] {
        guard let url = URL(string: "\(urlStr)?random=\(Double.random(in: 0..<1))") else { throw FetchError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 12)
        fetchHeaders.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { throw FetchError.noData }
        let text = String(data: data, encoding: .utf8) ?? ""
        return try extractObject(text, varName: varName)
    }

    private func fetchObjectOptional(_ urlStr: String, varName: String) async -> [String: Any]? {
        try? await fetchObject(urlStr, varName: varName)
    }

    private func fetchTextOptional(_ urlStr: String) async -> String? {
        guard let url = URL(string: "\(urlStr)?t=\(Int(Date().timeIntervalSince1970 * 1000))") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 12)
        pageHeaders.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse, http.statusCode == 200 else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - 解析

    private struct GzRT {
        var temp: Double
        var humidity: Double?
        var windSpeed: Double?
        var windDir: String?
        var text: String?
        var observedAt: String?
    }

    /// 映射成统一模型：取 gzObtInfo（番禺本地站），备用 baseObtInfo（广州基本站）。
    private func mapData(_ d: [String: Any]) throws -> GzRT {
        guard let obt = (d["gzObtInfo"] as? [String: Any]) ?? (d["baseObtInfo"] as? [String: Any]) else {
            throw FetchError.noData
        }
        func clean(_ key: String) -> Double? {
            let v = obt[key]
            var n: Double?
            if let num = v as? NSNumber { n = num.doubleValue }
            else if let s = v as? String { n = Double(s) }
            guard let nn = n, nn > -999 else { return nil }
            return nn
        }
        guard let temp = clean("temp") else { throw FetchError.noData }
        let speed = clean("wd2ds") // m/s
        let deg = clean("wd2dd")   // 度

        var observedAt: String?
        let tsAny = d["gzObtDate"] ?? d["baseObtDate"]
        if let ts = (tsAny as? NSNumber)?.doubleValue ?? (tsAny as? String).flatMap({ Double($0) }) {
            // ts 为毫秒 UTC 时间戳；+8h 转北京墙上时间后写入 UTC 字段，前端按 UTC 渲染即原样显示。
            let beijing = Date(timeIntervalSince1970: ts / 1000 + 8 * 3600)
            let fmt = ISO8601DateFormatter()
            fmt.timeZone = TimeZone(identifier: "UTC")
            observedAt = fmt.string(from: beijing)
        }

        return GzRT(
            temp: temp,
            humidity: clean("rh"),
            windSpeed: speed != nil ? (speed! * 3.6 * 10).rounded() / 10 : nil, // m/s -> km/h
            windDir: deg != nil ? degToDir(deg!) : nil,
            text: nil, // 基本站实况无天气现象描述
            observedAt: observedAt
        )
    }

    /// 从 `var <varName> = {...};` 中用括号配对精确截取 JSON 对象（兼容外层 try/catch 与字符串内括号）。
    private func extractObject(_ text: String, varName: String) throws -> [String: Any] {
        let ns = text as NSString
        let anchor = ns.range(of: varName).location
        let searchFrom = anchor == NSNotFound ? 0 : anchor
        let braceRange = ns.range(of: "{", options: [], range: NSRange(location: searchFrom, length: ns.length - searchFrom))
        guard braceRange.location != NSNotFound else { throw FetchError.decodingError("未找到对象起始 {") }
        let from = braceRange.location

        let quote = ("\"" as NSString).character(at: 0)
        let apos = ("'" as NSString).character(at: 0)
        let open = ("{" as NSString).character(at: 0)
        let close = ("}" as NSString).character(at: 0)
        let backslash = ("\\" as NSString).character(at: 0)

        var depth = 0
        var inStr = false
        var strCh: unichar = 0
        var i = from
        while i < ns.length {
            let ch = ns.character(at: i)
            if inStr {
                if ch == strCh && (i == 0 || ns.character(at: i - 1) != backslash) { inStr = false }
            } else if ch == quote || ch == apos {
                inStr = true
                strCh = ch
            } else if ch == open {
                depth += 1
            } else if ch == close {
                depth -= 1
                if depth == 0 {
                    let slice = ns.substring(with: NSRange(location: from, length: i - from + 1))
                    guard let data = slice.data(using: .utf8),
                          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                        throw FetchError.decodingError("对象解析失败")
                    }
                    return obj
                }
            }
            i += 1
        }
        throw FetchError.decodingError("括号不配对")
    }

    /// 从番禺主页 HTML 解析生效预警信号。优先 #panyuAlarmList 区域，找不到则搜全页。
    private func parseWarnings(_ html: String) -> [WeatherWarning] {
        let clean = html
            .replacingOccurrences(of: "<script[\\s\\S]*?</script>", with: " ", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<style[\\s\\S]*?</style>", with: " ", options: [.regularExpression, .caseInsensitive])

        let types = "台风|暴雨|暴雪|寒潮|大风|沙尘暴|高温|干旱|雷电|冰雹|霜冻|大雾|霾|道路结冰|雷雨大风|森林火险|灰霾|寒冷"
        let levels = "蓝色|黄色|橙色|红色|白色"

        let ns = clean as NSString
        let ti = ns.range(of: "panyuAlarmList").location
        var searchArea: String
        if ti != NSNotFound {
            var endIdx = -1
            for c in ["</table>", "</div>", "</ul>", "</section>"] {
                let r = ns.range(of: c, options: [], range: NSRange(location: ti, length: ns.length - ti))
                if r.location != NSNotFound, r.location > ti, endIdx < 0 || Int(r.location) < endIdx {
                    endIdx = r.location
                }
            }
            if endIdx > ti {
                searchArea = ns.substring(with: NSRange(location: ti, length: min(endIdx + 20, ns.length) - ti))
            } else {
                searchArea = ns.substring(with: NSRange(location: ti, length: min(12000, ns.length - ti)))
            }
        } else {
            let bs = ns.range(of: "<body").location
            searchArea = bs != NSNotFound ? ns.substring(from: bs) : clean
        }

        let imgMeta = matches(in: searchArea, pattern: "(?:alt|title|src)=\"([^\"]+)\"", group: 1).joined(separator: " ")
        let plainText = searchArea
            .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&#\\d+;", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&[a-z]+;", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)

        if plainText.range(of: "无生效预警|暂无预警|无预警", options: .regularExpression) != nil { return [] }

        let combined = "\(plainText) \(imgMeta)"
        let cns = combined as NSString
        var warnings: [WeatherWarning] = []
        var seen = Set<String>()
        if let re = try? NSRegularExpression(pattern: "(\(types))(\(levels))预警(?:信号)?") {
            re.enumerateMatches(in: combined, range: NSRange(location: 0, length: cns.length)) { m, _, _ in
                guard let m else { return }
                let type = cns.substring(with: m.range(at: 1))
                let level = cns.substring(with: m.range(at: 2))
                let key = type + level
                if seen.contains(key) { return }
                seen.insert(key)
                warnings.append(WeatherWarning(title: "\(type)\(level)预警信号", type: type, level: level))
            }
        }
        return warnings
    }

    /// 短时预报时效检测：按预报窗口结束时间（北京时）判断是否过期，过期返回 false。
    private func isForecastCurrent(content: String?, issued: String?) -> Bool {
        guard let issued, let m = firstMatch(issued, "(\\d{4})年(\\d{1,2})月(\\d{1,2})日\\s*(\\d{1,2}):(\\d{2})") else { return true }
        guard let Y = Int(m[1]), let Mo = Int(m[2]), let D = Int(m[3]), let H = Int(m[4]), let Mi = Int(m[5]) else { return true }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        var comps = DateComponents()
        comps.year = Y; comps.month = Mo; comps.day = D; comps.hour = H - 8; comps.minute = Mi
        guard let issuedDate = cal.date(from: comps) else { return true }
        let issuedMs = issuedDate.timeIntervalSince1970
        let now = Date().timeIntervalSince1970
        if now < issuedMs - 3600 { return true } // 时钟偏差保护

        var limitMs: Double
        if let content, let em = firstMatch(content, "到\\s*(\\d{1,2})\\s*时"), let eh = Int(em[1]) {
            let dayOffset = eh <= H ? 1 : 0
            var lc = DateComponents()
            lc.year = Y; lc.month = Mo; lc.day = D + dayOffset; lc.hour = eh - 8; lc.minute = 0
            limitMs = (cal.date(from: lc) ?? issuedDate).timeIntervalSince1970
        } else {
            limitMs = issuedMs + 4 * 3600
        }
        return now <= limitMs + 30 * 60 // 30 分钟宽限
    }

    private func degToDir(_ deg: Double) -> String {
        let dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]
        return dirs[Int((deg / 45).rounded()) % 8] + "风"
    }

    // MARK: - 正则辅助

    private func matches(in text: String, pattern: String, group: Int) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).compactMap {
            $0.range(at: group).location != NSNotFound ? ns.substring(with: $0.range(at: group)) : nil
        }
    }

    private func firstMatch(_ s: String, _ pattern: String) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (0..<m.numberOfRanges).map {
            m.range(at: $0).location != NSNotFound ? ns.substring(with: m.range(at: $0)) : ""
        }
    }
}
