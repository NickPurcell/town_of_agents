# Plan: Phase Order & Choice Display Updates

## Summary
1. Reorder night phases: DOCTOR_CHOICE → SHERIFF_CHOICE → NIGHT_DISCUSSION → NIGHT_VOTE
2. Add choice event printouts with reasoning bubbles (like votes)
3. Sheriff gets immediate investigation result + opportunity to speak after
4. Townsfolk get post-execution discussion

---

## Changes

### 1. Update Phase Order
**File:** `src/main/engine/GameEngine.ts` (lines 20-28)

Change PHASE_ORDER from:
```
DAY_DISCUSSION → DAY_VOTE → LAST_WORDS → NIGHT_DISCUSSION → NIGHT_VOTE → SHERIFF_CHOICE → DOCTOR_CHOICE
```
To:
```
DAY_DISCUSSION → DAY_VOTE → LAST_WORDS → POST_EXECUTION_DISCUSSION → DOCTOR_CHOICE → SHERIFF_CHOICE → SHERIFF_POST_SPEECH → NIGHT_DISCUSSION → NIGHT_VOTE
```

### 2. Add New Phase Types
**File:** `src/shared/types/game.ts` (lines 8-15)

Add to Phase type:
- `'POST_EXECUTION_DISCUSSION'`
- `'SHERIFF_POST_SPEECH'`

### 3. Add New Event Types
**File:** `src/shared/types/game.ts`

Add new interfaces:
```typescript
export interface ChoiceEvent {
  type: 'CHOICE';
  agentId: string;
  targetName: string;
  choiceType: 'DOCTOR_PROTECT' | 'SHERIFF_INVESTIGATE';
  visibility: Visibility;
  ts: number;
  reasoning?: string;
}
```

Add `ChoiceEvent` to `GameEvent` union type.

### 4. Emit Choice Events with Reasoning
**File:** `src/main/engine/PhaseRunner.ts` (lines 500-541)

Modify `handleChoiceResponse()` to emit a `ChoiceEvent` before recording the action:

For doctor:
- Emit event: `"Doctor [name] is protecting [target]"`
- Then call `setPendingDoctorProtectTarget()`

For sheriff:
- Emit event: `"Sheriff [name] is investigating [target]"`
- Emit immediate investigation result: `"Your investigation reveals that [Name] is/is not a member of the Mafia!"`
- Set flag to trigger SHERIFF_POST_SPEECH phase

### 5. Handle Sheriff Post-Speech Phase
**File:** `src/main/services/gameController.ts`

Add handler for `SHERIFF_POST_SPEECH`:
- Get sheriff agent
- Build prompt using `boiler.md` + `sheriff_post.md`
- Call LLM, emit speech event
- Call `nextPhase()`

### 6. Create Sheriff Post Prompt
**File:** `prompts/sheriff_post.md` (currently empty)

```markdown
You have just completed your investigation and received your result.

You now have an opportunity to share your findings or react to what you learned.

Remember: You can choose to reveal your role and findings, or keep them secret. Consider the strategic implications.

When speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
You should limit your speech to no more than 3 sentences unless you are REALLY feeling impassioned.

## Response Format
Respond with JSON:
{
  "type": "speak",
  "action": "SAY" or "DEFER",
  "message_markdown": "Your message"
}
```

### 7. Handle Post-Execution Discussion
**File:** `src/main/engine/GameEngine.ts`

Modify `nextPhase()` for LAST_WORDS case:
- After elimination, transition to `POST_EXECUTION_DISCUSSION` instead of directly to night
- POST_EXECUTION_DISCUSSION uses existing `discuss_day_post.md` prompt

**File:** `src/main/engine/PhaseRunner.ts`

Update `getDiscussionParticipants()` to include `POST_EXECUTION_DISCUSSION` with all alive agents.

**File:** `src/main/services/gameController.ts`

Add case for `POST_EXECUTION_DISCUSSION` → call `phaseRunner.startDiscussionPhase()`

### 8. Render Choice Events in UI
**File:** `src/renderer/components/chat/GameEventItem.tsx`

Add case for `CHOICE` event type:
```tsx
case 'CHOICE': {
  const choiceEvent = event as ChoiceEvent;
  const actionText = choiceEvent.choiceType === 'DOCTOR_PROTECT'
    ? `Doctor ${agent.name} is protecting ${choiceEvent.targetName}`
    : `Sheriff ${agent.name} is investigating ${choiceEvent.targetName}`;
  return (
    <div className={styles.choice}>
      <div className={styles.choiceHeader}>
        <span style={{ color: ROLE_COLORS[agent.role] }}>{actionText}</span>
      </div>
      {choiceEvent.reasoning && <ReasoningBlock ... />}
    </div>
  );
}
```

### 9. Update Phase Labels
**File:** `src/renderer/components/screens/GameChatScreen.tsx`

Add labels for new phases:
- `POST_EXECUTION_DISCUSSION`: "Post-Execution Discussion"
- `SHERIFF_POST_SPEECH`: "Sheriff's Reaction"

### 10. Update Visibility
**File:** `src/main/engine/Visibility.ts`

Add visibility rules for new phases:
- `POST_EXECUTION_DISCUSSION`: public
- `SHERIFF_POST_SPEECH`: sheriff_private

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/shared/types/game.ts` | Add Phase types, ChoiceEvent interface |
| `src/main/engine/GameEngine.ts` | Reorder PHASE_ORDER, update transitions |
| `src/main/engine/PhaseRunner.ts` | Emit ChoiceEvent, update participants |
| `src/main/services/gameController.ts` | Handle new phases |
| `src/main/engine/Visibility.ts` | Add visibility for new phases |
| `src/main/llm/PromptBuilder.ts` | Map new phases to prompts |
| `src/renderer/components/chat/GameEventItem.tsx` | Render ChoiceEvent |
| `src/renderer/components/screens/GameChatScreen.tsx` | Add phase labels |
| `prompts/sheriff_post.md` | Create prompt content |

---

## Verification

1. Start a new game
2. Verify day discussion → day vote → last words → **post-execution discussion** works
3. Verify night starts with **doctor choice** (with reasoning bubble + "is protecting" message)
4. Verify **sheriff choice** comes next (with reasoning bubble + "is investigating" message)
5. Verify sheriff sees immediate result message: "Your investigation reveals..."
6. Verify sheriff gets **post-speech opportunity**
7. Verify mafia discussion → mafia vote happens last
8. Verify night resolves correctly and new day begins
