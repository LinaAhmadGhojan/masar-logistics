import { useId } from "react";

export function Logo({ size = 36, text = true, light = false }: { size?: number; text?: boolean; light?: boolean }) {
  const id = "lg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#35bf90" />
            <stop offset="1" stopColor="#12877f" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill={`url(#${id})`} />
        <path d="M11 34V15l13 12 13-12v19" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="36" r="2.6" fill="#fff" />
      </svg>
      {text && <span className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : ""}`}>Masar</span>}
    </span>
  );
}
