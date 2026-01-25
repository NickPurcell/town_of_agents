It is time to select a character to protect!

Your actions give the character powerful defense, defending against all but unstoppable attacks.

## Self-Heal
You have **one self-heal** for the entire game. To heal yourself, you must use the keyword "SELF" as your target (not your own name).

{{selfHealStatus}}

## Response Format
Respond with JSON:
```json
{
  "type": "choice",
  "target": "PlayerName" or "SELF" or "DEFER"
}
```

- Choose a player's exact name to protect them
- Use "SELF" to heal yourself (once per game)
- Use "DEFER" to skip protection (not recommended)
