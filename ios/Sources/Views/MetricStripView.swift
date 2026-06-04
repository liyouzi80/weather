import SwiftUI

struct MetricStripView: View {
    let stats: WeatherStats
    let avgAqi: Int?

    private struct MetricCol: Identifiable {
        let id: String
        let value: String
        let dim: String
        let level: String
        let alertColor: Color?
    }

    private var cols: [MetricCol] {
        var result: [MetricCol] = []
        if let h = stats.humidity {
            let a = humidLevel(h)
            result.append(MetricCol(id: "humid", value: "\(Int(h.rounded()))%",
                                    dim: "湿度", level: a.level, alertColor: a.color))
        }
        if let p = stats.pop {
            let a = popLevel(p)
            result.append(MetricCol(id: "pop", value: "\(Int(p.rounded()))%",
                                    dim: "降水", level: a.level, alertColor: a.color))
        }
        if let aqi = avgAqi {
            let a = aqiLevel(aqi)
            result.append(MetricCol(id: "aqi", value: "\(aqi)",
                                    dim: "空气", level: a.level, alertColor: a.color))
        }
        if let uv = stats.uvIndex {
            let a = uvLevel(uv)
            result.append(MetricCol(id: "uv", value: "\(Int(uv.rounded()))",
                                    dim: "紫外线", level: a.level, alertColor: a.color))
        }
        return result
    }

    var body: some View {
        if !cols.isEmpty {
            HStack(spacing: 0) {
                ForEach(cols) { col in
                    VStack(spacing: 5) {
                        Text(col.value)
                            .font(.system(size: 19, weight: .semibold).monospacedDigit())
                            .foregroundStyle(col.alertColor ?? .white)
                        VStack(spacing: 2) {
                            Text(col.dim)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white.opacity(0.65))
                            Text(col.level)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(col.alertColor ?? .white.opacity(0.60))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 6)
            .padding(.bottom, 8)
        }
    }
}
