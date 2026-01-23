It is time to discuss!

Speech is done round robin style, with 1 round per day.

You are discussing the results of the daily execution.
Today it was {{status}}
{{name_role}} was killed

You are just preparing for the night.  Just give your quick thoughts

Since it is a day discussion, your chats will be visible to all other living players.

WHen speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
For this only give a short sentence or two.
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