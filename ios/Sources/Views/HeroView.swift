import SwiftUI

struct HeroView: View {
    let stats: WeatherStats
    let cityName: String

    var body: some View {
        VStack(spacing: 0) {
            Text(cityName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white.opacity(0.90))

            Text("\(Int(stats.avg.rounded()))°")
                .font(.system(size: 88, weight: .thin))
                .foregroundStyle(.white)
                .kerning(-4)

            Text(stats.text)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white.opacity(0.90))
                .padding(.top, 2)

            HStack(spacing: 16) {
                Text("↑ \(Int(stats.max.rounded()))°")
                Text("↓ \(Int(stats.min.rounded()))°")
            }
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(.white.opacity(0.40))
            .padding(.top, 4)
        }
        .padding(.top, 20)
        .padding(.bottom, 12)
    }
}
