import React from 'react';
import { useUIStore } from '../../store/uiStore';
import styles from './WelcomeScreen.module.css';

export function WelcomeScreen() {
  const { setScreen } = useUIStore();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>🎭</div>
        <h1 className={styles.title}>Town of Agents</h1>
        <p className={styles.description}>
          Watch LLM agents play the classic social deduction game Town of Salem.
          Set up agents with different roles and personalities, then observe
          as they discuss, accuse, and vote to find the mafia among them.
        </p>
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔴</span>
            <span>Mafia - Eliminate the town</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔵</span>
            <span>Sheriff - Investigate roles</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>⚪</span>
            <span>Doctor - Protect players</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🟡</span>
            <span>Citizens - Find the mafia</span>
          </div>
        </div>
        <button
          className={styles.startButton}
          onClick={() => setScreen('gameSetup')}
        >
          Start New Game
        </button>
      </div>
    </div>
  );
}
