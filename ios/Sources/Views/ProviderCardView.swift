import SwiftUI

struct ProviderCardView: View {
    let result: AnnotatedResult

    var body: some View {
        if result.base.hasData, let w = result.base.current {
            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    // Header: source name + badge
                    HStack {
                        Circle()
                            .fill(Color(hex: result.base.color))
                            .frame(width: 8, height: 8)
                        Text(result.base.providerName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.70))
                        Spacer()
                        if result.isMax {
                            Text("最高").font(.system(size: 11, weight: .600))
                                .foregroundStyle(Color(hex: "#ff9f0a"))
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(Capsule().fill(Color(hex: "#ff9f0a").opacity(0.15)))
                        } else if result.isMin {
                            Text("最低").font(.system(size: 11, weight: .600))
                                .foregroundStyle(Color(hex: "#64d2ff"))
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(Capsule().fill(Color(hex: "#64d2ff").opacity(0.15)))
                        }
                    }

                    // Temp + condition
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(Int(w.temp.rounded()))°")
                            .font(.system(size: 44, weight: .thin))
                            .foregroundStyle(.white)
                        Text(w.text)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(.white.opacity(0.80))
                    }

                    // Detail row
                    HStack(spacing: 16) {
                        if let fl = w.feelsLike {
                            label("体感", value: "\(Int(fl.rounded()))°")
                        }
                        if let hum = w.humidity {
                            label("湿度", value: "\(Int(hum))%")
                        }
                        if let wd = w.windDir, let ws = w.windSpeed {
                            label("风", value: "\(wd) \(Int(ws))km/h")
                        }
                        Spacer()
                    }

                    // Observed time
                    if let obs = w.observedAt {
                        Text(fmtObservedAt(obs))
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.30))
                    }
                }
            }
        }
    }

    private func label(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.system(size: 10)).foregroundStyle(.white.opacity(0.40))
            Text(value).font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.70))
        }
    }

    private func fmtObservedAt(_ s: String) -> String {
        // Try to extract HH:mm from ISO string or "HH:mm" patterns
        if let m = s.range(of: #"\d{2}:\d{2}"#, options: .regularExpression) {
            return "\(s[m]) 观测"
        }
        return s
    }
}
