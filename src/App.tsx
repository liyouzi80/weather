import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAll, fetchAllAqi, PROVIDERS } from './providers'
import type { AqiResult, GeoLocation, MinutelyRain, ProviderResult, WeatherWarning } from './providers/types'
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// 按 providerId 合并 AQI：保留原顺序，每个源优先取「有数据」的版本（新>旧），用于后台补齐。
function mergeAqi(prev: AqiResult[], next: AqiResult[]): AqiResult[] {
  const ids = prev.map((s) => s.providerId)
  for (const s of next) if (!ids.includes(s.providerId)) ids.push(s.providerId)
  return ids.map((id) => {
    const fresh = next.find((s) => s.providerId === id)
    const old = prev.find((s) => s.providerId === id)
    if (fresh?.air) return fresh
    if (old?.air) return old
    return fresh ?? old
  }).filter((s): s is AqiResult => s != null)
}
const aqiHealthy = (air: AqiResult[]) => air.filter((s) => s.air).length

// 按 providerId 合并天气结果：保留原顺序，每源只升级「有数据」（新>旧），不降级。
function mergeResults(prev: ProviderResult[], next: ProviderResult[]): ProviderResult[] {
  return prev.map((p) => {
    if (p.current) return p
    const fresh = next.find((n) => n.providerId === p.providerId)
    return fresh?.current ? fresh : p
  })
}
const weatherHealthy = (rs: ProviderResult[]) => rs.filter((r) => r.current).length

export default function App() {
  const [cityIdx, setCityIdx] = useState(0)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [air, setAir] = useState<AqiResult[]>([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [updatedAgo, setUpdatedAgo] = useState('')
  const [initialLoad, setInitialLoad] = useState(true)
  const [showPullHint, setShowPullHint] = useState(() => {
    try { return !localStorage.getItem('pwr_hint_seen') } catch { return true }
  })
  // Tracks the latest refresh call; stale responses (from city switches or rapid re-taps) are discarded
  const refreshIdRef = useRef(0)

  // 后台补齐：刷新完成后若 AQI 仍缺失（服务端抓站点页偶发失败），静默重试合并，不打断 UI。
  // 与 refreshIdRef 绑定——切城市或再次刷新会让进行中的补齐自动作废。
  // AQI 后台补齐（服务端抓站点页偶发失败）
  const backfill = useCallback(async (id: number, idx: number, loc: GeoLocation, air0: AqiResult[]) => {
    let air = air0
    const EXPECTED = 2 // 两源：在意空气 + IQAir
    const delays = [2500, 5000, 9000, 15000]
    for (const delay of delays) {
      if (aqiHealthy(air) >= EXPECTED) return
      await sleep(delay)
      if (id !== refreshIdRef.current) return
      const r = await fetchAllAqi(loc)
      if (id !== refreshIdRef.current) return
      const merged = mergeAqi(air, r.sources)
      if (aqiHealthy(merged) > aqiHealthy(air)) {
        air = merged
        setAir(merged)
        writeCache(idx, resultsRef.current, merged)
      }
    }
  }, [])

  // 天气信源后台补齐（个别源首次超时/失败时静默重试，合并补齐，不打断 UI）
  const backfillWeather = useCallback(async (id: number, idx: number, loc: GeoLocation, init: ProviderResult[]) => {
    let cur = init
    const expected = init.length
    const delays = [3000, 7000, 13000, 21000]
    for (const delay of delays) {
      if (weatherHealthy(cur) >= expected) return
      await sleep(delay)
      if (id !== refreshIdRef.current) return
      const fresh = await fetchAll(loc)
      if (id !== refreshIdRef.current) return
      const merged = mergeResults(cur, fresh)
      if (weatherHealthy(merged) > weatherHealthy(cur)) {
        cur = merged
        setResults(merged)
        writeCache(idx, merged, airRef.current)
      }
    }
  }, [])

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
      if (aqiHealthy(aqi.sources) < 2) void backfill(id, cityIdx, loc, aqi.sources)
      if (weatherHealthy(weather) < weather.length) void backfillWeather(id, cityIdx, loc, weather)
    } finally {
      if (id === refreshIdRef.current) {
        setLoading(false)
        setInitialLoad(false)
      }
    }
  }, [cityIdx, backfill, backfillWeather])

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
    cityIdxRef.current = i  // 立即更新 ref，避免 cache-loading effect 读到旧城市的缓存
    setCityIdx(i)
    // 切城市回到顶部，避免吸顶城市名残留（停在滚动态时切换会重复显示地名）
    window.scrollTo(0, 0)
    setScrolled(false)
    // 重置 hero 视差（切城市后清除滚动变换）
    if (heroRef.current) {
      heroRef.current.style.opacity = '1'
      heroRef.current.style.transform = ''
    }
    if (stickyTempRef.current) stickyTempRef.current.style.opacity = '0'
  }, [cityIdx])

  // 首次加载完成后显示下拉提示 4 秒，之后自动隐藏
  useEffect(() => {
    if (initialLoad || !showPullHint) return
    const t = setTimeout(() => {
      setShowPullHint(false)
      try { localStorage.setItem('pwr_hint_seen', '1') } catch {}
    }, 4000)
    return () => clearTimeout(t)
  }, [initialLoad, showPullHint])

  // 手势（移动端）：下拉刷新 + 左右滑动切城市。
  // 用非被动原生监听，统一在一处判定主轴，避免纵向下拉与横向翻页冲突。
  // pull/swipeX 用 DOM ref 直接操作，避免每帧 setState → React 重渲染导致卡顿。
  const [pullReady, setPullReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pullRef = useRef(0)
  const pullReadyRef = useRef(false)
  const swipeXRef = useRef(0)
  const swipeRawRef = useRef(0)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const gesture = useRef<'pull' | 'swipe' | 'ignore' | null>(null)
  const atTop = useRef(false)
  const appRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const stickyTempRef = useRef<HTMLSpanElement>(null)
  const pullIndicatorRef = useRef<HTMLDivElement>(null)
  const pullSvgRef = useRef<SVGSVGElement>(null)
  const pullCircleRef = useRef<SVGCircleElement>(null)
  const swipeWrapRef = useRef<HTMLElement>(null)
  const locHeaderRef = useRef<HTMLElement>(null)
  const loadingRef = useRef(loading)
  const refreshRef = useRef(refresh)
  const selectCityRef = useRef(selectCity)
  const cityIdxRef = useRef(cityIdx)
  const resultsRef = useRef(results)
  const airRef = useRef(air)
  const PULL_MAX = 64
  const PULL_TRIGGER = 46
  const SWIPE_TRIGGER = 45
  useEffect(() => {
    loadingRef.current = loading
    refreshRef.current = refresh
    selectCityRef.current = selectCity
    cityIdxRef.current = cityIdx
    resultsRef.current = results
    airRef.current = air
  }, [loading, refresh, selectCity, cityIdx, results, air])
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
        swipeRawRef.current = dx   // 原始位移用于触发判断，不受阻尼影响
        const wrap = swipeWrapRef.current
        if (wrap) wrap.style.transform = `translateX(${clamped}px)`
        setDragging(true)
      } else if (gesture.current === 'pull') {
        e.preventDefault()
        const p = dy > 0 ? Math.min(dy * 0.62, PULL_MAX) : 0
        pullRef.current = p
        const ind = pullIndicatorRef.current
        const circle = pullCircleRef.current
        if (ind) {
          if (ind.style.transition) ind.style.transition = ''
          ind.style.height = `${p}px`
          // Continuous opacity: 0 → full over the first 40% of pull distance
          ind.style.opacity = `${Math.min(p / (PULL_TRIGGER * 0.4), 1) * 0.92}`
          ind.classList.toggle('active', p > 8)
        }
        if (circle) {
          if (circle.style.transition) circle.style.transition = ''
          const CIRC = 62.83
          circle.style.strokeDashoffset = `${CIRC * (1 - Math.min(p / PULL_TRIGGER, 1))}`
        }
        if (p >= PULL_TRIGGER && !pullReadyRef.current) {
          pullReadyRef.current = true
          setPullReady(true)
          haptic(8)
        } else if (p < PULL_TRIGGER && pullReadyRef.current) {
          pullReadyRef.current = false
          setPullReady(false)
        }
      }
    }
    const onEnd = () => {
      if (gesture.current === 'swipe') {
        const rawDx = swipeRawRef.current  // 原始位移判断触发（约 45px 真实手势距离）
        setDragging(false)
        if (Math.abs(rawDx) >= SWIPE_TRIGGER) {
          const len = CITIES.length
          const target = (cityIdxRef.current + (rawDx < 0 ? 1 : -1) + len) % len
          selectCityRef.current(target)
        }
        swipeXRef.current = 0
        swipeRawRef.current = 0
        const wrap = swipeWrapRef.current
        if (wrap) wrap.style.transform = ''
      } else if (gesture.current === 'pull') {
        const triggered = pullRef.current >= PULL_TRIGGER
        pullRef.current = 0
        pullReadyRef.current = false
        setPullReady(false)
        if (triggered) {
          // Leave height/opacity as-is; loading useEffect will spring it back
          try { localStorage.setItem('pwr_hint_seen', '1') } catch {}
          setShowPullHint(false)
          refreshRef.current()
        } else {
          // Not triggered: spring-back the indicator
          const ind = pullIndicatorRef.current
          const circle = pullCircleRef.current
          if (ind) {
            ind.style.transition = 'height 0.38s var(--spring), opacity 0.26s ease'
            ind.style.height = '0px'
            ind.style.opacity = '0'
            ind.classList.remove('active')
            setTimeout(() => { if (pullIndicatorRef.current) pullIndicatorRef.current.style.transition = '' }, 400)
          }
          if (circle) {
            circle.style.transition = 'stroke-dashoffset 0.26s ease'
            circle.style.strokeDashoffset = '62.83'
            setTimeout(() => { if (pullCircleRef.current) pullCircleRef.current.style.transition = '' }, 280)
          }
        }
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

  // 下拉刷新指示器与 loading 状态同步：
  // loading=true 时过渡为旋转菊花，loading=false 时弹簧回收；
  // 若 height=0 说明是自动刷新（非手势触发），直接跳过。
  useEffect(() => {
    const ind = pullIndicatorRef.current
    const circle = pullCircleRef.current
    const currentHeight = ind ? (parseFloat(ind.style.height) || 0) : 0
    if (currentHeight <= 0) return
    const CIRC = 62.83
    if (loading) {
      // 进入菊花模式：缩短 dashoffset 使圆弧约占 80%，配合 spin 形成加载环
      if (circle) {
        circle.style.transition = 'stroke-dashoffset 0.22s ease'
        circle.style.strokeDashoffset = `${CIRC * 0.2}`
        setTimeout(() => { if (pullCircleRef.current) pullCircleRef.current.style.transition = '' }, 240)
      }
      if (ind) ind.style.opacity = '1'
    } else {
      // 加载完成：清空圆弧，弹簧收起指示器，内容随之平滑上移
      if (circle) {
        circle.style.transition = 'stroke-dashoffset 0.2s ease'
        circle.style.strokeDashoffset = `${CIRC}`
        setTimeout(() => { if (pullCircleRef.current) pullCircleRef.current.style.transition = '' }, 220)
      }
      if (ind) {
        ind.style.transition = 'height 0.42s var(--spring), opacity 0.3s ease'
        ind.style.height = '0px'
        ind.style.opacity = '0'
        setTimeout(() => {
          if (pullIndicatorRef.current) {
            pullIndicatorRef.current.style.transition = ''
            pullIndicatorRef.current.classList.remove('active')
          }
        }, 450)
      }
    }
  }, [loading])

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

  // Hero 多阶段滚动动效 + 吸顶栏驱动（合并为一个 scroll listener，减少事件监听开销）
  //   Phase 1 (0–80px)  : 天气现象+高低温淡出；吸顶栏 scrolled 在此触发
  //   Phase 2 (80–180px): 温度数字缩小+上移，吸顶栏温度交叉淡入
  //   全程               : hero 视差上移 + 整体淡出
  // 纯 DOM 直操作 + rAF 节流，不走 React state（仅 scrolled 在阈值切换时触发一次）
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let wasScrolled = false
    let wasAtTop = true  // 追踪是否刚从滚动态返回顶部，用于城市名平滑淡入
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY
        const tempEl = hero.querySelector<HTMLElement>('.hero-temp')
        const condEl = hero.querySelector<HTMLElement>('.hero-cond')
        const hiloEl = hero.querySelector<HTMLElement>('.hero-hilo')
        const cityEl = hero.querySelector<HTMLElement>('.hero-city')

        // 吸顶 scrolled：显示阈值 80px，隐藏阈值 60px（滞后区间防止边界反复闪烁）
        const isScrolled = wasScrolled ? y > 60 : y > 80
        if (isScrolled !== wasScrolled) { wasScrolled = isScrolled; setScrolled(isScrolled) }

        if (y <= 0) {
          const justArrived = !wasAtTop
          wasAtTop = true
          // 回到顶部静止：撤掉 will-change，释放 GPU 合成层
          if (justArrived) hero.style.willChange = 'auto'
          hero.style.opacity = '1'; hero.style.transform = ''
          if (tempEl) { tempEl.style.transform = ''; tempEl.style.opacity = '' }
          if (condEl) condEl.style.opacity = ''
          if (hiloEl) hiloEl.style.opacity = ''
          if (stickyTempRef.current) stickyTempRef.current.style.opacity = '0'
          if (cityEl) {
            // 从滚动态回到顶部时：平滑淡入城市名，避免硬跳
            if (justArrived && cityEl.style.opacity) {
              cityEl.style.transition = 'opacity 0.22s ease-out'
              cityEl.style.opacity = ''
              setTimeout(() => { if (cityEl) cityEl.style.transition = '' }, 240)
            } else {
              cityEl.style.opacity = ''
            }
          }
          return
        }
        // 开始滚动：仅在刚离开顶部时挂上 will-change（滚动中持续受益于 GPU 合成层）
        if (wasAtTop) hero.style.willChange = 'opacity, transform'
        wasAtTop = false
        // Phase 1 (0–80px): 城市名 + 天气状况 + 高低温淡出
        const t1 = Math.min(y / 80, 1)
        // Phase 2 (80–180px): 温度数字缩小 + 向上飞出；吸顶温度交叉淡入
        const t2 = Math.max(0, Math.min((y - 80) / 100, 1))
        hero.style.transform = `translateY(${(-y * 0.18).toFixed(1)}px)`
        hero.style.opacity = `${Math.max(0, 1 - y / 200).toFixed(3)}`
        if (cityEl) cityEl.style.opacity = `${(1 - t1).toFixed(3)}`
        if (condEl) condEl.style.opacity = `${(1 - t1).toFixed(3)}`
        if (hiloEl) hiloEl.style.opacity = `${(1 - t1).toFixed(3)}`
        if (tempEl) {
          // transform-origin: 50% 20% 令缩放从顶部折叠，translateY 让数字向上飞向吸顶栏
          const scale = (1 - 0.28 * t2).toFixed(3)
          const dy = (-88 * t2).toFixed(1)
          tempEl.style.transform = `scale(${scale}) translateY(${dy}px)`
          tempEl.style.opacity = (1 - t2).toFixed(3)
        }
        // 吸顶栏温度与 hero 温度镜像淡变，形成「数字飞过去」的视觉
        if (stickyTempRef.current) stickyTempRef.current.style.opacity = t2.toFixed(3)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
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
  // 分钟级降水（和风天气提供，有实际降水时才展示）
  const minutelyRain = useMemo(
    () => results.find((r) => r.current?.minutelyRain)?.current?.minutelyRain ?? null,
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
  // 量测 loc-header 实际高度 → CSS 变量 --loc-h，供 .hero-section min-height 自适应使用
  useEffect(() => {
    const header = locHeaderRef.current
    if (!header) return
    const update = () => document.documentElement.style.setProperty('--loc-h', `${header.offsetHeight}px`)
    const ro = new ResizeObserver(update)
    ro.observe(header)
    update()
    return () => ro.disconnect()
  }, [])

  // 实时天气动效类型（全屏背景层）
  const fx: FxKind = useMemo(() => fxKind(stats?.text, night), [stats, night])

  return (
    <div className="app" ref={appRef}>
      <WeatherFX kind={fx} tint={tint} lat={CITIES[cityIdx].lat} lon={CITIES[cityIdx].lon} />
      <div ref={pullIndicatorRef} className={'pull-indicator' + (pullReady ? ' ready' : '')}>
        <svg
          ref={pullSvgRef}
          width="26" height="26" viewBox="0 0 26 26" fill="none"
          className={loading ? 'spin' : ''}
        >
          {/* Track ring */}
          <circle cx="13" cy="13" r="10" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
          {/* Progress arc: fills as you pull, transitions to spinner arc during loading */}
          <circle
            ref={pullCircleRef}
            cx="13" cy="13" r="10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="62.83"
            strokeDashoffset="62.83"
            transform="rotate(-90 13 13)"
          />
        </svg>
      </div>
      <header
        ref={locHeaderRef}
        className={'loc-header' + (scrolled ? ' scrolled' : '')}
        onClick={scrolled ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined}
        aria-label={scrolled ? '回到顶部' : undefined}
        role={scrolled ? 'button' : undefined}
      >
        <span className="loc-sticky-name">{city.name}</span>
        {stats && (
          <span ref={stickyTempRef} className="loc-sticky-temp">
            {' · '}{Math.round(stats.avg)}°
          </span>
        )}
      </header>

      {/* 左右滑动切城市：整块内容随手指平移，松手回弹 */}
      <main
        ref={swipeWrapRef as React.RefObject<HTMLElement>}
        className={'swipe-wrap' + (dragging ? ' dragging' : '')}
      >
      {/* 城市切换时 key 变化，触发 pageIn 淡入动画 */}
      <div className="app-content hero-section" key={cityIdx}>
        <div ref={heroRef} className={'hero' + (!stats ? ' hero-skeleton' : '')}>
          <h1 className="hero-city">{city.name}</h1>
          {stats ? (
            <>
              <div
                className="hero-temp"
                aria-label={`当前 ${Math.round(stats.avg)} 度，${stats.text}`}
              >
                {Math.round(stats.avg)}<span className="hero-deg" aria-hidden="true">°</span>
              </div>
              <div className="hero-cond" aria-hidden="true">
                {stats.text}
                {stats.feelsLike != null && (
                  <span style={{ color: feelsLevel(stats.feelsLike).color }}>{' · '}体感 {Math.round(stats.feelsLike)}°</span>
                )}
              </div>
              <div className="hero-hilo" aria-hidden="true">
                <span>↑ {Math.round(stats.max)}°</span>
                <span>↓ {Math.round(stats.min)}°</span>
              </div>
              {loading && results.length > 0
                ? <span className="hero-updated refreshing">数据更新中…</span>
                : updatedAgo && <span className="hero-updated">{updatedAgo}</span>
              }
            </>
          ) : (
            <>
              <div className="hskel hskel-temp" />
              <div className="hskel hskel-cond" />
              <div className="hskel hskel-hilo" />
            </>
          )}
        </div>

        {/* 气象预警 + 分钟级降水：统一放在 hero 下方，视觉上构成「风险提示」区块 */}
        {(warnings.length > 0 || minutelyRain) && (
          <div className="hazard-block">
            {warnings.length > 0 && <WarningInline warnings={warnings} />}
            {minutelyRain && <MinutelyRainCard data={minutelyRain} />}
          </div>
        )}

        {stats && <MetricTiles stats={stats} avgAqi={avgAqi} />}

        {showPullHint && !initialLoad && (
          <div className="pull-hint" aria-hidden="true">↓ 下拉更新</div>
        )}

        {panyuForecast && <NoticeCard text={panyuForecast.text} issuedAt={panyuForecast.issuedAt} />}

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
function warnColorRgba(level: string, alpha: number): string {
  if (level.includes('红')) return `rgba(255, 69, 58, ${alpha})`
  if (level.includes('橙')) return `rgba(255, 159, 10, ${alpha})`
  if (level.includes('黄')) return `rgba(255, 214, 10, ${alpha})`
  if (level.includes('蓝')) return `rgba(10, 132, 255, ${alpha})`
  return `rgba(255, 159, 10, ${alpha})`
}

// 预警严重程度（红4>橙3>黄2>蓝1）
function severityOf(w: WeatherWarning) {
  if (w.level.includes('红')) return 4
  if (w.level.includes('橙')) return 3
  if (w.level.includes('黄')) return 2
  return 1
}

// 预警一行文字提示：[色块] 暴雨预警 和 [色块] 雷雨大风预警
function WarningInline({ warnings }: { warnings: WeatherWarning[] }) {
  const sorted = [...warnings].sort((a, b) => severityOf(b) - severityOf(a))
  return (
    <div className="warn-inline">
      {sorted.map((w) => (
        <span
          key={w.type + w.level}
          className="warn-chip"
          style={{
            background: warnColorRgba(w.level, 0.15),
            borderColor: warnColorRgba(w.level, 0.45),
            color: warnColor(w.level),
          }}
        >
          {w.type}预警
        </span>
      ))}
    </div>
  )
}

// 分钟级降水卡（和风天气 minutely/5m）
const RAIN_SVG = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="19" x2="8" y2="21" /><line x1="8" y1="13" x2="8" y2="15" />
    <line x1="16" y1="19" x2="16" y2="21" /><line x1="16" y1="13" x2="16" y2="15" />
    <line x1="12" y1="21" x2="12" y2="23" /><line x1="12" y1="15" x2="12" y2="17" />
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
  </svg>
)
const SNOW_SVG = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="m17 7-5-5-5 5" /><path d="m7 17 5 5 5-5" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="m7 7-5 5 5 5" /><path d="m17 7 5 5-5 5" />
  </svg>
)
function MinutelyRainCard({ data }: { data: MinutelyRain }) {
  const pts = data.minutely.slice(0, 12)
  const maxPrecip = Math.max(...pts.map(b => b.precip), 0.1)
  const isSnow = pts.some(b => b.type === 'snow' && b.precip > 0)

  // SVG geometry — viewBox 300×56; floor at 88% for zero-rain baseline
  const W = 300, H = 56
  const floor = H * 0.88
  const ys = pts.map(b =>
    b.precip > 0
      ? Math.max(H * 0.04, floor - (b.precip / maxPrecip) * (floor - H * 0.04))
      : floor
  )
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W)

  let linePath = `M ${xs[0]} ${ys[0]}`
  for (let i = 1; i < xs.length; i++) {
    const dx = (xs[i] - xs[i - 1]) * 0.4
    linePath += ` C ${xs[i - 1] + dx} ${ys[i - 1]}, ${xs[i] - dx} ${ys[i]}, ${xs[i]} ${ys[i]}`
  }
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`

  return (
    <div className="minutely-card">
      <div className="minutely-head">
        {isSnow ? SNOW_SVG : RAIN_SVG}
        <span className="minutely-label">下一小时降水量</span>
      </div>
      {data.summary && <p className="minutely-title">{data.summary}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="minutely-svg"
           preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="mly-fill" x1="0" y1="0" x2="0" y2={H}
                          gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5ac8fa" stopOpacity="0.70" />
            <stop offset="100%" stopColor="#0a84ff" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {[0.25, 0.50, 0.75].map((frac, i) => (
          <line key={i} x1="0" y1={frac * H} x2={W} y2={frac * H}
                stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" strokeDasharray="3 3" />
        ))}
        <path d={areaPath} fill="url(#mly-fill)" />
        <path d={linePath} fill="none" stroke="rgba(90,200,250,0.85)"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="minutely-time-row" aria-hidden="true">
        <span>现在</span><span>15分钟</span><span>30分钟</span><span>45分钟</span><span>1小时</span>
      </div>
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
      <div className="cards">
        {air.map((r) => {
          if (r.error || !r.air) {
            return null   // AQI 源失败时静默跳过
          }
          const a = r.air
          const col = aqiColor(a.aqi)
          const Tag = r.url ? 'a' : 'div'
          return (
            <Tag
              className={'card aqi-card' + (r.url ? ' card-link' : '')}
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

  if (r.error || !r.current) return null   // 失败/无数据信源静默隐藏

  const c = r.current
  // GZQX 从缓存恢复时，预报可能在两次刷新间隙过期：此时 text='—'、无预警，
  // NoticeCard 不渲染任何内容，故同样静默隐藏本卡片。
  if (r.providerId === 'gzqx' && c.text === '—' && !c.warnings?.length) {
    const hasFc = !!c.forecast && (
      /\d{1,2}时到\d{1,2}时/.test(c.forecast) ||
      /注意|防范|防御|局部|短时强|冰雹|建议/.test(c.forecast)
    )
    if (!hasFc || !isForecastCurrent(c.forecast, c.forecastIssuedAt)) return null
  }
  const cls = ['card', r.isMax ? 'is-max' : '', r.isMin ? 'is-min' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="head">
        <span className="dot" style={{ background: color }} />
        <span className="name">{r.providerName}</span>
        {r.isMax && <span className="tag tag-hot">最高</span>}
        {r.isMin && <span className="tag tag-cold">最低</span>}
        <span className="temp">{Math.round(c.temp)}°</span>
      </div>
      <div className="row">
        {c.text !== '—' && (
          <span className="wx">
            <WeatherIcon text={c.text} size={17} className="wx-icon" />
            <b>{c.text}</b>
          </span>
        )}
        {c.feelsLike != null && <span>体感 <b>{Math.round(c.feelsLike)}°</b></span>}
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

interface Stats {
  avg: number; min: number; max: number; count: number; text: string
  feelsLike?: number; humidity?: number; pop?: number; uvIndex?: number
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
  const pops = ok.map((r) => r.current!.pop).filter((n): n is number => n != null)
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
      pop: pops.length > 0 ? Math.round(Math.max(...pops)) : undefined,
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

// 指标条等级：每项恒返回 颜色 + 等级文字（常驻显示，信息密度优先）。
// 正常/舒适区间用中性白（不着色），仅偏离正常时逐级升到黄/橙/红/紫等警示色。
type Level = { color: string; level: string }
const NORMAL = '#f5f5f7' // 中性白：正常区间不加颜色
function feelsLevel(t: number): Level {
  if (t <= 10) return { color: '#64d2ff', level: '偏冷' }
  if (t <= 26) return { color: NORMAL, level: '舒适' }
  if (t < 32)  return { color: '#ffd60a', level: '偏热' }
  if (t < 38)  return { color: '#ff9f0a', level: '较热' }
  return { color: '#ff453a', level: '酷热' }
}
function humidLevel(h: number): Level {
  if (h < 30)  return { color: '#ffd60a', level: '偏干' }
  if (h <= 80) return { color: NORMAL, level: '适宜' }
  if (h <= 88) return { color: '#ffd60a', level: '偏湿' }
  if (h <= 93) return { color: '#ff9f0a', level: '闷湿' }
  return { color: '#ff453a', level: '潮湿' }
}
function aqiLevel(aqi: number): Level {
  if (aqi <= 50)  return { color: NORMAL, level: '优' }
  if (aqi <= 100) return { color: '#ffd60a', level: '良' }
  if (aqi <= 150) return { color: '#ff9f0a', level: '轻度污染' }
  if (aqi <= 200) return { color: '#ff453a', level: '中度污染' }
  if (aqi <= 300) return { color: '#af52de', level: '重度污染' }
  return { color: '#a1304e', level: '严重污染' }
}
function uvLevel(uv: number): Level {
  if (uv <= 2) return { color: NORMAL, level: '弱' }
  if (uv <= 4) return { color: '#ffd60a', level: '中等' }
  if (uv <= 6) return { color: '#ff9f0a', level: '较强' }
  if (uv <= 9) return { color: '#ff453a', level: '强' }
  return { color: '#bf5af2', level: '极强' }
}
function popLevel(p: number): Level {
  if (p <= 20) return { color: NORMAL, level: '晴好' }
  if (p <= 40) return { color: '#ffd60a', level: '小概率' }
  if (p <= 70) return { color: '#ff9f0a', level: '中等' }
  return { color: '#ff453a', level: '较大' }
}

// 概览次要指标小卡：体感/湿度/AQI/紫外线，≤3 个时单行，4 个时 2×2
// 关键指标：hero 下方一排「图标 + 数值 + 标签」，去卡片框，直接浮于天气动效之上
const MetricTiles = memo(function MetricTiles({ stats, avgAqi }: { stats: Stats; avgAqi: number | null }) {
  const cols: { key: string; value: string; dim: string; level: string; color: string }[] = []
  if (stats.humidity != null) {
    const a = humidLevel(stats.humidity)
    cols.push({ key: 'humid', value: `${stats.humidity}%`, dim: '湿度', level: a.level, color: a.color })
  }
  if (stats.pop != null) {
    const a = popLevel(stats.pop)
    cols.push({ key: 'pop', value: `${stats.pop}%`, dim: '降水', level: a.level, color: a.color })
  }
  if (avgAqi != null) {
    const a = aqiLevel(avgAqi)
    cols.push({ key: 'aqi', value: `${avgAqi}`, dim: '空气', level: a.level, color: a.color })
  }
  if (stats.uvIndex != null) {
    const a = uvLevel(stats.uvIndex)
    cols.push({ key: 'uv', value: `${Math.round(stats.uvIndex)}`, dim: '紫外线', level: a.level, color: a.color })
  }
  if (cols.length === 0) return null
  return (
    <div className="metric-strip">
      {cols.map((c, i) => (
        <div className="metric-col" key={c.key} style={{ animationDelay: `${i * 0.06}s` }}>
          <span className="mc-value" style={{ color: c.color }}>{c.value}</span>
          <div className="mc-label">
            <span className="mc-dim">{c.dim}</span>
            <span className="mc-level">{c.level}</span>
          </div>
        </div>
      ))}
    </div>
  )
})

// 番禺区气象台短时预报卡：智能提取时间窗口 + 精简正文
function NoticeCard({ text, issuedAt }: { text: string; issuedAt?: string }) {
  const { timeLabel, note } = parseForecast(text)
  const issued = fmtIssuedAt(issuedAt)
  // 卡片价值在于「注意/防范」提示；只有时间窗口、无实质内容时不渲染（避免空卡片）
  if (!note) return null
  return (
    <div className="notice-card">
      <div className="notice-head">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="notice-icon">
          <path d="M3 11l18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
        <span className="notice-source">番禺气象台</span>
        {issued && <span className="notice-issued">{issued}</span>}
      </div>
      {timeLabel && <div className="notice-when">{timeLabel}</div>}
      {note && (
        <div className="notice-note">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>{note}</span>
        </div>
      )}
    </div>
  )
}

// 把预报原文拆解为：时间窗口 / 天气现象 / 风向风力 / 温度 / 附加提示
function parseForecast(raw: string) {
  let s = raw.trim()

  // 时间窗口：全文搜索「今天11时到14时」类模式（无 ^ 锚，实际格式为"过去…预计，今天X时到Y时，…"）
  // 找到后将正文截取自时间段之后，丢弃前面的历史观测描述。
  let timeLabel = ''
  const tm = s.match(/(今[天日]|明天|后天)?(\d{1,2})时到(今[天日]|明天|后天)?(\d{1,2})时[\s，,]*/)
  if (tm) {
    const fromDay = tm[1] ?? '', toDay = tm[3] ?? fromDay
    timeLabel = toDay && toDay !== fromDay
      ? `${fromDay}${tm[2]}—${toDay}${tm[4]}时`
      : `${fromDay}${tm[2]}—${tm[4]}时`
    s = s.slice((tm.index ?? 0) + tm[0].length)
  }

  // 去区域名前缀（若时间段后仍有残留）
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

// "2026年05月29日 17:00" → "17:00 发布"；解析失败则返回空串
function fmtIssuedAt(s?: string): string {
  if (!s) return ''
  const m = s.match(/\d{4}年\d{1,2}月\d{1,2}日\s*(\d{1,2}:\d{2})/)
  return m ? `${m[1]} 发布` : ''
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
