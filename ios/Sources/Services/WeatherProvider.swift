import Foundation

protocol WeatherProvider {
    var id: String { get }
    var name: String { get }
    var color: String { get }
    var requiresKey: Bool { get }
    func isConfigured() -> Bool
    func appliesTo(_ loc: GeoLocation) -> Bool
    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather
}

extension WeatherProvider {
    func appliesTo(_ loc: GeoLocation) -> Bool { true }
}

// MARK: - Shared fetch helpers

enum FetchError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case decodingError(String)
    case timeout
    case noData

    var errorDescription: String? {
        switch self {
        case .invalidURL:         return "无效地址"
        case .httpError(let c):  return "HTTP \(c)"
        case .decodingError(let s): return "解析失败: \(s)"
        case .timeout:            return "请求超时"
        case .noData:             return "无数据"
        }
    }
}

func fetchJSON<T: Decodable>(_ url: URL, headers: [String: String] = [:], timeout: TimeInterval = 8) async throws -> T {
    var req = URLRequest(url: url, timeoutInterval: timeout)
    headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
    let (data, resp) = try await URLSession.shared.data(for: req)
    guard let http = resp as? HTTPURLResponse else { throw FetchError.noData }
    guard http.statusCode == 200 else { throw FetchError.httpError(http.statusCode) }
    return try JSONDecoder().decode(T.self, from: data)
}
