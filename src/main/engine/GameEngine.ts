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
  TransitionEvent,
  AttackLevel,
  DefenseLevel,
  ROLE_TRAITS,
  doesAttackSucceed,
} from '../../shared/types';
import { AgentManager } from './AgentManager';
import { ConversationStore } from '../store/ConversationStore';
import { VisibilityFilter } from './Visibility';

// Convert number to ordinal word (First, Second, Third, etc.)
function numberToOrdinal(n: number): string {
  const ordinals = [
    'First', 'Second', 'Third', 'Fourth', 'Fifth',
    'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
    'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
  ];
  return ordinals[n - 1] || `${n}th`;
}

// Phase order for state machine (night phases per MECHANICS.md)
// Night order: Jailor → Execute → Doctor → Mafia discuss/vote → Framer → Consigliere → Sheriff → Vigilante → Werewolf → Lookout
const PHASE_ORDER: Phase[] = [
  'DAY_ONE_DISCUSSION',
  'DAY_DISCUSSION',
  'DAY_VOTE',
  'LAST_WORDS',
  'POST_EXECUTION_DISCUSSION',
  // Night phases - JAILOR FIRST:
  'JAILOR_CHOICE',
  'JAIL_CONVERSATION',
  'JAILOR_EXECUTE_CHOICE',
  // Doctor goes before Mafia so protection applies to immediate Mafia kills
  'DOCTOR_PRE_SPEECH',
  'DOCTOR_CHOICE',
  // Then Mafia
  'NIGHT_DISCUSSION',
  'NIGHT_VOTE',
  'FRAMER_PRE_SPEECH',
  'FRAMER_CHOICE',
  'CONSIGLIERE_CHOICE',
  'CONSIGLIERE_POST_SPEECH',
  'SHERIFF_CHOICE',
  'SHERIFF_POST_SPEECH',
  'VIGILANTE_PRE_SPEECH',
  'VIGILANTE_CHOICE',
  'WEREWOLF_PRE_SPEECH',
  'WEREWOLF_CHOICE',
  'LOOKOUT_CHOICE',
  'LOOKOUT_POST_SPEECH',
];

export interface GameEngineEvents {
  'event_appended': (event: GameEvent) => void;
  'phase_changed': (phase: Phase, dayNumber: number) => void;
  'game_over': (winner: Faction) => void;
  'agent_died': (
    agentId: string,
    cause: 'DAY_ELIMINATION' | 'NIGHT_KILL' | 'VIGILANTE_KILL' | 'VIGILANTE_GUILT' | 'WEREWOLF_KILL' | 'JAILOR_EXECUTE'
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
  private pendingWerewolfKillTarget?: string;
  private pendingDoctorProtectTarget?: string;
  private pendingLookoutWatchTarget?: string;
  private pendingFramedTarget?: string;  // Deprecated, kept for compatibility
  private persistentFramedTargets: Set<string> = new Set();  // Frames persist until investigated
  private vigilanteSkipNextNight: boolean = false;
  private vigilanteGuiltyId?: string;
  private vigilanteBulletsRemaining: number = 3;  // Vigilante has 3 bullets
  private sheriffIntelQueue: Record<string, { targetId: string; role: Role }[]> = {};
  private lookoutIntelQueue: Record<string, { watchedId: string; visitors: string[] }[]> = {};
  // Track who visited whom during the night (visitor -> target)
  private nightVisits: { visitorId: string; targetId: string }[] = [];
  private winner?: Faction;
  private lastWordsAgentId?: string;
  private isRunning: boolean = false;
  // Jailor state
  private pendingJailTarget?: string;
  private jailorExecutionsRemaining: number = 3;
  private jailorLostExecutionPower: boolean = false;
  private jailedThisNight: Set<string> = new Set();
  private pendingJailorExecution?: string;
  // Track immediate kills (processed before night resolution)
  private immediateNightKills: Map<string, 'MAFIA' | 'JAILOR_EXECUTE'> = new Map();
  // Track if Mafia attack was processed (killed or blocked by Doctor)
  private mafiaAttackProcessed: boolean = false;

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
    this.pendingWerewolfKillTarget = undefined;
    this.pendingDoctorProtectTarget = undefined;
    this.pendingLookoutWatchTarget = undefined;
    this.pendingFramedTarget = undefined;
    this.persistentFramedTargets.clear();  // Clear persistent frames
    this.vigilanteSkipNextNight = false;
    this.vigilanteGuiltyId = undefined;
    this.vigilanteBulletsRemaining = 3;  // Reset Vigilante bullets
    this.sheriffIntelQueue = {};
    this.lookoutIntelQueue = {};
    this.nightVisits = [];
    this.immediateNightKills.clear();
    this.mafiaAttackProcessed = false;
    this.winner = undefined;
    this.lastWordsAgentId = undefined;
    this.isRunning = false;
    // Reset Jailor state
    this.pendingJailTarget = undefined;
    this.jailorExecutionsRemaining = 3;
    this.jailorLostExecutionPower = false;
    this.jailedThisNight.clear();
    this.pendingJailorExecution = undefined;
  }

  // Start the game
  startGame(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Emit game start transition
    this.appendTransition('DAY', this.dayNumber);
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
      pendingWerewolfKillTarget: this.pendingWerewolfKillTarget,
      pendingDoctorProtectTarget: this.pendingDoctorProtectTarget,
      pendingFramedTarget: this.pendingFramedTarget,
      persistentFramedTargets: Array.from(this.persistentFramedTargets),
      sheriffIntelQueue: this.sheriffIntelQueue,
      vigilanteSkipNextNight: this.vigilanteSkipNextNight,
      vigilanteGuiltyId: this.vigilanteGuiltyId,
      vigilanteBulletsRemaining: this.vigilanteBulletsRemaining,
      pendingJailTarget: this.pendingJailTarget,
      jailorExecutionsRemaining: this.jailorExecutionsRemaining,
      jailorLostExecutionPower: this.jailorLostExecutionPower,
      jailedAgentIds: Array.from(this.jailedThisNight),
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

  // Append transition event (Day/Night cinematic banners)
  appendTransition(type: 'DAY' | 'NIGHT', dayNumber: number): void {
    const heading = type === 'DAY' ? 'Day Breaks' : 'Night Falls';
    const subtitle = type === 'DAY'
      ? `The Dawn of the ${numberToOrdinal(dayNumber)} Day`
      : 'The Village Stirs';

    const event: TransitionEvent = {
      type: 'TRANSITION',
      transitionType: type,
      heading,
      subtitle,
      visibility: VisibilityFilter.public(),
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
    // Handle special transitions based on current phase
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

      // Night phases - JAILOR FIRST:
      case 'JAILOR_CHOICE':
        // If a target was jailed, go to conversation
        if (this.pendingJailTarget) {
          this.jailedThisNight.add(this.pendingJailTarget);
          this.emitPhaseChange('JAIL_CONVERSATION');
          return;
        }
        // No target jailed, skip to Mafia
        this.goToMafiaDiscussion();
        return;

      case 'JAIL_CONVERSATION':
        // After conversation, Jailor decides whether to execute
        this.emitPhaseChange('JAILOR_EXECUTE_CHOICE');
        return;

      case 'JAILOR_EXECUTE_CHOICE':
        // After execution decision, go to Mafia discussion
        this.goToMafiaDiscussion();
        return;

      // Night phases per MECHANICS.md order:
      // 1. Mafia Discussion → Mafia Vote
      case 'NIGHT_DISCUSSION':
        this.transitionToNightVote();
        return;

      // 2. Mafia Vote → Framer (or skip to Consigliere/Sheriff)
      case 'NIGHT_VOTE':
        this.goToFramerPhase();
        return;

      // 3a. Framer Pre-Speech → Framer Choice
      case 'FRAMER_PRE_SPEECH':
        const activeFramer = this.agentManager.getAliveFramer();
        if (activeFramer) {
          this.emitPhaseChange('FRAMER_CHOICE');
          this.appendNarration('**Framer, choose your target to frame.**', VisibilityFilter.framerPrivate(activeFramer.id));
          return;
        }
        this.goToConsiglierePhase();
        return;

      // 3b. Framer Choice → Consigliere (or skip to Sheriff)
      case 'FRAMER_CHOICE':
        this.goToConsiglierePhase();
        return;

      // 4. Consigliere Choice → Consigliere Post-Speech
      case 'CONSIGLIERE_CHOICE':
        this.emitPhaseChange('CONSIGLIERE_POST_SPEECH');
        return;

      // 5. Consigliere Post-Speech → Sheriff (or skip to Doctor)
      case 'CONSIGLIERE_POST_SPEECH':
        this.goToSheriffPhase();
        return;

      // 5. Sheriff → Sheriff Post-Speech
      case 'SHERIFF_CHOICE':
        this.emitPhaseChange('SHERIFF_POST_SPEECH');
        return;

      // 6. Sheriff Post-Speech → Doctor (or skip to Vigilante)
      case 'SHERIFF_POST_SPEECH':
        this.goToDoctorPhase();
        return;

      // 7a. Doctor Pre-Speech → Doctor Choice
      case 'DOCTOR_PRE_SPEECH':
        const activeDoctor = this.agentManager.getAliveDoctor();
        if (activeDoctor) {
          this.emitPhaseChange('DOCTOR_CHOICE');
          this.appendNarration('**Doctor, choose your target to protect.**', VisibilityFilter.doctorPrivate(activeDoctor.id));
          return;
        }
        this.goToVigilantePhase();
        return;

      // 7b. Doctor Choice → Vigilante (or skip to Lookout)
      case 'DOCTOR_CHOICE':
        this.goToVigilantePhase();
        return;

      // 8. Vigilante Pre-Speech → Vigilante Choice
      case 'VIGILANTE_PRE_SPEECH':
        const activeVigilante = this.agentManager.getAliveVigilante();
        if (!activeVigilante || this.vigilanteSkipNextNight) {
          this.skipVigilanteToLookout();
          return;
        }
        this.emitPhaseChange('VIGILANTE_CHOICE');
        this.appendNarration('**Vigilante, choose your target.**', VisibilityFilter.vigilantePrivate(activeVigilante.id));
        return;

      // 9. Vigilante Choice → Werewolf (or skip to Lookout)
      case 'VIGILANTE_CHOICE':
        this.goToWerewolfPhase();
        return;

      // 10a. Werewolf Pre-Speech → Werewolf Choice
      case 'WEREWOLF_PRE_SPEECH':
        const activeWerewolf = this.agentManager.getAliveWerewolf();
        if (activeWerewolf && this.canWerewolfActTonight()) {
          this.emitPhaseChange('WEREWOLF_CHOICE');
          this.appendNarration('**Werewolf, choose your target.**', VisibilityFilter.werewolfPrivate(activeWerewolf.id));
          return;
        }
        this.goToLookoutPhase();
        return;

      // 10b. Werewolf Choice → Lookout (or resolve night)
      case 'WEREWOLF_CHOICE':
        this.goToLookoutPhase();
        return;

      // 10. Lookout Choice → Lookout Post-Speech
      case 'LOOKOUT_CHOICE':
        this.processLookoutIntel();
        this.deliverLookoutIntel();
        this.emitPhaseChange('LOOKOUT_POST_SPEECH');
        return;

      // 11. Lookout Post-Speech → Resolve Night
      case 'LOOKOUT_POST_SPEECH':
        this.resolveNight();
        return;

      // Post-game discussion → Finalize game
      case 'POST_GAME_DISCUSSION':
        this.finalizeGame();
        return;

      default:
        // Should not reach here during normal gameplay
        console.warn(`Unexpected phase transition from ${this.phase}`);
    }
  }

  // Start night phase
  private startNight(): void {
    this.appendTransition('NIGHT', this.dayNumber);

    // Check if mafia is alive
    if (this.agentManager.getAliveMafiaCount() === 0) {
      this.endGame('TOWN');
      return;
    }

    // Night starts with Jailor (if alive), then Mafia
    const jailor = this.agentManager.getAliveJailor();
    if (jailor) {
      this.emitPhaseChange('JAILOR_CHOICE');
      this.appendNarration('**Jailor, choose a player to jail.**', VisibilityFilter.jailorPrivate(jailor.id));
      return;
    }

    this.goToMafiaDiscussion();
  }

  // Go to Mafia discussion phase
  private goToMafiaDiscussion(): void {
    if (this.agentManager.getAliveMafiaCount() === 0) {
      this.endGame('TOWN');
      return;
    }
    this.emitPhaseChange('NIGHT_DISCUSSION');
    this.appendNarration('**Mafia, discuss your plans.**', VisibilityFilter.mafia());
  }

  // Night phase flow methods (per MECHANICS.md order)

  // Go to Framer phase (after Mafia vote)
  private goToFramerPhase(): void {
    const framer = this.agentManager.getAliveFramer();
    if (framer) {
      this.emitPhaseChange('FRAMER_PRE_SPEECH');
      this.appendNarration('**Framer, gather your thoughts.**', VisibilityFilter.framerPrivate(framer.id));
      return;
    }
    this.goToConsiglierePhase();
  }

  // Go to Consigliere phase (after Framer)
  private goToConsiglierePhase(): void {
    const consigliere = this.agentManager.getAliveConsigliere();
    if (consigliere) {
      this.emitPhaseChange('CONSIGLIERE_CHOICE');
      this.appendNarration('**Consigliere, choose your target to investigate.**', VisibilityFilter.consiglierePrivate(consigliere.id));
      return;
    }
    this.goToSheriffPhase();
  }

  // Go to Sheriff phase (after Consigliere)
  private goToSheriffPhase(): void {
    const sheriff = this.agentManager.getAliveSheriff();
    if (sheriff) {
      this.emitPhaseChange('SHERIFF_CHOICE');
      this.appendNarration('**Sheriff, choose your target.**', VisibilityFilter.sheriffPrivate(sheriff.id));
      return;
    }
    this.goToDoctorPhase();
  }

  // Go to Doctor phase (after Sheriff)
  private goToDoctorPhase(): void {
    const doctor = this.agentManager.getAliveDoctor();
    if (doctor) {
      this.emitPhaseChange('DOCTOR_PRE_SPEECH');
      this.appendNarration('**Doctor, gather your thoughts.**', VisibilityFilter.doctorPrivate(doctor.id));
      return;
    }
    this.goToVigilantePhase();
  }

  // Go to Vigilante phase (after Doctor)
  private goToVigilantePhase(): void {
    const vigilante = this.agentManager.getAliveVigilante();
    // Skip if no vigilante, skipping due to guilt, or out of bullets
    if (!vigilante || this.vigilanteSkipNextNight || this.vigilanteBulletsRemaining <= 0) {
      this.skipVigilanteToLookout();
      return;
    }
    this.emitPhaseChange('VIGILANTE_PRE_SPEECH');
    this.appendNarration('**Vigilante, gather your thoughts.**', VisibilityFilter.vigilantePrivate(vigilante.id));
  }

  // Skip Vigilante and go to Lookout (or resolve night)
  private skipVigilanteToLookout(): void {
    const vigilante = this.agentManager.getAliveVigilante();

    if (this.vigilanteSkipNextNight && vigilante) {
      this.appendNarration(
        '**Guilt overwhelms you tonight. You cannot act.**',
        VisibilityFilter.vigilantePrivate(vigilante.id)
      );
      this.vigilanteSkipNextNight = false;
    } else if (this.vigilanteBulletsRemaining <= 0 && vigilante) {
      this.appendNarration(
        '**You have no bullets remaining.**',
        VisibilityFilter.vigilantePrivate(vigilante.id)
      );
    }

    this.pendingVigilanteKillTarget = undefined;
    this.goToWerewolfPhase();
  }

  // Go to Werewolf phase (after Vigilante)
  private goToWerewolfPhase(): void {
    const werewolf = this.agentManager.getAliveWerewolf();
    if (!werewolf) {
      this.goToLookoutPhase();
      return;
    }

    // Always emit phase change to show "Werewolf's Turn" banner
    this.emitPhaseChange('WEREWOLF_PRE_SPEECH');

    if (this.canWerewolfActTonight()) {
      this.appendNarration('**Werewolf, gather your thoughts.**', VisibilityFilter.werewolfPrivate(werewolf.id));
      return;
    }

    // Notify werewolf they can't act tonight, then skip to lookout
    this.appendNarration(
      '**The full moon is not out tonight. You cannot act.**',
      VisibilityFilter.werewolfPrivate(werewolf.id)
    );
    this.goToLookoutPhase();
  }

  // Check if werewolf can act tonight (even nights only: 2, 4, 6, 8...)
  canWerewolfActTonight(): boolean {
    return this.dayNumber % 2 === 0;
  }

  // Check if werewolf is detection immune tonight (nights 1 and 3)
  isWerewolfDetectionImmuneTonight(): boolean {
    return this.dayNumber === 1 || this.dayNumber === 3;
  }

  // Go to Lookout phase (after Vigilante)
  private goToLookoutPhase(): void {
    const lookout = this.agentManager.getAliveLookout();
    if (lookout) {
      this.emitPhaseChange('LOOKOUT_CHOICE');
      this.appendNarration(
        '**Lookout, choose your target to watch.**',
        VisibilityFilter.lookoutPrivate(lookout.id)
      );
      return;
    }
    // No lookout - resolve night immediately
    this.resolveNight();
  }

  // Calculate effective defense for a target (includes Doctor protection and jail)
  private getEffectiveDefense(targetId: string): DefenseLevel {
    const target = this.agentManager.getAgent(targetId);
    if (!target) return 'NONE';

    // Jailed agents have POWERFUL defense (protected by the Jailor)
    if (this.jailedThisNight.has(targetId)) {
      return 'POWERFUL';
    }

    // Revealed Mayor cannot be healed
    const isRevealedMayor = target.role === 'MAYOR' && target.hasRevealedMayor;

    // Doctor protection grants POWERFUL defense (unless revealed Mayor)
    if (!isRevealedMayor && this.pendingDoctorProtectTarget === targetId) {
      return 'POWERFUL';
    }

    // Return base defense from role traits
    return ROLE_TRAITS[target.role].defense;
  }

  // Notify attacker their target was immune
  private notifyAttackerImmune(attackerSource: 'MAFIA' | 'VIGILANTE' | 'WEREWOLF', targetId: string): void {
    const target = this.agentManager.getAgent(targetId);
    if (!target) return;

    if (attackerSource === 'MAFIA') {
      this.appendNarration(
        `**Your target was immune to your attack.**`,
        VisibilityFilter.mafia()
      );
    } else if (attackerSource === 'VIGILANTE') {
      const vigilante = this.agentManager.getAliveVigilante();
      if (vigilante) {
        this.appendNarration(
          `**Your target was immune to your attack.**`,
          VisibilityFilter.vigilantePrivate(vigilante.id)
        );
      }
    } else {
      const werewolf = this.agentManager.getAliveWerewolf();
      if (werewolf) {
        this.appendNarration(
          `**Your target was immune to your attack.**`,
          VisibilityFilter.werewolfPrivate(werewolf.id)
        );
      }
    }
  }

  // Notify Doctor of successful save
  private notifyDoctorSaved(targetId: string): void {
    const doctor = this.agentManager.getAliveDoctor();
    const target = this.agentManager.getAgent(targetId);
    if (!doctor || !target) return;

    this.appendNarration(
      `**You successfully protected ${target.name} from an attack!**`,
      VisibilityFilter.doctorPrivate(doctor.id)
    );
  }

  // Notify target they were healed (shown in morning narration)
  private notifyTargetHealed(targetId: string): void {
    // This is handled via the morning narration message
    // Target sees the public message about being saved
  }

  // Get innate defense for a target (excludes Doctor protection, used for immediate kills)
  getInnateDefense(targetId: string): DefenseLevel {
    const target = this.agentManager.getAgent(targetId);
    if (!target) return 'NONE';

    // Jailed agents have POWERFUL defense (protected by the Jailor)
    if (this.jailedThisNight.has(targetId)) {
      return 'POWERFUL';
    }

    // Return base defense from role traits
    return ROLE_TRAITS[target.role].defense;
  }

  // Execute immediate Jailor kill (UNSTOPPABLE - always succeeds)
  executeImmediateJailorKill(targetId: string): void {
    const target = this.agentManager.getAgent(targetId);
    if (!target || !target.alive) return;

    this.eliminateAgent(targetId, 'JAILOR_EXECUTE');
    this.immediateNightKills.set(targetId, 'JAILOR_EXECUTE');
  }

  // Execute immediate Mafia kill (BASIC attack - checks defense including Doctor protection)
  // Returns true if kill succeeded, false if target was immune or protected
  executeImmediateMafiaKill(targetId: string): boolean {
    const target = this.agentManager.getAgent(targetId);
    if (!target || !target.alive) return false;

    this.mafiaAttackProcessed = true;

    // Doctor goes before Mafia, so check effective defense (includes Doctor protection)
    const defense = this.getEffectiveDefense(targetId);
    const wasProtectedByDoctor = this.pendingDoctorProtectTarget === targetId;
    const attack: AttackLevel = 'BASIC';

    if (doesAttackSucceed(attack, defense)) {
      this.eliminateAgent(targetId, 'NIGHT_KILL');
      this.immediateNightKills.set(targetId, 'MAFIA');
      return true;
    } else {
      // Target was protected or immune
      if (wasProtectedByDoctor) {
        // Blocked by Doctor protection - notify Doctor privately
        this.notifyDoctorSaved(targetId);
        // Public announcement will appear in morning via resolveNight
      } else {
        // Blocked by innate defense - notify Mafia only
        this.notifyAttackerImmune('MAFIA', targetId);
      }
      return false;
    }
  }

  // Check if an agent was killed immediately this night
  wasKilledImmediately(agentId: string): boolean {
    return this.immediateNightKills.has(agentId);
  }

  // Get the cause of immediate kill
  getImmediateKillCause(agentId: string): 'MAFIA' | 'JAILOR_EXECUTE' | undefined {
    return this.immediateNightKills.get(agentId);
  }

  // Resolve night and start new day
  private resolveNight(): void {
    // Save night number BEFORE incrementing (used for Werewolf full moon check)
    const nightNumber = this.dayNumber;
    const wasFullMoon = nightNumber % 2 === 0;  // Even nights: 2, 4, 6, 8...
    this.dayNumber++;

    const morningMessages: string[] = [];
    const killTargets = new Map<string, Set<'MAFIA' | 'VIGILANTE'>>();
    const werewolfKills = new Set<string>();  // Track werewolf rampage victims
    const jailor = this.agentManager.getAliveJailor();
    const werewolf = this.agentManager.getAliveWerewolf();

    // Check for Werewolf-Jailor interaction FIRST
    // If Werewolf is jailed on a full moon night, Werewolf kills Jailor + anyone who visits Jailor
    let werewolfKilledJailor = false;
    if (werewolf && jailor && this.isAgentJailed(werewolf.id) && wasFullMoon) {
      werewolfKilledJailor = true;
      // Werewolf kills Jailor
      this.eliminateAgent(jailor.id, 'WEREWOLF_KILL');
      morningMessages.push(`**${jailor.name} was mauled by their prisoner!**`);

      // Kill anyone who visited the Jailor
      const visitorsToJailor = this.nightVisits
        .filter((visit) => visit.targetId === jailor.id)
        .map((visit) => visit.visitorId);
      for (const visitorId of visitorsToJailor) {
        const visitor = this.agentManager.getAgent(visitorId);
        if (visitor && visitor.alive) {
          this.eliminateAgent(visitorId, 'WEREWOLF_KILL');
          morningMessages.push(`**${visitor.name} was mauled by a werewolf.**`);
        }
      }

      // Clear Jailor execution (Jailor is dead, can't execute)
      this.pendingJailorExecution = undefined;
    }

    // Process Jailor execution FIRST (UNSTOPPABLE attack - nothing can stop it)
    // Only if Werewolf didn't kill the Jailor
    if (!werewolfKilledJailor && this.pendingJailorExecution) {
      const prisoner = this.agentManager.getAgent(this.pendingJailorExecution);
      if (prisoner) {
        // Check if already killed immediately during the phase
        if (this.wasKilledImmediately(prisoner.id) && this.getImmediateKillCause(prisoner.id) === 'JAILOR_EXECUTE') {
          // Already executed - just add morning message
          morningMessages.push(`**${prisoner.name} was executed by the Jailor.**`);
        } else if (prisoner.alive) {
          // Not yet executed - execute now
          this.eliminateAgent(prisoner.id, 'JAILOR_EXECUTE');
          morningMessages.push(`**${prisoner.name} was executed by the Jailor.**`);
        }
      }
    }

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

    // Process werewolf rampage (POWERFUL attack) - skip if werewolf is jailed
    if (this.pendingWerewolfKillTarget && werewolf && !this.isAgentJailed(werewolf.id)) {
      const isStayingHome = this.pendingWerewolfKillTarget === werewolf.id;

      if (isStayingHome) {
        // Werewolf stays home - kill anyone who visits them
        const visitorsToWerewolf = this.nightVisits
          .filter((visit) => visit.targetId === werewolf.id)
          .map((visit) => visit.visitorId);
        for (const visitorId of visitorsToWerewolf) {
          werewolfKills.add(visitorId);
        }
      } else {
        // Werewolf attacks target + all visitors to that target
        werewolfKills.add(this.pendingWerewolfKillTarget);

        // Get all visitors to the werewolf's target
        const visitorsToTarget = this.nightVisits
          .filter((visit) => visit.targetId === this.pendingWerewolfKillTarget)
          .map((visit) => visit.visitorId);

        for (const visitorId of visitorsToTarget) {
          // Don't add the werewolf itself as a victim
          if (visitorId !== werewolf.id) {
            werewolfKills.add(visitorId);
          }
        }
      }
    }

    const vigilanteActor = this.agentManager.getAliveVigilante();

    // Process Mafia/Vigilante kills
    for (const [targetId, sources] of killTargets.entries()) {
      const target = this.agentManager.getAgent(targetId);
      if (!target) continue;

      const wasProtectedByDoctor = this.pendingDoctorProtectTarget === targetId;

      // Handle Mafia attack that was already processed immediately
      if (sources.has('MAFIA') && this.mafiaAttackProcessed) {
        if (this.wasKilledImmediately(targetId) && this.getImmediateKillCause(targetId) === 'MAFIA') {
          // Mafia killed target immediately - add morning message
          morningMessages.push(`**${target.name} was found dead in the morning.**`);
        } else if (wasProtectedByDoctor) {
          // Mafia attack was blocked by Doctor - add morning message (Doctor already notified)
          morningMessages.push(
            `**${target.name} was attacked in the night, but was saved by the doctor!**`
          );
        }
        // If only Mafia targeted this agent, skip to next target
        if (!sources.has('VIGILANTE')) {
          continue;
        }
        // Otherwise, still need to process Vigilante attack
        sources.delete('MAFIA');
      }

      // Get effective defense (includes Doctor protection)
      const targetDefense = this.getEffectiveDefense(targetId);

      // Check each attack source
      let targetKilled = false;
      for (const source of sources) {
        // Get attack level based on source
        let attackLevel: AttackLevel = 'BASIC';  // Both Mafia and Vigilante have BASIC attack

        // Check if attack succeeds against defense
        if (doesAttackSucceed(attackLevel, targetDefense)) {
          // Attack succeeded
          targetKilled = true;
        } else {
          // Attack was blocked
          if (wasProtectedByDoctor) {
            // Blocked by Doctor protection - notify both
            this.notifyDoctorSaved(targetId);
            morningMessages.push(
              `**${target.name} was attacked in the night, but was saved by the doctor!**`
            );
          } else {
            // Blocked by innate defense (Godfather) - notify attacker only
            this.notifyAttackerImmune(source, targetId);
          }
        }
      }

      if (targetKilled) {
        const cause = sources.has('MAFIA') ? 'NIGHT_KILL' : 'VIGILANTE_KILL';
        this.eliminateAgent(targetId, cause);
        morningMessages.push(`**${target.name} was found dead in the morning.**`);

        // Check for Vigilante guilt
        if (sources.has('VIGILANTE') && target.faction === 'TOWN' && vigilanteActor) {
          this.vigilanteSkipNextNight = true;
          this.vigilanteGuiltyId = vigilanteActor.id;
        }
      }
    }

    // Process werewolf rampage kills (POWERFUL attack)
    for (const victimId of werewolfKills) {
      const victim = this.agentManager.getAgent(victimId);
      if (!victim || !victim.alive) continue;  // Skip if already dead from other attacks

      const victimDefense = this.getEffectiveDefense(victimId);
      const wasProtectedByDoctor = this.pendingDoctorProtectTarget === victimId;
      const attackLevel: AttackLevel = 'POWERFUL';  // Werewolf has POWERFUL attack

      if (doesAttackSucceed(attackLevel, victimDefense)) {
        // Werewolf attack succeeded
        this.eliminateAgent(victimId, 'WEREWOLF_KILL');
        morningMessages.push(`**${victim.name} was mauled by a werewolf.**`);
      } else {
        // Attack was blocked (only by Doctor's POWERFUL protection)
        if (wasProtectedByDoctor) {
          this.notifyDoctorSaved(victimId);
          morningMessages.push(
            `**${victim.name} was attacked in the night, but was saved by the doctor!**`
          );
        } else {
          // Shouldn't happen (no innate defense blocks POWERFUL), but handle gracefully
          this.notifyAttackerImmune('WEREWOLF', victimId);
        }
      }
    }

    // Handle Vigilante guilt death (from previous night's Town kill)
    if (this.vigilanteGuiltyId && !this.vigilanteSkipNextNight) {
      const guiltyVigilante = this.agentManager.getAgent(this.vigilanteGuiltyId);
      if (guiltyVigilante && guiltyVigilante.alive) {
        this.eliminateAgent(guiltyVigilante.id, 'VIGILANTE_GUILT');
        morningMessages.push(`**${guiltyVigilante.name} was found dead from guilt.**`);
      }
      this.vigilanteGuiltyId = undefined;
    }

    // Clear pending actions (but NOT persistentFramedTargets - those persist!)
    this.pendingNightKillTarget = undefined;
    this.pendingVigilanteKillTarget = undefined;
    this.pendingWerewolfKillTarget = undefined;
    this.pendingDoctorProtectTarget = undefined;
    this.pendingLookoutWatchTarget = undefined;
    this.pendingFramedTarget = undefined;  // Deprecated, kept for compatibility
    this.nightVisits = [];
    this.immediateNightKills.clear();  // Clear immediate kills tracking
    this.mafiaAttackProcessed = false;  // Reset Mafia attack tracking
    // Clear Jailor state for next night
    this.pendingJailTarget = undefined;
    this.pendingJailorExecution = undefined;
    this.jailedThisNight.clear();

    // Check win condition
    if (this.winner) return;

    // Start new day
    this.appendTransition('DAY', this.dayNumber);
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

  // Set pending werewolf kill target
  setPendingWerewolfKillTarget(targetId: string | undefined): void {
    this.pendingWerewolfKillTarget = targetId;
  }

  // Get pending werewolf kill target
  getPendingWerewolfKillTarget(): string | undefined {
    return this.pendingWerewolfKillTarget;
  }

  // Set pending doctor protect target
  setPendingDoctorProtectTarget(targetId: string | undefined): void {
    this.pendingDoctorProtectTarget = targetId;
  }

  // Set pending framed target (deprecated - use addFramedTarget instead)
  setPendingFramedTarget(targetId: string | undefined): void {
    this.pendingFramedTarget = targetId;
    // Also add to persistent set
    if (targetId) {
      this.persistentFramedTargets.add(targetId);
    }
  }

  // Get pending framed target (deprecated)
  getPendingFramedTarget(): string | undefined {
    return this.pendingFramedTarget;
  }

  // Add a framed target (persists until investigated)
  addFramedTarget(targetId: string): void {
    this.persistentFramedTargets.add(targetId);
    this.pendingFramedTarget = targetId;  // For compatibility
  }

  // Check if a target is currently framed (without consuming)
  isTargetFramed(targetId: string): boolean {
    return this.persistentFramedTargets.has(targetId);
  }

  // Consume frame if exists (called when Sheriff investigates)
  // Returns true if frame was consumed
  consumeFrameIfExists(targetId: string): boolean {
    if (this.persistentFramedTargets.has(targetId)) {
      this.persistentFramedTargets.delete(targetId);
      return true;
    }
    return false;
  }

  // Check if Vigilante can shoot (has bullets and not skipping)
  canVigilanteShoot(): boolean {
    return this.vigilanteBulletsRemaining > 0 && !this.vigilanteSkipNextNight;
  }

  // Use a Vigilante bullet
  // Returns true if bullet was used, false if no bullets remaining
  useVigilanteBullet(): boolean {
    if (this.vigilanteBulletsRemaining <= 0) return false;
    this.vigilanteBulletsRemaining--;
    return true;
  }

  // Get remaining Vigilante bullets
  getVigilanteBulletsRemaining(): number {
    return this.vigilanteBulletsRemaining;
  }

  // =====================================================
  // Jailor Methods
  // =====================================================

  // Set pending jail target
  setPendingJailTarget(targetId: string | undefined): void {
    this.pendingJailTarget = targetId;
  }

  // Get pending jail target
  getPendingJailTarget(): string | undefined {
    return this.pendingJailTarget;
  }

  // Check if an agent is jailed this night
  isAgentJailed(agentId: string): boolean {
    return this.jailedThisNight.has(agentId);
  }

  // Get Jailor executions remaining
  getJailorExecutionsRemaining(): number {
    return this.jailorExecutionsRemaining;
  }

  // Check if Jailor has execution power
  hasJailorExecutionPower(): boolean {
    return this.jailorExecutionsRemaining > 0 && !this.jailorLostExecutionPower;
  }

  // Use a Jailor execution
  // Returns true if execution was used, false if no executions remaining
  useJailorExecution(): boolean {
    if (!this.hasJailorExecutionPower()) return false;
    this.jailorExecutionsRemaining--;
    return true;
  }

  // Set Jailor lost execution power (executed a Town member)
  setJailorLostExecutionPower(): void {
    this.jailorLostExecutionPower = true;
  }

  // Check if Jailor lost execution power
  hasJailorLostExecutionPower(): boolean {
    return this.jailorLostExecutionPower;
  }

  // Set pending Jailor execution target
  setPendingJailorExecution(targetId: string | undefined): void {
    this.pendingJailorExecution = targetId;
  }

  // Get pending Jailor execution target
  getPendingJailorExecution(): string | undefined {
    return this.pendingJailorExecution;
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
    cause: 'DAY_ELIMINATION' | 'NIGHT_KILL' | 'VIGILANTE_KILL' | 'VIGILANTE_GUILT' | 'WEREWOLF_KILL' | 'JAILOR_EXECUTE'
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
    const aliveWerewolf = this.agentManager.getAliveWerewolf();
    const aliveTotal = this.agentManager.getAliveCount();

    // Werewolf wins if they are the ONLY survivor
    if (aliveWerewolf && aliveTotal === 1) {
      this.endGame('NEUTRAL');
      return 'NEUTRAL';
    }

    // If werewolf is alive, game continues (blocks normal Town/Mafia win)
    // unless they're the only one left (handled above)
    if (aliveWerewolf) {
      // Check if it's just werewolf vs one other faction
      if (aliveMafia === 0 && aliveTown === 0) {
        // Werewolf is alone - they win (should be caught above, but safety check)
        this.endGame('NEUTRAL');
        return 'NEUTRAL';
      }
      // Game continues - werewolf still needs to eliminate everyone
      return undefined;
    }

    // Standard win conditions (no werewolf alive)
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

  // End the game - transitions to post-game discussion
  private endGame(winner: Faction): void {
    this.winner = winner;

    let message: string;
    if (winner === 'TOWN') {
      message = '**The Town wins! All mafia members have been eliminated.**';
    } else if (winner === 'MAFIA') {
      message = '**The Mafia wins! They have achieved parity with the town.**';
    } else {
      message = '**The Werewolf wins! They are the last one standing.**';
    }

    this.appendNarration(message, VisibilityFilter.public());
    this.emitPhaseChange('POST_GAME_DISCUSSION');
  }

  // Finalize the game after post-game discussion
  finalizeGame(): void {
    if (!this.winner) return;
    this.isRunning = false;
    this.emit('game_over', this.winner);
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
