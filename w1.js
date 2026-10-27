/*!
 * WinGo History Collector (UI-Click Mode)
 * -----------------------------------------------------------------------------
 * Repo:   rmp-r-js/Bookmarklet-Scripts
 * File:   wingo-collector.js
 * Branch: main
 * CDN:    https://cdn.jsdelivr.net/gh/rmp-r-js/Bookmarklet-Scripts@main/wingo-collector.js
 *
 * Loader Bookmarklet (paste in bookmark URL field):
 * javascript:(()=>{if(window.__wgcLoader)return;window.__wgcLoader=1;const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/rmp-r-js/Bookmarklet-Scripts@main/wingo-collector.js?v='+Date.now();s.onerror=()=>{window.__wgcLoader=0;alert('WGC: failed to load (CSP?)');};document.body.appendChild(s)})();
 *
 * Strategy: DO NOT fetch API directly. Instead:
 *   1. Read current page number from UI  →  .record-foot-page
 *   2. Auto-click  →  .record-foot-next
 *   3. Hook fetch + XHR (passively) to capture issue data
 *   4. Dedupe by issueNumber (safe against page-1 reset when new round arrives)
 *   5. Fast-forward automatically if reset detected (page num went backwards)
 * -----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.__cols && document.getElementById('__cols')) {
    alert('WinGo Collector already running!');
    return;
  }

  const API_RE = /GetHistoryIssuePage/i;
  const FILENAME_PREFIX = 'WinGo_History_';
  const POLL_MS = 250;              // main loop interval
  const PAGE_CHANGE_WAIT = 800;     // wait for data after page flips
  const CLICK_TIMEOUT = 2500;       // if click didn't advance page in this time, retry
  const IDLE_STOP_MS = 3 * 60 * 1000; // auto-stop after 3min with no new data on last page

  // ---------- CSS ----------
  const style = document.createElement('style');
  style.id = '__cols_style';
  style.textContent = `
    #__cols { position:fixed; top:10px; right:10px; z-index:2147483647;
      background:#1a1a2e; color:#fff; padding:12px 16px; border-radius:8px;
      font-family:Arial,sans-serif; font-size:13px; box-shadow:0 2px 12px rgba(0,0,0,.6);
      min-width:260px; }
    #__cols button { display:block; width:100%; margin-top:6px; padding:7px;
      border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px; }
    #__cols .s { background:#4CAF50; color:#fff; }
    #__cols .p { background:#f44336; color:#fff; }
    #__cols .d { background:#2196F3; color:#fff; }
    #__cols .x { background:#555; color:#fff; font-size:11px; padding:3px 6px; width:auto; margin:0; }
    #__cols .cnt { font-size:22px; font-weight:bold; color:#4CAF50; }
    #__cols.err .cnt { color:#f44336; }
    #__cols .ff { color:#FFC107; }
  `;
  document.head.appendChild(style);

  // ---------- Panel ----------
  const panel = document.createElement('div');
  panel.id = '__cols';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b>WinGo Collector</b>
      <button class="x">x</button>
    </div>
    <div style="margin-top:8px">Collected: <span class="cnt">0</span></div>
    <div id="__cs" style="font-size:11px;margin-top:4px;color:#aaa">Page: -/-</div>
    <div id="__cs2" style="font-size:11px;margin-top:2px;color:#aaa">Status: Idle</div>
    <button class="s">Start Collection</button>
    <button class="d">Download JSON</button>
  `;
  document.body.appendChild(panel);

  // ---------- State ----------
  const M = window.__cols = {
    active: false,
    stopReq: false,
    rounds: {},
    total: 0,
    currentPage: 0,
    maxPage: 0,
    fastMode: false,
  };

  const elCnt = panel.querySelector('.cnt');
  const elStatus = document.getElementById('__cs2');
  const elPage = document.getElementById('__cs');
  const btnStart = panel.querySelector('.s');
  const btnDownload = panel.querySelector('.d');
  const btnClose = panel.querySelector('.x');

  const update = () => {
    elCnt.textContent = Object.keys(M.rounds).length;
    elPage.textContent = 'Page: ' + (M.currentPage || '-') + '/' + (M.total || '-');
    let st = M.active ? (M.fastMode ? 'Fast-forwarding...' : 'Collecting...') : (M.stopReq ? 'Stopped' : 'Idle');
    elStatus.innerHTML = 'Status: ' + st;
  };

  const addData = (d) => {
    if (!d || !d.list) return;
    d.list.forEach((r) => {
      if (r && r.issueNumber && !M.rounds[r.issueNumber]) {
        M.rounds[r.issueNumber] = r;
      }
    });
    if (d.totalPage) M.total = d.totalPage;
    if (d.pageNo) M.currentPage = d.pageNo;
    update();
  };

  // ---------- Passive API hooks (just to capture data as it flows by) ----------
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const res = await origFetch.apply(this, args);
    if (M.active && API_RE.test(url) && res.ok) {
      try {
        const d = await res.clone().json();
        if (d && d.data && d.data.list) addData(d.data);
      } catch (_) {}
    }
    return res;
  };

  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    this.__url = u;
    return origXhrOpen.call(this, m, u, ...r);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    this.addEventListener('load', function () {
      if (M.active && this.__url && API_RE.test(this.__url)) {
        try {
          const d = JSON.parse(this.responseText);
          if (d && d.data && d.data.list) addData(d.data);
        } catch (_) {}
      }
    });
    return origXhrSend.apply(this, a);
  };

  // ---------- DOM helpers ----------
  const readPageInfo = () => {
    const el = document.querySelector('.record-foot-page');
    if (!el) return null;
    const m = el.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { current: +m[1], total: +m[2] } : null;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Main UI-clicking loop ----------
  const runLoop = async () => {
    let lastCount = Object.keys(M.rounds).length;
    let lastDataTime = Date.now();
    let lastClickedPage = -1;
    let waitingForChange = false;
    let waitStart = 0;

    while (M.active && !M.stopReq) {
      await sleep(POLL_MS);

      // Track data progress
      const count = Object.keys(M.rounds).length;
      if (count > lastCount) {
        lastCount = count;
        lastDataTime = Date.now();
      }

      const info = readPageInfo();
      if (!info) continue;

      M.total = info.total;
      M.currentPage = info.current;

      // Detect page going backwards → reset from new round
      if (info.current < M.maxPage - 1 && !M.fastMode) {
        M.fastMode = true;
        console.log('[WGC] Reset detected (page ' + info.current + ' after ' + M.maxPage + ') → fast-forwarding');
      }
      if (info.current > M.maxPage) M.maxPage = info.current;
      if (M.fastMode && info.current >= M.maxPage) {
        M.fastMode = false;
        console.log('[WGC] Caught up to page ' + M.maxPage);
      }
      update();

      const nextBtn = document.querySelector('.record-foot-next');
      if (!nextBtn) continue;

      const isLastPage = info.current >= info.total;
      const disabled = nextBtn.classList.contains('disabled');

      // Waiting for a click to flip the page
      if (waitingForChange) {
        if (info.current !== lastClickedPage) {
          // Page changed → give data 800ms to arrive, then continue
          waitingForChange = false;
          const dataStart = Date.now();
          const prevCount = Object.keys(M.rounds).length;
          while (Date.now() - dataStart < PAGE_CHANGE_WAIT) {
            if (Object.keys(M.rounds).length > prevCount) break;
            await sleep(100);
          }
          continue;
        }
        // Click timeout → try again
        if (Date.now() - waitStart > CLICK_TIMEOUT) {
          waitingForChange = false;
        } else {
          continue;
        }
      }

      // On last page and Next is disabled → wait for new round (which resets us to page 1)
      if (isLastPage && disabled) {
        if (Date.now() - lastDataTime > IDLE_STOP_MS) {
          elStatus.textContent = 'Status: Auto-stopped (no new data for 3 min)';
          M.stopReq = true;
          break;
        }
        elStatus.textContent = 'Status: On last page — waiting for new round...';
        continue;
      }

      // Can't advance for other reason
      if (disabled) continue;

      // Fast-forward mode: click extra fast, skip data wait
      if (M.fastMode) {
        nextBtn.click();
        await sleep(150);
        continue;
      }

      // Normal click
      waitingForChange = true;
      waitStart = Date.now();
      lastClickedPage = info.current;
      nextBtn.click();
    }

    M.active = false;
    M.fastMode = false;
    update();
  };

  // ---------- Wire buttons ----------
  btnStart.onclick = () => {
    if (M.active) {
      M.stopReq = true;
      btnStart.textContent = 'Stopping...';
      return;
    }
    M.stopReq = false;
    M.active = true;
    btnStart.textContent = 'Stop';
    btnStart.className = 'p';
    panel.classList.remove('err');
    update();
    runLoop().catch((e) => {
      console.error('[WGC]', e);
      elStatus.textContent = 'Status: Error - ' + (e.message || e);
      panel.classList.add('err');
    }).finally(() => {
      M.active = false;
      btnStart.textContent = 'Start Collection';
      btnStart.className = 's';
      update();
    });
  };

  btnDownload.onclick = () => {
    const arr = Object.values(M.rounds);
    if (!arr.length) { alert('No rounds collected yet!'); return; }
    arr.sort((a, b) => String(b.issueNumber).localeCompare(String(a.issueNumber)));
    const out = {
      data: {
        list: arr,
        pageNo: 1,
        totalPage: M.total || 1,
        totalCount: arr.length,
      },
      code: 0,
      msg: 'Succeed',
      msgCode: 0,
      serviceTime: Date.now(),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = FILENAME_PREFIX + Date.now() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  btnClose.onclick = () => {
    M.active = false;
    M.stopReq = true;
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origXhrOpen;
    XMLHttpRequest.prototype.send = origXhrSend;
    delete window.__cols;
    delete window.__wgcLoader;
    panel.remove();
    style.remove();
  };

  update();
  console.log('[WGC] WinGo History Collector ready (UI-click mode).');
})();