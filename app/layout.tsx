import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Wayland’s Travel Calendar',
  description: 'A clear, shareable view of Wayland’s upcoming travels.',
  applicationName: 'Wayland’s Travel Calendar',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
  openGraph: {
    type: 'website',
    title: 'Wayland’s Travel Calendar',
    description: 'Trips, beautifully in view.',
    siteName: 'Wayland’s Travel Calendar',
    images: [
      {
        url: siteUrl + '/og.png',
        width: 1200,
        height: 630,
        alt: 'Wayland’s Travel Calendar',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wayland’s Travel Calendar',
    description: 'Trips, beautifully in view.',
    images: [siteUrl + '/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#2c2c2e' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
