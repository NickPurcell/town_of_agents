import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { ROLE_COLORS } from '@shared/types';
import styles from './PlayersMenu.module.css';

export function PlayersMenu() {
  const { gameState } = useGameStore();
  const { sideChatAgentId, openSideChat } = useUIStore();

  if (!gameState) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Start a game to see players.</p>
      </div>
    );
  }

  const townAgents = gameState.agents.filter(a => a.faction === 'TOWN');
  const mafiaAgents = gameState.agents.filter(a => a.faction === 'MAFIA');
  const neutralAgents = gameState.agents.filter(a => a.faction === 'NEUTRAL');
  const townAlive = townAgents.filter(a => a.alive).length;
  const mafiaAlive = mafiaAgents.filter(a => a.alive).length;
  const neutralAlive = neutralAgents.filter(a => a.alive).length;
  const townFactionStyle = { ['--faction-color' as any]: '#fdd835' } as React.CSSProperties;
  const mafiaFactionStyle = { ['--faction-color' as any]: '#e53935' } as React.CSSProperties;
  const neutralFactionStyle = { ['--faction-color' as any]: '#9c27b0' } as React.CSSProperties;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Players</h3>
      </div>

      <div className={styles.gameRoster}>
        <div className={styles.factionGroup}>
          <h4
            className={styles.factionTitle}
            style={townFactionStyle}
          >
            <span className={styles.factionLabel}>Town</span>
            <span className={styles.factionCount}>
              {townAlive}/{townAgents.length}
            </span>
          </h4>
          <div className={styles.agentList}>
            {townAgents.map(agent => (
              <button
                key={agent.id}
                className={`${styles.gameAgentItem} ${!agent.alive ? styles.dead : ''} ${sideChatAgentId === agent.id ? styles.selected : ''}`}
                style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
                onClick={() => openSideChat(agent.id)}
                type="button"
              >
                <span
                  className={styles.gameAgentName}
                  style={{ color: agent.alive ? ROLE_COLORS[agent.role] : 'var(--text-muted)' }}
                >
                  {agent.name}
                </span>
                <span className={styles.gameAgentRole}>
                  {agent.role}
                </span>
                {!agent.alive && <span className={styles.deadMarker}>Dead</span>}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.factionGroup}>
          <h4
            className={styles.factionTitle}
            style={mafiaFactionStyle}
          >
            <span className={styles.factionLabel}>Mafia</span>
            <span className={styles.factionCount}>
              {mafiaAlive}/{mafiaAgents.length}
            </span>
          </h4>
          <div className={styles.agentList}>
            {mafiaAgents.map(agent => (
              <button
                key={agent.id}
                className={`${styles.gameAgentItem} ${!agent.alive ? styles.dead : ''} ${sideChatAgentId === agent.id ? styles.selected : ''}`}
                style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
                onClick={() => openSideChat(agent.id)}
                type="button"
              >
                <span
                  className={styles.gameAgentName}
                  style={{ color: agent.alive ? ROLE_COLORS[agent.role] : 'var(--text-muted)' }}
                >
                  {agent.name}
                </span>
                <span className={styles.gameAgentRole}>
                  {agent.role}
                </span>
                {!agent.alive && <span className={styles.deadMarker}>Dead</span>}
              </button>
            ))}
          </div>
        </div>

        {neutralAgents.length > 0 && (
          <div className={styles.factionGroup}>
            <h4
              className={styles.factionTitle}
              style={neutralFactionStyle}
            >
              <span className={styles.factionLabel}>Neutral</span>
              <span className={styles.factionCount}>
                {neutralAlive}/{neutralAgents.length}
              </span>
            </h4>
            <div className={styles.agentList}>
              {neutralAgents.map(agent => (
                <button
                  key={agent.id}
                  className={`${styles.gameAgentItem} ${!agent.alive ? styles.dead : ''} ${sideChatAgentId === agent.id ? styles.selected : ''}`}
                  style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
                  onClick={() => openSideChat(agent.id)}
                  type="button"
                >
                  <span
                    className={styles.gameAgentName}
                    style={{ color: agent.alive ? ROLE_COLORS[agent.role] : 'var(--text-muted)' }}
                  >
                    {agent.name}
                  </span>
                  <span className={styles.gameAgentRole}>
                    {agent.role}
                  </span>
                  {!agent.alive && <span className={styles.deadMarker}>Dead</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
