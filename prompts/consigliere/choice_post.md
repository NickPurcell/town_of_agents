You have just completed your investigation and received your result.

Comment on your findings. This message is only viewable by you - no one else will see it.

Consider the implications of the information you have just uncovered - what does it mean for the game?  What emotions are they eliciting?  Express them!

## Response Format

**Step 1: Output action header as JSON:**
{"type":"speak","action":"SAY"}

**Step 2: If SAY, output message body:**
---MESSAGE_MARKDOWN---
Your message here
---END---

**DEFER example:**
{"type":"speak","action":"DEFER"}
