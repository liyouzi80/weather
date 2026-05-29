// Apple 天气（WeatherKit）。鉴权用 ES256 JWT，私钥必须留在服务端，
// 因此前端只请求服务端端点 /api/apple/current（开发=vite 插件，生产=Pages Function）。
// 是否真正可用取决于服务端是否配置了 Apple 凭证；未配置时端点会返回错误，在卡片上显示。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'

export const appleProvider: WeatherProvider = {
  id: 'apple',
  name: 'Apple 天气',
  color: '#cbd5e1',
  requiresKey: false,
  isConfigured: () => true,
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const res = await fetch(`/api/apple/current?lat=${loc.lat}&lon=${loc.lon}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`)
    if (d.temp == null) throw new Error('无实况数据')
    return {
      temp: d.temp,
      feelsLike: d.feelsLike,
      text: d.text ?? '—',
      humidity: d.humidity,
      windSpeed: d.windSpeed,
      windDir: d.windDir,
      observedAt: d.observedAt,
    }
  },
}
