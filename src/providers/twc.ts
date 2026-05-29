// The Weather Channel（weather.com / The Weather Company）。
// 使用 api.weather.com v3 当前实况接口，需要 apiKey。
// 浏览器直连有 CORS 限制，经代理 /proxy/twc 转发（开发=vite 代理，生产=Pages Function）。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'
import { getKey } from './keys'

const BASE = '/proxy/twc'

// 风向英文方位 -> 中文
const CARDINAL: Record<string, string> = {
  N: '北风', NNE: '东北偏北风', NE: '东北风', ENE: '东北偏东风',
  E: '东风', ESE: '东南偏东风', SE: '东南风', SSE: '东南偏南风',
  S: '南风', SSW: '西南偏南风', SW: '西南风', WSW: '西南偏西风',
  W: '西风', WNW: '西北偏西风', NW: '西北风', NNW: '西北偏北风',
}

export const twcProvider: WeatherProvider = {
  id: 'twc',
  name: 'The Weather Channel',
  color: '#0ea5e9',
  requiresKey: true,
  isConfigured: () => !!getKey('twc'),
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const key = getKey('twc')
    if (!key) throw new Error('未配置 The Weather Channel apiKey')
    const url =
      `${BASE}/v3/wx/observations/current?geocode=${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}` +
      `&units=m&language=zh-CN&format=json&apiKey=${key}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = await res.json()
    if (d.temperature == null) throw new Error('无实况数据')
    return {
      temp: d.temperature,
      feelsLike: d.temperatureFeelsLike ?? undefined,
      text: d.wxPhraseLong || d.wxPhraseShort || '—',
      humidity: d.relativeHumidity ?? undefined,
      windSpeed: d.windSpeed ?? undefined, // units=m 时为 km/h
      windDir: CARDINAL[d.windDirectionCardinal] ?? d.windDirectionCardinal ?? undefined,
      observedAt: d.validTimeLocal || d.validTimeUtc,
    }
  },
}
