import type { ScrapingResultListItem, ScrapingResultDetail } from '@/lib/api/scraping-results'

// ─── Mock Scraping Results (list view) ───

export const MOCK_SCRAPING_RESULTS: ScrapingResultListItem[] = [
  {
    id: 'scrape-001',
    session_id: 'uuid-001',
    url: 'https://acme.com/pricing',
    operation: 'scrape',
    content_size_bytes: 14320,
    created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: 'scrape-002',
    session_id: 'uuid-001',
    url: 'https://acme.com/docs/api-reference',
    operation: 'scrape',
    content_size_bytes: 52480,
    created_at: new Date(Date.now() - 28 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 28 * 60_000).toISOString(),
  },
  {
    id: 'scrape-003',
    session_id: 'uuid-001',
    url: 'https://acme.com',
    operation: 'crawl',
    content_size_bytes: 198750,
    created_at: new Date(Date.now() - 25 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 25 * 60_000).toISOString(),
  },
  {
    id: 'scrape-004',
    session_id: 'uuid-002',
    url: 'https://competitor.io/features',
    operation: 'scrape',
    content_size_bytes: 8920,
    created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
  {
    id: 'scrape-005',
    session_id: 'uuid-002',
    url: 'https://competitor.io/pricing',
    operation: 'extract',
    content_size_bytes: 3210,
    created_at: new Date(Date.now() - 2 * 60 * 60_000 + 60_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60_000 + 60_000).toISOString(),
  },
  {
    id: 'scrape-006',
    session_id: 'uuid-003',
    url: 'https://blog.example.com/product-led-growth-playbook',
    operation: 'scrape',
    content_size_bytes: 42100,
    created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  },
]

// ─── Mock Detail Data (keyed by ID) ───

export const MOCK_SCRAPING_DETAIL: Record<string, ScrapingResultDetail> = {
  'scrape-001': {
    ...MOCK_SCRAPING_RESULTS[0],
    content: {
      markdown: '# Acme Pricing\n\n## Starter Plan\n- $29/month\n- Up to 1,000 events\n- 1 team member\n\n## Pro Plan\n- $99/month\n- Up to 50,000 events\n- 5 team members\n- Priority support\n\n## Enterprise\n- Custom pricing\n- Unlimited events\n- SSO & SAML\n- Dedicated CSM',
      links: ['https://acme.com/signup', 'https://acme.com/contact', 'https://acme.com/docs'],
      metadata: { title: 'Pricing - Acme', statusCode: 200, sourceURL: 'https://acme.com/pricing' },
    },
  },
  'scrape-002': {
    ...MOCK_SCRAPING_RESULTS[1],
    content: {
      markdown: '# API Reference\n\n## Authentication\nAll API requests require a Bearer token.\n\n```bash\ncurl -H "Authorization: Bearer sk_live_..." https://api.acme.com/v1/events\n```\n\n## Endpoints\n\n### POST /v1/events\nTrack a new event.\n\n### GET /v1/events\nList recent events with pagination.',
      links: ['https://acme.com/docs/auth', 'https://acme.com/docs/events'],
      metadata: { title: 'API Reference - Acme Docs', statusCode: 200, sourceURL: 'https://acme.com/docs/api-reference' },
    },
  },
  'scrape-003': {
    ...MOCK_SCRAPING_RESULTS[2],
    content: {
      markdown: '# Acme - Product Analytics\n\nUnderstand your users. Ship faster.\n\n---\n\n# About Us\n\nAcme helps B2B SaaS teams understand product usage.\n\n---\n\n# Blog\n\nLatest posts on product-led growth...',
      links: Array.from({ length: 42 }, (_, i) => `https://acme.com/page-${i + 1}`),
      metadata: { title: 'Crawl: 12/12 pages', sourceURL: 'https://acme.com' },
      truncated: true,
    },
  },
  'scrape-005': {
    ...MOCK_SCRAPING_RESULTS[4],
    content: {
      markdown: '{\n  "plans": [\n    { "name": "Free", "price": 0 },\n    { "name": "Growth", "price": 49 },\n    { "name": "Scale", "price": 199 }\n  ]\n}',
      metadata: { sourceURL: 'https://competitor.io/pricing' },
    },
  },
}
