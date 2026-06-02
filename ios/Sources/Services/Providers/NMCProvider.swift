import Foundation

struct NMCProvider: WeatherProvider {
    let id = "nmc"
    let name = "中央气象台"
    let color = "#0a84ff"
    let requiresKey = false
    func isConfigured() -> Bool { true }

    func fetchCurrent(_ loc: GeoLocation) async throws -> CurrentWeather {
        let keyword = (loc.cityName ?? loc.name)
            .replacingOccurrences(of: "市", with: "")
            .replacingOccurrences(of: "区", with: "")
            .replacingOccurrences(of: "县", with: "")

        // Step 1: search station code
        guard let searchURL = URL(string: "https://www.nmc.cn/rest/search?searchStr=\(keyword.urlEncoded)") else {
            throw FetchError.invalidURL
        }
        let searchResp: NMCSearchResp = try await fetchJSON(searchURL, headers: ["Referer": "https://www.nmc.cn/"])
        guard let stationCode = searchResp.data?.first?.code else { throw FetchError.noData }

        // Step 2: fetch real-time data
        guard let url = URL(string: "https://www.nmc.cn/rest/weather?stationid=\(stationCode)&_=\(Int(Date().timeIntervalSince1970 * 1000))") else {
            throw FetchError.invalidURL
        }
        let resp: NMCWeatherResp = try await fetchJSON(url, headers: ["Referer": "https://www.nmc.cn/"])
        guard let r = resp.data?.real?.weather else { throw FetchError.noData }

        return CurrentWeather(
            temp: r.temperature,
            feelsLike: r.feelst,
            text: r.info ?? "未知",
            humidity: r.humidity,
            windSpeed: r.windspeed,
            windDir: r.winddirection,
            observedAt: resp.data?.real?.publish_time,
            forecast: nil, forecastIssuedAt: nil,
            uvIndex: nil, warnings: nil, minutelyRain: nil
        )
    }

    // MARK: Response models
    private struct NMCSearchResp: Decodable {
        let data: [NMCStation]?
        struct NMCStation: Decodable { let code: String? }
    }
    private struct NMCWeatherResp: Decodable {
        let data: NMCData?
        struct NMCData: Decodable {
            let real: NMCReal?
            struct NMCReal: Decodable {
                let publish_time: String?
                let weather: NMCWeather?
                struct NMCWeather: Decodable {
                    let temperature: Double
                    let feelst: Double?
                    let info: String?
                    let humidity: Double?
                    let windspeed: Double?
                    let winddirection: String?
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
