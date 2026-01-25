# Town of Agents - Game Mechanics Specification

This document defines the core mechanics system for Town of Agents, including visiting, attack/defense tiers, detection, and night phase resolution.

---

## Role Traits

Each role has the following traits:

| Trait | Values | Description |
|-------|--------|-------------|
| `visits` | boolean | Whether the role physically visits their target at night |
| `attack` | None / Basic / Powerful / Unstoppable | Attack power level |
| `defense` | None / Basic / Powerful | Defense level (survives attacks of equal or lesser power) |
| `detection_immune` | boolean | Appears innocent to Sheriff regardless of faction |
| `roleblock_immune` | boolean | Cannot be roleblocked (future mechanic) |

---

## Attack & Defense System

### Attack Levels (ascending power)
1. **None** - Cannot attack
2. **Basic** - Standard attack (Mafia kill, Vigilante)
3. **Powerful** - Pierces Basic defense (future roles)
4. **Unstoppable** - Pierces all defense (future roles: Jailor execution, Arsonist ignite)

### Defense Levels (ascending power)
1. **None** - No innate protection
2. **Basic** - Survives Basic attacks (Godfather at night)
3. **Powerful** - Survives Basic and Powerful attacks (Doctor protection)

### Resolution
- Attack succeeds if `attack_level > defense_level`
- When attack fails: **attacker is notified** target was immune
- Doctor protection grants **Powerful defense** for the night
- Jailed agents have **Powerful defense** (protected while in jail)

---

## Visiting

A role **visits** when their night ability requires them to go to the target's location. Visiting is relevant for:
- **Lookout** detection (sees all visitors to watched target)
- Future roleblock mechanics
- Future trap/ambush roles

### Visiting Roles
| Role | Visits | Notes |
|------|--------|-------|
| Sheriff | ✓ | Investigates target |
| Doctor | ✓ | Heals target |
| Lookout | ✓ | Watches target (but excluded from own visitor list) |
| Vigilante | ✓ | Shoots target |
| Jailor | ✗ | Prisoner comes to jail (invisible to Lookout) |
| Mayor | ✗ | Day ability only |
| Citizen | ✗ | No ability |
| Mafia (kill) | ✓ | Godfather or designated killer visits |
| Godfather | ✓ | Visits when performing kill |
| Framer | ✓ | Frames target |
| Consigliere | ✓ | Investigates target |

---

## Role Definitions

### Town Roles

#### Citizen
- **Faction:** Town
- **Ability:** None
- **Attack:** None | **Defense:** None
- **Visits:** No
- **Notes:** Vanilla role with no special powers. Town roles can have duplicates.

#### Sheriff
- **Faction:** Town
- **Ability:** Investigate one player per night
- **Attack:** None | **Defense:** None
- **Visits:** Yes
- **Result:** "Suspicious" (Mafia or Framed) / "Not Suspicious" (Town or Godfather)
- **Notes:** Framing persists until Sheriff investigates the framed target

#### Doctor
- **Faction:** Town
- **Ability:** Protect one player per night from death
- **Attack:** None | **Defense:** None
- **Visits:** Yes
- **Protection Level:** Powerful (blocks Basic and Powerful attacks)
- **Self-Heal:** Can protect self, but cannot protect others on that night
- **Notifications:**
  - If heal saves someone: **both** Doctor and target are notified
  - If target wasn't attacked: no notification to target
- **Cannot heal:** Revealed Mayor

#### Lookout
- **Faction:** Town
- **Ability:** Watch one player to see who visits them
- **Attack:** None | **Defense:** None
- **Visits:** Yes
- **Sees:** Names of all players who visited the watched target
- **Notes:**
  - Sees visitors even if watched target dies
  - Does NOT see themselves in visitor list
  - Lookout phase resolves AFTER attacks (sees the killer)

#### Vigilante
- **Faction:** Town
- **Ability:** Shoot one player per night (3 bullets)
- **Attack:** Basic | **Defense:** None
- **Visits:** Yes
- **Bullets:** 3 total
- **Can shoot:** Night 1 onwards
- **Guilt:** If Vigilante kills a Town member, they die of guilt at the **end of the following night**
- **Notes:** Killing a revealed Mayor still triggers guilt

#### Mayor
- **Faction:** Town
- **Ability:** Reveal to gain 3 votes (permanent, once per game)
- **Attack:** None | **Defense:** None
- **Visits:** No (day ability)
- **Reveal Effect:**
  - Vote count becomes 3
  - **Cannot be healed by Doctor** after revealing

#### Jailor
- **Faction:** Town
- **Ability:** Jail one player per night, interrogate them, optionally execute
- **Attack:** Unstoppable (execution only) | **Defense:** None
- **Visits:** No (prisoner comes to jail)
- **Executions:** 3 total across the game
- **Night Order:** Goes FIRST (before Mafia discussion)
- **Jail Effect:**
  - Target cannot use their night ability (role blocked)
  - Jailed agents have **POWERFUL defense** (protected while in jail)
  - Jailed Mafia cannot participate in Mafia discussion OR vote
  - Private 3-round interrogation (Jailor and prisoner only)
- **Execution:**
  - UNSTOPPABLE attack (bypasses all defense including Doctor)
  - If Jailor executes a Town member: **permanently loses execution ability**
- **Werewolf Interaction:** If Jailor jails Werewolf on a full moon night (2, 4, 6...):
  - Werewolf kills the Jailor
  - Werewolf also kills anyone who visited the Jailor
  - Werewolf's attack takes precedence over Jailor's execution
- **Notes:**
  - Jailor does NOT know prisoner's actual role
  - Cannot jail the same person two nights in a row (future mechanic)

---

### Mafia Roles

#### Mafia (Basic)
- **Faction:** Mafia
- **Ability:** Participates in night kill vote
- **Attack:** Basic (when performing kill) | **Defense:** None
- **Visits:** Yes (when designated as killer)
- **Detection:** Appears **Suspicious** to Sheriff
- **Notes:** Cannot target fellow Mafia members

#### Godfather
- **Faction:** Mafia
- **Ability:** Final say on Mafia night kill
- **Attack:** Basic | **Defense:** Basic (at night only)
- **Visits:** Yes
- **Detection:** Appears **Not Suspicious** to Sheriff (detection_immune)
- **Notes:**
  - Other Mafia discuss, but Godfather decides the target
  - Cannot target fellow Mafia members

#### Framer
- **Faction:** Mafia
- **Ability:** Frame one player per night
- **Attack:** None | **Defense:** None
- **Visits:** Yes
- **Detection:** Appears **Suspicious** to Sheriff
- **Frame Effect:**
  - Target appears "Suspicious" to Sheriff
  - Frame persists **until Sheriff investigates** the framed target
  - Frame does NOT affect Consigliere (sees true role)
- **Mafia Vote:** Participates in discussion but **cannot vote** on kill target

#### Consigliere
- **Faction:** Mafia
- **Ability:** Investigate one player to learn their exact role
- **Attack:** None | **Defense:** None
- **Visits:** Yes
- **Detection:** Appears **Suspicious** to Sheriff
- **Result:** Learns the **exact role** (e.g., "Doctor", "Sheriff", "Vigilante")
- **Notes:**
  - Not affected by Framer (sees true role regardless)
  - Participates in discussion but **cannot vote** on kill target

---

## Night Phase Order

Night actions resolve in this specific order:

| Priority | Phase | Description |
|----------|-------|-------------|
| 1 | **Jailor Choice** | Jailor selects who to jail |
| 2 | Jail Conversation | Private 3-round interrogation |
| 3 | **Jailor Execute** | Jailor decides whether to execute prisoner **(kills immediately)** |
| 4 | Doctor | Doctor applies Powerful protection to target |
| 5 | Mafia Discussion | Mafia members discuss (jailed Mafia excluded) |
| 6 | **Mafia Vote** | Mafia votes on kill target **(kills immediately, checked against Doctor protection)** |
| 7 | Framer | Framer applies frame to target |
| 8 | Consigliere | Consigliere investigates target, learns exact role |
| 9 | Sheriff | Sheriff investigates target (frame already applied) |
| 10 | Vigilante | Vigilante shoots target |
| 11 | Werewolf | Werewolf rampages (only on even nights) |
| 12 | Lookout | Lookout sees all visitors (including attackers) |
| 13 | Night Resolution | Remaining attacks resolve, notifications sent |

### Immediate Kills
- **Jailor Execution**: Kills immediately when decision is made (UNSTOPPABLE - bypasses all defense)
- **Mafia Kill**: Kills immediately after vote resolves (checks full defense including Doctor protection)
- Victims of immediate kills **cannot perform their night action**
- Morning announcements still appear at dawn for public visibility

### Resolution Notes
- Doctor goes BEFORE Mafia so protection applies to immediate Mafia kills
- Framer goes before Sheriff so frames are active during investigation
- Werewolf rampages after Vigilante so they can catch the Vigilante visiting
- Lookout goes LAST so they see everyone who visited, including killers
- Multiple attacks on same target: target dies once, **both attackers credited**
- Werewolf rampage kills all visitors to target (Doctor, Sheriff, Lookout, etc.)

---

## Notifications

### Attack Notifications
| Scenario | Attacker Notified | Target Notified |
|----------|-------------------|-----------------|
| Attack succeeds | Yes (implicit - target dies) | N/A (dead) |
| Attack blocked by defense | Yes ("target was immune") | No |
| Attack blocked by Doctor | Yes (target doesn't die) | Yes ("you were attacked but healed") |

### Investigation Notifications
| Role | Result Format |
|------|---------------|
| Sheriff | "Suspicious" / "Not Suspicious" |
| Consigliere | Exact role name |
| Lookout | List of visitor names |

### Doctor Notifications
| Scenario | Doctor Notified | Target Notified |
|----------|-----------------|-----------------|
| Heal + no attack | No | No |
| Heal + attack blocked | Yes ("you saved someone") | Yes ("you were attacked but healed") |

### Death Notifications
When a player dies, their **role is publicly revealed** to all players. This applies to all causes of death:
- Day elimination (lynching)
- Night kills (Mafia, Vigilante)
- Werewolf mauling
- Jailor execution
- Vigilante guilt

---

## Role Uniqueness

- **Town roles:** Can have duplicates (multiple Citizens, Doctors, Sheriffs, etc.)
- **Mafia roles:** Unique (one Godfather, one Framer, one Consigliere per game)

---

### Neutral Roles

#### Werewolf
- **Faction:** Neutral (wins alone)
- **Ability:** Rampage at a target's location OR stay home
- **Attack:** Powerful | **Defense:** Basic
- **Visits:** Yes (when attacking, not when staying home)
- **Detection:** Conditional - appears **Not Suspicious** on nights 1 and 3, **Suspicious** on nights 2, 4+
- **Active Nights:** Only nights 2, 4, 6... (cannot act on nights 1 or 3)
- **Rampage Effect:**
  - Kills primary target AND all visitors to that target
  - POWERFUL attack pierces BASIC defense (kills Godfather, blocked only by Doctor's POWERFUL protection)
- **Stay Home:** Can target self to stay home and kill anyone who visits them
- **Win Condition:** Be the LAST player alive (both Town and Mafia are enemies)
- **Notes:**
  - Game continues if Werewolf is alive even when Mafia/Town would normally win
  - Lookout sees Werewolf visit (and sees victims at target location)
  - Doctor can save rampage victims with POWERFUL protection

---

## Future Mechanics (Planned)

### Roleblocking
- Roleblocked players cannot use their night ability
- Some roles will have `roleblock_immune: true`
- Relevant for future Escort/Consort roles

### Unstoppable Attacks
- Bypasses all defense levels
- Planned for: Jailor execution, Arsonist ignite, Werewolf rampage

### Additional Traits
- `astral`: Ability works without visiting (bypasses Lookout detection)
- `cautious`: Does not visit if target is protected
- `rampaging`: Attacks all visitors to target

---

## Quick Reference: Current Roles

| Role | Faction | Attack | Defense | Visits | Detection |
|------|---------|--------|---------|--------|-----------|
| Citizen | Town | None | None | No | - |
| Sheriff | Town | None | None | Yes | - |
| Doctor | Town | None | None | Yes | - |
| Lookout | Town | None | None | Yes | - |
| Vigilante | Town | Basic | None | Yes | - |
| Mayor | Town | None | None | No | - |
| Jailor | Town | Unstoppable* | None | No | - |
| Mafia | Mafia | Basic | None | Yes | Suspicious |
| Godfather | Mafia | Basic | Basic | Yes | Not Suspicious |
| Framer | Mafia | None | None | Yes | Suspicious |
| Consigliere | Mafia | None | None | Yes | Suspicious |
| Werewolf | Neutral | Powerful | Basic | Yes** | Conditional*** |

\* Jailor's attack is Unstoppable but only when executing (3 executions total)
\** Werewolf visits when attacking, not when staying home
\*** Werewolf appears Not Suspicious on nights 1 and 3, Suspicious on nights 2, 4+
