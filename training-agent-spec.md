# Training Agent Spec (v0.2)

Operating assumption: **lean bulk**, target gain **+0.25 lb/week**, band **0.1–0.5 lb/week**. All deficit language in older docs is stale.

The agent runs **every day** (late evening, after the day's workout is logged). It reads the Training Calendar Sheet, looks at what was logged that day (sets, notes, machines, readiness, skipped workouts), decides what to change for the coming days, and writes the plan into the Sheet's `Plan` tab, plus a readable "what changed and why" note in the "Training Calendar Data" folder in Drive. The app validates the file and shows every change to the user, who accepts or rejects each one. The exact file format is in [PLAN_SCHEMA.md](PLAN_SCHEMA.md); this document says what the agent should decide and why.

## What changed from v0.1

| Area | v0.1 | v0.2 |
|---|---|---|
| Deloads | Every 5th working week | Same, now implemented in the app: weeks 5, 10, 15, 20, 25 of the 28-week program. A pull-forward restarts the count. |
| Stall swaps | "Agent swaps automatically" | Still automatic: the swap starts accepted, but the user can reject it in the review or undo the plan afterwards. The app checks the swap rules below. |
| Calorie changes | Proposals for approval; 2-week lockout | The lockout is enforced by the app, not just the agent. |
| Cardio | Ceilings, HIIT/Zone 2 progression | Adds switching a push or pull Zone 2 day to HIIT (with approval), and the app enforces the ceilings. |
| Output contract | Draft, only `cardio` defined | Complete: `lifting`, `core`, `cardio`, `meals`, `deload`, `changeLog`, `approvals` (see PLAN_SCHEMA.md). |
| Inputs | Open item: Sheet export | Done: the Sheet has Workouts, Body, Meals, Fatigue, Program and Meal Plan tabs. |
| `config/program` | Open item | Done: the program is a document; accepted lifting, core and cardio changes write a new version with `source: "agent"`. |

## 1. Schedule and deloads

- Fixed deload: **every 5th working week** (weeks 5, 10, 15, 20, 25 of the program). The app already applies the deload week's cuts; the agent does not need to reduce sets itself for a scheduled deload.
- Pull-forward deload fires when BOTH are true:
  - 2+ consecutive readiness check-ins score <= 2/5 on energy AND soreness (Fatigue tab), and
  - performance drops: rep targets missed in two sessions in a row (Workouts tab).
- To pull a deload forward, send `deload: { "weekStart": "YYYY-MM-DD", "evidence": "..." }` and a `changeLog` entry with `kind: "deload-pull-forward"`. It always needs the user's approval. Accepting it makes that week a deload and restarts the 5-week count, so later deloads move with it (a pull-forward in week 8 makes weeks 13, 18 and 23 the next deloads). The `Program` tab's `Meta` rows list the scheduled and pulled-forward weeks.
- Deload week: lifting volume -40% at the same weights. Cardio (confirmed): HIIT rounds -40% at the same target watts; Zone 2 duration -40%.
- Every pull-forward is logged in the change log with the evidence that triggered it.

## 2. Lifting progression

- Double progression: top of the rep range on all sets -> add weight, return to the bottom of the range. +5 lb upper, +10 lb lower (the exercise's `progression` field).
- The agent expresses a load increase as `targetLb` on the exercise (an `auto` change). The app uses it in place of its own computed weight until the user logs that weight or more, then its normal progression takes over. Deload weeks keep the weights last used, so do not set `targetLb` for a deload week.
- **Stall:** 3 sessions without hitting the top of the rep range -> the agent swaps the exercise automatically (`kind: "stall-swap"`, `tag: "auto"`).
  - Same muscle group (first `muscleGroup`) and same movement pattern (`pattern`). The new exercise must send `pattern`.
  - Max one swap per session per week, one exercise out and one in.
  - Logged in the change log, with the three sessions as `evidence`.
  - The app checks all of the above against the workout log and rejects the file otherwise: it needs 3 logged sessions of the exercise in that same session (for example Face Pulls in PUSH A, not in PULL A) in a row where at least one set fell short of the top of the range. Deload-week and low-readiness sessions are not counted.
  - The swap is pre-accepted in the review. The user can reject it, or undo the whole plan after applying it.
- Any other added or removed exercise needs approval.
- Match logged sessions by the `Exercise` column. If the user swapped an exercise on the day (`Exercise` differs from `Planned Exercise`), that session does not count for the program exercise and is not a stall.

## 3. Nutrition protocol

- Driver: 7-day average bodyweight (not single readings; bioimpedance body fat is not a driver).
- Adjust calories in steps of +/-100-150 kcal, with a **2-week lockout** between changes. Protein stays fixed.
  - The app rejects a plan that changes a calorie target by more than 150 kcal, or changes `kcal` less than 14 days after the last applied calorie change (measured to the later of the file's `generatedAt` and today). The `Meal Plan` tab's `Meta` rows give the date of the last change and when the lockout ends. During the lockout, leave `kcal` as it is; carbs, fat and menu changes are still allowed.
  - The app rejects any change to protein.
- Flags (can fire any time, independent of lockout):
  - 7-day trend gaining > 0.5 lb/week -> flag: trim calories.
  - 7-day trend gaining < 0.1 lb/week for 2 weeks -> flag: add calories.
  - A flag during the lockout goes in the plan's `note`; it does not become a calorie change until the lockout ends.
- Calorie changes are proposals for approval; they are not auto-applied. Every `meals` change needs the user's approval, whatever the file's tag says.

## 4. Cardio

### Ceilings
| Item | Ceiling | Enforced by the app |
|---|---|---|
| HIIT rounds per session | 16 | Yes |
| HIIT sessions per week | 3-4 (push and pull days only) | Maximum 4, push and pull days only. The program starts with 2 (PUSH A, PULL A); the minimum of 3 is the agent's job. |
| Zone 2 session length | 60 min | Yes |
| Zone 2 heart rate zone | 136-148 BPM | Yes: `hrLow`/`hrHigh` must sit inside it |

### HIIT tracking (fields on the cardio exercise record)
Existing: `machine`, `rounds`, `duration`, `hr`, `maxhr`.
Added: `workSec`, `restSec`, `avgWatts` (primary output metric), `hrRec60` (optional).

Comparison rule: only compare output within the same `machine` and the same `workSec:restSec` protocol. A change of machine or protocol resets the baseline.

### HIIT progression
1. Hold protocol and round count; raise `avgWatts`.
2. When the target wattage is hit at the current round count, with `maxhr` and `hrRec60` in their normal range, add 1-2 rounds.
3. At the 16-round cap, raise the wattage target instead of adding rounds.
4. If `avgWatts` falls two sessions in a row, do not add rounds; check readiness before changing anything else.

### Zone 2 progression
1. Add 5 min every 1-2 weeks until 60 min.
2. After 60 min, progress by raising incline or speed while HR stays in 136-148 BPM.
3. A 5-10% output rise at the same HR counts as improvement.

### Adding a HIIT day
To reach 3-4 HIIT sessions, the agent may switch a push or pull Zone 2 session (PUSH B, PULL B) to HIIT, or back. Send a `cardio` entry whose `type` differs from the program's. The switch is its own change and always needs the user's approval. Legs sessions stay Zone 2.

### Cardio and calories (proposal only)
Extra cardio minutes beyond the prior week are added to the day's kcal target as a flagged proposal. It does not bypass the 2-week lockout and is subject to the same approval step.

## 5. Inputs

The agent reads the "Training Calendar" Sheet in the "Training Calendar Data" folder. It is refreshed after every submit.

| Tab | Use |
|---|---|
| `Workouts` | Sets, weights, reps, cardio fields (stalls, double progression, HIIT output). |
| `Body` | Bodyweight for the 7-day average. |
| `Meals` | What was eaten against the targets. |
| `Fatigue` | Readiness check-ins for the pull-forward rule. |
| `Program` | The current program: exact exercise names, muscle groups, patterns, ranges, current `targetLb`, cardio prescriptions, deload weeks. |
| `Meal Plan` | Current targets, menus, foods and per-100 g macros, last calorie change and lockout end. |
| `Plan` | Where the agent writes the plan (output only; never read it as data). |

Use the names, food ids and patterns exactly as they appear in the `Program` and `Meal Plan` tabs.

## 6. Output contract

The agent writes the plan JSON into the **`Plan` tab** of the Sheet: clear `Plan!A:A`, then write the text from `Plan!A1` down column A in chunks of at most 40,000 characters per row (details in PLAN_SCHEMA.md). Do not create a new `next-week-plan.json` (the app cannot see files it did not create, and the Drive connector cannot overwrite one). Write a new `generatedAt` every time. The app shows a badge when `generatedAt` is newer than the last applied plan.

Sections: `lifting`, `core`, `cardio`, `meals`, `deload`, `changeLog`, `approvals`. Full definitions, the paths used in `changeLog.refs`, and a complete example are in [PLAN_SCHEMA.md](PLAN_SCHEMA.md).

- Every change needs a `changeLog` entry with a `reason` (and `evidence` where there are numbers). A change with no entry rejects the whole file.
- `tag: "auto"`: pre-accepted, can still be rejected: load increases, core target bumps, cardio progression, stall swaps.
- `tag: "approval"`: starts unaccepted: anything you want confirmed. Each one also needs an `approvals` item with the question for the user.
- The app always requires approval for: every meal change, deload pull-forwards, switching a cardio session between HIIT and Zone 2, and adding or removing an exercise outside a stall swap.
- `cardio` entries are exactly:

```json
{ "date": "YYYY-MM-DD", "session": "PUSH A", "type": "hiit", "machine": "Rower", "rounds": 10, "workSec": 30, "restSec": 60, "targetAvgWatts": 210 }
```
```json
{ "date": "YYYY-MM-DD", "session": "LEGS A", "type": "zone2", "durationMin": 40, "hrLow": 136, "hrHigh": 148 }
```

## 7. What the app enforces and what stays with the agent

The app rejects the file, with a list of what is wrong, if any of these fail:

- unknown fields anywhere, or a change with no `changeLog` reason;
- HIIT rounds over 16, more than 4 HIIT sessions a week, Zone 2 over 60 minutes, Zone 2 HR outside 136-148;
- any protein change, a calorie change over 150 kcal per target, or a calorie change inside the 2-week lockout;
- a stall swap that is not one-out-one-in, has no 3-session stall in the log, or changes muscle group or movement pattern, or a second swap in the same session;
- a program that would not be valid after the change.

These stay with the agent:

- the 7-day weight trend and the calorie flags;
- the pull-forward deload conditions (the app only requires the evidence text);
- HIIT progression (watts, rounds, readiness) and Zone 2 progression;
- keeping at least 3 HIIT sessions a week, and a sensible week of cardio overall;
- choosing replacement exercises that make sense beyond muscle group and pattern.

## 8. Daily run

0. Find today's entries: `Workouts` rows dated today (sets, the `Notes` column and the `Machine` column), today's `Fatigue` check-in, and today's `Body` weigh-in. If nothing was logged today (a rest day, or nothing submitted yet), make no plan and write no note.
   - A row with `Workout Skipped` = Yes means the whole workout was skipped on purpose (`Skip Reason` says why). It is not a performed session: it never counts toward a stall or double progression, and a reason such as "Sick or injured" is a readiness signal.
   - Read the notes. They say what was different: pain, fatigue, time pressure, and especially **which machine or cable stack was used**. The same exercise on a different machine (for example a Precor cable stack for the baseline lateral raises, a Life Fitness one today) is not comparable pound for pound. Until the app records machines for lifts, compare loads only between sessions on the same machine, and say in the changeLog evidence when a session was on a different machine.
1. Read the Sheet tabs. Note the last calorie change and lockout end, and the program's Day 1 date (`Program` tab, `Meta` row "start date (Day 1, PUSH A)"). Set the plan's `weekStart` to tomorrow: the first day the changes apply. Changes to an exercise take effect the next time its session comes round.
2. Check deload triggers (readiness and missed rep targets). If both fire, write `deload` and its `changeLog` entry.
3. For each lifting exercise: double progression -> `targetLb`; 3-session stall -> a swap.
4. Cardio: HIIT and Zone 2 progression within the ceilings.
5. Calories: compute the 7-day average trend; if a calorie change is allowed (outside the lockout), propose +/-100-150 kcal with protein unchanged, tagged for approval; otherwise put any flag in `note`.
6. Write `changeLog` (a reason for every change) and `approvals`, set a new `generatedAt`, and write the JSON into the Sheet's `Plan` tab. Write the readable note beside it.
7. Most days only today's exercises change. Calorie changes still follow the 14-day lockout, so a daily run usually leaves calories alone.

## 9. Open items

- Where the agent runs (currently a Claude scheduled task with the Google Drive and Sheets connectors).
- Whether the readable "what changed and why" note should be a Doc or a Markdown file, and its name.
- Minimum HIIT sessions (3) is not enforced by the app; revisit once the first weeks of real data are in.
