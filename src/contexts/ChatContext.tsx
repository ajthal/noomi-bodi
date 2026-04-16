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
  clearChatState,
  getLastClearedAt,
  SUMMARY_MAX_CHARS,
  MESSAGE_COUNT_AUTOCLEAR_THRESHOLD,
  AUTOCLEAR_INTERVAL_MS,
} from '../services/storage';
import { clearAiMemory } from '../services/profileService';
import { extractAndStoreMemory, type ChatMessage } from '../services/claude';

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
  /** True immediately after an auto-clear fires. ChatScreen uses this to show a one-time banner. */
  justClearedBanner: boolean;
  dismissClearedBanner: () => void;
  /**
   * User-initiated clear from Settings: extracts memory first, then wipes chat state.
   * Keeps persistent `profiles.ai_memory` intact.
   */
  manualClearChat: () => Promise<void>;
  /** "Forget everything" — clears chat state AND persistent memory. */
  forgetEverything: () => Promise<void>;
  /**
   * Called before a send (and on mount) so size-based auto-clear can fire without
   * waiting for next app launch. Safe no-op if thresholds aren't met.
   * Returns true if a clear actually happened — caller should treat message state
   * as empty from that point on, because the React state update is async and the
   * caller's closure over `messages` is now stale.
   */
  evaluateAutoClear: (opts?: { silent?: boolean }) => Promise<boolean>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ── Helpers ─────────────────────────────────────────────────────────

function shouldAutoClear(params: {
  messageCount: number;
  summaryLength: number;
  lastClearedAt: number | null;
}): boolean {
  const { messageCount, summaryLength, lastClearedAt } = params;
  if (messageCount > MESSAGE_COUNT_AUTOCLEAR_THRESHOLD) return true;
  if (summaryLength > SUMMARY_MAX_CHARS) return true;
  if (lastClearedAt != null && Date.now() - lastClearedAt > AUTOCLEAR_INTERVAL_MS) {
    // Only fire the time-based trigger when there's something to clear —
    // don't churn a fresh install that's been idle for a week.
    if (messageCount > 0 || summaryLength > 0) return true;
  }
  return false;
}

function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(m => ({
    role: m.role,
    content: m.text,
  }));
}

// ── Provider ────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);
  const [justClearedBanner, setJustClearedBanner] = useState(false);

  // Refs so async callbacks see the latest values without re-subscribing.
  const apiKeyRef = useRef<string | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const summaryRef = useRef<string | null>(null);
  const autoClearInFlightRef = useRef(false);

  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { summaryRef.current = conversationSummary; }, [conversationSummary]);

  // ── Auto-clear implementation ─────────────────────────────────────

  const performClear = useCallback(async (opts: { silent?: boolean; alsoClearMemory?: boolean } = {}) => {
    const currentApiKey = apiKeyRef.current;
    const currentMessages = messagesRef.current;
    const currentSummary = summaryRef.current;
    const currentProfile = profileRef.current;

    // Extract memory before clearing, but only if there's content to extract
    // AND we have an API key to do the distillation. If no key, still clear —
    // the user's memory simply won't update this cycle.
    if (
      !opts.alsoClearMemory &&
      currentApiKey &&
      (currentMessages.length > 0 || (currentSummary?.length ?? 0) > 0)
    ) {
      try {
        const newMemory = await extractAndStoreMemory({
          currentMemory: currentProfile?.aiMemory ?? '',
          summary: currentSummary,
          recentMessages: messagesToChatMessages(currentMessages),
          apiKey: currentApiKey,
        });
        if (currentProfile) {
          const updated: UserProfile = { ...currentProfile, aiMemory: newMemory };
          setProfile(updated);
          profileRef.current = updated;
        }
      } catch (err) {
        // extractAndStoreMemory already logs — we proceed with clear either way
        // so the stuck-summary cascade can't keep us bloated forever.
        console.warn('[ChatContext] Memory extraction failed; clearing anyway', err);
      }
    }

    // Clear on-device chat state
    await clearChatState();
    setMessages([]);
    messagesRef.current = [];
    setConversationSummary(null);
    summaryRef.current = null;

    // Optionally nuke persistent memory (Forget everything)
    if (opts.alsoClearMemory) {
      try {
        await clearAiMemory();
        if (currentProfile) {
          const updated: UserProfile = { ...currentProfile, aiMemory: '' };
          setProfile(updated);
          profileRef.current = updated;
        }
      } catch (err) {
        console.error('[ChatContext] Failed to clear AI memory', err);
      }
    }

    if (!opts.silent) setJustClearedBanner(true);
  }, []);

  const evaluateAutoClear = useCallback(async (opts: { silent?: boolean } = {}): Promise<boolean> => {
    if (autoClearInFlightRef.current) return false;
    const trigger = shouldAutoClear({
      messageCount: messagesRef.current.length,
      summaryLength: summaryRef.current?.length ?? 0,
      lastClearedAt: await getLastClearedAt(),
    });
    if (!trigger) return false;
    autoClearInFlightRef.current = true;
    try {
      await performClear({ silent: opts.silent });
      return true;
    } finally {
      autoClearInFlightRef.current = false;
    }
  }, [performClear]);

  // ── Initial load ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadMessages(),
      getApiKey(),
      loadUserProfile(),
      loadConversationSummary(),
      getLastClearedAt(),
    ]).then(([savedMessages, storedKey, storedProfile, storedSummary, lastClearedAt]) => {
      if (cancelled) return;
      setMessages(savedMessages);
      setApiKey(storedKey);
      setProfile(storedProfile);
      setConversationSummary(storedSummary);
      messagesRef.current = savedMessages;
      apiKeyRef.current = storedKey;
      profileRef.current = storedProfile;
      summaryRef.current = storedSummary;
      setIsReady(true);

      // Fire-and-forget auto-clear on mount — does not block UI render.
      const trigger = shouldAutoClear({
        messageCount: savedMessages.length,
        summaryLength: storedSummary?.length ?? 0,
        lastClearedAt,
      });
      if (trigger) {
        autoClearInFlightRef.current = true;
        performClear({ silent: false })
          .catch(err => console.error('[ChatContext] Auto-clear failed', err))
          .finally(() => { autoClearInFlightRef.current = false; });
      }
    });
    return () => { cancelled = true; };
  }, [performClear]);

  // Persist messages whenever they change (debounced by React batching).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const persistSummary = useCallback((summary: string) => {
    // Hard-cap defensively in case a caller slips by the one in summarizeDroppedMessages.
    const capped = summary.length > SUMMARY_MAX_CHARS ? summary.slice(-SUMMARY_MAX_CHARS) : summary;
    setConversationSummary(capped);
    summaryRef.current = capped;
    saveConversationSummary(capped);
  }, []);

  const refreshProfileAndKey = useCallback(async () => {
    const [key, p] = await Promise.all([getApiKey(), loadUserProfile()]);
    setApiKey(key);
    setProfile(p);
    apiKeyRef.current = key;
    profileRef.current = p;
  }, []);

  const manualClearChat = useCallback(async () => {
    await performClear({ silent: true, alsoClearMemory: false });
  }, [performClear]);

  const forgetEverything = useCallback(async () => {
    await performClear({ silent: true, alsoClearMemory: true });
  }, [performClear]);

  const dismissClearedBanner = useCallback(() => setJustClearedBanner(false), []);

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
        justClearedBanner,
        dismissClearedBanner,
        manualClearChat,
        forgetEverything,
        evaluateAutoClear,
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
