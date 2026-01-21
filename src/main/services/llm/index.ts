import type { Provider, LLMResponse } from '@shared/types';
import { OpenAIService } from './openaiService';
import { AnthropicService } from './anthropicService';
import { GeminiService } from './geminiService';

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
}

export function createLLMService(provider: Provider, apiKey: string): LLMService {
  switch (provider) {
    case 'openai':
      return new OpenAIService(apiKey);
    case 'anthropic':
      return new AnthropicService(apiKey);
    case 'google':
      return new GeminiService(apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export * from './messageConverter';
