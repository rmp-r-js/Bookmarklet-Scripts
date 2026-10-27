/*!
 * WinGo History Collector
 * -----------------------------------------------------------------------------
 * Repo:   rmp-r-js/Bookmarklet-Scripts
 * File:   wingo-collector.js
 * Branch: main
 * CDN:    https://cdn.jsdelivr.net/gh/rmp-r-js/Bookmarklet-Scripts@main/wingo-collector.js
 *
 * Loader Bookmarklet (paste in bookmark URL field):
 * javascript:(()=>{if(window.__wgcLoader)return;window.__wgcLoader=1;const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/rmp-r-js/Bookmarklet-Scripts@main/wingo-collector.js?v='+Date.now();s.onerror=()=>{window.__wgcLoader=0;alert('WGC: failed to load (CSP?) — use inline bookmarklet');};document.body.appendChild(s)})();
 *
 * Hooks GetHistoryIssuePage (fetch + XHR), captures the first request as a
 * template, then replays it for pages 1..totalPage, dedupe by issueNumber.
 * -----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.__cols && document.getElementById('__cols')) {
    alert('WinGo Collector already running!');
    return;
  }

  const STYLE_ID = '__cols_style';
  const PANEL_ID = '__cols';
  const API_RE = /GetHistoryIssuePage/i;
  const FILENAME_PREFIX = 'WinGo_History_';

  // ---------- Inject CSS ----------
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #__cols {
      position: fixed; top: 10px; right: 10px; z-index: 2147483647;
      background: #1a1a2e; color: #fff; padding: 12px 16px;
      border-radius: 8px; font-family: Arial, sans-serif; font-size: 13px;
      box-shadow: 0 2px 12px rgba(0,0,0,.6); min-width: 240px;
    }
    #__cols button {
      display: block; width: 100%; margin-top: 6px; padding: 7px;
      border: none; border-radius: 4px; cursor: pointer;
      font-weight: bold; font-size: 13px;
    }
    #__cols .s { background: #4CAF50; color: #fff; }
    #__cols .p { background: #f44336; color: #fff; }
    #__cols .d { background: #2196F3; color: #fff; }
    #__cols .x {
      background: #555; color: #fff; font-size: 11px;
      padding: 3px 6px; width: auto; margin: 0;
    }
    #__cols .cnt { font-size: 22px; font-weight: bold; color: #4CAF50; }
    #__cols.err .cnt { color: #f44336; }
  `;
  document.head.appendChild(style);

  // ---------- Inject Panel ----------
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
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
    template: null,
    total: 0,
    currentPage: 0,
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
    elStatus.textContent = 'Status: ' +
      (M.active ? 'Collecting...' : (M.stopReq ? 'Stopped' : 'Idle'));
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

  // ---------- Capture template from first API request ----------
  const origFetch = window.fetch;

  const captureTemplate = (url, method, headers, credentials, mode, cache, redirect) => {
    if (M.template || !API_RE.test(url)) return;
    M.template = {
      url,
      init: {
        method: method || 'GET',
        headers: headers || {},
        credentials: credentials || 'same-origin',
        mode,
        cache,
        redirect,
      },
    };
    console.log('[WGC] Template captured:', url);
  };

  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    if (API_RE.test(url) && !M.template) {
      if (args[0] instanceof Request) {
        const r = args[0];
        const h = {};
        try { r.headers.forEach((v, k) => { h[k] = v; }); } catch (_) {}
        captureTemplate(r.url, r.method, h, r.credentials, r.mode, r.cache, r.redirect);
      } else {
        const init = args[1] || {};
        const h = {};
        if (init.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => { h[k] = v; });
          } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([k, v]) => { h[k] = v; });
          } else {
            Object.assign(h, init.headers);
          }
        }
        captureTemplate(args[0], init.method, h,
          init.credentials, init.mode, init.cache, init.redirect);
      }
    }
    const res = await origFetch.apply(this, args);
    if (M.active && API_RE.test(url) && res.ok) {
      try {
        const d = await res.clone().json();
        if (d && d.data && d.data.list) addData(d.data);
      } catch (_) {}
    }
    return res;
  };

  // ---------- XHR hooks ----------
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  const origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    this.__url = u;
    this.__method = m;
    this.__headers = {};
    return origXhrOpen.call(this, m, u, ...r);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (n, v) {
    if (this.__headers) this.__headers[n] = v;
    return origXhrSetHeader.call(this, n, v);
  };
  XMLHttpRequest.prototype.send = function (...a) {
    if (API_RE.test(this.__url || '') && !M.template) {
      captureTemplate(this.__url, this.__method, this.__headers, 'same-origin');
    }
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

  // ---------- Fetch a specific page using captured template ----------
  const fetchPage = async (n) => {
    if (!M.template) throw new Error('No template');
    let url = M.template.url;
    if (/[?&]pageNo=\d+/.test(url)) {
      url = url.replace(/([?&])pageNo=\d+/, '$1pageNo=' + n);
    } else {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'pageNo=' + n;
    }

    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 20000);
    try {
      const init = Object.assign({}, M.template.init, { signal: ctrl.signal });
      const res = await origFetch(url, init);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (d && d.data && d.data.list) addData(d.data);
      return d;
    } finally {
      clearTimeout(tm);
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitForTemplate = async (timeout = 65000) => {
    const s = Date.now();
    while (!M.template && Date.now() - s < timeout) {
      if (M.stopReq) return false;
      await sleep(200);
    }
    return !!M.template;
  };

  // ---------- Start collection ----------
  const startCollection = async () => {
    M.stopReq = false;
    M.active = true;
    btnStart.textContent = 'Stop';
    btnStart.className = 'p';
    update();
    try {
      if (!M.template) {
        elStatus.textContent = 'Status: Waiting for API request...';
        if (!await waitForTemplate()) {
          throw new Error('No API request detected. Reload page or click a tab.');
        }
      }
      let p = 1;
      while (p <= 500) {
        if (M.stopReq) break;
        elStatus.textContent = 'Status: Fetching page ' + p + '...';
        let d;
        try {
          d = await fetchPage(p);
        } catch (e) {
          console.warn('[WGC] retry page ' + p + ':', e.message);
          await sleep(1000);
          d = await fetchPage(p);
        }
        if (!d || !d.data) throw new Error('Bad response on page ' + p);
        const tp = d.data.totalPage || 1;
        if (p >= tp) break;
        p++;
        await sleep(250);
      }
      if (!M.stopReq) elStatus.textContent = 'Status: Complete!';
    } catch (e) {
      console.error('[WGC]', e);
      elStatus.textContent = 'Status: Error - ' + (e.message || e);
      panel.classList.add('err');
    } finally {
      M.active = false;
      btnStart.textContent = 'Start Collection';
      btnStart.className = 's';
      update();
    }
  };

  btnStart.onclick = () => {
    if (M.active) {
      M.stopReq = true;
      btnStart.textContent = 'Stopping...';
      return;
    }
    startCollection();
  };

  // ---------- Download JSON ----------
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

  // ---------- Cleanup ----------
  btnClose.onclick = () => {
    M.active = false;
    M.stopReq = true;
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origXhrOpen;
    XMLHttpRequest.prototype.send = origXhrSend;
    XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
    delete window.__cols;
    delete window.__wgcLoader;
    panel.remove();
    style.remove();
  };

  update();
  console.log('[WGC] WinGo History Collector ready.');
})();