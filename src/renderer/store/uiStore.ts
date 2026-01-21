import { create } from 'zustand';
import type { Agent } from '@shared/types';

type Screen = 'welcome' | 'newChat' | 'gameSetup' | 'chat' | 'agentChat' | 'settings';

interface UIState {
  currentScreen: Screen;
  selectedAgent: Agent | null;
  sideChatAgentId: string | null;
  contextMenuChat: string | null;
  contextMenuPosition: { x: number; y: number } | null;

  setScreen: (screen: Screen) => void;
  selectAgent: (agent: Agent | null) => void;
  openSideChat: (agentId: string) => void;
  closeSideChat: () => void;
  showContextMenu: (chatId: string, position: { x: number; y: number }) => void;
  hideContextMenu: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentScreen: 'welcome',
  selectedAgent: null,
  sideChatAgentId: null,
  contextMenuChat: null,
  contextMenuPosition: null,

  setScreen: (screen: Screen) => {
    set((state) => ({
      currentScreen: screen,
      selectedAgent: null,
      sideChatAgentId: screen === 'agentChat' ? state.sideChatAgentId : null,
    }));
  },

  selectAgent: (agent: Agent | null) => {
    set({ selectedAgent: agent });
  },

  openSideChat: (agentId: string) => {
    set({ currentScreen: 'agentChat', sideChatAgentId: agentId, selectedAgent: null });
  },

  closeSideChat: () => {
    set({ currentScreen: 'chat', sideChatAgentId: null, selectedAgent: null });
  },

  showContextMenu: (chatId: string, position: { x: number; y: number }) => {
    set({ contextMenuChat: chatId, contextMenuPosition: position });
  },

  hideContextMenu: () => {
    set({ contextMenuChat: null, contextMenuPosition: null });
  }
}));
