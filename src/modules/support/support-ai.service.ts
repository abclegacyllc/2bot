/**
 * Support AI Service
 * 
 * AI-powered support assistant that uses KB articles as context.
 * 
 * ARCHITECTURE:
 * - This service is SEPARATE from the 2Bot AI widget
 * - It calls the 2bot-ai-provider module internally (function call, not HTTP)
 * - The frontend Support Widget calls /support/chat endpoint
 * - The frontend 2Bot AI Widget calls /2bot-ai/* endpoints separately
 * 
 * @module modules/support/support-ai.service
 */

import type { TextGenerationMessage } from "@/modules/2bot-ai-provider";
import { TwoBotAIError, twoBotAIProvider } from "@/modules/2bot-ai-provider";
import { getArticlesForAIContext } from "./kb.service";
import { logSupportAICost } from "./support-ai-cost.service";
import type { SupportChatInput, SupportChatResponse } from "./support-ai.types";

// ===========================================
// System Prompt
// ===========================================

const SUPPORT_SYSTEM_PROMPT = `You are a helpful support assistant for 2Bot, a modular automation platform.

Your role:
- Answer questions about using the platform clearly and concisely
- Help troubleshoot common issues with gateways, plugins, billing, and accounts
- Guide users to relevant documentation when available
- Try your best to resolve the user's issue with the information available

Platform features:
- Gateways: Connect to Telegram Bot, Telegram User Account, AI providers (OpenAI, Anthropic, Together AI)
- Plugins: Install automation plugins from the marketplace
- Credits: Universal currency for AI usage and premium features
- Organizations: Team workspaces with departments and shared resources
- Billing: Subscription plans (Free, Starter, Pro, Business, Enterprise)

Guidelines:
- Be concise but thorough
- If you reference a help article, mention it by title
- Focus on resolving the issue yourself first — do NOT suggest creating a support ticket unless you truly cannot help
- Only when you genuinely cannot resolve the issue (e.g., it requires account investigation, a bug fix, or access to internal systems), include the EXACT phrase "[NEEDS_HUMAN_SUPPORT]" at the very end of your response
- Never make up information about platform features you don't know about
- Never share internal system details, API keys, or sensitive information`;

// ===========================================
// Public Methods
// ===========================================

// Plans that qualify for ticket creation
const _TICKET_PLANS = ["PRO", "BUSINESS", "ENTERPRISE"];

/**
 * Process a support chat message
 * 
 * 1. Search KB articles relevant to the user's question
 * 2. Build system prompt with KB context
 * 3. Call 2bot-ai-provider text generation (lite model, platform-funded)
 * 4. Return response with related articles
 * 
 * Support AI is FREE to users — platform absorbs cost via system user.
 */
export async function processSupportChat(
  input: SupportChatInput & { canCreateTickets?: boolean }
): Promise<SupportChatResponse> {
  const canCreate = input.canCreateTickets ?? false;

  // 1. Search KB for relevant articles based on user message
  const relevantArticles = await getArticlesForAIContext(input.message, 3);

  // 2. Build context-enriched system prompt (with plan-aware instructions)
  const contextPrompt = buildContextPrompt(relevantArticles, canCreate);

  // 3. Build conversation messages for AI
  const messages: TextGenerationMessage[] = [
    { role: "system", content: contextPrompt },
    ...input.conversationHistory.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: input.message },
  ];

  // 4. Call AI provider — support uses auto (cheapest available), costs covered by platform
  let reply: string;
  try {
    const aiResponse = await twoBotAIProvider.textGeneration({
      messages,
      model: "auto",
      userId: input.userId || "system-support", // Platform-funded, no user credit deduction
      smartRouting: false, // Auto resolves to cheapest
      stream: false,
      maxTokens: 1024,
      temperature: 0.7,
      feature: "support",
    });
    reply = aiResponse.content;

    // 📊 Track real API cost (async, don't block response)
    let detectedProvider = "unknown";
    try { detectedProvider = twoBotAIProvider.getProvider(aiResponse.model as never); } catch { /* ignore */ }
    logSupportAICost({
      userId: input.userId,
      model: aiResponse.model,
      provider: detectedProvider,
      inputTokens: aiResponse.usage.inputTokens,
      outputTokens: aiResponse.usage.outputTokens,
      creditsCharged: aiResponse.creditsUsed,
    }).catch((costErr) => {
      console.error("[Support AI] Failed to log cost:", costErr);
    });
  } catch (err) {
    // Fallback if AI provider fails
    if (err instanceof TwoBotAIError) {
      console.error("[Support AI] Provider error:", err.code, err.message);
    } else {
      console.error("[Support AI] Unexpected error:", err);
    }
    // Graceful fallback
    reply = relevantArticles.length > 0
      ? `I found some relevant help articles that might answer your question. Please check: "${relevantArticles[0]?.title}". ${canCreate ? "If this doesn't help, you can create a support ticket for personalized assistance." : "If this doesn't help, you can reach us at support@2bot.org."}`
      : `I'm having trouble processing your request right now. ${canCreate ? "You can create a support ticket and our team will help you." : "Please reach out to us at support@2bot.org for assistance."}`;
  }

  // Only suggest ticket when AI explicitly signals it cannot help
  // The AI includes "[NEEDS_HUMAN_SUPPORT]" marker when it genuinely can't resolve the issue
  const needsHumanSupport = reply.includes("[NEEDS_HUMAN_SUPPORT]");
  // Strip the marker from the visible reply
  if (needsHumanSupport) {
    reply = reply.replace(/\[NEEDS_HUMAN_SUPPORT\]/g, "").trimEnd();
  }
  const suggestTicket = needsHumanSupport;

  return {
    reply,
    relatedArticles: relevantArticles.map(a => ({
      slug: a.slug,
      title: a.title,
      excerpt: a.content.slice(0, 150) + "...",
    })),
    suggestTicket,
    canCreateTickets: canCreate,
    supportEmail: "support@2bot.org",
  };
}

// ===========================================
// Internal Helpers
// ===========================================

/**
 * Build system prompt enriched with relevant KB article content
 */
function buildContextPrompt(
  articles: Array<{ title: string; content: string; slug: string; category: string }>,
  canCreateTickets: boolean
): string {
  // Add plan-specific escalation instructions
  const escalationInstructions = canCreateTickets
    ? "If you truly cannot resolve the issue (requires human investigation, account access, or is a bug), include the marker [NEEDS_HUMAN_SUPPORT] at the very end of your response. The system will show a ticket creation prompt automatically — do NOT tell the user to create a ticket yourself."
    : "If you truly cannot resolve the issue, include the marker [NEEDS_HUMAN_SUPPORT] at the very end of your response. The system will show an email prompt automatically — do NOT mention tickets, this user's plan does not include ticket support.";

  const basePrompt = `${SUPPORT_SYSTEM_PROMPT}\n\nESCALATION RULE:\n${escalationInstructions}`;

  if (articles.length === 0) {
    return basePrompt;
  }

  const articleContext = articles
    .map((a, i) => `--- Article ${i + 1}: "${a.title}" (${a.category}) ---\n${a.content}`)
    .join("\n\n");

  return `${basePrompt}

=== RELEVANT HELP ARTICLES ===
Use the following articles to inform your response. Reference them by title when relevant.

${articleContext}

=== END ARTICLES ===

When answering, prefer information from the articles above. If the articles don't fully cover the user's question, try your best with what you know. Only add [NEEDS_HUMAN_SUPPORT] if you truly cannot help.`;
}
