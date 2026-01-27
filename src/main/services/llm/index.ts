import type { Provider, LLMResponse } from '@shared/types';
import { OpenAIService } from './openaiService';
import { AnthropicService } from './anthropicService';
import { GeminiService } from './geminiService';
import { DeepSeekService } from './deepseekService';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMService {
  generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse>;

  generateStream(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    onThinkingChunk?: (chunk: string) => void
  ): AsyncGenerator<string, LLMResponse, unknown>;
}

export function createLLMService(provider: Provider, apiKey: string): LLMService {
  switch (provider) {
    case 'openai':
      return new OpenAIService(apiKey);
    case 'anthropic':
      return new AnthropicService(apiKey);
    case 'google':
      return new GeminiService(apiKey);
    case 'deepseek':
      return new DeepSeekService(apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
