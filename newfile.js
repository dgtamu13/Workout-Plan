import React, { useState, useEffect } from 'react';
import { Dumbbell, Flame, Calendar, TrendingUp, CheckCircle2, Pause, Play, RotateCcw, Utensils } from 'lucide-react';

const SPLIT = ['Pull B', 'Push A', 'Pull A', 'Legs A', 'Rest', 'Push B', 'Legs B'];
const DAYS = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

const LIFTS = {
  'Push A': [{ n: 'Barbell Bench Press', s: 4, r: '5-6' }, { n: 'Incline DB Press', s: 3, r: '8-10' }, { n: 'Overhead Press', s: 3, r: '6-8' }, { n: 'Cable Lateral Raise', s: 4, r: '12-15' }, { n: 'Tricep Rope Pushdown', s: 3, r: '10-12' }],
  'Pull A': [{ n: 'Bent-Over Row', s: 4, r: '6-8' }, { n: 'Lat Pulldown', s: 3, r: '8-10' }, { n: 'Seated Cable Row', s: 3, r: '10-12' }, { n: 'Face Pulls', s: 4, r: '15-20' }, { n: 'Incline DB Curl', s: 3, r: '10-12' }],
  'Legs A': [{ n: 'Barbell Squat', s: 4, r: '5-6' }, { n: 'Romanian Deadlift', s: 3, r: '8-10' }, { n: 'Leg Press', s: 3, r: '10-12' }, { n: 'Seated Leg Curl', s: 3, r: '12-15' }, { n: 'Calf Raise', s: 4, r: '12-15' }],
  'Push B': [{ n: 'Incline Bench', s: 4, r: '6-8' }, { n: 'DB Flat Press', s: 3, r: '8-10' }, { n: 'DB Shoulder Press', s: 3, r: '8-10' }, { n: 'Lateral Raise', s: 4, r: '12-15' }, { n: 'Skullcrushers', s: 3, r: '10-12' }],
  'Pull B': [{ n: 'Deadlift', s: 4, r: '4-5' }, { n: 'Underhand Pulldown', s: 3, r: '10-12' }, { n: 'Machine Row', s: 3, r: '10-12' }, { n: 'Face Pulls', s: 3, r: '15-20' }, { n: 'Cable Curl', s: 3, r: '10-12' }],
  'Legs B': [{ n: 'Hip Thrust', s: 4, r: '8-10' }, { n: 'Split Squat', s: 3, r: '8-10' }, { n: 'Lying Leg Curl', s: 4, r: '10-12' }, { n: 'Leg Extension', s: 3, r: '12-15' }, { n: 'Calf Raise', s: 4, r: '15-20' }]
};

const CORE = {
  'Pull B': ['Landmine Rotation 3x12', 'Cable Woodchop 3x12', 'Side Plank Hip Dip 3x10', 'Pallof Press 3x12'],
  'Default': ['Ab Rollout 3x10', 'Hanging Leg Raise 3x12', 'Plank 3x45s']
};

export default function App() {
  const [tab, setTab] = useState('workout');
  const [week, setWeek] = useState(1);
  const [dayIdx, setDayIdx] = useState(0);
  
  // Dynamic Phase Macros Calculation
  const phaseIdx = Math.min(Math.floor((week - 1) / 6), 3);
  const cals = 2600 - (phaseIdx * 150);
  const carbs = 235 - (phaseIdx * 35);
  const fats = 70 - (phaseIdx * 5);
  
  const currentWorkout = SPLIT[dayIdx];
  const lifts = LIFTS[currentWorkout] || [];
  const coreList = CORE[currentWorkout] || CORE['Default'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans text-sm">
      {/* HEADER */}
      <header className="max-w-4xl mx-auto flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
        <div>
          <h1 className="text-lg font-bold text-indigo-400">RECOMP 28-WEEK OS</h1>
          <p className="text-xs text-slate-400">Phase {phaseIdx + 1} • Week {week} / 28</p>
        </div>
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg">
          {['workout', 'nutrition', 'progress'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded text-xs font-semibold capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-4">
        {/* STATS BAR */}
        <div className="grid grid-cols-4 gap-2 text-center bg-slate-900 border border-slate-800 p-3 rounded-xl">
          <div><p className="text-[10px] text-slate-400">CALORIES</p><p className="font-bold text-amber-400">{cals} kcal</p></div>
          <div><p className="text-[10px] text-slate-400">PROTEIN</p><p className="font-bold text-indigo-400">255g</p></div>
          <div><p className="text-[10px] text-slate-400">CARBS</p><p className="font-bold text-emerald-400">{carbs}g</p></div>
          <div><p className="text-[10px] text-slate-400">FATS</p><p className="font-bold text-cyan-400">{fats}g</p></div>
        </div>

        {tab === 'workout' && (
          <div className="space-y-4">
            {/* WEEK & DAY SELECTOR */}
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-300">Week Select:</span>
                <select value={week} onChange={(e) => setWeek(+e.target.value)} className="bg-slate-800 text-white rounded px-2 py-1 text-xs border border-slate-700">
                  {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d, i) => (
                  <button key={d} onClick={() => setDayIdx(i)} className={`p-2 rounded text-center border ${dayIdx === i ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800/40 border-slate-800 text-slate-400'}`}>
                    <p className="text-[10px] font-bold">{d}</p>
                    <p className="text-[9px] truncate">{SPLIT[i]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ROUTINE DISPLAY */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4">
              <h2 className="text-lg font-black text-indigo-300">{currentWorkout} Routine</h2>
              
              {lifts.length === 0 ? (
                <p className="text-center py-8 text-slate-400">Active Recovery: 10k Steps & Mobility Work</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {lifts.map((l, i) => (
                      <div key={i} className="bg-slate-800/40 border border-slate-800 p-3 rounded-lg flex flex-wrap justify-between items-center gap-2">
                        <div>
                          <p className="font-bold">{l.n}</p>
                          <p className="text-xs text-slate-400">{l.s} sets × {l.r} reps</p>
                        </div>
                        <div className="flex gap-1">
                          {Array.from({ length: l.s }).map((_, s) => (
                            <input key={s} type="text" placeholder={`S${s+1}`} className="w-10 bg-slate-900 border border-slate-700 rounded text-center text-xs py-1 text-white" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CORE & HIIT */}
                  <div className="border-t border-slate-800 pt-3">
                    <p className="font-bold text-xs text-slate-400 mb-2 uppercase">Core Circuit</p>
                    <div className="grid grid-cols-2 gap-2">
                      {coreList.map((c, i) => (
                        <div key={i} className="bg-slate-800/30 p-2 rounded border border-slate-800 flex items-center gap-2 text-xs">
                          <CheckCircle2 className="h-4 w-4 text-indigo-400" /> {c}
                        </div>
                      ))}
                    </div>
                  </div>

                  <HiitTimer />
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'nutrition' && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
            <h2 className="font-bold text-base">Approved Lean Proteins</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {['Chicken Breast', 'Shrimp/Scallops', 'Salmon', 'Ground Turkey', 'White Fish', 'Egg Whites', 'Cottage Cheese', 'Whey Isolate'].map((f) => (
                <div key={f} className="bg-slate-800/40 border border-slate-800 p-2 rounded text-indigo-300 font-semibold">{f}</div>
              ))}
            </div>
          </div>
        )}

        {tab === 'progress' && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 text-xs">
            <h2 className="font-bold text-base mb-2">Recomp Baseline</h2>
            <div className="flex justify-between p-2 bg-slate-800/40 rounded"><span>Start Weight:</span><b className="text-white">170 lbs</b></div>
            <div className="flex justify-between p-2 bg-slate-800/40 rounded"><span>Start Body Fat:</span><b className="text-cyan-400">22.5%</b></div>
            <div className="flex justify-between p-2 bg-slate-800/40 rounded"><span>Target Body Fat:</span><b className="text-emerald-400">12-15%</b></div>
          </div>
        )}
      </main>
    </div>
  );
}

function HiitTimer() {
  const [s, setS] = useState(40);
  const [run, setRun] = useState(false);
  const [work, setWork] = useState(true);

  useEffect(() => {
    let t = run && setInterval(() => {
      setS((prev) => {
        if (prev > 1) return prev - 1;
        setWork(!work);
        return work ? 20 : 40;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [run, work]);

  return (
    <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-lg flex justify-between items-center text-xs">
      <div>
        <span className={`font-mono text-lg font-bold ${work ? 'text-amber-400' : 'text-emerald-400'}`}>{s}s</span>
        <span className="ml-2 font-semibold text-slate-300">{work ? 'HIIT Work (Zone 4-5)' : 'Recovery'}</span>
      </div>
      <div className="flex gap-1">
        <button onClick={() => setRun(!run)} className="p-2 bg-indigo-600 rounded">{run ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</button>
        <button onClick={() => { setRun(false); setWork(true); setS(40); }} className="p-2 bg-slate-800 rounded"><RotateCcw className="h-3 w-3" /></button>
      </div>
    </div>
  );
}