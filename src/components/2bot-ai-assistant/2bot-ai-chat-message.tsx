/**
 * 2Bot AI Assistant Widget - Chat Message
 *
 * Individual message bubble in the chat with speech synthesis support.
 * Includes image preview lightbox and download for generated images.
 *
 * @module components/2bot-ai-assistant/2bot-ai-chat-message
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Bot, Download, User, X, ZoomIn } from "lucide-react";
import { useCallback, useState } from "react";
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
  /** Attached images for vision analysis (base64 data URLs) */
  attachedImages?: string[];
}

interface TwoBotAIChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
}

export function TwoBotAIChatMessage({ message, isStreaming }: TwoBotAIChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  /**
   * Download a generated image.
   * Works with both data URLs (base64) and regular URLs.
   */
  const handleDownload = useCallback((imageUrl: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `2bot-ai-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  /**
   * Open an image in a new browser tab.
   * Converts data URLs to blob URLs so browsers can display them.
   */
  const handleOpenInNewTab = useCallback((imageUrl: string) => {
    if (imageUrl.startsWith("data:")) {
      // Convert data URL to blob for browser compatibility
      const [header, base64] = imageUrl.split(",");
      const mime = header?.match(/:(.*?);/)?.[1] || "image/png";
      const binary = atob(base64 || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } else {
      window.open(imageUrl, "_blank");
    }
  }, []);

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
    <>
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
            <div>
              {/* Show attached images if any */}
              {message.attachedImages && message.attachedImages.length > 0 ? <div className="flex flex-wrap gap-2 mb-2">
                  {message.attachedImages.map((imgUrl, index) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={index}
                      src={imgUrl}
                      alt={`Attached image ${index + 1}`}
                      className="rounded-md max-w-[150px] max-h-[150px] object-cover border border-primary-foreground/20"
                      loading="lazy"
                    />
                  ))}
                </div> : null}
              {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>
                {message.content}
              </ReactMarkdown>

              {/* Render generated image from imageUrl (not via markdown) */}
              {message.imageUrl ? <div className="relative group my-2 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={message.imageUrl}
                    alt="Generated image"
                    className="rounded-lg max-w-full h-auto cursor-pointer transition-opacity group-hover:opacity-90"
                    onClick={() => setPreviewImage(message.imageUrl ?? null)}
                  />
                  {/* Hover overlay with actions */}
                  <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                    <div className="flex gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs bg-white/90 hover:bg-white text-black shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImage(message.imageUrl ?? null);
                        }}
                      >
                        <ZoomIn className="h-3.5 w-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs bg-white/90 hover:bg-white text-black shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (message.imageUrl) handleDownload(message.imageUrl);
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                </div> : null}

              {isStreaming ? <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" /> : null}
            </div>
          )}
        </div>

        {/* Footer with credits and speech synthesis button */}
        {!isUser && (
          <div className="flex items-center gap-2 mt-1">
            {message.cached ? <span className="text-[10px] text-green-600 dark:text-green-400 font-medium bg-green-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                 ⚡ Cached
               </span> : null}

            {!message.cached && message.creditsUsed !== undefined && message.creditsUsed > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {message.creditsUsed < 1 
                  ? `${message.creditsUsed.toFixed(4)} credits`
                  : `${message.creditsUsed.toLocaleString()} credits`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Image Preview Lightbox */}
    <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        {previewImage ? <div className="relative flex flex-col items-center">
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-3 right-3 z-10 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>

            {/* Full-size image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Generated image preview"
              className="max-w-full max-h-[80vh] object-contain"
            />

            {/* Bottom action bar */}
            <div className="flex items-center gap-3 py-3 px-4">
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-3 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20"
                onClick={() => handleDownload(previewImage)}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Image
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-3 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20"
                onClick={() => handleOpenInNewTab(previewImage)}
              >
                <ZoomIn className="h-3.5 w-3.5 mr-1.5" />
                Open in New Tab
              </Button>
            </div>
          </div> : null}
      </DialogContent>
    </Dialog>
    </>
  );
}
