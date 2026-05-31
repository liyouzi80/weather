import { useEffect, useRef } from 'react'

export type FxKind =
  | 'rain' | 'thunder' | 'snow' | 'fog'
  | 'clear-day' | 'clear-night'
  | 'cloudy' | 'cloudy-night'
  | 'overcast' | 'overcast-night'

export function fxKind(text: string | undefined, night: boolean): FxKind {
  if (text) {
    if (/雷/.test(text)) return 'thunder'
    if (/雨/.test(text)) return 'rain'
    if (/雪/.test(text)) return 'snow'
    if (/雾|霾|沙|尘/.test(text)) return 'fog'
    if (/阴/.test(text)) return night ? 'overcast-night' : 'overcast'
    if (/多云|间/.test(text)) return night ? 'cloudy-night' : 'cloudy'
  }
  return night ? 'clear-night' : 'clear-day'
}

const isCloudKind = (k: FxKind) =>
  k === 'cloudy' || k === 'cloudy-night' || k === 'overcast' || k === 'overcast-night'

const TAU = Math.PI * 2
const prefersReduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Drop  { x: number; y: number; len: number; vy: number; vx: number }
interface Flake { x: number; y: number; r: number; vy: number; vx: number; sway: number; ph: number; layer: number }
interface Star  { x: number; y: number; r: number; ph: number; sp: number; bright: boolean }
interface Shoot { x: number; y: number; vx: number; vy: number; life: number }
interface CloudBlob { x: number; y: number; r: number; ph: number }
interface FogBand   { y: number; ph: number; spd: number; o: number; h: number }
interface Mote      { x: number; y: number; r: number; vx: number; vy: number; o: number }
interface Bolt      { pts: [number, number][]; branches: { pts: [number, number][] }[] }

// ── Cloud helpers ────────────────────────────────────────────────────────────

type CloudPalette = 'cloudy' | 'cloudy-night' | 'overcast' | 'overcast-night'

function drawCloudCluster(
  ctx: CanvasRenderingContext2D,
  blobs: CloudBlob[],
  layer: number,
  palette: CloudPalette,
): void {
  // Merge-fill: all blobs in one beginPath → overlapping arcs form a single silhouette.
  // overcast = denser/grayer/more uniform (heavy overcast deck, no gaps);
  // cloudy = lighter, airier, more depth contrast between layers.
  const L = Math.min(layer, 2)
  let alpha: number, rgb: string
  switch (palette) {
    case 'cloudy':         alpha = [0.50, 0.65, 0.80][L]; rgb = '200,212,228'; break
    case 'cloudy-night':   alpha = [0.30, 0.45, 0.60][L]; rgb = '112,136,180'; break
    case 'overcast':       alpha = [0.78, 0.86, 0.94][L]; rgb = '166,174,188'; break
    default: /* overcast-night */ alpha = [0.55, 0.66, 0.78][L]; rgb = '78,86,104'; break
  }

  ctx.beginPath()
  for (const b of blobs) {
    ctx.moveTo(b.x + b.r, b.y)
    ctx.arc(b.x, b.y, b.r, 0, TAU)
  }
  ctx.fillStyle = `rgba(${rgb},${alpha})`
  ctx.fill()
}

function drawMoon(ctx: CanvasRenderingContext2D, mx: number, my: number, r: number): void {
  // Wide atmospheric scatter glow
  const glow = ctx.createRadialGradient(mx, my, r * 0.8, mx, my, r * 6)
  glow.addColorStop(0,   'rgba(215,232,255,0.18)')
  glow.addColorStop(0.4, 'rgba(200,222,255,0.07)')
  glow.addColorStop(1,   'rgba(185,210,255,0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(mx, my, r * 6, 0, TAU); ctx.fill()

  // Tight halo ring (just outside disk edge)
  const halo = ctx.createRadialGradient(mx, my, r, mx, my, r * 2.2)
  halo.addColorStop(0,   'rgba(230,242,255,0.22)')
  halo.addColorStop(0.6, 'rgba(210,228,255,0.06)')
  halo.addColorStop(1,   'rgba(195,218,255,0)')
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.arc(mx, my, r * 2.2, 0, TAU); ctx.fill()

  // Moon disk — lit from upper-left
  const disk = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, 0, mx, my, r)
  disk.addColorStop(0,   'rgba(255,255,248,0.97)')
  disk.addColorStop(0.65,'rgba(238,246,255,0.92)')
  disk.addColorStop(1,   'rgba(210,228,255,0.85)')
  ctx.fillStyle = disk
  ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill()
}

// ── Component ────────────────────────────────────────────────────────────────

export function WeatherFX({ kind }: { kind: FxKind }) {
  const ref = useRef<HTMLCanvasElement>(null)

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

    const rainL: Drop[][] = [[], [], []]
    const flakes: Flake[] = []
    const stars: Star[] = []
    const clouds: CloudBlob[][] = []
    const cloudVx: number[] = []
    const cloudLayer: number[] = []     // 0=far  1=mid  2=near
    const fogBands: FogBand[] = []
    const motes: Mote[] = []

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

    const resize = () => {
      const Wn = window.innerWidth, Hn = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width  = Wn * dpr; canvas.height = Hn * dpr
      canvas.style.width  = Wn + 'px'; canvas.style.height = Hn + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (W_prev > 0) {
        const sx = Wn / W_prev, sy = Hn / H_prev
        for (const l of rainL) for (const d of l) { d.x *= sx; d.y *= sy }
        for (const f of flakes) { f.x *= sx; f.y *= sy }
        for (const s of stars)  { s.x *= sx; s.y *= sy }
        for (const c of clouds) for (const b of c) { b.x *= sx; b.y *= sy }
        for (const b of fogBands) { b.y *= sy; b.h *= sy }
        for (const m of motes)  { m.x *= sx; m.y *= sy }
      }
      W = Wn; H = Hn; W_prev = Wn; H_prev = Hn

      if (kind === 'clear-day') {
        sunGrad = ctx.createRadialGradient(W * 0.78, -H * 0.05, 0, W * 0.78, -H * 0.05, H * 0.72)
        sunGrad.addColorStop(0,    'rgba(255,215,100,0.28)')
        sunGrad.addColorStop(0.4,  'rgba(255,185,65,0.12)')
        sunGrad.addColorStop(0.75, 'rgba(255,150,40,0.04)')
        sunGrad.addColorStop(1,    'rgba(255,130,30,0)')
      }
      if (kind === 'clear-night' || kind === 'cloudy-night') {
        moonX = kind === 'clear-night' ? W * 0.80 : W * 0.26
        moonY = kind === 'clear-night' ? H * 0.11 : H * 0.14
        moonR = H * 0.042
        if (kind === 'clear-night') {
          moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, H * 0.30)
          moonGrad.addColorStop(0,   'rgba(240,248,255,0.12)')
          moonGrad.addColorStop(0.5, 'rgba(210,230,255,0.04)')
          moonGrad.addColorStop(1,   'rgba(180,205,255,0)')
        }
      }
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
      const overcast = kind === 'overcast' || kind === 'overcast-night'

      // Sparse stars behind clouds — only when gaps exist (cloudy night, not overcast)
      if (kind === 'cloudy-night') {
        const n = Math.round(Math.min(55, area / 20000))
        for (let i = 0; i < n; i++)
          stars.push({ x: rnd(0, W), y: rnd(0, H * 0.65), r: rnd(0.3, 1.4), ph: rnd(0, TAU), sp: rnd(0.5, 1.8), bright: false })
      }

      // Three-layer cloud clusters.
      // layer 0 = far/back (high, slow, smaller), 1 = mid, 2 = near/front (lower, fast, larger).
      // overcast = more clusters, wider span, lower & overlapping → fills the sky with no gaps.
      const layerCfg = overcast
        ? [
            { count: 6, yLo: 0.00, yHi: 0.38, sLo: 0.80, sHi: 1.25, vLo: 2, vHi:  6 },
            { count: 6, yLo: 0.04, yHi: 0.46, sLo: 1.10, sHi: 1.70, vLo: 4, vHi: 10 },
            { count: 5, yLo: 0.08, yHi: 0.48, sLo: 1.45, sHi: 2.15, vLo: 8, vHi: 16 },
          ]
        : [
            { count: 4, yLo: 0.02, yHi: 0.32, sLo: 0.55, sHi: 0.95, vLo:  3, vHi:  8 },
            { count: 4, yLo: 0.06, yHi: 0.40, sLo: 0.80, sHi: 1.30, vLo:  7, vHi: 14 },
            { count: 3, yLo: 0.08, yHi: 0.38, sLo: 1.10, sHi: 1.85, vLo: 13, vHi: 24 },
          ]
      const spanLo = overcast ? 180 : 130, spanHi = overcast ? 320 : 260
      for (let li = 0; li < 3; li++) {
        const cfg = layerCfg[li]
        for (let i = 0; i < cfg.count; i++) {
          const s  = rnd(cfg.sLo, cfg.sHi)
          const cx = rnd(-0.15, 1.20) * W
          const cy = rnd(cfg.yLo, cfg.yHi) * H
          const cw = rnd(spanLo, spanHi) * s   // horizontal span
          const ch = rnd(42, 80) * s           // vertical depth → drives blob radius
          const nb = 4 + Math.floor(Math.random() * 4)   // 4–7 blobs per cloud
          const blobs: CloudBlob[] = []
          for (let b = 0; b < nb; b++) {
            const t  = b / Math.max(nb - 1, 1)
            const bx = cx - cw / 2 + t * cw + rnd(-18, 18) * s
            const by = cy + rnd(-0.25, 0.25) * ch
            const br = rnd(0.38, 0.68) * ch + rnd(-8, 8) * s
            blobs.push({ x: bx, y: by, r: Math.max(18, br), ph: rnd(0, TAU) })
          }
          clouds.push(blobs)
          cloudVx.push(rnd(cfg.vLo, cfg.vHi))
          cloudLayer.push(li)
        }
      }

    } else if (kind === 'fog') {
      // Horizontal drifting bands (existing) + slow volumetric blobs for depth
      for (let i = 0; i < 9; i++)
        fogBands.push({ y: rnd(0.06, 0.94) * H, ph: rnd(0, TAU), spd: rnd(0.3, 0.8), o: rnd(0.09, 0.19), h: rnd(60, 140) })
      const nb = Math.round(Math.min(7, area / 70000))
      for (let i = 0; i < nb; i++)
        motes.push({ x: rnd(0, W), y: rnd(0.1, 0.9) * H, r: rnd(H * 0.10, H * 0.20), vx: rnd(5, 16) * (Math.random() < 0.5 ? -1 : 1), vy: rnd(-3, 3), o: rnd(0.05, 0.11) })

    } else {
      // clear-day: sun motes
      const n = Math.round(Math.min(80, area / 14000))
      for (let i = 0; i < n; i++)
        motes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.8, 2.8), vx: rnd(-5, 5), vy: rnd(-18, -5), o: rnd(0.12, 0.35) })
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

    const SLOW_MS = 1000 / 24
    const isSlowFx = kind === 'clear-night' || kind === 'fog' || kind === 'clear-day' || isCloudKind(kind)
    let raf = 0, last = 0

    const frame = (now: number) => {
      const elapsed = now - last
      if (isSlowFx && elapsed < SLOW_MS) { raf = requestAnimationFrame(frame); return }
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
                ctx.shadowColor = 'rgba(160,190,255,1)'; ctx.shadowBlur = 20
                ctx.strokeStyle = `rgba(255,255,255,${flash * 0.98})`; ctx.lineWidth = 2.4
                ctx.beginPath()
                ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1])
                for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1])
                ctx.stroke()
                ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(210,230,255,${flash * 0.65})`
                for (const br of bolt.branches) {
                  ctx.beginPath()
                  ctx.moveTo(br.pts[0][0], br.pts[0][1])
                  for (let i = 1; i < br.pts.length; i++) ctx.lineTo(br.pts[i][0], br.pts[i][1])
                  ctx.stroke()
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
          // Diffuse background glow from moonlight
          if (moonGrad) { ctx.fillStyle = moonGrad; ctx.fillRect(0, 0, W, H) }

          // Stars
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

          // Moon disk
          drawMoon(ctx, moonX, moonY, moonR)

          // Shooting star
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
          // Slow volumetric blobs (depth) drawn first, behind the bands
          ctx.fillStyle = '#fff'
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
          for (const band of fogBands) {
            const cy = band.y + Math.sin(band.ph) * 16
            const bG = ctx.createLinearGradient(0, cy - band.h, 0, cy + band.h)
            bG.addColorStop(0,    'rgba(215,220,230,0)')
            bG.addColorStop(0.38, `rgba(215,220,230,${band.o})`)
            bG.addColorStop(0.62, `rgba(215,220,230,${band.o})`)
            bG.addColorStop(1,    'rgba(215,220,230,0)')
            ctx.fillStyle = bG
            ctx.fillRect(0, cy - band.h, W, band.h * 2)
            if (!reduced) band.ph += dt * band.spd * 0.6
          }
          break
        }

        // ── Cloudy / Overcast (day & night) ───────────────────────────────────
        case 'cloudy':
        case 'cloudy-night':
        case 'overcast':
        case 'overcast-night': {
          const palette = kind as CloudPalette
          const showMoon = kind === 'cloudy-night'   // overcast deck hides the moon

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
          for (let ci = 0; ci < clouds.length; ci++) {
            if (cloudLayer[ci] !== 0) continue
            drawCloudCluster(ctx, clouds[ci], 0, palette)
          }

          // 3. Moon (between far and near cloud layers)
          if (showMoon) drawMoon(ctx, moonX, moonY, moonR)

          // 4. Mid + near clouds (in front of moon)
          for (let ci = 0; ci < clouds.length; ci++) {
            if (cloudLayer[ci] === 0) continue
            drawCloudCluster(ctx, clouds[ci], cloudLayer[ci], palette)
          }

          // Update positions
          if (!reduced) {
            for (let ci = 0; ci < clouds.length; ci++) {
              const clump = clouds[ci]
              const drift = cloudVx[ci] * dt
              let minX = Infinity
              for (const b of clump) {
                b.x += drift; b.ph += dt * 0.14
                b.y += Math.sin(b.ph) * 0.18
                if (b.x - b.r < minX) minX = b.x - b.r
              }
              if (minX > W + 60) {
                const maxX = Math.max(...clump.map(b => b.x + b.r))
                const delta = -(maxX + rnd(30, 100))
                for (const b of clump) b.x += delta
              }
            }
          }
          break
        }

        // ── Clear Day ─────────────────────────────────────────────────────────
        default: {
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
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
    }
  }, [kind])

  return <canvas ref={ref} className="weather-fx" aria-hidden="true" />
}
