import Foundation
import Observation

@Observable
class CityViewModel {
    var results: [ProviderResult] = []
    var air: [AqiResult] = []
    var loading = false
    var initialLoad = true
    var updatedAt = Date()

    let loc: GeoLocation
    private let agg = ProviderAggregator.shared

    init(loc: GeoLocation) {
        self.loc = loc
    }

    var stats: WeatherStats? { agg.analyze(results) }
    var annotated: [AnnotatedResult] { agg.annotate(results) }

    var avgAqi: Int? {
        let vals = air.compactMap { $0.air?.aqi }
        guard !vals.isEmpty else { return nil }
        return vals.reduce(0, +) / vals.count
    }

    var warnings: [WeatherWarning] {
        results.compactMap { $0.current?.warnings }.first(where: { !$0.isEmpty }) ?? []
    }

    var minutelyRain: MinutelyRain? {
        results.compactMap { $0.current?.minutelyRain }.first
    }

    var panyuForecast: (text: String, issuedAt: String?)? {
        guard let r = results.first(where: { $0.current?.forecast != nil })?.current,
              let text = r.forecast,
              isForecastCurrent(text, issuedAt: r.forecastIssuedAt) else { return nil }
        return (text, r.forecastIssuedAt)
    }

    @MainActor
    func refresh() async {
        loading = true
        async let weather = agg.fetchAll(loc: loc)
        async let aqiData = agg.fetchAqi(loc: loc)
        results = await weather
        air = await aqiData
        loading = false
        initialLoad = false
        updatedAt = Date()
    }

    // Mirrors web app's isForecastCurrent logic
    private func isForecastCurrent(_ text: String, issuedAt: String?) -> Bool {
        let cal = Calendar.current
        var tz = TimeZone(identifier: "Asia/Shanghai")!
        var comps = cal.dateComponents(in: tz, from: Date())
        let hour = comps.hour ?? 0

        // Look for time window in forecast text
        let pattern = #"(?:今[天日]|明天|后天)?(\d{1,2})时到(?:今[天日]|明天|后天)?(\d{1,2})时"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else {
            return true // can't determine, show it
        }
        let fromHour = Int((text as NSString).substring(with: match.range(at: 1))) ?? 0
        let toHour   = Int((text as NSString).substring(with: match.range(at: 2))) ?? 24
        return hour < toHour || (fromHour > toHour) // handles overnight windows
    }
}
