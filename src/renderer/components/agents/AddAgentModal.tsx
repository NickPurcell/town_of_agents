import React, { useState, useMemo } from 'react';
import type { Agent, Provider } from '@shared/types';
import { getAllModels } from '@shared/types';
import { useSettingsStore } from '../../store/settingsStore';
import styles from './AddAgentModal.module.css';

interface Props {
  onAdd: (agent: Omit<Agent, 'id' | 'color'>) => void;
  onClose: () => void;
}

export function AddAgentModal({ onAdd, onClose }: Props) {
  const { settings } = useSettingsStore();
  const modelOptions = useMemo(() => getAllModels(settings.customModels), [settings.customModels]);

  const [name, setName] = useState('');
  const [model, setModel] = useState(modelOptions[0]?.id || '');
  const [systemPrompt, setSystemPrompt] = useState('');

  const selectedModel = modelOptions.find(m => m.id === model);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;

    onAdd({
      name: name.trim(),
      model,
      provider: selectedModel?.provider || 'openai',
      systemPrompt: systemPrompt.trim()
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>Add Agent</h3>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Give your agent a name..."
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Model</label>
            <select
              className={styles.select}
              value={model}
              onChange={e => setModel(e.target.value)}
            >
              {modelOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>System Prompt</label>
            <textarea
              className={styles.textarea}
              placeholder="Describe the agent's personality and behavior..."
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={4}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.addButton}
              disabled={!name.trim() || !systemPrompt.trim()}
            >
              Add Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
