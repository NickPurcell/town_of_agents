import { contextBridge, ipcRenderer } from 'electron';
import type { Settings, GameState, GameEvent, Phase, Faction, Role, SideChatMessage, LLMResponse } from '@shared/types';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral';
  model: string;
}

// Expose API to renderer
contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Settings): Promise<boolean> =>
    ipcRenderer.invoke('settings:save', settings),

  // LLM
  testConnection: (provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('llm:testConnection', provider, apiKey),

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

  onGameStreamingChunk: (callback: (data: { agentId: string; chunk: string; isComplete: boolean }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { agentId: string; chunk: string; isComplete: boolean }) =>
      callback(data);
    ipcRenderer.on('game:streamingChunk', handler);
    return () => ipcRenderer.removeListener('game:streamingChunk', handler);
  },

  onGameStreamingThinkingChunk: (callback: (data: { agentId: string; chunk: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { agentId: string; chunk: string }) =>
      callback(data);
    ipcRenderer.on('game:streamingThinkingChunk', handler);
    return () => ipcRenderer.removeListener('game:streamingThinkingChunk', handler);
  },

  onGameStateUpdate: (callback: (state: GameState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: GameState) => callback(state);
    ipcRenderer.on('game:stateUpdate', handler);
    return () => ipcRenderer.removeListener('game:stateUpdate', handler);
  }
});
