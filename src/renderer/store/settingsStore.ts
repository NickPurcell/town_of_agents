import { create } from 'zustand';
import type { Settings, GameSettings, CustomModel } from '@shared/types';
import { DEFAULT_GAME_SETTINGS, DEFAULT_PERSONALITY, DEFAULT_MODELS } from '@shared/types';

interface SettingsState {
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  updateApiKey: (provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral' | 'openrouter', key: string) => void;
  updateGameSettings: (partial: Partial<GameSettings>) => void;
  updateDefaultPersonality: (personality: string) => void;
  addCustomModel: (model: CustomModel) => void;
  removeCustomModel: (id: string) => void;
  resetModelsToDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    apiKeys: {
      openai: '',
      anthropic: '',
      google: '',
      deepseek: '',
      xai: '',
      mistral: '',
      openrouter: ''
    },
    gameSettings: DEFAULT_GAME_SETTINGS,
    defaultPersonality: DEFAULT_PERSONALITY,
    customModels: [...DEFAULT_MODELS]
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
      // Ensure default personality has default
      if (!settings.defaultPersonality) {
        settings.defaultPersonality = DEFAULT_PERSONALITY;
      }
      // Initialize custom models with defaults if not set
      if (!settings.customModels || settings.customModels.length === 0) {
        settings.customModels = [...DEFAULT_MODELS];
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

  updateApiKey: (provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral' | 'openrouter', key: string) => {
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
  },

  updateDefaultPersonality: (personality: string) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        defaultPersonality: personality
      }
    });
  },

  addCustomModel: (model: CustomModel) => {
    const { settings } = get();
    const currentModels = settings.customModels || [];
    set({
      settings: {
        ...settings,
        customModels: [...currentModels, model]
      }
    });
  },

  removeCustomModel: (id: string) => {
    const { settings } = get();
    const currentModels = settings.customModels || [];
    set({
      settings: {
        ...settings,
        customModels: currentModels.filter(m => m.id !== id)
      }
    });
  },

  resetModelsToDefaults: () => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        customModels: [...DEFAULT_MODELS]
      }
    });
  }
}));
