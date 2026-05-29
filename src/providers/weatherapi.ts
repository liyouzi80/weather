// WeatherAPI.com。免费层每月 100 万次，需注册获取 key。
// api.weatherapi.com 支持 CORS，浏览器可直连，无需代理。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'
import { getKey } from './keys'

/** 带重试和超时的 fetch */
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      return res
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

// 风向英文方位 -> 中文
const CARDINAL: Record<string, string> = {
  N: '北风', NNE: '东北偏北风', NE: '东北风', ENE: '东北偏东风',
  E: '东风', ESE: '东南偏东风', SE: '东南风', SSE: '东南偏南风',
  S: '南风', SSW: '西南偏南风', SW: '西南风', WSW: '西南偏西风',
  W: '西风', WNW: '西北偏西风', NW: '西北风', NNW: '西北偏北风',
}

export const weatherapiProvider: WeatherProvider = {
  id: 'weatherapi',
  name: 'WeatherAPI.com',
  color: '#0ea5e9',
  requiresKey: true,
  isConfigured: () => !!getKey('weatherapi'),
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const key = getKey('weatherapi')
    if (!key) throw new Error('未配置 WeatherAPI.com key')
    const url =
      `https://api.weatherapi.com/v1/current.json?key=${key}` +
      `&q=${loc.lat},${loc.lon}&lang=zh`

    const res = await fetchWithRetry(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = await res.json()
    const c = d?.current
    if (c?.temp_c == null) throw new Error('无实况数据')
    return {
      temp: c.temp_c,
      feelsLike: c.feelslike_c,
      text: c.condition?.text ?? '—',
      humidity: c.humidity,
      windSpeed: c.wind_kph,
      windDir: CARDINAL[c.wind_dir] ?? c.wind_dir,
      observedAt: c.last_updated,
    }
  },
}
