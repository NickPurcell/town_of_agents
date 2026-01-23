import OpenAI from 'openai';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class OpenAIService implements LLMService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse> {
    // Build messages array with system prompt first
    const chatMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ];

    for (const m of messages) {
      chatMessages.push({
        role: m.role as 'user' | 'assistant',
        content: m.content
      });
    }

    // Ensure we have at least one user message
    if (!chatMessages.some(m => m.role === 'user')) {
      chatMessages.push({
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let response;
    try {
      response = await this.client.chat.completions.create({
        model,
        messages: chatMessages,
      });
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('OPENAI API ERROR - REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    const content = response.choices[0]?.message?.content || '';

    const rawResponse: RawResponse = {
      provider: 'openai',
      id: response.id,
      model,
      stopReason: response.choices[0]?.finish_reason || 'unknown',
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens
      },
      finishTime: Date.now()
    };

    return {
      content,
      rawResponse
    };
  }

  async *generateStream(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string,
    onChunk: (chunk: string) => void
  ): AsyncGenerator<string, LLMResponse, unknown> {
    // Build messages array with system prompt first
    const chatMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ];

    for (const m of messages) {
      chatMessages.push({
        role: m.role as 'user' | 'assistant',
        content: m.content
      });
    }

    // Ensure we have at least one user message
    if (!chatMessages.some(m => m.role === 'user')) {
      chatMessages.push({
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let content = '';
    let finishReason = '';

    try {
      const streamStartTime = Date.now();
      console.log(`[TIMING] OpenAI: Creating stream for ${model}...`);

      const stream = await this.client.chat.completions.create({
        model,
        messages: chatMessages,
        stream: true,
      });

      console.log(`[TIMING] OpenAI: Stream created after ${Date.now() - streamStartTime}ms`);

      let firstChunkLogged = false;
      for await (const chunk of stream) {
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.log(`[TIMING] OpenAI: First stream chunk after ${Date.now() - streamStartTime}ms`);
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          content += delta;
          onChunk(delta);
          yield delta;
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('OPENAI API ERROR - STREAMING REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    const rawResponse: RawResponse = {
      provider: 'openai',
      id: 'stream-' + Date.now(),
      model,
      stopReason: finishReason || 'unknown',
      usage: {
        // Usage not available in streaming mode
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined
      },
      finishTime: Date.now()
    };

    return {
      content,
      rawResponse
    };
  }
}
