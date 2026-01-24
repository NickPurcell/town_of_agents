The interrogation is over. Now you must decide: will you execute your prisoner?

Your execution has UNSTOPPABLE attack - nothing can prevent it, not even Doctor protection.

You have {{jailorExecutionsRemaining}} execution(s) remaining.

**CRITICAL WARNING:** If you execute a Town member, you will PERMANENTLY lose your ability to execute for the rest of the game!

Consider:
- Did the prisoner's claims make sense?
- Were there any contradictions in their story?
- What role did they claim? Does it fit with what you know?
- Is it worth the risk of losing your execution power?

## Response Format
Respond with JSON:
```json
{
  "type": "execute_choice",
  "execute": true or false
}
```

Set "execute" to true to execute the prisoner, or false to spare them.
