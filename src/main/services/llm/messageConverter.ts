import type { Message, Agent, Chat } from '@shared/types';
import { MODEL_OPTIONS } from '@shared/types';
import type { LLMMessage } from './index';

/**
 * Convert internal messages to LLM format for a specific agent
 * - Agent's own messages become assistant role
 * - User messages become "User said: {content}"
 * - Other agents' messages become "{AgentName} said: {content}"
 */
export function convertMessagesForAgent(
  messages: Message[],
  currentAgent: Agent
): LLMMessage[] {
  const llmMessages: LLMMessage[] = [];

  for (const message of messages) {
    if (message.agentId === currentAgent.id) {
      // This agent's own messages
      llmMessages.push({
        role: 'assistant',
        content: message.content
      });
    } else {
      // User or other agents' messages
      const prefix = message.agentId === null
        ? 'User said'
        : `${message.agentName} said`;

      llmMessages.push({
        role: 'user',
        content: `${prefix}: ${message.content}`
      });
    }
  }

  // Merge consecutive user messages (required by some APIs)
  const mergedMessages: LLMMessage[] = [];
  for (const msg of llmMessages) {
    const lastMsg = mergedMessages[mergedMessages.length - 1];
    if (lastMsg && lastMsg.role === 'user' && msg.role === 'user') {
      lastMsg.content += '\n\n' + msg.content;
    } else {
      mergedMessages.push(msg);
    }
  }

  return mergedMessages;
}

/**
 * Build system prompt for an agent
 */
export function buildSystemPrompt(agent: Agent, chat: Chat): string {
  const otherAgents = chat.agents
    .filter(a => a.id !== agent.id)
    .map(a => a.name);
  const otherAgentCount = otherAgents.length;
  const otherAgentList = otherAgents.length > 0 ? otherAgents.join('\n') : 'None';
  const modelOption = MODEL_OPTIONS.find(option => option.id === agent.model);
  const modelName = modelOption?.name || agent.model;

  return `You are ${modelName}, a frontier AI model.
You are currently in a chat room with ${otherAgentCount} other agent${otherAgentCount === 1 ? '' : 's'}, and a single human.
The agents are named as follows:
${otherAgentList}

You are speaking in round robin style, each agent will get a turn to speak one after the other. The topic of conversation is:
${chat.topic || 'No topic provided.'}

The personality you are to embody is as follows:
${agent.systemPrompt}

You will respond in a casual unstructured format, no more than two paragraphs. You may use formatting if you think it is appropriate.`;
}
