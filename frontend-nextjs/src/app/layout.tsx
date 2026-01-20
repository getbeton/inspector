import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { GoogleTagManager } from '@next/third-parties/google'
import { SessionProvider } from '@/components/auth/session-provider'
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
  title: 'Beton Inspector',
  description: 'Signal Discovery & Validation Engine for B2B SaaS'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      {gtmId && <GoogleTagManager gtmId={gtmId} />}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <SessionProvider>{children}</SessionProvider>
        </Providers>
      </body>
    </html>
  )
}
