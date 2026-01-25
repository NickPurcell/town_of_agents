import {
  GameEvent,
  GameAgent,
  Visibility,
  NarrationEvent,
  PhaseChangeEvent,
  SpeechEvent,
  VoteEvent,
  ChoiceEvent,
  InvestigationResultEvent,
  DeathEvent,
  TransitionEvent,
} from '@shared/types';

/**
 * Format visibility to a human-readable string
 */
export function formatVisibility(visibility: Visibility): string {
  switch (visibility.kind) {
    case 'public':
      return 'public';
    case 'mafia':
      return 'mafia';
    case 'host':
      return 'host';
    case 'sheriff_private':
      return `sheriff_private:${visibility.agentId}`;
    case 'doctor_private':
      return `doctor_private:${visibility.agentId}`;
    case 'lookout_private':
      return `lookout_private:${visibility.agentId}`;
    case 'vigilante_private':
      return `vigilante_private:${visibility.agentId}`;
    case 'mayor_private':
      return `mayor_private:${visibility.agentId}`;
    case 'framer_private':
      return `framer_private:${visibility.agentId}`;
    case 'consigliere_private':
      return `consigliere_private:${visibility.agentId}`;
    case 'werewolf_private':
      return `werewolf_private:${visibility.agentId}`;
    case 'jailor_private':
      return `jailor_private:${visibility.agentId}`;
    case 'jail_conversation':
      return `jail_conversation:${visibility.jailorId},${visibility.prisonerId}`;
    default:
      return 'unknown';
  }
}

/**
 * Format a game event into a human-readable log string
 */
export function formatGameEvent(
  event: GameEvent,
  agentLookup: Map<string, GameAgent>
): string {
  const vis = formatVisibility(event.visibility);

  switch (event.type) {
    case 'TRANSITION':
      return formatTransitionEvent(event, vis);
    case 'PHASE_CHANGE':
      return formatPhaseChangeEvent(event, vis);
    case 'NARRATION':
      return formatNarrationEvent(event, vis);
    case 'SPEECH':
      return formatSpeechEvent(event, agentLookup, vis);
    case 'VOTE':
      return formatVoteEvent(event, agentLookup, vis);
    case 'CHOICE':
      return formatChoiceEvent(event, agentLookup, vis);
    case 'INVESTIGATION_RESULT':
      return formatInvestigationResultEvent(event, agentLookup, vis);
    case 'DEATH':
      return formatDeathEvent(event, agentLookup, vis);
    default:
      return `[UNKNOWN EVENT] (visibility: ${vis})`;
  }
}

function formatTransitionEvent(event: TransitionEvent, vis: string): string {
  return `[TRANSITION] ${event.heading} - ${event.subtitle} (visibility: ${vis})`;
}

function formatPhaseChangeEvent(event: PhaseChangeEvent, vis: string): string {
  return `[PHASE] ${event.phase} (visibility: ${vis})`;
}

function formatNarrationEvent(event: NarrationEvent, vis: string): string {
  return `[NARRATION] ${event.textMarkdown} (visibility: ${vis})`;
}

function formatSpeechEvent(
  event: SpeechEvent,
  agentLookup: Map<string, GameAgent>,
  vis: string
): string {
  const agent = agentLookup.get(event.agentId);
  const name = agent?.name ?? 'Unknown';
  const role = agent?.role ?? 'UNKNOWN';
  // Only log messageMarkdown, never reasoning
  return `${name}[${role}]: ${event.messageMarkdown}\n(visibility: ${vis})`;
}

function formatVoteEvent(
  event: VoteEvent,
  agentLookup: Map<string, GameAgent>,
  vis: string
): string {
  const agent = agentLookup.get(event.agentId);
  const name = agent?.name ?? 'Unknown';
  const role = agent?.role ?? 'UNKNOWN';
  const target = event.targetName === 'DEFER' ? 'DEFER' : event.targetName;
  return `[VOTE] ${name}[${role}] voted for ${target} (visibility: ${vis})`;
}

function formatChoiceEvent(
  event: ChoiceEvent,
  agentLookup: Map<string, GameAgent>,
  vis: string
): string {
  const agent = agentLookup.get(event.agentId);
  const name = agent?.name ?? 'Unknown';
  const role = agent?.role ?? 'UNKNOWN';
  return `[CHOICE] ${name}[${role}] chose to ${event.choiceType} ${event.targetName} (visibility: ${vis})`;
}

function formatInvestigationResultEvent(
  event: InvestigationResultEvent,
  agentLookup: Map<string, GameAgent>,
  vis: string
): string {
  const sheriff = agentLookup.get(event.sheriffId);
  const target = agentLookup.get(event.targetId);
  const sheriffName = sheriff?.name ?? 'Unknown';
  const targetName = target?.name ?? 'Unknown';
  return `[INVESTIGATION_RESULT] ${sheriffName} investigated ${targetName}: ${event.targetRole} (visibility: ${vis})`;
}

function formatDeathEvent(
  event: DeathEvent,
  agentLookup: Map<string, GameAgent>,
  vis: string
): string {
  const agent = agentLookup.get(event.agentId);
  const name = agent?.name ?? 'Unknown';
  // Use role from event (now always present) with fallback to agent lookup
  const role = event.role ?? agent?.role ?? 'UNKNOWN';
  return `[DEATH] ${name}[${role}] was killed - cause: ${event.cause} (visibility: ${vis})`;
}
