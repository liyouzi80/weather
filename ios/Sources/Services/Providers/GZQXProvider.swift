import Foundation

// 广州市气象局·番禺 — 通过 Cloudflare Functions 代理抓取
struct GZQXProvider: WeatherProvider {
    let id = "gzqx"
    let name = "番禺气象台"
    let color = "#bf5af2"
    let requiresKey = false
    func isConfigured() -> Bool { true }
    func appliesTo(_ loc: GeoLocation) -> Bool { loc.cityName == "番禺" }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        guard let url = URL(string: "\(Keys.baseURL)/api/gz/realtime") else {
            throw FetchError.invalidURL
        }
        let resp: GZResp = try await fetchJSON(url, timeout: 12)
        guard let obs = resp.obs else { throw FetchError.noData }
        return CurrentWeather(
            temp: obs.tem ?? 0,
            feelsLike: nil,
            text: obs.wea ?? "未知",
            humidity: obs.rhu,
            windSpeed: obs.ws,
            windDir: obs.wd,
            observedAt: obs.time,
            forecast: resp.forecast,
            forecastIssuedAt: resp.forecastIssuedAt,
            uvIndex: nil, warnings: nil, minutelyRain: nil
        )
    }

    private struct GZResp: Decodable {
        let obs: GZObs?; let forecast: String?; let forecastIssuedAt: String?
        struct GZObs: Decodable {
            let tem: Double?; let wea: String?; let rhu: Double?
            let ws: Double?; let wd: String?; let time: String?
        }
    }
}
