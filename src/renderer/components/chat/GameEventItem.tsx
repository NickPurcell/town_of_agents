import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { GameEvent, GameAgent, SpeechEvent, VoteEvent, ChoiceEvent } from '@shared/types';
import { ROLE_COLORS } from '@shared/types';
import styles from './GameEventItem.module.css';

interface GameEventItemProps {
  event: GameEvent;
  agent?: GameAgent;
  defaultReasoningExpanded?: boolean;
}

interface ReasoningBlockProps {
  reasoning: string;
  defaultExpanded?: boolean;
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

interface AgentEventRowProps {
  agent: GameAgent;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function AgentEventRow({ agent, className, style, children }: AgentEventRowProps) {
  return (
    <div className={styles.eventRow}>
      <AgentAvatar agent={agent} />
      <div className={className} style={style}>
        {children}
      </div>
    </div>
  );
}

function ReasoningBlock({ reasoning, defaultExpanded = false }: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={styles.reasoningBlock}>
      <button
        className={styles.reasoningToggle}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={styles.reasoningIcon}>{isExpanded ? '▼' : '▶'}</span>
        <span className={styles.reasoningLabel}>Reasoning</span>
      </button>
      {isExpanded && (
        <div className={styles.reasoningContent}>
          {reasoning}
        </div>
      )}
    </div>
  );
}

export function GameEventItem({ event, agent, defaultReasoningExpanded = false }: GameEventItemProps) {
  switch (event.type) {
    case 'NARRATION':
      return (
        <div className={styles.narration}>
          <ReactMarkdown>{event.textMarkdown}</ReactMarkdown>
        </div>
      );

    case 'PHASE_CHANGE':
      return null; // Phase changes are shown in header

    case 'SPEECH': {
      if (!agent) return null;
      const speechEvent = event as SpeechEvent;
      return (
        <AgentEventRow
          agent={agent}
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
            {!agent.alive && <span className={styles.deadBadge}>Dead</span>}
            <span className={styles.timestamp}>
              {new Date(event.ts).toLocaleTimeString()}
            </span>
          </div>
          {speechEvent.reasoning && (
            <ReasoningBlock reasoning={speechEvent.reasoning} defaultExpanded={defaultReasoningExpanded} />
          )}
          <div className={styles.speechContent}>
            <ReactMarkdown>{event.messageMarkdown}</ReactMarkdown>
          </div>
        </AgentEventRow>
      );
    }

    case 'VOTE': {
      if (!agent) return null;
      const voteEvent = event as VoteEvent;
      const voteTarget = voteEvent.targetName === 'DEFER' ? 'abstained' : `voted for ${voteEvent.targetName}`;
      return (
        <AgentEventRow
          agent={agent}
          className={styles.vote}
          style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
        >
          <div className={styles.voteHeader}>
            <span
              className={styles.voterName}
              style={{ color: ROLE_COLORS[agent.role] }}
            >
              {agent.name}
            </span>
            <span className={styles.voteAction}>{voteTarget}</span>
          </div>
          {voteEvent.reasoning && (
            <ReasoningBlock reasoning={voteEvent.reasoning} defaultExpanded={defaultReasoningExpanded} />
          )}
        </AgentEventRow>
      );
    }

    case 'CHOICE': {
      if (!agent) return null;
      const choiceEvent = event as ChoiceEvent;
      const actionText = choiceEvent.choiceType === 'DOCTOR_PROTECT'
        ? `is protecting ${choiceEvent.targetName}`
        : `is investigating ${choiceEvent.targetName}`;
      return (
        <AgentEventRow
          agent={agent}
          className={styles.choice}
          style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
        >
          <div className={styles.choiceHeader}>
            <span
              className={styles.agentName}
              style={{ color: ROLE_COLORS[agent.role] }}
            >
              {agent.name}
            </span>
            <span className={styles.choiceAction}>{actionText}</span>
          </div>
          {choiceEvent.reasoning && (
            <ReasoningBlock reasoning={choiceEvent.reasoning} defaultExpanded={defaultReasoningExpanded} />
          )}
        </AgentEventRow>
      );
    }

    case 'INVESTIGATION_RESULT':
      return (
        <div className={styles.investigation}>
          <span className={styles.investigationLabel}>Investigation Result:</span>
          <span className={styles.investigationResult}>
            Target role revealed
          </span>
        </div>
      );

    case 'DEATH':
      if (!agent) return null;
      const causeText = event.cause === 'DAY_ELIMINATION'
        ? 'was eliminated by the town'
        : 'was killed by the mafia';
      return (
        <AgentEventRow
          agent={agent}
          className={styles.death}
          style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
        >
          <span
            className={styles.deadAgentName}
            style={{ color: ROLE_COLORS[agent.role] }}
          >
            {agent.name}
          </span>
          <span className={styles.deathCause}>{causeText}</span>
          <span className={styles.roleReveal}>
            Role: <span style={{ color: ROLE_COLORS[agent.role] }}>{agent.role}</span>
          </span>
        </AgentEventRow>
      );

    default:
      return null;
  }
}
