import Foundation

struct QWeatherProvider: WeatherProvider {
    let id = "qweather"
    let name = "和风天气"
    let color = "#30d158"
    let requiresKey = true
    func isConfigured() -> Bool { !Keys.qweather.isEmpty }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        let key = Keys.qweather
        let base = "https://devapi.qweather.com/v7"
        let locStr = "\(loc.lon),\(loc.lat)"

        async let nowResp: QNowResp      = fetchJSON(qurl("\(base)/weather/now", loc: locStr, key: key))
        async let uvResp: QUVResp?       = try? fetchJSON(qurl("\(base)/indices/1d?type=5", loc: locStr, key: key))
        async let warnResp: QWarnResp?   = try? fetchJSON(qurl("\(base)/warning/now", loc: locStr, key: key))
        async let rainResp: QRainResp?   = try? fetchJSON(qurl("\(base)/minutely/5m", loc: locStr, key: key))
        async let hourlyResp: QHourlyResp? = try? fetchJSON(qurl("\(base)/weather/24h", loc: locStr, key: key))

        let now = try await nowResp
        guard let n = now.now else { throw FetchError.noData }

        let uv    = try? await uvResp
        let warn  = try? await warnResp
        let rain  = try? await rainResp
        let hourly = try? await hourlyResp

        let warnings: [WeatherWarning]? = warn?.warning?.map {
            WeatherWarning(title: $0.title ?? "", type: $0.typeName ?? $0.type ?? "", level: $0.level ?? "蓝色")
        }

        let minutelyRain: MinutelyRain? = rain.flatMap { r in
            guard let m = r.minutely, !m.isEmpty else { return nil }
            let items = m.map { MinutelyRain.Minutely(fxTime: $0.fxTime, precip: Double($0.precip) ?? 0, type: $0.type) }
            // 仅当未来一小时有实际降水时才返回，否则不展示卡片（与 PWA 一致）
            guard items.contains(where: { $0.precip > 0 }) else { return nil }
            return MinutelyRain(summary: r.summary ?? "", minutely: items)
        }

        let pop: Double? = hourly?.hourly.flatMap { hours -> Double? in
            let vals = hours.prefix(12).compactMap { Double($0.pop ?? "") }.filter { $0 >= 0 }
            return vals.isEmpty ? nil : vals.max()
        }

        return CurrentWeather(
            temp: Double(n.temp ?? "0") ?? 0,
            feelsLike: Double(n.feelsLike ?? ""),
            text: n.text ?? "未知",
            humidity: Double(n.humidity ?? ""),
            windSpeed: Double(n.windSpeed ?? ""),
            windDir: n.windDir,
            observedAt: n.obsTime,
            forecast: nil, forecastIssuedAt: nil,
            uvIndex: Double(uv?.daily?.first?.value ?? ""),
            warnings: warnings,
            minutelyRain: minutelyRain,
            pop: pop
        )
    }

    private func qurl(_ base: String, loc: String, key: String) -> URL {
        URL(string: "\(base)?location=\(loc)&key=\(key)")!
    }

    // MARK: Response models
    private struct QNowResp: Decodable {
        let now: QNow?
        struct QNow: Decodable {
            let temp: String?; let feelsLike: String?; let text: String?
            let humidity: String?; let windSpeed: String?; let windDir: String?
            let obsTime: String?
        }
    }
    private struct QUVResp: Decodable {
        let daily: [QUVDaily]?
        struct QUVDaily: Decodable { let value: String? }
    }
    private struct QWarnResp: Decodable {
        let warning: [QWarning]?
        struct QWarning: Decodable {
            let title: String?; let typeName: String?; let type: String?; let level: String?
        }
    }
    private struct QRainResp: Decodable {
        let summary: String?
        let minutely: [QMinutely]?
        struct QMinutely: Decodable { let fxTime: String; let precip: String; let type: String }
    }
    private struct QHourlyResp: Decodable {
        let hourly: [QHourly]?
        struct QHourly: Decodable { let pop: String? }
    }
}
