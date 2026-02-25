import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === 'production'
  const siteUrl = isProduction
    ? 'https://inspector.getbeton.ai'
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // Block indexation on non-production environments (staging, preview, local)
  if (!isProduction) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/llms.txt'],
        disallow: ['/api/', '/_next/', '/auth/', '/setup', '/settings/', '/memory/'],
      },
      // AI crawlers — explicit allow
      ...['GPTBot', 'ChatGPT-User', 'Claude-Web', 'ClaudeBot', 'Anthropic-AI', 'PerplexityBot', 'Amazonbot', 'Google-Extended'].map(bot => ({
        userAgent: bot,
        allow: ['/', '/llms.txt'],
        disallow: ['/api/', '/_next/', '/auth/', '/setup', '/settings/', '/memory/'],
      })),
      // Block scraper bots
      ...['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot'].map(bot => ({
        userAgent: bot,
        disallow: ['/'],
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
