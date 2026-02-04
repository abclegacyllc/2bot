import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageSquare, Plus, Trash2, X } from "lucide-react";
import { ChatSession } from "./chat-storage";

// Helper for date formatting
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

interface ChatHistoryListProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

export function ChatHistoryList({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  onClose
}: ChatHistoryListProps) {
  return (
    <div className="flex flex-col h-full bg-background relative z-20">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-sm">Chat History</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button 
          onClick={onNewChat} 
          className="w-full justify-start gap-2" 
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-3 pt-0">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No previous chats found.
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50 cursor-pointer border border-transparent",
                  currentSessionId === session.id ? "bg-muted border-border" : ""
                )}
                onClick={() => onSelectSession(session)}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex flex-col overflow-hidden text-left">
                    <span className="truncate font-medium">
                      {session.title || "Untitled Chat"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(session.updatedAt)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
