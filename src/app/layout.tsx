import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { GoogleTagManager } from '@next/third-parties/google'
import { SessionProvider } from '@/components/auth/session-provider'
import { PostHogIdentifyProvider } from '@/components/analytics'
import { Providers } from './providers'
import './globals.css'

const gtmId = process.env.NEXT_PUBLIC_GTM_ID

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  metadataBase: new URL('https://inspector.getbeton.ai'),
  title: {
    default: 'Beton Inspector — PQL Signal Detection for B2B SaaS',
    template: '%s | Beton Inspector',
  },
  description:
    'Detect product-qualified leads by combining product usage, revenue, and firmographic data into actionable expansion and churn signals for RevOps teams.',
  openGraph: {
    title: 'Beton Inspector — PQL Signal Detection for B2B SaaS',
    description:
      'Detect product-qualified leads by combining product usage, revenue, and firmographic data into actionable expansion and churn signals for RevOps teams.',
    url: 'https://inspector.getbeton.ai',
    siteName: 'Beton',
    type: 'website',
    images: [
      {
        url: 'https://getbeton.ai/images/beton-og-image.png',
        width: 1200,
        height: 630,
        alt: 'Beton Inspector — PQL Signal Detection',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Beton Inspector — PQL Signal Detection for B2B SaaS',
    description:
      'Detect product-qualified leads by combining product usage, revenue, and firmographic data into actionable expansion and churn signals.',
    images: ['https://getbeton.ai/images/beton-og-image.png'],
  },
  alternates: {
    canonical: 'https://inspector.getbeton.ai',
  },
}

// Structured data graph — mirrors getbeton.ai schema, adapted for inspector subdomain.
// Static, trusted content only (no user input — safe for dangerouslySetInnerHTML).
const JSON_LD_SCRIPT = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.getbeton.ai/#organization',
      name: 'Beton',
      url: 'https://www.getbeton.ai',
      logo: 'https://www.getbeton.ai/images/beton-logo.svg',
      image: 'https://www.getbeton.ai/images/beton-logo.png',
      description:
        'Predict which customers will convert to enterprise deals. Detect behavioral signals in product usage and route them to your CRM.',
      sameAs: [
        'https://github.com/getbeton/inspector',
        'https://linkedin.com/company/getbeton',
        'https://x.com/getbeton',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        url: 'https://www.getbeton.ai/pricing/',
        contactType: 'sales',
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://inspector.getbeton.ai/#website',
      name: 'Beton Inspector',
      url: 'https://inspector.getbeton.ai',
      description:
        'Detect product-qualified leads by combining product usage, revenue, and firmographic data into actionable expansion and churn signals.',
      publisher: { '@id': 'https://www.getbeton.ai/#organization' },
    },
    {
      '@type': 'ImageObject',
      '@id': 'https://inspector.getbeton.ai/#primaryimage',
      url: 'https://www.getbeton.ai/og-default.png',
      contentUrl: 'https://www.getbeton.ai/og-default.png',
      width: 1200,
      height: 630,
    },
    {
      '@type': 'WebPage',
      '@id': 'https://inspector.getbeton.ai/#webpage',
      name: 'Beton Inspector — PQL Signal Detection for B2B SaaS',
      description:
        'Detect product-qualified leads by combining product usage, revenue, and firmographic data into actionable expansion and churn signals.',
      url: 'https://inspector.getbeton.ai/',
      isPartOf: { '@id': 'https://inspector.getbeton.ai/#website' },
      publisher: { '@id': 'https://www.getbeton.ai/#organization' },
      primaryImageOfPage: { '@id': 'https://inspector.getbeton.ai/#primaryimage' },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://inspector.getbeton.ai/#software',
      name: 'Beton Inspector',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Revenue Intelligence',
      operatingSystem: 'Web',
      description:
        'Detect product-qualified leads by combining product usage, revenue, and firmographic data into actionable expansion and churn signals.',
      url: 'https://inspector.getbeton.ai',
      publisher: { '@id': 'https://www.getbeton.ai/#organization' },
      offers: [
        {
          '@type': 'Offer',
          name: 'Self-Hosted',
          price: '0',
          priceCurrency: 'USD',
          url: 'https://www.getbeton.ai/pricing/',
          availability: 'https://schema.org/InStock',
          description: 'Free self-hosted deployment with your own LLM key. GPL licensed.',
        },
        {
          '@type': 'Offer',
          name: 'Cloud',
          price: '0.50',
          priceCurrency: 'USD',
          url: 'https://www.getbeton.ai/pricing/',
          availability: 'https://schema.org/InStock',
          description: 'Per tracked user per month. Managed hosting, daily sync.',
        },
      ],
      featureList: [
        'Behavioral signal detection',
        'CRM integration (Attio, HubSpot, Zoho, Pipedrive)',
        'PostHog analytics integration',
        'Churn prediction',
        'Expansion revenue detection',
        'PLG conversion tracking',
      ],
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5',
        bestRating: '5',
        ratingCount: '3',
      },
      review: [
        {
          '@type': 'Review',
          author: { '@type': 'Person', name: 'Vladimir G', jobTitle: 'Founder' },
          reviewBody:
            'The CRM integration is what sold us. Beton detects a churn signal and within seconds it updates the deal stage in Pipedrive and pings the CSM on Slack. We went from reactive firefighting to catching at-risk accounts weeks earlier.',
          reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
          publisher: { '@type': 'Organization', name: 'ImmCore.AI' },
        },
        {
          '@type': 'Review',
          author: { '@type': 'Person', name: 'Mike A', jobTitle: 'Founder' },
          reviewBody:
            'Beton caught expansion signals we were completely missing. One account had quietly tripled their API usage over two weeks — Beton flagged it, created the deal in HubSpot, and our AE closed an upgrade before the customer even asked.',
          reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
          publisher: { '@type': 'Organization', name: 'Botimize' },
        },
        {
          '@type': 'Review',
          author: { '@type': 'Person', name: 'Ivan K', jobTitle: 'Founder' },
          reviewBody:
            'We used to spend hours every Monday pulling PostHog data into spreadsheets to find warm accounts. Beton replaced that entire workflow — signals show up in our CRM automatically, and the team actually trusts the data now.',
          reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
          publisher: { '@type': 'Organization', name: 'Manuscript' },
        },
      ],
    },
  ],
})

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      {gtmId && <GoogleTagManager gtmId={gtmId} />}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* JSON-LD structured data — hardcoded string, no user input (safe from XSS) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON_LD_SCRIPT }}
        />
        <Providers>
          <SessionProvider>
            <PostHogIdentifyProvider>{children}</PostHogIdentifyProvider>
          </SessionProvider>
        </Providers>
      </body>
    </html>
  )
}
