import type { Chat, Settings, ChatIndexEntry, Message, StreamChunk, GameState, GameEvent, Phase, Faction, Role, SideChatMessage, LLMResponse } from '@shared/types';

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

  // Chat operations
  listChats(): Promise<ChatIndexEntry[]>;
  getChat(chatId: string): Promise<Chat | null>;
  createChat(chat: Chat): Promise<Chat>;
  updateChat(chat: Chat): Promise<Chat>;
  deleteChat(chatId: string): Promise<boolean>;

  // Chat control
  startChat(chatId: string): Promise<boolean>;
  stopChat(chatId: string): Promise<boolean>;
  sendUserMessage(chatId: string, content: string): Promise<boolean>;

  // LLM
  testConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }>;

  // Chat event listeners
  onChatStarted(callback: (data: { chatId: string }) => void): () => void;
  onChatStopped(callback: (data: { chatId: string }) => void): () => void;
  onMessageAdded(callback: (data: { chatId: string; message: Message }) => void): () => void;
  onStreamChunk(callback: (data: { chatId: string; messageId: string; chunk: StreamChunk }) => void): () => void;
  onMessageComplete(callback: (data: { chatId: string; messageId: string; message: Message }) => void): () => void;
  onChatError(callback: (data: { chatId: string; error: string }) => void): () => void;
  onAgentThinking(callback: (data: { chatId: string; agentId: string; agentName: string }) => void): () => void;
  onAgentThinkingDone(callback: (data: { chatId: string }) => void): () => void;

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
  onGameStateUpdate(callback: (state: GameState) => void): () => void;
}

declare global {
  interface Window {
    api: API;
  }
}
