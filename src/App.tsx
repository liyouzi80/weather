import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, PROVIDERS } from './providers'
import type { GeoLocation, ProviderResult } from './providers/types'
import { SettingsSheet } from './components/SettingsSheet'

// 固定位置：广州市番禺区（市桥）
const PANYU: GeoLocation = { name: '广州 番禺区', cityName: '番禺', lat: 22.9468, lon: 113.3622 }

interface Annotated extends ProviderResult {
  isMax?: boolean
  isMin?: boolean
  delta?: number // 相对中位数的温差
  textDiff?: boolean // 天气描述与多数信源不一致
}

export default function App() {
  const [results, setResults] = useState<ProviderResult[]>([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setResults(await fetchAll(PANYU))
      setUpdatedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 统计 + 差异标注
  const { annotated, stats } = useMemo(() => analyze(results), [results])

  return (
    <div className="app">
      <div className="topbar">
        <h1>番禺 · 多信源实况</h1>
        <button className="icon-btn" title="刷新" onClick={refresh}>↻</button>
        <button className="icon-btn" title="设置密钥" onClick={() => setShowSettings(true)}>⚙</button>
      </div>

      <div className="location-bar">
        <span className="city">{PANYU.name}</span>
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

      {loading && results.length === 0 ? (
        <div className="spinner" />
      ) : (
        <div className="cards">
          {annotated.map((r) => <ProviderCard key={r.providerId} r={r} />)}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="hint">暂无数据，点右上角 ↻ 重试，或在 ⚙ 设置里填写信源密钥。</div>
      )}

      {showSettings && (
        <SettingsSheet onClose={() => { setShowSettings(false); refresh() }} />
      )}
    </div>
  )
}

function ProviderCard({ r }: { r: Annotated }) {
  const meta = PROVIDERS.find((p) => p.id === r.providerId)
  const color = meta?.color ?? '#3b82f6'

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
