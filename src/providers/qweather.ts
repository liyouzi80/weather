// 和风天气 QWeather。需要 API 密钥（免费开发版即可）。
// 浏览器直接请求 devapi.qweather.com 会被 CORS 拦截，
// 开发环境经 vite 代理 /proxy/qweather 转发；生产部署需自备同样的反向代理。
import type { CurrentWeather, GeoLocation, MinutelyRain, WeatherProvider, WeatherWarning } from './types'
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
    const locStr = `${loc.lon.toFixed(2)},${loc.lat.toFixed(2)}`
    // 实况 + 预警 + 分钟级降水并行请求，后两者失败不影响实况展示
    const [weatherRes, warningRes, minutelyRes, dailyRes] = await Promise.all([
      fetch(`${BASE}/v7/weather/now?location=${locStr}&key=${key}`),
      fetch(`${BASE}/v7/warning/now?location=${locStr}&key=${key}`).catch(() => null),
      fetch(`${BASE}/v7/minutely/5m?location=${locStr}&key=${key}`).catch(() => null),
      fetch(`${BASE}/v7/weather/3d?location=${locStr}&key=${key}`).catch(() => null),
    ])
    if (!weatherRes.ok) throw new Error(`HTTP ${weatherRes.status}`)
    const data = await weatherRes.json()
    if (data.code !== '200') throw new Error(`接口返回 code=${data.code}`)
    const now = data.now

    // 解析预警（active/update 状态；cancel 跳过）
    const warnings: WeatherWarning[] = []
    if (warningRes?.ok) {
      const wData = await warningRes.json().catch(() => null)
      if (wData?.code === '200' && Array.isArray(wData.warning)) {
        for (const w of wData.warning) {
          if (w.status === 'cancel') continue
          const level = qwLevel(w.level ?? '')
          const type = w.typeName ?? ''
          if (type && level) {
            warnings.push({ title: w.title ?? `${type}${level}预警信号`, type, level })
          }
        }
      }
    }

    // 解析今日降水概率（3d daily[0].pop）
    let pop: number | undefined
    if (dailyRes?.ok) {
      const dData = await dailyRes.json().catch(() => null)
      console.log('[qweather] 3d response:', dData?.code, dData?.daily?.[0])
      if (dData?.code === '200' && Array.isArray(dData.daily) && dData.daily.length > 0) {
        const v = Number(dData.daily[0].pop)
        if (!isNaN(v)) pop = v
      }
    } else {
      console.log('[qweather] 3d fetch failed or not ok:', dailyRes?.status)
    }

    // 解析分钟级降水（取前 12 条 = 未来 60 分钟，有实际降水时才保留）
    let minutelyRain: MinutelyRain | undefined
    if (minutelyRes?.ok) {
      const mData = await minutelyRes.json().catch(() => null)
      if (mData?.code === '200' && Array.isArray(mData.minutely)) {
        const items = mData.minutely.slice(0, 12).map((m: Record<string, string>) => ({
          fxTime: m.fxTime,
          precip: Number(m.precip),
          type: m.type === 'snow' ? 'snow' as const : 'rain' as const,
        }))
        if (items.some((m: { precip: number }) => m.precip > 0)) {
          minutelyRain = { summary: mData.summary ?? '', minutely: items }
        }
      }
    }

    return {
      temp: Number(now.temp),
      feelsLike: Number(now.feelsLike),
      text: now.text,
      humidity: Number(now.humidity),
      windSpeed: Number(now.windSpeed),
      windDir: now.windDir,
      uvIndex: now.uvIndex != null ? Number(now.uvIndex) : undefined,
      // obsTime 形如「2024-06-06T16:00+08:00」；取北京墙上时间 16:00 写入 UTC 字段，前端按 UTC 原样显示
      observedAt: now.obsTime ? `${now.obsTime.slice(0, 16)}:00Z` : undefined,
      ...(warnings.length > 0 && { warnings }),
      ...(minutelyRain && { minutelyRain }),
      ...(pop != null && { pop }),
    }
  },
}

// 和风天气预警等级英文/中文 → 标准中文（中国气象预警信号颜色名称）
function qwLevel(level: string): string {
  const map: Record<string, string> = {
    Blue: '蓝色', Yellow: '黄色', Orange: '橙色', Red: '红色', White: '白色',
    蓝色: '蓝色', 黄色: '黄色', 橙色: '橙色', 红色: '红色', 白色: '白色',
  }
  return map[level] ?? level
}
