"use client";

/**
 * Bot Studio → Studio redirect
 *
 * Legacy route that redirects to the new /studio page.
 *
 * @module app/(dashboard)/bot-studio
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BotStudioRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/studio");
  }, [router]);

  return null;
}

