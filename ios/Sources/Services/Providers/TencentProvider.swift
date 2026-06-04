import Foundation

// 腾讯天气（wis.qq.com）实时实况。
// URLSession 无 CORS 限制，直接调用，无需代理。
struct TencentProvider: WeatherProvider {
    let id = "tencent"
    let name = "腾讯天气"
    let color = "#0ea5e9"
    let requiresKey = false
    func isConfigured() -> Bool { true }
    func appliesTo(_ loc: GeoLocation) -> Bool { loc.tencent != nil }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        guard let t = loc.tencent else { throw FetchError.noData }
        var comps = URLComponents(string: "https://wis.qq.com/weather/common")!
        comps.queryItems = [
            URLQueryItem(name: "source", value: "pc"),
            URLQueryItem(name: "weather_type", value: "observe"),
            URLQueryItem(name: "province", value: t.province),
            URLQueryItem(name: "city", value: t.city),
            URLQueryItem(name: "county", value: t.county),
        ]
        guard let url = comps.url else { throw FetchError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
                     forHTTPHeaderField: "User-Agent")

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw FetchError.httpError((resp as? HTTPURLResponse)?.statusCode ?? 0)
        }
        guard let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let observe = (j["data"] as? [String: Any])?["observe"] as? [String: Any],
              let degreeStr = observe["degree"] as? String,
              let temp = Double(degreeStr) else {
            throw FetchError.noData
        }

        let humidity = (observe["humidity"] as? String).flatMap { Double($0) }
        let windDir = observe["wind_direction_name"] as? String

        // update_time 形如「202605300015」（北京时 yyyymmddHHMM）
        // 原样写入 ISO UTC 字段（前端按 UTC 渲染即显示北京时，不随设备时区偏移）
        var observedAt: String?
        if let ut = observe["update_time"] as? String, ut.count == 12,
           let Y = Int(ut.prefix(4)), let Mo = Int(ut.dropFirst(4).prefix(2)),
           let D = Int(ut.dropFirst(6).prefix(2)), let H = Int(ut.dropFirst(8).prefix(2)),
           let Mi = Int(ut.dropFirst(10).prefix(2)) {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(identifier: "UTC")!
            var comps = DateComponents()
            comps.year = Y; comps.month = Mo; comps.day = D; comps.hour = H; comps.minute = Mi
            if let dt = cal.date(from: comps) {
                let fmt = ISO8601DateFormatter()
                fmt.timeZone = TimeZone(identifier: "UTC")
                observedAt = fmt.string(from: dt)
            }
        }

        return CurrentWeather(
            temp: temp,
            feelsLike: nil,
            text: (observe["weather"] as? String) ?? "—",
            humidity: humidity,
            windSpeed: nil, // 腾讯仅给风力等级，无 km/h
            windDir: windDir,
            observedAt: observedAt,
            forecast: nil,
            forecastIssuedAt: nil,
            uvIndex: nil,
            warnings: nil,
            minutelyRain: nil,
            pop: nil
        )
    }
}
