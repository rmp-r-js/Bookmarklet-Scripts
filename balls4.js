/**
 * BouncyLab Recorder v2.1.0 — MP4/WebM with reliable Web Audio capture
 * --------------------------------------------------------------------
 * Fixed issues from v2.0.0:
 *   - Master-gain detection removed (was locking onto stale reference
 *     after audio graph resets → sound stopped after a while).
 *   - Every leaf gain (OscillatorNode's direct connect target) is now
 *     tapped the moment it appears.
 *   - AudioContext swap detection (recreates tap destination if app
 *     rebuilds the context).
 *   - AudioContext auto-resume (Chrome can suspend idle contexts).
 *   - MediaRecorder started without timeslice (single clean chunk,
 *     eliminates audio glitches at chunk boundaries).
 *   - Small stabilization delay before recording (better A/V sync).
 *
 * @version 2.1.0
 * @license MIT
 */

(function () {
  'use strict';

  /* ============================================================
   * CONFIG
   * ============================================================ */
  var CONFIG = {
    defaultDurationSeconds: 30,
    minDuration: 1,
    maxDuration: 600,
    videoBitrate: 8000000,
    audioBitrate: 128000,
    fps: 60,
    waitForAudioTimeoutMs: 15000,
    pollIntervalMs: 200,
    stabilizationDelayMs: 250,
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
   * STATE
   * ============================================================ */
  var S = (window.__bouncyRecorder = window.__bouncyRecorder || {
    version: '2.1.0',
    recorder: null,
    capturedCtx: null,
    capturedDest: null,
    tapStream: null,
    tappedNodes: new WeakSet(),
    hooksInstalled: false,
    ui: null,
    pollHandle: null,
    timeoutHandle: null,
    resumeInterval: null,
    starting: false
  });

  // Update version if re-injected
  S.version = '2.1.0';

  /* ============================================================
   * TOGGLE — stop if already recording
   * ============================================================ */
  if (S.recorder && S.recorder.state === 'recording') {
    try { S.recorder.stop(); } catch (err) {}
    return;
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */
  function log() {
    try {
      console.log.apply(console, ['[BB]'].concat([].slice.call(arguments)));
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

  function removeUI() {
    if (S.ui && S.ui.el) {
      try { S.ui.el.remove(); } catch (_) {}
    }
    S.ui = null;
  }

  function ensureTapDestination(ctx) {
    if (!ctx) return false;
    if (S.capturedDest && S.capturedCtx === ctx) return true;
    try {
      S.capturedCtx = ctx;
      S.capturedDest = ctx.createMediaStreamDestination();
      S.tapStream = S.capturedDest.stream;
      log('\u2705 Tap destination ready (ctx @' + (ctx.sampleRate || '?') + 'Hz)');
      return true;
    } catch (e) {
      log('tap create err', e);
      return false;
    }
  }

  /* ============================================================
   * AUDIO HOOKS — robust leaf-gain tap
   * ============================================================ */
  function installHooks() {
    if (S.hooksInstalled) return;
    S.hooksInstalled = true;

    var origConnect = AudioNode.prototype.connect;
    var origDisconnect = AudioNode.prototype.disconnect;

    AudioNode.prototype.connect = function (target) {
      var r;
      try { r = origConnect.apply(this, arguments); } catch (e) { throw e; }

      try {
        var srcName = (this.constructor && this.constructor.name) || '';
        var tgtName = (target && target.constructor && target.constructor.name) || '';
        var ctx = this.context;

        // ---- PRIMARY: tap every leaf gain the moment it appears ----
        // BouncyLab pattern: OscillatorNode -> leafGain -> masterGain
        if (srcName === 'OscillatorNode' && tgtName === 'GainNode') {
          if (!ensureTapDestination(ctx)) return r;

          if (!target.__bbTapped) {
            target.__bbTapped = true;
            S.tappedNodes.add(target);
            try {
              origConnect.call(target, S.capturedDest);
            } catch (e) {
              log('tap leaf err', e);
            }
          }
        }

        // ---- FALLBACK: anything wired to destination ----
        if (tgtName === 'AudioDestinationNode' && ctx && target === ctx.destination) {
          if (!ensureTapDestination(ctx)) return r;
          if (!this.__bbTapped) {
            this.__bbTapped = true;
            S.tappedNodes.add(this);
            try {
              origConnect.call(this, S.capturedDest);
            } catch (e) {}
          }
        }

        // ---- FALLBACK 2: any AudioScheduledSourceNode -> GainNode ----
        // (covers BufferSource, ConstantSource, etc.)
        if (/SourceNode$/.test(srcName) && tgtName === 'GainNode' && srcName !== 'OscillatorNode') {
          if (!ensureTapDestination(ctx)) return r;
          if (!target.__bbTapped) {
            target.__bbTapped = true;
            S.tappedNodes.add(target);
            try {
              origConnect.call(target, S.capturedDest);
            } catch (e) {}
          }
        }
      } catch (_) { /* never break the app's own graph */ }

      return r;
    };

    // Auto-resume context if it goes into 'suspended' state
    if (!S.resumeInterval) {
      S.resumeInterval = setInterval(function () {
        try {
          if (S.capturedCtx && S.capturedCtx.state === 'suspended') {
            S.capturedCtx.resume().then(function () {
              log('\u25B6 AudioContext resumed');
            }).catch(function () {});
          }
        } catch (_) {}
      }, 1500);
    }

    log('Audio hooks installed (v' + S.version + ')');
  }

  /* ============================================================
   * UI — control panel
   * ============================================================ */
  function showPanel() {
    removeUI();
    var panel = document.createElement('div');
    panel.id = '__bbPanel';
    panel.style.cssText = [
      'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
      'background:#131340', 'color:#e4e4e7',
      'padding:12px 16px', 'border-radius:12px',
      'border:1px solid #27272a',
      'font:600 13px ui-monospace,monospace',
      'z-index:2147483647',
      'box-shadow:0 8px 32px rgba(0,0,0,.6)',
      'display:flex', 'gap:8px', 'align-items:center', 'flex-wrap:wrap',
      'max-width:92vw'
    ].join(';');

    panel.innerHTML =
      '<span style="color:#a1a1aa">Sec</span>' +
      '<input id="__bbDur" type="number" min="' + CONFIG.minDuration + '" max="' + CONFIG.maxDuration + '"' +
      ' value="' + CONFIG.defaultDurationSeconds + '"' +
      ' style="width:56px;padding:6px 8px;background:#0a0a28;color:#c8ff3d;' +
      'border:1px solid #27272a;border-radius:6px;' +
      'font:600 13px ui-monospace,monospace;text-align:center">' +
      '<button id="__bbStart" style="padding:8px 16px;background:#c8ff3d;color:#0a0a28;' +
      'border:none;border-radius:8px;font:700 13px ui-monospace,monospace;cursor:pointer">' +
      '\u25B6 Start</button>' +
      '<button id="__bbClose" style="padding:6px 10px;background:transparent;color:#71717a;' +
      'border:1px solid #27272a;border-radius:6px;font:700 13px monospace;cursor:pointer">' +
      '\u2715</button>';

    document.body.appendChild(panel);
    S.ui = { el: panel, kind: 'panel' };

    panel.querySelector('#__bbClose').onclick = function () {
      removeUI();
    };
    panel.querySelector('#__bbStart').onclick = function () {
      var durEl = panel.querySelector('#__bbDur');
      var dur = parseInt(durEl.value, 10);
      if (!isFinite(dur)) dur = CONFIG.defaultDurationSeconds;
      dur = Math.max(CONFIG.minDuration, Math.min(CONFIG.maxDuration, dur));
      startFlow(panel, dur);
    };
  }

  function showBadge(isMP4, duration) {
    removeUI();
    var badge = document.createElement('div');
    var bg = isMP4 ? '#c8ff3d' : '#ff5c5c';
    badge.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647',
      'background:' + bg, 'color:#0a0a28',
      'padding:10px 16px', 'border-radius:8px',
      'font:700 14px ui-monospace,monospace',
      'cursor:pointer', 'box-shadow:0 6px 20px rgba(0,0,0,.5)',
      'user-select:none'
    ].join(';');

    var sec = duration;
    function update() {
      badge.textContent = '\u23FA ' + (isMP4 ? 'MP4' : 'WebM') +
        ' + \uD83D\uDD0A ' + sec + 's \u2014 click to stop';
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

  function showWaitingPanel(panel) {
    var btn = panel.querySelector('#__bbStart');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.textContent = '\uD83D\uDD0A Waiting for sound...';
    }
  }

  function restorePanelButton(panel) {
    var btn = panel && panel.querySelector && panel.querySelector('#__bbStart');
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = '\u25B6 Start';
    }
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
      'background:#c8ff3d', 'color:#0a0a28',
      'padding:10px 18px', 'border-radius:8px',
      'font:700 13px ui-monospace,monospace',
      'z-index:2147483647',
      'box-shadow:0 6px 20px rgba(0,0,0,.5)'
    ].join(';');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (_) {} }, 3500);
  }

  /* ============================================================
   * RECORDING
   * ============================================================ */
  function startRecording(duration) {
    var canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found on page');
    if (!S.capturedDest) throw new Error('Audio not captured yet');

    var mime = pickMime();
    if (!mime) throw new Error('No supported recording codec in this browser');
    var isMP4 = mime.indexOf('mp4') > -1;

    var vStream = canvas.captureStream(CONFIG.fps);
    var aTracks = S.capturedDest.stream.getAudioTracks();
    if (aTracks.length === 0) throw new Error('No audio tracks available');

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
      showToast('\u2705 Saved (' + (blob.size / 1048576).toFixed(2) + ' MB)');
      log('Recording saved');
    };

    rec.onerror = function (e) {
      log('Recorder error', e);
      S.recorder = null;
      removeUI();
    };

    // Small stabilization delay so video & audio tracks align
    setTimeout(function () {
      try {
        rec.start();  // NO timeslice — single clean chunk
        showBadge(isMP4, duration);
        log('Recording started', mime, duration + 's');
      } catch (e) {
        log('rec start err', e);
        alert('Recorder failed to start: ' + e.message);
        S.recorder = null;
      }
    }, CONFIG.stabilizationDelayMs);
  }

  /* ============================================================
   * FLOW — user clicked Start
   * ============================================================ */
  function startFlow(panel, duration) {
    if (S.starting) return;
    S.starting = true;

    // Already have audio? Start immediately.
    if (S.capturedDest && S.capturedDest.stream.getAudioTracks().length) {
      try {
        startRecording(duration);
        S.starting = false;
        return;
      } catch (e) {
        log('start err', e);
        alert('BouncyLab Recorder: ' + e.message);
        S.starting = false;
        restorePanelButton(panel);
        return;
      }
    }

    // Wait for audio
    showWaitingPanel(panel);

    var t0 = Date.now();
    S.pollHandle = setInterval(function () {
      var ok = S.capturedDest && S.capturedDest.stream.getAudioTracks().length > 0;
      if (ok) {
        clearInterval(S.pollHandle);
        S.pollHandle = null;
        try {
          startRecording(duration);
        } catch (e) {
          log('start err', e);
          alert('BouncyLab Recorder: ' + e.message);
          removeUI();
          showPanel();
        }
        S.starting = false;
        return;
      }
      if (Date.now() - t0 > CONFIG.waitForAudioTimeoutMs) {
        clearInterval(S.pollHandle);
        S.pollHandle = null;
        S.starting = false;
        restorePanelButton(panel);
        alert(
          'No audio detected in ' + Math.round(CONFIG.waitForAudioTimeoutMs / 1000) + 's.\n\n' +
          'Do this:\n' +
          '1. Click Restart / Randomize on the page\n' +
          '2. Wait for bounce sounds\n' +
          '3. Click Start again'
        );
      }
    }, CONFIG.pollIntervalMs);
  }

  /* ============================================================
   * BOOT
   * ============================================================ */
  installHooks();
  showPanel();
  log('v' + S.version + ' ready');
})();