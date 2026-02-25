import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Accounts',
  description:
    'View scored accounts with health, expansion, and churn risk metrics. Track identities across product usage sessions and signal matches.',
  alternates: {
    canonical: 'https://inspector.getbeton.ai/identities',
  },
}

export default function IdentitiesLayout({ children }: { children: React.ReactNode }) {
  return children
}
