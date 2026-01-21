import React from 'react';
import { LeftSidebar } from './LeftSidebar';
import { CenterPanel } from './CenterPanel';
import styles from './ThreeColumnLayout.module.css';

export function ThreeColumnLayout() {
  return (
    <div className={styles.container}>
      <div className={styles.leftColumn}>
        <LeftSidebar />
      </div>
      <div className={styles.centerColumn}>
        <CenterPanel />
      </div>
    </div>
  );
}
