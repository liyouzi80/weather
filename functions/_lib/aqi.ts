// 美国标准 AQI 抓取与聚合 —— 服务端共享逻辑。
// 同时供 Cloudflare Pages Function（functions/api/aqi.ts、widget.ts）与
// vite dev 插件（vite.config.ts）复用，避免在浏览器端下载整页 HTML。

const UA = 'Mozilla/5.0 (compatible; WeatherWidget/1.0)'

// 各城市的站点页路径（精确到本地监测站）
export const AM_PATH: Record<string, string> = {
  番禺: 'place/china/fanyudaxuecheng/3b401494', // 番禺大学城
  安福: 'place/china/anfuxianwenhuaguangchang/cd272b77', // 安福县文化广场
}
export const IQAIR_PATH: Record<string, string> = {
  番禺: 'cn/china/guangdong/guangzhou/panyu-university-town',
  安福: 'cn/china/jiangxi/jian/anfu-county-environmental-protection-bureau', // 安福县环保局
}

const POL: Record<string, string> = { O3: 'O₃', 'PM2.5': 'PM2.5', PM10: 'PM10', NO2: 'NO₂', SO2: 'SO₂', CO: 'CO' }
const AM_CATS = '优|良好|良|中等|轻度污染|中度污染|重度污染|严重污染|对敏感人群不健康|不健康|非常不健康|危险|危害'
const IQAIR_CATS = '优秀|优|良好|良|中等|对敏感人群不健康|不健康|非常不健康|危险|危害'

export interface AqiSource {
  id: string
  name: string
  color: string
  aqi?: number
  dominant?: string
  pm25?: number
  forecast?: string
  error?: string
  /** 每日预报（内部用于聚合，返回前会剥离） */
  days?: ForecastDay[]
}

/** 每日预报项：日期标签 + 温度高低 + 当天 AQI（取当天高值/代表值） */
export interface ForecastDay {
  label: string
  hi?: number
  lo?: number
  aqi: number
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function dayLabel(i: number, y: number, mo: number, d: number): string {
  if (i === 0) return '今天'
  if (i === 1) return '明天'
  return WEEK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
}

// 在意空气（air-quality.com）
export async function fetchAirMattersAqi(path: string): Promise<AqiSource> {
  const res = await fetch(`https://air-quality.com/${path}?lang=zh-Hans&standard=aqi_us`, {
    headers: { 'User-Agent': UA, Referer: 'https://air-quality.com/' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const m = html.match(/AQI \(美国标准\)\s*(\d+)/)
  if (!m) throw new Error('解析失败')
  // 各污染物含 ratio-bar 贡献度，取最大者为主要污染物
  const items = [
    ...html.matchAll(
      /<div class='name'>([^<]+)<\/div><div class='unit'>[^<]*<\/div><div class='value'>([\d.]+)<\/div><div class='ratio-bar' style='[^']*\*([\d.]+)\)/g,
    ),
  ].map((x) => ({ name: x[1], value: parseFloat(x[2]), ratio: parseFloat(x[3]) }))
  const dom = items.length ? items.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined
  const pm = items.find((i) => i.name === 'PM2.5')
  const s = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  // 每日预报：日期 + 温度高/低(°C) + AQI 范围（取高值为当天代表）
  const dm = [
    ...s.matchAll(new RegExp(`(\\d{4})-(\\d{2})-(\\d{2})[^0-9]*?(\\d+)°\\s*/\\s*(\\d+)°[^~]*?(\\d+)~(\\d+)\\s*(?:${AM_CATS})`, 'g')),
  ]
  const days: ForecastDay[] = dm.slice(0, 5).map((x, i) => ({
    label: dayLabel(i, parseInt(x[1]), parseInt(x[2]), parseInt(x[3])),
    hi: parseInt(x[4]), lo: parseInt(x[5]), aqi: parseInt(x[7]),
  }))
  const forecast = dm.length
    ? `今 ${dm[0][6]}~${dm[0][7]}` + (dm[1] ? ` · 明 ${dm[1][6]}~${dm[1][7]}` : '')
    : undefined
  return {
    id: 'airmatters', name: '在意空气', color: '#f59e0b',
    aqi: parseInt(m[1]), dominant: dom ? POL[dom.name] ?? dom.name : undefined,
    pm25: pm ? pm.value : undefined, forecast, days,
  }
}

// IQAir（iqair.cn）
export async function fetchIQAirAqi(path: string): Promise<AqiSource> {
  const res = await fetch(`https://www.iqair.cn/${path}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const s = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const m = s.match(new RegExp(`(\\d+)\\s*美国 AQI⁺?\\s*(?:${IQAIR_CATS})\\s*主要污染物[：:]\\s*(\\S+)\\s*([\\d.]+)\\s*µg`))
  let aqi: number
  let dominant: string | undefined
  let pm25: number | undefined
  if (m) {
    aqi = parseInt(m[1])
    dominant = m[2]
    pm25 = m[2].includes('2.5') ? parseFloat(m[3]) : undefined
  } else {
    const l = s.match(/(\d+)\s*美国 AQI/)
    if (!l) throw new Error('解析失败')
    aqi = parseInt(l[1])
  }
  // 每日预报：标签 + AQI + 温度高/低
  const fi = s.indexOf('每日预报')
  const seg = fi >= 0 ? s.slice(fi, fi + 460) : ''
  const dm = [...seg.matchAll(/(今天|明天|周[一二三四五六日])\s+(\d+)\s+(\d+)°\s+(\d+)°/g)]
  const days: ForecastDay[] = dm.slice(0, 4).map((m2) => ({
    label: m2[1], aqi: parseInt(m2[2]), hi: parseInt(m2[3]), lo: parseInt(m2[4]),
  }))
  const forecast = days.length ? `今 ${days[0].aqi}` + (days[1] ? ` · 明 ${days[1].aqi}` : '') : undefined
  return { id: 'iqair', name: 'IQAir', color: '#0ea5e9', aqi, dominant, pm25, forecast, days }
}

/** 聚合某城市的多源 AQI，返回平均值、逐源结果（含失败项）与统一每日预报 */
export async function aggregateAqi(
  cityName: string,
): Promise<{ avg: number | null; sources: AqiSource[]; forecast: ForecastDay[] }> {
  const tasks: Promise<AqiSource>[] = []
  if (AM_PATH[cityName]) tasks.push(fetchAirMattersAqi(AM_PATH[cityName]))
  if (IQAIR_PATH[cityName]) tasks.push(fetchIQAirAqi(IQAIR_PATH[cityName]))
  const settled = await Promise.allSettled(tasks)
  const sources: AqiSource[] = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { id: `aqi-err-${i}`, name: 'AQI', color: '#6e6e73', error: r.reason instanceof Error ? r.reason.message : String(r.reason) },
  )
  const vals = sources.filter((a) => a.aqi != null).map((a) => a.aqi!)
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null

  // 每日预报：优先 IQAir（标签+温度+AQI 齐全），否则在意空气
  const iqDays = sources.find((s) => s.id === 'iqair')?.days
  const amDays = sources.find((s) => s.id === 'airmatters')?.days
  const forecast = (iqDays?.length ? iqDays : amDays) ?? []
  for (const s of sources) delete s.days // 逐源不外传 days，保持 JSON 精简

  return { avg, sources, forecast }
}
