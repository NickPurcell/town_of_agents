import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { Chat, Settings, Message, Agent } from '@shared/types';
import { getChat, saveChat } from './storage';
import { createLLMService, LLMService } from './llm';
import { convertMessagesForAgent, buildSystemPrompt } from './llm/messageConverter';

interface ActiveChat {
  chat: Chat;
  settings: Settings;
  intervalId: NodeJS.Timeout | null;
  isProcessing: boolean;
  llmServices: Map<string, LLMService>;
}

export class ChatController {
  private activeChats: Map<string, ActiveChat> = new Map();

  async startChat(chat: Chat, settings: Settings): Promise<void> {
    // Stop if already running
    await this.stopChat(chat.id);

    // Update chat state
    chat.isActive = true;
    chat.updatedAt = Date.now();
    await saveChat(chat);

    // Create LLM services for each agent
    const llmServices = new Map<string, LLMService>();
    for (const agent of chat.agents) {
      const service = createLLMService(agent.provider, this.getApiKey(settings, agent.provider));
      llmServices.set(agent.id, service);
    }

    const activeChat: ActiveChat = {
      chat,
      settings,
      intervalId: null,
      isProcessing: false,
      llmServices
    };

    this.activeChats.set(chat.id, activeChat);

    // Start the first response immediately if there's a topic
    if (chat.topic && chat.messages.length === 0) {
      void this.processNextAgent(chat.id);
    }

    // Set up interval for subsequent responses
    activeChat.intervalId = setInterval(() => {
      this.processNextAgent(chat.id);
    }, chat.intervalMs);

    // Notify renderer that chat started
    this.sendToRenderer('chat:started', { chatId: chat.id });
  }

  async stopChat(chatId: string): Promise<void> {
    const activeChat = this.activeChats.get(chatId);
    if (!activeChat) return;

    // Clear interval
    if (activeChat.intervalId) {
      clearInterval(activeChat.intervalId);
    }

    // Update chat state
    const chat = await getChat(chatId);
    if (chat) {
      chat.isActive = false;
      chat.updatedAt = Date.now();
      await saveChat(chat);
    }

    this.activeChats.delete(chatId);
    this.sendToRenderer('chat:stopped', { chatId });
  }

  async sendUserMessage(chatId: string, content: string): Promise<void> {
    const activeChat = this.activeChats.get(chatId);
    let chat: Chat | null;

    if (activeChat) {
      chat = activeChat.chat;
    } else {
      chat = await getChat(chatId);
    }

    if (!chat) {
      throw new Error('Chat not found');
    }

    const message: Message = {
      id: uuidv4(),
      agentId: null,
      agentName: 'User',
      content,
      timestamp: Date.now()
    };

    chat.messages.push(message);
    chat.updatedAt = Date.now();
    await saveChat(chat);

    if (activeChat) {
      activeChat.chat = chat;
    }

    this.sendToRenderer('chat:messageAdded', { chatId, message });
  }

  private async processNextAgent(chatId: string): Promise<void> {
    const activeChat = this.activeChats.get(chatId);
    if (!activeChat || activeChat.isProcessing) return;

    activeChat.isProcessing = true;

    try {
      const chat = activeChat.chat;
      const agent = chat.agents[chat.currentAgentIndex];
      const llmService = activeChat.llmServices.get(agent.id);

      // Notify renderer that agent is thinking
      this.sendToRenderer('chat:agentThinking', {
        chatId,
        agentId: agent.id,
        agentName: agent.name
      });

      if (!llmService) {
        throw new Error(`No LLM service for agent ${agent.name}`);
      }

      // Build messages for the LLM
      const systemPrompt = buildSystemPrompt(agent, chat);
      const formattedMessages = convertMessagesForAgent(chat.messages, agent);

      // Get complete response from LLM
      const response = await llmService.generate(
        formattedMessages,
        systemPrompt,
        agent.model
      );

      // Log raw response to console
      console.log('\n=== Raw AI Response ===');
      console.log(`Agent: ${agent.name}`);
      console.log(`Provider: ${response.rawResponse.provider}`);
      if (response.rawResponse.model) console.log(`Model: ${response.rawResponse.model}`);
      if (response.rawResponse.id) console.log(`ID: ${response.rawResponse.id}`);
      if (response.rawResponse.stopReason) console.log(`Stop Reason: ${response.rawResponse.stopReason}`);
      if (response.rawResponse.usage) {
        console.log('Usage:');
        if (response.rawResponse.usage.inputTokens !== undefined)
          console.log(`  Input Tokens: ${response.rawResponse.usage.inputTokens}`);
        if (response.rawResponse.usage.outputTokens !== undefined)
          console.log(`  Output Tokens: ${response.rawResponse.usage.outputTokens}`);
        if (response.rawResponse.usage.thinkingTokens !== undefined)
          console.log(`  Thinking Tokens: ${response.rawResponse.usage.thinkingTokens}`);
        if (response.rawResponse.usage.totalTokens !== undefined)
          console.log(`  Total Tokens: ${response.rawResponse.usage.totalTokens}`);
      }
      console.log('========================\n');

      // Create final message with complete content
      const message: Message = {
        id: uuidv4(),
        agentId: agent.id,
        agentName: agent.name,
        content: response.content,
        thinkingContent: response.thinkingContent,
        timestamp: Date.now()
      };

      chat.messages.push(message);

      // Move to next agent
      chat.currentAgentIndex = (chat.currentAgentIndex + 1) % chat.agents.length;
      chat.updatedAt = Date.now();
      await saveChat(chat);

      // Clear thinking state and add message
      this.sendToRenderer('chat:agentThinkingDone', { chatId });
      this.sendToRenderer('chat:messageAdded', { chatId, message });
    } catch (error) {
      console.error('Error processing agent:', error);
      this.sendToRenderer('chat:agentThinkingDone', { chatId });
      this.sendToRenderer('chat:error', {
        chatId,
        error: (error as Error).message
      });
    } finally {
      activeChat.isProcessing = false;
    }
  }

  private getApiKey(settings: Settings, provider: string): string {
    switch (provider) {
      case 'openai':
        return settings.apiKeys.openai;
      case 'anthropic':
        return settings.apiKeys.anthropic;
      case 'google':
        return settings.apiKeys.google;
      default:
        return '';
    }
  }

  private sendToRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(channel, data);
    }
  }
}
