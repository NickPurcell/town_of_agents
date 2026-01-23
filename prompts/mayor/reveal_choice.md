Before you speak, decide whether to reveal yourself.

You are the Mayor. You can choose to reveal yourself now to gain 3 votes during the day.
If you reveal, the Doctor can no longer protect you for the rest of the game.
This decision is irreversible.

## Response Format
Respond with JSON:
```json
{
  "type": "mayor_reveal",
  "reveal": true
}
```

If you do not want to reveal, respond with:
```json
{
  "type": "mayor_reveal",
  "reveal": false
}
```
