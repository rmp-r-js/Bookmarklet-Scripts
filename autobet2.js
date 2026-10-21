/**
 * MG Bot — Martingale Big autobet for WinGo
 * v2.2 — stale popup close + winner modal dismiss + ₹0 fallback
 * ⚠️ Martingale 1→2→4→8. Real money. Use at your own risk.
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
        '<b style="flex:1;color:#fff;font-size:12px;">🤖 MG Bot v2.2</b>' +
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
      b.textContent = ok ? '✓ Copied' : '✗ Fail';
      setTimeout(() => (b.textContent = '📋 Copy'), 1500);
    };
    p.querySelector('#__mg_clear').onclick = () => { LOGS.length = 0; if (logsEl) logsEl.innerHTML = ''; };
    p.querySelector('#__mg_stopbtn').onclick = () => { S.stop = true; updateStatus('stopped'); log('Stop from panel', 'warn'); };
    p.querySelector('#__mg_close').onclick = () => { S.stop = true; updateStatus('stopped'); setTimeout(() => p.remove(), 200); };
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
      const colors = { info: '#ccc', ok: '#69f0ae', err: '#ff5252', warn: '#ffb74d', bet: '#64b5f6', sys: '#ba68c8' };
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
    if (d.last !== undefined) stats.last.textContent = d.last || '-';
  }

  S.log = log;
  S.updateStatus = updateStatus;

  // ─── DOM readers ──────────────────────────────────────────────
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

  // ─── NEW: close bet popup + winner modal ──────────────────────
  async function closeBetUI(reason) {
    let closed = false;

    // 1. Close winner modal (winner_box / .winning)
    const winnerClose = document.querySelector(
      '.winner_box .closeBtn, .winning:not([style*="display: none"]) .closeBtn, .winning .closeBtn, [class*="winner"] .closeBtn'
    );
    if (winnerClose && winnerClose.offsetParent !== null) {
      try { winnerClose.click(); closed = true; } catch (e) {}
      await sleep(200);
    }

    // 2. Close bet popup if open (empty or stale state)
    const popup = document.querySelector('.van-popup button.bet-amount');
    if (popup) {
      // try overlay first
      const overlays = [...document.querySelectorAll('.van-overlay')].filter((o) => o.offsetParent !== null);
      for (const o of overlays) { try { o.click(); break; } catch (e) {} }
      await sleep(300);

      // escape fallback
      if (document.querySelector('.van-popup button.bet-amount')) {
        try {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        } catch (e) {}
        await sleep(300);
      }
      // close button (Vant popup header has close icon sometimes)
      const popupClose = document.querySelector('.van-popup__close-icon, .van-popup [class*="close"]');
      if (popupClose && document.querySelector('.van-popup button.bet-amount')) {
        try { popupClose.click(); } catch (e) {}
        await sleep(200);
      }
      if (!document.querySelector('.van-popup button.bet-amount')) closed = true;
    }

    if (closed && reason) log('Popup/modal closed (' + reason + ')', 'sys');
  }

  // ─── NEW: toast helpers ───────────────────────────────────────
  async function waitToast(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const toasts = [...document.querySelectorAll('.van-toast')];
      for (const t of toasts) {
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

  // ─── checkbox helpers (same as v2.1) ──────────────────────────
  function isAgreeChecked(cb) {
    if (!cb) return false;
    if (cb.querySelector('.van-checkbox__icon--checked')) return true;
    if (cb.classList.contains('van-checkbox--checked')) return true;
    const iw = cb.querySelector('.van-checkbox__icon');
    if (iw && iw.getAttribute('aria-checked') === 'true') return true;
    if (cb.getAttribute('aria-checked') === 'true') return true;
    const inp = cb.querySelector('input[type="checkbox"]');
    if (inp && inp.checked) return true;
    return false;
  }
  async function ensureAgree(popup) {
    const findBox = () =>
      [...popup.querySelectorAll('.van-checkbox')].find((c) => /agree|pre-?sale|《/i.test(c.textContent));
    let cb = findBox();
    if (!cb) { log('Agree checkbox nahi mila — skip', 'warn'); return true; }
    if (isAgreeChecked(cb)) { log('Agree already checked ✓', 'ok'); return true; }

    const fire = (el) => {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
        try {
          const Ev = t.startsWith('pointer') ? PointerEvent : MouseEvent;
          el.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
        } catch (e) {}
      });
    };

    for (let attempt = 0; attempt < 4; attempt++) {
      const targets = [
        cb.querySelector('i.van-icon-success'),
        cb.querySelector('i'),
        cb.querySelector('.van-checkbox__icon'),
        cb.querySelector('.van-checkbox__label'),
        cb,
      ].filter(Boolean);
      for (const el of targets) {
        fire(el);
        await sleep(120);
        if (isAgreeChecked(cb)) { log('Agree ✓ (try ' + (attempt + 1) + ')', 'ok'); return true; }
      }
      await sleep(300);
      cb = findBox();
      if (!cb || isAgreeChecked(cb)) return true;
    }
    log('Agree state detect fail — toast se verify hoga', 'warn');
    return true;
  }

  // ─── REWRITTEN placeBet ───────────────────────────────────────
  async function placeBet(target) {
    log('Bet shuru: target ₹' + target, 'bet');

    // 1. cleanup: stale popup + winner modal pehle band karo
    await closeBetUI('pre-bet');

    // 2. fresh Big click (popup abhi band hai, isliye click kaam karega)
    const big = [...document.querySelectorAll('.Betting__C-foot-b')].find(
      (e) => e.textContent.trim() === 'Big'
    );
    if (!big) throw new Error('Big button missing');
    log('Big click', 'bet');
    big.click();

    // 3. popup wait
    let btn = null;
    for (let i = 0; i < 60 && !btn; i++) {
      await sleep(100);
      btn = document.querySelector('.van-popup button.bet-amount');
    }
    if (!btn) throw new Error('Popup nahi khula');
    await sleep(400);
    const popup = btn.closest('.van-popup') || btn.parentElement;

    // 4. safety: agar popup stale (n_null / ₹0 aur n_big nahi) to dobara close/reopen
    if (btn.classList.contains('n_null') && !btn.classList.contains('n_big')) {
      log('Stale popup detect (n_null) — close + reopen', 'warn');
      await closeBetUI('stale');
      big.click();
      btn = null;
      for (let i = 0; i < 60 && !btn; i++) {
        await sleep(100);
        btn = document.querySelector('.van-popup button.bet-amount');
      }
      if (!btn) throw new Error('Reopen ke baad popup nahi khula');
      await sleep(400);
    }
    const popup2 = btn.closest('.van-popup') || btn.parentElement;

    // 5. agree
    log('Agree check kar raha...', 'bet');
    await ensureAgree(popup2);

    // 6. amount set
    const read = () => {
      if (!btn || !btn.isConnected) return 0;
      const m = btn.textContent.match(/₹\s*([\d.]+)/);
      return m ? parseFloat(m[1]) : 0;
    };
    let cur = read();
    log('Current ₹' + cur + ' → target ₹' + target, 'bet');

    // 6a. agar ₹0 hai, "1" quick button click karke base banao
    if (cur < 0.01) {
      const oneBtn = [...popup2.querySelectorAll('button')].find((b) => b.textContent.trim() === '1');
      if (oneBtn) {
        oneBtn.click();
        await sleep(250);
        cur = read();
        log('Quick ₹1 set → current ₹' + cur, 'bet');
      }
    }

    // 6b. find +/- (lenient — button ya stepper)
    const findToggle = (sym) =>
      [...popup2.querySelectorAll('button, .van-stepper__plus, .van-stepper__minus, [class*="plus"], [class*="minus"]')]
        .find((b) => b.textContent.trim() === sym);
    const plus = findToggle('+');
    const minus = findToggle('-');

    let g = 0;
    while (cur < target - 0.01 && g++ < 50) {
      if (!plus) throw new Error('+ missing (current ₹' + cur + ')');
      const p = cur;
      plus.click(); await sleep(150); cur = read();
      if (cur === p) throw new Error('+ ne total nahi badhaya');
    }
    g = 0;
    while (cur > target + 0.01 && g++ < 50) {
      if (!minus) throw new Error('- missing (current ₹' + cur + ')');
      const p = cur;
      minus.click(); await sleep(150); cur = read();
      if (cur === p) throw new Error('- ne total nahi ghataaya');
    }
    if (Math.abs(cur - target) > 0.01) throw new Error('₹' + target + ' set nahi hua (at ₹' + cur + ')');

    // 7. confirm + toast verify
    clearToasts();
    await sleep(200);
    btn.click();
    log('Confirm clicked — toast verify...', 'bet');

    let toast = await waitToast(4000);
    if (toast === 'success') {
      log('✓ Bet placed ₹' + target, 'ok');
      await sleep(300);
      await closeBetUI('post-bet');
      return;
    }

    if (toast && toast.startsWith('error')) {
      log('Bet reject: ' + toast.slice(6) + ' — checkbox force retry', 'warn');
      const cb2 = popup2.querySelector('.van-checkbox');
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
        toast = await waitToast(4000);
        if (toast === 'success') { log('✓ Bet placed (retry) ₹' + target, 'ok'); await closeBetUI('post-bet'); return; }
      }
      throw new Error('Bet reject (retry ke baad bhi)');
    }

    await sleep(300);
    if (read() < 0.01) { log('✓ Amount reset hua — bet assume success', 'ok'); await closeBetUI('post-bet'); return; }
    throw new Error('Bet confirm nahi hua (no toast, no reset)');
  }

  // ─── Main loop ────────────────────────────────────────────────
  initPanel();
  log('Panel ready (v2.2)', 'sys');
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

      // result detect
      if (pend && lat && lat.period === pend) {
        updateStats({ last: per.slice(-5) + ' → ' + (lat.big ? 'BIG' : 'SMALL') + '(' + lat.num + ')' });
        if (lat.big) {
          S.wins++; S.bet = 1;
          log('✓ WON ' + pend + ' (num ' + lat.num + ') → reset ₹1', 'ok');
        } else {
          S.losses++; S.bet = Math.min(S.bet * 2, 8);
          log('✗ LOST ' + pend + ' (num ' + lat.num + ') → next ₹' + S.bet, 'err');
        }
        updateStats({ wins: S.wins, losses: S.losses, bet: S.bet });
        pend = null;
        // winner modal dismiss
        await closeBetUI('post-win');
        await sleep(500);
        continue;
      }

      // new round bet
      if (!pend && sec >= 5 && sec <= 27 && per !== lastP) {
        updateStatus('running');
        log('Round ' + per + ' | timer ' + sec + 's | bet ₹' + S.bet, 'bet');
        await placeBet(S.bet);
        pend = per; lastP = per;
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
  log('Stopped.', 'warn');
  updateStatus('stopped');
})();