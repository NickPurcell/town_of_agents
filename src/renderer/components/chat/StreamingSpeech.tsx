import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { GameAgent } from '@shared/types';
import { ROLE_COLORS } from '@shared/types';
import styles from './GameEventItem.module.css';
import streamStyles from './StreamingSpeech.module.css';

interface StreamingSpeechProps {
  agent: GameAgent;
  content: string;
  isComplete: boolean;
  reasoningContent?: string;
}

function AgentAvatar({ agent }: { agent: GameAgent }) {
  const [avatarError, setAvatarError] = useState(false);
  const avatarSrc = agent.avatar ? `/avatars/${agent.avatar}` : null;
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

export function StreamingSpeech({ agent, content, isComplete, reasoningContent }: StreamingSpeechProps) {
  return (
    <div className={styles.eventRow}>
      <AgentAvatar agent={agent} />
      <div
        className={`${styles.speech} ${streamStyles.streaming}`}
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
        {reasoningContent && (
          <div className={streamStyles.reasoningBlock}>
            <div className={streamStyles.reasoningHeader}>
              <span className={streamStyles.reasoningIcon}>▼</span>
              <span className={streamStyles.reasoningLabel}>Reasoning</span>
            </div>
            <div className={streamStyles.reasoningContent}>
              {reasoningContent}
            </div>
          </div>
        )}
        <div className={styles.speechContent}>
          {content ? (
            <ReactMarkdown>{content}</ReactMarkdown>
          ) : (
            <span className={streamStyles.waiting}>Composing message...</span>
          )}
        </div>
      </div>
    </div>
  );
}
