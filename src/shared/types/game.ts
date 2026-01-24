// Game role types
export type Role = 'MAFIA' | 'GODFATHER' | 'FRAMER' | 'CONSIGLIERE' | 'JESTER' | 'CITIZEN' | 'SHERIFF' | 'DOCTOR' | 'LOOKOUT' | 'MAYOR' | 'VIGILANTE' | 'WEREWOLF';

// Attack and defense power levels
export type AttackLevel = 'NONE' | 'BASIC' | 'POWERFUL' | 'UNSTOPPABLE';
export type DefenseLevel = 'NONE' | 'BASIC' | 'POWERFUL';

// Role traits interface
export interface RoleTraits {
  visits: boolean;
  attack: AttackLevel;
  defense: DefenseLevel;
  detection_immune: boolean;
  roleblock_immune: boolean;
}

// Centralized role configuration
export const ROLE_TRAITS: Record<Role, RoleTraits> = {
  CITIZEN:      { visits: false, attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  SHERIFF:      { visits: true,  attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  DOCTOR:       { visits: true,  attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  LOOKOUT:      { visits: true,  attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  VIGILANTE:    { visits: true,  attack: 'BASIC', defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  MAYOR:        { visits: false, attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  MAFIA:        { visits: true,  attack: 'BASIC', defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  GODFATHER:    { visits: true,  attack: 'BASIC', defense: 'BASIC', detection_immune: true,  roleblock_immune: false },
  FRAMER:       { visits: true,  attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  CONSIGLIERE:  { visits: true,  attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  JESTER:       { visits: false, attack: 'NONE',  defense: 'NONE',  detection_immune: false, roleblock_immune: false },
  WEREWOLF:     { visits: true,  attack: 'POWERFUL', defense: 'BASIC', detection_immune: false, roleblock_immune: false },
};

// Helper function to get role traits
export function getRoleTraits(role: Role): RoleTraits {
  return ROLE_TRAITS[role];
}

// Helper function to compare attack vs defense
// Returns true if attack succeeds (attack level > defense level)
export function doesAttackSucceed(attack: AttackLevel, defense: DefenseLevel): boolean {
  const attackOrder: AttackLevel[] = ['NONE', 'BASIC', 'POWERFUL', 'UNSTOPPABLE'];
  const defenseOrder: DefenseLevel[] = ['NONE', 'BASIC', 'POWERFUL'];
  return attackOrder.indexOf(attack) > defenseOrder.indexOf(defense);
}

// Narration categorization types
export type NarrationCategory =
  | 'critical_death' | 'critical_win' | 'critical_saved' | 'critical_reveal'
  | 'info_transition' | 'info_phase_prompt' | 'info_vote_outcome'
  | 'private_sheriff' | 'private_lookout' | 'private_vigilante' | 'private_doctor';

export type NarrationIcon =
  | 'skull' | 'trophy' | 'shield' | 'crown'
  | 'sun' | 'moon' | 'clock' | 'gavel' | 'eye';

// Faction types
export type Faction = 'MAFIA' | 'TOWN' | 'NEUTRAL';

// Game phase types
export type Phase =
  | 'DAY_ONE_DISCUSSION'
  | 'DAY_DISCUSSION'
  | 'DAY_VOTE'
  | 'LAST_WORDS'
  | 'POST_EXECUTION_DISCUSSION'
  | 'FRAMER_PRE_SPEECH'
  | 'FRAMER_CHOICE'
  | 'CONSIGLIERE_PRE_SPEECH'
  | 'CONSIGLIERE_CHOICE'
  | 'CONSIGLIERE_POST_SPEECH'
  | 'SHERIFF_CHOICE'
  | 'SHERIFF_POST_SPEECH'
  | 'DOCTOR_PRE_SPEECH'
  | 'DOCTOR_CHOICE'
  | 'VIGILANTE_PRE_SPEECH'
  | 'VIGILANTE_CHOICE'
  | 'WEREWOLF_PRE_SPEECH'
  | 'WEREWOLF_CHOICE'
  | 'LOOKOUT_CHOICE'
  | 'LOOKOUT_POST_SPEECH'
  | 'NIGHT_DISCUSSION'
  | 'NIGHT_VOTE'
  | 'MAYOR_REVEAL_CHOICE';

// Get faction from role
export function getFactionForRole(role: Role): Faction {
  if (role === 'MAFIA' || role === 'GODFATHER' || role === 'FRAMER' || role === 'CONSIGLIERE') {
    return 'MAFIA';
  }
  if (role === 'JESTER' || role === 'WEREWOLF') {
    return 'NEUTRAL';
  }
  return 'TOWN';
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
  hasRevealedMayor?: boolean;
}

// Visibility types for events
export type Visibility =
  | { kind: 'public' }
  | { kind: 'mafia' }
  | { kind: 'sheriff_private'; agentId: string }
  | { kind: 'doctor_private'; agentId: string }
  | { kind: 'lookout_private'; agentId: string }
  | { kind: 'vigilante_private'; agentId: string }
  | { kind: 'mayor_private'; agentId: string }
  | { kind: 'framer_private'; agentId: string }
  | { kind: 'consigliere_private'; agentId: string }
  | { kind: 'werewolf_private'; agentId: string }
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
  targetNames?: string[];
  visibility: Visibility;
  ts: number;
  reasoning?: string;  // Agent's thinking before voting
}

export interface ChoiceEvent {
  type: 'CHOICE';
  agentId: string;
  targetName: string;
  choiceType: 'DOCTOR_PROTECT' | 'SHERIFF_INVESTIGATE' | 'LOOKOUT_WATCH' | 'VIGILANTE_KILL' | 'FRAMER_FRAME' | 'CONSIGLIERE_INVESTIGATE' | 'WEREWOLF_KILL';
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
  cause: 'DAY_ELIMINATION' | 'NIGHT_KILL' | 'VIGILANTE_KILL' | 'VIGILANTE_GUILT' | 'WEREWOLF_KILL';
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
  pendingVigilanteKillTarget?: string;
  pendingWerewolfKillTarget?: string;
  pendingDoctorProtectTarget?: string;
  pendingFramedTarget?: string;
  persistentFramedTargets: string[];  // Frames persist until investigated
  sheriffIntelQueue: Record<string, { targetId: string; role: Role }[]>;
  vigilanteSkipNextNight?: boolean;
  vigilanteGuiltyId?: string;
  vigilanteBulletsRemaining: number;  // Track 3-bullet limit
  winner?: Faction;
}

export interface SideChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Streaming speak header (two-phase protocol)
export interface StreamingSpeakHeader {
  type: 'speak';
  action: 'SAY' | 'DEFER';
}

// LLM response types (strict JSON)
export interface SpeakResponse {
  type: 'speak';
  action: 'DEFER' | 'SAY';
  message_markdown: string;
  declare_mayor?: boolean;
}

export interface VoteResponse {
  type: 'vote';
  vote?: 'DEFER' | string; // AgentName
  votes?: string[];
}

export interface ChoiceResponse {
  type: 'choice';
  target: 'DEFER' | string; // AgentName
}

export interface MayorRevealResponse {
  type: 'mayor_reveal';
  reveal: boolean;
  message_markdown?: string; // Optional message when revealing
}

export type AgentResponse = SpeakResponse | VoteResponse | ChoiceResponse | MayorRevealResponse;

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
  GODFATHER: '#c62828', // Distinct red shade
  FRAMER: '#8b0000',   // Dark red
  CONSIGLIERE: '#b71c1c', // Darker red
  JESTER: '#e91e63',   // Pink - playful/chaotic color
  CITIZEN: '#fdd835',  // Yellow
  SHERIFF: '#1e88e5',  // Blue
  DOCTOR: '#ffffff',   // White
  LOOKOUT: '#9c27b0',  // Purple
  MAYOR: '#ff9800',    // Orange
  VIGILANTE: '#4caf50', // Green
  WEREWOLF: '#8B4513', // Saddle brown
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
    case 'vigilante_private':
      return visibility.agentId === agent.id;
    case 'mayor_private':
      return visibility.agentId === agent.id;
    case 'framer_private':
      return visibility.agentId === agent.id;
    case 'consigliere_private':
      return visibility.agentId === agent.id;
    case 'werewolf_private':
      return visibility.agentId === agent.id;
    case 'host':
      return false; // Only visible to host/narrator
  }
}
