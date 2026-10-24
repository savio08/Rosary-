/* 32 Rosaries with Mary — 15-day Prayer Journey (English / മലയാളം)
   Everything runs locally in the browser. Progress is always computed from the saved checkboxes. */
(function () {
  'use strict';

  var C = CONTENT, UIX = UI;
  var TARGETS = C.targets, ORDER = C.order, ND = TARGETS.length;
  var START = [], TOTAL = 0;
  TARGETS.forEach(function (t, i) { START[i] = TOTAL; TOTAL += t; });
  var SETS = Math.floor(TOTAL / ORDER.length);
  var KEY = 'rosaries32.v2', OLDKEY = 'rosaries31.v1', LKEY = 'rosaries32.lang', PKEY = 'rosaries32.prefs';
  var APP_ID = '32-rosaries-with-mary', OLD_APP_ID = '31-rosaries-with-mary';
  var CATS = ['family', 'health', 'vocation', 'faith', 'church', 'friends', 'gratitude', 'other'];
  var OLD_CATS = { 'Family': 'family', 'Health and healing': 'health', 'Vocation and work': 'vocation',
    'Faith and spiritual growth': 'faith', 'Church and priests': 'church', 'Friends': 'friends', 'Gratitude': 'gratitude', 'Other': 'other' };
  var CIRC = 2 * Math.PI * 52;
  var SIZES = { s: 16, m: 18, l: 20, xl: 22 };

  var storageOK = true, memCopy = null, saveTimer = null, wakeLock = null;
  var ui = { filter: 'all', editing: null };

  /* ---------- storage helpers ---------- */
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { storageOK = false; return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { storageOK = false; return false; } }

  /* ---------- language ---------- */
  var lang = (function () {
    var l = sget(LKEY);
    if (l === 'en' || l === 'ml') return l;
    var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    return nav.indexOf('ml') === 0 ? 'ml' : 'en';
  })();
  function t(k, v) {
    var s = UIX[lang] && UIX[lang][k];
    if (s == null) s = UIX.en[k];
    if (s == null) return k;
    if (v) s = s.replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? v[x] : m; });
    return s;
  }
  function L() { return C[lang] && C[lang].days ? C[lang] : C.en; }
  function lc(k) { return (C[lang] && C[lang][k] != null) ? C[lang][k] : C.en[k]; }
  function mname(key) {
    var m = lc('mysteries')[key] || C.en.mysteries[key];
    return lang === 'en' ? m.name + ' Mysteries' : m.name;
  }
  function mshort(key) { return t('m_' + key); }
  function mitems(key) { return (lc('mysteries')[key] || C.en.mysteries[key]).items; }

  /* ---------- prefs ---------- */
  var prefs = (function () {
    var p = { size: 'm', wake: true, vibrate: true };
    try { var o = JSON.parse(sget(PKEY) || '{}'); if (SIZES[o.size]) p.size = o.size; if (typeof o.wake === 'boolean') p.wake = o.wake; if (typeof o.vibrate === 'boolean') p.vibrate = o.vibrate; } catch (e) { /* defaults */ }
    return p;
  })();
  function savePrefs() { sset(PKEY, JSON.stringify(prefs)); }

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dayText(i) { var d = L().days[i] || C.en.days[i]; return d; }
  function gKey(g) { return ORDER[(g - 1) % ORDER.length]; }          // mystery of global Rosary g (1-based)
  function gSet(g) { return Math.floor((g - 1) / ORDER.length) + 1; } // which complete set (1..8)

  /* ---------- state ---------- */
  function blank() { return { checks: {}, notes: {}, intentions: [], live: { g: 0, s: 0, c: 0 } }; }
  function sanitize(s) {
    var out = blank();
    if (!s || typeof s !== 'object') s = {};
    for (var i = 0; i < ND; i++) {
      var k = String(i + 1);
      var src = s.checks && Array.isArray(s.checks[k]) ? s.checks[k] : [];
      var arr = [];
      for (var j = 0; j < TARGETS[i]; j++) arr.push(src[j] === true);
      out.checks[k] = arr;
      var n = s.notes && s.notes[k];
      out.notes[k] = {
        names: n && typeof n.names === 'string' ? n.names.slice(0, 5000) : '',
        gratitude: n && typeof n.gratitude === 'string' ? n.gratitude.slice(0, 5000) : ''
      };
    }
    if (Array.isArray(s.intentions)) {
      s.intentions.slice(0, 500).forEach(function (it) {
        if (!it || typeof it.text !== 'string' || !it.text.trim()) return;
        var cat = CATS.indexOf(it.cat) !== -1 ? it.cat : (OLD_CATS[it.cat] || 'other');
        out.intentions.push({
          id: typeof it.id === 'string' ? it.id.slice(0, 40) : 'i' + Math.random().toString(36).slice(2, 10),
          text: it.text.slice(0, 2000), cat: cat, ongoing: it.ongoing === true,
          created: typeof it.created === 'string' ? it.created.slice(0, 40) : ''
        });
      });
    }
    var lv = s.live;
    if (lv && Number.isInteger(lv.g) && lv.g >= 1 && lv.g <= TOTAL && Number.isInteger(lv.s) && lv.s >= 0 && lv.s <= 7 && Number.isInteger(lv.c) && lv.c >= 0 && lv.c <= 10) {
      out.live = { g: lv.g, s: lv.s, c: lv.c };
    }
    return out;
  }
  // Older 31-Rosary version stored progress under calendar dates; map those days to Day 1, 2, 3 … in order.
  function migrateOld(old) {
    var s = { checks: {}, notes: {}, intentions: old && old.intentions };
    var dates = Object.keys((old && old.checks) || {}).sort();
    dates.slice(0, ND).forEach(function (dt, i) {
      s.checks[i + 1] = old.checks[dt];
      s.notes[i + 1] = old.notes && old.notes[dt];
    });
    return sanitize(s);
  }
  function load() {
    var raw = sget(KEY);
    if (raw) { try { return sanitize(JSON.parse(raw)); } catch (e) { /* fall through */ } }
    var old = sget(OLDKEY);
    if (old) { try { var m = migrateOld(JSON.parse(old)); sset(KEY, JSON.stringify(m)); return m; } catch (e) { /* ignore */ } }
    return sanitize(memCopy);
  }
  var state = load();
  function save() {
    if (!sset(KEY, JSON.stringify(state))) { memCopy = state; warn(); }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
  function flush() { clearTimeout(saveTimer); save(); }
  function warn() { var w = $('#storage-warning'); if (w) w.hidden = storageOK; }

  /* ---------- counts & balance ---------- */
  function checks(i) { return state.checks[String(i + 1)]; }
  function doneFor(i) { return checks(i).filter(Boolean).length; }
  function leftFor(i) { return TARGETS[i] - doneFor(i); }
  function totalDone() { var a = 0; for (var i = 0; i < ND; i++) a += doneFor(i); return a; }
  function isDone(g) { // global Rosary number, 1-based
    for (var i = ND - 1; i >= 0; i--) if (g > START[i]) return checks(i)[g - START[i] - 1] === true;
    return false;
  }
  function setDone(g, v) {
    for (var i = ND - 1; i >= 0; i--) if (g > START[i]) { checks(i)[g - START[i] - 1] = v; return; }
  }
  function dayOf(g) { for (var i = ND - 1; i >= 0; i--) if (g > START[i]) return i; return 0; }
  function setCount(k) { var a = 0; for (var j = 0; j < ORDER.length; j++) if (isDone((k - 1) * ORDER.length + j + 1)) a++; return a; }
  function setsDone() { var a = 0; for (var k = 1; k <= SETS; k++) if (setCount(k) === ORDER.length) a++; return a; }
  function nextDay() { for (var i = 0; i < ND; i++) if (leftFor(i) > 0) return i; return -1; }
  function nextRosary() { for (var g = 1; g <= TOTAL; g++) if (!isDone(g)) return g; return 0; }
  function note(i) { return state.notes[String(i + 1)]; }
  function pct(n) { return Math.round(n * 100 / TOTAL); }

  /* ---------- ui bits ---------- */
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function confirmDlg(title, text, okLabel) {
    return new Promise(function (resolve) {
      var dlg = $('#dlg');
      if (!dlg || typeof dlg.showModal !== 'function') { resolve(window.confirm(title + '\n\n' + text)); return; }
      $('#dlg-title').textContent = title; $('#dlg-text').textContent = text; $('#dlg-ok').textContent = okLabel || t('confirm');
      dlg.returnValue = '';
      var h = function () { dlg.removeEventListener('close', h); resolve(dlg.returnValue === 'ok'); };
      dlg.addEventListener('close', h);
      dlg.showModal();
    });
  }
  function dots(i) {
    return '<span class="dots" aria-hidden="true">' + checks(i).map(function (v) { return '<i class="dot' + (v ? ' on' : '') + '"></i>'; }).join('') + '</span>';
  }
  function progressBlock() {
    var done = totalDone();
    return '<div class="bar" role="progressbar" aria-label="' + esc(t('prayedLabel')) + '" aria-valuemin="0" aria-valuemax="' + TOTAL +
      '" aria-valuenow="' + done + '" data-prog><i data-bar style="width:' + pct(done) + '%"></i></div>' +
      '<p class="muted center" style="margin:.5em 0 0">' + t('progressLine', { d: '<b data-bind="done">' + done + '</b>', t: TOTAL, p: '<span data-bind="pct">' + pct(done) + '</span>' }) + '</p>' +
      '<p class="balance center"><span class="pill">' + t('balance') + '</span> ' + t('balanceLine', { l: '<b data-bind="left">' + (TOTAL - done) + '</b>' }) + '</p>';
  }
  function updateBindings() {
    var done = totalDone(), left = TOTAL - done;
    $$('[data-bind="done"]').forEach(function (e) { e.textContent = done; });
    $$('[data-bind="left"]').forEach(function (e) { e.textContent = left; });
    $$('[data-bind="pct"]').forEach(function (e) { e.textContent = pct(done); });
    $$('[data-bind="sets"]').forEach(function (e) { e.textContent = setsDone(); });
    $$('[data-bar]').forEach(function (e) { e.style.width = pct(done) + '%'; });
    $$('[data-prog]').forEach(function (e) { e.setAttribute('aria-valuenow', done); });
    $$('[data-ring]').forEach(function (e) { e.setAttribute('stroke-dashoffset', (CIRC * (1 - done / TOTAL)).toFixed(2)); });
    $$('[data-day-done]').forEach(function (e) { e.textContent = doneFor(+e.getAttribute('data-day-done')); });
    $$('[data-day-left]').forEach(function (e) { e.textContent = leftFor(+e.getAttribute('data-day-left')); });
  }

  function rLabel(g) { return t('rosaryOf', { g: g }) + ' · ' + mshort(gKey(g)); }
  function rosaryRows(i) {
    return '<div class="rosaries" role="group" aria-label="' + esc(t('dayN', { n: i + 1 })) + '">' + checks(i).map(function (v, k) {
      var g = START[i] + k + 1;
      return '<div class="rrow"><label class="check"><input type="checkbox" data-act="rosary" data-g="' + g + '" aria-label="' + esc(rLabel(g)) + '"' + (v ? ' checked' : '') +
        '><span class="box" aria-hidden="true"></span><span>' + esc(rLabel(g)) + '<small class="setno">' + esc(t('setOf', { c: gSet(g), s: SETS })) + '</small></span></label>' +
        '<a class="rlink" href="#/rosary/' + g + '">' + t('prayNow') + ' ▸</a></div>';
    }).join('') + '</div>';
  }
  function dayBalanceLine(i) {
    var cum = START[i] + TARGETS[i];
    return '<p class="balance"><span class="pill">' + t('balance') + '</span> ' +
      t('dayBalance', { d: '<b data-day-done="' + i + '">' + doneFor(i) + '</b>', t: TARGETS[i], l: '<b data-day-left="' + i + '">' + leftFor(i) + '</b>' }) +
      '<br><span class="muted" style="font-size:.92rem">' + t('overallBalance', { l: '<b data-bind="left">' + (TOTAL - totalDone()) + '</b>', t: TOTAL }) + ' · ' + t('pace', { c: cum, t: TOTAL }) + '</span></p>';
  }
  function noteFields(i, idp) {
    var n = note(i), d = dayText(i);
    return '<label class="fl" for="' + idp + 'names">' + t('namesLabel') + '</label>' +
      '<textarea id="' + idp + 'names" data-act="note" data-day="' + i + '" data-field="names" placeholder="' + esc(t('namesPh')) + '">' + esc(n.names) + '</textarea>' +
      '<label class="fl" for="' + idp + 'grat">' + t('gratLabel') + ' — ' + esc(d.gratitude) + '</label>' +
      '<textarea id="' + idp + 'grat" data-act="note" data-day="' + i + '" data-field="gratitude" placeholder="' + esc(t('gratPh')) + '">' + esc(n.gratitude) + '</textarea>';
  }
  function dayMysteryLine(i) {
    var keys = [], seen = {};
    for (var k = 1; k <= TARGETS[i]; k++) { var key = gKey(START[i] + k); if (!seen[key]) { seen[key] = 1; keys.push(key); } }
    return '<p class="muted" style="font-style:italic;margin:.3em 0 0">' + t('dayMysteries') + ' ' + keys.map(mname).map(esc).join(' · ') + '</p>';
  }

  /* ---------- views ---------- */
  function viewHome() {
    var done = totalDone(), nd = nextDay(), ng = nextRosary(), d = nd >= 0 ? dayText(nd) : null;
    var h = '<section class="hero reveal"><div class="hero-frame"><img src="assets/mary.svg" alt="' + esc(t('heroAlt')) + '" width="300" height="375"></div>' +
      '<h1>' + t('appTitle') + '</h1><p class="sub">' + t('tagline') + '</p><p class="dates">' + t('challenge') + '</p>' +
      '<p class="muted">' + t('heroSub') + '</p></section>';
    h += '<section class="card center reveal"><p class="eyebrow">' + t('nextStep') + '</p>';
    if (nd >= 0) {
      h += '<h2>' + t('dayOf', { n: nd + 1, t: ND }) + ' · ' + esc(d.title) + '</h2><p class="big">' + esc(d.intention) + '</p>' +
        dayBalanceLine(nd) +
        '<div class="btn-row center"><a class="btn gold" href="#/rosary/' + ng + '">' + t('prayNext', { g: ng }) + '</a>' +
        '<a class="btn ghost" href="#/day/' + (nd + 1) + '">' + t('openDay') + '</a></div>';
    } else {
      h += '<h2>' + t('allDoneTitle') + '</h2><p>' + t('allDoneText', { t: TOTAL }) + '</p>' +
        '<div class="btn-row center"><a class="btn" href="#/progress">' + t('viewJourney') + '</a><a class="btn ghost" href="#/days">' + t('rereadDays') + '</a></div>';
    }
    h += '</section>';
    h += '<section class="card reveal"><p class="eyebrow center">' + t('overall') + '</p>' + progressBlock() +
      '<p class="muted center" style="font-size:.95rem;margin:.6em 0 0">' + t('setsLine', { c: '<b data-bind="sets">' + setsDone() + '</b>', s: SETS }) + '</p>' +
      '<p class="muted center" style="font-size:.9rem;margin:.4em 0 0">' + t('planNote', { t: TOTAL }) + '</p></section>';
    var lk = lc('luke');
    h += '<section class="card reveal center"><p class="eyebrow">' + t('scripture') + '</p><p class="verse">“' + esc(nd >= 0 ? d.verse : lk.verse) +
      '”<span class="verse-ref">— ' + esc(nd >= 0 ? d.ref : lk.ref) + '</span></p></section>';
    return h;
  }

  function viewDays() {
    var nd = nextDay();
    var h = '<h1 class="reveal">' + t('fifteenDays') + '</h1><p class="muted reveal">' + t('daysIntro') + '</p><ul class="dlist">';
    for (var i = 0; i < ND; i++) {
      var d = dayText(i), full = leftFor(i) === 0;
      h += '<li><a class="drow' + (i === nd ? ' today' : '') + (full ? ' full' : '') + '" href="#/day/' + (i + 1) + '"><span class="dnum" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span><span class="dmeta">' + t('dayN', { n: i + 1 }) + (i === nd ? '<span class="today-badge">' + t('next') + '</span>' : '') + (full ? '<span class="today-badge ok">✓</span>' : '') + '</span>' +
        '<span class="dint">' + esc(d.title) + '</span>' +
        '<span class="dbal">' + t('dayBalance', { d: doneFor(i), t: TARGETS[i], l: leftFor(i) }) + '</span></span>' +
        dots(i) + '</a></li>';
    }
    return h + '</ul>';
  }

  function dayCard(i, opts) {
    opts = opts || {};
    var d = dayText(i), n = i + 1;
    var h = '<article class="card' + (opts.print ? ' pcard' : '') + '">' +
      '<p class="eyebrow center">' + t('dayOf', { n: n, t: ND }) + '</p>' +
      '<h2 class="center" style="font-size:1.6rem">' + esc(d.title) + '</h2><div class="divider" aria-hidden="true">✦</div>' +
      '<div class="card rose plain" style="padding:14px 16px"><p class="eyebrow center" style="margin:0 0 .2em">' + t('dayIntention') + '</p><p class="center" style="margin:0;font-weight:700">' + esc(d.intention) + '</p></div>' +
      '<p class="verse center">“' + esc(d.verse) + '”<span class="verse-ref">— ' + esc(d.ref) + '</span></p>' +
      '<p class="eyebrow">' + t('reflection') + '</p><p>' + esc(d.reflection) + '</p>' +
      '<p class="eyebrow">' + t('rosariesForDay', { t: TARGETS[i] }) + '</p>';
    if (opts.print) {
      h += '<p>' + checks(i).map(function (v, k) { return '<span class="pbox' + (v ? ' on' : '') + '"></span>' + esc(rLabel(START[i] + k + 1)) + '&nbsp;&nbsp;&nbsp;'; }).join('') + '</p>' +
        '<p class="eyebrow">' + t('namesLabel') + '</p><p style="white-space:pre-wrap">' + esc(note(i).names) + '</p><div class="wl"></div><div class="wl"></div>' +
        '<p class="eyebrow">' + t('gratLabel') + ' — ' + esc(d.gratitude) + '</p><p style="white-space:pre-wrap">' + esc(note(i).gratitude) + '</p><div class="wl"></div><div class="wl"></div>';
    } else {
      h += rosaryRows(i) + dayBalanceLine(i) + dayMysteryLine(i) +
        '<div class="btn-row"><button class="btn ghost small" data-act="day-all" data-day="' + i + '">' + t('markAll') + '</button>' +
        '<button class="btn ghost small" data-act="day-clear" data-day="' + i + '">' + t('clearDay') + '</button></div>' + noteFields(i, 'd' + n);
    }
    return h + '</article>';
  }

  function viewDay(arg) {
    var n = parseInt(arg, 10), i = n - 1;
    if (!(i >= 0 && i < ND)) return notFound();
    var h = '<div class="nav2 no-print">' + (n > 1 ? '<a class="btn ghost small" href="#/day/' + (n - 1) + '">← ' + t('dayN', { n: n - 1 }) + '</a>' : '<a class="btn ghost small" href="#/days">' + t('allDays') + '</a>') +
      (n < ND ? '<a class="btn ghost small" href="#/day/' + (n + 1) + '">' + t('dayN', { n: n + 1 }) + ' →</a>' : '<a class="btn ghost small" href="#/progress">' + t('tabProgress') + ' →</a>') + '</div>';
    h += dayCard(i);
    h += '<div class="btn-row center"><a class="btn gold" href="#/pray/' + n + '">' + t('openPrayerView') + '</a></div>';
    h += '<section class="card plain" style="margin-top:18px"><p class="eyebrow center">' + t('overall') + '</p>' + progressBlock() + '</section>';
    return h;
  }

  function viewPray(arg) {
    var n = parseInt(arg, 10), i = n - 1;
    if (!(i >= 0 && i < ND)) return notFound();
    var d = dayText(i), s = 0, step = function () { s++; return '<span class="step" aria-hidden="true">' + s + '</span>'; };
    var h = '<div class="pray"><p class="eyebrow center reveal">' + t('dayOf', { n: n, t: ND }) + '</p>' +
      '<h1 class="center reveal">' + esc(d.title) + '</h1><p class="muted center reveal">' + t('takeBreath') + '</p>';
    h += '<section class="card center reveal"><p class="eyebrow">' + step() + t('dayIntention') + '</p><p class="big">' + esc(d.intention) + '</p></section>';
    h += '<section class="card center reveal"><p class="eyebrow">' + step() + t('scripture') + '</p><p class="verse big">“' + esc(d.verse) + '”<span class="verse-ref">— ' + esc(d.ref) + '</span></p></section>';
    h += '<section class="card reveal"><p class="eyebrow">' + step() + t('reflection') + '</p><p class="big">' + esc(d.reflection) + '</p></section>';
    h += '<section class="card reveal"><p class="eyebrow">' + step() + t('rosariesForDay', { t: TARGETS[i] }) + '</p>' + rosaryRows(i) + dayBalanceLine(i) + dayMysteryLine(i) +
      '<p style="margin:.8em 0 0"><a href="#/guide">' + t('openGuide') + '</a></p></section>';
    h += '<section class="card reveal"><p class="eyebrow">' + step() + t('closingGrat') + '</p><p>' + esc(d.gratitude) + '</p>' +
      noteFields(i, 'p' + n) + '</section>';
    h += '<div class="btn-row center reveal"><a class="btn" href="#/day/' + n + '">' + t('backToCard') + '</a><a class="btn ghost" href="#/progress">' + t('seeProgress') + '</a></div></div>';
    return h;
  }

  /* ----- guided Rosary with bead counter ----- */
  function viewRosary(arg) {
    var g = parseInt(arg, 10);
    if (!(g >= 1 && g <= TOTAL)) return notFound();
    if (state.live.g !== g) { state.live = { g: g, s: isDone(g) ? 7 : 0, c: 0 }; save(); }
    return '<div class="pray"><div id="guided"></div></div>';
  }
  function paintGuided() {
    var host = $('#guided'); if (!host) return;
    var g = state.live.g, s = state.live.s, c = state.live.c, key = gKey(g), di = dayOf(g);
    var h = '<p class="eyebrow center">' + t('dayOf', { n: di + 1, t: ND }) + '</p>' +
      '<h1 class="center">' + t('rosaryOfTotal', { g: g, t: TOTAL }) + '</h1>' +
      '<p class="center gold-t" style="margin:0 0 .6em"><b>' + esc(mname(key)) + '</b> · ' + esc(t('setOf', { c: gSet(g), s: SETS })) + '</p>';
    // stage track
    h += '<ol class="track" aria-label="' + esc(t('stages')) + '">';
    for (var k = 0; k <= 6; k++) {
      h += '<li class="' + (k < s ? 'done' : k === s ? 'cur' : '') + '"><span class="sr">' + (k === 0 ? t('opening') : k === 6 ? t('closing') : t('decadeN', { n: k })) + '</span></li>';
    }
    h += '</ol>';
    if (s === 0) {
      h += '<section class="card"><p class="eyebrow">' + t('opening') + '</p><p>' + t('openingOwn') + '</p></section>' +
        '<div class="btn-row center"><button class="btn gold" data-act="g-next">' + t('next') + ' →</button></div>';
    } else if (s >= 1 && s <= 5) {
      var item = mitems(key)[s - 1];
      h += '<section class="card center"><p class="eyebrow">' + t('decadeOf', { n: s }) + ' · ' + esc(mshort(key)) + '</p>' +
        '<h2 class="mystery-name">' + esc(item) + '</h2><p class="muted">' + t('announce') + '</p></section>';
      h += '<section class="card center"><p class="eyebrow">' + t('hailMarys') + '</p><p class="count"><b>' + c + '</b> / 10</p><div class="beads" aria-hidden="true">';
      for (var b = 0; b < 10; b++) h += '<i class="bead' + (b < c ? ' on' : '') + '"></i>';
      h += '</div><button class="tap" data-act="tap"' + (c >= 10 ? ' disabled' : '') + ' aria-label="' + esc(t('tapAria', { c: c })) + '">' + (c >= 10 ? '✓' : t('hailMaryBtn')) + '</button>' +
        '<div class="btn-row center"><button class="btn ghost small" data-act="undo"' + (c <= 0 ? ' disabled' : '') + '>' + t('undo') + '</button></div>' + '</section>';
      h += '<div class="btn-row center"><button class="btn ghost" data-act="g-back">← ' + t('back') + '</button>' +
        '<button class="btn gold" data-act="g-next"' + (c < 10 ? ' data-soft="1"' : '') + '>' + (s === 5 ? t('toClosing') : t('nextDecade')) + ' →</button></div>';
      if (c < 10) h += '<p class="muted center" style="font-size:.9rem">' + t('skipHint') + '</p>';
    } else if (s === 6) {
      h += '<section class="card"><p class="eyebrow">' + t('closing') + '</p><p>' + t('closingOwn') + '</p></section>' +
        '<div class="btn-row center"><button class="btn ghost" data-act="g-back">← ' + t('back') + '</button><button class="btn gold" data-act="g-finish">' + t('finishTick') + '</button></div>';
    } else {
      var ng = nextRosary();
      h += '<section class="card center"><div class="divider" aria-hidden="true">✦</div><h2>' + t('rosaryDone', { g: g }) + '</h2>' + dayBalanceLine(di) +
        '<p class="muted">' + t('setsLine', { c: setsDone(), s: SETS }) + '</p><div class="btn-row center">' +
        (ng ? '<a class="btn gold" href="#/rosary/' + ng + '">' + t('prayNext', { g: ng }) + '</a>' : '<a class="btn gold" href="#/progress">' + t('viewJourney') + '</a>') +
        '<a class="btn ghost" href="#/day/' + (di + 1) + '">' + t('backToCard') + '</a>' +
        '<button class="btn ghost small" data-act="g-again">' + t('prayAgain') + '</button></div></section>';
    }
    host.innerHTML = h;
  }

  function viewProgress() {
    var done = totalDone(), left = TOTAL - done;
    var h = '<h1 class="reveal">' + t('tabProgress') + '</h1><p class="muted reveal">' + t('progressIntro') + '</p>';
    h += '<section class="card center reveal"><svg class="ring" viewBox="0 0 120 120" role="img" aria-label="' + esc(t('progressLine', { d: done, t: TOTAL, p: pct(done) })) + '">' +
      '<circle class="ring-track" cx="60" cy="60" r="52" fill="none" stroke-width="9"/>' +
      '<circle class="ring-val" data-ring cx="60" cy="60" r="52" fill="none" stroke-width="9" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="' +
      CIRC.toFixed(2) + '" stroke-dashoffset="' + (CIRC * (1 - done / TOTAL)).toFixed(2) + '"/>' +
      '<text x="60" y="64" text-anchor="middle" font-size="26" font-weight="700" fill="var(--blue-d)"><tspan data-bind="pct">' + pct(done) + '</tspan>%</text>' +
      '<text x="60" y="82" text-anchor="middle" font-size="9" fill="var(--muted)">' + esc(t('complete')) + '</text></svg>' +
      '<div class="stats four"><div class="stat"><b>' + TOTAL + '</b><span>' + t('planned') + '</span></div><div class="stat"><b data-bind="done">' + done +
      '</b><span>' + t('prayed') + '</span></div><div class="stat"><b data-bind="left">' + left + '</b><span>' + t('balance') + '</span></div>' +
      '<div class="stat"><b><span data-bind="sets">' + setsDone() + '</span>/' + SETS + '</b><span>' + t('setsWord') + '</span></div></div></section>';
    h += '<section class="card reveal"><h2>' + t('overviewTitle') + '</h2><p class="muted" style="font-size:.95rem">' + t('overviewNote') + '</p><ul class="dlist">';
    for (var i = 0; i < ND; i++) {
      h += '<li><a class="drow" href="#/day/' + (i + 1) + '"><span class="dnum" aria-hidden="true">' + (i + 1) + '</span><span><span class="dmeta">' + t('dayN', { n: i + 1 }) +
        '</span><span class="dint">' + t('dayBalance', { d: '<b data-day-done="' + i + '">' + doneFor(i) + '</b>', t: TARGETS[i], l: '<b data-day-left="' + i + '">' + leftFor(i) + '</b>' }) +
        '</span><span class="dbal">' + t('pace', { c: START[i] + TARGETS[i], t: TOTAL }) + '</span></span>' + dots(i) + '</a></li>';
    }
    h += '</ul></section>';
    h += '<section class="card reveal"><h2>' + t('setsTitle') + '</h2><p class="muted" style="font-size:.95rem">' + t('setsNote', { s: SETS }) + '</p><ul class="dlist">';
    for (var k = 1; k <= SETS; k++) {
      h += '<li><div class="drow setrow"><span class="dnum" aria-hidden="true">' + k + '</span><span><span class="dmeta">' + t('setN', { n: k }) + ' · ' + setCount(k) + '/' + ORDER.length + '</span>' +
        '<span class="dint">' + ORDER.map(function (m, j) { return (isDone((k - 1) * ORDER.length + j + 1) ? '● ' : '○ ') + esc(mshort(m)); }).join(' &nbsp; ') + '</span></span><span></span></div></li>';
    }
    return h + '</ul></section>';
  }

  function viewIntentions() {
    var editing = ui.editing && state.intentions.filter(function (x) { return x.id === ui.editing; })[0];
    var h = '<h1 class="reveal">' + t('myIntentions') + '</h1><p class="muted reveal">' + t('intIntro') + '</p>';
    h += '<form class="card reveal" id="int-form" novalidate><h2>' + (editing ? t('editIntention') : t('addIntention')) + '</h2>' +
      '<label class="fl" for="int-text">' + t('intentionWord') + '</label><textarea id="int-text" required maxlength="2000" placeholder="' + esc(t('intPh')) + '">' + esc(editing ? editing.text : '') + '</textarea>' +
      '<label class="fl" for="int-cat">' + t('categoryWord') + '</label><select id="int-cat">' + CATS.map(function (c) {
        return '<option value="' + c + '"' + (editing && editing.cat === c ? ' selected' : '') + '>' + esc(t('cat_' + c)) + '</option>';
      }).join('') + '</select>' +
      '<label class="checkline"><input type="checkbox" id="int-ongoing"' + (editing && editing.ongoing ? ' checked' : '') + '> ' + t('ongoingLong') + '</label>' +
      '<div class="btn-row"><button class="btn" type="submit">' + (editing ? t('saveChanges') : t('addIntention')) + '</button>' +
      (editing ? '<button class="btn ghost" type="button" data-act="int-cancel">' + t('cancel') + '</button>' : '') + '</div></form>';
    h += '<div class="chips" role="group" aria-label="' + esc(t('filterBy')) + '">' + ['all'].concat(CATS).concat(['ongoing']).map(function (c) {
      return '<button type="button" class="chip" data-act="int-filter" data-cat="' + c + '" aria-pressed="' + (ui.filter === c) + '">' + esc(t(c === 'all' ? 'all' : c === 'ongoing' ? 'ongoing' : 'cat_' + c)) + '</button>';
    }).join('') + '</div>';
    var list = state.intentions.filter(function (x) { return ui.filter === 'all' || (ui.filter === 'ongoing' ? x.ongoing : x.cat === ui.filter); });
    if (!list.length) h += '<p class="muted center">' + (state.intentions.length ? t('noneInCat') : t('noneYet')) + '</p>';
    list.forEach(function (x) {
      h += '<div class="int"><span class="cat">' + esc(t('cat_' + x.cat)) + '</span>' + (x.ongoing ? '<span class="ongoing">' + t('ongoing') + '</span>' : '') + '<p>' + esc(x.text) + '</p>' +
        '<div class="btn-row" style="margin:0"><button class="btn ghost small" data-act="int-edit" data-id="' + esc(x.id) + '">' + t('edit') + '</button>' +
        '<button class="btn ghost small" data-act="int-del" data-id="' + esc(x.id) + '">' + t('remove') + '</button>' +
        '<label class="checkline" style="margin:0 0 0 6px"><input type="checkbox" data-act="int-ongoing" data-id="' + esc(x.id) + '"' + (x.ongoing ? ' checked' : '') + '> ' + t('ongoing') + '</label></div></div>';
    });
    return h;
  }

  function viewGuide() {
    var h = '<h1 class="reveal">' + t('howTitle') + '</h1><p class="reveal">' + t('howIntro') + '</p>';
    h += '<h2 class="reveal">' + t('theMysteries') + '</h2><p class="muted reveal">' + t('mysteryOrder', { s: SETS }) + '</p><div class="myst reveal">' + ORDER.map(function (m) {
      return '<div class="card plain"><h3>' + esc(mname(m)) + '</h3><ol>' + mitems(m).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>';
    }).join('') + '</div>';
    return h;
  }

  function viewSettings() {
    var h = '<h1 class="reveal">' + t('settingsTitle') + '</h1>';
    h += '<section class="card reveal"><h2>' + t('languageWord') + '</h2><div class="seg" role="group" aria-label="' + esc(t('languageWord')) + '">' +
      '<button data-act="lang" data-lang="en" aria-pressed="' + (lang === 'en') + '">English</button><button data-act="lang" data-lang="ml" aria-pressed="' + (lang === 'ml') + '">മലയാളം</button></div>' +
      '<h2 style="margin-top:1em">' + t('textSize') + '</h2><div class="seg" role="group" aria-label="' + esc(t('textSize')) + '">' +
      ['s', 'm', 'l', 'xl'].map(function (k) { return '<button data-act="size" data-size="' + k + '" aria-pressed="' + (prefs.size === k) + '" style="font-size:' + (SIZES[k] - 2) + 'px">' + t('size_' + k) + '</button>'; }).join('') + '</div>' +
      '<label class="checkline"><input type="checkbox" data-act="pref-wake"' + (prefs.wake ? ' checked' : '') + '> ' + t('keepAwake') + '</label>' +
      '<label class="checkline"><input type="checkbox" data-act="pref-vibe"' + (prefs.vibrate ? ' checked' : '') + '> ' + t('vibrate') + '</label></section>';
    h += '<section class="card reveal"><h2>' + t('whereKept') + '</h2><p>' + t('whereKeptText') + '</p>' + (storageOK ? '' : '<p><b>' + t('storageUnavailable') + '</b></p>') + '</section>';
    h += '<section class="card reveal"><h2>' + t('backup') + '</h2><div class="btn-row"><button class="btn" data-act="export">' + t('exportBtn') + '</button>' +
      '<label class="btn ghost" style="cursor:pointer">' + t('importBtn') + '<input type="file" id="import-file" accept="application/json,.json" style="position:absolute;opacity:0;width:1px;height:1px"></label></div>' +
      '<p class="muted" style="font-size:.9rem;margin-top:.8em">' + t('importNote') + '</p></section>';
    h += '<section class="card reveal"><h2>' + t('folderWord') + '</h2><p>' + t('folderText') + '</p><div class="btn-row"><button class="btn" data-act="save-folder">' + t('saveFolderBtn') + '</button>' +
      '<button class="btn ghost" data-act="save-folder-new">' + t('otherFolderBtn') + '</button>' +
      '<button class="btn ghost" data-act="report">' + t('reportBtn') + '</button><a class="btn ghost" href="#/progress">' + t('seeProgress') + '</a></div>' +
      '<p class="muted" style="font-size:.9rem;margin-top:.8em">' + t('folderNote') + '</p></section>';
    h += '<section class="card reveal"><h2>' + t('printWord') + '</h2><p>' + t('printText', { n: ND }) + '</p><div class="btn-row"><a class="btn" href="#/print">' + t('printBtn') + '</a></div></section>';
    h += '<section class="card reveal"><h2>' + t('shareWord') + '</h2><p>' + t('shareText') + '</p><div class="btn-row"><button class="btn" data-act="share">' + t('shareBtn') + '</button></div></section>';
    h += '<section class="card reveal"><h2>' + t('homeScreen') + '</h2><p>' + t('homeScreenText') + '</p></section>';
    h += '<section class="card rose reveal"><h2>' + t('startAgain') + '</h2><p>' + t('startAgainText') + '</p><button class="btn danger" data-act="reset">' + t('resetBtn') + '</button></section>';
    return h;
  }

  function viewPrint() {
    var h = '<div class="print-bar"><button class="btn" data-act="do-print">' + t('printSave') + '</button><a class="btn ghost" href="#/settings">' + t('back') + '</a></div>' +
      '<h1 class="center no-print">' + t('printTitle', { n: ND }) + '</h1>';
    for (var i = 0; i < ND; i++) h += dayCard(i, { print: true });
    return h;
  }

  function notFound() { return '<h1>' + t('notFound') + '</h1><p><a href="#/">' + t('returnHome') + '</a></p>'; }

  /* ---------- static chrome (header, tabs, footer) ---------- */
  function applyStatic() {
    document.documentElement.lang = lang;
    document.body.style.fontSize = SIZES[prefs.size] + 'px';
    $$('[data-i18n]').forEach(function (e) { e.textContent = t(e.getAttribute('data-i18n')); });
    $$('[data-i18n-aria]').forEach(function (e) { e.setAttribute('aria-label', t(e.getAttribute('data-i18n-aria'))); });
    $$('[data-lang-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-btn') === lang)); });
    var m = $('meta[name="description"]'); if (m) m.setAttribute('content', t('metaDesc'));
  }

  /* ---------- router ---------- */
  function wakeOff() { if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; } }
  function wakeOn() {
    if (prefs.wake && navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { /* optional */ });
    }
  }
  function route() {
    var parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var name = parts[0] || 'home', arg = parts[1], html;
    switch (name) {
      case 'home': html = viewHome(); break;
      case 'days': html = viewDays(); break;
      case 'day': html = viewDay(arg); break;
      case 'pray': html = viewPray(arg); break;
      case 'rosary': html = viewRosary(arg); break;
      case 'progress': html = viewProgress(); break;
      case 'intentions': html = viewIntentions(); break;
      case 'guide': html = viewGuide(); break;
      case 'settings': html = viewSettings(); break;
      case 'print': html = viewPrint(); break;
      default: html = notFound(); name = '';
    }
    flush(); wakeOff();
    var main = $('#main'); main.innerHTML = html;
    if (name === 'rosary' && $('#guided')) { paintGuided(); wakeOn(); }
    var tab = name === 'day' || name === 'pray' ? 'days' : name === 'rosary' ? 'home' : name === 'settings' ? '' : name;
    $$('.tabs a').forEach(function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    try { main.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    document.title = t('appTitle') + ' — ' + t('docSub');
  }

  /* ---------- events ---------- */
  function buzz(ms) { if (prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } }
  function setLang(l) {
    if (l !== 'en' && l !== 'ml') return;
    lang = l; sset(LKEY, l); applyStatic(); route();
  }

  document.addEventListener('change', function (e) {
    var el = e.target, act = el.getAttribute && el.getAttribute('data-act');
    if (act === 'rosary') {
      setDone(+el.getAttribute('data-g'), el.checked === true);
      save(); updateBindings();
    } else if (act === 'int-ongoing') {
      var it = state.intentions.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (it) { it.ongoing = el.checked; save(); if (ui.filter === 'ongoing') route(); }
    } else if (act === 'pref-wake') { prefs.wake = el.checked; savePrefs(); }
    else if (act === 'pref-vibe') { prefs.vibrate = el.checked; savePrefs(); }
    else if (el.id === 'import-file') { importFile(el.files && el.files[0]); el.value = ''; }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-act') === 'note') {
      note(+el.getAttribute('data-day'))[el.getAttribute('data-field')] = el.value.slice(0, 5000);
      saveSoon();
    }
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-lang-btn],[data-act]') : null;
    if (!b || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
    if (b.hasAttribute('data-lang-btn')) { setLang(b.getAttribute('data-lang-btn')); return; }
    var act = b.getAttribute('data-act');
    if (act === 'lang') setLang(b.getAttribute('data-lang'));
    else if (act === 'size') { prefs.size = b.getAttribute('data-size'); savePrefs(); applyStatic(); route(); }
    else if (act === 'int-filter') { ui.filter = b.getAttribute('data-cat'); route(); }
    else if (act === 'int-edit') { ui.editing = b.getAttribute('data-id'); route(); var f = $('#int-text'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); } }
    else if (act === 'int-cancel') { ui.editing = null; route(); }
    else if (act === 'int-del') {
      var id = b.getAttribute('data-id');
      confirmDlg(t('removeQ'), t('removeText'), t('remove')).then(function (ok) {
        if (!ok) return;
        state.intentions = state.intentions.filter(function (x) { return x.id !== id; });
        if (ui.editing === id) ui.editing = null;
        save(); route(); toast(t('removed'));
      });
    }
    else if (act === 'day-all') { var i1 = +b.getAttribute('data-day'); state.checks[String(i1 + 1)] = checks(i1).map(function () { return true; }); save(); route(); toast(t('dayMarked')); }
    else if (act === 'day-clear') {
      var i2 = +b.getAttribute('data-day');
      confirmDlg(t('clearQ'), t('clearText'), t('clearDay')).then(function (ok) {
        if (!ok) return;
        state.checks[String(i2 + 1)] = checks(i2).map(function () { return false; }); save(); route();
      });
    }
    else if (act === 'tap') { if (state.live.c < 10) { state.live.c++; buzz(state.live.c === 10 ? [30, 40, 30] : 12); save(); paintGuided(); } }
    else if (act === 'undo') { if (state.live.c > 0) { state.live.c--; save(); paintGuided(); } }
    else if (act === 'g-next') { if (state.live.s < 6) { state.live.s++; state.live.c = 0; save(); paintGuided(); window.scrollTo(0, 0); } }
    else if (act === 'g-back') { if (state.live.s > 0) { state.live.s--; state.live.c = state.live.s >= 1 && state.live.s <= 5 ? 10 : 0; save(); paintGuided(); window.scrollTo(0, 0); } }
    else if (act === 'g-finish') { setDone(state.live.g, true); state.live.s = 7; state.live.c = 0; buzz([40, 60, 40]); save(); paintGuided(); window.scrollTo(0, 0); toast(t('rosaryTicked')); }
    else if (act === 'g-again') { setDone(state.live.g, false); state.live = { g: state.live.g, s: 0, c: 0 }; save(); paintGuided(); }
    else if (act === 'export') exportData();
    else if (act === 'save-folder') saveToFolder(false);
    else if (act === 'save-folder-new') saveToFolder(true);
    else if (act === 'report') { flush(); download('32-rosaries-progress.txt', '\uFEFF' + reportText(), 'text/plain'); toast(t('reportDone')); }
    else if (act === 'share') shareApp();
    else if (act === 'reset') {
      confirmDlg(t('resetQ'), t('resetText'), t('resetYes')).then(function (ok) {
        if (!ok) return;
        state = sanitize(null); save(); ui = { filter: 'all', editing: null }; route(); toast(t('resetDone'));
      });
    }
    else if (act === 'do-print') { flush(); window.print(); }
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'int-form') return;
    e.preventDefault();
    var text = $('#int-text').value.trim();
    if (!text) { $('#int-text').focus(); toast(t('writeFirst')); return; }
    var cat = $('#int-cat').value, ongoing = $('#int-ongoing').checked;
    if (CATS.indexOf(cat) === -1) cat = 'other';
    if (ui.editing) {
      var it = state.intentions.filter(function (x) { return x.id === ui.editing; })[0];
      if (it) { it.text = text; it.cat = cat; it.ongoing = ongoing; }
      ui.editing = null; toast(t('updated'));
    } else {
      state.intentions.unshift({ id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text, cat: cat, ongoing: ongoing, created: new Date().toISOString() });
      toast(t('added'));
    }
    save(); route();
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
    else if (/^#\/rosary\//.test(location.hash)) { wakeOff(); wakeOn(); }
  });
  window.addEventListener('beforeprint', flush);

  /* ---------- backup & share ---------- */
  function backupJson() {
    return JSON.stringify({ app: APP_ID, version: 2, exported: new Date().toISOString(), data: state }, null, 2);
  }
  function reportText() {
    var done = totalDone(), out = [t('appTitle') + ' — ' + t('reportWord'), '',
      t('progressLine', { d: done, t: TOTAL, p: pct(done) }), t('balanceLine', { l: TOTAL - done }), t('setsLine', { c: setsDone(), s: SETS }), ''];
    for (var i = 0; i < ND; i++) {
      var bar = checks(i).map(function (x) { return x ? '●' : '○'; }).join(' ');
      out.push(t('dayN', { n: i + 1 }) + ' · ' + L().days[i].title + ' — ' + t('dayBalance', { d: doneFor(i), t: TARGETS[i], l: leftFor(i) }) + '   ' + bar);
    }
    return out.join('\r\n') + '\r\n';
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportData() {
    flush();
    download('32-rosaries-backup.json', backupJson(), 'application/json');
    toast(t('backupDone'));
  }

  /* Save the backup and a readable progress report into a folder the person chooses (where the browser allows it). */
  function hOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('rosaries32-folder', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function hGet() {
    return hOpen().then(function (db) { return new Promise(function (res) {
      var q = db.transaction('h').objectStore('h').get('dir'); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); };
    }); }).catch(function () { return null; });
  }
  function hSet(v) {
    return hOpen().then(function (db) { var st = db.transaction('h', 'readwrite').objectStore('h'); if (v) st.put(v, 'dir'); else st.delete('dir'); }).catch(function () { /* ignore */ });
  }
  function writeFile(dir, name, text) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(text).then(function () { return w.close(); }); });
  }
  function saveToFolder(chooseNew) {
    flush();
    var json = backupJson(), rep = '﻿' + reportText();
    function fallback() {
      download('32-rosaries-backup.json', json, 'application/json');
      setTimeout(function () { download('32-rosaries-progress.txt', rep, 'text/plain'); }, 500);
      toast(t('savedDownload'));
    }
    if (!window.showDirectoryPicker) { fallback(); return; }
    var start = chooseNew ? Promise.resolve(null) : hGet().then(function (h) {
      if (!h || !h.queryPermission) return null;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        return p === 'granted' ? h : h.requestPermission({ mode: 'readwrite' }).then(function (p2) { return p2 === 'granted' ? h : null; });
      }).catch(function () { return null; });
    });
    start.then(function (h) { return h || window.showDirectoryPicker({ mode: 'readwrite', id: 'rosaries32' }); })
      .then(function (dir) {
        return writeFile(dir, '32-rosaries-backup.json', json).then(function () { return writeFile(dir, '32-rosaries-progress.txt', rep); })
          .then(function () { hSet(dir); toast(t('savedFolder', { f: dir.name })); });
      })
      .catch(function (err) { if (err && err.name === 'AbortError') return; fallback(); });
  }
  function importFile(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      var obj;
      try { obj = JSON.parse(r.result); } catch (e) { toast(t('badFile')); return; }
      if (!obj || (obj.app !== APP_ID && obj.app !== OLD_APP_ID) || !obj.data || typeof obj.data !== 'object') { toast(t('notBackup')); return; }
      var incoming = obj.app === OLD_APP_ID ? migrateOld(obj.data) : sanitize(obj.data);
      var n = 0; for (var i = 0; i < ND; i++) n += incoming.checks[String(i + 1)].filter(Boolean).length;
      confirmDlg(t('importQ'), t('importText', { n: n, k: incoming.intentions.length }), t('importWord')).then(function (ok) {
        if (!ok) return;
        state = incoming; save(); route(); toast(t('imported'));
      });
    };
    r.onerror = function () { toast(t('readFail')); };
    r.readAsText(file);
  }
  function shareApp() {
    var url = location.href.split('#')[0];
    if (navigator.share) { navigator.share({ title: t('appTitle'), text: t('shareMsg'), url: url }).catch(function () { /* cancelled */ }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { toast(t('linkCopied')); }, function () { toast(url); }); }
    else toast(url);
  }

  /* ---------- start ---------- */
  applyStatic(); warn(); route();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* offline install is optional */ }); });
  }
  window.__rosaries = { state: function () { return state; }, TOTAL: TOTAL, lang: function () { return lang; } }; // read-only handle used by automated tests
})();
