import React from 'react';
import { useUIStore } from '../../store/uiStore';
import styles from './WelcomeScreen.module.css';

export function WelcomeScreen() {
  const { setScreen } = useUIStore();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <img className={styles.logo} src="/logo.png" alt="Town of Agents" />
        <h1 className={styles.title}>Town of Agents</h1>
        <div className={styles.buttonGroup}>
          <button
            className={styles.factionsButton}
            onClick={() => setScreen('factions')}
          >
            Factions
          </button>
          <button
            className={styles.customButton}
            onClick={() => setScreen('gameSetup')}
          >
            Custom Game
          </button>
        </div>
      </div>
    </div>
  );
}
