import { Model, Message } from "@/types/chat";

interface ResponseDecision {
  shouldRespond: boolean;
  delay: number;
  priority: number;
}

export class ConversationEngine {
  private cooldowns: Map<string, number> = new Map();
  private responseQueue: Array<{ modelId: string; priority: number }> = [];
  private pendingModels: Set<string> = new Set(); // Track models waiting to respond
  private streamingModels: Set<string> = new Set(); // Track models currently streaming
  private maxConcurrent = 1; // Only one model responds at a time - queue the rest
  private currentlyResponding = 0;
  private onTriggerResponse?: (modelId: string) => void;
  private messageCountSinceResponse: Map<string, number> = new Map(); // Track silence
  private isPausedFn?: () => boolean;

  setResponseHandler(handler: (modelId: string) => void) {
    this.onTriggerResponse = handler;
  }

  setPauseChecker(fn: () => boolean) {
    this.isPausedFn = fn;
  }

  isPaused(): boolean {
    return this.isPausedFn?.() ?? false;
  }

  analyzeForResponse(
    model: Model,
    messages: Message[],
    latestMessage: Message,
    activeModels: Model[]
  ): ResponseDecision {
    // Don't respond to own messages or system messages
    if (latestMessage.modelId === model.id || latestMessage.modelId === "system") {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // ALWAYS respond - models continue dialog indefinitely until user stops
    let priority = 50;
    let shouldRespond = true;

    // Track how many messages since this model responded
    const silenceCount = this.messageCountSinceResponse.get(model.id) || 0;
    this.messageCountSinceResponse.set(model.id, silenceCount + 1);

    // Highest priority: @mentioned - BYPASSES COOLDOWN
    const mentionPattern = new RegExp(`@${model.shortName.toLowerCase()}\\b`, "i");
    const isMentioned = mentionPattern.test(latestMessage.content);

    if (isMentioned) {
      priority = 100;
    }

    // Check cooldown (8 seconds) - but @mentions bypass this
    // This gives time to read the previous message
    const lastResponse = this.cooldowns.get(model.id) || 0;
    const isOnCooldown = Date.now() - lastResponse < 8000;

    if (isOnCooldown && !isMentioned) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // High priority: User message
    if (latestMessage.role === "user") {
      priority = Math.max(priority, 80);
    }

    // High priority: Question (drives dialogue)
    if (latestMessage.content.includes("?")) {
      priority = Math.max(priority, 70);
    }

    // Higher priority if model has been quiet
    if (silenceCount >= 2) {
      priority = Math.max(priority, 60);
    }

    // Calculate delay - quick initial response, queue handles pauses between
    const modelIndex = activeModels.findIndex(m => m.id === model.id);

    // Base delay 2-3 seconds (quick first reaction, staggered slightly)
    const baseDelay = 2000 + (modelIndex * 500);

    // Small random variation
    const randomDelay = Math.random() * 1000;

    // Thinking models get a bit more time to "think" before responding
    const isThinkingModel = model.id.includes("opus") ||
                            model.id.includes("gpt-5") ||
                            model.id.includes("kimi");
    const thinkingBonus = isThinkingModel ? 2000 : 0;

    const delay = baseDelay + randomDelay + thinkingBonus;

    return { shouldRespond, delay, priority };
  }

  // Force queue a response - bypasses cooldown (for retries)
  forceQueueResponse(modelId: string, delay: number, priority: number): void {
    // Clear cooldown for this model
    this.cooldowns.delete(modelId);
    // Remove from any existing state
    this.pendingModels.delete(modelId);
    // Remove from queue if present
    this.responseQueue = this.responseQueue.filter(item => item.modelId !== modelId);
    // Now queue normally
    this.queueResponse(modelId, delay, priority);
  }

  queueResponse(modelId: string, delay: number, priority: number): void {
    // Don't queue if already queued, pending, in queue, or currently streaming
    if (this.pendingModels.has(modelId) ||
        this.streamingModels.has(modelId) ||
        this.responseQueue.some(item => item.modelId === modelId)) {
      return;
    }
    this.pendingModels.add(modelId);

    setTimeout(() => {
      // Double-check still pending (might have been cleared by stop)
      if (!this.pendingModels.has(modelId)) {
        return;
      }

      // Check if paused - wait and check again (don't remove from pending)
      if (this.isPaused()) {
        setTimeout(() => {
          if (this.pendingModels.has(modelId) && !this.isPaused()) {
            this.tryTrigger(modelId, priority);
          } else if (this.pendingModels.has(modelId)) {
            // Still paused, check again later
            this.queueResponse(modelId, 500, priority);
          }
        }, 500);
        this.pendingModels.delete(modelId); // Remove so re-queue works
        return;
      }

      this.tryTrigger(modelId, priority);
    }, delay);
  }

  private tryTrigger(modelId: string, priority: number): void {
    // Don't trigger if model is already streaming
    if (this.streamingModels.has(modelId)) {
      this.pendingModels.delete(modelId);
      return;
    }

    // Remove from pending - it's either triggering or going to queue
    this.pendingModels.delete(modelId);

    // Extra safety: don't trigger if ANY model is streaming
    if (this.streamingModels.size > 0) {
      // Add to queue instead
      if (!this.responseQueue.some(item => item.modelId === modelId)) {
        this.responseQueue.push({ modelId, priority });
      }
      return;
    }

    if (this.currentlyResponding < this.maxConcurrent) {
      this.triggerResponse(modelId);
    } else {
      // Check if already in queue
      if (this.responseQueue.some(item => item.modelId === modelId)) {
        return;
      }
      // Insert in priority order
      const insertIndex = this.responseQueue.findIndex(
        (item) => item.priority < priority
      );
      if (insertIndex === -1) {
        this.responseQueue.push({ modelId, priority });
      } else {
        this.responseQueue.splice(insertIndex, 0, { modelId, priority });
      }
    }
  }

  completeResponse(modelId: string): void {
    this.cooldowns.set(modelId, Date.now());
    this.pendingModels.delete(modelId);
    this.streamingModels.delete(modelId);
    this.messageCountSinceResponse.set(modelId, 0); // Reset silence counter

    // Trigger next in queue if not paused - with delay for reading
    if (this.responseQueue.length > 0 && !this.isPaused()) {
      const next = this.responseQueue.shift()!;
      // Mark as pending so it won't be re-queued during the wait
      this.pendingModels.add(next.modelId);
      // Keep currentlyResponding at 1 during the pause (blocks new triggers)
      // Add 8 second pause between responses for reading
      setTimeout(() => {
        this.pendingModels.delete(next.modelId);
        if (!this.isPaused() && !this.streamingModels.has(next.modelId)) {
          // Now we can properly trigger - currentlyResponding stays at 1
          this.streamingModels.add(next.modelId);
          this.onTriggerResponse?.(next.modelId);
        } else {
          // Can't trigger, decrement and try next
          this.currentlyResponding--;
          if (!this.isPaused() && this.responseQueue.length > 0) {
            const nextNext = this.responseQueue.shift()!;
            this.triggerResponse(nextNext.modelId);
          }
        }
      }, 8000); // 8 seconds to read previous message
    } else {
      // No more in queue, decrement
      this.currentlyResponding--;
    }
  }

  private triggerResponse(modelId: string): void {
    this.currentlyResponding++;
    this.streamingModels.add(modelId);
    this.onTriggerResponse?.(modelId);
  }

  isOnCooldown(modelId: string): boolean {
    const lastResponse = this.cooldowns.get(modelId) || 0;
    return Date.now() - lastResponse < 10000;
  }

  reset(): void {
    this.cooldowns.clear();
    this.responseQueue = [];
    this.pendingModels.clear();
    this.streamingModels.clear();
    this.currentlyResponding = 0;
    this.messageCountSinceResponse.clear();
  }
}

export function buildSystemPrompt(model: Model, activeModels: Model[]): string {
  const otherModels = activeModels
    .filter((m) => m.id !== model.id)
    .map((m) => m.shortName);

  const othersText =
    otherModels.length > 0
      ? `The other AI participants are: ${otherModels.join(", ")}.`
      : "You are the only AI in this chat.";

  return `You are ${model.name}, participating in an AI group discussion${otherModels.length > 0 ? " with other AI models" : ""}. A human (User) may join at any time but is NOT required - continue the discussion without waiting for human input.

${othersText}

Rules:
- ALWAYS respond in the same language as the conversation (Russian, English, etc.)
- This is an analytical discussion for exploring ideas - engage deeply with the topic
- Keep responses focused (2-4 sentences usually, expand when analyzing complex points)
- You can address others using @mentions (e.g., @${otherModels[0] || "User"})
- DO NOT wait for or ask for human input - continue the discussion with other AI models
- DO NOT ask "what do you think?" to @User or @Human - they will join when they want
- Build on others' points, disagree, ask follow-up questions to other AI models
- If directly addressed with @${model.shortName}, you must respond
- Be yourself - show personality and engage naturally with the topic`;
}

export function buildContextWindow(
  messages: Message[],
  windowSize: number,
  model: Model
): { role: "user" | "assistant" | "system"; content: string }[] {
  const recentMessages = messages.slice(-windowSize);

  return recentMessages.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content:
      msg.modelId && msg.modelId !== model.id
        ? `[${msg.modelName}]: ${msg.content}`
        : msg.content,
  }));
}

export const conversationEngine = new ConversationEngine();
