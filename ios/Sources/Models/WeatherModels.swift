import Foundation

struct GeoLocation: Identifiable, Codable, Equatable {
    var id: String { name }
    let name: String
    let lat: Double
    let lon: Double
    let cityName: String?
    let weatherCnCode: String?
    let tencent: TencentLocation?

    struct TencentLocation: Codable, Equatable {
        let province: String
        let city: String
        let county: String
    }
}

struct CurrentWeather {
    let temp: Double
    let feelsLike: Double?
    let text: String
    let humidity: Double?
    let windSpeed: Double?
    let windDir: String?
    let observedAt: String?
    let forecast: String?
    let forecastIssuedAt: String?
    let uvIndex: Double?
    let warnings: [WeatherWarning]?
    let minutelyRain: MinutelyRain?
}

struct WeatherWarning {
    let title: String
    let type: String
    let level: String

    var severity: Int {
        if level.contains("红") { return 4 }
        if level.contains("橙") { return 3 }
        if level.contains("黄") { return 2 }
        return 1
    }
}

struct MinutelyRain {
    let summary: String
    let minutely: [Minutely]

    struct Minutely {
        let fxTime: String
        let precip: Double
        let type: String
    }
}

struct ProviderResult: Identifiable {
    let id: String
    let providerId: String
    let providerName: String
    let color: String
    let current: CurrentWeather?
    let error: String?

    var hasData: Bool { current != nil }
}

struct AirQuality {
    let aqi: Int
    let dominant: String?
    let pm25: Double?
    let observedAt: String?
}

struct AqiResult: Identifiable {
    let id: String
    let providerId: String
    let providerName: String
    let color: String
    let url: URL?
    let air: AirQuality?
    let error: String?
}

struct WeatherStats {
    let avg: Double
    let min: Double
    let max: Double
    let count: Int
    let text: String
    let feelsLike: Double?
    let humidity: Double?
    let uvIndex: Double?
}

struct AnnotatedResult: Identifiable {
    let id: String
    let base: ProviderResult
    let isMax: Bool
    let isMin: Bool
}

// MARK: - Static city list (matches web app)

extension GeoLocation {
    static let all: [GeoLocation] = [
        GeoLocation(
            name: "番禺区",
            lat: 22.9468,
            lon: 113.3622,
            cityName: "番禺",
            weatherCnCode: "101280102",
            tencent: TencentLocation(province: "广东", city: "广州", county: "番禺区")
        ),
        GeoLocation(
            name: "安福县",
            lat: 27.3954,
            lon: 114.6195,
            cityName: "安福",
            weatherCnCode: "101240703",
            tencent: TencentLocation(province: "江西", city: "吉安", county: "安福县")
        ),
    ]
}
