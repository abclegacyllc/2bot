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
  title: "2Bot - AI-Powered Telegram Automation Platform",
  description: "Build powerful Telegram bots with AI capabilities. Connect plugins, automate workflows, and scale your communication — all without writing code.",
  keywords: ["telegram bot", "ai automation", "chatbot", "telegram automation", "bot builder", "no-code"],
  authors: [{ name: "2Bot" }],
  openGraph: {
    title: "2Bot - AI-Powered Telegram Automation",
    description: "Build powerful Telegram bots with AI capabilities. Connect plugins, automate workflows, and scale your communication.",
    url: "https://www.2bot.org",
    siteName: "2Bot",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "2Bot - AI-Powered Telegram Automation",
    description: "Build powerful Telegram bots with AI capabilities.",
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
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
