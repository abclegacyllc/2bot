/**
 * 2Bot AI Assistant Widget - Chat Interface
 *
 * Main chat component with inline multimodal capabilities.
 * Supports text generation, image generation, speech synthesis, and speech recognition.
 * 
 * Receives auth token from parent widget to make authenticated API calls.
 * Respects user plan for feature gating.
 *
 * @module components/2bot-ai-assistant/2bot-ai-chat
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoutingPreference } from "@/hooks/use-routing-preference";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import {
    Bot,
    Brain,
    History,
    ImageIcon,
    Loader2,
    MessageSquare,
    Mic,
    MicOff,
    Paperclip,
    Send,
    SlidersHorizontal,
    StopCircle,
    Video,
    Volume2,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TwoBotAIChatMessage, type ChatMessageData } from "./2bot-ai-chat-message";
import { AgentChat } from "./agent-chat";
import { ChatHistoryList } from "./chat-history-list";
import { chatStorage, type ChatSession } from "./chat-storage";
import {
    AUTO_MODE_VALUE,
    ModelSelector,
    type LegacyModelOption,
    type ModelOption,
    type RealModelOption,
    type TwoBotAIModelOption,
} from "./model-selector";

// Type guard for 2Bot AI models
function isTwoBotAIModel(model: ModelOption): model is TwoBotAIModelOption {
  return 'tierInfo' in model && 'displayName' in model;
}

interface TwoBotAIChatProps {
  onTokenUsage?: (tokensUsed: number) => void;
  authToken?: string | null;
  userPlan?: string;
  organizationId?: string;
  userId?: string;
}

type InputMode = "chat" | "image" | "recording";

// Capability mode - which type of AI models to show
type CapabilityMode = "text" | "image" | "video" | "agent";

// Image attachment limits
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB max
const MAX_IMAGES = 5; // Max 5 images per message
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Available features from API
interface AvailableFeatures {
  textGeneration: boolean;
  imageGeneration: boolean;
  imageAnalysis: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
}

export function TwoBotAIChat({ onTokenUsage, authToken, userPlan = "FREE", organizationId, userId }: TwoBotAIChatProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [realModels, setRealModels] = useState<RealModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("chat");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  // Capability mode - which type of models to show
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>("text");

  // Agent mode — workspace connection state
  const [agentWorkspaceId, setAgentWorkspaceId] = useState<string | null>(null);
  const [agentWsLoading, setAgentWsLoading] = useState(false);
  const [agentFetchKey, setAgentFetchKey] = useState(0);

  // Fetch workspace ID when agent mode is selected
  useEffect(() => {
    if (capabilityMode !== "agent") return;
    let cancelled = false;
    (async () => {
      setAgentWsLoading(true);
      try {
        const orgParam = organizationId ? `?organizationId=${organizationId}` : "";
        const res = await fetch(apiUrl(`/workspace/status${orgParam}`), {
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
        });
        if (cancelled) return;
        if (!res.ok) { setAgentWorkspaceId(null); return; }
        const json = await res.json();
        if (cancelled) return;
        const data = "data" in json ? json.data : json;
        setAgentWorkspaceId(data?.id ?? null);
      } catch {
        if (!cancelled) setAgentWorkspaceId(null);
      } finally {
        if (!cancelled) setAgentWsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [capabilityMode, organizationId, authToken, agentFetchKey]);

  // Clear attached images when switching away from text mode (attachment only works with vision models)
  useEffect(() => {
    if (capabilityMode !== "text") {
      setAttachedImages([]);
    }
  }, [capabilityMode]);
  
  // History Management
  const [showHistory, setShowHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // Load sessions on mount or context change
  useEffect(() => {
    if (userId) {
      setSessions(chatStorage.getSessions(userId, organizationId));
    }
  }, [userId, organizationId]);

  // AI-generated session title (replaces naive first-word title)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const titleGeneratedRef = useRef(false);

  // Generate an AI title after the first assistant response completes
  const generateSessionTitle = useCallback(async (userMsg: string, assistantMsg: string) => {
    if (titleGeneratedRef.current || !authToken) return;
    titleGeneratedRef.current = true;
    try {
      const res = await fetch(apiUrl("/2bot-ai/text-generation"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          messages: [
            { role: "user", content: `Generate a concise 3-5 word title summarizing this conversation. Reply with ONLY the title, nothing else.\n\nUser: ${userMsg.slice(0, 200)}\nAssistant: ${assistantMsg.slice(0, 200)}` },
          ],
          model: "2bot-ai-text-lite",
          stream: false,
          smartRouting: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const title = (data.data?.content || data.data?.text || "").trim().replace(/^["']|["']$/g, "").slice(0, 50);
        if (title) {
          setSessionTitle(title);
        }
      }
    } catch {
      // Silently fail — fall back to user message as title
    }
  }, [authToken]);

  // Save session when messages change (only if we have messages)
  useEffect(() => {
    if (!userId) return;
    if (messages.length === 0) return;
    
    // Don't save if it's just the initial "assistant typing" placeholder
    // Safely check first element exists and has properties
    const firstMsg = messages[0];
    if (messages.length === 1 && firstMsg && firstMsg.role === "assistant" && !firstMsg.content) return;

    // Determine ID
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = `session_${Date.now()}`;
      setCurrentSessionId(sessionId);
    }

    // Use AI-generated title if available, otherwise fall back to first user message
    const firstUserMsg = messages.find(m => m.role === "user");
    const fallbackTitle = firstUserMsg ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "") : "New Chat";
    const title = sessionTitle || fallbackTitle;

    // Trigger AI title generation when first assistant response is complete
    if (!sessionTitle && !titleGeneratedRef.current) {
      const firstAssistant = messages.find(m => m.role === "assistant" && m.content.length > 0 && m.creditsUsed !== undefined);
      if (firstUserMsg && firstAssistant) {
        generateSessionTitle(firstUserMsg.content, firstAssistant.content);
      }
    }

    const session: ChatSession = {
      id: sessionId,
      title,
      createdAt: Date.now(), // ideally keep original creation time, but for now this is ok
      updatedAt: Date.now(),
      messages,
      model: selectedModel
    };

    chatStorage.saveSession(session, userId, organizationId);
    setSessions(chatStorage.getSessions(userId, organizationId));
  }, [messages, currentSessionId, selectedModel, userId, organizationId, sessionTitle, generateSessionTitle]);

  // Handle loading a session
  const handleSelectSession = useCallback((session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setSelectedModel(session.model || selectedModel);
    setSessionTitle(session.title);
    titleGeneratedRef.current = true; // Don't regenerate title for loaded sessions
    setShowHistory(false);
  }, [selectedModel]);

  // Handle deleting a session
  const handleDeleteSession = useCallback((id: string) => {
    if (!userId) return;
    chatStorage.deleteSession(id, userId, organizationId);
    setSessions(chatStorage.getSessions(userId, organizationId));
    if (currentSessionId === id) {
      setMessages([]);
      setCurrentSessionId(null);
    }
  }, [currentSessionId, userId, organizationId]);

  // Handle new chat (modified clear)
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(null);
    setSessionTitle(null);
    titleGeneratedRef.current = false;
    setError(null);
    setShowHistory(false);
    setAttachedImages([]);
  }, []);
  
  // Smart Routing - derived from selectedModel being "auto"
  const smartRouting = selectedModel === AUTO_MODE_VALUE;
  
  // Reasoning mode - use extended thinking models when enabled
  const [reasoningEnabled, setReasoningEnabled] = useState(false);

  // AI Routing Preference — shared hook syncs with Settings page via auth context
  const { routingPreference, isSaving: isSavingPreference, setRoutingPreference: handleRoutingPreferenceChange } = useRoutingPreference(authToken);
  const [routingPopoverOpen, setRoutingPopoverOpen] = useState(false);
  
  // Auto-disable reasoning when in auto mode or switching to lite tier (no reasoning-lite exists)
  useEffect(() => {
    if (smartRouting) {
      // Reasoning not available in auto mode
      if (reasoningEnabled) setReasoningEnabled(false);
      return;
    }
    const currentModel = models.find(m => m.id === selectedModel);
    const currentTier = currentModel && isTwoBotAIModel(currentModel) ? currentModel.tier : 'lite';
    if (currentTier === 'lite' && reasoningEnabled) {
      setReasoningEnabled(false);
    }
  }, [selectedModel, models, reasoningEnabled, smartRouting]);
  
  // Available features based on configured providers
  const [features, setFeatures] = useState<AvailableFeatures>({
    textGeneration: false,
    imageGeneration: false,
    imageAnalysis: false,
    speechSynthesis: false,
    speechRecognition: false,
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Image attachments for vision-capable models
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; base64: string; name: string; size: number }>>([]);

  // Helper to get auth headers
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
  }, [authToken]);

  // Handle image file selection for vision analysis
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_IMAGES - attachedImages.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images allowed per message`);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      // Validate file type
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setError(`Invalid file type: ${file.name}. Allowed: JPG, PNG, GIF, WebP`);
        return;
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`File too large: ${file.name}. Maximum size is 20MB`);
        return;
      }

      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachedImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            base64,
            name: file.name,
            size: file.size,
          },
        ]);
      };
      reader.onerror = () => {
        setError(`Failed to read file: ${file.name}`);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachedImages.length]);

  // Remove an attached image
  const handleRemoveImage = useCallback((imageId: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  // Clear all attached images
  const clearAttachedImages = useCallback(() => {
    setAttachedImages([]);
  }, []);

  /**
   * Get allowed model tiers based on user or organization plan
   * 
   * Tier access rules:
   * - ALL plans: free tier always available (zero cost)
   * - FREE / ORG_FREE: free, lite
   * - STARTER / ORG_STARTER: free, lite, pro
   * - PRO+ / ORG_GROWTH+: free, lite, pro, ultra (all tiers)
   */
  const getAllowedTiers = (plan: string): string[] => {
    switch (plan) {
      // Free tier - free + lite models
      case 'FREE':
      case 'ORG_FREE':
        return ['free', 'lite'];
      // Starter tier - free + lite + pro models
      case 'STARTER':
      case 'ORG_STARTER':
        return ['free', 'lite', 'pro'];
      // Pro tier and above - all model tiers
      case 'PRO':
      case 'BUSINESS':
      case 'ENTERPRISE':
      case 'ORG_GROWTH':
      case 'ORG_PRO':
      case 'ORG_BUSINESS':
      case 'ORG_ENTERPRISE':
        return ['free', 'lite', 'pro', 'ultra'];
      // Default to free tier limits for unknown plans
      default:
        return ['free', 'lite'];
    }
  };

  // Get allowed tiers for current plan
  const allowedTiers = getAllowedTiers(userPlan);

  // Check if current model supports vision (image input)
  const currentModelSupportsVision = (() => {
    const model = models.find(m => m.id === selectedModel);
    if (!model) return false;
    // Support both 2Bot AI format and legacy format
    if (isTwoBotAIModel(model)) {
      return model.features.vision;
    }
    return (model as LegacyModelOption).capabilities?.canAnalyzeImages ?? false;
  })();

  // Map capability mode to API capability parameter
  const getApiCapability = (mode: CapabilityMode): string => {
    switch (mode) {
      case 'text': return 'text-generation';
      case 'image': return 'image-generation';
      case 'video': return 'video-generation';
      default: return 'text-generation';
    }
  };

  // Fetch available models AND features from catalog
  useEffect(() => {
    async function fetchModels() {
      // Video models don't exist yet - show empty state
      if (capabilityMode === 'video') {
        setModels([]);
        setRealModels([]);
        setSelectedModel('');
        return;
      }
      
      try {
        // Use /catalog for 2Bot AI branded models (preferred)
        const capability = getApiCapability(capabilityMode);
        const headers: Record<string, string> = authToken ? { "Authorization": `Bearer ${authToken}` } : {};
        
        // Fetch catalog models and real models in parallel
        const [catalogRes, realRes] = await Promise.all([
          fetch(apiUrl(`/2bot-ai/catalog?capability=${capability}`), {
            credentials: "include",
            headers,
          }),
          fetch(apiUrl(`/2bot-ai/real-models?capability=${capability}`), {
            credentials: "include",
            headers,
          }),
        ]);

        if (catalogRes.status === 401) {
          setError("Authentication required");
          return;
        }

        // Process real models
        if (realRes.ok) {
          const realData = await realRes.json();
          setRealModels(realData.data?.models ?? []);
        }

        if (catalogRes.ok) {
          const data = await catalogRes.json();
          
          // Set available features from API (only on first load / text mode)
          if (data.data.features && capabilityMode === 'text') {
            setFeatures(data.data.features);
          }
          
          // Filter models based on plan if needed
          let availableModels: TwoBotAIModelOption[] = data.data.models;
          
          // Filter out reasoning models from the dropdown - they're accessed via the reasoning toggle
          // Only applies to text models
          if (capabilityMode === 'text') {
            availableModels = availableModels.filter((m) => !m.id.includes('reasoning'));
          }
          
          // Filter models based on user's plan tier access
          availableModels = availableModels.filter((m) => 
            allowedTiers.includes(m.tier)
          );
          setModels(availableModels);
          
          // Set default model
          // For text mode: default to "auto" (smart routing)
          // For image mode: default to pro tier
          if (capabilityMode === 'text') {
            // Default to Auto Mode for text
            setSelectedModel(AUTO_MODE_VALUE);
          } else if (availableModels.length > 0) {
            const preferredModel = availableModels.find((m) => m.tier === 'pro');
            const firstModel = availableModels[0];
            setSelectedModel(preferredModel?.id || firstModel?.id || "");
          }
        }
      } catch (_err) {
        // Model fetch failed - set error state for user feedback
        setError("Failed to load AI models. Please refresh.");
      }
    }
    fetchModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, userPlan, capabilityMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle text chat submit
  const handleChatSubmit = useCallback(async () => {
    if ((!input.trim() && attachedImages.length === 0) || isLoading) return;

    // Store images to send (will be cleared from state)
    const imagesToSend = [...attachedImages];
    
    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
      // Store image URLs for display in chat history
      attachedImages: imagesToSend.length > 0 ? imagesToSend.map(img => img.base64) : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    clearAttachedImages();
    setError(null);
    setIsLoading(true);
    setIsStreaming(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    
    // Compute effective model: if reasoning is enabled, use reasoning variant
    const currentModel = models.find(m => m.id === selectedModel);
    const currentTier = currentModel && isTwoBotAIModel(currentModel) ? currentModel.tier : 'lite';
    const canUseReasoning = currentTier === 'pro' || currentTier === 'ultra';
    const effectiveModel = (reasoningEnabled && canUseReasoning)
      ? selectedModel.replace('text-', 'reasoning-')
      : selectedModel;
    
    const assistantMessage: ChatMessageData = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date(),
      model: effectiveModel,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Prepare messages for API with System Prompt injection
    // For messages with images, use multimodal parts format
    const apiMessages = [
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
        // Include image parts if the message had attached images
        parts: m.attachedImages?.map(imgUrl => ({
          type: "image_url" as const,
          image_url: { url: imgUrl },
        })),
      })),
      // Add the new user message
      {
        role: userMessage.role,
        content: userMessage.content,
        parts: imagesToSend.length > 0 ? [
          // Include text as first part if present
          ...(userMessage.content ? [{ type: "text" as const, text: userMessage.content }] : []),
          // Include images as subsequent parts
          ...imagesToSend.map(img => ({
            type: "image_url" as const,
            image_url: { url: img.base64 },
          })),
        ] : undefined,
      },
    ];

    try {
      abortControllerRef.current = new AbortController();

      const res = await fetch(apiUrl("/2bot-ai/text-generation"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          messages: apiMessages,
          model: effectiveModel,
          stream: true,
          smartRouting, // Let server know if we want cost-optimized routing
          organizationId, // Use org credits if in org context
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to get response");
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let fullContent = "";
      let creditsUsed = 0;
      let tierUsed: string | undefined;
      let buffer = "";

      // Process a batch of SSE lines from the buffer
      const processSSELines = (lineBatch: string[]) => {
        for (const line of lineBatch) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data: ")) continue;
          
          const data = trimmedLine.slice(6); // Remove "data: "
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "error") {
              throw new Error(parsed.error);
            }

            if (parsed.type === "done") {
              creditsUsed = parsed.creditsUsed ?? 0;
              // Extract tier from 2Bot model ID (e.g., "2bot-ai-text-free" → "free")
              if (parsed.twobotAIModel) {
                const parts = (parsed.twobotAIModel as string).split('-');
                tierUsed = parts[parts.length - 1];
              }
              // Always trigger update if field exists, even if 0
              if (parsed.creditsUsed !== undefined) {
                onTokenUsage?.(creditsUsed);
              }
            } else if (parsed.id?.startsWith("cached_")) {
              // Handle full cached response frame
              fullContent = parsed.delta || parsed.content || "";
              creditsUsed = 0; // Cached is free!
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: fullContent, cached: true }
                    : m
                )
              );
            } else if (parsed.delta) {
              fullContent += parsed.delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: fullContent }
                    : m
                )
              );
            }
          } catch (parseErr) {
            // Re-throw API errors, only skip invalid JSON
            if (parseErr instanceof Error && !parseErr.message.includes("JSON")) {
              throw parseErr;
            }
            // Skip invalid JSON chunks silently (expected during partial streaming)
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and append to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process lines in buffer
        const lines = buffer.split("\n\n");
        // Keep the last incomplete part in the buffer
        buffer = lines.pop() || "";
        processSSELines(lines);
      }

      // Process any remaining data in the buffer after stream ends
      // This ensures the final "done" event is always processed
      if (buffer.trim()) {
        processSSELines([buffer]);
      }

      // Update final message with credits and tier
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: fullContent, creditsUsed, tierUsed }
            : m
        )
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User cancelled
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: m.content + "\n\n_(Cancelled)_" }
              : m
          )
        );
      } else {
        const errorMessage = err instanceof Error ? err.message : "An error occurred";
        setError(errorMessage);
        // Remove empty assistant message
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, messages, selectedModel, onTokenUsage, getAuthHeaders, reasoningEnabled, models, attachedImages, clearAttachedImages, organizationId, smartRouting]);

  // Handle image generation
  const handleImageGenerate = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    if (!selectedModel) {
      setError("Please select an image model");
      return;
    }

    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      role: "user",
      content: `🎨 Generate image: ${input.trim()}`,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessageData = {
      id: assistantMessageId,
      role: "assistant",
      content: "Generating image...",
      createdAt: new Date(),
      model: selectedModel,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Determine quality based on model tier (ultra = hd)
      const currentModel = models.find(m => m.id === selectedModel);
      const isUltra = currentModel && isTwoBotAIModel(currentModel) && currentModel.tier === 'ultra';
      
      const res = await fetch(apiUrl("/2bot-ai/image-generation"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          prompt: input.trim(),
          model: selectedModel,
          size: "1024x1024",
          quality: isUltra ? "hd" : "standard",
          organizationId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to generate image");
      }

      const data = await res.json();
      // Backend returns images array, get first image URL
      const imageUrl = data.data.images?.[0]?.url || data.data.url;
      const creditsUsed = data.data.creditsUsed || 0;

      if (creditsUsed > 0) {
        onTokenUsage?.(creditsUsed);
      }

      // Update with image
      setMessages((prev) => {
        const updatedMessages = prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: "Here's your generated image:",
                creditsUsed,
                imageUrl,
              }
            : m
        );

        // Explicitly save the session immediately after adding imageUrl
        // This ensures the image is persisted before any potential navigation/refresh
        if (userId && currentSessionId) {
          const firstUserMsg = updatedMessages.find(m => m.role === "user");
          const title = firstUserMsg 
            ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "") 
            : "New Chat";

          const session: ChatSession = {
            id: currentSessionId,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: updatedMessages,
            model: selectedModel
          };

          chatStorage.saveSession(session, userId, organizationId);
        }

        return updatedMessages;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, onTokenUsage, getAuthHeaders, selectedModel, models, organizationId, currentSessionId, userId]);

  // Handle voice recording (Speech Recognition)
  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        
        // Send to Speech Recognition API
        setIsLoading(true);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const res = await fetch(apiUrl("/2bot-ai/speech-recognition"), {
            method: "POST",
            credentials: "include",
            headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {},
            body: formData,
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error?.message || "Failed to transcribe");
          }

          const data = await res.json();
          setInput(data.data.text);
          
          if (data.data.creditsUsed > 0) {
            onTokenUsage?.(data.data.creditsUsed);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Transcription failed";
          setError(errorMessage);
        } finally {
          setIsLoading(false);
          setInputMode("chat");
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setInputMode("recording");
    } catch (_err) {
      setError("Could not access microphone");
    }
  }, [onTokenUsage, authToken]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Handle Speech Synthesis (text-to-speech)
  const handleSpeak = useCallback(async (messageId: string, text: string) => {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (speakingMessageId === messageId) {
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        return;
      }
    }

    setIsSpeaking(true);
    setSpeakingMessageId(messageId);

    try {
      const res = await fetch(apiUrl("/2bot-ai/speech-synthesis"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          text: text.replace(/[#*`_\[\]()]/g, "").slice(0, 4000), // Clean markdown, limit length
          voice: "alloy",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Speech synthesis failed");
      }

      const data = await res.json();
      
      if (data.data.creditsUsed > 0) {
        onTokenUsage?.(data.data.creditsUsed);
      }

      // Play audio
      const audio = new Audio(data.data.audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsSpeaking(false);
        setSpeakingMessageId(null);
      };
      
      audio.onerror = () => {
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        setError("Failed to play audio");
      };

      await audio.play();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Speech synthesis failed";
      setError(errorMessage);
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    }
  }, [speakingMessageId, onTokenUsage, getAuthHeaders]);

  // Handle stop
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (capabilityMode === "image") {
          handleImageGenerate();
        } else {
          handleChatSubmit();
        }
      }
    },
    [handleChatSubmit, handleImageGenerate, capabilityMode]
  );

  // Handle submit based on capability mode
  const handleSubmit = useCallback(() => {
    if (capabilityMode === "image") {
      handleImageGenerate();
    } else {
      handleChatSubmit();
    }
  }, [capabilityMode, handleChatSubmit, handleImageGenerate]);

  // Clear chat
  const _handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background relative">
      {capabilityMode === "agent" ? (
        /* Agent Mode — full-height agent chat */
        <div className="flex-1 min-h-0 overflow-hidden">
          {agentWsLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Connecting to workspace...</p>
            </div>
          ) : !agentWorkspaceId ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">No Workspace Running</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Start your workspace first, then the AI agent can help you
                  write code, manage plugins, and configure gateways.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAgentFetchKey(k => k + 1)}>
                Retry Connection
              </Button>
            </div>
          ) : (
            <AgentChat workspaceId={agentWorkspaceId} organizationId={organizationId} />
          )}
        </div>
      ) : (
        /* Chat / Image / Video Modes */
        <>
          {/* History Overlay */}
          {showHistory ? <div className="absolute inset-0 z-50 bg-background">
              <ChatHistoryList
                sessions={sessions}
                currentSessionId={currentSessionId}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                onNewChat={handleNewChat}
                onClose={() => setShowHistory(false)}
              />
            </div> : null}

          {/* Header Controls */}
          <div className="absolute top-2 right-2 z-10 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(true)}
              disabled={isLoading}
              className="text-xs h-7 bg-background/80 backdrop-blur px-2"
              title="Chat History"
            >
              <History className="h-3 w-3" />
            </Button>
            
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                disabled={isLoading}
                className="text-xs h-7 bg-background/80 backdrop-blur"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="p-4 max-w-3xl mx-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center text-muted-foreground">
                  <Bot className="h-12 w-12 mb-4 text-muted-foreground/50" />
                  <p className="text-lg font-medium text-foreground">Ask me anything!</p>
                  <p className="text-sm mt-1 mb-6">Chat, generate images, or use voice input.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <TwoBotAIChatMessage
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming && msg.role === "assistant" ? !msg.creditsUsed : undefined}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Error */}
          {error ? <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setError(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div> : null}
        </>
      )}

      {/* Input area with inline controls */}
      <div className="p-3 border-t max-w-3xl mx-auto w-full">
        <div className="flex flex-col gap-2">
          {capabilityMode !== "agent" && (
            <>
              {/* Recording indicator */}
              {inputMode === "recording" && (
                <div className="flex items-center gap-2 mb-2 text-xs bg-destructive/10 text-destructive px-2 py-1 rounded animate-pulse">
                  <Mic className="h-3 w-3" />
                  <span>Recording... Click mic to stop</span>
                </div>
              )}

              {/* Hidden file input for image attachments */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
          
          {/* Image attachment preview */}
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg border border-dashed border-muted-foreground/30">
              {attachedImages.map((img) => (
                <div key={img.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.base64}
                    alt={img.name}
                    className="h-16 w-16 object-cover rounded-md border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveImage(img.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/50 text-white truncate px-0.5 rounded-b-md">
                    {img.name.length > 10 ? img.name.slice(0, 10) + "..." : img.name}
                  </span>
                </div>
              ))}
              {attachedImages.length < MAX_IMAGES && (
                <Button
                  variant="outline"
                  className="h-16 w-16 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          
          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              capabilityMode === "image"
                ? "Describe the image you want to generate..."
                : capabilityMode === "video"
                ? "Video generation coming soon..."
                : inputMode === "recording"
                ? "Recording audio..."
                : "Type a message..."
            }
            className="min-h-[60px] max-h-[120px] resize-none text-sm"
            disabled={isLoading || inputMode === "recording" || capabilityMode === "video"}
          />
            </>
          )}

          {/* Bottom toolbar with model selector and action buttons */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Left side: Capability Mode + Model selector/preview */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
              {/* Capability Mode Icons - Text/Image/Video */}
              <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md">
                <TooltipProvider delayDuration={300}>
                  {/* Text Mode */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 transition-all",
                          capabilityMode === "text"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setCapabilityMode("text")}
                        disabled={isLoading}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">Text Generation</p>
                      <p className="text-[10px] text-muted-foreground">Chat, code, analysis</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Image Mode */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 transition-all",
                          capabilityMode === "image"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setCapabilityMode("image")}
                        disabled={isLoading}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">Image Generation</p>
                      <p className="text-[10px] text-muted-foreground">Create images from text</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Video Mode */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 transition-all",
                          capabilityMode === "video"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                          "opacity-50 cursor-not-allowed" // Coming soon
                        )}
                        onClick={() => setCapabilityMode("video")}
                        disabled={true} // Video not available yet
                      >
                        <Video className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">Video Generation</p>
                      <p className="text-[10px] text-muted-foreground">🚧 Coming Soon</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Agent Mode */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 transition-all",
                          capabilityMode === "agent"
                            ? "bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setCapabilityMode("agent")}
                        disabled={isLoading}
                      >
                        <Bot className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">AI Agent</p>
                      <p className="text-[10px] text-muted-foreground">Autonomous workspace operator</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              {/* Model selector for text mode (includes Auto Mode option) */}
              {capabilityMode === "text" && (
                <ModelSelector
                  models={models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                  disabled={isLoading}
                  compact
                  showAutoMode
                  realModels={realModels}
                />
              )}
              
              {/* Model selector for image mode */}
              {capabilityMode === "image" && (
                models.length > 0 ? (
                  <ModelSelector
                    models={models}
                    value={selectedModel}
                    onChange={setSelectedModel}
                    disabled={isLoading}
                    compact
                    realModels={realModels}
                  />
                ) : (
                  <div className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/50 rounded">
                    No image models available
                  </div>
                )
              )}
              
              {/* AI Routing Preference Popover */}
              {capabilityMode !== "agent" && (<Popover open={routingPopoverOpen} onOpenChange={setRoutingPopoverOpen}>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <PopoverTrigger asChild>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 transition-all",
                            routingPopoverOpen
                              ? "bg-purple-500/20 text-purple-400"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          disabled={isLoading}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                    </PopoverTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">Routing Preference</p>
                      <p className="text-[10px] text-muted-foreground">
                        {routingPreference === "cost" ? "💰 Save Credits" : routingPreference === "quality" ? "⭐ Best Quality" : "⚖️ Balanced"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <PopoverContent side="top" align="start" className="w-[340px] p-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">AI Routing Preference</p>
                    <p className="text-[10px] text-muted-foreground">How the model router selects within your tier</p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {([
                        { value: "cost" as const, label: "Save Credits", icon: "💰", desc: "Cheapest model" },
                        { value: "balanced" as const, label: "Balanced", icon: "⚖️", desc: "Mid-range model" },
                        { value: "quality" as const, label: "Best Quality", icon: "⭐", desc: "Highest quality" },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            handleRoutingPreferenceChange(opt.value);
                            setRoutingPopoverOpen(false);
                          }}
                          disabled={isSavingPreference}
                          className={cn(
                            "relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 text-center transition-all",
                            routingPreference === opt.value
                              ? "border-purple-500 bg-purple-500/10"
                              : "border-border bg-muted/30 hover:border-muted-foreground/30 hover:bg-muted/50",
                            isSavingPreference && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <span className="text-lg">{opt.icon}</span>
                          <span className="text-[11px] font-medium text-foreground leading-tight">{opt.label}</span>
                          <span className="text-[9px] text-muted-foreground leading-tight">{opt.desc}</span>
                          {routingPreference === opt.value && (
                            <Badge className="absolute -top-1.5 -right-1.5 bg-purple-600 text-[8px] px-1 py-0 h-4">Active</Badge>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground pt-1">
                      Affects all text, reasoning &amp; code models. Free tier unaffected.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>)}

              {/* Reasoning Toggle Button - only for text mode pro/ultra tiers (not in auto mode) */}
              {capabilityMode === "text" && !smartRouting && (() => {
                const currentModel = models.find(m => m.id === selectedModel);
                const currentTier = currentModel && isTwoBotAIModel(currentModel) ? currentModel.tier : 'lite';
                const canUseReasoning = currentTier === 'pro' || currentTier === 'ultra';
                
                return (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 transition-all",
                            reasoningEnabled && canUseReasoning
                              ? "bg-green-500 hover:bg-green-600 text-white shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                              : "text-muted-foreground hover:text-foreground",
                            !canUseReasoning && "opacity-40 cursor-not-allowed"
                          )}
                          onClick={() => canUseReasoning && setReasoningEnabled(!reasoningEnabled)}
                          disabled={isLoading || !canUseReasoning}
                        >
                          <Brain className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        {canUseReasoning ? (
                          <>
                            <p className="text-xs font-medium">
                              {reasoningEnabled ? "🧠 Reasoning ON" : "Enable Reasoning"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {reasoningEnabled 
                                ? "Extended thinking for complex problems. Click to disable."
                                : "Enable deep analysis for math, logic, and complex coding tasks."}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-medium">Reasoning unavailable</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Select Pro or Ultra tier to enable reasoning mode.
                            </p>
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
            </div>

            {/* Right side: Action buttons (hidden in agent mode) */}
            {capabilityMode !== "agent" && (<div className="flex items-center gap-1">
              <TooltipProvider delayDuration={300}>
                {/* Image attachment button - only for text mode with vision-capable models */}
                {capabilityMode === "text" && (currentModelSupportsVision || smartRouting) ? <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={attachedImages.length > 0 ? "default" : "ghost"}
                        size="icon"
                        className={cn(
                          "h-8 w-8",
                          attachedImages.length > 0 && "bg-blue-500 hover:bg-blue-600"
                        )}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || attachedImages.length >= MAX_IMAGES}
                      >
                        <Paperclip className="h-4 w-4" />
                        {attachedImages.length > 0 && (
                          <span className="absolute -top-1 -right-1 text-[9px] bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                            {attachedImages.length}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Attach image{attachedImages.length > 0 ? ` (${attachedImages.length}/${MAX_IMAGES})` : ""}</p>
                      <p className="text-[10px] text-muted-foreground">For vision analysis</p>
                    </TooltipContent>
                  </Tooltip> : null}
                
                {/* Voice input button - only show if Speech Recognition is available */}
                {features.speechRecognition ? <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isRecording ? "destructive" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        disabled={isLoading ? !isRecording : undefined}
                      >
                        {isRecording ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{isRecording ? "Stop recording" : "Voice input"}</p>
                    </TooltipContent>
                  </Tooltip> : null}

                {/* Speech Synthesis button - only show if available */}
                {features.speechSynthesis && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" ? <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isSpeaking ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
                          if (lastAssistant) {
                            handleSpeak(lastAssistant.id, lastAssistant.content);
                          }
                        }}
                        disabled={isLoading}
                      >
                        <Volume2 className={cn("h-4 w-4", isSpeaking && "animate-pulse")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{isSpeaking ? "Stop speaking" : "Read aloud"}</p>
                    </TooltipContent>
                  </Tooltip> : null}

                {/* Send/Stop button */}
                {isStreaming ? (
                  <Button
                    onClick={handleStop}
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    size="icon"
                    disabled={!input.trim() || isLoading}
                    className="h-8 w-8"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </TooltipProvider>
            </div>)}
          </div>
          
           {/* Legal & Terms Link */}
           {capabilityMode !== "agent" && (<div className="text-[10px] text-center text-muted-foreground pt-1 pb-1">
             AI can make mistakes. By using 2Bot AI, you agree to our{' '}
             <a href="/doc/terms" target="_blank" className="underline hover:text-primary">
               Terms of Service
             </a>.
           </div>)}
        </div>
      </div>
    </div>
  );
}
