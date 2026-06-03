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
            VStack(alignment: .leading, spacing: 8) {
                // Head row: ● 信源名 ... 等级 数值AQI
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(hex: result.color))
                        .frame(width: 7, height: 7)
                    Text(result.providerName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.75))
                    Spacer()
                    Text(aqiCategory(air.aqi))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(aqiColor(air.aqi))
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(air.aqi)")
                            .font(.system(size: 22, weight: .thin).monospacedDigit())
                            .foregroundStyle(aqiColor(air.aqi))
                        Text("AQI")
                            .font(.system(size: 10))
                            .foregroundStyle(aqiColor(air.aqi).opacity(0.70))
                    }
                }

                // Pollutant row
                if let dom = air.dominant, let pm25 = air.pm25, dom == "PM2.5" {
                    Text("主要污染物 PM2.5 · \(Int(pm25)) μg/m³")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.50))
                } else if air.dominant != nil || air.pm25 != nil {
                    HStack(spacing: 8) {
                        if let dom = air.dominant {
                            Text("主要污染物 \(dom)")
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.50))
                        }
                        if let pm25 = air.pm25 {
                            Text("PM2.5 \(Int(pm25)) μg/m³")
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.50))
                        }
                    }
                }

                // Observed time
                if let obs = air.observedAt {
                    Text("观测 \(fmtTime(obs))")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.30))
                }
            }
        }
    }

    private func fmtTime(_ s: String) -> String {
        if let m = s.range(of: #"\d{2}:\d{2}"#, options: .regularExpression) {
            return String(s[m])
        }
        return s
    }
}
