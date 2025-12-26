"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const typingModels = useChatStore((state) => state.typingModels);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Check if user is near bottom
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const threshold = 100; // pixels from bottom
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;

    setIsNearBottom(nearBottom);

    // Re-enable auto-scroll if user scrolls to bottom
    if (nearBottom && !autoScroll) {
      setAutoScroll(true);
    }
  }, [autoScroll]);

  // Disable auto-scroll when user scrolls up
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.deltaY < 0) {
      // Scrolling up
      setAutoScroll(false);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    container.addEventListener("wheel", handleWheel);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleScroll, handleWheel]);

  // Auto-scroll only if enabled and user is near bottom
  useEffect(() => {
    if (autoScroll && isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingModels, autoScroll, isNearBottom]);

  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 relative"
    >
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-muted text-center">
          <div>
            <p className="text-lg mb-2">Welcome to AI Group Chat</p>
            <p className="text-sm">
              Select models from the sidebar and start chatting!
            </p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </>
      )}
      <TypingIndicator />
      <div ref={bottomRef} />

      {/* Scroll to bottom button - shows when not at bottom */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-72 bg-primary text-white p-2 rounded-full shadow-lg hover:bg-primary/80 transition-colors z-10"
          title="Scroll to bottom"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
