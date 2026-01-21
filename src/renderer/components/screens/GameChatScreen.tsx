import React, { useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { GameEventItem } from '../chat/GameEventItem';
import { ThinkingIndicator } from '../chat/ThinkingIndicator';
import type { Phase } from '@shared/types';
import { ROLE_COLORS } from '@shared/types';
import styles from './GameChatScreen.module.css';

const PHASE_LABELS: Record<Phase, string> = {
  DAY_DISCUSSION: 'Day Discussion',
  DAY_VOTE: 'Day Voting',
  LAST_WORDS: 'Last Words',
  POST_EXECUTION_DISCUSSION: 'Post-Execution Discussion',
  DOCTOR_CHOICE: 'Night - Doctor Protection',
  SHERIFF_CHOICE: 'Night - Sheriff Investigation',
  SHERIFF_POST_SPEECH: "Sheriff's Reaction",
  LOOKOUT_CHOICE: 'Night - Lookout Watch',
  LOOKOUT_POST_SPEECH: "Lookout's Reaction",
  NIGHT_DISCUSSION: 'Night - Mafia Discussion',
  NIGHT_VOTE: 'Night - Mafia Voting',
};

export function GameChatScreen() {
  const { gameState, stopGame, resetGame, thinkingAgent, pauseGame, resumeGame } = useGameStore();
  const { setScreen } = useUIStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    gameState.phase === 'LOOKOUT_POST_SPEECH';

  const visibleEvents = gameState.events;
  const thinkingAgentModel = thinkingAgent ? getAgentById(thinkingAgent.agentId) : null;
  let lastReasoningIndex = -1;
  for (let i = visibleEvents.length - 1; i >= 0; i--) {
    const event = visibleEvents[i];
    if ((event.type === 'SPEECH' || event.type === 'VOTE' || event.type === 'CHOICE') && (event as any).reasoning) {
      lastReasoningIndex = i;
      break;
    }
  }

  return (
    <div className={`${styles.container} ${isNightPhase ? styles.nightMode : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h2 className={styles.gameName}>Mafia Game</h2>
          <div className={styles.phaseInfo}>
            <span className={styles.dayNumber}>Day {gameState.dayNumber}</span>
            <span className={styles.phaseName}>{PHASE_LABELS[gameState.phase]}</span>
          </div>
        </div>
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

      <div className={styles.events}>
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
                defaultReasoningExpanded={index === lastReasoningIndex}
              />
            ))}
            {thinkingAgent && (
              <div className={styles.thinkingIndicator}>
                <ThinkingIndicator
                  agentName={thinkingAgent.agentName}
                  color={thinkingAgentModel ? ROLE_COLORS[thinkingAgentModel.role] : undefined}
                  compact
                />
              </div>
            )}
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
