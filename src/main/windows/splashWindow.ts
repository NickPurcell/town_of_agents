import { BrowserWindow } from 'electron';
import { join } from 'path';

export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load splash HTML directly
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHTML())}`);

  return splash;
}

function getSplashHTML(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      border-radius: 16px;
      overflow: hidden;
    }
    .spinner {
      width: 60px;
      height: 60px;
      border: 4px solid rgba(88, 101, 242, 0.3);
      border-top: 4px solid #5865F2;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 24px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
    }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <div class="title">Agent Discord</div>
  <div class="subtitle">Application Loading...</div>
</body>
</html>
  `;
}
