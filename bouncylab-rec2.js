/**
 * BouncyLab Recording Bookmarklet v1.2.0
 * - Records canvas + custom escape sound only (BouncyLab audio muted)
 * - Custom overlay: @satisfybounce + Balls + Total Escapes (top-center)
 * - A/V sync fixes: fixed 60fps capture, sample-accurate audio scheduling,
 *   silence-buffer priming, VP8 codec priority, small timeslices
 */
(function () {
  'use strict';

  var VERSION = '1.2.0';
  var MP3_URL = 'https://pdftoimgjss.vercel.app/sound.mp3';
  var FONT_URL = 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPb94C_k3HqUtEw.woff2';
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
  if (!canvas) { alert('BouncyLab canvas nahi mila.'); return; }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { alert('Web Audio API supported nahi'); return; }

  // ---------- Font (Space Grotesk) ----------
  if (!document.getElementById('__bh_font')) {
    var st = document.createElement('style');
    st.id = '__bh_font';
    st.textContent = "@font-face{font-family:'SpaceGrotesk';src:url('" + FONT_URL + "') format('woff2');font-weight:400;font-style:normal;font-display:swap;}";
    document.head.appendChild(st);
  }
  try { document.fonts.load('400 40px SpaceGrotesk'); } catch (_) {}

  // ---------- Audio graph (hub pattern) ----------
  var ctx = new AC();
  var hub = ctx.createGain();          // single routing point
  var outGain = ctx.createGain();      // speaker output
  var streamDest = ctx.createMediaStreamDestination();
  outGain.gain.value = 0.9;
  hub.connect(outGain);
  hub.connect(streamDest);
  outGain.connect(ctx.destination);

  // ---------- State ----------
  var state = {
    version: VERSION,
    ctx: ctx,
    streamDest: streamDest,
    outGain: outGain,
    hub: hub,
    buffer: null,
    observer: null,
    isRecording: false,
    overlayOn: true,
    overlayRaf: null,
    overlayInt: null,
    showPanel: null,
    teardown: null,
    toggleOverlay: null
  };
  window.__bhActive = state;

  // ---------- Load MP3 ----------
  fetch(MP3_URL, { mode: 'cors' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(function (ab) { return ctx.decodeAudioData(ab); })
    .then(function (buf) { state.buffer = buf; console.log(TAG, 'MP3 loaded (' + buf.duration.toFixed(2) + 's)'); })
    .catch(function (err) { console.warn(TAG, 'MP3 load failed', err); });

  // ---------- Mute BouncyLab audio ----------
  var origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest) {
    try {
      if (dest && dest.context && dest.context !== ctx) {
        var ctor = dest.constructor && dest.constructor.name;
        if (ctor === 'AudioDestinationNode') {
          var cc = dest.context;
          if (!cc.__bhSilent) { cc.__bhSilent = cc.createGain(); cc.__bhSilent.gain.value = 0; }
          return origConnect.apply(this, [cc.__bhSilent].concat([].slice.call(arguments, 1)));
        }
      }
    } catch (e) {}
    return origConnect.apply(this, arguments);
  };
  console.log(TAG, 'BouncyLab audio muted');

  // ---------- Playback: sample-accurate scheduling ----------
  function playBufferSound(delayMs) {
    if (!state.buffer) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var src = ctx.createBufferSource();
      src.buffer = state.buffer;
      src.connect(hub);                                    // hub → speaker + streamDest
      src.start(ctx.currentTime + ((delayMs || 0) / 1000)); // precise scheduling
    } catch (e) {}
  }

  // ---------- Silence primer (prime audio track at recording start) ----------
  function primeAudioTrack() {
    try {
      var silence = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      var src = ctx.createBufferSource();
      src.buffer = silence;
      src.connect(streamDest);  // ONLY to streamDest (not audible)
      src.start(0);
      console.log(TAG, 'silence primer injected (250ms)');
    } catch (e) {}
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
  if (lastVal === null) console.warn(TAG, '"Total escapes" counter nahi mila');
  else console.log(TAG, 'escape sound active, initial=' + lastVal);

  // ---------- Overlay ----------
  function readStat(label) {
    var spans = document.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].textContent.trim() === label) {
        var n = spans[i].nextElementSibling;
        if (n) return n.textContent.trim();
      }
    }
    return '0';
  }

  function paintOverlay() {
    if (!state.overlayOn) return;
    var c2d = canvas.getContext('2d');
    if (!c2d) return;
    try {
      c2d.save();
      c2d.setTransform(1, 0, 0, 1, 0, 0);
      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';
      c2d.shadowColor = 'rgba(0,0,0,0.9)';
      c2d.shadowBlur = 12;
      c2d.shadowOffsetY = 2;
      c2d.shadowOffsetX = 0;
      c2d.textAlign = 'center';
      c2d.textBaseline = 'top';
      c2d.fillStyle = '#c8ff3d';
      var fs = Math.round(canvas.width * 0.042);
      c2d.font = '400 ' + fs + 'px "SpaceGrotesk", ui-monospace, monospace';
      var gap = Math.round(fs * 1.35);
      var topY = Math.round(canvas.height * 0.03);
      var balls = readStat('Current balls');
      var esc = readStat('Total escapes');
      c2d.fillText('Balls: ' + balls, canvas.width / 2, topY);
      c2d.fillText('Total Escapes: ' + esc, canvas.width / 2, topY + gap);
      c2d.fillText('@satisfybounce', canvas.width / 2, topY + gap * 2);
      c2d.restore();
    } catch (_) {}
  }

  function overlayLoop() {
    if (!state.overlayOn) return;
    paintOverlay();
    state.overlayRaf = requestAnimationFrame(overlayLoop);
  }

  function startOverlay() {
    if (state.overlayOn) return;
    state.overlayOn = true;
    overlayLoop();
    if (!state.overlayInt) state.overlayInt = setInterval(paintOverlay, 8);
  }

  function stopOverlay() {
    state.overlayOn = false;
    if (state.overlayRaf) { cancelAnimationFrame(state.overlayRaf); state.overlayRaf = null; }
    if (state.overlayInt) { clearInterval(state.overlayInt); state.overlayInt = null; }
  }

  state.toggleOverlay = function () {
    if (state.overlayOn) stopOverlay(); else startOverlay();
    return state.overlayOn;
  };

  overlayLoop();
  state.overlayInt = setInterval(paintOverlay, 8);

  // ---------- Panel ----------
  function showPanel() {
    if (document.getElementById(PANEL_ID)) return;

    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#131340;color:#e4e4e7;padding:12px 16px;border-radius:12px;border:1px solid #27272a;font:600 13px ui-monospace,monospace;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.6);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:92vw';
    p.innerHTML =
      '<span style="color:#a1a1aa">Sec</span>' +
      '<input id="__recDur" type="number" min="1" max="600" value="30" style="width:56px;padding:6px 8px;background:#0a0a28;color:#c8ff3d;border:1px solid #27272a;border-radius:6px;font:600 13px ui-monospace,monospace;text-align:center">' +
      '<button id="__recStart" style="padding:8px 16px;background:#c8ff3d;color:#0a0a28;border:none;border-radius:8px;font:700 13px ui-monospace,monospace;cursor:pointer">▶ Start</button>' +
      '<button id="__recOverlay" style="padding:8px 10px;background:transparent;color:#c8ff3d;border:1px solid #27272a;border-radius:6px;font:700 12px monospace;cursor:pointer">Overlay: ON</button>' +
      '<button id="__recClose" style="padding:6px 10px;background:transparent;color:#71717a;border:1px solid #27272a;border-radius:6px;font:700 13px monospace;cursor:pointer">✕</button>';
    document.body.appendChild(p);

    document.getElementById('__recClose').onclick = function () { p.remove(); };

    var overlayBtn = document.getElementById('__recOverlay');
    overlayBtn.onclick = function () {
      var on = state.toggleOverlay();
      overlayBtn.textContent = 'Overlay: ' + (on ? 'ON' : 'OFF');
      overlayBtn.style.color = on ? '#c8ff3d' : '#71717a';
    };

    document.getElementById('__recStart').onclick = async function () {
      var btn = this;
      var dur = Math.max(1, Math.min(600, parseInt(document.getElementById('__recDur').value, 10) || 30));

      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }

      if (!state.buffer) {
        btn.disabled = true; btn.textContent = '⏳ Loading...';
        var t0 = Date.now();
        while (!state.buffer && Date.now() - t0 < 5000) { await new Promise(function (r) { setTimeout(r, 100); }); }
        if (!state.buffer) {
          btn.disabled = false; btn.textContent = '▶ Start';
          alert('MP3 load nahi hua.');
          return;
        }
      }

      btn.disabled = true;
      state.isRecording = true;
      btn.textContent = '🔴 Recording...';

      if (state.overlayInt) { clearInterval(state.overlayInt); state.overlayInt = null; }

      // ✅ FIX 1: fixed 60fps capture (constant framerate)
      var cs = canvas.captureStream(60);

      // ✅ FIX 2: audio track FIRST to combined stream
      var combined = new MediaStream();
      streamDest.stream.getAudioTracks().forEach(function (t) { combined.addTrack(t); });
      cs.getVideoTracks().forEach(function (t) { combined.addTrack(t); });

      // ✅ FIX 3: VP8 first for better A/V sync
      var mime = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm'
      ].find(function (m) { return MediaRecorder.isTypeSupported(m); });

      if (!mime) {
        state.isRecording = false;
        if (state.overlayOn && !state.overlayInt) state.overlayInt = setInterval(paintOverlay, 8);
        btn.disabled = false; btn.textContent = '▶ Start';
        alert('WebM recording supported nahi hai');
        return;
      }

      var chunks = [];
      var rec = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: 20e6,
        audioBitsPerSecond: 128e3
      });

      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

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
        if (state.overlayOn && !state.overlayInt) state.overlayInt = setInterval(paintOverlay, 8);
        btn.textContent = '✅ ' + (blob.size / 1048576).toFixed(2) + ' MB';
        setTimeout(function () { btn.disabled = false; btn.textContent = '▶ Start'; }, 3000);
      };

      var left = dur;
      btn.textContent = '🔴 ' + left + 's';

      // ✅ FIX 4: prime audio track with 250ms silence
      primeAudioTrack();

      // ✅ FIX 5: 100ms timeslices → reliable muxing
      rec.start(100);

      var iv = setInterval(function () { left--; if (left > 0) btn.textContent = '🔴 ' + left + 's'; }, 1000);
      setTimeout(function () {
        clearInterval(iv);
        // ✅ FIX 6: flush last chunks before stop
        try { rec.requestData(); } catch (e) {}
        setTimeout(function () {
          rec.stop();
          btn.textContent = '⏹ Saving...';
        }, 120);
      }, dur * 1000);
    };
  }

  state.showPanel = showPanel;

  // ---------- Teardown ----------
  state.teardown = function () {
    try { state.observer && state.observer.disconnect(); } catch (e) {}
    try { stopOverlay(); } catch (e) {}
    try { AudioNode.prototype.connect = origConnect; } catch (e) {}
    try { ctx.close(); } catch (e) {}
    var p = document.getElementById(PANEL_ID);
    if (p) p.remove();
    window.__bhActive = null;
    console.log(TAG, 'uninstalled');
  };

  showPanel();
  console.log(TAG, 'installed');
})();