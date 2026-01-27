import React, { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { DEFAULT_GAME_SETTINGS, DEFAULT_PERSONALITY, AVAILABLE_AVATARS } from '@shared/types';
import type { Provider, CustomModel } from '@shared/types';
import styles from './SettingsScreen.module.css';

type SettingsTab = 'api' | 'game';

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'mistral', label: 'Mistral' }
];

export function SettingsScreen() {
  const { settings, saveSettings, updateApiKey, updateGameSettings, updateDefaultPersonality, addCustomModel, removeCustomModel, resetModelsToDefaults } = useSettingsStore();
  const { setScreen } = useUIStore();
  const { isGameActive } = useGameStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  // Custom model form state
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelProvider, setNewModelProvider] = useState<Provider>('openai');
  const [newModelAvatar, setNewModelAvatar] = useState(AVAILABLE_AVATARS[0]);

  const gameSettings = settings.gameSettings || DEFAULT_GAME_SETTINGS;
  const customModels = settings.customModels || [];

  const handleAddModel = () => {
    if (!newModelId.trim()) return;

    // Check for duplicate ID
    if (customModels.some(m => m.id === newModelId.trim())) {
      alert('A model with this ID already exists.');
      return;
    }

    const model: CustomModel = {
      id: newModelId.trim(),
      name: newModelName.trim() || newModelId.trim(), // Use name if provided, otherwise use ID
      provider: newModelProvider,
      avatar: newModelAvatar
    };

    addCustomModel(model);

    // Reset form
    setNewModelId('');
    setNewModelName('');
    setNewModelProvider('openai');
    setNewModelAvatar(AVAILABLE_AVATARS[0]);
  };

  const handleResetModels = () => {
    if (confirm('This will replace all your models with the default set. Continue?')) {
      resetModelsToDefaults();
    }
  };

  const handleSave = async () => {
    await saveSettings(settings);
    setScreen('welcome');
  };

  const handleTest = async (provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral') => {
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

  const renderApiKeyInput = (
    provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'mistral',
    label: string,
    placeholder: string
  ) => {
    const result = testResults[provider];

    return (
      <div className={styles.apiKeySection}>
        <label className={styles.label}>{label}</label>
        <div className={styles.inputRow}>
          <input
            type="password"
            className={styles.input}
            placeholder={placeholder}
            value={settings.apiKeys[provider]}
            onChange={e => updateApiKey(provider, e.target.value)}
          />
          <button
            className={styles.testButton}
            onClick={() => handleTest(provider)}
            disabled={testing === provider || !settings.apiKeys[provider]}
          >
            {testing === provider ? 'Testing...' : 'Test'}
          </button>
        </div>
        {result && (
          <div className={`${styles.testResult} ${result.success ? styles.success : styles.error}`}>
            {result.success ? '✓ Connection successful' : `✗ ${result.error}`}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <div className={styles.tabToggle}>
          <button
            className={`${styles.tabButton} ${activeTab === 'api' ? styles.active : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API Keys
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'game' ? styles.active : ''}`}
            onClick={() => setActiveTab('game')}
          >
            Game Settings
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'api' ? (
          <div className={styles.apiTabLayout}>
            <div className={styles.apiKeysColumn}>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>API Keys</h3>
                <p className={styles.sectionDescription}>
                  Enter your API keys for each provider. Keys are stored locally and never shared.
                </p>

                {renderApiKeyInput('openai', 'OpenAI', 'sk-...')}
                {renderApiKeyInput('anthropic', 'Anthropic', 'sk-ant-...')}
                {renderApiKeyInput('google', 'Google AI', 'AI...')}
                {renderApiKeyInput('deepseek', 'DeepSeek', 'sk-...')}
                {renderApiKeyInput('xai', 'xAI (Grok)', 'xai-...')}
                {renderApiKeyInput('mistral', 'Mistral', 'sk-...')}
              </div>
            </div>

            <div className={styles.modelsColumn}>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Models</h3>
                <p className={styles.sectionDescription}>
                  Manage the models available for your games. Add, remove, or customize as needed.
                </p>

                <div className={styles.modelForm}>
                  <input
                    type="text"
                    className={styles.modelInput}
                    placeholder="Model ID (e.g., mistral-large-latest)"
                    value={newModelId}
                    onChange={e => setNewModelId(e.target.value)}
                  />
                  <input
                    type="text"
                    className={styles.modelInput}
                    placeholder="Display Name (optional)"
                    value={newModelName}
                    onChange={e => setNewModelName(e.target.value)}
                  />
                  <div className={styles.modelFormRow}>
                    <select
                      className={styles.modelSelect}
                      value={newModelProvider}
                      onChange={e => setNewModelProvider(e.target.value as Provider)}
                    >
                      {PROVIDER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className={styles.avatarSelectRow}>
                      <select
                        className={styles.modelSelect}
                        value={newModelAvatar}
                        onChange={e => setNewModelAvatar(e.target.value)}
                      >
                        {AVAILABLE_AVATARS.map(avatar => (
                          <option key={avatar} value={avatar}>
                            {avatar.replace('.png', '')}
                          </option>
                        ))}
                      </select>
                      <img
                        src={`avatars/${newModelAvatar}`}
                        alt="Avatar preview"
                        className={styles.avatarPreview}
                      />
                    </div>
                  </div>
                  <button
                    className={styles.addModelButton}
                    onClick={handleAddModel}
                    disabled={!newModelId.trim()}
                  >
                    Add Model
                  </button>
                </div>

                <div className={styles.modelListHeader}>
                  <h4 className={styles.modelListTitle}>Available Models</h4>
                  <button
                    className={styles.resetModelsButton}
                    onClick={handleResetModels}
                    title="Reset to default models"
                  >
                    Reset to Defaults
                  </button>
                </div>
                {customModels.length > 0 ? (
                  <div className={styles.modelList}>
                    {customModels.map(model => (
                      <div key={model.id} className={styles.modelItem}>
                        <img
                          src={`avatars/${model.avatar}`}
                          alt={model.name}
                          className={styles.modelItemAvatar}
                        />
                        <div className={styles.modelItemInfo}>
                          <div className={styles.modelItemName}>{model.name}</div>
                          <div className={styles.modelItemId}>{model.id}</div>
                        </div>
                        <span className={styles.modelItemProvider}>{model.provider}</span>
                        <button
                          className={styles.removeModelButton}
                          onClick={() => removeCustomModel(model.id)}
                          title="Remove model"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyModelsList}>No models configured. Click "Reset to Defaults" to restore the default models.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Game Settings</h3>
              <p className={styles.sectionDescription}>
                Configure timing and behavior for Mafia games.
                {isGameActive && <span className={styles.warning}> Cannot edit during an active game.</span>}
              </p>

              <div className={styles.gameSettingsGrid}>
                <div className={styles.settingItem}>
                  <label className={styles.label}>Discussion Rounds</label>
                  <input
                    type="number"
                    className={styles.numberInput}
                    value={gameSettings.roundsPerDiscussion}
                    onChange={e => updateGameSettings({ roundsPerDiscussion: parseInt(e.target.value) || 2 })}
                    disabled={isGameActive}
                    min={1}
                    max={10}
                  />
                </div>

                <div className={styles.settingItem}>
                  <label className={styles.label}>Vote Retries</label>
                  <input
                    type="number"
                    className={styles.numberInput}
                    value={gameSettings.voteRetries}
                    onChange={e => updateGameSettings({ voteRetries: parseInt(e.target.value) || 1 })}
                    disabled={isGameActive}
                    min={1}
                    max={5}
                  />
                </div>

                <div className={styles.settingItem}>
                  <label className={styles.label}>Turn Timeout (seconds)</label>
                  <input
                    type="number"
                    className={styles.numberInput}
                    value={gameSettings.turnTimeoutSec}
                    onChange={e => updateGameSettings({ turnTimeoutSec: parseInt(e.target.value) || 5 })}
                    disabled={isGameActive}
                    min={1}
                    max={30}
                  />
                </div>

                <div className={styles.settingItem}>
                  <label className={styles.label}>Mafia Vote Retries</label>
                  <input
                    type="number"
                    className={styles.numberInput}
                    value={gameSettings.mafiaVotingRetries}
                    onChange={e => updateGameSettings({ mafiaVotingRetries: parseInt(e.target.value) || 3 })}
                    disabled={isGameActive}
                    min={1}
                    max={10}
                  />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Default Agent Personality</h3>
              <p className={styles.sectionDescription}>
                This personality will be used for default game agents and as the initial value when creating new agents.
              </p>

              <textarea
                className={styles.personalityTextarea}
                value={settings.defaultPersonality || DEFAULT_PERSONALITY}
                onChange={e => updateDefaultPersonality(e.target.value)}
                disabled={isGameActive}
                rows={4}
              />
            </div>
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelButton} onClick={() => setScreen('welcome')}>
            Cancel
          </button>
          <button className={styles.saveButton} onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
