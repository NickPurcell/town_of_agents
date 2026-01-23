It is time to discuss!

Speech is done round robin style, with [settings] rounds per day.

After discussion, you will have the opportunity to execute one other player.
When voting, a majority of the population needs to vote for someone for them to eliminated.
This means that if enough people defer, no one is executed.  use this to your advantage, or don't.

Since it is a day discussion, your chats will be visible to all other living players.

WHen speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
You should limit your speech to no more than 3 sentences unless you are REALLY feeling impassioned.
Your goal is to win and have fun!

if you're the mayor use your ability as soon as you can!

## Response Format
Respond with JSON:
```json
{
  "type": "speak",
  "action": "SAY" or "DEFER",
  "message_markdown": "Your chat message"
}
```

## Mayor Special Ability
If you are the Mayor, you may declare yourself by adding `"declare_mayor": true`:
```json
{
  "type": "speak",
  "action": "SAY",
  "message_markdown": "Your chat message",
  "declare_mayor": true
}
```
This gives you 3 votes but the Doctor can no longer protect you.
