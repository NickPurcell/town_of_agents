import OpenAI from 'openai';
import type { LLMResponse, RawResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

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
    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    if (formattedMessages.length === 0 || formattedMessages[0].role !== 'user') {
      formattedMessages.unshift({
        role: 'user',
        content: 'Please begin the conversation based on the topic provided.'
      });
    }

    let response;
    try {
      response = await this.client.responses.create({
        model,
        input: formattedMessages,
        instructions: systemPrompt,
        reasoning: { effort: 'medium', summary: 'auto' },
      });
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('OPENAI API ERROR - REASONING REQUEST FAILED');
      console.error('='.repeat(80));
      console.error('Model:', model);
      console.error('Error:', error);
      console.error('='.repeat(80) + '\n');
      throw error;
    }

    // Extract content and reasoning summary from response.output
    let content = '';
    let thinkingContent = '';

    // @ts-ignore - response.output structure
    for (const item of response.output || []) {
      if (item.type === 'reasoning') {
        // Extract reasoning summary if available
        // @ts-ignore
        if (item.summary && Array.isArray(item.summary)) {
          // @ts-ignore
          for (const summaryItem of item.summary) {
            if (summaryItem.type === 'summary_text') {
              thinkingContent += summaryItem.text || '';
            }
          }
        }
      } else if (item.type === 'message') {
        // @ts-ignore
        for (const contentBlock of item.content || []) {
          if (contentBlock.type === 'output_text') {
            content += contentBlock.text || '';
          }
        }
      }
    }

    const rawResponse: RawResponse = {
      provider: 'openai',
      // @ts-ignore
      id: response.id,
      model,
      // @ts-ignore
      stopReason: response.status,
      usage: {
        // @ts-ignore
        inputTokens: response.usage?.input_tokens,
        // @ts-ignore
        outputTokens: response.usage?.output_tokens,
        // @ts-ignore
        totalTokens: response.usage?.total_tokens
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
