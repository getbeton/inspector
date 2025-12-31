import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Always use standalone output for production builds (Railway/Docker)
  output: "standalone",

  // Disable image optimization for Docker
  images: {
    unoptimized: true
  },

  // Enable Turbopack (Next.js 16 default)
  turbopack: {},

  // Enable hot reload in Docker containers (webpack fallback)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300, // Delay rebuild after first change
        ignored: /node_modules/
      }
    }
    return config
  }
}

export default nextConfig
