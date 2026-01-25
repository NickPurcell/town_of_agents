import React, { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { GameEventItem } from '../chat/GameEventItem';
import { ThinkingIndicator } from '../chat/ThinkingIndicator';
import { StreamingSpeech } from '../chat/StreamingSpeech';
import type { Phase } from '@shared/types';
import styles from './GameChatScreen.module.css';

const PHASE_LABELS: Record<Phase, string> = {
  MAYOR_REVEAL_CHOICE: 'Mayor Decision',
  DAY_ONE_DISCUSSION: 'Day 1 - Introductions',
  DAY_DISCUSSION: 'Day Discussion',
  DAY_VOTE: 'Day Voting',
  LAST_WORDS: 'Last Words',
  JESTER_HAUNT_PRE_SPEECH: "Jester's Revenge",
  JESTER_HAUNT_CHOICE: "Jester's Haunting",
  POST_EXECUTION_DISCUSSION: 'Post-Execution Discussion',
  DOCTOR_PRE_SPEECH: 'Night - Doctor Deliberation',
  DOCTOR_CHOICE: 'Night - Doctor Protection',
  VIGILANTE_PRE_SPEECH: 'Night - Vigilante Deliberation',
  VIGILANTE_CHOICE: 'Night - Vigilante Shot',
  FRAMER_PRE_SPEECH: 'Night - Framer Deliberation',
  FRAMER_CHOICE: 'Night - Framer Framing',
  CONSIGLIERE_CHOICE: 'Night - Consigliere Investigation',
  CONSIGLIERE_POST_SPEECH: "Consigliere's Reaction",
  TAVERN_KEEPER_PRE_SPEECH: 'Night - Tavern Keeper Deliberation',
  TAVERN_KEEPER_CHOICE: 'Night - Tavern Keeper Roleblock',
  SHERIFF_CHOICE: 'Night - Sheriff Investigation',
  SHERIFF_POST_SPEECH: "Sheriff's Reaction",
  LOOKOUT_CHOICE: 'Night - Lookout Watch',
  LOOKOUT_POST_SPEECH: "Lookout's Reaction",
  WEREWOLF_PRE_SPEECH: 'Night - Werewolf Deliberation',
  WEREWOLF_CHOICE: 'Night - Werewolf Rampage',
  NIGHT_DISCUSSION: 'Night - Mafia Discussion',
  NIGHT_VOTE: 'Night - Mafia Voting',
  JAILOR_CHOICE: 'Night - Jailor Selection',
  JAIL_CONVERSATION: 'Night - Jail Interrogation',
  JAILOR_EXECUTE_CHOICE: 'Night - Jailor Execution',
  POST_GAME_DISCUSSION: 'Post-Game Discussion',
};

export function GameChatScreen() {
  const { gameState, stopGame, resetGame, thinkingAgent, streamingContent, streamingThinkingContent, pauseGame, resumeGame } = useGameStore();
  const { setScreen } = useUIStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventsContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Check if scrolled to bottom (with 50px tolerance)
  const checkIfAtBottom = useCallback(() => {
    const container = eventsContainerRef.current;
    if (!container) return true;
    const threshold = 50;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
  }, []);

  // Handle scroll events to track if user is at bottom
  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  // Auto-scroll to bottom when content changes, but only if already at bottom
  useEffect(() => {
    if (isAtBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState?.events.length, thinkingAgent, streamingContent, streamingThinkingContent]);

  if (!gameState) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>No game in progress</p>
          <button
            className={styles.newGameButton}
            onClick={() => setScreen('gameSetup')}
          >
            Start New Game
          </button>
        </div>
      </div>
    );
  }

  const handleStopGame = async () => {
    await stopGame();
    resetGame();
    setScreen('welcome');
  };

  const isPaused = Boolean(gameState?.isPaused);

  const handleTogglePause = async () => {
    if (!gameState || gameState.winner) return;
    if (isPaused) {
      await resumeGame();
    } else {
      await pauseGame();
    }
  };

  const getAgentById = (agentId: string) => {
    return gameState.agents.find(a => a.id === agentId);
  };

  const isNightPhase = gameState.phase.startsWith('NIGHT') ||
    gameState.phase === 'SHERIFF_CHOICE' ||
    gameState.phase === 'DOCTOR_CHOICE' ||
    gameState.phase === 'SHERIFF_POST_SPEECH' ||
    gameState.phase === 'LOOKOUT_CHOICE' ||
    gameState.phase === 'LOOKOUT_POST_SPEECH' ||
    gameState.phase === 'VIGILANTE_PRE_SPEECH' ||
    gameState.phase === 'VIGILANTE_CHOICE';

  const visibleEvents = gameState.events;
  const thinkingAgentModel = thinkingAgent ? getAgentById(thinkingAgent.agentId) : null;

  return (
    <div className={`${styles.container} ${isNightPhase ? styles.nightMode : ''}`}>
      <div className={styles.header}>
        <h2 className={styles.phaseTitle}>
          Day {gameState.dayNumber} - {PHASE_LABELS[gameState.phase]}
        </h2>
        <div className={styles.headerActions}>
          {gameState.winner ? (
            <span className={`${styles.winnerBadge} ${gameState.winner === 'TOWN' ? styles.townWin : styles.mafiaWin}`}>
              {gameState.winner === 'TOWN' ? 'Town Wins!' : 'Mafia Wins!'}
            </span>
          ) : (
            <span className={`${styles.statusBadge} ${isPaused ? styles.inactive : styles.active}`}>
              {isPaused ? '○ Paused' : '● In Progress'}
            </span>
          )}
          {!gameState.winner && (
            <button
              className={`${styles.pauseButton} ${isPaused ? styles.resumeButton : ''}`}
              onClick={handleTogglePause}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            className={styles.stopButton}
            onClick={handleStopGame}
          >
            {gameState.winner ? 'New Game' : 'End Game'}
          </button>
        </div>
      </div>

      <div className={styles.events} ref={eventsContainerRef} onScroll={handleScroll}>
        {visibleEvents.length === 0 && !thinkingAgent ? (
          <div className={styles.emptyEvents}>
            <p>Waiting for the game to start...</p>
          </div>
        ) : (
          <>
            {visibleEvents.map((event, index) => (
              <GameEventItem
                key={`${event.type}-${event.ts}-${index}`}
                event={event}
                agent={event.type === 'SPEECH' || event.type === 'VOTE' || event.type === 'DEATH' || event.type === 'CHOICE'
                  ? getAgentById((event as any).agentId)
                  : undefined}
              />
            ))}
            {thinkingAgent && thinkingAgentModel && (() => {
              const streamingData = streamingContent.get(thinkingAgent.agentId);
              const thinkingData = streamingThinkingContent.get(thinkingAgent.agentId);
              const hasStreamingContent = streamingData && streamingData.content.length > 0;

              // Show StreamingSpeech when message content starts streaming
              if (hasStreamingContent) {
                return (
                  <StreamingSpeech
                    agent={thinkingAgentModel}
                    content={streamingData.content}
                    isComplete={streamingData.isComplete}
                    reasoningContent={thinkingData?.content}
                  />
                );
              }

              // Show ThinkingIndicator while waiting or reasoning is streaming
              return (
                <ThinkingIndicator
                  agent={thinkingAgentModel}
                  thinkingContent={thinkingData?.content}
                />
              );
            })()}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Town:</span>
          <span className={styles.statValue}>
            {gameState.agents.filter(a => a.faction === 'TOWN' && a.alive).length} /
            {gameState.agents.filter(a => a.faction === 'TOWN').length}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Mafia:</span>
          <span className={styles.statValue}>
            {gameState.agents.filter(a => a.faction === 'MAFIA' && a.alive).length} /
            {gameState.agents.filter(a => a.faction === 'MAFIA').length}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Alive:</span>
          <span className={styles.statValue}>
            {gameState.agents.filter(a => a.alive).length} /
            {gameState.agents.length}
          </span>
        </div>
      </div>
    </div>
  );
}
