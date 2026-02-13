/**
 * Support Ticket Form Component
 * 
 * Create and manage support tickets (PRO+ only).
 * For FREE/STARTER users, shows support email instead.
 * 
 * @module components/support/support-tickets
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";
import { ArrowLeft, Clock, Loader2, Mail, MessageSquare, Plus, Send, TicketPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
  messages?: TicketMessage[];
}

interface TicketMessage {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  sender: {
    name: string | null;
    role: string;
  };
}

interface SupportTicketsProps {
  authToken: string | null;
  canCreateTickets: boolean;
  orgPlan?: string;
  initialType?: string;
  initialCategory?: string;
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
  waiting_user: "Waiting on You",
  resolved: "Resolved",
  closed: "Closed",
};

export function SupportTickets({
  authToken,
  canCreateTickets,
  orgPlan,
  initialType,
  initialCategory,
}: SupportTicketsProps) {
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newReply, setNewReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState(initialType || "question");
  const [formCategory, setFormCategory] = useState(initialCategory || "other");
  const [formSeverity, setFormSeverity] = useState("medium");

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl("/tickets"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.data.tickets || []);
      }
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // View ticket detail
  const viewTicket = async (id: string) => {
    if (!authToken) return;
    try {
      const res = await fetch(apiUrl(`/tickets/${id}`), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data.data);
        setView("detail");
      }
    } catch (err) {
      console.error("Failed to load ticket:", err);
    }
  };

  // Create ticket
  const createTicket = async () => {
    if (!authToken || !formTitle.trim() || !formDescription.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/tickets"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim(),
          type: formType,
          category: formCategory,
          severity: formSeverity,
          orgPlan,
        }),
      });
      if (res.ok) {
        setFormTitle("");
        setFormDescription("");
        setFormType("question");
        setFormCategory("other");
        setFormSeverity("medium");
        setView("list");
        fetchTickets();
      } else {
        const data = await res.json();
        if (data.error?.code === "PLAN_UPGRADE_REQUIRED") {
          alert(data.error.message);
        }
      }
    } catch (err) {
      console.error("Failed to create ticket:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Send reply
  const sendReply = async () => {
    if (!authToken || !selectedTicket || !newReply.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(apiUrl(`/tickets/${selectedTicket.id}/messages`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: newReply.trim() }),
      });
      if (res.ok) {
        setNewReply("");
        viewTicket(selectedTicket.id); // Reload ticket
      }
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setSendingReply(false);
    }
  };

  // Not allowed — show email
  if (!canCreateTickets) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
          <Mail className="h-6 w-6 text-blue-500" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Ticket Support
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-[260px]">
          Ticket support is available on Pro plans and above. You can still get help via AI chat or email.
        </p>
        <a
          href="mailto:support@2bot.org"
          className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 font-medium"
        >
          <Mail className="h-4 w-4" />
          support@2bot.org
        </a>
        <p className="text-xs text-muted-foreground mt-4">
          <a href="#" className="text-blue-500 hover:underline">
            Upgrade to Pro →
          </a>
        </p>
      </div>
    );
  }

  // Create ticket form
  if (view === "create") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground">New Ticket</span>
        </div>
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title</label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Brief description of the issue"
                className="text-sm h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="question">Question</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gateway">Gateway</SelectItem>
                    <SelectItem value="plugin">Plugin</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Severity</label>
              <Select value={formSeverity} onValueChange={setFormSeverity}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                className="text-sm min-h-[120px]"
                rows={5}
              />
            </div>
            <Button
              className="w-full"
              onClick={createTicket}
              disabled={!formTitle.trim() || !formDescription.trim() || submitting}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</>
              ) : (
                <><TicketPlus className="h-4 w-4 mr-2" /> Create Ticket</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Ticket detail view
  if (view === "detail" && selectedTicket) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setView("list"); setSelectedTicket(null); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">{selectedTicket.ticketNumber}</span>
          </div>
          <Badge variant="secondary" className={`text-[10px] ${STATUS_COLORS[selectedTicket.status] || ""}`}>
            {STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
          </Badge>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          {/* Ticket info */}
          <h3 className="text-sm font-semibold text-foreground mb-1">{selectedTicket.title}</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {new Date(selectedTicket.createdAt).toLocaleDateString()}
          </p>

          {/* Original description */}
          <div className="bg-muted rounded-lg p-3 mb-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTicket.description}</p>
          </div>

          {/* Messages */}
          {selectedTicket.messages && selectedTicket.messages.length > 0 ? <div className="space-y-3">
              {selectedTicket.messages
                .filter(m => !m.isInternal)
                .map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 ${
                      msg.sender.role === "MEMBER" || msg.sender.role === "OWNER"
                        ? "bg-primary/10 ml-4"
                        : "bg-muted mr-4"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground">
                        {msg.sender.name || "Support"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
            </div> : null}
        </ScrollArea>

        {/* Reply input (only if not resolved/closed) */}
        {!["resolved", "closed"].includes(selectedTicket.status) && (
          <div className="border-t border-border p-3 shrink-0">
            <div className="flex gap-2">
              <Textarea
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                placeholder="Type a reply..."
                className="min-h-[40px] max-h-[80px] resize-none text-sm"
                rows={1}
              />
              <Button
                size="icon"
                className="shrink-0 h-10 w-10"
                onClick={sendReply}
                disabled={!newReply.trim() || sendingReply}
              >
                {sendingReply ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tickets list
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">My Tickets</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setView("create")}
        >
          <Plus className="h-3 w-3 mr-1" />
          New
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No tickets yet</p>
            <Button size="sm" variant="outline" onClick={() => setView("create")}>
              <TicketPlus className="h-3.5 w-3.5 mr-1" />
              Create Ticket
            </Button>
          </div>
        ) : (
          <div className="p-2">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => viewTicket(ticket.id)}
                className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {ticket.ticketNumber}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[ticket.status] || ""}`}
                  >
                    {STATUS_LABELS[ticket.status] || ticket.status}
                  </Badge>
                </div>
                <h3 className="text-sm font-medium text-foreground line-clamp-1">
                  {ticket.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
