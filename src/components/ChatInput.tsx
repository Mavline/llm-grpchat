"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";

const DRAFTS_KEY = "ai-groupchat-drafts";

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
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

export function ChatInput({ onSend, onStop, disabled, isGenerating }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentConversationId = useChatStore((state) => state.currentConversationId);

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
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
      saveDraft(chatKey, "");
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
        {isGenerating ? (
          <button
            onClick={onStop}
            className="px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || disabled}
            className="px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
