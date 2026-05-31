import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAll, fetchAllAqi, PROVIDERS } from './providers'
import type { AqiResult, GeoLocation, ProviderResult, WeatherWarning } from './providers/types'
import { WeatherIcon } from './WeatherIcon'
import { WeatherFX, fxKind, type FxKind } from './WeatherFX'

const CITIES: GeoLocation[] = [
  {
    name: '番禺区', cityName: '番禺', lat: 22.9468, lon: 113.3622,
    weatherCnCode: '101280102',
    tencent: { province: '广东省', city: '广州市', county: '番禺区' },
  },
  {
    name: '安福县', cityName: '安福', lat: 27.3954, lon: 114.6195,
    weatherCnCode: '101240612',
    tencent: { province: '江西省', city: '吉安市', county: '安福县' },
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
  // Tracks the latest refresh call; stale responses (from city switches or rapid re-taps) are discarded
  const refreshIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++refreshIdRef.current
    setLoading(true)
    const loc = CITIES[cityIdx]
    try {
      const [weather, aqi] = await Promise.all([fetchAll(loc), fetchAllAqi(loc)])
      if (id !== refreshIdRef.current) return
      setResults(weather)
      setAir(aqi.sources)
      setUpdatedAt(new Date())
    } finally {
      if (id === refreshIdRef.current) {
        setLoading(false)
        setInitialLoad(false)
      }
    }
  }, [cityIdx])

  useEffect(() => { refresh() }, [refresh])

  const selectCity = useCallback((i: number) => {
    if (i === cityIdx) return
    setResults([])
    setAir([])
    setUpdatedAt(null)
    setInitialLoad(true)
    setCityIdx(i)
  }, [cityIdx])

  // 手势（移动端）：下拉刷新 + 左右滑动切城市。
  // 用非被动原生监听，统一在一处判定主轴，避免纵向下拉与横向翻页冲突。
  const [pull, setPull] = useState(0)
  const [swipeX, setSwipeX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pullRef = useRef(0)
  const swipeXRef = useRef(0)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const gesture = useRef<'pull' | 'swipe' | 'ignore' | null>(null)
  const atTop = useRef(false)
  const appRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(loading)
  const refreshRef = useRef(refresh)
  const selectCityRef = useRef(selectCity)
  const cityIdxRef = useRef(cityIdx)
  const PULL_MAX = 90
  const PULL_TRIGGER = 64
  const SWIPE_TRIGGER = 45
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  useEffect(() => { selectCityRef.current = selectCity }, [selectCity])
  useEffect(() => { cityIdxRef.current = cityIdx }, [cityIdx])
  useEffect(() => {
    const el = appRef.current
    if (!el) return
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      startX.current = t.clientX
      startY.current = t.clientY
      gesture.current = null
      atTop.current = window.scrollY <= 0 && !loadingRef.current
    }
    const onMove = (e: TouchEvent) => {
      if (startX.current == null || startY.current == null) return
      const t = e.touches[0]
      const dx = t.clientX - startX.current
      const dy = t.clientY - startY.current
      // 首次超过阈值时判定主轴：横向→翻页，顶部下拉→刷新，其余→交给原生滚动
      if (gesture.current == null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (Math.abs(dx) > Math.abs(dy)) gesture.current = 'swipe'
        else if (dy > 0 && atTop.current) gesture.current = 'pull'
        else gesture.current = 'ignore'
      }
      if (gesture.current === 'swipe') {
        e.preventDefault()
        const clamped = Math.max(-70, Math.min(70, dx * 0.4))
        swipeXRef.current = clamped
        setSwipeX(clamped)
        setDragging(true)
      } else if (gesture.current === 'pull') {
        if (dy > 0) {
          e.preventDefault()
          const p = Math.min(dy * 0.5, PULL_MAX)
          pullRef.current = p
          setPull(p)
        } else {
          e.preventDefault()
          pullRef.current = 0
          setPull(0)
        }
      }
    }
    const onEnd = () => {
      if (gesture.current === 'swipe') {
        const dx = swipeXRef.current
        setDragging(false)
        if (Math.abs(dx) >= SWIPE_TRIGGER) {
          const len = CITIES.length
          const target = (cityIdxRef.current + (dx < 0 ? 1 : -1) + len) % len
          selectCityRef.current(target)
        }
        swipeXRef.current = 0
        setSwipeX(0)
      } else if (gesture.current === 'pull') {
        if (pullRef.current >= PULL_TRIGGER) refreshRef.current()
        pullRef.current = 0
        setPull(0)
      }
      startX.current = null
      startY.current = null
      gesture.current = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  // 自动刷新：切回前台且数据已超过 5 分钟时刷新；另每 10 分钟（仅前台）刷新一次
  const lastUpdateRef = useRef(0)
  useEffect(() => { if (updatedAt) lastUpdateRef.current = updatedAt.getTime() }, [updatedAt])
  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000
    const onVis = () => {
      if (document.visibilityState === 'visible' && !loadingRef.current &&
          Date.now() - lastUpdateRef.current > STALE_MS) {
        refreshRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !loadingRef.current) refreshRef.current()
    }, 10 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(timer)
    }
  }, [])

  // 滚动时头部切换为吸顶毛玻璃态
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const { annotated, stats } = useMemo(() => analyze(results), [results])
  const avgAqi = useMemo(() => {
    const vals = air.filter((a) => a.air).map((a) => a.air!.aqi)
    return vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null
  }, [air])
  // 番禺区气象台短时预报（仅当前有效时展示）
  const panyuForecast = useMemo(() => {
    const f = results.find((r) => r.current?.forecast)?.current
    if (!f?.forecast || !isForecastCurrent(f.forecast, f.forecastIssuedAt)) return null
    return { text: f.forecast, issuedAt: f.forecastIssuedAt }
  }, [results])
  // 气象台预警信号（当前生效的，置顶展示）
  const warnings = useMemo(
    () => results.find((r) => r.current?.warnings?.length)?.current?.warnings ?? [],
    [results],
  )
  const city = CITIES[cityIdx]
  const isEmpty = !loading && results.length === 0 && !initialLoad
  const activeCount = useMemo(
    () => PROVIDERS.filter((p) => p.isConfigured() && (p.appliesTo?.(city) ?? true)).length,
    [city],
  )

  // 昼夜判断：统一按北京时（番禺/安福均在 UTC+8），不随设备时区
  const night = useMemo(() => {
    const h = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours()
    return h < 6 || h >= 19
  }, [updatedAt])
  // 动态天气背景：随「多数天气现象 + 昼夜」切换根节点 data-sky，
  // 同时把状态栏配色（theme-color）调成对应天空色，PWA 更沉浸
  useEffect(() => {
    const sky = skyKey(stats?.text, night)
    document.documentElement.dataset.sky = sky
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SKY_THEME[sky] ?? '#0b1426')
  }, [stats, night])
  // 实时天气动效类型（全屏背景层）
  const fx: FxKind = useMemo(() => fxKind(stats?.text, night), [stats, night])

  return (
    <div className="app" ref={appRef}>
      <WeatherFX kind={fx} />
      <div
        className="pull-indicator"
        style={{
          height: pull,
          opacity: pull > 6 ? 1 : 0,
        }}
      >
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={loading ? 'spin' : ''}
          style={{ transform: `rotate(${loading ? 0 : Math.min(pull / PULL_TRIGGER, 1) * 270}deg)`, opacity: 0.85 }}
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </div>
      <header className={'loc-header' + (scrolled ? ' scrolled' : '')}>
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
        <div className="loc-center">
          <span className="city">{city.name}</span>
          {updatedAt && (
            <span className="updated">{updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
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

      {/* 左右滑动切城市：整块内容随手指平移，松手回弹 */}
      <div
        className={'swipe-wrap' + (dragging ? ' dragging' : '')}
        style={swipeX ? { transform: `translateX(${swipeX}px)` } : undefined}
      >
      {/* 城市切换时 key 变化，触发 pageIn 淡入动画 */}
      <div className="app-content" key={cityIdx}>
        {warnings.length > 0 && (
          <div className="warn-list">
            {warnings.map((w, i) => (
              <WarningCard w={w} key={i} />
            ))}
          </div>
        )}

        {stats ? (
          <div className="hero">
            <div className="hero-temp">{stats.avg.toFixed(1)}°</div>
            <div className="hero-cond">{stats.text}</div>
            <div className="hero-hilo">
              <span>最高 <b>{stats.max.toFixed(1)}°</b></span>
              <span>最低 <b>{stats.min.toFixed(1)}°</b></span>
            </div>
          </div>
        ) : (
          <div className="hero hero-skeleton">
            <div className="hskel hskel-temp" />
            <div className="hskel hskel-cond" />
            <div className="hskel hskel-hilo" />
          </div>
        )}

        {stats && <MetricTiles stats={stats} avgAqi={avgAqi} />}

        {panyuForecast && <NoticeCard text={panyuForecast.text} issuedAt={panyuForecast.issuedAt} />}

        {stats && stats.count >= 2 && <TempRanking results={annotated} />}
      </div>

      <div className="app-content" key={`cards-${cityIdx}`}>
        {loading && results.length === 0 ? (
          <div className="cards">
            {Array.from({ length: activeCount }, (_, i) => (
              <div className="skeleton-card" key={i} style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        ) : (
          <div className="cards">
            {annotated.map((r) => (
              <ProviderCard key={r.providerId} r={r} />
            ))}
          </div>
        )}

        {air.length > 0 && <AqiSection air={air} />}

        {isEmpty && (
          <div className="hint">
            <p>所有信源获取失败</p>
            <button type="button" className="retry-btn" onClick={refresh}>重新加载</button>
          </div>
        )}
      </div>
      </div>

      {CITIES.length > 1 && (
        <div className="page-dots">
          {CITIES.map((c, i) => (
            <button
              key={c.name}
              type="button"
              className={'page-dot' + (i === cityIdx ? ' active' : '')}
              onClick={() => selectCity(i)}
              aria-label={c.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 预警等级 → 颜色（中国气象预警信号配色：蓝/黄/橙/红）
function warnColor(level: string): string {
  if (level.includes('红')) return '#ff453a'
  if (level.includes('橙')) return '#ff9f0a'
  if (level.includes('黄')) return '#ffd60a'
  if (level.includes('蓝')) return '#0a84ff'
  return '#ff9f0a'
}

// 预警信号卡（置顶醒目展示，左侧色条按等级着色）
// 徽章仅显示「类型 + 等级」；发布机构长名从 title 中去除，放到副文本展示
function WarningCard({ w }: { w: WeatherWarning }) {
  const col = warnColor(w.level)
  const badgeText = `${w.type}${w.level}预警`
  // 从 title 中提取发布机构（含地区前缀的完整名称，如「番禺区气象台」）
  const m = w.title.match(/([一-龥]{2,8}(?:气象台|气象局|天气预报台))/)
  const sender = m ? m[1] : ''
  const textColor = w.level.includes('黄') ? '#1a1a1a' : '#fff'
  return (
    <div className="warn-card" style={{ borderLeftColor: col }}>
      <span className="warn-badge" style={{ background: col, color: textColor }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {badgeText}
      </span>
      {sender && <span className="warn-sender">{sender}</span>}
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
          const Tag = r.url ? 'a' : 'div'
          return (
            <Tag
              className={'card' + (r.url ? ' card-link' : '')}
              key={r.providerId}
              style={{ borderLeftColor: r.color }}
              {...(r.url ? { href: r.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <div className="head">
                <span className="dot" style={{ background: r.color }} />
                <span className="name">{r.providerName}</span>
                {r.url && (
                  <svg className="card-ext" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                )}
                <span className="aqi-cat" style={{ color: col }}>{aqiCategory(a.aqi)}</span>
                <span className="temp" style={{ color: col }}>{a.aqi}<span className="aqi-unit">AQI</span></span>
              </div>
              {(a.dominant || a.pm25 != null) && (
                <div className="row">
                  {a.dominant && <span>主要污染物 <b>{a.dominant}</b></span>}
                  {a.pm25 != null && <span>PM2.5 <b>{a.pm25}</b> μg/m³</span>}
                </div>
              )}
              {a.observedAt && <div className="obs">观测 {formatTime(a.observedAt)}</div>}
            </Tag>
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
        <span className="wx">
          <WeatherIcon text={c.text} size={17} className="wx-icon" />
          <b>{c.text}</b>
        </span>
        {c.feelsLike != null && <span>体感 <b>{c.feelsLike.toFixed(1)}°</b></span>}
        {c.humidity != null && <span>湿度 <b>{Math.round(c.humidity)}%</b></span>}
        {c.windDir && (
          <span className="wx-wind">
            <WindArrow dir={c.windDir} />
            {c.windDir}{c.windSpeed != null ? ` ${c.windSpeed.toFixed(1)} km/h` : ''}
          </span>
        )}
      </div>
      {c.observedAt && <div className="obs">观测 {formatTime(c.observedAt)}</div>}
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

interface Stats {
  avg: number; min: number; max: number; count: number; text: string
  feelsLike?: number; humidity?: number
}

function analyze(results: ProviderResult[]): { annotated: Annotated[]; stats: null | Stats } {
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

  // 多源聚合的体感/湿度/风（仅取提供该字段的源求平均）
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
  const r1 = (x?: number) => (x == null ? undefined : Math.round(x * 10) / 10)
  const feels = ok.map((r) => r.current!.feelsLike).filter((n): n is number => n != null)
  const hums = ok.map((r) => r.current!.humidity).filter((n): n is number => n != null)
  const humAvg = avgOf(hums)

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
    stats: {
      avg, min, max, count: temps.length, text: majorityText,
      feelsLike: r1(avgOf(feels)),
      humidity: humAvg != null ? Math.round(humAvg) : undefined,
    },
  }
}

// 各天空主题对应的状态栏配色（取该主题背景渐变顶端色，使状态栏与画面顶部融为一体）
const SKY_THEME: Record<string, string> = {
  'clear-day': '#163465',
  'clear-night': '#0a1430',
  cloudy: '#1d2842',
  overcast: '#242b39',
  rain: '#172a3e',
  snow: '#293751',
  fog: '#2b2e36',
}

// 天气文字 + 昼夜 → 背景主题 key（驱动 CSS 的动态天气背景）
function skyKey(text: string | undefined, night: boolean): string {
  if (text) {
    if (/雷|雨/.test(text)) return 'rain'
    if (/雪/.test(text)) return 'snow'
    if (/雾|霾|沙|尘/.test(text)) return 'fog'
    if (/阴/.test(text)) return 'overcast'
    if (/多云|间/.test(text)) return 'cloudy'
  }
  return night ? 'clear-night' : 'clear-day'
}

// 概览次要指标小卡：体感/湿度/AQI 一列三格等宽
function MetricTiles({ stats, avgAqi }: { stats: Stats; avgAqi: number | null }) {
  const tileCount = [stats.feelsLike != null, stats.humidity != null, avgAqi != null].filter(Boolean).length
  if (tileCount === 0) return null
  return (
    <div className="metric-tiles" style={{ gridTemplateColumns: `repeat(${tileCount}, 1fr)` }}>
      {stats.feelsLike != null && (
        <div className="metric-tile">
          <span className="mt-label">体感</span>
          <span className="mt-value">{stats.feelsLike.toFixed(1)}°</span>
          <FeelsAnim temp={stats.feelsLike} />
        </div>
      )}
      {stats.humidity != null && (
        <div className="metric-tile">
          <span className="mt-label">湿度</span>
          <span className="mt-value">{stats.humidity}%</span>
          <HumidAnim pct={stats.humidity} />
        </div>
      )}
      {avgAqi != null && (
        <div className="metric-tile">
          <span className="mt-label">空气质量</span>
          <span className="mt-value" style={{ color: aqiColor(avgAqi) }}>{aqiCategory(avgAqi)}</span>
          <span className="mt-sub">AQI {avgAqi}</span>
          <AqiAnim color={aqiColor(avgAqi)} />
        </div>
      )}
    </div>
  )
}

// 体感：温度计 + 汞柱随温度变化
function FeelsAnim({ temp }: { temp: number }) {
  const pct = Math.min(100, Math.max(0, ((temp - 5) / 35) * 100))
  const mercH = Math.max(3, pct * 0.33)
  const mercY = 39 - mercH
  const col = temp < 16 ? '#40c8e0' : temp < 28 ? '#ffd60a' : '#ff6b3d'
  return (
    <svg className="tile-anim" viewBox="0 0 36 76" aria-hidden="true" overflow="visible">
      <rect x="14" y="6" width="8" height="36" rx="4"
        fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <rect x="16" y={mercY} width="4" height={mercH} rx="2" fill={col} className="therm-mercury" />
      {[12, 19, 26, 33].map((y) => (
        <line key={y} x1="22" y1={y} x2="26" y2={y}
          stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
      ))}
      <circle cx="18" cy="54" r="9" fill={col} />
      <circle cx="18" cy="54" r="14" fill={col} opacity="0.15" className="therm-glow" />
    </svg>
  )
}

// 湿度：水滴 + 水面波纹随湿度升降
function HumidAnim({ pct }: { pct: number }) {
  const fillY = 46 - (pct / 100) * 38
  return (
    <svg className="tile-anim" viewBox="0 0 44 58" aria-hidden="true" overflow="visible">
      <defs>
        <clipPath id="tile-drop-clip">
          <path d="M22 6 C22 6 6 24 6 35 a16 16 0 0 0 32 0 C38 24 22 6 22 6Z" />
        </clipPath>
      </defs>
      <path d="M22 6 C22 6 6 24 6 35 a16 16 0 0 0 32 0 C38 24 22 6 22 6Z"
        fill="rgba(96,190,255,0.07)" stroke="rgba(96,190,255,0.22)" strokeWidth="1.2" />
      <g clipPath="url(#tile-drop-clip)">
        <rect x="-5" y={fillY} width="54" height="60" fill="rgba(64,200,224,0.28)" />
        <path
          className="wave-svg"
          d={`M-22 ${fillY} q11-3.5 22 0 t22 0 t22 0 t22 0 V58 H-22Z`}
          fill="rgba(64,200,224,0.42)"
        />
      </g>
    </svg>
  )
}

// 空气质量：呼吸光环，颜色随 AQI 等级
function AqiAnim({ color }: { color: string }) {
  return (
    <svg className="tile-anim" viewBox="0 0 80 80" aria-hidden="true" overflow="visible">
      <circle cx="56" cy="54" r="7" fill={color} opacity="0.75" className="aqi-core" />
      <circle cx="56" cy="54" r="19" fill="none" stroke={color} strokeWidth="1.5" opacity="0.38" className="aqi-r1" />
      <circle cx="56" cy="54" r="33" fill="none" stroke={color} strokeWidth="1" opacity="0.18" className="aqi-r2" />
      <circle cx="56" cy="54" r="49" fill="none" stroke={color} strokeWidth="0.6" opacity="0.08" className="aqi-r3" />
    </svg>
  )
}

// 番禺区气象台短时预报卡：智能提取时间窗口 + 精简正文
function NoticeCard({ text, issuedAt }: { text: string; issuedAt?: string }) {
  const { timeLabel, body } = summarizeForecast(text)
  const issued = fmtIssuedAt(issuedAt)
  return (
    <div className="notice-card">
      <div className="notice-head">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
        <span className="notice-source">番禺气象台</span>
        {timeLabel && <span className="notice-time">{timeLabel}</span>}
        {issued && <span className="notice-issued">{issued}</span>}
      </div>
      <div className="notice-text">{body}</div>
    </div>
  )
}

// 从预报文字中提取时间窗口标签并精简正文
function summarizeForecast(text: string): { timeLabel: string; body: string } {
  let s = text.trim()
  // 匹配 "今天17时到今天20时" / "今天17时到20时" / "17时到20时"
  const tm = s.match(/^(今[天日]|明天|后天)?(\d{1,2})时到(今[天日]|明天|后天)?(\d{1,2})时[\s，,]*/)
  let timeLabel = ''
  if (tm) {
    const fromDay = tm[1] ?? ''
    const toDay = tm[3] ?? fromDay
    timeLabel = toDay && toDay !== fromDay
      ? `${fromDay}${tm[2]}—${toDay}${tm[4]}时`
      : `${fromDay}${tm[2]}—${tm[4]}时`
    s = s.slice(tm[0].length)
  }
  // 去掉正文头部区域名 "番禺区" "番禺"
  s = s.replace(/^番禺[区县]?\s*[，,]?\s*/, '')
  // 正文超 52 字符截断，避免在行尾留半句
  if (s.length > 52) s = s.slice(0, 52).replace(/[，,。！？\s]*$/, '') + '…'
  return { timeLabel, body: s }
}

// "2026年05月29日 17:00" → "05-29 17:00"；解析失败则返回空串
function fmtIssuedAt(s?: string): string {
  if (!s) return ''
  const m = s.match(/\d{4}年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})/)
  return m ? `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')} ${m[3]}` : ''
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

// 风向文字 → 来向角度（0=北，顺时针）；箭头指向来风方向（气象惯例）
const WIND_DIR_DEG: Record<string, number> = {
  北: 0, 东北: 45, 东: 90, 东南: 135, 南: 180, 西南: 225, 西: 270, 西北: 315,
}
function WindArrow({ dir }: { dir: string }) {
  const deg = WIND_DIR_DEG[dir.replace('风', '')]
  if (deg == null) return null
  return (
    <svg
      width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"
      style={{ transform: `rotate(${deg}deg)`, flex: 'none', opacity: 0.7 }}
    >
      {/* 上指箭头：顶点 + 两侧翼尖，指向来风方向 */}
      <path d="M6 1 L9.5 10.5 L6 8 L2.5 10.5 Z" fill="currentColor" />
    </svg>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  // observedAt 存储的是「北京墙上时间」写入 UTC 字段，计算差值时需与同一表示对齐：
  // Date.now() + 8h = 当前北京时（用 UTC 毫秒表达），与 d.getTime() 在同一坐标系下相减
  const diffMin = Math.round((Date.now() + 8 * 3600_000 - d.getTime()) / 60_000)
  if (diffMin < 2) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffMin < 120) return `${Math.floor(diffMin / 60)} 小时前`
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  })
}
