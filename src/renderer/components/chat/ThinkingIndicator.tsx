import React from 'react';
import styles from './ThinkingIndicator.module.css';

interface Props {
  agentName: string;
  compact?: boolean;
  color?: string;
  thinkingContent?: string;
}

export function ThinkingIndicator({ agentName, compact, color, thinkingContent }: Props) {
  const safeName = agentName.trim() || 'Agent';
  const displayText = `${safeName} is thinking...`;
  const containerClassName = compact
    ? `${styles.container} ${styles.compact}`
    : styles.container;
  const colorStyle = color
    ? {
        ['--thinking-color' as any]: color,
        ['--thinking-glow' as any]: color,
      }
    : undefined;

  return (
    <div className={containerClassName} style={colorStyle}>
      <div className={styles.text}>
        {displayText.split('').map((char, index) => (
          <span
            key={index}
            className={styles.letter}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </div>
      {thinkingContent && (
        <div className={styles.reasoningBlock}>
          <div className={styles.reasoningHeader}>
            <span className={styles.reasoningIcon}>●</span>
            <span className={styles.reasoningLabel}>Reasoning</span>
          </div>
          <div className={styles.thinkingContent}>
            {thinkingContent}
          </div>
        </div>
      )}
    </div>
  );
}
