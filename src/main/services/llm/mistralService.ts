import { Mistral } from '@mistralai/mistralai';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

export class MistralService implements LLMService {
  private client: Mistral;

  constructor(apiKey: string) {
    this.client = new Mistral({ apiKey });
  }

  async generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse> {
    const formattedMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ];

    // Ensure first message after system is from user
    if (formattedMessages.length === 1 || formattedMessages[1].role !== 'user') {
      formattedMessages.splice(1, 0, {
        role: 'user' as const,
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let response;
    try {
      response = await this.client.chat.complete({
        model,
        messages: formattedMessages
      });
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('MISTRAL API ERROR - REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    const content = response.choices?.[0]?.message?.content || '';

    const rawResponse: RawResponse = {
      provider: 'mistral',
      id: response.id,
      model,
      stopReason: response.choices?.[0]?.finishReason || undefined,
      usage: response.usage ? {
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens
      } : undefined,
      finishTime: Date.now()
    };

    return {
      content: typeof content === 'string' ? content : '',
      rawResponse
    };
  }

  async *generateStream(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string,
    onChunk: (chunk: string) => void,
    _onThinkingChunk?: (chunk: string) => void
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const formattedMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ];

    // Ensure first message after system is from user
    if (formattedMessages.length === 1 || formattedMessages[1].role !== 'user') {
      formattedMessages.splice(1, 0, {
        role: 'user' as const,
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let content = '';
    let finishReason: string | undefined;

    try {
      const streamStartTime = Date.now();
      console.log(`[TIMING] Mistral: Creating stream for ${model}...`);

      const stream = await this.client.chat.stream({
        model,
        messages: formattedMessages
      });

      console.log(`[TIMING] Mistral: Stream created after ${Date.now() - streamStartTime}ms`);

      let firstChunkLogged = false;
      for await (const event of stream) {
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.log(`[TIMING] Mistral: First chunk after ${Date.now() - streamStartTime}ms`);
        }

        const delta = event.data.choices?.[0]?.delta?.content || '';
        if (delta) {
          content += delta;
          onChunk(delta);
          yield delta;
        }

        if (event.data.choices?.[0]?.finishReason) {
          finishReason = event.data.choices[0].finishReason;
        }
      }
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('MISTRAL API ERROR - STREAMING REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    const rawResponse: RawResponse = {
      provider: 'mistral',
      model,
      stopReason: finishReason,
      finishTime: Date.now()
    };

    return {
      content,
      rawResponse
    };
  }
}
