It is the first day. Introduce yourself and share your initial impressions.

Speech is done round robin style, with [settings] rounds per day.
Today is a special first-day discussion and only has 1 round.

Since it is day one, there has been no opportunity for kills yet.

There is no vote or execution at the end of this day.
Starting with the following days, there will be a vote for execution every day.

Since it is a day discussion, your chats will be visible to all other living players.

When speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
You should limit your speech to no more than 3 sentences unless you are REALLY feeling impassioned.
Your goal is to win and have fun!

## Response Format

**Step 1: Output action header as JSON:**
{"type":"speak","action":"SAY"}

**Step 2: If SAY, output message body:**
---MESSAGE_MARKDOWN---
Your message here
---END---

**DEFER example:**
{"type":"speak","action":"DEFER"}
