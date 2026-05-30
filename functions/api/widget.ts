// /api/widget — 多信源天气实况对比 API（供 Scriptable widget 使用）
//
// 在 Cloudflare Function 中直接请求各天气信源（无需 CORS 代理），
// 并发拉取后返回归一化的温度对比数据。
//
// Query params:
//   lat, lon — 经纬度
//   name     — 城市展示名
//   cityName — 纯城市名（供 NMC 站点检索，如「番禺」→「广州」）

interface ProviderResult {
  id: string
  name: string
  color: string
  temp?: number
  text?: string
  error?: string
  forecast?: string
  forecastIssuedAt?: string
}

// ── 中央气象台 NMC（免费，无需密钥）────────────────────────────
async function fetchNMC(cityName: string): Promise<ProviderResult> {
  const keyword = cityName.replace(/市$|区$|县$/g, '')
  // 1) 检索站点编码
  const stRes = await fetch(`http://www.nmc.cn/essearch/api/autocomplete?q=${encodeURIComponent(keyword)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WeatherWidget/1.0)' },
  })
  if (!stRes.ok) throw new Error(`站点检索 HTTP ${stRes.status}`)
  const stJson: any = await stRes.json()
  const rows: string[] = Array.isArray(stJson?.data) ? stJson.data : []
  if (rows.length === 0) throw new Error(`未找到「${keyword}」气象站`)
  const stationId = rows[0].split('|')[0]
  if (!stationId) throw new Error('站点编码解析失败')

  // 2) 拉取实况
  const wRes = await fetch(`http://www.nmc.cn/rest/weather?stationid=${stationId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WeatherWidget/1.0)' },
  })
  if (!wRes.ok) throw new Error(`实况 HTTP ${wRes.status}`)
  const data: any = await wRes.json()
  const w = data?.data?.real?.weather
  if (!w) throw new Error('无实况数据')

  const clean = (v: number) => (v === 9999 || v == null ? undefined : v)
  return {
    id: 'nmc', name: '中央气象台', color: '#ef4444',
    temp: w.temperature, text: w.info,
  }
}

const WIDGET_UA = 'Mozilla/5.0 (compatible; WeatherWidget/1.0)'

// ── 中国天气网（免费，无需密钥）────────────────────────────────
const CN_CODE: Record<string, string> = { 番禺: '101280102', 安福: '101240612' }
async function fetchWeatherCN(code: string): Promise<ProviderResult> {
  const res = await fetch(`http://d1.weather.com.cn/sk_2d/${code}.html?_=${Date.now()}`, {
    headers: { 'User-Agent': WIDGET_UA, Referer: 'http://www.weather.com.cn/' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const m = (await res.text()).match(/\{[\s\S]*\}/)
  if (!m) throw new Error('解析失败')
  const d: any = JSON.parse(m[0])
  const temp = parseFloat(d.temp)
  if (isNaN(temp)) throw new Error('无温度')
  return { id: 'weathercn', name: '中国天气网', color: '#14b8a6', temp, text: d.weather }
}

// ── 腾讯天气（免费，无需密钥）──────────────────────────────────
const TENCENT_LOC: Record<string, { province: string; city: string; county: string }> = {
  番禺: { province: '广东省', city: '广州市', county: '番禺区' },
  安福: { province: '江西省', city: '吉安市', county: '安福县' },
}
async function fetchTencent(loc: { province: string; city: string; county: string }): Promise<ProviderResult> {
  const p = new URLSearchParams({ source: 'pc', weather_type: 'observe', ...loc })
  const res = await fetch(`https://wis.qq.com/weather/common?${p.toString()}`, { headers: { 'User-Agent': WIDGET_UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j: any = await res.json()
  const o = j?.data?.observe
  if (!o || o.degree == null) throw new Error('无实况')
  const temp = parseFloat(o.degree)
  if (isNaN(temp)) throw new Error('无温度')
  return { id: 'tencent', name: '腾讯天气', color: '#0ea5e9', temp, text: o.weather }
}

// ── 广州市气象局·番禺（免费，仅番禺）────────────────────────────
// 复用 functions/_lib/gz.ts 的抓取逻辑
import { scrapeGuangzhou } from '../_lib/gz'

async function fetchGZQX(): Promise<ProviderResult> {
  const d = await scrapeGuangzhou()
  return {
    id: 'gzqx', name: '番禺气象台', color: '#a855f7',
    temp: d.temp, text: d.text,
    forecast: d.forecast,
    forecastIssuedAt: d.forecastIssuedAt,
  }
}

// ── 和风天气 QWeather（需密钥）─────────────────────────────────
async function fetchQWeather(lat: number, lon: number, key: string): Promise<ProviderResult> {
  const url = `https://devapi.qweather.com/v7/weather/now?location=${lon.toFixed(2)},${lat.toFixed(2)}&key=${key}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: any = await res.json()
  if (data.code !== '200') throw new Error(`code=${data.code}`)
  return {
    id: 'qweather', name: '和风天气', color: '#3b82f6',
    temp: Number(data.now.temp), text: data.now.text,
  }
}

// ── 彩云天气 Caiyun（需密钥）───────────────────────────────────
async function fetchCaiyun(lat: number, lon: number, token: string): Promise<ProviderResult> {
  const url = `https://api.caiyunapp.com/v2.6/${token}/${lon.toFixed(4)},${lat.toFixed(4)}/realtime`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: any = await res.json()
  if (data.status !== 'ok') throw new Error(`status=${data.status}`)
  const r = data.result.realtime
  const text = CAIYUN_TEXT[r.skycon] ?? r.skycon
  return {
    id: 'caiyun', name: '彩云天气', color: '#f59e0b',
    temp: r.temperature, text,
  }
}

// ── OpenWeatherMap（需密钥）─────────────────────────────────────
async function fetchOWM(lat: number, lon: number, key: string): Promise<ProviderResult> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=zh_cn&appid=${key}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d: any = await res.json()
  return {
    id: 'owm', name: 'OpenWeatherMap', color: '#f97316',
    temp: Math.round(d.main.temp * 10) / 10,
    text: d.weather?.[0]?.description ?? '—',
  }
}

const CAIYUN_TEXT: Record<string, string> = {
  CLEAR_DAY: '晴', CLEAR_NIGHT: '晴',
  PARTLY_CLOUDY_DAY: '多云', PARTLY_CLOUDY_NIGHT: '多云',
  CLOUDY: '阴', LIGHT_RAIN: '小雨', MODERATE_RAIN: '中雨',
  HEAVY_RAIN: '大雨', STORM_RAIN: '暴雨', FOG: '雾',
  LIGHT_SNOW: '小雪', MODERATE_SNOW: '中雪', HEAVY_SNOW: '大雪',
  STORM_SNOW: '暴雪', WIND: '大风', DUST: '浮尘', SAND: '沙尘',
  LIGHT_HAZE: '轻度雾霾', MODERATE_HAZE: '中度雾霾', HEAVY_HAZE: '重度雾霾',
}

// ── 美国 AQI 信源（服务端直抓站点页，无需密钥）──────────────────
const AM_PATH: Record<string, string> = {
  番禺: 'place/china/fanyudaxuecheng/3b401494',
  安福: 'place/china/anfuxianwenhuaguangchang/cd272b77',
}
const IQAIR_PATH: Record<string, string> = {
  番禺: 'cn/china/guangdong/guangzhou/panyu-university-town',
  安福: 'cn/china/jiangxi/jian/anfu-county-environmental-protection-bureau',
}
const POL: Record<string, string> = { O3: 'O₃', 'PM2.5': 'PM2.5', PM10: 'PM10', NO2: 'NO₂', SO2: 'SO₂', CO: 'CO' }
const AM_CATS = '优|良好|良|中等|轻度污染|中度污染|重度污染|严重污染|对敏感人群不健康|不健康|非常不健康|危险|危害'

interface AqiSource {
  id: string
  name: string
  color: string
  aqi?: number
  dominant?: string
  forecast?: string
  error?: string
}

// 在意空气（air-quality.com）
async function fetchAirMattersAqi(path: string): Promise<AqiSource> {
  const res = await fetch(`https://air-quality.com/${path}?lang=zh-Hans&standard=aqi_us`, {
    headers: { 'User-Agent': WIDGET_UA, Referer: 'https://air-quality.com/' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const m = html.match(/AQI \(美国标准\)\s*(\d+)/)
  if (!m) throw new Error('解析失败')
  const items = [
    ...html.matchAll(
      /<div class='name'>([^<]+)<\/div><div class='unit'>[^<]*<\/div><div class='value'>([\d.]+)<\/div><div class='ratio-bar' style='[^']*\*([\d.]+)\)/g,
    ),
  ].map((x) => ({ name: x[1], ratio: parseFloat(x[3]) }))
  const dom = items.length ? items.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined
  const s = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const days = [
    ...s.matchAll(new RegExp(`\\d{4}-\\d{2}-\\d{2}[^0-9]*?\\d+°[^0-9]*?\\d+°[^0-9]*?\\d+°[^~]*?(\\d+)~(\\d+)\\s*(?:${AM_CATS})`, 'g')),
  ]
  const forecast = days.length
    ? `今 ${days[0][1]}~${days[0][2]}` + (days[1] ? ` · 明 ${days[1][1]}~${days[1][2]}` : '')
    : undefined
  return {
    id: 'airmatters', name: '在意空气', color: '#f59e0b',
    aqi: parseInt(m[1]), dominant: dom ? POL[dom.name] ?? dom.name : undefined, forecast,
  }
}

// IQAir（iqair.cn）
async function fetchIQAirAqi(path: string): Promise<AqiSource> {
  const res = await fetch(`https://www.iqair.cn/${path}`, { headers: { 'User-Agent': WIDGET_UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const s = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const cat = '优秀|优|良好|良|中等|对敏感人群不健康|不健康|非常不健康|危险|危害'
  const m = s.match(new RegExp(`(\\d+)\\s*美国 AQI⁺?\\s*(?:${cat})\\s*主要污染物[：:]\\s*(\\S+)\\s*[\\d.]+\\s*µg`))
  let aqi: number
  let dominant: string | undefined
  if (m) {
    aqi = parseInt(m[1])
    dominant = m[2]
  } else {
    const l = s.match(/(\d+)\s*美国 AQI/)
    if (!l) throw new Error('解析失败')
    aqi = parseInt(l[1])
  }
  const fi = s.indexOf('每日预报')
  const seg = fi >= 0 ? s.slice(fi, fi + 280) : ''
  const days = [...seg.matchAll(/(?:今天|明天|周[一二三四五六日])\s+(\d+)\s+\d+°/g)]
  const forecast = days.length ? `今 ${days[0][1]}` + (days[1] ? ` · 明 ${days[1][1]}` : '') : undefined
  return { id: 'iqair', name: 'IQAir', color: '#0ea5e9', aqi, dominant, forecast }
}

// ── Handler ─────────────────────────────────────────────────────
export const onRequest = async (context: { request: Request; env: Record<string, string> }): Promise<Response> => {
  const url = new URL(context.request.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '22.9468')
  const lon = parseFloat(url.searchParams.get('lon') ?? '113.3622')
  const name = url.searchParams.get('name') ?? '番禺'
  const cityName = url.searchParams.get('cityName') ?? '番禺'
  const env = context.env ?? {}

  const isPanyu = cityName === '番禺'

  // 收集所有可用的请求
  const tasks: Promise<ProviderResult>[] = [
    fetchNMC(cityName),
    isPanyu ? fetchGZQX() : null,
    CN_CODE[cityName] ? fetchWeatherCN(CN_CODE[cityName]) : null,
    TENCENT_LOC[cityName] ? fetchTencent(TENCENT_LOC[cityName]) : null,
    env.VITE_QWEATHER_KEY || env.QWEATHER_KEY ? fetchQWeather(lat, lon, env.VITE_QWEATHER_KEY || env.QWEATHER_KEY) : null,
    env.VITE_CAIYUN_KEY || env.CAIYUN_KEY ? fetchCaiyun(lat, lon, env.VITE_CAIYUN_KEY || env.CAIYUN_KEY) : null,
    env.VITE_OWM_KEY || env.OWM_KEY ? fetchOWM(lat, lon, env.VITE_OWM_KEY || env.OWM_KEY) : null,
  ].filter(Boolean) as Promise<ProviderResult>[]

  // 美国 AQI 信源（与天气并发）
  const aqiTasks: Promise<AqiSource>[] = [
    AM_PATH[cityName] ? fetchAirMattersAqi(AM_PATH[cityName]) : null,
    IQAIR_PATH[cityName] ? fetchIQAirAqi(IQAIR_PATH[cityName]) : null,
  ].filter(Boolean) as Promise<AqiSource>[]
  const aqiPromise = Promise.allSettled(aqiTasks)

  const settled = await Promise.allSettled(tasks)
  const providers: ProviderResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value
    return {
      id: `err-${i}`,
      name: `信源${i + 1}`,
      color: '#6e6e73',
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    }
  })

  // 按温度降序排列
  providers.sort((a, b) => (b.temp ?? -Infinity) - (a.temp ?? -Infinity))

  const ok = providers.filter(p => p.temp != null)
  const temps = ok.map(p => p.temp!)
  const median = temps.length > 0 ? sortedMedian(temps) : null
  const avg = temps.length > 0 ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null
  const max = temps.length > 0 ? Math.max(...temps) : null
  const min = temps.length > 0 ? Math.min(...temps) : null

  // 多数天气描述
  const textCounts = new Map<string, number>()
  ok.forEach(p => { if (p.text) textCounts.set(p.text, (textCounts.get(p.text) ?? 0) + 1) })
  const majorityText = [...textCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // 汇总 AQI
  const aqiSettled = await aqiPromise
  const aqiSources: AqiSource[] = aqiSettled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { id: `aqi-err-${i}`, name: 'AQI', color: '#6e6e73', error: s.reason instanceof Error ? s.reason.message : String(s.reason) },
  )
  const aqiVals = aqiSources.filter((a) => a.aqi != null).map((a) => a.aqi!)
  const aqiAvg = aqiVals.length ? Math.round(aqiVals.reduce((a, b) => a + b, 0) / aqiVals.length) : null

  const result = {
    city: name,
    avg,
    median,
    max,
    min,
    aqi: { avg: aqiAvg, sources: aqiSources },
    count: ok.length,
    total: providers.length,
    text: majorityText,
    providers,
    updatedAt: new Date().toISOString(),
  }

  return new Response(JSON.stringify(result), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  })
}

function sortedMedian(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
