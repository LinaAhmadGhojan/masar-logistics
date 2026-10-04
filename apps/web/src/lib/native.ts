"use client";
// Bridges to the Android shell (Capacitor). Every function also works in a normal browser.

type Cap = { isNativePlatform?: () => boolean };
const cap = (): Cap | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);

export const isNative = () => !!cap()?.isNativePlatform?.();

export type Pos = { lat: number; lng: number; speed: number | null; accuracy: number | null };

export async function getPosition(): Promise<Pos> {
  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed == null ? null : p.coords.speed * 3.6, accuracy: p.coords.accuracy };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed == null ? null : p.coords.speed * 3.6, accuracy: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

/** Streams the device position; returns a function that stops it. */
export async function watchPosition(cb: (p: Pos) => void, onError?: (e: unknown) => void): Promise<() => void> {
  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000 }, (p, err) => {
      if (err || !p) return onError?.(err);
      cb({ lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed == null ? null : p.coords.speed * 3.6, accuracy: p.coords.accuracy });
    });
    return () => void Geolocation.clearWatch({ id });
  }
  if (!navigator.geolocation) {
    onError?.(new Error("no-geolocation"));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => cb({ lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed == null ? null : p.coords.speed * 3.6, accuracy: p.coords.accuracy }),
    (e) => onError?.(e),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Saves a text file: shares it on Android, downloads it in the browser. */
export async function saveFile(name: string, content: string, mime = "text/plain") {
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const w = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: w.uri, dialogTitle: name });
    return;
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function shareText(title: string, text: string, url?: string) {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
  } catch {}
  return false;
}
