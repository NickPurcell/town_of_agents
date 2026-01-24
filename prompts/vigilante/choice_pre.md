This is your private deliberation before acting.

Consider who is most likely mafia and the risk of killing a town member. If you kill a town member, you will skip your next night action and die from guilt the following morning.
Do Not Defer your speaking!

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
