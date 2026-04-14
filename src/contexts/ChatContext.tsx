import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  saveMessages,
  loadMessages,
  Message,
  getApiKey,
  loadUserProfile,
  UserProfile,
  saveConversationSummary,
  loadConversationSummary,
} from '../services/storage';

// ── Types ───────────────────────────────────────────────────────────

interface ChatContextValue {
  /** Whether the initial load has completed. Once true, stays true forever. */
  isReady: boolean;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  apiKey: string | null;
  setApiKey: React.Dispatch<React.SetStateAction<string | null>>;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  conversationSummary: string | null;
  setConversationSummary: React.Dispatch<React.SetStateAction<string | null>>;
  /** Persist the conversation summary to storage. */
  persistSummary: (summary: string) => void;
  /** Refresh profile and API key (call on focus or day change). */
  refreshProfileAndKey: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);

  // Load initial state once on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadMessages(),
      getApiKey(),
      loadUserProfile(),
      loadConversationSummary(),
    ]).then(([savedMessages, storedKey, storedProfile, storedSummary]) => {
      if (cancelled) return;
      setMessages(savedMessages);
      setApiKey(storedKey);
      setProfile(storedProfile);
      setConversationSummary(storedSummary);
      setIsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist messages whenever they change (debounced by React batching)
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Skip the initial empty → loaded transition
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const persistSummary = useCallback((summary: string) => {
    setConversationSummary(summary);
    saveConversationSummary(summary);
  }, []);

  const refreshProfileAndKey = useCallback(async () => {
    const [key, p] = await Promise.all([getApiKey(), loadUserProfile()]);
    setApiKey(key);
    setProfile(p);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        isReady,
        messages,
        setMessages,
        apiKey,
        setApiKey,
        profile,
        setProfile,
        conversationSummary,
        setConversationSummary,
        persistSummary,
        refreshProfileAndKey,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return ctx;
}
