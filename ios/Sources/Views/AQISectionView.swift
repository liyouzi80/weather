import SwiftUI

struct AQISectionView: View {
    let air: [AqiResult]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("空气质量 · 美国 AQI")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.50))
                .padding(.horizontal, 4)

            ForEach(air) { r in
                if let a = r.air {
                    AQICardView(result: r, air: a)
                }
            }
        }
    }
}

private struct AQICardView: View {
    let result: AqiResult
    let air: AirQuality

    var body: some View {
        GlassCard {
            HStack(alignment: .center, spacing: 12) {
                // AQI number + category
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(air.aqi)")
                        .font(.system(size: 32, weight: .thin).monospacedDigit())
                        .foregroundStyle(aqiColor(air.aqi))
                    Text(aqiCategory(air.aqi))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(aqiColor(air.aqi))
                }
                .frame(width: 70, alignment: .leading)

                Divider().frame(height: 36).overlay(.white.opacity(0.15))

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color(hex: result.color))
                            .frame(width: 7, height: 7)
                        Text(result.providerName)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.65))
                    }
                    if let dom = air.dominant {
                        Text("主要污染物 · \(dom)")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.40))
                    }
                }
                Spacer()
            }
        }
    }
}
