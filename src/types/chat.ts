export interface Model {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  color: string;
  isActive: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId?: string;
  modelName?: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface TypingState {
  modelId: string;
  modelName: string;
}

export interface SavedConversation {
  id: string;
  name: string;
  messages: Message[];
  activeModels: Model[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  messages: Message[];
  activeModels: Model[];
  availableModels: Model[];
  typingModels: TypingState[];
  contextWindowSize: number;
  savedConversations: SavedConversation[];
  currentConversationId: string | null;
  isPaused: boolean;

  addMessage: (message: Omit<Message, "id" | "timestamp">) => string;
  updateMessage: (id: string, content: string) => void;
  completeMessage: (id: string) => void;
  setTyping: (modelId: string, modelName: string, isTyping: boolean) => void;
  toggleModel: (modelId: string) => void;
  setContextWindowSize: (size: number) => void;
  clearChat: () => void;
  initializeModels: (models: Model[]) => void;

  saveConversation: (name?: string) => string;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, name: string) => void;
  loadSavedConversations: () => void;
  newConversation: () => void;
  togglePause: () => void;
}
