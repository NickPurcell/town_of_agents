import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { AgentCard } from '../agents/AgentCard';
import { AddAgentModal } from '../agents/AddAgentModal';
import type { Agent, Chat } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import styles from './NewChatScreen.module.css';

export function NewChatScreen() {
  const { setScreen } = useUIStore();
  const { createChat, loadChat, startChat } = useChatStore();

  const [chatName, setChatName] = useState('');
  const [topic, setTopic] = useState('');
  const [intervalValue, setIntervalValue] = useState(30);
  const [intervalUnit, setIntervalUnit] = useState<'minutes' | 'seconds'>('minutes');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [usedColors, setUsedColors] = useState<string[]>([]);

  const getNextColor = (): string => {
    const availableColors = AGENT_COLORS.filter(c => !usedColors.includes(c));
    if (availableColors.length === 0) {
      // Reset and start over
      return AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];
    }
    return availableColors[Math.floor(Math.random() * availableColors.length)];
  };

  const handleAddAgent = (agent: Omit<Agent, 'id' | 'color'>) => {
    const color = getNextColor();
    const newAgent: Agent = {
      ...agent,
      id: uuidv4(),
      color
    };
    setAgents([...agents, newAgent]);
    setUsedColors([...usedColors, color]);
    setShowAddAgent(false);
  };

  const handleRemoveAgent = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      setAgents(agents.filter(a => a.id !== agentId));
      setUsedColors(usedColors.filter(c => c !== agent.color));
    }
  };

  const handleStartChat = async () => {
    const intervalMs = intervalUnit === 'minutes'
      ? intervalValue * 60 * 1000
      : intervalValue * 1000;

    const chat: Chat = {
      id: uuidv4(),
      name: chatName || `Chat ${Date.now()}`,
      topic,
      intervalMs,
      isActive: false,
      agents,
      messages: [],
      currentAgentIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const created = await createChat(chat);
    await loadChat(created.id);
    setScreen('chat');
    void startChat(created.id);
  };

  const canStart = agents.length >= 2 && agents.length <= 50 && topic.trim().length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Create New Chat</h2>
      </div>

      <div className={styles.form}>
        <div className={styles.section}>
          <label className={styles.label}>Chat Name</label>
          <input
            type="text"
            className={styles.input}
            placeholder="Give your chat a name..."
            value={chatName}
            onChange={e => setChatName(e.target.value)}
          />
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Topic *</label>
          <textarea
            className={styles.textarea}
            placeholder="What should the agents discuss?"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            rows={4}
          />
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Response Interval</label>
          <div className={styles.intervalRow}>
            <input
              type="number"
              className={styles.intervalInput}
              value={intervalValue}
              onChange={e => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
            />
            <div className={styles.toggleGroup}>
              <button
                className={`${styles.toggleButton} ${intervalUnit === 'seconds' ? styles.active : ''}`}
                onClick={() => setIntervalUnit('seconds')}
              >
                Seconds
              </button>
              <button
                className={`${styles.toggleButton} ${intervalUnit === 'minutes' ? styles.active : ''}`}
                onClick={() => setIntervalUnit('minutes')}
              >
                Minutes
              </button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.agentsHeader}>
            <label className={styles.label}>Agents ({agents.length}/50)</label>
            <button
              className={styles.addButton}
              onClick={() => setShowAddAgent(true)}
              disabled={agents.length >= 50}
            >
              + Add Agent
            </button>
          </div>

          {agents.length === 0 ? (
            <div className={styles.emptyAgents}>
              <p>No agents added yet. Add at least 2 agents to start.</p>
            </div>
          ) : (
            <div className={styles.agentsList}>
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onRemove={() => handleRemoveAgent(agent.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.cancelButton}
            onClick={() => setScreen('welcome')}
          >
            Cancel
          </button>
          <button
            className={styles.startButton}
            onClick={handleStartChat}
            disabled={!canStart}
          >
            Start Chat
          </button>
        </div>

        {!canStart && agents.length > 0 && agents.length < 2 && (
          <p className={styles.hint}>Add at least 2 agents to start the chat</p>
        )}
      </div>

      {showAddAgent && (
        <AddAgentModal
          onAdd={handleAddAgent}
          onClose={() => setShowAddAgent(false)}
        />
      )}
    </div>
  );
}
