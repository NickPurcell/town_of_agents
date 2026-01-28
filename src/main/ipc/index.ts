import { ipcMain, BrowserWindow, app } from 'electron';
import { getSettings, saveSettings } from '../services/storage';
import { registerGameHandlers } from './gameHandlers';
import type { Settings } from '@shared/types';
import { join } from 'path';
import { readdir } from 'fs/promises';

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

  // Get available avatar files from the avatars directory
  ipcMain.handle('avatars:list', async () => {
    try {
      // In production, avatars are in the renderer output directory
      // In dev, they're in the assets folder
      const isDev = !app.isPackaged;
      const avatarsDir = isDev
        ? join(process.cwd(), 'assets', 'avatars')
        : join(__dirname, '../renderer/avatars');

      const files = await readdir(avatarsDir);
      // Filter for image files only
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];
      const avatars = files
        .filter(file => imageExtensions.some(ext => file.toLowerCase().endsWith(ext)))
        .filter(file => !file.startsWith('.')) // Exclude hidden files like .gitkeep
        .sort();

      return avatars;
    } catch (error) {
      console.error('Failed to read avatars directory:', error);
      // Return a default fallback
      return ['user.png'];
    }
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
        case 'xai':
          const { OpenAI: XAIOpenAI } = await import('openai');
          const xai = new XAIOpenAI({
            apiKey,
            baseURL: 'https://api.x.ai/v1'
          });
          await xai.models.list();
          break;
        case 'mistral':
          const { Mistral } = await import('@mistralai/mistralai');
          const mistral = new Mistral({ apiKey });
          await mistral.models.list();
          break;
        case 'openrouter':
          const { OpenAI: OpenRouterOpenAI } = await import('openai');
          const openrouter = new OpenRouterOpenAI({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1'
          });
          await openrouter.models.list();
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
