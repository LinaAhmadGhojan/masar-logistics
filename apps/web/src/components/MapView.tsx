"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";
import { useEffect, useRef } from "react";

export type MapMarker = { lat: number; lng: number; label?: string; color?: string; kind?: "pin" | "truck" | "dot"; popup?: string; href?: string };
type Props = { markers?: MapMarker[]; lines?: { points: [number, number][]; color?: string; dashed?: boolean }[]; height?: number | string; onPick?: (lat: number, lng: number) => void; fitKey?: string; className?: string };

type L = typeof import("leaflet");

export default function MapView({ markers = [], lines = [], height = 320, onPick, fitKey, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const lib = useRef<L | null>(null);
  const pick = useRef(onPick);
  const fitted = useRef<string | undefined>(undefined);
  pick.current = onPick;

  const draw = () => {
    const L = lib.current;
    const m = map.current;
    if (!L || !m || !layer.current) return;
    layer.current.clearLayers();
    const bounds: [number, number][] = [];
    for (const ln of lines) {
      if (ln.points.length > 1) {
        L.polyline(ln.points, { color: ln.color ?? "#2aa57c", weight: 4, opacity: 0.85, dashArray: ln.dashed ? "6 8" : undefined }).addTo(layer.current);
        bounds.push(...ln.points);
      }
    }
    for (const k of markers) {
      const color = k.color ?? "#2aa57c";
      const size = k.kind === "dot" ? 12 : k.kind === "truck" ? 34 : 30;
      const icon = L.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div class="mk ${k.kind === "truck" ? "mk-truck" : ""}" style="width:${size}px;height:${size}px;background:${color}">${k.kind === "dot" ? "" : (k.label ?? "")}</div>`,
      });
      const mk = L.marker([k.lat, k.lng], { icon }).addTo(layer.current);
      if (k.popup) mk.bindPopup(k.popup);
      if (k.href) mk.on("click", () => (window.location.href = k.href!));
      bounds.push([k.lat, k.lng]);
    }
    if (bounds.length && fitted.current !== (fitKey ?? String(bounds.length))) {
      fitted.current = fitKey ?? String(bounds.length);
      if (bounds.length === 1) m.setView(bounds[0], 13);
      else m.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  };

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default as unknown as L;
      if (dead || !el.current) return;
      lib.current = L;
      const m = L.map(el.current, { zoomControl: true }).setView([24.7, 46.7], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      m.on("click", (e) => pick.current?.(e.latlng.lat, e.latlng.lng));
      map.current = m;
      draw();
      setTimeout(() => m.invalidateSize(), 150);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className} style={{ height, width: "100%", borderRadius: 12, cursor: onPick ? "crosshair" : undefined }} />;
}
