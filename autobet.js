/**
 * MG Bot — Martingale Big autobet for WinGo
 * Loaded via jsDelivr bookmarklet.
 * Toggle: run once to start, run again to stop, run once more to remove panel.
 *
 * ⚠️ Martingale 1→2→4→8 (cap 8). Real money. Use at your own risk.
 */
(async function () {
  // ─── Toggle logic ─────────────────────────────────────────────
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

  // ─── State ────────────────────────────────────────────────────
  const S = { stop: false, bet: 1, wins: 0, losses: 0 };
  window.__mg = S;
  const LOGS = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let logsEl = null;
  const stats = {};

  // ─── Panel ────────────────────────────────────────────────────
  function initPanel() {
    if (document.getElementById('__mg_panel')) return;

    const p = document.createElement('div');
    p.id = '__mg_panel';
    p.style.cssText =
      'position:fixed;top:10px;right:10px;width:350px;' +
      'background:rgba(12,15,25,0.97);color:#ddd;' +
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;' +
      'border:1px solid #333;border-radius:10px;z-index:2147483647;' +
      'display:flex;flex-direction:column;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.7);overflow:hidden;';

    p.innerHTML =
      '<div id="__mg_hdr" style="padding:8px 10px;background:linear-gradient(135deg,#1a237e,#0d47a1);border-bottom:1px solid #333;display:flex;align-items:center;gap:6px;cursor:move;user-select:none;">' +
        '<span id="__mg_dot" style="width:8px;height:8px;border-radius:50%;background:#ffb300;box-shadow:0 0 8px #ffb300;"></span>' +
        '<b style="flex:1;color:#fff;font-size:12px;">🤖 MG Bot</b>' +
        '<button id="__mg_copy" style="background:#2e7d32;color:#fff;border:0;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;">📋 Copy</button>' +
        '<button id="__mg_clear" style="background:#455a64;color:#fff;border:0;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;">Clear</button>' +
        '<button id="__mg_stopbtn" style="background:#c62828;color:#fff;border:0;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;">⏹</button>' +
        '<button id="__mg_close" style="background:#37474f;color:#fff;border:0;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="padding:6px 10px;display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;font-size:10.5px;border-bottom:1px solid #333;background:rgba(20,25,40,0.6);">' +
        '<div>Period: <b id="__mg_period" style="color:#64b5f6;">-</b></div>' +
        '<div>Timer: <b id="__mg_timer" style="color:#ffb74d;">-</b></div>' +
        '<div>Bet: <b id="__mg_bet" style="color:#81c784;">₹1</b></div>' +
        '<div>W/L: <b id="__mg_wins" style="color:#66bb6a;">0</b>/<b id="__mg_losses" style="color:#ef5350;">0</b></div>' +
        '<div>Bal: <b id="__mg_bal" style="color:#ffd54f;">-</b></div>' +
        '<div style="grid-column:span 2;">Last: <b id="__mg_last" style="color:#90a4ae;">-</b></div>' +
      '</div>' +
      '<div id="__mg_logs" style="flex:1;overflow-y:auto;padding:6px 10px;font-size:10.5px;height:280px;"></div>';

    document.body.appendChild(p);
    logsEl = p.querySelector('#__mg_logs');

    ['dot', 'period', 'timer', 'bet', 'wins', 'losses', 'bal', 'last'].forEach(
      (k) => (stats[k] = p.querySelector('#__mg_' + k))
    );

    // Copy logs
    p.querySelector('#__mg_copy').onclick = async () => {
      const txt = LOGS.join('\n') || '(no logs)';
      let ok = false;
      try {
        await navigator.clipboard.writeText(txt);
        ok = true;
      } catch (e) {}
      if (!ok) {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          ok = true;
        } catch (e) {}
        ta.remove();
      }
      const b = p.querySelector('#__mg_copy');
      b.textContent = ok ? '✓ Copied' : '✗ Fail';
      setTimeout(() => (b.textContent = '📋 Copy'), 1500);
    };

    // Clear logs
    p.querySelector('#__mg_clear').onclick = () => {
      LOGS.length = 0;
      if (logsEl) logsEl.innerHTML = '';
    };

    // Stop (keep panel)
    p.querySelector('#__mg_stopbtn').onclick = () => {
      S.stop = true;
      updateStatus('stopped');
      log('Stop from panel', 'warn');
    };

    // Close (stop + remove)
    p.querySelector('#__mg_close').onclick = () => {
      S.stop = true;
      updateStatus('stopped');
      setTimeout(() => p.remove(), 200);
    };

    // Drag
    let drag = null;
    const hdr = p.querySelector('#__mg_hdr');
    hdr.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const r = p.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      p.style.right = 'auto';
      p.style.left = r.left + 'px';
      p.style.top = r.top + 'px';
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      p.style.left = Math.max(0, drag.l + e.clientX - drag.x) + 'px';
      p.style.top = Math.max(0, drag.t + e.clientY - drag.y) + 'px';
    });
    document.addEventListener('mouseup', () => (drag = null));
  }

  // ─── Status dot ───────────────────────────────────────────────
  function updateStatus(state) {
    if (!stats.dot) return;
    const m = {
      running: '#00e676',
      stopped: '#ef5350',
      waiting: '#ffb300',
      error: '#ff5722',
    };
    const c = m[state] || m.waiting;
    stats.dot.style.background = c;
    stats.dot.style.boxShadow = '0 0 8px ' + c;
  }

  // ─── Logger ───────────────────────────────────────────────────
  function log(msg, level) {
    level = level || 'info';
    const t = new Date().toLocaleTimeString();
    const line = '[' + t + '] ' + msg;
    console.log('[MG]', msg);
    LOGS.push(line);
    if (LOGS.length > 800) LOGS.splice(0, LOGS.length - 800);
    if (logsEl) {
      const colors = {
        info: '#ccc',
        ok: '#69f0ae',
        err: '#ff5252',
        warn: '#ffb74d',
        bet: '#64b5f6',
        sys: '#ba68c8',
      };
      const el = document.createElement('div');
      el.style.color = colors[level] || colors.info;
      el.style.marginBottom = '2px';
      el.textContent = line;
      logsEl.appendChild(el);
      if (logsEl.children.length > 800) logsEl.removeChild(logsEl.firstChild);
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  }

  // ─── Stats updater ────────────────────────────────────────────
  function updateStats(d) {
    if (!stats.period) return;
    if (d.period !== undefined) stats.period.textContent = d.period || '-';
    if (d.timer !== undefined) stats.timer.textContent = d.timer != null ? d.timer + 's' : '-';
    if (d.bet !== undefined) stats.bet.textContent = '₹' + d.bet;
    if (d.wins !== undefined) stats.wins.textContent = d.wins;
    if (d.losses !== undefined) stats.losses.textContent = d.losses;
    if (d.bal !== undefined) stats.bal.textContent = d.bal != null ? '₹' + d.bal : '-';
    if (d.last !== undefined) stats.last.textContent = d.last || '-';
  }

  // Expose for toggle
  S.log = log;
  S.updateStatus = updateStatus;

  // ─── DOM readers ──────────────────────────────────────────────
  function getSec() {
    const ds = document.querySelectorAll('.TimeLeft__C-time > div');
    let s = '';
    ds.forEach((d) => {
      const t = d.textContent.trim();
      if (/^\d$/.test(t)) s += t;
    });
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
    return {
      period: c[0].textContent.trim(),
      num: parseInt(c[1].textContent.trim()),
      big: c[2].textContent.trim().toLowerCase() === 'big',
    };
  }

  function getBal() {
    const el = document.querySelector('.Wallet__C-balance-l1 > div');
    if (!el) return null;
    const m = el.textContent.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }

  // ─── Agree checkbox ───────────────────────────────────────────
  async function ensureAgree(popup) {
    const findBox = () =>
      [...popup.querySelectorAll('.van-checkbox')].find((c) =>
        /agree|pre-?sale|《/i.test(c.textContent)
      );
    let cb = findBox();
    if (!cb) return true;
    if (cb.classList.contains('van-checkbox--checked')) return true;

    for (let a = 0; a < 5; a++) {
      const icon = cb.querySelector('.van-checkbox__icon') || cb;
      const label = cb.querySelector('.van-checkbox__label');
      for (const el of [icon, label, cb].filter(Boolean)) {
        try {
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
            const Ev = t.startsWith('pointer') ? PointerEvent : MouseEvent;
            el.dispatchEvent(
              new Ev(t, { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' })
            );
          });
        } catch (e) {}
        await sleep(120);
        if (cb.classList.contains('van-checkbox--checked')) return true;
      }
      await sleep(300);
      cb = findBox();
      if (!cb) return true;
      if (cb.classList.contains('van-checkbox--checked')) return true;
    }
    throw new Error('agree checkbox check nahi hua');
  }

  // ─── Place bet ────────────────────────────────────────────────
  async function placeBet(target) {
    log('Bet shuru: target ₹' + target, 'bet');

    let btn = document.querySelector('.van-popup button.bet-amount');
    if (!btn) {
      const big = [...document.querySelectorAll('.Betting__C-foot-b')].find(
        (e) => e.textContent.trim() === 'Big'
      );
      if (!big) throw new Error('Big button missing');
      log('Big click', 'bet');
      big.click();
      for (let i = 0; i < 50 && !btn; i++) {
        await sleep(100);
        btn = document.querySelector('.van-popup button.bet-amount');
      }
      if (!btn) throw new Error('Popup nahi khula');
    }

    await sleep(500);
    const popup = btn.closest('.van-popup') || btn.parentElement;

    log('Agree check kar raha...', 'bet');
    await ensureAgree(popup);
    log('Agree ✓', 'ok');

    const read = () => parseFloat(btn.textContent.match(/₹\s*([\d.]+)/)?.[1] || '0');
    let cur = read();
    log('Current ₹' + cur + ' → target ₹' + target, 'bet');

    const plus = [...popup.querySelectorAll('button')].find((b) => b.textContent.trim() === '+');
    const minus = [...popup.querySelectorAll('button')].find((b) => b.textContent.trim() === '-');

    let g = 0;
    while (cur < target - 0.01 && g++ < 30) {
      if (!plus) throw new Error('+ missing');
      const p = cur;
      plus.click();
      await sleep(150);
      cur = read();
      if (cur === p) throw new Error('+ ne total nahi badhaya');
    }

    g = 0;
    while (cur > target + 0.01 && g++ < 30) {
      if (!minus) throw new Error('- missing');
      const p = cur;
      minus.click();
      await sleep(150);
      cur = read();
      if (cur === p) throw new Error('- ne total nahi ghataaya');
    }

    if (Math.abs(cur - target) > 0.01) throw new Error('₹' + target + ' set nahi hua (at ₹' + cur + ')');

    await sleep(200);
    btn.click();
    log('✓ Bet placed ₹' + target, 'ok');
    await sleep(400);
  }

  // ─── Main loop ────────────────────────────────────────────────
  initPanel();
  log('Panel ready', 'sys');
  log('Martingale Big: 1→2→4→8 (cap 8)', 'sys');
  updateStatus('waiting');
  updateStats({ bet: S.bet, bal: getBal() });

  let pend = null;
  let lastP = null;

  while (!S.stop) {
    try {
      const per = getPeriod();
      const sec = getSec();
      const lat = getLatest();
      updateStats({ period: per, timer: sec, bet: S.bet, bal: getBal() });

      // Result check
      if (pend && lat && lat.period === pend) {
        updateStats({
          last: per.slice(-5) + ' → ' + (lat.big ? 'BIG' : 'SMALL') + '(' + lat.num + ')',
        });
        if (lat.big) {
          S.wins++;
          S.bet = 1;
          log('✓ WON ' + pend + ' (num ' + lat.num + ') → reset ₹1', 'ok');
        } else {
          S.losses++;
          S.bet = Math.min(S.bet * 2, 8);
          log('✗ LOST ' + pend + ' (num ' + lat.num + ') → next ₹' + S.bet, 'err');
        }
        updateStats({ wins: S.wins, losses: S.losses, bet: S.bet });
        pend = null;
        await sleep(500);
        continue;
      }

      // New round bet
      if (!pend && sec >= 5 && sec <= 27 && per !== lastP) {
        updateStatus('running');
        log('Round ' + per + ' | timer ' + sec + 's | bet ₹' + S.bet, 'bet');
        await placeBet(S.bet);
        pend = per;
        lastP = per;
        updateStatus('waiting');
      }

      await sleep(700);
    } catch (e) {
      log('ERR: ' + e.message, 'err');
      updateStatus('error');
      const b = document.querySelector('.van-popup button.bet-amount');
      if (b) {
        const o = document.querySelector('.van-overlay');
        if (o) o.click();
        await sleep(500);
      }
      await sleep(1500);
    }
  }

  log('Stopped.', 'warn');
  updateStatus('stopped');
})();