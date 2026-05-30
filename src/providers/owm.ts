// OpenWeatherMap。免费层即可，需注册获取 appid。
// api.openweathermap.org 支持 CORS，浏览器可直连，无需代理。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'
import { getKey } from './keys'
import { degToDir } from './utils'

export const owmProvider: WeatherProvider = {
  id: 'owm',
  name: 'OpenWeatherMap',
  color: '#f97316',
  requiresKey: true,
  isConfigured: () => !!getKey('owm'),
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const key = getKey('owm')
    if (!key) throw new Error('未配置 OpenWeatherMap appid')
    const url =
      `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}` +
      `&units=metric&lang=zh_cn&appid=${key}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = await res.json()
    if (d?.main?.temp == null) throw new Error('无实况数据')
    return {
      temp: Math.round(d.main.temp * 10) / 10,
      feelsLike: d.main.feels_like != null ? Math.round(d.main.feels_like * 10) / 10 : undefined,
      text: d.weather?.[0]?.description ?? '—',
      humidity: d.main.humidity,
      windSpeed: d.wind?.speed != null ? Math.round(d.wind.speed * 3.6 * 10) / 10 : undefined, // m/s -> km/h
      windDir: degToDir(d.wind?.deg),
      observedAt: d.dt ? new Date(d.dt * 1000).toISOString() : undefined,
    }
  },
}
