import WidgetKit
import SwiftUI
import AppIntents

// MARK: - 城市选择（长按编辑小组件可切换番禺 / 安福）

enum CityChoice: String, AppEnum {
    case panyu
    case anfu

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "城市" }
    static var caseDisplayRepresentations: [CityChoice: DisplayRepresentation] {
        [.panyu: "番禺区", .anfu: "安福县"]
    }

    var location: GeoLocation {
        switch self {
        case .panyu: return GeoLocation.all[0]
        case .anfu:  return GeoLocation.all[1]
        }
    }
}

struct SelectCityIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "天气小组件" }
    static var description: IntentDescription { "选择要显示的城市" }

    @Parameter(title: "城市", default: .panyu)
    var city: CityChoice
}

// MARK: - 时间线条目

struct WeatherEntry: TimelineEntry {
    let date: Date
    let cityName: String
    let avg: Int
    let high: Int
    let low: Int
    let text: String
    let symbol: String
    let night: Bool
    let feels: Int?
    let humidity: Int?
    let uv: Double?
    let aqi: Int?
    let aqiCategory: String?
    let sources: Int
    let failed: Bool

    static let placeholder = WeatherEntry(
        date: Date(), cityName: "番禺区", avg: 26, high: 29, low: 23,
        text: "多云", symbol: "cloud.sun.fill", night: false,
        feels: 28, humidity: 70, uv: 5, aqi: 42, aqiCategory: "优",
        sources: 5, failed: false)
}

// MARK: - 时间线 Provider（直抓各信源，无后端）

struct WeatherTimelineProvider: AppIntentTimelineProvider {
    typealias Entry = WeatherEntry
    typealias Intent = SelectCityIntent

    func placeholder(in context: Context) -> WeatherEntry { .placeholder }

    func snapshot(for configuration: SelectCityIntent, in context: Context) async -> WeatherEntry {
        if context.isPreview { return .placeholder }
        return await Self.makeEntry(for: configuration.city)
    }

    func timeline(for configuration: SelectCityIntent, in context: Context) async -> Timeline<WeatherEntry> {
        let entry = await Self.makeEntry(for: configuration.city)
        // 每 30 分钟刷新一次（系统会按预算适当延后）
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())
            ?? Date().addingTimeInterval(1800)
        return Timeline(entries: [entry], policy: .after(next))
    }

    private static func makeEntry(for city: CityChoice) async -> WeatherEntry {
        let loc = city.location
        async let resultsTask = ProviderAggregator.shared.fetchAll(loc: loc)
        async let aqiTask = ProviderAggregator.shared.fetchAqi(loc: loc)
        let results = await resultsTask
        let aqi = await aqiTask

        guard let stats = await ProviderAggregator.shared.analyze(results) else {
            return WeatherEntry(
                date: Date(), cityName: loc.name, avg: 0, high: 0, low: 0,
                text: "暂无数据", symbol: "exclamationmark.icloud", night: isNight(),
                feels: nil, humidity: nil, uv: nil, aqi: nil, aqiCategory: nil,
                sources: 0, failed: true)
        }

        let aqis = aqi.compactMap { $0.air?.aqi }
        let avgAqi = aqis.isEmpty ? nil : Int((Double(aqis.reduce(0, +)) / Double(aqis.count)).rounded())
        let night = isNight()

        return WeatherEntry(
            date: Date(),
            cityName: loc.name,
            avg: Int(stats.avg.rounded()),
            high: Int(stats.max.rounded()),
            low: Int(stats.min.rounded()),
            text: stats.text,
            symbol: weatherSymbol(stats.text, night: night),
            night: night,
            feels: stats.feelsLike.map { Int($0.rounded()) },
            humidity: stats.humidity.map { Int($0.rounded()) },
            uv: stats.uvIndex,
            aqi: avgAqi,
            aqiCategory: avgAqi.map { aqiCategory($0) },
            sources: stats.count,
            failed: false)
    }
}

// 北京时 6:00–19:00 为白天（与主 App 一致）
func isNight() -> Bool {
    var cal = Calendar.current
    cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
    let h = cal.component(.hour, from: Date())
    return h < 6 || h >= 19
}

// MARK: - Widget 定义

struct TianQiWidget: Widget {
    let kind = "TianQiWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: SelectCityIntent.self,
                               provider: WeatherTimelineProvider()) { entry in
            WeatherWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) { skyGradient(night: entry.night) }
        }
        .configurationDisplayName("天气")
        .description("多信源平均气温 + 美国 AQI")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct TianQiWidgetBundle: WidgetBundle {
    var body: some Widget {
        TianQiWidget()
    }
}
