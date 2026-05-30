// 中国天气网（weather.com.cn，中国气象局旗下）实时实况。
// 数据：http://d1.weather.com.cn/sk_2d/{城市码}.html （形如 var dataSK={...}，需 Referer，UTF-8）。
// 浏览器跨域受限，统一经服务端代理 /proxy/weathercn 转发（代理补 Referer）。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'

export const weathercnProvider: WeatherProvider = {
  id: 'weathercn',
  name: '中国天气网',
  color: '#14b8a6',
  requiresKey: false,
  isConfigured: () => true,
  appliesTo: (loc: GeoLocation) => !!loc.weatherCnCode,
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    if (!loc.weatherCnCode) throw new Error('缺少城市码')
    const res = await fetch(`/proxy/weathercn/sk_2d/${loc.weatherCnCode}.html`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('未解析到数据（结构可能已变）')
    const d = JSON.parse(m[0])

    const temp = parseFloat(d.temp)
    if (isNaN(temp)) throw new Error('未解析到温度')
    const ws = parseFloat(d.wse) // 形如「5km/h」

    // sk_2d 只给观测时刻「HH:mm」（北京时），按本机日期补全
    let observedAt: string | undefined
    if (typeof d.time === 'string' && /^\d{1,2}:\d{2}$/.test(d.time)) {
      const [hh, mm] = d.time.split(':').map(Number)
      const dt = new Date()
      dt.setHours(hh, mm, 0, 0)
      observedAt = dt.toISOString()
    }

    return {
      temp,
      text: d.weather || '—',
      humidity: d.SD ? parseInt(d.SD) : d.sd ? parseInt(d.sd) : undefined,
      windDir: d.WD || undefined,
      windSpeed: isNaN(ws) ? undefined : ws,
      observedAt,
    }
  },
}
