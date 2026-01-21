# Agent Mafia - Project Guide for Coding Agents

## Overview
Agent Mafia is an Electron + React desktop app that has two primary modes:
- Discord-style multi-agent chatrooms (round-robin LLM conversation).
- A Mafia game mode where LLM agents play scripted phases (discussion, voting, night actions).

This repo is split into Electron main/preload/renderer, with shared TypeScript types.

## Quick Start
- Install: `npm install`
- Dev (Electron + Vite): `npm run dev`
- Build: `npm run build`
- Preview (renderer build only): `npm run preview`

## Key Directories
- `src/main`: Electron main process (windows, IPC, controllers, LLM services, storage, game engine).
- `src/preload`: `contextBridge` API exposed to renderer.
- `src/renderer`: React UI (screens, components, Zustand stores, CSS modules).
- `src/shared`: Shared types, constants, and game model.
- `prompts`: Markdown prompt templates for the Mafia game.
- `assets/avatars`: Provider/user avatar images used in the UI.
- `out/`: Build output (generated; do not edit).
- `spec.md`: Product spec and UX expectations.

## Architecture Map
### Electron Main Process
- Entry: `src/main/index.ts`
- Windows: `src/main/windows/mainWindow.ts`, `src/main/windows/splashWindow.ts`
- IPC handlers: `src/main/ipc/index.ts`, `src/main/ipc/gameHandlers.ts`
- Storage: `src/main/services/storage`
- Chat mode: `src/main/services/chatController.ts`
- Mafia mode: `src/main/services/gameController.ts`, `src/main/engine/*`
- LLM integrations: `src/main/services/llm/*`

### Preload Bridge
`src/preload/index.ts` defines `window.api` methods and events.
Keep `src/preload/api.d.ts` in sync with `src/preload/index.ts` and any IPC changes.

### Renderer
- Root: `src/renderer/App.tsx`
- Layout: `src/renderer/components/layout/*`
- Screens: `src/renderer/components/screens/*`
- State: Zustand stores in `src/renderer/store/*`
- Styles: `src/renderer/styles/global.css` + CSS modules next to components.

### Shared Types
All cross-layer types live in `src/shared/types/*` and are imported via `@shared/*`.
Update these types first when introducing new fields or IPC payloads.

## Chat Mode Flow (Discord-style)
1. Renderer creates/updates a `Chat` via IPC (`chat:create`, `chat:update`).
2. `ChatController` manages active chats, intervals, and LLM calls.
3. Messages are formatted by `convertMessagesForAgent` and `buildSystemPrompt`.
4. LLM responses append `Message` objects and notify renderer via IPC events:
   - `chat:agentThinking`, `chat:agentThinkingDone`, `chat:messageAdded`.

Key files:
- `src/main/services/chatController.ts`
- `src/main/services/llm/messageConverter.ts`
- `src/shared/types/index.ts` (`Chat`, `Agent`, `Message`)

## Mafia Mode Flow
1. Renderer assembles pending agents and starts game via `game:start`.
2. `GameController` initializes `GameEngine` + `PhaseRunner`.
3. Prompts are built from `prompts/*.md` via `PromptBuilder`.
4. Responses are parsed by `ResponseParser` into JSON actions.
5. Events stream to renderer via `game:*` IPC events.

Key files:
- `src/main/services/gameController.ts`
- `src/main/engine/*`
- `src/main/llm/PromptBuilder.ts`, `src/main/llm/ResponseParser.ts`
- `src/shared/types/game.ts`

## Prompt Templates (Mafia)
- Prompts live in `prompts/`.
- Template variables use `{{variableName}}`.
- The boilerplate prompt is `prompts/boiler.md` and phase-specific prompts are mapped in `PromptBuilder`.
- If you add a new phase, update `PHASE_PROMPT_MAP` and create a new prompt file.

## LLM Providers
Supported providers: OpenAI, Anthropic, Google (Gemini).
Integrations live in `src/main/services/llm/*`.

To add a model/provider:
1. Update provider types in `src/shared/types/index.ts`.
2. Add model entry to `MODEL_OPTIONS`.
3. Add service implementation and wire it in `createLLMService`.
4. Update any UI dropdowns or validation.

API keys are stored in user data (`settings.json`) via the Settings screen.

## Data Storage
All persistent data is stored under:
`app.getPath('userData')/data`
- `settings.json`: API keys and game settings.
- `chatIndex.json`: list of chats.
- `chats/<chatId>.json`: full chat history/state.

Storage logic is in `src/main/services/storage/index.ts`.

## IPC Conventions
IPC handlers are registered in `src/main/ipc/index.ts`.
Renderer uses `window.api` in `src/preload/index.ts`.

When adding new IPC:
- Register a handler in `src/main/ipc/index.ts` (or `gameHandlers.ts`).
- Expose a preload wrapper in `src/preload/index.ts`.
- Add types in `src/preload/api.d.ts`.
- Update Zustand stores or UI as needed.

## Build Artifacts
`out/` and `node_modules/` are generated. Avoid editing these.

## Troubleshooting Tips
- Main process logs appear in the Electron terminal.
- Renderer logs appear in the DevTools console.
- If prompts are not updating in dev, restart Electron (prompt cache is in memory).

