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

  // Proxy API requests to backend (keeps cookies on same domain)
  async rewrites() {
    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return {
      // Use afterFiles so Next.js API routes are checked first
      afterFiles: [
        {
          // Proxy /api/* to backend, but Next.js routes (/api/session, /api/health) take precedence
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
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
