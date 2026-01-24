import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

export class GeminiService implements LLMService {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Determine thinking level based on model.
   * Flash models use LOW for speed, Pro models use HIGH for deeper reasoning.
   */
  private getThinkingLevel(model: string): ThinkingLevel {
    if (model.toLowerCase().includes('flash')) {
      return ThinkingLevel.LOW;
    }
    return ThinkingLevel.HIGH;
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
          thinkingLevel: this.getThinkingLevel(model)
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

  async *generateStream(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    onThinkingChunk?: (chunk: string) => void
  ): AsyncGenerator<string, LLMResponse, unknown> {
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

    let content = '';
    let thinkingContent = '';
    let usageMetadata: any = null;
    let finishReason: string | undefined;

    const stream = await this.client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: this.getThinkingLevel(model)
        }
      }
    });

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text !== 'string' || part.text.length === 0) continue;
        if (part.thought) {
          thinkingContent += part.text;
          if (onThinkingChunk) {
            onThinkingChunk(part.text);
          }
        } else {
          content += part.text;
          onChunk(part.text);
          yield part.text;
        }
      }

      // Capture metadata from the last chunk
      // @ts-ignore - usageMetadata may not be in type definitions
      if (chunk.usageMetadata) {
        // @ts-ignore
        usageMetadata = chunk.usageMetadata;
      }
      if (chunk.candidates?.[0]?.finishReason) {
        finishReason = chunk.candidates[0].finishReason;
      }
    }

    const rawResponse: RawResponse = {
      provider: 'google',
      model,
      stopReason: finishReason,
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
