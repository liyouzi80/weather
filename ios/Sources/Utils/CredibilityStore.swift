import Foundation
import Observation

// 信源可信度评分存储（对齐 PWA src/credibility.ts）
// cityName → providerId → 0–5，默认 3，UserDefaults 持久化。
@Observable
@MainActor
class CredibilityStore {
    static let shared = CredibilityStore()
    private let key = "source-credibility-v1"
    private var scores: [String: [String: Int]] = [:]

    private init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let decoded = try? JSONDecoder().decode([String: [String: Int]].self, from: data) {
            scores = decoded
        }
    }

    func score(city: String, provider: String) -> Int {
        scores[city]?[provider] ?? 3
    }

    func setScore(city: String, provider: String, value: Int) {
        let clamped = max(0, min(5, value))
        if scores[city] == nil { scores[city] = [:] }
        scores[city]![provider] = clamped
        persist()
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(scores) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
