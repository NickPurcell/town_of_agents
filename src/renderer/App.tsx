import React, { useEffect } from 'react';
import { useSettingsStore } from './store/settingsStore';
import { useGameStore } from './store/gameStore';
import { ThreeColumnLayout } from './components/layout/ThreeColumnLayout';

function App() {
  const { loadSettings } = useSettingsStore();
  const {
    setGameState,
    updatePhase,
    appendEvent,
    setAgentDead,
    setGameOver,
    setStreamingMessage,
    appendStreamingChunk,
    completeStreaming,
    setThinkingAgent: setGameThinkingAgent,
    clearThinkingAgent: clearGameThinkingAgent,
  } = useGameStore();

  useEffect(() => {
    // Load initial data
    loadSettings();

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

    const unsubscribeStreamingChunk = window.api.onGameStreamingChunk(({ agentId, chunk, isComplete }) => {
      if (isComplete) {
        completeStreaming(agentId);
      } else {
        appendStreamingChunk(agentId, chunk);
      }
    });

    const unsubscribeGameState = window.api.onGameStateUpdate((state) => {
      setGameState(state);
    });

    return () => {
      unsubscribeGameEvent();
      unsubscribeGamePhase();
      unsubscribeGameOver();
      unsubscribeAgentDied();
      unsubscribeGameThinking();
      unsubscribeGameThinkingDone();
      unsubscribeStreaming();
      unsubscribeStreamingChunk();
      unsubscribeGameState();
    };
  }, []);

  return <ThreeColumnLayout />;
}

export default App;
