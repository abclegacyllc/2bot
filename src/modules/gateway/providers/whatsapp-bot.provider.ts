/**
 * WhatsApp Bot Gateway Provider
 *
 * Implements the GatewayProvider interface for WhatsApp Cloud API (Meta Graph API v21.0).
 * Uses webhook-based inbound events and the Cloud API for outbound messages.
 *
 * WhatsApp sends event payloads to our webhook endpoint, which we verify
 * with HMAC-SHA256 signature verification using the app secret.
 * Webhook verification uses a separate GET handshake with hub.challenge.
 *
 * @module modules/gateway/providers/whatsapp-bot.provider
 */

import type { GatewayType } from "@prisma/client";

import type { GatewayAction } from "../gateway.registry";
import type { WhatsAppBotConfig, WhatsAppBotCredentials } from "../gateway.types";
import { BaseGatewayProvider } from "./base.provider";

// ===========================================
// WhatsApp Cloud API Types
// ===========================================

const WHATSAPP_API_BASE = "https://graph.facebook.com/v21.0";

interface WhatsAppApiResponse {
  messaging_product?: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
  error?: WhatsAppApiErrorPayload;
}

interface WhatsAppApiErrorPayload {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface WhatsAppPhoneNumberResponse {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  code_verification_status?: string;
}

interface WhatsAppProfileResponse {
  data: Array<{
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    profile_picture_url?: string;
    websites?: string[];
    vertical?: string;
  }>;
}

// ===========================================
// Custom Error
// ===========================================

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public errorType?: string,
    public errorSubcode?: number,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

// ===========================================
// Provider Implementation
// ===========================================

export class WhatsAppBotProvider extends BaseGatewayProvider<WhatsAppBotCredentials, WhatsAppBotConfig> {
  readonly type: GatewayType = "WHATSAPP_BOT";
  readonly name = "WhatsApp Cloud API";
  readonly description = "Connect your WhatsApp bot via Meta Cloud API";

  private phoneInfoCache = new Map<string, WhatsAppPhoneNumberResponse>();
  private credentialsCache = new Map<string, WhatsAppBotCredentials>();

  // ===========================================
  // Connection Lifecycle
  // ===========================================

  protected async doConnect(
    gatewayId: string,
    credentials: WhatsAppBotCredentials,
    _config?: WhatsAppBotConfig,
  ): Promise<void> {
    // Validate token by fetching phone number info
    const phoneInfo = await this.callApi<WhatsAppPhoneNumberResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}`,
    );

    // Cache for later use
    this.phoneInfoCache.set(gatewayId, phoneInfo);
    this.credentialsCache.set(gatewayId, credentials);

    this.log.info(
      { gatewayId, phoneNumber: phoneInfo.display_phone_number, verifiedName: phoneInfo.verified_name },
      `Connected to WhatsApp as "${phoneInfo.verified_name}"`,
    );
  }

  protected async doDisconnect(gatewayId: string): Promise<void> {
    this.phoneInfoCache.delete(gatewayId);
    this.credentialsCache.delete(gatewayId);
  }

  // ===========================================
  // Credential Validation
  // ===========================================

  protected async doValidateCredentials(
    credentials: WhatsAppBotCredentials,
  ): Promise<{ valid: boolean; error?: string }> {
    // Format checks
    if (!credentials.accessToken || credentials.accessToken.trim().length === 0) {
      return { valid: false, error: "Access token is required" };
    }

    if (!credentials.phoneNumberId || !/^\d+$/.test(credentials.phoneNumberId)) {
      return { valid: false, error: "Phone Number ID must be a numeric string" };
    }

    if (!credentials.appSecret || credentials.appSecret.trim().length === 0) {
      return { valid: false, error: "App secret is required for webhook verification" };
    }

    if (!credentials.verifyToken || credentials.verifyToken.trim().length === 0) {
      return { valid: false, error: "Verify token is required for webhook handshake" };
    }

    // Live validation — fetch phone number info
    try {
      await this.callApi<WhatsAppPhoneNumberResponse>(
        credentials.accessToken,
        `${credentials.phoneNumberId}`,
      );
      return { valid: true };
    } catch (error) {
      if (error instanceof WhatsAppApiError) {
        return { valid: false, error: `WhatsApp API error: ${error.message}` };
      }
      return { valid: false, error: "Failed to validate WhatsApp credentials" };
    }
  }

  // ===========================================
  // Action Execution
  // ===========================================

  protected async doExecute<TParams, TResult>(
    gatewayId: string,
    action: string,
    params: TParams,
  ): Promise<TResult> {
    const credentials = this.credentialsCache.get(gatewayId);
    if (!credentials) {
      throw new Error(`No cached credentials for gateway ${gatewayId}`);
    }

    const p = params as Record<string, unknown>;

    switch (action) {
      case "sendMessage":
        return this.sendMessage(credentials, p) as TResult;

      case "sendTemplate":
        return this.sendTemplate(credentials, p) as TResult;

      case "sendImage":
        return this.sendMedia(credentials, "image", p) as TResult;

      case "sendDocument":
        return this.sendMedia(credentials, "document", p) as TResult;

      case "sendAudio":
        return this.sendMedia(credentials, "audio", p) as TResult;

      case "sendVideo":
        return this.sendMedia(credentials, "video", p) as TResult;

      case "sendSticker":
        return this.sendMedia(credentials, "sticker", p) as TResult;

      case "sendLocation":
        return this.sendLocation(credentials, p) as TResult;

      case "sendContact":
        return this.sendContact(credentials, p) as TResult;

      case "sendReaction":
        return this.sendReaction(credentials, p) as TResult;

      case "markAsRead":
        return this.markAsRead(credentials, p) as TResult;

      case "getProfile":
        return this.getProfile(credentials) as TResult;

      default:
        throw new Error(`Unsupported WhatsApp action: ${action}`);
    }
  }

  // ===========================================
  // Actions
  // ===========================================

  private async sendMessage(
    credentials: WhatsAppBotCredentials,
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { to, text, previewUrl } = params as {
      to: string;
      text: string;
      previewUrl?: boolean;
    };

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: previewUrl ?? false, body: text },
      },
    );
  }

  private async sendTemplate(
    credentials: WhatsAppBotCredentials,
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { to, templateName, languageCode, components } = params as {
      to: string;
      templateName: string;
      languageCode?: string;
      components?: unknown[];
    };

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode || "en_US" },
          components,
        },
      },
    );
  }

  private async sendMedia(
    credentials: WhatsAppBotCredentials,
    mediaType: "image" | "document" | "audio" | "video" | "sticker",
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { to, mediaId, link, caption, filename } = params as {
      to: string;
      mediaId?: string;
      link?: string;
      caption?: string;
      filename?: string;
    };

    const mediaObject: Record<string, unknown> = {};
    if (mediaId) {
      mediaObject.id = mediaId;
    } else if (link) {
      mediaObject.link = link;
    }
    if (caption && (mediaType === "image" || mediaType === "video" || mediaType === "document")) {
      mediaObject.caption = caption;
    }
    if (filename && mediaType === "document") {
      mediaObject.filename = filename;
    }

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: mediaType,
        [mediaType]: mediaObject,
      },
    );
  }

  private async sendLocation(
    credentials: WhatsAppBotCredentials,
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { to, latitude, longitude, name, address } = params as {
      to: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "location",
        location: { latitude, longitude, name, address },
      },
    );
  }

  private async sendContact(
    credentials: WhatsAppBotCredentials,
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { to, contacts } = params as {
      to: string;
      contacts: Array<{
        name: { formatted_name: string; first_name?: string; last_name?: string };
        phones?: Array<{ phone: string; type?: string }>;
      }>;
    };

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "contacts",
        contacts,
      },
    );
  }

  private async sendReaction(
    credentials: WhatsAppBotCredentials,
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { to, messageId, emoji } = params as {
      to: string;
      messageId: string;
      emoji: string;
    };

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "reaction",
        reaction: { message_id: messageId, emoji },
      },
    );
  }

  private async markAsRead(
    credentials: WhatsAppBotCredentials,
    params: Record<string, unknown>,
  ): Promise<WhatsAppApiResponse> {
    const { messageId } = params as { messageId: string };

    return this.callApi<WhatsAppApiResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      },
    );
  }

  private async getProfile(
    credentials: WhatsAppBotCredentials,
  ): Promise<WhatsAppProfileResponse> {
    return this.callApi<WhatsAppProfileResponse>(
      credentials.accessToken,
      `${credentials.phoneNumberId}/whatsapp_business_profile`,
      undefined,
      "GET",
    );
  }

  // ===========================================
  // Health Check
  // ===========================================

  protected async doCheckHealth(
    gatewayId: string,
    credentials: WhatsAppBotCredentials,
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      const phoneInfo = await this.callApi<WhatsAppPhoneNumberResponse>(
        credentials.accessToken,
        `${credentials.phoneNumberId}`,
      );
      const latency = Date.now() - start;

      // Update cache
      this.phoneInfoCache.set(gatewayId, phoneInfo);

      return { healthy: true, latency };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "WhatsApp health check failed",
      };
    }
  }

  // ===========================================
  // Supported Actions
  // ===========================================

  getSupportedActions(): GatewayAction[] {
    return [
      {
        name: "sendMessage",
        description: "Send a text message",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number in E.164 format" },
          text: { type: "string", required: true, description: "Message body text" },
          previewUrl: { type: "boolean", required: false, description: "Enable link previews" },
        },
      },
      {
        name: "sendTemplate",
        description: "Send a template message",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          templateName: { type: "string", required: true, description: "Approved template name" },
          languageCode: { type: "string", required: false, description: "Language code (default: en_US)" },
          components: { type: "array", required: false, description: "Template components" },
        },
      },
      {
        name: "sendImage",
        description: "Send an image",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          mediaId: { type: "string", required: false, description: "WhatsApp media ID" },
          link: { type: "string", required: false, description: "Public image URL" },
          caption: { type: "string", required: false, description: "Image caption" },
        },
      },
      {
        name: "sendDocument",
        description: "Send a document",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          mediaId: { type: "string", required: false, description: "WhatsApp media ID" },
          link: { type: "string", required: false, description: "Public document URL" },
          caption: { type: "string", required: false, description: "Document caption" },
          filename: { type: "string", required: false, description: "Filename for the document" },
        },
      },
      {
        name: "sendAudio",
        description: "Send an audio file",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          mediaId: { type: "string", required: false, description: "WhatsApp media ID" },
          link: { type: "string", required: false, description: "Public audio URL" },
        },
      },
      {
        name: "sendVideo",
        description: "Send a video",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          mediaId: { type: "string", required: false, description: "WhatsApp media ID" },
          link: { type: "string", required: false, description: "Public video URL" },
          caption: { type: "string", required: false, description: "Video caption" },
        },
      },
      {
        name: "sendSticker",
        description: "Send a sticker",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          mediaId: { type: "string", required: false, description: "WhatsApp media ID" },
          link: { type: "string", required: false, description: "Public sticker URL (.webp)" },
        },
      },
      {
        name: "sendLocation",
        description: "Send a location",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          latitude: { type: "number", required: true, description: "Latitude" },
          longitude: { type: "number", required: true, description: "Longitude" },
          name: { type: "string", required: false, description: "Location name" },
          address: { type: "string", required: false, description: "Location address" },
        },
      },
      {
        name: "sendContact",
        description: "Send contact cards",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          contacts: { type: "array", required: true, description: "Array of contact objects" },
        },
      },
      {
        name: "sendReaction",
        description: "React to a message",
        params: {
          to: { type: "string", required: true, description: "Recipient phone number" },
          messageId: { type: "string", required: true, description: "Message ID to react to" },
          emoji: { type: "string", required: true, description: "Emoji character" },
        },
      },
      {
        name: "markAsRead",
        description: "Mark a message as read",
        params: {
          messageId: { type: "string", required: true, description: "Message ID to mark as read" },
        },
      },
      {
        name: "getProfile",
        description: "Get WhatsApp Business profile info",
        returns: "WhatsAppProfileResponse",
      },
    ];
  }

  // ===========================================
  // Provider Metadata
  // ===========================================

  protected getProviderMetadata(
    _gatewayId: string,
    _credentials: WhatsAppBotCredentials,
  ): Record<string, unknown> {
    return {
      platform: "whatsapp",
      apiVersion: "v21.0",
      features: ["text", "template", "image", "document", "audio", "video", "sticker", "location", "contacts", "reactions", "read_receipts"],
      webhookVerification: "hub_challenge",
      signatureVerification: "hmac_sha256",
    };
  }

  async getProviderInfo(
    gatewayId: string,
    credentials: WhatsAppBotCredentials,
  ): Promise<Record<string, unknown>> {
    // Get phone info (prefer cache, fallback to live API)
    let phoneInfo = this.phoneInfoCache.get(gatewayId);
    if (!phoneInfo) {
      phoneInfo = await this.callApi<WhatsAppPhoneNumberResponse>(
        credentials.accessToken,
        `${credentials.phoneNumberId}`,
      );
      this.phoneInfoCache.set(gatewayId, phoneInfo);
    }

    return {
      phoneNumberId: phoneInfo.id,
      displayPhoneNumber: phoneInfo.display_phone_number,
      verifiedName: phoneInfo.verified_name,
      qualityRating: phoneInfo.quality_rating,
      businessAccountId: credentials.businessAccountId,
    };
  }

  // ===========================================
  // WhatsApp Cloud API Helper
  // ===========================================

  private async callApi<T>(
    accessToken: string,
    endpoint: string,
    body?: Record<string, unknown>,
    method: "GET" | "POST" = body ? "POST" : "GET",
  ): Promise<T> {
    const url = `${WHATSAPP_API_BASE}/${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const init: RequestInit = {
      method,
      headers,
    };

    if (body && method === "POST") {
      // Remove undefined values
      const cleanBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) cleanBody[key] = value;
      }
      init.body = JSON.stringify(cleanBody);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      // Try to parse error body
      try {
        const errorData = (await response.json()) as { error?: WhatsAppApiErrorPayload };
        if (errorData.error) {
          throw new WhatsAppApiError(
            errorData.error.message,
            errorData.error.code,
            errorData.error.type,
            errorData.error.error_subcode,
          );
        }
      } catch (e) {
        if (e instanceof WhatsAppApiError) throw e;
      }
      throw new WhatsAppApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
}

// ===========================================
// Singleton Instance
// ===========================================

export const whatsAppBotProvider = new WhatsAppBotProvider();
