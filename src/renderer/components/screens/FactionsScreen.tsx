import React, { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { DEFAULT_AGENTS_BY_FACTION } from '@shared/constants/defaultAgents';
import { MODEL_OPTIONS, type Provider } from '@shared/types';
import { formatRoleName, DEFAULT_PERSONALITY, type Faction } from '@shared/types/game';
import styles from './FactionsScreen.module.css';

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

function getProviderForModel(modelId: string): Provider {
  const model = MODEL_OPTIONS.find(m => m.id === modelId);
  return model?.provider ?? 'google';
}

export function FactionsScreen() {
  const { setScreen } = useUIStore();
  const { clearPendingAgents, addPendingAgent, startGame } = useGameStore();

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
                {MODEL_OPTIONS.map(model => (
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
                  {MODEL_OPTIONS.map(model => (
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
