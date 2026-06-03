import SwiftUI

// MARK: - 天气背景协调器
// 多云/阴天 → SwiftUI 原生 SF Symbols 云层（保证渲染、纯苹果风格）；
// 其余（雨/雪/雷/雾/晴）→ SpriteKit 粒子与天体效果。
struct WeatherBackground: View {
    let weatherText: String
    let isNight: Bool
    let lat: Double
    let lon: Double

    var body: some View {
        switch weatherFXKind(weatherText, night: isNight) {
        case "cloudy":         CloudSymbolsView(isNight: false, overcast: false)
        case "cloudy-night":   CloudSymbolsView(isNight: true,  overcast: false)
        case "overcast":       CloudSymbolsView(isNight: false, overcast: true)
        case "overcast-night": CloudSymbolsView(isNight: true,  overcast: true)
        default:
            WeatherFXView(weatherText: weatherText, isNight: isNight, lat: lat, lon: lon)
        }
    }
}

// MARK: - SF Symbols 云层
// 多个 cloud.fill 符号，分层（远小淡、近大浓）随机分布，缓慢左右飘移 + 轻微呼吸。
// 轻度模糊柔化图标边缘，让符号云更接近真实云的柔和观感。
struct CloudSymbolsView: View {
    let isNight: Bool
    let overcast: Bool
    private let clouds: [CloudSpec]

    init(isNight: Bool, overcast: Bool) {
        self.isNight = isNight
        self.overcast = overcast
        let count = overcast ? 7 : 5
        self.clouds = (0..<count).map { i in
            let layer = Double(i) / Double(max(count - 1, 1))   // 0 远 → 1 近
            return CloudSpec(
                size: CGFloat.random(in: overcast ? 150...270 : 120...230),
                x: CGFloat.random(in: 0.04...0.96),
                y: CGFloat.random(in: overcast ? 0.02...0.42 : 0.04...0.34),
                opacity: (overcast ? 0.55 : 0.42) + layer * 0.14,
                drift: CGFloat.random(in: 16...42),
                period: Double.random(in: 16...30),
                delay: Double.random(in: 0...5)
            )
        }
    }

    private var tint: Color {
        if isNight {
            return overcast ? Color(red: 0.32, green: 0.37, blue: 0.48)
                            : Color(red: 0.42, green: 0.48, blue: 0.62)
        } else {
            return overcast ? Color(red: 0.60, green: 0.65, blue: 0.73)
                            : Color(red: 0.82, green: 0.86, blue: 0.93)
        }
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(clouds) { c in
                    CloudSymbol(spec: c, tint: tint, container: geo.size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
    }
}

struct CloudSpec: Identifiable {
    let id = UUID()
    let size: CGFloat       // 符号字号(pt)
    let x: CGFloat          // 水平位置 0..1
    let y: CGFloat          // 垂直位置 0..1（集中上半部）
    let opacity: Double
    let drift: CGFloat      // 水平漂移幅度(pt)
    let period: Double      // 漂移周期(s)
    let delay: Double
}

private struct CloudSymbol: View {
    let spec: CloudSpec
    let tint: Color
    let container: CGSize
    @State private var drifted = false

    var body: some View {
        Image(systemName: "cloud.fill")
            .font(.system(size: spec.size))
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(tint)
            .opacity(spec.opacity)
            .blur(radius: spec.size * 0.04)          // 柔化符号硬边，更像真实云
            .position(
                x: spec.x * container.width + (drifted ? spec.drift : -spec.drift),
                y: spec.y * container.height
            )
            .onAppear {
                withAnimation(
                    .easeInOut(duration: spec.period)
                        .repeatForever(autoreverses: true)
                        .delay(spec.delay)
                ) {
                    drifted = true
                }
            }
    }
}
