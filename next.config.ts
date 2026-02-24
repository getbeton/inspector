import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Standalone output for Docker self-hosting (Vercel ignores this)
  output: "standalone",

  // Vercel handles image optimization; disable for Docker
  images: {
    unoptimized: process.env.VERCEL !== '1'
  },

  turbopack: {},

  // Rewrite .well-known path to API route (Next.js app dir doesn't support
  // dot-prefixed folders, so we serve the metadata from /api/well-known/*)
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/well-known/oauth-metadata',
      },
    ]
  },
}

export default nextConfig
