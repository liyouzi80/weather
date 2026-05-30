// 和风天气 QWeather。需要 API 密钥（免费开发版即可）。
// 浏览器直接请求 devapi.qweather.com 会被 CORS 拦截，
// 开发环境经 vite 代理 /proxy/qweather 转发；生产部署需自备同样的反向代理。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'
import { getKey } from './keys'

const BASE = '/proxy/qweather'

export const qweatherProvider: WeatherProvider = {
  id: 'qweather',
  name: '和风天气',
  color: '#3b82f6',
  requiresKey: true,
  isConfigured: () => !!getKey('qweather'),
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const key = getKey('qweather')
    if (!key) throw new Error('未配置和风天气密钥')
    // QWeather 经纬度顺序为 lon,lat
    const url = `${BASE}/v7/weather/now?location=${loc.lon.toFixed(2)},${loc.lat.toFixed(2)}&key=${key}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.code !== '200') throw new Error(`接口返回 code=${data.code}`)
    const now = data.now
    return {
      temp: Number(now.temp),
      feelsLike: Number(now.feelsLike),
      text: now.text,
      humidity: Number(now.humidity),
      windSpeed: Number(now.windSpeed),
      windDir: now.windDir,
      // obsTime 形如「2024-06-06T16:00+08:00」；取北京墙上时间 16:00 写入 UTC 字段，前端按 UTC 原样显示
      observedAt: now.obsTime ? `${now.obsTime.slice(0, 16)}:00Z` : undefined,
    }
  },
}
