import SwiftUI

struct MetricStripView: View {
    let stats: WeatherStats

    private struct MetricCol: Identifiable {
        let id: String
        let value: String
        let dim: String
        let level: String
        let alertColor: Color?
    }

    // 指标条：体感 / 湿度 / 紫外线 / 风速（对齐 PWA 指标条列顺序）
    private var cols: [MetricCol] {
        var result: [MetricCol] = []
        if let f = stats.feelsLike {
            let a = feelsLevel(f)
            result.append(MetricCol(id: "feels", value: "\(Int(f.rounded()))°",
                                    dim: "体感", level: a.level, alertColor: a.color))
        }
        if let h = stats.humidity {
            let a = humidLevel(h)
            result.append(MetricCol(id: "humidity", value: "\(Int(h.rounded()))%",
                                    dim: "湿度", level: a.level, alertColor: a.color))
        }
        if let uv = stats.uvIndex {
            let a = uvLevel(uv)
            result.append(MetricCol(id: "uv", value: "\(Int(uv.rounded()))",
                                    dim: "紫外线", level: a.level, alertColor: a.color))
        }
        if let w = stats.windSpeed {
            let a = windLevel(w)
            result.append(MetricCol(id: "wind", value: "\(Int(w.rounded()))",
                                    dim: "风速", level: a.level, alertColor: a.color))
        }
        return result
    }

    var body: some View {
        if !cols.isEmpty {
            HStack(spacing: 0) {
                ForEach(cols) { col in
                    VStack(spacing: 5) {
                        Text(col.value)
                            .font(.system(size: 21, weight: .semibold).monospacedDigit())
                            .foregroundStyle(col.alertColor ?? .white)
                        VStack(spacing: 2) {
                            Text(col.dim)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white.opacity(0.65))
                            Text(col.level)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white.opacity(0.60))
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
