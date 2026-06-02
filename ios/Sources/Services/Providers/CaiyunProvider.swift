import Foundation

struct CaiyunProvider: WeatherProvider {
    let id = "caiyun"
    let name = "彩云天气"
    let color = "#64d2ff"
    let requiresKey = true
    func isConfigured() -> Bool { !Keys.caiyun.isEmpty }

    private let textMap: [String: String] = [
        "CLEAR_DAY": "晴", "CLEAR_NIGHT": "晴", "PARTLY_CLOUDY_DAY": "多云",
        "PARTLY_CLOUDY_NIGHT": "多云", "CLOUDY": "阴", "LIGHT_HAZE": "轻度雾霾",
        "MODERATE_HAZE": "中度雾霾", "HEAVY_HAZE": "重度雾霾", "LIGHT_RAIN": "小雨",
        "MODERATE_RAIN": "中雨", "HEAVY_RAIN": "大雨", "STORM_RAIN": "暴雨",
        "FOG": "雾", "LIGHT_SNOW": "小雪", "MODERATE_SNOW": "中雪",
        "HEAVY_SNOW": "大雪", "STORM_SNOW": "暴雪", "DUST": "浮尘",
        "SAND": "沙尘", "WIND": "大风",
    ]

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        guard let url = URL(string: "https://api.caiyunapp.com/v2.6/\(Keys.caiyun)/\(loc.lon),\(loc.lat)/realtime") else {
            throw FetchError.invalidURL
        }
        let resp: CYResp = try await fetchJSON(url)
        guard let r = resp.result?.realtime else { throw FetchError.noData }
        let text = textMap[r.skycon ?? ""] ?? r.skycon ?? "未知"
        return CurrentWeather(
            temp: r.temperature ?? 0,
            feelsLike: r.apparent_temperature,
            text: text,
            humidity: r.humidity.map { $0 * 100 },
            windSpeed: r.wind?.speed.map { $0 * 3.6 },
            windDir: nil,
            observedAt: nil,
            forecast: nil, forecastIssuedAt: nil,
            uvIndex: r.life_index?.ultraviolet?.index,
            warnings: nil, minutelyRain: nil
        )
    }

    private struct CYResp: Decodable {
        let result: CYResult?
        struct CYResult: Decodable {
            let realtime: CYRealtime?
            struct CYRealtime: Decodable {
                let temperature: Double?; let apparent_temperature: Double?
                let skycon: String?; let humidity: Double?
                let wind: CYWind?
                let life_index: CYLife?
                struct CYWind: Decodable { let speed: Double? }
                struct CYLife: Decodable { let ultraviolet: CYUV? }
                struct CYUV: Decodable { let index: Double? }
            }
        }
    }
}
