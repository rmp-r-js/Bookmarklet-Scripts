/**
 * BouncyLab Recorder v2.0.0 — MP4/WebM with real Web Audio capture
 * -----------------------------------------------------------------
 * Loads via bookmarklet from jsDelivr. Taps leaf gain nodes in the
 * page's Web Audio graph so all bounce/escape sounds are captured
 * alongside the canvas video.
 *
 * Key insight (from live debugging on bouncylab.app):
 *   The app never connects anything to ctx.destination after initial
 *   setup. Each sound event creates:
 *       OscillatorNode -> leafGain -> masterGain -> destination
 *   So we hook AudioNode.connect, identify the master gain (first
 *   Gain->Gain edge target), then mirror every subsequent
 *   leafGain->masterGain edge into our own MediaStreamDestination.
 *
 * Usage:
 *   1. Run bookmarklet on BouncyLab page
 *   2. Panel appears: set duration, click Start
 *   3. If audio not yet playing, click Restart / Randomize on the page
 *   4. Badge shows countdown; click badge to stop early
 *   5. Run bookmarklet again while recording to stop early too
 *
 * @version 2.0.0
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
    videoBitrate: 8000000,       // 8 Mbps
    audioBitrate: 128000,        // 128 kbps
    fps: 30,
    waitForAudioTimeoutMs: 15000, // give user 15s to trigger a sound
    pollIntervalMs: 200,
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
    version: '2.0.0',
    recorder: null,
    capturedCtx: null,
    capturedDest: null,
    tapStream: null,
    masterGain: null,
    tappedNodes: new WeakSet(),
    oscGains: new WeakSet(),
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
    try { S.recorder.stop(); } catch (err) { /* ignore */ }
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

  /* ============================================================
   * AUDIO HOOKS — leaf-gain tap strategy
   * ============================================================ */
  function installHooks() {
    if (S.hooksInstalled) return;
    S.hooksInstalled = true;

    var origConnect = AudioNode.prototype.connect;

    AudioNode.prototype.connect = function (target) {
      var r = origConnect.apply(this, arguments);

      try {
        var srcName = (this.constructor && this.constructor.name) || '';
        var tgtName = (target && target.constructor && target.constructor.name) || '';

        // Track: OscillatorNode -> GainNode (mark gain as leaf)
        if (srcName === 'OscillatorNode' && tgtName === 'GainNode') {
          S.oscGains.add(target);
        }

        // Detect: leafGain -> masterGain (first one identifies master)
        if (srcName === 'GainNode' && tgtName === 'GainNode') {
          var ctx = this.context;
          if (!ctx) return r;

          // Create the capture destination on first Gain->Gain edge
          if (!S.capturedDest) {
            try {
              S.capturedDest = ctx.createMediaStreamDestination();
              S.capturedCtx = ctx;
              S.tapStream = S.capturedDest.stream;
              log('\u2705 Tap destination ready');
            } catch (e) {
              log('tap dest err', e);
              return r;
            }
          }

          // First Gain->Gain edge target becomes the "master"
          if (!S.masterGain) {
            S.masterGain = target;
            log('\uD83C\uDFAF Master detected');
          }

          // Tap every leaf gain that connects to master
          if (target === S.masterGain && !S.tappedNodes.has(this)) {
            try {
              S.tappedNodes.add(this);
              origConnect.call(this, S.capturedDest);
              log('\uD83D\uDD0A Leaf tapped');
            } catch (e) {
              log('tap err', e);
            }
          }
        }
      } catch (_) {
        // never break the app's own connect chain
      }

      return r;
    };

    log('Audio hooks installed (leaf-gain mode)');
  }

  /* ============================================================
   * UI — control panel
   * ============================================================ */
  function showPanel() {
    removeUI();
    var panel = document.createElement('div');
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

    rec.start(1000);
    showBadge(isMP4, duration);
    log('Recording started', mime, duration + 's');
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
        if (S.timeoutHandle) { clearTimeout(S.timeoutHandle); S.timeoutHandle = null; }
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