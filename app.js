'use strict';

// ─── Config ────────────────────────────────────────────────────────────────
const STORAGE_KEY  = 'vegtrack';
const TOTAL_DAYS   = 28;
const VISIBLE_COLS = 7;

const DIET_EMOJI = { meat: '🥩', dairy: '🧀', veg: '🥦' };
const VOL_EMOJI  = { low: '🔻', moderate: '▫️', high: '🔺' };           // moderate → ''

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
const chartSlider  = $('chart-slider');

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
  const mon = d.toLocaleString('ru', { month: 'short' }).replace('.', '');
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

  // Preserve scroll position in day-index space across rebuilds
  let targetDayIndex;
  if (!chartBuilt) {
    targetDayIndex = TOTAL_DAYS - VISIBLE_COLS;   // start showing last 7 days
    chartBuilt = true;
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

  chartScroll.scrollLeft = targetDayIndex * cw;

  // sync slider range to pixel scroll range
  const maxScroll = cw * TOTAL_DAYS - chartScroll.clientWidth;
  chartSlider.max   = maxScroll;
  chartSlider.step  = 1;
  chartSlider.value = targetDayIndex * cw;

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
  showEditForm(dateStr);
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
    .toLocaleString('ru', { day: 'numeric', month: 'short' })
    .replace('.', '');
  chartTitle.textContent = `График с ${fmt(period[0])} по ${fmt(period[period.length - 1])}`;
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
    li.textContent = '⚫️ Данных нет';
    statsList.appendChild(li);
    return;
  }

  if (filled < 3) {
    const li = document.createElement('li');
    li.textContent = '⚫️ Недостаточно данных';
    statsList.appendChild(li);
    return;
  }

  const warnings = [];   // { level: 'red'|'orange', text: string }

  // ── "подряд" rules: within the visible period ─────────────────────────
  const alcoholDays = pe.filter(e => e?.alcohol === 'yes').length;
  const junkDays    = pe.filter(e => e?.junk    === 'yes').length;
  const lowDays     = pe.filter(e => e?.volume  === 'low').length;
  const highDays    = pe.filter(e => e?.volume  === 'high').length;
  const instPoints  = pe.reduce((s, e) => s + (isUnstable(e) ? 1 : 0), 0);

  // алкоголь
  if (alcoholDays >= 4) {
    warnings.push({ level: 'critical',    text: `Хватит бухать!` });
  } else if (alcoholDays >= 2) {
    warnings.push({ level: 'orange', text: `Алкоголя многовато` });
  }

  // вредная пища
  if (junkDays >= 6) {
    warnings.push({ level: 'critical',    text: `Хватит жрать хрючево!` });
  } else if (junkDays >= 5) {
    warnings.push({ level: 'orange',    text: `Очень много вредных угощений` });
  } else if (junkDays >= 3) {
    warnings.push({ level: 'yellow', text: `Немножко вредных угощений` });
  }

  // недоедание
  if (lowDays >= 4) {
    warnings.push({ level: 'red', text: `Пора пожрать` });
  } else if (lowDays >= 2) {
    warnings.push({ level: 'yellow',    text: `Лёгкое недоедание` });
  }

  // переедание
  if (highDays >= 4) {
    warnings.push({ level: 'red',    text: `Обжорство` });
  } else if (highDays >= 2) {
    warnings.push({ level: 'yellow', text: `Лёгкое переедание` });
  }

  // общая нестабильность питания
  if (instPoints >= 5) {
    warnings.push({ level: 'critical',    text: `Питаться нужно регулярно!` });
  } else if (instPoints >= 4) {
    warnings.push({ level: 'orange',    text: `Диета совсем разладилась 😟` });
  } else if (instPoints >= 2) {
    warnings.push({ level: 'yellow', text: `Диета чуть-чуть нестабильная 🙃` });
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
    li.textContent = '🟢 Всё в порядке';
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

  sectionStats.hidden = false;
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
  const label = d.toLocaleString('ru', { day: 'numeric', month: 'long' });
  formTitle.textContent = `Сегодня — ${label}`;
  currentFormDate = todayStr();
  setFormValues(null);
  btnSave.textContent = 'Записать';
  sectionForm.hidden = false;
}

function showEditForm(dateStr) {
  const d     = new Date(dateStr + 'T00:00:00');
  const label = d.toLocaleString('ru', { day: 'numeric', month: 'long' });
  formTitle.textContent = `Редактировать — ${label}`;
  currentFormDate = dateStr;
  setFormValues(entries[dateStr] ?? null);
  btnSave.textContent = 'Сохранить';
  sectionForm.hidden = false;
}

function updateFormVisibility() {
  if (selectedDate !== null) {
    showEditForm(selectedDate);
  } else if (!entries[todayStr()]) {
    showTodayForm();
  } else {
    sectionForm.hidden = true;
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

// Chart scroll → sync slider + refresh stats
let _sliderUpdating = false;

chartScroll.addEventListener('scroll', () => {
  if (!_sliderUpdating) {
    chartSlider.value = chartScroll.scrollLeft;
  }
  updateChartTitle();
  renderStats();
}, { passive: true });

// Slider → sync chart scroll
chartSlider.addEventListener('input', () => {
  _sliderUpdating = true;
  chartScroll.scrollLeft = Number(chartSlider.value);
  _sliderUpdating = false;
});

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

// ─── Boot ──────────────────────────────────────────────────────────────────
function init() {
  loadEntries();
  days = buildDaysList();
  buildChart();
  updateChartTitle();
  renderStats();
  updateFormVisibility();
}

init();
