(function () {
  'use strict';

  var API = 'https://wingo-predict-tg.onrender.com';
  var U = 'https://wingoproxy.shekhawatsarita85.workers.dev/run';
  var IMG = 'https://github.jssoriginals.com/logo.png';
  var FONT_URL = 'https://github.jssoriginals.com/_next/static/media/cbcb737ef097dac1-s.p.woff2';

  if (window.__wrP) window.__wrP.remove();
  if (window.__wrT) clearTimeout(window.__wrT);
  if (window.__wrC) clearInterval(window.__wrC);
  if (window.__wrL) clearTimeout(window.__wrL);
  if (window.__wrF) window.__wrF.remove();
  window.__wrLastRound = null;

  // Inject custom font
  var fstyle = document.createElement('style');
  fstyle.id = '__wrF';
  fstyle.textContent = "@font-face{font-family:'WinGoFont';src:url('" + FONT_URL + "') format('woff2');font-weight:100 900;font-style:normal;font-display:swap;}";
  document.head.appendChild(fstyle);

  var p = document.createElement('div');
  p.id = '__wrP';
  p.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','WinGoFont',sans-serif;";
  
  p.innerHTML = [
    '<div id="__wrExp" style="width:320px;background:rgba(28,28,30,0.85);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);color:#ffffff;font-size:13px;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transition:all 0.3s ease">',
    
    // Header
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08)">',
    '<div style="display:flex;align-items:center;gap:10px">',
    '<img src="' + IMG + '" alt="" style="width:20px;height:20px;object-fit:contain;pointer-events:none;user-select:none;border-radius:4px">',
    '<strong style="font-size:15px;font-weight:600;letter-spacing:-0.3px">WinGo 30s</strong>',
    '</div>',
    '<button id="__wrMin" title="Collapse" style="background:rgba(255,255,255,0.15);color:#ffffff;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;transition:background 0.2s">—</button>',
    '</div>',
    
    // Body
    '<div style="padding:16px">',
    
    // Prediction Card
    '<div id="__wrPred" style="background:rgba(44,44,46,0.8);border-radius:16px;padding:16px 12px;margin-bottom:14px;border:1px solid rgba(255,255,255,0.05);transition:border-color 0.3s,box-shadow 0.3s">',
    '<div id="__wrPredBody" style="font-size:12px;color:rgba(235,235,245,0.5);text-align:center;font-weight:500">Waiting for first prediction...</div>',
    '</div>',
    
    // Pending Status
    '<div id="__wrPending" style="display:none;font-size:11px;color:#FF9F0A;text-align:center;margin-bottom:12px;font-weight:600">⏳ Awaiting new prediction...</div>',
    
    // Next Prediction Row
    '<div style="margin-bottom:16px">',
    '<div style="color:rgba(235,235,245,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:2px">Next Prediction</div>',
    '<div style="display:flex;justify-content:space-between;align-items:center">',
    '<div id="__wrN" style="font-size:24px;font-weight:600;color:#0A84FF;letter-spacing:-0.5px">—</div>',
    '<button id="__wrLogBtn" title="Toggle Log" style="background:rgba(255,255,255,0.1);color:#ffffff;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:13px;line-height:1;transition:background 0.2s">📋</button>',
    '</div>',
    '</div>',
    
    // Last Prediction Row
    '<div style="margin-bottom:4px">',
    '<div style="color:rgba(235,235,245,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:2px">Last Prediction</div>',
    '<div id="__wrL" style="font-size:13px;color:rgba(235,235,245,0.9);font-weight:500">Not yet</div>',
    '</div>',
    
    // Log Area
    '<div id="__wrLogWrap" style="display:none;margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px">',
    '<div style="color:rgba(235,235,245,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:6px">Log</div>',
    '<div id="__wrG" style="background:rgba(0,0,0,0.3);border-radius:10px;padding:8px;max-height:120px;overflow-y:auto;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;line-height:1.6"></div>',
    '</div>',
    
    '</div>',
    '</div>',
    
    // Mini FAB
    '<div id="__wrMini" style="display:none">',
    '<button id="__wrExpBtn" title="Expand" style="background:rgba(28,28,30,0.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);border-radius:50%;width:56px;height:56px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:0;position:relative;transition:transform 0.2s">',
    '<img src="' + IMG + '" alt="" style="width:32px;height:32px;object-fit:contain;pointer-events:none;user-select:none;border-radius:6px">',
    '<span id="__wrMiniCd" style="position:absolute;bottom:-4px;right:-4px;background:#FF3B30;color:#ffffff;font-size:10px;font-weight:600;border-radius:12px;padding:2px 6px;border:2px solid rgba(28,28,30,0.9);min-width:24px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)">—</span>',
    '</button>',
    '</div>'
  ].join('');
  
  document.body.appendChild(p);

  var N = p.querySelector('#__wrN'),
      L = p.querySelector('#__wrL'),
      G = p.querySelector('#__wrG'),
      EXP = p.querySelector('#__wrExp'),
      MIN = p.querySelector('#__wrMini'),
      MC = p.querySelector('#__wrMiniCd'),
      PRED = p.querySelector('#__wrPred'),
      PB = p.querySelector('#__wrPredBody'),
      PEND = p.querySelector('#__wrPending'),
      LOGWRAP = p.querySelector('#__wrLogWrap'),
      LOGBTN = p.querySelector('#__wrLogBtn');

  var logsVisible = false;
  LOGBTN.onclick = function () {
    logsVisible = !logsVisible;
    LOGWRAP.style.display = logsVisible ? 'block' : 'none';
    LOGBTN.style.background = logsVisible ? '#0A84FF' : 'rgba(255,255,255,0.1)';
    LOGBTN.style.color = logsVisible ? '#ffffff' : '#ffffff';
  };

  p.querySelector('#__wrMin').onclick = function () {
    EXP.style.display = 'none';
    MIN.style.display = 'block';
  };

  // --- Draggable FAB Logic Start ---
  var tx = 0, ty = 0;
  var isDraggingMini = false;
  var dragStartX = 0, dragStartY = 0;
  var dragMoved = false;
  var expBtn = p.querySelector('#__wrExpBtn');

  expBtn.onclick = function (e) {
    if (dragMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    MIN.style.display = 'none';
    EXP.style.display = 'block';

    requestAnimationFrame(function () {
      var r = p.getBoundingClientRect();
      var pad = 8;
      var adjX = 0, adjY = 0;

      if (r.left < pad)                            adjX = pad - r.left;
      else if (r.right > window.innerWidth - pad)  adjX = (window.innerWidth - pad) - r.right;

      if (r.top < pad)                             adjY = pad - r.top;
      else if (r.bottom > window.innerHeight - pad) adjY = (window.innerHeight - pad) - r.bottom;

      if (adjX || adjY) {
        tx += adjX;
        ty += adjY;
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
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartX = clientX;
    dragStartY = clientY;
  }

  document.addEventListener('mousemove', onMiniMove);
  document.addEventListener('touchmove', onMiniMove, { passive: false });

  function onMiniMove(e) {
    if (!isDraggingMini) return;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;

    var dx = clientX - dragStartX;
    var dy = clientY - dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragMoved = true;
    }

    if (dragMoved) {
      if (e.cancelable) e.preventDefault();

      var rect = p.getBoundingClientRect();
      var newTx = tx + dx;
      var newTy = ty + dy;

      if (rect.left + dx < 0) newTx = tx - rect.left;
      if (rect.right + dx > window.innerWidth) newTx = tx + (window.innerWidth - rect.right);
      if (rect.top + dy < 0) newTy = ty - rect.top;
      if (rect.bottom + dy > window.innerHeight) newTy = ty + (window.innerHeight - rect.bottom);

      tx = newTx;
      ty = newTy;
      p.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';

      dragStartX = clientX;
      dragStartY = clientY;
    }
  }

  document.addEventListener('mouseup', onMiniUp);
  document.addEventListener('touchend', onMiniUp);

  function onMiniUp() {
    if (!isDraggingMini) return;
    isDraggingMini = false;
  }
  // --- Draggable FAB Logic End ---

  function pad(n) { return ('0' + n).slice(-2); }
  function fmt(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

  function log(m, c) {
    var l = document.createElement('div');
    l.style.color = c || 'rgba(235,235,245,0.7)';
    l.style.marginBottom = '4px';
    l.textContent = m;
    G.prepend(l);
    while (G.children.length > 20) G.removeChild(G.lastChild);
  }

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

  function renderPrediction(d) {
    var pred = (d.prediction || '').toLowerCase();
    var isBig = pred === 'big';
    
    // iOS Colors
    var color = isBig ? '#FF453A' : '#30D158'; 
    var bgColor = isBig ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)';
    var label = isBig ? 'BIG' : 'SMALL';
    
    var conf = ((d.confidence || 0) * 100).toFixed(1);
    var pS = ((d.probabilities && d.probabilities.small) || 0) * 100;
    var pB = ((d.probabilities && d.probabilities.big) || 0) * 100;
    var chance = isBig ? pB : pS;
    var roundFull = String(d.round);
    
    PB.innerHTML =
      '<div style="font-size:13px;color:rgba(235,235,245,0.6);text-align:center;margin-bottom:6px;letter-spacing:0.3px;font-weight:500">' + roundFull + '</div>' +
      '<div style="font-size:34px;font-weight:700;color:' + color + ';text-align:center;letter-spacing:2px;margin-bottom:8px;text-shadow:0 2px 10px ' + bgColor + '">' + label + '</div>' +
      '<div style="font-size:13px;color:rgba(235,235,245,0.6);text-align:center;font-weight:500">Probability: <span style="color:' + color + ';font-weight:700">' + chance.toFixed(1) + '%</span></div>';
    
    PRED.style.borderColor = color;
    PRED.style.boxShadow = '0 0 16px ' + bgColor;
    PRED.style.background = bgColor;
    
    setTimeout(function () {
      PRED.style.borderColor = 'rgba(255,255,255,0.05)';
      PRED.style.boxShadow = 'none';
      PRED.style.background = 'rgba(44,44,46,0.8)';
    }, 2000);
    
    MC.style.background = color;
    MC.style.borderColor = 'rgba(28,28,30,0.9)';
    
    PEND.style.display = 'none';
    log('🎯 ' + label + ' ' + conf + '% (round …' + roundFull.slice(-6) + ')', color);
  }

  function fetchLatest(quiet) {
    return fetch(API + '/latest', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.round) {
          if (!quiet) log('⚠ no prediction yet', 'rgba(235,235,245,0.5)');
          return null;
        }
        if (window.__wrLastRound === d.round) return d;
        window.__wrLastRound = d.round;
        renderPrediction(d);
        return d;
      })
      .catch(function (e) {
        if (!quiet) log('⚠ /latest fail: ' + e.message, '#FF453A');
        return null;
      });
  }

  function nextPollDelay() {
    var s = new Date().getSeconds();
    if ((s >= 4 && s <= 15) || (s >= 34 && s <= 45)) return 2000;
    return 10000;
  }

  function pollLoop() {
    fetchLatest(true).finally(function () {
      window.__wrL = setTimeout(pollLoop, nextPollDelay());
    });
  }

  function fire() {
    log('▶ ' + fmt(new Date()) + ' firing /run', '#0A84FF');
    PEND.style.display = 'block';
    fetch(U, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain, */*' }
    })
      .then(function (r) {
        return r.text().then(function (b) {
          return { status: r.status, body: b };
        });
      })
      .then(function (res) {
        var parsed;
        try { parsed = JSON.parse(res.body); } catch (e) {}
        var ok = parsed && parsed.ok === true;
        var summary = ok
          ? 'saved=' + (parsed.saved || 0) + ' fetched=' + (parsed.fetched || 0) + ' total=' + (parsed.total_in_db || 0)
          : 'err=' + ((parsed && (parsed.error || parsed.fetch_error)) || 'unknown');
        
        L.innerHTML = fmt(new Date()) + ' · <span style="color:' + (ok ? '#30D158' : '#FF453A') + '">' + res.status + ' ' + (ok ? 'OK' : 'FAIL') + '</span>';
        log((ok ? '✓ ' : '✗ ') + fmt(new Date()) + ' ' + res.status + ' ' + summary, ok ? '#30D158' : '#FF453A');
        if (!ok) PEND.style.display = 'none';
      })
      .catch(function (e) {
        L.innerHTML = fmt(new Date()) + ' · <span style="color:#FF453A">NETERR</span>';
        log('✗ ' + fmt(new Date()) + ' ' + e.message, '#FF453A');
        PEND.style.display = 'none';
      })
      .finally(function () {
        var d = nD();
        log('⏲ next /run in ' + (d / 1000).toFixed(1) + 's', 'rgba(235,235,245,0.5)');
        window.__wrT = setTimeout(fire, d);
      });
  }

  window.__wrP = p;
  sCd();
  log('🚀 Auto-runner started', '#FF9F0A');
  log('Targets: :00 and :30 every minute', 'rgba(235,235,245,0.5)');
  log('API: ' + API, 'rgba(235,235,245,0.5)');
  fetchLatest(true);
  pollLoop();
  var fd = nD();
  log('⏲ first /run in ' + (fd / 1000).toFixed(1) + 's', 'rgba(235,235,245,0.5)');
  window.__wrT = setTimeout(fire, fd);
})();