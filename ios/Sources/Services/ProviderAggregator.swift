import Foundation

@MainActor
class ProviderAggregator {
    static let shared = ProviderAggregator()

    let providers: [any WeatherProvider] = [
        NMCProvider(),
        GZQXProvider(),
        WeatherCNProvider(),
        TencentProvider(),
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
        return await AqiScraper.aggregate(cityName: city)
    }

    // MARK: Stats

    /// weights: providerId → score (0–5, default 3). Score 0 = excluded from aggregation.
    func analyze(_ results: [ProviderResult], weights: (String) -> Int = { _ in 3 }) -> WeatherStats? {
        let w = { (r: ProviderResult) -> Double in Double(weights(r.providerId)) }
        let ok = results.filter { $0.hasData }
        guard !ok.isEmpty else { return nil }

        // 评分=0 的信源排除出聚合；若全部为 0 则退回全部
        let active = ok.filter { weights($0.providerId) > 0 }
        let pool = active.isEmpty ? ok : active

        let temps = pool.compactMap { $0.current?.temp }
        guard !temps.isEmpty else { return nil }

        // 加权平均温度
        let totalW = pool.reduce(0.0) { $0 + w($1) }
        let avg = totalW > 0
            ? pool.compactMap { r in r.current.map { ($0.temp, w(r)) } }
                  .reduce(0.0) { $0 + $1.0 * $1.1 } / totalW
            : temps.reduce(0, +) / Double(temps.count)

        // 加权多数投票天气文字（排除「未知」）
        var textW: [String: Double] = [:]
        for r in pool {
            if let t = r.current?.text, t != "未知" { textW[t, default: 0] += w(r) }
        }
        let text = textW.max { $0.value < $1.value }?.key
            ?? ok.first?.current?.text ?? "未知"

        // 加权平均可选字段
        func wavg(_ pairs: [(Double, Double)]) -> Double? {
            guard !pairs.isEmpty else { return nil }
            let tw = pairs.reduce(0.0) { $0 + $1.1 }
            return tw > 0 ? pairs.reduce(0.0) { $0 + $1.0 * $1.1 } / tw : nil
        }
        let feels = pool.compactMap { r in r.current?.feelsLike.map { ($0, w(r)) } }
        let hums  = pool.compactMap { r in r.current?.humidity.map  { ($0, w(r)) } }
        let uvs   = pool.compactMap { r in r.current?.uvIndex.map   { ($0, w(r)) } }
        let winds = pool.compactMap { r in r.current?.windSpeed.map  { ($0, w(r)) } }

        return WeatherStats(
            avg: avg,
            min: temps.min() ?? avg,
            max: temps.max() ?? avg,
            count: pool.count,
            text: text,
            feelsLike: wavg(feels).map { $0.rounded() },
            humidity: wavg(hums).map { $0.rounded() },
            uvIndex: wavg(uvs),
            windSpeed: wavg(winds)
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
}

// 文件级函数：可从 @Sendable 任务闭包直接调用，无需捕获 self
private func localizeError(_ msg: String) -> String {
    if msg.contains("timed out") || msg.contains("timeout") { return "请求超时" }
    if msg.contains("offline") || msg.contains("network") { return "网络请求失败" }
    return msg
}
