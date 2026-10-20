# Program schema (`config/program`)

The lifting program lives in one document, `config/program`, in the same sync store as workouts, body and meals. The app renders every lifting, core and cardio plan from it. It is seeded from the built-in program (`ProgramLib.BUILTIN` in `docs/program.js`), and the built-in program stays as the fallback.

## How the app uses it

The training agent's weekly proposals (see [PLAN_SCHEMA.md](PLAN_SCHEMA.md)) change this document: accepting changes in the review screen writes a new version with `source: "agent"`.

- If `config/program` exists **and passes validation**, the app uses it. Otherwise it uses the built-in program. An invalid document is ignored (the Data & sync card says so) and the last good program stays in place.
- The first time a device finishes a real sync and finds no `config/program`, it writes the built-in program there. Until then, and when you are not connected, the built-in program is used.
- Phase and deload changes still apply on top of this document for each date: the document is the **Phase 1 (Reclaim) base** plan. Extra sets, wave loading, rest-pause, supersets and deload cuts are computed from it.
- Deloads follow the training agent spec: every 5th working week (weeks 5, 10, 15, 20, 25). A deload week cuts lifting sets, HIIT rounds and Zone 2 time by 40% at the same weights. A pull-forward week listed in `deloadWeeks` is also a deload week, and the count restarts there: a pull-forward in week 8 makes weeks 13, 18 and 23 the next deloads.
- Every workout and draft records the program that built it in its `ver` field, as `<plan code>:<program tag>`. The program tag is the source's first letter plus the version, for example `b1` (built-in v1), `a3` (agent v3) or `m2` (manual v2). **Bump `version` whenever you change the document**, so untouched drafts rebuild and records say which version produced them.
- `config/program` is included in the JSON backup and restored on import. A backup made when no program has been stored includes the built-in program with `u: 0`, so any real edit wins over it. A program in a backup that fails validation is skipped and the rest of the backup still imports.
- **Data & sync → Use built-in program** replaces the document with the built-in program at the next version number.

## Document

| Field | Type | Notes |
|---|---|---|
| `version` | whole number ≥ 1 | Increase on every change. |
| `source` | `"built-in"`, `"agent"` or `"manual"` | Who wrote this version. |
| `sessions` | object | Exactly the six keys `PUSH A`, `PULL A`, `LEGS A`, `PUSH B`, `PULL B`, `LEGS B`. Each is `{ "exercises": [ … ] }`, in the order they are done. |
| `core.circuits` | object | Circuits `A`, `B` and `C`. Each is `{ "sessions": [...], "exercises": [...] }`. Every session is in exactly one circuit. |
| `cardio.sessions` | object | One prescription for each of the six sessions. |
| `deloadWeeks` | list of dates (optional) | First day of each pull-forward deload week, `YYYY-MM-DD`. Those weeks are deload weeks, and the 5-week count restarts after each one (see below). |

### Exercise (`sessions[...].exercises[]`)

| Field | Type | Notes |
|---|---|---|
| `name` | text | Required. Progress history is keyed by name, so keep names stable. |
| `muscleGroup` | list of 1–2 texts | Primary group first, for example `["Chest"]` or `["Quads", "Glutes"]`. The secondary group counts half a set on the Progress muscle chart. |
| `sets` | whole number 1–20 | Working sets. |
| `reps` | `{ "low", "high" }` | Rep range, low ≤ high. A single target uses the same number for both. |
| `perSide` | `"arm"` or `"leg"` (optional) | Shows the range as per arm or per leg, for example `12–15/arm`. |
| `rir` | `{ "low", "high" }` | Reps-in-reserve target, 0–10. |
| `restSec` | seconds, or `{ "low", "high" }` | Rest between sets. `{ "low": 120, "high": 180 }` shows as `2–3 min`; `{ "low": 60, "high": 90 }` as `60–90 sec`. |
| `progression` | `"upper"` or `"lower"` | The double-progression step once every set reaches the top of the range: `upper` adds 5 lb, `lower` adds 10 lb. |
| `methods` | list of texts (optional) | Method tags such as `"Drop Set"` or `"Tempo"`. When present they are shown in place of the RIR label. |
| `role` | `"compound"`, `"primary"`, `"secondary"` or `"isolation"` (optional, default compound) | Drives the phase rules: the first two compounds get an extra set in Phases 2–3, isolation work gets rest-pause in Phase 3, `primary` lifts get waves in Phase 3 on strength days. |
| `cue` | text (optional) | Coaching cue shown under the exercise. |
| `targetLb` | number (optional) | A target load written by the training agent. It is shown after the cue as "Target load: N lb"; the app still works out the next load from your logged sets. |

### Core circuit (`core.circuits.A|B|C`)

`sessions`: the sessions that use this circuit. `exercises[]`: `{ "name", "sets", "target" }`, where `target` is text such as `"15 reps"`, `"12/side"` or `"45 sec"`.

### Cardio (`cardio.sessions[session]`)

Common: `type` (`"HIIT"` or `"Zone 2"`), `machine` (the recommended machine), `alternatives` (optional list; defaults to the other machines).

| HIIT field | Type | Notes |
|---|---|---|
| `rounds` | whole number 1–40 | Starting round count. The app warns above 16. |
| `workSec` | seconds | Work interval. |
| `restSec` | seconds | Rest interval. |
| `targetAvgWatts` | number or `null` | Optional target, shown on the plan and compared on the Progress watts chart. |

| Zone 2 field | Type | Notes |
|---|---|---|
| `durationMin` | whole number 5–240 | The app warns above 60. |
| `hrLow`, `hrHigh` | bpm | The heart-rate band. The app uses the first Zone 2 session's band for the Progress chart. |

## Full example

This is the complete built-in program. `scripts/verify-program.js` checks that it stays identical to `ProgramLib.BUILTIN`.

<!-- example:start -->
```json
{
  "version": 1,
  "source": "built-in",
  "sessions": {
    "PUSH A": { "exercises": [
      {"name":"Incline DB Press","muscleGroup":["Chest"],"role":"compound","sets":4,"reps":{"low":10,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"30–45° bench, 3 sec eccentric, 1 sec squeeze"},
      {"name":"Cable Lateral Raise","muscleGroup":["Shoulders"],"role":"isolation","sets":4,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","methods":["Drop Set"],"cue":"Lead with the elbow; drop set (−30%) on the last set"},
      {"name":"Pec Deck / Cable Fly","muscleGroup":["Chest"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Full stretch, 1 sec peak squeeze"},
      {"name":"Machine Shoulder Press","muscleGroup":["Shoulders"],"role":"compound","sets":3,"reps":{"low":12,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"3 sec eccentric, no shrug"},
      {"name":"Overhead Cable Extension","muscleGroup":["Triceps"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Cable overhead extension: full stretch, elbows in"},
      {"name":"Tricep Pushdown","muscleGroup":["Triceps"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Rope; flare the handles at the bottom"},
      {"name":"Face Pulls","muscleGroup":["Shoulders"],"role":"isolation","sets":2,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Rope to forehead, external rotation"}
    ] },
    "PULL A": { "exercises": [
      {"name":"Lat Pulldown","muscleGroup":["Back"],"role":"compound","sets":4,"reps":{"low":10,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Wide overhand grip; full stretch at the top, pull to upper chest"},
      {"name":"Seated Cable Row","muscleGroup":["Back"],"role":"compound","sets":4,"reps":{"low":12,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Wide grip, elbows flared, squeeze the scapulae"},
      {"name":"Single-Arm DB Row","muscleGroup":["Back"],"role":"compound","sets":3,"reps":{"low":12,"high":15},"perSide":"arm","rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Full reach at the bottom, row to the hip"},
      {"name":"Cable Rear Delt Fly","muscleGroup":["Shoulders"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Single arm at head height, wide arc"},
      {"name":"Face Pulls","muscleGroup":["Shoulders"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Two days a week minimum"},
      {"name":"Incline DB Curl","muscleGroup":["Biceps"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Full stretch, supinate at the top"},
      {"name":"Cable Curl","muscleGroup":["Biceps"],"role":"isolation","sets":3,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"upper","cue":"Supinated grip, full ROM, 3 sec eccentric"}
    ] },
    "LEGS A": { "exercises": [
      {"name":"Leg Press","muscleGroup":["Quads","Glutes"],"role":"compound","sets":4,"reps":{"low":12,"high":15},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Mid-platform, full ROM, controlled descent"},
      {"name":"Romanian Deadlift","muscleGroup":["Back","Hamstrings"],"role":"compound","sets":3,"reps":{"low":10,"high":12},"rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Hips back, 3 sec eccentric"},
      {"name":"Walking Lunges","muscleGroup":["Quads","Glutes"],"role":"compound","sets":3,"reps":{"low":15,"high":15},"perSide":"leg","rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Hold dumbbells; long stride, stay upright"},
      {"name":"Leg Curl","muscleGroup":["Hamstrings"],"role":"isolation","sets":4,"reps":{"low":12,"high":15},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Seated; 1 sec peak, 3 sec eccentric"},
      {"name":"Bulgarian Split Squat","muscleGroup":["Quads","Glutes"],"role":"compound","sets":3,"reps":{"low":10,"high":12},"perSide":"leg","rir":{"low":1,"high":2},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Hold dumbbells; shin vertical, full depth"},
      {"name":"Standing Calf Raise","muscleGroup":["Calves"],"role":"isolation","sets":4,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Pause 1 sec at the top and bottom"},
      {"name":"Seated Calf Raise","muscleGroup":["Calves"],"role":"isolation","sets":3,"reps":{"low":15,"high":20},"rir":{"low":0,"high":1},"restSec":{"low":60,"high":90},"progression":"lower","cue":"Full stretch, soleus emphasis"}
    ] },
    "PUSH B": { "exercises": [
      {"name":"Barbell Bench Press","muscleGroup":["Chest","Triceps"],"role":"primary","sets":5,"reps":{"low":3,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Full ROM, bar to chest"},
      {"name":"Standing OHP","muscleGroup":["Shoulders"],"role":"primary","sets":4,"reps":{"low":4,"high":6},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Strict, no leg drive"},
      {"name":"Weighted Dips","muscleGroup":["Chest","Triceps"],"role":"secondary","sets":3,"reps":{"low":5,"high":6},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Forward lean"},
      {"name":"Skull Crushers","muscleGroup":["Triceps"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"EZ bar to the forehead, elbows in"},
      {"name":"DB Shoulder Press","muscleGroup":["Shoulders"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Neutral grip is fine"}
    ] },
    "PULL B": { "exercises": [
      {"name":"Conventional Deadlift","muscleGroup":["Back","Hamstrings"],"role":"primary","sets":4,"reps":{"low":3,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"lower","cue":"Brace hard, bar stays on the legs"},
      {"name":"Barbell Bent-Over Row","muscleGroup":["Back"],"role":"primary","sets":4,"reps":{"low":4,"high":6},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Overhand grip, 45° torso, 2 sec eccentric"},
      {"name":"Weighted Pull-Ups","muscleGroup":["Back"],"role":"primary","sets":4,"reps":{"low":4,"high":6},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Dead hang, full extension"},
      {"name":"Barbell Curl","muscleGroup":["Biceps"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Strict, 2 sec eccentric"},
      {"name":"Alternating Hammer Curl","muscleGroup":["Biceps"],"role":"secondary","sets":3,"reps":{"low":8,"high":10},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"upper","cue":"Neutral grip, full ROM"}
    ] },
    "LEGS B": { "exercises": [
      {"name":"Back Squat","muscleGroup":["Quads","Glutes"],"role":"primary","sets":5,"reps":{"low":3,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"lower","cue":"High bar, break parallel"},
      {"name":"Front Squat","muscleGroup":["Quads"],"role":"primary","sets":3,"reps":{"low":4,"high":5},"rir":{"low":1,"high":1},"restSec":{"low":120,"high":180},"progression":"lower","cue":"Elbows high, stay upright (goblet squat if needed)"},
      {"name":"Hip Thrust","muscleGroup":["Glutes"],"role":"secondary","sets":4,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"lower","cue":"Barbell; 1 sec squeeze at the top"},
      {"name":"Lying Leg Curl","muscleGroup":["Hamstrings"],"role":"secondary","sets":3,"reps":{"low":6,"high":8},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"lower","cue":"3–4 sec eccentric"},
      {"name":"Deficit RDL","muscleGroup":["Hamstrings","Glutes"],"role":"secondary","sets":3,"reps":{"low":5,"high":6},"rir":{"low":2,"high":2},"restSec":{"low":120,"high":180},"progression":"lower","cue":"2 in. deficit, deep hinge"}
    ] }
  },
  "core": { "circuits": {
    "A": { "sessions": ["PUSH A","PUSH B"], "exercises": [
      {"name":"Cable Crunch","sets":3,"target":"15 reps"},
      {"name":"Hanging Leg Raise","sets":3,"target":"15 reps"},
      {"name":"Serratus Punch (cable)","sets":3,"target":"15/side"},
      {"name":"Plank w/ Shoulder Tap","sets":3,"target":"12/side"}
    ] },
    "B": { "sessions": ["PULL A","PULL B"], "exercises": [
      {"name":"Landmine Rotation","sets":3,"target":"12/side"},
      {"name":"Cable Woodchop","sets":3,"target":"12/side"},
      {"name":"Side Plank w/ Hip Dip","sets":3,"target":"10/side"},
      {"name":"Pallof Press","sets":3,"target":"12 reps"}
    ] },
    "C": { "sessions": ["LEGS A","LEGS B"], "exercises": [
      {"name":"Hanging Tuck-to-Straight Leg Raise","sets":3,"target":"12 reps"},
      {"name":"Ab Wheel","sets":3,"target":"12 reps"},
      {"name":"Dead Bug","sets":3,"target":"10/side"},
      {"name":"Dragon Flag Negative","sets":3,"target":"5 reps"}
    ] }
  } },
  "cardio": { "sessions": {
    "PUSH A": {"type":"HIIT","machine":"Rower","alternatives":["Treadmill","Stationary Bike","Stair Master"],"rounds":10,"workSec":30,"restSec":30,"targetAvgWatts":null},
    "PULL A": {"type":"HIIT","machine":"Treadmill","alternatives":["Rower","Stationary Bike","Stair Master"],"rounds":10,"workSec":40,"restSec":20,"targetAvgWatts":null},
    "LEGS A": {"type":"Zone 2","machine":"Stationary Bike","alternatives":["Treadmill","Rower","Stair Master"],"durationMin":30,"hrLow":136,"hrHigh":148},
    "PUSH B": {"type":"Zone 2","machine":"Treadmill","alternatives":["Stationary Bike","Rower","Stair Master"],"durationMin":25,"hrLow":136,"hrHigh":148},
    "PULL B": {"type":"Zone 2","machine":"Treadmill","alternatives":["Stationary Bike","Rower","Stair Master"],"durationMin":25,"hrLow":136,"hrHigh":148},
    "LEGS B": {"type":"Zone 2","machine":"Stationary Bike","alternatives":["Treadmill","Rower","Stair Master"],"durationMin":25,"hrLow":136,"hrHigh":148}
  } }
}
```
<!-- example:end -->
