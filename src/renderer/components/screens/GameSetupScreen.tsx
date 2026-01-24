import React, { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import type { Role } from '@shared/types';
import { MODEL_OPTIONS, ROLE_COLORS } from '@shared/types';
import styles from './GameSetupScreen.module.css';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'MAFIA', label: 'Mafia' },
  { value: 'GODFATHER', label: 'Godfather' },
  { value: 'FRAMER', label: 'Framer' },
  { value: 'CONSIGLIERE', label: 'Consigliere' },
  { value: 'SHERIFF', label: 'Sheriff' },
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'VIGILANTE', label: 'Vigilante' },
  { value: 'LOOKOUT', label: 'Lookout' },
  { value: 'MAYOR', label: 'Mayor' },
  { value: 'CITIZEN', label: 'Citizen' },
];

// Default game configuration: 1 mayor, 1 citizen, 1 vigilante, 1 doctor, 1 sheriff, 1 lookout, 1 godfather, 1 framer, 1 consigliere - all Gemini 3 Flash
const DEFAULT_AGENTS = [
  { name: 'Marcus', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'GODFATHER' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Elena', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'CONSIGLIERE' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Riley', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'FRAMER' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'James', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'SHERIFF' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Sophie', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'DOCTOR' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Ava', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'LOOKOUT' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Oliver', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'MAYOR' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Mia', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'VIGILANTE' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
  { name: 'Noah', personality: 'Play to win. Be strategic and smart about your moves. Speak naturally like a person in a chatroom. Use light, occasional slang when it fits, but do not overdo it. Keep it PG-13.', role: 'CITIZEN' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview' },
];

export function GameSetupScreen() {
  const { setScreen } = useUIStore();
  const { pendingAgents, addPendingAgent, removePendingAgent, clearPendingAgents, canStartGame, startGame } = useGameStore();

  // Form state
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [role, setRole] = useState<Role>('CITIZEN');
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google'>('google');
  const [model, setModel] = useState('gemini-3-flash-preview');

  const handleAddAgent = () => {
    if (!name.trim() || !personality.trim()) return;

    // Check for duplicate names
    if (pendingAgents.some(a => a.name.toLowerCase() === name.trim().toLowerCase())) {
      alert('An agent with this name already exists');
      return;
    }

    addPendingAgent({
      name: name.trim(),
      personality: personality.trim(),
      role,
      provider,
      model,
    });

    // Reset form
    setName('');
    setPersonality('');
    setRole('CITIZEN');
  };

  const handleStartGame = async () => {
    if (canStartGame()) {
      await startGame();
      setScreen('chat');
    }
  };

  const handleStartDefaultGame = async () => {
    clearPendingAgents();
    DEFAULT_AGENTS.forEach(agent => addPendingAgent(agent));
    await startGame();
    setScreen('chat');
  };

  const isFormValid = name.trim().length > 0 && personality.trim().length > 0;

  // Group agents by role
  const agentsByRole: Record<Role, typeof pendingAgents> = {
    MAFIA: pendingAgents.filter(a => a.role === 'MAFIA'),
    GODFATHER: pendingAgents.filter(a => a.role === 'GODFATHER'),
    FRAMER: pendingAgents.filter(a => a.role === 'FRAMER'),
    CONSIGLIERE: pendingAgents.filter(a => a.role === 'CONSIGLIERE'),
    SHERIFF: pendingAgents.filter(a => a.role === 'SHERIFF'),
    DOCTOR: pendingAgents.filter(a => a.role === 'DOCTOR'),
    VIGILANTE: pendingAgents.filter(a => a.role === 'VIGILANTE'),
    LOOKOUT: pendingAgents.filter(a => a.role === 'LOOKOUT'),
    MAYOR: pendingAgents.filter(a => a.role === 'MAYOR'),
    CITIZEN: pendingAgents.filter(a => a.role === 'CITIZEN'),
  };

  // Check requirements (Godfather counts as Mafia for the requirement)
  const hasMafia = agentsByRole.MAFIA.length > 0 || agentsByRole.GODFATHER.length > 0;
  const hasSheriff = agentsByRole.SHERIFF.length > 0;
  const hasDoctor = agentsByRole.DOCTOR.length > 0;
  const hasCitizen = agentsByRole.CITIZEN.length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Mafia Game Setup</h2>
        <p className={styles.subtitle}>Add agents to play the game</p>
      </div>

      <div className={styles.content}>
        {/* Left Panel - Add Agent Form */}
        <div className={styles.formPanel}>
          <h3 className={styles.panelTitle}>Add Agent</h3>

          <div className={styles.formSection}>
            <label className={styles.label}>Name *</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Agent name..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>Personality *</label>
            <textarea
              className={styles.textarea}
              placeholder="Describe the agent's personality, speaking style, and behavior..."
              value={personality}
              onChange={e => setPersonality(e.target.value)}
              rows={4}
            />
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>Role</label>
            <div className={styles.roleOptions}>
              {ROLE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`${styles.roleOption} ${role === opt.value ? styles.selected : ''}`}
                  style={{
                    ['--role-color' as any]: ROLE_COLORS[opt.value],
                    borderColor: role === opt.value ? ROLE_COLORS[opt.value] : undefined,
                    backgroundColor: role === opt.value ? `${ROLE_COLORS[opt.value]}25` : undefined,
                  } as React.CSSProperties}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    className={styles.radioInput}
                  />
                  <span style={{ color: ROLE_COLORS[opt.value] }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>AI Provider</label>
            <select
              className={styles.select}
              value={provider}
              onChange={e => {
                const newProvider = e.target.value as 'openai' | 'anthropic' | 'google';
                setProvider(newProvider);
                // Set default model for provider
                const defaultModel = MODEL_OPTIONS.find(m => m.provider === newProvider);
                if (defaultModel) setModel(defaultModel.id);
              }}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </div>

          <button
            className={`${styles.addButton} ${isFormValid ? styles.valid : ''}`}
            onClick={handleAddAgent}
            disabled={!isFormValid}
          >
            + Add Agent
          </button>
        </div>

        {/* Right Panel - Agent Roster */}
        <div className={styles.rosterPanel}>
          <h3 className={styles.panelTitle}>Agent Roster</h3>

          <div className={styles.requirements}>
            <span className={hasMafia ? styles.met : styles.unmet}>Mafia: {agentsByRole.MAFIA.length}</span>
            <span className={hasSheriff ? styles.met : styles.unmet}>Sheriff: {agentsByRole.SHERIFF.length}</span>
            <span className={hasDoctor ? styles.met : styles.unmet}>Doctor: {agentsByRole.DOCTOR.length}</span>
            <span className={hasCitizen ? styles.met : styles.unmet}>Citizen: {agentsByRole.CITIZEN.length}</span>
          </div>

          <div className={styles.roleGroups}>
            {ROLE_OPTIONS.map(roleOpt => (
              <div key={roleOpt.value} className={styles.roleGroup}>
                <h4
                  className={styles.roleGroupTitle}
                  style={{ color: ROLE_COLORS[roleOpt.value] }}
                >
                  {roleOpt.label} ({agentsByRole[roleOpt.value].length})
                </h4>
                <div className={styles.agentList}>
                  {agentsByRole[roleOpt.value].length === 0 ? (
                    <div className={styles.emptyRole}>No {roleOpt.label.toLowerCase()} agents</div>
                  ) : (
                    agentsByRole[roleOpt.value].map(agent => (
                      <div key={agent.name} className={styles.agentItem}>
                        <div className={styles.agentInfo}>
                          <span
                            className={styles.agentName}
                            style={{ color: ROLE_COLORS[agent.role] }}
                          >
                            {agent.name}
                          </span>
                          <span className={styles.agentProvider}>{agent.provider}</span>
                        </div>
                        <button
                          className={styles.removeButton}
                          onClick={() => removePendingAgent(agent.name)}
                          title="Remove agent"
                        >
                          x
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.cancelButton}
          onClick={() => setScreen('welcome')}
        >
          Cancel
        </button>
        <button
          className={`${styles.startButton} ${canStartGame() ? styles.valid : ''}`}
          onClick={handleStartGame}
          disabled={!canStartGame()}
        >
          Start Game
        </button>
        <button
          className={styles.defaultGameButton}
          onClick={handleStartDefaultGame}
        >
          Start Default Game
        </button>
      </div>

      {!canStartGame() && pendingAgents.length > 0 && (
        <p className={styles.hint}>
          You need at least 1 Mafia, 1 Sheriff, 1 Doctor, and 1 Citizen to start
        </p>
      )}
    </div>
  );
}
