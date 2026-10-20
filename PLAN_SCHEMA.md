# Plan file schema (`next-week-plan.json`)

The training agent writes one file, `next-week-plan.json`, to the **Training Calendar Data** folder in Google Drive (with a readable "what changed and why" note beside it). The app reads it, validates it, and shows every change for you to accept or reject. Nothing is applied until you tap Apply.

This is the output contract described in section 5 of `training-agent-spec.md`, with the `lifting`, `core`, `meals`, `changeLog` and `approvals` sections filled in. The `cardio` entries are exactly the shapes in the spec.

Keep editing **the same file** rather than creating a new one: the app created it, and with the narrow `drive.file` permission it can only see files it created.

## What the app does with it

1. **New-proposal badge.** The app reads the file when it opens, when you come back to the tab, and when you tap **Check for proposed plan**. If `generatedAt` is later than the `generatedAt` of every plan you have already applied, a **New** badge appears on the History tab and a banner offers **Review**.
2. **Validation first.** The whole file is checked before anything is shown. An unknown field, a value outside the limits below, or a change with no reason rejects the file with a list of what is wrong. Nothing is changed.
3. **Review screen.** Changes are grouped Lifting, Core, Cardio, Meals. Each shows the old value, the new value and the `reason` from `changeLog`, with **Accept** and **Reject**. Changes tagged `auto` start accepted (this includes stall swaps, which the agent makes on its own); changes tagged `approval` start unaccepted. Every decision can be changed before you apply.
4. **Apply.** Accepted lifting, core and cardio changes are written to `config/program` (new `version`, `source: "agent"`; see [PROGRAM_SCHEMA.md](PROGRAM_SCHEMA.md)). Accepted meal changes are written to `config/plan`. A record of what was accepted and rejected is written to the `applied-plans` collection. The newest applied plan can be **undone** from the Applied plans list, which restores the program and meal plan as they were before it.

## What the agent can read

The "Training Calendar" Sheet in the same folder is updated after every submit. Read it before writing a plan:

| Tab | Contents |
|---|---|
| `Workouts`, `Body`, `Meals`, `Fatigue` | The same columns as the CSV exports: sets, weights and reps, body weight, meals eaten, readiness check-ins. |
| `Program` | The current `config/program`. One row per lifting exercise (session, order, name, muscle group, pattern, sets, rep and RIR ranges, rest, progression, role, methods, target lb, cue), per core exercise (by circuit) and per cardio session, plus `Meta` rows for the version, source, pull-forward deload weeks and the scheduled deload weeks. Use these exact names and patterns in the plan file. |
| `Meal Plan` | The current `config/plan`: the training and rest day targets, each menu with its items and grams, every food with its per-100 g macros, and `Meta` rows for the date of the last calorie change and when the 14-day lockout ends. |

## Top level

| Field | Type | Notes |
|---|---|---|
| `schema` | `"training-calendar-next-week-plan"` | Required. |
| `version` | `1` | Required. |
| `generatedAt` | ISO date-time | Required. Used to tell whether this plan is newer than the last one applied. Write a new value every time the agent produces a new plan. |
| `weekStart` | `YYYY-MM-DD` | Required. First day of the week the plan is for. Cardio dates must fall within the 7 days from here. |
| `basedOnProgramVersion` | whole number (optional) | The `config/program` version the agent read. |
| `note` | text, up to 2000 (optional) | Summary shown at the top of the review. |
| `deload` | object (optional) | A pull-forward deload. See below. |
| `lifting` | object (optional) | Per-session exercise lists. |
| `core` | object (optional) | Per-circuit exercise lists. |
| `cardio` | list (optional) | One entry per session. |
| `meals` | object (optional) | Calorie and macro targets and menus. |
| `changeLog` | list | Required. One entry for every change, with the reason. |
| `approvals` | list (optional) | One item for every `changeLog` entry tagged `approval`. |

Any other field is an error. At least one of `lifting`, `core`, `cardio`, `meals` or `deload` is required.

## `lifting`

An object keyed by session (`PUSH A`, `PULL A`, `LEGS A`, `PUSH B`, `PULL B`, `LEGS B`). Each value is the **complete ordered exercise list** for that session. An exercise left out of the list is removed; an exercise whose name is new is added; a different order is a reorder. Sessions you do not list are untouched. 1 to 12 exercises per session, names unique within the session.

For an exercise that is already in the program, send `name` plus only the fields that change. Everything else is kept.

| Field | Type | Notes |
|---|---|---|
| `name` | text, up to 60 | Required. Matched to the program ignoring case. |
| `sets` | whole number 1–20 | |
| `reps` | `{ "low", "high" }` | Rep range, low ≤ high. |
| `perSide` | `"arm"` or `"leg"` | |
| `rir` | `{ "low", "high" }` | Reps in reserve, 0–10. |
| `restSec` | seconds, or `{ "low", "high" }` | |
| `progression` | `"upper"` or `"lower"` | The +5 lb or +10 lb step. |
| `methods` | list of text | Method tags such as `"Drop Set"`. `[]` clears them. |
| `role` | `"compound"`, `"primary"`, `"secondary"`, `"isolation"` | |
| `cue` | text | |
| `targetLb` | number | The target load for the coming week. The app uses it in place of its own computed weight for that exercise until you log that weight or more, after which its normal progression takes over. Deload weeks keep the weights you last used. |
| `muscleGroup` | list of 1–2 text | |
| `pattern` | text | Movement pattern (see [PROGRAM_SCHEMA.md](PROGRAM_SCHEMA.md)). Required on the new exercise in a stall swap. |

A **new** exercise must send `name`, `muscleGroup`, `sets`, `reps`, `rir`, `restSec` and `progression`. The result must still be a valid program (the same checks as [PROGRAM_SCHEMA.md](PROGRAM_SCHEMA.md)).

## `core`

An object keyed by circuit letter (`A`, `B`, `C`; A is the push-day circuit, B pull, C legs). Each value is the complete ordered list for that circuit, 1 to 8 items of `{ "name", "sets", "target" }`. `sets` is a whole number 1–8 and `target` is text with a number, such as `"15 reps"`, `"12/side"` or `"45 sec"`.

## `cardio`

A list with at most one entry per session. Only the fields that are in the program are changed; the `date` says which day this week the session falls on.

HIIT (push and pull days only):

| Field | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | Required, inside the week. |
| `session` | session name | Required. |
| `type` | `"hiit"` | A push or pull session that is currently Zone 2 can switch to HIIT. The switch is a separate change that always needs your approval. |
| `machine` | text (optional) | Changing machine or the work:rest protocol resets the Progress watts baseline. |
| `rounds` | whole number | Required. **At most 16.** |
| `workSec` | whole number | Required. 5–600. |
| `restSec` | whole number | Required. 0–600. |
| `targetAvgWatts` | number | Required. Above 0. |

Zone 2:

| Field | Type | Notes |
|---|---|---|
| `date`, `session`, `machine` | | As above. |
| `type` | `"zone2"` | A push or pull session that is currently HIIT can switch to Zone 2 (needs approval). Legs sessions cannot switch. |
| `durationMin` | whole number | Required. **At most 60.** |
| `hrLow`, `hrHigh` | whole numbers | Required. Inside the **136–148 bpm** band, `hrLow` ≤ `hrHigh`. |

## `meals`

| Field | Type | Notes |
|---|---|---|
| `targets` | `{ "training": {...}, "rest": {...} }` | Each day type may carry any of `kcal`, `p`, `f`, `c` (the full new value). |
| `menus` | object keyed by menu letter | Each is the complete menu: `{ "name", "items": [{ "food", "slot", "train", "rest" }] }`. `food` must be an existing food id, `slot` is Breakfast, Lunch, Snack or Dinner, and `train` and `rest` are grams for that day type. Menus you do not list are untouched. |

Limits checked against the current plan:

- **Protein is never changed.** `p` must equal the current value, or be left out.
- **Each calorie target may move by at most 150 kcal** from its current value.
- **2-week lockout.** A `kcal` change is rejected if a calorie target change was applied less than 14 days before `generatedAt` (a plan where you rejected the calorie change, or that you undid, does not count). The error says when the lockout ends. Carbs, fat and menu changes are still allowed during the lockout; leave `kcal` unchanged or out of the file.

Every meal change needs your approval (see below), whatever the file's tag says.

## `deload`

`{ "weekStart": "YYYY-MM-DD", "evidence": "..." }`. Asks to treat that week as an extra deload week (lifting sets −40% at the same weights, HIIT rounds −40%, Zone 2 time −40%). `evidence` is required: the readiness check-ins and the missed rep targets that triggered it. It is always an approval item and needs a `changeLog` entry with ref `lifting/deload` and `kind: "deload-pull-forward"`. Accepting it adds the week to `deloadWeeks` in `config/program`.

## `changeLog`

One entry for every change. A change with no entry rejects the file ("has no reason"), so the review screen never shows an unexplained change.

| Field | Type | Notes |
|---|---|---|
| `id` | short text | Required, unique. Referenced from `approvals`. |
| `area` | `"lifting"`, `"core"`, `"cardio"`, `"meals"` | Required. |
| `tag` | `"auto"` or `"approval"` | Required. `auto`: pre-accepted, can be rejected. `approval`: starts unaccepted. |
| `kind` | one of `progression`, `stall-swap`, `volume`, `deload-pull-forward`, `cardio-progression`, `calories`, `macros`, `readiness`, `other` (optional) | |
| `refs` | list of paths | Required. The changes this entry explains. See below. |
| `reason` | text, up to 600 | Required. Shown on every change it covers. |
| `evidence` | text, up to 600 (optional) | The numbers behind it, shown under the reason. |

### Paths in `refs`

A path covers the change with exactly that path and every change below it. When more than one entry matches a change, the longest path wins, so you can give one reason for a whole session and a more specific reason for one field.

| Change | Path |
|---|---|
| A field of an exercise | `lifting/PUSH A/Incline DB Press/sets`, `.../reps`, `.../targetLb`, ... |
| A whole exercise (added or removed) | `lifting/PUSH A/Cable Crossover` |
| Exercise order | `lifting/PUSH A/order` |
| Core | `core/A/Cable Crunch/target`, `core/A/Cable Crunch`, `core/A/order` |
| Cardio field | `cardio/PUSH A/rounds`, `cardio/LEGS A/durationMin`; `cardio/PUSH A` covers all of them |
| Meal target | `meals/targets/training/kcal`; `meals/targets` or `meals` covers all targets |
| Menu | `meals/menus/A` (add or all of the menu), `meals/menus/A/name`, `meals/menus/A/Lunch/rice` (add or remove), `meals/menus/A/Lunch/rice/train` |
| Deload | `lifting/deload` |

Every path starts with the entry's `area`.

## `approvals`

A list of `{ "changeId", "question" }`. `changeId` is the `id` of a `changeLog` entry tagged `approval`; `question` is what you are being asked, shown at the top of the review. Every `approval`-tagged entry needs exactly one item here, and an item can only point at an `approval` entry.

### What needs approval

Entries the agent tags `approval` start unaccepted. In addition, the app **always** treats these as needing approval, even if the file tags them `auto` (the review shows a note when it overrides the tag):

- every meal change (calories, macros, menus),
- a deload pull-forward,
- adding or removing an exercise that is not part of a stall swap,
- switching a cardio session between HIIT and Zone 2.

`auto` is for changes such as load increases, core target bumps, cardio progression and **stall swaps**. Switching a cardio session between HIIT and Zone 2 always needs approval. A stall swap is an entry with `kind: "stall-swap"` that covers one removed exercise and one added exercise in the same session. It is pre-accepted, and the two halves always go together: rejecting either one rejects both. The agent may still tag a swap `approval` when it wants you to confirm it first.

## Limits that reject the file

| Check | Rule |
|---|---|
| Unknown fields | Any field not listed above, anywhere in the file. |
| HIIT rounds | At most 16, and HIIT only on push and pull sessions. |
| Zone 2 duration | At most 60 minutes, with `hrLow`/`hrHigh` inside 136–148 bpm. |
| Protein | Must not change. |
| Calories | A change of at most 150 kcal per target (training and rest are separate targets), and not within 14 days of the last applied calorie change. |
| Stall swaps | One exercise out and one in, at most one swap per session per week. The new exercise must have the same first `muscleGroup` and the same `pattern` as the one it replaces. Your logs must show the removed exercise missing the top of its rep range (every set) in each of its last 3 logged sessions. |
| HIIT sessions | At most 4 HIIT sessions a week after the change. |
| Reasons | Every change needs a `changeLog` entry. |
| Approvals | Every `approval` entry needs a matching `approvals` item. |
| Program | The lifting, core and cardio after the change must pass the program checks. |

The app does **not** check that you have 3 to 4 HIIT sessions (the built-in program has 2; the agent can switch a push or pull Zone 2 day to HIIT with your approval), or that the rest of the week's cardio is sensible. Those rules stay with the agent. Every calorie change still needs your approval before it happens, and every swap can be rejected in the review or undone afterwards.

## `applied-plans` records

Applying writes one document per plan to the `applied-plans` collection, keyed by `generatedAt` with punctuation removed (for example `p20261102T200000Z`). It is also what the new-proposal check compares against. Rejecting everything still records the plan, so it does not come back as new.

```json
{
  "id": "p20261102T200000Z",
  "generatedAt": "2026-11-02T20:00:00Z",
  "weekStart": "2026-11-03",
  "appliedAt": "2026-11-03T12:00:00.000Z",
  "note": "Week 3. ...",
  "programVersion": 2,
  "accepted": [
    { "id": "lifting/PUSH A/Incline DB Press/targetLb", "group": "lifting", "section": "PUSH A", "kind": "change", "label": "Incline DB Press: Target load", "from": "(none)", "to": "55 lb", "tag": "auto", "forced": false, "swap": false, "reason": "Hit 15 reps on all 4 sets last session. ...", "logId": "c1" }
  ],
  "rejected": [
    { "id": "meals/targets/training/kcal", "group": "meals", "section": "Meal plan targets", "kind": "change", "label": "Training day calories", "from": "2500 kcal", "to": "2600 kcal", "tag": "approval", "forced": false, "swap": false, "reason": "7-day average weight is up 0.06 lb/week, ...", "logId": "c7" }
  ]
}
```

`programVersion` is the new `config/program` version, or `null` when no lifting, core or cardio change was accepted. `before` holds the program and/or meal plan as they were before the plan was applied (only the documents that changed), and is what **Undo** restores; it is removed once the plan is undone and `undoneAt` is set.

## Full example

Against the built-in program and the sample meal plan. `scripts/verify-proposal.js` checks this block is identical to `docs/examples/next-week-plan.example.json` and that it validates. The swap in it only validates against a workout log where Pec Deck / Cable Fly missed 15 reps on every set in its last 3 sessions, so pasting it into the app with no such history shows that error.

<!-- example:start -->
```json
{
  "schema": "training-calendar-next-week-plan",
  "version": 1,
  "generatedAt": "2026-11-02T20:00:00Z",
  "weekStart": "2026-11-03",
  "basedOnProgramVersion": 1,
  "note": "Week 3. Loads up where the top of the range was hit, one stalled movement swapped automatically, a little more cardio, and +100 kcal on training days because the 7-day trend is under 0.1 lb/week.",
  "lifting": {
    "PUSH A": [
      { "name": "Incline DB Press", "targetLb": 55 },
      { "name": "Cable Lateral Raise" },
      { "name": "Cable Crossover", "muscleGroup": ["Chest"], "pattern": "fly", "sets": 3, "reps": { "low": 12, "high": 15 }, "rir": { "low": 0, "high": 1 }, "restSec": { "low": 60, "high": 90 }, "progression": "upper", "role": "isolation", "cue": "Low-to-high path, 1 sec squeeze" },
      { "name": "Machine Shoulder Press" },
      { "name": "Overhead Cable Extension" },
      { "name": "Tricep Pushdown" },
      { "name": "Face Pulls" }
    ],
    "LEGS A": [
      { "name": "Leg Press", "targetLb": 360 },
      { "name": "Romanian Deadlift" },
      { "name": "Walking Lunges" },
      { "name": "Leg Curl" },
      { "name": "Bulgarian Split Squat" },
      { "name": "Standing Calf Raise" },
      { "name": "Seated Calf Raise" }
    ]
  },
  "core": {
    "A": [
      { "name": "Cable Crunch", "sets": 3, "target": "18 reps" },
      { "name": "Hanging Leg Raise", "sets": 3, "target": "15 reps" },
      { "name": "Serratus Punch (cable)", "sets": 3, "target": "15/side" },
      { "name": "Plank w/ Shoulder Tap", "sets": 3, "target": "12/side" }
    ]
  },
  "cardio": [
    { "date": "2026-11-03", "session": "PUSH A", "type": "hiit", "machine": "Rower", "rounds": 12, "workSec": 30, "restSec": 30, "targetAvgWatts": 210 },
    { "date": "2026-11-05", "session": "LEGS A", "type": "zone2", "durationMin": 35, "hrLow": 136, "hrHigh": 148 }
  ],
  "meals": {
    "targets": { "training": { "kcal": 2600, "p": 200, "f": 65, "c": 304 } },
    "menus": {
      "A": {
        "name": "Chicken & rice / Salmon & potatoes",
        "items": [
          { "food": "whey", "slot": "Breakfast", "train": 61, "rest": 61 },
          { "food": "creatine", "slot": "Breakfast", "train": 5, "rest": 5 },
          { "food": "egg", "slot": "Breakfast", "train": 150, "rest": 150 },
          { "food": "dkb", "slot": "Breakfast", "train": 90, "rest": 90 },
          { "food": "banana", "slot": "Breakfast", "train": 120, "rest": 0 },
          { "food": "chx_breast", "slot": "Lunch", "train": 165, "rest": 165 },
          { "food": "rice", "slot": "Lunch", "train": 135, "rest": 65 },
          { "food": "broccoli", "slot": "Lunch", "train": 150, "rest": 150 },
          { "food": "oliveoil", "slot": "Lunch", "train": 8, "rest": 12 },
          { "food": "greek0", "slot": "Snack", "train": 250, "rest": 250 },
          { "food": "blueberry", "slot": "Snack", "train": 100, "rest": 100 },
          { "food": "honey", "slot": "Snack", "train": 15, "rest": 0 },
          { "food": "pb", "slot": "Snack", "train": 16, "rest": 16 },
          { "food": "salmon", "slot": "Dinner", "train": 170, "rest": 170 },
          { "food": "potato", "slot": "Dinner", "train": 325, "rest": 210 },
          { "food": "greenbeans", "slot": "Dinner", "train": 150, "rest": 150 }
        ]
      }
    }
  },
  "changeLog": [
    { "id": "c1", "area": "lifting", "tag": "auto", "kind": "progression", "refs": ["lifting/PUSH A/Incline DB Press/targetLb"], "reason": "Hit 15 reps on all 4 sets last session. Double progression adds 5 lb (upper body).", "evidence": "2026-10-27: 50 lb × 15/15/15/15 at RIR 1" },
    { "id": "c2", "area": "lifting", "tag": "auto", "kind": "progression", "refs": ["lifting/LEGS A/Leg Press/targetLb"], "reason": "Hit the top of 12–15 on all 4 sets. Double progression adds 10 lb (lower body).", "evidence": "2026-10-29: 350 lb × 15/15/15/15" },
    { "id": "c3", "area": "lifting", "tag": "auto", "kind": "stall-swap", "refs": ["lifting/PUSH A/Pec Deck / Cable Fly", "lifting/PUSH A/Cable Crossover", "lifting/PUSH A/order"], "reason": "Pec Deck / Cable Fly missed the top of the rep range in 3 sessions in a row. Swapped for a movement with the same muscle group and pattern.", "evidence": "10–12 reps on 10/12, 10/13, 11/13 against a top of 15" },
    { "id": "c4", "area": "core", "tag": "auto", "kind": "progression", "refs": ["core/A/Cable Crunch/target"], "reason": "Every set reached the 15-rep target for two weeks, so the target moves up to 18." },
    { "id": "c5", "area": "cardio", "tag": "auto", "kind": "cardio-progression", "refs": ["cardio/PUSH A"], "reason": "Target 200 W was hit at 10 rounds with max HR and 60 s recovery in their normal range. Adding 2 rounds and raising the watts target.", "evidence": "2026-10-27: 204 W avg, max HR 171, HR recovery 28" },
    { "id": "c6", "area": "cardio", "tag": "auto", "kind": "cardio-progression", "refs": ["cardio/LEGS A"], "reason": "Zone 2 progression: +5 minutes, HR stayed inside 136–148.", "evidence": "2026-10-29: 30 min at 141 bpm avg" },
    { "id": "c7", "area": "meals", "tag": "approval", "kind": "calories", "refs": ["meals"], "reason": "7-day average weight is up 0.06 lb/week, under the 0.1 lb/week floor for two weeks, and there are 7 extra cardio minutes. Training-day calories +100 (carbs only), protein unchanged.", "evidence": "7-day average 174.1 → 174.2 lb" }
  ],
  "approvals": [
    { "changeId": "c7", "question": "Raise training-day calories from 2500 to 2600 kcal (carbs 280 g to 304 g)?" }
  ]
}
```
<!-- example:end -->
