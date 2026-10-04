"use client";
// Driver actions made without a connection are queued on the device and replayed when it is back.
import { api, ApiError } from "./api";

const KEY = "masar-queue";
export type Queued = { id: string; path: string; body: unknown; at: number; label: string };

const read = (): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};
const write = (q: Queued[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
    window.dispatchEvent(new Event("masar-queue"));
  } catch {}
};

export const queued = () => read();
export const enqueue = (path: string, body: unknown, label: string) => write([...read(), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, path, body, at: Date.now(), label }]);

let flushing = false;
/** Replays the queue in order. Stops at the first network failure; drops items the server rejects for good. */
export async function flush(): Promise<{ done: number; dropped: number }> {
  if (flushing) return { done: 0, dropped: 0 };
  flushing = true;
  let done = 0;
  let dropped = 0;
  try {
    for (const item of read()) {
      try {
        await api(item.path, { method: "POST", body: item.body });
        done++;
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // still offline: keep the rest
        dropped++; // the server said no (e.g. already delivered): do not retry forever
      }
      write(read().filter((q) => q.id !== item.id));
    }
  } finally {
    flushing = false;
  }
  return { done, dropped };
}

export const isOfflineError = (e: unknown) => e instanceof ApiError && e.status === 0;
