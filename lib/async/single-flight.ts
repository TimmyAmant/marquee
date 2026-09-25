declare global {
  var __marqueeInFlight: Map<string, Promise<unknown>> | undefined;
}

// On globalThis for the same reason as the rate-limit buckets: Next.js can
// load a module more than once per process, and a cron run, a "Sync now"
// click and a webhook must all see the same in-flight sync.
const inFlight: Map<string, Promise<unknown>> = (globalThis.__marqueeInFlight ??= new Map());

/** Runs `fn` unless a call with the same key is already running, in which
 * case the caller shares that run's result. Stops the scheduled job, a
 * manual sync and a burst of webhooks from syncing the same library on top
 * of each other. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const run = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** Runs `fn` as the key's next run, on its own: waits out the run in
 * flight (and any that start while waiting), then starts `fn` under the key
 * in the same tick as the check, so no other run can slip in first. Runs
 * started meanwhile join `fn`'s. */
export async function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  for (let running = inFlight.get(key); running; running = inFlight.get(key)) {
    await running.catch(() => undefined);
  }
  return singleFlight(key, fn);
}

/** Resolves once no run for `key` is in flight — immediately if there isn't
 * one, and whether the running one succeeds or fails. Lets a disconnect
 * wait for a sync to stop writing before it deletes that sync's data. */
export async function whenIdle(key: string): Promise<void> {
  const running = inFlight.get(key);
  if (!running) return;
  await running.catch(() => undefined);
}

declare global {
  var __marqueeDebounceTimers: Map<string, ReturnType<typeof setTimeout>> | undefined;
}

const timers: Map<string, ReturnType<typeof setTimeout>> = (globalThis.__marqueeDebounceTimers ??= new Map());

/** Runs `fn` once, `delayMs` after the last call with the same key — so a
 * season-pack import that fires one webhook per episode costs one sync, not
 * forty. Errors are the caller's to swallow inside `fn`. */
export function debounce(key: string, delayMs: number, fn: () => void): void {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(key);
    fn();
  }, delayMs);
  timer.unref?.();
  timers.set(key, timer);
}
