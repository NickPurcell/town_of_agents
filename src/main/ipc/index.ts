import { ipcMain, BrowserWindow } from 'electron';
import {
  getSettings,
  saveSettings,
  getChatIndex,
  getChat,
  saveChat,
  deleteChat
} from '../services/storage';
import { ChatController } from '../services/chatController';
import { registerGameHandlers } from './gameHandlers';
import type { Chat, Settings } from '@shared/types';

const chatController = new ChatController();

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

  // Chat handlers
  ipcMain.handle('chat:list', async () => {
    return await getChatIndex();
  });

  ipcMain.handle('chat:get', async (_, chatId: string) => {
    return await getChat(chatId);
  });

  ipcMain.handle('chat:create', async (_, chat: Chat) => {
    await saveChat(chat);
    return chat;
  });

  ipcMain.handle('chat:update', async (_, chat: Chat) => {
    await saveChat(chat);
    return chat;
  });

  ipcMain.handle('chat:delete', async (_, chatId: string) => {
    await chatController.stopChat(chatId);
    await deleteChat(chatId);
    return true;
  });

  // Chat control handlers
  ipcMain.handle('chat:start', async (_, chatId: string) => {
    const chat = await getChat(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }
    const settings = await getSettings();
    await chatController.startChat(chat, settings);
    return true;
  });

  ipcMain.handle('chat:stop', async (_, chatId: string) => {
    await chatController.stopChat(chatId);
    return true;
  });

  ipcMain.handle('chat:sendUserMessage', async (_, chatId: string, content: string) => {
    await chatController.sendUserMessage(chatId, content);
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
        default:
          throw new Error('Unknown provider');
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
