import { create } from 'zustand';
import type { GameState, GameEvent, Phase, Role, Faction, SideChatMessage } from '@shared/types';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
}

interface ThinkingAgent {
  agentId: string;
  agentName: string;
  startedAt: number;
}

interface SideChatThread {
  messages: SideChatMessage[];
  isLoading: boolean;
  error?: string;
  pendingSince?: number;
}

interface StreamingContent {
  content: string;
  isComplete: boolean;
}

interface StreamingThinkingContent {
  content: string;
}

interface GameStore {
  // Setup state
  pendingAgents: PendingAgent[];
  isSettingUp: boolean;

  // Game state
  gameState: GameState | null;
  isGameActive: boolean;
  streamingMessage: { agentId: string; content: string } | null;
  streamingContent: Map<string, StreamingContent>;
  streamingThinkingContent: Map<string, StreamingThinkingContent>;
  thinkingAgent: ThinkingAgent | null;
  sideChatThreads: Record<string, SideChatThread>;

  // Setup actions
  addPendingAgent: (agent: PendingAgent) => void;
  removePendingAgent: (name: string) => void;
  clearPendingAgents: () => void;
  canStartGame: () => boolean;

  // Game actions
  setGameState: (state: GameState | null) => void;
  updatePhase: (phase: Phase, dayNumber: number) => void;
  appendEvent: (event: GameEvent) => void;
  setAgentDead: (agentId: string) => void;
  setGameOver: (winner: Faction) => void;
  setStreamingMessage: (message: { agentId: string; content: string } | null) => void;
  appendStreamingChunk: (agentId: string, chunk: string) => void;
  completeStreaming: (agentId: string) => void;
  appendStreamingThinkingChunk: (agentId: string, chunk: string) => void;
  clearStreamingThinking: (agentId: string) => void;
  setThinkingAgent: (agentId: string, agentName: string) => void;
  clearThinkingAgent: (agentId?: string) => void;
  sendSideChatMessage: (agentId: string, content: string) => Promise<void>;
  clearSideChat: (agentId?: string) => void;
  resetGame: () => void;

  // Start game
  startGame: () => Promise<void>;
  stopGame: () => Promise<void>;
  pauseGame: () => Promise<void>;
  resumeGame: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial setup state
  pendingAgents: [],
  isSettingUp: true,

  // Initial game state
  gameState: null,
  isGameActive: false,
  streamingMessage: null,
  streamingContent: new Map(),
  streamingThinkingContent: new Map(),
  thinkingAgent: null,
  sideChatThreads: {},

  // Setup actions
  addPendingAgent: (agent: PendingAgent) => {
    const { pendingAgents } = get();
    // Check for duplicate names
    if (pendingAgents.some(a => a.name.toLowerCase() === agent.name.toLowerCase())) {
      console.warn('Agent with this name already exists');
      return;
    }
    set({ pendingAgents: [...pendingAgents, agent] });
  },

  removePendingAgent: (name: string) => {
    const { pendingAgents } = get();
    set({ pendingAgents: pendingAgents.filter(a => a.name !== name) });
  },

  clearPendingAgents: () => {
    set({ pendingAgents: [] });
  },

  canStartGame: () => {
    const { pendingAgents } = get();
    // Need at least 1 of each required role (Godfather counts as Mafia)
    const hasMafia = pendingAgents.some(a => a.role === 'MAFIA' || a.role === 'GODFATHER');
    const hasSheriff = pendingAgents.some(a => a.role === 'SHERIFF');
    const hasDoctor = pendingAgents.some(a => a.role === 'DOCTOR');
    const hasJailor = pendingAgents.some(a => a.role === 'JAILOR');

    return hasMafia && hasSheriff && hasDoctor && hasJailor;
  },

  // Game actions
  setGameState: (state: GameState | null) => {
    set({ gameState: state, isGameActive: state !== null && !state.winner });
  },

  updatePhase: (phase: Phase, dayNumber: number) => {
    const { gameState } = get();
    if (gameState) {
      set({
        gameState: {
          ...gameState,
          phase,
          dayNumber,
        },
      });
    }
  },

  appendEvent: (event: GameEvent) => {
    const { gameState, thinkingAgent, streamingContent, streamingThinkingContent } = get();
    if (gameState) {
      const eventAgentId = 'agentId' in event ? (event as { agentId?: string }).agentId : null;
      const shouldClearThinking = Boolean(
        thinkingAgent &&
        eventAgentId &&
        eventAgentId === thinkingAgent.agentId
      );

      // Clear streaming content for this agent when event is appended
      let newStreamingContent = streamingContent;
      if (eventAgentId && streamingContent.has(eventAgentId)) {
        newStreamingContent = new Map(streamingContent);
        newStreamingContent.delete(eventAgentId);
      }

      // Clear streaming thinking content for this agent when event is appended
      let newStreamingThinkingContent = streamingThinkingContent;
      if (eventAgentId && streamingThinkingContent.has(eventAgentId)) {
        newStreamingThinkingContent = new Map(streamingThinkingContent);
        newStreamingThinkingContent.delete(eventAgentId);
      }

      set({
        gameState: {
          ...gameState,
          events: [...gameState.events, event],
        },
        thinkingAgent: shouldClearThinking ? null : thinkingAgent,
        streamingContent: newStreamingContent,
        streamingThinkingContent: newStreamingThinkingContent,
      });
    }
  },

  setAgentDead: (agentId: string) => {
    const { gameState } = get();
    if (gameState) {
      set({
        gameState: {
          ...gameState,
          agents: gameState.agents.map(a =>
            a.id === agentId ? { ...a, alive: false } : a
          ),
        },
      });
    }
  },

  setGameOver: (winner: Faction) => {
    const { gameState } = get();
    if (gameState) {
      set({
        gameState: {
          ...gameState,
          winner,
        },
        isGameActive: false,
      });
    }
  },

  setStreamingMessage: (message) => {
    set({ streamingMessage: message });
  },

  appendStreamingChunk: (agentId: string, chunk: string) => {
    set(state => {
      const newMap = new Map(state.streamingContent);
      const existing = newMap.get(agentId);
      newMap.set(agentId, {
        content: (existing?.content || '') + chunk,
        isComplete: false,
      });
      return { streamingContent: newMap };
    });
  },

  completeStreaming: (agentId: string) => {
    set(state => {
      const newMap = new Map(state.streamingContent);
      const existing = newMap.get(agentId);
      if (existing) {
        newMap.set(agentId, {
          ...existing,
          isComplete: true,
        });
      }
      return { streamingContent: newMap };
    });
  },

  appendStreamingThinkingChunk: (agentId: string, chunk: string) => {
    set(state => {
      const newMap = new Map(state.streamingThinkingContent);
      const existing = newMap.get(agentId);
      newMap.set(agentId, {
        content: (existing?.content || '') + chunk,
      });
      return { streamingThinkingContent: newMap };
    });
  },

  clearStreamingThinking: (agentId: string) => {
    set(state => {
      const newMap = new Map(state.streamingThinkingContent);
      newMap.delete(agentId);
      return { streamingThinkingContent: newMap };
    });
  },

  setThinkingAgent: (agentId: string, agentName: string) => {
    set({ thinkingAgent: { agentId, agentName, startedAt: Date.now() } });
  },

  clearThinkingAgent: (agentId?: string) => {
    const { thinkingAgent } = get();
    if (!thinkingAgent) return;
    if (!agentId || thinkingAgent.agentId === agentId) {
      set({ thinkingAgent: null });
    }
  },

  sendSideChatMessage: async (agentId: string, content: string) => {
    const { sideChatThreads } = get();
    const now = Date.now();
    const newMessage: SideChatMessage = {
      id: `${now}-${Math.random().toString(16).slice(2)}`,
      role: 'user',
      content,
      timestamp: now,
    };

    const existingThread = sideChatThreads[agentId] || {
      messages: [],
      isLoading: false,
    };

    const nextThread: SideChatThread = {
      messages: [...existingThread.messages, newMessage],
      isLoading: true,
      pendingSince: now,
    };

    set({
      sideChatThreads: {
        ...sideChatThreads,
        [agentId]: nextThread,
      },
    });

    try {
      const response = await window.api.gameAskAgent(agentId, nextThread.messages);
      const replyTimestamp = Date.now();
      const replyMessage: SideChatMessage = {
        id: `${replyTimestamp}-${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        content: response.content,
        timestamp: replyTimestamp,
      };

      set(state => {
        const thread = state.sideChatThreads[agentId] || nextThread;
        return {
          sideChatThreads: {
            ...state.sideChatThreads,
            [agentId]: {
              ...thread,
              isLoading: false,
              pendingSince: undefined,
              error: undefined,
              messages: [...thread.messages, replyMessage],
            },
          },
        };
      });
    } catch (error) {
      set(state => {
        const thread = state.sideChatThreads[agentId] || nextThread;
        return {
          sideChatThreads: {
            ...state.sideChatThreads,
            [agentId]: {
              ...thread,
              isLoading: false,
              pendingSince: undefined,
              error: (error as Error).message,
            },
          },
        };
      });
    }
  },

  clearSideChat: (agentId?: string) => {
    if (!agentId) {
      set({ sideChatThreads: {} });
      return;
    }
    set(state => {
      const nextThreads = { ...state.sideChatThreads };
      delete nextThreads[agentId];
      return { sideChatThreads: nextThreads };
    });
  },

  resetGame: () => {
    set({
      gameState: null,
      isGameActive: false,
      streamingMessage: null,
      streamingContent: new Map(),
      streamingThinkingContent: new Map(),
      thinkingAgent: null,
      isSettingUp: true,
      sideChatThreads: {},
    });
  },

  // Start game - calls IPC
  startGame: async () => {
    const { pendingAgents } = get();
    if (!get().canStartGame()) {
      console.error('Cannot start game: missing required roles');
      return;
    }

    try {
      set({ sideChatThreads: {}, streamingContent: new Map(), streamingThinkingContent: new Map() });
      set({ isSettingUp: false });
      await window.api.gameStart(pendingAgents);
    } catch (error) {
      console.error('Failed to start game:', error);
      set({ isSettingUp: true });
    }
  },

  // Stop game - calls IPC
  stopGame: async () => {
    try {
      await window.api.gameStop();
      set({ isGameActive: false });
    } catch (error) {
      console.error('Failed to stop game:', error);
    }
  },

  pauseGame: async () => {
    try {
      await window.api.gamePause();
    } catch (error) {
      console.error('Failed to pause game:', error);
    }
  },

  resumeGame: async () => {
    try {
      await window.api.gameResume();
    } catch (error) {
      console.error('Failed to resume game:', error);
    }
  },
}));
