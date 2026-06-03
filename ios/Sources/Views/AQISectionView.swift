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
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let url = result.url {
            Button { openURL(url) } label: { card }
                .buttonStyle(PressScaleStyle())
        } else {
            card
        }
    }

    private var card: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                // 标题行：圆点 + 信源名（与信源卡片统一）... 等级 数值AQI
                HStack(spacing: 10) {
                    Circle()
                        .fill(Color(hex: result.color))
                        .frame(width: 10, height: 10)
                        .shadow(color: Color(hex: result.color), radius: 4)
                    Text(result.providerName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                    if result.url != nil {
                        Image(systemName: "arrow.up.forward")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.40))
                    }
                    Spacer()
                    Text(aqiCategory(air.aqi))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(aqiColor(air.aqi))
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(air.aqi)")
                            .font(.system(size: 26, weight: .bold).monospacedDigit())
                            .foregroundStyle(aqiColor(air.aqi))
                        Text("AQI")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(aqiColor(air.aqi).opacity(0.70))
                    }
                }

                // 污染物行（与信源指标行同字号/配色）
                if let dom = air.dominant, let pm25 = air.pm25, dom == "PM2.5" {
                    pollutantText("主要污染物 PM2.5 · \(Int(pm25)) μg/m³")
                } else if air.dominant != nil || air.pm25 != nil {
                    HStack(spacing: 12) {
                        if let dom = air.dominant {
                            pollutantText("主要污染物 \(dom)")
                        }
                        if let pm25 = air.pm25 {
                            pollutantText("PM2.5 \(Int(pm25)) μg/m³")
                        }
                    }
                }

                // 观测时间（与信源卡片统一）
                if let obs = air.observedAt {
                    Text("观测 \(fmtTime(obs))")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.32))
                }
            }
        }
    }

    private func pollutantText(_ s: String) -> some View {
        Text(s)
            .font(.system(size: 13))
            .foregroundStyle(.white.opacity(0.60))
    }

    private func fmtTime(_ s: String) -> String {
        if let m = s.range(of: #"\d{2}:\d{2}"#, options: .regularExpression) {
            return String(s[m])
        }
        return s
    }
}
