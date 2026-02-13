"use client";

/**
 * Admin Support Dashboard
 * 
 * Manage support tickets — view, assign, reply, resolve.
 * 
 * @module app/(admin)/admin/support/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ArrowLeft,
    Bot,
    CheckCircle,
    DollarSign,
    Headphones,
    Loader2,
    Lock,
    MessageSquare,
    Search,
    Send,
    TrendingDown,
    TrendingUp,
    Zap
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SupportStats {
  open: number;
  in_progress: number;
  waiting_user: number;
  resolved: number;
  closed: number;
}

interface AICostSummary {
  currentPeriod: string;
  current: PeriodCost;
  previous: PeriodCost;
  allTime: PeriodCost;
  dailyBreakdown: { date: string; requests: number; apiCostUsd: number; inputTokens: number; outputTokens: number }[];
  modelBreakdown: { model: string; provider: string; requests: number; apiCostUsd: number; inputTokens: number; outputTokens: number }[];
}

interface PeriodCost {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalApiCostUsd: number;
  totalCreditsCharged: number;
  avgCostPerRequest: number;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  type: string;
  category: string;
  severity: string;
  status: string;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  user: { id: string; email: string; name: string | null; plan: string };
  assignedTo: { id: string; name: string | null; email: string } | null;
  messages?: TicketMsg[];
  relatedArticle?: { id: string; title: string; slug: string } | null;
}

interface TicketMsg {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  sender: { id: string; name: string | null; email: string; role: string };
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-500",
  in_progress: "bg-yellow-500/10 text-yellow-500",
  waiting_user: "bg-orange-500/10 text-orange-500",
  resolved: "bg-green-500/10 text-green-500",
  closed: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_user: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-yellow-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

export default function AdminSupportPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCosts, setAiCosts] = useState<AICostSummary | null>(null);
  const [showCostDetails, setShowCostDetails] = useState(false);

  // Fetch stats + tickets + AI costs
  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statsRes, ticketsRes, costsRes] = await Promise.all([
        fetch(apiUrl("/support/admin/stats"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/support/admin/tickets?${new URLSearchParams({
          ...(search && { search }),
          ...(statusFilter !== "all" && { status: statusFilter }),
        })}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl("/support/admin/ai-costs"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data.tickets);
      }
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        setTickets(ticketsData.data.tickets || []);
      }
      if (costsRes.ok) {
        const costsData = await costsRes.json();
        setAiCosts(costsData.data);
      }
    } catch {
      setError("Failed to load support data");
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load ticket detail
  const loadTicket = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/support/admin/tickets/${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data.data);
      }
    } catch {
      setError("Failed to load ticket");
    }
  };

  // Send reply
  const sendReply = async () => {
    if (!selectedTicket || !replyContent.trim() || !token) return;
    setSendingReply(true);
    try {
      await fetch(apiUrl(`/support/admin/tickets/${selectedTicket.id}/reply`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      setReplyContent("");
      loadTicket(selectedTicket.id);
    } catch {
      setError("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  // Send internal note
  const sendInternalNote = async () => {
    if (!selectedTicket || !internalNote.trim() || !token) return;
    setSendingNote(true);
    try {
      await fetch(apiUrl(`/support/admin/tickets/${selectedTicket.id}/internal`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: internalNote.trim() }),
      });
      setInternalNote("");
      loadTicket(selectedTicket.id);
    } catch {
      setError("Failed to add note");
    } finally {
      setSendingNote(false);
    }
  };

  // Update status
  const updateStatus = async (status: string) => {
    if (!selectedTicket || !token) return;
    try {
      await fetch(apiUrl(`/support/admin/tickets/${selectedTicket.id}/status`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      loadTicket(selectedTicket.id);
      fetchData();
    } catch {
      setError("Failed to update status");
    }
  };

  // Resolve ticket
  const resolveTicket = async () => {
    if (!selectedTicket || !token) return;
    try {
      await fetch(apiUrl(`/support/admin/tickets/${selectedTicket.id}/resolve`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resolution: "Resolved by support team." }),
      });
      loadTicket(selectedTicket.id);
      fetchData();
    } catch {
      setError("Failed to resolve ticket");
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="bg-card border-red-800 p-6">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-6 w-6" />
            <span>{error}</span>
          </div>
        </Card>
      </div>
    );
  }

  // Ticket detail view
  if (selectedTicket) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedTicket(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {selectedTicket.ticketNumber}
            </h1>
            <p className="text-sm text-muted-foreground">{selectedTicket.title}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge className={STATUS_COLORS[selectedTicket.status]}>
              {STATUS_LABELS[selectedTicket.status]}
            </Badge>
            <Badge variant="outline" className={SEVERITY_COLORS[selectedTicket.severity]}>
              {selectedTicket.severity}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Original ticket */}
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {selectedTicket.user.name || selectedTicket.user.email}
                    </span>
                    {" · "}
                    {new Date(selectedTicket.createdAt).toLocaleString()}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {selectedTicket.user.plan}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>
              </CardContent>
            </Card>

            {/* Messages */}
            {selectedTicket.messages && selectedTicket.messages.length > 0 ? <div className="space-y-3">
                {selectedTicket.messages.map((msg) => (
                  <Card
                    key={msg.id}
                    className={`bg-card ${msg.isInternal ? "border-yellow-500/30" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {msg.isInternal ? <Lock className="h-3 w-3 text-yellow-500" /> : null}
                        <span className="text-xs font-medium text-foreground">
                          {msg.sender.name || msg.sender.email}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {msg.sender.role}
                        </Badge>
                        {msg.isInternal ? <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-yellow-500/10 text-yellow-500">
                            Internal
                          </Badge> : null}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div> : null}

            {/* Reply box */}
            <Card className="bg-card">
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Reply to User
                  </label>
                  <div className="flex gap-2">
                    <Textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Type a reply (visible to user)..."
                      className="text-sm min-h-[60px]"
                      rows={2}
                    />
                    <Button
                      size="icon"
                      className="shrink-0"
                      onClick={sendReply}
                      disabled={!replyContent.trim() || sendingReply}
                    >
                      {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                    <Lock className="h-3 w-3 text-yellow-500" /> Internal Note
                  </label>
                  <div className="flex gap-2">
                    <Textarea
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="Add internal note (hidden from user)..."
                      className="text-sm min-h-[60px] border-yellow-500/30"
                      rows={2}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0 border-yellow-500/30"
                      onClick={sendInternalNote}
                      disabled={!internalNote.trim() || sendingNote}
                    >
                      {sendingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4 text-yellow-500" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Actions */}
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select
                  value={selectedTicket.status}
                  onValueChange={(value) => updateStatus(value)}
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting_user">Waiting on User</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                {!["resolved", "closed"].includes(selectedTicket.status) && (
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    variant="outline"
                    onClick={resolveTicket}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Mark Resolved
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Ticket Info */}
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="text-foreground">{selectedTicket.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span className="text-foreground">{selectedTicket.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Severity</span>
                  <span className={SEVERITY_COLORS[selectedTicket.severity]}>{selectedTicket.severity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User Plan</span>
                  <Badge variant="secondary" className="text-[10px]">{selectedTicket.user.plan}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">{new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                </div>
                {selectedTicket.firstResponseAt ? <div className="flex justify-between">
                    <span className="text-muted-foreground">First Response</span>
                    <span className="text-foreground">{new Date(selectedTicket.firstResponseAt).toLocaleDateString()}</span>
                  </div> : null}
                {selectedTicket.assignedTo ? <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned to</span>
                    <span className="text-foreground">{selectedTicket.assignedTo.name}</span>
                  </div> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Tickets list view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
        <p className="text-muted-foreground">Manage customer support tickets</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))
        ) : stats ? (
          <>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-500">{stats.open}</div>
                <div className="text-xs text-muted-foreground">Open</div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-yellow-500">{stats.in_progress}</div>
                <div className="text-xs text-muted-foreground">In Progress</div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-orange-500">{stats.waiting_user}</div>
                <div className="text-xs text-muted-foreground">Waiting</div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-500">{stats.resolved}</div>
                <div className="text-xs text-muted-foreground">Resolved</div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-muted-foreground">{stats.closed}</div>
                <div className="text-xs text-muted-foreground">Closed</div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* AI Support Cost Tracking */}
      {aiCosts ? <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-sm font-semibold">AI Support Cost</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {aiCosts.currentPeriod}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowCostDetails(!showCostDetails)}
              >
                {showCostDetails ? "Hide Details" : "Show Details"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">This Month</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  ${aiCosts.current.totalApiCostUsd.toFixed(4)}
                </div>
                {aiCosts.previous.totalApiCostUsd > 0 && (
                  <div className={`text-[10px] flex items-center gap-0.5 mt-0.5 ${
                    aiCosts.current.totalApiCostUsd > aiCosts.previous.totalApiCostUsd 
                      ? "text-red-400" : "text-green-400"
                  }`}>
                    {aiCosts.current.totalApiCostUsd > aiCosts.previous.totalApiCostUsd 
                      ? <TrendingUp className="h-3 w-3" /> 
                      : <TrendingDown className="h-3 w-3" />}
                    vs ${aiCosts.previous.totalApiCostUsd.toFixed(4)} prev
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Requests</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {aiCosts.current.totalRequests.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {aiCosts.allTime.totalRequests.toLocaleString()} all time
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg/Request</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  ${aiCosts.current.avgCostPerRequest.toFixed(6)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Real API cost per chat
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">All Time</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  ${aiCosts.allTime.totalApiCostUsd.toFixed(4)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {(aiCosts.allTime.totalInputTokens + aiCosts.allTime.totalOutputTokens).toLocaleString()} tokens
                </div>
              </div>
            </div>

            {/* Expanded details */}
            {showCostDetails ? <div className="space-y-4">
                {/* Model breakdown */}
                {aiCosts.modelBreakdown.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Cost by Model (This Month)
                    </h4>
                    <div className="space-y-1.5">
                      {aiCosts.modelBreakdown.map((m) => (
                        <div key={`${m.provider}-${m.model}`} className="flex items-center justify-between text-xs rounded-md border border-border px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="text-[10px] shrink-0">{m.provider}</Badge>
                            <span className="text-foreground truncate font-mono text-[11px]">{m.model}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-muted-foreground">{m.requests} req</span>
                            <span className="text-muted-foreground">{(m.inputTokens + m.outputTokens).toLocaleString()} tok</span>
                            <span className="font-medium text-foreground">${m.apiCostUsd.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily breakdown */}
                {aiCosts.dailyBreakdown.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Daily Breakdown
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {aiCosts.dailyBreakdown.slice(-14).map((d) => (
                        <div key={d.date} className="flex items-center justify-between text-xs rounded-md border border-border px-3 py-1.5">
                          <span className="text-muted-foreground font-mono">{d.date}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">{d.requests} req</span>
                            <span className="font-medium text-foreground">${d.apiCostUsd.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token totals */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Input Tokens (This Month)</div>
                    <div className="text-sm font-bold text-foreground">
                      {aiCosts.current.totalInputTokens.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Output Tokens (This Month)</div>
                    <div className="text-sm font-bold text-foreground">
                      {aiCosts.current.totalOutputTokens.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div> : null}
          </CardContent>
        </Card> : null}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_user">Waiting</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <Card className="bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Headphones className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No tickets found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="bg-card hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => loadTicket(ticket.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-muted-foreground w-24 shrink-0">
                    {ticket.ticketNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground truncate">
                      {ticket.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {ticket.user?.email || "Unknown"} · {ticket.type} · {new Date(ticket.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[ticket.severity]}`}>
                    {ticket.severity}
                  </Badge>
                  <Badge className={`text-[10px] ${STATUS_COLORS[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
