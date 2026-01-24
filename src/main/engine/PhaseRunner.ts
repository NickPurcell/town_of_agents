import { EventEmitter } from 'events';
import {
  GameAgent,
  Phase,
  SpeechEvent,
  VoteEvent,
  ChoiceEvent,
  SpeakResponse,
  VoteResponse,
  ChoiceResponse,
  GameSettings,
  ROLE_TRAITS,
} from '../../shared/types';
import { GameEngine } from './GameEngine';
import { VoteResolver } from './VoteResolver';
import { VisibilityFilter } from './Visibility';

export interface PhaseRunnerEvents {
  'discussion_started': (phase: Phase) => void;
  'discussion_ended': (phase: Phase) => void;
  'voting_started': (phase: Phase) => void;
  'voting_ended': (phase: Phase) => void;
  'agent_speak_request': (agent: GameAgent, phase: Phase, turnId: number) => void;
  'agent_vote_request': (agent: GameAgent, phase: Phase, turnId: number) => void;
  'agent_choice_request': (agent: GameAgent, phase: Phase, turnId: number) => void;
}

export class PhaseRunner extends EventEmitter {
  private engine: GameEngine;
  private settings: GameSettings;

  // Round-robin state for discussions
  private roundRobinOrder: GameAgent[] = [];
  private currentAgentIndex: number = 0;
  private roundsCompleted: number = 0;
  private turnTimer: NodeJS.Timeout | null = null;
  private currentTurnAgentId: string | null = null;
  private currentTurnId: number = 0;
  private nextTurnId: number = 1;
  private isPaused: boolean = false;
  private pendingResumeAction: (() => void) | null = null;

  // Discussion state
  private isDiscussionActive: boolean = false;

  // Voting state
  private pendingVotes: Map<string, string | 'DEFER'> = new Map();
  private awaitingVotes: Set<string> = new Set();
  private mafiaVoteAttempts: number = 0;
  private voteRetryAttempts: number = 0;
  private isVotingActive: boolean = false;
  private currentVotingAgentIndex: number = 0;

  constructor(engine: GameEngine) {
    super();
    this.engine = engine;
    this.settings = engine.getSettings();
    console.log('PhaseRunner settings:', JSON.stringify(this.settings));
  }

  // Fisher-Yates shuffle
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Start turn timeout
  private startTurnTimeout(): void {
    this.clearTurnTimeout();
    const timeoutMs = this.settings.turnTimeoutSec * 1000;
    console.log(`Starting timeout: ${this.settings.turnTimeoutSec} seconds (${timeoutMs}ms)`);
    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout();
    }, timeoutMs);
  }

  private deferIfPaused(action: () => void): boolean {
    if (!this.isPaused) return false;
    if (!this.pendingResumeAction) {
      this.pendingResumeAction = action;
    }
    return true;
  }

  // Clear turn timeout
  private clearTurnTimeout(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  isTurnActive(turnId: number): boolean {
    return this.currentTurnId === turnId;
  }

  notifyResponseStarted(turnId: number): void {
    console.log(`notifyResponseStarted called: turnId=${turnId}, currentTurnId=${this.currentTurnId}`);
    if (this.currentTurnId === turnId) {
      console.log(`Clearing timeout for turnId ${turnId}`);
      this.clearTurnTimeout();
    } else {
      console.log(`NOT clearing timeout - turnId mismatch`);
    }
  }

  // Handle turn timeout - treat as DEFER and advance
  private handleTurnTimeout(): void {
    console.log(`TIMEOUT FIRED for agent index ${this.currentAgentIndex}`);
    if (this.isDiscussionActive) {
      // Timeout during discussion - treat as DEFER, advance to next
      const currentAgent = this.roundRobinOrder[this.currentAgentIndex];
      if (currentAgent) {
        this.handleSpeechResponse(currentAgent, {
          type: 'speak',
          action: 'DEFER',
          message_markdown: '',
        });
      } else {
        this.endDiscussion();
      }
    } else if (this.isVotingActive) {
      // Timeout during voting - record DEFER vote and advance
      const currentAgent = this.roundRobinOrder[this.currentVotingAgentIndex];
      if (currentAgent && this.awaitingVotes.has(currentAgent.id)) {
        this.recordVote(currentAgent, 'DEFER');
        this.advanceToNextVotingAgent();
      }
    } else {
      // Timeout during choice phases - skip action
      const phase = this.engine.getCurrentPhase();
      if (
        phase === 'SHERIFF_CHOICE' ||
        phase === 'DOCTOR_CHOICE' ||
        phase === 'LOOKOUT_CHOICE' ||
        phase === 'VIGILANTE_CHOICE' ||
        phase === 'FRAMER_CHOICE' ||
        phase === 'CONSIGLIERE_CHOICE' ||
        phase === 'WEREWOLF_CHOICE'
      ) {
        this.clearTurnTimeout();
        this.currentTurnAgentId = null;
        this.currentTurnId = 0;
        this.engine.nextPhase();
      }
    }
  }

  // Start a discussion phase with round-robin
  async startDiscussionPhase(): Promise<void> {
    const phase = this.engine.getCurrentPhase();
    this.isDiscussionActive = true;
    this.roundsCompleted = 0;
    this.currentAgentIndex = 0;

    // Get participants and shuffle them
    const participants = this.getDiscussionParticipants();
    this.roundRobinOrder = this.shuffleArray(participants);

    this.emit('discussion_started', phase);

    // Start with the first agent
    this.promptNextDiscussionAgent();
  }

  // Prompt the next agent in round-robin order
  private promptNextDiscussionAgent(): void {
    if (!this.isDiscussionActive) return;
    if (this.deferIfPaused(() => this.promptNextDiscussionAgent())) return;

    const phase = this.engine.getCurrentPhase();
    // Post-execution and first day only get 1 round
    const totalRounds = (phase === 'POST_EXECUTION_DISCUSSION' || phase === 'DAY_ONE_DISCUSSION')
      ? 1
      : this.settings.roundsPerDiscussion;
    const totalAgents = this.roundRobinOrder.length;

    // Check if we've completed all rounds
    if (this.roundsCompleted >= totalRounds) {
      this.endDiscussion();
      return;
    }

    // Check if there are no agents
    if (totalAgents === 0) {
      this.endDiscussion();
      return;
    }

    const currentAgent = this.roundRobinOrder[this.currentAgentIndex];

    // Skip dead agents
    if (!currentAgent.alive) {
      this.advanceToNextDiscussionAgent();
      return;
    }

    this.currentTurnAgentId = currentAgent.id;
    this.currentTurnId = this.nextTurnId++;

    // Start timeout for this agent's turn
    this.startTurnTimeout();

    // Emit request for agent to speak
    console.log(`[TIMING] PhaseRunner: Emitting speak request for ${currentAgent.name} at ${new Date().toISOString()}`);
    this.emit('agent_speak_request', currentAgent, this.engine.getCurrentPhase(), this.currentTurnId);
  }

  // Advance to the next agent in discussion
  private advanceToNextDiscussionAgent(): void {
    this.clearTurnTimeout();
    this.currentTurnAgentId = null;
    this.currentTurnId = 0;

    this.currentAgentIndex++;

    // Check if we've gone through all agents this round
    if (this.currentAgentIndex >= this.roundRobinOrder.length) {
      this.currentAgentIndex = 0;
      this.roundsCompleted++;
    }

    const nextAgent = this.roundRobinOrder[this.currentAgentIndex];
    console.log(`[TIMING] PhaseRunner: Advancing to next agent: ${nextAgent?.name ?? 'none'} at ${new Date().toISOString()}`);

    // Continue to next agent
    this.promptNextDiscussionAgent();
  }

  // Get agents who should participate in current discussion
  private getDiscussionParticipants(): GameAgent[] {
    const phase = this.engine.getCurrentPhase();
    const agentManager = this.engine.getAgentManager();

    switch (phase) {
      case 'DAY_ONE_DISCUSSION':
      case 'DAY_DISCUSSION':
      case 'POST_EXECUTION_DISCUSSION':
        return agentManager.getAliveAgents();
      case 'NIGHT_DISCUSSION':
        return agentManager.getAliveMafia();
      default:
        return [];
    }
  }

  private findTargetByName(targetName: string, candidates: GameAgent[]): GameAgent | undefined {
    const normalized = targetName.trim().toLowerCase();
    if (!normalized) return undefined;
    return candidates.find((candidate) => candidate.name.toLowerCase() === normalized);
  }

  // Handle agent speech response
  handleSpeechResponse(agent: GameAgent, response: SpeakResponse, reasoning?: string): void {
    if (!this.isDiscussionActive) return;

    // Verify this is the current agent's turn
    if (agent.id !== this.currentTurnAgentId) return;

    console.log(`[TIMING] PhaseRunner: ${agent.name} speech response handled at ${new Date().toISOString()}`);
    this.clearTurnTimeout();

    const phase = this.engine.getCurrentPhase();
    const visibility =
      phase === 'NIGHT_DISCUSSION'
        ? VisibilityFilter.mafia()
        : VisibilityFilter.public();
    const trimmedMessage = response.message_markdown?.trim() ?? '';
    const messageMarkdown =
      response.action === 'SAY' && trimmedMessage.length > 0
        ? response.message_markdown
        : '*chose not to speak.*';

    const event: SpeechEvent = {
      type: 'SPEECH',
      agentId: agent.id,
      messageMarkdown,
      visibility,
      ts: Date.now(),
      reasoning,
    };
    this.engine.appendEvent(event);

    // Advance to next agent
    this.advanceToNextDiscussionAgent();
  }

  // End discussion phase
  private endDiscussion(): void {
    this.isDiscussionActive = false;
    this.clearTurnTimeout();
    this.currentTurnAgentId = null;
    this.currentTurnId = 0;

    const phase = this.engine.getCurrentPhase();
    this.emit('discussion_ended', phase);
  }

  // Force end discussion (called externally)
  forceEndDiscussion(): void {
    this.endDiscussion();
  }

  // Start voting phase - reuse round-robin order from discussion
  async startVotingPhase(): Promise<void> {
    const phase = this.engine.getCurrentPhase();
    this.pendingVotes.clear();
    this.awaitingVotes.clear();
    this.isVotingActive = true;
    this.currentVotingAgentIndex = 0;

    // Use the same order from discussion (already shuffled)
    // If roundRobinOrder is empty (e.g., voting started without prior discussion), shuffle voters
    const voters = this.getVoters();
    if (this.roundRobinOrder.length === 0 || !this.ordersMatch(this.roundRobinOrder, voters)) {
      this.roundRobinOrder = this.shuffleArray(voters);
    }

    for (const voter of this.roundRobinOrder) {
      if (voters.find(v => v.id === voter.id)) {
        this.awaitingVotes.add(voter.id);
      }
    }

    this.emit('voting_started', phase);

    // Start with the first voter
    this.promptNextVotingAgent();
  }

  // Check if two agent lists match (by id)
  private ordersMatch(order: GameAgent[], voters: GameAgent[]): boolean {
    if (order.length !== voters.length) return false;
    const orderIds = new Set(order.map(a => a.id));
    return voters.every(v => orderIds.has(v.id));
  }

  // Prompt the next agent to vote
  private promptNextVotingAgent(): void {
    if (!this.isVotingActive) return;
    if (this.deferIfPaused(() => this.promptNextVotingAgent())) return;

    // Find next agent who still needs to vote
    while (this.currentVotingAgentIndex < this.roundRobinOrder.length) {
      const currentAgent = this.roundRobinOrder[this.currentVotingAgentIndex];
      // Skip dead agents
      if (!currentAgent.alive) {
        this.awaitingVotes.delete(currentAgent.id);
        this.currentVotingAgentIndex++;
        continue;
      }
      if (this.awaitingVotes.has(currentAgent.id)) {
        this.currentTurnAgentId = currentAgent.id;
        this.currentTurnId = this.nextTurnId++;
        this.startTurnTimeout();
        this.emit('agent_vote_request', currentAgent, this.engine.getCurrentPhase(), this.currentTurnId);
        return;
      }
      this.currentVotingAgentIndex++;
    }

    // All agents have voted
    this.resolveVotes();
  }

  // Advance to the next voting agent
  private advanceToNextVotingAgent(): void {
    this.clearTurnTimeout();
    this.currentTurnAgentId = null;
    this.currentTurnId = 0;
    this.currentVotingAgentIndex++;
    this.promptNextVotingAgent();
  }

  // Get eligible voters for current phase
  private getVoters(): GameAgent[] {
    const phase = this.engine.getCurrentPhase();
    const agentManager = this.engine.getAgentManager();

    switch (phase) {
      case 'DAY_VOTE':
        return agentManager.getDayVoters();
      case 'NIGHT_VOTE':
        return agentManager.getNightVoters();
      default:
        return [];
    }
  }

  // Record a vote
  private recordVote(agent: GameAgent, vote: string | 'DEFER'): void {
    const phase = this.engine.getCurrentPhase();
    const visibility =
      phase === 'NIGHT_VOTE'
        ? VisibilityFilter.mafia()
        : VisibilityFilter.public();

    const event: VoteEvent = {
      type: 'VOTE',
      agentId: agent.id,
      targetName: vote,
      visibility,
      ts: Date.now(),
    };
    this.engine.appendEvent(event);

    this.awaitingVotes.delete(agent.id);
    this.pendingVotes.set(agent.id, vote);
  }

  // Handle agent vote response
  handleVoteResponse(agent: GameAgent, response: VoteResponse, reasoning?: string): void {
    if (!this.awaitingVotes.has(agent.id)) return;
    if (agent.id !== this.currentTurnAgentId) return;

    this.clearTurnTimeout();

    // Record the vote with reasoning
    const phase = this.engine.getCurrentPhase();
    const visibility =
      phase === 'NIGHT_VOTE'
        ? VisibilityFilter.mafia()
        : VisibilityFilter.public();
    const isRevealedMayor =
      phase === 'DAY_VOTE' &&
      agent.role === 'MAYOR' &&
      agent.hasRevealedMayor;
    const hasMayorVotes = isRevealedMayor && Array.isArray(response.votes);
    const multiVotes = hasMayorVotes ? response.votes.slice(0, 3) : null;

    if (hasMayorVotes && multiVotes) {
      const event: VoteEvent = {
        type: 'VOTE',
        agentId: agent.id,
        targetName: multiVotes[0] ?? 'DEFER',
        targetNames: multiVotes,
        visibility,
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(event);

      for (let i = 0; i < multiVotes.length; i++) {
        this.pendingVotes.set(`${agent.id}_vote_${i}`, multiVotes[i]);
      }
    } else {
      const vote = response.vote ?? 'DEFER';
      const event: VoteEvent = {
        type: 'VOTE',
        agentId: agent.id,
        targetName: vote,
        visibility,
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(event);
      this.pendingVotes.set(agent.id, vote);
    }

    this.awaitingVotes.delete(agent.id);

    // Advance to next voter
    this.advanceToNextVotingAgent();
  }

  // Resolve votes
  private resolveVotes(): void {
    this.isVotingActive = false;
    this.clearTurnTimeout();
    this.currentTurnAgentId = null;
    this.currentTurnId = 0;

    const phase = this.engine.getCurrentPhase();
    const agentManager = this.engine.getAgentManager();
    const allAgents = agentManager.getAllAgents();

    this.emit('voting_ended', phase);

    if (phase === 'DAY_VOTE') {
      const result = VoteResolver.resolveTownVote(this.pendingVotes, allAgents);
      if (result.target) {
        // Someone is eliminated
        this.voteRetryAttempts = 0;
        this.engine.setEliminationTarget(result.target);
        this.engine.nextPhase(); // Go to LAST_WORDS
      } else {
        // No majority - retry if allowed
        this.voteRetryAttempts++;
        if (this.voteRetryAttempts >= this.settings.voteRetries) {
          // No more retries - skip to night
          this.voteRetryAttempts = 0;
          this.engine.appendNarration(
            '**No majority reached. The town could not agree on who to eliminate.**',
            VisibilityFilter.public()
          );
          this.engine.nextPhase();
        } else {
          // Retry voting
          this.engine.appendNarration(
            '**No majority reached. The town must vote again.**',
            VisibilityFilter.public()
          );
          this.pendingVotes.clear();
          this.currentVotingAgentIndex = 0;
          this.startVotingPhase();
        }
      }
    } else if (phase === 'NIGHT_VOTE') {
      // Get Godfather for final say logic
      const godfather = agentManager.getAliveGodfather();
      const result = VoteResolver.resolveMafiaVote(this.pendingVotes, allAgents, godfather);
      if (result.target) {
        // Godfather decided or unanimous vote
        this.mafiaVoteAttempts = 0;
        this.engine.setPendingNightKillTarget(result.target);
        // Track mafia visit for lookout (all alive mafia members visit the target)
        const aliveMafia = agentManager.getAliveMafia();
        for (const mafia of aliveMafia) {
          this.engine.addNightVisit(mafia.id, result.target);
        }
        this.engine.nextPhase();
      } else {
        // No target decided (no Godfather vote and no unanimity)
        this.mafiaVoteAttempts++;
        if (this.mafiaVoteAttempts >= this.settings.mafiaVotingRetries) {
          // Give up - no kill tonight
          this.mafiaVoteAttempts = 0;
          this.engine.setPendingNightKillTarget(undefined);
          this.engine.appendNarration(
            '**The mafia could not agree on a target.**',
            VisibilityFilter.mafia()
          );
          this.engine.nextPhase();
        } else {
          // Retry
          this.engine.appendNarration(
            '**The mafia must reach agreement. Vote again.**',
            VisibilityFilter.mafia()
          );
          this.pendingVotes.clear();
          this.currentVotingAgentIndex = 0;
          this.startVotingPhase();
        }
      }
    }
  }

  // Start special choice phase (Sheriff/Doctor/Lookout)
  async startChoicePhase(): Promise<void> {
    const phase = this.engine.getCurrentPhase();
    const agentManager = this.engine.getAgentManager();

    let choiceAgent: GameAgent | undefined;
    if (this.deferIfPaused(() => this.startChoicePhase())) return;

    if (phase === 'SHERIFF_CHOICE') {
      choiceAgent = agentManager.getAliveSheriff();
    } else if (phase === 'DOCTOR_CHOICE') {
      choiceAgent = agentManager.getAliveDoctor();
    } else if (phase === 'LOOKOUT_CHOICE') {
      choiceAgent = agentManager.getAliveLookout();
    } else if (phase === 'VIGILANTE_CHOICE') {
      choiceAgent = agentManager.getAliveVigilante();
    } else if (phase === 'FRAMER_CHOICE') {
      choiceAgent = agentManager.getAliveFramer();
    } else if (phase === 'CONSIGLIERE_CHOICE') {
      choiceAgent = agentManager.getAliveConsigliere();
    } else if (phase === 'WEREWOLF_CHOICE') {
      choiceAgent = agentManager.getAliveWerewolf();
    }

    if (choiceAgent) {
      this.currentTurnAgentId = choiceAgent.id;
      this.currentTurnId = this.nextTurnId++;
      this.startTurnTimeout();
      this.emit('agent_choice_request', choiceAgent, phase, this.currentTurnId);
    } else {
      // Skip if no one to make choice
      this.engine.nextPhase();
    }
  }

  // Handle choice response
  handleChoiceResponse(agent: GameAgent, response: ChoiceResponse, reasoning?: string): void {
    if (this.currentTurnAgentId && agent.id !== this.currentTurnAgentId) {
      return;
    }
    this.clearTurnTimeout();
    this.currentTurnAgentId = null;
    this.currentTurnId = 0;

    const phase = this.engine.getCurrentPhase();
    const agentManager = this.engine.getAgentManager();

    const normalizedTarget = response.target?.trim() ?? '';
    if (normalizedTarget.toUpperCase() === 'DEFER' || normalizedTarget.length === 0) {
      // Agent chose not to act
      if (phase === 'VIGILANTE_CHOICE') {
        this.engine.appendNarration(
          '**The Vigilante chose not to kill anyone tonight.**',
          VisibilityFilter.vigilantePrivate(agent.id)
        );
      }
      this.engine.nextPhase();
      return;
    }

    // Find eligible target by name (alive + valid for phase)
    let eligibleTargets: GameAgent[] = [];
    if (phase === 'SHERIFF_CHOICE') {
      eligibleTargets = agentManager.getSheriffTargets(agent.id);
    } else if (phase === 'DOCTOR_CHOICE') {
      eligibleTargets = agentManager.getDoctorTargets();
    } else if (phase === 'LOOKOUT_CHOICE') {
      eligibleTargets = agentManager.getLookoutTargets(agent.id);
    } else if (phase === 'VIGILANTE_CHOICE') {
      eligibleTargets = agentManager.getVigilanteTargets(agent.id);
    } else if (phase === 'FRAMER_CHOICE') {
      eligibleTargets = agentManager.getFramerTargets(agent.id);
    } else if (phase === 'CONSIGLIERE_CHOICE') {
      eligibleTargets = agentManager.getConsigliereTargets(agent.id);
    } else if (phase === 'WEREWOLF_CHOICE') {
      eligibleTargets = agentManager.getWerewolfTargets();
    }
    const target = this.findTargetByName(normalizedTarget, eligibleTargets);
    if (!target) {
      // Invalid target, skip action
      this.engine.nextPhase();
      return;
    }

    if (phase === 'SHERIFF_CHOICE') {
      // Emit choice event for sheriff investigation
      const choiceEvent: ChoiceEvent = {
        type: 'CHOICE',
        agentId: agent.id,
        targetName: target.name,
        choiceType: 'SHERIFF_INVESTIGATE',
        visibility: VisibilityFilter.sheriffPrivate(agent.id),
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(choiceEvent);

      // Track sheriff visit for lookout
      this.engine.addNightVisit(agent.id, target.id);

      // Emit immediate investigation result
      // Check detection immunity (Godfather appears innocent)
      const isDetectionImmune = ROLE_TRAITS[target.role].detection_immune;
      // Werewolf has conditional detection immunity (nights 1 and 3)
      const isWerewolfImmune = target.role === 'WEREWOLF' && this.engine.isWerewolfDetectionImmuneTonight();
      // Check if framed (and consume the frame)
      const wasFramed = this.engine.consumeFrameIfExists(target.id);
      // Mafia appears suspicious unless detection immune
      const isMafiaSuspicious = target.faction === 'MAFIA' && !isDetectionImmune;
      // Werewolf appears suspicious unless immune tonight
      const isWerewolfSuspicious = target.role === 'WEREWOLF' && !isWerewolfImmune;
      const isSuspicious = isMafiaSuspicious || isWerewolfSuspicious || wasFramed;

      const resultMessage = isSuspicious
        ? `**Your investigation reveals that ${target.name} appears SUSPICIOUS!**`
        : `**Your investigation reveals that ${target.name} does NOT appear suspicious.**`;
      this.engine.appendNarration(resultMessage, VisibilityFilter.sheriffPrivate(agent.id));
    } else if (phase === 'FRAMER_CHOICE') {
      // Emit choice event for framer framing
      const choiceEvent: ChoiceEvent = {
        type: 'CHOICE',
        agentId: agent.id,
        targetName: target.name,
        choiceType: 'FRAMER_FRAME',
        visibility: VisibilityFilter.framerPrivate(agent.id),
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(choiceEvent);

      // Track framer visit for lookout
      this.engine.addNightVisit(agent.id, target.id);

      // Set the framed target
      this.engine.setPendingFramedTarget(target.id);

      // Immediate feedback - frame persists until investigated
      this.engine.appendNarration(
        `**You have framed ${target.name}. They will appear suspicious until the Sheriff investigates them.**`,
        VisibilityFilter.framerPrivate(agent.id)
      );
    } else if (phase === 'CONSIGLIERE_CHOICE') {
      // Emit choice event for consigliere investigation
      const choiceEvent: ChoiceEvent = {
        type: 'CHOICE',
        agentId: agent.id,
        targetName: target.name,
        choiceType: 'CONSIGLIERE_INVESTIGATE',
        visibility: VisibilityFilter.consiglierePrivate(agent.id),
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(choiceEvent);

      // Track consigliere visit for lookout
      this.engine.addNightVisit(agent.id, target.id);

      // Emit immediate investigation result (exact role)
      const resultMessage = `**Your investigation reveals that ${target.name}'s role is ${target.role}!**`;
      this.engine.appendNarration(resultMessage, VisibilityFilter.consiglierePrivate(agent.id));
    } else if (phase === 'DOCTOR_CHOICE') {
      // Emit choice event for doctor protection
      const choiceEvent: ChoiceEvent = {
        type: 'CHOICE',
        agentId: agent.id,
        targetName: target.name,
        choiceType: 'DOCTOR_PROTECT',
        visibility: VisibilityFilter.doctorPrivate(agent.id),
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(choiceEvent);

      // Track doctor visit for lookout
      this.engine.addNightVisit(agent.id, target.id);

      // Record protection
      this.engine.setPendingDoctorProtectTarget(target.id);
    } else if (phase === 'LOOKOUT_CHOICE') {
      // Emit choice event for lookout watching
      const choiceEvent: ChoiceEvent = {
        type: 'CHOICE',
        agentId: agent.id,
        targetName: target.name,
        choiceType: 'LOOKOUT_WATCH',
        visibility: VisibilityFilter.lookoutPrivate(agent.id),
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(choiceEvent);

      // Record watch target
      this.engine.setPendingLookoutWatchTarget(target.id);

      // Immediate feedback that the watch is set
      this.engine.appendNarration(
        `**You are now watching ${target.name}. You will see anyone who visits them tonight.**`,
        VisibilityFilter.lookoutPrivate(agent.id)
      );
    } else if (phase === 'VIGILANTE_CHOICE') {
      // Use a bullet
      if (!this.engine.useVigilanteBullet()) {
        // No bullets remaining - shouldn't happen, but handle gracefully
        this.engine.appendNarration(
          `**You have no bullets remaining.**`,
          VisibilityFilter.vigilantePrivate(agent.id)
        );
        this.engine.nextPhase();
        return;
      }

      // Emit choice event for vigilante kill
      const choiceEvent: ChoiceEvent = {
        type: 'CHOICE',
        agentId: agent.id,
        targetName: target.name,
        choiceType: 'VIGILANTE_KILL',
        visibility: VisibilityFilter.vigilantePrivate(agent.id),
        ts: Date.now(),
        reasoning,
      };
      this.engine.appendEvent(choiceEvent);

      // Track vigilante visit for lookout
      this.engine.addNightVisit(agent.id, target.id);

      // Record kill target
      this.engine.setPendingVigilanteKillTarget(target.id);

      // Show remaining bullets
      const bulletsRemaining = this.engine.getVigilanteBulletsRemaining();
      this.engine.appendNarration(
        `**You have ${bulletsRemaining} bullet${bulletsRemaining === 1 ? '' : 's'} remaining.**`,
        VisibilityFilter.vigilantePrivate(agent.id)
      );
    }

    this.engine.nextPhase();
  }

  // Handle last words speech
  handleLastWordsSpeech(response: SpeakResponse, reasoning?: string): void {
    const agentId = this.engine.getLastWordsAgentId();
    if (!agentId) return;

    this.clearTurnTimeout();
    const trimmedMessage = response.message_markdown?.trim() ?? '';
    const messageMarkdown =
      response.action === 'SAY' && trimmedMessage.length > 0
        ? response.message_markdown
        : '*chose not to speak.*';

    const event: SpeechEvent = {
      type: 'SPEECH',
      agentId,
      messageMarkdown,
      visibility: VisibilityFilter.public(),
      ts: Date.now(),
      reasoning,
    };
    this.engine.appendEvent(event);

    // Proceed to elimination
    this.engine.nextPhase();
  }

  // Reset for new game
  reset(): void {
    this.clearTurnTimeout();

    this.roundRobinOrder = [];
    this.currentAgentIndex = 0;
    this.roundsCompleted = 0;
    this.currentTurnAgentId = null;
    this.currentTurnId = 0;
    this.nextTurnId = 1;
    this.isDiscussionActive = false;
    this.isVotingActive = false;
    this.currentVotingAgentIndex = 0;
    this.pendingVotes.clear();
    this.awaitingVotes.clear();
    this.mafiaVoteAttempts = 0;
    this.voteRetryAttempts = 0;
    this.isPaused = false;
    this.pendingResumeAction = null;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    const action = this.pendingResumeAction;
    this.pendingResumeAction = null;
    if (action) {
      action();
    }
  }

  // Check if discussion is active
  getIsDiscussionActive(): boolean {
    return this.isDiscussionActive;
  }
}
