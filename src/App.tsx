import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, PROVIDERS } from './providers'
import type { GeoLocation, ProviderResult } from './providers/types'

// 仅覆盖两个城市：广州番禺区、江西安福县。
const CITIES: GeoLocation[] = [
  { name: '番禺区', cityName: '番禺', lat: 22.9468, lon: 113.3622 },
  { name: '安福县', cityName: '安福', lat: 27.3954, lon: 114.6195 },
]

interface Annotated extends ProviderResult {
  isMax?: boolean
  isMin?: boolean
  delta?: number // 相对中位数的温差
  textDiff?: boolean // 天气描述与多数信源不一致
}

export default function App() {
  const [cityIdx, setCityIdx] = useState(0)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setResults(await fetchAll(CITIES[cityIdx]))
      setUpdatedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [cityIdx])

  useEffect(() => { refresh() }, [refresh])

  const selectCity = (i: number) => {
    if (i === cityIdx) return
    setResults([])
    setUpdatedAt(null)
    setCityIdx(i)
  }

  // 统计 + 差异标注
  const { annotated, stats } = useMemo(() => analyze(results), [results])
  const city = CITIES[cityIdx]

  return (
    <div className="app">
      <div className="topbar">
        <h1>多信源实况</h1>
        <button className={'icon-btn' + (loading ? ' spin' : '')} title="刷新" onClick={refresh}>↻</button>
      </div>

      <div className="segmented" role="tablist">
        {CITIES.map((c, i) => (
          <button
            key={c.name}
            role="tab"
            aria-selected={i === cityIdx}
            className={i === cityIdx ? 'active' : ''}
            onClick={() => selectCity(i)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="location-bar">
        <span className="city">{city.name}</span>
        {updatedAt && <span className="coords">更新于 {updatedAt.toLocaleTimeString('zh-CN')}</span>}
      </div>

      {stats && (
        <div className="summary">
          <div className="big">{stats.avg.toFixed(1)}°</div>
          <div className="meta">
            <div>{stats.count}/{stats.total} 个信源有数据</div>
            <div>
              区间 <b>{stats.min}°</b> ~ <b>{stats.max}°</b>
              {stats.spread > 0 && <> · 最大分歧 <b className={stats.spread >= 2 ? 'warn-text' : ''}>{stats.spread.toFixed(1)}°</b></>}
            </div>
            {stats.textDisagree && <div className="warn-text">⚠ 各信源天气现象描述不一致</div>}
          </div>
        </div>
      )}

      {stats && stats.count >= 2 && <TempRanking results={annotated} avg={stats.avg} />}

      {loading && results.length === 0 ? (
        <div className="spinner" />
      ) : (
        <div className="cards">
          {annotated.map((r) => <ProviderCard key={r.providerId} r={r} />)}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="hint">暂无数据，点右上角 ↻ 重试。</div>
      )}
    </div>
  )
}

function ProviderCard({ r }: { r: Annotated }) {
  const meta = PROVIDERS.find((p) => p.id === r.providerId)
  const color = meta?.color ?? '#0a84ff'

  if (r.error) {
    return (
      <div className="card err">
        <div className="head">
          <span className="dot" style={{ background: color }} />
          <span className="name">{r.providerName}</span>
        </div>
        <div className="err-msg">⚠ {r.error}</div>
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
        {r.delta != null && Math.abs(r.delta) >= 0.05 && (
          <span className={'delta ' + (r.delta > 0 ? 'delta-hot' : 'delta-cold')}>
            {r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)}°
          </span>
        )}
        <span className="temp">{c.temp}°</span>
      </div>
      <div className="row">
        <span className={r.textDiff ? 'text-diff' : ''}><b>{c.text}</b>{r.textDiff && ' ⚠'}</span>
        {c.feelsLike != null && <span>体感 <b>{c.feelsLike}°</b></span>}
        {c.humidity != null && <span>湿度 <b>{c.humidity}%</b></span>}
        {c.windDir && <span>{c.windDir}{c.windSpeed != null ? ` ${c.windSpeed}km/h` : ''}</span>}
      </div>
      {c.observedAt && <div className="obs">观测 {formatTime(c.observedAt)}</div>}
      {c.forecast && (
        <div className="forecast">
          <b>番禺区气象台</b>
          {c.forecastIssuedAt ? ` · ${c.forecastIssuedAt}` : ''}：{c.forecast}
        </div>
      )}
    </div>
  )
}

function TempRanking({ results, avg }: { results: Annotated[]; avg: number }) {
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
        const diff = c.temp - avg
        const pct = 14 + ((c.temp - lo) / span) * 86
        return (
          <div className="rank-row" key={r.providerId}>
            <span className="rank-no">{i + 1}</span>
            <span className="dot" style={{ background: color }} />
            <span className="rank-name">{r.providerName}</span>
            <span className="rank-bar">
              <span className="rank-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </span>
            <span className="rank-temp">{c.temp}°</span>
            <span className={'rank-diff ' + (diff > 0.05 ? 'delta-hot' : diff < -0.05 ? 'delta-cold' : '')}>
              {diff > 0 ? '+' : ''}{diff.toFixed(1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function analyze(results: ProviderResult[]): {
  annotated: Annotated[]
  stats: null | { avg: number; min: number; max: number; spread: number; count: number; total: number; textDisagree: boolean }
} {
  const ok = results.filter((r) => r.current)
  const temps = ok.map((r) => r.current!.temp)
  if (temps.length === 0) {
    return { annotated: results, stats: null }
  }

  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length
  const median = sortedMedian(temps)

  // 天气现象多数投票
  const textCounts = new Map<string, number>()
  for (const r of ok) textCounts.set(r.current!.text, (textCounts.get(r.current!.text) ?? 0) + 1)
  const majorityText = [...textCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const textDisagree = textCounts.size > 1

  const annotated: Annotated[] = results.map((r) => {
    if (!r.current) return r
    const t = r.current.temp
    return {
      ...r,
      delta: t - median,
      isMax: temps.length > 1 && min !== max && t === max,
      isMin: temps.length > 1 && min !== max && t === min,
      textDiff: textDisagree && r.current.text !== majorityText,
    }
  })

  return {
    annotated,
    stats: { avg, min, max, spread: max - min, count: temps.length, total: results.length, textDisagree },
  }
}

function sortedMedian(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
