/**
 * BouncyLab Recorder — MP4 (H.264 + AAC) with real audio capture
 * ---------------------------------------------------------------
 * Loads via bookmarklet from jsDelivr. Hooks the page's AudioContext
 * so all Web Audio output is captured alongside the canvas video.
 *
 * Usage:
 *   1. Run bookmarklet on BouncyLab page (AudioContext hooks install)
 *   2. If audio not yet playing, click Restart / Randomize on the page
 *   3. Recording auto-starts and downloads when finished
 *   4. Run bookmarklet again while recording to stop early
 *
 * @version 1.0.0
 * @license MIT
 */

(function () {
  'use strict';

  /* ============================================================
   * CONFIG — tweak these values to your liking
   * ============================================================ */
  var CONFIG = {
    durationSeconds: 60,        // Auto-stop after N seconds
    videoBitrate: 8000000,      // 8 Mbps — crisp output
    audioBitrate: 128000,       // 128 kbps AAC/Opus
    fps: 30,                    // Frames per second
    waitForAudioTimeoutMs: 60000,
    pollIntervalMs: 250,
    mimeCandidates: [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4;codecs="avc1.4D401F,mp4a.40.2"',
      'video/mp4;codecs="avc1.640028,mp4a.40.2"',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ]
  };

  /* ============================================================
   * STATE — persists across bookmarklet re-injection
   * ============================================================ */
  var S = (window.__bouncyRecorder = window.__bouncyRecorder || {
    version: '1.0.0',
    recorder: null,
    capturedCtx: null,
    capturedDest: null,
    readyCallbacks: [],
    hooksInstalled: false,
    ui: null,
    pollHandle: null,
    timeoutHandle: null,
    starting: false
  });

  /* ============================================================
   * TOGGLE — run again while recording → stop
   * ============================================================ */
  if (S.recorder && S.recorder.state === 'recording') {
    try {
      S.recorder.stop();
    } catch (err) {
      console.warn('[BB] stop failed', err);
    }
    return;
  }

  if (S.starting) {
    console.log('[BB] Recorder already initializing');
    return;
  }
  S.starting = true;

  /* ============================================================
   * HELPERS
   * ============================================================ */
  function log() {
    try {
      console.log.apply(console, ['[BB]'].concat(Array.prototype.slice.call(arguments)));
    } catch (_) {}
  }

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (var i = 0; i < CONFIG.mimeCandidates.length; i++) {
      var m = CONFIG.mimeCandidates[i];
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch (_) {}
    }
    return null;
  }

  function notifyReady() {
    var cbs = S.readyCallbacks;
    S.readyCallbacks = [];
    cbs.forEach(function (fn) {
      try { fn(); } catch (e) { log('ready cb err', e); }
    });
  }

  /* ============================================================
   * UI — overlay + recording badge
   * ============================================================ */
  function showOverlay(html) {
    if (S.ui && S.ui.kind === 'overlay') return;
    removeUI();
    var el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'background:#111', 'color:#fff',
      'padding:14px 22px', 'border-radius:12px',
      'font:600 13px system-ui,sans-serif',
      'box-shadow:0 8px 32px rgba(0,0,0,.6)',
      'text-align:center', 'max-width:90vw', 'line-height:1.6'
    ].join(';');
    el.innerHTML = html;
    document.body.appendChild(el);
    S.ui = { el: el, kind: 'overlay' };
  }

  function showBadge(isMP4) {
    removeUI();
    var badge = document.createElement('div');
    var bg = isMP4 ? '#c8ff3d' : '#ff5c5c';
    badge.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647',
      'background:' + bg, 'color:#0a0a28',
      'padding:10px 16px', 'border-radius:8px',
      'font:700 14px system-ui,sans-serif',
      'cursor:pointer', 'box-shadow:0 6px 20px rgba(0,0,0,.5)',
      'user-select:none'
    ].join(';');

    var sec = CONFIG.durationSeconds;
    function update() {
      badge.textContent = '⏺ ' + (isMP4 ? 'MP4' : 'WebM') + ' + 🔊 ' + sec + 's — click to stop';
    }
    update();
    badge.onclick = function () {
      if (S.recorder && S.recorder.state === 'recording') S.recorder.stop();
    };
    document.body.appendChild(badge);
    S.ui = { el: badge, kind: 'badge' };

    var timer = setInterval(function () {
      sec--;
      if (sec <= 0) {
        clearInterval(timer);
        if (S.recorder && S.recorder.state === 'recording') S.recorder.stop();
        return;
      }
      update();
    }, 1000);
  }

  function removeUI() {
    if (S.ui && S.ui.el) {
      try { S.ui.el.remove(); } catch (_) {}
    }
    S.ui = null;
  }

  /* ============================================================
   * AUDIO HOOKS — capture Web Audio output into a MediaStream
   * ============================================================ */

  // Hook 1: AudioContext constructor
  function installConstructorHook() {
    var OrigAC = window.AudioContext || window.webkitAudioContext;
    if (!OrigAC) return;

    function WrappedAC(opts) {
      var inst = new OrigAC(opts);
      try {
        if (!inst.__bbDest) {
          inst.__bbDest = inst.createMediaStreamDestination();
          S.capturedCtx = inst;
          S.capturedDest = inst.__bbDest;
          setTimeout(notifyReady, 0);
        }
      } catch (err) {
        log('AC hook err', err);
      }
      return inst;
    }
    WrappedAC.prototype = OrigAC.prototype;
    try {
      window.AudioContext = WrappedAC;
      window.webkitAudioContext = WrappedAC;
    } catch (_) {}
  }

  // Hook 2: AudioNode.connect — mirror destination connections to our dest
  function installConnectHook() {
    var origConnect = AudioNode.prototype.connect;

    AudioNode.prototype.connect = function (dest) {
      var ctx = this.context;
      try {
        if (ctx && dest === ctx.destination && dest) {
          if (!ctx.__bbDest) {
            try {
              ctx.__bbDest = ctx.createMediaStreamDestination();
              S.capturedCtx = ctx;
              S.capturedDest = ctx.__bbDest;
              setTimeout(notifyReady, 0);
            } catch (_) {}
          }
          if (ctx.__bbDest && dest !== ctx.__bbDest && !this.__bbAlsoToCapture) {
            this.__bbAlsoToCapture = true;
            try { origConnect.call(this, ctx.__bbDest); } catch (_) {}
          }
        }
      } catch (_) {}
      return origConnect.apply(this, arguments);
    };
  }

  // Hook 3: AudioScheduledSourceNode.start — fallback capture grab
  function installStartHook() {
    var proto = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype;
    if (!proto || typeof proto.start !== 'function') return;
    var origStart = proto.start;

    proto.start = function () {
      var ctx = this.context;
      try {
        if (ctx && !ctx.__bbDest) {
          ctx.__bbDest = ctx.createMediaStreamDestination();
          S.capturedCtx = ctx;
          S.capturedDest = ctx.__bbDest;
          setTimeout(notifyReady, 0);
        }
      } catch (_) {}
      return origStart.apply(this, arguments);
    };
  }

  function installHooks() {
    if (S.hooksInstalled) return;
    S.hooksInstalled = true;
    installConstructorHook();
    installConnectHook();
    installStartHook();
    log('Audio hooks installed');
  }

  /* ============================================================
   * RECORDING
   * ============================================================ */
  function startRecording() {
    var canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found on page');

    var ctx = S.capturedCtx;
    var dest = S.capturedDest;
    if (!ctx || !dest) throw new Error('Audio context not captured yet');

    var mime = pickMime();
    if (!mime) throw new Error('No supported recording codec in this browser');
    var isMP4 = mime.indexOf('mp4') > -1;

    // Build combined stream: canvas video + Web Audio output
    var vStream = canvas.captureStream(CONFIG.fps);
    var aTracks = dest.stream.getAudioTracks();
    if (aTracks.length === 0) throw new Error('No audio tracks in captured destination');

    var stream = new MediaStream();
    vStream.getVideoTracks().forEach(function (t) { stream.addTrack(t); });
    aTracks.forEach(function (t) { stream.addTrack(t); });

    var chunks = [];
    var rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: CONFIG.videoBitrate,
      audioBitsPerSecond: CONFIG.audioBitrate
    });

    S.recorder = rec;
    S.starting = false;

    rec.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    rec.onstop = function () {
      var blob = new Blob(chunks, { type: isMP4 ? 'video/mp4' : 'video/webm' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'bouncylab-' + Date.now() + (isMP4 ? '.mp4' : '.webm');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      S.recorder = null;
      removeUI();
      log('Recording saved');
    };

    rec.onerror = function (e) {
      log('Recorder error', e);
      S.recorder = null;
      removeUI();
    };

    rec.start(1000);
    showBadge(isMP4);
    log('Recording started', mime);
    return true;
  }

  function tryStart() {
    if (S.recorder) return true;
    if (!S.capturedCtx || !S.capturedDest) return false;
    try {
      startRecording();
      return true;
    } catch (err) {
      log('start err', err);
      alert('BouncyLab Recorder: ' + err.message);
      S.starting = false;
      return false;
    }
  }

  /* ============================================================
   * MAIN FLOW
   * ============================================================ */

  // Install audio hooks first
  installHooks();

  // Register callback so we auto-start the moment audio is captured
  S.readyCallbacks.push(function () {
    tryStart();
  });

  // Try immediately (in case audio is already running)
  if (tryStart()) {
    return;
  }

  // Otherwise wait for user to trigger audio (Restart / Randomize click)
  showOverlay(
    '🎤 <b>Waiting for audio...</b><br>' +
    '<span style="font-weight:400;font-size:12px;color:#bbb">' +
    'Click <b style="color:#c8ff3d">Restart</b> or <b style="color:#c8ff3d">Randomize</b> ' +
    'on the page to activate sound.<br>Recording will start automatically with 🔊' +
    '</span>'
  );

  S.pollHandle = setInterval(function () {
    if (tryStart()) {
      clearInterval(S.pollHandle);
      S.pollHandle = null;
      removeUI();
    }
  }, CONFIG.pollIntervalMs);

  S.timeoutHandle = setTimeout(function () {
    if (S.pollHandle) {
      clearInterval(S.pollHandle);
      S.pollHandle = null;
    }
    if (!S.recorder) {
      removeUI();
      alert(
        'BouncyLab Recorder:\n\nAudio not detected within ' +
        Math.round(CONFIG.waitForAudioTimeoutMs / 1000) + 's.\n\n' +
        'Try: reload the page, run the bookmarklet again, then click Restart.'
      );
      S.starting = false;
    }
  }, CONFIG.waitForAudioTimeoutMs);

  log('v' + S.version + ' loaded — waiting for audio');
})();