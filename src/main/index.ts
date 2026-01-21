import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { createSplashWindow } from './windows/splashWindow';
import { createMainWindow } from './windows/mainWindow';
import { registerIpcHandlers } from './ipc';
import { initializeStorage } from './services/storage';

// Disable sandbox on Linux for development
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

async function initialize() {
  // Show splash screen
  splashWindow = createSplashWindow();

  // Initialize storage
  await initializeStorage();

  // Simulate loading time for splash (min 1.5 seconds)
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Create main window
  mainWindow = createMainWindow();

  // Register IPC handlers (pass mainWindow for game handlers)
  registerIpcHandlers(mainWindow);

  mainWindow.once('ready-to-show', () => {
    // Close splash and show main window
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow?.show();
  });
}

app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});

export { mainWindow };
