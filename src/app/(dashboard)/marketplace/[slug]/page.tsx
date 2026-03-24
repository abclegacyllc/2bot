"use client";

/**
 * Marketplace Item Detail Page
 *
 * Detailed view of a marketplace plugin with:
 * - Full description, tags, config schema
 * - Required gateways and difficulty level
 * - Install count and ratings with review system
 * - Install modal to directly install to a bot
 *
 * @module app/(dashboard)/marketplace/[slug]/page
 */

import { PluginIcon } from "@/components/plugins/plugin-icon";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    Download,
    Loader2,
    MessageSquare,
    Star,
    Tag,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ItemDetail {
  slug: string;
  name: string;
  type: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
  author: string;
  difficulty: string;
  requiredGateways: string[];
  layout: string;
  isBuiltin: boolean;
  bundlePath: string;
  installCount: number;
  avgRating: number;
  reviewCount: number;
}

interface ReviewData {
  id: string;
  rating: number;
  title: string | null;
  content: string | null;
  verifiedInstall: boolean;
  createdAt: string;
  user: { id: string; name: string | null };
}

interface ReviewSummary {
  avgRating: number;
  reviewCount: number;
  distribution: Record<number, number>;
}

interface GatewayOption {
  id: string;
  name: string;
  type: string;
}

export default function MarketplaceItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const slug = params.slug as string;

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reviews state
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [myReview, setMyReview] = useState<ReviewData | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewContent, setReviewContent] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);

  // Install modal state
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [gateways, setGateways] = useState<GatewayOption[]>([]);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const fetchItem = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl(`/marketplace/${slug}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error("Plugin not found");

      const data = await res.json();
      setItem(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token, slug]);

  const fetchReviews = useCallback(async () => {
    try {
      const [reviewsRes, summaryRes] = await Promise.all([
        fetch(apiUrl(`/marketplace/reviews/${slug}`)),
        fetch(apiUrl(`/marketplace/reviews/${slug}/summary`)),
      ]);

      if (reviewsRes.ok) {
        const rd = await reviewsRes.json();
        setReviews(rd.data || []);
      }
      if (summaryRes.ok) {
        const sd = await summaryRes.json();
        setReviewSummary(sd.data);
      }
    } catch {
      // Reviews are non-critical
    }
  }, [slug]);

  const fetchMyReview = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/marketplace/reviews/${slug}/mine`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setMyReview(data.data);
        }
      }
    } catch {
      // Non-critical
    }
  }, [token, slug]);

  const fetchGateways = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/gateways"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGateways(data.data || []);
      }
    } catch {
      // Non-critical
    }
  }, [token]);

  useEffect(() => {
    fetchItem();
    fetchReviews();
    fetchMyReview();
  }, [fetchItem, fetchReviews, fetchMyReview]);

  const handleSubmitReview = async () => {
    if (!token || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(apiUrl(`/marketplace/reviews/${slug}`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: reviewRating,
          content: reviewContent || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit review");
      }
      const data = await res.json();
      setMyReview(data.data);
      setShowReviewForm(false);
      setReviewRating(0);
      setReviewContent("");
      fetchReviews();
      fetchItem(); // Refresh rating
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!token || !myReview) return;
    setDeletingReview(true);
    try {
      await fetch(apiUrl(`/marketplace/reviews/${myReview.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setMyReview(null);
      fetchReviews();
      fetchItem();
    } catch {
      // ignore
    } finally {
      setDeletingReview(false);
    }
  };

  const handleInstall = async () => {
    if (!token || !selectedGateway) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await fetch(apiUrl("/plugins/install"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug: item?.slug,
          gatewayId: selectedGateway,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || err.error || "Installation failed");
      }
      setInstallSuccess(true);
      fetchItem(); // Refresh install count
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Installation failed");
    } finally {
      setInstalling(false);
    }
  };

  const openInstallModal = () => {
    fetchGateways();
    setShowInstallModal(true);
    setInstallSuccess(false);
    setInstallError(null);
    setSelectedGateway("");
  };

  const difficultyColor = (d: string) => {
    switch (d) {
      case "beginner":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "intermediate":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "advanced":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "";
    }
  };

  const renderStars = (rating: number, interactive = false, onSelect?: (r: number) => void) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/30"
            } ${interactive ? "cursor-pointer hover:text-yellow-400" : ""}`}
            onClick={interactive && onSelect ? () => onSelect(star) : undefined}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <p>{error || "Plugin not found"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter gateways compatible with this plugin
  const compatibleGateways = item.requiredGateways.length > 0
    ? gateways.filter((g) => item.requiredGateways.includes(g.type))
    : gateways;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/marketplace"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Marketplace
      </Link>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <PluginIcon icon={item.icon} name={item.name} size="lg" />
            <div className="flex-1 min-w-0 w-full">
              <CardTitle className="text-xl sm:text-2xl">{item.name}</CardTitle>
              {item.avgRating > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {renderStars(Math.round(item.avgRating))}
                  <span className="text-sm text-muted-foreground ml-1">
                    {item.avgRating.toFixed(1)} ({item.reviewCount})
                  </span>
                </div>
              )}
              <CardDescription className="mt-1">
                by {item.author} &middot; v{item.version}
              </CardDescription>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge variant="outline">{item.category}</Badge>
                <Badge className={difficultyColor(item.difficulty)}>
                  {item.difficulty}
                </Badge>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {item.installCount} installs
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{item.description}</p>

          <div className="mt-6 flex gap-3">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-foreground"
              onClick={openInstallModal}
            >
              Install Plugin
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Install Modal */}
      {showInstallModal && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Install {item.name}</CardTitle>
            <CardDescription>Select a bot to install this plugin on</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {installSuccess ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 shrink-0" />
                  <span>Plugin installed successfully!</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="sm:ml-auto"
                  onClick={() => router.push("/bots")}
                >
                  Go to My Bots
                </Button>
              </div>
            ) : (
              <>
                {compatibleGateways.length > 0 ? (
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Select a bot:</label>
                    <div className="grid gap-2">
                      {compatibleGateways.map((gw) => (
                        <button
                          key={gw.id}
                          type="button"
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                            selectedGateway === gw.id
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                              : "border-border hover:bg-muted/50"
                          }`}
                          onClick={() => setSelectedGateway(gw.id)}
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{gw.name}</p>
                            <p className="text-xs text-muted-foreground">{gw.type}</p>
                          </div>
                          {selectedGateway === gw.id && (
                            <Check className="h-4 w-4 text-emerald-600" />
                          )}
                        </button>
                      ))}
                    </div>
                    {installError && (
                      <p className="text-sm text-red-500">{installError}</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleInstall}
                        disabled={!selectedGateway || installing}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {installing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Installing...
                          </>
                        ) : (
                          "Install"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowInstallModal(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {gateways.length === 0 ? (
                      <p>
                        You don&apos;t have any bots yet.{" "}
                        <Link href="/bots" className="text-emerald-600 underline">
                          Create a bot first
                        </Link>
                        .
                      </p>
                    ) : (
                      <p>
                        No compatible bots found. This plugin requires:{" "}
                        {item.requiredGateways.join(", ")}.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Details Grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {/* Required Gateways */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Required Gateways</CardTitle>
          </CardHeader>
          <CardContent>
            {item.requiredGateways.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.requiredGateways.map((gw) => (
                  <Badge key={gw} variant="secondary">
                    {gw}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No specific gateway required</p>
            )}
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            {item.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tags</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reviews Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Reviews
              {reviewSummary && reviewSummary.reviewCount > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({reviewSummary.reviewCount})
                </span>
              )}
            </CardTitle>
            {token && !myReview && !showReviewForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReviewForm(true)}
              >
                Write a Review
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Rating Summary */}
          {reviewSummary && reviewSummary.reviewCount > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 pb-4 border-b">
              <div className="text-center">
                <p className="text-3xl font-bold">{reviewSummary.avgRating.toFixed(1)}</p>
                {renderStars(Math.round(reviewSummary.avgRating))}
                <p className="text-xs text-muted-foreground mt-1">
                  {reviewSummary.reviewCount} review{reviewSummary.reviewCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = reviewSummary.distribution[star] || 0;
                  const pct = reviewSummary.reviewCount > 0
                    ? (count / reviewSummary.reviewCount) * 100
                    : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-3 text-right">{star}</span>
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-xs text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* My Review / Review Form */}
          {myReview && !showReviewForm && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Your Review</span>
                  {renderStars(myReview.rating)}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowReviewForm(true);
                      setReviewRating(myReview.rating);
                      setReviewContent(myReview.content || "");
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteReview}
                    disabled={deletingReview}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {myReview.content && (
                <p className="text-sm text-muted-foreground">{myReview.content}</p>
              )}
            </div>
          )}

          {showReviewForm && (
            <div className="p-4 rounded-lg border space-y-4">
              <div>
                <label className="text-sm font-medium">Rating</label>
                <div className="mt-1">
                  {renderStars(reviewRating, true, setReviewRating)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Review (optional)</label>
                <Textarea
                  className="mt-1"
                  placeholder="Share your experience with this plugin..."
                  value={reviewContent}
                  onChange={(e) => setReviewContent(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmitReview}
                  disabled={reviewRating === 0 || submittingReview}
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Submitting...
                    </>
                  ) : myReview ? (
                    "Update Review"
                  ) : (
                    "Submit Review"
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowReviewForm(false);
                    setReviewRating(0);
                    setReviewContent("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Review List */}
          {reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="pb-4 border-b last:border-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {review.user.name || "Anonymous"}
                    </span>
                    {renderStars(review.rating)}
                    {review.verifiedInstall && (
                      <Badge variant="outline" className="text-xs text-emerald-600">
                        <Check className="h-3 w-3 mr-0.5" />
                        Verified
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground sm:ml-auto">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {review.content && (
                    <p className="text-sm text-muted-foreground">{review.content}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !showReviewForm && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No reviews yet. Be the first to review this plugin!
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
