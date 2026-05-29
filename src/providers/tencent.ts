// 腾讯天气（wis.qq.com）实时实况。
// 数据：https://wis.qq.com/weather/common?weather_type=observe&province=&city=&county= （JSON，无需密钥）。
// 浏览器跨域受限，统一经服务端代理 /proxy/tencent 转发。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'

export const tencentProvider: WeatherProvider = {
  id: 'tencent',
  name: '腾讯天气',
  color: '#0ea5e9',
  requiresKey: false,
  isConfigured: () => true,
  appliesTo: (loc: GeoLocation) => !!loc.tencent,
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const t = loc.tencent
    if (!t) throw new Error('缺少省/市/区县')
    const p = new URLSearchParams({
      source: 'pc',
      weather_type: 'observe',
      province: t.province,
      city: t.city,
      county: t.county,
    })
    const res = await fetch(`/proxy/tencent/weather/common?${p.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    const o = j?.data?.observe
    if (!o || o.degree == null) throw new Error('无实况数据')

    const temp = parseFloat(o.degree)
    if (isNaN(temp)) throw new Error('未解析到温度')

    return {
      temp,
      text: o.weather || '—',
      humidity: o.humidity ? parseInt(o.humidity) : undefined,
      windDir: o.wind_direction_name || undefined,
      // 腾讯仅给风力等级（wind_power），无 km/h，故不填 windSpeed
      observedAt: parseTencentTime(o.update_time),
    }
  },
}

// update_time 形如「202605300015」（北京时 yyyymmddHHMM）→ ISO
function parseTencentTime(s?: string): string | undefined {
  if (!s || !/^\d{12}$/.test(s)) return undefined
  const Y = +s.slice(0, 4), Mo = +s.slice(4, 6), D = +s.slice(6, 8)
  const H = +s.slice(8, 10), Mi = +s.slice(10, 12)
  return new Date(Date.UTC(Y, Mo - 1, D, H - 8, Mi)).toISOString()
}
