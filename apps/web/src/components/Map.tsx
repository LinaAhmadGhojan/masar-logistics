"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-40 w-full place-items-center rounded-xl bg-card2 text-sm text-muted">…</div>,
});
export default Map;
export type { MapMarker } from "./MapView";
