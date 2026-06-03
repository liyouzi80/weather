import SpriteKit
import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - SpriteKit weather scene

class WeatherScene: SKScene {
    var weatherText: String = "晴" { didSet { if oldValue != weatherText { setupEffect() } } }
    var isNight: Bool = false    { didSet { if oldValue != isNight { setupEffect() } } }
    var lat: Double = 23.0
    var lon: Double = 113.0

    private var moonNode: SKShapeNode?
    private var moonTimer: Timer?

    // 程序化粒子纹理（无纹理的 SKEmitterNode 不渲染任何粒子）
    private lazy var dropTexture: SKTexture = makeDropTexture()
    private lazy var dotTexture: SKTexture = makeDotTexture()

    // 云朵调色板（对应 PWA CLOUD_PAL：亮顶 → 中 → 暗底，营造体积感）
    private struct CloudPalette {
        let top: UIColor, mid: UIColor, bot: UIColor
    }
    private static let palCloudy = CloudPalette(
        top: UIColor(red: 180/255, green: 194/255, blue: 212/255, alpha: 1),
        mid: UIColor(red: 128/255, green: 148/255, blue: 176/255, alpha: 1),
        bot: UIColor(red:  78/255, green:  94/255, blue: 122/255, alpha: 1))
    private static let palCloudyNight = CloudPalette(
        top: UIColor(red: 129/255, green: 150/255, blue: 186/255, alpha: 1),
        mid: UIColor(red:  84/255, green: 104/255, blue: 140/255, alpha: 1),
        bot: UIColor(red:  38/255, green:  52/255, blue:  78/255, alpha: 1))
    private static let palOvercast = CloudPalette(
        top: UIColor(red: 154/255, green: 164/255, blue: 182/255, alpha: 1),
        mid: UIColor(red: 112/255, green: 122/255, blue: 142/255, alpha: 1),
        bot: UIColor(red:  72/255, green:  79/255, blue:  96/255, alpha: 1))
    private static let palOvercastNight = CloudPalette(
        top: UIColor(red:  92/255, green: 102/255, blue: 120/255, alpha: 1),
        mid: UIColor(red:  62/255, green:  70/255, blue:  88/255, alpha: 1),
        bot: UIColor(red:  28/255, green:  34/255, blue:  48/255, alpha: 1))

    // 多张云纹理（昼/夜 × 多云/阴），每张随机塑形，飘移时穿插
    private lazy var cloudyTexes: [SKTexture]   = (0..<3).map { _ in buildCloudTex(Self.palCloudy) }
    private lazy var cloudyNightTexes: [SKTexture] = (0..<3).map { _ in buildCloudTex(Self.palCloudyNight) }
    private lazy var overcastTexes: [SKTexture] = (0..<3).map { _ in buildCloudTex(Self.palOvercast) }
    private lazy var overcastNightTexes: [SKTexture] = (0..<3).map { _ in buildCloudTex(Self.palOvercastNight) }

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

    // MARK: Effect dispatch

    private func setupEffect() {
        removeAllChildren()
        removeAllActions()
        moonNode = nil

        let kind = fxKind(weatherText, night: isNight)
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

        let r: CGFloat = 26
        let moon = SKShapeNode(circleOfRadius: r)
        moon.fillColor = UIColor(white: 0.95, alpha: 0.9)
        moon.strokeColor = UIColor(white: 1, alpha: 0.6)
        moon.lineWidth = 0.5
        moon.position = CGPoint(x: mx, y: H - my)
        moon.zPosition = 5

        // Glow
        let glow = SKShapeNode(circleOfRadius: r * 2)
        glow.fillColor = UIColor(white: 0.9, alpha: CGFloat(pos.illumination) * 0.12)
        glow.strokeColor = .clear
        glow.position = moon.position
        addChild(glow)
        addChild(moon)
        moonNode = moon
    }

    // MARK: - Clouds

    private func setupClouds(overcast: Bool, night: Bool) {
        let texes: [SKTexture]
        switch (overcast, night) {
        case (false, false): texes = cloudyTexes
        case (false, true):  texes = cloudyNightTexes
        case (true,  false): texes = overcastTexes
        case (true,  true):  texes = overcastNightTexes
        }

        // 3层深度：远（小、慢、靠上）→ 近（大、快、靠下），参照 PWA layerCfg
        let layers: [(count: Int, wLo: CGFloat, wHi: CGFloat,
                      alphaLo: CGFloat, alphaHi: CGFloat,
                      yLo: CGFloat, yHi: CGFloat, vLo: CGFloat, vHi: CGFloat)] = overcast
            ? [
                (3, 260, 360, 0.70, 0.88, 0.70, 0.98, 18, 36),
                (3, 320, 440, 0.78, 0.92, 0.60, 0.94, 30, 54),
                (2, 380, 520, 0.72, 0.90, 0.50, 0.84, 50, 84),
              ]
            : [
                (2, 220, 320, 0.55, 0.72, 0.74, 0.98, 14, 28),
                (2, 280, 400, 0.62, 0.80, 0.66, 0.94, 24, 46),
                (2, 340, 480, 0.55, 0.74, 0.56, 0.86, 38, 66),
              ]

        var zPos: CGFloat = 0
        for layer in layers {
            for _ in 0..<layer.count {
                let cloud = SKSpriteNode(texture: texes.randomElement()!)
                let w = CGFloat.random(in: layer.wLo...layer.wHi)
                cloud.size = CGSize(width: w, height: w * 0.44)
                cloud.alpha = CGFloat.random(in: layer.alphaLo...layer.alphaHi)
                let yFrac = CGFloat.random(in: layer.yLo...layer.yHi)
                cloud.position = CGPoint(
                    x: CGFloat.random(in: -(w * 0.3)...(size.width + w * 0.3)),
                    y: size.height * yFrac
                )
                cloud.zPosition = zPos; zPos += 1
                let dx = (Bool.random() ? 1.0 : -1.0) * CGFloat.random(in: layer.vLo...layer.vHi)
                let dur = Double.random(in: 32...64)
                cloud.run(SKAction.repeatForever(SKAction.sequence([
                    SKAction.moveBy(x: dx, y: 0, duration: dur),
                    SKAction.moveBy(x: -dx, y: 0, duration: dur)
                ])))
                addChild(cloud)
            }
        }
        if night { addMoon() }
    }

    /// 预烘焙写实云朵纹理（对应 PWA：合并轮廓 → 模糊羽化 → 体积渐变）：
    ///  1) 沿圆顶包络随机塑形多个泡（中间大、两边小、底部压平）→ 合并实心轮廓
    ///  2) CIGaussianBlur 统一模糊，泡间边界融合 + 边缘羽化
    ///  3) sourceIn 把「亮顶→中→暗底」垂直渐变裁进云形，赋予体积/立体感
    private func buildCloudTex(_ pal: CloudPalette) -> SKTexture {
        let W: CGFloat = 360, H: CGFloat = 150
        let pad: CGFloat = 30
        let full = CGSize(width: W + pad*2, height: H + pad*2)

        // 1. 不规则积云轮廓（UIKit 坐标 y 向下：圆顶朝上、平底朝下）
        let n = 13
        let baseY = pad + H * 0.86
        var blobs: [(CGFloat, CGFloat, CGFloat)] = []
        for i in 0..<n {
            let t = CGFloat(i) / CGFloat(n - 1)
            let env = 0.40 + 0.60 * sin(t * .pi)              // 圆顶包络
            let r = max(14, H * 0.30 * env * CGFloat.random(in: 0.82...1.18))
            let cx = pad + t * W + CGFloat.random(in: -12...12)
            let cy = baseY - r * CGFloat.random(in: 0.05...0.42)  // 各泡底部贴近基线
            blobs.append((cx, cy, r))
        }

        let silhouette = UIGraphicsImageRenderer(size: full).image { _ in
            UIColor.white.setFill()
            for (cx, cy, r) in blobs {
                UIBezierPath(ovalIn: CGRect(x: cx-r, y: cy-r, width: r*2, height: r*2)).fill()
            }
        }

        // 2. CIGaussianBlur 羽化（裁回原尺寸，避免 extent 膨胀）
        let ciCtx = CIContext(options: [.useSoftwareRenderer: false])
        guard let ci = CIImage(image: silhouette),
              let out = CIFilter(name: "CIGaussianBlur", parameters: [
                  kCIInputImageKey: ci, kCIInputRadiusKey: NSNumber(value: 11)
              ])?.outputImage?.cropped(to: ci.extent),
              let blurredCG = ciCtx.createCGImage(out, from: ci.extent)
        else { return dotTexture }
        let blurred = UIImage(cgImage: blurredCG)

        // 3. 体积渐变（亮顶 → 中 → 暗底）裁进云形
        let final = UIGraphicsImageRenderer(size: full).image { ctx in
            let cg = ctx.cgContext
            blurred.draw(at: .zero)                 // 目标 alpha = 羽化云形
            cg.setBlendMode(.sourceIn)              // 用渐变着色，保留云形 alpha
            let colors = [pal.top.cgColor, pal.mid.cgColor, pal.bot.cgColor] as CFArray
            let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                  colors: colors, locations: [0, 0.5, 1])!
            cg.drawLinearGradient(
                grad,
                start: CGPoint(x: 0, y: pad + H*0.40),   // 圆顶（亮）
                end:   CGPoint(x: 0, y: pad + H*0.90),   // 平底（暗）
                options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        return SKTexture(image: final)
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

    // MARK: - fx kind mapping (mirrors web app)

    private func fxKind(_ text: String, night: Bool) -> String {
        if text.contains("雷") { return "thunder" }
        if text.contains("雨") { return "rain" }
        if text.contains("雪") { return "snow" }
        if text.contains("雾") || text.contains("霾") || text.contains("沙") || text.contains("尘") { return "fog" }
        if text.contains("阴") { return night ? "overcast-night" : "overcast" }
        if text.contains("多云") || text.contains("间") { return night ? "cloudy-night" : "cloudy" }
        return night ? "clear-night" : "clear-day"
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
