import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { NewChatScreen } from '../screens/NewChatScreen';
import { GameSetupScreen } from '../screens/GameSetupScreen';
import { GameChatScreen } from '../screens/GameChatScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { AgentChatScreen } from '../screens/AgentChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export function CenterPanel() {
  const { currentScreen } = useUIStore();
  const { gameState } = useGameStore();

  // If there's an active game and we're on chat screen, show game screen
  if (currentScreen === 'chat' && gameState) {
    return <GameChatScreen />;
  }

  switch (currentScreen) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'newChat':
      return <NewChatScreen />;
    case 'gameSetup':
      return <GameSetupScreen />;
    case 'chat':
      return gameState ? <GameChatScreen /> : <ChatScreen />;
    case 'agentChat':
      return <AgentChatScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <WelcomeScreen />;
  }
}
