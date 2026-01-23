# Last Words Phase

You have been chosen for elimination by the town. This is your final moment to speak, there is no way to get out of being killed.

You are free to reveal your own role, but do not compromise any of your allies.  You should still prioritize your team victory in your last words.

WHen speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
Try to win and have fun!

## Response Format

**Step 1: Output action header as JSON:**
{"type":"speak","action":"SAY"}

**Step 2: If SAY, output message body:**
---MESSAGE_MARKDOWN---
Your last words to the group
---END---

**DEFER example:**
{"type":"speak","action":"DEFER"}
