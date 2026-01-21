import React, { useEffect } from 'react';
import { useChatStore } from './store/chatStore';
import { useSettingsStore } from './store/settingsStore';
import { useUIStore } from './store/uiStore';
import { useGameStore } from './store/gameStore';
import { ThreeColumnLayout } from './components/layout/ThreeColumnLayout';

function App() {
  const { loadChatIndex, addMessage, updateChatStatus, setError, setThinkingAgent, clearThinkingAgent } = useChatStore();
  const { loadSettings } = useSettingsStore();
  const {
    setGameState,
    updatePhase,
    appendEvent,
    setAgentDead,
    setGameOver,
    setStreamingMessage,
    setThinkingAgent: setGameThinkingAgent,
    clearThinkingAgent: clearGameThinkingAgent,
  } = useGameStore();

  useEffect(() => {
    // Load initial data
    loadChatIndex();
    loadSettings();

    // Set up chat IPC listeners
    const unsubscribeStarted = window.api.onChatStarted(({ chatId }) => {
      updateChatStatus(chatId, true);
    });

    const unsubscribeStopped = window.api.onChatStopped(({ chatId }) => {
      updateChatStatus(chatId, false);
    });

    const unsubscribeMessage = window.api.onMessageAdded(({ chatId, message }) => {
      addMessage(chatId, message);
    });

    const unsubscribeError = window.api.onChatError(({ chatId, error }) => {
      clearThinkingAgent(chatId);
      setError(error);
    });

    const unsubscribeThinking = window.api.onAgentThinking(({ chatId, agentId, agentName }) => {
      setThinkingAgent(chatId, agentId, agentName);
    });

    // Set up game IPC listeners
    const unsubscribeGameEvent = window.api.onGameEventAppended((event) => {
      appendEvent(event);
    });

    const unsubscribeGamePhase = window.api.onGamePhaseChanged(({ phase, dayNumber }) => {
      updatePhase(phase, dayNumber);
    });

    const unsubscribeGameOver = window.api.onGameOver(({ winner }) => {
      setGameOver(winner);
    });

    const unsubscribeAgentDied = window.api.onGameAgentDied(({ agentId }) => {
      setAgentDead(agentId);
    });

    const unsubscribeGameThinking = window.api.onGameAgentThinking(({ agentId, agentName }) => {
      setGameThinkingAgent(agentId, agentName);
    });

    const unsubscribeGameThinkingDone = window.api.onGameAgentThinkingDone(({ agentId }) => {
      clearGameThinkingAgent(agentId);
    });

    const unsubscribeStreaming = window.api.onGameStreamingMessage(({ agentId, content }) => {
      setStreamingMessage({ agentId, content });
    });

    const unsubscribeGameState = window.api.onGameStateUpdate((state) => {
      setGameState(state);
    });

    return () => {
      unsubscribeStarted();
      unsubscribeStopped();
      unsubscribeMessage();
      unsubscribeError();
      unsubscribeThinking();
      unsubscribeGameEvent();
      unsubscribeGamePhase();
      unsubscribeGameOver();
      unsubscribeAgentDied();
      unsubscribeGameThinking();
      unsubscribeGameThinkingDone();
      unsubscribeStreaming();
      unsubscribeGameState();
    };
  }, []);

  return <ThreeColumnLayout />;
}

export default App;
