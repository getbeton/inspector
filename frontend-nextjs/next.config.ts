import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Use standalone output for Docker/Railway (Vercel ignores this and uses serverless)
  output: "standalone",

  // Image optimization: Vercel handles this automatically, disabled for Docker
  images: {
    unoptimized: process.env.VERCEL !== '1'
  },

  // Enable Turbopack (Next.js 16 default)
  turbopack: {},

  // Proxy API requests to legacy FastAPI backend (only if LEGACY_BACKEND_URL is set)
  // For the new Next.js API routes migration, this is not needed
  async rewrites() {
    const legacyBackendUrl = process.env.LEGACY_BACKEND_URL

    // Only enable proxying if explicitly configured for legacy backend
    if (!legacyBackendUrl) {
      return { afterFiles: [] }
    }

    return {
      // Use afterFiles so Next.js API routes are checked first
      afterFiles: [
        {
          // Proxy /api/* to legacy backend, but Next.js routes take precedence
          source: '/api/:path*',
          destination: `${legacyBackendUrl}/api/:path*`,
        },
      ],
    }
  },

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
