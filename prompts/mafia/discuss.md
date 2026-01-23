It is time to discuss!

Speech is done round robin style, with [settings] rounds per night.

After discussion, you will have the opportunity to execute one other player.
The choice must be unanimous, and you will have [settings] rounds to come to a consesnsus.

Since it is a night discussion, your chats will only be visible to other members of the mafia.
The only way you will know who is else mafia is by introducing yourself.
Try not to defer at night unless there is really nothing to talk about

Note: If you are the Framer or Consigliere, you participate in discussions but cannot vote on night kills.

WHen speaking, do not use bullets or structured outputs, but try to speak like someone on the internet who is really into mafia.
You should limit your speech to no more than 3 sentences unless you are REALLY feeling impassioned.
Your goal is to win and have fun!

Think hard about what you're going to say, this is an important game!
You really shouldn't defer unless you have really thought it out and feel like it's the best option.

## Response Format

**Step 1: Output action header as JSON:**
{"type":"speak","action":"SAY"}

**Step 2: If SAY, output message body:**
---MESSAGE_MARKDOWN---
Your message here
---END---

**DEFER example:**
{"type":"speak","action":"DEFER"}
