import { ipcMain, BrowserWindow } from 'electron';
import { getSettings, saveSettings } from '../services/storage';
import { registerGameHandlers } from './gameHandlers';
import type { Settings } from '@shared/types';

export function registerIpcHandlers(mainWindow?: BrowserWindow): void {
  // Register game handlers if window provided
  if (mainWindow) {
    registerGameHandlers(mainWindow);
  }
  // Settings handlers
  ipcMain.handle('settings:get', async () => {
    return await getSettings();
  });

  ipcMain.handle('settings:save', async (_, settings: Settings) => {
    await saveSettings(settings);
    return true;
  });

  // LLM test handler
  ipcMain.handle('llm:testConnection', async (_, provider: string, apiKey: string) => {
    // Simple test to verify API key works
    try {
      switch (provider) {
        case 'openai':
          const { OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey });
          await openai.models.list();
          break;
        case 'anthropic':
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey });
          // Make a minimal request to test
          await anthropic.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          });
          break;
        case 'google':
          const { GoogleGenAI } = await import('@google/genai');
          const genAI = new GoogleGenAI({ apiKey });
          await genAI.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: 'Hi'
          });
          break;
        case 'deepseek':
          const { OpenAI: DeepSeekOpenAI } = await import('openai');
          const deepseek = new DeepSeekOpenAI({
            apiKey,
            baseURL: 'https://api.deepseek.com'
          });
          await deepseek.models.list();
          break;
        default:
          throw new Error('Unknown provider');
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
