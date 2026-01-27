import React, { useState, useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { useSettingsStore } from '../../store/settingsStore';
import { DEFAULT_AGENTS_BY_FACTION } from '@shared/constants/defaultAgents';
import { getAllModels, type Provider } from '@shared/types';
import { formatRoleName, DEFAULT_PERSONALITY, type Faction } from '@shared/types/game';
import styles from './FactionsScreen.module.css';

type ApiKeyProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral';

interface FactionConfig {
  model: string;
  personality: string;
}

const FACTIONS: Faction[] = ['MAFIA', 'TOWN', 'NEUTRAL'];

const FACTION_LABELS: Record<Faction, string> = {
  MAFIA: 'Mafia',
  TOWN: 'Town',
  NEUTRAL: 'Neutral',
};

// Default model for all factions
const DEFAULT_MODEL = 'gemini-3-flash-preview';

export function FactionsScreen() {
  const { setScreen } = useUIStore();
  const { clearPendingAgents, addPendingAgent, startGame } = useGameStore();
  const { settings, updateApiKey, saveSettings } = useSettingsStore();

  // API keys state
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  // Get all models (built-in + custom)
  const modelOptions = useMemo(() => getAllModels(settings.customModels), [settings.customModels]);

  const getProviderForModel = (modelId: string): Provider => {
    const model = modelOptions.find(m => m.id === modelId);
    return model?.provider ?? 'google';
  };

  const [monoMode, setMonoMode] = useState(true);
  const [monoConfig, setMonoConfig] = useState<FactionConfig>({
    model: DEFAULT_MODEL,
    personality: DEFAULT_PERSONALITY,
  });

  const [configs, setConfigs] = useState<Record<Faction, FactionConfig>>({
    MAFIA: { model: DEFAULT_MODEL, personality: DEFAULT_PERSONALITY },
    TOWN: { model: DEFAULT_MODEL, personality: DEFAULT_PERSONALITY },
    NEUTRAL: { model: DEFAULT_MODEL, personality: DEFAULT_PERSONALITY },
  });

  const updateFactionConfig = (faction: Faction, updates: Partial<FactionConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [faction]: { ...prev[faction], ...updates },
    }));
  };

  const handleTestApiKey = async (provider: ApiKeyProvider) => {
    const apiKey = settings.apiKeys[provider];
    if (!apiKey) {
      setTestResults({ ...testResults, [provider]: { success: false, error: 'No API key provided' } });
      return;
    }

    setTesting(provider);
    try {
      const result = await window.api.testConnection(provider, apiKey);
      setTestResults({ ...testResults, [provider]: result });
    } catch (error) {
      setTestResults({ ...testResults, [provider]: { success: false, error: (error as Error).message } });
    } finally {
      setTesting(null);
    }
  };

  const handleApiKeyChange = (provider: ApiKeyProvider, value: string) => {
    updateApiKey(provider, value);
  };

  const handleSaveApiKeys = async () => {
    await saveSettings(settings);
  };

  const renderApiKeyInput = (provider: ApiKeyProvider, label: string, placeholder: string) => {
    const result = testResults[provider];

    return (
      <div className={styles.apiKeySection}>
        <label className={styles.apiKeyLabel}>{label}</label>
        <div className={styles.apiInputRow}>
          <input
            type="password"
            className={styles.apiInput}
            placeholder={placeholder}
            value={settings.apiKeys[provider]}
            onChange={e => handleApiKeyChange(provider, e.target.value)}
          />
          <button
            className={styles.testButton}
            onClick={() => handleTestApiKey(provider)}
            disabled={testing === provider || !settings.apiKeys[provider]}
          >
            {testing === provider ? '...' : 'Test'}
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

  const handleStartGame = async () => {
    // Clear any existing pending agents
    clearPendingAgents();

    // Add agents for each faction
    for (const faction of FACTIONS) {
      const config = monoMode ? monoConfig : configs[faction];
      const provider = getProviderForModel(config.model);
      const agents = DEFAULT_AGENTS_BY_FACTION[faction];

      for (const agent of agents) {
        addPendingAgent({
          name: agent.name,
          role: agent.role,
          model: config.model,
          provider,
          personality: config.personality,
        });
      }
    }

    // Start the game and navigate to chat
    await startGame();
    setScreen('chat');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Factions</h1>
        <p className={styles.subtitle}>Configure your factions and start the game</p>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeButton} ${monoMode ? styles.active : ''}`}
            onClick={() => setMonoMode(true)}
          >
            Mono
          </button>
          <button
            className={`${styles.modeButton} ${!monoMode ? styles.active : ''}`}
            onClick={() => setMonoMode(false)}
          >
            Per Faction
          </button>
        </div>
      </div>

      {monoMode ? (
        <div className={styles.monoLayout}>
          <div className={styles.monoConfigPanel}>
            <div className={styles.monoConfigTitle}>All Characters</div>
            <p className={styles.monoConfigSubtitle}>
              Same model and personality for all 12 characters
            </p>

            <div className={styles.formSection}>
              <label className={styles.label}>Model</label>
              <select
                className={styles.select}
                value={monoConfig.model}
                onChange={e => setMonoConfig(prev => ({ ...prev, model: e.target.value }))}
              >
                {modelOptions.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>

              <label className={styles.label}>Personality</label>
              <textarea
                className={styles.textarea}
                value={monoConfig.personality}
                onChange={e => setMonoConfig(prev => ({ ...prev, personality: e.target.value }))}
                placeholder="Enter personality guidelines..."
              />
            </div>
          </div>

          <div className={styles.monoCharacterList}>
            {FACTIONS.map(faction => (
              <div key={faction} className={styles.monoFactionGroup}>
                <div className={styles.monoFactionHeader}>
                  <div className={`${styles.factionIndicator} ${styles[faction.toLowerCase()]}`} />
                  <span>{FACTION_LABELS[faction]}</span>
                </div>
                <div className={styles.monoCharacters}>
                  {DEFAULT_AGENTS_BY_FACTION[faction].map(agent => (
                    <span key={agent.name} className={styles.monoCharacter}>
                      {agent.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.factionsGrid}>
          {FACTIONS.map(faction => (
            <div
              key={faction}
              className={`${styles.factionCard} ${styles[faction.toLowerCase()]}`}
            >
              <div className={styles.factionHeader}>
                <div className={`${styles.factionIndicator} ${styles[faction.toLowerCase()]}`} />
                <span className={styles.factionName}>{FACTION_LABELS[faction]}</span>
              </div>

              <div className={styles.characterList}>
                <div className={styles.characterListTitle}>Characters</div>
                {DEFAULT_AGENTS_BY_FACTION[faction].map(agent => (
                  <div key={agent.name} className={styles.characterItem}>
                    <span className={styles.characterName}>{agent.name}</span>
                    <span className={styles.characterRole}>{formatRoleName(agent.role)}</span>
                  </div>
                ))}
              </div>

              <div className={styles.formSection}>
                <label className={styles.label}>Model</label>
                <select
                  className={styles.select}
                  value={configs[faction].model}
                  onChange={e => updateFactionConfig(faction, { model: e.target.value })}
                >
                  {modelOptions.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>

                <label className={styles.label}>Personality</label>
                <textarea
                  className={styles.textarea}
                  value={configs[faction].personality}
                  onChange={e => updateFactionConfig(faction, { personality: e.target.value })}
                  placeholder="Enter personality guidelines..."
                />
              </div>
            </div>
          ))}
        </div>
      )}

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
        <button className={styles.backButton} onClick={() => setScreen('welcome')}>
          Back
        </button>
        <button className={styles.startButton} onClick={handleStartGame}>
          Start Game
        </button>
      </div>
    </div>
  );
}
