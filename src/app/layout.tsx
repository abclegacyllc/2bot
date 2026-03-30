import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "2Bot - No-Code Workflow Automation & Backend Builder",
  description: "Build powerful workflow automations with AI capabilities. Connect messaging APIs, automate backend processes, and scale your operations — all without writing code.",
  keywords: ["workflow automation", "ai automation", "backend builder", "no-code", "messaging api", "saas platform"],
  authors: [{ name: "ABC Legacy LLC" }],
  metadataBase: new URL("https://www.2bot.org"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "2Bot - No-Code Workflow Automation & Backend Builder",
    description: "Build powerful workflow automations with AI capabilities. Connect messaging APIs, automate backend processes, and scale your operations.",
    url: "https://www.2bot.org",
    siteName: "2Bot",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/landing/og-image.png",
        width: 1200,
        height: 630,
        alt: "2Bot — No-Code Workflow Automation & Backend Builder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "2Bot - No-Code Workflow Automation & Backend Builder",
    description: "Build powerful workflow automations with AI capabilities.",
    images: ["/landing/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "2Bot",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://www.2bot.org",
              description:
                "No-code workflow automation and backend builder for messaging APIs. Build powerful automations with AI capabilities.",
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: "USD",
                lowPrice: "0",
                highPrice: "79",
                offerCount: "4",
              },
              creator: {
                "@type": "Organization",
                name: "ABC Legacy LLC",
                url: "https://www.2bot.org",
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "30 N Gould St Ste R",
                  addressLocality: "Sheridan",
                  addressRegion: "WY",
                  postalCode: "82801",
                  addressCountry: "US",
                },
              },
            }),
          }}
        />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
