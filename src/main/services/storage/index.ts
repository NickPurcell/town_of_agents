import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import type { Settings } from '@shared/types';

const DATA_DIR = join(app.getPath('userData'), 'data');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

// Initialize storage directories
export async function initializeStorage(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Create default settings if not exists
  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await saveSettings({
      apiKeys: {
        openai: '',
        anthropic: '',
        google: '',
        deepseek: '',
        xai: '',
        mistral: '',
        openrouter: ''
      }
    });
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
        google: '',
        deepseek: '',
        xai: '',
        mistral: '',
        openrouter: ''
      }
    };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
