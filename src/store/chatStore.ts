import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { ChatState, SavedConversation } from "@/types/chat";
import { availableModels as defaultModels } from "@/lib/models";

const STORAGE_KEY = "ai-groupchat-conversations";

function saveToLocalStorage(conversations: SavedConversation[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }
}

function loadFromLocalStorage(): SavedConversation[] {
  if (typeof window !== "undefined") {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    }
  }
  return [];
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  activeModels: [],
  availableModels: defaultModels,
  typingModels: [],
  contextWindowSize: 20,
  savedConversations: [],
  currentConversationId: null,
  isPaused: false,

  addMessage: (message) => {
    const id = uuidv4();
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, id, timestamp: Date.now() },
      ],
    }));
    return id;
  },

  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    })),

  completeMessage: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: false } : m
      ),
    })),

  setTyping: (modelId, modelName, isTyping) =>
    set((state) => ({
      typingModels: isTyping
        ? [...state.typingModels.filter((t) => t.modelId !== modelId), { modelId, modelName }]
        : state.typingModels.filter((t) => t.modelId !== modelId),
    })),

  toggleModel: (modelId) => {
    const state = get();
    const model = state.availableModels.find((m) => m.id === modelId);
    if (!model) return;

    const isCurrentlyActive = state.activeModels.some((m) => m.id === modelId);

    if (isCurrentlyActive) {
      // Model leaves chat - don't interrupt, just remove from active
      // Add system message so other models know
      const leaveMessage = {
        id: uuidv4(),
        role: "assistant" as const,
        content: `[${model.shortName} покинул чат]`,
        modelId: "system",
        modelName: "System",
        timestamp: Date.now(),
        isStreaming: false,
      };
      set((s) => ({
        activeModels: s.activeModels.filter((m) => m.id !== modelId),
        messages: [...s.messages, leaveMessage],
      }));
    } else {
      // Model joins chat
      const joinMessage = {
        id: uuidv4(),
        role: "assistant" as const,
        content: `[${model.shortName} присоединился к чату]`,
        modelId: "system",
        modelName: "System",
        timestamp: Date.now(),
        isStreaming: false,
      };
      set((s) => ({
        activeModels: [...s.activeModels, { ...model, isActive: true }],
        messages: s.messages.length > 0 ? [...s.messages, joinMessage] : s.messages,
      }));
    }
  },

  setContextWindowSize: (size) => set({ contextWindowSize: size }),

  clearChat: () => set({ messages: [], typingModels: [], currentConversationId: null }),

  initializeModels: (models) => set({ availableModels: models }),

  saveConversation: (name?) => {
    const state = get();
    if (state.messages.length === 0) return "";

    const id = state.currentConversationId || uuidv4();
    const now = Date.now();

    const defaultName = name ||
      state.messages[0]?.content.slice(0, 50) ||
      `Chat ${new Date().toLocaleDateString()}`;

    const existingIndex = state.savedConversations.findIndex(c => c.id === id);

    const conversation: SavedConversation = {
      id,
      name: existingIndex >= 0 ? state.savedConversations[existingIndex].name : defaultName,
      messages: state.messages,
      activeModels: state.activeModels,
      createdAt: existingIndex >= 0 ? state.savedConversations[existingIndex].createdAt : now,
      updatedAt: now,
    };

    let newConversations: SavedConversation[];
    if (existingIndex >= 0) {
      newConversations = [...state.savedConversations];
      newConversations[existingIndex] = conversation;
    } else {
      newConversations = [conversation, ...state.savedConversations];
    }

    saveToLocalStorage(newConversations);
    set({ savedConversations: newConversations, currentConversationId: id });
    return id;
  },

  loadConversation: (id) => {
    const state = get();
    const conversation = state.savedConversations.find(c => c.id === id);
    if (conversation) {
      set({
        messages: conversation.messages,
        activeModels: conversation.activeModels,
        currentConversationId: id,
        typingModels: [],
        isPaused: true,
      });
    }
  },

  deleteConversation: (id) => {
    const state = get();
    const newConversations = state.savedConversations.filter(c => c.id !== id);
    saveToLocalStorage(newConversations);
    set({
      savedConversations: newConversations,
      currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
    });
  },

  renameConversation: (id, name) => {
    const state = get();
    const newConversations = state.savedConversations.map(c =>
      c.id === id ? { ...c, name, updatedAt: Date.now() } : c
    );
    saveToLocalStorage(newConversations);
    set({ savedConversations: newConversations });
  },

  loadSavedConversations: () => {
    const conversations = loadFromLocalStorage();
    set({ savedConversations: conversations });
  },

  newConversation: () => {
    set({
      messages: [],
      typingModels: [],
      currentConversationId: null,
    });
  },

  togglePause: () => {
    const state = get();
    const newPaused = !state.isPaused;
    set({ isPaused: newPaused });

    // Auto-save when pausing
    if (newPaused && state.messages.length > 0) {
      get().saveConversation();
    }
  },
}));
