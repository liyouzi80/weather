import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, PROVIDERS } from './providers'
import type { GeoLocation, ProviderResult } from './providers/types'
import { searchCity } from './geocode'
import { SearchSheet } from './components/SearchSheet'
import { SettingsSheet } from './components/SettingsSheet'

const LS_LOC = 'weather_last_loc'
const DEFAULT_LOC: GeoLocation = { name: '广东 广州', cityName: '广州', lat: 23.13, lon: 113.26 }

function loadLoc(): GeoLocation {
  try {
    const raw = localStorage.getItem(LS_LOC)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return DEFAULT_LOC
}

export default function App() {
  const [loc, setLoc] = useState<GeoLocation>(loadLoc)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const refresh = useCallback(async (target: GeoLocation) => {
    setLoading(true)
    try {
      const r = await fetchAll(target)
      setResults(r)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh(loc)
  }, [loc, refresh])

  const pickLocation = (l: GeoLocation) => {
    localStorage.setItem(LS_LOC, JSON.stringify(l))
    setLoc(l)
    setShowSearch(false)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return alert('当前浏览器不支持定位')
    navigator.geolocation.getCurrentPosition(
      (pos) => pickLocation({
        name: '我的位置',
        lat: Number(pos.coords.latitude.toFixed(4)),
        lon: Number(pos.coords.longitude.toFixed(4)),
      }),
      (e) => alert('定位失败：' + e.message),
    )
  }

  // 概览：成功信源的温度范围与均值
  const summary = useMemo(() => {
    const temps = results.filter((r) => r.current).map((r) => r.current!.temp)
    if (temps.length === 0) return null
    const min = Math.min(...temps)
    const max = Math.max(...temps)
    const avg = temps.reduce((a, b) => a + b, 0) / temps.length
    return { min, max, avg, count: temps.length, total: results.length }
  }, [results])

  return (
    <div className="app">
      <div className="topbar">
        <h1>天气多信源对比</h1>
        <button className="icon-btn" title="刷新" onClick={() => refresh(loc)}>↻</button>
        <button className="icon-btn" title="搜索城市" onClick={() => setShowSearch(true)}>🔍</button>
        <button className="icon-btn" title="设置密钥" onClick={() => setShowSettings(true)}>⚙</button>
      </div>

      <div className="location-bar">
        <span className="city">{loc.name}</span>
        <span className="coords">{loc.lat}, {loc.lon}</span>
      </div>

      {summary && (
        <div className="summary">
          <div className="big">{summary.avg.toFixed(1)}°</div>
          <div className="meta">
            <div>{summary.count}/{summary.total} 个信源有数据</div>
            <div>区间 <b>{summary.min}°</b> ~ <b>{summary.max}°</b>，温差 <b>{(summary.max - summary.min).toFixed(1)}°</b></div>
          </div>
        </div>
      )}

      {loading && results.length === 0 ? (
        <div className="spinner" />
      ) : (
        <div className="cards">
          {results.map((r) => <ProviderCard key={r.providerId} r={r} />)}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="hint">暂无数据，试试点右上角搜索城市或在设置里填写信源密钥。</div>
      )}

      {showSearch && (
        <SearchSheet
          onSearch={searchCity}
          onPick={pickLocation}
          onLocate={useMyLocation}
          onClose={() => setShowSearch(false)}
        />
      )}
      {showSettings && (
        <SettingsSheet onClose={() => { setShowSettings(false); refresh(loc) }} />
      )}
    </div>
  )
}

function ProviderCard({ r }: { r: ProviderResult }) {
  const meta = PROVIDERS.find((p) => p.id === r.providerId)
  const color = meta?.color ?? '#3b82f6'
  if (r.error) {
    return (
      <div className="card err" style={{ borderLeftColor: '#64748b' }}>
        <div className="head">
          <span className="dot" style={{ background: color }} />
          <span className="name">{r.providerName}</span>
        </div>
        <div className="err-msg">⚠ {r.error}</div>
      </div>
    )
  }
  const c = r.current!
  return (
    <div className="card" style={{ borderLeftColor: color }}>
      <div className="head">
        <span className="dot" style={{ background: color }} />
        <span className="name">{r.providerName}</span>
        <span className="temp">{c.temp}°</span>
      </div>
      <div className="row">
        <span><b>{c.text}</b></span>
        {c.feelsLike != null && <span>体感 <b>{c.feelsLike}°</b></span>}
        {c.humidity != null && <span>湿度 <b>{c.humidity}%</b></span>}
        {c.windDir && <span>{c.windDir}{c.windSpeed != null ? ` ${c.windSpeed}km/h` : ''}</span>}
      </div>
      {c.observedAt && <div className="obs">观测 {formatTime(c.observedAt)}</div>}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
