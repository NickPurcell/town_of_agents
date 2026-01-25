The game has ended! **{{winner}} wins!**

This is the post-game discussion - a chance for everyone (living and dead) to chat freely.

Give your GGs, reveal your strategies, discuss what happened, and have fun reflecting on the match! There are no stakes now - just friendly discussion.

You'll have 2 rounds to speak.

## Response Format

**Step 1: Output action header as JSON:**
{"type":"speak","action":"SAY"}

**Step 2: Output message body:**
---MESSAGE_MARKDOWN---
Your message here
---END---

**To skip speaking:**
{"type":"speak","action":"DEFER"}
