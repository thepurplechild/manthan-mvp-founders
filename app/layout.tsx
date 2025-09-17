import './globals.css'
import Navigation from '@/components/Navigation'
import AsyncErrorBoundary from '@/components/async-error-boundary'
import PWA from '@/components/PWA'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://manthan.app'),
  title: {
    default: 'Manthan - Transform Your Stories Into Success',
    template: '%s | Manthan'
  },
  description: 'The AI-powered platform that turns your scripts into professional pitch decks and connects you with the right buyers in the Indian entertainment industry.',
  openGraph: {
    title: 'Manthan - Transform Your Stories Into Success',
    description: 'The AI-powered platform that turns your scripts into professional pitch decks and connects you with the right buyers in the Indian entertainment industry.',
    url: '/',
    siteName: 'Manthan',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Manthan - Transform Your Stories Into Success',
    description: 'The AI-powered platform that turns your scripts into professional pitch decks and connects you with the right buyers in the Indian entertainment industry.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF6B35" />
      </head>
      <body className="bg-manthan-ivory-50 text-manthan-charcoal-800 font-sans">
        <AsyncErrorBoundary>
          <PWA />
          <Navigation />
          {children}
        </AsyncErrorBoundary>
      </body>
    </html>
  )
}
