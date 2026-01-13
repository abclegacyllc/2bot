/**
 * Auth Layout
 *
 * Layout for authentication pages (login, register, forgot-password, reset-password)
 * Centered card with branding
 */

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Logo/Brand */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">🤖 2Bot</h1>
        <p className="text-slate-400">Telegram Automation Platform</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md">{children}</div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} 2Bot. All rights reserved.</p>
      </div>
    </div>
  );
}
