import Foundation
import Observation

@Observable
@MainActor
class CityViewModel {
    var results: [ProviderResult] = []
    var air: [AqiResult] = []
    var loading = false
    var initialLoad = true
    var updatedAt = Date()

    let loc: GeoLocation
    private let agg = ProviderAggregator.shared
    private let cred = CredibilityStore.shared
    // 每次刷新自增；后台补齐任务据此判断是否已被新刷新取代
    private var refreshToken = 0

    init(loc: GeoLocation) {
        self.loc = loc
    }

    private var cityKey: String { loc.cityName ?? loc.name }
    func scoreFor(_ providerId: String) -> Int { cred.score(city: cityKey, provider: providerId) }

    func updateScore(_ providerId: String, delta: Int) {
        let cur = cred.score(city: cityKey, provider: providerId)
        let next = max(0, min(5, cur + delta))
        guard next != cur else { return }
        Haptics.impact()
        cred.setScore(city: cityKey, provider: providerId, value: next)
    }

    var stats: WeatherStats? {
        agg.analyze(results, weights: { [weak self] id in self?.scoreFor(id) ?? 3 })
    }

    // 卡片按评分降序排列（评分相同保持原信源顺序）
    var sortedAnnotated: [AnnotatedResult] {
        agg.annotate(results).sorted { scoreFor($0.base.providerId) > scoreFor($1.base.providerId) }
    }

    var avgAqi: Int? {
        let vals = air.compactMap { $0.air?.aqi }
        guard !vals.isEmpty else { return nil }
        return vals.reduce(0, +) / vals.count
    }

    // 信源摘要：信源数 + 温度标准差（折叠摘要行用）。不足 2 源时为 nil。
    var sourceSummary: (count: Int, sd: String)? {
        let temps = results.filter { $0.hasData }.compactMap { $0.current?.temp }
        guard temps.count >= 2 else { return nil }
        let avg = temps.reduce(0, +) / Double(temps.count)
        let variance = temps.reduce(0) { $0 + ($1 - avg) * ($1 - avg) } / Double(temps.count)
        return (temps.count, String(format: "%.1f", variance.squareRoot()))
    }

    var warnings: [WeatherWarning] {
        results.compactMap { $0.current?.warnings }.first(where: { !$0.isEmpty }) ?? []
    }

    var minutelyRain: MinutelyRain? {
        results.compactMap { $0.current?.minutelyRain }.first
    }

    var panyuForecast: (text: String, issuedAt: String?)? {
        // 时效过滤已在 GZQXProvider 抓取时完成（过期不返回 forecast），此处直接透传。
        guard let r = results.first(where: { $0.current?.forecast != nil })?.current,
              let text = r.forecast else { return nil }
        return (text, r.forecastIssuedAt)
    }

    @MainActor
    func refresh() async {
        loading = true
        refreshToken += 1
        let token = refreshToken
        async let weather = agg.fetchAll(loc: loc)
        async let aqiData = agg.fetchAqi(loc: loc)
        results = await weather
        air = await aqiData
        loading = false
        initialLoad = false
        updatedAt = Date()
        // 刷新完成后，AQI 不全则后台静默补齐（服务站点页偶发抓取失败）
        if healthyAqiCount(air) < 2 { backfillAqi(token: token) }
        // 天气信源有失败项则后台补齐
        if results.contains(where: { !$0.hasData }) { backfillWeather(token: token) }
    }

    private func healthyAqiCount(_ a: [AqiResult]) -> Int { a.filter { $0.air != nil }.count }

    // 后台补齐 AQI：退避重试，仅在仍属当前刷新时合并，不打断 UI（不动 loading）。
    private func backfillAqi(token: Int) {
        Task { [weak self] in
            guard let self else { return }
            let delaysMs: [UInt64] = [2_500, 5_000, 9_000, 15_000]
            for ms in delaysMs {
                if self.healthyAqiCount(self.air) >= 2 { return } // 已补齐
                try? await Task.sleep(nanoseconds: ms * 1_000_000)
                if token != self.refreshToken { return }          // 已被新刷新取代
                let fresh = await self.agg.fetchAqi(loc: self.loc)
                if token != self.refreshToken { return }
                let merged = self.mergeAqi(self.air, fresh)
                if self.healthyAqiCount(merged) > self.healthyAqiCount(self.air) {
                    self.air = merged
                }
            }
        }
    }

    // 天气信源后台补齐：只重试失败项，成功后合并，不打断 UI。
    private func backfillWeather(token: Int) {
        Task { [weak self] in
            guard let self else { return }
            let expected = self.results.count
            let delaysMs: [UInt64] = [3_000, 7_000, 13_000, 21_000]
            for ms in delaysMs {
                if self.results.filter({ $0.hasData }).count >= expected { return }
                try? await Task.sleep(nanoseconds: ms * 1_000_000)
                if token != self.refreshToken { return }
                let fresh = await self.agg.fetchAll(loc: self.loc)
                if token != self.refreshToken { return }
                let merged = self.mergeResults(self.results, fresh)
                if merged.filter({ $0.hasData }).count > self.results.filter({ $0.hasData }).count {
                    self.results = merged
                }
            }
        }
    }

    // 天气结果合并：保留原顺序，每源只升级「有数据」（新 > 旧），不降级。
    private func mergeResults(_ prev: [ProviderResult], _ next: [ProviderResult]) -> [ProviderResult] {
        prev.map { p in
            guard !p.hasData else { return p }
            guard let fresh = next.first(where: { $0.id == p.id }), fresh.hasData else { return p }
            return fresh
        }
    }

    // 按 id 合并：保留原顺序，每源优先取「有数据」的版本（新 > 旧）。
    private func mergeAqi(_ prev: [AqiResult], _ next: [AqiResult]) -> [AqiResult] {
        var ids = prev.map { $0.id }
        for s in next where !ids.contains(s.id) { ids.append(s.id) }
        return ids.compactMap { id in
            let fresh = next.first { $0.id == id }
            let old = prev.first { $0.id == id }
            if fresh?.air != nil { return fresh }
            if old?.air != nil { return old }
            return fresh ?? old
        }
    }
}
