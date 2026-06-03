import SpriteKit
import SwiftUI

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
    private lazy var cloudTexture: SKTexture = makeCloudTexture()

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
        case "cloudy":          setupClouds(overcast: false)
        case "overcast":        setupClouds(overcast: true)
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

    // 柔和羽化的云朵纹理 sprite——少量、靠上、低透明度缓慢飘移，避免「肥皂泡」观感
    private func setupClouds(overcast: Bool) {
        let count = overcast ? 5 : 3
        for i in 0..<count {
            let cloud = SKSpriteNode(texture: cloudTexture)
            let w = CGFloat.random(in: 260...400)
            cloud.size = CGSize(width: w, height: w * 0.55)
            cloud.alpha = overcast ? CGFloat.random(in: 0.30...0.46)
                                   : CGFloat.random(in: 0.16...0.28)
            // 阴天偏灰、覆盖更靠下；多云偏白、集中在顶部
            if overcast {
                cloud.color = UIColor(white: 0.78, alpha: 1)
                cloud.colorBlendFactor = 0.5
            }
            let yBand: ClosedRange<CGFloat> = overcast ? 0.62...0.98 : 0.74...0.97
            cloud.position = CGPoint(x: CGFloat.random(in: 0...size.width),
                                     y: size.height * CGFloat.random(in: yBand))
            cloud.zPosition = CGFloat(i)
            let dx = (Bool.random() ? 1.0 : -1.0) * CGFloat.random(in: 30...60)
            let dur = Double.random(in: 30...52)
            cloud.run(SKAction.repeatForever(SKAction.sequence([
                SKAction.moveBy(x: dx, y: 0, duration: dur),
                SKAction.moveBy(x: -dx, y: 0, duration: dur)
            ])))
            addChild(cloud)
        }
        if isNight { addMoon() }
    }

    /// 由多个重叠柔和径向渐变拼出一朵羽化云（边缘自然渐隐，无硬边）
    private func makeCloudTexture() -> SKTexture {
        let s = CGSize(width: 256, height: 140)
        let renderer = UIGraphicsImageRenderer(size: s)
        let img = renderer.image { ctx in
            let cg = ctx.cgContext
            // (中心x比例, 中心y比例, 半径占高比例)
            let puffs: [(CGFloat, CGFloat, CGFloat)] = [
                (0.30, 0.52, 0.40), (0.45, 0.40, 0.50), (0.58, 0.52, 0.46),
                (0.50, 0.60, 0.42), (0.70, 0.58, 0.34), (0.26, 0.60, 0.30),
            ]
            for (fx, fy, fr) in puffs {
                let center = CGPoint(x: s.width * fx, y: s.height * fy)
                let radius = s.height * fr
                let colors = [UIColor(white: 1, alpha: 0.85).cgColor,
                              UIColor(white: 1, alpha: 0).cgColor]
                let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                      colors: colors as CFArray, locations: [0, 1])!
                cg.drawRadialGradient(grad, startCenter: center, startRadius: 0,
                                      endCenter: center, endRadius: radius, options: [])
            }
        }
        return SKTexture(image: img)
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
        if text.contains("雾") || text.contains("霾") { return "fog" }
        if text.contains("阴") { return "overcast" }
        if text.contains("多云") || text.contains("间") { return "cloudy" }
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
