import OpenAI from 'openai';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

export class XAIService implements LLMService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1'
    });
  }

  async generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse> {
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ];

    // Ensure first message after system is from user
    if (formattedMessages.length === 1 || formattedMessages[1].role !== 'user') {
      formattedMessages.splice(1, 0, {
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let response;
    try {
      response = await this.client.chat.completions.create({
        model,
        messages: formattedMessages
      });
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('XAI API ERROR - REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    const content = response.choices[0]?.message?.content || '';

    const rawResponse: RawResponse = {
      provider: 'xai',
      id: response.id,
      model,
      stopReason: response.choices[0]?.finish_reason || undefined,
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
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
    onChunk: (chunk: string) => void,
    _onThinkingChunk?: (chunk: string) => void
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ];

    // Ensure first message after system is from user
    if (formattedMessages.length === 1 || formattedMessages[1].role !== 'user') {
      formattedMessages.splice(1, 0, {
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let content = '';
    let finishReason: string | undefined;

    try {
      const streamStartTime = Date.now();
      console.log(`[TIMING] xAI: Creating stream for ${model}...`);

      const stream = await this.client.chat.completions.create({
        model,
        messages: formattedMessages,
        stream: true
      });

      console.log(`[TIMING] xAI: Stream created after ${Date.now() - streamStartTime}ms`);

      let firstChunkLogged = false;
      for await (const chunk of stream) {
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.log(`[TIMING] xAI: First chunk after ${Date.now() - streamStartTime}ms`);
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
      console.error('XAI API ERROR - STREAMING REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    const rawResponse: RawResponse = {
      provider: 'xai',
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
