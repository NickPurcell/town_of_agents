import React, { useState, useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Role, Provider } from '@shared/types';
import { getAllModels, ROLE_COLORS, DEFAULT_PERSONALITY } from '@shared/types';
import styles from './GameSetupScreen.module.css';

type ApiKeyProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'MAFIA', label: 'Mafia' },
  { value: 'GODFATHER', label: 'Godfather' },
  { value: 'FRAMER', label: 'Framer' },
  { value: 'CONSIGLIERE', label: 'Consigliere' },
  { value: 'JESTER', label: 'Jester' },
  { value: 'WEREWOLF', label: 'Werewolf' },
  { value: 'JAILOR', label: 'Jailor' },
  { value: 'TAVERN_KEEPER', label: 'Tavern Keeper' },
  { value: 'SHERIFF', label: 'Sheriff' },
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'VIGILANTE', label: 'Vigilante' },
  { value: 'LOOKOUT', label: 'Lookout' },
  { value: 'MAYOR', label: 'Mayor' },
  { value: 'CITIZEN', label: 'Citizen' },
];

// Default game agent names and roles - personality comes from settings
const DEFAULT_AGENT_CONFIGS = [
  { name: 'Marcus', role: 'GODFATHER' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Elena', role: 'CONSIGLIERE' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Riley', role: 'FRAMER' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Jasper', role: 'JESTER' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Fenrir', role: 'WEREWOLF' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'James', role: 'SHERIFF' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Sophie', role: 'DOCTOR' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Ava', role: 'LOOKOUT' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Oliver', role: 'MAYOR' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Mia', role: 'VIGILANTE' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Noah', role: 'JAILOR' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
  { name: 'Greta', role: 'TAVERN_KEEPER' as Role, provider: 'google' as const, model: 'gemini-3-flash-preview', avatar: 'gemini.png' },
];

export function GameSetupScreen() {
  const { setScreen } = useUIStore();
  const { pendingAgents, addPendingAgent, removePendingAgent, clearPendingAgents, canStartGame, startGame } = useGameStore();
  const { settings, updateApiKey, saveSettings } = useSettingsStore();

  const defaultPersonality = settings.defaultPersonality || DEFAULT_PERSONALITY;

  // Get all models (built-in + custom)
  const modelOptions = useMemo(() => getAllModels(settings.customModels), [settings.customModels]);

  // Form state
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState(defaultPersonality);
  const [role, setRole] = useState<Role>('CITIZEN');
  const [provider, setProvider] = useState<Provider>('google');
  const [model, setModel] = useState('gemini-3-flash-preview');

  // API keys state
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  // Create default agents with current personality setting
  const getDefaultAgents = () => {
    return DEFAULT_AGENT_CONFIGS.map(config => ({
      ...config,
      personality: defaultPersonality
    }));
  };

  const handleTestApiKey = async (apiProvider: ApiKeyProvider) => {
    const apiKey = settings.apiKeys[apiProvider];
    if (!apiKey) {
      setTestResults({ ...testResults, [apiProvider]: { success: false, error: 'No API key provided' } });
      return;
    }

    setTesting(apiProvider);
    try {
      const result = await window.api.testConnection(apiProvider, apiKey);
      setTestResults({ ...testResults, [apiProvider]: result });
    } catch (error) {
      setTestResults({ ...testResults, [apiProvider]: { success: false, error: (error as Error).message } });
    } finally {
      setTesting(null);
    }
  };

  const handleApiKeyChange = (apiProvider: ApiKeyProvider, value: string) => {
    updateApiKey(apiProvider, value);
  };

  const handleSaveApiKeys = async () => {
    await saveSettings(settings);
  };

  const renderApiKeyInput = (apiProvider: ApiKeyProvider, label: string, placeholder: string) => {
    const result = testResults[apiProvider];

    return (
      <div className={styles.apiKeySection}>
        <label className={styles.apiKeyLabel}>{label}</label>
        <div className={styles.apiInputRow}>
          <input
            type="password"
            className={styles.apiInput}
            placeholder={placeholder}
            value={settings.apiKeys[apiProvider]}
            onChange={e => handleApiKeyChange(apiProvider, e.target.value)}
          />
          <button
            className={styles.testButton}
            onClick={() => handleTestApiKey(apiProvider)}
            disabled={testing === apiProvider || !settings.apiKeys[apiProvider]}
          >
            {testing === apiProvider ? '...' : 'Test'}
          </button>
        </div>
        {result && (
          <div className={`${styles.testResult} ${result.success ? styles.success : styles.error}`}>
            {result.success ? 'Connected' : result.error}
          </div>
        )}
      </div>
    );
  };

  const handleAddAgent = () => {
    if (!name.trim() || !personality.trim()) return;

    // Check for duplicate names
    if (pendingAgents.some(a => a.name.toLowerCase() === name.trim().toLowerCase())) {
      alert('An agent with this name already exists');
      return;
    }

    // Get avatar from selected model
    const selectedModel = modelOptions.find(m => m.id === model);
    const avatar = selectedModel?.avatar ?? 'user.png';

    addPendingAgent({
      name: name.trim(),
      personality: personality.trim(),
      role,
      provider,
      model,
      avatar,
    });

    // Reset form
    setName('');
    setPersonality(defaultPersonality);
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
    getDefaultAgents().forEach(agent => addPendingAgent(agent));
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
    JESTER: pendingAgents.filter(a => a.role === 'JESTER'),
    WEREWOLF: pendingAgents.filter(a => a.role === 'WEREWOLF'),
    JAILOR: pendingAgents.filter(a => a.role === 'JAILOR'),
    TAVERN_KEEPER: pendingAgents.filter(a => a.role === 'TAVERN_KEEPER'),
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
  const hasJailor = agentsByRole.JAILOR.length > 0;

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
                const newProvider = e.target.value as Provider;
                setProvider(newProvider);
                // Set default model for provider
                const defaultModel = modelOptions.find(m => m.provider === newProvider);
                if (defaultModel) setModel(defaultModel.id);
              }}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="deepseek">DeepSeek</option>
              <option value="xai">xAI (Grok)</option>
              <option value="mistral">Mistral</option>
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
            <span className={hasJailor ? styles.met : styles.unmet}>Jailor: {agentsByRole.JAILOR.length}</span>
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

      {/* API Keys Panel */}
      <div className={styles.apiKeysPanel}>
        <button
          className={styles.apiKeysToggle}
          onClick={() => setShowApiKeys(!showApiKeys)}
        >
          {showApiKeys ? 'Hide' : 'Show'} API Keys
        </button>
        {showApiKeys && (
          <div className={styles.apiKeysContent}>
            <div className={styles.apiKeysGrid}>
              {renderApiKeyInput('openai', 'OpenAI', 'sk-...')}
              {renderApiKeyInput('anthropic', 'Anthropic', 'sk-ant-...')}
              {renderApiKeyInput('google', 'Google AI', 'AI...')}
              {renderApiKeyInput('deepseek', 'DeepSeek', 'sk-...')}
              {renderApiKeyInput('xai', 'xAI (Grok)', 'xai-...')}
              {renderApiKeyInput('mistral', 'Mistral', 'sk-...')}
            </div>
            <button className={styles.saveApiKeysButton} onClick={handleSaveApiKeys}>
              Save API Keys
            </button>
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
