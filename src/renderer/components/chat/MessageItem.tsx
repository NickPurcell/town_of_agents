import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message, Agent, Provider } from '@shared/types';
import { ThinkingIndicator } from './ThinkingIndicator';
import styles from './MessageItem.module.css';

type UIMessage = Message & { isThinking?: boolean };

interface Props {
  message: UIMessage;
  agent: Agent | null;
  onAgentClick: () => void;
}

export function MessageItem({ message, agent, onAgentClick }: Props) {
  const [avatarError, setAvatarError] = useState(false);
  const isUser = message.agentId === null;
  const isThinking = Boolean(message.isThinking);
  const avatarColor = agent?.color || '#5865F2';
  const avatarInitial = isUser ? 'U' : (agent?.name.charAt(0) || '?');
  const providerAvatarMap: Record<Provider, string> = {
    openai: '/avatars/chatgpt.png',
    anthropic: '/avatars/claude.png',
    google: '/avatars/gemini.png'
  };
  const avatarSrc = isUser
    ? '/avatars/user.png'
    : agent?.provider
      ? providerAvatarMap[agent.provider]
      : null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={styles.container}>
      <div
        className={styles.avatar}
        style={{ backgroundColor: isUser ? '#5865F2' : avatarColor }}
        onClick={!isUser ? onAgentClick : undefined}
      >
        {avatarSrc && !avatarError ? (
          <img
            src={avatarSrc}
            alt={isUser ? 'User avatar' : `${message.agentName} avatar`}
            className={styles.avatarImage}
            onError={() => setAvatarError(true)}
            draggable={false}
          />
        ) : (
          avatarInitial
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.header}>
          <span
            className={styles.name}
            style={{ color: isUser ? 'var(--accent)' : avatarColor }}
            onClick={!isUser ? onAgentClick : undefined}
          >
            {message.agentName}
          </span>
          <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
        </div>

        {isThinking ? (
          <ThinkingIndicator agentName={message.agentName} compact color={agent?.color} />
        ) : (
          <>
            {message.thinkingContent && (
              <div className={styles.thinking}>
                <div className={styles.thinkingLabel}>Thinking</div>
                <div className={styles.thinkingContent}>
                  {message.thinkingContent}
                </div>
              </div>
            )}

            {message.content && (
              <div className={styles.messageContent}>
                <ReactMarkdown
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const inline = !match;
                      return !inline ? (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={styles.inlineCode} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
