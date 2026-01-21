import { ipcMain, BrowserWindow } from 'electron';
import { GameController } from '../services/gameController';
import { getSettings } from '../services/storage';
import { DEFAULT_GAME_SETTINGS } from '@shared/types';
import type { Role, GameEvent, Phase, Faction, SideChatMessage } from '@shared/types';

interface PendingAgent {
  name: string;
  personality: string;
  role: Role;
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
}

let gameController: GameController | null = null;

export function registerGameHandlers(mainWindow: BrowserWindow): void {
  // Game setup and control
  ipcMain.handle('game:start', async (_, agents: PendingAgent[]) => {
    const settings = await getSettings();
    const gameSettings = { ...DEFAULT_GAME_SETTINGS, ...settings.gameSettings };

    gameController = new GameController(mainWindow, settings, gameSettings);

    // Set up event listeners
    gameController.on('event_appended', (event: GameEvent) => {
      mainWindow.webContents.send('game:eventAppended', event);
    });

    gameController.on('phase_changed', (phase: Phase, dayNumber: number) => {
      mainWindow.webContents.send('game:phaseChanged', { phase, dayNumber });
    });

    gameController.on('game_over', (winner: Faction) => {
      mainWindow.webContents.send('game:gameOver', { winner });
    });

    gameController.on('agent_died', (agentId: string, cause: string) => {
      mainWindow.webContents.send('game:agentDied', { agentId, cause });
    });

    gameController.on('agent_thinking', (agentId: string, agentName: string) => {
      mainWindow.webContents.send('game:agentThinking', { agentId, agentName });
    });

    gameController.on('agent_thinking_done', (agentId: string) => {
      mainWindow.webContents.send('game:agentThinkingDone', { agentId });
    });

    gameController.on('streaming_message', (agentId: string, content: string) => {
      mainWindow.webContents.send('game:streamingMessage', { agentId, content });
    });

    gameController.on('game_state_update', (state: any) => {
      mainWindow.webContents.send('game:stateUpdate', state);
    });

    // Start the game
    await gameController.initializeGame(agents);
    await gameController.startGame();

    return { success: true };
  });

  ipcMain.handle('game:stop', async () => {
    if (gameController) {
      gameController.stopGame();
      gameController = null;
    }
    return { success: true };
  });

  ipcMain.handle('game:pause', async () => {
    if (gameController) {
      gameController.pauseGame();
    }
    return { success: true };
  });

  ipcMain.handle('game:resume', async () => {
    if (gameController) {
      gameController.resumeGame();
    }
    return { success: true };
  });

  ipcMain.handle('game:getState', async () => {
    if (!gameController) {
      return null;
    }
    return gameController.getState();
  });

  ipcMain.handle('game:askAgent', async (_, agentId: string, messages: SideChatMessage[]) => {
    if (!gameController) {
      throw new Error('Game not running');
    }
    return await gameController.askAgentQuestion(agentId, messages);
  });
}

export function getGameController(): GameController | null {
  return gameController;
}
