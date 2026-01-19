"use client";

/**
 * Reset Password Page
 *
 * Reset password with token from email link.
 * URL: /reset-password?token=xxx
 */

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// Validation schema
const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// Loading fallback component
function LoadingCard() {
  return (
    <Card className="border-border bg-card/50 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-foreground">Loading...</CardTitle>
        <CardDescription className="text-muted-foreground">
          Please wait while we verify your reset link
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

// Main form component that uses useSearchParams
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Check for token on mount
  useEffect(() => {
    if (!token) {
      setError("Invalid or missing reset token. Please request a new password reset link.");
    }
  }, [token]);

  async function onSubmit(data: ResetPasswordFormData) {
    if (!token) {
      setError("Invalid or missing reset token.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error?.code === "INVALID_TOKEN") {
          setError("This reset link has expired or is invalid. Please request a new one.");
        } else {
          setError(result.error?.message || "Failed to reset password. Please try again.");
        }
        return;
      }

      // Show success message
      setIsSuccess(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // Success state
  if (isSuccess) {
    return (
      <Card className="border-border bg-card/50 backdrop-blur">
        <CardHeader className="space-y-1">
          <div className="text-4xl text-center mb-4">✅</div>
          <CardTitle className="text-2xl text-foreground text-center">Password reset!</CardTitle>
          <CardDescription className="text-muted-foreground text-center">
            Your password has been successfully reset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button className="w-full bg-purple-600 hover:bg-purple-700">
              Sign in with new password
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Invalid token state (no token in URL)
  if (!token && error) {
    return (
      <Card className="border-border bg-card/50 backdrop-blur">
        <CardHeader className="space-y-1">
          <div className="text-4xl text-center mb-4">⚠️</div>
          <CardTitle className="text-2xl text-foreground text-center">Invalid link</CardTitle>
          <CardDescription className="text-muted-foreground text-center">
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/forgot-password">
            <Button className="w-full bg-purple-600 hover:bg-purple-700">
              Request new reset link
            </Button>
          </Link>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Link
            href="/login"
            className="text-sm text-purple-400 hover:text-purple-300 underline"
          >
            Back to login
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card/50 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-foreground">Reset your password</CardTitle>
        <CardDescription className="text-muted-foreground">
          Enter your new password below
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Global Error */}
            {error ? <div className="p-3 text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md">
                {error}
              </div> : null}

            {/* Password Field */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">New Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            {/* Confirm Password Field */}
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            {/* Password Requirements */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Password must:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Be at least 8 characters long</li>
                <li>Contain at least one uppercase letter</li>
                <li>Contain at least one lowercase letter</li>
                <li>Contain at least one number</li>
              </ul>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={isLoading}
            >
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Link
          href="/login"
          className="text-sm text-purple-400 hover:text-purple-300 underline"
        >
          Back to login
        </Link>
      </CardFooter>
    </Card>
  );
}

// Main page component with Suspense boundary
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
