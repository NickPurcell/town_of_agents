import { create } from 'zustand';
import type { Chat, ChatIndexEntry, Message } from '@shared/types';

interface ThinkingAgent {
  chatId: string;
  agentId: string;
  agentName: string;
  startedAt: number;
}

interface ChatState {
  chatIndex: ChatIndexEntry[];
  currentChat: Chat | null;
  isLoading: boolean;
  error: string | null;
  thinkingAgent: ThinkingAgent | null;

  // Actions
  loadChatIndex: () => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
  createChat: (chat: Chat) => Promise<Chat>;
  updateChat: (chat: Chat) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  startChat: (chatId: string) => Promise<void>;
  stopChat: (chatId: string) => Promise<void>;
  sendUserMessage: (content: string) => Promise<void>;
  clearCurrentChat: () => void;

  // Message handling
  addMessage: (chatId: string, message: Message) => void;
  updateChatStatus: (chatId: string, isActive: boolean) => void;
  setError: (error: string | null) => void;

  // Thinking state
  setThinkingAgent: (chatId: string, agentId: string, agentName: string) => void;
  clearThinkingAgent: (chatId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chatIndex: [],
  currentChat: null,
  isLoading: false,
  error: null,
  thinkingAgent: null,

  loadChatIndex: async () => {
    try {
      const index = await window.api.listChats();
      set({ chatIndex: index });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  loadChat: async (chatId: string) => {
    set({ isLoading: true, error: null });
    try {
      const chat = await window.api.getChat(chatId);
      set({ currentChat: chat, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  createChat: async (chat: Chat) => {
    try {
      const created = await window.api.createChat(chat);
      await get().loadChatIndex();
      return created;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  updateChat: async (chat: Chat) => {
    try {
      await window.api.updateChat(chat);
      await get().loadChatIndex();
      if (get().currentChat?.id === chat.id) {
        set({ currentChat: chat });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      await window.api.deleteChat(chatId);
      await get().loadChatIndex();
      if (get().currentChat?.id === chatId) {
        set({ currentChat: null });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  startChat: async (chatId: string) => {
    try {
      await window.api.startChat(chatId);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  stopChat: async (chatId: string) => {
    try {
      await window.api.stopChat(chatId);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  sendUserMessage: async (content: string) => {
    const { currentChat } = get();
    if (!currentChat) return;

    try {
      await window.api.sendUserMessage(currentChat.id, content);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  clearCurrentChat: () => {
    set({ currentChat: null });
  },

  addMessage: (chatId: string, message: Message) => {
    const { currentChat, thinkingAgent } = get();
    if (currentChat?.id !== chatId) return;

    const shouldClearThinking = Boolean(
      thinkingAgent &&
      thinkingAgent.chatId === chatId &&
      message.agentId &&
      thinkingAgent.agentId === message.agentId
    );

    set({
      currentChat: {
        ...currentChat,
        messages: [...currentChat.messages, message]
      },
      thinkingAgent: shouldClearThinking ? null : thinkingAgent
    });
  },

  updateChatStatus: (chatId: string, isActive: boolean) => {
    const { currentChat, chatIndex } = get();

    // Update index
    const newIndex = chatIndex.map(entry =>
      entry.id === chatId ? { ...entry, isActive } : entry
    );
    set({ chatIndex: newIndex });

    // Update current chat if it's the one being updated
    if (currentChat?.id === chatId) {
      set({ currentChat: { ...currentChat, isActive } });
    }
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setThinkingAgent: (chatId: string, agentId: string, agentName: string) => {
    set({ thinkingAgent: { chatId, agentId, agentName, startedAt: Date.now() } });
  },

  clearThinkingAgent: (chatId: string) => {
    const { thinkingAgent } = get();
    if (thinkingAgent?.chatId === chatId) {
      set({ thinkingAgent: null });
    }
  }
}));
