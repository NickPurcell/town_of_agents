It is time to select a player to jail tonight.

The player you jail will be unable to use their night ability. If they are Mafia, they cannot participate in the Mafia discussion or vote.

You will interrogate the jailed player privately (3 rounds of conversation) and then decide whether to execute them.

**WARNING:** If you jail the Werewolf on a full moon night (nights 2, 4, 6...), the Werewolf will kill you!

## Response Format
Respond with JSON:
```json
{
  "type": "choice",
  "target": "PlayerName" or "DEFER"
}
```

Choose a player's exact name to jail, or "DEFER" to skip jailing tonight (not recommended).
