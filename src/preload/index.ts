import { contextBridge, ipcRenderer } from 'electron';
import type { Chat, Settings, ChatIndexEntry, Message, GameState, GameEvent, Phase, Faction, Role, SideChatMessage, LLMResponse } from '@shared/types';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
}

// Expose API to renderer
contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Settings): Promise<boolean> =>
    ipcRenderer.invoke('settings:save', settings),

  // Chat operations
  listChats: (): Promise<ChatIndexEntry[]> => ipcRenderer.invoke('chat:list'),
  getChat: (chatId: string): Promise<Chat | null> =>
    ipcRenderer.invoke('chat:get', chatId),
  createChat: (chat: Chat): Promise<Chat> =>
    ipcRenderer.invoke('chat:create', chat),
  updateChat: (chat: Chat): Promise<Chat> =>
    ipcRenderer.invoke('chat:update', chat),
  deleteChat: (chatId: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:delete', chatId),

  // Chat control
  startChat: (chatId: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:start', chatId),
  stopChat: (chatId: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:stop', chatId),
  sendUserMessage: (chatId: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:sendUserMessage', chatId, content),

  // LLM
  testConnection: (provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('llm:testConnection', provider, apiKey),

  // Event listeners
  onChatStarted: (callback: (data: { chatId: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { chatId: string }) => callback(data);
    ipcRenderer.on('chat:started', handler);
    return () => ipcRenderer.removeListener('chat:started', handler);
  },

  onChatStopped: (callback: (data: { chatId: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { chatId: string }) => callback(data);
    ipcRenderer.on('chat:stopped', handler);
    return () => ipcRenderer.removeListener('chat:stopped', handler);
  },

  onMessageAdded: (callback: (data: { chatId: string; message: Message }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { chatId: string; message: Message }) =>
      callback(data);
    ipcRenderer.on('chat:messageAdded', handler);
    return () => ipcRenderer.removeListener('chat:messageAdded', handler);
  },

  onChatError: (callback: (data: { chatId: string; error: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { chatId: string; error: string }) =>
      callback(data);
    ipcRenderer.on('chat:error', handler);
    return () => ipcRenderer.removeListener('chat:error', handler);
  },

  onAgentThinking: (callback: (data: { chatId: string; agentId: string; agentName: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { chatId: string; agentId: string; agentName: string }) =>
      callback(data);
    ipcRenderer.on('chat:agentThinking', handler);
    return () => ipcRenderer.removeListener('chat:agentThinking', handler);
  },

  onAgentThinkingDone: (callback: (data: { chatId: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { chatId: string }) => callback(data);
    ipcRenderer.on('chat:agentThinkingDone', handler);
    return () => ipcRenderer.removeListener('chat:agentThinkingDone', handler);
  },

  // Game operations
  gameStart: (agents: PendingAgent[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('game:start', agents),
  gameStop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('game:stop'),
  gamePause: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('game:pause'),
  gameResume: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('game:resume'),
  gameGetState: (): Promise<GameState | null> =>
    ipcRenderer.invoke('game:getState'),
  gameAskAgent: (agentId: string, messages: SideChatMessage[]): Promise<LLMResponse> =>
    ipcRenderer.invoke('game:askAgent', agentId, messages),

  // Game event listeners
  onGameEventAppended: (callback: (event: GameEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: GameEvent) => callback(event);
    ipcRenderer.on('game:eventAppended', handler);
    return () => ipcRenderer.removeListener('game:eventAppended', handler);
  },

  onGamePhaseChanged: (callback: (data: { phase: Phase; dayNumber: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { phase: Phase; dayNumber: number }) =>
      callback(data);
    ipcRenderer.on('game:phaseChanged', handler);
    return () => ipcRenderer.removeListener('game:phaseChanged', handler);
  },

  onGameOver: (callback: (data: { winner: Faction }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { winner: Faction }) => callback(data);
    ipcRenderer.on('game:gameOver', handler);
    return () => ipcRenderer.removeListener('game:gameOver', handler);
  },

  onGameAgentDied: (callback: (data: { agentId: string; cause: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { agentId: string; cause: string }) =>
      callback(data);
    ipcRenderer.on('game:agentDied', handler);
    return () => ipcRenderer.removeListener('game:agentDied', handler);
  },

  onGameAgentThinking: (callback: (data: { agentId: string; agentName: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { agentId: string; agentName: string }) =>
      callback(data);
    ipcRenderer.on('game:agentThinking', handler);
    return () => ipcRenderer.removeListener('game:agentThinking', handler);
  },

  onGameAgentThinkingDone: (callback: (data: { agentId: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { agentId: string }) =>
      callback(data);
    ipcRenderer.on('game:agentThinkingDone', handler);
    return () => ipcRenderer.removeListener('game:agentThinkingDone', handler);
  },

  onGameStreamingMessage: (callback: (data: { agentId: string; content: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { agentId: string; content: string }) =>
      callback(data);
    ipcRenderer.on('game:streamingMessage', handler);
    return () => ipcRenderer.removeListener('game:streamingMessage', handler);
  },

  onGameStateUpdate: (callback: (state: GameState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: GameState) => callback(state);
    ipcRenderer.on('game:stateUpdate', handler);
    return () => ipcRenderer.removeListener('game:stateUpdate', handler);
  }
});
