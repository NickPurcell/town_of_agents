import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { GameEvent, GameAgent, SpeechEvent, VoteEvent, ChoiceEvent, NarrationEvent, TransitionEvent, Phase } from '@shared/types';
import { ROLE_COLORS } from '@shared/types';
import { categorizeNarration, getCategoryClassName } from '../../utils/narrationCategorizer';
import { NarrationIconMap } from './NarrationIcons';
import styles from './GameEventItem.module.css';

interface GameEventItemProps {
  event: GameEvent;
  agent?: GameAgent;
}

interface ReasoningBlockProps {
  reasoning: string;
}

const providerAvatarMap: Record<GameAgent['provider'], string> = {
  openai: '/avatars/chatgpt.png',
  anthropic: '/avatars/claude.png',
  google: '/avatars/gemini.png'
};

// Phases that should show a banner (first phase of each role's turn)
// Note: Pre-speech phases mark the start of a role's turn, choice phases are hidden
const VISIBLE_PHASES: Partial<Record<Phase, string>> = {
  DAY_ONE_DISCUSSION: 'Day 1 Discussion',
  DAY_DISCUSSION: 'Day Discussion',
  DAY_VOTE: 'Day Vote',
  LAST_WORDS: 'Last Words',
  POST_EXECUTION_DISCUSSION: 'Post-Execution Discussion',
  JAILOR_CHOICE: "Jailor's Turn",
  FRAMER_PRE_SPEECH: "Framer's Turn",
  CONSIGLIERE_CHOICE: "Consigliere's Turn",
  DOCTOR_PRE_SPEECH: "Doctor's Turn",
  VIGILANTE_PRE_SPEECH: "Vigilante's Turn",
  WEREWOLF_PRE_SPEECH: "Werewolf's Turn",
  SHERIFF_CHOICE: "Sheriff's Turn",
  LOOKOUT_CHOICE: "Lookout's Turn",
  NIGHT_DISCUSSION: "Mafia's Turn",
  MAYOR_REVEAL_CHOICE: "Mayor's Turn",
};

// Phases that should NOT show a banner (subsequent phases of a role's turn)
// VIGILANTE_CHOICE, SHERIFF_POST_SPEECH, LOOKOUT_POST_SPEECH, NIGHT_VOTE are hidden

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

function ReasoningBlock({ reasoning }: ReasoningBlockProps) {
  return (
    <div className={styles.reasoningBlock}>
      <div className={styles.reasoningHeader}>
        <span className={styles.reasoningIcon}>▼</span>
        <span className={styles.reasoningLabel}>Reasoning</span>
      </div>
      <div className={styles.reasoningContent}>
        {reasoning}
      </div>
    </div>
  );
}

export function GameEventItem({ event, agent }: GameEventItemProps) {
  switch (event.type) {
    case 'NARRATION': {
      const narrationEvent = event as NarrationEvent;
      const { category, icon } = categorizeNarration(narrationEvent);
      const IconComponent = NarrationIconMap[icon];
      const categoryClass = getCategoryClassName(category);

      return (
        <div className={`${styles.narration} ${styles[`narration${categoryClass}`]}`}>
          <div className={styles.narrationContent}>
            <IconComponent className={styles.narrationIcon} />
            <div>
              <ReactMarkdown>{narrationEvent.textMarkdown}</ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }

    case 'PHASE_CHANGE': {
      const label = VISIBLE_PHASES[event.phase];
      // Don't render banners for hidden phases (subsequent phases of a role's turn)
      if (!label) return null;

      return (
        <div className={styles.phaseChange}>
          <div className={styles.phaseDivider} />
          <span className={styles.phaseChangeLabel}>{label}</span>
          <div className={styles.phaseDivider} />
        </div>
      );
    }

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
            <ReasoningBlock reasoning={speechEvent.reasoning}  />
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
      const multiVoteTargets = voteEvent.targetNames && voteEvent.targetNames.length > 0
        ? voteEvent.targetNames.join(', ')
        : null;
      const voteTarget = multiVoteTargets
        ? `voted for ${multiVoteTargets}`
        : voteEvent.targetName === 'DEFER'
          ? 'abstained'
          : `voted for ${voteEvent.targetName}`;
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
            <ReasoningBlock reasoning={voteEvent.reasoning}  />
          )}
        </AgentEventRow>
      );
    }

    case 'CHOICE': {
      if (!agent) return null;
      const choiceEvent = event as ChoiceEvent;
      const isDefer = choiceEvent.targetName === 'DEFER';
      let actionText = isDefer ? 'chose not to act' : `is acting on ${choiceEvent.targetName}`;

      if (isDefer) {
        // Abstained - show consistent message for all choice types
        actionText = 'chose to abstain';
      } else {
        switch (choiceEvent.choiceType) {
          case 'DOCTOR_PROTECT':
            actionText = `is protecting ${choiceEvent.targetName}`;
            break;
          case 'SHERIFF_INVESTIGATE':
            actionText = `is investigating ${choiceEvent.targetName}`;
            break;
          case 'LOOKOUT_WATCH':
            actionText = `is watching ${choiceEvent.targetName}`;
            break;
          case 'VIGILANTE_KILL':
            actionText = `is targeting ${choiceEvent.targetName}`;
            break;
          case 'FRAMER_FRAME':
            actionText = `is framing ${choiceEvent.targetName}`;
            break;
          case 'CONSIGLIERE_INVESTIGATE':
            actionText = `is investigating ${choiceEvent.targetName}`;
            break;
          case 'WEREWOLF_KILL':
            actionText = `is rampaging at ${choiceEvent.targetName}`;
            break;
          case 'JAILOR_JAIL':
            actionText = `is jailing ${choiceEvent.targetName}`;
            break;
          case 'JAILOR_EXECUTE':
            actionText = `is executing ${choiceEvent.targetName}`;
            break;
          case 'JAILOR_ABSTAIN':
            actionText = `chose not to execute ${choiceEvent.targetName}`;
            break;
        }
      }
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
            <ReasoningBlock reasoning={choiceEvent.reasoning}  />
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
      // DAY_ELIMINATION already has a narration, skip rendering the DEATH event
      if (event.cause === 'DAY_ELIMINATION') return null;
      let causeText = 'died';
      switch (event.cause) {
        case 'NIGHT_KILL':
          causeText = 'was killed by the Mafia';
          break;
        case 'VIGILANTE_KILL':
          causeText = 'was killed by the vigilante';
          break;
        case 'VIGILANTE_GUILT':
          causeText = 'died from guilt';
          break;
      }
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

    case 'TRANSITION': {
      const transitionEvent = event as TransitionEvent;
      const transitionClass = transitionEvent.transitionType === 'DAY'
        ? styles.transitionDay
        : styles.transitionNight;

      return (
        <div className={`${styles.transition} ${transitionClass}`}>
          <h1 className={styles.transitionHeading}>{transitionEvent.heading}</h1>
          <p className={styles.transitionSubtitle}>{transitionEvent.subtitle}</p>
        </div>
      );
    }

    default:
      return null;
  }
}
