import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, fetchAllAqi, PROVIDERS } from './providers'
import type { AqiResult, GeoLocation, ProviderResult } from './providers/types'

const CITIES: GeoLocation[] = [
  {
    name: '番禺区', cityName: '番禺', lat: 22.9468, lon: 113.3622,
    weatherCnCode: '101280102',
    tencent: { province: '广东省', city: '广州市', county: '番禺区' },
    airMatters: { path: 'place/china/fanyudaxuecheng/3b401494' }, // 番禺大学城
    iqair: { path: 'cn/china/guangdong/guangzhou/panyu-university-town' }, // 番禺大学城
  },
  {
    name: '安福县', cityName: '安福', lat: 27.3954, lon: 114.6195,
    weatherCnCode: '101240612',
    tencent: { province: '江西省', city: '吉安市', county: '安福县' },
    airMatters: { path: 'place/china/anfuxianwenhuaguangchang/cd272b77' }, // 安福县文化广场
    iqair: { path: 'cn/china/jiangxi/jian/anfu-county-environmental-protection-bureau' }, // 安福县环保局
  },
]

interface Annotated extends ProviderResult {
  isMax?: boolean
  isMin?: boolean
}

export default function App() {
  const [cityIdx, setCityIdx] = useState(0)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [air, setAir] = useState<AqiResult[]>([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const loc = CITIES[cityIdx]
    try {
      const [weather, aqi] = await Promise.all([fetchAll(loc), fetchAllAqi(loc)])
      setResults(weather)
      setAir(aqi)
      setUpdatedAt(new Date())
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [cityIdx])

  useEffect(() => { refresh() }, [refresh])

  const selectCity = (i: number) => {
    if (i === cityIdx) return
    setResults([])
    setAir([])
    setUpdatedAt(null)
    setInitialLoad(true)
    setCityIdx(i)
  }

  const { annotated, stats } = useMemo(() => analyze(results), [results])
  const avgAqi = useMemo(() => {
    const vals = air.filter((a) => a.air).map((a) => a.air!.aqi)
    return vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null
  }, [air])
  const city = CITIES[cityIdx]
  const isEmpty = !loading && results.length === 0 && !initialLoad

  return (
    <div className="app">
      <header className="loc-header">
        <span className="city">{city.name}</span>
        {updatedAt && (
          <span className="updated">{updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        )}
        <button
          className="icon-btn switch"
          title="切换城市"
          onClick={() => selectCity((cityIdx + 1) % CITIES.length)}
          aria-label="切换城市"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
        <button
          className={'icon-btn' + (loading ? ' spin' : '')}
          title="刷新"
          onClick={refresh}
          aria-label="刷新"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </header>

      {stats && (
        <div className="summary" key={cityIdx}>
          {weatherEmoji(stats.text) && <div className="sum-icon">{weatherEmoji(stats.text)}</div>}
          <div className="big">{stats.avg.toFixed(1)}°</div>
          <div className="sum-right">
            <div className="meta">
              <div>最高 <b>{stats.max.toFixed(1)}°</b></div>
              <div>最低 <b>{stats.min.toFixed(1)}°</b></div>
            </div>
            {avgAqi != null && (
              <div className="aqi-pill" style={{ borderColor: aqiColor(avgAqi), background: aqiColor(avgAqi) + '22' }}>
                <span className="aqi-cat-big" style={{ color: aqiColor(avgAqi) }}>{aqiCategory(avgAqi)}</span>
                <span className="aqi-num" style={{ color: aqiColor(avgAqi) }}>{avgAqi}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {stats && stats.count >= 2 && <TempRanking results={annotated} key={`rank-${cityIdx}`} />}

      {loading && results.length === 0 ? (
        <div className="cards">
          {[1, 2, 3, 4].map((i) => (
            <div className="skeleton-card" key={i} style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : (
        <div className="cards" key={cityIdx}>
          {annotated.map((r) => (
            <ProviderCard key={r.providerId} r={r} />
          ))}
        </div>
      )}

      {air.length > 0 && <AqiSection air={air} key={`aqi-${cityIdx}`} />}

      {isEmpty && <div className="hint">暂无数据，点右上角刷新重试</div>}
    </div>
  )
}

// 美国 AQI 等级 → 颜色（US EPA）
function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#34c759'
  if (aqi <= 100) return '#ffd60a'
  if (aqi <= 150) return '#ff9f0a'
  if (aqi <= 200) return '#ff453a'
  if (aqi <= 300) return '#af52de'
  return '#a1304e'
}
// 美国 AQI 等级 → 中文
function aqiCategory(aqi: number): string {
  if (aqi <= 50) return '优'
  if (aqi <= 100) return '良'
  if (aqi <= 150) return '轻度污染'
  if (aqi <= 200) return '中度污染'
  if (aqi <= 300) return '重度污染'
  return '严重污染'
}

function AqiSection({ air }: { air: AqiResult[] }) {
  return (
    <div className="aqi-section">
      <div className="ranking-title">空气质量 · 美国 AQI</div>
      <div className="cards">
        {air.map((r) => {
          if (r.error || !r.air) {
            return (
              <div className="card err" key={r.providerId} style={{ borderLeftColor: 'rgba(120,120,128,0.4)' }}>
                <div className="head">
                  <span className="dot" style={{ background: r.color }} />
                  <span className="name">{r.providerName}</span>
                </div>
                <div className="err-msg">{r.error ?? '无数据'}</div>
              </div>
            )
          }
          const a = r.air
          const col = aqiColor(a.aqi)
          return (
            <div className="card" key={r.providerId} style={{ borderLeftColor: r.color }}>
              <div className="head">
                <span className="dot" style={{ background: r.color }} />
                <span className="name">{r.providerName}</span>
                <span className="aqi-cat" style={{ color: col }}>{aqiCategory(a.aqi)}</span>
                <span className="temp" style={{ color: col }}>{a.aqi}</span>
              </div>
              <div className="row">
                {a.dominant && <span>主要污染物 <b>{a.dominant}</b></span>}
                {a.pm25 != null && <span>PM2.5 <b>{a.pm25}</b> μg/m³</span>}
              </div>
              {a.forecast && <div className="aqi-fc">预报 <b>{a.forecast}</b></div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProviderCard({ r }: { r: Annotated }) {
  const meta = PROVIDERS.find((p) => p.id === r.providerId)
  const color = meta?.color ?? '#0a84ff'

  if (r.error) {
    return (
      <div className="card err" style={{ borderLeftColor: 'rgba(120,120,128,0.4)' }}>
        <div className="head">
          <span className="dot" style={{ background: color }} />
          <span className="name">{r.providerName}</span>
        </div>
        <div className="err-msg">{r.error}</div>
      </div>
    )
  }

  const c = r.current!
  const cls = ['card', r.isMax ? 'is-max' : '', r.isMin ? 'is-min' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} style={{ borderLeftColor: color }}>
      <div className="head">
        <span className="dot" style={{ background: color }} />
        <span className="name">{r.providerName}</span>
        {r.isMax && <span className="tag tag-hot">最高</span>}
        {r.isMin && <span className="tag tag-cold">最低</span>}
        <span className="temp">{c.temp.toFixed(1)}°</span>
      </div>
      <div className="row">
        <span>
          {weatherEmoji(c.text) && <span className="wx-emoji">{weatherEmoji(c.text)} </span>}
          <b>{c.text}</b>
        </span>
        {c.feelsLike != null && <span>体感 <b>{c.feelsLike.toFixed(1)}°</b></span>}
        {c.humidity != null && <span>湿度 <b>{Math.round(c.humidity)}%</b></span>}
        {c.windDir && (
          <span>{c.windDir}{c.windSpeed != null ? ` ${c.windSpeed.toFixed(1)}km/h` : ''}</span>
        )}
      </div>
      {c.observedAt && <div className="obs">观测 {formatTime(c.observedAt)}</div>}
      {c.forecast && isForecastCurrent(c.forecast, c.forecastIssuedAt) && (
        <div className="forecast">
          <b>番禺区气象台</b>
          {c.forecastIssuedAt ? ` · ${c.forecastIssuedAt}` : ''}：{c.forecast}
        </div>
      )}
    </div>
  )
}

function TempRanking({ results }: { results: Annotated[] }) {
  const ranked = results
    .filter((r) => r.current)
    .sort((a, b) => b.current!.temp - a.current!.temp)
  if (ranked.length < 2) return null
  const hi = ranked[0].current!.temp
  const lo = ranked[ranked.length - 1].current!.temp
  const span = hi - lo || 1
  return (
    <div className="ranking">
      <div className="ranking-title">温度排行</div>
      {ranked.map((r, i) => {
        const c = r.current!
        const color = PROVIDERS.find((p) => p.id === r.providerId)?.color ?? '#0a84ff'
        const pct = 14 + ((c.temp - lo) / span) * 86
        return (
          <div className="rank-row" key={r.providerId}>
            <span className="rank-no">{i + 1}</span>
            <span className="dot" style={{ background: color }} />
            <span className="rank-name">{r.providerName}</span>
            <span className="rank-bar">
              <span className="rank-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </span>
            <span className="rank-temp">{c.temp.toFixed(1)}°</span>
          </div>
        )
      })}
    </div>
  )
}

function analyze(results: ProviderResult[]): {
  annotated: Annotated[]
  stats: null | { avg: number; min: number; max: number; count: number; text: string }
} {
  const ok = results.filter((r) => r.current)
  // round to 1 decimal to avoid float comparison issues
  const temps = ok.map((r) => Math.round(r.current!.temp * 10) / 10)
  if (temps.length === 0) {
    return { annotated: results, stats: null }
  }

  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const avg = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length * 10) / 10

  // 取多数天气现象用于概览图标
  const textCounts = new Map<string, number>()
  for (const r of ok) textCounts.set(r.current!.text, (textCounts.get(r.current!.text) ?? 0) + 1)
  const majorityText = [...textCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const annotated: Annotated[] = results.map((r) => {
    if (!r.current) return r
    const t = Math.round(r.current.temp * 10) / 10
    return {
      ...r,
      isMax: temps.length > 1 && min !== max && t === max,
      isMin: temps.length > 1 && min !== max && t === min,
    }
  })

  return {
    annotated,
    stats: { avg, min, max, count: temps.length, text: majorityText },
  }
}

// 天气文字 → 彩色 emoji 图标（无可用文字时返回空串，不显示图标）。
function weatherEmoji(text?: string): string {
  if (!text || text === '—') return ''
  if (/雷/.test(text)) return '⛈️'
  if (/雪/.test(text)) return '🌨️'
  if (/雨/.test(text)) return '🌧️'
  if (/雾|霾|沙|尘/.test(text)) return '🌫️'
  if (/阴/.test(text)) return '☁️'
  if (/多云|间/.test(text)) return '⛅️'
  if (/晴/.test(text)) return '☀️'
  return ''
}

// 番禺区气象台短时预报时效检测：按"预报窗口结束时间"（北京时）判断是否过期。
// forecastIssuedAt 形如「2026年05月29日 17:00」，content 含「…今天17时到20时…」。
// 解析不出来时回退为"发布后 4 小时"。过期则不再展示该条预报。
function isForecastCurrent(content?: string, issued?: string): boolean {
  if (!issued) return true
  const m = issued.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/)
  if (!m) return true
  const Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5]
  // 发布时间为北京时间(UTC+8)，换算成 UTC 毫秒
  const issuedUTC = Date.UTC(Y, Mo - 1, D, H - 8, Mi)
  const now = Date.now()
  if (now < issuedUTC - 3600_000) return true // 时钟偏差保护：发布时间"在未来"则照常显示

  // 优先用内容里的窗口结束时间「到XX时」；结束小时 ≤ 发布小时视为次日
  let limitUTC: number
  const em = content?.match(/到\s*(\d{1,2})\s*时/)
  if (em) {
    const eh = +em[1]
    const dayOffset = eh <= H ? 1 : 0
    limitUTC = Date.UTC(Y, Mo - 1, D + dayOffset, eh - 8, 0)
  } else {
    limitUTC = issuedUTC + 4 * 3600_000
  }
  return now <= limitUTC + 30 * 60_000 // 给 30 分钟宽限
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
