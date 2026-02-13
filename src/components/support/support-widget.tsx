/**
 * Support Widget
 * 
 * Floating support widget at bottom-left of the dashboard.
 * COMPLETELY SEPARATE from the 2Bot AI Widget (bottom-right).
 * 
 * Tabs:
 * 1. AI Help - AI-powered support chat (free for all)
 * 2. Articles - Knowledge base browser
 * 3. Tickets - Support tickets (PRO+ only, email fallback for free)
 * 
 * Plan-based access:
 * - FREE/STARTER/ORG_FREE/ORG_STARTER/ORG_GROWTH: AI chat + KB articles + support email
 * - PRO/BUSINESS/ENTERPRISE/ORG_PRO/ORG_BUSINESS/ORG_ENTERPRISE: All of above + ticket creation
 * 
 * @module components/support/support-widget
 */

"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Headphones, MessageSquare, TicketPlus, X } from "lucide-react";
import { useState } from "react";
import { SupportChat } from "./support-chat";
import { SupportKBBrowser } from "./support-kb-browser";
import { SupportTickets } from "./support-tickets";

// Plans that allow ticket creation
const TICKET_ALLOWED_PLANS = ["PRO", "BUSINESS", "ENTERPRISE"];
const TICKET_ALLOWED_ORG_PLANS = ["ORG_PRO", "ORG_BUSINESS", "ORG_ENTERPRISE"];

interface SupportWidgetProps {
  position?: "bottom-left" | "bottom-right";
}

export function SupportWidget({ position = "bottom-left" }: SupportWidgetProps) {
  const { user, token, context, isAuthenticated, isLoading: authLoading } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [kbSlug, setKbSlug] = useState<string | null>(null);

  // Determine plan-based ticket access
  const userPlan = user?.plan || "FREE";
  const contextPlan = context.plan;
  const canCreateTickets =
    TICKET_ALLOWED_PLANS.includes(userPlan) ||
    TICKET_ALLOWED_ORG_PLANS.includes(contextPlan as string);

  const orgPlan = context.type === "organization" ? (contextPlan as string) : undefined;

  const positionClasses = position === "bottom-left"
    ? "left-4 bottom-4"
    : "right-4 bottom-4";

  // Don't show while loading or not authenticated
  if (authLoading || !isAuthenticated) {
    return null;
  }

  // Navigate to article from chat
  const handleViewArticle = (slug: string) => {
    setKbSlug(slug);
    setActiveTab("articles");
  };

  // Navigate to create ticket from chat
  const handleCreateTicket = () => {
    setActiveTab("tickets");
  };

  return (
    <>
      {/* Collapsed: Floating button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className={`fixed ${positionClasses} h-14 w-14 rounded-full shadow-lg z-50 bg-blue-600 hover:bg-blue-700 text-white`}
          size="icon"
          title="Support"
        >
          <Headphones className="h-6 w-6" />
        </Button>
      )}

      {/* Expanded: Support panel */}
      {isOpen ? <div
          className={`fixed ${positionClasses} w-[400px] h-[600px] shadow-2xl z-50 flex flex-col bg-background border rounded-lg overflow-hidden`}
          role="dialog"
          aria-label="2Bot Support"
        >
          {/* Header */}
          <div className="flex flex-row items-center justify-between py-3 px-4 border-b shrink-0 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5" />
              <h2 className="text-base font-semibold">Support</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-3 h-10 rounded-none border-b bg-muted/30 shrink-0">
              <TabsTrigger
                value="chat"
                className="text-xs gap-1 data-[state=active]:bg-background"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                AI Help
              </TabsTrigger>
              <TabsTrigger
                value="articles"
                className="text-xs gap-1 data-[state=active]:bg-background"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Articles
              </TabsTrigger>
              <TabsTrigger
                value="tickets"
                className="text-xs gap-1 data-[state=active]:bg-background"
              >
                <TicketPlus className="h-3.5 w-3.5" />
                Tickets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              <SupportChat
                authToken={token}
                userPlan={userPlan}
                orgPlan={orgPlan}
                canCreateTickets={canCreateTickets}
                onViewArticle={handleViewArticle}
                onCreateTicket={handleCreateTicket}
              />
            </TabsContent>

            <TabsContent value="articles" className="flex-1 overflow-hidden mt-0">
              <SupportKBBrowser
                authToken={token}
                activeSlug={kbSlug}
                onSlugChange={setKbSlug}
              />
            </TabsContent>

            <TabsContent value="tickets" className="flex-1 overflow-hidden mt-0">
              <SupportTickets
                authToken={token}
                canCreateTickets={canCreateTickets}
                orgPlan={orgPlan}
              />
            </TabsContent>
          </Tabs>
        </div> : null}
    </>
  );
}
