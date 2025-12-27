"use client";

import { useEffect, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import {
  conversationEngine,
  buildSystemPrompt,
  buildContextWindow,
} from "@/lib/conversationEngine";
import { streamModelResponse, stopAllStreams } from "@/lib/streamHandler";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { ActiveModels } from "./ActiveModels";
import { SavedConversations } from "./SavedConversations";
import { Message } from "@/types/chat";

export function ChatContainer() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const completeMessage = useChatStore((state) => state.completeMessage);
  const setTyping = useChatStore((state) => state.setTyping);
  const activeModels = useChatStore((state) => state.activeModels);
  const typingModels = useChatStore((state) => state.typingModels);
  const contextWindowSize = useChatStore((state) => state.contextWindowSize);
  const clearChat = useChatStore((state) => state.clearChat);
  const messages = useChatStore((state) => state.messages);
  const saveConversation = useChatStore((state) => state.saveConversation);
  const newConversation = useChatStore((state) => state.newConversation);
  const isPaused = useChatStore((state) => state.isPaused);
  const togglePause = useChatStore((state) => state.togglePause);

  // Stop dialog completely - save and reset
  const handleStop = useCallback(() => {
    stopAllStreams();
    conversationEngine.reset();

    const state = useChatStore.getState();
    state.typingModels.forEach((t) => setTyping(t.modelId, t.modelName, false));
    state.messages.forEach((m) => {
      if (m.isStreaming) {
        completeMessage(m.id);
      }
    });

    // Save and start new conversation
    if (state.messages.length > 0) {
      saveConversation();
    }
    newConversation();
  }, [setTyping, completeMessage, saveConversation, newConversation]);

  const handleDownloadCurrent = () => {
    if (messages.length === 0) return;

    const state = useChatStore.getState();
    const savedChat = state.savedConversations.find(
      (c) => c.id === state.currentConversationId
    );

    // Get chat name from saved chat or first message
    const chatName =
      savedChat?.name ||
      messages[0]?.content.slice(0, 50) ||
      `Chat ${new Date().toLocaleDateString()}`;

    const content = messages
      .map((m) => {
        const sender = m.role === "user" ? "User" : m.modelName || "Assistant";
        return `[${sender}]: ${m.content}`;
      })
      .join("\n\n");

    // Clean filename - keep letters (including cyrillic), numbers, spaces
    const cleanName = chatName
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .slice(0, 50) || "chat";

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };


  // Handle model response with retry logic
  const triggerModelResponse = useCallback(
    async (modelId: string, retryCount = 0) => {
      const state = useChatStore.getState();
      const model = state.activeModels.find((m) => m.id === modelId);
      if (!model) {
        conversationEngine.completeResponse(modelId);
        return;
      }

      setTyping(modelId, model.name, true);

      // Build messages for API
      const systemPrompt = buildSystemPrompt(model, state.activeModels);
      const contextMessages = buildContextWindow(
        state.messages,
        contextWindowSize,
        model
      );

      const apiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...contextMessages,
      ];

      // Create streaming message
      const messageId = addMessage({
        role: "assistant",
        content: "",
        modelId: model.id,
        modelName: model.name,
        isStreaming: true,
      });

      setTyping(modelId, model.name, false);

      let content = "";
      let displayedContent = "";
      let hasRealContent = false;
      let tokenQueue: string[] = [];
      let isProcessingQueue = false;

      // Process token queue with typing delay
      const processQueue = () => {
        if (tokenQueue.length === 0) {
          isProcessingQueue = false;
          return;
        }
        isProcessingQueue = true;
        const char = tokenQueue.shift()!;
        displayedContent += char;
        updateMessage(messageId, displayedContent);
        // 30ms per character = readable typing speed
        setTimeout(processQueue, 30);
      };

      await streamModelResponse(modelId, apiMessages, {
        onToken: (token) => {
          content += token;
          // Check if it's real content (not error placeholder)
          const isErrorToken = token.startsWith("[") &&
            (token.includes("не ответила") || token.includes("Таймаут") || token.includes("Ошибка"));
          if (!isErrorToken) {
            hasRealContent = true;
          }
          // Add to queue character by character
          for (const char of token) {
            tokenQueue.push(char);
          }
          if (!isProcessingQueue) {
            processQueue();
          }
        },
        onComplete: () => {
          // Wait for typing queue to finish before completing
          const waitForQueue = () => {
            if (tokenQueue.length > 0 || isProcessingQueue) {
              setTimeout(waitForQueue, 100);
              return;
            }

            // Update with full content in case queue was interrupted
            updateMessage(messageId, content);
            completeMessage(messageId);
            conversationEngine.completeResponse(modelId);

            // If response was empty/error and we haven't retried too many times, retry
            if (!hasRealContent && retryCount < 2) {
              console.log(`[Retry] Model ${model.shortName} failed, retrying (attempt ${retryCount + 1})`);
              setTimeout(() => {
                conversationEngine.forceQueueResponse(modelId, 0, 90);
              }, 2000);
            }

            // After response, check if other models should respond
            const latestState = useChatStore.getState();
            const latestMessage = latestState.messages.find(
              (m) => m.id === messageId
            );
            if (latestMessage) {
              processModelResponses(latestMessage);
            }
          };
          waitForQueue();
        },
        onError: (error) => {
          console.error("Stream error:", error);
          updateMessage(messageId, content || "[Ошибка: не удалось получить ответ]");
          completeMessage(messageId);
          conversationEngine.completeResponse(modelId);

          // Retry on error
          if (retryCount < 2) {
            console.log(`[Retry] Model ${model.shortName} error, retrying (attempt ${retryCount + 1})`);
            setTimeout(() => {
              conversationEngine.forceQueueResponse(modelId, 0, 90);
            }, 2000);
          }
        },
      });
    },
    [addMessage, updateMessage, completeMessage, setTyping, contextWindowSize]
  );

  // Set up conversation engine handler
  useEffect(() => {
    conversationEngine.setResponseHandler(triggerModelResponse);
    conversationEngine.setPauseChecker(() => useChatStore.getState().isPaused);
  }, [triggerModelResponse]);

  // Get currentConversationId for tracking conversation changes
  const currentConversationId = useChatStore((state) => state.currentConversationId);

  // Reset engine when conversation changes (prevents auto-triggering on load)
  useEffect(() => {
    conversationEngine.reset();
  }, [currentConversationId]);

  // When paused, STOP all current streams immediately
  useEffect(() => {
    if (isPaused) {
      stopAllStreams();
      conversationEngine.reset();
      // Complete any streaming messages
      const state = useChatStore.getState();
      state.typingModels.forEach((t) => setTyping(t.modelId, t.modelName, false));
      state.messages.forEach((m) => {
        if (m.isStreaming) {
          completeMessage(m.id);
        }
      });
    }
  }, [isPaused, setTyping, completeMessage]);

  // Auto-save every 30 seconds if there are messages
  useEffect(() => {
    if (messages.length === 0) return;

    const interval = setInterval(() => {
      const state = useChatStore.getState();
      if (state.messages.length > 0) {
        state.saveConversation();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [messages.length > 0]);

  // Process which models should respond
  const processModelResponses = useCallback(
    (latestMessage: Message) => {
      const state = useChatStore.getState();

      for (const model of state.activeModels) {
        const decision = conversationEngine.analyzeForResponse(
          model,
          state.messages,
          latestMessage,
          state.activeModels
        );

        if (decision.shouldRespond) {
          conversationEngine.queueResponse(model.id, decision.delay, decision.priority);
        }
      }
    },
    []
  );

  // Handle resume without message (continue dialog)
  const handleResume = useCallback(() => {
    const state = useChatStore.getState();
    if (state.messages.length > 0 && state.activeModels.length > 0) {
      // Find last non-system message to trigger response
      const lastNonSystemMessage = [...state.messages]
        .reverse()
        .find(m => m.modelId !== "system" && !m.isStreaming);

      if (lastNonSystemMessage) {
        processModelResponses(lastNonSystemMessage);
      }
    }
  }, [processModelResponses]);

  // Handle user message
  const handleSendMessage = useCallback(
    (content: string) => {
      if (activeModels.length === 0) {
        return;
      }

      const messageId = addMessage({
        role: "user",
        content,
      });

      // Get the message we just added
      setTimeout(() => {
        const state = useChatStore.getState();
        const userMessage = state.messages.find((m) => m.id === messageId);
        if (userMessage) {
          processModelResponses(userMessage);
        }
      }, 0);
    },
    [addMessage, activeModels, processModelResponses]
  );

  return (
    <div className="h-screen flex">
      {/* Left Sidebar - Models */}
      <div className="w-64 bg-surface border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold text-primary">AI Group Chat</h1>
        </div>

        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Active Models
          </h2>
          <ActiveModels />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ModelSelector />
        </div>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                saveConversation();
              }}
              disabled={messages.length === 0}
              className="flex-1 px-3 py-2 text-sm bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleDownloadCurrent}
              disabled={messages.length === 0}
              className="px-3 py-2 text-sm text-muted hover:text-foreground hover:bg-surface-light disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              title="Download"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => {
              newConversation();
              conversationEngine.reset();
            }}
            className="w-full px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-surface-light rounded-lg transition-colors"
          >
            New Chat
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background">
        <MessageList />
        <ChatInput
          onSend={handleSendMessage}
          onStop={handleStop}
          onResume={handleResume}
          disabled={activeModels.length === 0}
        />
      </div>

      {/* Right Sidebar - Saved Conversations */}
      <div className="w-64 bg-surface border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Saved Chats</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SavedConversations />
        </div>
      </div>
    </div>
  );
}
