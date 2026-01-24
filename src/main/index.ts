import { app, BrowserWindow } from 'electron';
import { createSplashWindow } from './windows/splashWindow';

// Disable sandbox on Linux for development
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

async function initialize() {
  // Show splash screen FIRST, before loading anything else
  splashWindow = createSplashWindow();

  // Now dynamically import heavy modules while splash is visible
  const [
    { createMainWindow },
    { registerIpcHandlers },
    { initializeStorage }
  ] = await Promise.all([
    import('./windows/mainWindow'),
    import('./ipc'),
    import('./services/storage')
  ]);

  // Initialize storage
  await initializeStorage();

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

    // On Linux, we need to be more aggressive to get proper focus
    if (process.platform === 'linux') {
      mainWindow?.setAlwaysOnTop(true);
      mainWindow?.show();
      mainWindow?.maximize();
      mainWindow?.focus();
      // Delay removing alwaysOnTop to let window manager settle
      setTimeout(() => {
        mainWindow?.setAlwaysOnTop(false);
      }, 100);
    } else {
      mainWindow?.show();
      mainWindow?.maximize();
      mainWindow?.focus();
    }
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
