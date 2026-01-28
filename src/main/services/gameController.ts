import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import {
  GameAgent,
  GameState,
  GameEvent,
  Phase,
  Role,
  Faction,
  SpeakResponse,
  VoteResponse,
  ChoiceResponse,
  SpeechEvent,
  ChoiceEvent,
  Settings,
  GameSettings,
  DEFAULT_GAME_SETTINGS,
  getFactionForRole,
  SideChatMessage,
  LLMResponse,
} from '@shared/types';
import { GameEngine } from '../engine/GameEngine';
import { PhaseRunner } from '../engine/PhaseRunner';
import { VisibilityFilter } from '../engine/Visibility';
import { PromptBuilder } from '../llm/PromptBuilder';
import { ResponseParser } from '../llm/ResponseParser';
import { createLLMService, LLMService } from './llm';
import { createRateLimitedService, RateLimitedLLMService } from './llm/rateLimiter';
import { getLoggingService } from './logging';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral' | 'openrouter';
  model: string;
  avatar: string;
}

const MAX_LLM_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (message.includes('network') || message.includes('econnrefused') ||
        message.includes('enotfound') || message.includes('etimedout') ||
        message.includes('socket') || message.includes('fetch failed')) {
      return true;
    }
    // Server errors (5xx)
    if (message.includes('500') || message.includes('502') ||
        message.includes('503') || message.includes('504') ||
        message.includes('internal server error') || message.includes('bad gateway') ||
        message.includes('service unavailable')) {
      return true;
    }
    // Rate limiting
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
      return true;
    }
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class GameController extends EventEmitter {
  private mainWindow: BrowserWindow;
  private settings: Settings;
  private gameSettings: GameSettings;
  private engine: GameEngine;
  private phaseRunner: PhaseRunner;
  private llmServices: Map<string, LLMService> = new Map();
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private pendingPhase: Phase | null = null;
  private isHandlingPhaseChange: boolean = false;
  private queuedPhaseChange: Phase | null = null;

  constructor(
    mainWindow: BrowserWindow,
    settings: Settings,
    gameSettings: GameSettings = DEFAULT_GAME_SETTINGS
  ) {
    super();
    this.mainWindow = mainWindow;
    this.settings = settings;
    this.gameSettings = gameSettings;
    this.engine = new GameEngine(gameSettings);
    this.phaseRunner = new PhaseRunner(this.engine);

    this.setupEngineListeners();
    this.setupPhaseRunnerListeners();
  }

  private setupEngineListeners(): void {
    this.engine.on('event_appended', (event: GameEvent) => {
      this.emit('event_appended', event);
      this.emitStateUpdate();
      // Log event to file (async, non-blocking)
      getLoggingService().logEvent(event);
    });

    this.engine.on('phase_changed', (phase: Phase, dayNumber: number) => {
      this.emit('phase_changed', phase, dayNumber);
      this.handlePhaseChange(phase);
    });

    this.engine.on('game_over', (winner: Faction) => {
      this.isRunning = false;
      this.isPaused = false;
      this.pendingPhase = null;
      this.emit('game_over', winner);
      // Finalize log with winner (async, non-blocking)
      getLoggingService().stopLogging(winner);
    });

    this.engine.on('agent_died', (agentId: string, cause: string) => {
      this.emit('agent_died', agentId, cause);
    });
  }

  private setupPhaseRunnerListeners(): void {
    this.phaseRunner.on('agent_speak_request', async (agent: GameAgent, phase: Phase, turnId: number) => {
      await this.handleAgentSpeakRequest(agent, phase, turnId);
    });

    this.phaseRunner.on('agent_vote_request', async (agent: GameAgent, phase: Phase, turnId: number) => {
      await this.handleAgentVoteRequest(agent, phase, turnId);
    });

    this.phaseRunner.on('agent_choice_request', async (agent: GameAgent, phase: Phase, turnId: number) => {
      await this.handleAgentChoiceRequest(agent, phase, turnId);
    });

    this.phaseRunner.on('discussion_ended', (phase: Phase) => {
      // Transition based on phase
      if (phase === 'DAY_ONE_DISCUSSION') {
        this.engine.nextPhase();
      } else if (phase === 'DAY_DISCUSSION') {
        this.engine.transitionToDayVote();
      } else if (phase === 'NIGHT_DISCUSSION') {
        this.engine.transitionToNightVote();
      } else if (phase === 'POST_EXECUTION_DISCUSSION') {
        this.engine.nextPhase();
      } else if (phase === 'POST_GAME_DISCUSSION') {
        this.engine.nextPhase();
      }
    });
  }

  async initializeGame(pendingAgents: PendingAgent[]): Promise<void> {
    this.isPaused = false;
    this.pendingPhase = null;
    this.isHandlingPhaseChange = false;
    this.queuedPhaseChange = null;
    // Convert pending agents to game agents
    const agentConfigs = pendingAgents.map((pa) => ({
      id: uuidv4(),
      name: pa.name,
      role: pa.role,
      personality: pa.personality,
      provider: pa.provider,
      model: pa.model,
      avatar: pa.avatar,
    }));

    // Initialize game engine
    this.engine.initializeGame(agentConfigs);

    // Create rate-limited LLM services shared per provider
    // This ensures rate limits apply globally per provider, not per agent
    const providerServices = new Map<string, LLMService>();

    const agents = this.engine.getAgentManager().getAllAgents();

    // Start logging for this game session
    getLoggingService().startLogging(agents);
    for (const agent of agents) {
      const apiKey = this.getApiKeyForProvider(agent.provider);
      if (apiKey) {
        // Reuse existing rate-limited service for this provider, or create new one
        if (!providerServices.has(agent.provider)) {
          const baseService = createLLMService(agent.provider, apiKey);
          const rateLimitedService = createRateLimitedService(baseService, {
            maxRequestsPerMinute: 30,
            maxConcurrent: 2,
            circuitBreakerThreshold: 5,
            circuitBreakerResetMs: 60000,
          });
          providerServices.set(agent.provider, rateLimitedService);
          console.log(`[GameController] Created rate-limited service for provider: ${agent.provider}`);
        }
        this.llmServices.set(agent.id, providerServices.get(agent.provider)!);
      } else {
        console.error(`[GameController] WARNING: No API key configured for provider "${agent.provider}" - agent "${agent.name}" will not be able to respond!`);
      }
    }
  }

  private getApiKeyForProvider(provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral' | 'openrouter'): string {
    return this.settings.apiKeys[provider] || '';
  }

  async startGame(): Promise<void> {
    this.isRunning = true;
    this.isPaused = false;
    this.pendingPhase = null;
    this.engine.startGame();
    this.emitStateUpdate();
  }

  stopGame(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.pendingPhase = null;
    this.isHandlingPhaseChange = false;
    this.queuedPhaseChange = null;
    this.engine.stopGame();
    this.phaseRunner.reset();
    // Finalize log with "Game Stopped" (async, non-blocking)
    getLoggingService().stopLogging('Game Stopped');
  }

  getState(): GameState {
    return {
      ...this.engine.getState(),
      isPaused: this.isPaused,
    };
  }

  async askAgentQuestion(
    agentId: string,
    sideChatMessages: SideChatMessage[]
  ): Promise<LLMResponse> {
    const agent = this.engine.getAgentManager().getAgent(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const service = this.llmServices.get(agent.id);
    if (!service) {
      throw new Error('LLM service not available');
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildUserMessageSystemPrompt(agent, state);
    const gameMessages = PromptBuilder.buildMessagesForAgent(
      agent,
      state.events,
      state.agents
    );
    const sideMessages = sideChatMessages.map(message => ({
      role: message.role,
      content: message.content,
    }));
    const messages = [...gameMessages, ...sideMessages];

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
      try {
        return await service.generate(messages, systemPrompt, agent.model);
      } catch (error) {
        lastError = error;
        if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
          const delay = RETRY_DELAY_MS * attempt;
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('Failed to get response from agent');
  }

  private emitStateUpdate(): void {
    this.emit('game_state_update', this.getState());
  }

  private emitAgentThinking(agent: GameAgent): void {
    this.emit('agent_thinking', agent.id, agent.name);
  }

  private emitAgentThinkingDone(agent: GameAgent): void {
    this.emit('agent_thinking_done', agent.id);
  }

  private async handlePhaseChange(phase: Phase): Promise<void> {
    if (!this.isRunning) return;
    if (this.isPaused) {
      this.pendingPhase = phase;
      return;
    }

    // Prevent concurrent phase handling - queue the phase if already handling one
    if (this.isHandlingPhaseChange) {
      console.log(`[GameController] Phase change already in progress, queuing phase: ${phase}`);
      this.queuedPhaseChange = phase;
      return;
    }

    // Verify phase consistency - the engine's current phase should match what we're handling
    const enginePhase = this.engine.getCurrentPhase();
    if (enginePhase !== phase) {
      console.warn(`[GameController] Phase mismatch: handling ${phase} but engine is at ${enginePhase}, using engine phase`);
      phase = enginePhase;
    }

    this.isHandlingPhaseChange = true;
    this.queuedPhaseChange = null;

    try {
      await this.executePhaseChange(phase);
    } finally {
      this.isHandlingPhaseChange = false;

      // Process any queued phase change
      const queued = this.queuedPhaseChange;
      this.queuedPhaseChange = null;
      if (queued && this.isRunning && !this.isPaused) {
        // Use setImmediate to avoid stack growth
        setImmediate(() => void this.handlePhaseChange(queued));
      }
    }
  }

  private async executePhaseChange(phase: Phase): Promise<void> {
    // Wait for transition animation to complete for phases that follow day/night transitions
    const phasesAfterTransition: Phase[] = ['DAY_ONE_DISCUSSION', 'DAY_DISCUSSION', 'NIGHT_DISCUSSION'];
    if (phasesAfterTransition.includes(phase)) {
      await sleep(1500); // Wait for 1.5s (animation is 1.2s + buffer)
    }

    switch (phase) {
      case 'DAY_ONE_DISCUSSION':
      case 'DAY_DISCUSSION':
      case 'NIGHT_DISCUSSION':
      case 'POST_EXECUTION_DISCUSSION':
      case 'POST_GAME_DISCUSSION':
        await this.phaseRunner.startDiscussionPhase();
        break;

      case 'DAY_VOTE':
      case 'NIGHT_VOTE':
        await this.phaseRunner.startVotingPhase();
        break;

      case 'SHERIFF_CHOICE':
      case 'DOCTOR_CHOICE':
      case 'LOOKOUT_CHOICE':
      case 'VIGILANTE_CHOICE':
      case 'FRAMER_CHOICE':
      case 'CONSIGLIERE_CHOICE':
      case 'WEREWOLF_CHOICE':
      case 'JAILOR_CHOICE':
      case 'JESTER_HAUNT_CHOICE':
      case 'TAVERN_KEEPER_CHOICE':
        await this.phaseRunner.startChoicePhase();
        break;

      case 'TAVERN_KEEPER_PRE_SPEECH':
        await this.handleTavernKeeperPreSpeech();
        break;

      case 'JESTER_HAUNT_PRE_SPEECH':
        await this.handleJesterHauntPreSpeech();
        break;

      case 'JAIL_CONVERSATION':
        await this.handleJailConversation();
        break;

      case 'JAILOR_EXECUTE_CHOICE':
        await this.handleJailorExecuteChoice();
        break;

      case 'LAST_WORDS':
        await this.handleLastWords();
        break;

      case 'SHERIFF_POST_SPEECH':
        await this.handleSheriffPostSpeech();
        break;

      case 'FRAMER_PRE_SPEECH':
        await this.handleFramerPreSpeech();
        break;

      case 'CONSIGLIERE_POST_SPEECH':
        await this.handleConsiglierePostSpeech();
        break;

      case 'DOCTOR_PRE_SPEECH':
        await this.handleDoctorPreSpeech();
        break;

      case 'VIGILANTE_PRE_SPEECH':
        await this.handleVigilantePreSpeech();
        break;

      case 'WEREWOLF_PRE_SPEECH':
        await this.handleWerewolfPreSpeech();
        break;

      case 'LOOKOUT_POST_SPEECH':
        await this.handleLookoutPostSpeech();
        break;
    }
  }

  pauseGame(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.phaseRunner.pause();
    this.emitStateUpdate();
  }

  resumeGame(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.phaseRunner.resume();
    const pendingPhase = this.pendingPhase;
    this.pendingPhase = null;
    if (pendingPhase && this.engine.getCurrentPhase() === pendingPhase) {
      void this.handlePhaseChange(pendingPhase);
    }
    this.emitStateUpdate();
  }

  private async handleAgentSpeakRequest(agent: GameAgent, phase: Phase, turnId: number): Promise<void> {
    // Allow dead agents to speak during post-game discussion
    if (!this.isRunning || (!agent.alive && phase !== 'POST_GAME_DISCUSSION')) return;

    const service = this.llmServices.get(agent.id);
    if (!service) return;

    const turnStartTime = Date.now();
    console.log('\n' + '-'.repeat(60));
    console.log(`[TIMING] SPEAK REQUEST START: ${agent.name} (${agent.role}) - Phase: ${phase} - Time: ${new Date().toISOString()}`);

    if (!this.phaseRunner.isTurnActive(turnId)) {
      console.log(`${agent.name}: Turn cancelled before request`);
      return;
    }

    this.emitAgentThinking(agent);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      if (!this.phaseRunner.isTurnActive(turnId)) {
        console.log(`${agent.name}: Turn cancelled before request`);
        return;
      }

      this.phaseRunner.notifyResponseStarted(turnId);

      if (this.shouldOfferMayorReveal(agent, phase)) {
        await this.handleMayorRevealPrompt(agent, service);
      }

      if (!this.phaseRunner.isTurnActive(turnId)) {
        console.log(`${agent.name}: Turn cancelled before request`);
        return;
      }

      const state = this.engine.getState();
      const systemPrompt = PromptBuilder.buildSystemPrompt(agent, phase, state);
      const messages = PromptBuilder.buildMessagesForAgent(
        agent,
        state.events,
        state.agents
      );

      // Log the system prompt
      await getLoggingService().logPrompt(agent, phase, systemPrompt);

      console.log(`Day: ${state.dayNumber}, Messages count: ${messages.length}`);
      console.log('-'.repeat(60));

      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          if (!this.phaseRunner.isTurnActive(turnId)) {
            console.log(`${agent.name}: Turn cancelled before request`);
            return;
          }

          // Use streaming for speak requests
          let headerParsed = false;
          let headerAction: 'SAY' | 'DEFER' | null = null;
          let messageBodyStarted = false;
          let streamedMessageContent = '';
          let pendingBuffer = ''; // Buffer to hold content that might be part of ---END---
          const END_MARKER = '---END---';

          const llmRequestStart = Date.now();
          let firstChunkReceived = false;
          let thinkingStreamStarted = false;
          console.log(`[TIMING] ${agent.name}: LLM request starting at ${new Date().toISOString()}`);
          const generator = service.generateStream(
            messages,
            systemPrompt,
            agent.model,
            (chunk: string) => {
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                console.log(`[TIMING] ${agent.name}: FIRST CHUNK received after ${Date.now() - llmRequestStart}ms`);
              }
              content += chunk;

              // Check if we have parsed the header yet
              if (!headerParsed && ResponseParser.hasCompleteHeader(content)) {
                const headerResult = ResponseParser.parseStreamingHeader(content);
                if (headerResult.success && headerResult.data) {
                  headerParsed = true;
                  headerAction = headerResult.data.action;
                  console.log(`${agent.name}: Header parsed, action: ${headerAction}`);

                  // For DEFER, no more content expected
                  if (headerAction === 'DEFER') {
                    return;
                  }
                }
              }

              // For SAY, stream the message body content with buffering to hide ---END---
              if (headerParsed && headerAction === 'SAY') {
                const bodyStartPos = ResponseParser.getMessageBodyStartPosition(content);
                if (bodyStartPos !== -1) {
                  if (!messageBodyStarted) {
                    messageBodyStarted = true;
                    // Initialize buffer with content after the marker
                    pendingBuffer = content.slice(bodyStartPos);
                  } else {
                    // Append new chunk to pending buffer
                    pendingBuffer += chunk;
                  }

                  // Check if buffer contains the full end marker
                  const endIndex = pendingBuffer.indexOf(END_MARKER);
                  if (endIndex !== -1) {
                    // Emit everything before the marker, then stop
                    const beforeEnd = pendingBuffer.slice(0, endIndex).trim();
                    if (beforeEnd.length > streamedMessageContent.length) {
                      const delta = beforeEnd.slice(streamedMessageContent.length);
                      streamedMessageContent = beforeEnd;
                      this.emit('streaming_chunk', agent.id, delta, false);
                    }
                    return; // Don't emit anything after ---END---
                  }

                  // Check how much of the buffer could be start of ---END---
                  let holdBackCount = 0;
                  for (let i = 1; i <= Math.min(pendingBuffer.length, END_MARKER.length - 1); i++) {
                    const suffix = pendingBuffer.slice(-i);
                    if (END_MARKER.startsWith(suffix)) {
                      holdBackCount = i;
                    }
                  }

                  // Emit everything except the held-back suffix
                  const safeContent = pendingBuffer.slice(0, pendingBuffer.length - holdBackCount).trim();
                  if (safeContent.length > streamedMessageContent.length) {
                    const delta = safeContent.slice(streamedMessageContent.length);
                    streamedMessageContent = safeContent;
                    this.emit('streaming_chunk', agent.id, delta, false);
                  }
                }
              }
            },
            // onThinkingChunk callback - stream thinking/reasoning content
            (thinkingChunk: string) => {
              if (!thinkingStreamStarted) {
                thinkingStreamStarted = true;
                console.log(`[TIMING] ${agent.name}: THINKING stream started after ${Date.now() - llmRequestStart}ms`);
              }
              this.emit('streaming_thinking_chunk', agent.id, thinkingChunk);
            }
          );

          // Consume the generator
          let result: IteratorResult<string, LLMResponse>;
          do {
            result = await generator.next();
          } while (!result.done);

          const response = result.value;
          thinkingContent = response.thinkingContent || '';

          // Mark streaming as complete if we were streaming
          if (messageBodyStarted) {
            this.emit('streaming_chunk', agent.id, '', true);
          }

          const llmRequestEnd = Date.now();
          this.emit('streaming_message', agent.id, content);
          console.log(`[TIMING] ${agent.name}: LLM response received, took ${llmRequestEnd - llmRequestStart}ms, content length: ${content.length}`);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${agent.name}] LLM error on attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
            console.log(`[DELAY] ${agent.name}: LLM retry backoff - waiting ${delay}ms before attempt ${attempt + 1}`);
            await sleep(delay);
            continue;
          }

          // Non-retryable error or max retries reached
          break;
        }
      }

      if (!this.phaseRunner.isTurnActive(turnId)) {
        console.log(`${agent.name}: Turn cancelled after stream completed`);
        return;
      }

      if (lastError) {
        console.error('\n' + '='.repeat(80));
        console.error(`EXCEPTION IN SPEAK REQUEST FOR ${agent.name} (after ${MAX_LLM_RETRIES} attempts)`);
        console.error('='.repeat(80));
        console.error('Error:', lastError);
        console.error('='.repeat(80) + '\n');

        // If circuit breaker is open, pause the game to prevent infinite error loop
        const errorMessage = lastError instanceof Error ? lastError.message : '';
        if (errorMessage.includes('Circuit breaker')) {
          console.error('[GameController] Circuit breaker detected - pausing game to prevent error loop');
          this.pauseGame();
          this.engine.appendNotification('⚠️ **Game paused due to repeated API errors.** Check your API key and network connection, then resume.');
        }

        this.phaseRunner.handleSpeechResponse(agent, {
          type: 'speak',
          action: 'DEFER',
          message_markdown: '',
        }, thinkingContent);
        return;
      }

      if (!content || content.trim().length === 0) {
        console.error('\n' + '='.repeat(80));
        console.error(`EMPTY CONTENT FROM ${agent.name} (SPEECH)`);
        console.error('='.repeat(80));
        console.error('Thinking content length:', thinkingContent.length);
        console.error('='.repeat(80) + '\n');
      }

      // Use streaming-aware parser with fallback to legacy format
      const result = ResponseParser.parseStreamingSpeakResponse(content);
      console.log(`${agent.name} raw content:`, content.substring(0, 500));
      console.log(`${agent.name} parsed result:`, JSON.stringify(result.data));
      if (result.success && result.data) {
        this.phaseRunner.handleSpeechResponse(agent, result.data, thinkingContent);
      } else {
        console.error('\n' + '='.repeat(80));
        console.error(`PARSE FAILED FOR ${agent.name} (SPEECH)`);
        console.error('='.repeat(80));
        console.error('Raw content:', content);
        console.error('Parse error:', result.error);
        console.error('='.repeat(80) + '\n');
        this.phaseRunner.handleSpeechResponse(agent, {
          type: 'speak',
          action: 'DEFER',
          message_markdown: '',
        }, thinkingContent);
      }
    } finally {
      const turnEndTime = Date.now();
      console.log(`[TIMING] SPEAK REQUEST END: ${agent.name} - Total time: ${turnEndTime - turnStartTime}ms`);
      this.emitAgentThinkingDone(agent);
    }
  }

  private async handleAgentVoteRequest(agent: GameAgent, phase: Phase, turnId: number): Promise<void> {
    if (!this.isRunning || !agent.alive) return;

    const service = this.llmServices.get(agent.id);
    if (!service) return;

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(agent, phase, state);
    const messages = PromptBuilder.buildMessagesForAgent(
      agent,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(agent, phase, systemPrompt);

    if (!this.phaseRunner.isTurnActive(turnId)) {
      return;
    }

    this.emitAgentThinking(agent);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          if (!this.phaseRunner.isTurnActive(turnId)) {
            return;
          }

          this.phaseRunner.notifyResponseStarted(turnId);
          const response = await service.generate(messages, systemPrompt, agent.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', agent.id, content);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${agent.name}] LLM error on vote attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${agent.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (!this.phaseRunner.isTurnActive(turnId)) {
        return;
      }

      if (lastError) {
        console.error(`Error getting vote from ${agent.name} (after ${MAX_LLM_RETRIES} attempts):`, lastError);

        // If circuit breaker is open, pause the game to prevent infinite error loop
        const errorMessage = lastError instanceof Error ? lastError.message : '';
        if (errorMessage.includes('Circuit breaker')) {
          console.error('[GameController] Circuit breaker detected - pausing game to prevent error loop');
          this.pauseGame();
          this.engine.appendNotification('⚠️ **Game paused due to repeated API errors.** Check your API key and network connection, then resume.');
        }

        this.phaseRunner.handleVoteResponse(agent, {
          type: 'vote',
          vote: 'DEFER',
        }, thinkingContent);
        return;
      }

      const result = ResponseParser.parseVoteResponse(content);
      if (result.success && result.data) {
        this.phaseRunner.handleVoteResponse(agent, result.data, thinkingContent);
      } else {
        console.error('\n' + '='.repeat(80));
        console.error(`PARSE FAILED FOR ${agent.name} (VOTE)`);
        console.error('='.repeat(80));
        console.error('Raw content:', content);
        console.error('Parse error:', result.error);
        console.error('='.repeat(80) + '\n');
        this.phaseRunner.handleVoteResponse(agent, {
          type: 'vote',
          vote: 'DEFER',
        }, thinkingContent);
      }
    } finally {
      this.emitAgentThinkingDone(agent);
    }
  }

  private async handleAgentChoiceRequest(agent: GameAgent, phase: Phase, turnId: number): Promise<void> {
    if (!this.isRunning || !agent.alive) return;

    const service = this.llmServices.get(agent.id);
    if (!service) return;

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(agent, phase, state);
    const messages = PromptBuilder.buildMessagesForAgent(
      agent,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(agent, phase, systemPrompt);

    if (!this.phaseRunner.isTurnActive(turnId)) {
      return;
    }

    this.emitAgentThinking(agent);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          if (!this.phaseRunner.isTurnActive(turnId)) {
            return;
          }

          this.phaseRunner.notifyResponseStarted(turnId);
          const response = await service.generate(messages, systemPrompt, agent.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', agent.id, content);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${agent.name}] LLM error on choice attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${agent.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (!this.phaseRunner.isTurnActive(turnId)) {
        return;
      }

      if (lastError) {
        console.error(`Error getting choice from ${agent.name} (after ${MAX_LLM_RETRIES} attempts):`, lastError);

        // If circuit breaker is open, pause the game to prevent infinite error loop
        const errorMessage = lastError instanceof Error ? lastError.message : '';
        if (errorMessage.includes('Circuit breaker')) {
          console.error('[GameController] Circuit breaker detected - pausing game to prevent error loop');
          this.pauseGame();
          this.engine.appendNotification('⚠️ **Game paused due to repeated API errors.** Check your API key and network connection, then resume.');
        }

        this.phaseRunner.handleChoiceResponse(agent, {
          type: 'choice',
          target: 'DEFER',
        }, thinkingContent);
        return;
      }

      const result = ResponseParser.parseChoiceResponse(content);
      if (result.success && result.data) {
        this.phaseRunner.handleChoiceResponse(agent, result.data, thinkingContent);
      } else {
        this.phaseRunner.handleChoiceResponse(agent, {
          type: 'choice',
          target: 'DEFER',
        }, thinkingContent);
      }
    } finally {
      this.emitAgentThinkingDone(agent);
    }
  }

  private async handleLastWords(): Promise<void> {
    const agentId = this.engine.getLastWordsAgentId();
    if (!agentId) {
      this.engine.nextPhase();
      return;
    }

    const agent = this.engine.getAgentManager().getAgent(agentId);
    if (!agent) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(agent.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(agent, 'LAST_WORDS', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      agent,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(agent, 'LAST_WORDS', systemPrompt);

    this.emitAgentThinking(agent);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, agent.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', agent.id, content);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${agent.name}] LLM error on last words attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${agent.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(`Error getting last words from ${agent.name} (after ${MAX_LLM_RETRIES} attempts):`, lastError);
        this.phaseRunner.handleLastWordsSpeech({
          type: 'speak',
          action: 'DEFER',
          message_markdown: '',
        }, thinkingContent);
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        this.phaseRunner.handleLastWordsSpeech(result.data, thinkingContent);
      } else {
        this.phaseRunner.handleLastWordsSpeech({
          type: 'speak',
          action: 'DEFER',
          message_markdown: '',
        }, thinkingContent);
      }
    } finally {
      this.emitAgentThinkingDone(agent);
    }
  }

  private async handleSheriffPostSpeech(): Promise<void> {
    const sheriff = this.engine.getAgentManager().getAliveSheriff();
    if (!sheriff) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(sheriff.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(sheriff, 'SHERIFF_POST_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      sheriff,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(sheriff, 'SHERIFF_POST_SPEECH', systemPrompt);

    this.emitAgentThinking(sheriff);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, sheriff.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', sheriff.id, content);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${sheriff.name}] LLM error on sheriff post speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${sheriff.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(`Error getting sheriff post speech from ${sheriff.name} (after ${MAX_LLM_RETRIES} attempts):`, lastError);
        // Skip speech and proceed to next phase
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        // Emit the speech event (sheriff private visibility)
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: sheriff.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'sheriff_private', agentId: sheriff.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(sheriff);
    }
  }

  private async handleFramerPreSpeech(): Promise<void> {
    const framer = this.engine.getAgentManager().getAliveFramer();
    if (!framer) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(framer.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(framer, 'FRAMER_PRE_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      framer,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(framer, 'FRAMER_PRE_SPEECH', systemPrompt);

    this.emitAgentThinking(framer);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, framer.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', framer.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${framer.name}] LLM error on framer pre speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${framer.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting framer pre speech from ${framer.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: framer.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'framer_private', agentId: framer.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(framer);
    }
  }

  private async handleConsiglierePostSpeech(): Promise<void> {
    const consigliere = this.engine.getAgentManager().getAliveConsigliere();
    if (!consigliere) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(consigliere.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(consigliere, 'CONSIGLIERE_POST_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      consigliere,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(consigliere, 'CONSIGLIERE_POST_SPEECH', systemPrompt);

    this.emitAgentThinking(consigliere);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, consigliere.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', consigliere.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${consigliere.name}] LLM error on consigliere post speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${consigliere.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting consigliere post speech from ${consigliere.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: consigliere.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'consigliere_private', agentId: consigliere.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(consigliere);
    }
  }

  private async handleTavernKeeperPreSpeech(): Promise<void> {
    const tavernKeeper = this.engine.getAgentManager().getAliveTavernKeeper();
    if (!tavernKeeper) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(tavernKeeper.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(tavernKeeper, 'TAVERN_KEEPER_PRE_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      tavernKeeper,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(tavernKeeper, 'TAVERN_KEEPER_PRE_SPEECH', systemPrompt);

    this.emitAgentThinking(tavernKeeper);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, tavernKeeper.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', tavernKeeper.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${tavernKeeper.name}] LLM error on tavern keeper pre speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${tavernKeeper.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting tavern keeper pre speech from ${tavernKeeper.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: tavernKeeper.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'tavern_keeper_private', agentId: tavernKeeper.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(tavernKeeper);
    }
  }

  private async handleDoctorPreSpeech(): Promise<void> {
    const doctor = this.engine.getAgentManager().getAliveDoctor();
    if (!doctor) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(doctor.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(doctor, 'DOCTOR_PRE_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      doctor,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(doctor, 'DOCTOR_PRE_SPEECH', systemPrompt);

    this.emitAgentThinking(doctor);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, doctor.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', doctor.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${doctor.name}] LLM error on doctor pre speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${doctor.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting doctor pre speech from ${doctor.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: doctor.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'doctor_private', agentId: doctor.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(doctor);
    }
  }

  private async handleVigilantePreSpeech(): Promise<void> {
    const vigilante = this.engine.getAgentManager().getAliveVigilante();
    if (!vigilante) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(vigilante.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(vigilante, 'VIGILANTE_PRE_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      vigilante,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(vigilante, 'VIGILANTE_PRE_SPEECH', systemPrompt);

    this.emitAgentThinking(vigilante);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, vigilante.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', vigilante.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${vigilante.name}] LLM error on vigilante pre speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${vigilante.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting vigilante pre speech from ${vigilante.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: vigilante.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'vigilante_private', agentId: vigilante.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(vigilante);
    }
  }

  private async handleWerewolfPreSpeech(): Promise<void> {
    const werewolf = this.engine.getAgentManager().getAliveWerewolf();
    if (!werewolf) {
      this.engine.nextPhase();
      return;
    }

    // Skip pre-speech if werewolf can't act tonight (odd nights)
    // The engine already transitions to lookout phase, so just return
    if (!this.engine.canWerewolfActTonight()) {
      return;
    }

    const service = this.llmServices.get(werewolf.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(werewolf, 'WEREWOLF_PRE_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      werewolf,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(werewolf, 'WEREWOLF_PRE_SPEECH', systemPrompt);

    this.emitAgentThinking(werewolf);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, werewolf.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', werewolf.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${werewolf.name}] LLM error on werewolf pre speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${werewolf.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting werewolf pre speech from ${werewolf.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: werewolf.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'werewolf_private', agentId: werewolf.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(werewolf);
    }
  }

  private async handleLookoutPostSpeech(): Promise<void> {
    const lookout = this.engine.getAgentManager().getAliveLookout();
    if (!lookout) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(lookout.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(lookout, 'LOOKOUT_POST_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      lookout,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(lookout, 'LOOKOUT_POST_SPEECH', systemPrompt);

    this.emitAgentThinking(lookout);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, lookout.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', lookout.id, content);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${lookout.name}] LLM error on lookout post speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${lookout.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(`Error getting lookout post speech from ${lookout.name} (after ${MAX_LLM_RETRIES} attempts):`, lastError);
        // Skip speech and proceed to next phase
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        // Emit the speech event (lookout private visibility)
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: lookout.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: { kind: 'lookout_private', agentId: lookout.id },
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(lookout);
    }
  }

  private shouldOfferMayorReveal(agent: GameAgent, phase: Phase): boolean {
    if (agent.role !== 'MAYOR' || agent.hasRevealedMayor) {
      return false;
    }

    return (
      phase === 'DAY_ONE_DISCUSSION' ||
      phase === 'DAY_DISCUSSION' ||
      phase === 'POST_EXECUTION_DISCUSSION'
    );
  }

  private async handleMayorRevealPrompt(agent: GameAgent, service: LLMService): Promise<void> {
    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(agent, 'MAYOR_REVEAL_CHOICE', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      agent,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(agent, 'MAYOR_REVEAL_CHOICE', systemPrompt);

    let content = '';
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
      content = '';

      try {
        const response = await service.generate(messages, systemPrompt, agent.model);

        content = response.content;
        this.emit('streaming_message', agent.id, content);

        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        console.error(`\n[${agent.name}] LLM error on mayor reveal attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

        if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
          const delay = RETRY_DELAY_MS * attempt;
          console.log(`[${agent.name}] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        break;
      }
    }

    if (lastError) {
      console.error(
        `Error getting mayor reveal choice from ${agent.name} (after ${MAX_LLM_RETRIES} attempts):`,
        lastError
      );
      return;
    }

    const result = ResponseParser.parseMayorRevealResponse(content);
    if (result.success && result.data?.reveal) {
      this.engine.getAgentManager().revealMayor(agent.id);
      this.engine.appendNotification(`**${agent.name} is the Mayor!**`);
    }
  }

  private async handleJailConversation(): Promise<void> {
    if (!this.isRunning) return;

    const jailor = this.engine.getAgentManager().getAliveJailor();
    const prisonerId = this.engine.getPendingJailTarget();
    const prisoner = prisonerId ? this.engine.getAgentManager().getAgent(prisonerId) : null;

    if (!jailor || !prisoner) {
      this.engine.nextPhase();
      return;
    }

    // 6 turns: Jailor → Prisoner → Jailor → Prisoner → Jailor → Prisoner
    const speakers = [jailor, prisoner, jailor, prisoner, jailor, prisoner];
    const jailVisibility = VisibilityFilter.jailConversation(jailor.id, prisoner.id);

    for (let i = 0; i < speakers.length; i++) {
      if (!this.isRunning) return;

      const speaker = speakers[i];

      const service = this.llmServices.get(speaker.id);
      if (!service) continue;

      this.emitAgentThinking(speaker);

      let content = '';
      let thinkingContent = '';
      let lastError: unknown = null;

      try {
        const state = this.engine.getState();
        const systemPrompt = PromptBuilder.buildSystemPrompt(speaker, 'JAIL_CONVERSATION', state);
        const messages = PromptBuilder.buildMessagesForAgent(
          speaker,
          state.events,
          state.agents
        );

        // Log the system prompt
        await getLoggingService().logPrompt(speaker, 'JAIL_CONVERSATION', systemPrompt);

        for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
          content = '';
          thinkingContent = '';

          try {
            const response = await service.generate(messages, systemPrompt, speaker.model);
            content = response.content;
            thinkingContent = response.thinkingContent || '';
            this.emit('streaming_message', speaker.id, content);
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            console.error(`\n[${speaker.name}] LLM error on jail conversation attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

            if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
              const delay = RETRY_DELAY_MS * attempt;
              await sleep(delay);
              continue;
            }
            break;
          }
        }

        if (lastError) {
          console.error(`Error getting jail conversation from ${speaker.name}:`, lastError);
          // Emit a placeholder event so the conversation continues
          const event: SpeechEvent = {
            type: 'SPEECH',
            agentId: speaker.id,
            messageMarkdown: '*chose not to speak.*',
            visibility: jailVisibility,
            ts: Date.now(),
          };
          this.engine.appendEvent(event);
          continue;
        }

        const parseResult = ResponseParser.parseStreamingSpeakResponse(content);
        if (parseResult.success && parseResult.data) {
          const event: SpeechEvent = {
            type: 'SPEECH',
            agentId: speaker.id,
            messageMarkdown: parseResult.data.action === 'SAY' && parseResult.data.message_markdown?.trim()
              ? parseResult.data.message_markdown
              : '*chose not to speak.*',
            visibility: jailVisibility,
            ts: Date.now(),
            reasoning: thinkingContent,
          };
          this.engine.appendEvent(event);
        } else {
          // Parse failed, emit placeholder
          const event: SpeechEvent = {
            type: 'SPEECH',
            agentId: speaker.id,
            messageMarkdown: '*chose not to speak.*',
            visibility: jailVisibility,
            ts: Date.now(),
          };
          this.engine.appendEvent(event);
        }
      } finally {
        this.emitAgentThinkingDone(speaker);
      }
    }

    this.engine.nextPhase();
  }

  private async handleJesterHauntPreSpeech(): Promise<void> {
    const jester = this.engine.getLynchingJester();
    if (!jester) {
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(jester.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    const state = this.engine.getState();
    const systemPrompt = PromptBuilder.buildSystemPrompt(jester, 'JESTER_HAUNT_PRE_SPEECH', state);
    const messages = PromptBuilder.buildMessagesForAgent(
      jester,
      state.events,
      state.agents
    );

    // Log the system prompt
    await getLoggingService().logPrompt(jester, 'JESTER_HAUNT_PRE_SPEECH', systemPrompt);

    this.emitAgentThinking(jester);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, jester.model);

          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', jester.id, content);

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${jester.name}] LLM error on jester haunt pre speech attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            console.log(`[${jester.name}] Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          break;
        }
      }

      if (lastError) {
        console.error(
          `Error getting jester haunt pre speech from ${jester.name} (after ${MAX_LLM_RETRIES} attempts):`,
          lastError
        );
        this.engine.nextPhase();
        return;
      }

      const result = ResponseParser.parseStreamingSpeakResponse(content);
      if (result.success && result.data) {
        const event: SpeechEvent = {
          type: 'SPEECH',
          agentId: jester.id,
          messageMarkdown: result.data.action === 'SAY' && result.data.message_markdown?.trim()
            ? result.data.message_markdown
            : '*chose not to speak.*',
          visibility: VisibilityFilter.jesterPrivate(jester.id),
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(event);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(jester);
    }
  }

  private async handleJailorExecuteChoice(): Promise<void> {
    if (!this.isRunning) return;

    const jailor = this.engine.getAgentManager().getAliveJailor();
    const prisonerId = this.engine.getPendingJailTarget();
    const prisoner = prisonerId ? this.engine.getAgentManager().getAgent(prisonerId) : null;

    if (!jailor || !prisoner) {
      this.engine.nextPhase();
      return;
    }

    // Check if Jailor has execution power
    if (!this.engine.hasJailorExecutionPower()) {
      if (this.engine.hasJailorLostExecutionPower()) {
        this.engine.appendNotification(
          '**You have lost the ability to execute after killing a Town member.**',
          VisibilityFilter.jailorPrivate(jailor.id)
        );
      } else {
        this.engine.appendNotification(
          '**You have no executions remaining.**',
          VisibilityFilter.jailorPrivate(jailor.id)
        );
      }
      this.engine.nextPhase();
      return;
    }

    const service = this.llmServices.get(jailor.id);
    if (!service) {
      this.engine.nextPhase();
      return;
    }

    this.emitAgentThinking(jailor);

    let content = '';
    let thinkingContent = '';
    let lastError: unknown = null;

    try {
      const state = this.engine.getState();
      const systemPrompt = PromptBuilder.buildSystemPrompt(jailor, 'JAILOR_EXECUTE_CHOICE', state);
      const messages = PromptBuilder.buildMessagesForAgent(
        jailor,
        state.events,
        state.agents
      );

      // Log the system prompt
      await getLoggingService().logPrompt(jailor, 'JAILOR_EXECUTE_CHOICE', systemPrompt);

      for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        content = '';
        thinkingContent = '';

        try {
          const response = await service.generate(messages, systemPrompt, jailor.model);
          content = response.content;
          thinkingContent = response.thinkingContent || '';
          this.emit('streaming_message', jailor.id, content);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${jailor.name}] LLM error on execute choice attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt;
            await sleep(delay);
            continue;
          }
          break;
        }
      }

      if (lastError) {
        console.error(`Error getting execute choice from ${jailor.name}:`, lastError);
        // Default to not executing on error
        this.engine.nextPhase();
        return;
      }

      const parseResult = ResponseParser.parseExecuteChoiceResponse(content);

      if (parseResult.success && parseResult.data?.execute) {
        // Jailor chose to execute
        this.engine.useJailorExecution();
        this.engine.setPendingJailorExecution(prisoner.id);

        // Emit choice event
        const choiceEvent: ChoiceEvent = {
          type: 'CHOICE',
          agentId: jailor.id,
          targetName: prisoner.name,
          choiceType: 'JAILOR_EXECUTE',
          visibility: VisibilityFilter.jailorPrivate(jailor.id),
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(choiceEvent);

        // Execute immediately (UNSTOPPABLE attack - prisoner cannot perform night actions)
        this.engine.executeImmediateJailorKill(prisoner.id);

        // Check if prisoner is Town - lose execution power
        if (prisoner.faction === 'TOWN') {
          this.engine.setJailorLostExecutionPower();
        }
      } else {
        // Jailor chose to abstain
        const abstainEvent: ChoiceEvent = {
          type: 'CHOICE',
          agentId: jailor.id,
          targetName: prisoner.name,
          choiceType: 'JAILOR_ABSTAIN',
          visibility: VisibilityFilter.jailorPrivate(jailor.id),
          ts: Date.now(),
          reasoning: thinkingContent,
        };
        this.engine.appendEvent(abstainEvent);
      }

      this.engine.nextPhase();
    } finally {
      this.emitAgentThinkingDone(jailor);
    }
  }
}
