import { useEffect, useRef } from 'react'

// WebGPU 雨天特效（试点）。粒子位置在 GPU compute shader 上并行更新，
// 渲染用 instanced 四边形（每滴雨一个沿速度方向拉伸的 quad，带边缘抗锯齿）。
// 不支持 WebGPU / 取设备失败时，调用 onFallback() 让父组件回退到 Canvas 2D 路径。

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

// 粒子布局与 Canvas 版保持一致：三层景深，远→近 越来越快、越来越长、越来越亮。
// 每滴 8 个 float：pos(x, y, len, layer) + vel(vx, vy, 0, 0)，共 32 字节。
function makeDrops(W: number, H: number): Float32Array {
  const area = W * H
  const cfg = [
    { n: Math.min(90, area / 6000), lenMin: 8, lenMax: 18, vyMin: 200, vyMax: 380 },
    { n: Math.min(130, area / 4200), lenMin: 16, lenMax: 28, vyMin: 380, vyMax: 580 },
    { n: Math.min(55, area / 10000), lenMin: 28, lenMax: 48, vyMin: 580, vyMax: 800 },
  ]
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const out: number[] = []
  for (let li = 0; li < 3; li++) {
    const c = cfg[li]
    const n = Math.round(c.n)
    for (let i = 0; i < n; i++) {
      const vy = rnd(c.vyMin, c.vyMax)
      const len = rnd(c.lenMin, c.lenMax)
      out.push(rnd(0, W), rnd(0, H), len, li, -vy * 0.28, vy, 0, 0)
    }
  }
  return new Float32Array(out)
}

// 位置更新：pos += vel*dt；落出底部则从顶部以新随机 x 重生；左右环绕。
const COMPUTE_WGSL = /* wgsl */ `
struct Drop { pos: vec4f, vel: vec4f };
struct U { res: vec2f, dt: f32, frame: f32 };
@group(0) @binding(0) var<storage, read_write> drops: array<Drop>;
@group(0) @binding(1) var<uniform> u: U;

fn hash(n0: u32) -> f32 {
  var x = n0;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x * 9u;
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return f32(x & 0xffffffu) / f32(0xffffffu);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&drops)) { return; }
  var d = drops[i];
  d.pos.x = d.pos.x + d.vel.x * u.dt;
  d.pos.y = d.pos.y + d.vel.y * u.dt;
  let len = d.pos.z;
  if (d.pos.y > u.res.y + len) {
    d.pos.y = -len;
    d.pos.x = hash(i + u32(u.frame) * 2654435761u) * u.res.x;
  }
  if (d.pos.x < -50.0) { d.pos.x = d.pos.x + u.res.x + 100.0; }
  if (d.pos.x > u.res.x + 50.0) { d.pos.x = d.pos.x - u.res.x - 100.0; }
  drops[i] = d;
}
`

// 把每个 drop 展开成沿速度方向的四边形（6 顶点 = 2 三角形），
// edge 在 [-1,1] 用于片元抗锯齿；颜色/宽度按 layer 分三档（对齐 Canvas 版）。
const RENDER_WGSL = /* wgsl */ `
struct Drop { pos: vec4f, vel: vec4f };
struct U { res: vec2f, dt: f32, frame: f32 };
@group(0) @binding(0) var<storage, read> drops: array<Drop>;
@group(0) @binding(1) var<uniform> u: U;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) edge: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let d = drops[ii];
  let p0 = d.pos.xy;
  let len = d.pos.z;
  let layer = d.pos.w;
  let dir = normalize(d.vel.xy);
  let perp = vec2f(-dir.y, dir.x);

  var halfW = 0.9;
  var color = vec4f(174.0 / 255.0, 208.0 / 255.0, 242.0 / 255.0, 0.28);
  if (layer > 1.5) {
    halfW = 2.0;
    color = vec4f(200.0 / 255.0, 225.0 / 255.0, 252.0 / 255.0, 0.76);
  } else if (layer > 0.5) {
    halfW = 1.3;
    color = vec4f(174.0 / 255.0, 208.0 / 255.0, 242.0 / 255.0, 0.52);
  }

  var alongs = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var sides  = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  let a = alongs[vi];
  let s = sides[vi];

  let world = p0 + dir * (len * a) + perp * (halfW * s);
  let clip = vec2f(world.x / u.res.x * 2.0 - 1.0, 1.0 - world.y / u.res.y * 2.0);

  var o: VOut;
  o.pos = vec4f(clip, 0.0, 1.0);
  o.color = color;
  o.edge = s;
  return o;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let aa = 1.0 - smoothstep(0.4, 1.0, abs(in.edge));
  let a = in.color.a * aa;
  return vec4f(in.color.rgb * a, a); // premultiplied
}
`

// 启动 GPU 渲染循环，返回 cleanup。device/gpu 用 any 规避对 @webgpu/types 的依赖。
function initRain(canvas: HTMLCanvasElement, device: any, gpu: any): () => void {
  const BU = (globalThis as any).GPUBufferUsage
  const ctx = canvas.getContext('webgpu') as any
  const format = gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'premultiplied' })

  const computeModule = device.createShaderModule({ code: COMPUTE_WGSL })
  const renderModule = device.createShaderModule({ code: RENDER_WGSL })

  const uniformBuf = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST })

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: computeModule, entryPoint: 'main' },
  })
  const blend = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  }
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: renderModule, entryPoint: 'vs' },
    fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list' },
  })

  let W = 0, H = 0, count = 0
  let dropBuf: any = null
  let computeBG: any = null
  let renderBG: any = null

  const build = () => {
    W = window.innerWidth
    H = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.floor(W * dpr))
    canvas.height = Math.max(1, Math.floor(H * dpr))
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'

    const data = makeDrops(W, H)
    count = data.length / 8
    dropBuf?.destroy?.()
    dropBuf = device.createBuffer({ size: Math.max(32, data.byteLength), usage: BU.STORAGE | BU.COPY_DST })
    device.queue.writeBuffer(dropBuf, 0, data)
    computeBG = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: dropBuf } }, { binding: 1, resource: { buffer: uniformBuf } }],
    })
    renderBG = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: dropBuf } }, { binding: 1, resource: { buffer: uniformBuf } }],
    })
  }
  build()
  window.addEventListener('resize', build)

  let raf = 0, last = 0, frame = 0
  const tick = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
    last = now
    frame++
    if (count > 0) {
      device.queue.writeBuffer(uniformBuf, 0, new Float32Array([W, H, dt, frame]))
      const enc = device.createCommandEncoder()
      const cp = enc.beginComputePass()
      cp.setPipeline(computePipeline)
      cp.setBindGroup(0, computeBG)
      cp.dispatchWorkgroups(Math.ceil(count / 64))
      cp.end()
      const view = ctx.getCurrentTexture().createView()
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      })
      rp.setPipeline(renderPipeline)
      rp.setBindGroup(0, renderBG)
      rp.draw(6, count)
      rp.end()
      device.queue.submit([enc.finish()])
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }
  document.addEventListener('visibilitychange', onVis)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', build)
    document.removeEventListener('visibilitychange', onVis)
    dropBuf?.destroy?.()
    uniformBuf?.destroy?.()
    device.destroy?.()
  }
}

export function RainFXGPU({ onFallback }: { onFallback: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cleanup = () => {}
    let cancelled = false

    ;(async () => {
      try {
        const gpu = (navigator as any).gpu
        const adapter = await gpu.requestAdapter()
        if (!adapter) throw new Error('no WebGPU adapter')
        const device = await adapter.requestDevice()
        if (cancelled) { device.destroy?.(); return }
        cleanup = initRain(canvas, device, gpu)
      } catch {
        if (!cancelled) onFallback()
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={ref} className="weather-fx" aria-hidden="true" />
}
