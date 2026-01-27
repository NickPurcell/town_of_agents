// Re-export game types
export * from './game';

// Provider types
export type Provider = 'openai' | 'anthropic' | 'google' | 'deepseek';

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
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek';
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

export const BUILT_IN_MODELS: ModelOption[] = [
  { id: 'gpt-5', name: 'GPT-5 Thinking', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)', provider: 'openai' },
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', provider: 'google' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', provider: 'google' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' }
];

// Backwards compatibility alias
export const MODEL_OPTIONS = BUILT_IN_MODELS;

// Available avatar files for custom models
export const AVAILABLE_AVATARS = [
  'chatgpt.png',
  'claude.png',
  'deepseek.png',
  'gemini.png',
  'kimi.png',
  'meta.png',
  'mistral.png',
  'nvidia.png',
  'qwen.png',
  'user.png'
];

// Get all models (built-in + custom)
export function getAllModels(customModels: CustomModel[] = []): ModelOption[] {
  return [
    ...BUILT_IN_MODELS,
    ...customModels.map(m => ({ id: m.id, name: m.name, provider: m.provider }))
  ];
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
