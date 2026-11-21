/* GTA 6 Trophy Guide — checklist tracker.
   Data: app/data/trophies.json (55 trophies, re-derived from PowerPyx,
   Push Square and SixShore at launch). Progress lives in localStorage
   on this device only; nothing leaves the browser. */
(function () {
  'use strict';

  var CHECK_KEY = 'gta6-trophy-checklist';
  var SPOILER_KEY = 'gta6-trophy-spoiler';
  var HIDE_KEY = 'gta6-trophy-hide-earned';

  var STAGES = {
    1: 'Story — Chapters 1–5',
    2: 'Strangers — side strands',
    3: 'Activities — Leonida pastimes',
    4: 'World & money — explore and earn',
    5: 'Clean-up & crime — the hard jobs',
    6: 'Platinum — the last gate'
  };
  var GRADE_RANK = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
  var GRADE_LABEL = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  var KIND_LABEL = {
    story: 'Story', side: 'Strangers', activities: 'Activities',
    collectibles: 'Collectibles', crime: 'Crime', misc: 'Misc',
    completion: '100%', platinum: 'Platinum'
  };

  var trophies = [];
  var earned = new Set();
  var state = { kind: 'all', grade: 'all', sort: 'trophy', search: '', spoiler: false, hideEarned: false };
  var currentId = null;

  var listEl = document.getElementById('list');
  var ringEl = document.getElementById('ringText');
  var barEl = document.getElementById('barFill');
  var barLabelEl = document.getElementById('barLabel');
  var resultEl = document.getElementById('resultLine');
  var emptyEl = document.getElementById('empty');
  var emptyTextEl = document.getElementById('emptyText');
  var searchEl = document.getElementById('search');
  var gradeEl = document.getElementById('grade');
  var sortEl = document.getElementById('sort');
  var spoilerEl = document.getElementById('spoiler');
  var hideEl = document.getElementById('hideEarned');
  var modalEl = document.getElementById('modal');

  function readBool(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'false') === true; } catch (e) { return false; }
  }
  function writeBool(key, value) {
    try { localStorage.setItem(key, JSON.stringify(!!value)); } catch (e) { /* storage unavailable */ }
  }
  function loadEarned() {
    try {
      var raw = JSON.parse(localStorage.getItem(CHECK_KEY) || '[]');
      var arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.earned) ? raw.earned : []);
      earned = new Set(arr.filter(function (id) { return typeof id === 'number' && id >= 1 && id <= 55; }));
    } catch (e) { earned = new Set(); }
  }
  function saveEarned() {
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(Array.from(earned).sort(function (a, b) { return a - b; }))); } catch (e) { /* storage unavailable */ }
  }

  function byId(id) {
    for (var i = 0; i < trophies.length; i++) if (trophies[i].id === id) return trophies[i];
    return null;
  }
  function isSpoilerHidden(t) {
    return state.spoiler && t.hidden && !earned.has(t.id);
  }
  function displayName(t) {
    return isSpoilerHidden(t) ? 'Hidden story trophy' : t.name;
  }
  function displayDesc(t) {
    return isSpoilerHidden(t)
      ? 'Hidden until earned — this trophy\u2019s name is kept secret in spoiler-safe mode.'
      : t.description;
  }

  function matchesKind(t) {
    if (state.kind === 'all') return true;
    if (state.kind === 'missable') return t.missable === true;
    if (state.kind === 'online') return false;
    return t.kind === state.kind;
  }
  function matchesGrade(t) {
    return state.grade === 'all' || t.grade === state.grade;
  }
  function matchesSearch(t) {
    var q = state.search.trim().toLowerCase();
    if (!q) return true;
    return (t.name + ' ' + t.description + ' ' + t.guide).toLowerCase().indexOf(q) !== -1;
  }
  function visibleList() {
    var out = trophies.filter(function (t) {
      return matchesKind(t) && matchesGrade(t) && matchesSearch(t) && !(state.hideEarned && earned.has(t.id));
    });
    var sort = state.sort;
    out.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'grade') return (GRADE_RANK[a.grade] - GRADE_RANK[b.grade]) || (a.id - b.id);
      if (sort === 'stage') return (a.stage - b.stage) || (a.id - b.id);
      return a.id - b.id;
    });
    return out;
  }

  function badgeHtml(t, reveal) {
    var parts = [];
    if (isSpoilerHidden(t) && !reveal) {
      parts.push('<span class="badge badge-hidden">Hidden</span>');
    } else {
      parts.push('<span class="badge badge-' + t.grade + '">' + GRADE_LABEL[t.grade] + '</span>');
    }
    parts.push('<span class="badge">' + (KIND_LABEL[t.kind] || t.kind) + '</span>');
    parts.push('<span class="badge">Stage ' + t.stage + '</span>');
    if (t.target !== null && t.target !== undefined) {
      parts.push('<span class="badge">Target: ' + t.target + '</span>');
    }
    if (t.hidden && !isSpoilerHidden(t)) parts.push('<span class="badge">Hidden</span>');
    if (t.missable) parts.push('<span class="badge badge-missable">Missable</span>');
    if (t.unconfirmed) parts.push('<span class="badge badge-unconfirmed">Unconfirmed</span>');
    return parts.join('');
  }

  function render() {
    var shown = visibleList();

    listEl.innerHTML = shown.map(function (t) {
      var isEarned = earned.has(t.id);
      return '<article class="card grade-' + t.grade + (isEarned ? ' earned' : '') + '" data-id="' + t.id + '">' +
        '<h3>' + escapeHtml(displayName(t)) + '</h3>' +
        '<p class="desc">' + escapeHtml(displayDesc(t)) + '</p>' +
        '<p class="meta">' + badgeHtml(t) + '</p>' +
        '<div class="foot">' +
          '<label><input type="checkbox"' + (isEarned ? ' checked' : '') + '> Earned</label>' +
          '<span class="guide-hint">Guide &rarr;</span>' +
        '</div>' +
      '</article>';
    }).join('');

    ringEl.textContent = earned.size + '/55';
    barEl.style.width = (earned.size / 55 * 100) + '%';
    barLabelEl.textContent = earned.size === 0
      ? '0 of 55 trophies — the road to Leonida Legend starts here.'
      : earned.size + ' of 55 trophies — ' + (55 - earned.size) + ' to go until the platinum.';
    resultEl.textContent = 'Showing ' + shown.length + ' of 55';

    if (shown.length === 0) {
      emptyTextEl.textContent = state.kind === 'online'
        ? 'GTA 6 has no online trophies — all 55 are single-player, so there is nothing to show under Online.'
        : 'No trophies match that search. Try a different word — for example "meditation", "bank vault" or "drone".';
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }

    renderRoadmap();
    renderTotd();
  }

  function renderRoadmap() {
    var items = document.querySelectorAll('.stages li');
    items.forEach(function (li) {
      var stage = parseInt(li.getAttribute('data-stage'), 10);
      var total = trophies.filter(function (t) { return t.stage === stage; }).length;
      var done = trophies.filter(function (t) { return t.stage === stage && earned.has(t.id); }).length;
      var countEl = li.querySelector('.stage-count');
      var bar = li.querySelector('.stage-bar i');
      if (countEl) countEl.textContent = done + '/' + total;
      if (bar) bar.style.width = (total ? (done / total * 100) : 0) + '%';
    });
  }

  function trophyOfTheDay() {
    if (!trophies.length) return null;
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var doy = Math.floor((now - start) / 86400000);
    return trophies[doy % trophies.length];
  }

  function renderTotd() {
    var t = trophyOfTheDay();
    var nameEl = document.getElementById('totdName');
    var descEl = document.getElementById('totdDesc');
    var openBtn = document.getElementById('totdOpen');
    if (!t) { nameEl.textContent = 'Loading…'; descEl.textContent = ''; return; }
    nameEl.textContent = displayName(t);
    descEl.textContent = displayDesc(t);
    openBtn.setAttribute('data-id', String(t.id));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- Detail modal ---------- */
  function openModal(id) {
    var t = byId(id);
    if (!t) return;
    currentId = id;
    document.getElementById('detailName').textContent = t.name;
    document.getElementById('detailDesc').textContent = t.description;
    document.getElementById('detailMeta').innerHTML = badgeHtml(t, true);
    document.getElementById('detailGuide').textContent = t.guide;
    var srcEl = document.getElementById('detailSources');
    srcEl.innerHTML = (t.sources || []).map(function (s) {
      return '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.name) + '</a></li>';
    }).join('');
    var noteEl = document.getElementById('detailNote');
    if (t.missable) {
      noteEl.textContent = 'Missable — this is the only trophy in the game that can be lost. Do the Chapter 1 meditation with Lucia at Jason\u2019s house (after the mission Down to Earth) before Chapter 1 ends; it is still unconfirmed whether that meditation is required, so do it and remove the risk.';
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
      noteEl.textContent = '';
    }
    updateEarnedButton();
    modalEl.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modalEl.hidden = true;
    document.body.style.overflow = '';
    currentId = null;
  }
  function updateEarnedButton() {
    var btn = document.getElementById('detailEarned');
    if (currentId === null) return;
    btn.textContent = earned.has(currentId) ? 'Mark not earned' : 'Mark earned';
  }
  function stepModal(delta) {
    if (currentId === null) return;
    var list = visibleList();
    if (!list.length) list = trophies.slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === currentId) idx = i;
    if (idx === -1) idx = 0;
    var next = list[(idx + delta + list.length) % list.length];
    openModal(next.id);
  }

  /* ---------- Export / import / copy ---------- */
  function exportProgress() {
    var payload = {
      app: 'gta6-trophy-guide-01',
      exportedAt: new Date().toISOString(),
      earned: Array.from(earned).sort(function (a, b) { return a - b; })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gta6-trophy-checklist.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importProgress(file) {
    if (!file) return;
    file.text().then(function (text) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return; }
      var arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.earned) ? parsed.earned : null);
      if (!arr) return;
      var next = new Set();
      arr.forEach(function (id) {
        if (typeof id === 'number' && id >= 1 && id <= 55) next.add(id);
      });
      earned = next;
      saveEarned();
      render();
    }).catch(function () { /* unreadable file — ignore */ });
  }

  function copyRemaining() {
    var btn = document.getElementById('copyRemaining');
    var remaining = trophies.filter(function (t) { return !earned.has(t.id); });
    var lines = ['GTA 6 — remaining trophies (' + remaining.length + '):'];
    remaining.forEach(function (t) { lines.push('- ' + displayName(t) + ' — ' + displayDesc(t)); });
    var text = lines.join('\n');
    function done() {
      var old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch (e) { /* clipboard unavailable */ }
  }

  /* ---------- Wiring ---------- */
  function init() {
    loadEarned();
    state.spoiler = readBool(SPOILER_KEY);
    state.hideEarned = readBool(HIDE_KEY);
    spoilerEl.checked = state.spoiler;
    hideEl.checked = state.hideEarned;

    searchEl.addEventListener('input', function () { state.search = searchEl.value; render(); });
    gradeEl.addEventListener('change', function () { state.grade = gradeEl.value; render(); });
    sortEl.addEventListener('change', function () { state.sort = sortEl.value; render(); });
    spoilerEl.addEventListener('change', function () {
      state.spoiler = spoilerEl.checked;
      writeBool(SPOILER_KEY, state.spoiler);
      render();
    });
    hideEl.addEventListener('change', function () {
      state.hideEarned = hideEl.checked;
      writeBool(HIDE_KEY, state.hideEarned);
      render();
    });

    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.kind = chip.getAttribute('data-kind');
        document.querySelectorAll('.chip').forEach(function (c) {
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        render();
      });
    });

    listEl.addEventListener('change', function (e) {
      var box = e.target.closest ? e.target.closest('input[type="checkbox"]') : null;
      if (!box) return;
      var card = box.closest('.card');
      if (!card) return;
      var id = parseInt(card.getAttribute('data-id'), 10);
      if (box.checked) earned.add(id); else earned.delete(id);
      saveEarned();
      render();
    });
    listEl.addEventListener('click', function (e) {
      if (e.target.closest('input, label, a, button')) return;
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (!card) return;
      openModal(parseInt(card.getAttribute('data-id'), 10));
    });

    document.getElementById('export').addEventListener('click', exportProgress);
    document.getElementById('import').addEventListener('change', function (e) {
      importProgress(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('copyRemaining').addEventListener('click', copyRemaining);
    document.getElementById('totdOpen').addEventListener('click', function (e) {
      var id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
      if (id) openModal(id);
    });

    document.getElementById('detailClose').addEventListener('click', closeModal);
    document.getElementById('detailPrev').addEventListener('click', function () { stepModal(-1); });
    document.getElementById('detailNext').addEventListener('click', function () { stepModal(1); });
    document.getElementById('detailEarned').addEventListener('click', function () {
      if (currentId === null) return;
      if (earned.has(currentId)) earned.delete(currentId); else earned.add(currentId);
      saveEarned();
      updateEarnedButton();
      render();
    });
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modalEl.hidden) closeModal();
    });

    render();
  }

  fetch('data/trophies.json')
    .then(function (r) {
      if (!r.ok) throw new Error('trophy data failed to load: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      trophies = data.trophies || [];
      init();
    })
    .catch(function (err) {
      resultEl.textContent = 'Could not load the trophy list. Please reload the page.';
      console.error(err);
    });
})();
