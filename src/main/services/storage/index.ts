import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import type { Chat, Settings, ChatIndexEntry } from '@shared/types';

const DATA_DIR = join(app.getPath('userData'), 'data');
const CHATS_DIR = join(DATA_DIR, 'chats');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
const CHAT_INDEX_FILE = join(DATA_DIR, 'chatIndex.json');

// Initialize storage directories
export async function initializeStorage(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CHATS_DIR, { recursive: true });

  // Create default settings if not exists
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await saveSettings({
      apiKeys: {
        openai: '',
        anthropic: '',
        google: ''
      }
    });
  }

  // Create default chat index if not exists
  try {
    await fs.access(CHAT_INDEX_FILE);
  } catch {
    await saveChatIndex([]);
  }
}

// Settings operations
export async function getSettings(): Promise<Settings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      apiKeys: {
        openai: '',
        anthropic: '',
        google: ''
      }
    };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Chat index operations
export async function getChatIndex(): Promise<ChatIndexEntry[]> {
  try {
    const data = await fs.readFile(CHAT_INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveChatIndex(index: ChatIndexEntry[]): Promise<void> {
  await fs.writeFile(CHAT_INDEX_FILE, JSON.stringify(index, null, 2));
}

// Chat operations
export async function getChat(chatId: string): Promise<Chat | null> {
  try {
    const filePath = join(CHATS_DIR, `${chatId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveChat(chat: Chat): Promise<void> {
  const filePath = join(CHATS_DIR, `${chat.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(chat, null, 2));

  // Update index
  const index = await getChatIndex();
  const existingIndex = index.findIndex(entry => entry.id === chat.id);
  const entry: ChatIndexEntry = {
    id: chat.id,
    name: chat.name,
    isActive: chat.isActive,
    agentCount: chat.agents.length,
    messageCount: chat.messages.length,
    updatedAt: chat.updatedAt
  };

  if (existingIndex >= 0) {
    index[existingIndex] = entry;
  } else {
    index.push(entry);
  }

  await saveChatIndex(index);
}

export async function deleteChat(chatId: string): Promise<void> {
  const filePath = join(CHATS_DIR, `${chatId}.json`);

  try {
    await fs.unlink(filePath);
  } catch {
    // File may not exist
  }

  // Update index
  const index = await getChatIndex();
  const newIndex = index.filter(entry => entry.id !== chatId);
  await saveChatIndex(newIndex);
}

export async function getAllChats(): Promise<Chat[]> {
  const index = await getChatIndex();
  const chats: Chat[] = [];

  for (const entry of index) {
    const chat = await getChat(entry.id);
    if (chat) {
      chats.push(chat);
    }
  }

  return chats;
}
