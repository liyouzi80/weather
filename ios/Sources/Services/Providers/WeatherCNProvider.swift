import Foundation

// 中国天气网（weather.com.cn，中国气象局旗下）实时实况。
// 数据：http://d1.weather.com.cn/sk_2d/{城市码}.html（var dataSK={...}，需 Referer）。
// URLSession 无 CORS 限制，直接携带 Referer 头调用，无需代理。
struct WeatherCNProvider: WeatherProvider {
    let id = "weathercn"
    let name = "中国天气网"
    let color = "#14b8a6"
    let requiresKey = false
    func isConfigured() -> Bool { true }
    func appliesTo(_ loc: GeoLocation) -> Bool { loc.weatherCnCode != nil }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        guard let code = loc.weatherCnCode else { throw FetchError.noData }
        guard let url = URL(string: "http://d1.weather.com.cn/sk_2d/\(code).html") else {
            throw FetchError.invalidURL
        }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue("http://www.weather.com.cn/", forHTTPHeaderField: "Referer")
        req.setValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
                     forHTTPHeaderField: "User-Agent")

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw FetchError.httpError((resp as? HTTPURLResponse)?.statusCode ?? 0)
        }
        let text = String(data: data, encoding: .utf8) ?? ""

        // 解析 var dataSK={...} 或 {...}
        guard let braceStart = text.firstIndex(of: "{"),
              let braceEnd = text.lastIndex(of: "}") else {
            throw FetchError.decodingError("未解析到数据对象")
        }
        let jsonSlice = String(text[braceStart...braceEnd])
        guard let jsonData = jsonSlice.data(using: .utf8),
              let d = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            throw FetchError.decodingError("JSON 解析失败")
        }

        guard let tempStr = d["temp"] as? String ?? (d["temp"] as? NSNumber).map({ "\($0)" }),
              let temp = Double(tempStr), !temp.isNaN else {
            throw FetchError.noData
        }

        let wse = (d["wse"] as? String).flatMap { Double($0.replacingOccurrences(of: "km/h", with: "").trimmingCharacters(in: .whitespaces)) }
        let humStr = (d["SD"] as? String) ?? (d["sd"] as? String)
        let humidity = humStr.flatMap { Double($0.replacingOccurrences(of: "%", with: "")) }

        // sk_2d 只给观测时刻「HH:mm」（北京时），按北京当天日期补全为 UTC ISO
        var observedAt: String?
        if let timeStr = d["time"] as? String,
           let colonIdx = timeStr.firstIndex(of: ":") {
            let hh = Int(timeStr[timeStr.startIndex..<colonIdx]) ?? 0
            let mm = Int(timeStr[timeStr.index(after: colonIdx)...]) ?? 0
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(identifier: "UTC")!
            let bjNow = Date(timeIntervalSince1970: Date().timeIntervalSince1970 + 8 * 3600)
            var comps = cal.dateComponents([.year, .month, .day], from: bjNow)
            comps.hour = hh; comps.minute = mm; comps.second = 0
            if let dt = cal.date(from: comps) {
                let fmt = ISO8601DateFormatter()
                fmt.timeZone = TimeZone(identifier: "UTC")
                observedAt = fmt.string(from: dt)
            }
        }

        return CurrentWeather(
            temp: temp,
            feelsLike: nil,
            text: (d["weather"] as? String) ?? "—",
            humidity: humidity,
            windSpeed: wse,
            windDir: d["WD"] as? String,
            observedAt: observedAt,
            forecast: nil,
            forecastIssuedAt: nil,
            uvIndex: nil,
            warnings: nil,
            minutelyRain: nil
        )
    }
}
