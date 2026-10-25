(() => {
  'use strict';

  const VERSION = '1.3.1';
  const KEY = 'shifts.v1';
  const TYPES = ['morning', 'afternoon', 'night', 'day', 'off'];
  const SWATCHES = ['#FF9F0A', '#FFC400', '#FF453A', '#FF375F', '#BF5AF2', '#5E5CE6', '#0A84FF', '#32ADE6', '#30D158', '#8E8E93'];
  const DEFAULT_COLORS = { morning: '#FF9F0A', afternoon: '#FF375F', night: '#5E5CE6', day: '#FFC400' };
  const PERSON_COLORS = ['#0A84FF', '#30D158', '#BF5AF2', '#FF9F0A', '#FF375F', '#32ADE6'];
  const MAX_CYCLE = 56;
  const RANK = { start: 0, morning: 0, day: 1, afternoon: 2, night: 3 };
  const SLOT_ORDER = ['morning', 'day', 'afternoon', 'night'];

  const cyc = (s) => [...s].map((c) => ({ M: 'morning', A: 'afternoon', N: 'night', D: 'day', '-': 'off' }[c]));
  const PRESETS = [
    { id: '12_24', cycle: cyc('DN-') },
    { id: '12_24_12_48', cycle: cyc('DN--') },
    { id: '4on4off', cycle: cyc('DDDD----') },
    { id: '4on4off_dn', cycle: cyc('DDNN----') },
    { id: 'pitman', cycle: cyc('DD--DDD--DD---') },
    { id: '5on2off', cycle: cyc('DDDDD--') },
    { id: 'rot222', cycle: cyc('MMAANN--') },
    { id: 'weekly', cycle: cyc('MMMMM--AAAAA--NNNNN--') }
  ];

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const todayStr = () => ymd(new Date());

  /* ---------- state ---------- */
  const uid = () => Math.random().toString(36).slice(2, 10);

  function detectLang() {
    const l = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
    return window.I18N[l] ? l : 'en';
  }

  function defaults() {
    return {
      v: 1,
      people: [],
      activeId: null,
      settings: { theme: 'auto', lang: detectLang(), langDone: false, weekStart: 1, colors: { ...DEFAULT_COLORS } }
    };
  }

  function normalise(s) {
    const d = defaults();
    const out = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
    out.settings.colors = { ...DEFAULT_COLORS, ...(out.settings.colors || {}) };
    out.people = (s.people || []).map((p) => ({
      id: p.id || uid(),
      name: p.name || '',
      color: p.color || PERSON_COLORS[0],
      schedules: (p.schedules || []).map((e) => (e.preset === '12_24' && e.cycle && e.cycle.length === 4 ? { ...e, preset: '12_24_12_48' } : e)).slice().sort((a, b) => (a.from < b.from ? -1 : 1)),
      overrides: p.overrides || {},
      weekly: p.weekly || {},
      holidays: (p.holidays || []).slice().sort((a, b) => (a.fromDate < b.fromDate ? -1 : 1))
    }));
    if (!out.people.some((p) => p.id === out.activeId)) out.activeId = out.people[0] ? out.people[0].id : null;
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalise(JSON.parse(raw));
    } catch (e) { /* storage unavailable or corrupt */ }
    return defaults();
  }

  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* keep in memory */ }
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }

  const ui = {
    tab: 'calendar',
    month: (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1, 12); })(),
    stack: [],
    confirmDelete: false,
    today: todayStr()
  };
  let draft = null;
  let hdraft = null;

  const person = (id) => state.people.find((p) => p.id === id);
  const active = () => person(state.activeId);

  /* ---------- i18n ---------- */
  function t(key, vars) {
    const cur = window.I18N[state.settings.lang] || window.I18N.en;
    let s = cur.s[key];
    if (s === undefined) s = window.I18N.en.s[key];
    if (s === undefined) s = key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] !== undefined ? vars[n] : '')) : s;
  }
  function tn(base, n) {
    const cur = window.I18N[state.settings.lang] || window.I18N.en;
    let cat = 'other';
    try { cat = new Intl.PluralRules(state.settings.lang).select(n); } catch (e) { /* fallback */ }
    const key = cur.s[`${base}_${cat}`] !== undefined ? `${base}_${cat}` : `${base}_other`;
    return t(key, { n });
  }
  const fmt = (opts) => new Intl.DateTimeFormat(state.settings.lang, opts);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shiftName = (type) => t(`shift_${type}`);

  /* ---------- icons ---------- */
  const ICON_PATHS = {
    morning: '<path d="M7 16.5a5 5 0 0 1 10 0z" fill="currentColor"/><path d="M3 16.5h18M12 4.5v3.5M6 9.5l1.6 1.6M18 9.5l-1.6 1.6M9.8 21 12 18.8 14.2 21" fill="none"/>',
    afternoon: '<path d="M7 16.5a5 5 0 0 1 10 0z" fill="currentColor"/><path d="M3 16.5h18M12 4.5v3.5M6 9.5l1.6 1.6M18 9.5l-1.6 1.6M9.8 18.8 12 21l2.2-2.2" fill="none"/>',
    day: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" fill="none"/>',
    night: '<path d="M20.5 13.8A8.5 8.5 0 1 1 10.2 3.5a6.6 6.6 0 0 0 10.3 10.3z" fill="currentColor"/>',
    off: '<path d="M8 12h8" fill="none"/>'
  };
  function icon(type, size = 22, color) {
    const c = color || (type === 'off' ? 'var(--fg-3)' : state.settings.colors[type]);
    return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${c}" aria-hidden="true">${ICON_PATHS[type] || ''}</svg>`;
  }
  const UI_ICONS = {
    chev: '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>',
    left: '<svg width="10" height="17" viewBox="0 0 10 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 1.5l-7 7 7 7"/></svg>',
    right: '<svg width="10" height="17" viewBox="0 0 10 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 1.5l7 7-7 7"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 1v12M1 7h12"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>',
    cal: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="19" height="17.5" rx="4"/><path d="M3.5 10.5h19M8.5 3v4M17.5 3v4"/></svg>',
    gear: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 8h9M19 8h3M4 18h3M13 18h9"/><circle cx="16" cy="8" r="3"/><circle cx="10" cy="18" r="3"/></svg>'
  };

  /* ---------- schedule logic ---------- */
  function patternType(p, s) {
    let e = null;
    for (const x of p.schedules) { if (x.from <= s) e = x; else break; }
    let base = null;
    if (e && e.cycle.length) {
      const n = e.cycle.length;
      base = e.cycle[((((dayNum(s) - dayNum(e.from) + e.offset) % n) + n) % n)];
    }
    return { base, entry: e };
  }

  const pos = (dateStr, slot) => dayNum(dateStr) * 4 + (RANK[slot] || 0);

  function closedInfo(p, s, type) {
    const wk = p.weekly[parse(s).getDay()];
    if (wk && wk.includes(type)) return { by: 'weekly' };
    const at = dayNum(s) * 4 + RANK[type];
    const h = p.holidays.find((x) => at >= pos(x.fromDate, x.fromSlot) && at < pos(x.toDate, x.toSlot));
    return h ? { by: 'holiday', name: h.name } : null;
  }

  function shiftOn(p, s) {
    const { base, entry } = patternType(p, s);
    const o = p.overrides[s];
    const cl = base && base !== 'off' ? closedInfo(p, s, base) : null;
    const auto = cl ? 'off' : base;
    return { type: o || auto, base, auto, entry, closed: !o && cl ? cl : null, over: !!o && o !== auto };
  }

  function entryName(e) {
    if (e.preset) return t(`preset_${e.preset}`);
    return e.name || t('custom');
  }

  function usedTypes(p) {
    const set = new Set();
    p.schedules.forEach((e) => e.cycle.forEach((c) => set.add(c)));
    Object.values(p.overrides).forEach((c) => set.add(c));
    return TYPES.filter((x) => x !== 'off' && set.has(x));
  }

  function nextShift(p, fromStr) {
    for (let i = 0; i < 400; i++) {
      const s = ymd(addDays(parse(fromStr), i));
      const sh = shiftOn(p, s);
      if (sh.type && sh.type !== 'off') return { s, type: sh.type, i: i + 1 };
    }
    return null;
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const root = document.documentElement;
    const th = state.settings.theme;
    if (th === 'light' || th === 'dark') root.setAttribute('data-theme', th); else root.removeAttribute('data-theme');
    root.lang = state.settings.lang;
    const dark = th === 'dark' || (th === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    let m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#000000' : '#F2F2F7');
  }
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old browsers */ }
  }

  /* ---------- calendar view ---------- */
  function weekdayLabels() {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const wd = (state.settings.weekStart + i) % 7;
      out.push(fmt({ weekday: 'short' }).format(new Date(2023, 0, 1 + wd, 12)).replace('.', ''));
    }
    return out;
  }

  function avatar(p, size = 28) {
    const initial = (p.name.trim()[0] || '?').toUpperCase();
    return `<span class="avatar" style="--c:${p.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px">${esc(initial)}</span>`;
  }

  function dayCell(p, d, inMonth) {
    const s = ymd(d);
    const sh = shiftOn(p, s);
    const work = sh.type && sh.type !== 'off';
    const cls = ['day', inMonth ? '' : 'out', s === ui.today ? 'today' : '', work ? 'work' : '', sh.closed ? 'closed' : '', sh.over ? 'over' : ''].join(' ');
    const what = sh.closed ? `${t('closed')}, ${shiftName(sh.base)}` : sh.type ? shiftName(sh.type) : t('no_pattern');
    const label = `${fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d)}, ${what}`;
    return `<button class="${cls}" style="${work ? `--c:${state.settings.colors[sh.type]}` : ''}" data-act="day" data-d="${s}" aria-label="${esc(label)}">
      <span class="n">${d.getDate()}</span>${work ? icon(sh.type, 20) : sh.closed ? icon(sh.base, 20, 'var(--fg-3)') : ''}</button>`;
  }

  const monthAt = (m, delta) => new Date(m.getFullYear(), m.getMonth() + delta, 1, 12);
  const monthTitle = (m) => cap(fmt({ month: 'long', year: 'numeric' }).format(m));

  function monthCells(p, m) {
    const first = new Date(m.getFullYear(), m.getMonth(), 1, 12);
    const lead = (first.getDay() - state.settings.weekStart + 7) % 7;
    const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const total = Math.ceil((lead + dim) / 7) * 7;
    let cells = '';
    for (let i = 0; i < total; i++) {
      const d = addDays(first, i - lead);
      cells += dayCell(p, d, d.getMonth() === m.getMonth());
    }
    return cells;
  }

  function renderCalendar() {
    const p = active();
    const m = ui.month;
    const title = monthTitle(m);
    const pane = (delta) => `<div class="pane" ${delta ? 'inert aria-hidden="true"' : ''}><div class="grid">${p ? monthCells(p, monthAt(m, delta)) : ''}</div></div>`;
    const chips = state.people.map((x) => `
      <button class="chip ${x.id === state.activeId ? 'on' : ''}" data-act="person" data-id="${x.id}">${avatar(x, 22)}<span>${esc(x.name || '?')}</span></button>`).join('');

    let summary = '';
    if (p) {
      const now = shiftOn(p, ui.today);
      const nx = nextShift(p, ymd(addDays(parse(ui.today), 1)));
      const todayRow = `<div class="row">
          <span class="row-icon">${now.closed ? icon(now.base, 26, 'var(--fg-3)') : now.type ? icon(now.type, 26) : ''}</span>
          <span class="row-main"><span class="row-title">${t('today')}</span></span>
          <span class="row-val">${now.closed ? t('closed') : now.type ? shiftName(now.type) : t('no_pattern')}</span></div>`;
      let nextRow;
      if (nx) {
        const rel = new Intl.RelativeTimeFormat(state.settings.lang, { numeric: 'auto' }).format(nx.i, 'day');
        nextRow = `<div class="row">
          <span class="row-icon">${icon(nx.type, 26)}</span>
          <span class="row-main"><span class="row-title">${t('next_shift')}</span>
          <span class="row-sub">${cap(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(parse(nx.s)))} · ${rel}</span></span>
          <span class="row-val">${shiftName(nx.type)}</span></div>`;
      } else {
        nextRow = `<div class="row"><span class="row-main"><span class="row-title">${t('next_shift')}</span></span><span class="row-val">${t('no_upcoming')}</span></div>`;
      }
      summary = `<section class="group" aria-label="${t('up_next')}">${todayRow}${nextRow}</section>`;
    }

    const hasClosures = p && (p.holidays.length || Object.values(p.weekly).some((x) => x.length));
    const legend = p ? usedTypes(p).concat(['off']).map((x) => `<span class="lg">${icon(x, 18)}${shiftName(x)}</span>`).join('') + (hasClosures ? `<span class="lg"><i class="lg-closed"></i>${t('closed')}</span>` : '') : '';

    return `
    <header class="head">
      <div class="head-row">
        <h1 id="mtitle">${esc(title)}</h1>
        <div class="nav">
          <button class="btn-icon" data-act="prev" aria-label="${t('prev_month')}">${UI_ICONS.left}</button>
          <button class="btn-text" data-act="today">${t('today')}</button>
          <button class="btn-icon" data-act="next" aria-label="${t('next_month')}">${UI_ICONS.right}</button>
        </div>
      </div>
      <div class="chips" role="tablist">${chips}<button class="chip add" data-act="add-person" aria-label="${t('add_person')}">${UI_ICONS.plus}</button></div>
    </header>
    <section class="cal" id="cal">
      <div class="wk">${weekdayLabels().map((w) => `<span>${esc(w)}</span>`).join('')}</div>
      <div class="vp" id="cal-vp"><div class="track">${pane(-1)}${pane(0)}${pane(1)}</div></div>
    </section>
    <div class="legend">${legend}</div>
    ${summary}`;
  }

  /* ---------- settings view ---------- */
  function seg(name, options, value) {
    return `<div class="seg" role="radiogroup">${options.map(([v, label]) =>
      `<button role="radio" aria-checked="${String(v) === String(value)}" class="${String(v) === String(value) ? 'on' : ''}" data-act="${name}" data-v="${v}">${label}</button>`).join('')}</div>`;
  }

  function renderSettings() {
    const st = state.settings;
    const people = state.people.map((p) => {
      const cur = shiftOn(p, ui.today).entry || p.schedules[p.schedules.length - 1];
      return `<button class="row tap" data-act="person-edit" data-id="${p.id}">
        <span class="row-icon">${avatar(p, 30)}</span>
        <span class="row-main"><span class="row-title">${esc(p.name || '?')}</span>
        <span class="row-sub">${cur ? esc(entryName(cur)) : t('no_pattern')}</span></span>
        <span class="chev">${UI_ICONS.chev}</span></button>`;
    }).join('');

    const colours = TYPES.filter((x) => x !== 'off').map((type) => `
      <div class="row col">
        <div class="row-line">${icon(type, 24)}<span class="row-title">${shiftName(type)}</span></div>
        <div class="swatches">${SWATCHES.map((hex) => `<button class="sw ${st.colors[type].toLowerCase() === hex.toLowerCase() ? 'on' : ''}" style="--c:${hex}" data-act="color" data-type="${type}" data-v="${hex}" aria-label="${hex}"></button>`).join('')}</div>
      </div>`).join('');

    const langs = Object.entries(window.I18N).map(([code, l]) => `
      <button class="row tap" role="radio" aria-checked="${code === st.lang}" data-act="lang" data-v="${code}">
        <span class="row-main"><span class="row-title">${esc(l.name)}</span></span>
        ${code === st.lang ? `<span class="tick">${UI_ICONS.check}</span>` : ''}</button>`).join('');

    return `
    <header class="head"><div class="head-row"><h1>${t('settings')}</h1></div></header>

    <h2 class="gh">${t('people')}</h2>
    <section class="group">${people}
      <button class="row tap accent" data-act="add-person"><span class="row-icon plus">${UI_ICONS.plus}</span><span class="row-main"><span class="row-title">${t('add_person')}</span></span></button>
    </section>

    <h2 class="gh">${t('appearance')}</h2>
    <section class="group">
      <div class="row"><span class="row-main"><span class="row-title">${t('theme')}</span></span>
        ${seg('theme', [['auto', t('theme_auto')], ['light', t('theme_light')], ['dark', t('theme_dark')]], st.theme)}</div>
    </section>

    <h2 class="gh">${t('shift_colours')}</h2>
    <section class="group">${colours}</section>

    <h2 class="gh">${t('calendar')}</h2>
    <section class="group">
      <div class="row"><span class="row-main"><span class="row-title">${t('week_starts')}</span></span>
        ${seg('week', [[1, t('mon_short')], [0, t('sun_short')], [6, t('sat_short')]], st.weekStart)}</div>
    </section>

    <h2 class="gh">${t('closures')}</h2>
    <section class="group">${state.people.map((p) => `<button class="row tap" data-act="closures-open" data-id="${p.id}">
        <span class="row-icon">${avatar(p, 30)}</span>
        <span class="row-main"><span class="row-title">${esc(p.name || '?')}</span><span class="row-sub">${closuresSummary(p)}</span></span>
        <span class="chev">${UI_ICONS.chev}</span></button>`).join('')}</section>

    <h2 class="gh">${t('language')}</h2>
    <section class="group" role="radiogroup">${langs}</section>

    <h2 class="gh">${t('data')}</h2>
    <section class="group">
      <button class="row tap accent" data-act="export"><span class="row-main"><span class="row-title">${t('export_data')}</span></span></button>
      <button class="row tap accent" data-act="import"><span class="row-main"><span class="row-title">${t('import_data')}</span></span></button>
    </section>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
    <p class="foot">${t('storage_note')}<br>${t('version', { v: VERSION })}</p>`;
  }

  /* ---------- sheets ---------- */
  function sheetRoot() {
    let root = document.getElementById('sheets');
    return root;
  }

  function stripHtml(cycle, size = 16, max = 14) {
    const shown = cycle.slice(0, max).map((c) => icon(c, size)).join('');
    return `<span class="strip">${shown}${cycle.length > max ? '<span class="more">…</span>' : ''}</span>`;
  }

  function sheetBar(left, title, right) {
    return `<div class="bar">
      <div class="bar-side">${left || ''}</div><h2>${esc(title)}</h2><div class="bar-side end">${right || ''}</div></div>`;
  }

  function daySheet(s) {
    const p = active();
    const sh = shiftOn(p, s);
    const d = parse(s);
    const opts = TYPES.map((type) => `
      <button class="opt ${!sh.closed && sh.type === type ? 'on' : ''}" data-act="override" data-v="${type}" data-d="${s}">
        ${icon(type, 26)}<span>${shiftName(type)}</span></button>`).join('');
    return `${sheetBar('', cap(fmt({ weekday: 'long' }).format(d)), `<button class="link strong" data-act="sheet-close">${t('done')}</button>`)}
    <div class="body">
      <div class="hero">
        <div class="hero-icon" style="--c:${sh.type && sh.type !== 'off' ? state.settings.colors[sh.type] : 'var(--fg-3)'}">${sh.closed ? icon(sh.base, 44, 'var(--fg-3)') : sh.type ? icon(sh.type, 44) : ''}</div>
        <div class="hero-date">${esc(fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(d))}</div>
        <div class="hero-shift">${sh.closed ? t('closed') : sh.type ? shiftName(sh.type) : t('no_pattern')}</div>
        <div class="hero-sub">${sh.closed ? esc(`${shiftName(sh.base)} · ${sh.closed.by === 'weekly' ? t('closed_weekly') : sh.closed.name || t('holiday')}`) : sh.over ? t('changed_day') : sh.entry ? esc(entryName(sh.entry)) : ''}</div>
      </div>
      <h3 class="gh">${t('change_day')}</h3>
      <div class="opts">${opts}</div>
      ${sh.over ? `<section class="group"><button class="row tap accent center" data-act="override-reset" data-d="${s}"><span class="row-main"><span class="row-title">${t('use_pattern')}</span></span></button></section>` : ''}
    </div>`;
  }

  function personSheet(id) {
    const p = person(id);
    if (!p) return '';
    const today = ui.today;
    const cur = shiftOn(p, today).entry;
    const entries = p.schedules.slice().reverse().map((e) => `
      <button class="row tap" data-act="pattern-edit" data-id="${e.id}">
        <span class="row-main"><span class="row-title">${esc(entryName(e))}</span>
        <span class="row-sub">${t('from_date', { date: fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(parse(e.from)) })}${cur && cur.id === e.id ? ` · ${t('current')}` : ''}</span>
        <span class="row-strip">${stripHtml(e.cycle, 14, 16)}</span></span>
        <span class="chev">${UI_ICONS.chev}</span></button>`).join('');
    const colors = PERSON_COLORS.map((hex) => `<button class="sw ${p.color === hex ? 'on' : ''}" style="--c:${hex}" data-act="person-color" data-v="${hex}" aria-label="${hex}"></button>`).join('');
    return `${sheetBar('', p.name || t('edit_person'), `<button class="link strong" data-act="sheet-close">${t('done')}</button>`)}
    <div class="body">
      <section class="group">
        <label class="row"><span class="lbl">${t('name')}</span>
          <input class="field" id="pname" data-in="pname" value="${esc(p.name)}" placeholder="${t('name_placeholder')}" autocomplete="off" maxlength="40"></label>
        <div class="row col"><div class="row-line"><span class="row-title">${t('colour')}</span></div><div class="swatches">${colors}</div></div>
      </section>
      <h3 class="gh">${t('patterns_history')}</h3>
      <section class="group">${entries}
        <button class="row tap accent" data-act="pattern-new"><span class="row-icon plus">${UI_ICONS.plus}</span><span class="row-main"><span class="row-title">${t('change_pattern')}</span></span></button>
      </section>
      <h3 class="gh">${t('closures')}</h3>
      <section class="group">
        <button class="row tap" data-act="closures-open" data-id="${p.id}"><span class="row-main"><span class="row-title">${t('closures')}</span><span class="row-sub">${closuresSummary(p)}</span></span><span class="chev">${UI_ICONS.chev}</span></button>
      </section>
      <section class="group gap">
        <button class="row tap danger center" data-act="person-delete"><span class="row-main"><span class="row-title">${ui.confirmDelete ? t('delete_confirm', { name: esc(p.name || '?') }) : t('delete_person')}</span></span></button>
      </section>
    </div>`;
  }

  function draftOffset() { return Math.min(draft.offset, Math.max(draft.cycle.length - 1, 0)); }

  function patternSheet() {
    const d = draft;
    const n = d.cycle.length;
    const setup = !d.personId;
    const first = state.people.length === 0;
    const title = setup ? (first ? t('welcome_title') : t('add_person')) : d.entryId ? t('edit_pattern') : t('change_pattern');
    const left = setup && first ? '' : `<button class="link" data-act="${d.back ? 'back' : 'sheet-close'}">${d.back ? t('back') : t('cancel')}</button>`;
    const right = `<button class="link strong" data-act="pat-save">${setup ? t('add') : t('save')}</button>`;

    const presets = PRESETS.map((pr) => `
      <button class="row tap radio" role="radio" aria-checked="${d.preset === pr.id}" data-act="preset" data-id="${pr.id}">
        <span class="row-main"><span class="row-title">${t(`preset_${pr.id}`)}</span>
        <span class="row-sub">${t(`preset_${pr.id}_desc`)}</span>
        <span class="row-strip">${stripHtml(pr.cycle, 14, 16)}</span></span>
        ${d.preset === pr.id ? `<span class="tick">${UI_ICONS.check}</span>` : ''}</button>`).join('') + `
      <button class="row tap radio" role="radio" aria-checked="${d.preset === 'custom'}" data-act="custom">
        <span class="row-main"><span class="row-title">${t('custom')}</span><span class="row-sub">${t('custom_desc')}</span></span>
        ${d.preset === 'custom' ? `<span class="tick">${UI_ICONS.check}</span>` : ''}</button>`;

    let builder = '';
    if (d.preset === 'custom') {
      builder = `<h3 class="gh">${t('custom')}</h3>
      <section class="group">
        <div class="row col">
          <div class="cells">${d.cycle.map((c, i) => `<button class="cell" data-act="cell" data-i="${i}" aria-label="${t('cycle_day', { n: i + 1 })}: ${shiftName(c)}"><small>${i + 1}</small>${icon(c, 22)}</button>`).join('')}</div>
          <div class="row-line spread">
            <span class="row-sub">${t('custom_hint')}</span>
            <span class="stepper"><button data-act="cell-del" aria-label="${t('remove_day')}" ${n <= 1 ? 'disabled' : ''}>−</button><span>${tn('days', n)}</span><button data-act="cell-add" aria-label="${t('add_day')}" ${n >= MAX_CYCLE ? 'disabled' : ''}>+</button></span>
          </div>
        </div>
        <label class="row"><span class="lbl">${t('name')}</span><input class="field" data-in="draft-name" value="${esc(d.name)}" placeholder="${t('custom')}" maxlength="40" autocomplete="off"></label>
      </section>`;
    }

    const off = draftOffset();
    const dayOpts = d.cycle.map((c, i) => `<option value="${i}" ${i === off ? 'selected' : ''}>${t('cycle_day', { n: i + 1 })} · ${shiftName(c)}</option>`).join('');
    const pv = [];
    for (let i = 0; i < 14; i++) {
      const dt = addDays(parse(d.from || ui.today), i);
      const ty = n ? d.cycle[(i + off) % n] : 'off';
      pv.push(`<div class="pv ${ty !== 'off' ? 'work' : ''}" style="--c:${ty !== 'off' ? state.settings.colors[ty] : 'transparent'}"><small>${esc(fmt({ weekday: 'short' }).format(dt).replace('.', ''))}</small><b>${dt.getDate()}</b>${icon(ty, 18)}</div>`);
    }

    return `${sheetBar(left, title, right)}
    <div class="body" id="pbody">
      ${setup ? `${first ? `<p class="lead">${t('welcome_sub')}</p>` : ''}
      <section class="group"><label class="row"><span class="lbl">${t('your_name')}</span>
        <input class="field" id="dpname" data-in="draft-pname" value="${esc(d.pname)}" placeholder="${t('name_placeholder')}" autocomplete="off" maxlength="40"></label></section>` : ''}
      <h3 class="gh">${t('choose_pattern')}</h3>
      <section class="group" role="radiogroup">${presets}</section>
      ${builder}
      <h3 class="gh">${t('starts_on')}</h3>
      <section class="group">
        <label class="row"><span class="lbl">${t('starts_on')}</span><input class="field date" type="date" data-in="draft-from" value="${esc(d.from)}"></label>
        <label class="row"><span class="lbl">${t('starting_at')}</span><select class="field select" data-in="draft-offset">${dayOpts}</select></label>
      </section>
      <h3 class="gh">${t('preview')}</h3>
      <section class="group pad"><div class="pvgrid">${pv.join('')}</div></section>
      ${!setup && state.people.length && d.from ? `<p class="foot left">${t('new_pattern_note')}</p>` : ''}
      ${d.entryId && person(d.personId).schedules.length > 1 ? `<section class="group gap"><button class="row tap danger center" data-act="pat-delete"><span class="row-main"><span class="row-title">${t('delete_pattern')}</span></span></button></section>` : ''}
    </div>`;
  }


  /* ---------- closures ---------- */
  function weeklyCount(p) { return Object.values(p.weekly).reduce((n, x) => n + x.length, 0); }

  function closuresSummary(p) {
    const w = weeklyCount(p);
    const h = p.holidays.length;
    const parts = [];
    if (w) parts.push(tn('weekly_slots', w));
    if (h) parts.push(tn('closures_count', h));
    return parts.length ? parts.join(' · ') : t('no_closures');
  }

  function slotOptions(p, current) {
    const used = usedTypes(p);
    const list = (used.length ? used : SLOT_ORDER).slice();
    if (current && current !== 'start' && !list.includes(current)) list.push(current);
    list.sort((x, y) => RANK[x] - RANK[y]);
    return ['start'].concat(list);
  }
  const slotLabel = (slot) => (slot === 'start' ? t('slot_start') : t(`slot_${slot}`));
  const shortDate = (s) => cap(fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parse(s)));

  function affectedCount(p, h) {
    const a = pos(h.fromDate, h.fromSlot);
    const b = pos(h.toDate, h.toSlot);
    if (!(b > a)) return 0;
    let n = 0;
    const start = parse(h.fromDate);
    for (let i = 0; i <= 800; i++) {
      const s = ymd(addDays(start, i));
      if (dayNum(s) > dayNum(h.toDate)) break;
      const ty = patternType(p, s).base;
      if (ty && ty !== 'off') { const at = dayNum(s) * 4 + RANK[ty]; if (at >= a && at < b) n++; }
    }
    return n;
  }

  function closuresSheet(id) {
    const p = person(id);
    if (!p) return '';
    const w = state.settings.weekStart;
    let cols = usedTypes(p);
    Object.values(p.weekly).forEach((arr) => arr.forEach((x) => { if (!cols.includes(x)) cols.push(x); }));
    if (!cols.length) cols = SLOT_ORDER.slice();
    cols.sort((x, y) => RANK[x] - RANK[y]);
    const head = cols.map((c) => `<span class="wm-h">${icon(c, 22)}<small>${shiftName(c)}</small></span>`).join('');
    let rows = '';
    for (let i = 0; i < 7; i++) {
      const dow = (w + i) % 7;
      const closed = p.weekly[dow] || [];
      const name = cap(fmt({ weekday: 'long' }).format(new Date(2023, 0, 1 + dow, 12)));
      rows += `<button class="wm-day" data-act="w-row" data-dow="${dow}">${esc(name)}</button>` + cols.map((c) => {
        const on = closed.includes(c);
        return `<button class="wm-cell ${on ? 'on' : ''}" data-act="w-cell" data-dow="${dow}" data-t="${c}" aria-pressed="${on}" aria-label="${esc(name)}, ${shiftName(c)}">${on ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>' : ''}</button>`;
      }).join('');
    }
    const list = p.holidays.map((h) => `
      <button class="row tap" data-act="h-edit" data-id="${h.id}">
        <span class="row-main"><span class="row-title">${esc(h.name || t('closed'))}</span>
        <span class="row-sub">${esc(shortDate(h.fromDate))} · ${slotLabel(h.fromSlot)}</span>
        <span class="row-sub">→ ${esc(shortDate(h.toDate))} · ${slotLabel(h.toSlot)}</span></span>
        <span class="chev">${UI_ICONS.chev}</span></button>`).join('');
    const stacked = ui.stack.length > 1;
    return `${sheetBar(stacked ? `<button class="link" data-act="pop">${t('back')}</button>` : '', t('closures'), `<button class="link strong" data-act="sheet-close">${t('done')}</button>`)}
    <div class="body">
      ${state.people.length > 1 ? `<p class="lead">${t('closures_for', { name: esc(p.name || '?') })}</p>` : ''}
      <h3 class="gh">${t('every_week')}</h3>
      <section class="group pad"><div class="wm" style="--cols:${cols.length}"><span></span>${head}${rows}</div></section>
      <p class="foot left">${t('every_week_hint')}</p>
      <h3 class="gh">${t('holidays_closures')}</h3>
      <section class="group">${list}
        <button class="row tap accent" data-act="h-new"><span class="row-icon plus">${UI_ICONS.plus}</span><span class="row-main"><span class="row-title">${t('add_closure')}</span></span></button>
      </section>
    </div>`;
  }

  function newHoliday(personId, h) {
    if (h) return { ...h, personId };
    const today = ui.today;
    return { personId, id: null, name: '', fromDate: today, fromSlot: 'start', toDate: ymd(addDays(parse(today), 1)), toSlot: 'start' };
  }

  function holidaySheet() {
    const h = hdraft;
    const p = person(h.personId);
    const valid = h.fromDate && h.toDate && pos(h.toDate, h.toSlot) > pos(h.fromDate, h.fromSlot);
    const opt = (cur) => slotOptions(p, cur).map((sl) => `<option value="${sl}" ${sl === cur ? 'selected' : ''}>${slotLabel(sl)}</option>`).join('');
    const n = valid ? affectedCount(p, h) : 0;
    const summary = !valid ? `<span class="err">${t('invalid_range')}</span>` : n ? tn('affected', n) : t('affected_none');
    return `${sheetBar(`<button class="link" data-act="pop-holiday">${t('cancel')}</button>`, h.id ? t('edit_closure') : t('new_closure'), `<button class="link strong ${valid ? '' : 'dim'}" data-act="h-save" ${valid ? '' : 'disabled'}>${t('save')}</button>`)}
    <div class="body">
      <section class="group gap0"><label class="row"><span class="lbl">${t('name')}</span>
        <input class="field" data-in="h-name" value="${esc(h.name)}" placeholder="${t('closure_placeholder')}" autocomplete="off" maxlength="40"></label></section>
      <h3 class="gh">${t('closed_from')}</h3>
      <section class="group">
        <label class="row"><span class="lbl">${t('date')}</span><input class="field date" type="date" data-in="h-from" value="${esc(h.fromDate)}"></label>
        <label class="row"><span class="lbl">${t('shift')}</span><select class="field select" data-in="h-fromslot">${opt(h.fromSlot)}</select></label>
      </section>
      <p class="foot left">${t('from_hint')}</p>
      <h3 class="gh">${t('reopens')}</h3>
      <section class="group">
        <label class="row"><span class="lbl">${t('date')}</span><input class="field date" type="date" data-in="h-to" value="${esc(h.toDate)}"></label>
        <label class="row"><span class="lbl">${t('shift')}</span><select class="field select" data-in="h-toslot">${opt(h.toSlot)}</select></label>
      </section>
      <p class="foot left">${t('to_hint')}</p>
      <section class="group pad note">${summary}</section>
      ${h.id ? `<section class="group gap"><button class="row tap danger center" data-act="h-delete"><span class="row-main"><span class="row-title">${t('delete_closure')}</span></span></button></section>` : ''}
    </div>`;
  }

  function langSheet() {
    const rows = Object.entries(window.I18N).map(([code, l]) => `
      <button class="row tap" role="radio" aria-checked="${code === state.settings.lang}" data-act="lang" data-v="${code}">
        <span class="row-main"><span class="row-title">${esc(l.name)}</span></span>
        ${code === state.settings.lang ? `<span class="tick">${UI_ICONS.check}</span>` : ''}</button>`).join('');
    return `${sheetBar('', t('language'), '')}
    <div class="body">
      <section class="group" role="radiogroup">${rows}</section>
      <button class="primary" data-act="lang-continue">${t('continue')}</button>
    </div>`;
  }

  const sheetLocked = () => { const top = ui.stack[ui.stack.length - 1]; return !!top && (top.type === 'lang' || (top.type === 'pattern' && draft && !draft.personId && state.people.length === 0)); };

  function currentSheetHtml() {
    const top = ui.stack[ui.stack.length - 1];
    if (!top) return '';
    if (top.type === 'lang') return langSheet();
    if (top.type === 'day') return daySheet(top.d);
    if (top.type === 'person') return personSheet(top.id);
    if (top.type === 'pattern') return patternSheet();
    if (top.type === 'closures') return closuresSheet(top.id);
    if (top.type === 'holiday') return holidaySheet();
    return '';
  }

  let sheetEl = null;
  function renderSheet() {
    const root = sheetRoot();
    const html = currentSheetHtml();
    if (!html) {
      if (sheetEl) {
        const el = sheetEl;
        sheetEl = null;
        el.classList.remove('in');
        setTimeout(() => el.remove(), 260);
      }
      document.body.classList.remove('locked');
      return;
    }
    if (!sheetEl) {
      sheetEl = document.createElement('div');
      sheetEl.className = 'sheet-wrap';
      sheetEl.innerHTML = '<div class="scrim" data-act="sheet-dismiss"></div><div class="sheet" role="dialog" aria-modal="true"></div>';
      root.appendChild(sheetEl);
      requestAnimationFrame(() => requestAnimationFrame(() => sheetEl && sheetEl.classList.add('in')));
    }
    const panel = sheetEl.querySelector('.sheet');
    const body = panel.querySelector('.body');
    const scroll = body ? body.scrollTop : 0;
    panel.innerHTML = html;
    const nb = panel.querySelector('.body');
    if (nb) nb.scrollTop = scroll;
    document.body.classList.add('locked');
  }

  /* ---------- main render ---------- */
  function render() {
    applyTheme();
    document.title = t('app_name');
    const app = document.getElementById('app');
    const body = ui.tab === 'calendar' ? renderCalendar() : renderSettings();
    const y = window.scrollY;
    app.innerHTML = `<main class="page ${ui.tab}">${body}</main>
      <nav class="tabbar" aria-label="Main">
        <button class="tab ${ui.tab === 'calendar' ? 'on' : ''}" data-act="tab" data-v="calendar">${UI_ICONS.cal}<span>${t('tab_calendar')}</span></button>
        <button class="tab ${ui.tab === 'settings' ? 'on' : ''}" data-act="tab" data-v="settings">${UI_ICONS.gear}<span>${t('tab_settings')}</span></button>
      </nav>`;
    window.scrollTo(0, y);
    const f = document.getElementById('import-file');
    if (f) f.addEventListener('change', onImport);
    bindSwipe();
    renderSheet();
  }

  /* ---------- draft helpers ---------- */
  function newDraft({ personId = null, entryId = null, back = false } = {}) {
    const p = personId ? person(personId) : null;
    const e = p && entryId ? p.schedules.find((x) => x.id === entryId) : null;
    if (e) {
      return { personId, entryId, back, pname: '', preset: e.preset || 'custom', name: e.name || '', cycle: e.cycle.slice(), from: e.from, offset: e.offset };
    }
    const base = PRESETS[0];
    return { personId, entryId: null, back, pname: '', preset: base.id, name: '', cycle: base.cycle.slice(), from: ui.today, offset: 0 };
  }

  function openSheet(s) { ui.stack.push(s); ui.confirmDelete = false; renderSheet(); }
  function popSheet() { ui.stack.pop(); ui.confirmDelete = false; renderSheet(); }

  function savePattern() {
    const d = draft;
    if (!d.from) return;
    const entry = {
      id: d.entryId || uid(),
      from: d.from,
      preset: d.preset === 'custom' ? null : d.preset,
      name: d.preset === 'custom' ? d.name.trim() : '',
      cycle: d.cycle.slice(),
      offset: draftOffset()
    };
    let p = person(d.personId);
    if (!p) {
      p = { id: uid(), name: d.pname.trim() || '', color: PERSON_COLORS[state.people.length % PERSON_COLORS.length], schedules: [], overrides: {}, weekly: {}, holidays: [] };
      state.people.push(p);
      state.activeId = p.id;
    }
    p.schedules = p.schedules.filter((x) => x.id !== entry.id && x.from !== entry.from);
    p.schedules.push(entry);
    p.schedules.sort((a, b) => (a.from < b.from ? -1 : 1));
    save();
    const d0 = parse(entry.from);
    ui.month = new Date(d0.getFullYear(), d0.getMonth(), 1, 12);
    if (d.back || d.personId) { ui.stack.pop(); } else { ui.stack = []; }
    ui.tab = d.personId ? ui.tab : 'calendar';
    draft = null;
    render();
  }

  /* ---------- events ---------- */
  function shiftMonth(delta) {
    if (calCtl) { calCtl.go(delta); return; }
    ui.month = monthAt(ui.month, delta);
    render();
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const v = el.dataset.v;
    switch (act) {
      case 'tab': ui.tab = v; render(); window.scrollTo(0, 0); break;
      case 'prev': shiftMonth(-1); break;
      case 'next': shiftMonth(1); break;
      case 'today': { const n = new Date(); ui.month = new Date(n.getFullYear(), n.getMonth(), 1, 12); render(); break; }
      case 'person': state.activeId = el.dataset.id; save(); render(); break;
      case 'add-person': draft = newDraft(); openSheet({ type: 'pattern' }); break;
      case 'day': openSheet({ type: 'day', d: el.dataset.d }); break;
      case 'override': {
        const p = active();
        const base = shiftOn(p, el.dataset.d).auto;
        if (v === base) delete p.overrides[el.dataset.d]; else p.overrides[el.dataset.d] = v;
        save(); render(); break;
      }
      case 'override-reset': delete active().overrides[el.dataset.d]; save(); render(); break;
      case 'theme': state.settings.theme = v; save(); render(); break;
      case 'week': state.settings.weekStart = Number(v); save(); render(); break;
      case 'lang-continue': state.settings.langDone = true; save(); draft = newDraft(); ui.stack = [{ type: 'pattern' }]; renderSheet(); break;
      case 'lang': state.settings.lang = v; save(); render(); break;
      case 'color': state.settings.colors[el.dataset.type] = el.dataset.v; save(); render(); break;
      case 'sheet-close': ui.stack = []; draft = null; renderSheet(); render(); break;
      case 'sheet-dismiss': if (!sheetLocked()) { ui.stack = []; draft = null; renderSheet(); } break;
      case 'back': draft = null; popSheet(); break;
      case 'person-edit': openSheet({ type: 'person', id: el.dataset.id }); break;
      case 'person-color': person(ui.stack[ui.stack.length - 1].id).color = v; save(); render(); break;
      case 'person-delete': {
        const id = ui.stack[ui.stack.length - 1].id;
        if (!ui.confirmDelete) { ui.confirmDelete = true; renderSheet(); break; }
        state.people = state.people.filter((p) => p.id !== id);
        if (state.activeId === id) state.activeId = state.people[0] ? state.people[0].id : null;
        ui.stack = []; ui.confirmDelete = false; save();
        if (!state.people.length) { draft = newDraft(); ui.stack = [{ type: 'pattern' }]; }
        render(); break;
      }
      case 'pattern-new': draft = newDraft({ personId: ui.stack[ui.stack.length - 1].id, back: true }); openSheet({ type: 'pattern' }); break;
      case 'pattern-edit': draft = newDraft({ personId: ui.stack[ui.stack.length - 1].id, entryId: el.dataset.id, back: true }); openSheet({ type: 'pattern' }); break;
      case 'preset': {
        const pr = PRESETS.find((x) => x.id === el.dataset.id);
        draft.preset = pr.id; draft.cycle = pr.cycle.slice(); draft.offset = 0; renderSheet(); break;
      }
      case 'custom': draft.preset = 'custom'; renderSheet(); break;
      case 'cell': {
        const i = Number(el.dataset.i);
        draft.cycle[i] = TYPES[(TYPES.indexOf(draft.cycle[i]) + 1) % TYPES.length];
        renderSheet(); break;
      }
      case 'cell-add': if (draft.cycle.length < MAX_CYCLE) draft.cycle.push('off'); renderSheet(); break;
      case 'cell-del': if (draft.cycle.length > 1) draft.cycle.pop(); renderSheet(); break;
      case 'pat-save': savePattern(); break;
      case 'pat-delete': {
        const p = person(draft.personId);
        p.schedules = p.schedules.filter((x) => x.id !== draft.entryId);
        save(); draft = null; ui.stack.pop(); render(); break;
      }
      case 'closures-open': openSheet({ type: 'closures', id: el.dataset.id }); break;
      case 'pop': popSheet(); break;
      case 'pop-holiday': hdraft = null; popSheet(); break;
      case 'w-cell': {
        const p = person(ui.stack[ui.stack.length - 1].id);
        const dow = el.dataset.dow;
        const cur = p.weekly[dow] || [];
        p.weekly[dow] = cur.includes(el.dataset.t) ? cur.filter((x) => x !== el.dataset.t) : cur.concat(el.dataset.t);
        save(); render(); break;
      }
      case 'w-row': {
        const p = person(ui.stack[ui.stack.length - 1].id);
        const dow = el.dataset.dow;
        const cols = [...document.querySelectorAll(`.wm-cell[data-dow="${dow}"]`)].map((c) => c.dataset.t);
        const cur = p.weekly[dow] || [];
        p.weekly[dow] = cols.every((c) => cur.includes(c)) ? cur.filter((x) => !cols.includes(x)) : [...new Set(cur.concat(cols))];
        save(); render(); break;
      }
      case 'h-new': hdraft = newHoliday(ui.stack[ui.stack.length - 1].id); openSheet({ type: 'holiday' }); break;
      case 'h-edit': {
        const pid = ui.stack[ui.stack.length - 1].id;
        hdraft = newHoliday(pid, person(pid).holidays.find((x) => x.id === el.dataset.id));
        openSheet({ type: 'holiday' }); break;
      }
      case 'h-save': {
        const p = person(hdraft.personId);
        const { personId, ...h } = hdraft;
        if (!(pos(h.toDate, h.toSlot) > pos(h.fromDate, h.fromSlot))) break;
        h.name = h.name.trim();
        if (h.id) p.holidays = p.holidays.map((x) => (x.id === h.id ? h : x)); else p.holidays.push({ ...h, id: uid() });
        p.holidays.sort((x, y) => (x.fromDate < y.fromDate ? -1 : 1));
        save(); hdraft = null; ui.stack.pop(); render(); break;
      }
      case 'h-delete': {
        const p = person(hdraft.personId);
        p.holidays = p.holidays.filter((x) => x.id !== hdraft.id);
        save(); hdraft = null; ui.stack.pop(); render(); break;
      }
      case 'export': exportData(); break;
      case 'import': { const f = document.getElementById('import-file'); if (f) f.click(); break; }
      default: break;
    }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    const k = el.dataset && el.dataset.in;
    if (!k) return;
    if (k === 'pname') {
      const top = ui.stack[ui.stack.length - 1];
      person(top.id).name = el.value; save();
      const bar = document.querySelector('.sheet .bar h2');
      if (bar) bar.textContent = el.value || t('edit_person');
    } else if (k === 'draft-pname') draft.pname = el.value;
    else if (k === 'draft-name') draft.name = el.value;
    else if (k === 'draft-from') { if (el.value) { draft.from = el.value; renderSheet(); const f = document.querySelector('.sheet [data-in="draft-from"]'); if (f) f.focus(); } }
    else if (k === 'draft-offset') { draft.offset = Number(el.value); renderSheet(); }
    else if (k === 'h-name') hdraft.name = el.value;
    else if (k === 'h-from' || k === 'h-to') {
      if (!el.value) return;
      if (k === 'h-from') {
        hdraft.fromDate = el.value;
        if (pos(hdraft.toDate, hdraft.toSlot) <= pos(hdraft.fromDate, hdraft.fromSlot)) { hdraft.toDate = ymd(addDays(parse(el.value), 1)); hdraft.toSlot = 'start'; }
      } else hdraft.toDate = el.value;
      renderSheet(); const f = document.querySelector(`.sheet [data-in="${k}"]`); if (f) f.focus();
    }
    else if (k === 'h-fromslot') { hdraft.fromSlot = el.value; renderSheet(); }
    else if (k === 'h-toslot') { hdraft.toSlot = el.value; renderSheet(); }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.in === 'pname') render();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ui.stack.length && !sheetLocked()) {
      ui.stack = []; draft = null; renderSheet(); render();
    }
  });

  /* Month carousel: previous, current and next month sit side by side and follow the finger. */
  let calCtl = null;
  let swallowClick = 0;
  const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const REST = 'translateX(-33.3333%)';

  function bindSwipe() {
    calCtl = null;
    const vp = document.getElementById('cal-vp');
    if (!vp) return;
    const track = vp.firstElementChild;
    const panes = [...track.children];
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const syncHeight = () => { vp.style.height = `${panes[1].offsetHeight}px`; };
    syncHeight();
    let busy = false;
    let start = null;
    let dragging = false;
    let dx = 0;

    function go(dir) {
      if (busy) return;
      busy = true;
      const ms = still ? 0 : 340;
      track.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      track.style.transform = dir === 0 ? REST : dir > 0 ? 'translateX(-66.6667%)' : 'translateX(0)';
      if (dir !== 0) {
        const target = panes[1 + dir];
        vp.style.transition = ms ? `height ${ms}ms ${EASE}` : 'none';
        vp.style.height = `${target.offsetHeight}px`;
        const title = document.getElementById('mtitle');
        if (title) title.textContent = monthTitle(monthAt(ui.month, dir));
      }
      setTimeout(() => {
        busy = false;
        if (dir !== 0) { ui.month = monthAt(ui.month, dir); render(); }
        else { vp.style.transition = 'none'; }
      }, ms);
    }
    calCtl = { go };

    vp.addEventListener('pointerdown', (e) => {
      if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      dragging = false;
      dx = 0;
    });
    vp.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          dragging = true;
          try { vp.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
          track.style.transition = 'none';
        } else return;
      }
      const w = vp.clientWidth;
      const x = Math.max(-w, Math.min(w, dx));
      track.style.transform = `translateX(calc(-33.3333% + ${x}px))`;
      // ease the card height toward the month being revealed
      const dir = x < 0 ? 1 : -1;
      const from = panes[1].offsetHeight;
      const to = panes[1 + dir].offsetHeight;
      vp.style.transition = 'none';
      vp.style.height = `${from + (to - from) * Math.min(Math.abs(x) / w, 1)}px`;
    });
    const finish = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const moved = dragging;
      const velocity = dx / Math.max(performance.now() - start.t, 1);
      start = null;
      if (!moved) return;
      swallowClick = performance.now();
      const w = vp.clientWidth;
      const far = Math.abs(dx) > w * 0.28;
      const flick = Math.abs(velocity) > 0.45 && Math.abs(dx) > 24;
      go(e.type !== 'pointercancel' && (far || flick) ? (dx < 0 ? 1 : -1) : 0);
    };
    vp.addEventListener('pointerup', finish);
    vp.addEventListener('pointercancel', finish);
    window.addEventListener('resize', () => { if (!busy && document.getElementById('cal-vp') === vp) syncHeight(); });
  }

  document.addEventListener('click', (e) => {
    if (performance.now() - swallowClick < 350) { e.stopPropagation(); e.preventDefault(); swallowClick = 0; }
  }, true);

  /* ---------- backup ---------- */
  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `shifts-backup-${todayStr()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { /* download unavailable */ }
  }

  function onImport(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.people)) throw new Error('bad');
        state = normalise(data);
        save(); ui.stack = []; render();
      } catch (e) {
        const foot = document.querySelector('.foot');
        if (foot) foot.insertAdjacentHTML('afterbegin', `<span class="err">${t('import_error')}</span><br>`);
      }
    };
    r.readAsText(file);
  }

  /* ---------- boot ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ui.today !== todayStr()) { ui.today = todayStr(); render(); }
  });

  if (!state.people.length) {
    if (state.settings.langDone) { draft = newDraft(); ui.stack = [{ type: 'pattern' }]; } else ui.stack = [{ type: 'lang' }];
  }
  render();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // A new version has taken over: reload once so the open app matches it (unless someone is mid-edit).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || ui.stack.length) return;
      reloaded = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
    });
  }
})();
