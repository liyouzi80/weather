// 彩云天气 Caiyun。需要 API 令牌（token）。
// 同样存在 CORS 问题，开发环境经 vite 代理 /proxy/caiyun 转发。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'
import { getKey } from './keys'

const BASE = '/proxy/caiyun'

// 彩云 skycon 天气现象到中文
const SKYCON: Record<string, string> = {
  CLEAR_DAY: '晴',
  CLEAR_NIGHT: '晴',
  PARTLY_CLOUDY_DAY: '多云',
  PARTLY_CLOUDY_NIGHT: '多云',
  CLOUDY: '阴',
  LIGHT_HAZE: '轻度雾霾',
  MODERATE_HAZE: '中度雾霾',
  HEAVY_HAZE: '重度雾霾',
  LIGHT_RAIN: '小雨',
  MODERATE_RAIN: '中雨',
  HEAVY_RAIN: '大雨',
  STORM_RAIN: '暴雨',
  FOG: '雾',
  LIGHT_SNOW: '小雪',
  MODERATE_SNOW: '中雪',
  HEAVY_SNOW: '大雪',
  STORM_SNOW: '暴雪',
  DUST: '浮尘',
  SAND: '沙尘',
  WIND: '大风',
}

export const caiyunProvider: WeatherProvider = {
  id: 'caiyun',
  name: '彩云天气',
  color: '#f59e0b',
  requiresKey: true,
  isConfigured: () => !!getKey('caiyun'),
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const token = getKey('caiyun')
    if (!token) throw new Error('未配置彩云天气令牌')
    // 彩云经纬度顺序为 lon,lat
    const url = `${BASE}/v2.6/${token}/${loc.lon.toFixed(4)},${loc.lat.toFixed(4)}/realtime`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'ok') throw new Error(`接口返回 status=${data.status}`)
    const r = data.result.realtime
    return {
      temp: Math.round(r.temperature * 10) / 10,
      feelsLike: Math.round(r.apparent_temperature * 10) / 10,
      text: SKYCON[r.skycon] ?? r.skycon,
      humidity: Math.round(r.humidity * 100),
      windSpeed: r.wind?.speed,
      windDir: degToDir(r.wind?.direction),
      observedAt: data.server_time ? new Date(data.server_time * 1000).toISOString() : undefined,
    }
  },
}

function degToDir(deg?: number): string | undefined {
  if (deg == null) return undefined
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8] + '风'
}
