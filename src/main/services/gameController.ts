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
  Settings,
  GameSettings,
  DEFAULT_GAME_SETTINGS,
  getFactionForRole,
  SideChatMessage,
  LLMResponse,
} from '@shared/types';
import { GameEngine } from '../engine/GameEngine';
import { PhaseRunner } from '../engine/PhaseRunner';
import { PromptBuilder } from '../llm/PromptBuilder';
import { ResponseParser } from '../llm/ResponseParser';
import { createLLMService, LLMService } from './llm';
import { createRateLimitedService, RateLimitedLLMService } from './llm/rateLimiter';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
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
      }
    });
  }

  async initializeGame(pendingAgents: PendingAgent[]): Promise<void> {
    this.isPaused = false;
    this.pendingPhase = null;
    // Convert pending agents to game agents
    const agentConfigs = pendingAgents.map((pa) => ({
      id: uuidv4(),
      name: pa.name,
      role: pa.role,
      personality: pa.personality,
      provider: pa.provider,
      model: pa.model,
    }));

    // Initialize game engine
    this.engine.initializeGame(agentConfigs);

    // Create rate-limited LLM services shared per provider
    // This ensures rate limits apply globally per provider, not per agent
    const providerServices = new Map<string, LLMService>();

    const agents = this.engine.getAgentManager().getAllAgents();
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
      }
    }
  }

  private getApiKeyForProvider(provider: 'openai' | 'anthropic' | 'google'): string {
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
    this.engine.stopGame();
    this.phaseRunner.reset();
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

    switch (phase) {
      case 'DAY_ONE_DISCUSSION':
      case 'DAY_DISCUSSION':
      case 'NIGHT_DISCUSSION':
      case 'POST_EXECUTION_DISCUSSION':
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
        await this.phaseRunner.startChoicePhase();
        break;

      case 'LAST_WORDS':
        await this.handleLastWords();
        break;

      case 'SHERIFF_POST_SPEECH':
        await this.handleSheriffPostSpeech();
        break;

      case 'VIGILANTE_PRE_SPEECH':
        await this.handleVigilantePreSpeech();
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
    if (!this.isRunning || !agent.alive) return;

    const service = this.llmServices.get(agent.id);
    if (!service) return;

    console.log('\n' + '-'.repeat(60));
    console.log(`SPEAK REQUEST: ${agent.name} (${agent.role}) - Phase: ${phase}`);

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

          const generator = service.generateStream(
            messages,
            systemPrompt,
            agent.model,
            (chunk: string) => {
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

              // For SAY, stream the message body content
              if (headerParsed && headerAction === 'SAY') {
                const bodyStartPos = ResponseParser.getMessageBodyStartPosition(content);
                if (bodyStartPos !== -1) {
                  if (!messageBodyStarted) {
                    messageBodyStarted = true;
                    // Get the portion after the marker
                    const newContent = content.slice(bodyStartPos).replace('---END---', '').trim();
                    if (newContent.length > streamedMessageContent.length) {
                      const delta = newContent.slice(streamedMessageContent.length);
                      streamedMessageContent = newContent;
                      this.emit('streaming_chunk', agent.id, delta, false);
                    }
                  } else {
                    // Check for more content
                    const newContent = content.slice(bodyStartPos).replace('---END---', '').trim();
                    if (newContent.length > streamedMessageContent.length) {
                      const delta = newContent.slice(streamedMessageContent.length);
                      streamedMessageContent = newContent;
                      this.emit('streaming_chunk', agent.id, delta, false);
                    }
                  }
                }
              }
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

          this.emit('streaming_message', agent.id, content);
          console.log(`${agent.name}: Response received, content length: ${content.length}`);

          // Success - break out of retry loop
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(`\n[${agent.name}] LLM error on attempt ${attempt}/${MAX_LLM_RETRIES}:`, error);

          if (isRetryableError(error) && attempt < MAX_LLM_RETRIES) {
            const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
            console.log(`[${agent.name}] Retrying in ${delay}ms...`);
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

      const result = ResponseParser.parseSpeakResponse(content);
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

      const result = ResponseParser.parseSpeakResponse(content);
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

      const result = ResponseParser.parseSpeakResponse(content);
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

      const result = ResponseParser.parseSpeakResponse(content);
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
      this.engine.appendNarration(`**${agent.name} is the Mayor!**`);
    }
  }
}
