import WidgetKit
import SwiftUI

// MARK: - 天气文字 → SF Symbol（分类逻辑对齐 WeatherScene.fxKind）

func weatherSymbol(_ text: String, night: Bool) -> String {
    if text.contains("雷") { return "cloud.bolt.rain.fill" }
    if text.contains("雨") {
        if text.contains("暴") || text.contains("大") { return "cloud.heavyrain.fill" }
        return "cloud.rain.fill"
    }
    if text.contains("雪") { return "cloud.snow.fill" }
    if text.contains("雾") || text.contains("霾") || text.contains("沙") || text.contains("尘") {
        return "cloud.fog.fill"
    }
    if text.contains("阴") { return "cloud.fill" }
    if text.contains("多云") || text.contains("间") {
        return night ? "cloud.moon.fill" : "cloud.sun.fill"
    }
    // 晴
    return night ? "moon.stars.fill" : "sun.max.fill"
}

// MARK: - 背景天空渐变（昼 / 夜）

func skyGradient(night: Bool) -> LinearGradient {
    let colors: [Color] = night
        ? [Color(hex: "#0b1426"), Color(hex: "#1a2747")]
        : [Color(hex: "#1c3a63"), Color(hex: "#0f223f")]
    return LinearGradient(colors: colors, startPoint: .top, endPoint: .bottom)
}

// MARK: - 入口视图（按尺寸分发）

struct WeatherWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: WeatherEntry

    var body: some View {
        if entry.failed {
            FailedView(cityName: entry.cityName)
        } else {
            switch family {
            case .systemMedium: MediumWidgetView(entry: entry)
            default:            SmallWidgetView(entry: entry)
            }
        }
    }
}

// MARK: - 小尺寸

struct SmallWidgetView: View {
    let entry: WeatherEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(entry.cityName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer()
                Image(systemName: entry.symbol)
                    .font(.system(size: 18))
                    .symbolRenderingMode(.multicolor)
            }

            Spacer(minLength: 0)

            Text("\(entry.avg)°")
                .font(.system(size: 48, weight: .thin))
                .foregroundStyle(.white)
                .kerning(-1)

            Text(entry.text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)

            Spacer(minLength: 4)

            HStack(spacing: 8) {
                Text("↑\(entry.high)° ↓\(entry.low)°")
                    .font(.system(size: 12, weight: .regular).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.6))
                Spacer()
                if let aqi = entry.aqi, let cat = entry.aqiCategory {
                    AQIPill(aqi: aqi, category: cat)
                }
            }
        }
    }
}

// MARK: - 中尺寸

struct MediumWidgetView: View {
    let entry: WeatherEntry

    var body: some View {
        HStack(spacing: 16) {
            // 左：城市 + 大温度 + 天气 + 高低温
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(entry.cityName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Image(systemName: entry.symbol)
                        .font(.system(size: 16))
                        .symbolRenderingMode(.multicolor)
                }

                Spacer(minLength: 0)

                Text("\(entry.avg)°")
                    .font(.system(size: 56, weight: .thin))
                    .foregroundStyle(.white)
                    .kerning(-1)

                Text(entry.text)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)

                Text("↑\(entry.high)°  ↓\(entry.low)°  ·  \(entry.sources) 源")
                    .font(.system(size: 11, weight: .regular).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.55))
                    .padding(.top, 2)
            }

            // 右：关键指标（正常区间中性白，异常才着色）
            VStack(alignment: .leading, spacing: 9) {
                if let f = entry.feels {
                    MetricRow(label: "体感", value: "\(f)°",
                              style: feelsLevel(Double(f)))
                }
                if let h = entry.humidity {
                    MetricRow(label: "湿度", value: "\(h)%",
                              style: humidLevel(Double(h)))
                }
                if let aqi = entry.aqi {
                    MetricRow(label: "空气", value: "\(aqi)",
                              style: aqiLevel(aqi))
                }
                if let uv = entry.uv {
                    MetricRow(label: "紫外线", value: "\(Int(uv.rounded()))",
                              style: uvLevel(uv))
                }
            }
            .frame(width: 116, alignment: .leading)
        }
    }
}

// MARK: - 复用组件

private struct MetricRow: View {
    let label: String
    let value: String
    let style: AlertStyle

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
            Spacer(minLength: 4)
            Text(value)
                .font(.system(size: 14, weight: .semibold).monospacedDigit())
                .foregroundStyle(style.color)
            Text(style.level)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(style.color.opacity(0.9))
                .frame(width: 28, alignment: .leading)
        }
    }
}

private struct AQIPill: View {
    let aqi: Int
    let category: String

    var body: some View {
        Text("AQI \(aqi)")
            .font(.system(size: 10, weight: .bold).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(aqiColor(aqi).opacity(0.85)))
    }
}

private struct FailedView: View {
    let cityName: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "exclamationmark.icloud")
                .font(.system(size: 22))
                .foregroundStyle(.white.opacity(0.7))
            Text(cityName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
            Text("暂无数据")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.6))
        }
    }
}

// MARK: - Preview

#Preview(as: .systemSmall) {
    TianQiWidget()
} timeline: {
    WeatherEntry.placeholder
}

#Preview(as: .systemMedium) {
    TianQiWidget()
} timeline: {
    WeatherEntry.placeholder
}
