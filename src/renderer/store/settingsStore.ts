import { create } from 'zustand';
import type { Settings, GameSettings } from '@shared/types';
import { DEFAULT_GAME_SETTINGS } from '@shared/types';

interface SettingsState {
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  updateApiKey: (provider: 'openai' | 'anthropic' | 'google', key: string) => void;
  updateGameSettings: (partial: Partial<GameSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    apiKeys: {
      openai: '',
      anthropic: '',
      google: ''
    },
    gameSettings: DEFAULT_GAME_SETTINGS
  },
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await window.api.getSettings();
      // Ensure game settings have defaults
      if (!settings.gameSettings) {
        settings.gameSettings = DEFAULT_GAME_SETTINGS;
      }
      set({ settings, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  saveSettings: async (settings: Settings) => {
    try {
      await window.api.saveSettings(settings);
      set({ settings });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateApiKey: (provider: 'openai' | 'anthropic' | 'google', key: string) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        apiKeys: {
          ...settings.apiKeys,
          [provider]: key
        }
      }
    });
  },

  updateGameSettings: (partial: Partial<GameSettings>) => {
    const { settings } = get();
    const currentGameSettings = settings.gameSettings || DEFAULT_GAME_SETTINGS;
    set({
      settings: {
        ...settings,
        gameSettings: {
          ...currentGameSettings,
          ...partial
        }
      }
    });
  }
}));
