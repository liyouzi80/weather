import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAll, fetchAllAqi, PROVIDERS } from './providers'
import type { AqiResult, GeoLocation, ProviderResult, WeatherWarning } from './providers/types'
import { WeatherIcon } from './WeatherIcon'
import { WeatherFX, fxKind, type FxKind, type CloudTint } from './WeatherFX'

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

// ── 短触觉反馈（iOS Safari / Android Chrome 均支持 navigator.vibrate）──
function haptic(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch {}
}

// ── 本地缓存（stale-while-revalidate：上次数据即时展示，后台刷新替换）──
const CACHE_VER = 'pw1'
function cacheKey(idx: number) { return `${CACHE_VER}_${idx}` }
function writeCache(idx: number, results: ProviderResult[], air: AqiResult[]) {
  try {
    localStorage.setItem(cacheKey(idx), JSON.stringify({ results, air, at: Date.now() }))
  } catch {}
}
function readCache(idx: number): { results: ProviderResult[]; air: AqiResult[]; at: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(idx))
    if (!raw) return null
    const d = JSON.parse(raw)
    return Array.isArray(d?.results) && Array.isArray(d?.air) ? d : null
  } catch { return null }
}

export default function App() {
  const [cityIdx, setCityIdx] = useState(0)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [air, setAir] = useState<AqiResult[]>([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [updatedAgo, setUpdatedAgo] = useState('')
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
      writeCache(cityIdx, weather, aqi.sources)
    } finally {
      if (id === refreshIdRef.current) {
        setLoading(false)
        setInitialLoad(false)
      }
    }
  }, [cityIdx])

  useEffect(() => {
    const cached = readCache(cityIdxRef.current)
    if (cached) {
      setResults(cached.results)
      setAir(cached.air)
      setUpdatedAt(new Date(cached.at))
      setInitialLoad(false)
    }
    refresh()
  }, [refresh])

  const selectCity = useCallback((i: number) => {
    if (i === cityIdx) return
    haptic(8) // 切城市轻触觉，与下拉刷新反馈保持一致
    setResults([])
    setAir([])
    setUpdatedAt(null)
    setInitialLoad(true)
    setCityIdx(i)
    // 切城市回到顶部，避免吸顶城市名残留（停在滚动态时切换会重复显示地名）
    window.scrollTo(0, 0)
    setScrolled(false)
  }, [cityIdx])

  // 手势（移动端）：下拉刷新 + 左右滑动切城市。
  // 用非被动原生监听，统一在一处判定主轴，避免纵向下拉与横向翻页冲突。
  const [pull, setPull] = useState(0)
  const [pullReady, setPullReady] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pullRef = useRef(0)
  const pullReadyRef = useRef(false)
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
  const PULL_MAX = 64
  const PULL_TRIGGER = 46
  const SWIPE_TRIGGER = 45
  useEffect(() => {
    loadingRef.current = loading
    refreshRef.current = refresh
    selectCityRef.current = selectCity
    cityIdxRef.current = cityIdx
  }, [loading, refresh, selectCity, cityIdx])
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
          // 0.62 阻尼：手指行程更短即可触发，回应更跟手
          const p = Math.min(dy * 0.62, PULL_MAX)
          pullRef.current = p
          setPull(p)
          if (p >= PULL_TRIGGER && !pullReadyRef.current) {
            pullReadyRef.current = true
            setPullReady(true)
            haptic(8)
          } else if (p < PULL_TRIGGER && pullReadyRef.current) {
            pullReadyRef.current = false
            setPullReady(false)
          }
        } else {
          e.preventDefault()
          pullRef.current = 0
          setPull(0)
          if (pullReadyRef.current) { pullReadyRef.current = false; setPullReady(false) }
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
        if (pullRef.current >= PULL_TRIGGER) {
          haptic([12, 60, 8])
          refreshRef.current()
        }
        pullRef.current = 0
        setPull(0)
        pullReadyRef.current = false
        setPullReady(false)
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

  // 滚动时头部吸顶城市名淡入（hero 城市名滚出视口后触发）
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 头部刷新时间：相对格式，每 30 秒重算一次
  useEffect(() => {
    const calc = () => {
      if (!updatedAt) { setUpdatedAgo(''); return }
      const m = Math.round((Date.now() - updatedAt.getTime()) / 60_000)
      if (m < 1) setUpdatedAgo('刚刚')
      else if (m < 60) setUpdatedAgo(`${m} 分钟前`)
      else setUpdatedAgo(`${Math.floor(m / 60)} 小时前`)
    }
    calc()
    const t = setInterval(calc, 30_000)
    return () => clearInterval(t)
  }, [updatedAt])

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

  // 昼夜 + 暮光染色：统一按北京时（番禺/安福均在 UTC+8），不随设备时区
  const { night, tint } = useMemo(() => computeSky(Date.now()), [updatedAt])
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
      <WeatherFX kind={fx} tint={tint} />
      <div
        className={'pull-indicator' + (loading || pull > 6 ? ' active' : '') + (pullReady ? ' ready' : '')}
        style={{
          height: loading ? 46 : pull,
          opacity: loading || pull > 6 ? 1 : 0,
        }}
      >
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={loading ? 'spin' : ''}
          style={{ transform: `rotate(${loading ? 0 : Math.min(pull / PULL_TRIGGER, 1) * 270}deg)`, opacity: 0.85 }}
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </div>
      <header className={'loc-header' + (scrolled ? ' scrolled' : '')} aria-hidden="true">
        <span className="loc-sticky-name">{city.name}</span>
      </header>

      {/* 左右滑动切城市：整块内容随手指平移，松手回弹 */}
      <main
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

        <div className={'hero' + (!stats ? ' hero-skeleton' : '')}>
          <h1 className="hero-city">{city.name}</h1>
          {loading && results.length > 0
            ? <span className="hero-updated refreshing">数据更新中…</span>
            : updatedAgo && <span className="hero-updated">{updatedAgo}</span>
          }
          {stats ? (
            <>
              <div
                className="hero-temp"
                aria-label={`当前 ${Math.round(stats.avg)} 度，${stats.text}，最高 ${Math.round(stats.max)} 度，最低 ${Math.round(stats.min)} 度`}
              >
                {Math.round(stats.avg)}<span className="hero-deg" aria-hidden="true">°</span>
              </div>
              <div className="hero-cond" aria-hidden="true">{stats.text}</div>
              <div className="hero-hilo" aria-hidden="true">
                <span>最高 <b>{Math.round(stats.max)}°</b></span>
                <span>最低 <b>{Math.round(stats.min)}°</b></span>
              </div>
            </>
          ) : (
            <>
              <div className="hskel hskel-temp" />
              <div className="hskel hskel-cond" />
              <div className="hskel hskel-hilo" />
            </>
          )}
        </div>

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
      </main>

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
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
// memo：拖动/下拉手势会每帧更新 App 状态，记忆化避免数据未变时整列重渲染
const AqiSection = memo(function AqiSection({ air }: { air: AqiResult[] }) {
  return (
    <div className="aqi-section">
      <div className="ranking-title">空气质量 · 美国 AQI</div>
      <div className="cards">
        {air.map((r) => {
          if (r.error || !r.air) {
            return (
              <div className="card err" key={r.providerId}>
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
                  {a.dominant === 'PM2.5' && a.pm25 != null ? (
                    // 主要污染物就是 PM2.5 时合并成一条，避免「主要污染物 PM2.5」与「PM2.5 9」重复
                    <span>主要污染物 <b>PM2.5</b> · {a.pm25} μg/m³</span>
                  ) : (
                    <>
                      {a.dominant && <span>主要污染物 <b>{a.dominant}</b></span>}
                      {a.pm25 != null && <span>PM2.5 <b>{a.pm25}</b> μg/m³</span>}
                    </>
                  )}
                </div>
              )}
              {a.observedAt && <div className="obs">观测 {formatTime(a.observedAt)}</div>}
            </Tag>
          )
        })}
      </div>
    </div>
  )
})

const ProviderCard = memo(function ProviderCard({ r }: { r: Annotated }) {
  const meta = PROVIDERS.find((p) => p.id === r.providerId)
  const color = meta?.color ?? '#0a84ff'

  if (r.error) {
    return (
      <div className="card err">
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
    <div className={cls}>
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
})

const TempRanking = memo(function TempRanking({ results }: { results: Annotated[] }) {
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
})

interface Stats {
  avg: number; min: number; max: number; count: number; text: string
  feelsLike?: number; humidity?: number; uvIndex?: number
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
  const uvs = ok.map((r) => r.current!.uvIndex).filter((n): n is number => n != null)

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
      uvIndex: r1(avgOf(uvs)),
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

// 太阳时相：按北京时（番禺/安福均在 UTC+8）算昼夜 + 日出/日落暖色染色。
// 暮光（日出/日落前后约 1.3h）给 warmth>0，云的受光面与晴空光晕据此染暖，
// 实现「黄昏不突然变黑、云被朝/夕阳染色」的苹果天气式柔和过渡。
const SUNRISE = 6.0, SUNSET = 18.5, TINT_WIN = 1.3
function computeSky(now: number): { night: boolean; tint: CloudTint } {
  const d = new Date(now + 8 * 3600 * 1000)
  const h = d.getUTCHours() + d.getUTCMinutes() / 60
  const night = h < SUNRISE - 0.6 || h >= SUNSET + 0.8
  const wSr = Math.max(0, 1 - Math.abs(h - SUNRISE) / TINT_WIN)
  const wSs = Math.max(0, 1 - Math.abs(h - SUNSET) / TINT_WIN)
  // 日出偏玫瑰金、日落偏橙红；取较近的一段
  const tint: CloudTint = wSs >= wSr
    ? { r: 255, g: 150, b: 92, warmth: wSs }
    : { r: 255, g: 196, b: 150, warmth: wSr }
  return { night, tint }
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

function uvLevel(uv: number): string {
  if (uv <= 2) return '弱'
  if (uv <= 4) return '中等'
  if (uv <= 6) return '较强'
  if (uv <= 9) return '强'
  return '极强'
}
function uvColor(uv: number): string {
  if (uv <= 2) return '#34c759'
  if (uv <= 4) return '#ffd60a'
  if (uv <= 6) return '#ff9f0a'
  if (uv <= 9) return '#ff453a'
  return '#bf5af2'
}

// 概览次要指标小卡：体感/湿度/AQI/紫外线，≤3 个时单行，4 个时 2×2
// 关键指标：hero 下方一排「图标 + 数值 + 标签」，去卡片框，直接浮于天气动效之上
const MetricTiles = memo(function MetricTiles({ stats, avgAqi }: { stats: Stats; avgAqi: number | null }) {
  const cols: { key: string; value: string; label: string; color?: string }[] = []
  if (stats.feelsLike != null)
    cols.push({ key: 'feels', value: `${stats.feelsLike.toFixed(1)}°`, label: '体感' })
  if (stats.humidity != null)
    cols.push({ key: 'humid', value: `${stats.humidity}%`, label: '湿度' })
  if (avgAqi != null)
    cols.push({ key: 'aqi', value: aqiCategory(avgAqi), label: `空气 · AQI ${avgAqi}`, color: aqiColor(avgAqi) })
  if (stats.uvIndex != null)
    cols.push({ key: 'uv', value: uvLevel(stats.uvIndex), label: `紫外线 · UV ${Math.round(stats.uvIndex)}`, color: uvColor(stats.uvIndex) })
  if (cols.length === 0) return null
  return (
    <div className="metric-strip">
      {cols.map((c, i) => (
        <div className="metric-col" key={c.key} style={{ animationDelay: `${i * 0.06}s` }}>
          <span className="mc-value" style={c.color ? { color: c.color } : undefined}>{c.value}</span>
          <span className="mc-label">{c.label}</span>
        </div>
      ))}
    </div>
  )
})

// 番禺区气象台短时预报卡：智能提取时间窗口 + 精简正文
function NoticeCard({ text, issuedAt }: { text: string; issuedAt?: string }) {
  const { timeLabel, weather, wind, temp, note } = parseForecast(text)
  const issued = fmtIssuedAt(issuedAt)
  return (
    <div className="notice-card">
      <div className="notice-head">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
        <span className="notice-source">番禺气象台</span>
        {timeLabel && <span className="notice-time">{timeLabel}</span>}
        {issued && <span className="notice-issued">{issued}</span>}
      </div>
      <div className="notice-row">
        {weather && <span className="notice-wx">{weather}</span>}
        {wind && <span className="notice-detail">{wind}</span>}
        {temp && <span className="notice-detail">{temp}</span>}
      </div>
      {note && <p className="notice-note">{note}</p>}
    </div>
  )
}

// 把预报原文拆解为：时间窗口 / 天气现象 / 风向风力 / 温度 / 附加提示
function parseForecast(raw: string) {
  let s = raw.trim()

  // 时间窗口：「今天17时到今天20时」→ timeLabel「今天17—20时」
  let timeLabel = ''
  const tm = s.match(/^(今[天日]|明天|后天)?(\d{1,2})时到(今[天日]|明天|后天)?(\d{1,2})时[\s，,]*/)
  if (tm) {
    const fromDay = tm[1] ?? '', toDay = tm[3] ?? fromDay
    timeLabel = toDay && toDay !== fromDay
      ? `${fromDay}${tm[2]}—${toDay}${tm[4]}时`
      : `${fromDay}${tm[2]}—${tm[4]}时`
    s = s.slice(tm[0].length)
  }

  // 去区域名
  s = s.replace(/^(?:广州市?)?番禺[区县]?\s*[，,]?\s*/, '')

  // 提取风向风力（如「偏南风2-3级」「东北风3级」）
  let wind = ''
  s = s.replace(/((?:偏[东南西北]|[东南西北]{1,2})风[\d—\-~～至]+级)/g, m => { wind = m; return '' })

  // 提取温度（如「气温27-30℃」「最高气温33℃」）
  let temp = ''
  s = s.replace(/(?:最[高低])?气温([\d—\-~～至]+)\s*[℃°]?/g, (_, t) => { temp = t + '℃'; return '' })

  // 去天气成因背景句（如「受副热带高压影响」）
  s = s.replace(/受[^，,。！？]{2,12}(?:影响|控制)[，,]?\s*/g, '')

  // 分段，同时去掉每段开头的「我区/本区出现」等行政自称
  const segs = s.split(/[，,。！？\n]+/)
    .map(x => x.trim().replace(/^(?:我|本)[区市](?:出现|今[天日]|已)?\s*/, ''))
    .filter(x => x.length > 1)

  // 天气关键词
  const wxRe = /[晴阴云雨雷雪雾霾]|多云|阵雨|暴雨|转晴|大风/
  const wxOrigSet = new Set<string>()
  const wxParts: string[] = []
  let wxLen = 0
  for (const seg of segs) {
    if (wxRe.test(seg) && !/^局部/.test(seg)) {
      wxOrigSet.add(seg)
      wxParts.push(seg.replace(/^有\s*/, ''))
      wxLen += seg.length
      if (wxParts.length >= 2 || wxLen >= 18) break
    }
  }
  const weather = wxParts.join('，')

  // 附加提示：含警示词或「局部XXX」的段落
  const noteRe = /注意|防范|防御|局部|短时强|冰雹|建议/
  const noteParts = segs.filter(x => noteRe.test(x) && !wxOrigSet.has(x))
  let note = noteParts.join('，')
  if (note.length > 36) note = note.slice(0, 36).replace(/[，,\s]+$/, '') + '…'

  // 解析完全失败时兜底：截断原文展示
  if (!weather && !wind && !temp) {
    let fb = s.replace(/[，,。！？\s]+$/, '')
    if (fb.length > 48) fb = fb.slice(0, 48) + '…'
    return { timeLabel, weather: fb, wind: '', temp: '', note: '' }
  }

  return { timeLabel, weather, wind, temp, note }
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
