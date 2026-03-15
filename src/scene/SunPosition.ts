import { JulianDate } from '../math/JulianDate';

/**
 * SunPosition - Computes the direction of the Sun relative to Earth in
 * ECEF (Earth-Centered Earth-Fixed) coordinates.
 *
 * Algorithm: simplified solar position (Meeus, "Astronomical Algorithms"),
 * accurate to ~1° for dates near J2000 (2000–2050).
 */
export class SunPosition {
  /**
   * Compute the unit vector pointing FROM the Sun TOWARD Earth in ECEF.
   * This is the direction used as a DirectionalLight direction so that the
   * rendered scene is lit as if by the Sun at the given moment in time.
   *
   * @param julianDate - The simulation time.
   * @returns Normalised [x, y, z] direction vector in ECEF.
   */
  static computeSunDirection(julianDate: JulianDate): [number, number, number] {
    const jd = julianDate.toJulianDate();

    // Days since J2000.0 (noon on 2000-Jan-01)
    const d = jd - 2451545.0;

    // ── Ecliptic coordinates ────────────────────────────────────────────────
    // Simplified solar position model from Meeus, "Astronomical Algorithms", ch. 25.
    // All polynomial coefficients are in degrees unless noted otherwise.

    // Mean longitude of the Sun (degrees) — epoch J2000 value + rate per day
    const MEAN_LON_J2000       = 280.46;   // deg, mean longitude at J2000.0
    const MEAN_LON_RATE        = 0.9856474; // deg/day
    const L = ((MEAN_LON_J2000 + MEAN_LON_RATE * d) % 360 + 360) % 360;

    // Mean anomaly (degrees) — governs the equation of centre correction
    const MEAN_ANOM_J2000      = 357.528;  // deg, mean anomaly at J2000.0
    const MEAN_ANOM_RATE       = 0.9856003; // deg/day
    const gDeg = ((MEAN_ANOM_J2000 + MEAN_ANOM_RATE * d) % 360 + 360) % 360;
    const g    = gDeg * (Math.PI / 180);

    // Ecliptic longitude (degrees), accounting for the equation of centre.
    // First-order coefficient 1.915° ≈ 2e·(180/π) where e ≈ 0.01671 is Earth's
    // orbital eccentricity; second-order 0.020° is a small correction term.
    const EOC_FIRST  = 1.915; // deg, first-order equation-of-centre coefficient
    const EOC_SECOND = 0.020; // deg, second-order correction
    const lambdaDeg = L + EOC_FIRST * Math.sin(g) + EOC_SECOND * Math.sin(2 * g);
    const lambda    = lambdaDeg * (Math.PI / 180);

    // Obliquity of the ecliptic (degrees).
    // 23.439° is the value at J2000; −4×10⁻⁷ deg/day is the secular decrease.
    const OBLIQUITY_J2000 = 23.439; // deg, axial tilt at J2000.0
    const OBLIQUITY_RATE  = 0.0000004; // deg/day (secular decrease)
    const epsDeg = OBLIQUITY_J2000 - OBLIQUITY_RATE * d;
    const eps    = epsDeg * (Math.PI / 180);

    // ── Equatorial coordinates (geocentric) ─────────────────────────────────
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const sinEps    = Math.sin(eps);
    const cosEps    = Math.cos(eps);

    // Right ascension (radians)
    const ra  = Math.atan2(cosEps * sinLambda, cosLambda);

    // Declination (radians)
    const dec = Math.asin(sinEps * sinLambda);

    // ── Greenwich Mean Sidereal Time (GMST, radians) ─────────────────────
    // GMST at J2000.0 is 280.461°; it advances at ~360.985647° per solar day
    // (slightly more than 360° because of Earth's orbital motion around the Sun).
    const GMST_J2000 = 280.46061837; // deg, GMST at J2000.0 noon
    const GMST_RATE  = 360.98564736629; // deg/day (Earth's sidereal rotation rate)
    const gmstDeg = ((GMST_J2000 + GMST_RATE * d) % 360 + 360) % 360;
    const gmst    = gmstDeg * (Math.PI / 180);

    // ── ECI → ECEF (rotate around Z by -GMST) ────────────────────────────
    // Sun direction FROM Earth TO Sun in ECEF:
    //   X =  cos(dec) * cos(ra - gmst)
    //   Y =  cos(dec) * sin(ra - gmst)
    //   Z =  sin(dec)
    const cosDec = Math.cos(dec);
    const angle  = ra - gmst;

    const sx =  cosDec * Math.cos(angle);
    const sy =  cosDec * Math.sin(angle);
    const sz =  Math.sin(dec);

    // Negate: direction FROM Sun TO Earth (what DirectionalLight.direction means)
    const mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
    return [-sx / mag, -sy / mag, -sz / mag];
  }

  /**
   * Compute the sun's geographic sub-solar point (longitude, latitude in degrees)
   * at the given time — useful for debugging / display.
   */
  static computeSubSolarPoint(julianDate: JulianDate): { longitude: number; latitude: number } {
    const [dx, dy, dz] = SunPosition.computeSunDirection(julianDate);
    // The sub-solar point is in the direction FROM Earth TOWARD the Sun
    const longitude = Math.atan2(-dy, -dx) * (180 / Math.PI);
    const latitude  = Math.asin(-dz) * (180 / Math.PI);
    return { longitude, latitude };
  }
}

export default SunPosition;
