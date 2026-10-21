/**
 * MG Bot — V5-powered autobet for WinGo
 * v3.0 — V5 prediction + adaptive direction + dry-run + hidden logs
 * ⚠️ Real money. Martingale 2→4→8 (cap ₹8). Use at your own risk.
 */
(async function () {
  if (window.__mg) {
    if (window.__mg.stop !== true) {
      window.__mg.stop = true;
      if (window.__mg.log) window.__mg.log('Stop signal bheja', 'warn');
      if (window.__mg.updateStatus) window.__mg.updateStatus('stopped');
      return;
    } else {
      const o = document.getElementById('__mg_panel');
      if (o) o.remove();
      delete window.__mg;
    }
  }

  // ─── Config ───────────────────────────────────────────────────
  const BASE_BET = 2;      // start bet ₹2 (slow&safe=1, fast=2-3)
  const CAP_BET = 8;       // max martingale cap
  const STOP_LOSS = 100;   // auto-stop if balance drops
  const TARGET_BAL = 200;  // auto-stop if balance hits
  const MIN_CONF = 0.10;   // min probability margin to bet
  const API_URL = 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json';
  const MIN_ROUNDS = 15;   // V5 warmup

  const S = {
    stop: false,
    bet: BASE_BET,
    wins: 0,
    losses: 0,
    dryWins: 0,
    dryLosses: 0,
    dryRun: false,
    logsHidden: true,
  };
  window.__mg = S;
  const LOGS = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let logsEl = null;
  const stats = {};

  // ─── V5 Constants ─────────────────────────────────────────────
  const STATES = ['SG', 'SR', 'SV', 'BG', 'BR', 'BV'];
  const STATE_TO_DIM = {
    SG: ['Green', 'Small'], SR: ['Red', 'Small'], SV: ['Violet', 'Small'],
    BG: ['Green', 'Big'], BR: ['Red', 'Big'], BV: ['Violet', 'Big'],
  };
  const BOUNDARY_NUMS = new Set([0, 4, 5, 9]);
  const LTM = {
    SG: { SG: 0.192, SR: 0.217, SV: 0.098, BG: 0.198, BR: 0.193, BV: 0.102 },
    SR: { SG: 0.228, SR: 0.182, SV: 0.108, BG: 0.181, BR: 0.192, BV: 0.109 },
    SV: { SG: 0.221, SR: 0.208, SV: 0.103, BG: 0.187, BR: 0.172, BV: 0.109 },
    BG: { SG: 0.201, SR: 0.187, SV: 0.097, BG: 0.213, BR: 0.208, BV: 0.094 },
    BR: { SG: 0.196, SR: 0.201, SV: 0.103, BG: 0.196, BR: 0.204, BV: 0.100 },
    BV: { SG: 0.208, SR: 0.195, SV: 0.112, BG: 0.182, BR: 0.192, BV: 0.111 },
  };

  function getState(r) {
    const c = r.color === 'Violet' ? 'V' : r.color[0];
    return r.size[0] + c;
  }
  function get2ndOrderState(rounds, idx) {
    if (idx < 1) return null;
    return getState(rounds[idx - 1]) + '_' + getState(rounds[idx]);
  }
  function shannonEntropy(values) {
    const n = values.length;
    if (!n) return 1.0;
    const counts = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    let e = 0;
    for (const c of Object.values(counts)) if (c > 0) e -= (c / n) * Math.log2(c / n);
    const maxE = Math.log2(Object.keys(counts).length || 1);
    return maxE > 0 ? e / maxE : 0;
  }
  function computeOrderFlowProxy(rounds) {
    if (rounds.length < 5) return { Big: 0.5, Small: 0.5, Red: 0.5, Green: 0.5 };
    const crowd = { Big: 0, Small: 0, Red: 0, Green: 0 };
    const lastSize = rounds[rounds.length - 1].size;
    let streak = 1;
    for (let i = rounds.length - 2; i >= Math.max(0, rounds.length - 10); i--) {
      if (rounds[i].size === lastSize) streak++;
      else break;
    }
    if (streak >= 3) {
      crowd[lastSize] += 0.4 + streak * 0.1;
      const opp = lastSize === 'Big' ? 'Small' : 'Big';
      crowd[opp] += 0.3 + streak * 0.05;
    }
    for (const k in crowd) crowd[k] = Math.min(0.95, crowd[k]);
    return crowd;
  }

  // ─── V5 Predictor ────────────────────────────────────────────
  function predictV5(rounds) {
    if (rounds.length < MIN_ROUNDS) {
      return { type: 'COLOR', value: 'Green', reasoning: 'V5_WARMUP', margin: 0 };
    }
    const currentRound = rounds[rounds.length - 1];
    const currentState = getState(currentRound);

    const recent15 = rounds.slice(-15);
    const sizeEnt = shannonEntropy(recent15.map((r) => r.size));
    const crowd = computeOrderFlowProxy(rounds);

    // 2nd order
    const current2nd = get2ndOrderState(rounds, rounds.length - 1);
    const counts2nd = {};
    for (const s of STATES) counts2nd[s] = 0;
    for (let i = 1; i < rounds.length - 1; i++) {
      if (get2ndOrderState(rounds, i) === current2nd) counts2nd[getState(rounds[i + 1])]++;
    }
    const total2nd = Object.values(counts2nd).reduce((a, b) => a + b, 0);

    // 1st order
    const counts1st = {};
    for (const s of STATES) counts1st[s] = 0;
    const tail = rounds.length >= 20 ? rounds.slice(-20) : rounds;
    for (let i = 0; i < tail.length - 1; i++) {
      if (getState(tail[i]) === currentState) counts1st[getState(tail[i + 1])]++;
    }
    const total1st = Object.values(counts1st).reduce((a, b) => a + b, 0);

    const colorProbs = { Green: 0, Red: 0, Violet: 0 };
    const sizeProbs = { Big: 0, Small: 0 };
    const wShort = sizeEnt < 0.4 ? 0.6 : 0.4;

    for (const s of STATES) {
      const p1 = total1st > 0 ? (counts1st[s] + 1) / (total1st + STATES.length) : 0;
      const pG = (LTM[currentState] && LTM[currentState][s]) || 1 / STATES.length;
      let prob = wShort * p1 + (1 - wShort) * pG;
      if (total2nd > 0) {
        const p2 = (counts2nd[s] + 1) / (total2nd + STATES.length);
        prob = 0.5 * p2 + 0.5 * prob;
      }
      const [col, sz] = STATE_TO_DIM[s];
      colorProbs[col] += prob;
      sizeProbs[sz] += prob;
    }

    for (const sz of ['Big', 'Small']) {
      sizeProbs[sz] *= 1 - crowd[sz] * 0.45;
    }
    const totSz = sizeProbs.Big + sizeProbs.Small;
    if (totSz > 0) { sizeProbs.Big /= totSz; sizeProbs.Small /= totSz; }

    const bestColor = Object.keys(colorProbs).sort((a, b) => colorProbs[b] - colorProbs[a])[0];
    const bestSize = sizeProbs.Big >= sizeProbs.Small ? 'Big' : 'Small';
    const totCol = colorProbs.Green + colorProbs.Red + colorProbs.Violet;
    const colorStrength = colorProbs[bestColor] / (totCol || 1);
    const sizeStrength = sizeProbs[bestSize];

    let pType, pVal, reason;
    if (sizeEnt < 0.4) { pType = 'SIZE'; pVal = bestSize; reason = 'LOW_ENTROPY_TREND'; }
    else if (sizeEnt > 0.85) {
      pType = 'SIZE'; pVal = currentRound.size === 'Big' ? 'Small' : 'Big'; reason = 'HIGH_ENTROPY_REVERSION';
    } else {
      if (sizeStrength >= colorStrength) { pType = 'SIZE'; pVal = bestSize; }
      else { pType = 'COLOR'; pVal = bestColor; }
      reason = 'DYNAMIC_FUSION';
    }

    const lastNum = currentRound.number;
    if ((lastNum === 0 || lastNum === 5) && (crowd[pVal] || 0) > 0.6) {
      pType = 'SIZE';
      pVal = currentRound.size === 'Big' ? 'Small' : 'Big';
      reason = 'VIOLET_SHOCK_INVERSION';
    }

    const bsi = rounds.slice(-4).filter((r) => BOUNDARY_NUMS.has(r.number)).length / 4;
    let sizeStreak = 1;
    for (let i = rounds.length - 2; i >= 0; i--) {
      if (rounds[i].size === currentRound.size) sizeStreak++;
      else break;
    }
    let alt = 0;
    for (let i = rounds.length - 2; i >= 0; i--) {
      const c1 = rounds[i].color, c2 = rounds[i + 1].color;
      if (c1 === 'Violet' || c2 === 'Violet' || c1 === c2) break;
      alt++;
    }

    if (lastNum === 5 || (rounds.length >= 2 && rounds[rounds.length - 2].number === 5 && lastNum === 5)) {
      pType = 'SIZE'; pVal = 'Big'; reason = 'MACRO_5_STRIKE';
    } else if (lastNum === 9 && rounds.slice(-5, -1).some((r) => r.number === 5)) {
      pType = 'SIZE'; pVal = 'Big'; reason = 'MACRO_MEGA_GREEN';
    } else if (alt >= 3 || (alt === 2 && bsi >= 0.5 && (lastNum === 4 || lastNum === 9))) {
      if (pType === 'COLOR') {
        const opp = { Green: 'Red', Red: 'Green', Violet: 'Green' };
        pVal = opp[pVal] || pVal;
        reason = 'COLOR_FADE';
      }
    } else if (sizeStreak >= 4 && (lastNum === 4 || lastNum === 5)) {
      pType = 'SIZE'; pVal = currentRound.size === 'Big' ? 'Small' : 'Big'; reason = 'SIZE_FADE_' + sizeStreak;
    } else if (sizeStreak >= 4 && bsi >= 0.75) {
      pType = 'SIZE'; pVal = currentRound.size; reason = 'SIZE_ACCEL_' + sizeStreak;
    }

    if (pType === 'COLOR' && pVal === 'Violet') {
      pVal = currentRound.color.includes('Red') ? 'Red/Violet' : 'Green/Violet';
    }

    let margin = 0;
    if (pType === 'SIZE') {
      margin = Math.abs(sizeProbs.Big - sizeProbs.Small);
    } else {
      const sorted = Object.values(colorProbs).sort((a, b) => b - a);
      margin = (sorted[0] - sorted[1]) / (totCol || 1);
    }
    return { type: pType, value: pVal, reasoning: reason, margin };
  }

  // ─── API Fetch ────────────────────────────────────────────────
  function toV5Round(item) {
    const num = parseInt(item.number);
    const colorStr = (item.color || '').toLowerCase();
    let color;
    if (colorStr.includes('violet')) color = 'Violet';
    else if (colorStr.includes('red')) color = 'Red';
    else color = 'Green';
    return {
      period: String(item.issueNumber),
      number: num,
      color: color,
      size: num >= 5 ? 'Big' : 'Small',
    };
  }
  async function fetchRounds() {
    const url = API_URL + '?ts=' + Date.now() + '&pageSize=100';
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json || !json.data || !Array.isArray(json.data.list)) throw new Error('bad api shape');
    return json.data.list.map(toV5Round); // newest first
  }

  // ─── Panel ───────────────────────────────────────────────────
  function initPanel() {
    if (document.getElementById('__mg_panel')) return;
    const p = document.createElement('div');
    p.id = '__mg_panel';
    p.style.cssText =
      'position:fixed;top:10px;right:10px;width:360px;' +
      'background:rgba(12,15,25,0.97);color:#ddd;' +
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;' +
      'border:1px solid #333;border-radius:10px;z-index:2147483647;' +
      'display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.7);overflow:hidden;';
    p.innerHTML =
      '<div id="__mg_hdr" style="padding:6px 8px;background:linear-gradient(135deg,#1a237e,#0d47a1);border-bottom:1px solid #333;display:flex;align-items:center;gap:4px;cursor:move;user-select:none;">' +
        '<span id="__mg_dot" style="width:8px;height:8px;border-radius:50%;background:#ffb300;box-shadow:0 0 8px #ffb300;"></span>' +
        '<b style="flex:1;color:#fff;font-size:11px;">🤖 V5 Bot</b>' +
        '<button id="__mg_logsBtn" title="Show/hide logs" style="background:#455a64;color:#fff;border:0;padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer;">📊</button>' +
        '<button id="__mg_dryBtn" title="Toggle dry-run" style="background:#2e7d32;color:#fff;border:0;padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer;">LIVE</button>' +
        '<button id="__mg_copy" title="Copy logs" style="background:#00838f;color:#fff;border:0;padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer;">📋</button>' +
        '<button id="__mg_clear" title="Clear logs" style="background:#37474f;color:#fff;border:0;padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer;">C</button>' +
        '<button id="__mg_stopbtn" title="Stop bot" style="background:#c62828;color:#fff;border:0;padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer;">⏹</button>' +
        '<button id="__mg_close" title="Stop + close" style="background:#b71c1c;color:#fff;border:0;padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="padding:5px 8px;display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:10.5px;border-bottom:1px solid #333;background:rgba(20,25,40,0.6);">' +
        '<div>Period: <b id="__mg_period" style="color:#64b5f6;">-</b></div>' +
        '<div>Timer: <b id="__mg_timer" style="color:#ffb74d;">-</b></div>' +
        '<div>Bet: <b id="__mg_bet" style="color:#81c784;">₹2</b></div>' +
        '<div>W/L: <b id="__mg_wins" style="color:#66bb6a;">0</b>/<b id="__mg_losses" style="color:#ef5350;">0</b></div>' +
        '<div>Bal: <b id="__mg_bal" style="color:#ffd54f;">-</b></div>' +
        '<div>P/L: <b id="__mg_pl" style="color:#90a4ae;">₹0</b></div>' +
        '<div style="grid-column:span 2;">Pred: <b id="__mg_pred" style="color:#ce93d8;">-</b></div>' +
        '<div style="grid-column:span 2;">Acc: <b id="__mg_acc" style="color:#80cbc4;">0/0</b></div>' +
      '</div>' +
      '<div id="__mg_logs" style="display:none;flex:1;overflow-y:auto;padding:6px 8px;font-size:10.5px;max-height:260px;border-top:1px solid #222;"></div>';
    document.body.appendChild(p);
    logsEl = p.querySelector('#__mg_logs');
    ['dot', 'period', 'timer', 'bet', 'wins', 'losses', 'bal', 'pl', 'pred', 'acc'].forEach(
      (k) => (stats[k] = p.querySelector('#__mg_' + k))
    );

    // Copy
    p.querySelector('#__mg_copy').onclick = async () => {
      const txt = LOGS.join('\n') || '(no logs)';
      let ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {}
      if (!ok) {
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); ok = true; } catch (e) {}
        ta.remove();
      }
      const b = p.querySelector('#__mg_copy');
      b.textContent = ok ? '✓' : '✗';
      setTimeout(() => (b.textContent = '📋'), 1000);
    };
    // Clear
    p.querySelector('#__mg_clear').onclick = () => { LOGS.length = 0; if (logsEl) logsEl.innerHTML = ''; };
    // Logs toggle
    p.querySelector('#__mg_logsBtn').onclick = () => {
      S.logsHidden = !S.logsHidden;
      if (logsEl) logsEl.style.display = S.logsHidden ? 'none' : 'block';
      const b = p.querySelector('#__mg_logsBtn');
      b.style.background = S.logsHidden ? '#455a64' : '#26a69a';
      b.textContent = S.logsHidden ? '📊' : '📖';
    };
    // Dry toggle
    p.querySelector('#__mg_dryBtn').onclick = () => {
      S.dryRun = !S.dryRun;
      const b = p.querySelector('#__mg_dryBtn');
      b.textContent = S.dryRun ? 'DRY' : 'LIVE';
      b.style.background = S.dryRun ? '#ffa000' : '#2e7d32';
      log('Mode: ' + (S.dryRun ? 'DRY (no real bets)' : 'LIVE'), 'sys');
    };
    // Stop
    p.querySelector('#__mg_stopbtn').onclick = () => { S.stop = true; updateStatus('stopped'); log('Stop from panel', 'warn'); };
    // Close
    p.querySelector('#__mg_close').onclick = () => { S.stop = true; updateStatus('stopped'); setTimeout(() => p.remove(), 200); };

    // Drag
    let drag = null;
    const hdr = p.querySelector('#__mg_hdr');
    hdr.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const r = p.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      p.style.right = 'auto'; p.style.left = r.left + 'px'; p.style.top = r.top + 'px';
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      p.style.left = Math.max(0, drag.l + e.clientX - drag.x) + 'px';
      p.style.top = Math.max(0, drag.t + e.clientY - drag.y) + 'px';
    });
    document.addEventListener('mouseup', () => (drag = null));
  }

  function updateStatus(state) {
    if (!stats.dot) return;
    const m = { running: '#00e676', stopped: '#ef5350', waiting: '#ffb300', error: '#ff5722' };
    const c = m[state] || m.waiting;
    stats.dot.style.background = c;
    stats.dot.style.boxShadow = '0 0 8px ' + c;
  }

  function log(msg, level) {
    level = level || 'info';
    const t = new Date().toLocaleTimeString();
    const line = '[' + t + '] ' + msg;
    console.log('[MG]', msg);
    LOGS.push(line);
    if (LOGS.length > 800) LOGS.splice(0, LOGS.length - 800);
    if (logsEl) {
      const colors = { info: '#ccc', ok: '#69f0ae', err: '#ff5252', warn: '#ffb74d', bet: '#64b5f6', sys: '#ba68c8', pred: '#ce93d8' };
      const el = document.createElement('div');
      el.style.color = colors[level] || colors.info;
      el.style.marginBottom = '2px';
      el.textContent = line;
      logsEl.appendChild(el);
      if (logsEl.children.length > 800) logsEl.removeChild(logsEl.firstChild);
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  }

  function updateStats(d) {
    if (!stats.period) return;
    if (d.period !== undefined) stats.period.textContent = d.period || '-';
    if (d.timer !== undefined) stats.timer.textContent = d.timer != null ? d.timer + 's' : '-';
    if (d.bet !== undefined) stats.bet.textContent = '₹' + d.bet;
    if (d.wins !== undefined) stats.wins.textContent = d.wins;
    if (d.losses !== undefined) stats.losses.textContent = d.losses;
    if (d.bal !== undefined) stats.bal.textContent = d.bal != null ? '₹' + d.bal : '-';
    if (d.pred !== undefined) stats.pred.textContent = d.pred || '-';
    if (d.pl !== undefined) {
      stats.pl.textContent = d.pl;
      stats.pl.style.color = d.pl.startsWith('-') ? '#ef5350' : (d.pl === '₹0' ? '#90a4ae' : '#66bb6a');
    }
    if (d.acc !== undefined) stats.acc.textContent = d.acc;
  }

  S.log = log;
  S.updateStatus = updateStatus;

  // ─── DOM readers ─────────────────────────────────────────────
  function getSec() {
    const ds = document.querySelectorAll('.TimeLeft__C-time > div');
    let s = '';
    ds.forEach((d) => { const t = d.textContent.trim(); if (/^\d$/.test(t)) s += t; });
    if (s.length === 4) return parseInt(s.slice(0, 2)) * 60 + parseInt(s.slice(2));
    return parseInt(s) || 0;
  }
  function getPeriod() {
    return (document.querySelector('.TimeLeft__C-id')?.textContent || '').trim() || null;
  }
  function getLatest() {
    const r = document.querySelector('.record-body .van-row');
    if (!r) return null;
    const c = r.querySelectorAll('.van-col');
    if (c.length < 3) return null;
    const num = parseInt(c[1].textContent.trim());
    return { period: c[0].textContent.trim(), num: num, big: num >= 5 };
  }
  function getBal() {
    const el = document.querySelector('.Wallet__C-balance-l1 > div');
    if (!el) return null;
    const m = el.textContent.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }
  const startBal = { v: null };

  // ─── UI cleanup ──────────────────────────────────────────────
  async function closeBetUI(reason) {
    let closed = false;
    const winnerClose = document.querySelector(
      '.winner_box .closeBtn, .winning:not([style*="display: none"]) .closeBtn, .winning .closeBtn, [class*="winner"] .closeBtn'
    );
    if (winnerClose && winnerClose.offsetParent !== null) {
      try { winnerClose.click(); closed = true; } catch (e) {}
      await sleep(200);
    }
    if (document.querySelector('.van-popup button.bet-amount')) {
      for (const o of [...document.querySelectorAll('.van-overlay')].filter((x) => x.offsetParent !== null)) {
        try { o.click(); break; } catch (e) {}
      }
      await sleep(300);
      if (document.querySelector('.van-popup button.bet-amount')) {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {}
        await sleep(300);
      }
      if (!document.querySelector('.van-popup button.bet-amount')) closed = true;
    }
    if (closed && reason) log('UI cleaned (' + reason + ')', 'sys');
  }

  // ─── Toast ───────────────────────────────────────────────────
  async function waitToast(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      for (const t of document.querySelectorAll('.van-toast')) {
        const txt = (t.textContent || '').toLowerCase().trim();
        if (!txt) continue;
        if (/success|successful|placed|bet placed|done/i.test(txt)) return 'success';
        if (/agree|please check|required|invalid|fail|error|insufficient/i.test(txt)) return 'error:' + txt;
      }
      await sleep(100);
    }
    return 'none';
  }
  function clearToasts() {
    document.querySelectorAll('.van-toast').forEach((t) => t.remove());
  }

  // ─── Agree checkbox ──────────────────────────────────────────
  function isAgreeChecked(cb) {
    if (!cb) return false;
    if (cb.querySelector('.van-checkbox__icon--checked')) return true;
    if (cb.classList.contains('van-checkbox--checked')) return true;
    const iw = cb.querySelector('.van-checkbox__icon');
    if (iw && iw.getAttribute('aria-checked') === 'true') return true;
    const inp = cb.querySelector('input[type="checkbox"]');
    return inp ? inp.checked : false;
  }
  async function ensureAgree(popup) {
    const findBox = () =>
      [...popup.querySelectorAll('.van-checkbox')].find((c) => /agree|pre-?sale|《/i.test(c.textContent));
    let cb = findBox();
    if (!cb) return true;
    if (isAgreeChecked(cb)) { log('Agree ✓', 'ok'); return true; }
    const fire = (el) => {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
        try {
          const Ev = t.startsWith('pointer') ? PointerEvent : MouseEvent;
          el.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
        } catch (e) {}
      });
    };
    for (let a = 0; a < 4; a++) {
      const targets = [cb.querySelector('i'), cb.querySelector('.van-checkbox__icon'), cb.querySelector('.van-checkbox__label'), cb].filter(Boolean);
      for (const el of targets) {
        fire(el); await sleep(120);
        if (isAgreeChecked(cb)) { log('Agree ✓ (try ' + (a + 1) + ')', 'ok'); return true; }
      }
      await sleep(300);
      cb = findBox();
      if (!cb || isAgreeChecked(cb)) return true;
    }
    log('Agree state detect fail — proceed with caution', 'warn');
    return true;
  }

  // ─── Place bet (with direction) ─────────────────────────────
  async function placeBet(direction, target) {
    log('Bet ' + direction + ' ₹' + target + ' — start', 'bet');
    await closeBetUI('pre-bet');

    const btnDir = [...document.querySelectorAll('.Betting__C-foot-b, .Betting__C-foot-s')].find(
      (e) => e.textContent.trim() === direction
    );
    if (!btnDir) throw new Error(direction + ' button missing');
    log(direction + ' click', 'bet');
    btnDir.click();

    let btn = null;
    for (let i = 0; i < 60 && !btn; i++) {
      await sleep(100);
      btn = document.querySelector('.van-popup button.bet-amount');
    }
    if (!btn) throw new Error('Popup nahi khula');
    await sleep(400);

    // stale popup guard
    if (btn.classList.contains('n_null') && !btn.classList.contains('n_big')) {
      log('Stale popup — reopen', 'warn');
      await closeBetUI('stale');
      btnDir.click();
      btn = null;
      for (let i = 0; i < 60 && !btn; i++) { await sleep(100); btn = document.querySelector('.van-popup button.bet-amount'); }
      if (!btn) throw new Error('Reopen fail');
      await sleep(400);
    }
    const popup = btn.closest('.van-popup') || btn.parentElement;

    await ensureAgree(popup);

    const read = () => {
      if (!btn || !btn.isConnected) return 0;
      const m = btn.textContent.match(/₹\s*([\d.]+)/);
      return m ? parseFloat(m[1]) : 0;
    };
    let cur = read();
    log('Current ₹' + cur + ' → target ₹' + target, 'bet');

    if (cur < 0.01) {
      const oneBtn = [...popup.querySelectorAll('button')].find((b) => b.textContent.trim() === '1');
      if (oneBtn) { oneBtn.click(); await sleep(250); cur = read(); log('Quick ₹1 set → ₹' + cur, 'bet'); }
    }
    if (cur < 0.01) throw new Error('Amount ₹0 raha');

    const findToggle = (sym) =>
      [...popup.querySelectorAll('button, .van-stepper__plus, .van-stepper__minus')].find((b) => b.textContent.trim() === sym);
    const plus = findToggle('+');
    const minus = findToggle('-');
    let g = 0;
    while (cur < target - 0.01 && g++ < 50) {
      if (!plus) throw new Error('+ missing');
      const p = cur; plus.click(); await sleep(150); cur = read();
      if (cur === p) throw new Error('+ ne badhaya nahi');
    }
    g = 0;
    while (cur > target + 0.01 && g++ < 50) {
      if (!minus) throw new Error('- missing');
      const p = cur; minus.click(); await sleep(150); cur = read();
      if (cur === p) throw new Error('- ne ghataaya nahi');
    }
    if (Math.abs(cur - target) > 0.01) throw new Error('Set nahi hua (at ₹' + cur + ')');

    clearToasts();
    await sleep(200);
    btn.click();
    log('Confirm → toast verify...', 'bet');

    let toast = await waitToast(5000);
    if (toast === 'success') { log('✓ Bet placed ₹' + target, 'ok'); await sleep(200); await closeBetUI('post-bet'); return; }

    if (toast && toast.startsWith('error')) {
      log('Reject: ' + toast.slice(6) + ' — retry', 'warn');
      const cb2 = popup.querySelector('.van-checkbox');
      if (cb2) {
        const el = cb2.querySelector('i') || cb2.querySelector('.van-checkbox__icon') || cb2;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
          try {
            const Ev = t.startsWith('pointer') ? PointerEvent : MouseEvent;
            el.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
          } catch (e) {}
        });
        await sleep(400);
        clearToasts();
        btn.click();
        toast = await waitToast(5000);
        if (toast === 'success') { log('✓ Bet placed (retry) ₹' + target, 'ok'); await closeBetUI('post-bet'); return; }
      }
      throw new Error('Reject after retry');
    }

    await sleep(300);
    if (read() < 0.01) { log('✓ Amount reset — assume placed', 'ok'); await closeBetUI('post-bet'); return; }
    throw new Error('Confirm nahi hua');
  }

  // ─── Main loop ───────────────────────────────────────────────
  initPanel();
  log('Panel ready (v3.0)', 'sys');
  log('Config: base ₹' + BASE_BET + ' cap ₹' + CAP_BET + ' stop ₹' + STOP_LOSS + ' target ₹' + TARGET_BAL, 'sys');
  log('Mode: LIVE (click 🧪 for dry-run)', 'sys');
  updateStatus('waiting');

  const initialBal = getBal();
  startBal.v = initialBal;
  updateStats({ bet: S.bet, bal: initialBal });

  let pend = null;        // {period, direction, amount, dry}
  let lastP = null;
  let predTotal = 0, predHit = 0;

  while (!S.stop) {
    try {
      const per = getPeriod();
      const sec = getSec();
      const lat = getLatest();
      const bal = getBal();
      updateStats({ period: per, timer: sec, bet: S.bet, bal: bal });
      if (startBal.v != null && bal != null) {
        updateStats({ pl: (bal - startBal.v >= 0 ? '+' : '') + '₹' + (bal - startBal.v).toFixed(2) });
      }

      // stop-loss / target
      if (bal != null && bal <= STOP_LOSS) {
        log('STOP-LOSS ₹' + STOP_LOSS + ' hit — stopping', 'err');
        S.stop = true; break;
      }
      if (bal != null && bal >= TARGET_BAL) {
        log('🎯 TARGET ₹' + TARGET_BAL + ' hit — stopping', 'ok');
        S.stop = true; break;
      }

      // result of pending bet
      if (pend && lat && lat.period === pend.period) {
        const actual = lat.big ? 'Big' : 'Small';
        predTotal++;
        const won = actual === pend.direction;
        if (won) predHit++;

        updateStats({
          last: per.slice(-5) + ' ' + (lat.big ? 'BIG' : 'SMALL') + '(' + lat.num + ')',
          acc: predHit + '/' + predTotal + ' (' + Math.round(100 * predHit / predTotal) + '%)',
          pred: (won ? '✓' : '✗') + ' was ' + pend.direction,
        });

        if (pend.dry) {
          if (won) S.dryWins++; else S.dryLosses++;
          log('[DRY] ' + (won ? 'HIT' : 'MISS') + ' ' + pend.period + ' → actual ' + actual, won ? 'ok' : 'err');
        } else {
          if (won) {
            S.wins++; S.bet = BASE_BET;
            log('✓ WON ' + pend.period + ' (' + actual + ' ' + lat.num + ') → reset ₹' + BASE_BET, 'ok');
          } else {
            S.losses++; S.bet = Math.min(S.bet * 2, CAP_BET);
            log('✗ LOST ' + pend.period + ' (' + actual + ' ' + lat.num + ') → next ₹' + S.bet, 'err');
          }
          updateStats({ wins: S.wins, losses: S.losses, bet: S.bet });
        }
        pend = null;
        await closeBetUI('post-result');
        await sleep(500);
        continue;
      }

      // new round — predict & bet
      if (!pend && sec >= 8 && sec <= 27 && per !== lastP) {
        updateStatus('running');
        lastP = per;

        // fetch + predict
        let rounds;
        try {
          rounds = await fetchRounds();
        } catch (e) {
          log('API fail: ' + e.message + ' — skip round', 'warn');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }
        if (!rounds || rounds.length < MIN_ROUNDS) {
          log('Only ' + (rounds ? rounds.length : 0) + ' rounds — warmup skip', 'warn');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }

        // sanity: API latest should be dom latest (already settled)
        if (lat && rounds[0].period !== lat.period) {
          log('API lag (api=' + rounds[0].period + ' dom=' + lat.period + ') — skip', 'warn');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }

        // exclude current round from history (not settled yet)
        const history = rounds.filter((r) => r.period !== per);
        if (history.length < MIN_ROUNDS) {
          log('History short after filter — skip', 'warn');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }

        const pred = predictV5(history);
        updateStats({ pred: pred.type + ' ' + pred.value + ' ' + (pred.margin * 100).toFixed(0) + '% (' + pred.reasoning + ')' });

        if (pred.type !== 'SIZE') {
          log('Pred ' + pred.type + ' (' + pred.reasoning + ') — skip (COLOR)', 'pred');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }
        if (pred.margin < MIN_CONF) {
          log('Pred ' + pred.value + ' margin ' + (pred.margin * 100).toFixed(0) + '% < ' + (MIN_CONF * 100) + '% — skip', 'pred');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }
        if (sec < 6) {
          log('Timer too low (' + sec + 's) — skip', 'warn');
          updateStatus('waiting');
          await sleep(700);
          continue;
        }

        log('Pred ' + pred.value + ' margin ' + (pred.margin * 100).toFixed(0) + '% reason=' + pred.reasoning, 'pred');

        if (S.dryRun) {
          log('[DRY] would bet ' + pred.value + ' ₹' + S.bet + ' on ' + per, 'pred');
          pend = { period: per, direction: pred.value, amount: S.bet, dry: true };
        } else {
          // balance check
          if (bal != null && bal < S.bet) {
            log('Balance ₹' + bal + ' < bet ₹' + S.bet + ' — stop', 'err');
            S.stop = true; break;
          }
          log('Round ' + per + ' | ' + sec + 's | ' + pred.value + ' ₹' + S.bet, 'bet');
          try {
            await placeBet(pred.value, S.bet);
            pend = { period: per, direction: pred.value, amount: S.bet, dry: false };
          } catch (e) {
            log('placeBet fail: ' + e.message, 'err');
            await closeBetUI('on-error');
          }
        }
        updateStatus('waiting');
      }

      await sleep(700);
    } catch (e) {
      log('ERR: ' + e.message, 'err');
      updateStatus('error');
      try { await closeBetUI('on-error'); } catch (err) {}
      await sleep(1500);
    }
  }

  const finBal = getBal();
  if (finBal != null && startBal.v != null) {
    const pnl = finBal - startBal.v;
    log('Final: bal ₹' + finBal + ' | P/L ' + (pnl >= 0 ? '+' : '') + '₹' + pnl.toFixed(2), pnl >= 0 ? 'ok' : 'err');
  }
  if (predTotal > 0) log('Prediction accuracy: ' + predHit + '/' + predTotal + ' (' + Math.round(100 * predHit / predTotal) + '%)', 'sys');
  log('Stopped.', 'warn');
  updateStatus('stopped');
})();