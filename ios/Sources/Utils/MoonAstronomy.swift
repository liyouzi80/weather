import Foundation
import CoreLocation

struct MoonPosition {
    let altitude: Double   // degrees above horizon
    let azimuth: Double    // degrees from north clockwise
    let elongation: Double // degrees from sun (0=new, 180=full)
    var isVisible: Bool { altitude > 5 }
    var illumination: Double { (1 - cos(elongation * .pi / 180)) / 2 }
}

func moonPosition(date: Date, lat: Double, lon: Double) -> MoonPosition {
    let JD = date.timeIntervalSince1970 / 86400.0 + 2440587.5
    let T  = (JD - 2451545.0) / 36525.0

    // Moon mean elements (degrees)
    let Lp = (218.3164477 + 481267.88123421 * T).truncatingRemainder(dividingBy: 360)
    let D  = (297.8501921 + 445267.1114034  * T).truncatingRemainder(dividingBy: 360)
    let M  = (357.5291092 + 35999.0502909   * T).truncatingRemainder(dividingBy: 360)
    let Mp = (134.9633964 + 477198.8675055  * T).truncatingRemainder(dividingBy: 360)
    let F  = (93.2720950  + 483202.0175233  * T).truncatingRemainder(dividingBy: 360)

    func r(_ d: Double) -> Double { d * .pi / 180 }

    // Longitude perturbations (degrees)
    let dL = 6.289*sin(r(Mp)) + 1.274*sin(r(2*D-Mp)) + 0.658*sin(r(2*D))
           + 0.214*sin(r(2*Mp)) - 0.186*sin(r(M))   - 0.114*sin(r(2*F))
           - 0.059*sin(r(2*D-2*Mp)) - 0.057*sin(r(2*D-M-Mp))
    let lam = Lp + dL

    // Latitude perturbations
    let dB = 5.128*sin(r(F)) + 0.281*sin(r(Mp+F)) - 0.280*sin(r(F-Mp))
           - 0.173*sin(r(F+2*D)) - 0.055*sin(r(2*D-F))
    let beta = dB

    // Obliquity
    let eps = 23.439291 - 0.013004 * T

    // Ecliptic → equatorial
    let lamR = r(lam); let betaR = r(beta); let epsR = r(eps)
    let sinDec = sin(betaR)*cos(epsR) + cos(betaR)*sin(epsR)*sin(lamR)
    let dec = asin(sinDec)
    let ra  = atan2(sin(lamR)*cos(epsR) - tan(betaR)*sin(epsR), cos(lamR))

    // Sun mean longitude for elongation
    let sunLam = (280.46646 + 36000.76983 * T).truncatingRemainder(dividingBy: 360)
    var elong = lam - sunLam
    if elong < 0 { elong += 360 }

    // Hour angle
    let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0)
    let LST  = (GMST + lon).truncatingRemainder(dividingBy: 360)
    let HA   = r(LST) - ra
    let latR = r(lat)

    // Altitude & azimuth
    let sinAlt = sin(latR)*sin(dec) + cos(latR)*cos(dec)*cos(HA)
    let altD    = asin(sinAlt) * 180 / .pi
    let cosAz   = (sin(dec) - sin(latR)*sinAlt) / (cos(latR)*cos(asin(sinAlt)))
    var az      = acos(max(-1, min(1, cosAz))) * 180 / .pi
    if sin(HA) > 0 { az = 360 - az }

    return MoonPosition(altitude: altD, azimuth: az, elongation: elong)
}
