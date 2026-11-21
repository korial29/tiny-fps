// Leave room for clock rounding and 119.88 Hz when identifying a high-refresh display.
const FAST = 9.2;
const WINDOW = 750;
const RETRY = 15000;

/** Follows whole display refreshes, including when a loaded scene needs a lower cadence. */
export const createPacing = (initial = Infinity) => {
  let period = initial > 0 && initial <= FAST ? initial : Infinity;
  let last: number | undefined;
  let painted = -Infinity;
  let from = 0;
  let frames = 0;
  let missed = 0;
  let sample = 0;
  let stable = 0;
  let overloaded = 0;
  let retry = 0;

  const reset = (now: number) => {
    [from, frames, missed] = [now, 0, 0];
  };

  return {
    draw(now: number, playing: boolean): boolean {
      const gap = last === undefined ? Infinity : now - last;
      last = now;
      if (!playing || gap > 250) {
        // Loading and time spent in a background tab say nothing about rendering cost.
        reset(now);
        [stable, overloaded, retry] = [0, 0, 0];
        painted = now;
        return true;
      }
      // A multiple of the old period may be a missed vsync. Require a longer
      // stable sequence before treating it as the new refresh rate.
      const slots = gap / period;
      const targetSlots = Math.max(1, Math.floor(8.5 / period));
      const changed = Math.abs(slots - 1) > 0.15;
      const missedVsync = slots > targetSlots + 0.5 && Math.abs(slots - Math.round(slots)) < 0.2;
      if (gap > 0 && changed) {
        if (!stable || Math.abs(gap - sample) > sample * 0.12) {
          sample = gap;
          stable = 1;
        } else {
          sample += (gap - sample) / ++stable;
          if (stable >= (missedVsync ? 24 : 6)) {
            period = sample;
            [stable, overloaded, retry] = [0, 0, 0];
            reset(now);
          }
        }
      } else {
        stable = 0;
      }
      if (period > FAST) {
        painted = now;
        return true;
      }
      if (retry && now >= retry) {
        [retry, overloaded] = [0, 0];
        reset(now);
      }
      // A 240 Hz or 360 Hz display can present exactly 120 fps on even intervals.
      const target = period * Math.max(1, Math.floor(8.5 / period));
      const fallback = period * Math.max(2, Math.round(1000 / 60 / period));
      const elapsed = now - painted;
      if (elapsed < (retry ? fallback : target) - period / 2) {
        return false;
      }
      painted = now;
      if (!retry) {
        frames++;
        missed += +(elapsed > target + period / 2);
        if (now - from >= WINDOW) {
          overloaded = missed >= 3 && missed > frames * 0.04 ? overloaded + 1 : 0;
          if (overloaded >= 2) {
            retry = now + RETRY;
          }
          reset(now);
        }
      }
      return true;
    },
  };
};
