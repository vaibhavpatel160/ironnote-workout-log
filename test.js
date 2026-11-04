import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseWeightSpec,
  calculateExerciseMetrics,
  calculateMultiWeekTrend,
  calculateWeeklySummary,
  createNotebookSeedWorkouts,
  getMondayOfWeek
} from './workout-engine.js';
import { createAppServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parseWeightSpec handles standard, bw, bw + added, assisted, and pair notations', () => {
  const std = parseWeightSpec('200 lb', 175);
  assert.equal(std.effectiveWeight, 200);
  assert.equal(std.externalWeight, 200);
  assert.equal(std.bwComponent, 0);
  assert.equal(std.displayNotebook, '200 lb');

  const pureBw = parseWeightSpec('bw', 180);
  assert.equal(pureBw.effectiveWeight, 180);
  assert.equal(pureBw.externalWeight, 0);
  assert.equal(pureBw.bwComponent, 180);
  assert.equal(pureBw.displayNotebook, 'bw');

  const weightedPullup = parseWeightSpec('bw + 45 lb', 175);
  assert.equal(weightedPullup.effectiveWeight, 220);
  assert.equal(weightedPullup.externalWeight, 45);
  assert.equal(weightedPullup.bwComponent, 175);
  assert.equal(weightedPullup.displayNotebook, 'bw + 45 lb');

  const assisted = parseWeightSpec('bw - 25', 175);
  assert.equal(assisted.effectiveWeight, 150);

  const dbPair = parseWeightSpec('35 lb', 175, true);
  assert.equal(dbPair.effectiveWeight, 70);
  assert.equal(dbPair.displayNotebook, '35×2 lb');
});

test('multi-set exercise with different weights and reps aggregates volume, sets, heavy sets, and top 1RM accurately', () => {
  // Pyramid Chest press:
  // Set 1: 185 lb x 10 x 1 = 1,850 lb (est1RM = 185*(1+10/30) = 246.67)
  // Sets 2-3: 205 lb x 8 x 2 = 3,280 lb (est1RM = 205*(1+8/30) = 259.67)
  // Set 4 (heavy top set): 225 lb x 5 x 1 = 1,125 lb (heavy <=6 reps! est1RM = 225*(1+5/30) = 262.5)
  const multiEx = calculateExerciseMetrics(
    {
      name: 'Chest press',
      setGroups: [
        { weight: '185 lb', reps: 10, sets: 1 },
        { weight: '205 lb', reps: 8, sets: 2 },
        { weight: '225 lb', reps: 5, sets: 1 }
      ]
    },
    175
  );

  assert.equal(multiEx.sets, 4);
  assert.equal(multiEx.totalReps, 10 + 16 + 5);
  assert.equal(multiEx.volume, 1850 + 3280 + 1125); // 6,255 lb
  assert.equal(multiEx.heavySets, 1); // Only the 5-rep set is <=6 reps
  assert.equal(Math.round(multiEx.est1RM), 263); // 262.5 rounds to 263
  assert.equal(multiEx.bestSet.weightInfo.effectiveWeight, 225);
  assert.equal(multiEx.summaryScheme, '185 lb × 10, 205 lb × 8 × 2, 225 lb × 5');

  // Mixed weighted pull-up + bodyweight drop set:
  // Sets 1-2: bw + 45 lb (220 lb) x 4 x 2 = 1,760 lb (2 heavy sets)
  // Set 3: bw (175 lb) x 10 x 1 = 1,750 lb (0 heavy sets)
  const mixedPullup = calculateExerciseMetrics(
    {
      name: 'Pull ups',
      setGroups: [
        { weight: 'bw + 45 lb', reps: 4, sets: 2 },
        { weight: 'bw', reps: 10, sets: 1 }
      ]
    },
    175
  );
  assert.equal(mixedPullup.sets, 3);
  assert.equal(mixedPullup.volume, 1760 + 1750);
  assert.equal(mixedPullup.externalVolume, 45 * 8); // 360 lb external plates
  assert.equal(mixedPullup.bwVolume, 175 * 8 + 175 * 10); // 3,150 lb BW
  assert.equal(mixedPullup.heavySets, 2);
});

test('IMG_5501.jpeg seed workouts compute exact end-of-week volume and sensible hardness score', () => {
  const refDate = '2026-11-04'; // Wednesday
  const monday = getMondayOfWeek(refDate);
  assert.equal(monday, '2026-11-02');

  const seed = createNotebookSeedWorkouts(refDate);
  const summary = calculateWeeklySummary(seed, monday, 175);

  assert.equal(summary.sessionCount, 3);
  assert.equal(summary.totalSets, 28); // 9 Push + 10 Pull + 9 Leg
  // Push: 4800 + 2550 + 1050 = 8400
  // Pull: 3000 + 640 + (220*12=2640) + (175*24=4200) = 10480
  // Leg: 3375 + 3060 + 3600 = 10035
  assert.equal(summary.totalVolume, 28915);
  assert.equal(summary.externalVolume, 22615);
  assert.equal(summary.bwVolume, 6300);

  // Progressive overload vs seeded prior week
  assert.ok(summary.volumeDelta > 0);
  assert.ok(summary.volumeDeltaPct > 0);

  // Hardness for 3 heavy PPL sessions (28 sets, heavy squats/rows/weighted pullups) should be ~6.5 - 7.8
  assert.ok(
    summary.hardness.score >= 6.4 && summary.hardness.score <= 8.0,
    `Expected productive hard week score, got ${summary.hardness.score}`
  );
});

test('Hardness score scales monotonically from empty -> light -> PPLx1 -> high-volume PPLx2', () => {
  const monday = '2026-11-02';
  const empty = calculateWeeklySummary([], monday, 175);
  assert.equal(empty.hardness.score, 0);

  const oneLight = calculateWeeklySummary(
    [
      {
        id: 'w1',
        date: '2026-11-02',
        split: 'Push',
        rpe: 6,
        exercises: [{ name: 'Tricep push down', weight: '50', reps: 12, sets: 3 }]
      }
    ],
    monday,
    175
  );

  const seed = createNotebookSeedWorkouts('2026-11-04');
  const ppl1 = calculateWeeklySummary(seed, monday, 175);

  // Double the week to 6 sessions (PPLx2)
  const thisWeekOnly = seed.filter((w) => w.date >= monday);
  const ppl2Workouts = [
    ...thisWeekOnly,
    { ...thisWeekOnly[0], id: 'p2', date: '2026-11-05', rpe: 9 },
    { ...thisWeekOnly[1], id: 'pl2', date: '2026-11-06', rpe: 9 },
    { ...thisWeekOnly[2], id: 'lg2', date: '2026-11-07', rpe: 9 }
  ];
  const ppl2 = calculateWeeklySummary(ppl2Workouts, monday, 175);

  assert.ok(oneLight.hardness.score < ppl1.hardness.score);
  assert.ok(ppl1.hardness.score < ppl2.hardness.score);
  assert.ok(ppl2.hardness.score >= 8.3);
});

test('HTTP server serves static assets and persists state via /api/state', async () => {
  const dataFile = path.join(__dirname, 'data', 'workouts.json');
  const hadData = fs.existsSync(dataFile);
  const backup = hadData ? fs.readFileSync(dataFile, 'utf8') : null;

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('IronNote'));

    const payload = {
      bodyweight: 182,
      theme: 'notebook',
      workouts: [
        {
          id: 't1',
          date: '2026-11-04',
          split: 'Push',
          exercises: [{ name: 'Chest press', weight: '200 lb', reps: 8, sets: 3 }]
        }
      ]
    };

    const postRes = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(postRes.status, 200);

    const getRes = await fetch(`http://127.0.0.1:${port}/api/state`);
    const saved = await getRes.json();
    assert.equal(saved.bodyweight, 182);
    assert.equal(saved.workouts.length, 1);
    assert.equal(saved.workouts[0].exercises[0].name, 'Chest press');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (hadData && backup !== null) {
      fs.writeFileSync(dataFile, backup, 'utf8');
    } else if (fs.existsSync(dataFile)) {
      fs.unlinkSync(dataFile);
    }
  }
});

test('4-week trend and DOM element ID integrity between index.html and app.js', () => {
  const seed = createNotebookSeedWorkouts('2026-11-04');
  const trend = calculateMultiWeekTrend(seed, '2026-11-02', 175, 4);
  assert.equal(trend.length, 4);
  assert.equal(trend[3].isSelected, true);
  assert.equal(trend[3].totalVolume, 28915);
  assert.ok(trend[2].totalVolume > 0); // Prior week baseline

  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const combinedMarkup = html + '\n' + appJs;

  const idRefs = [...appJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.ok(idRefs.length > 20);
  for (const id of idRefs) {
    assert.ok(
      combinedMarkup.includes(`id="${id}"`),
      `Missing element id="${id}" in index.html or templates`
    );
  }
});
