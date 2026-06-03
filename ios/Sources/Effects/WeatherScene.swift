import SpriteKit
import SwiftUI
import GameplayKit

// 天气文案 → 特效类型（与 web 端一致）。供 SpriteKit 场景与 SwiftUI 背景共用。
func weatherFXKind(_ text: String, night: Bool) -> String {
    if text.contains("雷") { return "thunder" }
    if text.contains("雨") { return "rain" }
    if text.contains("雪") { return "snow" }
    if text.contains("雾") || text.contains("霾") || text.contains("沙") || text.contains("尘") { return "fog" }
    if text.contains("阴") { return night ? "overcast-night" : "overcast" }
    if text.contains("多云") || text.contains("间") { return night ? "cloudy-night" : "cloudy" }
    return night ? "clear-night" : "clear-day"
}

// MARK: - SpriteKit weather scene

class WeatherScene: SKScene {
    var weatherText: String = "晴" { didSet { if oldValue != weatherText { setupEffect() } } }
    var isNight: Bool = false    { didSet { if oldValue != isNight { setupEffect() } } }
    var lat: Double = 23.0
    var lon: Double = 113.0

    private var moonNode: SKSpriteNode?
    private var moonTimer: Timer?

    // 云朵持续飘移：每帧推进 + 环绕循环（比小幅 SKAction 摆动更明显）
    private var cloudNodes: [(node: SKSpriteNode, vx: CGFloat, halfW: CGFloat)] = []
    private var lastUpdate: TimeInterval = 0

    // 程序化粒子纹理（无纹理的 SKEmitterNode 不渲染任何粒子）
    private lazy var dropTexture: SKTexture = makeDropTexture()
    private lazy var dotTexture: SKTexture = makeDotTexture()

    // 云朵调色板（亮顶 → 中 → 暗底，营造体积感；对应 PWA CLOUD_PAL）
    struct CloudPalette {
        let top: (Double, Double, Double)
        let mid: (Double, Double, Double)
        let bot: (Double, Double, Double)
    }
    private static let palCloudy = CloudPalette(
        top: (180/255, 194/255, 212/255), mid: (128/255, 148/255, 176/255), bot: (78/255, 94/255, 122/255))
    private static let palCloudyNight = CloudPalette(
        top: (129/255, 150/255, 186/255), mid: (84/255, 104/255, 140/255), bot: (38/255, 52/255, 78/255))
    private static let palOvercast = CloudPalette(
        top: (154/255, 164/255, 182/255), mid: (112/255, 122/255, 142/255), bot: (72/255, 79/255, 96/255))
    private static let palOvercastNight = CloudPalette(
        top: (92/255, 102/255, 120/255), mid: (62/255, 70/255, 88/255), bot: (28/255, 34/255, 48/255))

    // 每种天况 3 张不同随机种子的噪声云纹理，飘移时穿插，避免重复感（按需懒加载）
    private lazy var cloudyTexes        = (0..<3).map { self.buildNoiseCloudTex(Self.palCloudy, seed: Int32(101 + $0)) }
    private lazy var cloudyNightTexes   = (0..<3).map { self.buildNoiseCloudTex(Self.palCloudyNight, seed: Int32(201 + $0)) }
    private lazy var overcastTexes      = (0..<3).map { self.buildNoiseCloudTex(Self.palOvercast, seed: Int32(301 + $0)) }
    private lazy var overcastNightTexes = (0..<3).map { self.buildNoiseCloudTex(Self.palOvercastNight, seed: Int32(401 + $0)) }

    override func didMove(to view: SKView) {
        backgroundColor = .clear
        scaleMode = .resizeFill
        setupEffect()
        startMoonTimer()
    }

    override func willMove(from view: SKView) {
        moonTimer?.invalidate()
    }

    // 尺寸从无效变有效（或显著变化）时按正确尺寸重建效果，避免首帧 0 尺寸导致粒子布错
    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        if size.width > 1, abs(size.width - oldSize.width) > 1 {
            setupEffect()
        }
    }

    // 每帧推进云朵，飘出一侧后从另一侧环绕回来，形成持续可见的漂移
    override func update(_ currentTime: TimeInterval) {
        guard !cloudNodes.isEmpty else { lastUpdate = currentTime; return }
        let dt = lastUpdate == 0 ? 0 : min(0.05, currentTime - lastUpdate)
        lastUpdate = currentTime
        guard dt > 0 else { return }
        for c in cloudNodes {
            c.node.position.x += c.vx * CGFloat(dt)
            let margin = c.halfW + 8
            if c.vx > 0, c.node.position.x - c.halfW > size.width {
                c.node.position.x = -margin
            } else if c.vx < 0, c.node.position.x + c.halfW < 0 {
                c.node.position.x = size.width + margin
            }
        }
    }

    // MARK: Effect dispatch

    private func setupEffect() {
        removeAllChildren()
        removeAllActions()
        moonNode = nil
        cloudNodes.removeAll()

        let kind = weatherFXKind(weatherText, night: isNight)
        switch kind {
        case "rain", "thunder": setupRain(thunder: kind == "thunder")
        case "snow":            setupSnow()
        case "fog":             setupFog()
        case "clear-day":       setupClearDay()
        case "clear-night":     setupClearNight()
        case "cloudy":          setupClouds(overcast: false, night: false)
        case "cloudy-night":    setupClouds(overcast: false, night: true)
        case "overcast":        setupClouds(overcast: true,  night: false)
        case "overcast-night":  setupClouds(overcast: true,  night: true)
        default:                setupClearDay()
        }
    }

    // MARK: - Rain

    private func setupRain(thunder: Bool) {
        // 优先加载 Xcode 创建的 Rain.sks，缺失则用程序化雨
        if let emitter = SKEmitterNode(fileNamed: "Rain.sks") {
            emitter.position = CGPoint(x: size.width / 2, y: size.height + 50)
            emitter.particlePositionRange = CGVector(dx: size.width * 1.5, dy: 0)
            addChild(emitter)
        } else {
            addProgrammaticRain(thunder: thunder)
        }
        if thunder { scheduleThunder() }
    }

    private func addProgrammaticRain(thunder: Bool) {
        let emitter = SKEmitterNode()
        emitter.particleTexture = dropTexture
        emitter.particleBirthRate = thunder ? 320 : 220
        emitter.particleLifetime = 1.1
        emitter.particleLifetimeRange = 0.3
        emitter.particleSpeed = 1100
        emitter.particleSpeedRange = 200
        emitter.emissionAngle = -.pi / 2 - 0.08
        emitter.emissionAngleRange = 0.04
        emitter.particleAlpha = 0.55
        emitter.particleAlphaRange = 0.2
        emitter.particleScale = 1.0
        emitter.particleScaleRange = 0.3
        emitter.particleColor = UIColor(white: 0.88, alpha: 1)
        emitter.particleColorBlendFactor = 1
        emitter.position = CGPoint(x: size.width / 2, y: size.height + 20)
        emitter.particlePositionRange = CGVector(dx: size.width * 1.4, dy: 0)
        emitter.zPosition = 1
        addChild(emitter)
    }

    private func scheduleThunder() {
        let wait = SKAction.wait(forDuration: Double.random(in: 3...8))
        let flash = SKAction.run { [weak self] in self?.flashThunder() }
        run(SKAction.repeatForever(SKAction.sequence([wait, flash])))
    }

    private func flashThunder() {
        let overlay = SKSpriteNode(color: UIColor(white: 1, alpha: 0.7),
                                   size: CGSize(width: size.width, height: size.height))
        overlay.position = CGPoint(x: size.width/2, y: size.height/2)
        overlay.zPosition = 10
        addChild(overlay)
        overlay.run(SKAction.sequence([
            SKAction.fadeOut(withDuration: 0.08),
            SKAction.wait(forDuration: 0.05),
            SKAction.fadeIn(withDuration: 0.05),
            SKAction.fadeOut(withDuration: 0.12),
            SKAction.removeFromParent()
        ]))
    }

    // MARK: - Snow

    private func setupSnow() {
        let emitter = SKEmitterNode()
        emitter.particleTexture = dotTexture
        emitter.particleBirthRate = 28
        emitter.particleLifetime = 6
        emitter.particleLifetimeRange = 2
        emitter.particleSpeed = 70
        emitter.particleSpeedRange = 30
        emitter.emissionAngle = -.pi / 2
        emitter.emissionAngleRange = .pi / 6
        emitter.particleAlpha = 0.85
        emitter.particleAlphaRange = 0.3
        emitter.particleScale = 0.5
        emitter.particleScaleRange = 0.3
        emitter.particleColor = .white
        emitter.particleColorBlendFactor = 1
        emitter.particlePositionRange = CGVector(dx: size.width * 1.2, dy: 0)
        emitter.position = CGPoint(x: size.width / 2, y: size.height + 20)
        // 雪花横向飘移
        emitter.xAcceleration = 8
        addChild(emitter)
    }

    // MARK: - Fog

    private func setupFog() {
        for i in 0..<6 {
            let fog = SKSpriteNode(color: UIColor(white: 0.9, alpha: 0.14 + Double(i) * 0.025),
                                   size: CGSize(width: size.width * 1.8, height: size.height * 0.18))
            fog.position = CGPoint(x: size.width * 0.5,
                                   y: size.height * (0.15 + Double(i) * 0.15))
            let dx = (i % 2 == 0 ? 1.0 : -1.0) * size.width * 0.6
            let dur = Double.random(in: 8...14)
            fog.run(SKAction.repeatForever(SKAction.sequence([
                SKAction.moveBy(x: dx, y: 0, duration: dur),
                SKAction.moveBy(x: -dx, y: 0, duration: dur)
            ])))
            addChild(fog)
        }
    }

    // MARK: - Clear day (god rays + dust)

    private func setupClearDay() {
        // 右上角柔和阳光光晕
        let sun = SKShapeNode(circleOfRadius: 120)
        sun.fillColor = UIColor(red: 1, green: 0.93, blue: 0.65, alpha: 0.16)
        sun.strokeColor = .clear
        sun.glowWidth = 60
        sun.position = CGPoint(x: size.width * 0.82, y: size.height * 0.82)
        sun.zPosition = 0
        addChild(sun)

        // 漂浮浮尘
        let dust = SKEmitterNode()
        dust.particleTexture = dotTexture
        dust.particleBirthRate = 10
        dust.particleLifetime = 9
        dust.particleLifetimeRange = 4
        dust.particleSpeed = 18
        dust.particleSpeedRange = 12
        dust.emissionAngle = 0
        dust.emissionAngleRange = .pi * 2
        dust.particleAlpha = 0.35
        dust.particleAlphaRange = 0.25
        dust.particleScale = 0.10
        dust.particleScaleRange = 0.06
        dust.particleColor = UIColor(red: 1, green: 0.95, blue: 0.7, alpha: 1)
        dust.particleColorBlendFactor = 1
        dust.position = CGPoint(x: size.width * 0.5, y: size.height * 0.6)
        dust.particlePositionRange = CGVector(dx: size.width, dy: size.height * 0.8)
        addChild(dust)
    }

    // MARK: - Clear night (moon + stars)

    private func setupClearNight() {
        addStars(count: 60)
        addMoon()
    }

    private func addStars(count: Int) {
        for _ in 0..<count {
            let star = SKShapeNode(circleOfRadius: CGFloat.random(in: 0.8...2.0))
            star.fillColor = .white
            star.strokeColor = .clear
            star.alpha = CGFloat.random(in: 0.3...0.9)
            star.position = CGPoint(x: CGFloat.random(in: 0...size.width),
                                    y: CGFloat.random(in: size.height * 0.3...size.height))
            let twinkle = SKAction.sequence([
                SKAction.fadeAlpha(to: CGFloat.random(in: 0.1...0.4), duration: Double.random(in: 1.5...3)),
                SKAction.fadeAlpha(to: CGFloat.random(in: 0.6...1.0), duration: Double.random(in: 1.5...3))
            ])
            star.run(SKAction.repeatForever(twinkle))
            addChild(star)
        }
    }

    private func addMoon() {
        let pos = moonPosition(date: Date(), lat: lat, lon: lon)
        guard pos.isVisible else { return }

        let W = size.width, H = size.height
        let mx = W * 0.5 * (1 + CGFloat(sin(pos.azimuth * .pi / 180)))
        let my = H * (0.05 + 0.36 * CGFloat(1 - (pos.altitude - 5) / 85))

        // 按当前黄经差（月相）现画纹理：月盘呈真实月牙/弦月/凸月 + 柔和光晕
        let moon = SKSpriteNode(texture: makeMoonTexture(elongation: pos.elongation))
        moon.size = CGSize(width: 110, height: 110)   // 月盘直径约 57pt（其余为光晕）
        moon.position = CGPoint(x: mx, y: H - my)
        moon.zPosition = 5
        addChild(moon)
        moonNode = moon
    }

    /// 月亮纹理：按 elongation（0=新月…180=满月）逐像素渲染真实月相。
    /// 与 PWA drawMoon 同逻辑——球面光照的亮面 + 终止线，外加柔和光晕。
    private func makeMoonTexture(elongation: Double) -> SKTexture {
        let W = 170, H = 170
        let cx = Double(W) / 2, cy = Double(H) / 2
        let diskR = 44.0
        let haloR = Double(W) / 2          // 光晕铺满纹理
        let er = elongation * .pi / 180
        let waxing = elongation < 180      // 上弦（渐盈）亮面在右；下弦在左
        let kx = cos(er)                   // 终止线归一化横坐标系数：+1 新月 … -1 满月
        let illum = (1 - cos(er)) / 2

        func clamp01(_ v: Double) -> Double { max(0, min(1, v)) }
        func smoothstep(_ a: Double, _ b: Double, _ x: Double) -> Double {
            let t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t)
        }

        var px = [UInt8](repeating: 0, count: W * H * 4)
        for y in 0..<H {
            let dy = Double(y) - cy
            for x in 0..<W {
                let dx = Double(x) - cx
                let dist = (dx * dx + dy * dy).squareRoot()
                var r = 0.0, g = 0.0, b = 0.0, a = 0.0

                if dist <= diskR + 1 {
                    let nx = dx / diskR, ny = dy / diskR
                    // 终止线：当前行半宽 sqrt(1-ny²)，终止线归一化横坐标 = kx*半宽
                    let halfW = (1 - ny * ny > 0) ? (1 - ny * ny).squareRoot() : 0
                    let xt = kx * halfW
                    // 到终止线的有符号距离（>0 受光，<0 阴影），亮面侧依盈亏而定
                    // 渐盈：亮面在右，lit ⇔ nx>xt；渐亏：亮面在左，lit ⇔ nx<-xt
                    let sd = waxing ? (nx - xt) : (-xt - nx)
                    let litFrac = smoothstep(-0.05, 0.05, sd)

                    // 球面光照（光从左上偏向观察者），亮面有限边减光
                    let z = max(0, 1 - nx * nx - ny * ny).squareRoot()
                    let ndotl = max(0, nx * (-0.30) + ny * (-0.30) + z * 0.90)
                    let bright = 0.58 + 0.42 * ndotl

                    // 只渲染受光面：暗面 alpha→0 与背景融合（更写实）；按 litFrac 平滑过渡
                    let litR = 255.0 * bright, litG = 252.0 * bright, litB = 243.0 * bright
                    let litA = 0.97
                    r = litR; g = litG; b = litB
                    a = litA * litFrac
                    // 月盘外缘羽化抗锯齿
                    a *= 1 - smoothstep(diskR - 1.0, diskR + 1.0, dist)
                } else if dist <= haloR {
                    // 光晕：随月相亮度增强，向外二次方渐隐（冷白）
                    let ht = (dist - diskR) / (haloR - diskR)   // 0..1
                    let fall = (1 - ht) * (1 - ht)
                    a = fall * (0.14 + 0.10 * illum)
                    r = 215; g = 232; b = 255
                }

                let i = (y * W + x) * 4
                px[i+0] = UInt8(clamp01(r / 255) * a * 255)   // 预乘 alpha
                px[i+1] = UInt8(clamp01(g / 255) * a * 255)
                px[i+2] = UInt8(clamp01(b / 255) * a * 255)
                px[i+3] = UInt8(clamp01(a) * 255)
            }
        }

        let cs = CGColorSpaceCreateDeviceRGB()
        guard let provider = CGDataProvider(data: Data(px) as CFData),
              let cg = CGImage(width: W, height: H, bitsPerComponent: 8, bitsPerPixel: 32,
                               bytesPerRow: W * 4, space: cs,
                               bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                               provider: provider, decode: nil, shouldInterpolate: true,
                               intent: .defaultIntent)
        else { return dotTexture }
        return SKTexture(image: UIImage(cgImage: cg))
    }

    // MARK: - Clouds (GameplayKit 分形噪声)

    private func setupClouds(overcast: Bool, night: Bool) {
        let texes: [SKTexture]
        switch (overcast, night) {
        case (false, false): texes = cloudyTexes
        case (false, true):  texes = cloudyNightTexes
        case (true,  false): texes = overcastTexes
        case (true,  true):  texes = overcastNightTexes
        }

        // 3 层深度：远（小、慢、靠上）→ 近（大、快、靠下）。
        // 速度 v 为 pt/s，持续单向飘移（环绕循环），数值取得肉眼可感。
        let layers: [(count: Int, wLo: CGFloat, wHi: CGFloat,
                      alphaLo: CGFloat, alphaHi: CGFloat,
                      yLo: CGFloat, yHi: CGFloat, vLo: CGFloat, vHi: CGFloat)] = overcast
            ? [
                (3, 280, 380, 0.72, 0.90, 0.74, 0.99, 10, 18),
                (3, 340, 460, 0.80, 0.95, 0.64, 0.96, 16, 26),
                (2, 400, 540, 0.74, 0.92, 0.54, 0.88, 24, 38),
              ]
            : [
                (2, 240, 340, 0.60, 0.78, 0.78, 0.99,  9, 16),
                (2, 300, 420, 0.66, 0.84, 0.70, 0.96, 14, 24),
                (2, 360, 500, 0.60, 0.80, 0.60, 0.90, 22, 36),
              ]

        var zPos: CGFloat = 0
        for layer in layers {
            for _ in 0..<layer.count {
                let cloud = SKSpriteNode(texture: texes.randomElement()!)
                let w = CGFloat.random(in: layer.wLo...layer.wHi)
                cloud.size = CGSize(width: w, height: w * 0.52)
                cloud.alpha = CGFloat.random(in: layer.alphaLo...layer.alphaHi)
                let yFrac = CGFloat.random(in: layer.yLo...layer.yHi)
                cloud.position = CGPoint(
                    x: CGFloat.random(in: -(w * 0.3)...(size.width + w * 0.3)),
                    y: size.height * yFrac
                )
                cloud.zPosition = zPos; zPos += 1
                let vx = (Bool.random() ? 1.0 : -1.0) * CGFloat.random(in: layer.vLo...layer.vHi)
                addChild(cloud)
                cloudNodes.append((node: cloud, vx: vx, halfW: w / 2))
            }
        }
        if night { addMoon() }
    }

    /// GameplayKit 分形噪声写实云纹理：
    ///  - GKPerlinNoiseSource 多倍频噪声 → 毛茸茸的云丝/团块密度
    ///  - 椭圆包络（横宽纵紧）裁出云形并羽化边缘
    ///  - 垂直「亮顶→中→暗底」体积着色 + 噪声明暗起伏 → 立体感
    private func buildNoiseCloudTex(_ pal: CloudPalette, seed: Int32) -> SKTexture {
        let w = 256, h = 140
        let source = GKPerlinNoiseSource(frequency: 2.2, octaveCount: 6,
                                         persistence: 0.58, lacunarity: 2.2, seed: seed)
        let noise = GKNoise(source)
        let map = GKNoiseMap(noise,
                             size: vector_double2(2.4, 1.3),
                             origin: vector_double2(0, 0),
                             sampleCount: vector_int2(Int32(w), Int32(h)),
                             seamless: false)

        func clamp01(_ v: Double) -> Double { max(0, min(1, v)) }
        func smoothstep(_ a: Double, _ b: Double, _ x: Double) -> Double {
            let t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t)
        }
        // 体积色：t 0(顶)→1(底)，分两段插值 top→mid→bot
        func volColor(_ t: Double) -> (Double, Double, Double) {
            if t < 0.5 {
                let k = t * 2
                return (pal.top.0 + (pal.mid.0 - pal.top.0) * k,
                        pal.top.1 + (pal.mid.1 - pal.top.1) * k,
                        pal.top.2 + (pal.mid.2 - pal.top.2) * k)
            } else {
                let k = (t - 0.5) * 2
                return (pal.mid.0 + (pal.bot.0 - pal.mid.0) * k,
                        pal.mid.1 + (pal.bot.1 - pal.mid.1) * k,
                        pal.mid.2 + (pal.bot.2 - pal.mid.2) * k)
            }
        }

        var px = [UInt8](repeating: 0, count: w * h * 4)
        for y in 0..<h {
            let ny = Double(y) / Double(h - 1)
            let ey = (ny - 0.42) * 2.3              // 云体中心略偏上，纵向更紧
            let (cr, cg, cb) = volColor(clamp01(ny))
            for x in 0..<w {
                let nx = Double(x) / Double(w - 1)
                let ex = (nx - 0.5) * 2.0
                let env = max(0, 1 - (ex * ex + ey * ey))            // 椭圆包络 0..1
                let n = Double(map.value(at: vector_int2(Int32(x), Int32(y))))  // -1..1
                let nn = (n + 1) * 0.5                                // 0..1
                let nnC = smoothstep(0.34, 0.80, nn)                  // 提升噪声对比：团块分明、薄雾消失
                let density = env * (0.34 + 0.66 * nnC)
                let a = smoothstep(0.36, 0.66, density)              // 抬高下限去掉朦胧薄边，核心更实
                // 噪声明暗起伏（高噪声受光偏亮），加大对比让云不发灰
                let lift = (nnC - 0.5) * 0.18
                let r = clamp01(cr + lift), g = clamp01(cg + lift), b = clamp01(cb + lift)
                let i = (y * w + x) * 4
                px[i+0] = UInt8(r * a * 255)     // 预乘 alpha
                px[i+1] = UInt8(g * a * 255)
                px[i+2] = UInt8(b * a * 255)
                px[i+3] = UInt8(a * 255)
            }
        }

        let cs = CGColorSpaceCreateDeviceRGB()
        guard let provider = CGDataProvider(data: Data(px) as CFData),
              let cg = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32,
                               bytesPerRow: w * 4, space: cs,
                               bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                               provider: provider, decode: nil, shouldInterpolate: true,
                               intent: .defaultIntent)
        else { return dotTexture }
        return SKTexture(image: UIImage(cgImage: cg))
    }

    // MARK: - Moon timer (refresh every 10 min)

    private func startMoonTimer() {
        moonTimer = Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            self?.refreshMoon()
        }
    }
    private func refreshMoon() {
        if isNight { setupEffect() }
    }

    // MARK: - 程序化粒子纹理

    /// 细长雨滴（竖直渐隐线条）
    private func makeDropTexture() -> SKTexture {
        let s = CGSize(width: 3, height: 16)
        let renderer = UIGraphicsImageRenderer(size: s)
        let img = renderer.image { ctx in
            let cg = ctx.cgContext
            let colors = [UIColor(white: 1, alpha: 0).cgColor,
                          UIColor(white: 1, alpha: 1).cgColor]
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                  colors: colors as CFArray, locations: [0, 1])!
            cg.addRect(CGRect(origin: .zero, size: s))
            cg.clip()
            cg.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0),
                                  end: CGPoint(x: 0, y: s.height), options: [])
        }
        return SKTexture(image: img)
    }

    /// 柔和圆点（雪花 / 浮尘），径向渐隐边缘
    private func makeDotTexture() -> SKTexture {
        let d: CGFloat = 16
        let s = CGSize(width: d, height: d)
        let renderer = UIGraphicsImageRenderer(size: s)
        let img = renderer.image { ctx in
            let cg = ctx.cgContext
            let colors = [UIColor(white: 1, alpha: 1).cgColor,
                          UIColor(white: 1, alpha: 0).cgColor]
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                  colors: colors as CFArray, locations: [0, 1])!
            cg.drawRadialGradient(grad, startCenter: CGPoint(x: d / 2, y: d / 2), startRadius: 0,
                                  endCenter: CGPoint(x: d / 2, y: d / 2), endRadius: d / 2, options: [])
        }
        return SKTexture(image: img)
    }
}

// MARK: - SwiftUI wrapper

struct WeatherFXView: UIViewRepresentable {
    let weatherText: String
    let isNight: Bool
    let lat: Double
    let lon: Double

    func makeUIView(context: Context) -> SKView {
        let view = SKView()
        view.backgroundColor = .clear
        view.allowsTransparency = true
        view.preferredFramesPerSecond = 120
        view.ignoresSiblingOrder = true
        let scene = WeatherScene(size: UIScreen.main.bounds.size)
        scene.weatherText = weatherText
        scene.isNight = isNight
        scene.lat = lat
        scene.lon = lon
        view.presentScene(scene)
        return view
    }

    func updateUIView(_ uiView: SKView, context: Context) {
        guard let scene = uiView.scene as? WeatherScene else { return }
        scene.weatherText = weatherText
        scene.isNight = isNight
        scene.lat = lat
        scene.lon = lon
    }
}
