(function () {
  'use strict';

  // ===== CONFIG =====
  var PROXY_RUN = 'https://wingoproxy.shekhawatsarita85.workers.dev/run';
  var PROXY_HISTORY = 'https://wingoproxy.shekhawatsarita85.workers.dev/api/history?limit=40';
  
  var API_1 = 'https://wtr-prediction.onrender.com'; // WTR (OPTIONAL)
  var API_2 = 'https://wingo-prediction-j0ro.onrender.com'; // J0RO (MAIN)
  
  var NUMBERS_NEEDED = 40;

  var IMG = 'https://pdftoimgjss.vercel.app/logo.svg';
  var FONT_URL = 'https://github.jssoriginals.com/_next/static/media/cbcb737ef097dac1-s.p.woff2';

  var BADGE_HTML = '<span style="display:inline-block;background:rgba(255,214,10,0.15);color:#FFD60A;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:6px;letter-spacing:0.3px;border:1px solid rgba(255,214,10,0.3);vertical-align:middle">HIGH CHANCE</span>';

  // ===== CLEANUP =====
  if (window.__wrP) window.__wrP.remove();
  if (window.__wrT) clearTimeout(window.__wrT);
  if (window.__wrC) clearInterval(window.__wrC);
  if (window.__wrF) window.__wrF.remove();
  window.__wrLastRound = null;

  // ===== INJECT FONT + KEYFRAMES =====
  var fstyle = document.createElement('style');
  fstyle.id = '__wrF';
  fstyle.textContent = "@font-face{font-family:'WinGoFont';src:url('" + FONT_URL + "') format('woff2');font-weight:100 900;font-style:normal;font-display:swap;}@keyframes __wrSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(fstyle);

  // ===== PANEL =====
  var p = document.createElement('div');
  p.id = '__wrP';
  p.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','WinGoFont',sans-serif;";

  p.innerHTML = [
    '<div id="__wrExp" style="width:320px;background:rgba(28,28,30,0.85);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);color:#ffffff;font-size:13px;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transition:all 0.3s ease">',
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08)">',
    '<div style="display:flex;align-items:center;gap:10px">',
    '<img src="' + IMG + '" alt="" style="width:20px;height:20px;object-fit:contain;pointer-events:none;user-select:none;border-radius:4px">',
    '<strong style="font-size:15px;font-weight:600;letter-spacing:-0.3px">WinGo 30s</strong>',
    '</div>',
    '<button id="__wrMin" title="Collapse" style="background:rgba(255,255,255,0.15);color:#ffffff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;transition:background 0.2s">—</button>',
    '</div>',
    '<div style="padding:16px">',
    '<div id="__wrPred" style="display:none;background:rgba(44,44,46,0.8);border-radius:16px;padding:16px 12px;margin-bottom:14px;border:1px solid rgba(255,255,255,0.05);transition:border-color 0.3s,box-shadow 0.3s">',
    '<div id="__wrPredBody" style="font-size:12px;color:rgba(235,235,245,0.5);text-align:center;font-weight:500"></div>',
    '</div>',
    '<div id="__wrPending" style="display:none;font-size:11px;color:#FF9F0A;margin-bottom:12px;font-weight:600;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;text-align:center">',
    '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,159,10,0.3);border-top-color:#FF9F0A;border-radius:50%;animation:__wrSpin 0.8s linear infinite;flex-shrink:0"></span>',
    '<span id="__wrPendingTxt" style="word-break:break-word;min-width:0">Predicting...</span>',
    '</div>',
    '<div id="__wrErr" style="display:none;background:rgba(255,69,58,0.1);border:1px solid rgba(255,69,58,0.35);border-radius:12px;padding:12px;margin-bottom:14px;position:relative">',
    '<button id="__wrErrClose" title="Dismiss" style="position:absolute;top:4px;right:4px;background:transparent;border:none;color:rgba(235,235,245,0.55);cursor:pointer;font-size:16px;line-height:1;padding:4px 8px;border-radius:6px">×</button>',
    '<div style="font-size:12px;color:#FF453A;font-weight:700;margin-bottom:10px;letter-spacing:0.2px">Something went wrong</div>',
    '<button id="__wrErrCopy" style="background:rgba(255,255,255,0.1);color:#ffffff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;transition:background 0.2s">Copy Details</button>',
    '</div>',
    '<div>',
    '<div style="color:rgba(235,235,245,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:2px">Next Round</div>',
    '<div id="__wrN" style="font-size:24px;font-weight:600;color:#0A84FF;letter-spacing:-0.5px">—</div>',
    '</div>',
    '</div>',
    '</div>',
    '<div id="__wrMini" style="display:none">',
    '<button id="__wrExpBtn" title="Expand" style="background:rgba(28,28,30,0.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);border-radius:50%;width:56px;height:56px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:0;position:relative;transition:transform 0.2s">',
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
      PRED = p.querySelector('#__wrPred'),
      PB = p.querySelector('#__wrPredBody'),
      PEND = p.querySelector('#__wrPending'),
      PTXT = p.querySelector('#__wrPendingTxt'),
      ERR = p.querySelector('#__wrErr'),
      ERRCOPY = p.querySelector('#__wrErrCopy'),
      ERRCLOSE = p.querySelector('#__wrErrClose');

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

  // ===== PENDING =====
  function showPending(round) {
    PEND.style.display = 'flex';
    PTXT.textContent = round ? ('Predicting... ' + round) : 'Predicting...';
  }
  function hidePending() {
    PEND.style.display = 'none';
  }

  // ===== ERROR SYSTEM =====
  var errorLog = [];
  var lastRoundKnown = null;

  function addError(source, err) {
    var msg = (err && err.message) ? err.message : String(err);
    errorLog.push({
      time: new Date().toISOString(),
      source: source,
      round: lastRoundKnown,
      message: msg
    });
    if (errorLog.length > 60) errorLog.shift();
    ERR.style.display = 'block';
  }

  function buildErrorReport() {
    var lines = [];
    lines.push('WinGo Panel — Error Report');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('');
    lines.push('Config:');
    lines.push('  /run:           ' + PROXY_RUN);
    lines.push('  History:        ' + PROXY_HISTORY);
    lines.push('  J0RO API:       ' + API_2);
    lines.push('  WTR API:        ' + API_1 + '  (optional)');
    lines.push('  Numbers needed: ' + NUMBERS_NEEDED);
    lines.push('');
    lines.push('Errors (' + errorLog.length + '):');
    lines.push('');
    for (var i = 0; i < errorLog.length; i++) {
      var e = errorLog[i];
      lines.push('[' + e.time + ']');
      lines.push('  Source:  ' + e.source);
      lines.push('  Round:   ' + (e.round || 'unknown'));
      lines.push('  Message: ' + e.message);
      lines.push('');
    }
    return lines.join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  ERRCOPY.onclick = function () {
    var label = 'Copy Details';
    copyText(buildErrorReport()).then(function () {
      ERRCOPY.textContent = 'Copied!';
      setTimeout(function () { ERRCOPY.textContent = label; }, 1500);
    }).catch(function () {
      ERRCOPY.textContent = 'Copy failed';
      setTimeout(function () { ERRCOPY.textContent = label; }, 1500);
    });
  };

  ERRCLOSE.onclick = function () {
    errorLog = [];
    ERR.style.display = 'none';
  };

  // ===== BADGE (live update) =====
  function updateBadge(isMatch) {
    var slot = PB.querySelector('#__wrBadgeSlot');
    if (!slot) return;
    slot.innerHTML = isMatch ? BADGE_HTML : '';
  }

  // ===== RENDER (J0RO only, badge optional) =====
  var currentRenderedRound = null;

  function renderPrediction(d1, d2, roundStr) {
    var pred2 = (d2.prediction || '').toLowerCase();
    var isBig2 = pred2 === 'big';
    var color2 = isBig2 ? '#FF453A' : '#30D158';
    var bgColor2 = isBig2 ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)';
    var label2 = isBig2 ? 'BIG' : 'SMALL';
    var conf2 = ((d2.confidence || 0) * 100).toFixed(1);

    var pred1 = (d1 && d1.prediction ? d1.prediction : '').toLowerCase();
    var wtrValid = pred1 === 'big' || pred1 === 'small';
    var isMatch = wtrValid && pred2 !== '' && pred1 === pred2;

    var badgeHtml = isMatch ? BADGE_HTML : '';

    var html =
      '<div style="font-size:13px;color:rgba(235,235,245,0.6);text-align:center;margin-bottom:6px;letter-spacing:0.3px;font-weight:500">' + roundStr + '</div>' +
      '<div style="font-size:34px;font-weight:700;color:' + color2 + ';text-align:center;letter-spacing:2px;margin-bottom:8px;text-shadow:0 2px 10px ' + bgColor2 + '">' + label2 + '</div>' +
      '<div style="font-size:13px;color:rgba(235,235,245,0.6);text-align:center;font-weight:500">Probability: <span style="color:' + color2 + ';font-weight:700">' + conf2 + '%</span><span id="__wrBadgeSlot">' + badgeHtml + '</span></div>';

    PB.innerHTML = html;

    currentRenderedRound = roundStr;

    PRED.style.display = 'block';

    PRED.style.borderColor = color2;
    PRED.style.boxShadow = '0 0 16px ' + bgColor2;
    PRED.style.background = bgColor2;

    setTimeout(function () {
      PRED.style.borderColor = 'rgba(255,255,255,0.05)';
      PRED.style.boxShadow = 'none';
      PRED.style.background = 'rgba(44,44,46,0.8)';
    }, 2000);

    MC.style.background = color2;
    MC.style.borderColor = 'rgba(28,28,30,0.9)';

    hidePending();
  }

  // ===== FETCH + PREDICT (Option 1: J0RO first, WTR async) =====
  async function fetchAndPredict() {
    var errFlag = false;
    function fail(source, err) {
      errFlag = true;
      addError(source, err);
    }

    try {
      // --- fetch history ---
      var res;
      try {
        res = await fetch(PROXY_HISTORY + '&t=' + Date.now(), { cache: 'no-store' });
      } catch (e) {
        fail('History Proxy (network)', e.message || e);
        hidePending();
        return;
      }
      if (!res.ok) {
        fail('History Proxy', 'HTTP ' + res.status);
        hidePending();
        return;
      }

      var json;
      try {
        json = await res.json();
      } catch (e) {
        fail('History Proxy (parse)', e.message || e);
        hidePending();
        return;
      }

      if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
        fail('History Proxy', 'invalid response (no data)');
        hidePending();
        return;
      }

      var numbers = json.data.map(function (r) { return Number(r.number); }).reverse();

      if (numbers.length < NUMBERS_NEEDED) {
        fail('History Proxy', 'insufficient data ' + numbers.length + '/' + NUMBERS_NEEDED);
        hidePending();
        return;
      }

      var trimmed = numbers.slice(-NUMBERS_NEEDED);
      var latestRound = json.data[0].issueNumber;
      var nextRound = String(BigInt(latestRound) + 1n);
      lastRoundKnown = nextRound;

      if (window.__wrLastRound === nextRound) {
        hidePending();
        return;
      }

      showPending(nextRound);

      var payload = JSON.stringify({ numbers: trimmed });

      // ===== Fire BOTH, but DON'T await WTR =====
      var wtrPromise = fetch(API_1 + '/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject('HTTP ' + r.status); })
        .catch(function (e) { return { error: e.toString ? e.toString() : String(e) }; });

      // ===== Await J0RO FIRST =====
      var j0roRes;
      try {
        var r2 = await fetch(API_2 + '/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        if (!r2.ok) throw new Error('HTTP ' + r2.status);
        j0roRes = await r2.json();
      } catch (e) {
        fail('J0RO API', e.message || e.toString() || String(e));
        hidePending();
        // still capture WTR errors silently in background
        wtrPromise.then(function (wtr) {
          if (wtr.error) addError('WTR API (optional)', wtr.error);
        });
        return;
      }

      if (!j0roRes || !j0roRes.prediction) {
        fail('J0RO API', 'invalid response');
        hidePending();
        wtrPromise.then(function (wtr) {
          if (wtr.error) addError('WTR API (optional)', wtr.error);
        });
        return;
      }

      // ===== Render J0RO immediately (no badge yet) =====
      window.__wrLastRound = nextRound;
      renderPrediction(null, j0roRes, nextRound);

      // ===== WTR arrives later → inject badge if it matches =====
      wtrPromise.then(function (wtr) {
        if (wtr.error) {
          addError('WTR API (optional)', wtr.error);
          return;
        }
        // ignore stale round results
        if (currentRenderedRound !== nextRound) return;
        var wtrPred = (wtr.prediction || '').toLowerCase();
        var j0roPred = (j0roRes.prediction || '').toLowerCase();
        if ((wtrPred === 'big' || wtrPred === 'small') && wtrPred === j0roPred) {
          updateBadge(true);
        }
      });

    } catch (e) {
      if (!errFlag) fail('Unexpected', e.message || e);
      hidePending();
    }
  }

  // ===== FIRE /RUN =====
  async function fire() {
    showPending(false);

    try {
      var res = await fetch(PROXY_RUN, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json, text/plain, */*' }
      });

      var text = await res.text();
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (e) {}

      var ok = parsed && parsed.ok === true;

      if (!ok) {
        addError('/run', 'HTTP ' + res.status + ' · ' + (parsed ? 'not ok' : 'invalid response'));
      }

      await new Promise(function (r) { setTimeout(r, 3000); });

      await fetchAndPredict();
    } catch (e) {
      addError('/run (network)', e.message || e);
      hidePending();
    } finally {
      window.__wrT = setTimeout(fire, nD());
    }
  }

  // ===== INIT =====
  window.__wrP = p;
  sCd();

  fire();
})();