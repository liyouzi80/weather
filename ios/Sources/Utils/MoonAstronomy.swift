import Foundation
import CoreLocation

struct MoonPosition {
    let altitude: Double   // degrees above horizon
    let azimuth: Double    // degrees from north clockwise
    let elongation: Double // degrees from sun (0=new, 180=full)
    var isVisible: Bool { altitude > 5 }
    var illumination: Double { (1 - cos(elongation * .pi / 180)) / 2 }
}

// 简化 Meeus 月球位置（精度约 1°）。返回高度角、方位角（N=0,E=90,S=180,W=270）
// 及黄经差 elongation（0=新月,180=满月）。逐项与 PWA src/WeatherFX.tsx moonAltAzPhase 一致，
// 保证两端月相完全相同。
func moonPosition(date: Date, lat latDeg: Double, lon lonDeg: Double) -> MoonPosition {
    let JD = date.timeIntervalSince1970 / 86400.0 + 2440587.5
    let T  = (JD - 2451545.0) / 36525.0

    func R(_ d: Double) -> Double { d * .pi / 180 }
    func s(_ d: Double) -> Double { sin(R(d)) }   // 度 → sin
    func c(_ d: Double) -> Double { cos(R(d)) }   // 度 → cos
    func n(_ x: Double) -> Double { let m = x.truncatingRemainder(dividingBy: 360); return m < 0 ? m + 360 : m }

    // 月球平均轨道根数（度）
    let Lp = n(218.3164477 + 481267.88123421 * T)
    let D  = n(297.8501921 + 445267.1114034  * T)
    let M  = n(357.5291092 + 35999.0502909   * T)
    let Mp = n(134.9633964 + 477198.8675055  * T)
    let F  = n(93.2720950  + 483202.0175233  * T)

    // 黄经、黄纬摄动（度）
    let dL = 6.289*s(Mp) + 1.274*s(2*D-Mp) + 0.658*s(2*D)
           + 0.214*s(2*Mp) - 0.185*s(M) - 0.114*s(2*F)
           + 0.059*s(2*D-2*Mp) + 0.057*s(2*D-M-Mp)
    let dB = 5.128*s(F) + 0.280*s(Mp+F) + 0.277*s(Mp-F)
           + 0.173*s(2*D-F) + 0.055*s(2*D-Mp+F) - 0.046*s(2*D-Mp-F)

    let lam = n(Lp + dL)          // 黄经（度）
    let bet = dB                  // 黄纬（度）
    let eps = 23.439 - 0.013 * T  // 黄赤交角（度）

    // 黄道 → 赤道
    let sinDec = s(bet)*c(eps) + c(bet)*s(eps)*s(lam)
    let decRad = asin(max(-1, min(1, sinDec)))
    let decD   = decRad / (.pi / 180)
    let raRad  = atan2(s(lam)*c(eps) - tan(R(bet))*s(eps), c(lam))
    let raHrs  = n(raRad / (.pi / 180)) / 15   // 赤经（小时）

    // 本地时角（度，0=过中天）
    let JD0  = floor(JD - 0.5) + 0.5
    let T0   = (JD0 - 2451545.0) / 36525.0
    let GMST = ((6.697374558 + 2400.0513369*T0 + 1.0027379093*(JD-JD0)*24)
                  .truncatingRemainder(dividingBy: 24) + 24)
                  .truncatingRemainder(dividingBy: 24)
    let HA   = ((GMST + lonDeg/15 - raHrs) * 15 + 360).truncatingRemainder(dividingBy: 360)

    // 地平坐标
    let sinAlt = s(decD)*s(latDeg) + c(decD)*c(latDeg)*c(HA)
    let altD   = asin(max(-1, min(1, sinAlt))) / (.pi / 180)
    let cosAlt = cos(R(altD))
    let cosAz  = cosAlt < 0.01 ? 0 : (s(decD) - sinAlt*s(latDeg)) / (cosAlt * c(latDeg))
    let arcAz  = acos(max(-1, min(1, cosAz))) / (.pi / 180)   // [0,180]
    let az     = HA < 180 ? 360 - arcAz : arcAz               // N=0,E=90,S=180,W=270

    // 月相黄经差（近似太阳黄经，含中心差修正）
    let sunLam = n(280.46 + 36000.772*T + 1.915*s(357.5291092 + 35999.0502909*T))
    let elongation = n(lam - sunLam)   // 0=新月,180=满月

    return MoonPosition(altitude: altD, azimuth: az, elongation: elongation)
}
