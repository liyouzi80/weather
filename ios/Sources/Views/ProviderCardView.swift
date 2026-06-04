import SwiftUI

// 信源卡片：对齐 PWA 紧凑布局——标题行（圆点+名称+标签+温度），
// 下方平铺天气/体感/湿度/风，底部观测时间。最高/最低用背景斜渐变标识（非徽章）。
struct ProviderCardView: View {
    let result: AnnotatedResult

    var body: some View {
        if result.base.hasData, let w = result.base.current {
            VStack(alignment: .leading, spacing: 12) {
                // 标题行
                HStack(spacing: 10) {
                    Circle()
                        .fill(Color(hex: result.base.color))
                        .frame(width: 10, height: 10)
                        .shadow(color: Color(hex: result.base.color), radius: 4)
                    Text(result.base.providerName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                    if result.isMax {
                        Text("最高")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color(hex: "#ff453a"))
                    } else if result.isMin {
                        Text("最低")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color(hex: "#40c8e0"))
                    }
                    Spacer()
                    Text("\(Int(w.temp.rounded()))°")
                        .font(.system(size: 26, weight: .bold).monospacedDigit())
                        .foregroundStyle(.white)
                }

                // 指标平铺行
                FlowLayout(spacing: 18) {
                    if w.text != "未知" {
                        HStack(spacing: 5) {
                            Image(systemName: weatherSymbol(w.text))
                                .font(.system(size: 14))
                                .foregroundStyle(.white.opacity(0.85))
                            Text(w.text)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                    }
                    if let fl = w.feelsLike {
                        metric("体感", "\(Int(fl.rounded()))°")
                    }
                    if let hum = w.humidity {
                        metric("湿度", "\(Int(hum.rounded()))%")
                    }
                    if let wd = w.windDir {
                        HStack(spacing: 4) {
                            Image(systemName: "location.north.fill")
                                .font(.system(size: 10))
                                .rotationEffect(windAngle(wd))
                                .foregroundStyle(.white.opacity(0.55))
                            Text(wd + (w.windSpeed != nil ? " \(String(format: "%.1f", w.windSpeed!))km/h" : ""))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.white.opacity(0.78))
                        }
                    }
                }

                // 观测时间
                if let obs = w.observedAt {
                    Text("观测 \(fmtTime(obs))")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                    .fill(Color.cardFill)
                    .overlay {
                        RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                            .fill(tintGradient)
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                            .strokeBorder(
                                LinearGradient(colors: [Color.white.opacity(0.10), Color.white.opacity(0.04)],
                                               startPoint: .top, endPoint: .bottom),
                                lineWidth: 0.5)
                    }
                    .shadow(color: .black.opacity(0.25), radius: 20, y: 4)
            }
        }
    }

    // 最高/最低温：一抹暖/冷斜向渐变（不再用徽章高亮）
    private var tintGradient: LinearGradient {
        if result.isMax {
            return LinearGradient(colors: [Color(hex: "#ff453a").opacity(0.13), .clear],
                                  startPoint: .topLeading, endPoint: UnitPoint(x: 0.62, y: 0.62))
        } else if result.isMin {
            return LinearGradient(colors: [Color(hex: "#40c8e0").opacity(0.13), .clear],
                                  startPoint: .topLeading, endPoint: UnitPoint(x: 0.62, y: 0.62))
        }
        // 普通卡片不叠任何色，保持与 AQI / 温度排行（纯 GlassCard）相同的透明度
        return LinearGradient(colors: [.clear, .clear],
                              startPoint: .top, endPoint: .bottom)
    }

    private func metric(_ label: String, _ value: String) -> some View {
        HStack(spacing: 4) {
            Text(label).font(.system(size: 13)).foregroundStyle(.white.opacity(0.60))
            Text(value).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
        }
    }

    private func weatherSymbol(_ text: String) -> String {
        if text.contains("雷") { return "cloud.bolt.rain.fill" }
        if text.contains("雨") { return "cloud.rain.fill" }
        if text.contains("雪") { return "cloud.snow.fill" }
        if text.contains("雾") || text.contains("霾") { return "cloud.fog.fill" }
        if text.contains("阴") { return "cloud.fill" }
        if text.contains("多云") || text.contains("间") { return "cloud.sun.fill" }
        return "sun.max.fill"
    }

    private func windAngle(_ dir: String) -> Angle {
        // 风向文字 → 箭头旋转（指向风去的方向）
        let map: [(String, Double)] = [
            ("东北", 225), ("东南", 315), ("西北", 135), ("西南", 45),
            ("北", 180), ("南", 0), ("东", 270), ("西", 90),
        ]
        for (k, v) in map where dir.contains(k) { return .degrees(v) }
        return .degrees(0)
    }

    private func fmtTime(_ s: String) -> String {
        if let m = s.range(of: #"\d{2}:\d{2}"#, options: .regularExpression) {
            return String(s[m])
        }
        return s
    }
}
