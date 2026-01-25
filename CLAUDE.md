# Town of Agents - Project Guide for Coding Agents

## Overview
Town of Agents is an Electron + React desktop app that simulates a Town of Salem-style Mafia game where LLM agents play scripted phases (discussion, voting, night actions).

This repo is split into Electron main/preload/renderer, with shared TypeScript types.

## Quick Start
- Install: `npm install`
- Dev (Electron + Vite): `npm run dev`
- Build: `npm run build`
- Preview (renderer build only): `npm run preview`

## Maintenance Notes
- When updating game mechanics in the codebase, also update `MECHANICS.md` to reflect those changes. This file is the authoritative specification for attack/defense, visiting, night order, and role traits.

## Key Directories
- `src/main`: Electron main process (windows, IPC, controllers, LLM services, storage, game engine).
- `src/preload`: `contextBridge` API exposed to renderer.
- `src/renderer`: React UI (screens, components, Zustand stores, CSS modules).
- `src/shared`: Shared types, constants, and game model.
- `prompts`: Markdown prompt templates for the Mafia game.
- `assets/avatars`: Provider/user avatar images used in the UI.
- `out/`: Build output (generated; do not edit).
- `spec.md`: Product spec and UX expectations.
- `MECHANICS.md`: Game mechanics specification (attack/defense, visiting, night order, role traits).

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
- **GameEngine.ts**: EventEmitter-based state machine managing 20 gameplay phases, agents, events, kills, investigations, framing, and votes.
- **AgentManager.ts**: Agent state queries (getAgent, getAgentsByRole, getAliveMafia, getAliveTown, etc.).
- **PhaseRunner.ts**: Orchestrates phase execution (discussions, voting, choices) with round-robin turns and timeouts.
- **VoteResolver.ts**: Town vote (majority) and Mafia vote (Godfather final say, with unanimity fallback) resolution.
- **Visibility.ts**: Filters game events by visibility type (public, mafia, sheriff_private, doctor_private, lookout_private, vigilante_private, mayor_private, framer_private, consigliere_private, werewolf_private, jester_private, jailor_private, jail_conversation, host).

### Game Controller (`src/main/services/gameController.ts`)
- Main orchestrator wiring engine, phase runner, and LLM services.
- Manages game lifecycle (start, stop, pause, resume).
- Handles agent LLM requests with retry logic (MAX_LLM_RETRIES=5).
- Bridges events to renderer via IPC.
- Side chat functionality for user-to-agent conversations.

### LLM System (`src/main/llm/`)
- **PromptBuilder.ts**: Builds system prompts dynamically based on agent role, phase, and game state. Maps phase types (including `MAYOR_REVEAL_CHOICE` for pre-speech reveal) to prompt files.
- **PromptLoader.ts**: Loads and caches prompt MD files with template variable injection (`{{variableName}}`).
- **ResponseParser.ts**: Parses LLM responses into typed game actions. Supports both legacy JSON format and two-phase streaming protocol.

### Two-Phase Streaming Protocol
Speak responses use a two-phase streaming protocol for progressive UI updates:

**Format:**
```
{"type":"speak","action":"SAY"}
---MESSAGE_MARKDOWN---
Your message here
---END---
```

**DEFER example (no message body):**
```
{"type":"speak","action":"DEFER"}
```

**Key methods in ResponseParser:**
- `parseStreamingHeader()`: Parse JSON header from partial content
- `extractStreamingMessageBody()`: Extract message between markers
- `isStreamingComplete()`: Check for `---END---` or DEFER
- `parseStreamingSpeakResponse()`: Full parsing with fallback to legacy JSON

**Unchanged (JSON-only):** Vote, Choice, and MayorReveal responses remain in JSON format.

### LLM Services (`src/main/services/llm/`)
- **index.ts**: Factory for creating LLM services. `LLMService` interface has two methods:
  - `generate()`: Non-streaming request returning complete response
  - `generateStream()`: Streaming async generator yielding chunks with onChunk and optional onThinkingChunk callbacks
- **openaiService.ts**: OpenAI responses API with reasoning (streams thinking via onThinkingChunk).
- **anthropicService.ts**: Claude with extended thinking (8000 token budget, streams thinking via onThinkingChunk).
- **geminiService.ts**: Google Gemini support (streams thinking via onThinkingChunk).
- **rateLimiter.ts**: Rate limiting wrapper for both generate and generateStream.

### Game Logging (`src/main/services/logging/`)
Writes human-readable log files for each game session to `.logs/` directory.

- **index.ts**: `LoggingService` singleton class
  - `startLogging(agents)`: Create log file on game start
  - `logEvent(event)`: Append formatted event to log (async, non-blocking)
  - `stopLogging(winner)`: Write footer and close log
- **formatters.ts**: Event formatting utilities
  - `formatVisibility(visibility)`: Convert visibility to readable string (e.g., `sheriff_private:agent-id`)
  - `formatGameEvent(event, agentLookup)`: Format each event type to human-readable text

**Log file location:**
- Development: `.logs/` in project root
- Production: `{userData}/.logs/`

**Log file format:** `TOS_log_YYYY-MM-DD_HH-MM-SS.txt`

**Important:** Reasoning content is never logged - only `messageMarkdown` from SPEECH events.

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
  - **gameStore.ts**: Game state, pending agents, side chat threads, streaming content, streaming thinking content
  - **uiStore.ts**: Screen navigation, side chat agent selection
  - **settingsStore.ts**: API key management
- Agent components: `src/renderer/components/agents/*`
  - **AddAgentModal.tsx**: Modal for adding new agents with role/model selection
  - **AgentCard.tsx**: Individual agent display card
  - **AgentDetails.tsx**: Detailed agent info panel
  - **PlayersMenu.tsx**: Player list menu in sidebar
- Chat components: `src/renderer/components/chat/*`
  - **StreamingSpeech.tsx**: Displays speech content progressively token-by-token during streaming
  - **GameEventItem.tsx**: Renders game events with visual categorization (narrations, speeches, votes, deaths, transitions)
  - **NarrationIcons.tsx**: 9 inline SVG icons for narration categories (skull, trophy, shield, crown, sun, moon, clock, gavel, eye)
  - **MessageItem.tsx**: Individual message display component
  - **ThinkingIndicator.tsx**: Shows agent thinking state with streaming reasoning content
- Utilities: `src/renderer/utils/*`
  - **narrationCategorizer.ts**: Pattern matching to categorize narrations by urgency (critical/info/private) and visibility. Day/night transitions use TransitionEvent instead.
- Styles: `src/renderer/styles/global.css` + CSS modules next to components.

### Shared Types
All cross-layer types live in `src/shared/types/*` and are imported via `@shared/*`.
Update these types first when introducing new fields or IPC payloads.

Key types in `src/shared/types/game.ts`:
- **Roles**: MAFIA, GODFATHER, FRAMER, CONSIGLIERE, JESTER, CITIZEN, SHERIFF, DOCTOR, LOOKOUT, MAYOR, VIGILANTE, WEREWOLF, JAILOR
- **Factions**: MAFIA, TOWN, NEUTRAL (Godfather, Framer, and Consigliere are MAFIA faction; Jester and Werewolf are NEUTRAL faction; Jailor is TOWN)
- **AttackLevel**: NONE, BASIC, POWERFUL, UNSTOPPABLE
- **DefenseLevel**: NONE, BASIC, POWERFUL
- **RoleTraits**: Interface defining visits, attack, defense, detection_immune, roleblock_immune
- **ROLE_TRAITS**: Centralized configuration mapping roles to their traits
- **Phases**: 28 phase types (DAY_ONE_DISCUSSION through LOOKOUT_POST_SPEECH, plus MAYOR_REVEAL_CHOICE, JESTER_HAUNT_PRE_SPEECH, JESTER_HAUNT_CHOICE, FRAMER_PRE_SPEECH, FRAMER_CHOICE, CONSIGLIERE_CHOICE, CONSIGLIERE_POST_SPEECH, DOCTOR_PRE_SPEECH, WEREWOLF_PRE_SPEECH, WEREWOLF_CHOICE, JAILOR_CHOICE, JAIL_CONVERSATION, JAILOR_EXECUTE_CHOICE, POST_GAME_DISCUSSION)
- **GameAgent**: id, name, role, faction, personality, provider, model, alive, hasRevealedMayor
- **Visibility**: 14 types with agent-specific variants (includes framer_private, consigliere_private, werewolf_private, jailor_private, jester_private, jail_conversation)
- **GameEvent**: NARRATION, PHASE_CHANGE, SPEECH, VOTE, CHOICE (includes FRAMER_FRAME, CONSIGLIERE_INVESTIGATE, WEREWOLF_KILL, JAILOR_JAIL, JAILOR_EXECUTE, JAILOR_ABSTAIN, JESTER_HAUNT), INVESTIGATION_RESULT, DEATH, TRANSITION
- **TransitionEvent**: Day/night cinematic banners with heading, subtitle, and transitionType (DAY/NIGHT)
- **GameState**: Current game snapshot with agents, events, phase, day number, pending targets (pendingFramedTarget, persistentFramedTargets, pendingWerewolfKillTarget, vigilanteBulletsRemaining, sheriffIntelQueue, pendingJailTarget, jailorExecutionsRemaining, jailorLostExecutionPower, jailedAgentIds, doctorSelfHealUsed, pendingJesterHauntTarget, jesterWhoHaunted, jesterLynchVotes)
- **StreamingSpeakHeader**: Two-phase streaming protocol header type
- **NarrationCategory**: Categorizes narrations by urgency (critical_death, critical_win, critical_saved, critical_reveal, info_transition, info_phase_prompt, info_vote_outcome, private_sheriff, private_lookout, private_vigilante, private_doctor)
- **NarrationIcon**: Icons for narration types (skull, trophy, shield, crown, sun, moon, clock, gavel, eye)

Helper functions:
- `getRoleTraits(role)`: Get traits for a role
- `doesAttackSucceed(attack, defense)`: Compare attack vs defense levels
- `getFactionForRole(role)`: Get faction from role
- `canAgentSeeEvent(agent, event)`: Check event visibility for an agent

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
   - Before a Mayor speaks in day/post-execution discussion, GameController may request a reveal decision if unrevealed
3. GameController bridges LLM and engine.

### Win Conditions
- **Town wins**: All Mafia dead (and no Werewolf alive)
- **Mafia wins**: Mafia count >= Town count (and no Werewolf alive)
- **Werewolf wins**: Werewolf is the ONLY player alive
- **Jester wins**: Gets lynched by town (game continues after Jester win)

### Night Phase Order (per MECHANICS.md)
1. **Jailor Choice** - Jailor selects who to jail (FIRST action)
2. **Jail Conversation** - Private 3-round interrogation between Jailor and prisoner
3. **Jailor Execute Choice** - Jailor decides whether to execute (UNSTOPPABLE attack, **kills immediately**)
4. **Doctor Pre-Speech** - Doctor deliberates (private)
5. **Doctor Choice** - Protect target (grants POWERFUL defense, applies to immediate Mafia kill)
6. **Mafia Discussion** - Mafia members discuss (jailed Mafia excluded)
7. **Mafia Vote** - Godfather has final say; unanimity fallback (jailed Mafia excluded, **kills immediately**)
8. **Framer Pre-Speech** - Framer deliberates (private)
9. **Framer Choice** - Frame target (persists until investigated)
10. **Consigliere Choice** - Learn exact role
11. **Consigliere Post-Speech** - Consigliere reacts to findings (private)
12. **Sheriff Choice** - Investigate (consumes frame, Godfather appears innocent, Werewolf conditional)
13. **Sheriff Post-Speech** - Sheriff reacts to result
14. **Vigilante Pre-Speech** - Vigilante deliberates (private, Night 2+ only)
15. **Vigilante Choice** - Shoot target (3 bullets total, Night 2+ only, **kills immediately**)
16. **Werewolf Pre-Speech** - Werewolf deliberates (private, only on even nights)
17. **Werewolf Choice** - Rampage at target or stay home (only on nights 2, 4, 6...)
18. **Lookout Choice** - Watch target (sees all visitors)
19. **Lookout Post-Speech** - Lookout reacts to visitors seen
20. **Night Resolution** - Remaining attacks resolve, notifications sent

**Jailor Notes:**
- Jailor does NOT visit (invisible to Lookout, immune to Werewolf rampage at target)
- Jailed agents cannot perform their night actions (role blocked)
- Jailed agents have POWERFUL defense (protected while in jail)
- If Jailor jails Werewolf on a full moon night (2, 4, 6...), Werewolf kills Jailor + visitors
- Executing a Town member causes Jailor to permanently lose execution ability

**Doctor Notes:**
- Doctor has **1 self-heal** for the entire game
- Must use "SELF" keyword to self-heal (using own name as target will fail)
- Cannot heal revealed Mayor

**Lookout Notes:**
- Cannot watch jailed targets (receives "Your target was in jail.")
- Jailor does NOT visit, so Lookout won't see Jailor visiting the jailed player

**Immediate Kills:**
- **Jailor Execution**: Kills target immediately when decision is made (UNSTOPPABLE - bypasses all defense)
- **Mafia Kill**: Kills target immediately after vote resolves (checks full defense including Doctor protection)
- **Vigilante Kill**: Kills target immediately when target is chosen (checks full defense including Doctor protection)
- Immediate kills prevent the victim from performing their night action
- Morning announcements still appear at dawn for public visibility

**Jester Haunt:**
- When Jester is lynched, they win (but game continues)
- Jester chooses one voter who voted GUILTY or ABSTAINED to haunt
- Haunted player cannot act at night (role blocked)
- Haunted player dies at dawn (UNSTOPPABLE - bypasses all defense)
- Death message: "**[Name]** was haunted by **[Jester Name]**. Their role was **[Role]**."

### Post-Game Discussion
After a win condition is met, the game enters POST_GAME_DISCUSSION phase:
- All agents (dead AND alive) participate
- 2 rounds of casual discussion (GGs, strategy reveals, etc.)
- game_over event fires only after discussion completes

### Attack/Defense System
- **Attack succeeds if**: attack_level > defense_level
- **BASIC attack** (Mafia, Vigilante) beats NONE defense
- **POWERFUL attack** (Werewolf) beats NONE and BASIC defense
- **UNSTOPPABLE attack** (Jailor execution) beats ALL defense levels including POWERFUL
- **Doctor protection** grants POWERFUL defense (blocks BASIC and POWERFUL)
- **Godfather** has BASIC innate defense (survives Vigilante, NOT Werewolf)
- **Werewolf** has BASIC innate defense (survives Mafia and Vigilante)
- **Attacker notified** when target is immune

## Prompt Templates
Prompts live in `prompts/` organized by role folders. Template variables use `{{variableName}}`.

**Core Templates** (root):
- `boiler.md`: Base system prompt with role definitions and game rules
- `user_message.md`: Template for user-side chat requests
- `last_words.md`: Condemned agent's final words
- `discuss_day_post.md`: Post-execution discussion
- `discuss_post_game.md`: Post-game discussion (all agents, dead and alive)

**Generic Day Prompts** (root):
- `discuss_day_one.md`: First day discussion (generic townsfolk)
- `discuss_day.md`: Day discussion rounds (generic townsfolk)
- `vote_day.md`: Day voting mechanics (generic townsfolk)

**Role-Specific Prompts** (in role folders):
- `sheriff/choice.md`: Investigation target selection (detects "suspicious" = mafia OR framed)
- `sheriff/choice_post.md`: Investigation result reaction
- `lookout/choice.md`: Watch target selection
- `lookout/choice_post.md`: Visitor information reaction
- `doctor/choice_pre.md`: Deliberation before protecting
- `doctor/choice.md`: Protection target selection
- `vigilante/choice_pre.md`: Deliberation before killing
- `vigilante/choice.md`: Kill target selection
- `framer/choice_pre.md`: Deliberation before framing
- `framer/choice.md`: Frame target selection (makes target appear suspicious to Sheriff)
- `consigliere/choice.md`: Investigation target selection (learns exact role, not just alignment)
- `consigliere/choice_post.md`: Investigation result reaction
- `werewolf/choice_pre.md`: Deliberation before rampage (considers visitors, staying home)
- `werewolf/choice.md`: Rampage target selection (can target self to stay home)
- `jailor/choice.md`: Jail target selection (goes FIRST at night)
- `jailor/conversation.md`: Private jail interrogation (3 rounds)
- `jailor/execute_choice.md`: Execution decision (UNSTOPPABLE attack, 3 total)
- `jester/haunt_pre.md`: Deliberation before haunting (shows eligible voters)
- `jester/haunt_choice.md`: Haunt target selection (only voters who voted GUILTY or ABSTAINED)
- `mafia/discuss.md`: Mafia night discussion (Framer and Consigliere participate but cannot vote)
- `mafia/vote.md`: Mafia night kill voting (Framer and Consigliere excluded from voting)
- `mayor/reveal_choice.md`: Pre-speech reveal decision
- `mayor/vote_day.md`: Day voting with 3-vote format for revealed mayor
- `mayor/discuss_day.md`: Day discussion for mayor (role-specific)
- `mayor/discuss_day_one.md`: First day discussion for mayor (role-specific)

**Role-Specific Override System**:
PromptBuilder uses `ROLE_PROMPT_OVERRIDES` to serve role-specific prompts. When adding role-specific prompts:
1. Add prompt file to `prompts/<role>/`
2. Add override mapping to `ROLE_PROMPT_OVERRIDES` in PromptBuilder.ts

Mayor overrides only `DAY_VOTE`; the pre-speech reveal uses `MAYOR_REVEAL_CHOICE` and is handled in `GameController` before mayor speech.

If you add a new phase, update `PHASE_PROMPT_MAP` in PromptBuilder and create a new prompt file.

## LLM Providers
Supported providers: OpenAI, Anthropic, Google (Gemini).

Available models (defined in `src/shared/types/index.ts`):
- `gpt-5`, `gpt-5-mini`, `gpt-4o-mini` (OpenAI)
- `claude-opus-4-5` (Anthropic)
- `gemini-3-pro-preview`, `gemini-3-flash-preview` (Google)

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
  onGameStreamingChunk(callback: (data: { agentId: string; chunk: string; isComplete: boolean }) => void): () => void
  onGameStreamingThinkingChunk(callback: (data: { agentId: string; chunk: string }) => void): () => void
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
