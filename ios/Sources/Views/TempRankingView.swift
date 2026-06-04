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

            RankBar(frac: maxTemp > minTemp ? (temp - minTemp) / (maxTemp - minTemp) : 1.0,
                    color: color)

            Text("\(Int(temp.rounded()))°")
                .font(.system(size: 16, weight: .bold).monospacedDigit())
                .foregroundStyle(.white.opacity(0.92))
                .frame(width: 46, alignment: .trailing)
        }
    }
}

// 排行条：4pt 高 + 信源色横向渐变，入场时宽度从 0 弹性展开（对齐 PWA .rank-bar）
private struct RankBar: View {
    let frac: Double
    let color: Color
    @State private var grow = false

    var body: some View {
        GeometryReader { geo in
            // 最短 14% 让最低温也有可见的条，其余按比例（对齐 PWA）
            let full = geo.size.width * CGFloat(0.14 + 0.86 * frac)
            HStack(spacing: 0) {
                Capsule()
                    .fill(LinearGradient(colors: [color.opacity(0.4), color],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: grow ? full : 0, height: 4)
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
        .frame(height: 16)
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.82).delay(0.18)) {
                grow = true
            }
        }
    }
}
