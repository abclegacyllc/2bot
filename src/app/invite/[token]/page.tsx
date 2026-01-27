"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiUrl } from "@/shared/config/urls";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Building2, CheckCircle2, Clock, XCircle } from "lucide-react";

interface InviteDetails {
  id: string;
  email: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  inviterEmail: string | null;
  expiresAt: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(apiUrl(`/invites/${token}`));
        const data = await res.json();

        if (!res.ok) {
          // Handle error object with code/message or plain string
          const errorMsg = typeof data.error === 'object' 
            ? data.error.message || "Invitation not found or has expired"
            : data.error || "Invitation not found or has expired";
          setError(errorMsg);
          return;
        }

        setInvite(data.data);
      } catch {
        setError("Failed to load invitation");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchInvite();
    }
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      // Get auth token from localStorage if user is logged in
      const authToken = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
      
      const res = await fetch(apiUrl(`/invites/${token}/accept`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken && { "Authorization": `Bearer ${authToken}` }),
        },
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          // Not logged in - redirect to register with invite token and email
          router.push(`/register?invite=${token}&email=${encodeURIComponent(invite?.email || '')}`);
          return;
        }
        if (res.status === 403) {
          setError("This invitation is for a different email address. Please register with the correct email.");
          return;
        }
        const errorMsg = typeof data.error === 'object' 
          ? data.error.message || "Failed to accept invitation"
          : data.error || "Failed to accept invitation";
        setError(errorMsg);
        return;
      }

      setAccepted(true);
      // Redirect to dashboard after short delay
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch {
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!confirm("Are you sure you want to decline this invitation? This action cannot be undone.")) {
      return;
    }

    setDeclining(true);
    try {
      const res = await fetch(apiUrl(`/invites/${token}/decline`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite?.email }),
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMsg = typeof data.error === 'object' 
          ? data.error.message || "Failed to decline invitation"
          : data.error || "Failed to decline invitation";
        setError(errorMsg);
        return;
      }

      setDeclined(true);
    } catch {
      setError("Failed to decline invitation");
    } finally {
      setDeclining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
            <p className="text-center text-muted-foreground mt-4">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invitation Not Found</CardTitle>
            <CardDescription>
              {error || "This invitation link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/">Go to Homepage</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Welcome to {invite.organizationName}!</CardTitle>
            <CardDescription>
              You&apos;ve successfully joined the organization. Redirecting to dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
              <XCircle className="h-6 w-6 text-orange-600" />
            </div>
            <CardTitle>Invitation Declined</CardTitle>
            <CardDescription>
              You&apos;ve declined the invitation to join {invite.organizationName}.
              The organization has been notified.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/">Go to Homepage</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const roleDisplay = invite.role.replace("ORG_", "").toLowerCase();
  const expiresAt = new Date(invite.expiresAt);
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You&apos;re Invited!</CardTitle>
          <CardDescription>
            {invite.inviterEmail ? (
              <>
                <strong>{invite.inviterEmail}</strong> has invited you to join
              </>
            ) : (
              "You've been invited to join"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 text-center">
            <h3 className="text-xl font-semibold">{invite.organizationName}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              as a <span className="font-medium capitalize">{roleDisplay}</span>
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {daysLeft > 0
                ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                : "Expires today"}
            </span>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Your email: <strong>{invite.email}</strong>
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDecline}
              disabled={declining || accepting}
            >
              {declining ? "Declining..." : "Decline"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleAccept}
              disabled={accepting || declining}
            >
              {accepting ? "Accepting..." : "Accept"}
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={`/register?invite=${token}&email=${encodeURIComponent(invite.email)}`}
              className="text-primary hover:underline"
            >
              Create one to join
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
