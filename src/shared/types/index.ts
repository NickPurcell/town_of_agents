// Re-export game types
export * from './game';

// Provider types
export type Provider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral' | 'openrouter';

// Agent configuration
export interface Agent {
  id: string;
  name: string;
  model: string;
  provider: Provider;
  systemPrompt: string;
  color: string;
}

// Message in a chat
export interface Message {
  id: string;
  agentId: string | null; // null for user messages
  agentName: string;
  content: string;
  thinkingContent?: string;
  timestamp: number;
}

// Custom model configuration
export interface CustomModel {
  id: string;        // Unique identifier (used as model ID for API)
  name: string;      // Display name in UI
  provider: Provider;
  avatar: string;    // Avatar filename (e.g., 'mistral.png')
}

// Application settings
export interface Settings {
  apiKeys: {
    openai: string;
    anthropic: string;
    google: string;
    deepseek: string;
    xai: string;
    mistral: string;
    openrouter: string;
  };
  gameSettings?: {
    roundsPerDiscussion: number;
    voteRetries: number;
    turnTimeoutSec: number;
    mafiaVotingRetries: number;
  };
  defaultPersonality?: string;
  customModels?: CustomModel[];
}

// Raw response metadata from LLM (excludes message content)
export interface RawResponse {
  model?: string;
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    thinkingTokens?: number;
  };
  id?: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral' | 'openrouter';
  finishTime?: number;
}

// Complete LLM response
export interface LLMResponse {
  content: string;
  thinkingContent?: string;
  rawResponse: RawResponse;
}

// Model options for the UI
export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
}

// Available avatar files for custom models
export const AVAILABLE_AVATARS = [
  'chatgpt.png',
  'claude.png',
  'deepseek.png',
  'gemini.png',
  'grok.png',
  'kimi.png',
  'meta.png',
  'mistral.png',
  'nvidia.png',
  'qwen.png',
  'user.png'
];

// Default models that ship with the app (users can modify/remove these)
export const DEFAULT_MODELS: CustomModel[] = [
  { id: 'gpt-5', name: 'gpt-5', provider: 'openai', avatar: 'chatgpt.png' },
  { id: 'gpt-5-mini', name: 'gpt-5-mini', provider: 'openai', avatar: 'chatgpt.png' },
  { id: 'gpt-4o-mini', name: 'gpt-4o-mini', provider: 'openai', avatar: 'chatgpt.png' },
  { id: 'claude-opus-4-5', name: 'claude-opus-4-5', provider: 'anthropic', avatar: 'claude.png' },
  { id: 'gemini-3-pro-preview', name: 'gemini-3-pro-preview', provider: 'google', avatar: 'gemini.png' },
  { id: 'gemini-3-flash-preview', name: 'gemini-3-flash-preview', provider: 'google', avatar: 'gemini.png' },
  { id: 'deepseek-chat', name: 'deepseek-chat', provider: 'deepseek', avatar: 'deepseek.png' },
  { id: 'grok-3-beta', name: 'Grok 3 Beta', provider: 'xai', avatar: 'grok.png' },
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', avatar: 'mistral.png' },
  { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral', avatar: 'mistral.png' },
  { id: 'openrouter/auto', name: 'OpenRouter Auto', provider: 'openrouter', avatar: 'user.png' }
];

// Backwards compatibility - derived from DEFAULT_MODELS
export const BUILT_IN_MODELS: ModelOption[] = DEFAULT_MODELS.map(m => ({
  id: m.id,
  name: m.name,
  provider: m.provider
}));

// Backwards compatibility alias
export const MODEL_OPTIONS = BUILT_IN_MODELS;

// Get all models from custom models list
export function getAllModels(customModels: CustomModel[] = []): ModelOption[] {
  return customModels.map(m => ({ id: m.id, name: m.name, provider: m.provider }));
}

// Color palette for agents
export const AGENT_COLORS = [
  '#5865F2', // Discord blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
  '#3BA55C', // Dark green
  '#FAA61A', // Orange
  '#9B59B6', // Purple
  '#1ABC9C', // Teal
  '#E91E63', // Pink
  '#00BCD4', // Cyan
  '#FF5722', // Deep orange
];
