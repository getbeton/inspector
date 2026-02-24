/**
 * Quick Firecrawl integration test using v@getbeton.ai's stored credentials
 * on the staging Supabase branch.
 *
 * Usage:  source .env.local && npx tsx scripts/test-firecrawl.ts
 */

import { decrypt } from '../src/lib/crypto/encryption'
import { createFirecrawlClient } from '../src/lib/integrations/firecrawl/client'

// Encrypted API key from staging DB (workspace af1a3786-762a-4362-95cb-ad2aedb2b4a4)
const ENCRYPTED_KEY =
  '583c0bd28c5365446b9acf229da68d55:d27e4878d04aa2579d855e63:d7e0541a0972db9117b7c0b8af7e2c91:2d8be217858ff8a486b04242fc320cf2aa64b98c9b04b7c74600164a3585e5e21b43e9'

async function main() {
  // 1. Decrypt
  console.log('1) Decrypting Firecrawl API key ...')
  const apiKey = await decrypt(ENCRYPTED_KEY)
  console.log(`   Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`)

  // 2. Create client (cloud mode, no proxy — matches stored config)
  console.log('\n2) Creating FirecrawlClient (cloud mode) ...')
  const client = createFirecrawlClient({ apiKey, mode: 'cloud' })

  // 3. Test connection via GET /v1/crawl (no credits consumed)
  console.log('\n3) Testing connection (GET /v1/crawl) ...')
  const connTest = await client.testConnection()
  console.log('   Result:', connTest)

  // 3b. Also probe the API with a raw fetch to see what we get
  if (!connTest.success) {
    console.log('\n3b) Raw probing Firecrawl API ...')

    const probes = [
      { label: 'GET /v1/crawl', url: 'https://api.firecrawl.dev/v1/crawl', method: 'GET' as const },
      { label: 'GET /v1', url: 'https://api.firecrawl.dev/v1', method: 'GET' as const },
    ]

    for (const p of probes) {
      try {
        const r = await fetch(p.url, {
          method: p.method,
          headers: { 'Authorization': `Bearer ${apiKey}` },
        })
        const body = await r.text()
        console.log(`   ${p.label}: ${r.status} ${r.statusText}`)
        console.log(`     Body: ${body.slice(0, 200)}`)
      } catch (e) {
        console.log(`   ${p.label}: FAILED`, e)
      }
    }
  }

  // 4. Scrape a lightweight page (costs 1 credit)
  const target = 'https://example.com'
  console.log(`\n4) Scraping ${target} ...`)
  try {
    const scrapeResult = await client.scrape(target)
    console.log('   Success:', scrapeResult.success)
    console.log('   Metadata:', scrapeResult.data.metadata)
    console.log('   Markdown (first 300 chars):\n')
    console.log((scrapeResult.data.markdown ?? '').slice(0, 300))
  } catch (err) {
    console.error('   Scrape failed:', err instanceof Error ? err.message : err)
  }

  console.log('\n--- Done ---')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
