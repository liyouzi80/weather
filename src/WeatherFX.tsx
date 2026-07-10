import { useEffect, useRef, useState } from 'react'
import { RainFXGPU, hasWebGPU } from './RainFXGPU'
import { SnowFXGPU } from './SnowFXGPU'
import { ThunderFXGPU } from './ThunderFXGPU'

// 模块级单次求值，避免每帧组件渲染重复调用 matchMedia
const REDUCED = typeof matchMedia !== 'undefined'
  && matchMedia('(prefers-reduced-motion: reduce)').matches
const prefersReduced = () => REDUCED

export type FxKind =
  | 'rain' | 'thunder' | 'snow' | 'fog' | 'haze'
  | 'clear-day' | 'clear-night'
  | 'cloudy' | 'cloudy-night'
  | 'overcast' | 'overcast-night'

export function fxKind(text: string | undefined, night: boolean): FxKind {
  if (text) {
    if (/雷/.test(text)) return 'thunder'
    if (/雨/.test(text)) return 'rain'
    if (/雪/.test(text)) return 'snow'
    // 霾/沙/尘是空气污染，走灰黄霾霭特效；雾是水汽，走白色雾气
    if (/霾|沙|尘/.test(text)) return 'haze'
    if (/雾/.test(text)) return 'fog'
    if (/阴/.test(text)) return night ? 'overcast-night' : 'overcast'
    if (/多云|间/.test(text)) return night ? 'cloudy-night' : 'cloudy'
  }
  return night ? 'clear-night' : 'clear-day'
}

const isCloudKind = (k: FxKind) =>
  k === 'cloudy' || k === 'cloudy-night' || k === 'overcast' || k === 'overcast-night'

const TAU = Math.PI * 2
interface Drop  { x: number; y: number; len: number; vy: number; vx: number }
interface Flake { x: number; y: number; r: number; vy: number; vx: number; sway: number; ph: number; layer: number }
interface Star  { x: number; y: number; r: number; ph: number; sp: number; bright: boolean }
interface Shoot { x: number; y: number; vx: number; vy: number; life: number }
interface FogBand   { y: number; ph: number; spd: number; o: number; h: number }
interface Mote      { x: number; y: number; r: number; vx: number; vy: number; o: number }
interface Bolt      { pts: [number, number][]; branches: { pts: [number, number][] }[] }
// A drifting cloud sprite: a baked Perlin-noise texture + world position/drift.
interface Cloud {
  tex: HTMLCanvasElement
  w: number; h: number
  x: number; y: number          // world top-left
  vx: number; layer: number; ph: number; alpha: number
}

type CloudPalette = 'cloudy' | 'cloudy-night' | 'overcast' | 'overcast-night'

// Sunrise/sunset warm tint. warmth 0 = no tint (day/night), 1 = peak twilight.
export interface CloudTint { r: number; g: number; b: number; warmth: number }

type RGB = [number, number, number]

// Per-palette cloud volume colors: lit top → mid → shadowed bottom.
// Ported 1:1 from the native iOS scene (WeatherScene.swift CloudPalette) so the
// PWA clouds match the iOS look the user prefers.
const CLOUD_PAL: Record<CloudPalette, { top: RGB; mid: RGB; bot: RGB }> = {
  'cloudy':         { top: [180, 194, 212], mid: [128, 148, 176], bot: [78, 94, 122] },
  'cloudy-night':   { top: [129, 150, 186], mid: [84, 104, 140],  bot: [38, 52, 78] },
  'overcast':       { top: [154, 164, 182], mid: [112, 122, 142], bot: [72, 79, 96] },
  'overcast-night': { top: [92, 102, 120],  mid: [62, 70, 88],    bot: [28, 34, 48] },
}

// ── Seeded 2D Perlin noise + fBm ──────────────────────────────────────────────
// Stand-in for iOS GKPerlinNoiseSource: a seeded gradient-noise field summed over
// octaves, used to bake fluffy volumetric cloud textures matching the native app.
function makePerlin(seed: number): (x: number, y: number) => number {
  const perm = new Uint8Array(256)
  for (let i = 0; i < 256; i++) perm[i] = i
  let s = (seed | 0) || 1
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000 }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t
  }
  const p = new Uint8Array(512)
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255]
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a: number, b: number, t: number) => a + t * (b - a)
  const grad = (h: number, x: number, y: number) => {
    switch (h & 3) {
      case 0:  return  x + y
      case 1:  return -x + y
      case 2:  return  x - y
      default: return -x - y
    }
  }
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = fade(xf), v = fade(yf)
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1]
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1]
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
    return lerp(x1, x2, v)   // roughly [-1, 1]
  }
}

// ── Astronomical helpers ──────────────────────────────────────────────────────

// Simplified Meeus moon position (accurate to ~1°). Returns altitude, azimuth
// (N=0°, E=90°, S=180°, W=270°), and elongation (0°=new moon, 180°=full).
function moonAltAzPhase(now: Date, latDeg: number, lonDeg: number): { alt: number; az: number; elongation: number } {
  const JD = now.getTime() / 86400000 + 2440587.5
  const T  = (JD - 2451545.0) / 36525
  const R  = Math.PI / 180
  const s  = (d: number) => Math.sin(d * R)
  const c  = (d: number) => Math.cos(d * R)
  const n  = (x: number) => ((x % 360) + 360) % 360

  // Moon mean elements (degrees)
  const Lp = n(218.3164477 + 481267.88123421 * T)
  const D  = n(297.8501921 + 445267.1114034  * T)
  const M  = n(357.5291092 + 35999.0502909   * T)
  const Mp = n(134.9633964 + 477198.8675055  * T)
  const F  = n(93.2720950  + 483202.0175233  * T)

  // Longitude and latitude perturbations (degrees)
  const dL = 6.289*s(Mp) + 1.274*s(2*D-Mp) + 0.658*s(2*D)
           + 0.214*s(2*Mp) - 0.185*s(M) - 0.114*s(2*F)
           + 0.059*s(2*D-2*Mp) + 0.057*s(2*D-M-Mp)
  const dB = 5.128*s(F) + 0.280*s(Mp+F) + 0.277*s(Mp-F)
           + 0.173*s(2*D-F) + 0.055*s(2*D-Mp+F) - 0.046*s(2*D-Mp-F)

  const lam = n(Lp + dL)        // ecliptic longitude (degrees)
  const bet = dB                  // ecliptic latitude  (degrees)
  const eps = 23.439 - 0.013 * T // obliquity (degrees)

  // Ecliptic → equatorial
  const sinDec = s(bet)*c(eps) + c(bet)*s(eps)*s(lam)
  const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)))
  const decD   = decRad / R
  const raRad  = Math.atan2(s(lam)*c(eps) - Math.tan(bet*R)*s(eps), c(lam))
  const raHrs  = ((raRad / R + 360) % 360) / 15  // right ascension in hours

  // Local hour angle (degrees, 0 = on meridian, <180 = west)
  const JD0  = Math.floor(JD - 0.5) + 0.5
  const T0   = (JD0 - 2451545.0) / 36525
  const GMST = ((6.697374558 + 2400.0513369*T0 + 1.0027379093*(JD-JD0)*24) % 24 + 24) % 24
  const HA   = ((GMST + lonDeg/15 - raHrs) * 15 + 360) % 360

  // Horizontal coordinates
  const sinAlt = s(decD)*s(latDeg) + c(decD)*c(latDeg)*c(HA)
  const altD   = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / R
  const cosAlt = Math.cos(altD * R)
  const cosAz  = cosAlt < 0.01 ? 0 : (s(decD) - sinAlt*s(latDeg)) / (cosAlt * c(latDeg))
  const arcAz  = Math.acos(Math.max(-1, Math.min(1, cosAz))) / R  // [0, 180]
  const az     = HA < 180 ? 360 - arcAz : arcAz                   // N=0, E=90, S=180, W=270

  // Moon elongation (approximate Sun longitude)
  const sunLam = n(280.46 + 36000.772*T + 1.915*s(357.5291092 + 35999.0502909*T))
  const elongation = n(lam - sunLam)  // 0=new moon, 180=full moon

  return { alt: altD, az, elongation }
}

// 真实月面反照率贴图（与 iOS 共用 /moon-albedo.png，CC BY-SA 3.0 Gregory H. Revera）。
const moonAlbedoImg: HTMLImageElement | null =
  typeof Image !== 'undefined' ? new Image() : null
let moonAlbedoReady = false
if (moonAlbedoImg) {
  moonAlbedoImg.onload = () => { moonAlbedoReady = true }
  moonAlbedoImg.src = '/moon-albedo.png'
}
// 离屏 sprite 缓存（月相一会话内基本不变，避免每帧逐像素）。键含 elongation(0.5°) 与半径。
const moonSpriteCache = new Map<string, HTMLCanvasElement>()

// 用真实月面 + 物理 Lambert 相位光照烘焙离屏月亮（与 iOS makeMoonTexture 同一套数学）。
function buildMoonSprite(r: number, elongation: number): HTMLCanvasElement | null {
  if (!moonAlbedoReady || !moonAlbedoImg) return null
  const P = Math.PI
  const er = elongation * P / 180
  const se = Math.sin(er), ce = Math.cos(er)
  const illum = (1 - ce) / 2
  const D = Math.max(8, Math.round(r / 0.30))   // 整张含光晕，盘径=0.30*D
  const cx = D / 2, diskR = D * 0.30, haloR = D / 2

  // 把月面绘入比月盘略大的方框（内缩 inset，使盘缘采样落在月面内、避开暗边）
  const inset = 0.965
  const ac = document.createElement('canvas'); ac.width = D; ac.height = D
  const actx = ac.getContext('2d'); if (!actx) return null
  const ds = (diskR * 2) / inset
  actx.drawImage(moonAlbedoImg, cx - ds / 2, cx - ds / 2, ds, ds)
  const alb = actx.getImageData(0, 0, D, D).data

  const out = document.createElement('canvas'); out.width = D; out.height = D
  const octx = out.getContext('2d'); if (!octx) return null
  const img = octx.createImageData(D, D); const dat = img.data
  const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
  const ss = (a: number, b: number, x: number) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const dx = x - cx, dy = y - cx, dist = Math.hypot(dx, dy)
      let r0 = 0, g0 = 0, b0 = 0, a = 0
      let halo = 0
      if (dist <= haloR) {
        const ht = c01((dist - diskR * 0.85) / (haloR - diskR * 0.85))
        halo = (1 - ht) * (1 - ht) * 0.05 * (0.5 + 0.5 * illum)
      }
      if (dist <= diskR + 1.2) {
        const nx = dx / diskR, ny = dy / diskR
        const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
        const ndotl = nx * se - z * ce      // Lambert: N·L, L=(sin e,0,-cos e)
        const ai = (y * D + x) * 4
        const ar = alb[ai], ag = alb[ai + 1], ab = alb[ai + 2]
        const lit = c01(ndotl)
        const bright = 0.42 + 0.58 * Math.pow(lit, 0.5)
        const aDisk = ss(-0.02, 0.12, ndotl) * (1 - ss(diskR - 1.5, diskR + 0.5, dist))
        if (aDisk > 0) { r0 = ar * bright; g0 = ag * bright; b0 = ab * bright; a = aDisk }
        else { r0 = 200; g0 = 210; b0 = 225; a = halo }
      } else if (dist <= haloR) {
        r0 = 200; g0 = 210; b0 = 225; a = halo
      }
      const o = (y * D + x) * 4
      dat[o] = c01(r0 / 255) * 255; dat[o + 1] = c01(g0 / 255) * 255
      dat[o + 2] = c01(b0 / 255) * 255; dat[o + 3] = c01(a) * 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

// Draw realistic moon (real surface + physical phase). elongation: 0=new, 180=full (deg).
function drawMoon(ctx: CanvasRenderingContext2D, mx: number, my: number, r: number, elongation: number): void {
  const key = `${Math.round(elongation * 2)}_${Math.round(r)}`
  let sprite = moonSpriteCache.get(key)
  if (!sprite) {
    const built = buildMoonSprite(r, elongation)
    if (!built) {
      // 贴图未就绪：画简单发光圆占位，下一帧升级为真实月面
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 1.5)
      g.addColorStop(0,    'rgba(240,245,255,0.90)')
      g.addColorStop(0.65, 'rgba(235,242,255,0.60)')
      g.addColorStop(1,    'rgba(210,225,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(mx, my, r * 1.5, 0, TAU); ctx.fill()
      return
    }
    if (moonSpriteCache.size > 8) moonSpriteCache.clear()
    moonSpriteCache.set(key, built); sprite = built
  }
  ctx.drawImage(sprite, mx - sprite.width / 2, my - sprite.height / 2)
}

// ── Component ────────────────────────────────────────────────────────────────

export function WeatherFX({ kind, tint, lat, lon }: { kind: FxKind; tint?: CloudTint; lat?: number; lon?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // Stable dep so the effect only rebuilds when the tint meaningfully changes
  const tintKey = tint ? `${tint.r},${tint.g},${tint.b},${tint.warmth.toFixed(2)}` : ''

  // 雨/雷/雪优先走 WebGPU（GPU compute 粒子，更丝滑）；取设备失败时 onFallback 翻转，落回 Canvas 2D。
  const [gpuFailed, setGpuFailed] = useState(false)
  const gpuKind = kind === 'rain' || kind === 'thunder' || kind === 'snow'
  const useGPU = !gpuFailed && gpuKind && hasWebGPU() && !prefersReduced()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, dpr = 1, W_prev = 0, H_prev = 0
    let sunGrad: CanvasGradient | null = null
    let moonGrad: CanvasGradient | null = null
    // moon position (clear-night & cloudy-night)
    let moonX = 0, moonY = 0, moonR = 0
    let moonElongation = 135  // degrees; 0=new moon, 180=full moon
    let moonVisible = true

    const rainL: Drop[][] = [[], [], []]
    const flakes: Flake[] = []
    const stars: Star[] = []
    const fogBands: FogBand[] = []
    const motes: Mote[] = []

    // Cloud scene: each cluster is a baked sprite + world position / drift.
    const clouds: Cloud[] = []
    let fogStripe: HTMLCanvasElement | null = null  // 雾/霾条纹预烘焙，fog/haze init 时填充
    // High cirrus veil (clear-day enhancement): one wide baked sprite that drifts.
    let cirrus: HTMLImageElement | null = null
    let cirrusW = 0, cirrusH = 0, cirrusX = 0
    let cancelled = false   // guards async SVG image loads against unmount

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

    // Bake a fluffy volumetric cloud sprite from a seeded Perlin noise field,
    // ported from the native iOS scene (WeatherScene.buildNoiseCloudTex):
    //  · multi-octave noise → wispy density
    //  · elliptical envelope (wide, short) carves the cloud shape + feathers edges
    //  · vertical lit-top→shadowed-bottom volume color + noise brightness lift
    // `tint` (sunrise/sunset warmth) is blended into the volume colors so the
    // clouds glow warm at golden hour; the effect re-bakes when the tint changes.
    const buildNoiseCloudTex = (palette: CloudPalette, seed: number): HTMLCanvasElement => {
      const W0 = 256, H0 = 140
      const P = CLOUD_PAL[palette]
      const wa = tint ? tint.warmth : 0
      const warm = (c: RGB, amt: number): RGB => wa > 0
        ? [c[0] + (tint!.r - c[0]) * amt * wa, c[1] + (tint!.g - c[1]) * amt * wa, c[2] + (tint!.b - c[2]) * amt * wa]
        : c
      const top = warm(P.top, 0.55), mid = warm(P.mid, 0.34), bot = warm(P.bot, 0.12)

      const noise = makePerlin(seed)
      const fbm = (x: number, y: number): number => {
        let amp = 1, freq = 2.2, sum = 0, norm = 0
        for (let o = 0; o < 6; o++) { sum += amp * noise(x * freq, y * freq); norm += amp; amp *= 0.58; freq *= 2.2 }
        return sum / norm
      }
      const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
      const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
      const vol = (t: number): RGB => {
        if (t < 0.5) { const k = t * 2; return [top[0] + (mid[0] - top[0]) * k, top[1] + (mid[1] - top[1]) * k, top[2] + (mid[2] - top[2]) * k] }
        const k = (t - 0.5) * 2; return [mid[0] + (bot[0] - mid[0]) * k, mid[1] + (bot[1] - mid[1]) * k, mid[2] + (bot[2] - mid[2]) * k]
      }

      const off = document.createElement('canvas')
      off.width = W0; off.height = H0
      const o = off.getContext('2d')!
      const img = o.createImageData(W0, H0)
      const d = img.data
      for (let y = 0; y < H0; y++) {
        const ny = y / (H0 - 1)
        const ey = (ny - 0.42) * 2.3               // cloud body centered slightly high, vertically tight
        const [cr, cg, cb] = vol(clamp01(ny))
        for (let x = 0; x < W0; x++) {
          const nx = x / (W0 - 1)
          const ex = (nx - 0.5) * 2.0
          const env = Math.max(0, 1 - (ex * ex + ey * ey))          // elliptical envelope 0..1
          const n = clamp01(0.5 + 0.75 * fbm(nx * 2.4, ny * 1.3))   // noise → 0..1 (widened)
          const nnC = smooth(0.34, 0.80, n)                          // boost contrast: clumps sharpen, thin haze drops
          const density = env * (0.34 + 0.66 * nnC)
          const a = smooth(0.36, 0.66, density)                      // alpha: solid core, no hazy rim
          const lift = (nnC - 0.5) * 0.18 * 255                      // lit clumps brighter → depth, less grey
          const i = (y * W0 + x) * 4
          d[i]     = clamp01((cr + lift) / 255) * 255
          d[i + 1] = clamp01((cg + lift) / 255) * 255
          d[i + 2] = clamp01((cb + lift) / 255) * 255
          d[i + 3] = a * 255
        }
      }
      o.putImageData(img, 0, 0)
      return off
    }

    // Build the drifting cloud scene from baked noise textures — layout ported
    // from the iOS setupClouds (3 depth layers, sprite h = w*0.52, ± drift).
    const buildCloudScene = () => {
      clouds.length = 0
      const overcast = kind === 'overcast' || kind === 'overcast-night'
      const palette = kind as CloudPalette
      // 3 seeds per weather so drifting sprites don't visibly repeat.
      const texes = [0, 1, 2].map(k => buildNoiseCloudTex(palette, (kind.charCodeAt(0) * 7 + k * 101 + 1) | 0))
      const sc = W / 393   // scale iOS point sizes/speeds to the actual width

      // [count, wLo, wHi, alphaLo, alphaHi, yLo, yHi, vLo, vHi] — iOS values.
      // y is a fraction measured from the BOTTOM (SpriteKit y-up); converted below.
      const layers = overcast
        ? [
            [3, 280, 380, 0.72, 0.90, 0.74, 0.99, 10, 18],
            [3, 340, 460, 0.80, 0.95, 0.64, 0.96, 16, 26],
            [2, 400, 540, 0.74, 0.92, 0.54, 0.88, 24, 38],
          ]
        : [
            [2, 240, 340, 0.60, 0.78, 0.78, 0.99,  9, 16],
            [2, 300, 420, 0.66, 0.84, 0.70, 0.96, 14, 24],
            [2, 360, 500, 0.60, 0.80, 0.60, 0.90, 22, 36],
          ]

      for (let li = 0; li < 3; li++) {
        const [count, wLo, wHi, aLo, aHi, yLo, yHi, vLo, vHi] = layers[li]
        for (let i = 0; i < count; i++) {
          const w = rnd(wLo, wHi) * sc
          const h = w * 0.52
          const yFrac = rnd(yLo, yHi)              // fraction from bottom
          const cy = (1 - yFrac) * H               // → top-anchored canvas y (center)
          const vx = (Math.random() < 0.5 ? 1 : -1) * rnd(vLo, vHi) * sc
          clouds.push({
            tex: texes[Math.floor(Math.random() * texes.length)],
            w, h,
            x: rnd(-w * 0.3, W + w * 0.3),
            y: cy - h / 2,
            vx, layer: li, ph: rnd(0, TAU),
            alpha: rnd(aLo, aHi),
          })
        }
      }
    }

    // Bake a wide high-cirrus veil: horizontally-stretched fractal noise turned
    // into white wisps (R channel → alpha), faded toward the horizon so the
    // lower content area stays clean. Warm-tinted at sunrise/sunset.
    const buildCirrus = () => {
      const sw = Math.ceil(W * 1.8), sh = Math.ceil(H)
      cirrusW = sw; cirrusH = sh
      // Wisp color: white by day, mixed toward the twilight tint at golden hour.
      const wa = tint ? tint.warmth : 0
      const wr = wa > 0 ? Math.round(255 + (tint!.r - 255) * 0.45 * wa) : 255
      const wg = wa > 0 ? Math.round(255 + (tint!.g - 255) * 0.45 * wa) : 255
      const wb = wa > 0 ? Math.round(255 + (tint!.b - 255) * 0.45 * wa) : 255
      const seedA = Math.floor(Math.random() * 900)
      const seedB = Math.floor(Math.random() * 900)
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${(sw * dpr).toFixed(0)}" height="${(sh * dpr).toFixed(0)}" viewBox="0 0 ${sw} ${sh}">` +
        `<defs>` +
          `<filter id="c" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
            // main streaky cirrus band
            `<feTurbulence type="fractalNoise" baseFrequency="0.004 0.023" numOctaves="7" seed="${seedA}" result="n"/>` +
            `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${(wr/255).toFixed(3)} 0 0 0 0 ${(wg/255).toFixed(3)} 0 0 0 0 ${(wb/255).toFixed(3)} 1.05 0 0 0 -0.2" result="w"/>` +
            `<feComponentTransfer in="w" result="wc"><feFuncA type="gamma" amplitude="1.7" exponent="2.2" offset="0"/></feComponentTransfer>` +
            `<feGaussianBlur in="wc" stdDeviation="0.5"/>` +
          `</filter>` +
          `<filter id="c2" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
            // finer, fainter second layer for depth
            `<feTurbulence type="fractalNoise" baseFrequency="0.007 0.034" numOctaves="6" seed="${seedB}" result="n"/>` +
            `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${(wr/255).toFixed(3)} 0 0 0 0 ${(wg/255).toFixed(3)} 0 0 0 0 ${(wb/255).toFixed(3)} 0.8 0 0 0 -0.34"/>` +
          `</filter>` +
          `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="#fff" stop-opacity="0.82"/>` +
            `<stop offset="0.5" stop-color="#fff" stop-opacity="0.5"/>` +
            `<stop offset="0.84" stop-color="#fff" stop-opacity="0"/>` +
          `</linearGradient>` +
          `<mask id="m"><rect width="${sw}" height="${sh}" fill="url(#fade)"/></mask>` +
        `</defs>` +
        `<g mask="url(#m)">` +
          `<rect width="${sw}" height="${sh}" filter="url(#c)" opacity="0.78"/>` +
          `<rect width="${sw}" height="${sh}" filter="url(#c2)" opacity="0.5"/>` +
        `</g>` +
      `</svg>`
      const img = new Image()
      img.onload = () => { if (cancelled) return; cirrus = img; if (reduced) requestAnimationFrame(frame) }
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    }

    const resize = () => {
      const Wn = window.innerWidth, Hn = window.innerHeight
      const widthChanged = Wn !== W_prev
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width  = Wn * dpr; canvas.height = Hn * dpr
      canvas.style.width  = Wn + 'px'; canvas.style.height = Hn + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const rescale = W_prev > 0
      if (rescale) {
        const sx = Wn / W_prev, sy = Hn / H_prev
        for (const l of rainL) for (const d of l) { d.x *= sx; d.y *= sy }
        for (const f of flakes) { f.x *= sx; f.y *= sy }
        for (const s of stars)  { s.x *= sx; s.y *= sy }
        for (const b of fogBands) { b.y *= sy; b.h *= sy }
        for (const m of motes)  { m.x *= sx; m.y *= sy }
      }
      W = Wn; H = Hn; W_prev = Wn; H_prev = Hn

      if (kind === 'clear-day') {
        // At twilight the sun glow drops lower, warms toward orange and intensifies
        const wa = tint ? tint.warmth : 0
        const sy = -H * 0.05 + wa * H * 0.18
        sunGrad = ctx.createRadialGradient(W * 0.78, sy, 0, W * 0.78, sy, H * 0.72)
        sunGrad.addColorStop(0,    `rgba(255,${Math.round(215 - 55 * wa)},${Math.round(100 - 30 * wa)},${(0.28 + 0.16 * wa).toFixed(2)})`)
        sunGrad.addColorStop(0.4,  `rgba(255,${Math.round(185 - 45 * wa)},${Math.round(65 - 20 * wa)},${(0.12 + 0.10 * wa).toFixed(2)})`)
        sunGrad.addColorStop(0.75, `rgba(255,${Math.round(150 - 40 * wa)},40,${(0.04 + 0.05 * wa).toFixed(2)})`)
        sunGrad.addColorStop(1,    'rgba(255,130,30,0)')
      }
      if (kind === 'clear-night' || kind === 'cloudy-night') {
        moonR = H * 0.042
        moonVisible = true
        if (lat != null && lon != null) {
          const mp = moonAltAzPhase(new Date(), lat, lon)
          moonElongation = mp.elongation
          if (mp.alt < 5) {
            moonVisible = false
          } else {
            // azimuth → X: E=right, S=center, W=left (sin mapping)
            moonX = W * 0.5 * (1 + Math.sin(mp.az * Math.PI / 180))
            // altitude → Y: 90°=near top (5%), 5°=near 40%
            moonY = H * (0.05 + 0.36 * (1 - (mp.alt - 5) / 85))
            // clamp so moon stays in the upper portion of the canvas
            moonX = Math.max(moonR, Math.min(W - moonR, moonX))
            moonY = Math.max(moonR, Math.min(H * 0.44, moonY))
          }
        } else {
          // fallback when no coordinates provided
          moonX = kind === 'clear-night' ? W * 0.80 : W * 0.26
          moonY = kind === 'clear-night' ? H * 0.11 : H * 0.14
        }
        if (kind === 'clear-night' && moonVisible) {
          moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, H * 0.30)
          moonGrad.addColorStop(0,   'rgba(240,248,255,0.12)')
          moonGrad.addColorStop(0.5, 'rgba(210,230,255,0.04)')
          moonGrad.addColorStop(1,   'rgba(180,205,255,0)')
        } else {
          moonGrad = null
        }
      }

      // Clouds: rebuild only when width changes — height-only resize (Safari URL-bar) must not re-randomize positions
      if (rescale && isCloudKind(kind) && widthChanged) buildCloudScene()
    }

    resize()
    window.addEventListener('resize', resize)

    const reduced = prefersReduced()
    const area = W * H

    if (kind === 'rain' || kind === 'thunder') {
      const cfg = [
        { n: Math.min(90,  area / 6000),  lenMin: 8,  lenMax: 18, vyMin: 200, vyMax: 380 },
        { n: Math.min(130, area / 4200),  lenMin: 16, lenMax: 28, vyMin: 380, vyMax: 580 },
        { n: Math.min(55,  area / 10000), lenMin: 28, lenMax: 48, vyMin: 580, vyMax: 800 },
      ]
      for (let li = 0; li < 3; li++) {
        const c = cfg[li]
        for (let i = 0; i < Math.round(c.n); i++) {
          const vy = rnd(c.vyMin, c.vyMax)
          rainL[li].push({ x: rnd(0, W), y: rnd(0, H), len: rnd(c.lenMin, c.lenMax), vy, vx: -vy * 0.28 })
        }
      }

    } else if (kind === 'snow') {
      const n = Math.round(Math.min(220, area / 5500))
      for (let i = 0; i < n; i++) {
        const t = i / n
        const [rMin, rMax, vyMin, vyMax, layer] = t < 0.6
          ? [0.8, 1.6, 10, 24, 0]
          : t < 0.9 ? [1.8, 3.4, 26, 55, 1]
          : [3.6, 5.5, 55, 88, 2]
        flakes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(rMin, rMax), vy: rnd(vyMin, vyMax), vx: rnd(-8, 8), sway: rnd(8, 30), ph: rnd(0, TAU), layer })
      }

    } else if (kind === 'clear-night') {
      const n = Math.round(Math.min(160, area / 7500))
      for (let i = 0; i < n; i++)
        stars.push({ x: rnd(0, W), y: rnd(0, H * 0.8), r: rnd(0.4, 2.2), ph: rnd(0, TAU), sp: rnd(0.6, 2.5), bright: Math.random() < 0.07 })

    } else if (isCloudKind(kind)) {
      // Sparse stars behind clouds — only when gaps exist (cloudy night, not overcast)
      if (kind === 'cloudy-night') {
        const n = Math.round(Math.min(55, area / 20000))
        for (let i = 0; i < n; i++)
          stars.push({ x: rnd(0, W), y: rnd(0, H * 0.65), r: rnd(0.3, 1.4), ph: rnd(0, TAU), sp: rnd(0.5, 1.8), bright: false })
      }
      buildCloudScene()

    } else if (kind === 'fog' || kind === 'haze') {
      // Horizontal drifting bands + slow volumetric blobs for depth.
      // 霾时霾层更密、更偏地平线下方（能见度低、地面方向最浓）。
      const haze = kind === 'haze'
      const bandLo = haze ? 0.32 : 0.06
      for (let i = 0; i < (haze ? 11 : 9); i++)
        fogBands.push({ y: rnd(bandLo, 0.96) * H, ph: rnd(0, TAU), spd: rnd(0.3, 0.8), o: rnd(0.10, haze ? 0.22 : 0.19), h: rnd(60, 140) })
      const nb = Math.round(Math.min(7, area / 70000))
      for (let i = 0; i < nb; i++)
        motes.push({ x: rnd(0, W), y: rnd(0.1, 0.9) * H, r: rnd(H * 0.10, H * 0.20), vx: rnd(5, 16) * (Math.random() < 0.5 ? -1 : 1), vy: rnd(-3, 3), o: rnd(0.05, 0.11) })

      // 预烘焙横条纹（透明→不透明→透明），帧循环里用 drawImage 代替 createLinearGradient
      const stripColor = haze ? '168,156,128' : '215,220,230'
      const midLo = haze ? 0.40 : 0.38
      const midHi = haze ? 0.60 : 0.62
      fogStripe = document.createElement('canvas')
      fogStripe.width = 4; fogStripe.height = 256
      const sc = fogStripe.getContext('2d')!
      const sg = sc.createLinearGradient(0, 0, 0, 256)
      sg.addColorStop(0,     `rgba(${stripColor},0)`)
      sg.addColorStop(midLo, `rgba(${stripColor},1)`)
      sg.addColorStop(midHi, `rgba(${stripColor},1)`)
      sg.addColorStop(1,     `rgba(${stripColor},0)`)
      sc.fillStyle = sg; sc.fillRect(0, 0, 4, 256)

    } else {
      // clear-day: sun motes + high cirrus veil
      const n = Math.round(Math.min(80, area / 14000))
      for (let i = 0; i < n; i++)
        motes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.8, 2.8), vx: rnd(-5, 5), vy: rnd(-18, -5), o: rnd(0.12, 0.35) })
      buildCirrus()
    }

    let flash = 0, nextBolt = rnd(1.2, 3.5), bolt: Bolt | null = null
    const makeBolt = (): Bolt => {
      const pts: [number, number][] = [[rnd(W * 0.15, W * 0.85), 0]]
      const segs = 7 + Math.floor(Math.random() * 5)
      for (let i = 1; i <= segs; i++)
        pts.push([pts[i - 1][0] + rnd(-55, 55), (H * 0.72 * i) / segs])
      const branches: { pts: [number, number][] }[] = []
      const bi = 2 + Math.floor(Math.random() * 3)
      if (bi < pts.length - 1) {
        const bpts: [number, number][] = [pts[bi]]
        for (let i = 1; i <= 3 + Math.floor(Math.random() * 2); i++)
          bpts.push([bpts[i - 1][0] + rnd(-40, 40), bpts[0][1] + (H * 0.28 * i) / 4])
        branches.push({ pts: bpts })
      }
      return { pts, branches }
    }

    let shoot: Shoot | null = null
    let nextShoot = rnd(8, 22)
    let dayT = 0

    // 不锁帧：所有特效随屏幕刷新率全速渲染（ProMotion 机型可达 120fps），保持最大丝滑度。
    const FRAME_MS = 0
    let raf = 0, last = 0

    const frame = (now: number) => {
      const elapsed = now - last
      if (FRAME_MS && elapsed < FRAME_MS) { raf = requestAnimationFrame(frame); return }
      const dt = Math.min(0.05, elapsed / 1000)
      last = now
      ctx.clearRect(0, 0, W, H)

      switch (kind) {
        // ── Rain / Thunder ───────────────────────────────────────────────────
        case 'rain':
        case 'thunder': {
          const styles: [string, number][] = [
            ['rgba(174,208,242,0.28)', 0.6],
            ['rgba(174,208,242,0.52)', 1.0],
            ['rgba(200,225,252,0.76)', 1.8],
          ]
          ctx.lineCap = 'round'
          for (let li = 0; li < 3; li++) {
            ctx.strokeStyle = styles[li][0]; ctx.lineWidth = styles[li][1]
            ctx.beginPath()
            for (const d of rainL[li]) {
              ctx.moveTo(d.x, d.y)
              ctx.lineTo(d.x + (d.vx / d.vy) * d.len, d.y + d.len)
            }
            ctx.stroke()
            if (!reduced) for (const d of rainL[li]) {
              d.y += d.vy * dt; d.x += d.vx * dt
              if (d.y > H + d.len) { d.y = -d.len; d.x = rnd(0, W) }
            }
          }
          if (kind === 'thunder' && !reduced) {
            nextBolt -= dt
            if (nextBolt <= 0) { flash = 1; nextBolt = rnd(1.5, 5.0); bolt = makeBolt() }
            if (flash > 0) {
              ctx.fillStyle = `rgba(225,235,255,${flash * 0.55})`
              ctx.fillRect(0, 0, W, H)
              if (bolt && flash > 0.2) {
                ctx.save()
                ctx.lineCap = 'round'
                // 多层描边模拟发光（替代 shadowBlur，避免移动端全屏高斯模糊开销）
                const traceBolt = (pts: [number, number][]) => {
                  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
                  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
                }
                // 主干：宽→中→细
                ctx.lineWidth = 12; ctx.strokeStyle = `rgba(140,175,255,${flash * 0.15})`
                traceBolt(bolt.pts); ctx.stroke()
                ctx.lineWidth = 6;  ctx.strokeStyle = `rgba(185,210,255,${flash * 0.32})`
                traceBolt(bolt.pts); ctx.stroke()
                ctx.lineWidth = 2.4; ctx.strokeStyle = `rgba(255,255,255,${flash * 0.98})`
                traceBolt(bolt.pts); ctx.stroke()
                // 分支
                for (const br of bolt.branches) {
                  ctx.lineWidth = 6;   ctx.strokeStyle = `rgba(140,175,255,${flash * 0.10})`
                  traceBolt(br.pts); ctx.stroke()
                  ctx.lineWidth = 3;   ctx.strokeStyle = `rgba(185,210,255,${flash * 0.22})`
                  traceBolt(br.pts); ctx.stroke()
                  ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(210,230,255,${flash * 0.65})`
                  traceBolt(br.pts); ctx.stroke()
                }
                ctx.restore()
              }
              flash -= dt * 3.2; if (flash < 0) flash = 0
            }
          }
          break
        }

        // ── Snow ─────────────────────────────────────────────────────────────
        case 'snow': {
          ctx.fillStyle = '#fff'
          for (let li = 0; li < 3; li++) {
            ctx.globalAlpha = [0.35, 0.65, 0.92][li]
            ctx.beginPath()
            for (const f of flakes) {
              if (f.layer !== li) continue
              ctx.moveTo(f.x + f.r, f.y)
              ctx.arc(f.x, f.y, f.r, 0, TAU)
            }
            ctx.fill()
          }
          ctx.globalAlpha = 1
          if (!reduced) for (const f of flakes) {
            f.ph += dt * 1.4; f.y += f.vy * dt
            f.x += (f.vx + Math.sin(f.ph) * f.sway) * dt
            if (f.y > H + f.r) { f.y = -f.r; f.x = rnd(0, W) }
            if (f.x > W + 20) f.x = -20; else if (f.x < -20) f.x = W + 20
          }
          break
        }

        // ── Clear Night ───────────────────────────────────────────────────────
        case 'clear-night': {
          if (moonGrad) { ctx.fillStyle = moonGrad; ctx.fillRect(0, 0, W, H) }

          ctx.fillStyle = '#fff'
          for (const s of stars) {
            const a = 0.3 + 0.65 * (0.5 + 0.5 * Math.sin(s.ph))
            ctx.globalAlpha = a
            if (s.bright) {
              ctx.save()
              ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.5, 0, TAU); ctx.fill()
              ctx.strokeStyle = `rgba(255,255,230,${a * 0.6})`; ctx.lineWidth = 0.8
              const arm = s.r * 5
              ctx.beginPath()
              ctx.moveTo(s.x - arm, s.y); ctx.lineTo(s.x + arm, s.y)
              ctx.moveTo(s.x, s.y - arm); ctx.lineTo(s.x, s.y + arm)
              ctx.stroke()
              ctx.restore()
            } else {
              ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill()
            }
            if (!reduced) s.ph += dt * s.sp
          }
          ctx.globalAlpha = 1

          if (moonVisible) drawMoon(ctx, moonX, moonY, moonR, moonElongation)

          if (!reduced) {
            nextShoot -= dt
            if (nextShoot <= 0 && !shoot) {
              const angle = rnd(0.25, 0.65), spd = rnd(H * 0.22, H * 0.35)
              shoot = { x: rnd(W * 0.05, W * 0.65), y: rnd(0, H * 0.3), vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: 1 }
              nextShoot = rnd(10, 26)
            }
            if (shoot) {
              const tg = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 0.35, shoot.y - shoot.vy * 0.35)
              tg.addColorStop(0, `rgba(255,255,220,${shoot.life * 0.92})`)
              tg.addColorStop(1, 'rgba(255,255,200,0)')
              ctx.strokeStyle = tg; ctx.lineWidth = 1.8
              ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y)
              ctx.lineTo(shoot.x - shoot.vx * 0.35, shoot.y - shoot.vy * 0.35); ctx.stroke()
              shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt
              shoot.life -= dt * 1.8
              if (shoot.life <= 0 || shoot.x > W + 50 || shoot.y > H + 50) shoot = null
            }
          }
          break
        }

        // ── Fog ───────────────────────────────────────────────────────────────
        case 'fog': {
          for (const m of motes) {
            const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r)
            g.addColorStop(0,   `rgba(214,219,228,${m.o})`)
            g.addColorStop(0.6, `rgba(210,216,226,${m.o * 0.5})`)
            g.addColorStop(1,   'rgba(208,214,224,0)')
            ctx.fillStyle = g
            ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill()
            if (!reduced) {
              m.x += m.vx * dt; m.y += m.vy * dt
              if (m.x - m.r > W) m.x = -m.r; else if (m.x + m.r < 0) m.x = W + m.r
            }
          }
          if (fogStripe) {
            for (const band of fogBands) {
              const cy = band.y + Math.sin(band.ph) * 16
              ctx.globalAlpha = band.o
              ctx.drawImage(fogStripe, 0, cy - band.h, W, band.h * 2)
              if (!reduced) band.ph += dt * band.spd * 0.6
            }
            ctx.globalAlpha = 1
          }
          break
        }

        // ── Haze（霾/沙/尘）：灰黄霾霭薄幕 + 浮尘 + 偏地平线的横向霾层 ──────────
        case 'haze': {
          // 整屏薄幕：上浅下浓，模拟地平线方向能见度更低的脏空气
          const veil = ctx.createLinearGradient(0, 0, 0, H)
          veil.addColorStop(0,   'rgba(152,142,118,0.10)')
          veil.addColorStop(0.5, 'rgba(150,138,112,0.17)')
          veil.addColorStop(1,   'rgba(138,124,98,0.26)')
          ctx.fillStyle = veil
          ctx.fillRect(0, 0, W, H)
          // 浮尘团（灰黄）
          for (const m of motes) {
            const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r)
            g.addColorStop(0,   `rgba(178,166,138,${m.o})`)
            g.addColorStop(0.6, `rgba(170,158,130,${m.o * 0.5})`)
            g.addColorStop(1,   'rgba(162,150,122,0)')
            ctx.fillStyle = g
            ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill()
            if (!reduced) {
              m.x += m.vx * dt; m.y += m.vy * dt
              if (m.x - m.r > W) m.x = -m.r; else if (m.x + m.r < 0) m.x = W + m.r
            }
          }
          // 横向霾层（使用预烘焙条纹 + globalAlpha，替代每帧 createLinearGradient）
          if (fogStripe) {
            for (const band of fogBands) {
              const cy = band.y + Math.sin(band.ph) * 14
              ctx.globalAlpha = band.o
              ctx.drawImage(fogStripe, 0, cy - band.h, W, band.h * 2)
              if (!reduced) band.ph += dt * band.spd * 0.6
            }
            ctx.globalAlpha = 1
          }
          break
        }

        // ── Cloudy / Overcast (day & night) ───────────────────────────────────
        case 'cloudy':
        case 'cloudy-night':
        case 'overcast':
        case 'overcast-night': {
          const drawCloud = (c: Cloud) => {
            const yo = Math.sin(c.ph) * (c.layer === 2 ? 5 : 3)
            ctx.globalAlpha = c.alpha
            ctx.drawImage(c.tex, c.x, c.y + yo, c.w, c.h)
            ctx.globalAlpha = 1
          }

          // 1. Stars (dim, behind all clouds — cloudy night only)
          if (kind === 'cloudy-night' && stars.length) {
            ctx.fillStyle = '#fff'
            for (const s of stars) {
              ctx.globalAlpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(s.ph))
              ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill()
              if (!reduced) s.ph += dt * s.sp
            }
            ctx.globalAlpha = 1
          }

          // 2. Far-layer clouds (behind moon)
          for (const c of clouds) if (c.layer === 0) drawCloud(c)

          // 3. Moon (between far and near cloud layers)
          if (kind === 'cloudy-night' && moonVisible) drawMoon(ctx, moonX, moonY, moonR, moonElongation)

          // 4. Mid + near clouds (in front of moon)
          for (const c of clouds) if (c.layer !== 0) drawCloud(c)

          // Drift (wraps both directions since vx may be negative)
          if (!reduced) {
            for (const c of clouds) {
              c.x += c.vx * dt
              c.ph += dt * 0.12
              if (c.x > W + c.w * 0.3) c.x = -c.w
              else if (c.x < -c.w) c.x = W + c.w * 0.3
            }
          }
          break
        }

        // ── Clear Day ─────────────────────────────────────────────────────────
        default: {
          // High cirrus veil, drawn over the blue sky but under sun glow/rays.
          if (cirrus) {
            ctx.globalAlpha = 0.55
            const sw = cirrusW
            let x0 = -(cirrusX % sw)
            if (x0 > 0) x0 -= sw
            for (let x = x0; x < W; x += sw) ctx.drawImage(cirrus, x, 0, cirrusW, cirrusH)
            ctx.globalAlpha = 1
            if (!reduced) { cirrusX += 4 * dt; if (cirrusX >= sw) cirrusX -= sw }
          }
          if (sunGrad) { ctx.fillStyle = sunGrad; ctx.fillRect(0, 0, W, H) }
          if (!reduced) {
            dayT += dt * 0.4
            const ox = W * 0.82, oy = -H * 0.06
            ctx.save()
            for (let i = 0; i < 7; i++) {
              const base = 1.65 + i * 0.14
              const a = 0.05 * (0.5 + 0.5 * Math.sin(dayT + i * 0.9))
              const len = H * 1.5, hw = 0.038
              const x1 = ox + Math.cos(base - hw) * len, y1 = oy + Math.sin(base - hw) * len
              const x2 = ox + Math.cos(base + hw) * len, y2 = oy + Math.sin(base + hw) * len
              const rG = ctx.createLinearGradient(ox, oy, (x1 + x2) / 2, (y1 + y2) / 2)
              rG.addColorStop(0,   `rgba(255,220,100,${a * 3})`)
              rG.addColorStop(0.5, `rgba(255,200,80,${a * 1.2})`)
              rG.addColorStop(1,   'rgba(255,180,60,0)')
              ctx.fillStyle = rG
              ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill()
            }
            ctx.restore()
          }
          ctx.fillStyle = '#fffae0'
          for (const m of motes) {
            ctx.globalAlpha = m.o
            ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill()
            if (!reduced) {
              m.x += m.vx * dt; m.y += m.vy * dt
              if (m.y < -5) { m.y = H + 5; m.x = rnd(0, W) }
              if (m.x < -5) m.x = W + 5; else if (m.x > W + 5) m.x = -5
            }
          }
          ctx.globalAlpha = 1
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf); raf = 0
      } else if (!reduced && raf === 0) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
    }
  }, [kind, tintKey, lat, lon, gpuFailed])

  // useGPU 时渲染 WebGPU 画布（Canvas effect 因 ref 为空自动 no-op）；canvas context 类型终身锁定，故分路径用各自 canvas。
  if (useGPU) {
    const fallback = () => setGpuFailed(true)
    if (kind === 'rain')    return <RainFXGPU    onFallback={fallback} />
    if (kind === 'thunder') return <ThunderFXGPU onFallback={fallback} />
    if (kind === 'snow')    return <SnowFXGPU    onFallback={fallback} />
  }
  return <canvas ref={ref} className="weather-fx" aria-hidden="true" />
}
