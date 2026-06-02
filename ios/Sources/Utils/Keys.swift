import Foundation

// API keys — fill in via Xcode scheme environment variables or hardcode for personal use.
// Variable names match the web app's VITE_* convention.
enum Keys {
    static let qweather   = Bundle.main.object(forInfoDictionaryKey: "QWEATHER_KEY")   as? String ?? ""
    static let caiyun     = Bundle.main.object(forInfoDictionaryKey: "CAIYUN_KEY")     as? String ?? ""
    static let owm        = Bundle.main.object(forInfoDictionaryKey: "OWM_KEY")        as? String ?? ""

    // Base URL of your Cloudflare Pages deployment (for server-side scraping endpoints)
    // e.g. "https://your-project.pages.dev"
    static let baseURL    = Bundle.main.object(forInfoDictionaryKey: "BASE_URL") as? String
                            ?? "https://your-project.pages.dev"
}
