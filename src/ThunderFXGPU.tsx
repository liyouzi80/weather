import { useEffect, useRef } from 'react'
import { useRainGPU } from './RainFXGPU'

// 雷暴：WebGPU 画雨滴（同 RainFXGPU），Canvas 2D 叠加闪电/闪光。
// 两个 canvas 都是 position:fixed; inset:0，自然重叠，bolt canvas 在上层。

interface Bolt {
  pts: [number, number][]
  branches: { pts: [number, number][] }[]
}

function useBoltCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, dpr = 1
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width  = Math.max(1, Math.floor(W * dpr))
      canvas.height = Math.max(1, Math.floor(H * dpr))
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

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

    let flash = 0, nextBolt = rnd(1.2, 3.5), bolt: Bolt | null = null
    let raf = 0, last = 0

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
      last = now
      ctx.clearRect(0, 0, W, H)

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
        flash -= dt * 3.2
        if (flash < 0) flash = 0
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (!raf) { last = 0; raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

export function ThunderFXGPU({ onFallback }: { onFallback: () => void }) {
  const rainRef = useRef<HTMLCanvasElement>(null)
  const boltRef = useRef<HTMLCanvasElement>(null)
  useRainGPU(rainRef, onFallback)
  useBoltCanvas(boltRef)
  return (
    <>
      <canvas ref={rainRef} className="weather-fx" aria-hidden="true" />
      <canvas ref={boltRef} className="weather-fx" aria-hidden="true" style={{ zIndex: 1 }} />
    </>
  )
}
