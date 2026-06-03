import SwiftUI

// 分钟级降水柱状图（数据来自和风 /minutely/5m，需配置和风 key）。
struct MinutelyRainView: View {
    let rain: MinutelyRain

    private var hasRain: Bool { rain.minutely.contains { $0.precip > 0 } }
    private var maxPrecip: Double { max(rain.minutely.map(\.precip).max() ?? 0, 0.1) }

    var body: some View {
        GlassCard(topAccent: hasRain ? Color(hex: "#0a84ff").opacity(0.5) : nil) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 5) {
                    Image(systemName: hasRain ? "cloud.rain.fill" : "cloud.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(hex: "#0a84ff"))
                    Text("分钟级降水")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.62))
                    Spacer()
                }

                if !rain.summary.isEmpty {
                    Text(rain.summary)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.90))
                        .fixedSize(horizontal: false, vertical: true)
                }

                if hasRain {
                    HStack(alignment: .bottom, spacing: 2) {
                        ForEach(Array(rain.minutely.enumerated()), id: \.offset) { _, m in
                            UnevenRoundedRectangle(
                                topLeadingRadius: 2, bottomLeadingRadius: 0,
                                bottomTrailingRadius: 0, topTrailingRadius: 2)
                                .fill(barColor(m.precip))
                                .frame(maxWidth: .infinity)
                                .frame(height: max(3, CGFloat(m.precip / maxPrecip) * 46))
                        }
                    }
                    .frame(height: 46)
                    .padding(.top, 2)

                    // QWeather /minutely/5m 返回 12×5min = 未来 1 小时
                    HStack {
                        Text("现在")
                        Spacer()
                        Text("30分钟")
                        Spacer()
                        Text("1小时")
                    }
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.35))
                }
            }
        }
    }

    private func barColor(_ p: Double) -> Color {
        guard p > 0 else { return Color.white.opacity(0.08) }
        let t = min(p / maxPrecip, 1)
        return Color(hex: "#0a84ff").opacity(0.55 + 0.4 * t) // 对齐 PWA 强度爬升 0.55→0.95
    }
}
