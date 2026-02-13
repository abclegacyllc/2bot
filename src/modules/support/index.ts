/**
 * Support Module
 * 
 * Provides customer support functionality:
 * - Knowledge Base articles (self-serve help)
 * - Support tickets (async human support)
 * - AI-powered support chat (uses 2bot-ai-provider internally)
 * 
 * SEPARATION FROM 2BOT AI:
 * - The Support Widget is a SEPARATE component from the 2Bot AI Widget
 * - Backend support-ai.service calls 2bot-ai-provider as a module (not HTTP)
 * - Frontend support components live in src/components/support/
 * - Frontend 2bot-ai components live in src/components/2bot-ai-assistant/
 * 
 * @module modules/support
 */

// Knowledge Base
export * as kbService from "./kb.service";
export {
    KB_CATEGORIES, createKBArticleSchema, kbFeedbackSchema,
    kbListSchema,
    kbSearchSchema,
    updateKBArticleSchema
} from "./kb.types";
export type {
    CreateKBArticleInput,
    KBArticleResponse,
    KBCategory,
    UpdateKBArticleInput
} from "./kb.types";

// Tickets
export * as ticketService from "./ticket.service";
export {
    TICKET_CATEGORIES,
    TICKET_SEVERITIES,
    TICKET_STATUSES,
    TICKET_TYPES, addInternalNoteSchema,
    addTicketMessageSchema,
    assignTicketSchema,
    createTicketSchema,
    resolveTicketSchema, ticketListSchema,
    updateTicketStatusSchema
} from "./ticket.types";
export type {
    AddTicketMessageInput,
    CreateTicketInput,
    TicketCategory,
    TicketMessageResponse,
    TicketResponse,
    TicketSeverity,
    TicketStatus,
    TicketType
} from "./ticket.types";

// Support AI
export * as supportAICostService from "./support-ai-cost.service";
export * as supportAIService from "./support-ai.service";
export { supportChatSchema } from "./support-ai.types";
export type {
    SupportAIContext,
    SupportChatInput,
    SupportChatResponse
} from "./support-ai.types";

