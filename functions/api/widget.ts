// /api/widget — 多信源天气实况对比 API（供 Scriptable widget 使用）
//
// 在 Cloudflare Function 中直接请求各天气信源（无需 CORS 代理），
// 并发拉取后返回归一化的温度对比数据。
//
// Query params:
//   lat, lon — 经纬度
//   name     — 城市展示名
//   cityName — 纯城市名（供 NMC 站点检索，如「番禺」→「广州」）
import { aggregateAqi } from '../_lib/aqi'

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

  // 美国 AQI（与天气并发）
  const aqiPromise = aggregateAqi(cityName)

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

  // 汇总 AQI（_lib/aqi.ts 已聚合）
  const aqi = await aqiPromise

  const result = {
    city: name,
    avg,
    median,
    max,
    min,
    aqi,
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
