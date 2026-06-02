import SwiftUI

struct TempRankingView: View {
    let results: [AnnotatedResult]

    private var sorted: [AnnotatedResult] {
        results.filter { $0.base.hasData }
               .sorted { ($0.base.current?.temp ?? 0) > ($1.base.current?.temp ?? 0) }
    }

    private var maxTemp: Double {
        sorted.first?.base.current?.temp ?? 1
    }
    private var minTemp: Double {
        sorted.last?.base.current?.temp ?? 0
    }

    var body: some View {
        if sorted.count >= 2 {
            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("温度排行")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.50))

                    ForEach(sorted) { item in
                        if let temp = item.base.current?.temp {
                            HStack(spacing: 10) {
                                Text(item.base.providerName)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.80))
                                    .frame(width: 90, alignment: .leading)

                                GeometryReader { geo in
                                    let range = maxTemp - minTemp
                                    let frac = range > 0 ? (temp - minTemp) / range : 0.5
                                    let barWidth = max(24, geo.size.width * CGFloat(frac))
                                    HStack(spacing: 0) {
                                        Capsule()
                                            .fill(barColor(temp: temp, item: item))
                                            .frame(width: barWidth, height: 6)
                                        Spacer(minLength: 0)
                                    }
                                }
                                .frame(height: 6)

                                Text("\(Int(temp.rounded()))°")
                                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                                    .foregroundStyle(.white.opacity(0.90))
                                    .frame(width: 32, alignment: .trailing)
                            }
                        }
                    }
                }
            }
        }
    }

    private func barColor(temp: Double, item: AnnotatedResult) -> Color {
        if item.isMax { return Color(hex: "#ff9f0a") }
        if item.isMin { return Color(hex: "#64d2ff") }
        return .white.opacity(0.35)
    }
}
