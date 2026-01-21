import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

export class GeminiService implements LLMService {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse> {
    // Convert messages to Gemini format
    const history: Content[] = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage?.content || 'Please begin the conversation based on the topic provided.';

    const contents: Content[] = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const response = await this.client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.HIGH
        }
      }
    });

    // Extract content and thinking from response
    let content = '';
    let thinkingContent = '';

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text !== 'string' || part.text.length === 0) continue;
      if (part.thought) {
        thinkingContent += part.text;
      } else {
        content += part.text;
      }
    }

    // Capture usage metadata if available
    // @ts-ignore - usageMetadata may not be in type definitions
    const usageMetadata = response.usageMetadata;

    const rawResponse: RawResponse = {
      provider: 'google',
      model,
      stopReason: response.candidates?.[0]?.finishReason,
      usage: usageMetadata ? {
        inputTokens: usageMetadata.promptTokenCount,
        outputTokens: usageMetadata.candidatesTokenCount,
        totalTokens: usageMetadata.totalTokenCount,
        thinkingTokens: usageMetadata.thoughtsTokenCount
      } : undefined,
      finishTime: Date.now()
    };

    return {
      content,
      thinkingContent: thinkingContent || undefined,
      rawResponse
    };
  }
}
