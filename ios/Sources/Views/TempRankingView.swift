import SwiftUI

struct TempRankingView: View {
    let results: [AnnotatedResult]

    private var sorted: [AnnotatedResult] {
        results.filter { $0.base.hasData }
               .sorted { ($0.base.current?.temp ?? 0) > ($1.base.current?.temp ?? 0) }
    }

    private var maxTemp: Double { sorted.first?.base.current?.temp ?? 1 }
    private var minTemp: Double { sorted.last?.base.current?.temp ?? 0 }

    var body: some View {
        if sorted.count >= 2 {
            GlassCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("温度排行")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.50))

                    ForEach(Array(sorted.enumerated()), id: \.element.id) { idx, item in
                        if let temp = item.base.current?.temp {
                            row(idx: idx, item: item, temp: temp)
                        }
                    }
                }
            }
        }
    }

    private func row(idx: Int, item: AnnotatedResult, temp: Double) -> some View {
        let color = Color(hex: item.base.color)
        return HStack(spacing: 10) {
            Text("\(idx + 1)")
                .font(.system(size: 12, weight: .bold).monospacedDigit())
                .foregroundStyle(.white.opacity(0.5))
                .frame(width: 14, alignment: .center)

            Circle()
                .fill(color)
                .frame(width: 7, height: 7)

            Text(item.base.providerName)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
                .frame(width: 100, alignment: .leading)

            GeometryReader { geo in
                let range = maxTemp - minTemp
                let frac = range > 0 ? (temp - minTemp) / range : 1.0
                // 最短 14% 让最低温也有可见的条，其余按比例（对齐 PWA）
                let barWidth = geo.size.width * CGFloat(0.14 + 0.86 * frac)
                HStack(spacing: 0) {
                    Capsule()
                        .fill(color.opacity(0.85))
                        .frame(width: barWidth, height: 3)
                    Spacer(minLength: 0)
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 16)

            Text("\(Int(temp.rounded()))°")
                .font(.system(size: 16, weight: .bold).monospacedDigit())
                .foregroundStyle(.white.opacity(0.92))
                .frame(width: 46, alignment: .trailing)
        }
    }
}
