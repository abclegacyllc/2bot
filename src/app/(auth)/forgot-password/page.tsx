"use client";

/**
 * Forgot Password Page
 *
 * Request password reset email.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// Validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(data: ForgotPasswordFormData) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error?.message || "Failed to send reset email. Please try again.");
        return;
      }

      // Show success message
      setIsSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // Success state
  if (isSubmitted) {
    return (
      <Card className="border-slate-800 bg-slate-900/50 backdrop-blur">
        <CardHeader className="space-y-1">
          <div className="text-4xl text-center mb-4">📧</div>
          <CardTitle className="text-2xl text-white text-center">Check your email</CardTitle>
          <CardDescription className="text-slate-400 text-center">
            If an account exists with that email, we&apos;ve sent you a password reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400 text-center">
            Didn&apos;t receive the email? Check your spam folder or try again.
          </p>
          <Button
            variant="outline"
            className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => {
              setIsSubmitted(false);
              form.reset();
            }}
          >
            Try another email
          </Button>
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

  return (
    <Card className="border-slate-800 bg-slate-900/50 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-white">Forgot password?</CardTitle>
        <CardDescription className="text-slate-400">
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Global Error */}
            {error ? <div className="p-3 text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md">
                {error}
              </div> : null}

            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send reset link"}
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
