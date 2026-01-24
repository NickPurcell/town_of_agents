import { create } from 'zustand';

type Screen = 'welcome' | 'gameSetup' | 'chat' | 'agentChat' | 'settings';

interface UIState {
  currentScreen: Screen;
  sideChatAgentId: string | null;

  setScreen: (screen: Screen) => void;
  openSideChat: (agentId: string) => void;
  closeSideChat: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentScreen: 'welcome',
  sideChatAgentId: null,

  setScreen: (screen: Screen) => {
    set((state) => ({
      currentScreen: screen,
      sideChatAgentId: screen === 'agentChat' ? state.sideChatAgentId : null,
    }));
  },

  openSideChat: (agentId: string) => {
    set({ currentScreen: 'agentChat', sideChatAgentId: agentId });
  },

  closeSideChat: () => {
    set({ currentScreen: 'chat', sideChatAgentId: null });
  }
}));
