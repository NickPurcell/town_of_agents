# Town of Agents - Project Guide for Coding Agents

## Overview
Town of Agents is an Electron + React desktop app that simulates a Town of Salem-style Mafia game where LLM agents play scripted phases (discussion, voting, night actions).

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
- Storage: `src/main/services/storage/index.ts`
- Game controller: `src/main/services/gameController.ts`
- Game engine: `src/main/engine/*`
- LLM integrations: `src/main/services/llm/*`

### Game Engine (`src/main/engine/`)
- **GameEngine.ts**: EventEmitter-based state machine managing 14 game phases, agents, events, kills, investigations, and votes.
- **AgentManager.ts**: Agent state queries (getAgent, getAgentsByRole, getAliveMafia, getAliveTown, etc.).
- **PhaseRunner.ts**: Orchestrates phase execution (discussions, voting, choices) with round-robin turns and timeouts.
- **VoteResolver.ts**: Town vote (majority) and Mafia vote (unanimity) resolution with tie-breaking.
- **Visibility.ts**: Filters game events by visibility type (public, mafia, sheriff_private, doctor_private, lookout_private, vigilante_private, host).

### Game Controller (`src/main/services/gameController.ts`)
- Main orchestrator wiring engine, phase runner, and LLM services.
- Manages game lifecycle (start, stop, pause, resume).
- Handles agent LLM requests with retry logic (MAX_LLM_RETRIES=5).
- Bridges events to renderer via IPC.
- Side chat functionality for user-to-agent conversations.

### LLM System (`src/main/llm/`)
- **PromptBuilder.ts**: Builds system prompts dynamically based on agent role, phase, and game state. Maps 14 phases to prompt files.
- **PromptLoader.ts**: Loads and caches prompt MD files with template variable injection (`{{variableName}}`).
- **ResponseParser.ts**: Parses LLM responses into typed game actions.

### LLM Services (`src/main/services/llm/`)
- **index.ts**: Factory for creating LLM services.
- **openaiService.ts**: OpenAI responses API with reasoning.
- **anthropicService.ts**: Claude with extended thinking (8000 token budget).
- **geminiService.ts**: Google Gemini support.
- **rateLimiter.ts**: Rate limiting wrapper.

### Preload Bridge
`src/preload/index.ts` defines `window.api` methods and events.
Keep `src/preload/api.d.ts` in sync with `src/preload/index.ts` and any IPC changes.

### Renderer
- Root: `src/renderer/App.tsx`
- Layout: `src/renderer/components/layout/*` (ThreeColumnLayout, LeftSidebar, CenterPanel, RightSidebar)
- Screens: `src/renderer/components/screens/*`
  - **WelcomeScreen.tsx**: Landing page
  - **GameSetupScreen.tsx**: Agent creation with role/model selection
  - **GameChatScreen.tsx**: Main game viewer with event stream
  - **AgentChatScreen.tsx**: Side chat for user-to-agent interaction
  - **SettingsScreen.tsx**: API key configuration
- State: Zustand stores in `src/renderer/store/*`
  - **gameStore.ts**: Game state, pending agents, side chat threads
  - **uiStore.ts**: Screen navigation, side chat agent selection
  - **settingsStore.ts**: API key management
- Styles: `src/renderer/styles/global.css` + CSS modules next to components.

### Shared Types
All cross-layer types live in `src/shared/types/*` and are imported via `@shared/*`.
Update these types first when introducing new fields or IPC payloads.

Key types in `src/shared/types/game.ts`:
- **Roles**: MAFIA, CITIZEN, SHERIFF, DOCTOR, LOOKOUT, MAYOR, VIGILANTE
- **Factions**: MAFIA, TOWN
- **Phases**: 14 phase types (DAY_ONE_DISCUSSION through LOOKOUT_POST_SPEECH)
- **GameAgent**: id, name, role, faction, personality, provider, model, alive
- **Visibility**: 7 types with agent-specific variants
- **GameEvent**: NARRATION, PHASE_CHANGE, SPEECH, VOTE, CHOICE, INVESTIGATION_RESULT, DEATH
- **GameState**: Current game snapshot with agents, events, phase, day number, pending targets

## Game Flow
1. Renderer assembles pending agents and starts game via `game:start`.
2. `GameController` initializes `GameEngine` + `PhaseRunner`.
3. Prompts are built from `prompts/*.md` via `PromptBuilder`.
4. Responses are parsed by `ResponseParser` into JSON actions.
5. Events stream to renderer via `game:*` IPC events.

### Phase Execution
1. GameEngine maintains phase state machine.
2. PhaseRunner executes each phase:
   - Request agent action (speak, vote, choose)
   - Collect responses via gameController
   - Process results (eliminate, protect, investigate)
   - Transition to next phase
3. GameController bridges LLM and engine.

### Win Conditions
- **Town wins**: All Mafia dead
- **Mafia wins**: Mafia count >= Town count

## Prompt Templates
Prompts live in `prompts/`. Template variables use `{{variableName}}`.

**Core Templates**:
- `boiler.md`: Base system prompt with role definitions and game rules
- `user_message.md`: Template for user-side chat requests

**Phase Prompts**:
- `discuss_day_one.md`: First day discussion
- `discuss_day.md`: Day discussion (rounds)
- `vote_day.md`: Day voting mechanics
- `last_words.md`: Condemned agent's final words
- `discuss_day_post.md`: Post-execution discussion
- `discuss_night.md`: Mafia night discussion
- `vote_night.md`: Mafia night kill voting

**Role-Specific Prompts**:
- `doctor_choice.md`: Protection target selection
- `sheriff_choice.md`: Investigation target selection
- `sheriff_post.md`: Investigation result reaction
- `lookout_choice.md`: Watch target selection
- `lookout_post.md`: Visitor information reaction
- `vigilante_pre.md`: Deliberation before killing
- `vigilante_choice.md`: Kill target selection

If you add a new phase, update `PHASE_PROMPT_MAP` in PromptBuilder and create a new prompt file.

## LLM Providers
Supported providers: OpenAI, Anthropic, Google (Gemini).

Available models (defined in `src/shared/types/index.ts`):
- `gpt-5`, `gpt-5-mini` (OpenAI)
- `claude-opus-4-5` (Anthropic)
- `gemini-3-pro-preview` (Google)

To add a model/provider:
1. Update provider types in `src/shared/types/index.ts`.
2. Add model entry to `MODEL_OPTIONS`.
3. Add service implementation and wire it in `createLLMService`.
4. Update any UI dropdowns or validation.

API keys are stored in user data (`settings.json`) via the Settings screen.

## Data Storage
All persistent data is stored under: `app.getPath('userData')/data`
- `settings.json`: API keys and game settings.

Storage logic is in `src/main/services/storage/index.ts`.

### Game Settings
Configurable in settings:
- `roundsPerDiscussion`: Number of discussion rounds per phase
- `voteRetries`: Retry attempts for failed votes
- `turnTimeoutSec`: Timeout per agent turn
- `mafiaVotingRetries`: Retry attempts for mafia votes

## IPC Conventions
IPC handlers are registered in `src/main/ipc/index.ts` and `src/main/ipc/gameHandlers.ts`.
Renderer uses `window.api` defined in `src/preload/index.ts`.

### IPC API Surface
```typescript
interface API {
  // Settings
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<boolean>

  // LLM
  testConnection(provider: string, apiKey: string): Promise<{success, error?}>

  // Game operations
  gameStart(agents: PendingAgent[]): Promise<{success}>
  gameStop(): Promise<{success}>
  gamePause(): Promise<{success}>
  gameResume(): Promise<{success}>
  gameGetState(): Promise<GameState | null>
  gameAskAgent(agentId: string, messages: SideChatMessage[]): Promise<LLMResponse>

  // Event listeners (return unsubscribe functions)
  onGameEventAppended(callback): () => void
  onGamePhaseChanged(callback): () => void
  onGameOver(callback): () => void
  onGameAgentDied(callback): () => void
  onGameAgentThinking(callback): () => void
  onGameAgentThinkingDone(callback): () => void
  onGameStreamingMessage(callback): () => void
  onGameStateUpdate(callback): () => void
}
```

When adding new IPC:
1. Register a handler in `src/main/ipc/index.ts` (or `gameHandlers.ts`).
2. Expose a preload wrapper in `src/preload/index.ts`.
3. Add types in `src/preload/api.d.ts`.
4. Update Zustand stores or UI as needed.

## Build Artifacts
`out/` and `node_modules/` are generated. Avoid editing these.

## Troubleshooting Tips
- Main process logs appear in the Electron terminal.
- Renderer logs appear in the DevTools console.
- If prompts are not updating in dev, restart Electron (prompt cache is in memory).
