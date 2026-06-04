import SwiftUI

struct MinutelyRainView: View {
    let rain: MinutelyRain

    private var hasRain: Bool { rain.minutely.contains { $0.precip > 0 } }
    private var maxPrecip: Double { max(rain.minutely.map(\.precip).max() ?? 0, 0.1) }

    var body: some View {
        GlassCard(topAccent: hasRain ? Color(hex: "#0a84ff").opacity(0.5) : nil) {
            VStack(alignment: .leading, spacing: 0) {
                // 小标头：图标 + 标签（对齐 Apple Weather 子标题风格）
                HStack(spacing: 5) {
                    Image(systemName: hasRain ? "cloud.rain.fill" : "cloud.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(hex: "#5ac8fa").opacity(0.75))
                    Text("下一小时降水量")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.40))
                        .kerning(0.3)
                    Spacer()
                }
                .padding(.bottom, 4)

                // summary 作为主标题（大号粗体，仿 Apple Weather）
                if !rain.summary.isEmpty {
                    Text(rain.summary)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 12)
                }

                // 平滑面积图（Canvas 贝塞尔曲线）
                RainAreaChart(minutely: Array(rain.minutely.prefix(12)),
                              maxPrecip: maxPrecip)
                    .frame(height: 64)
                    .padding(.bottom, 6)

                // 时间轴：5 个均匀刻度
                HStack {
                    Text("现在"); Spacer()
                    Text("15分钟"); Spacer()
                    Text("30分钟"); Spacer()
                    Text("45分钟"); Spacer()
                    Text("1小时")
                }
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.35))
            }
        }
    }
}

// 用 Canvas 绘制三次贝塞尔平滑面积图（对齐 PWA SVG 实现）
private struct RainAreaChart: View {
    let minutely: [MinutelyRain.Minutely]
    let maxPrecip: Double

    var body: some View {
        Canvas { ctx, size in
            let n = minutely.count
            guard n > 1 else { return }
            let w = size.width, h = size.height
            let floor = h * 0.88   // 零降水时基线

            let ys: [CGFloat] = minutely.map { pt in
                guard pt.precip > 0 else { return floor }
                let frac = CGFloat(pt.precip / maxPrecip)
                return max(h * 0.04, floor - frac * (floor - h * 0.04))
            }
            let xs: [CGFloat] = (0 ..< n).map { CGFloat($0) / CGFloat(n - 1) * w }

            // 水平虚线参考网格（三档）
            for frac in [0.25, 0.50, 0.75] as [CGFloat] {
                var grid = Path()
                grid.move(to: CGPoint(x: 0, y: frac * h))
                grid.addLine(to: CGPoint(x: w, y: frac * h))
                ctx.stroke(grid, with: .color(.white.opacity(0.10)),
                           style: StrokeStyle(lineWidth: 0.8, dash: [3, 3]))
            }

            // 三次贝塞尔平滑曲线
            var curve = Path()
            curve.move(to: CGPoint(x: xs[0], y: ys[0]))
            for i in 1 ..< n {
                let dx = (xs[i] - xs[i - 1]) * 0.4
                curve.addCurve(
                    to:       CGPoint(x: xs[i],          y: ys[i]),
                    control1: CGPoint(x: xs[i - 1] + dx, y: ys[i - 1]),
                    control2: CGPoint(x: xs[i] - dx,     y: ys[i])
                )
            }

            // 渐变填充面
            var fill = curve
            fill.addLine(to: CGPoint(x: w, y: h))
            fill.addLine(to: CGPoint(x: 0, y: h))
            fill.closeSubpath()
            ctx.fill(fill, with: .linearGradient(
                Gradient(stops: [
                    .init(color: Color(hex: "#5ac8fa").opacity(0.70), location: 0),
                    .init(color: Color(hex: "#0a84ff").opacity(0.08), location: 1)
                ]),
                startPoint: .zero,
                endPoint: CGPoint(x: 0, y: h)
            ))

            // 描边线
            ctx.stroke(curve,
                       with: .color(Color(hex: "#5ac8fa").opacity(0.85)),
                       style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }
    }
}
