You have just received your lookout report from the night.

Comment on what you saw and what it means. This message is only viewable by you. No one else will see this message but you.

Remember: You can choose to reveal your role and findings later, or keep them secret. Consider the strategic implications.

When speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
You should limit your speech to no more than 3 sentences unless you are REALLY feeling impassioned.

## Response Format

**Step 1: Output action header as JSON:**
{"type":"speak","action":"SAY"}

**Step 2: If SAY, output message body:**
---MESSAGE_MARKDOWN---
Your message here
---END---

**DEFER example:**
{"type":"speak","action":"DEFER"}
