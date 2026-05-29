// WeatherWidget.js — 多信源天气实况对比
// 布局遵循 Apple HIG 中号组件设计规范
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
  'nmc': '中央气象台', 'gzqx': '番禺气象台', 'weathercn': '中国天气网', 'tencent': '腾讯天气',
  'qweather': '和风天气', 'caiyun': '彩云天气', 'owm': 'OWM', 'open-meteo': 'Open-Meteo',
}

const PC = {
  'nmc': '#ef4444', 'gzqx': '#a855f7', 'weathercn': '#14b8a6', 'tencent': '#0ea5e9',
  'qweather': '#3b82f6', 'caiyun': '#f59e0b', 'owm': '#f97316', 'open-meteo': '#22c55e',
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

// 天气文字 → SF Symbol 名称（顺序：先判多云/间，避免「晴间多云」误判为晴）。
function weatherSymbolName(text) {
  if (!text) return 'cloud.fill'
  if (/雷/.test(text)) return 'cloud.bolt.rain.fill'
  if (/暴雨/.test(text)) return 'cloud.heavyrain.fill'
  if (/雨/.test(text)) return 'cloud.rain.fill'
  if (/雪/.test(text)) return 'cloud.snow.fill'
  if (/雾|霾|沙|尘/.test(text)) return 'cloud.fog.fill'
  if (/阴/.test(text)) return 'cloud.fill'
  if (/多云|间/.test(text)) return 'cloud.sun.fill'
  if (/晴/.test(text)) return 'sun.max.fill'
  return 'cloud.fill'
}

// 天气文字 → 图标着色
function weatherTint(text) {
  if (!text) return C.text2
  if (/雷/.test(text)) return new Color('#ffd60a')
  if (/雨/.test(text)) return C.cold
  if (/雪/.test(text)) return new Color('#a9d2ff')
  if (/雾|霾|沙|尘/.test(text)) return C.text2
  if (/晴/.test(text) && !/多云|间/.test(text)) return new Color('#ffd60a')
  if (/多云|间/.test(text)) return new Color('#ffd60a') // 太阳半露，仍用暖色点缀
  return C.text2 // 阴/云
}

// 天气文字 → 彩色 emoji（DrawContext 里可直接渲染彩色字形）
function weatherEmoji(text) {
  if (!text) return '☁️'
  if (/雷/.test(text)) return '⛈️'
  if (/雪/.test(text)) return '🌨️'
  if (/雨/.test(text)) return '🌧️'
  if (/雾|霾|沙|尘/.test(text)) return '🌫️'
  if (/阴/.test(text)) return '☁️'
  if (/多云|间/.test(text)) return '⛅️'
  if (/晴/.test(text)) return '☀️'
  return '☁️'
}

// 温度 → 冷暖配色
function tempColor(t) {
  if (t == null) return '#6e6e73'
  if (t <= 5) return '#4aa3ff'
  if (t <= 14) return '#40c8e0'
  if (t <= 23) return '#34c759'
  if (t <= 29) return '#ffd60a'
  if (t <= 34) return '#ff9f0a'
  return '#ff453a'
}

function hexToRGB(h) {
  h = h.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function lerpHex(a, b, f) {
  const A = hexToRGB(a), B = hexToRGB(b)
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * f))
  return new Color(`#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`)
}

// ── 中号 / 大号：左圆弧表盘（中位温度）+ 右 6 信源彩色横条 ──
// 整张用 DrawContext 绘制后作为背景，跨设备自适应缩放。
function renderMain(w, data) {
  const W = 360, H = 170
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = true

  // 背景竖向渐变
  for (let y = 0; y < H; y++) {
    ctx.setFillColor(lerpHex('#0b1426', '#070a12', y / H))
    ctx.fillRect(new Rect(0, y, W, 1))
  }

  const multi = data.count >= 2 && data.max !== data.min
  const median = data.median != null ? Math.round(data.median) : null

  // ═══ 左：圆弧表盘 ═══
  const cx = 86, cy = 80, r = 54, lw = 11
  const A0 = 120, SWEEP = 300 // 底部开口
  // 轨道
  strokeArc(ctx, cx, cy, r, A0, A0 + SWEEP, new Color('#ffffff', 0.1), lw)
  // 数值弧：中位温度映射到 0~40℃
  if (median != null) {
    const frac = Math.max(0, Math.min(1, (median - 0) / 40))
    strokeArc(ctx, cx, cy, r, A0, A0 + SWEEP * frac, new Color(tempColor(median)), lw)
  }
  // 中心：emoji + 大温度 + 标签
  ctx.setTextAlignedCenter()
  if (data.text) {
    ctx.setFont(Font.systemFont(17))
    ctx.drawTextInRect(weatherEmoji(data.text), new Rect(cx - 30, cy - 40, 60, 22))
  }
  ctx.setFont(Font.boldSystemFont(34))
  ctx.setTextColor(new Color('#f5f5f7'))
  ctx.drawTextInRect(median != null ? `${median}°` : '—', new Rect(cx - 50, cy - 18, 100, 40))
  ctx.setFont(Font.systemFont(10))
  ctx.setTextColor(new Color('#8a93a6'))
  ctx.drawTextInRect(`中位 · ${data.count}源`, new Rect(cx - 50, cy + 24, 100, 14))

  // ═══ 右：信源彩色横条（条高随数量自适应）═══
  const n = data.providers.length
  const bx = 168, bw = 176
  const bh = n > 6 ? 13 : 16
  const gap = n > 6 ? 5 : 7
  const totalH = n * bh + (n - 1) * gap
  let by = (H - totalH) / 2 - 4
  const lo = (data.min != null ? data.min : 0) - 2
  const hi = (data.max != null ? data.max : 1) + 1
  const span = hi - lo || 1

  for (const p of data.providers) {
    const hasT = typeof p.temp === 'number'
    const frac = hasT ? Math.max(0.08, Math.min(1, (p.temp - lo) / span)) : 0.08
    const col = hasT ? (PC[p.id] || '#6e6e73') : '#5b6472'

    // 轨道
    const track = new Path()
    track.addRoundedRect(new Rect(bx, by, bw, bh), bh / 2, bh / 2)
    ctx.setFillColor(new Color('#ffffff', 0.08))
    ctx.addPath(track)
    ctx.fillPath()
    // 填充
    const fill = new Path()
    fill.addRoundedRect(new Rect(bx, by, bw * frac, bh), bh / 2, bh / 2)
    ctx.setFillColor(new Color(col, hasT ? 0.92 : 0.5))
    ctx.addPath(fill)
    ctx.fillPath()

    // 名称（左）
    ctx.setTextAlignedLeft()
    ctx.setFont(Font.mediumSystemFont(11))
    ctx.setTextColor(new Color('#f5f5f7', hasT ? 1 : 0.6))
    ctx.drawTextInRect(SHORT[p.id] || p.name, new Rect(bx + 9, by + 1, bw - 50, bh - 1))
    // 温度（右）
    ctx.setTextAlignedRight()
    ctx.setFont(Font.semiboldSystemFont(11))
    const isHot = multi && hasT && p.temp === data.max
    const isCold = multi && hasT && p.temp === data.min
    ctx.setTextColor(new Color(isHot ? '#ff453a' : isCold ? '#40c8e0' : '#f5f5f7', hasT ? 1 : 0.6))
    ctx.drawTextInRect(hasT ? `${Math.round(p.temp)}°` : '—', new Rect(bx + bw - 42, by + 1, 36, bh - 1))

    by += bh + gap
  }

  // 页脚：更新时间（右下）
  const time = data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  ctx.setTextAlignedRight()
  ctx.setFont(Font.systemFont(9))
  ctx.setTextColor(new Color('#6e6e73'))
  ctx.drawTextInRect(`更新 ${time}`, new Rect(W - 120, H - 16, 104, 12))

  w.backgroundImage = ctx.getImage()
}

// 用折线近似一段圆弧并描边（DrawContext 无原生 arc）。角度以屏幕坐标（y 向下）计。
function strokeArc(ctx, cx, cy, r, fromDeg, toDeg, color, width) {
  const steps = Math.max(8, Math.round(Math.abs(toDeg - fromDeg) / 4))
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const a = (fromDeg + (toDeg - fromDeg) * (i / steps)) * Math.PI / 180
    pts.push(new Point(cx + r * Math.cos(a), cy + r * Math.sin(a)))
  }
  const path = new Path()
  path.addLines(pts)
  ctx.setStrokeColor(color)
  ctx.setLineWidth(width)
  ctx.addPath(path)
  ctx.strokePath()
}

// ── 小号 ──
function renderSmall(w, data) {
  bg(w)
  w.setPadding(16, 16, 16, 16)

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(13)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(6)

  if (data.median != null) {
    const t = w.addText(`${Math.round(data.median)}°`)
    t.font = Font.boldSystemFont(36)
    t.textColor = C.text
    t.centerAlignText()
  }

  w.addSpacer(4)

  if (data.text) {
    const line = w.addStack()
    line.layoutHorizontally()
    line.centerAlignContent()
    line.addSpacer()
    const sym = SFSymbol.named(weatherSymbolName(data.text))
    if (sym) {
      const icon = line.addImage(sym.image)
      icon.imageSize = new Size(12, 12)
      icon.tintColor = weatherTint(data.text)
      line.addSpacer(4)
    }
    const wx = line.addText(data.text)
    wx.font = Font.mediumSystemFont(10)
    wx.textColor = C.text2
    line.addSpacer()
  }

  w.addSpacer(8)

  const dots = w.addStack()
  dots.layoutHorizontally()
  dots.addSpacer()
  for (const p of data.providers) {
    if (p.temp == null) continue
    const d = dots.addText('●')
    d.font = Font.regularSystemFont(6)
    d.textColor = new Color(PC[p.id] || '#6e6e73')
    dots.addSpacer(3)
  }
  dots.addSpacer()

  w.addSpacer(6)

  const ft = w.addText(`${data.count}信源 · ${data.max}° / ${data.min}°`)
  ft.font = Font.regularSystemFont(8)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 错误 ──
function renderError(w, msg) {
  w.backgroundColor = new Color('#0a0d16')
  w.addSpacer()
  const ic = w.addText('⚠')
  ic.textColor = C.dim
  ic.centerAlignText()
  w.addSpacer(4)
  const t = w.addText('无法加载')
  t.textColor = C.text
  t.font = Font.mediumSystemFont(14)
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
