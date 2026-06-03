import Foundation
import Observation

@Observable
@MainActor
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
        // 时效过滤已在 GZQXProvider 抓取时完成（过期不返回 forecast），此处直接透传。
        guard let r = results.first(where: { $0.current?.forecast != nil })?.current,
              let text = r.forecast else { return nil }
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
}
