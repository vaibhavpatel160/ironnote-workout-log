import {
  DEFAULT_BODYWEIGHT,
  SPLIT_META,
  calculateExerciseMetrics,
  calculateMultiWeekTrend,
  calculateWeeklySummary,
  calculateWorkoutMetrics,
  createNotebookSeedWorkouts,
  formatLbs,
  formatNum,
  formatReadableDate,
  formatShortDate,
  getMondayOfWeek,
  normalizeSetGroups,
  shiftDays,
  toISODate
} from './workout-engine.js';

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
