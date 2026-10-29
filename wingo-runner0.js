(function () {
  'use strict';

  var HIST = 'https://wingoproxy.shekhawatsarita85.workers.dev/api/history?limit=20';
  var U = 'https://wingoproxy.shekhawatsarita85.workers.dev/run';

  // Cleanup
  if (window.__wrP) window.__wrP.remove();
  if (window.__wrT) clearTimeout(window.__wrT);
  if (window.__wrC) clearInterval(window.__wrC);
  if (window.__wrL) clearTimeout(window.__wrL);
  window.__wrLastIssue = null;

  var p = document.createElement('div');
  p.id = '__wrP';
  p.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
  p.innerHTML = [
    '<div id="__wrExp" style="width:310px;background:#1e293b;color:#e2e8f0;font-size:12px;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.5);border:1px solid #334155;overflow:hidden">',
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#0f172a;border-bottom:1px solid #334155">',
    '<strong style="font-size:13px;color:#f1f5f9">⚡ WinGo Auto-Runner</strong>',
    '<button id="__wrMin" title="Collapse" style="background:#475569;color:#fff;border:none;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:13px;line-height:1">—</button>',
    '</div>',
    '<div style="padding:12px">',
    '<div id="__wrPred" style="background:#0f172a;border-radius:8px;padding:10px;margin-bottom:10px;border:1px solid #334155;transition:border-color .3s,box-shadow .3s">',
    '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">🎯 Prediction</div>',
    '<div id="__wrPredBody" style="font-size:11px;color:#64748b;margin-top:4px">Waiting for first prediction...</div>',
    '</div>',
    '<div id="__wrPending" style="display:none;font-size:10px;color:#fbbf24;text-align:center;margin-bottom:8px">⏳ Waiting for new round...</div>',
    '<div style="margin-bottom:8px">',
    '<div style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Next Run</div>',
    '<div id="__wrN" style="font-size:20px;font-weight:700;color:#38bdf8">—</div>',
    '</div>',
    '<div style="margin-bottom:8px">',
    '<div style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Last /run</div>',
    '<div id="__wrL" style="font-size:12px">Not yet</div>',
    '</div>',
    '<div>',
    '<div style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Log</div>',
    '<div id="__wrG" style="background:#0f172a;border-radius:6px;padding:6px;max-height:120px;overflow-y:auto;font-family:monospace;font-size:10px;color:#cbd5e1;line-height:1.5"></div>',
    '</div>',
    '</div>',
    '</div>',
    '<div id="__wrMini" style="display:none">',
    '<button id="__wrExpBtn" title="Expand" style="background:#1e293b;border:1px solid #334155;border-radius:50%;width:52px;height:52px;cursor:pointer;box-shadow:0 8px 32px rgba(0,0,0,.5);color:#38bdf8;font-size:22px;display:flex;align-items:center;justify-content:center;padding:0;position:relative">',
    '<span>⚡</span>',
    '<span id="__wrMiniCd" style="position:absolute;bottom:-2px;right:-2px;background:#0f172a;color:#38bdf8;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px;border:1px solid #334155;min-width:22px;text-align:center">—</span>',
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
      PEND = p.querySelector('#__wrPending');

  p.querySelector('#__wrMin').onclick = function () {
    EXP.style.display = 'none';
    MIN.style.display = 'block';
  };
  p.querySelector('#__wrExpBtn').onclick = function () {
    MIN.style.display = 'none';
    EXP.style.display = 'block';
  };

  function pad(n) { return ('0' + n).slice(-2); }
  function fmt(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

  function log(m, c) {
    var l = document.createElement('div');
    l.style.color = c || '#cbd5e1';
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

  // ---------- Prediction logic ----------
  function normColor(c) {
    c = String(c || '').toLowerCase();
    if (c.includes('red')) return 'Red';
    if (c.includes('green')) return 'Green';
    return null;
  }

  function topWinner(counts) {
    var entries = Object.entries(counts);
    if (!entries.length) return { winner: null, tie: false };
    var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }));
    var winners = entries.filter(function (e) { return e[1] === max; }).map(function (e) { return e[0]; });
    return { winner: winners.length === 1 ? winners[0] : null, tie: winners.length > 1 };
  }

  function pickFinal(t1, t2) {
    if (t1.winner && t2 && t1.winner === t2) return t1.winner;
    if (t1.winner && !t2) return t1.winner;
    if (!t1.winner && t2) return t2;
    return null;
  }

  function computePrediction(rounds) {
    if (!rounds || rounds.length < 5) return null;

    // Try-1: size & color frequency
    var sizeCounts = {}, colorCounts = {};
    rounds.forEach(function (r) {
      if (r.size) sizeCounts[r.size] = (sizeCounts[r.size] || 0) + 1;
      var c = normColor(r.color);
      if (c) colorCounts[c] = (colorCounts[c] || 0) + 1;
    });
    var size1 = topWinner(sizeCounts);
    var color1 = topWinner(colorCounts);

    // Try-2: most repeated number → its size & color
    var numCounts = {};
    rounds.forEach(function (r) {
      var n = String(r.number);
      numCounts[n] = (numCounts[n] || 0) + 1;
    });
    var numEntries = Object.entries(numCounts);
    var maxNum = Math.max.apply(null, numEntries.map(function (e) { return e[1]; }));
    var topNums = numEntries.filter(function (e) { return e[1] === maxNum; }).map(function (e) { return e[0]; });

    var try2Size = null, try2Color = null;
    if (topNums.length === 1) {
      var r0 = rounds.find(function (x) { return String(x.number) === topNums[0]; });
      if (r0) { try2Size = r0.size; try2Color = normColor(r0.color); }
    } else {
      var tied = topNums.map(function (n) {
        return rounds.find(function (r) { return String(r.number) === n; });
      }).filter(Boolean);
      var sizeSet = new Set(tied.map(function (r) { return r.size; }).filter(Boolean));
      var colorSet = new Set(tied.map(function (r) { return normColor(r.color); }).filter(Boolean));
      if (sizeSet.size === 1) try2Size = Array.from(sizeSet)[0];
      if (colorSet.size === 1) try2Color = Array.from(colorSet)[0];
    }

    // Final = common
    var finalSize = pickFinal(size1, try2Size);
    var finalColor = pickFinal(color1, try2Color);

    // Next round = latest issue + 1
    var latest = rounds[0].issueNumber;
    var nextRound;
    try { nextRound = (BigInt(latest) + 1n).toString(); }
    catch (e) { nextRound = latest; }

    return { nextRound: nextRound, finalSize: finalSize, finalColor: finalColor };
  }

  function renderPrediction(pred) {
    if (!pred) return;

    var sizeHtml;
    if (pred.finalSize) {
      var isBig = pred.finalSize.toLowerCase() === 'big';
      var sc = isBig ? '#ef4444' : '#10b981';
      sizeHtml = '<span style="color:' + sc + ';font-weight:700">' + pred.finalSize.toUpperCase() + '</span>';
    } else {
      sizeHtml = '<span style="color:#fbbf24;font-weight:700">CONFLICT</span>';
    }

    var colorHtml;
    if (pred.finalColor) {
      var isRed = pred.finalColor.toLowerCase() === 'red';
      var cc = isRed ? '#ef4444' : '#10b981';
      colorHtml = '<span style="color:' + cc + ';font-weight:700">' + pred.finalColor.toUpperCase() + '</span>';
    } else {
      colorHtml = '<span style="color:#fbbf24;font-weight:700">CONFLICT</span>';
    }

    PB.innerHTML =
      '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px">Round: ' +
        '<span style="color:#cbd5e1;font-family:monospace">' + pred.nextRound + '</span></div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:4px">Size: ' + sizeHtml + '</div>' +
      '<div style="font-size:13px;color:#94a3b8">Color: ' + colorHtml + '</div>';

    var borderCol = pred.finalSize
      ? (pred.finalSize.toLowerCase() === 'big' ? '#ef4444' : '#10b981')
      : '#fbbf24';
    PRED.style.borderColor = borderCol;
    PRED.style.boxShadow = '0 0 12px ' + borderCol + '66';
    setTimeout(function () {
      PRED.style.borderColor = '#334155';
      PRED.style.boxShadow = 'none';
    }, 1500);

    log('🎯 Round ' + pred.nextRound + ' → ' +
        (pred.finalSize || '?').toUpperCase() + ' / ' +
        (pred.finalColor || '?').toUpperCase(), '#38bdf8');
  }

  async function fetchHistory() {
    try {
      var r = await fetch(HIST, { cache: 'no-store' });
      var j = await r.json();
      if (!j || !j.success || !Array.isArray(j.data) || !j.data.length) return null;
      return j.data;
    } catch (e) {
      log('⚠ history: ' + e.message, '#ef4444');
      return null;
    }
  }

  async function computeAndRender(force) {
    var rounds = await fetchHistory();
    if (!rounds) return null;
    var currentIssue = rounds[0].issueNumber;
    if (!force && window.__wrLastIssue === currentIssue) return null;
    window.__wrLastIssue = currentIssue;
    var pred = computePrediction(rounds);
    if (pred) renderPrediction(pred);
    return pred;
  }

  async function pollForNewData(maxTries, interval) {
    for (var i = 0; i < maxTries; i++) {
      await new Promise(function (res) { setTimeout(res, interval); });
      var pred = await computeAndRender(false);
      if (pred) {
        PEND.style.display = 'none';
        return;
      }
    }
    PEND.style.display = 'none';
    log('⚠ no new round after /run', '#fbbf24');
  }

  function fire() {
    log('▶ ' + fmt(new Date()) + ' firing /run', '#38bdf8');
    PEND.style.display = 'block';
    fetch(U, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json, text/plain, */*' } })
      .then(function (r) {
        return r.text().then(function (b) { return { status: r.status, body: b }; });
      })
      .then(function (res) {
        var parsed;
        try { parsed = JSON.parse(res.body); } catch (e) {}
        var ok = parsed && parsed.ok === true;
        var summary = ok
          ? 'saved=' + (parsed.saved || 0) + ' fetched=' + (parsed.fetched || 0) + ' total=' + (parsed.total_in_db || 0)
          : 'err=' + ((parsed && (parsed.error || parsed.fetch_error)) || 'unknown');
        L.innerHTML = fmt(new Date()) + ' · <span style="color:' + (ok ? '#10b981' : '#ef4444') + '">' + res.status + ' ' + (ok ? 'OK' : 'FAIL') + '</span>';
        log((ok ? '✓ ' : '✗ ') + fmt(new Date()) + ' ' + res.status + ' ' + summary, ok ? '#10b981' : '#ef4444');

        if (ok) {
          pollForNewData(6, 1000);
        } else {
          PEND.style.display = 'none';
        }
      })
      .catch(function (e) {
        L.innerHTML = fmt(new Date()) + ' · <span style="color:#ef4444">NETERR</span>';
        log('✗ ' + fmt(new Date()) + ' ' + e.message, '#ef4444');
        PEND.style.display = 'none';
      })
      .finally(function () {
        var d = nD();
        log('⏲ next /run in ' + (d / 1000).toFixed(1) + 's', '#94a3b8');
        window.__wrT = setTimeout(fire, d);
      });
  }

  window.__wrP = p;
  sCd();
  log('🚀 Auto-runner started', '#fbbf24');
  log('Targets: :00 and :30 every minute', '#94a3b8');
  computeAndRender(true);
  var fd = nD();
  log('⏲ first /run in ' + (fd / 1000).toFixed(1) + 's', '#94a3b8');
  window.__wrT = setTimeout(fire, fd);
})();