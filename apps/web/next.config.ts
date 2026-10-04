import type { NextConfig } from "next";

// Static export: the same build is hosted as a website (any static host) and wrapped by Capacitor for the APK.
// NEXT_PUBLIC_BASE_PATH lets it live in a sub-folder (e.g. "/masar-logistics" inside the portfolio).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  devIndicators: false,
};

export default nextConfig;
