import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production bundle (.next/standalone) for ZIP distribution
  output: "standalone",
};

export default nextConfig;
