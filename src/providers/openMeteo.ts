// Open-Meteo：免费、无需密钥、支持 CORS，可直接在浏览器请求。
// 作为默认信源和兜底，保证应用开箱即用。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'

// WMO 天气代码到中文描述的简表
const WMO: Record<number, string> = {
  0: '晴',
  1: '晴间多云',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  81: '中阵雨',
  82: '强阵雨',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷阵雨伴冰雹',
}

export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  name: 'Open-Meteo',
  color: '#22c55e',
  requiresKey: false,
  isConfigured: () => true,
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kmh&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const c = data.current
    if (!c) throw new Error('无返回数据')
    return {
      temp: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      text: WMO[c.weather_code] ?? `代码 ${c.weather_code}`,
      humidity: c.relative_humidity_2m,
      windSpeed: c.wind_speed_10m,
      windDir: degToDir(c.wind_direction_10m),
      observedAt: c.time,
    }
  },
}

function degToDir(deg: number): string {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8] + '风'
}
