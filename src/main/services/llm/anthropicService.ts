import Anthropic from '@anthropic-ai/sdk';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

export class AnthropicService implements LLMService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse> {
    const formattedMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Ensure conversation starts with user message
    if (formattedMessages.length === 0 || formattedMessages[0].role !== 'user') {
      formattedMessages.unshift({
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    const response = await this.client.messages.create({
      model: model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: formattedMessages,
      // Extended thinking for Claude Opus 4.5
      // @ts-ignore - Claude specific parameter
      thinking: {
        type: 'enabled',
        budget_tokens: 8000
      }
    });

    // Extract content and thinking from response blocks
    let content = '';
    let thinkingContent = '';

    for (const block of response.content) {
      if (block.type === 'thinking') {
        // @ts-ignore - thinking block
        thinkingContent += block.thinking || '';
      } else if (block.type === 'text') {
        content += block.text;
      }
    }

    const rawResponse: RawResponse = {
      provider: 'anthropic',
      id: response.id,
      model: response.model,
      stopReason: response.stop_reason || undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
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
    onChunk: (chunk: string) => void
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const formattedMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Ensure conversation starts with user message
    if (formattedMessages.length === 0 || formattedMessages[0].role !== 'user') {
      formattedMessages.unshift({
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let content = '';
    let thinkingContent = '';
    let finalResponse: Anthropic.Message | null = null;

    const stream = this.client.messages.stream({
      model: model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: formattedMessages,
      // Extended thinking for Claude Opus 4.5
      // @ts-ignore - Claude specific parameter
      thinking: {
        type: 'enabled',
        budget_tokens: 8000
      }
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        // @ts-ignore - delta structure
        if (event.delta?.type === 'thinking_delta') {
          // @ts-ignore
          thinkingContent += event.delta.thinking || '';
        } else if (event.delta?.type === 'text_delta') {
          // @ts-ignore
          const delta = event.delta.text || '';
          content += delta;
          onChunk(delta);
          yield delta;
        }
      } else if (event.type === 'message_stop') {
        finalResponse = await stream.finalMessage();
      }
    }

    if (!finalResponse) {
      finalResponse = await stream.finalMessage();
    }

    const rawResponse: RawResponse = {
      provider: 'anthropic',
      id: finalResponse.id,
      model: finalResponse.model,
      stopReason: finalResponse.stop_reason || undefined,
      usage: {
        inputTokens: finalResponse.usage.input_tokens,
        outputTokens: finalResponse.usage.output_tokens,
        totalTokens: finalResponse.usage.input_tokens + finalResponse.usage.output_tokens
      },
      finishTime: Date.now()
    };

    return {
      content,
      thinkingContent: thinkingContent || undefined,
      rawResponse
    };
  }
}
