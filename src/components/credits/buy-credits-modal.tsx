"use client";

/**
 * Buy Credits Modal
 *
 * Modal dialog for purchasing credits.
 * Shows available packages and handles Stripe checkout.
 *
 * @module components/credits/buy-credits-modal
 */

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import {
    CreditPackage,
    CreditsPurchasePackages,
} from "./credits-purchase-packages";

export interface BuyCreditsModalProps {
  packages: CreditPackage[];
  loading?: boolean;
  variant?: "personal" | "organization";
  organizationId?: string;
  onPurchaseComplete?: () => void;
  trigger?: React.ReactNode;
}

export function BuyCreditsModal({
  packages,
  loading = false,
  variant = "personal",
  organizationId,
  onPurchaseComplete,
  trigger,
}: BuyCreditsModalProps) {
  const [open, setOpen] = useState(false);
  const [purchasing, setPurchasing] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async (packageId: string) => {
    setError(null);
    setPurchasing(packageId);

    try {
      // Determine the API endpoint based on variant
      const endpoint =
        variant === "organization" && organizationId
          ? `/api/orgs/${organizationId}/credits/purchase`
          : "/api/credits/purchase";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ package: packageId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to create checkout session");
      }

      const data = await response.json();

      // Redirect to Stripe checkout
      if (data.data?.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error("Purchase error:", err);
      setError(err instanceof Error ? err.message : "Failed to process purchase");
      setPurchasing(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>Buy Credits</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {variant === "organization"
              ? "Buy Organization Credits"
              : "Buy Credits"}
          </DialogTitle>
          <DialogDescription>
            Credits are the universal currency of 2Bot. Use them for AI, marketplace
            purchases, and premium features.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <CreditsPurchasePackages
          packages={packages}
          loading={loading}
          purchasing={purchasing}
          onPurchase={handlePurchase}
          variant={variant}
        />
      </DialogContent>
    </Dialog>
  );
}
