import SwiftUI

struct HeroView: View {
    let stats: WeatherStats
    let cityName: String
    var updatedAt: Date? = nil

    var body: some View {
        VStack(spacing: 0) {
            // 城市名：28pt，白→浅灰垂直渐变文字（对齐 PWA .hero-city）
            Text(cityName)
                .font(.system(size: 28, weight: .semibold))
                .kerning(-0.84)
                .foregroundStyle(
                    LinearGradient(
                        colors: [.white, Color(hex: "#d1d1d6")],
                        startPoint: .top, endPoint: .bottom)
                )

            // 更新时间（对齐 PWA .hero-updated）
            if let updatedAt {
                Text(updatedLabel(updatedAt))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.white.opacity(0.45))
                    .padding(.top, 3)
            }

            Text("\(Int(stats.avg.rounded()))°")
                .font(.system(size: 100, weight: .ultraLight))
                .foregroundStyle(.white)
                .kerning(-4)
                .padding(.top, 2)

            Text(stats.text)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white.opacity(0.90))
                .padding(.top, 12)

            HStack(spacing: 16) {
                Text("↑ \(Int(stats.max.rounded()))°")
                Text("↓ \(Int(stats.min.rounded()))°")
            }
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(.white.opacity(0.42))
            .padding(.top, 5)
        }
        .padding(.top, 20)
        .padding(.bottom, 12)
    }

    // 相对时间：刚刚 / X 分钟前 / X 小时前
    private func updatedLabel(_ date: Date) -> String {
        let sec = Int(Date().timeIntervalSince(date))
        if sec < 60 { return "刚刚更新" }
        if sec < 3600 { return "\(sec / 60) 分钟前更新" }
        return "\(sec / 3600) 小时前更新"
    }
}
