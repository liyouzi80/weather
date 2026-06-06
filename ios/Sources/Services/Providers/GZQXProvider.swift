import Foundation

// 广州市气象局·番禺 — 原生直抓 www.tqyb.com.cn（无需 Cloudflare 代理）。
//
// 番禺页面由 require.js 驱动，实况/预报来自形如 `try{ var X = {...};}catch(e){}`
// 的 JS 数据文件（UTF-8）：
//  1) 实况（番禺区均值）：/data/obtAreaRep/gz_obtAreaRep.js
//     GDPY 字段为番禺区所有气象站聚合统计；值 = 各站×10之和，z = 统计站数；
//     均值公式：value / z / 10；字段：t 温度 / rh 湿度 / wdidd 风向(度) / wdidf 风速(m/s)
//              hourrf 时雨量 / p 气压(hPa) / ddatetime 观测时间（北京时字符串）。
//  2) 番禺短时预报文字：/data/shorttime/GDPY_shorttime.js（content 正文 / ddatetime 发布时间）
//  3) 预警信号（JSON）：/data/alarm/panyu/panyu_areaAlarm.js
//     JSON 数组，每项含 serial 字段（如「暴雨黄色」），无需解析 HTML。
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
    private var obtAreaRepURL: String { "\(Self.origin)/data/obtAreaRep/gz_obtAreaRep.js" }
    private var forecastURL: String { "\(Self.origin)/data/shorttime/GDPY_shorttime.js" }
    private var alarmURL: String { "\(Self.origin)/data/alarm/panyu/panyu_areaAlarm.js" }

    private let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    private var fetchHeaders: [String: String] {
        ["User-Agent": ua, "Referer": "\(Self.origin)/gzpanyu/", "X-Requested-With": "XMLHttpRequest"]
    }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        // 实况必需；短时预报 / 预警失败不影响实况返回。
        async let rtTask = fetchObject(obtAreaRepURL, varName: "gz_obtAreaRep")
        async let fcTask = fetchObjectOptional(forecastURL, varName: "GDPY_shorttime")
        async let alarmTask = fetchArrayOptional(alarmURL, varName: "panyu_areaAlarm")

        let rt = try mapAreaData(try await rtTask)
        let fc = await fcTask
        let alarmItems = await alarmTask

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
        if let items = alarmItems {
            let w = parseAlarms(items)
            if !w.isEmpty { warnings = w }
        }

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
        guard let url = URL(string: "\(urlStr)?t=\(Int(Date().timeIntervalSince1970) / 60)") else { throw FetchError.invalidURL }
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

    private func fetchArray(_ urlStr: String, varName: String) async throws -> [[String: Any]] {
        guard let url = URL(string: "\(urlStr)?t=\(Int(Date().timeIntervalSince1970) / 60)") else { throw FetchError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 12)
        fetchHeaders.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { throw FetchError.noData }
        let text = String(data: data, encoding: .utf8) ?? ""
        return try extractArray(text, varName: varName)
    }

    private func fetchArrayOptional(_ urlStr: String, varName: String) async -> [[String: Any]]? {
        try? await fetchArray(urlStr, varName: varName)
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

    /// 映射成统一模型：从 gz_obtAreaRep GDPY 字段取番禺区均值（value / z / 10）。
    private func mapAreaData(_ d: [String: Any]) throws -> GzRT {
        guard let gdpy = d["GDPY"] as? [String: Any] else {
            throw FetchError.noData
        }

        func numVal(_ obj: [String: Any], _ key: String) -> Double? {
            let v = obj[key]
            if let num = v as? NSNumber { return num.doubleValue }
            if let s = v as? String { return Double(s) }
            return nil
        }

        guard let z = numVal(gdpy, "z"), z > 0 else { throw FetchError.noData }

        func mean(_ key: String) -> Double? {
            guard let v = numVal(gdpy, key), v > -999 * z else { return nil }
            return v / z / 10
        }

        guard let temp = mean("t") else { throw FetchError.noData }

        let speedMs = mean("wdidf") // m/s
        let deg = mean("wdidd")    // 度

        // ddatetime 为北京时字符串（如「2026-06-05 15:00」）；
        // 按惯例存为"北京时写入 UTC 字段"，前端渲染时直接显示即为正确的北京时间。
        var observedAt: String?
        if let ts = gdpy["ddatetime"] as? String {
            let dtStr = ts.replacingOccurrences(of: " ", with: "T")
            let withSec: String
            if dtStr.range(of: "T\\d{2}:\\d{2}$", options: .regularExpression) != nil {
                withSec = dtStr + ":00"
            } else {
                withSec = dtStr
            }
            observedAt = withSec + ".000Z"
        }

        return GzRT(
            temp: temp,
            humidity: mean("rh"),
            windSpeed: speedMs != nil ? (speedMs! * 3.6 * 10).rounded() / 10 : nil, // m/s -> km/h
            windDir: deg != nil ? degToDir(deg!) : nil,
            text: nil, // 区均值实况无天气现象描述
            observedAt: observedAt
        )
    }

    /// 从 panyu_areaAlarm JSON 数组解析生效预警信号。
    /// serial 形如「暴雨黄色」，末2字为等级，其余为类型。
    private func parseAlarms(_ items: [[String: Any]]) -> [WeatherWarning] {
        var warnings: [WeatherWarning] = []
        var seen = Set<String>()
        for item in items {
            guard let serial = item["serial"] as? String, serial.count >= 3 else { continue }
            let level = String(serial.suffix(2))
            let type = String(serial.dropLast(2))
            guard !type.isEmpty else { continue }
            let key = type + level
            if seen.contains(key) { continue }
            seen.insert(key)
            warnings.append(WeatherWarning(title: "\(type)\(level)预警信号", type: type, level: level))
        }
        return warnings
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

    /// 从 `var <varName> = [...];` 中用括号配对精确截取 JSON 数组（兼容外层 try/catch）。
    private func extractArray(_ text: String, varName: String) throws -> [[String: Any]] {
        let ns = text as NSString
        let anchor = ns.range(of: varName).location
        let searchFrom = anchor == NSNotFound ? 0 : anchor
        let bracketRange = ns.range(of: "[", options: [], range: NSRange(location: searchFrom, length: ns.length - searchFrom))
        guard bracketRange.location != NSNotFound else { throw FetchError.decodingError("未找到数组起始 [") }
        let from = bracketRange.location

        let quote = ("\"" as NSString).character(at: 0)
        let apos = ("'" as NSString).character(at: 0)
        let open = ("[" as NSString).character(at: 0)
        let close = ("]" as NSString).character(at: 0)
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
                          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                        throw FetchError.decodingError("数组解析失败")
                    }
                    return arr
                }
            }
            i += 1
        }
        throw FetchError.decodingError("括号不配对")
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
