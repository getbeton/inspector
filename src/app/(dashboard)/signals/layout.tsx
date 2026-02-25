import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Signals',
  description:
    'Browse 20+ expansion and churn risk signals detected from product usage, billing, and enrichment data. Filter by lift, confidence, and source.',
  alternates: {
    canonical: 'https://inspector.getbeton.ai/signals',
  },
}

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children
}
