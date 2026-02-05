import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Standalone output for Docker self-hosting (Vercel ignores this)
  output: "standalone",

  // Vercel handles image optimization; disable for Docker
  images: {
    unoptimized: process.env.VERCEL !== '1'
  },

  turbopack: {},
}

export default nextConfig
