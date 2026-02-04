import { ChatMessageData } from "./2bot-ai-chat-message";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessageData[];
  model: string;
}

const STORAGE_KEY_PREFIX = "2bot-ai-sessions";

function getStorageKey(userId: string, organizationId?: string): string {
  const context = organizationId ? `org-${organizationId}` : "personal";
  return `${STORAGE_KEY_PREFIX}-${userId}-${context}`;
}

export const chatStorage = {
  getSessions(userId: string, organizationId?: string): ChatSession[] {
    if (typeof window === "undefined" || !userId) return [];
    try {
      const key = getStorageKey(userId, organizationId);
      const data = localStorage.getItem(key);
      // Fallback to old key if not found AND it's personal context (migration-ish)
      if (!data && !organizationId) {
        const legacyData = localStorage.getItem(STORAGE_KEY_PREFIX);
        if (legacyData) return JSON.parse(legacyData);
      }
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to load chat history:", error);
      return [];
    }
  },

  getSession(id: string, userId: string, organizationId?: string): ChatSession | undefined {
    const sessions = this.getSessions(userId, organizationId);
    return sessions.find((s) => s.id === id);
  },

  saveSession(session: ChatSession, userId: string, organizationId?: string): void {
    if (typeof window === "undefined" || !userId) return;
    try {
      const sessions = this.getSessions(userId, organizationId);
      const index = sessions.findIndex((s) => s.id === session.id);
      
      if (index >= 0) {
        sessions[index] = session;
      } else {
        sessions.unshift(session);
      }
      
      // Sort by updatedAt desc
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      
      // Limit to 50 sessions
      if (sessions.length > 50) {
        sessions.length = 50;
      }

      const key = getStorageKey(userId, organizationId);
      localStorage.setItem(key, JSON.stringify(sessions));
    } catch (error) {
      console.error("Failed to save chat session:", error);
    }
  },

  deleteSession(id: string, userId: string, organizationId?: string): void {
    if (typeof window === "undefined" || !userId) return;
    const sessions = this.getSessions(userId, organizationId).filter((s) => s.id !== id);
    const key = getStorageKey(userId, organizationId);
    localStorage.setItem(key, JSON.stringify(sessions));
  },

  clearAll(userId: string, organizationId?: string): void {
    if (typeof window === "undefined" || !userId) return;
    const key = getStorageKey(userId, organizationId);
    localStorage.removeItem(key);
  }
};
