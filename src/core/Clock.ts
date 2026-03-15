import { JulianDate } from '../math/JulianDate';

/** Valid clock step types (matching Cesium's ClockStep). */
export type ClockStep = 'TICK_DEPENDENT' | 'SYSTEM_CLOCK_MULTIPLIER';

/**
 * Clock - Manages simulation time for the CesiumGPU scene.
 *
 * Matches the shape of Cesium's Clock class so that existing Cesium code
 * patterns (clock.currentTime, clock.multiplier, clock.shouldAnimate, etc.)
 * work without modification.
 */
export class Clock {
  /** The current simulation time. */
  currentTime: JulianDate;

  /** Simulation seconds that pass for each real-world second. */
  multiplier: number;

  /** When true the clock advances on each tick(). */
  shouldAnimate: boolean;

  /** Step mode — currently only SYSTEM_CLOCK_MULTIPLIER is implemented. */
  clockStep: ClockStep;

  private _lastRealTime: number = 0;

  constructor(options: {
    currentTime?: JulianDate;
    multiplier?: number;
    shouldAnimate?: boolean;
    clockStep?: ClockStep;
  } = {}) {
    this.currentTime    = options.currentTime    ?? JulianDate.now();
    this.multiplier     = options.multiplier     ?? 1.0;
    this.shouldAnimate  = options.shouldAnimate  ?? false;
    this.clockStep      = options.clockStep      ?? 'SYSTEM_CLOCK_MULTIPLIER';
  }

  /**
   * Advance the simulation clock.
   * Should be called once per rendered frame (or animation tick).
   *
   * @returns true if the time changed (i.e. the clock is running).
   */
  tick(): boolean {
    if (!this.shouldAnimate) {
      this._lastRealTime = 0;
      return false;
    }

    const now = performance.now();
    if (this._lastRealTime === 0) {
      // First tick after starting — record start time and return without advancing.
      this._lastRealTime = now;
      return false;
    }

    const deltaReal = (now - this._lastRealTime) / 1000; // real seconds
    this._lastRealTime = now;

    const deltaSim = deltaReal * this.multiplier;       // simulation seconds
    this.currentTime = this.currentTime.addSeconds(deltaSim);
    return true;
  }

  /** Start the clock (sets shouldAnimate = true). */
  start(): void {
    this.shouldAnimate  = true;
    this._lastRealTime  = 0;
  }

  /** Pause the clock (sets shouldAnimate = false). */
  stop(): void {
    this.shouldAnimate = false;
    this._lastRealTime = 0;
  }

  /** Toggle play / pause. Returns the new shouldAnimate value. */
  toggle(): boolean {
    if (this.shouldAnimate) {
      this.stop();
    } else {
      this.start();
    }
    return this.shouldAnimate;
  }
}

export default Clock;
