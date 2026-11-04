/**
 * IronNote Workout Engine
 * Pure calculation & parsing logic for notebook-style workout logging,
 * bodyweight ("bw", "bw + 45 lb") load resolution, weekly volume tracking,
 * and evidence-based Weekly Hardness estimation.
 */

export const DEFAULT_BODYWEIGHT = 175;

export const SPLIT_META = {
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
export function parseWeightSpec(rawInput, bodyweight = DEFAULT_BODYWEIGHT, perHand = false) {
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

export function formatNum(n) {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '');
}

export function formatLbs(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-US')} lb`;
}

/**
 * Normalize an exercise entry so it always has a `setGroups` array, supporting both:
 * 1) Single weight/reps/sets line: { name, weight: '200 lb', reps: 8, sets: 3 }
 * 2) Multiple different weight & reps sets for the same exercise:
 *    { name, setGroups: [{ weight: '185 lb', reps: 10, sets: 1 }, { weight: '205 lb', reps: 8, sets: 2 }] }
 */
export function normalizeSetGroups(entry) {
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

export function calculateSetGroupMetrics(sg, bodyweight = DEFAULT_BODYWEIGHT) {
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
export function calculateExerciseMetrics(entry, bodyweight = DEFAULT_BODYWEIGHT) {
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
export function calculateWorkoutMetrics(workout, bodyweight = DEFAULT_BODYWEIGHT) {
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
export function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(isoStr) {
  const [y, m, d] = String(isoStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function getMondayOfWeek(isoDateStr) {
  const d = parseISODate(isoDateStr);
  const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toISODate(d);
}

export function shiftDays(isoDateStr, deltaDays) {
  const d = parseISODate(isoDateStr);
  d.setDate(d.getDate() + deltaDays);
  return toISODate(d);
}

export function formatShortDate(isoDateStr) {
  const d = parseISODate(isoDateStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}`;
}

export function formatReadableDate(isoDateStr) {
  const d = parseISODate(isoDateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function formatWeekRange(mondayISO) {
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
export function calculateMultiWeekTrend(
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
export function calculateWeeklySummary(
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
export function createNotebookSeedWorkouts(referenceTodayISO) {
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
