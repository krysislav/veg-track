'use strict';

// ─── Config ────────────────────────────────────────────────────────────────
const STORAGE_KEY  = 'vegtrack';
const TOTAL_DAYS   = 28;
const VISIBLE_COLS = 7;

const DIET_EMOJI = { meat: '🥩', dairy: '🧀', veg: '🥦' };
const VOL_EMOJI  = { low: '🔻', moderate: '▫️', high: '🔺' };           // moderate → ''

// ─── i18n ──────────────────────────────────────────────────────────────────
const LANG = navigator.language?.startsWith('ru') ? 'ru' : 'en';

const I18N = {
  ru: {
    locale: 'ru',
    chartTitle:      (a, b) => `График с ${a} по ${b}`,
    statsTitle:      'Проблемы и рекомендации',
    noData:          'Данных нет',
    notEnoughData:   'Недостаточно данных',
    allGood:         'Всё в порядке',
    getSober:        'Хватит бухать!',
    tooMuchAlcohol:  'Алкоголя многовато',
    stopJunk:        'Хватит жрать хрючево!',
    tooMuchJunk:     'Очень много вредных угощений',
    aLittleJunk:     'Немножко вредных угощений',
    timeToEat:       'Пора пожрать',
    aBitHungry:      'Лёгкое недоедание',
    overeating:      'Обжорство',
    aBitOvereating:  'Лёгкое переедание',
    stabilizeDiet:   'Питаться нужно в меру!',
    dietUnstable:    'Диета совсем разладилась 😟',
    dietShaky:       'Диета чуть-чуть нестабильная 🙃',
    todayLabel:      d => `Сегодня — ${d}`,
    editLabel:       d => `Редактировать — ${d}`,
    btnRecord:       'Записать',
    btnSave:         'Сохранить',
    legendTitle:     'Легенда',
    legendMeat:      '🥩 — мясо, 🧀 — молочка, 🥦 — овощи',
    legendVolume:    '🔻 — мало еды, 🔺 — много еды',
    legendJunk:      '💔 — была вредная пища',
    legendAlcohol:   '🍺 — был алкоголь',
    dietType:        'Тип питания',
    foodVolume:      'Объём пищи',
    junkFood:        'Вредная пища',
    alcohol:         'Алкоголь',
  },
  en: {
    locale: 'en',
    chartTitle:      (a, b) => `Stats from ${a} to ${b}`,
    statsTitle:      'Problems and Recommendations',
    noData:          'No data yet',
    notEnoughData:   'Not enough data',
    allGood:         'Everything is fine',
    getSober:        'Get sober!',
    tooMuchAlcohol:  'Too much alcohol',
    stopJunk:        'Stop eating garbage!',
    tooMuchJunk:     'Too much junk food',
    aLittleJunk:     'A little junk food',
    timeToEat:       'It\'s time to eat!',
    aBitHungry:      'A bit hungry',
    overeating:      'Significant overeating',
    aBitOvereating:  'A bit overeating',
    stabilizeDiet:   'You should really stabilize your diet!',
    dietUnstable:    'Your diet is quite unstable 😟',
    dietShaky:       'Your diet is a little shaky 🙃',
    todayLabel:      d => `Today — ${d}`,
    editLabel:       d => `Edit — ${d}`,
    btnRecord:       'Save',
    btnSave:         'Save',
    legendTitle:     'Legend',
    legendMeat:      '🥩 — meat, 🧀 — dairy, 🥦 — vegetables',
    legendVolume:    '🔻 — low food, 🔺 — high food',
    legendJunk:      '💔 — junk food was consumed',
    legendAlcohol:   '🍺 — alcohol was consumed',
    dietType:        'Diet type',
    foodVolume:      'Food volume',
    junkFood:        'Junk food',
    alcohol:         'Alcohol',
  },
};

const t = I18N[LANG];

// ─── State ─────────────────────────────────────────────────────────────────
let entries         = {};    // { 'YYYY-MM-DD': { diet, volume, junk, alcohol } }
let selectedDate    = null;  // string | null
let currentFormDate = null;  // date being edited in the form
let days         = [];    // ['YYYY-MM-DD', …]  oldest → newest (index TOTAL_DAYS-1 = today)
let currentColW  = 0;     // last rendered column width in px
let chartBuilt   = false;

// ─── DOM refs ──────────────────────────────────────────────────────────────
const $          = id => document.getElementById(id);
const chartScroll  = $('chart-scroll');
const chartTable   = $('chart');
const chartCols    = $('chart-cols');
const rowDates     = $('row-dates');
const rowDiet      = $('row-diet');
const rowVolume    = $('row-volume');
const rowJunk      = $('row-junk');
const rowAlcohol   = $('row-alcohol');
const sectionStats = $('section-stats');
const statsList    = $('stats-list');
const chartTitle   = $('chart-title');
const sectionForm  = $('section-form');
const formTitle    = $('form-title');
const entryForm    = $('entry-form');
const btnSave      = $('btn-save');
const btnTooltip   = $('form-tooltip');
const legend       = $('legend');

// ─── Animated section visibility ─────────────────────────────────────────
function showSection(el) {
  el._hiding = false;
  el.style.opacity = '0';
  el.hidden = false;
  el.getBoundingClientRect();          // force reflow
  el.style.opacity = '';               // let CSS transition take over
}

function hideSection(el, onDone) {
  if (el.hidden) { onDone?.(); return; }
  el._hiding = true;
  el.style.opacity = '0';
  el.addEventListener('transitionend', () => {
    if (el._hiding) {
      el.hidden = true;
      el.style.opacity = '';
      onDone?.();
    }
  }, { once: true });
}

function swapSections(hide, show, prepareShow) {
  hideSection(hide, () => {
    prepareShow?.();
    showSection(show);
  });
}

// ─── Date helpers ──────────────────────────────────────────────────────────

// Always use local calendar date — toISOString() returns UTC and would give
// the wrong day for UTC+ timezones before their local midnight catches up.
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const todayStr = () => localDateStr();

function buildDaysList() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = [];
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result.push(localDateStr(d));   // local date, not UTC
  }
  return result; // index 0 = oldest, last = today
}

function formatDateCell(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const mon = d.toLocaleString(t.locale, { month: 'short' }).replace('.', '');
  return `${day}<br>${mon}`;
}

// ─── Storage ───────────────────────────────────────────────────────────────
function loadEntries() {
  try {
    entries = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    entries = {};
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ─── Cell display ──────────────────────────────────────────────────────────
// Returns text to show in a chart cell.
// No entry    → '' (blank)
// Entry, null field → '—'
// Entry, set field  → emoji (or '' for neutral states: moderate, junk=no, alcohol=no)
function cellText(entry, field) {
  if (!entry) return '';
  const v = entry[field];
  if (v == null) return '';
  if (field === 'diet')    return DIET_EMOJI[v] ?? '';
  if (field === 'volume')  return VOL_EMOJI[v]  ?? '';   // moderate → ''
  if (field === 'junk')    return v === 'yes' ? '💔' : '';
  if (field === 'alcohol') return v === 'yes' ? '🍺' : '';
  return '';
}

// ─── Chart ─────────────────────────────────────────────────────────────────
function colWidth() {
  return Math.floor(chartScroll.clientWidth / VISIBLE_COLS);
}

function buildChart() {
  const cw = colWidth();
  const isFirstBuild = !chartBuilt;

  // Preserve scroll position in day-index space across rebuilds
  let targetDayIndex;
  if (isFirstBuild) {
    targetDayIndex = TOTAL_DAYS - VISIBLE_COLS;   // start showing last 7 days
  } else {
    targetDayIndex = currentColW > 0
      ? Math.round(chartScroll.scrollLeft / currentColW)
      : TOTAL_DAYS - VISIBLE_COLS;
  }
  currentColW = cw;

  // colgroup & table width
  chartCols.innerHTML = '';
  chartTable.style.width = (cw * TOTAL_DAYS) + 'px';
  days.forEach(() => {
    const col = document.createElement('col');
    col.style.width = cw + 'px';
    chartCols.appendChild(col);
  });

  // clear rows
  [rowDates, rowDiet, rowVolume, rowJunk, rowAlcohol]
    .forEach(r => { r.innerHTML = ''; });

  // fill rows
  days.forEach((dateStr, i) => {
    const entry = entries[dateStr] ?? null;

    const th = document.createElement('th');
    th.className = 'chart-cell chart-cell--date';
    th.dataset.col = i;
    th.innerHTML = formatDateCell(dateStr);   // safe: date generated internally
    rowDates.appendChild(th);

    [
      [rowDiet,    'diet'],
      [rowVolume,  'volume'],
      [rowJunk,    'junk'],
      [rowAlcohol, 'alcohol'],
    ].forEach(([row, field]) => {
      const td = document.createElement('td');
      td.className = 'chart-cell';
      td.dataset.col = i;
      td.dataset.row = field;
      td.textContent = cellText(entry, field);
      row.appendChild(td);
    });
  });

  if (isFirstBuild) {
    chartScroll.scrollLeft = 999999;  // scroll to end (today) on first load
  } else {
    chartScroll.scrollLeft = targetDayIndex * cw;  // restore previous position
  }
  chartBuilt = true;

  // re-apply selection highlight if a date is selected
  if (selectedDate !== null) {
    const sel = days.indexOf(selectedDate);
    if (sel !== -1) highlightColumn(sel);
  }
}

// ─── Column selection ──────────────────────────────────────────────────────
function selectColumn(colIndex) {
  const dateStr = days[colIndex];

  if (selectedDate === dateStr) {
    selectedDate = null;
    clearColumnHighlight();
    updateFormVisibility();
    return;
  }

  selectedDate = dateStr;
  clearColumnHighlight();
  highlightColumn(colIndex);
  updateFormVisibility();
}

function clearColumnHighlight() {
  chartTable.querySelectorAll('.chart-cell--selected')
    .forEach(el => el.classList.remove('chart-cell--selected'));
}

function highlightColumn(colIndex) {
  chartTable.querySelectorAll(`[data-col="${colIndex}"]`)
    .forEach(el => el.classList.add('chart-cell--selected'));
}

// ─── Stats ─────────────────────────────────────────────────────────────────
// Returns the array of date strings currently visible in the scroll viewport.
function visiblePeriod() {
  const cw = currentColW || colWidth();
  const firstCol = Math.round(chartScroll.scrollLeft / cw);
  const start = Math.max(0, Math.min(firstCol, TOTAL_DAYS - VISIBLE_COLS));
  return days.slice(start, start + VISIBLE_COLS);
}

function updateChartTitle() {
  const period = visiblePeriod();
  if (!period.length) return;
  const fmt = d => new Date(d + 'T00:00:00')
    .toLocaleString(t.locale, { day: 'numeric', month: 'short' })
    .replace('.', '');
  chartTitle.textContent = t.chartTitle(fmt(period[0]), fmt(period[period.length - 1]));
}

function isUnstable(entry) {
  return entry?.volume === 'low' || entry?.volume === 'high';
}

function renderStats() {
  // ── count filled days in the visible period ───────────────────────────
  const period  = visiblePeriod();
  const pe      = period.map(d => entries[d] ?? null);
  const filled  = pe.filter(Boolean).length;

  statsList.innerHTML = '';

  if (filled === 0) {
    const li = document.createElement('li');
    li.textContent = '⚫️ ' + t.noData;
    statsList.appendChild(li);
    return;
  }

  if (filled < 3) {
    const li = document.createElement('li');
    li.textContent = '⚫️ ' + t.notEnoughData;
    statsList.appendChild(li);
    return;
  }

  const warnings = [];   // { level: 'red'|'orange', text: string }

  // ── "in a row" rules: within the visible period ─────────────────────────
  const alcoholDays = pe.filter(e => e?.alcohol === 'yes').length;
  const junkDays    = pe.filter(e => e?.junk    === 'yes').length;
  const lowDays     = pe.filter(e => e?.volume  === 'low').length;
  const highDays    = pe.filter(e => e?.volume  === 'high').length;
  const instPoints  = pe.reduce((s, e) => s + (isUnstable(e) ? 1 : 0), 0);

  // alcohol
  if (alcoholDays >= 4) {
    warnings.push({ level: 'critical',    text: t.getSober });
  } else if (alcoholDays >= 2) {
    warnings.push({ level: 'orange', text: t.tooMuchAlcohol });
  }

  // junk food
  if (junkDays >= 6) {
    warnings.push({ level: 'critical',    text: t.stopJunk });
  } else if (junkDays >= 5) {
    warnings.push({ level: 'orange',    text: t.tooMuchJunk });
  } else if (junkDays >= 3) {
    warnings.push({ level: 'yellow', text: t.aLittleJunk });
  }

  const nutritionalPoints = highDays - lowDays;

  // under-eating
  if (nutritionalPoints <= -4) {
    warnings.push({ level: 'red', text: t.timeToEat });
  } else if (nutritionalPoints <= -2) {
    warnings.push({ level: 'yellow',    text: t.aBitHungry });
  }

  // over-eating
  if (nutritionalPoints >= 4) {
    warnings.push({ level: 'red',    text: t.overeating });
  } else if (nutritionalPoints >= 2) {
    warnings.push({ level: 'yellow', text: t.aBitOvereating });
  }

  // overall diet instability
  if (instPoints >= 5) {
    warnings.push({ level: 'critical',    text: t.stabilizeDiet });
  } else if (instPoints >= 4) {
    warnings.push({ level: 'orange',    text: t.dietUnstable });
  } else if (instPoints >= 2) {
    warnings.push({ level: 'yellow', text: t.dietShaky });
  }

  const levels = {
    yellow: '🟡',
    orange: '🟠',
    red: '🔴',
    critical: '⛔️',
  }

  // render
  statsList.innerHTML = '';
  if (warnings.length === 0) {
    const li = document.createElement('li');
    li.textContent = '🟢 ' + t.allGood;
    statsList.appendChild(li);
  } else {
    warnings.sort((a, b) => {
      const order = { critical: 0, red: 1, orange: 2, yellow: 3 };
      return order[a.level] - order[b.level];
    });
    warnings.forEach(({ level, text }) => {
      const li = document.createElement('li');
      li.textContent = levels[level] + ' ' + text;
      statsList.appendChild(li);
    });
  }
}

// ─── Form ──────────────────────────────────────────────────────────────────
function setFormValues(entry) {
  ['diet', 'volume', 'junk', 'alcohol'].forEach(group => {
    document.querySelectorAll(`[data-group="${group}"]`).forEach(btn => {
      const on = entry != null && btn.dataset.value === entry[group];
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  });
}

function getFormValues() {
  const val = { date: currentFormDate };
  ['diet', 'volume', 'junk', 'alcohol'].forEach(group => {
    const btn = document.querySelector(`[data-group="${group}"].active`);
    val[group] = btn ? btn.dataset.value : null;
  });
  return val;
}

function showTodayForm() {
  const d     = new Date(todayStr() + 'T00:00:00');
  const label = d.toLocaleString(t.locale, { day: 'numeric', month: 'long' });
  formTitle.textContent = t.todayLabel(label);
  currentFormDate = todayStr();
  setFormValues(null);
  btnSave.textContent = t.btnRecord;
}

function showEditForm(dateStr) {
  const d     = new Date(dateStr + 'T00:00:00');
  const label = d.toLocaleString(t.locale, { day: 'numeric', month: 'long' });
  formTitle.textContent = t.editLabel(label);
  currentFormDate = dateStr;
  setFormValues(entries[dateStr] ?? null);
  btnSave.textContent = t.btnSave;
}

function updateFormVisibility() {
  if (selectedDate !== null) {
    swapSections(sectionStats, sectionForm, () => showEditForm(selectedDate));
  } else {
    swapSections(sectionForm, sectionStats);
  }
}

// ─── Events ────────────────────────────────────────────────────────────────

// Toggle buttons (single-select per group, click again to deselect)
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const group    = btn.dataset.group;
    const wasActive = btn.classList.contains('active');

    document.querySelectorAll(`[data-group="${group}"]`).forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });

    if (!wasActive) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }
  });
});

// Chart click — delegated to table
chartTable.addEventListener('click', e => {
  const cell = e.target.closest('[data-col]');
  if (!cell) return;
  selectColumn(Number(cell.dataset.col));
});

// Chart scroll → refresh title + stats
chartScroll.addEventListener('scroll', () => {
  updateChartTitle();
  renderStats();
}, { passive: true });

// Form submit
entryForm.addEventListener('submit', e => {
  e.preventDefault();
  const vals = getFormValues();
  if (!vals.date) return;

  entries[vals.date] = {
    diet:    vals.diet,
    volume:  vals.volume,
    junk:    vals.junk,
    alcohol: vals.alcohol,
  };
  persistEntries();

  selectedDate = null;
  buildChart();
  renderStats();
  updateFormVisibility();
});

// Legend toggle
btnTooltip.addEventListener('click', () => {
  const open = legend.classList.toggle('open');
  btnTooltip.setAttribute('aria-expanded', String(open));
});

// Viewport resize → recalculate column width
window.addEventListener('resize', () => buildChart(), { passive: true });

// ─── i18n: apply to static HTML ────────────────────────────────────────────
function applyI18n() {
  document.documentElement.lang = t.locale;
  $('stats-title').textContent = t.statsTitle;
  $('legend-title').textContent = t.legendTitle;
  $('legend-l1').textContent = t.legendMeat;
  $('legend-l2').textContent = t.legendVolume;
  $('legend-l3').textContent = t.legendJunk;
  $('legend-l4').textContent = t.legendAlcohol;
  $('label-diet').textContent = t.dietType;
  $('label-volume').textContent = t.foodVolume;
  $('label-junk').textContent = t.junkFood;
  $('label-alcohol').textContent = t.alcohol;
}

// ─── Boot ──────────────────────────────────────────────────────────────────
function init() {
  loadEntries();
  days = buildDaysList();
  applyI18n();
  buildChart();
  updateChartTitle();
  renderStats();

  if (!entries[todayStr()]) {
    selectColumn(days.length - 1);   // open today's edit form
  } else {
    updateFormVisibility();          // show stats
  }
}

init();

// ─── Service Worker ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
