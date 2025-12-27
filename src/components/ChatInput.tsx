"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";

const DRAFTS_KEY = "ai-groupchat-drafts";

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  onResume: () => void;  // Resume without sending message
  disabled?: boolean;
}

function getDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveDraft(chatId: string, text: string) {
  const drafts = getDrafts();
  if (text) {
    drafts[chatId] = text;
  } else {
    delete drafts[chatId];
  }
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function ChatInput({ onSend, onStop, onResume, disabled }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentConversationId = useChatStore((state) => state.currentConversationId);
  const isPaused = useChatStore((state) => state.isPaused);
  const setPaused = useChatStore((state) => state.togglePause);

  // Use "new" as key for new unsaved chats
  const chatKey = currentConversationId || "new";

  // Load draft when chat changes
  useEffect(() => {
    const drafts = getDrafts();
    setInput(drafts[chatKey] || "");
  }, [chatKey]);

  // Save draft on change
  useEffect(() => {
    saveDraft(chatKey, input);
  }, [input, chatKey]);

  // Auto-resize textarea (up to 300px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        300
      )}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    // If paused - resume (with or without text)
    if (isPaused) {
      setPaused(); // Resume
      if (input.trim() && !disabled) {
        onSend(input.trim());
        setInput("");
        saveDraft(chatKey, "");
      } else {
        // Resume without text - trigger models to continue
        onResume();
      }
      return;
    }
    // Normal send
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
      saveDraft(chatKey, "");
    }
  };

  const handlePause = () => {
    if (!isPaused) {
      setPaused(); // Only pause, not resume (SEND does resume)
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border p-4">
      <div className="flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (use @ModelName to mention)"
          disabled={disabled}
          rows={1}
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50 placeholder:text-muted"
        />
        {/* Stop - exit dialog */}
        <button
          onClick={onStop}
          className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          title="Stop & Save"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
        {/* Pause - only when running */}
        <button
          onClick={handlePause}
          disabled={isPaused}
          className="p-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Pause"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>
        {/* Send - also resumes if paused */}
        <button
          onClick={handleSubmit}
          disabled={!isPaused && (!input.trim() || disabled)}
          className={`p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isPaused
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "bg-primary hover:bg-primary-hover text-white"
          }`}
          title={isPaused ? (input.trim() ? "Send & Resume" : "Resume") : "Send"}
        >
          {isPaused && !input.trim() ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
