/**
 * Dia Text Reveal Recorder
 * Records the "Never stop [word]" animation at 1080x1920 @60fps
 * and downloads it as .webm (VP9) or .mp4.
 *
 * Usage: load this file from a bookmarklet on any page.
 */
(async () => {
  'use strict';

  // ---------- Config ----------
  const CONFIG = {
    W: 1080,
    H: 1920,
    DURATION: 15,          // seconds
    BITRATE: 16_000_000,
    PREFIX: 'Never stop ',  // static left text
    WORDS: ['Exploring.', 'Innovating.', 'Shipping.', 'Iterating.', 'Crafting.'],
    SWEEP: 2.0,
    HOLD: 0.5,
    EXIT: 0.5,
    FONT_FAMILY: '"Instrument Sans", system-ui, sans-serif',
    FONT_WEIGHT: '600',
    BG: '#0a0a0a',
    FG: '#f5f5f5',
    GRADIENT_STOPS: [
      [0.00, 'rgba(245,245,245,1)'],
      [0.35, 'rgba(245,245,245,1)'],
      [0.45, 'rgba(79,70,229,1)'],
      [0.50, 'rgba(236,72,153,1)'],
      [0.55, 'rgba(245,158,11,1)'],
      [0.65, 'rgba(245,245,245,0)'],
      [1.00, 'rgba(245,245,245,0)'],
    ],
    BLUR_STEPS: 10,
    PREVIEW_SCALE: 0.3,
  };

  const {
    W, H, DURATION, BITRATE, PREFIX, WORDS,
    SWEEP, HOLD, EXIT, FONT_FAMILY, FONT_WEIGHT,
    BG, FG, GRADIENT_STOPS, BLUR_STEPS, PREVIEW_SCALE,
  } = CONFIG;

  try {
    // ---------- Wait for fonts ----------
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // ---------- Preview canvas ----------
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    Object.assign(cv.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: `translate(-50%, -50%) scale(${PREVIEW_SCALE})`,
      zIndex: 999999,
      border: '2px solid #f59e0b',
      borderRadius: '8px',
      boxShadow: '0 0 40px rgba(0,0,0,0.85)',
      background: '#000',
    });
    document.body.appendChild(cv);

    // ---------- Status pill ----------
    const status = document.createElement('div');
    Object.assign(status.style, {
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      background: 'rgba(0,0,0,0.9)',
      color: '#f59e0b',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      borderRadius: '999px',
      zIndex: 1000000,
      border: '1px solid #f59e0b',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });
    status.textContent = 'Preparing…';
    document.body.appendChild(status);

    const cleanup = () => {
      status.remove();
      cv.style.transition = 'opacity .5s';
      cv.style.opacity = '0';
      setTimeout(() => cv.remove(), 600);
    };

    const ctx = cv.getContext('2d', { alpha: false });

    // ---------- Layout math ----------
    const CYCLE = SWEEP + HOLD + EXIT;

    ctx.font = `${FONT_WEIGHT} 200px ${FONT_FAMILY}`;
    const probePrefix = ctx.measureText(PREFIX).width;
    let probeMax = 0;
    for (const w of WORDS) probeMax = Math.max(probeMax, ctx.measureText(w).width);

    const FONT_SIZE = 200 * ((W * 0.88) / (probePrefix + probeMax));
    ctx.font = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;

    const prefixW = ctx.measureText(PREFIX).width;
    let maxWordW = 0;
    for (const w of WORDS) maxWordW = Math.max(maxWordW, ctx.measureText(w).width);

    const startX = (W - (prefixW + maxWordW)) / 2;
    const baselineY = H / 2 + FONT_SIZE * 0.35;
    const yAmp = FONT_SIZE * (10 / 48);
    const blurAmp = FONT_SIZE * (15 / 48);

    // ---------- Easings ----------
    const p3io = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const p2i = (t) => t * t;

    // ---------- Pre-bake word bitmaps (with blur levels) ----------
    const wordBitmaps = WORDS.map((word) => {
      const wordW = ctx.measureText(word).width;
      const pad = Math.ceil(blurAmp * 3) + 4;
      const cw = Math.ceil(wordW) + pad * 2;
      const ch = Math.ceil(FONT_SIZE * 1.7) + pad * 2;
      const bmaps = [];

      for (let i = 0; i <= BLUR_STEPS; i++) {
        const blur = (i / BLUR_STEPS) * blurAmp;
        const oc = document.createElement('canvas');
        oc.width = cw;
        oc.height = ch;
        const octx = oc.getContext('2d');
        octx.font = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;
        octx.textBaseline = 'alphabetic';
        octx.textAlign = 'left';

        const grad = octx.createLinearGradient(pad, 0, pad + 3 * wordW, 0);
        for (const [pos, col] of GRADIENT_STOPS) grad.addColorStop(pos, col);
        octx.fillStyle = grad;

        if (blur > 0.5) octx.filter = `blur(${blur.toFixed(1)}px)`;
        octx.fillText(word, pad, pad + FONT_SIZE);
        bmaps.push(oc);
      }

      return { bmaps, wordW, pad, baselineOff: pad + FONT_SIZE };
    });

    // ---------- Per-frame render ----------
    function render(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      const idx = Math.floor(t / CYCLE) % WORDS.length;
      const localT = t % CYCLE;
      const word = WORDS[idx];
      const wb = wordBitmaps[idx];

      ctx.font = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = FG;
      ctx.fillText(PREFIX, startX, baselineY);

      const wordX = startX + prefixW;
      const wordW = wb.wordW;
      const wordCX = wordX + wordW / 2;
      const wordCY = baselineY - FONT_SIZE * 0.35;

      if (localT < SWEEP) {
        // Sweep-in: gradient + slight lift
        const e = p3io(localT / SWEEP);
        const p = 100 * (1 - e);
        const yOff = yAmp * (1 - e);
        const sc = 0.96 + 0.04 * e;

        ctx.save();
        ctx.translate(wordCX, wordCY + yOff);
        ctx.scale(sc, sc);
        ctx.translate(-wordCX, -wordCY);

        const gs = wordX - 2 * wordW * (p / 100);
        const grad = ctx.createLinearGradient(gs, 0, gs + 3 * wordW, 0);
        for (const [pos, col] of GRADIENT_STOPS) grad.addColorStop(pos, col);
        ctx.fillStyle = grad;
        ctx.fillText(word, wordX, baselineY);
        ctx.restore();
      } else if (localT < SWEEP + HOLD) {
        // Hold: sharp bitmap
        ctx.drawImage(wb.bmaps[0], wordX - wb.pad, baselineY - wb.baselineOff);
      } else {
        // Exit: fade + blur + lift
        const e = p2i((localT - SWEEP - HOLD) / EXIT);
        const yOff = -yAmp * e;
        const sc = 1 + 0.03 * e;
        const op = 1 - e;
        const bi = Math.min(BLUR_STEPS, Math.round(e * BLUR_STEPS));

        ctx.save();
        ctx.globalAlpha = op;
        ctx.translate(wordCX, wordCY + yOff);
        ctx.scale(sc, sc);
        ctx.translate(-wordCX, -wordCY);
        ctx.drawImage(wb.bmaps[bi], wordX - wb.pad, baselineY - wb.baselineOff);
        ctx.restore();
      }
    }

    // ---------- Recorder setup ----------
    if (!cv.captureStream) {
      alert('captureStream not supported in this browser.');
      cleanup();
      return;
    }

    const MIME_CANDIDATES = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ];
    const mime = MIME_CANDIDATES.find(
      (m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)
    );

    if (!mime) {
      alert('MediaRecorder not supported in this browser.');
      cleanup();
      return;
    }

    let stream;
    try {
      stream = cv.captureStream(0);
    } catch {
      stream = cv.captureStream(60);
    }
    const track = stream.getVideoTracks()[0];
    const manual = typeof track.requestFrame === 'function';

    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: BITRATE,
    });

    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    const ext = mime.includes('mp4') ? 'mp4' : 'webm';

    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dia-reveal-${W}x${H}-${DURATION}s.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = `✅ Done — ${ext.toUpperCase()} • ${(blob.size / 1048576).toFixed(1)} MB`;
      setTimeout(cleanup, 2500);
    };

    // ---------- Go ----------
    status.textContent = `Recording ${W}×${H} @60fps — ${DURATION}s • tab foreground rakho`;
    render(0);
    if (manual) track.requestFrame();
    rec.start(500);

    const t0 = performance.now();
    const DMS = DURATION * 1000;

    function tick() {
      const elapsed = performance.now() - t0;
      const t = Math.min(elapsed / 1000, DURATION);
      render(t);
      if (manual) track.requestFrame();
      if (elapsed >= DMS) {
        setTimeout(() => rec.stop(), 250);
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  } catch (err) {
    console.error('[dia-reveal-recorder]', err);
    alert('Recorder error: ' + err.message);
  }
})();