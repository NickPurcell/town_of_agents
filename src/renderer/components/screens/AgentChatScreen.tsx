import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { MessageItem } from '../chat/MessageItem';
import type { Message, Agent as ChatAgent, SideChatMessage } from '@shared/types';
import { ROLE_COLORS } from '@shared/types';
import styles from './AgentChatScreen.module.css';

type UIMessage = Message & { isThinking?: boolean };

export function AgentChatScreen() {
  const { gameState, sideChatThreads, sendSideChatMessage } = useGameStore();
  const { sideChatAgentId, closeSideChat } = useUIStore();
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useMemo(() => {
    if (!gameState || !sideChatAgentId) return null;
    return gameState.agents.find(a => a.id === sideChatAgentId) || null;
  }, [gameState, sideChatAgentId]);

  const thread = sideChatAgentId ? sideChatThreads[sideChatAgentId] : undefined;

  const assistantAgent: ChatAgent | null = agent
    ? {
        id: agent.id,
        name: agent.name,
        model: agent.model,
        provider: agent.provider,
        systemPrompt: '',
        color: ROLE_COLORS[agent.role],
      }
    : null;

  const messages = useMemo(() => {
    if (!agent || !thread) return [];
    return thread.messages.map((message: SideChatMessage): UIMessage => ({
      id: message.id,
      agentId: message.role === 'assistant' ? agent.id : null,
      agentName: message.role === 'assistant' ? agent.name : 'You',
      content: message.content,
      timestamp: message.timestamp,
    }));
  }, [agent, thread]);

  const thinkingMessage: UIMessage | null = agent && thread?.isLoading
    ? {
        id: `thinking-${agent.id}`,
        agentId: agent.id,
        agentName: agent.name,
        content: '',
        timestamp: thread.pendingSince ?? Date.now(),
        isThinking: true,
      }
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingMessage?.timestamp]);

  if (!gameState) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>No game in progress</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>Select an agent on the left to start a private chat</p>
        </div>
      </div>
    );
  }

  const handleSend = async () => {
    const trimmed = userInput.trim();
    if (!trimmed || thread?.isLoading) return;
    setUserInput('');
    await sendSideChatMessage(agent.id, trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <button className={styles.backButton} onClick={closeSideChat}>
            {'<- Back to Game'}
          </button>
          <h2 className={styles.agentName}>{agent.name}</h2>
          <span className={styles.agentMeta}>
            {agent.role} - {agent.alive ? 'Alive' : 'Dead'}
          </span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statusBadge} ${agent.alive ? styles.alive : styles.dead}`}>
            {agent.alive ? 'Alive' : 'Dead'}
          </span>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && !thinkingMessage ? (
          <div className={styles.emptyMessages}>
            <p>Ask a private question about their strategy or decisions.</p>
          </div>
        ) : (
          <>
            {messages.map(message => (
              <MessageItem
                key={message.id}
                message={message}
                agent={message.agentId ? assistantAgent : null}
                onAgentClick={() => {}}
              />
            ))}
            {thinkingMessage && (
              <MessageItem
                key={thinkingMessage.id}
                message={thinkingMessage}
                agent={assistantAgent}
                onAgentClick={() => {}}
              />
            )}
          </>
        )}
        {thread?.error && (
          <div className={styles.errorBanner}>
            {thread.error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            className={styles.input}
            placeholder={`Ask ${agent.name} a question...`}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!userInput.trim() || Boolean(thread?.isLoading)}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
