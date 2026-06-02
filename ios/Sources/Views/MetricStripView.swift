import SwiftUI

struct MetricStripView: View {
    let stats: WeatherStats
    let avgAqi: Int?

    private struct MetricCol: Identifiable {
        let id: String
        let value: String
        let label: String
        let alertColor: Color?
    }

    private var cols: [MetricCol] {
        var result: [MetricCol] = []
        if let f = stats.feelsLike {
            let a = feelsAlert(f)
            result.append(MetricCol(id: "feels", value: "\(Int(f))°",
                                    label: a != nil ? "体感 · \(a!.level)" : "体感",
                                    alertColor: a?.color))
        }
        if let h = stats.humidity {
            let a = humidAlert(h)
            result.append(MetricCol(id: "humid", value: "\(Int(h))%",
                                    label: a != nil ? "湿度 · \(a!.level)" : "湿度",
                                    alertColor: a?.color))
        }
        if let aqi = avgAqi {
            let a = aqiAlert(aqi)
            result.append(MetricCol(id: "aqi", value: "\(aqi)",
                                    label: a != nil ? "空气 · \(a!.level)" : "空气",
                                    alertColor: a?.color))
        }
        if let uv = stats.uvIndex {
            let a = uvAlert(uv)
            result.append(MetricCol(id: "uv", value: "\(Int(uv.rounded()))",
                                    label: a != nil ? "紫外线 · \(a!.level)" : "紫外线",
                                    alertColor: a?.color))
        }
        return result
    }

    var body: some View {
        if !cols.isEmpty {
            HStack(spacing: 0) {
                ForEach(cols) { col in
                    VStack(spacing: 7) {
                        Text(col.value)
                            .font(.system(size: 19, weight: .semibold).monospacedDigit())
                            .foregroundStyle(col.alertColor ?? .white)
                        Text(col.label)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.60))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 6)
            .padding(.bottom, 8)
        }
    }
}
