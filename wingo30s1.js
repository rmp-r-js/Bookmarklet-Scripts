(function () {
  'use strict';

  // ===== CONFIG =====
  var PROXY_RUN = 'https://wingoproxy.shekhawatsarita85.workers.dev/run';
  var PROXY_HISTORY = 'https://wingoproxy.shekhawatsarita85.workers.dev/api/history?limit=100'; // 100 needed for ensemble
  
  var API_J0RO = 'https://wingo-prediction-j0ro.onrender.com/predict';
  var API_WTR = 'https://wtr-prediction.onrender.com/predict'; 
  var API_COMBINED = 'https://wtr-jcyj.onrender.com/predict'; // Combined API
  
  var NUMBERS_NEEDED = 100;

  var IMG = 'https://pdftoimgjss.vercel.app/logo.svg';
  var FONT_URL = 'https://github.jssoriginals.com/_next/static/media/cbcb737ef097dac1-s.p.woff2';

  // ===== CLEANUP =====
  if (window.__wrP) window.__wrP.remove();
  if (window.__wrT) clearTimeout(window.__wrT);
  if (window.__wrC) clearInterval(window.__wrC);
  if (window.__wrF) window.__wrF.remove();
  window.__wrLastRound = null;

  // ===== INJECT FONT =====
  var fstyle = document.createElement('style');
  fstyle.id = '__wrF';
  fstyle.textContent = "@font-face{font-family:'WinGoFont';src:url('" + FONT_URL + "') format('woff2');font-weight:100 900;font-style:normal;font-display:swap;}@keyframes __wrSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(fstyle);

  // ===== PANEL HTML =====
  var p = document.createElement('div');
  p.id = '__wrP';
  p.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','WinGoFont',sans-serif;";

  p.innerHTML = [
    '<div id="__wrExp" style="width:340px;background:rgba(28,28,30,0.85);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);color:#ffffff;font-size:13px;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transition:all 0.3s ease">',
    
    // Header
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08)">',
    '<div style="display:flex;align-items:center;gap:10px">',
    '<img src="' + IMG + '" alt="" style="width:20px;height:20px;object-fit:contain;pointer-events:none;user-select:none;border-radius:4px">',
    '<strong style="font-size:15px;font-weight:600;letter-spacing:-0.3px">WinGo 4-API Tracker</strong>',
    '</div>',
    '<button id="__wrMin" title="Collapse" style="background:rgba(255,255,255,0.15);color:#ffffff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;transition:background 0.2s">—</button>',
    '</div>',
    
    // Body
    '<div style="padding:16px">',
    
    // Pending Spinner
    '<div id="__wrPending" style="display:none;font-size:11px;color:#FF9F0A;margin-bottom:12px;font-weight:600;align-items:center;justify-content:center;gap:8px;">',
    '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,159,10,0.3);border-top-color:#FF9F0A;border-radius:50%;animation:__wrSpin 0.8s linear infinite;flex-shrink:0"></span>',
    '<span>Fetching Proxy Data...</span>',
    '</div>',
    
    // Results Container
    '<div id="__wrResultsContainer" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">',
      
      // Slot 1: J0RO
      '<div id="__wrSlot_J0RO" style="background:rgba(44,44,46,0.5);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.05);">',
      '<div style="color:rgba(235,235,245,0.4);font-size:11px;font-weight:600;text-align:center;">J0RO API (Loading...)</div>',
      '</div>',
      
      // Slot 2: WTR
      '<div id="__wrSlot_WTR" style="background:rgba(44,44,46,0.5);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.05);">',
      '<div style="color:rgba(235,235,245,0.4);font-size:11px;font-weight:600;text-align:center;">WTR API (Loading...)</div>',
      '</div>',
      
      // Slot 3: Trap Hunter
      '<div id="__wrSlot_Trap" style="background:rgba(44,44,46,0.5);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.05);">',
      '<div style="color:rgba(235,235,245,0.4);font-size:11px;font-weight:600;text-align:center;">Trap Hunter (Loading...)</div>',
      '</div>',
      
      // Slot 4: Ensemble
      '<div id="__wrSlot_Ensemble" style="background:rgba(44,44,46,0.5);border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,0.05);">',
      '<div style="color:rgba(235,235,245,0.4);font-size:11px;font-weight:600;text-align:center;">Ensemble Model (Loading...)</div>',
      '</div>',
      
    '</div>',
    
    // Next Round Timer
    '<div>',
    '<div style="color:rgba(235,235,245,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:2px">Next Round</div>',
    '<div id="__wrN" style="font-size:20px;font-weight:600;color:#0A84FF;letter-spacing:-0.5px">—</div>',
    '</div>',
    
    '</div>',
    '</div>',
    
    // Mini FAB
    '<div id="__wrMini" style="display:none">',
    '<button id="__wrExpBtn" title="Expand" style="background:rgba(28,28,30,0.9);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);border-radius:50%;width:56px;height:56px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:0;position:relative;transition:transform 0.2s">',
    '<img src="' + IMG + '" alt="" style="width:32px;height:32px;object-fit:contain;pointer-events:none;user-select:none;border-radius:6px">',
    '<span id="__wrMiniCd" style="position:absolute;bottom:-4px;right:-4px;background:#FF3B30;color:#ffffff;font-size:10px;font-weight:600;border-radius:12px;padding:2px 6px;border:2px solid rgba(28,28,30,0.9);min-width:24px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)">—</span>',
    '</button>',
    '</div>'
  ].join('');

  document.body.appendChild(p);

  var N = p.querySelector('#__wrN'),
      EXP = p.querySelector('#__wrExp'),
      MIN = p.querySelector('#__wrMini'),
      MC = p.querySelector('#__wrMiniCd'),
      PEND = p.querySelector('#__wrPending'),
      SLOT_J0RO = p.querySelector('#__wrSlot_J0RO'),
      SLOT_WTR = p.querySelector('#__wrSlot_WTR'),
      SLOT_TRAP = p.querySelector('#__wrSlot_Trap'),
      SLOT_ENSEMBLE = p.querySelector('#__wrSlot_Ensemble');

  // Collapse
  p.querySelector('#__wrMin').onclick = function () {
    EXP.style.display = 'none';
    MIN.style.display = 'block';
  };

  // ===== DRAGGABLE FAB =====
  var tx = 0, ty = 0;
  var isDraggingMini = false;
  var dragStartX = 0, dragStartY = 0;
  var dragMoved = false;
  var expBtn = p.querySelector('#__wrExpBtn');

  expBtn.onclick = function (e) {
    if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; }
    MIN.style.display = 'none';
    EXP.style.display = 'block';
    requestAnimationFrame(function () {
      var r = p.getBoundingClientRect();
      var pad = 8;
      var adjX = 0, adjY = 0;
      if (r.left < pad) adjX = pad - r.left;
      else if (r.right > window.innerWidth - pad) adjX = (window.innerWidth - pad) - r.right;
      if (r.top < pad) adjY = pad - r.top;
      else if (r.bottom > window.innerHeight - pad) adjY = (window.innerHeight - pad) - r.bottom;
      if (adjX || adjY) {
        tx += adjX; ty += adjY;
        p.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
      }
    });
  };

  expBtn.addEventListener('mousedown', onMiniDown);
  expBtn.addEventListener('touchstart', onMiniDown, { passive: false });

  function onMiniDown(e) {
    if (e.button && e.button !== 0) return;
    isDraggingMini = true;
    dragMoved = false;
    dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
  }

  document.addEventListener('mousemove', onMiniMove);
  document.addEventListener('touchmove', onMiniMove, { passive: false });

  function onMiniMove(e) {
    if (!isDraggingMini) return;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dx = clientX - dragStartX;
    var dy = clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    if (dragMoved) {
      if (e.cancelable) e.preventDefault();
      var rect = p.getBoundingClientRect();
      var newTx = tx + dx;
      var newTy = ty + dy;
      if (rect.left + dx < 0) newTx = tx - rect.left;
      if (rect.right + dx > window.innerWidth) newTx = tx + (window.innerWidth - rect.right);
      if (rect.top + dy < 0) newTy = ty - rect.top;
      if (rect.bottom + dy > window.innerHeight) newTy = ty + (window.innerHeight - rect.bottom);
      tx = newTx; ty = newTy;
      p.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
      dragStartX = clientX; dragStartY = clientY;
    }
  }

  document.addEventListener('mouseup', onMiniUp);
  document.addEventListener('touchend', onMiniUp);

  function onMiniUp() {
    if (!isDraggingMini) return;
    isDraggingMini = false;
  }

  // ===== HELPERS =====
  function pad(n) { return ('0' + n).slice(-2); }
  function fmt(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

  function nD() {
    var n = new Date(), s = n.getSeconds(), ms = n.getMilliseconds(), ts, em = 0;
    if (s < 30) { ts = 30; } else { ts = 0; em = 1; }
    return Math.max((em * 60 + ts - s) * 1000 - ms, 100);
  }

  function nT() {
    var n = new Date(), s = n.getSeconds(), ms = n.getMilliseconds(), ts, em = 0;
    if (s < 30) { ts = 30; } else { ts = 0; em = 1; }
    return new Date(n.getTime() + (em * 60 + ts - s) * 1000 - ms);
  }

  function sCd() {
    if (window.__wrC) clearInterval(window.__wrC);
    window.__wrC = setInterval(function () {
      var t = nT(), rem = Math.max(0, t.getTime() - Date.now());
      N.textContent = (rem / 1000).toFixed(1) + 's (' + fmt(t) + ')';
      MC.textContent = Math.ceil(rem / 1000) + 's';
    }, 100);
  }

  // ===== RENDER CARD =====
  function renderCard(slot, name, pred, conf, isErr) {
    if (isErr || !pred) {
        slot.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="color:rgba(235,235,245,0.5);font-size:12px;font-weight:600;">${name}</div>
                <div style="color:#FF453A;font-size:11px;font-weight:700;">ERROR</div>
            </div>
        `;
        return;
    }
    
    var isBig = pred.toLowerCase() === 'big';
    var color = isBig ? '#FF453A' : '#30D158';
    var bg = isBig ? 'rgba(255,69,58,0.1)' : 'rgba(48,209,88,0.1)';
    var label = isBig ? 'BIG' : 'SMALL';
    var confStr = ((conf || 0) * 100).toFixed(1);
    
    slot.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="color:rgba(235,235,245,0.7);font-size:12px;font-weight:600;">${name}</div>
            <div style="text-align:right;">
                <span style="color:${color};font-size:18px;font-weight:800;letter-spacing:1px;">${label}</span>
                <span style="color:rgba(235,235,245,0.5);font-size:11px;margin-left:6px;">${confStr}%</span>
            </div>
        </div>
    `;
    slot.style.background = bg;
    slot.style.borderColor = color;
  }

  // ===== FETCH FROM APIs (Parallel - No Waiting) =====
  async function fetchAllAPIs(payload) {
    
    // 1. J0RO API
    fetch(API_J0RO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .then(r => r.ok ? r.json() : Promise.reject('Err'))
      .then(d => renderCard(SLOT_J0RO, 'J0RO API', d.prediction, d.confidence))
      .catch(() => renderCard(SLOT_J0RO, 'J0RO API', null, 0, true));

    // 2. WTR API
    fetch(API_WTR, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .then(r => r.ok ? r.json() : Promise.reject('Err'))
      .then(d => renderCard(SLOT_WTR, 'WTR API', d.prediction, d.confidence))
      .catch(() => renderCard(SLOT_WTR, 'WTR API', null, 0, true));

    // 3. COMBINED API (Trap + Ensemble)
    fetch(API_COMBINED, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .then(r => r.ok ? r.json() : Promise.reject('Err'))
      .then(d => {
          if (d.trap_hunter) renderCard(SLOT_TRAP, 'Trap Hunter', d.trap_hunter.prediction, d.trap_hunter.confidence);
          else renderCard(SLOT_TRAP, 'Trap Hunter', null, 0, true);
          
          if (d.ensemble) renderCard(SLOT_ENSEMBLE, 'Ensemble Model', d.ensemble.prediction, d.ensemble.confidence);
          else renderCard(SLOT_ENSEMBLE, 'Ensemble Model', null, 0, true);
      })
      .catch(() => {
          renderCard(SLOT_TRAP, 'Trap Hunter', null, 0, true);
          renderCard(SLOT_ENSEMBLE, 'Ensemble Model', null, 0, true);
      });
  }

  // ===== MAIN LOGIC =====
  async function fetchAndPredict() {
    PEND.style.display = 'flex';
    
    var loadingHtml = function(name) { return `<div style="color:rgba(235,235,245,0.4);font-size:11px;font-weight:600;text-align:center;">${name} (Loading...)</div>`; };
    SLOT_J0RO.innerHTML = loadingHtml('J0RO API'); SLOT_J0RO.style.background = 'rgba(44,44,46,0.5)'; SLOT_J0RO.style.borderColor = 'rgba(255,255,255,0.05)';
    SLOT_WTR.innerHTML = loadingHtml('WTR API'); SLOT_WTR.style.background = 'rgba(44,44,46,0.5)'; SLOT_WTR.style.borderColor = 'rgba(255,255,255,0.05)';
    SLOT_TRAP.innerHTML = loadingHtml('Trap Hunter'); SLOT_TRAP.style.background = 'rgba(44,44,46,0.5)'; SLOT_TRAP.style.borderColor = 'rgba(255,255,255,0.05)';
    SLOT_ENSEMBLE.innerHTML = loadingHtml('Ensemble Model'); SLOT_ENSEMBLE.style.background = 'rgba(44,44,46,0.5)'; SLOT_ENSEMBLE.style.borderColor = 'rgba(255,255,255,0.05)';

    try {
      var res = await fetch(PROXY_HISTORY + '&t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Proxy HTTP ' + res.status);

      var json = await res.json();
      if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
        throw new Error('Proxy returned no data');
      }

      var numbers = json.data.map(function (r) { return Number(r.number); }).reverse();

      if (numbers.length < NUMBERS_NEEDED) {
        throw new Error('need ' + NUMBERS_NEEDED + ', got ' + numbers.length);
      }

      var trimmed = numbers.slice(-NUMBERS_NEEDED);
      var latestRound = json.data[0].issueNumber;
      var nextRound = String(BigInt(latestRound) + 1n);

      if (window.__wrLastRound === nextRound) {
        PEND.style.display = 'none';
        return; // Already fetched for this round
      }
      
      window.__wrLastRound = nextRound;

      var payload = JSON.stringify({ numbers: trimmed });
      
      // Fire all APIs in parallel
      fetchAllAPIs(payload);
      
      PEND.style.display = 'none';

    } catch (e) {
      console.error(e);
      PEND.style.display = 'none';
      renderCard(SLOT_J0RO, 'Proxy Error', null, 0, true);
      renderCard(SLOT_WTR, 'Proxy Error', null, 0, true);
      renderCard(SLOT_TRAP, 'Proxy Error', null, 0, true);
      renderCard(SLOT_ENSEMBLE, 'Proxy Error', null, 0, true);
    }
  }

  // ===== FIRE /RUN =====
  async function fire() {
    PEND.style.display = 'flex';

    try {
      var res = await fetch(PROXY_RUN, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json, text/plain, */*' }
      });

      await new Promise(function (r) { setTimeout(r, 2000); });
      await fetchAndPredict();
      
    } catch (e) {
      console.error(e);
      PEND.style.display = 'none';
    } finally {
      window.__wrT = setTimeout(fire, nD());
    }
  }

  // ===== INIT =====
  window.__wrP = p;
  sCd();
  fire();
})();