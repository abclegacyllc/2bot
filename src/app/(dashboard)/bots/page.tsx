"use client";

/**
 * Bots Page — Legacy Redirect
 *
 * Redirects to the new /studio route.
 * Original bot management logic has moved to the 2Bot Studio interface.
 *
 * @module app/(dashboard)/bots
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BotsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/studio");
  }, [router]);

  return null;
}
