import Foundation

struct OWMProvider: WeatherProvider {
    let id = "owm"
    let name = "OpenWeatherMap"
    let color = "#ff9f0a"
    let requiresKey = true
    func isConfigured() -> Bool { !Keys.owm.isEmpty }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        guard let url = URL(string: "https://api.openweathermap.org/data/2.5/weather?lat=\(loc.lat)&lon=\(loc.lon)&appid=\(Keys.owm)&units=metric&lang=zh_cn") else {
            throw FetchError.invalidURL
        }
        let resp: OWMResp = try await fetchJSON(url)
        return CurrentWeather(
            temp: resp.main.temp,
            feelsLike: resp.main.feels_like,
            text: resp.weather.first?.description ?? "未知",
            humidity: Double(resp.main.humidity),
            windSpeed: resp.wind?.speed.map { $0 * 3.6 },
            windDir: resp.wind?.deg.map { degreesToDir($0) },
            observedAt: resp.dt.map { ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: TimeInterval($0))) },
            forecast: nil, forecastIssuedAt: nil,
            uvIndex: nil, warnings: nil, minutelyRain: nil
        )
    }

    private func degreesToDir(_ deg: Double) -> String {
        let dirs = ["北","东北","东","东南","南","西南","西","西北"]
        return dirs[Int((deg + 22.5) / 45) % 8]
    }

    private struct OWMResp: Decodable {
        let main: Main; let weather: [Weather]; let wind: Wind?; let dt: Int?
        struct Main: Decodable { let temp: Double; let feels_like: Double?; let humidity: Int }
        struct Weather: Decodable { let description: String? }
        struct Wind: Decodable { let speed: Double?; let deg: Double? }
    }
}
