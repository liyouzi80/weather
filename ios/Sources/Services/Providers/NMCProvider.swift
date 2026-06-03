import Foundation

// 中央气象台 / 国家气象中心（www.nmc.cn）。无需密钥。
//  1) 用站点编码而非经纬度，需先按城市名检索：/essearch/api/autocomplete?q=
//     返回 data 为竖线分隔字符串数组：`编码|名称|省份|url|经度|纬度`。
//  2) 用编码拉实况：/rest/weather?stationid=
//     风速/风向在 real.wind（speed m/s、direct 文字）；缺测值为 9999。
//  浏览器受 CORS 限制需服务端代理；原生 URLSession 直接抓取（带 Referer）。
struct NMCProvider: WeatherProvider {
    let id = "nmc"
    let name = "中央气象台"
    let color = "#0a84ff"
    let requiresKey = false
    func isConfigured() -> Bool { true }

    private let referer = ["Referer": "https://www.nmc.cn/"]

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        let keyword = (loc.cityName ?? loc.name)
            .replacingOccurrences(of: "市", with: "")
            .replacingOccurrences(of: "区", with: "")
            .replacingOccurrences(of: "县", with: "")
        guard !keyword.isEmpty else { throw FetchError.noData }

        // 1) 检索站点编码
        guard let searchURL = URL(string: "https://www.nmc.cn/essearch/api/autocomplete?q=\(keyword.urlEncoded)") else {
            throw FetchError.invalidURL
        }
        let searchResp: NMCSearchResp = try await fetchJSON(searchURL, headers: referer)
        guard let firstRow = searchResp.data?.first,
              let stationId = firstRow.split(separator: "|").first.map(String.init), !stationId.isEmpty else {
            throw FetchError.noData
        }

        // 2) 拉取实况
        guard let url = URL(string: "https://www.nmc.cn/rest/weather?stationid=\(stationId)") else {
            throw FetchError.invalidURL
        }
        let resp: NMCWeatherResp = try await fetchJSON(url, headers: referer)
        guard let real = resp.data?.real, let w = real.weather,
              let temp = w.temperature, temp != 9999 else { throw FetchError.noData }

        // nmc 缺测值为 9999
        func clean(_ v: Double?) -> Double? { (v == nil || v == 9999) ? nil : v }
        let speedMs = real.wind?.speed.flatMap { Double($0) }

        return CurrentWeather(
            temp: temp,
            feelsLike: clean(w.feelst),
            text: w.info ?? "未知",
            humidity: clean(w.humidity),
            windSpeed: speedMs.map { ($0 * 3.6 * 10).rounded() / 10 }, // m/s -> km/h
            windDir: real.wind?.direct,
            // publish_time 形如「2026-05-31 10:00」（北京时），原样写入 UTC 字段，前端按 UTC 显示
            observedAt: real.publish_time.map { "\($0.replacingOccurrences(of: " ", with: "T").prefix(16)):00Z" },
            forecast: nil, forecastIssuedAt: nil,
            uvIndex: nil, warnings: nil, minutelyRain: nil
        )
    }

    // MARK: Response models
    private struct NMCSearchResp: Decodable {
        let data: [String]?
    }
    private struct NMCWeatherResp: Decodable {
        let data: NMCData?
        struct NMCData: Decodable {
            let real: NMCReal?
            struct NMCReal: Decodable {
                let publish_time: String?
                let weather: NMCWeather?
                let wind: NMCWind?
                struct NMCWeather: Decodable {
                    let temperature: Double?
                    let feelst: Double?
                    let info: String?
                    let humidity: Double?
                }
                struct NMCWind: Decodable {
                    let speed: String?
                    let direct: String?
                }
            }
        }
    }
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
