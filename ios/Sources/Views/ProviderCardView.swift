import SwiftUI

// MARK: - 5 个可信度圆点（对齐 PWA ScoreDots）
struct ScoreDotsView: View {
    let score: Int
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<5, id: \.self) { i in
                Circle()
                    .fill(i < score ? Color.white.opacity(0.72) : Color.white.opacity(0.18))
                    .frame(width: 5, height: 5)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: score)
    }
}

// 信源卡片：iOS 27 swipeActions 替代自定义 DragGesture 实现打分。
// 右滑（leading）= 升分，左滑（trailing）= 降分；触觉反馈保留。
// iOS 27 起 swipeActions 不再局限于 List 容器，可直接附加到任意视图。
struct ProviderCardView: View {
    let result: AnnotatedResult
    let score: Int
    let onScoreChange: (Int) -> Void

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
                    ScoreDotsView(score: score)
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
                            Text(wd + (w.windSpeed != nil ? " \(Int(w.windSpeed!.rounded()))km/h" : ""))
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
            .opacity(score == 0 ? 0.38 : 1)
            .saturation(score == 0 ? 0.4 : 1)
            // 最高/最低温渐变叠加（低透明度，不遮文字）
            .overlay {
                RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                    .fill(tintGradient)
                    .allowsHitTesting(false)
            }
            // iOS 26+ Liquid Glass 卡片材质
            .glassEffect(in: RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous))
            // iOS 27：swipeActions 扩展至 List 以外的任意容器
            // 右滑（leading）= 升分，左滑（trailing）= 降分
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button {
                    onScoreChange(1)
                } label: {
                    Label("升分", systemImage: "plus")
                }
                .tint(Color(red: 52/255, green: 199/255, blue: 89/255))
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button {
                    onScoreChange(-1)
                } label: {
                    Label("降分", systemImage: "minus")
                }
                .tint(Color(red: 255/255, green: 69/255, blue: 58/255))
            }
        }
    }

    // MARK: - Helpers

    private var tintGradient: LinearGradient {
        if result.isMax {
            return LinearGradient(colors: [Color(hex: "#ff453a").opacity(0.13), .clear],
                                  startPoint: .topLeading, endPoint: UnitPoint(x: 0.62, y: 0.62))
        } else if result.isMin {
            return LinearGradient(colors: [Color(hex: "#40c8e0").opacity(0.13), .clear],
                                  startPoint: .topLeading, endPoint: UnitPoint(x: 0.62, y: 0.62))
        }
        return LinearGradient(colors: [.clear, .clear], startPoint: .top, endPoint: .bottom)
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
