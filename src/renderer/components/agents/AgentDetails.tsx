import React from 'react';
import type { Agent } from '@shared/types';
import { MODEL_OPTIONS } from '@shared/types';
import styles from './AgentDetails.module.css';

interface Props {
  agent: Agent;
  messageCount: number;
}

export function AgentDetails({ agent, messageCount }: Props) {
  const modelOption = MODEL_OPTIONS.find(m => m.id === agent.model);

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'google': return 'Google AI';
      default: return provider;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div
          className={styles.avatar}
          style={{ backgroundColor: agent.color }}
        >
          {agent.name.charAt(0)}
        </div>
        <div className={styles.name}>{agent.name}</div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Messages</span>
          <span className={styles.statValue}>{messageCount}</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Model</div>
        <div className={styles.sectionContent}>
          {modelOption?.name || agent.model}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Provider</div>
        <div className={styles.sectionContent}>
          {getProviderLabel(agent.provider)}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>System Prompt</div>
        <div className={styles.systemPrompt}>
          {agent.systemPrompt}
        </div>
      </div>
    </div>
  );
}
