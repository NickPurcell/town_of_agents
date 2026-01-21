import { EventEmitter } from 'events';
import {
  GameState,
  GameAgent,
  GameEvent,
  Phase,
  Faction,
  Role,
  GameSettings,
  DEFAULT_GAME_SETTINGS,
  NarrationEvent,
  PhaseChangeEvent,
  DeathEvent,
} from '../../shared/types';
import { AgentManager } from './AgentManager';
import { ConversationStore } from '../store/ConversationStore';
import { VisibilityFilter } from './Visibility';

// Phase order for state machine
const PHASE_ORDER: Phase[] = [
  'DAY_DISCUSSION',
  'DAY_VOTE',
  'LAST_WORDS',
  'POST_EXECUTION_DISCUSSION',
  'DOCTOR_CHOICE',
  'SHERIFF_CHOICE',
  'SHERIFF_POST_SPEECH',
  'NIGHT_DISCUSSION',
  'NIGHT_VOTE',
];

export interface GameEngineEvents {
  'event_appended': (event: GameEvent) => void;
  'phase_changed': (phase: Phase, dayNumber: number) => void;
  'game_over': (winner: Faction) => void;
  'agent_died': (agentId: string, cause: 'DAY_ELIMINATION' | 'NIGHT_KILL') => void;
}

export class GameEngine extends EventEmitter {
  private agentManager: AgentManager;
  private conversationStore: ConversationStore;
  private settings: GameSettings;

  private dayNumber: number = 1;
  private phase: Phase = 'DAY_DISCUSSION';
  private pendingNightKillTarget?: string;
  private pendingDoctorProtectTarget?: string;
  private sheriffIntelQueue: Record<string, { targetId: string; role: Role }[]> = {};
  private winner?: Faction;
  private lastWordsAgentId?: string;
  private isRunning: boolean = false;

  constructor(settings: GameSettings = DEFAULT_GAME_SETTINGS) {
    super();
    this.agentManager = new AgentManager();
    this.conversationStore = new ConversationStore();
    this.settings = settings;
  }

  // Initialize game with agents
  initializeGame(agentConfigs: Omit<GameAgent, 'faction' | 'alive'>[]): void {
    this.agentManager.initializeAgents(agentConfigs);
    this.conversationStore.clear();
    this.dayNumber = 1;
    this.phase = 'DAY_DISCUSSION';
    this.pendingNightKillTarget = undefined;
    this.pendingDoctorProtectTarget = undefined;
    this.sheriffIntelQueue = {};
    this.winner = undefined;
    this.lastWordsAgentId = undefined;
    this.isRunning = false;
  }

  // Start the game
  startGame(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Emit game start narration
    this.appendNarration(`**The start of Day ${this.dayNumber}**`, VisibilityFilter.public());
    this.emitPhaseChange('DAY_DISCUSSION');
  }

  // Stop the game
  stopGame(): void {
    this.isRunning = false;
  }

  // Get current game state
  getState(): GameState {
    return {
      dayNumber: this.dayNumber,
      phase: this.phase,
      agents: this.agentManager.getAllAgents(),
      events: this.conversationStore.getAllEvents(),
      pendingNightKillTarget: this.pendingNightKillTarget,
      pendingDoctorProtectTarget: this.pendingDoctorProtectTarget,
      sheriffIntelQueue: this.sheriffIntelQueue,
      winner: this.winner,
    };
  }

  // Get agent manager
  getAgentManager(): AgentManager {
    return this.agentManager;
  }

  // Get conversation store
  getConversationStore(): ConversationStore {
    return this.conversationStore;
  }

  // Get current phase
  getCurrentPhase(): Phase {
    return this.phase;
  }

  // Get current day number
  getDayNumber(): number {
    return this.dayNumber;
  }

  // Get game settings
  getSettings(): GameSettings {
    return this.settings;
  }

  // Check if game is running
  getIsRunning(): boolean {
    return this.isRunning;
  }

  // Get winner if game is over
  getWinner(): Faction | undefined {
    return this.winner;
  }

  // Get agent waiting for last words
  getLastWordsAgentId(): string | undefined {
    return this.lastWordsAgentId;
  }

  // Set agent for last words
  setLastWordsAgentId(agentId: string | undefined): void {
    this.lastWordsAgentId = agentId;
  }

  // Append narration event
  appendNarration(text: string, visibility = VisibilityFilter.public()): void {
    const event: NarrationEvent = {
      type: 'NARRATION',
      textMarkdown: text,
      visibility,
      ts: Date.now(),
    };
    this.conversationStore.appendEvent(event);
    this.emit('event_appended', event);
  }

  // Append any game event
  appendEvent(event: GameEvent): void {
    this.conversationStore.appendEvent(event);
    this.emit('event_appended', event);
  }

  // Emit phase change event
  private emitPhaseChange(phase: Phase): void {
    this.phase = phase;
    const event: PhaseChangeEvent = {
      type: 'PHASE_CHANGE',
      phase,
      visibility: VisibilityFilter.public(),
      ts: Date.now(),
    };
    this.conversationStore.appendEvent(event);
    this.emit('event_appended', event);
    this.emit('phase_changed', phase, this.dayNumber);
  }

  // Transition to next phase
  nextPhase(): void {
    const currentIndex = PHASE_ORDER.indexOf(this.phase);

    // Handle special transitions
    switch (this.phase) {
      case 'DAY_VOTE':
        // If there's someone to eliminate, go to last words
        if (this.lastWordsAgentId) {
          this.emitPhaseChange('LAST_WORDS');
          return;
        }
        // Otherwise skip to night
        this.appendNarration('**No decision could be made.**', VisibilityFilter.public());
        this.startNight();
        return;

      case 'LAST_WORDS':
        // Eliminate the agent and check win
        if (this.lastWordsAgentId) {
          this.eliminateAgent(this.lastWordsAgentId, 'DAY_ELIMINATION');
          this.lastWordsAgentId = undefined;
        }
        if (this.winner) return; // Game over
        // Go to post-execution discussion
        this.emitPhaseChange('POST_EXECUTION_DISCUSSION');
        return;

      case 'POST_EXECUTION_DISCUSSION':
        // After post-execution discussion, start night
        this.startNight();
        return;

      case 'DOCTOR_CHOICE':
        // After doctor, go to sheriff
        const sheriff = this.agentManager.getAliveSheriff();
        if (!sheriff) {
          this.skipSheriffPhase();
          return;
        }
        this.emitPhaseChange('SHERIFF_CHOICE');
        this.appendNarration('**Sheriff, choose your target.**', VisibilityFilter.sheriffPrivate(sheriff.id));
        return;

      case 'SHERIFF_CHOICE':
        // After sheriff, go to sheriff post-speech
        this.emitPhaseChange('SHERIFF_POST_SPEECH');
        return;

      case 'SHERIFF_POST_SPEECH':
        // After sheriff speech, go to mafia discussion
        this.emitPhaseChange('NIGHT_DISCUSSION');
        this.appendNarration('**Mafia, discuss your plans.**', VisibilityFilter.mafia());
        return;

      case 'NIGHT_VOTE':
        // After mafia vote, resolve night
        this.resolveNight();
        return;

      default:
        // Normal progression
        const nextIndex = (currentIndex + 1) % PHASE_ORDER.length;
        this.emitPhaseChange(PHASE_ORDER[nextIndex]);
    }
  }

  // Start night phase
  private startNight(): void {
    this.appendNarration('**Night falls.**', VisibilityFilter.public());

    // Check if mafia is alive
    if (this.agentManager.getAliveMafiaCount() === 0) {
      this.endGame('TOWN');
      return;
    }

    // Night starts with doctor choice
    const doctor = this.agentManager.getAliveDoctor();
    if (!doctor) {
      this.skipDoctorPhase();
      return;
    }
    this.emitPhaseChange('DOCTOR_CHOICE');
    this.appendNarration('**Doctor, choose your target.**', VisibilityFilter.doctorPrivate(doctor.id));
  }

  // Skip sheriff phase if dead - go directly to mafia discussion
  private skipSheriffPhase(): void {
    this.emitPhaseChange('NIGHT_DISCUSSION');
    this.appendNarration('**Mafia, discuss your plans.**', VisibilityFilter.mafia());
  }

  // Skip doctor phase if dead - go to sheriff
  private skipDoctorPhase(): void {
    const sheriff = this.agentManager.getAliveSheriff();
    if (!sheriff) {
      this.skipSheriffPhase();
      return;
    }
    this.emitPhaseChange('SHERIFF_CHOICE');
    this.appendNarration('**Sheriff, choose your target.**', VisibilityFilter.sheriffPrivate(sheriff.id));
  }

  // Resolve night and start new day
  private resolveNight(): void {
    this.dayNumber++;

    // Resolve night kill
    let killMessage: string;
    if (this.pendingNightKillTarget) {
      const target = this.agentManager.getAgent(this.pendingNightKillTarget);
      if (target) {
        if (this.pendingDoctorProtectTarget === this.pendingNightKillTarget) {
          // Doctor saved the target
          killMessage = `**${target.name} was attacked in the night, but was saved by the doctor!**`;
        } else {
          // Target dies
          this.eliminateAgent(this.pendingNightKillTarget, 'NIGHT_KILL');
          killMessage = `**${target.name} was found dead in the morning.**`;
        }
      } else {
        killMessage = '**The night passed without incident.**';
      }
    } else {
      killMessage = '**The night passed without incident.**';
    }

    // Clear pending actions
    this.pendingNightKillTarget = undefined;
    this.pendingDoctorProtectTarget = undefined;

    // Check win condition
    if (this.winner) return;

    // Start new day
    this.appendNarration(`**The start of Day ${this.dayNumber}**`, VisibilityFilter.public());
    this.appendNarration(killMessage, VisibilityFilter.public());

    // Deliver sheriff intel
    this.deliverSheriffIntel();

    this.emitPhaseChange('DAY_DISCUSSION');
  }

  // Deliver pending sheriff intel
  private deliverSheriffIntel(): void {
    for (const [sheriffId, intel] of Object.entries(this.sheriffIntelQueue)) {
      for (const item of intel) {
        const target = this.agentManager.getAgent(item.targetId);
        if (target) {
          this.appendNarration(
            `**SYSTEM (private):** Last night you investigated ${target.name}. Role = ${item.role}.`,
            VisibilityFilter.sheriffPrivate(sheriffId)
          );
        }
      }
    }
    this.sheriffIntelQueue = {};
  }

  // Set pending night kill target
  setPendingNightKillTarget(targetId: string | undefined): void {
    this.pendingNightKillTarget = targetId;
  }

  // Set pending doctor protect target
  setPendingDoctorProtectTarget(targetId: string | undefined): void {
    this.pendingDoctorProtectTarget = targetId;
  }

  // Add sheriff intel to queue
  addSheriffIntel(sheriffId: string, targetId: string, role: Role): void {
    if (!this.sheriffIntelQueue[sheriffId]) {
      this.sheriffIntelQueue[sheriffId] = [];
    }
    this.sheriffIntelQueue[sheriffId].push({ targetId, role });
  }

  // Eliminate an agent
  eliminateAgent(agentId: string, cause: 'DAY_ELIMINATION' | 'NIGHT_KILL'): void {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || !agent.alive) return;

    this.agentManager.markAgentDead(agentId);

    const event: DeathEvent = {
      type: 'DEATH',
      agentId,
      cause,
      visibility: VisibilityFilter.public(),
      ts: Date.now(),
    };
    this.conversationStore.appendEvent(event);
    this.emit('event_appended', event);
    this.emit('agent_died', agentId, cause);

    if (cause === 'DAY_ELIMINATION') {
      this.appendNarration(`**${agent.name} has been eliminated.**`, VisibilityFilter.public());
    }

    // Check win condition
    this.checkWinCondition();
  }

  // Check win condition
  checkWinCondition(): Faction | undefined {
    const aliveMafia = this.agentManager.getAliveMafiaCount();
    const aliveTown = this.agentManager.getAliveTownCount();

    if (aliveMafia === 0) {
      this.endGame('TOWN');
      return 'TOWN';
    }

    if (aliveMafia >= aliveTown) {
      this.endGame('MAFIA');
      return 'MAFIA';
    }

    return undefined;
  }

  // End the game
  private endGame(winner: Faction): void {
    this.winner = winner;
    this.isRunning = false;

    const message =
      winner === 'TOWN'
        ? '**The Town wins! All mafia members have been eliminated.**'
        : '**The Mafia wins! They have achieved parity with the town.**';

    this.appendNarration(message, VisibilityFilter.public());
    this.emit('game_over', winner);
  }

  // Transition to day vote
  transitionToDayVote(): void {
    this.emitPhaseChange('DAY_VOTE');
    this.appendNarration('**Townsfolk, begin voting.**', VisibilityFilter.public());
  }

  // Transition to night vote
  transitionToNightVote(): void {
    this.emitPhaseChange('NIGHT_VOTE');
    this.appendNarration('**Mafia, begin voting.**', VisibilityFilter.mafia());
  }

  // Set elimination target for last words
  setEliminationTarget(agentId: string): void {
    this.lastWordsAgentId = agentId;
    const agent = this.agentManager.getAgent(agentId);
    if (agent) {
      this.appendNarration(`**${agent.name} has been selected for elimination.**`, VisibilityFilter.public());
    }
  }
}
