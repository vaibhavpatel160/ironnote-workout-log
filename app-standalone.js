// Auto-generated classic bundle for file:// standalone usage
(() => {
"use strict";
/**
 * IronNote Workout Engine
 * Pure calculation & parsing logic for notebook-style workout logging,
 * bodyweight ("bw", "bw + 45 lb") load resolution, weekly volume tracking,
 * and evidence-based Weekly Hardness estimation.
 */

const DEFAULT_BODYWEIGHT = 175;

const SPLIT_META = {
  Push: {
    label: 'Push',
    color: '#d9534f',
    bg: 'rgba(217, 83, 79, 0.12)',
    suggestions: [
      'Chest press',
      'Bench press',
      'Incline dumbbell press',
      'Shoulder press dumbbell',
      'Overhead press',
      'Lateral raises',
      'Tricep push down',
      'Dips'
    ]
  },
  Pull: {
    label: 'Pull',
    color: '#3b6ea8',
    bg: 'rgba(59, 110, 168, 0.12)',
    suggestions: [
      'Barbell rows',
      'Pull ups',
      'Lat pulldown',
      'Seated cable row',
      'Biceps curl',
      'Hammer curl',
      'Face pulls',
      'Back extension',
      'Deadlift'
    ]
  },
  Leg: {
    label: 'Leg',
    color: '#2e8555',
    bg: 'rgba(46, 133, 85, 0.12)',
    suggestions: [
      'Squats',
      'Romanian deadlift',
      'Leg press',
      'Leg extension',
      'Leg curls',
      'Bulgarian split squat',
      'Calf raises',
      'Lunges'
    ]
  },
  Upper: {
    label: 'Upper',
    color: '#7c5295',
    bg: 'rgba(124, 82, 149, 0.12)',
    suggestions: [
      'Chest press',
      'Barbell rows',
      'Shoulder press dumbbell',
      'Pull ups',
      'Tricep push down',
      'Biceps curl'
    ]
  },
  Lower: {
    label: 'Lower',
    color: '#2e8555',
    bg: 'rgba(46, 133, 85, 0.12)',
    suggestions: [
      'Squats',
      'Romanian deadlift',
      'Leg extension',
      'Leg curls',
      'Back extension',
      'Calf raises'
    ]
  },
  Full: {
    label: 'Full Body',
    color: '#b7791f',
    bg: 'rgba(183, 121, 31, 0.14)',
    suggestions: [
      'Squats',
      'Chest press',
      'Barbell rows',
      'Pull ups',
      'Shoulder press dumbbell',
      'Back extension'
    ]
  }
};

/**
 * Parse notebook-style weight notation:
 * - "200" or "200 lb" or "200lbs" -> standard external load (200 lb)
 * - "bw" or "bodyweight" -> pure bodyweight (e.g. 175 lb)
 * - "bw + 45" or "bw + 45lb" or "+45" -> weighted bodyweight (BW + 45 lb)
 * - "bw - 25" -> assisted bodyweight (max(0, BW - 25))
 * - Optional perHand (dumbbell pair) multiplier if x2 is specified or toggled
 */
function parseWeightSpec(rawInput, bodyweight = DEFAULT_BODYWEIGHT, perHand = false) {
  const bw = Number(bodyweight) > 0 ? Number(bodyweight) : DEFAULT_BODYWEIGHT;
  const cleaned = String(rawInput ?? '').trim();

  if (!cleaned) {
    return {
      raw: '',
      mode: 'standard',
      externalWeight: 0,
      bwComponent: 0,
      effectiveWeight: 0,
      displayNotebook: '0 lb',
      isBodyweight: false,
      valid: false
    };
  }

  const lower = cleaned
    .toLowerCase()
    .replace(/lbs?|pounds?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Match "bw", "bw + 45", "bw - 20", "bodyweight + 45"
  const bwMatch = lower.match(/^(?:bw|bodyweight)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/);
  if (bwMatch) {
    const sign = bwMatch[1];
    const delta = bwMatch[2] ? parseFloat(bwMatch[2]) : 0;
    if (!sign || delta === 0) {
      return {
        raw: cleaned,
        mode: 'bw',
        externalWeight: 0,
        bwComponent: bw,
        effectiveWeight: bw,
        displayNotebook: 'bw',
        isBodyweight: true,
        valid: true
      };
    }
    if (sign === '+') {
      return {
        raw: cleaned,
        mode: 'bw_plus',
        externalWeight: delta,
        bwComponent: bw,
        effectiveWeight: bw + delta,
        displayNotebook: `bw + ${formatNum(delta)} lb`,
        isBodyweight: true,
        valid: true
      };
    }
    const assisted = Math.max(10, bw - delta);
    return {
      raw: cleaned,
      mode: 'bw_minus',
      externalWeight: 0,
      bwComponent: assisted,
      effectiveWeight: assisted,
      displayNotebook: `bw - ${formatNum(delta)} lb`,
      isBodyweight: true,
      valid: true
    };
  }

  // Match "35 x 2" or "35*2" shorthand for dumbbells
  const pairMatch = lower.match(/^(\d+(?:\.\d+)?)\s*[x*]\s*2$/);
  if (pairMatch) {
    const single = parseFloat(pairMatch[1]);
    const total = single * 2;
    return {
      raw: cleaned,
      mode: 'pair',
      externalWeight: total,
      bwComponent: 0,
      effectiveWeight: total,
      displayNotebook: `${formatNum(single)}×2 lb`,
      isBodyweight: false,
      valid: true
    };
  }

  // Standard numeric weight e.g. "200", "85", "35.5"
  const numMatch = lower.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const base = parseFloat(numMatch[1]);
    const effective = perHand ? base * 2 : base;
    return {
      raw: cleaned,
      mode: perHand ? 'pair' : 'standard',
      externalWeight: effective,
      bwComponent: 0,
      effectiveWeight: effective,
      displayNotebook: perHand ? `${formatNum(base)}×2 lb` : `${formatNum(base)} lb`,
      isBodyweight: false,
      valid: base >= 0
    };
  }

  // Fallback: extract leading number if user wrote something like "45 plate"
  const fallbackNum = parseFloat(lower);
  if (!Number.isNaN(fallbackNum) && fallbackNum >= 0) {
    const effective = perHand ? fallbackNum * 2 : fallbackNum;
    return {
      raw: cleaned,
      mode: 'standard',
      externalWeight: effective,
      bwComponent: 0,
      effectiveWeight: effective,
      displayNotebook: `${formatNum(fallbackNum)} lb`,
      isBodyweight: false,
      valid: true
    };
  }

  return {
    raw: cleaned,
    mode: 'standard',
    externalWeight: 0,
    bwComponent: 0,
    effectiveWeight: 0,
    displayNotebook: cleaned,
    isBodyweight: false,
    valid: false
  };
}

function formatNum(n) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '');
}

function formatLbs(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-US')} lb`;
}

/**
 * Normalize an exercise entry so it always has a `setGroups` array, supporting both:
 * 1) Single weight/reps/sets line: { name, weight: '200 lb', reps: 8, sets: 3 }
 * 2) Multiple different weight & reps sets for the same exercise:
 *    { name, setGroups: [{ weight: '185 lb', reps: 10, sets: 1 }, { weight: '205 lb', reps: 8, sets: 2 }] }
 */
function normalizeSetGroups(entry) {
  if (Array.isArray(entry?.setGroups) && entry.setGroups.length > 0) {
    return entry.setGroups.map((sg, idx) => ({
      id: sg.id || `sg-${idx + 1}`,
      weight: sg.weight ?? '',
      reps: sg.reps ?? 0,
      sets: sg.sets ?? 1,
      perHand: Boolean(sg.perHand)
    }));
  }
  return [
    {
      id: 'sg-1',
      weight: entry?.weight ?? '',
      reps: entry?.reps ?? 0,
      sets: entry?.sets ?? 1,
      perHand: Boolean(entry?.perHand)
    }
  ];
}

function calculateSetGroupMetrics(sg, bodyweight = DEFAULT_BODYWEIGHT) {
  const reps = Math.max(0, parseInt(sg.reps, 10) || 0);
  const sets = Math.max(0, parseInt(sg.sets, 10) || 0);
  const weightInfo = parseWeightSpec(sg.weight, bodyweight, Boolean(sg.perHand));

  const totalReps = reps * sets;
  const volume = weightInfo.effectiveWeight * totalReps;
  const externalVolume = weightInfo.externalWeight * totalReps;
  const bwVolume = weightInfo.bwComponent * totalReps;
  const heavySets =
    reps >= 1 && reps <= 6 && weightInfo.effectiveWeight > 0 ? sets : 0;

  // Epley 1RM formula (accurate for working sets <= 15 reps)
  const est1RM =
    reps > 0 && weightInfo.effectiveWeight > 0
      ? reps === 1
        ? weightInfo.effectiveWeight
        : weightInfo.effectiveWeight * (1 + Math.min(reps, 15) / 30)
      : 0;

  const relativePct1RM = est1RM > 0 ? weightInfo.effectiveWeight / est1RM : 0;

  return {
    ...sg,
    reps,
    sets,
    totalReps,
    weightInfo,
    volume,
    externalVolume,
    bwVolume,
    heavySets,
    est1RM,
    relativePct1RM
  };
}

/**
 * Compute volume, estimated 1RM (Epley), and intensity metrics for an exercise
 * (supporting one or multiple different weight/rep set groups).
 */
function calculateExerciseMetrics(entry, bodyweight = DEFAULT_BODYWEIGHT) {
  const computedGroups = normalizeSetGroups(entry).map((sg) =>
    calculateSetGroupMetrics(sg, bodyweight)
  );

  const sets = computedGroups.reduce((s, g) => s + g.sets, 0);
  const totalReps = computedGroups.reduce((s, g) => s + g.totalReps, 0);
  const volume = computedGroups.reduce((s, g) => s + g.volume, 0);
  const externalVolume = computedGroups.reduce((s, g) => s + g.externalVolume, 0);
  const bwVolume = computedGroups.reduce((s, g) => s + g.bwVolume, 0);
  const heavySets = computedGroups.reduce((s, g) => s + g.heavySets, 0);

  let bestSet = computedGroups[0];
  for (const g of computedGroups) {
    if (g.est1RM > bestSet.est1RM) {
      bestSet = g;
    }
  }

  const summaryScheme = computedGroups
    .map((g) => `${g.weightInfo.displayNotebook} × ${g.reps}${g.sets > 1 ? ` × ${g.sets}` : ''}`)
    .join(', ');

  return {
    ...entry,
    setGroups: computedGroups,
    reps: bestSet.reps,
    sets,
    totalReps,
    weightInfo: bestSet.weightInfo,
    bestSet,
    summaryScheme,
    volume,
    externalVolume,
    bwVolume,
    heavySets,
    est1RM: bestSet.est1RM,
    relativePct1RM: bestSet.relativePct1RM
  };
}

/**
 * Compute metrics for an entire workout session.
 */
function calculateWorkoutMetrics(workout, bodyweight = DEFAULT_BODYWEIGHT) {
  const exercises = (workout.exercises || []).map((ex) =>
    calculateExerciseMetrics(ex, bodyweight)
  );
  const totalVolume = exercises.reduce((sum, ex) => sum + ex.volume, 0);
  const externalVolume = exercises.reduce((sum, ex) => sum + ex.externalVolume, 0);
  const bwVolume = exercises.reduce((sum, ex) => sum + ex.bwVolume, 0);
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const totalReps = exercises.reduce((sum, ex) => sum + ex.totalReps, 0);
  const heavySets = exercises.reduce((sum, ex) => sum + ex.heavySets, 0);

  return {
    ...workout,
    exercises,
    totalVolume,
    externalVolume,
    bwVolume,
    totalSets,
    totalReps,
    heavySets
  };
}

/**
 * ISO Date helpers (local calendar date YYYY-MM-DD, Monday-start training week)
 */
function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(isoStr) {
  const [y, m, d] = String(isoStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function getMondayOfWeek(isoDateStr) {
  const d = parseISODate(isoDateStr);
  const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toISODate(d);
}

function shiftDays(isoDateStr, deltaDays) {
  const d = parseISODate(isoDateStr);
  d.setDate(d.getDate() + deltaDays);
  return toISODate(d);
}

function formatShortDate(isoDateStr) {
  const d = parseISODate(isoDateStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}`;
}

function formatReadableDate(isoDateStr) {
  const d = parseISODate(isoDateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatWeekRange(mondayISO) {
  const start = parseISODate(mondayISO);
  const end = parseISODate(shiftDays(mondayISO, 6));
  const sameMonth = start.getMonth() === end.getMonth();
  const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endFmt = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric'
  });
  return `${startFmt} – ${endFmt}`;
}

/**
 * Compute multi-week trend (4 weeks ending at referenceMondayISO) for week-over-week comparison.
 */
function calculateMultiWeekTrend(
  allWorkouts,
  referenceMondayISO,
  bodyweight = DEFAULT_BODYWEIGHT,
  weeksCount = 4
) {
  const weeks = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const mon = shiftDays(referenceMondayISO, -7 * i);
    const sum = calculateWeeklySummary(allWorkouts, mon, bodyweight);
    weeks.push({
      weekMondayISO: mon,
      label: formatWeekRange(mon),
      isSelected: i === 0,
      sessionCount: sum.sessionCount,
      totalSets: sum.totalSets,
      totalVolume: sum.totalVolume,
      hardnessScore: sum.hardness.score,
      tier: sum.hardness.tier,
      badgeColor: sum.hardness.badgeColor
    });
  }
  return weeks;
}

/**
 * Evidence-based Weekly Volume & Workout Hardness Estimator.
 *
 * Evaluates a Mon-Sun training week across 4 transparent coaching dimensions:
 * 1. Frequency Score (0 - 2.4 pts): Sessions completed in the week
 * 2. Working Set Volume Score (0 - 3.2 pts): Total working sets vs hypertrophy landmarks
 * 3. Load & Intensity Score (0 - 3.0 pts): Bodyweight-normalized weekly tonnage + heavy strength set density (<=6 reps)
 * 4. Effort & Overload Bonus (0 - 1.4 pts): Logged session RPE (if set) or compound lift density + progressive overload
 */
function calculateWeeklySummary(
  allWorkouts,
  weekMondayISO,
  bodyweight = DEFAULT_BODYWEIGHT
) {
  const bw = Number(bodyweight) > 0 ? Number(bodyweight) : DEFAULT_BODYWEIGHT;
  const weekEndISO = shiftDays(weekMondayISO, 6);
  const prevMondayISO = shiftDays(weekMondayISO, -7);
  const prevEndISO = shiftDays(weekMondayISO, -1);

  const weekWorkouts = (allWorkouts || [])
    .filter((w) => w.date >= weekMondayISO && w.date <= weekEndISO)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0))
    .map((w) => calculateWorkoutMetrics(w, bw));

  const prevWeekWorkouts = (allWorkouts || [])
    .filter((w) => w.date >= prevMondayISO && w.date <= prevEndISO)
    .map((w) => calculateWorkoutMetrics(w, bw));

  const totalVolume = weekWorkouts.reduce((s, w) => s + w.totalVolume, 0);
  const externalVolume = weekWorkouts.reduce((s, w) => s + w.externalVolume, 0);
  const bwVolume = weekWorkouts.reduce((s, w) => s + w.bwVolume, 0);
  const totalSets = weekWorkouts.reduce((s, w) => s + w.totalSets, 0);
  const totalReps = weekWorkouts.reduce((s, w) => s + w.totalReps, 0);
  const heavySets = weekWorkouts.reduce((s, w) => s + w.heavySets, 0);
  const sessionCount = weekWorkouts.length;
  const uniqueDays = new Set(weekWorkouts.map((w) => w.date)).size;

  const prevTotalVolume = prevWeekWorkouts.reduce((s, w) => s + w.totalVolume, 0);
  const prevTotalSets = prevWeekWorkouts.reduce((s, w) => s + w.totalSets, 0);

  // Daily breakdown Mon (0) -> Sun (6)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const daily = dayNames.map((label, idx) => {
    const iso = shiftDays(weekMondayISO, idx);
    const daySessions = weekWorkouts.filter((w) => w.date === iso);
    return {
      label,
      date: iso,
      shortDate: formatShortDate(iso),
      volume: daySessions.reduce((s, w) => s + w.totalVolume, 0),
      sets: daySessions.reduce((s, w) => s + w.totalSets, 0),
      splits: daySessions.map((w) => w.split)
    };
  });

  // Split breakdown
  const splitMap = {};
  for (const w of weekWorkouts) {
    const key = w.split || 'Other';
    if (!splitMap[key]) {
      splitMap[key] = {
        split: key,
        volume: 0,
        sets: 0,
        sessions: 0,
        color: SPLIT_META[key]?.color || '#64748b'
      };
    }
    splitMap[key].volume += w.totalVolume;
    splitMap[key].sets += w.totalSets;
    splitMap[key].sessions += 1;
  }
  const splitBreakdown = Object.values(splitMap).sort((a, b) => b.volume - a.volume);

  // Top estimated 1RMs of the week
  const bestLiftsMap = new Map();
  for (const w of weekWorkouts) {
    for (const ex of w.exercises) {
      if (!ex.name || ex.est1RM <= 0) continue;
      const key = ex.name.trim().toLowerCase();
      const prev = bestLiftsMap.get(key);
      if (!prev || ex.est1RM > prev.est1RM) {
        bestLiftsMap.set(key, {
          name: ex.name.trim(),
          weightDisplay: ex.weightInfo.displayNotebook,
          reps: ex.reps,
          sets: ex.bestSet ? ex.bestSet.sets : ex.sets,
          est1RM: Math.round(ex.est1RM),
          volume: ex.volume
        });
      }
    }
  }
  const topLifts = Array.from(bestLiftsMap.values())
    .sort((a, b) => b.est1RM - a.est1RM)
    .slice(0, 4);

  // --- WEEKLY HARDNESS SCORE (0.0 to 10.0) ---
  const hardness = computeHardnessEstimate({
    sessionCount,
    uniqueDays,
    totalVolume,
    totalSets,
    totalReps,
    heavySets,
    bw,
    weekWorkouts,
    prevTotalVolume
  });

  const volumeDelta = prevTotalVolume > 0 ? totalVolume - prevTotalVolume : null;
  const volumeDeltaPct =
    prevTotalVolume > 0 ? ((totalVolume - prevTotalVolume) / prevTotalVolume) * 100 : null;

  return {
    weekMondayISO,
    weekEndISO,
    weekLabel: formatWeekRange(weekMondayISO),
    bodyweight: bw,
    workouts: weekWorkouts,
    sessionCount,
    uniqueDays,
    totalVolume,
    externalVolume,
    bwVolume,
    totalSets,
    totalReps,
    heavySets,
    bodyweightMultiples: bw > 0 ? totalVolume / bw : 0,
    prevTotalVolume,
    prevTotalSets,
    volumeDelta,
    volumeDeltaPct,
    daily,
    splitBreakdown,
    topLifts,
    hardness
  };
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function computeHardnessEstimate({
  sessionCount,
  uniqueDays,
  totalVolume,
  totalSets,
  totalReps,
  heavySets,
  bw,
  weekWorkouts,
  prevTotalVolume
}) {
  if (sessionCount === 0 || totalSets === 0) {
    return {
      score: 0,
      tier: 'No Workouts Yet',
      badgeColor: '#6b7280',
      headline: 'Log a workout this week to unlock your weekly hardness & recovery estimate.',
      coachingNote:
        'Aim for 3–5 sessions and ~25–45 working sets across Push, Pull, and Legs for a strong training week.',
      factors: [
        { label: 'Consistency', valueLabel: '0 days', pct: 0 },
        { label: 'Set Volume', valueLabel: '0 sets', pct: 0 },
        { label: 'Load Intensity', valueLabel: '0× BW', pct: 0 },
        { label: 'Session Effort', valueLabel: '—', pct: 0 }
      ]
    };
  }

  // 1. Frequency / Consistency (max 2.4 pts)
  // 1 day -> 0.85, 3 days -> 1.75, 4 days -> 2.05, 5 days -> 2.28, 6+ days -> 2.4
  const effectiveDays = Math.max(uniqueDays, Math.min(sessionCount, 6));
  const freqPoints = clamp(0.45 + Math.pow(effectiveDays / 6, 0.72) * 1.95, 0, 2.4);

  // 2. Working Set Volume (max 3.2 pts)
  // ~10 sets -> 1.1, ~28 sets (1 PPL cycle) -> 2.25, ~48 sets (2 PPL cycles) -> 3.05, 60+ -> 3.2
  const setPoints = clamp(Math.pow(Math.min(totalSets, 62) / 56, 0.74) * 3.2, 0, 3.2);

  // 3. Relative Load & Strength Intensity (max 3.0 pts)
  // Combines weekly bodyweight multiples lifted (e.g. 165x BW in a week) + heavy compound density + avg load/rep
  const bwMultiples = bw > 0 ? totalVolume / bw : 0;
  const avgLoadPerRep = totalReps > 0 ? totalVolume / totalReps : 0;
  const avgLoadToBw = bw > 0 ? avgLoadPerRep / bw : 0; // e.g. 0.70x BW avg across compounds & isolations
  const heavyRatio = totalSets > 0 ? heavySets / totalSets : 0;

  const tonnageComponent = clamp((bwMultiples / 260) * 1.35, 0, 1.35);
  const densityComponent = clamp((avgLoadToBw / 0.85) * 1.15, 0, 1.15);
  const heavyBonus = clamp((heavyRatio / 0.35) * 0.5, 0, 0.5);
  const loadPoints = clamp(tonnageComponent + densityComponent + heavyBonus, 0, 3.0);

  // 4. Subjective Effort (RPE) & Progressive Overload (max 1.4 pts)
  const rpeEntries = weekWorkouts
    .map((w) => Number(w.rpe))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);

  let effortPoints = 0.95; // Default solid working effort (~RPE 7.5-8) when user keeps logging lightweight
  let effortLabel = 'Auto (~7.8 RPE)';
  if (rpeEntries.length > 0) {
    const avgRpe = rpeEntries.reduce((a, b) => a + b, 0) / rpeEntries.length;
    effortPoints = clamp(((avgRpe - 4) / 6) * 1.3, 0.2, 1.3);
    effortLabel = `Avg RPE ${avgRpe.toFixed(1)}/10`;
  }
  if (prevTotalVolume > 0 && totalVolume > prevTotalVolume * 1.03) {
    effortPoints = clamp(effortPoints + 0.15, 0, 1.4);
  }

  const rawScore = clamp(freqPoints + setPoints + loadPoints + effortPoints, 1.0, 10.0);
  const score = Math.round(rawScore * 10) / 10;

  let tier = 'Moderate Week';
  let badgeColor = '#b7791f';
  let headline = '';
  let coachingNote = '';

  if (score < 3.5) {
    tier = 'Light / Deload Week';
    badgeColor = '#3b6ea8';
    headline = 'Low overall fatigue — great for active recovery or easing into training.';
    coachingNote =
      'Volume and frequency were conservative this week. You have plenty of recovery reserve to push weights or add 1–2 sessions next week.';
  } else if (score < 5.5) {
    tier = 'Steady / Maintenance';
    badgeColor = '#2e8555';
    headline = 'Enough stimulus to maintain strength without accumulating heavy fatigue.';
    coachingNote = `You logged ${totalSets} working sets across ${sessionCount} workout${sessionCount === 1 ? '' : 's'}. Adding another session or 6–10 sets will move you into growth territory.`;
  } else if (score < 7.6) {
    tier = 'Hard / Productive Week';
    badgeColor = '#d97706';
    headline = 'Strong training stimulus with recoverable fatigue — ideal for steady gains.';
    coachingNote =
      heavySets >= 6
        ? `Solid heavy compound work (${heavySets} strength sets in the 1–6 rep range) plus ${Math.round(bwMultiples)}× your bodyweight moved in total volume. Try beating 1–2 rep targets next week.`
        : `Balanced volume (${totalSets} working sets, ${Math.round(bwMultiples)}× bodyweight lifted). Great sustainable pace for week-over-week progressive overload.`;
  } else if (score < 8.9) {
    tier = 'Very Hard / High Overload';
    badgeColor = '#d9534f';
    headline = 'High muscular & neurological demand — prioritize protein and 7.5+ hrs sleep.';
    coachingNote = `You pushed ${totalSets} sets and moved ${formatLbs(totalVolume)} (${Math.round(bwMultiples)}× bodyweight). Great growth week, just watch joint recovery before adding more volume.`;
  } else {
    tier = 'All-Out / Peak Volume';
    badgeColor = '#991b1b';
    headline = 'Near-maximal weekly workload — watch for fatigue accumulation.';
    coachingNote = `Massive workload (${totalSets} sets across ${sessionCount} sessions). After 3–4 weeks at this intensity, consider a lighter deload week to supercompensate.`;
  }

  return {
    score,
    tier,
    badgeColor,
    headline,
    coachingNote,
    factors: [
      {
        label: 'Consistency',
        valueLabel: `${sessionCount} session${sessionCount === 1 ? '' : 's'}`,
        pct: Math.round((freqPoints / 2.4) * 100)
      },
      {
        label: 'Set Volume',
        valueLabel: `${totalSets} working sets`,
        pct: Math.round((setPoints / 3.2) * 100)
      },
      {
        label: 'Load & Heavy Sets',
        valueLabel: `${Math.round(bwMultiples)}× BW · ${heavySets} heavy`,
        pct: Math.round((loadPoints / 3.0) * 100)
      },
      {
        label: 'Effort / Drive',
        valueLabel: effortLabel,
        pct: Math.round((effortPoints / 1.4) * 100)
      }
    ]
  };
}

/**
 * Digitized starter workouts directly from IMG_5501.jpeg!
 * Placed in the current week (Mon / Tue / Thu) so the user immediately sees
 * their exact handwritten Push / Pull / Leg workouts come alive.
 */
function createNotebookSeedWorkouts(referenceTodayISO) {
  const monday = getMondayOfWeek(referenceTodayISO);
  const tuesday = shiftDays(monday, 1);
  // Keep seeded dates on or before today whenever possible (e.g. Mon/Tue/Wed)
  const wedOrThu = referenceTodayISO >= shiftDays(monday, 3) ? shiftDays(monday, 3) : shiftDays(monday, 2);

  // Also include a prior-week Push & Pull session so week-over-week comparison works out of the box,
  // or keep current week exact to IMG_5501.jpeg! Let's include 2 lighter sessions in the prior week
  // so "vs Last Week" progressive overload is also demonstrated without cluttering This Week!
  const prevMonday = shiftDays(monday, -7);
  const prevWednesday = shiftDays(monday, -5);
  const prevFriday = shiftDays(monday, -3);

  return [
    {
      id: 'seed-prev-push',
      date: prevMonday,
      split: 'Push',
      rpe: 7,
      notes: 'Last week baseline Push',
      createdAt: 1000,
      exercises: [
        { id: 'sp1', name: 'Chest press', weight: '195 lb', reps: 8, sets: 3 },
        { id: 'sp2', name: 'Tricep push down', weight: '80 lb', reps: 10, sets: 3 },
        { id: 'sp3', name: 'Shoulder press dumbbell', weight: '35 lb', reps: 9, sets: 3 }
      ]
    },
    {
      id: 'seed-prev-pull',
      date: prevWednesday,
      split: 'Pull',
      rpe: 7.5,
      notes: 'Last week baseline Pull',
      createdAt: 2000,
      exercises: [
        { id: 'spl1', name: 'Barbell rows', weight: '195 lb', reps: 5, sets: 3 },
        { id: 'spl2', name: 'Biceps curl', weight: '40 lb', reps: 8, sets: 2 },
        { id: 'spl3', name: 'Pull ups', weight: 'bw + 40 lb', reps: 4, sets: 3 },
        { id: 'spl4', name: 'Back extension', weight: 'bw', reps: 10, sets: 2 }
      ]
    },
    {
      id: 'seed-prev-leg',
      date: prevFriday,
      split: 'Leg',
      rpe: 7.5,
      notes: 'Last week baseline Legs',
      createdAt: 3000,
      exercises: [
        { id: 'slg1', name: 'Squats', weight: '215 lb', reps: 5, sets: 3 },
        { id: 'slg2', name: 'Leg extension', weight: '80 lb', reps: 12, sets: 3 },
        { id: 'slg3', name: 'Leg curls', weight: '95 lb', reps: 12, sets: 3 }
      ]
    },
    // Exact digitized entries from IMG_5501.jpeg for the active week:
    {
      id: 'seed-img-push',
      date: monday,
      split: 'Push',
      rpe: 8,
      notes: 'Imported from notebook (Push)',
      createdAt: 4000,
      exercises: [
        { id: 'ex-cp', name: 'Chest press', weight: '200 lb', reps: 8, sets: 3 },
        { id: 'ex-tpd', name: 'Tricep push down', weight: '85 lb', reps: 10, sets: 3 },
        { id: 'ex-spd', name: 'Shoulder press dumbbell', weight: '35 lb', reps: 10, sets: 3 }
      ]
    },
    {
      id: 'seed-img-pull',
      date: tuesday,
      split: 'Pull',
      rpe: 8,
      notes: 'Imported from notebook (Pull)',
      createdAt: 5000,
      exercises: [
        { id: 'ex-br', name: 'Barbell rows', weight: '200 lb', reps: 5, sets: 3 },
        { id: 'ex-bc', name: 'Biceps curl', weight: '40 lb', reps: 8, sets: 2 },
        { id: 'ex-pu', name: 'Pull ups', weight: 'bw + 45 lb', reps: 4, sets: 3 },
        { id: 'ex-be', name: 'Back extension', weight: 'bw', reps: 12, sets: 2 }
      ]
    },
    {
      id: 'seed-img-leg',
      date: wedOrThu,
      split: 'Leg',
      rpe: 8,
      notes: 'Imported from notebook (Leg)',
      createdAt: 6000,
      exercises: [
        { id: 'ex-sq', name: 'Squats', weight: '225 lb', reps: 5, sets: 3 },
        { id: 'ex-le', name: 'Leg extension', weight: '85 lb', reps: 12, sets: 3 },
        { id: 'ex-lc', name: 'Leg curls', weight: '100 lb', reps: 12, sets: 3 }
      ]
    }
  ];
}

const STORAGE_KEY = 'ironnote_state_v1';

const todayISO = toISODate(new Date());
const currentMondayISO = getMondayOfWeek(todayISO);

let state = {
  bodyweight: DEFAULT_BODYWEIGHT,
  theme: 'notebook',
  selectedWeekMonday: currentMondayISO,
  activeTab: 'log',
  selectedLiftFilter: '',
  workouts: []
};

// Active composer modal state
let draftWorkout = {
  editingId: null,
  date: todayISO,
  split: 'Push',
  rpe: '8',
  notes: '',
  rows: []
};

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isLocalDevServer() {
  if (!window.location.protocol.startsWith('http')) return false;
  const h = window.location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

function toDraftSetGroups(ex) {
  return normalizeSetGroups(ex).map((sg) => ({
    id: uid('sg'),
    weight: sg.weight ?? '',
    reps: sg.reps ?? 8,
    sets: sg.sets ?? 3,
    perHand: Boolean(sg.perHand)
  }));
}

function createBlankRow(reps = 10, sets = 3) {
  return {
    id: uid('row'),
    name: '',
    setGroups: [{ id: uid('sg'), weight: '', reps, sets, perHand: false }]
  };
}

/* ---------- Persistence (LocalStorage + Optional Local Dev Server Sync) ---------- */

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.workouts)) {
        state.bodyweight = Number(parsed.bodyweight) > 0 ? Number(parsed.bodyweight) : DEFAULT_BODYWEIGHT;
        state.theme = parsed.theme === 'dark' ? 'dark' : 'notebook';
        state.workouts = parsed.workouts;
        return true;
      }
    }
  } catch {
    // Ignore malformed storage
  }
  return false;
}

function saveState(syncRemote = true) {
  const payload = {
    bodyweight: state.bodyweight,
    theme: state.theme,
    workouts: state.workouts,
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }

  if (syncRemote && isLocalDevServer()) {
    fetch('./api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
}

async function initData() {
  const hasLocal = loadLocalState();

  // Sync with local Node dev server when running locally (skipped on GitHub Pages)
  if (isLocalDevServer()) {
    try {
      const res = await fetch('./api/state', { cache: 'no-store' });
      if (res.ok) {
        const remote = await res.json();
        if (remote && Array.isArray(remote.workouts) && remote.workouts.length > 0 && !hasLocal) {
          state.bodyweight = Number(remote.bodyweight) > 0 ? Number(remote.bodyweight) : state.bodyweight;
          state.theme = remote.theme === 'dark' ? 'dark' : state.theme;
          state.workouts = remote.workouts;
          saveState(false);
        } else if (hasLocal && (!remote || !remote.workouts || remote.workouts.length === 0)) {
          saveState(true);
        }
      }
    } catch {
      // Static server — localStorage handles everything
    }
  }

  if (!hasLocal && state.workouts.length === 0) {
    state.workouts = createNotebookSeedWorkouts(todayISO);
    saveState(true);
  }
}

/* ---------- Helpers for Smart Suggestions & Last Performance ---------- */

function getAllKnownExercises() {
  const map = new Map();
  Object.values(SPLIT_META).forEach((m) => {
    m.suggestions.forEach((name) => map.set(name.toLowerCase(), name));
  });
  const sorted = [...state.workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      if (ex.name && ex.name.trim()) {
        map.set(ex.name.trim().toLowerCase(), ex.name.trim());
      }
    }
  }
  return Array.from(map.values());
}

function getLastExerciseEntry(exerciseName, excludeWorkoutId = null) {
  if (!exerciseName) return null;
  const target = exerciseName.trim().toLowerCase();
  const sorted = [...state.workouts]
    .filter((w) => w.id !== excludeWorkoutId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      if ((ex.name || '').trim().toLowerCase() === target) {
        const computed = calculateExerciseMetrics(ex, state.bodyweight);
        return { ...ex, summaryScheme: computed.summaryScheme, date: w.date };
      }
    }
  }
  return null;
}

function getLastWorkoutForSplit(splitName, excludeWorkoutId = null) {
  return (
    [...state.workouts]
      .filter(
        (w) => w.split === splitName && w.id !== excludeWorkoutId && (w.exercises || []).length > 0
      )
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))[0] ||
    null
  );
}

/* ---------- Theme & Toast ---------- */

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const moon = document.getElementById('icon-moon');
  const sun = document.getElementById('icon-sun');
  const metaTheme = document.getElementById('meta-theme-color');
  if (state.theme === 'dark') {
    moon.hidden = true;
    sun.hidden = false;
    metaTheme.setAttribute('content', '#111317');
  } else {
    moon.hidden = false;
    sun.hidden = true;
    metaTheme.setAttribute('content', '#f7f4ee');
  }
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

/* ---------- Main Rendering ---------- */

function renderApp() {
  applyTheme();
  document.getElementById('header-bw-val').textContent = `${formatNum(state.bodyweight)} lb`;

  const datalist = document.getElementById('all-exercises-datalist');
  datalist.innerHTML = getAllKnownExercises()
    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
    .join('');

  const summary = calculateWeeklySummary(
    state.workouts,
    state.selectedWeekMonday,
    state.bodyweight
  );

  renderWeekHeader(summary);
  renderTabs();

  if (state.activeTab === 'log') {
    renderNotebookView(summary);
  } else if (state.activeTab === 'week') {
    renderWeeklyReportView(summary);
  } else {
    renderLiftsView();
  }
}

function renderWeekHeader(summary) {
  const weekStrip = document.getElementById('week-strip');
  weekStrip.hidden = state.activeTab === 'lifts';

  let relTag = 'Selected Week';
  if (state.selectedWeekMonday === currentMondayISO) {
    relTag = 'This Week';
  } else if (state.selectedWeekMonday === shiftDays(currentMondayISO, -7)) {
    relTag = 'Last Week';
  } else if (state.selectedWeekMonday === shiftDays(currentMondayISO, 7)) {
    relTag = 'Next Week';
  }

  document.getElementById('week-relative-tag').textContent = relTag;
  document.getElementById('week-date-range').textContent = summary.weekLabel;
  document.getElementById('btn-jump-this-week').hidden =
    state.selectedWeekMonday === currentMondayISO;

  document.getElementById('pulse-volume').textContent = formatLbs(summary.totalVolume);
  document.getElementById('pulse-sets').textContent = `${summary.totalSets} sets`;

  const hardnessEl = document.getElementById('pulse-hardness');
  if (summary.sessionCount === 0) {
    hardnessEl.textContent = '— / 10';
    hardnessEl.style.color = '';
  } else {
    hardnessEl.textContent = `${summary.hardness.score.toFixed(1)} / 10`;
    hardnessEl.style.color = summary.hardness.badgeColor;
  }
}

function renderTabs() {
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });
  document.getElementById('view-log').hidden = state.activeTab !== 'log';
  document.getElementById('view-week').hidden = state.activeTab !== 'week';
  document.getElementById('view-lifts').hidden = state.activeTab !== 'lifts';
}

/* ---------- TAB 1: Notebook Workout Cards ---------- */

function renderWeightCell(sg) {
  const wInfo = sg.weightInfo;
  const subLabel = wInfo.isBodyweight
    ? `<span class="nb-weight-sub">= ${formatNum(wInfo.effectiveWeight)} lb</span>`
    : sg.perHand
      ? `<span class="nb-weight-sub">= ${formatNum(wInfo.effectiveWeight)} lb pair</span>`
      : '';
  return `
    <span class="nb-weight-main">${escapeHtml(wInfo.displayNotebook)}</span>
    ${subLabel}
  `;
}

function renderNotebookView(summary) {
  const container = document.getElementById('workout-list');
  if (summary.workouts.length === 0) {
    container.innerHTML = `
      <div class="empty-notebook">
        <h3>Blank page for ${escapeHtml(summary.weekLabel)}</h3>
        <p>Tap <strong>Log Workout</strong> or pick <strong>Push / Pull / Leg</strong> above to jot down your sets in seconds.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = summary.workouts
    .map((w) => {
      const splitMeta = SPLIT_META[w.split] || {
        color: '#64748b',
        bg: 'rgba(100,116,139,0.12)'
      };

      const rowsHtml = w.exercises
        .map((ex) => {
          const groups = ex.setGroups || [];
          if (groups.length <= 1) {
            const g = groups[0] || ex;
            return `
              <tr>
                <td>${escapeHtml(ex.name)}</td>
                <td>${renderWeightCell(g)}</td>
                <td>${g.reps}</td>
                <td>${g.sets}</td>
                <td class="nb-vol-cell">${Math.round(g.volume).toLocaleString('en-US')}</td>
              </tr>
            `;
          }

          // Multi-weight / multi-rep sets for the same exercise
          let setCursor = 1;
          return groups
            .map((g, gIdx) => {
              const hasNext = gIdx < groups.length - 1;
              const startSet = setCursor;
              const endSet = setCursor + g.sets - 1;
              setCursor = endSet + 1;

              if (gIdx === 0) {
                const rangeTag = g.sets > 1 ? `Sets ${startSet}–${endSet}` : `Set ${startSet}`;
                return `
                  <tr class="${hasNext ? 'nb-row-has-next' : ''}">
                    <td>
                      ${escapeHtml(ex.name)}
                      <span class="nb-ex-subtotal">${escapeHtml(rangeTag)} · Total ${ex.sets}s (${formatLbs(ex.volume)})</span>
                    </td>
                    <td>${renderWeightCell(g)}</td>
                    <td>${g.reps}</td>
                    <td>${g.sets}</td>
                    <td class="nb-vol-cell">${Math.round(g.volume).toLocaleString('en-US')}</td>
                  </tr>
                `;
              }

              const setLabel =
                g.sets > 1 ? `↳ Sets ${startSet}–${endSet}` : `↳ Set ${startSet}`;
              return `
                <tr class="nb-row-cont ${hasNext ? 'nb-row-has-next' : ''}">
                  <td class="nb-cont-label">${escapeHtml(setLabel)}</td>
                  <td>${renderWeightCell(g)}</td>
                  <td>${g.reps}</td>
                  <td>${g.sets}</td>
                  <td class="nb-vol-cell">${Math.round(g.volume).toLocaleString('en-US')}</td>
                </tr>
              `;
            })
            .join('');
        })
        .join('');

      const rpeHtml = w.rpe
        ? `<span class="nb-rpe-tag">RPE ${escapeHtml(w.rpe)}</span>`
        : '';

      return `
        <article class="notebook-card" data-workout-id="${escapeHtml(w.id)}">
          <div class="nb-header">
            <div class="nb-header-left">
              <span class="nb-date">${escapeHtml(formatReadableDate(w.date))}</span>
              <span class="nb-split-badge" style="color:${splitMeta.color}; background:${splitMeta.bg}">
                → ${escapeHtml(w.split)}
              </span>
              ${rpeHtml}
            </div>
            <div class="nb-header-actions">
              <button type="button" class="nb-action-btn" data-edit-workout="${escapeHtml(w.id)}">Edit</button>
              <button type="button" class="nb-action-btn danger" data-delete-workout="${escapeHtml(w.id)}" aria-label="Delete workout">✕</button>
            </div>
          </div>

          <table class="nb-table" aria-label="${escapeHtml(w.split)} exercises">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Weight</th>
                <th>Reps</th>
                <th>Sets</th>
                <th>Vol</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="nb-footer">
            <span class="nb-notes">${w.notes ? escapeHtml(w.notes) : ''}</span>
            <span class="nb-totals">${w.totalSets} sets · ${formatLbs(w.totalVolume)}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

/* ---------- TAB 2: End-of-Week Volume & Hardness Report ---------- */

function renderWeeklyReportView(summary) {
  const container = document.getElementById('weekly-report-container');
  const h = summary.hardness;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, Math.max(0, h.score / 10));
  const dashOffset = circumference * (1 - pct);

  const deltaHtml =
    summary.volumeDelta !== null
      ? `<span class="delta-pill ${summary.volumeDelta >= 0 ? 'delta-up' : 'delta-down'}">
          ${summary.volumeDelta >= 0 ? '▲ +' : '▼ '}${formatLbs(Math.abs(summary.volumeDelta))}
          (${summary.volumeDeltaPct >= 0 ? '+' : ''}${summary.volumeDeltaPct.toFixed(1)}% vs last wk)
         </span>`
      : `<span class="nb-rpe-tag">Baseline week</span>`;

  const maxDailyVol = Math.max(1, ...summary.daily.map((d) => d.volume));
  const dailyBarsHtml = summary.daily
    .map((d) => {
      const heightPct = d.volume > 0 ? Math.max(10, Math.round((d.volume / maxDailyVol) * 100)) : 0;
      const shortK =
        d.volume >= 1000
          ? `${(d.volume / 1000).toFixed(1)}k`
          : d.volume > 0
            ? String(Math.round(d.volume))
            : '';
      const splitTxt = d.splits.length > 0 ? d.splits.join('/') : 'Rest';
      return `
        <div class="day-col">
          <span class="day-vol-label">${escapeHtml(shortK)}</span>
          <div class="day-bar-wrap">
            <div class="day-bar-fill" style="height:${heightPct}%"></div>
          </div>
          <span class="day-name">${escapeHtml(d.label)}</span>
          <span class="day-split-dot">${escapeHtml(splitTxt)}</span>
        </div>
      `;
    })
    .join('');

  const maxSplitVol = Math.max(1, ...summary.splitBreakdown.map((s) => s.volume));
  const splitRowsHtml =
    summary.splitBreakdown.length > 0
      ? summary.splitBreakdown
          .map((s) => {
            const wPct = Math.max(6, Math.round((s.volume / maxSplitVol) * 100));
            return `
              <div class="split-bal-row">
                <div class="split-bal-head">
                  <strong>${escapeHtml(s.split)} <small style="font-weight:500;color:var(--ink-muted)">(${s.sets} sets · ${s.sessions}d)</small></strong>
                  <span>${formatLbs(s.volume)}</span>
                </div>
                <div class="split-bal-track">
                  <div class="split-bal-fill" style="width:${wPct}%; background:${s.color}"></div>
                </div>
              </div>
            `;
          })
          .join('')
      : `<p class="helper-para">No workouts logged in this week yet.</p>`;

  const trendWeeks = calculateMultiWeekTrend(
    state.workouts,
    state.selectedWeekMonday,
    state.bodyweight,
    4
  );
  const trendRowsHtml = trendWeeks
    .slice()
    .reverse()
    .map((tw) => {
      const scoreBadge =
        tw.sessionCount > 0
          ? `<strong style="color:${tw.badgeColor}">${tw.hardnessScore.toFixed(1)}/10</strong>`
          : `<span style="color:var(--ink-muted)">Rest</span>`;
      return `
        <div class="history-row" data-jump-week="${escapeHtml(tw.weekMondayISO)}" style="cursor:pointer">
          <div>
            <strong>${escapeHtml(tw.label)}</strong>
            ${tw.isSelected ? `<span class="nb-rpe-tag" style="margin-left:5px">(viewing)</span>` : ''}
            <span style="display:block;font-size:0.73rem;color:var(--ink-muted)">
              ${tw.sessionCount} workout${tw.sessionCount === 1 ? '' : 's'} · ${tw.totalSets} sets
            </span>
          </div>
          <div style="text-align:right">
            <strong>${formatLbs(tw.totalVolume)}</strong>
            <span style="display:block;font-size:0.74rem">Hardness: ${scoreBadge}</span>
          </div>
        </div>
      `;
    })
    .join('');

  const topLiftsHtml =
    summary.topLifts.length > 0
      ? `<div class="top-lifts-grid">
          ${summary.topLifts
            .map(
              (l) => `
              <div class="lift-pr-box">
                <div class="lift-pr-name">${escapeHtml(l.name)}</div>
                <div class="lift-pr-1rm">Est. 1RM: ${l.est1RM} lb</div>
                <div class="lift-pr-detail">Best: ${escapeHtml(l.weightDisplay)} × ${l.reps} (${l.sets}s)</div>
              </div>
            `
            )
            .join('')}
         </div>`
      : `<p class="helper-para">Log weighted sets to see your estimated 1-rep maxes.</p>`;

  container.innerHTML = `
    <div class="report-stack">
      <!-- 1. Weekly Hardness Estimate Card -->
      <div class="report-card">
        <div class="card-eyebrow">End-of-Week Effort &amp; Hardness Estimate</div>
        <div class="hardness-hero">
          <div class="gauge-box">
            <svg class="gauge-svg" viewBox="0 0 108 108">
              <circle cx="54" cy="54" r="${radius}" fill="none" stroke="var(--bg-subtle)" stroke-width="10" />
              <circle
                cx="54"
                cy="54"
                r="${radius}"
                fill="none"
                stroke="${h.badgeColor}"
                stroke-width="10"
                stroke-linecap="round"
                stroke-dasharray="${circumference.toFixed(2)}"
                stroke-dashoffset="${dashOffset.toFixed(2)}"
              />
            </svg>
            <div class="gauge-center">
              <span class="gauge-score">${summary.sessionCount > 0 ? h.score.toFixed(1) : '—'}</span>
              <span class="gauge-max">out of 10</span>
            </div>
          </div>

          <div class="hardness-summary">
            <span class="tier-pill" style="background:${h.badgeColor}">${escapeHtml(h.tier)}</span>
            <p class="hardness-headline">${escapeHtml(h.headline)}</p>
          </div>
        </div>

        <div class="coaching-callout">
          ${escapeHtml(h.coachingNote)}
        </div>

        <div class="factor-list">
          ${h.factors
            .map(
              (f) => `
              <div class="factor-item">
                <div class="factor-top">
                  <span class="factor-name">${escapeHtml(f.label)}</span>
                  <span class="factor-val">${escapeHtml(f.valueLabel)}</span>
                </div>
                <div class="factor-bar-track">
                  <div class="factor-bar-fill" style="width:${f.pct}%; background:${h.badgeColor}"></div>
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      </div>

      <!-- 2. Total Weekly Volume Card -->
      <div class="report-card">
        <div class="card-eyebrow">End-of-Week Total Volume (${escapeHtml(summary.weekLabel)})</div>
        <div class="vol-hero-row">
          <span class="vol-big-number">${formatLbs(summary.totalVolume)}</span>
          ${deltaHtml}
        </div>

        <div class="vol-subgrid">
          <div class="mini-stat">
            <span>Iron / Plates</span>
            <strong>${formatLbs(summary.externalVolume)}</strong>
          </div>
          <div class="mini-stat">
            <span>BW Component</span>
            <strong>${formatLbs(summary.bwVolume)}</strong>
          </div>
          <div class="mini-stat">
            <span>Sets · Reps</span>
            <strong>${summary.totalSets}s · ${summary.totalReps}r</strong>
          </div>
        </div>
      </div>

      <!-- 3. Daily Volume Distribution -->
      <div class="report-card">
        <div class="card-eyebrow">Daily Volume (Mon – Sun)</div>
        <div class="daily-bars">
          ${dailyBarsHtml}
        </div>
      </div>

      <!-- 4. Split Balance -->
      <div class="report-card">
        <div class="card-eyebrow">Volume &amp; Sets by Split</div>
        <div class="split-balance-list">
          ${splitRowsHtml}
        </div>
      </div>

      <!-- 5. Top Strength Lifts -->
      <div class="report-card">
        <div class="card-eyebrow">Estimated Strength Landmarks (Epley 1RM)</div>
        ${topLiftsHtml}
      </div>

      <!-- 6. 4-Week Volume & Hardness History -->
      <div class="report-card">
        <div class="card-eyebrow">4-Week Volume &amp; Hardness Comparison</div>
        <div>${trendRowsHtml}</div>
      </div>
    </div>
  `;
}

/* ---------- TAB 3: Exercise Progression & Data Backup ---------- */

function renderLiftsView() {
  const container = document.getElementById('lifts-container');

  const liftMap = new Map();
  const sortedWorkouts = [...state.workouts].sort((a, b) => a.date.localeCompare(b.date));

  for (const w of sortedWorkouts) {
    const computed = calculateWorkoutMetrics(w, state.bodyweight);
    for (const ex of computed.exercises) {
      if (!ex.name) continue;
      const key = ex.name.trim().toLowerCase();
      if (!liftMap.has(key)) {
        liftMap.set(key, { name: ex.name.trim(), entries: [] });
      }
      liftMap.get(key).entries.push({
        date: w.date,
        split: w.split,
        summaryScheme: ex.summaryScheme,
        sets: ex.sets,
        volume: ex.volume,
        est1RM: Math.round(ex.est1RM)
      });
    }
  }

  const liftKeys = Array.from(liftMap.keys());
  if (!state.selectedLiftFilter || !liftMap.has(state.selectedLiftFilter)) {
    state.selectedLiftFilter = liftKeys[0] || '';
  }

  const activeLift = liftMap.get(state.selectedLiftFilter);

  const optionsHtml = liftKeys
    .map((k) => {
      const item = liftMap.get(k);
      return `<option value="${escapeHtml(k)}" ${k === state.selectedLiftFilter ? 'selected' : ''}>
        ${escapeHtml(item.name)} (${item.entries.length}×)
      </option>`;
    })
    .join('');

  const historyHtml = activeLift
    ? [...activeLift.entries]
        .reverse()
        .map(
          (e) => `
          <div class="history-row">
            <div style="padding-right:8px">
              <strong>${escapeHtml(formatShortDate(e.date))}</strong>
              <span style="color:var(--ink-muted); margin-left:6px; font-size:0.8rem">${escapeHtml(e.summaryScheme)}</span>
            </div>
            <div style="text-align:right; flex-shrink:0">
              <strong>${formatLbs(e.volume)}</strong>
              <span style="display:block;font-size:0.71rem;color:var(--ink-muted)">Est 1RM: ${e.est1RM} lb</span>
            </div>
          </div>
        `
        )
        .join('')
    : `<p class="helper-para">Log your first workout to track lift progression over time.</p>`;

  container.innerHTML = `
    <div class="report-stack">
      <div class="report-card">
        <div class="card-eyebrow">Exercise Progression</div>
        ${
          liftKeys.length > 0
            ? `<label class="field-label" style="margin-bottom:10px">
                <span>Select Lift</span>
                <select id="select-lift-history" class="text-input">${optionsHtml}</select>
               </label>
               <div>${historyHtml}</div>`
            : historyHtml
        }
      </div>

      <div class="report-card">
        <div class="card-eyebrow">Phone Setup &amp; Backup</div>
        <p class="helper-para">
          Your workouts save privately on your phone browser (offline-ready). On iPhone Safari tap <strong>Share → Add to Home Screen</strong>, or on Android Chrome tap <strong>Install App</strong> for 1-tap gym access.
        </p>

        <div class="data-btn-grid">
          <button type="button" class="btn-outline" id="btn-export-json">Export JSON</button>
          <button type="button" class="btn-outline" id="btn-export-csv">Export CSV</button>
          <button type="button" class="btn-outline" id="btn-import-json-trigger">Import JSON</button>
          <button type="button" class="btn-outline" id="btn-restore-sample">Reload Sample</button>
        </div>
        <input type="file" id="input-import-file" accept="application/json,.json" hidden />

        <div style="margin-top:10px">
          <button type="button" class="btn-outline danger" style="width:100%" id="btn-clear-all">
            Clear All Workouts (Start Blank)
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Workout Composer Modal ---------- */

function openWorkoutModal({ editWorkout = null, presetSplit = null } = {}) {
  if (editWorkout) {
    draftWorkout = {
      editingId: editWorkout.id,
      date: editWorkout.date,
      split: editWorkout.split || 'Push',
      rpe: editWorkout.rpe != null ? String(editWorkout.rpe) : '',
      notes: editWorkout.notes || '',
      rows: (editWorkout.exercises || []).map((ex) => ({
        id: ex.id || uid('row'),
        name: ex.name || '',
        setGroups: toDraftSetGroups(ex)
      }))
    };
    document.getElementById('modal-title').textContent = 'Edit Workout';
  } else {
    const defaultDate =
      state.selectedWeekMonday === currentMondayISO ? todayISO : state.selectedWeekMonday;
    const split = presetSplit || 'Push';
    draftWorkout = {
      editingId: null,
      date: defaultDate,
      split,
      rpe: '8',
      notes: '',
      rows: [createBlankRow(8, 3), createBlankRow(10, 3), createBlankRow(10, 3)]
    };
    document.getElementById('modal-title').textContent = 'Log Workout';
  }

  document.getElementById('input-workout-date').value = draftWorkout.date;
  document.getElementById('input-workout-split').value = draftWorkout.split;
  document.getElementById('input-workout-notes').value = draftWorkout.notes;

  syncRpeChipsUI();
  renderComposerSplitContext();
  renderComposerRows();
  updateModalLiveSummary();

  document.getElementById('workout-modal').hidden = false;
}

function closeWorkoutModal() {
  document.getElementById('workout-modal').hidden = true;
}

function renderComposerSplitContext() {
  const split = draftWorkout.split;
  const lastSame = getLastWorkoutForSplit(split, draftWorkout.editingId);
  const banner = document.getElementById('copy-last-banner');

  if (lastSame && !draftWorkout.editingId) {
    banner.hidden = false;
    document.getElementById('copy-last-text').textContent =
      `Repeat ${lastSame.exercises.length} exercises from last ${split} (${formatShortDate(lastSame.date)})?`;
  } else {
    banner.hidden = true;
  }

  const suggestions = SPLIT_META[split]?.suggestions || [
    'Chest press',
    'Barbell rows',
    'Squats',
    'Pull ups',
    'Shoulder press dumbbell'
  ];

  document.getElementById('exercise-suggestions').innerHTML = suggestions
    .map(
      (name) =>
        `<button type="button" class="sug-chip" data-pick-exercise="${escapeHtml(name)}">+ ${escapeHtml(name)}</button>`
    )
    .join('');
}

function renderComposerRows() {
  const container = document.getElementById('composer-rows');
  container.innerHTML = draftWorkout.rows
    .map((row, idx) => {
      const calc = calculateExerciseMetrics(row, state.bodyweight);
      const last = getLastExerciseEntry(row.name, draftWorkout.editingId);
      const lastHint = last ? `Last: ${last.summaryScheme}` : '';
      const isMulti = row.setGroups.length > 1;

      const setGroupsHtml = row.setGroups
        .map((sg, sgIdx) => {
          const headHtml = isMulti
            ? `<div class="set-group-head">
                <span>Set / Weight #${sgIdx + 1}</span>
                <button type="button" class="btn-remove-setgroup" data-remove-setgroup="${escapeHtml(sg.id)}" data-row="${escapeHtml(row.id)}">Remove</button>
               </div>`
            : '';

          return `
            <div class="set-group-card" data-sg-id="${escapeHtml(sg.id)}">
              ${headHtml}
              <div class="comp-metrics-line">
                <label class="mini-field">
                  <span>Weight (lb or bw+45)</span>
                  <input
                    type="text"
                    inputmode="text"
                    placeholder="200 or bw"
                    value="${escapeHtml(sg.weight)}"
                    data-sg="${escapeHtml(sg.id)}"
                    data-field="weight"
                  />
                </label>
                <label class="mini-field">
                  <span>Reps</span>
                  <input
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="200"
                    placeholder="8"
                    value="${escapeHtml(sg.reps)}"
                    data-sg="${escapeHtml(sg.id)}"
                    data-field="reps"
                  />
                </label>
                <label class="mini-field">
                  <span>Sets</span>
                  <input
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="30"
                    placeholder="1"
                    value="${escapeHtml(sg.sets)}"
                    data-sg="${escapeHtml(sg.id)}"
                    data-field="sets"
                  />
                </label>
              </div>
              <div class="comp-helpers-line">
                <button type="button" class="tiny-helper-btn" data-weight-preset="bw" data-row="${escapeHtml(row.id)}" data-sg="${escapeHtml(sg.id)}">bw</button>
                <button type="button" class="tiny-helper-btn" data-weight-preset="bw + 25" data-row="${escapeHtml(row.id)}" data-sg="${escapeHtml(sg.id)}">bw +</button>
                <button type="button" class="tiny-helper-btn ${sg.perHand ? 'active' : ''}" data-toggle-pair="${escapeHtml(sg.id)}" data-row="${escapeHtml(row.id)}">×2 DB</button>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="composer-row" data-row-id="${escapeHtml(row.id)}">
          <div class="comp-top-line">
            <input
              type="text"
              class="comp-name-input"
              list="all-exercises-datalist"
              placeholder="Exercise #${idx + 1} (e.g. Chest press)"
              value="${escapeHtml(row.name)}"
              data-field="name"
            />
            <span class="comp-vol-badge" data-row-vol>${formatLbs(calc.volume)}</span>
            <button type="button" class="btn-remove-row" data-remove-row="${escapeHtml(row.id)}" aria-label="Remove exercise">×</button>
          </div>

          <div class="set-groups-stack">
            ${setGroupsHtml}
          </div>

          <div class="comp-footer-line">
            <button type="button" class="btn-add-setgroup" data-add-setgroup="${escapeHtml(row.id)}">
              + Diff Weight / Reps
            </button>
            <span class="last-hint" data-row-hint>${escapeHtml(lastHint)}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function updateModalLiveSummary() {
  const validRows = draftWorkout.rows.filter((r) => r.name && String(r.name).trim());
  const metrics = calculateWorkoutMetrics({ exercises: validRows }, state.bodyweight);
  document.getElementById('modal-live-summary').textContent =
    `${validRows.length} exercise${validRows.length === 1 ? '' : 's'} · ${metrics.totalSets} sets · ${formatLbs(metrics.totalVolume)}`;
}

function syncRpeChipsUI() {
  const labelMap = {
    '': 'Auto-estimate',
    '6': 'Easy (6/10)',
    '7.5': 'Moderate (7.5/10)',
    '8': 'Hard (8/10)',
    '9': 'Heavy (9/10)',
    '10': 'Max Effort (10/10)'
  };
  document.getElementById('rpe-selected-label').textContent =
    labelMap[draftWorkout.rpe] || `RPE ${draftWorkout.rpe}`;

  document.querySelectorAll('#rpe-chips .rpe-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.rpe === draftWorkout.rpe);
  });
}

/* ---------- Event Listeners ---------- */

function bindEvents() {
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      renderApp();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });

  document.getElementById('btn-pulse-ribbon').addEventListener('click', () => {
    state.activeTab = 'week';
    renderApp();
  });

  document.getElementById('weekly-report-container').addEventListener('click', (e) => {
    const row = e.target.closest('[data-jump-week]');
    if (row && row.dataset.jumpWeek) {
      state.selectedWeekMonday = row.dataset.jumpWeek;
      renderApp();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'notebook' : 'dark';
    saveState(true);
    applyTheme();
  });

  document.getElementById('btn-prev-week').addEventListener('click', () => {
    state.selectedWeekMonday = shiftDays(state.selectedWeekMonday, -7);
    renderApp();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    state.selectedWeekMonday = shiftDays(state.selectedWeekMonday, 7);
    renderApp();
  });
  document.getElementById('btn-jump-this-week').addEventListener('click', () => {
    state.selectedWeekMonday = currentMondayISO;
    renderApp();
  });

  document.getElementById('btn-edit-bw').addEventListener('click', () => {
    document.getElementById('input-bw').value = state.bodyweight;
    document.getElementById('bw-modal').hidden = false;
    setTimeout(() => document.getElementById('input-bw').focus(), 40);
  });
  const closeBw = () => {
    document.getElementById('bw-modal').hidden = true;
  };
  document.getElementById('btn-close-bw').addEventListener('click', closeBw);
  document.getElementById('btn-cancel-bw').addEventListener('click', closeBw);
  document.getElementById('bw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseFloat(document.getElementById('input-bw').value);
    if (val >= 50 && val <= 600) {
      state.bodyweight = val;
      saveState(true);
      closeBw();
      renderApp();
      showToast(`Bodyweight set to ${formatNum(val)} lb`);
    }
  });

  document.getElementById('btn-open-new-workout').addEventListener('click', () => {
    openWorkoutModal();
  });

  document.querySelectorAll('[data-quick-split]').forEach((chip) => {
    chip.addEventListener('click', () => {
      openWorkoutModal({ presetSplit: chip.dataset.quickSplit });
    });
  });

  document.getElementById('workout-list').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-workout]');
    if (editBtn) {
      const target = state.workouts.find((w) => w.id === editBtn.dataset.editWorkout);
      if (target) openWorkoutModal({ editWorkout: target });
      return;
    }

    const delBtn = e.target.closest('[data-delete-workout]');
    if (delBtn) {
      const id = delBtn.dataset.deleteWorkout;
      const target = state.workouts.find((w) => w.id === id);
      if (target && window.confirm(`Delete ${target.split} workout on ${formatShortDate(target.date)}?`)) {
        state.workouts = state.workouts.filter((w) => w.id !== id);
        saveState(true);
        renderApp();
        showToast('Workout deleted');
      }
    }
  });

  document.getElementById('lifts-container').addEventListener('change', (e) => {
    if (e.target.id === 'select-lift-history') {
      state.selectedLiftFilter = e.target.value;
      renderLiftsView();
    }
    if (e.target.id === 'input-import-file') {
      handleImportJson(e.target.files?.[0]);
    }
  });

  document.getElementById('lifts-container').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'btn-export-json') {
      downloadFile(
        `ironnote-backup-${todayISO}.json`,
        JSON.stringify({ bodyweight: state.bodyweight, workouts: state.workouts }, null, 2),
        'application/json'
      );
      showToast('Exported JSON backup');
    } else if (btn.id === 'btn-export-csv') {
      exportCsv();
      showToast('Exported CSV spreadsheet');
    } else if (btn.id === 'btn-import-json-trigger') {
      document.getElementById('input-import-file')?.click();
    } else if (btn.id === 'btn-restore-sample') {
      if (window.confirm('Load the starter Push / Pull / Leg notebook workouts?')) {
        state.workouts = createNotebookSeedWorkouts(todayISO);
        state.selectedWeekMonday = currentMondayISO;
        saveState(true);
        state.activeTab = 'log';
        renderApp();
        showToast('Notebook sample loaded');
      }
    } else if (btn.id === 'btn-clear-all') {
      if (window.confirm('Clear all logged workouts and start with a blank notebook?')) {
        state.workouts = [];
        saveState(true);
        renderApp();
        showToast('Cleared all workouts');
      }
    }
  });

  // Modal controls
  document.getElementById('btn-close-modal').addEventListener('click', closeWorkoutModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeWorkoutModal);

  document.getElementById('input-workout-date').addEventListener('change', (e) => {
    draftWorkout.date = e.target.value || todayISO;
  });

  document.getElementById('input-workout-split').addEventListener('change', (e) => {
    draftWorkout.split = e.target.value;
    renderComposerSplitContext();
  });

  document.getElementById('input-workout-notes').addEventListener('input', (e) => {
    draftWorkout.notes = e.target.value;
  });

  // Copy last same-split template (preserves multi-set weights & reps!)
  document.getElementById('btn-copy-last').addEventListener('click', () => {
    const lastSame = getLastWorkoutForSplit(draftWorkout.split, draftWorkout.editingId);
    if (!lastSame) return;
    draftWorkout.rows = lastSame.exercises.map((ex) => ({
      id: uid('row'),
      name: ex.name,
      setGroups: toDraftSetGroups(ex)
    }));
    renderComposerRows();
    updateModalLiveSummary();
    document.getElementById('copy-last-banner').hidden = true;
    showToast(`Copied ${lastSame.exercises.length} exercises from last ${draftWorkout.split}`);
  });

  // Quick suggestion chips
  document.getElementById('exercise-suggestions').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-pick-exercise]');
    if (!chip) return;
    const exName = chip.dataset.pickExercise;
    const last = getLastExerciseEntry(exName, draftWorkout.editingId);

    const blankRow = draftWorkout.rows.find((r) => !r.name || !r.name.trim());
    if (blankRow) {
      blankRow.name = exName;
      if (last) {
        blankRow.setGroups = toDraftSetGroups(last);
      }
    } else {
      draftWorkout.rows.push({
        id: uid('row'),
        name: exName,
        setGroups: last
          ? toDraftSetGroups(last)
          : [{ id: uid('sg'), weight: '', reps: 10, sets: 3, perHand: false }]
      });
    }
    renderComposerRows();
    updateModalLiveSummary();
  });

  // Composer rows live input
  document.getElementById('composer-rows').addEventListener('input', (e) => {
    const rowEl = e.target.closest('.composer-row');
    if (!rowEl) return;
    const row = draftWorkout.rows.find((r) => r.id === rowEl.dataset.rowId);
    if (!row) return;

    const field = e.target.dataset.field;
    if (field === 'name') {
      row.name = e.target.value;
      const last = getLastExerciseEntry(row.name, draftWorkout.editingId);
      const hintEl = rowEl.querySelector('[data-row-hint]');
      if (hintEl) {
        hintEl.textContent = last ? `Last: ${last.summaryScheme}` : '';
      }
    } else if (e.target.dataset.sg) {
      const sg = row.setGroups.find((g) => g.id === e.target.dataset.sg);
      if (sg) {
        if (field === 'weight') sg.weight = e.target.value;
        else if (field === 'reps') sg.reps = e.target.value;
        else if (field === 'sets') sg.sets = e.target.value;
      }
    }

    const calc = calculateExerciseMetrics(row, state.bodyweight);
    const badge = rowEl.querySelector('[data-row-vol]');
    if (badge) badge.textContent = formatLbs(calc.volume);
    updateModalLiveSummary();
  });

  // Composer rows button clicks (add/remove set group, presets, remove exercise)
  document.getElementById('composer-rows').addEventListener('click', (e) => {
    const addSgBtn = e.target.closest('[data-add-setgroup]');
    if (addSgBtn) {
      const row = draftWorkout.rows.find((r) => r.id === addSgBtn.dataset.addSetgroup);
      if (!row) return;
      const prev = row.setGroups[row.setGroups.length - 1] || {
        weight: '',
        reps: 8,
        perHand: false
      };
      const newSgId = uid('sg');
      row.setGroups.push({
        id: newSgId,
        weight: prev.weight,
        reps: prev.reps,
        sets: 1,
        perHand: Boolean(prev.perHand)
      });
      renderComposerRows();
      updateModalLiveSummary();
      const inputToFocus = document.querySelector(`[data-sg="${newSgId}"][data-field="weight"]`);
      if (inputToFocus) inputToFocus.focus();
      return;
    }

    const remSgBtn = e.target.closest('[data-remove-setgroup]');
    if (remSgBtn) {
      const row = draftWorkout.rows.find((r) => r.id === remSgBtn.dataset.row);
      if (!row || row.setGroups.length <= 1) return;
      row.setGroups = row.setGroups.filter((g) => g.id !== remSgBtn.dataset.removeSetgroup);
      renderComposerRows();
      updateModalLiveSummary();
      return;
    }

    const remBtn = e.target.closest('[data-remove-row]');
    if (remBtn) {
      const id = remBtn.dataset.removeRow;
      draftWorkout.rows = draftWorkout.rows.filter((r) => r.id !== id);
      if (draftWorkout.rows.length === 0) {
        draftWorkout.rows.push(createBlankRow(10, 3));
      }
      renderComposerRows();
      updateModalLiveSummary();
      return;
    }

    const presetBtn = e.target.closest('[data-weight-preset]');
    if (presetBtn) {
      const row = draftWorkout.rows.find((r) => r.id === presetBtn.dataset.row);
      const sg = row?.setGroups.find((g) => g.id === presetBtn.dataset.sg);
      if (!sg) return;
      sg.weight = presetBtn.dataset.weightPreset;
      sg.perHand = false;
      renderComposerRows();
      updateModalLiveSummary();
      return;
    }

    const pairBtn = e.target.closest('[data-toggle-pair]');
    if (pairBtn) {
      const row = draftWorkout.rows.find((r) => r.id === pairBtn.dataset.row);
      const sg = row?.setGroups.find((g) => g.id === pairBtn.dataset.togglePair);
      if (!sg) return;
      sg.perHand = !sg.perHand;
      renderComposerRows();
      updateModalLiveSummary();
    }
  });

  document.getElementById('btn-add-exercise-row').addEventListener('click', () => {
    draftWorkout.rows.push(createBlankRow(10, 3));
    renderComposerRows();
  });

  document.getElementById('rpe-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.rpe-chip');
    if (!chip) return;
    draftWorkout.rpe = chip.dataset.rpe;
    syncRpeChipsUI();
  });

  // Save Workout Submit
  document.getElementById('workout-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const cleanedExercises = draftWorkout.rows
      .filter((r) => r.name && String(r.name).trim())
      .map((r) => {
        const cleanedGroups = (r.setGroups || []).map((sg) => ({
          id: sg.id || uid('sg'),
          weight: String(sg.weight || 'bw').trim(),
          reps: Math.max(1, parseInt(sg.reps, 10) || 1),
          sets: Math.max(1, parseInt(sg.sets, 10) || 1),
          perHand: Boolean(sg.perHand)
        }));
        const first = cleanedGroups[0] || { weight: 'bw', reps: 1, sets: 1, perHand: false };
        return {
          id: r.id || uid('ex'),
          name: String(r.name).trim(),
          weight: first.weight,
          reps: first.reps,
          sets: cleanedGroups.reduce((s, g) => s + g.sets, 0),
          perHand: first.perHand,
          setGroups: cleanedGroups
        };
      });

    if (cleanedExercises.length === 0) {
      showToast('Add at least 1 exercise name first');
      return;
    }

    const workoutDate = draftWorkout.date || todayISO;
    const rpeVal = draftWorkout.rpe ? parseFloat(draftWorkout.rpe) : null;

    if (draftWorkout.editingId) {
      state.workouts = state.workouts.map((w) =>
        w.id === draftWorkout.editingId
          ? {
              ...w,
              date: workoutDate,
              split: draftWorkout.split,
              rpe: rpeVal,
              notes: draftWorkout.notes.trim(),
              exercises: cleanedExercises
            }
          : w
      );
      showToast('Updated workout');
    } else {
      state.workouts.push({
        id: uid('wk'),
        date: workoutDate,
        split: draftWorkout.split,
        rpe: rpeVal,
        notes: draftWorkout.notes.trim(),
        createdAt: Date.now(),
        exercises: cleanedExercises
      });
      showToast(`Saved ${draftWorkout.split} workout`);
    }

    state.selectedWeekMonday = getMondayOfWeek(workoutDate);
    saveState(true);
    closeWorkoutModal();
    renderApp();
  });
}

/* ---------- Import / Export Utilities ---------- */

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const lines = [
    [
      'Date',
      'Split',
      'Exercise',
      'Set Group',
      'Notebook Weight',
      'Effective Weight (lb)',
      'Reps',
      'Sets',
      'Volume (lb)',
      'Session RPE'
    ].join(',')
  ];
  const sorted = [...state.workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    const m = calculateWorkoutMetrics(w, state.bodyweight);
    for (const ex of m.exercises) {
      (ex.setGroups || []).forEach((sg, idx) => {
        lines.push(
          [
            w.date,
            `"${(w.split || '').replace(/"/g, '""')}"`,
            `"${(ex.name || '').replace(/"/g, '""')}"`,
            idx + 1,
            `"${(sg.weightInfo.displayNotebook || '').replace(/"/g, '""')}"`,
            sg.weightInfo.effectiveWeight,
            sg.reps,
            sg.sets,
            Math.round(sg.volume),
            w.rpe ?? ''
          ].join(',')
        );
      });
    }
  }
  downloadFile(`ironnote-workouts-${todayISO}.csv`, lines.join('\n'), 'text/csv');
}

function handleImportJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (parsed && Array.isArray(parsed.workouts)) {
        if (Number(parsed.bodyweight) > 0) state.bodyweight = Number(parsed.bodyweight);
        state.workouts = parsed.workouts;
        saveState(true);
        renderApp();
        showToast(`Imported ${parsed.workouts.length} workouts`);
      } else {
        showToast('Invalid backup JSON format');
      }
    } catch {
      showToast('Could not read JSON file');
    }
  };
  reader.readAsText(file);
}

/* ---------- Boot ---------- */

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

bindEvents();
initData().then(() => {
  renderApp();
});

})();
