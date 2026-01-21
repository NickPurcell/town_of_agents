import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { PlayersMenu } from '../agents/PlayersMenu';
import styles from './LeftSidebar.module.css';

export function LeftSidebar() {
  const { setScreen } = useUIStore();
  const { gameState, isGameActive } = useGameStore();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Town of Agents</h2>
      </div>

      <button
        className={styles.newGameButton}
        onClick={() => setScreen('gameSetup')}
        disabled={isGameActive}
      >
        + New Game
      </button>

      {gameState && (
        <button
          className={styles.viewGameButton}
          onClick={() => setScreen('chat')}
        >
          View Current Game
        </button>
      )}

      <div className={styles.divider} />

      <div className={styles.chatListContainer}>
        <PlayersMenu />
      </div>

      <div className={styles.footer}>
        <button
          className={styles.settingsButton}
          onClick={() => setScreen('settings')}
        >
          Settings
        </button>
      </div>

    </div>
  );
}
