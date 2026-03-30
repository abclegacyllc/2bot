import { Box } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo and tagline */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
              <Box className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">2Bot</span>
              <p className="text-xs text-muted-foreground">Workflow Automation &amp; Backend Builder</p>
            </div>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link
              href="/terms"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms#refund-policy"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Refund Policy
            </Link>
            <a
              href="mailto:support@2bot.org"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </a>
          </nav>

          {/* Address */}
          <p className="text-xs text-muted-foreground text-center sm:text-right">
            ABC Legacy LLC &bull; 30 N Gould St Ste R, Sheridan, WY 82801
          </p>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ABC Legacy LLC. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
