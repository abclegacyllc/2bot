"use client";

/**
 * Bot Studio → Bots redirect
 *
 * Legacy route that redirects to the new /bots page.
 *
 * @module app/(dashboard)/bot-studio
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BotStudioRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/bots");
  }, [router]);

  return null;
}

