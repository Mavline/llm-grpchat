"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { SavedConversation } from "@/types/chat";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  conversationId: string | null;
}

export function SavedConversations() {
  const savedConversations = useChatStore((state) => state.savedConversations);
  const currentConversationId = useChatStore((state) => state.currentConversationId);
  const loadConversation = useChatStore((state) => state.loadConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const renameConversation = useChatStore((state) => state.renameConversation);
  const loadSavedConversations = useChatStore((state) => state.loadSavedConversations);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    conversationId: null,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSavedConversations();
  }, [loadSavedConversations]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      conversationId: id,
    });
  };

  const handleRename = () => {
    const conv = savedConversations.find((c) => c.id === contextMenu.conversationId);
    if (conv) {
      setEditingId(conv.id);
      setEditName(conv.name);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleDelete = () => {
    if (contextMenu.conversationId) {
      deleteConversation(contextMenu.conversationId);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleRenameSubmit = (id: string) => {
    if (editName.trim()) {
      renameConversation(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleDownload = (conv: SavedConversation) => {
    const content = conv.messages
      .map((m) => {
        const sender = m.role === "user" ? "User" : m.modelName || "Assistant";
        return `[${sender}]: ${m.content}`;
      })
      .join("\n\n");

    // Clean filename - keep letters (including cyrillic), numbers, spaces
    const cleanName = conv.name
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
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (savedConversations.length === 0) {
    return (
      <div className="text-center text-muted text-sm py-8">
        No saved conversations yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {savedConversations.map((conv) => (
        <div
          key={conv.id}
          onClick={() => loadConversation(conv.id)}
          onContextMenu={(e) => handleContextMenu(e, conv.id)}
          className={`px-3 py-2 rounded-lg cursor-pointer transition-colors ${
            currentConversationId === conv.id
              ? "bg-surface-light border border-border"
              : "hover:bg-surface-light/50"
          }`}
        >
          {editingId === conv.id ? (
            <input
              ref={editInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRenameSubmit(conv.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit(conv.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="w-full bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <>
              <div className="text-sm font-medium truncate">{conv.name}</div>
              <div className="text-xs text-muted flex items-center gap-2 mt-1">
                <span>{conv.messages.length} msgs</span>
                <span>•</span>
                <span>{formatDate(conv.updatedAt)}</span>
              </div>
            </>
          )}
        </div>
      ))}

      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="fixed bg-surface border border-border rounded-lg shadow-lg py-1 z-50 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={handleRename}
            className="w-full px-4 py-2 text-sm text-left hover:bg-surface-light transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => {
              const conv = savedConversations.find((c) => c.id === contextMenu.conversationId);
              if (conv) handleDownload(conv);
            }}
            className="w-full px-4 py-2 text-sm text-left hover:bg-surface-light transition-colors"
          >
            Download
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-4 py-2 text-sm text-left hover:bg-surface-light transition-colors text-red-400"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
