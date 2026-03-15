/**
 * JulianDate - A representation of a date and time in the Julian date format,
 * matching Cesium's JulianDate API.
 */
export class JulianDate {
  /** The Julian day number (integer part of the Julian date). */
  readonly dayNumber: number;
  /** The number of seconds elapsed into the day (0..86400). */
  readonly secondsOfDay: number;

  constructor(dayNumber: number = 0, secondsOfDay: number = 0) {
    // Normalise so secondsOfDay is always in [0, 86400)
    const extraDays = Math.floor(secondsOfDay / 86400);
    this.dayNumber    = dayNumber + extraDays;
    this.secondsOfDay = secondsOfDay - extraDays * 86400;
  }

  /**
   * Create a JulianDate from a JavaScript Date (treated as UTC).
   */
  static fromDate(date: Date): JulianDate {
    const y   = date.getUTCFullYear();
    const m   = date.getUTCMonth() + 1; // 1-12
    const d   = date.getUTCDate();
    const h   = date.getUTCHours();
    const min = date.getUTCMinutes();
    const s   = date.getUTCSeconds();

    // Standard algorithm for Julian Day Number (valid for Gregorian calendar).
    // Reference: Meeus, "Astronomical Algorithms", 2nd ed., Chapter 7.
    // The constants 4716, 30.6001, and 1524 arise from the historical alignment
    // of the Julian calendar epoch and Gregorian reform offsets.
    const A   = Math.floor(y / 100);          // century number
    const B   = 2 - A + Math.floor(A / 4);   // Gregorian calendar correction
    const jdn = Math.floor(365.25 * (y + 4716))   // whole years since Julian epoch
              + Math.floor(30.6001 * (m + 1))      // whole months (30.6001 avoids rounding)
              + d + B - 1524;                       // day + correction - epoch offset

    // Fractional day: Julian dates start at noon, so midnight = 0.5 days after JDN
    const secondsOfDay = h * 3600 + min * 60 + s;

    // JDN already corresponds to noon; midnight of that calendar day = JDN - 0.5.
    // We store the integer day as (JDN - 1) to align dayNumber with midnight,
    // matching Cesium's convention where secondsOfDay starts at midnight.
    return new JulianDate(jdn - 1, secondsOfDay + 43200 /* +12 h = noon offset */);
  }

  /**
   * Return a JulianDate representing the current UTC time.
   */
  static now(): JulianDate {
    return JulianDate.fromDate(new Date());
  }

  /**
   * Return the full Julian date as a floating-point number.
   * J2000.0 = 2451545.0
   */
  toJulianDate(): number {
    return this.dayNumber + this.secondsOfDay / 86400.0;
  }

  /**
   * Convert back to a JavaScript Date (UTC).
   */
  toDate(): Date {
    // Julian date → Gregorian calendar (Meeus, "Astronomical Algorithms", ch. 7)
    const jd = this.toJulianDate() + 0.5;
    const Z  = Math.floor(jd);
    const F  = jd - Z;

    let A: number;
    if (Z < 2299161) {
      A = Z;
    } else {
      const alpha = Math.floor((Z - 1867216.25) / 36524.25);
      A = Z + 1 + alpha - Math.floor(alpha / 4);
    }
    const Bv = A + 1524;
    const C  = Math.floor((Bv - 122.1) / 365.25);
    const D  = Math.floor(365.25 * C);
    const E  = Math.floor((Bv - D) / 30.6001);

    const day   = Bv - D - Math.floor(30.6001 * E);
    const month = E < 14 ? E - 1 : E - 13;
    const year  = month > 2 ? C - 4716 : C - 4715;

    const totalSec = F * 86400;
    const hours    = Math.floor(totalSec / 3600);
    const minutes  = Math.floor((totalSec % 3600) / 60);
    const seconds  = Math.floor(totalSec % 60);

    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  }

  /**
   * Add the given number of seconds and return a new JulianDate.
   */
  addSeconds(seconds: number): JulianDate {
    return new JulianDate(this.dayNumber, this.secondsOfDay + seconds);
  }

  /**
   * Difference in seconds: this - other.
   */
  secondsDifference(other: JulianDate): number {
    return (this.dayNumber - other.dayNumber) * 86400
         + (this.secondsOfDay - other.secondsOfDay);
  }

  /** True if this time equals other (same day and second). */
  equals(other: JulianDate): boolean {
    return this.dayNumber === other.dayNumber
        && this.secondsOfDay === other.secondsOfDay;
  }
}

export default JulianDate;
