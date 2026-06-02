import Foundation

@MainActor
class ProviderAggregator {
    static let shared = ProviderAggregator()

    let providers: [any WeatherProvider] = [
        NMCProvider(),
        GZQXProvider(),
        QWeatherProvider(),
        CaiyunProvider(),
        OWMProvider(),
    ]

    func fetchAll(loc: GeoLocation) async -> [ProviderResult] {
        let active = providers.filter { $0.isConfigured() && $0.appliesTo(loc) }
        return await withTaskGroup(of: ProviderResult.self) { group in
            for p in active {
                group.addTask {
                    do {
                        let current = try await p.fetchCurrent(loc)
                        return ProviderResult(id: p.id, providerId: p.id, providerName: p.name,
                                              color: p.color, current: current, error: nil)
                    } catch {
                        return ProviderResult(id: p.id, providerId: p.id, providerName: p.name,
                                              color: p.color, current: nil,
                                              error: localizeError(error.localizedDescription))
                    }
                }
            }
            var results: [ProviderResult] = []
            for await r in group { results.append(r) }
            // Restore original provider order
            let order = active.map { $0.id }
            return results.sorted { (order.firstIndex(of: $0.id) ?? 99) < (order.firstIndex(of: $1.id) ?? 99) }
        }
    }

    func fetchAqi(loc: GeoLocation) async -> [AqiResult] {
        let city = loc.cityName ?? loc.name
        guard let url = URL(string: "\(Keys.baseURL)/api/aqi?cityName=\(city.urlEncoded)") else { return [] }
        struct AqiAPIResp: Decodable {
            let sources: [Source]?
            struct Source: Decodable {
                let id: String; let name: String; let color: String
                let aqi: Int?; let dominant: String?; let pm25: Double?
                let observedAt: String?; let url: String?; let error: String?
            }
        }
        do {
            let resp: AqiAPIResp = try await fetchJSON(url, timeout: 12)
            return (resp.sources ?? []).map { s in
                AqiResult(
                    id: s.id, providerId: s.id, providerName: s.name, color: s.color,
                    url: s.url.flatMap { URL(string: $0) },
                    air: s.aqi.map { AirQuality(aqi: $0, dominant: s.dominant, pm25: s.pm25, observedAt: s.observedAt) },
                    error: s.error
                )
            }
        } catch {
            return []
        }
    }

    // MARK: Stats

    func analyze(_ results: [ProviderResult]) -> WeatherStats? {
        let ok = results.filter { $0.hasData }
        guard !ok.isEmpty else { return nil }
        let temps = ok.compactMap { $0.current?.temp }
        let feels = ok.compactMap { $0.current?.feelsLike }
        let hums  = ok.compactMap { $0.current?.humidity }
        let uvs   = ok.compactMap { $0.current?.uvIndex }

        let avg = temps.reduce(0, +) / Double(temps.count)
        let text = mostCommonWeather(ok.compactMap { $0.current?.text })

        return WeatherStats(
            avg: avg,
            min: temps.min() ?? avg,
            max: temps.max() ?? avg,
            count: ok.count,
            text: text,
            feelsLike: feels.isEmpty ? nil : (feels.reduce(0, +) / Double(feels.count)).rounded(),
            humidity: hums.isEmpty ? nil : (hums.reduce(0, +) / Double(hums.count)).rounded(),
            uvIndex: uvs.isEmpty ? nil : uvs.reduce(0, +) / Double(uvs.count)
        )
    }

    func annotate(_ results: [ProviderResult]) -> [AnnotatedResult] {
        let temps = results.compactMap { $0.current?.temp }
        let maxT = temps.max(); let minT = temps.min()
        return results.map { r in
            AnnotatedResult(
                id: r.id, base: r,
                isMax: r.current.map { $0.temp == maxT } ?? false,
                isMin: r.current.map { $0.temp == minT } ?? false
            )
        }
    }

    private func mostCommonWeather(_ texts: [String]) -> String {
        guard !texts.isEmpty else { return "未知" }
        let counts = texts.reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }
        return counts.max { $0.value < $1.value }?.key ?? texts[0]
    }

    private func localizeError(_ msg: String) -> String {
        if msg.contains("timed out") || msg.contains("timeout") { return "请求超时" }
        if msg.contains("offline") || msg.contains("network") { return "网络请求失败" }
        return msg
    }
}

private extension String {
    var urlEncoded: String { addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self }
}
