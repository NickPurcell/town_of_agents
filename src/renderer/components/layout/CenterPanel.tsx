import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { GameSetupScreen } from '../screens/GameSetupScreen';
import { GameChatScreen } from '../screens/GameChatScreen';
import { AgentChatScreen } from '../screens/AgentChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export function CenterPanel() {
  const { currentScreen } = useUIStore();

  switch (currentScreen) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'gameSetup':
      return <GameSetupScreen />;
    case 'chat':
      return <GameChatScreen />;
    case 'agentChat':
      return <AgentChatScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <WelcomeScreen />;
  }
}
