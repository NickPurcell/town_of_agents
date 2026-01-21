// Game role types
export type Role = 'MAFIA' | 'CITIZEN' | 'SHERIFF' | 'DOCTOR' | 'LOOKOUT';

// Faction types
export type Faction = 'MAFIA' | 'TOWN';

// Game phase types
export type Phase =
  | 'DAY_DISCUSSION'
  | 'DAY_VOTE'
  | 'LAST_WORDS'
  | 'POST_EXECUTION_DISCUSSION'
  | 'DOCTOR_CHOICE'
  | 'SHERIFF_CHOICE'
  | 'SHERIFF_POST_SPEECH'
  | 'LOOKOUT_CHOICE'
  | 'LOOKOUT_POST_SPEECH'
  | 'NIGHT_DISCUSSION'
  | 'NIGHT_VOTE';

// Get faction from role
export function getFactionForRole(role: Role): Faction {
  return role === 'MAFIA' ? 'MAFIA' : 'TOWN';
}

// Game agent (extends base Agent with game-specific fields)
export interface GameAgent {
  id: string;
  name: string;
  role: Role;
  faction: Faction;
  personality: string;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  alive: boolean;
}

// Visibility types for events
export type Visibility =
  | { kind: 'public' }
  | { kind: 'mafia' }
  | { kind: 'sheriff_private'; agentId: string }
  | { kind: 'doctor_private'; agentId: string }
  | { kind: 'lookout_private'; agentId: string }
  | { kind: 'host' };

// Game event types
export type GameEvent =
  | NarrationEvent
  | PhaseChangeEvent
  | SpeechEvent
  | VoteEvent
  | ChoiceEvent
  | InvestigationResultEvent
  | DeathEvent;

export interface NarrationEvent {
  type: 'NARRATION';
  textMarkdown: string;
  visibility: Visibility;
  ts: number;
}

export interface PhaseChangeEvent {
  type: 'PHASE_CHANGE';
  phase: Phase;
  visibility: Visibility;
  ts: number;
}

export interface SpeechEvent {
  type: 'SPEECH';
  agentId: string;
  messageMarkdown: string;
  visibility: Visibility;
  ts: number;
  reasoning?: string;  // Agent's thinking before speaking
}

export interface VoteEvent {
  type: 'VOTE';
  agentId: string;
  targetName: string | 'DEFER';
  visibility: Visibility;
  ts: number;
  reasoning?: string;  // Agent's thinking before voting
}

export interface ChoiceEvent {
  type: 'CHOICE';
  agentId: string;
  targetName: string;
  choiceType: 'DOCTOR_PROTECT' | 'SHERIFF_INVESTIGATE' | 'LOOKOUT_WATCH';
  visibility: Visibility;
  ts: number;
  reasoning?: string;
}

export interface InvestigationResultEvent {
  type: 'INVESTIGATION_RESULT';
  sheriffId: string;
  targetId: string;
  targetRole: Role;
  visibility: Visibility;
  ts: number;
}

export interface DeathEvent {
  type: 'DEATH';
  agentId: string;
  cause: 'DAY_ELIMINATION' | 'NIGHT_KILL';
  visibility: Visibility;
  ts: number;
}

// Game state
export interface GameState {
  dayNumber: number;
  phase: Phase;
  agents: GameAgent[];
  events: GameEvent[];
  isPaused?: boolean;
  pendingNightKillTarget?: string;
  pendingDoctorProtectTarget?: string;
  sheriffIntelQueue: Record<string, { targetId: string; role: Role }[]>;
  winner?: Faction;
}

export interface SideChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// LLM response types (strict JSON)
export interface SpeakResponse {
  type: 'speak';
  action: 'DEFER' | 'SAY';
  message_markdown: string;
}

export interface VoteResponse {
  type: 'vote';
  vote: 'DEFER' | string; // AgentName
}

export interface ChoiceResponse {
  type: 'choice';
  target: 'DEFER' | string; // AgentName
}

export type AgentResponse = SpeakResponse | VoteResponse | ChoiceResponse;

// Game settings
export interface GameSettings {
  roundsPerDiscussion: number;  // cycles through all agents
  voteRetries: number;          // retry attempts for unsuccessful votes
  turnTimeoutSec: number;       // timeout per agent turn
  mafiaVotingRetries: number;   // for mafia unanimous voting
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  roundsPerDiscussion: 2,
  voteRetries: 1,
  turnTimeoutSec: 120,
  mafiaVotingRetries: 3,
};

// Role colors for UI
export const ROLE_COLORS: Record<Role, string> = {
  MAFIA: '#e53935',    // Red
  CITIZEN: '#fdd835',  // Yellow
  SHERIFF: '#1e88e5',  // Blue
  DOCTOR: '#ffffff',   // White
  LOOKOUT: '#9c27b0',  // Purple
};

// Helper to get visible events for an agent
export function canAgentSeeEvent(agent: GameAgent, event: GameEvent): boolean {
  const visibility = event.visibility;

  switch (visibility.kind) {
    case 'public':
      return true;
    case 'mafia':
      return agent.faction === 'MAFIA';
    case 'sheriff_private':
      return visibility.agentId === agent.id;
    case 'doctor_private':
      return visibility.agentId === agent.id;
    case 'lookout_private':
      return visibility.agentId === agent.id;
    case 'host':
      return false; // Only visible to host/narrator
  }
}
