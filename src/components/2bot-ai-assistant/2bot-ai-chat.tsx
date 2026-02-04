/**
 * 2Bot AI Assistant Widget - Chat Interface
 *
 * Main chat component with inline multimodal capabilities.
 * Supports chat, image generation, TTS, and STT all within the same interface.
 * 
 * Receives auth token from parent widget to make authenticated API calls.
 * Respects user plan for feature gating.
 *
 * @module components/2bot-ai-assistant/2bot-ai-chat
 */

"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import {
  History,
  ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  StopCircle,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TwoBotAIChatMessage, type ChatMessageData } from "./2bot-ai-chat-message";
import { ChatHistoryList } from "./chat-history-list";
import { chatStorage, type ChatSession } from "./chat-storage";
import { ModelSelector, type ModelOption } from "./model-selector";

interface TwoBotAIChatProps {
  onTokenUsage?: (tokensUsed: number) => void;
  authToken?: string | null;
  userPlan?: string;
  organizationId?: string;
  userId?: string;
}

type InputMode = "chat" | "image" | "recording";

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
  const [selectedModel, setSelectedModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("chat");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
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

    // Determine title (first user message)
    const firstUserMsg = messages.find(m => m.role === "user");
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "") : "New Chat";

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
  }, [messages, currentSessionId, selectedModel, userId, organizationId]);

  // Handle loading a session
  const handleSelectSession = useCallback((session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setSelectedModel(session.model || selectedModel);
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
    setError(null);
    setShowHistory(false);
  }, []);
  
  // Smart Routing - automatically use cheaper model for simple queries
  const [smartRouting, setSmartRouting] = useState(true); // ON by default to save user credits

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);
  
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

  // Check if user has access to premium models
  const isPremiumUser = userPlan === "PRO" || userPlan === "ENTERPRISE";

  // Check if current model supports vision (image input)
  const currentModelSupportsVision = models.find(m => m.id === selectedModel)?.capabilities?.canAnalyzeImages ?? false;

  // Fetch available models AND features
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch(apiUrl("/2bot-ai/models?capability=text-generation"), {
          credentials: "include",
          headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {},
        });
        if (res.status === 401) {
          setError("Authentication required");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          
          // Set available features from API
          if (data.data.features) {
            setFeatures(data.data.features);
          }
          
          // Filter models based on plan if needed
          let availableModels = data.data.models;
          if (!isPremiumUser) {
            // FREE users only get access to cheaper models (tier 1-2)
            availableModels = availableModels.filter((m: ModelOption) => 
              (m.tier || 99) <= 2
            );
          }
          setModels(availableModels);
          
          // Set default model
          const defaultModel = availableModels.find((m: ModelOption) => m.isDefault);
          if (defaultModel) {
            setSelectedModel(defaultModel.id);
          } else if (availableModels.length > 0) {
            setSelectedModel(availableModels[0].id);
          }
        }
      } catch (err) {
        // Model fetch failed - set error state for user feedback
        setError("Failed to load AI models. Please refresh.");
      }
    }
    fetchModels();
  }, [authToken, isPremiumUser]);

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
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);
    setIsStreaming(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessageData = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date(),
      model: selectedModel,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Prepare messages for API with System Prompt injection
    const apiMessages = [
      { role: "system", content: "You are 2Bot AI, a helpful and intelligent assistant for the 2Bot Automation Platform. You are NOT Claude, NOT GPT, and NOT any other specific model. You are simply 2Bot AI. Always identify yourself as 2Bot AI if asked." },
      ...messages.concat(userMessage).map((m) => ({
        role: m.role,
        content: m.content,
      }))
    ];

    try {
      abortControllerRef.current = new AbortController();

      const res = await fetch(apiUrl("/2bot-ai/text-generation"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel,
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
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and append to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process lines in buffer
        const lines = buffer.split("\n\n");
        // Keep the last incomplete part in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
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
              creditsUsed = parsed.creditsUsed || 0;
              // Always trigger update if field exists, even if 0 (handling cases where cost is <1 but tracking logic handles it)
              if (creditsUsed >= 0 && parsed.creditsUsed !== undefined) {
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
      }

      // Update final message with credits
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: fullContent, creditsUsed }
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
  }, [input, isLoading, messages, selectedModel, onTokenUsage, getAuthHeaders]);

  // Handle image generation
  const handleImageGenerate = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessageData = {
      id: `user-${Date.now()}`,
      role: "user",
      content: `🎨 Generate image: ${input.trim()}`,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setInputMode("chat");
    setError(null);
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessageData = {
      id: assistantMessageId,
      role: "assistant",
      content: "Generating image...",
      createdAt: new Date(),
      model: "dall-e-3",
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const res = await fetch(apiUrl("/2bot-ai/image-generation"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          prompt: input.trim(),
          size: "1024x1024",
          quality: "standard",
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: `![Generated Image](${imageUrl})`,
                creditsUsed,
                imageUrl,
              }
            : m
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, onTokenUsage, getAuthHeaders]);

  // Handle voice recording (STT)
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
        
        // Send to STT API
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
    } catch (err) {
      setError("Could not access microphone");
    }
  }, [onTokenUsage, authToken]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Handle TTS (text-to-speech)
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
        throw new Error(errorData.error?.message || "TTS failed");
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
      const errorMessage = err instanceof Error ? err.message : "TTS failed";
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
        if (inputMode === "image") {
          handleImageGenerate();
        } else {
          handleChatSubmit();
        }
      }
    },
    [handleChatSubmit, handleImageGenerate, inputMode]
  );

  // Handle submit based on mode
  const handleSubmit = useCallback(() => {
    if (inputMode === "image") {
      handleImageGenerate();
    } else {
      handleChatSubmit();
    }
  }, [inputMode, handleChatSubmit, handleImageGenerate]);

  // Clear chat
  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Toggle image mode
  const toggleImageMode = useCallback(() => {
    setInputMode((prev) => (prev === "image" ? "chat" : "image"));
  }, []);

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* History Overlay */}
      {showHistory && (
        <div className="absolute inset-0 z-50 bg-background">
          <ChatHistoryList
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onNewChat={handleNewChat}
            onClose={() => setShowHistory(false)}
          />
        </div>
      )}

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
        <div className="p-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center text-muted-foreground">
              <p className="text-sm">Ask me anything!</p>
              <p className="text-xs mt-1">Chat, generate images, or use voice input.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <TwoBotAIChatMessage
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && msg.role === "assistant" && !msg.creditsUsed}
                onSpeak={msg.role === "assistant" ? () => handleSpeak(msg.id, msg.content) : undefined}
                isSpeaking={speakingMessageId === msg.id}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setError(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Input area with inline controls */}
      <div className="p-3 border-t">
        {/* Mode indicator for image */}
        {inputMode === "image" && (
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <ImageIcon className="h-3 w-3" />
            <span>Image generation mode</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 ml-auto p-0 px-1"
              onClick={() => setInputMode("chat")}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Recording indicator */}
        {inputMode === "recording" && (
          <div className="flex items-center gap-2 mb-2 text-xs bg-destructive/10 text-destructive px-2 py-1 rounded animate-pulse">
            <Mic className="h-3 w-3" />
            <span>Recording... Click mic to stop</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              inputMode === "image"
                ? "Describe the image you want to generate..."
                : inputMode === "recording"
                ? "Recording audio..."
                : "Type a message..."
            }
            className="min-h-[60px] max-h-[120px] resize-none text-sm"
            disabled={isLoading || inputMode === "recording"}
          />

          {/* Bottom toolbar with model selector and action buttons */}
          <div className="flex items-center justify-between gap-2">
            {/* Left side: Smart Routing Toggle + Model selector/preview */}
            <div className="flex items-center gap-3">
              {/* Smart Routing Toggle - FIRST */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        id="smart-routing"
                        checked={smartRouting}
                        onCheckedChange={setSmartRouting}
                        disabled={isLoading}
                        className="h-4 w-7 data-[state=checked]:bg-green-500"
                      />
                      <Label 
                        htmlFor="smart-routing" 
                        className={cn(
                          "text-[10px] cursor-pointer flex items-center gap-0.5",
                          smartRouting ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        )}
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{smartRouting ? "Auto" : "Manual"}</span>
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p className="text-xs font-medium">
                      {smartRouting ? "🧠 Smart Routing ON" : "Manual Model Selection"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {smartRouting 
                        ? "AI picks the best model based on your message complexity - can save credits on simple queries"
                        : "You choose which model to use for every message"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Model selector (Manual mode) OR Model preview (Auto mode) */}
              {smartRouting ? (
                // Auto mode: Show preview of available models (not selectable)
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 text-[10px] text-muted-foreground">
                        <span className="opacity-70">Uses:</span>
                        <span className="font-medium">
                          {models.length > 0 
                            ? models.slice(0, 2).map(m => m.name.split(' ').pop()).join(' / ')
                            : 'Loading...'}
                        </span>
                        {models.length > 2 && <span className="opacity-50">+{models.length - 2}</span>}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px]">
                      <p className="text-xs font-medium mb-1">Available Models</p>
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        {models.slice(0, 5).map(m => (
                          <div key={m.id} className="flex justify-between gap-2">
                            <span>{m.name}</span>
                            <span className="opacity-50">{m.badge || (m.tier === 1 ? 'Fast' : m.tier === 3 ? 'Best' : '')}</span>
                          </div>
                        ))}
                        {models.length > 5 && <div className="opacity-50">...and {models.length - 5} more</div>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                // Manual mode: Show model selector
                <ModelSelector
                  models={models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                  disabled={isLoading}
                  compact
                />
              )}
            </div>

            {/* Right side: Action buttons */}
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={300}>
                {/* Image generation button - only show if OpenAI is configured */}
                {features.imageGeneration && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={inputMode === "image" ? "default" : "ghost"}
                        size="icon"
                        className={cn("h-8 w-8", inputMode === "image" && "bg-primary")}
                        onClick={toggleImageMode}
                        disabled={isLoading}
                      >
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Generate image (DALL-E 3)</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Voice input button - only show if STT is available */}
                {features.speechRecognition && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isRecording ? "destructive" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        disabled={isLoading && !isRecording}
                      >
                        {isRecording ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{isRecording ? "Stop recording" : "Voice input (Whisper)"}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* TTS button for last assistant message - only show if TTS is available */}
                {features.speechSynthesis && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && (
                  <Tooltip>
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
                      <p>{isSpeaking ? "Stop speaking" : "Read aloud (TTS)"}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

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
            </div>
          </div>
          
           {/* Legal & Terms Link */}
           <div className="text-[10px] text-center text-muted-foreground pt-1 pb-1">
             AI can make mistakes. By using 2Bot AI, you agree to our{' '}
             <a href="/doc/terms" target="_blank" className="underline hover:text-primary">
               Terms of Service
             </a>.
           </div>
        </div>
      </div>
    </div>
  );
}
