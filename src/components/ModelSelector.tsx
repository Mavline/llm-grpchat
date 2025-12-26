"use client";

import { useChatStore } from "@/store/chatStore";

export function ModelSelector() {
  const availableModels = useChatStore((state) => state.availableModels);
  const activeModels = useChatStore((state) => state.activeModels);
  const toggleModel = useChatStore((state) => state.toggleModel);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Models
      </h3>
      {availableModels.map((model) => {
        const isActive = activeModels.some((m) => m.id === model.id);
        return (
          <div
            key={model.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-light/50 transition-all"
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: model.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{model.name}</div>
              <div className="text-xs text-muted truncate">@{model.shortName}</div>
            </div>
            <button
              onClick={() => toggleModel(model.id)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background ${
                isActive ? "focus:ring-primary" : "focus:ring-gray-500"
              }`}
              style={{
                backgroundColor: isActive ? model.color : "#374151",
              }}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  isActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
