import React, { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { DEFAULT_GAME_SETTINGS, DEFAULT_PERSONALITY } from '@shared/types';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const { settings, saveSettings, updateApiKey, updateGameSettings, updateDefaultPersonality } = useSettingsStore();
  const { setScreen } = useUIStore();
  const { isGameActive } = useGameStore();
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  const gameSettings = settings.gameSettings || DEFAULT_GAME_SETTINGS;

  const handleSave = async () => {
    await saveSettings(settings);
    setScreen('welcome');
  };

  const handleTest = async (provider: 'openai' | 'anthropic' | 'google') => {
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
    provider: 'openai' | 'anthropic' | 'google',
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
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>API Keys</h3>
          <p className={styles.sectionDescription}>
            Enter your API keys for each provider. Keys are stored locally and never shared.
          </p>

          {renderApiKeyInput('openai', 'OpenAI', 'sk-...')}
          {renderApiKeyInput('anthropic', 'Anthropic', 'sk-ant-...')}
          {renderApiKeyInput('google', 'Google AI', 'AI...')}
        </div>

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
