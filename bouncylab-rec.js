/**
 * BouncyLab Recording Bookmarklet
 * Records canvas + your custom escape sound ONLY (BouncyLab's own audio is muted).
 * Loaded via jsDelivr from GitHub.
 *
 * Usage: click bookmarklet → panel appears → ▶ Start
 * Click bookmarklet again while panel is visible → panel hides (sounds keep working).
 * Reload page to fully uninstall.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var MP3_URL = 'https://pdftoimgjss.vercel.app/sound.mp3';
  var TAG = '[BH v' + VERSION + ']';
  var PANEL_ID = '__recPanel';

  // ---------- Toggle / re-show ----------
  if (window.__bhActive) {
    if (window.__bhActive.isRecording) {
      alert('Recording chal rahi hai — pehle stop hone do.');
      return;
    }
    var existing = document.getElementById(PANEL_ID);
    if (existing) { existing.remove(); return; }
    window.__bhActive.showPanel();
    return;
  }

  // ---------- Preconditions ----------
  var canvas = document.querySelector('canvas');
  if (!canvas) {
    alert('BouncyLab canvas nahi mila.\n\nPehle BouncyLab page kholo.');
    return;
  }

  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { alert('Web Audio API supported nahi hai'); return; }

  // ---------- Audio graph ----------
  var ctx = new AC();
  var streamDest = ctx.createMediaStreamDestination();
  var outGain = ctx.createGain();
  outGain.gain.value = 0.9;
  outGain.connect(ctx.destination);

  // ---------- State ----------
  var state = {
    version: VERSION,
    ctx: ctx,
    streamDest: streamDest,
    outGain: outGain,
    buffer: null,
    observer: null,
    isRecording: false,
    showPanel: null,
    teardown: null
  };
  window.__bhActive = state;

  // ---------- Load MP3 ----------
  fetch(MP3_URL, { mode: 'cors' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then(function (ab) { return ctx.decodeAudioData(ab); })
    .then(function (buf) {
      state.buffer = buf;
      console.log(TAG, 'MP3 buffer loaded (' + buf.duration.toFixed(2) + 's)');
    })
    .catch(function (err) {
      console.warn(TAG, 'MP3 load failed', err);
    });

  // ---------- Mute BouncyLab's own audio ----------
  var origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest) {
    try {
      if (dest && dest.context && dest.context !== ctx) {
        var ctor = dest.constructor && dest.constructor.name;
        if (ctor === 'AudioDestinationNode') {
          var cc = dest.context;
          if (!cc.__bhSilent) {
            cc.__bhSilent = cc.createGain();
            cc.__bhSilent.gain.value = 0;
          }
          return origConnect.apply(this, [cc.__bhSilent].concat([].slice.call(arguments, 1)));
        }
      }
    } catch (e) {}
    return origConnect.apply(this, arguments);
  };
  console.log(TAG, 'BouncyLab audio muted');

  // ---------- Playback (overlapping) ----------
  function playBufferSound(delayMs) {
    setTimeout(function () {
      if (!state.buffer) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        var src = ctx.createBufferSource();
        src.buffer = state.buffer;
        src.connect(outGain);
        src.connect(streamDest);
        src.start(0);
      } catch (e) {
        console.warn(TAG, 'playBufferSound', e);
      }
    }, delayMs || 0);
  }

  // ---------- Escape detection ----------
  function readEscapes() {
    var m = document.body.textContent.match(/Total escapes\s*(\d+)/);
    return m ? +m[1] : null;
  }
  var lastVal = readEscapes();

  state.observer = new MutationObserver(function () {
    var v = readEscapes();
    if (v === null) return;
    if (lastVal !== null && v > lastVal) {
      var n = v - lastVal;
      for (var i = 0; i < n; i++) playBufferSound(i * 35);
    }
    lastVal = v;
  });
  state.observer.observe(document.body, { subtree: true, childList: true, characterData: true });

  if (lastVal === null) {
    console.warn(TAG, '"Total escapes" counter nahi mila — "Duplicate Balls" tab select karo');
  } else {
    console.log(TAG, 'escape sound active, initial=' + lastVal);
  }

  // ---------- Panel ----------
  function showPanel() {
    if (document.getElementById(PANEL_ID)) return;

    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = [
      'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
      'background:#131340', 'color:#e4e4e7', 'padding:12px 16px',
      'border-radius:12px', 'border:1px solid #27272a',
      'font:600 13px ui-monospace,monospace', 'z-index:2147483647',
      'box-shadow:0 8px 32px rgba(0,0,0,.6)', 'display:flex',
      'gap:8px', 'align-items:center', 'flex-wrap:wrap', 'max-width:92vw'
    ].join(';');

    p.innerHTML =
      '<span style="color:#a1a1aa">Sec</span>' +
      '<input id="__recDur" type="number" min="1" max="600" value="30" ' +
      'style="width:56px;padding:6px 8px;background:#0a0a28;color:#c8ff3d;' +
      'border:1px solid #27272a;border-radius:6px;font:600 13px ui-monospace,monospace;text-align:center">' +
      '<button id="__recStart" style="padding:8px 16px;background:#c8ff3d;color:#0a0a28;' +
      'border:none;border-radius:8px;font:700 13px ui-monospace,monospace;cursor:pointer">▶ Start</button>' +
      '<button id="__recClose" style="padding:6px 10px;background:transparent;color:#71717a;' +
      'border:1px solid #27272a;border-radius:6px;font:700 13px monospace;cursor:pointer">✕</button>';

    document.body.appendChild(p);

    document.getElementById('__recClose').onclick = function () { p.remove(); };

    document.getElementById('__recStart').onclick = async function () {
      var btn = this;
      var dur = Math.max(1, Math.min(600,
        parseInt(document.getElementById('__recDur').value, 10) || 30));

      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (e) {}
      }

      if (!state.buffer) {
        btn.disabled = true;
        btn.textContent = '⏳ Loading...';
        var t0 = Date.now();
        while (!state.buffer && Date.now() - t0 < 5000) {
          await new Promise(function (r) { setTimeout(r, 100); });
        }
        if (!state.buffer) {
          btn.disabled = false;
          btn.textContent = '▶ Start';
          alert('MP3 load nahi hua.\n\nCheck:\n1. Internet\n2. CORS (console dekho)\n3. Dobara click karo');
          return;
        }
      }

      btn.disabled = true;
      state.isRecording = true;
      btn.textContent = '🔴 Recording...';

      var cs = canvas.captureStream(60);
      var combined = new MediaStream();
      cs.getVideoTracks().forEach(function (t) { combined.addTrack(t); });
      streamDest.stream.getAudioTracks().forEach(function (t) { combined.addTrack(t); });

      var mime = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ].find(function (m) { return MediaRecorder.isTypeSupported(m); });

      if (!mime) {
        state.isRecording = false;
        btn.disabled = false;
        btn.textContent = '▶ Start';
        alert('WebM recording supported nahi hai');
        return;
      }

      var chunks = [];
      var rec = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: 1e7,
        audioBitsPerSecond: 128e3
      });

      rec.ondataavailable = function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      };

      rec.onstop = function () {
        var blob = new Blob(chunks, { type: mime.split(';')[0] });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bouncylab-' + Date.now() + '.webm';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

        cs.getTracks().forEach(function (t) { t.stop(); });
        state.isRecording = false;
        btn.textContent = '✅ ' + (blob.size / 1048576).toFixed(2) + ' MB';
        setTimeout(function () {
          btn.disabled = false;
          btn.textContent = '▶ Start';
        }, 3000);
      };

      var left = dur;
      btn.textContent = '🔴 ' + left + 's';
      rec.start();
      var iv = setInterval(function () {
        left--;
        if (left > 0) btn.textContent = '🔴 ' + left + 's';
      }, 1000);
      setTimeout(function () {
        clearInterval(iv);
        rec.stop();
        btn.textContent = '⏹ Saving...';
      }, dur * 1000);
    };
  }

  state.showPanel = showPanel;

  // ---------- Teardown (reload page to call this from console) ----------
  state.teardown = function () {
    try { state.observer && state.observer.disconnect(); } catch (e) {}
    try { AudioNode.prototype.connect = origConnect; } catch (e) {}
    try { ctx.close(); } catch (e) {}
    var p = document.getElementById(PANEL_ID);
    if (p) p.remove();
    window.__bhActive = null;
    console.log(TAG, 'uninstalled');
  };

  // ---------- Boot ----------
  showPanel();
  console.log(TAG, 'installed');
})();