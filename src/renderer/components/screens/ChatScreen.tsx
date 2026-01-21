import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useUIStore } from '../../store/uiStore';
import { MessageItem } from '../chat/MessageItem';
import styles from './ChatScreen.module.css';

export function ChatScreen() {
  const { currentChat, sendUserMessage, startChat, stopChat, thinkingAgent } = useChatStore();
  const { selectAgent } = useUIStore();
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getAgentForMessage = (agentId: string | null) => {
    if (!agentId) return null;
    return currentChat?.agents.find(a => a.id === agentId) || null;
  };

  const thinkingMessage = thinkingAgent && currentChat && thinkingAgent.chatId === currentChat.id
    ? {
        id: `thinking-${thinkingAgent.agentId}`,
        agentId: thinkingAgent.agentId,
        agentName: thinkingAgent.agentName,
        content: '',
        timestamp: thinkingAgent.startedAt,
        isThinking: true
      }
    : null;

  const thinkingAgentModel = thinkingMessage
    ? getAgentForMessage(thinkingMessage.agentId)
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, thinkingMessage?.timestamp]);

  if (!currentChat) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>No chat selected</p>
        </div>
      </div>
    );
  }

  const handleSend = async () => {
    if (!userInput.trim()) return;
    await sendUserMessage(userInput.trim());
    setUserInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggleActive = async () => {
    if (currentChat.isActive) {
      await stopChat(currentChat.id);
    } else {
      await startChat(currentChat.id);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h2 className={styles.chatName}>{currentChat.name}</h2>
          <span className={styles.chatTopic}>{currentChat.topic}</span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statusBadge} ${currentChat.isActive ? styles.active : styles.inactive}`}>
            {currentChat.isActive ? '● Active' : '○ Inactive'}
          </span>
          <button
            className={styles.toggleButton}
            onClick={handleToggleActive}
          >
            {currentChat.isActive ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      <div className={styles.messages}>
        {currentChat.messages.length === 0 && !thinkingMessage ? (
          <div className={styles.emptyMessages}>
            <p>Waiting for the first response...</p>
          </div>
        ) : (
          <>
            {currentChat.messages.flatMap(message => {
              const agent = getAgentForMessage(message.agentId);
              const items: React.ReactNode[] = [];
              const hasThinking = Boolean(message.thinkingContent);
              const hasContent = Boolean(message.content.trim());

              if (hasThinking) {
                items.push(
                  <MessageItem
                    key={`${message.id}-thinking`}
                    message={{
                      ...message,
                      content: '',
                      isStreaming: message.isStreaming && !hasContent
                    }}
                    agent={agent}
                    onAgentClick={() => {
                      const selected = getAgentForMessage(message.agentId);
                      if (selected) selectAgent(selected);
                    }}
                  />
                );
              }

              if (!hasThinking || hasContent) {
                items.push(
                  <MessageItem
                    key={message.id}
                    message={{
                      ...message,
                      thinkingContent: undefined,
                      isStreaming: message.isStreaming && hasContent
                    }}
                    agent={agent}
                    onAgentClick={() => {
                      const selected = getAgentForMessage(message.agentId);
                      if (selected) selectAgent(selected);
                    }}
                  />
                );
              }

              return items;
            })}
            {thinkingMessage && (
              <MessageItem
                key={thinkingMessage.id}
                message={thinkingMessage}
                agent={thinkingAgentModel}
                onAgentClick={() => {
                  if (thinkingAgentModel) selectAgent(thinkingAgentModel);
                }}
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            className={styles.input}
            placeholder="Send a message..."
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!userInput.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
