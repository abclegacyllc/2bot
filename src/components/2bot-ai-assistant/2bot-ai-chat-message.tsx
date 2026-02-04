/**
 * 2Bot AI Assistant Widget - Chat Message
 *
 * Individual message bubble in the chat with TTS support.
 *
 * @module components/2bot-ai-assistant/2bot-ai-chat-message
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bot, User, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  model?: string;
  creditsUsed?: number;
  cached?: boolean;
  imageUrl?: string;
}

interface TwoBotAIChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
  onSpeak?: () => void;
  isSpeaking?: boolean;
}

export function TwoBotAIChatMessage({ message, isStreaming, onSpeak, isSpeaking }: TwoBotAIChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 p-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary"
        )}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "flex flex-col max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  // Render images inline
                  img: ({ src, alt }) => (
                    <img
                      src={src}
                      alt={alt || "Generated image"}
                      className="rounded-lg max-w-full h-auto my-2"
                      loading="lazy"
                    />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
              )}
            </div>
          )}
        </div>

        {/* Footer with tokens and TTS button */}
        {!isUser && (
          <div className="flex items-center gap-2 mt-1">
            {message.cached && (
               <span className="text-[10px] text-green-600 dark:text-green-400 font-medium bg-green-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                 ⚡ Cached
               </span>
            )}

            {!message.cached && message.creditsUsed !== undefined && message.creditsUsed > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {message.creditsUsed < 1 
                  ? `${message.creditsUsed.toFixed(4)} credits`
                  : `${message.creditsUsed.toLocaleString()} credits`}
              </span>
            )}
            
            {onSpeak && message.content && !isStreaming && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={onSpeak}
              >
                <Volume2 className={cn("h-3 w-3", isSpeaking && "text-primary animate-pulse")} />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
