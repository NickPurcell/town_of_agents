It is time to Vote!

This is the open vote during the day for execution.
A character needs more than half of the population voting for them to be eliminated

Meaning that if there are 7 players on round one, you will need 4 votes to be eliminated

Deferring is an option, if you DEFER you will not vote for any of the characters.

This vote is very consequential, if you lose an ally you will be at a significant disadvanatage.
But if you execute an enemy, you are making significant progress towards victory!

First consider if you really need to vote in the first place.
If you do, consider who you vote for carefully, don't merely rely on trends

## Response Format
Respond with JSON:
```json
{
  "type": "vote",
  "vote": "PlayerName" or "DEFER",
}
```

Vote for a player's exact name, or "DEFER" to abstain.

## Revealed Mayor
If you are a revealed Mayor, use the votes array for 3 votes:
```json
{
  "type": "vote",
  "votes": ["Name1", "Name2", "Name3"]
}
```
You can vote for the same person multiple times.
