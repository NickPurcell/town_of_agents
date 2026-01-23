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
  'DAY_ONE_DISCUSSION',
  'DAY_DISCUSSION',
  'DAY_VOTE',
  'LAST_WORDS',
  'POST_EXECUTION_DISCUSSION',
  'DOCTOR_CHOICE',
  'VIGILANTE_PRE_SPEECH',
  'VIGILANTE_CHOICE',
  'FRAMER_CHOICE',
  'SHERIFF_CHOICE',
  'SHERIFF_POST_SPEECH',
  'NIGHT_DISCUSSION',
  'NIGHT_VOTE',
  'LOOKOUT_CHOICE',
  'LOOKOUT_POST_SPEECH',
];

export interface GameEngineEvents {
  'event_appended': (event: GameEvent) => void;
  'phase_changed': (phase: Phase, dayNumber: number) => void;
  'game_over': (winner: Faction) => void;
  'agent_died': (
    agentId: string,
    cause: 'DAY_ELIMINATION' | 'NIGHT_KILL' | 'VIGILANTE_KILL' | 'VIGILANTE_GUILT'
  ) => void;
}

export class GameEngine extends EventEmitter {
  private agentManager: AgentManager;
  private conversationStore: ConversationStore;
  private settings: GameSettings;

  private dayNumber: number = 1;
  private phase: Phase = 'DAY_ONE_DISCUSSION';
  private pendingNightKillTarget?: string;
  private pendingVigilanteKillTarget?: string;
  private pendingDoctorProtectTarget?: string;
  private pendingLookoutWatchTarget?: string;
  private pendingFramedTarget?: string;
  private vigilanteSkipNextNight: boolean = false;
  private vigilanteGuiltyId?: string;
  private sheriffIntelQueue: Record<string, { targetId: string; role: Role }[]> = {};
  private lookoutIntelQueue: Record<string, { watchedId: string; visitors: string[] }[]> = {};
  // Track who visited whom during the night (visitor -> target)
  private nightVisits: { visitorId: string; targetId: string }[] = [];
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
    this.phase = 'DAY_ONE_DISCUSSION';
    this.pendingNightKillTarget = undefined;
    this.pendingVigilanteKillTarget = undefined;
    this.pendingDoctorProtectTarget = undefined;
    this.pendingLookoutWatchTarget = undefined;
    this.pendingFramedTarget = undefined;
    this.vigilanteSkipNextNight = false;
    this.vigilanteGuiltyId = undefined;
    this.sheriffIntelQueue = {};
    this.lookoutIntelQueue = {};
    this.nightVisits = [];
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
    this.emitPhaseChange('DAY_ONE_DISCUSSION');
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
      pendingVigilanteKillTarget: this.pendingVigilanteKillTarget,
      pendingDoctorProtectTarget: this.pendingDoctorProtectTarget,
      pendingFramedTarget: this.pendingFramedTarget,
      sheriffIntelQueue: this.sheriffIntelQueue,
      vigilanteSkipNextNight: this.vigilanteSkipNextNight,
      vigilanteGuiltyId: this.vigilanteGuiltyId,
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
      case 'DAY_ONE_DISCUSSION':
        // First day has discussion only; go straight to night
        this.startNight();
        return;

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
        // After doctor, go to vigilante (if available)
        const vigilante = this.agentManager.getAliveVigilante();
        if (!vigilante || this.vigilanteSkipNextNight) {
          this.skipVigilantePhase();
          return;
        }
        this.emitPhaseChange('VIGILANTE_PRE_SPEECH');
        this.appendNarration('**Vigilante, gather your thoughts.**', VisibilityFilter.vigilantePrivate(vigilante.id));
        return;

      case 'VIGILANTE_PRE_SPEECH':
        // After vigilante deliberation, go to vigilante choice
        const activeVigilante = this.agentManager.getAliveVigilante();
        if (!activeVigilante || this.vigilanteSkipNextNight) {
          this.skipVigilantePhase();
          return;
        }
        this.emitPhaseChange('VIGILANTE_CHOICE');
        this.appendNarration('**Vigilante, choose your target.**', VisibilityFilter.vigilantePrivate(activeVigilante.id));
        return;

      case 'VIGILANTE_CHOICE':
        // After vigilante, go to framer (if available), then sheriff
        const framer = this.agentManager.getAliveFramer();
        if (!framer) {
          this.skipFramerPhase();
          return;
        }
        this.emitPhaseChange('FRAMER_CHOICE');
        this.appendNarration('**Framer, choose your target to frame.**', VisibilityFilter.framerPrivate(framer.id));
        return;

      case 'FRAMER_CHOICE':
        // After framer, go to sheriff
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

      case 'LOOKOUT_CHOICE':
        // After lookout choice, deliver results and go to lookout post-speech
        this.processLookoutIntel();
        this.deliverLookoutIntel();
        this.emitPhaseChange('LOOKOUT_POST_SPEECH');
        return;

      case 'LOOKOUT_POST_SPEECH':
        // After lookout speech, resolve night
        this.resolveNight();
        return;

      case 'NIGHT_VOTE':
        // After mafia vote, let the lookout act last if alive
        const postVoteLookout = this.agentManager.getAliveLookout();
        if (!postVoteLookout) {
          this.skipLookoutPhase();
          return;
        }
        this.emitPhaseChange('LOOKOUT_CHOICE');
        this.appendNarration(
          '**Lookout, choose your target to watch.**',
          VisibilityFilter.lookoutPrivate(postVoteLookout.id)
        );
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

  // Skip sheriff phase if dead - go to mafia discussion
  private skipSheriffPhase(): void {
    this.emitPhaseChange('NIGHT_DISCUSSION');
    this.appendNarration('**Mafia, discuss your plans.**', VisibilityFilter.mafia());
  }

  // Skip lookout phase if dead - resolve night immediately
  private skipLookoutPhase(): void {
    this.resolveNight();
  }

  // Skip doctor phase if dead - go to vigilante
  private skipDoctorPhase(): void {
    const vigilante = this.agentManager.getAliveVigilante();
    if (!vigilante || this.vigilanteSkipNextNight) {
      this.skipVigilantePhase();
      return;
    }
    this.emitPhaseChange('VIGILANTE_PRE_SPEECH');
    this.appendNarration('**Vigilante, gather your thoughts.**', VisibilityFilter.vigilantePrivate(vigilante.id));
  }

  // Skip vigilante phase if dead or skipping - go to framer, then sheriff
  private skipVigilantePhase(): void {
    if (this.vigilanteSkipNextNight) {
      const vigilante = this.agentManager.getAliveVigilante();
      if (vigilante) {
        this.appendNarration(
          '**Guilt overwhelms you tonight. You cannot act.**',
          VisibilityFilter.vigilantePrivate(vigilante.id)
        );
      }
      this.vigilanteSkipNextNight = false;
    }
    this.pendingVigilanteKillTarget = undefined;
    const framer = this.agentManager.getAliveFramer();
    if (framer) {
      this.emitPhaseChange('FRAMER_CHOICE');
      this.appendNarration('**Framer, choose your target to frame.**', VisibilityFilter.framerPrivate(framer.id));
      return;
    }
    this.skipFramerPhase();
  }

  // Skip framer phase if dead - go to sheriff
  private skipFramerPhase(): void {
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

    const morningMessages: string[] = [];
    const killTargets = new Map<string, Set<'MAFIA' | 'VIGILANTE'>>();

    if (this.pendingNightKillTarget) {
      const sources = killTargets.get(this.pendingNightKillTarget)
        ?? new Set<'MAFIA' | 'VIGILANTE'>();
      sources.add('MAFIA');
      killTargets.set(this.pendingNightKillTarget, sources);
    }

    if (this.pendingVigilanteKillTarget) {
      const sources = killTargets.get(this.pendingVigilanteKillTarget)
        ?? new Set<'MAFIA' | 'VIGILANTE'>();
      sources.add('VIGILANTE');
      killTargets.set(this.pendingVigilanteKillTarget, sources);
    }

    const vigilanteActor = this.agentManager.getAliveVigilante();

    for (const [targetId, sources] of killTargets.entries()) {
      const target = this.agentManager.getAgent(targetId);
      if (!target) continue;

      const isRevealedMayor = target.role === 'MAYOR' && target.hasRevealedMayor;
      const isProtected =
        !isRevealedMayor && this.pendingDoctorProtectTarget === targetId;

      if (isProtected) {
        morningMessages.push(
          `**${target.name} was attacked in the night, but was saved by the doctor!**`
        );
        continue;
      }

      const cause = sources.has('MAFIA') ? 'NIGHT_KILL' : 'VIGILANTE_KILL';
      this.eliminateAgent(targetId, cause);
      morningMessages.push(`**${target.name} was found dead in the morning.**`);

      if (sources.has('VIGILANTE') && target.faction === 'TOWN' && vigilanteActor) {
        this.vigilanteSkipNextNight = true;
        this.vigilanteGuiltyId = vigilanteActor.id;
      }
    }

    if (this.vigilanteGuiltyId && !this.vigilanteSkipNextNight) {
      const guiltyVigilante = this.agentManager.getAgent(this.vigilanteGuiltyId);
      if (guiltyVigilante && guiltyVigilante.alive) {
        this.eliminateAgent(guiltyVigilante.id, 'VIGILANTE_GUILT');
        morningMessages.push(`**${guiltyVigilante.name} was found dead from guilt.**`);
      }
      this.vigilanteGuiltyId = undefined;
    }

    // Clear pending actions
    this.pendingNightKillTarget = undefined;
    this.pendingVigilanteKillTarget = undefined;
    this.pendingDoctorProtectTarget = undefined;
    this.pendingLookoutWatchTarget = undefined;
    this.pendingFramedTarget = undefined;
    this.nightVisits = [];

    // Check win condition
    if (this.winner) return;

    // Start new day
    this.appendNarration(`**The start of Day ${this.dayNumber}**`, VisibilityFilter.public());
    if (morningMessages.length === 0) {
      this.appendNarration('**The night passed without incident.**', VisibilityFilter.public());
    } else {
      for (const message of morningMessages) {
        this.appendNarration(message, VisibilityFilter.public());
      }
    }

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

  // Process lookout intel from night visits
  private processLookoutIntel(): void {
    if (!this.pendingLookoutWatchTarget) return;

    const lookout = this.agentManager.getAliveLookout();
    if (!lookout) return;

    // Find all visitors to the watched target
    const visitors = this.nightVisits
      .filter((visit) => visit.targetId === this.pendingLookoutWatchTarget)
      .map((visit) => visit.visitorId);

    // Add intel to queue
    this.addLookoutIntel(lookout.id, this.pendingLookoutWatchTarget, visitors);
  }

  // Deliver pending lookout intel
  private deliverLookoutIntel(): void {
    for (const [lookoutId, intel] of Object.entries(this.lookoutIntelQueue)) {
      for (const item of intel) {
        const watched = this.agentManager.getAgent(item.watchedId);
        if (watched) {
          if (item.visitors.length === 0) {
            this.appendNarration(
              `**SYSTEM (private):** Last night you watched ${watched.name}. No one visited them.`,
              VisibilityFilter.lookoutPrivate(lookoutId)
            );
          } else {
            const visitorNames = item.visitors
              .map((id) => this.agentManager.getAgent(id)?.name)
              .filter((name) => name)
              .join(', ');
            this.appendNarration(
              `**SYSTEM (private):** Last night you watched ${watched.name}. They were visited by: ${visitorNames}.`,
              VisibilityFilter.lookoutPrivate(lookoutId)
            );
          }
        }
      }
    }
    this.lookoutIntelQueue = {};
  }

  // Add lookout intel to queue
  addLookoutIntel(lookoutId: string, watchedId: string, visitors: string[]): void {
    if (!this.lookoutIntelQueue[lookoutId]) {
      this.lookoutIntelQueue[lookoutId] = [];
    }
    this.lookoutIntelQueue[lookoutId].push({ watchedId, visitors });
  }

  // Set pending lookout watch target
  setPendingLookoutWatchTarget(targetId: string | undefined): void {
    this.pendingLookoutWatchTarget = targetId;
  }

  // Add a night visit (visitor visited target)
  addNightVisit(visitorId: string, targetId: string): void {
    this.nightVisits.push({ visitorId, targetId });
  }

  // Set pending night kill target
  setPendingNightKillTarget(targetId: string | undefined): void {
    this.pendingNightKillTarget = targetId;
  }

  // Set pending vigilante kill target
  setPendingVigilanteKillTarget(targetId: string | undefined): void {
    this.pendingVigilanteKillTarget = targetId;
  }

  // Get pending vigilante kill target
  getPendingVigilanteKillTarget(): string | undefined {
    return this.pendingVigilanteKillTarget;
  }

  // Set pending doctor protect target
  setPendingDoctorProtectTarget(targetId: string | undefined): void {
    this.pendingDoctorProtectTarget = targetId;
  }

  // Set pending framed target
  setPendingFramedTarget(targetId: string | undefined): void {
    this.pendingFramedTarget = targetId;
  }

  // Get pending framed target
  getPendingFramedTarget(): string | undefined {
    return this.pendingFramedTarget;
  }

  // Check if a target is currently framed
  isTargetFramed(targetId: string): boolean {
    return this.pendingFramedTarget === targetId;
  }

  // Add sheriff intel to queue
  addSheriffIntel(sheriffId: string, targetId: string, role: Role): void {
    if (!this.sheriffIntelQueue[sheriffId]) {
      this.sheriffIntelQueue[sheriffId] = [];
    }
    this.sheriffIntelQueue[sheriffId].push({ targetId, role });
  }

  // Eliminate an agent
  eliminateAgent(
    agentId: string,
    cause: 'DAY_ELIMINATION' | 'NIGHT_KILL' | 'VIGILANTE_KILL' | 'VIGILANTE_GUILT'
  ): void {
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
    if (!this.winner) {
      this.checkWinCondition();
    }
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
