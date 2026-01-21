import React from 'react';
import type { Agent } from '@shared/types';
import { MODEL_OPTIONS } from '@shared/types';
import styles from './AgentCard.module.css';

interface Props {
  agent: Agent;
  onRemove?: () => void;
}

export function AgentCard({ agent, onRemove }: Props) {
  const modelOption = MODEL_OPTIONS.find(m => m.id === agent.model);

  return (
    <div className={styles.container} style={{ borderLeftColor: agent.color }}>
      <div className={styles.avatar} style={{ backgroundColor: agent.color }}>
        {agent.name.charAt(0)}
      </div>

      <div className={styles.info}>
        <div className={styles.name}>{agent.name}</div>
        <div className={styles.model}>{modelOption?.name || agent.model}</div>
        <div className={styles.prompt}>
          {agent.systemPrompt.length > 80
            ? agent.systemPrompt.slice(0, 80) + '...'
            : agent.systemPrompt}
        </div>
      </div>

      {onRemove && (
        <button className={styles.removeButton} onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  );
}
