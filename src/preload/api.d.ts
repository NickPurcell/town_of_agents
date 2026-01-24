import type { Settings, GameState, GameEvent, Phase, Faction, Role, SideChatMessage, LLMResponse } from '@shared/types';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
}

export interface API {
  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<boolean>;

  // LLM
  testConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }>;

  // Game operations
  gameStart(agents: PendingAgent[]): Promise<{ success: boolean }>;
  gameStop(): Promise<{ success: boolean }>;
  gamePause(): Promise<{ success: boolean }>;
  gameResume(): Promise<{ success: boolean }>;
  gameGetState(): Promise<GameState | null>;
  gameAskAgent(agentId: string, messages: SideChatMessage[]): Promise<LLMResponse>;

  // Game event listeners
  onGameEventAppended(callback: (event: GameEvent) => void): () => void;
  onGamePhaseChanged(callback: (data: { phase: Phase; dayNumber: number }) => void): () => void;
  onGameOver(callback: (data: { winner: Faction }) => void): () => void;
  onGameAgentDied(callback: (data: { agentId: string; cause: string }) => void): () => void;
  onGameAgentThinking(callback: (data: { agentId: string; agentName: string }) => void): () => void;
  onGameAgentThinkingDone(callback: (data: { agentId: string }) => void): () => void;
  onGameStreamingMessage(callback: (data: { agentId: string; content: string }) => void): () => void;
  onGameStreamingChunk(callback: (data: { agentId: string; chunk: string; isComplete: boolean }) => void): () => void;
  onGameStreamingThinkingChunk(callback: (data: { agentId: string; chunk: string }) => void): () => void;
  onGameStateUpdate(callback: (state: GameState) => void): () => void;
}

declare global {
  interface Window {
    api: API;
  }
}
