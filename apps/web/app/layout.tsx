import '@/styles/globals.css';

import { Navbar } from '@/components/navbar';
import { siteConfig } from '@/config/site';

import { Providers } from './providers';

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    apple: [
      {
        url: '/brand/nutrixx-mark.png',
        sizes: '341x341',
        type: 'image/png',
      },
    ],
    icon: [
      { url: '/brand/nutrixx-mark.svg', type: 'image/svg+xml' },
      {
        url: '/brand/nutrixx-mark.png',
        sizes: '341x341',
        type: 'image/png',
      },
    ],
    shortcut: '/brand/nutrixx-mark.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head />
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers themeProps={{ attribute: 'class', defaultTheme: 'dark' }}>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="container mx-auto max-w-7xl flex-grow px-6">
              {children}
            </main>
            <footer className="w-full border-t border-separator py-5">
              <p className="mx-auto max-w-7xl px-6 text-sm text-muted">
                Nutrixx · Personal nutrition, designed around real life
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
