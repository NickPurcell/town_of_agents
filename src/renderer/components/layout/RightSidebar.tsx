import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { useGameStore } from '../../store/gameStore';
import { AgentDetails } from '../agents/AgentDetails';
import { ROLE_COLORS } from '@shared/types';
import styles from './RightSidebar.module.css';

export function RightSidebar() {
  const { selectedAgent } = useUIStore();
  const { currentChat } = useChatStore();
  const { gameState } = useGameStore();

  // If game is active, show game agent roster
  if (gameState) {
    const townAgents = gameState.agents.filter(a => a.faction === 'TOWN');
    const mafiaAgents = gameState.agents.filter(a => a.faction === 'MAFIA');
    const townAlive = townAgents.filter(a => a.alive).length;
    const mafiaAlive = mafiaAgents.filter(a => a.alive).length;
    const townFactionStyle = { ['--faction-color' as any]: '#fdd835' } as React.CSSProperties;
    const mafiaFactionStyle = { ['--faction-color' as any]: '#e53935' } as React.CSSProperties;

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
                <div
                  key={agent.id}
                  className={`${styles.gameAgentItem} ${!agent.alive ? styles.dead : ''}`}
                  style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
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
                </div>
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
                <div
                  key={agent.id}
                  className={`${styles.gameAgentItem} ${!agent.alive ? styles.dead : ''}`}
                  style={{ ['--agent-color' as any]: ROLE_COLORS[agent.role] } as React.CSSProperties}
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedAgent || !currentChat) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>Select an agent to view details</p>
        </div>
      </div>
    );
  }

  // Count messages for this agent
  const messageCount = currentChat.messages.filter(
    m => m.agentId === selectedAgent.id
  ).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Agent Details</h3>
      </div>
      <AgentDetails agent={selectedAgent} messageCount={messageCount} />
    </div>
  );
}
