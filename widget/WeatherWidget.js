// WeatherWidget.js — 多信源天气实况对比
// ===============================================
// 使用：
// 1. Scriptable App 中新建脚本，粘贴全部内容
// 2. 添加到桌面（推荐中号）
// 3. Widget Parameter：填「番禺」或「安福」
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

const SHORT = {
  'nmc': '中央气象台', 'gzqx': '番禺气象台', 'qweather': '和风天气',
  'caiyun': '彩云天气', 'owm': 'OWM', 'open-meteo': 'Open-Meteo',
}

const PC = {
  'nmc': '#ef4444', 'gzqx': '#a855f7', 'qweather': '#3b82f6',
  'caiyun': '#f59e0b', 'owm': '#f97316', 'open-meteo': '#22c55e',
}

const C = {
  text:  new Color('#f5f5f7'),
  text2: new Color('#98989d'),
  dim:   new Color('#6e6e73'),
  hot:   new Color('#ff453a'),
  cold:  new Color('#40c8e0'),
}

// ── 数据 ──
let _k = '', _d = null
async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === _k && _d) return _d
  const p = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const req = new Request(`${CONFIG.apiUrl}?${p}`)
  req.timeoutInterval = 15
  _d = await req.loadJSON()
  _k = key
  return _d
}

// ── 背景 ──
function bg(w) {
  const g = new LinearGradient()
  g.colors = [new Color('#050810'), new Color('#0c1526'), new Color('#080e18')]
  g.locations = [0, 0.5, 1]
  w.backgroundGradient = g
}

// ── 中号 / 大号 ──
function renderMain(w, data) {
  bg(w)
  w.setPadding(14, 16, 12, 16)

  const multi = data.count >= 2 && data.max !== data.min

  // ── 头部 ──
  const hdr = w.addStack()
  hdr.layoutHorizontally()
  hdr.centerAlignContent()

  const city = hdr.addText(data.city)
  city.font = Font.semiboldSystemFont(15)
  city.textColor = C.text
  city.lineLimit = 1

  hdr.addSpacer(6)

  if (data.text) {
    const tx = hdr.addText(data.text)
    tx.font = Font.mediumSystemFont(12)
    tx.textColor = C.text2
    tx.lineLimit = 1
  }

  hdr.addSpacer()

  const cnt = hdr.addText(`${data.count}信源`)
  cnt.font = Font.regularSystemFont(10)
  cnt.textColor = C.dim

  w.addSpacer(10)

  // ── 主体：2列 × 3行 网格 ──
  const ok = data.providers.filter(p => p.temp != null)
  const cols = [[], []]
  ok.forEach((p, i) => cols[i % 2].push(p))

  const grid = w.addStack()
  grid.layoutHorizontally()
  grid.spacing = 16

  for (const col of cols) {
    const stack = grid.addStack()
    stack.layoutVertically()
    stack.spacing = 6

    for (const p of col) {
      const row = stack.addStack()
      row.layoutHorizontally()
      row.centerAlignContent()

      // 圆点
      const hex = PC[p.id] || '#6e6e73'
      const d = row.addText('●')
      d.font = Font.regularSystemFont(7)
      d.textColor = new Color(hex)

      row.addSpacer(4)

      // 名称
      const nm = row.addText(SHORT[p.id] || p.name)
      nm.font = Font.mediumSystemFont(12)
      nm.textColor = C.text
      nm.lineLimit = 1

      row.addSpacer()

      // 温度（整数）
      const temp = Math.round(p.temp)
      const tp = row.addText(`${temp}°`)
      tp.font = Font.semiboldSystemFont(14)
      if (multi && p.temp === data.max) tp.textColor = C.hot
      else if (multi && p.temp === data.min) tp.textColor = C.cold
      else tp.textColor = C.text
      tp.lineLimit = 1
    }
  }

  w.addSpacer(8)

  // ── 温度范围条 ──
  if (data.max != null && data.min != null) {
    const bar = w.addStack()
    bar.layoutHorizontally()
    bar.centerAlignContent()

    const lo = bar.addText(`${data.min}°`)
    lo.font = Font.mediumSystemFont(10)
    lo.textColor = C.cold

    bar.addSpacer(6)

    // 简易比例条
    const track = bar.addStack()
    track.backgroundColor = new Color('#ffffff', 0.08)
    track.cornerRadius = 2
    track.size = new Size(0, 3)

    bar.addSpacer(6)

    const hi = bar.addText(`${data.max}°`)
    hi.font = Font.mediumSystemFont(10)
    hi.textColor = C.hot

    bar.addSpacer(10)

    if (data.median != null) {
      const med = bar.addText(`中位 ${data.median.toFixed(0)}°`)
      med.font = Font.regularSystemFont(10)
      med.textColor = C.text2
    }
  }

  w.addSpacer(6)

  // ── 番禺气象台预报 ──
  const gzqx = data.providers.find(p => p.id === 'gzqx')
  if (gzqx && gzqx.forecast) {
    const div = w.addStack()
    div.size = new Size(0, 0.5)
    div.backgroundColor = new Color('#ffffff', 0.06)
    w.addSpacer(5)

    const fc = w.addText(gzqx.forecast)
    fc.font = Font.regularSystemFont(9)
    fc.textColor = C.dim
    fc.lineLimit = 3
  }

  w.addSpacer(4)

  // ── 底部 ──
  const ft = w.addStack()
  ft.layoutHorizontally()
  ft.addSpacer()
  const time = data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const f = ft.addText(`更新 ${time}`)
  f.font = Font.regularSystemFont(8)
  f.textColor = C.dim
  ft.addSpacer()
}

// ── 小号 ──
function renderSmall(w, data) {
  bg(w)
  w.setPadding(14, 16, 12, 16)

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(13)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(6)

  if (data.median != null) {
    const t = w.addText(`${data.median.toFixed(0)}°`)
    t.font = Font.boldSystemFont(42)
    t.textColor = C.text
    t.centerAlignText()
  }

  w.addSpacer(4)

  const info = w.addText(`${data.max}° / ${data.min}°  ${data.text || ''}`)
  info.font = Font.mediumSystemFont(10)
  info.textColor = C.text2
  info.centerAlignText()

  w.addSpacer(8)

  const dots = w.addStack()
  dots.layoutHorizontally()
  dots.addSpacer()
  for (const p of data.providers) {
    if (p.temp == null) continue
    const hex = PC[p.id] || '#6e6e73'
    const d = dots.addText('●')
    d.font = Font.regularSystemFont(7)
    d.textColor = new Color(hex)
    dots.addSpacer(3)
  }
  dots.addSpacer()

  w.addSpacer(6)

  const ft = w.addText(`${data.count}信源`)
  ft.font = Font.regularSystemFont(8)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 错误 ──
function renderError(w, msg) {
  w.backgroundColor = new Color('#0a0d16')
  w.addSpacer()
  const ic = w.addText('⚠')
  ic.font = Font.systemFont(20)
  ic.centerAlignText()
  w.addSpacer(4)
  const t = w.addText('无法加载')
  t.font = Font.semiboldSystemFont(13)
  t.textColor = C.text
  t.centerAlignText()
  w.addSpacer(2)
  const d = w.addText(msg)
  d.font = Font.regularSystemFont(10)
  d.textColor = C.dim
  d.centerAlignText()
  w.addSpacer()
}

// ── Main ──
async function run() {
  const param = config.runsInWidget ? args.widgetParameter : null
  let city
  if (param) {
    const idx = parseInt(param)
    city = !isNaN(idx) && CONFIG.cities[idx]
      ? CONFIG.cities[idx]
      : CONFIG.cities.find(c => c.name === param || c.cityName === param)
  }
  if (!city) city = CONFIG.cities[CONFIG.defaultCityIdx]

  if (!config.runsInWidget) {
    const pv = new ListWidget()
    pv.addText(`${city.name} · 天气实况对比`)
    pv.addText(CONFIG.apiUrl)
    pv.presentSmall()
  }

  const w = new ListWidget()

  try {
    const data = await fetchData(city.lat, city.lon, city.name, city.cityName)
    if (config.widgetFamily === 'small') {
      renderSmall(w, data)
    } else {
      renderMain(w, data)
    }
  } catch (e) {
    renderError(w, e.message || '未知错误')
  }

  if (config.runsInWidget) {
    Script.setWidget(w)
  } else {
    w.presentMedium()
  }
  Script.complete()
}

await run()
