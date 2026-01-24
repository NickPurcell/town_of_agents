import { BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false, // Don't show until content is ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Get logo path based on environment
  let logoUrl: string;
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    logoUrl = `${process.env['ELECTRON_RENDERER_URL']}/logo.png`;
  } else {
    const logoPath = join(__dirname, '../renderer/logo.png');
    logoUrl = `file://${logoPath}`;
  }

  // Show window only when content is ready to display
  splash.once('ready-to-show', () => {
    splash.show();
  });

  // Load splash HTML directly
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHTML(logoUrl))}`);

  return splash;
}

function getSplashHTML(logoUrl: string): string {
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
    .logo {
      width: 200px;
      height: auto;
      margin-bottom: 24px;
      filter: drop-shadow(0 0 20px rgba(196, 30, 58, 0.5));
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { filter: drop-shadow(0 0 20px rgba(196, 30, 58, 0.5)); }
      50% { filter: drop-shadow(0 0 30px rgba(196, 30, 58, 0.8)); }
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }
    .subtitle {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 24px;
    }
    .loader {
      width: 120px;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }
    .loader-bar {
      width: 40%;
      height: 100%;
      background: linear-gradient(90deg, #c41e3a, #5865F2);
      border-radius: 2px;
      animation: loading 1.5s ease-in-out infinite;
    }
    @keyframes loading {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
  </style>
</head>
<body>
  <img class="logo" src="${logoUrl}" alt="Town of Agents" />
  <div class="title">Town of Agents</div>
  <div class="subtitle">Loading...</div>
  <div class="loader">
    <div class="loader-bar"></div>
  </div>
</body>
</html>
  `;
}
