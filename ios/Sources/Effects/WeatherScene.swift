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

    override func didMove(to view: SKView) {
        backgroundColor = .clear
        scaleMode = .resizeFill
        setupEffect()
        startMoonTimer()
    }

    override func willMove(from view: SKView) {
        moonTimer?.invalidate()
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
        guard let emitter = SKEmitterNode(fileNamed: "Rain.sks") else {
            // Fallback: programmatic rain
            addProgrammaticRain()
            return
        }
        emitter.position = CGPoint(x: size.width / 2, y: size.height + 50)
        emitter.particlePositionRange = CGVector(dx: size.width * 1.5, dy: 0)
        addChild(emitter)
        if thunder { scheduleThunder() }
    }

    private func addProgrammaticRain() {
        let emitter = SKEmitterNode()
        emitter.particleTexture = SKTexture(imageNamed: "spark")
        emitter.particleBirthRate = 120
        emitter.particleLifetime = 1.2
        emitter.particleLifetimeRange = 0.3
        emitter.particleSpeed = 600
        emitter.particleSpeedRange = 100
        emitter.emissionAngle = -.pi / 2 + 0.1
        emitter.emissionAngleRange = 0.05
        emitter.particleAlpha = 0.5
        emitter.particleAlphaRange = 0.2
        emitter.particleScale = 0.03
        emitter.particleScaleRange = 0.01
        emitter.particleColor = UIColor(white: 0.85, alpha: 1)
        emitter.particleColorBlendFactor = 1
        emitter.position = CGPoint(x: size.width / 2, y: size.height + 20)
        emitter.particlePositionRange = CGVector(dx: size.width * 1.4, dy: 0)
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
        emitter.particleBirthRate = 25
        emitter.particleLifetime = 5
        emitter.particleLifetimeRange = 2
        emitter.particleSpeed = 60
        emitter.particleSpeedRange = 30
        emitter.emissionAngle = -.pi / 2
        emitter.emissionAngleRange = .pi / 6
        emitter.particleAlpha = 0.8
        emitter.particleAlphaRange = 0.3
        emitter.particleScale = 0.06
        emitter.particleScaleRange = 0.04
        emitter.particleColor = .white
        emitter.particleColorBlendFactor = 1
        emitter.position = CGPoint(x: size.width / 2, y: size.height + 20)
        emitter.particlePositionRange = CGVector(dx: size.width * 1.2, dy: 0)
        addChild(emitter)
    }

    // MARK: - Fog

    private func setupFog() {
        for i in 0..<6 {
            let fog = SKSpriteNode(color: UIColor(white: 0.9, alpha: 0.06 + Double(i) * 0.015),
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
        // Light dust particles
        let dust = SKEmitterNode()
        dust.particleBirthRate = 4
        dust.particleLifetime = 8
        dust.particleLifetimeRange = 4
        dust.particleSpeed = 15
        dust.particleSpeedRange = 10
        dust.emissionAngle = 0
        dust.emissionAngleRange = .pi * 2
        dust.particleAlpha = 0.4
        dust.particleAlphaRange = 0.3
        dust.particleScale = 0.015
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

    private func setupClouds(overcast: Bool) {
        let count = overcast ? 8 : 5
        let alpha: Double = overcast ? 0.18 : 0.10
        for i in 0..<count {
            let cloud = SKSpriteNode(color: UIColor(white: 0.85, alpha: alpha + Double(i) * 0.01),
                                     size: CGSize(width: CGFloat.random(in: 160...260),
                                                  height: CGFloat.random(in: 50...90)))
            cloud.position = CGPoint(x: CGFloat.random(in: 0...size.width),
                                     y: size.height * CGFloat.random(in: 0.4...0.9))
            let dx = (Bool.random() ? 1.0 : -1.0) * CGFloat.random(in: 40...80)
            let dur = Double.random(in: 18...35)
            cloud.run(SKAction.repeatForever(SKAction.sequence([
                SKAction.moveBy(x: dx, y: 0, duration: dur),
                SKAction.moveBy(x: -dx, y: 0, duration: dur)
            ])))
            addChild(cloud)
        }
        if !isNight && !overcast { addMoon() } // moon between cloud layers at night
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
