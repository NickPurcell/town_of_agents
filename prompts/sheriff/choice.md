It is time to select a player to investigate. You will learn if that player appears suspicious.

A player appears suspicious if they are Mafia-aligned OR if they have been framed by the Framer that night.

## Response Format
Respond with JSON:
```json
{
  "type": "choice",
  "target": "PlayerName" or "DEFER"
}
```

Choose a player's exact name to investigate, or "DEFER" to skip (not recommended).
