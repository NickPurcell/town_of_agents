import React from 'react';
import styles from './ThinkingBubble.module.css';

interface ThinkingBubbleProps {
  agentName: string;
  agentColor?: string;
  thinkingContent: string;
  isMinimized: boolean;
  onToggle: () => void;
}

export function ThinkingBubble({
  agentName,
  agentColor,
  thinkingContent,
  isMinimized,
  onToggle,
}: ThinkingBubbleProps) {
  return (
    <div
      className={`${styles.container} ${isMinimized ? styles.minimized : styles.expanded}`}
      onClick={onToggle}
    >
      <div className={styles.header}>
        <span
          className={styles.agentName}
          style={agentColor ? { color: agentColor } : undefined}
        >
          {agentName}
        </span>
        <span className={styles.thinkingLabel}>
          {isMinimized ? "'s reasoning (click to expand)" : "'s reasoning"}
        </span>
        <span className={styles.toggleIcon}>
          {isMinimized ? '▶' : '▼'}
        </span>
      </div>
      {!isMinimized && (
        <div className={styles.content}>
          {thinkingContent}
        </div>
      )}
    </div>
  );
}
