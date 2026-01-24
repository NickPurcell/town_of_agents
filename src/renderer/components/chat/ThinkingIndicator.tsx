import React, { useState } from 'react';
import type { GameAgent } from '@shared/types';
import { ROLE_COLORS } from '@shared/types';
import styles from './GameEventItem.module.css';
import thinkingStyles from './ThinkingIndicator.module.css';

interface Props {
  agent: GameAgent;
  thinkingContent?: string;
}

const providerAvatarMap: Record<GameAgent['provider'], string> = {
  openai: '/avatars/chatgpt.png',
  anthropic: '/avatars/claude.png',
  google: '/avatars/gemini.png'
};

function AgentAvatar({ agent }: { agent: GameAgent }) {
  const [avatarError, setAvatarError] = useState(false);
  const avatarSrc = providerAvatarMap[agent.provider];
  const avatarInitial = agent.name.charAt(0) || '?';
  const avatarTextColor = agent.role === 'DOCTOR' || agent.role === 'CITIZEN'
    ? '#1b1b1b'
    : '#ffffff';

  return (
    <div
      className={styles.avatar}
      style={{ backgroundColor: ROLE_COLORS[agent.role], color: avatarTextColor }}
    >
      {avatarSrc && !avatarError ? (
        <img
          src={avatarSrc}
          alt={`${agent.name} avatar`}
          className={styles.avatarImage}
          onError={() => setAvatarError(true)}
          draggable={false}
        />
      ) : (
        avatarInitial
      )}
    </div>
  );
}

export function ThinkingIndicator({ agent, thinkingContent }: Props) {
  const thinkingText = 'Thinking...';

  return (
    <div className={styles.eventRow}>
      <AgentAvatar agent={agent} />
      <div
        className={styles.speech}
        style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
      >
        <div className={styles.speechHeader}>
          <span
            className={styles.agentName}
            style={{ color: ROLE_COLORS[agent.role] }}
          >
            {agent.name}
          </span>
        </div>
        <div className={styles.speechContent}>
          {thinkingContent && (
            <div className={thinkingStyles.reasoningBlock}>
              <div className={thinkingStyles.reasoningHeader}>
                <span className={thinkingStyles.reasoningIcon}>▼</span>
                <span className={thinkingStyles.reasoningLabel}>Reasoning</span>
              </div>
              <div className={thinkingStyles.reasoningContent}>
                {thinkingContent}
              </div>
            </div>
          )}
          <div className={thinkingStyles.thinkingText}>
            {thinkingText.split('').map((char, index) => (
              <span
                key={index}
                className={thinkingStyles.letter}
                style={{ animationDelay: `${index * 0.08}s` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
