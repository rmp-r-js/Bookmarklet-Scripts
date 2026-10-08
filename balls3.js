/**
 * BouncyLab Recorder v1.1.0
 * MP4 + real audio capture. Dual-mode: AudioContext hook + tab-audio fallback.
 * @license MIT
 */

(function () {
  'use strict';

  var CONFIG = {
    durationSeconds: 60,
    videoBitrate: 8000000,
    audioBitrate: 128000,
    fps: 30,
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

  var S = (window.__bouncyRecorder = window.__bouncyRecorder || {
    version: '1.1.0',
    recorder: null,
    capturedCtx: null,
    capturedDest: null,
    readyCallbacks: [],
    hooksInstalled: false,
    ui: null,
    pollHandle: null,
    starting: false
  });

  if (S.recorder && S.recorder.state === 'recording') {
    try { S.recorder.stop(); } catch (e) {}
    return;
  }
  if (S.starting) return;
  S.starting = true;

  function log() {
    try { console.log.apply(console, ['[BB]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (var i = 0; i < CONFIG.mimeCandidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(CONFIG.mimeCandidates[i])) return CONFIG.mimeCandidates[i];
      } catch (_) {}
    }
    return null;
  }

  function notifyReady() {
    var cbs = S.readyCallbacks; S.readyCallbacks = [];
    cbs.forEach(function (fn) { try { fn(); } catch (e) { log('cb err', e); } });
  }

  /* ===================== UI ===================== */
  function showOverlay(html) {
    removeUI();
    var el = document.createElement('div');
    el.id = 'bb-overlay';
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;padding:16px 24px;border-radius:12px;font:600 13px system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.6);text-align:center;max-width:90vw;line-height:1.7';
    el.innerHTML = html;
    document.body.appendChild(el);
    S.ui = { el: el, kind: 'overlay' };
  }

  function showBadge(isMP4) {
    removeUI();
    var badge = document.createElement('div');
    var bg = isMP4 ? '#c8ff3d' : '#ff5c5c';
    badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:' + bg + ';color:#0a0a28;padding:10px 16px;border-radius:8px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.5);user-select:none';
    var sec = CONFIG.durationSeconds;
    function upd() { badge.textContent = '⏺ ' + (isMP4 ? 'MP4' : 'WebM') + ' + 🔊 ' + sec + 's — click to stop'; }
    upd();
    badge.onclick = function () { if (S.recorder && S.recorder.state === 'recording') S.recorder.stop(); };
    document.body.appendChild(badge);
    S.ui = { el: badge, kind: 'badge' };
    var t = setInterval(function () {
      sec--;
      if (sec <= 0) { clearInterval(t); if (S.recorder && S.recorder.state === 'recording') S.recorder.stop(); return; }
      upd();
    }, 1000);
  }

  function removeUI() {
    if (S.ui && S.ui.el) { try { S.ui.el.remove(); } catch (_) {} }
    S.ui = null;
  }

  /* ============ Audio hooks (fixed) ============ */
  function captureCtx(ctx) {
    if (!ctx || ctx.__bbDest) return;
    try {
      ctx.__bbDest = ctx.createMediaStreamDestination();
      S.capturedCtx = ctx;
      S.capturedDest = ctx.__bbDest;
      log('Captured AudioContext');
      setTimeout(notifyReady, 0);
    } catch (e) { log('captureCtx err', e); }
  }

  // Track connections: node → [list of sources feeding into it]
  var connMap = new WeakMap();

  function installHooks() {
    if (S.hooksInstalled) return;
    S.hooksInstalled = true;

    var OrigAC = window.AudioContext || window.webkitAudioContext;

    // 1. Constructor
    if (OrigAC) {
      function WrappedAC(opts) {
        var inst = new OrigAC(opts);
        captureCtx(inst);
        return inst;
      }
      WrappedAC.prototype = OrigAC.prototype;
      try {
        window.AudioContext = WrappedAC;
        window.webkitAudioContext = WrappedAC;
      } catch (_) {}
    }

    // 2. All create* methods — catch contexts created before our hook
    var createMethods = ['createOscillator','createGain','createBufferSource','createBiquadFilter','createAnalyser','createStereoPanner','createDelay','createConvolver','createDynamicsCompressor','createChannelMerger','createChannelSplitter','createConstantSource','createPanner','createWaveShaper','createMediaStreamDestination'];
    if (OrigAC) {
      createMethods.forEach(function (m) {
        if (!OrigAC.prototype[m]) return;
        var orig = OrigAC.prototype[m];
        OrigAC.prototype[m] = function () {
          captureCtx(this);
          return orig.apply(this, arguments);
        };
      });
      ['resume','suspend'].forEach(function (m) {
        if (!OrigAC.prototype[m]) return;
        var orig = OrigAC.prototype[m];
        OrigAC.prototype[m] = function () {
          captureCtx(this);
          return orig.apply(this, arguments);
        };
      });
    }

    // 3. Connect hook — with proper propagation
    var origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest) {
      var result = origConnect.apply(this, arguments);
      try {
        var ctx = this.context;
        if (ctx && ctx.__bbDest && dest) {
          if (dest === ctx.destination) {
            // Direct connection to destination — tap this node
            if (!this.__bbTapped) {
              this.__bbTapped = true;
              try { origConnect.call(this, ctx.__bbDest); } catch (_) {}
              log('Tapped direct → destination');
            }
          } else if (dest instanceof AudioNode) {
            // Track incoming
            var incoming = connMap.get(dest);
            if (!incoming) { incoming = []; connMap.set(dest, incoming); }
            if (incoming.indexOf(this) === -1) incoming.push(this);

            // Propagate: if destination is already tapped, tap this too
            if (dest.__bbTapped && !this.__bbTapped) {
              this.__bbTapped = true;
              try { origConnect.call(this, ctx.__bbDest); } catch (_) {}
              log('Tapped propagated → destination');
            }
          }
        }
      } catch (_) {}
      return result;
    };

    // 4. start() fallback
    if (window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype.start) {
      var origStart = window.AudioScheduledSourceNode.prototype.start;
      window.AudioScheduledSourceNode.prototype.start = function () {
        captureCtx(this.context);
        return origStart.apply(this, arguments);
      };
    }

    log('Hooks installed');
  }

  /* ===================== Recording ===================== */
  function startRecording(externalAudioTrack) {
    var canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');

    var mime = pickMime();
    if (!mime) throw new Error('No supported codec');
    var isMP4 = mime.indexOf('mp4') > -1;

    var videoStream = canvas.captureStream(CONFIG.fps);
    var combined = new MediaStream();
    videoStream.getVideoTracks().forEach(function (t) { combined.addTrack(t); });

    var audioAdded = false;
    if (externalAudioTrack) {
      combined.addTrack(externalAudioTrack);
      audioAdded = true;
      log('Audio: external tab-capture track');
    } else if (S.capturedDest) {
      var tracks = S.capturedDest.stream.getAudioTracks();
      if (tracks.length) {
        combined.addTrack(tracks[0]);
        audioAdded = true;
        log('Audio: hooked AudioContext');
      }
    }

    if (!audioAdded) log('WARNING — no audio track');

    var chunks = [];
    var rec = new MediaRecorder(combined, {
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
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      S.recorder = null;
      removeUI();
      log('Saved');
    };

    rec.start(1000);
    showBadge(isMP4);
    log('Recording started', mime, 'audio:', audioAdded);
    return true;
  }

  function tryHookStart() {
    if (S.recorder) return true;
    if (!S.capturedCtx || !S.capturedDest) return false;
    try { startRecording(null); return true; }
    catch (e) { log('hook start err', e); return false; }
  }

  async function startTabCapture() {
    try {
      log('Requesting tab capture…');
      var opts = { video: true, audio: true };
      try { opts.preferCurrentTab = true; } catch (_) {}
      var displayStream = await navigator.mediaDevices.getDisplayMedia(opts);
      var audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        displayStream.getTracks().forEach(function (t) { t.stop(); });
        alert('No audio track shared.\n\nWhen the picker opens, choose "This Tab" and make sure "Share tab audio" is enabled.');
        return;
      }
      log('Got tab audio');
      startRecording(audioTracks[0]);
    } catch (e) {
      log('Tab capture failed', e);
      alert('Tab capture failed: ' + e.message);
    }
  }
  S.startTabCapture = startTabCapture;

  /* ===================== Main ===================== */
  installHooks();
  S.readyCallbacks.push(function () { tryHookStart(); });

  if (tryHookStart()) return;

  showOverlay(
    '🎤 <b>Waiting for audio…</b><br>' +
    '<span style="font-weight:400;font-size:12px;color:#bbb">Click <b style="color:#c8ff3d">Restart</b> on the page to activate sound.</span><br>' +
    '<button id="bb-tab-btn" style="margin-top:12px;background:#c8ff3d;color:#0a0a28;border:0;padding:9px 16px;border-radius:6px;font:700 12px system-ui;cursor:pointer">🔊 Use tab audio instead (100% reliable)</button>'
  );

  var tabBtn = document.getElementById('bb-tab-btn');
  if (tabBtn) tabBtn.onclick = function () { removeUI(); startTabCapture(); };

  S.pollHandle = setInterval(function () {
    if (tryHookStart()) {
      clearInterval(S.pollHandle); S.pollHandle = null; removeUI();
    }
  }, CONFIG.pollIntervalMs);
})();