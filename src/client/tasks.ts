// Long work split into tasks of its own, so that the page answers and paints meanwhile: the
// renderer's warm-up (render.ts warmSteps()) and a map's scenery (render.ts decor()). No GL.

/**
 * Runs `f` in a task of its own: scheduler.postTask where there is one (a background tab holds
 * back chained timers, by a second each), else a timer.
 */
export const later = (f: () => void) => {
  const sched = (globalThis as { scheduler?: { postTask(f: () => void): Promise<void> } })
    .scheduler;
  if (sched) {
    void sched.postTask(f);
  } else {
    setTimeout(f);
  }
};

/** How long a task runs steps before it gives the page its turn, ms. */
const BUDGET = 8;

/**
 * Runs `steps` in tasks of their own, as many in each as take under BUDGET (those already done
 * take none), each until it says it is done (it returns true while it has more to do), then
 * `done`; stops for good once `alive()` is false.
 */
export const stepwise = (
  steps: (() => boolean | void)[],
  done: () => void,
  alive: () => boolean = () => true,
) => {
  let i = 0;
  const next = () => {
    if (!alive()) {
      return;
    }
    const t = performance.now();
    while (i < steps.length && performance.now() - t < BUDGET) {
      if (!steps[i]()) {
        i++;
      }
    }
    if (i < steps.length) {
      later(next);
    } else {
      done();
    }
  };
  later(next);
};

/** What the generator `g` returns, worked out a part at a time (a yield between two), a task or so each. */
export const drive = <T>(g: Generator<undefined, T, undefined>): Promise<T> =>
  new Promise((resolve, reject) => {
    let out: T;
    stepwise(
      [
        () => {
          try {
            const n = g.next();
            if (n.done) {
              out = n.value;
            }
            return !n.done;
          } catch (e) {
            reject(e);
            return false;
          }
        },
      ],
      () => resolve(out),
    );
  });
