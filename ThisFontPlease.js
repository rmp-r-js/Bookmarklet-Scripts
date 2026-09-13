(function () {
  // Toggle: agar already running hai toh destroy karke exit
  if (window.__wf) {
    window.__wf.destroy();
    return;
  }

  var root = document.body || document.documentElement;

  var tip = document.createElement('div');
  tip.style.cssText =
    'position:fixed;z-index:999999;background:rgba(0,0,0,.9);color:#fff;padding:9px 12px;border-radius:5px;font:12px/1.55 monospace;pointer-events:none;max-width:380px;max-height:70vh;overflow:auto;box-shadow:0 2px 12px rgba(0,0,0,.4);display:none;word-break:break-all;';
  root.appendChild(tip);

  var btn = document.createElement('div');
  btn.textContent = 'Exit WhatFont';
  btn.style.cssText =
    'position:fixed;top:10px;right:10px;z-index:1000000;background:#f44336;color:#fff;padding:6px 10px;border-radius:4px;font:12px sans-serif;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,.3);';
  root.appendChild(btn);

  var idx = {},
    seen = {},
    lastEl = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function norm(f) {
    return String(f || '').replace(/["']/g, '').trim().toLowerCase();
  }

  function abs(u) {
    try {
      return new URL(u, location.href).href;
    } catch (e) {
      return u;
    }
  }

  function add(fam, url, from) {
    fam = norm(fam);
    if (!fam || !url) return;
    var a = idx[fam] || (idx[fam] = []);
    for (var i = 0; i < a.length; i++) {
      if (a[i].url === url) return;
    }
    a.push({ url: url, from: from || '' });
  }

  function urlsIn(s) {
    var o = [],
      re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
      m;
    while ((m = re.exec(s))) {
      o.push(abs(m[2]));
    }
    return o;
  }

  function parseCss(text, href) {
    var re = /@font-face\s*{([^}]*)}/gi,
      m;
    while ((m = re.exec(text))) {
      var b = m[1],
        fm = /font-family\s*:\s*([^;]+)/i.exec(b),
        sm = /src\s*:\s*([^;]+)/i.exec(b);
      if (!fm) continue;
      var us = sm ? urlsIn(sm[1]) : [];
      if (us.length) {
        for (var k = 0; k < us.length; k++) {
          add(fm[1], us[k], href);
        }
      } else {
        add(fm[1], href, href);
      }
    }
  }

  function fetchSheet(href) {
    if (!href || seen[href]) return;
    seen[href] = 1;
    try {
      fetch(href)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          parseCss(t, href);
        })
        .catch(function () {});
    } catch (e) {}
  }

  function scan(rules, href) {
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.type === 5) {
          var fam = r.style.getPropertyValue('font-family') || r.style.fontFamily,
            src = r.style.getPropertyValue('src') || '',
            us = urlsIn(src);
          if (us.length) {
            for (var k = 0; k < us.length; k++) {
              add(fam, us[k], href);
            }
          } else if (href) {
            add(fam, href, href);
          }
        } else if (r.type === 3) {
          if (r.styleSheet) {
            scan(r.styleSheet.cssRules, r.styleSheet.href || r.href);
          } else {
            fetchSheet(r.href);
          }
        } else if (r.cssRules) {
          scan(r.cssRules, href);
        }
      } catch (e) {}
    }
  }

  function buildIndex() {
    var ls = document.querySelectorAll('link[href]');
    for (var i = 0; i < ls.length; i++) {
      var h = ls[i].href;
      if (!h) continue;
      if (/fonts\.googleapis\.com/.test(h)) {
        try {
          var d = decodeURIComponent(h),
            re = /[?&]family=([^&:]+)/g,
            f;
          while ((f = re.exec(d))) {
            add(f[1].replace(/\+/g, ' '), h, 'Google Fonts CSS');
          }
        } catch (e) {}
      }
    }
    var sh = document.styleSheets;
    for (var j = 0; j < sh.length; j++) {
      var s = sh[j],
        href = s.href || '';
      try {
        if (s.cssRules) {
          scan(s.cssRules, href);
        } else {
          fetchSheet(href);
        }
      } catch (e) {
        fetchSheet(href);
      }
    }
  }
  buildIndex();

  function famList(el) {
    return (getComputedStyle(el).fontFamily || '')
      .split(',')
      .map(function (s) {
        return s.replace(/["']/g, '').trim();
      })
      .filter(Boolean);
  }

  function render(el) {
    var s = getComputedStyle(el),
      list = famList(el),
      src = null,
      hit = null;
    for (var i = 0; i < list.length; i++) {
      var k = list[i].toLowerCase();
      if (idx[k] && idx[k].length) {
        src = idx[k];
        hit = list[i];
        break;
      }
    }
    var en =
      el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '');
    var h = '';
    h += '<div><b>Element:</b> ' + esc(en) + '</div>';
    h += '<div><b>Font-family:</b> ' + esc(s.fontFamily) + '</div>';
    h +=
      '<div><b>Size / weight / style:</b> ' +
      esc(s.fontSize) +
      ' / ' +
      esc(s.fontWeight) +
      ' / ' +
      esc(s.fontStyle) +
      '</div>';
    h += '<div><b>Color:</b> ' + esc(s.color) + '</div>';
    h +=
      '<div><b>Line-height:</b> ' +
      esc(s.lineHeight) +
      ' &nbsp; <b>Letter-spacing:</b> ' +
      esc(s.letterSpacing) +
      '</div>';
    h += '<div><b>Text-transform:</b> ' + esc(s.textTransform) + '</div>';
    h +=
      '<div style="margin-top:7px;border-top:1px solid #555;padding-top:7px"><b>Font source' +
      (hit ? ' - ' + esc(hit) : '') +
      ':</b></div>';
    if (src) {
      for (var j = 0; j < src.length && j < 4; j++) {
        var u = src[j].url;
        h +=
          '<div style="margin-top:3px">&bull; <a href="' +
          esc(u) +
          '" target="_blank" style="color:#7fd1ff;pointer-events:auto">' +
          esc(u.length > 70 ? u.slice(0, 67) + '...' : u) +
          '</a> <span data-copy="' +
          esc(u) +
          '" style="color:#9be59b;pointer-events:auto;cursor:pointer;text-decoration:underline">copy</span>' +
          (src[j].from && src[j].from !== u
            ? '<div style="color:#aaa;font-size:11px">via ' + esc(src[j].from) + '</div>'
            : '') +
          '</div>';
      }
      if (/fonts\.g(oogleapis|static)/i.test(src[0].url)) {
        h +=
          '<div style="margin-top:3px">&bull; <a href="https://fonts.google.com/specimen/' +
          encodeURIComponent(hit.replace(/\s+/g, '+')) +
          '" target="_blank" style="color:#7fd1ff;pointer-events:auto">Google Fonts specimen page</a></div>';
      }
    } else {
      h +=
        '<div style="color:#ffb86b">Not found in readable stylesheets. Probably a system font, a locally installed font, or a font served from a cross-origin sheet that blocked reading.</div>';
    }
    tip.innerHTML = h;
  }

  function place(e) {
    var x = e.clientX + 16,
      y = e.clientY + 16,
      w = tip.offsetWidth,
      h = tip.offsetHeight;
    if (x + w > innerWidth - 8) {
      x = Math.max(8, e.clientX - w - 16);
    }
    if (y + h > innerHeight - 8) {
      y = Math.max(8, e.clientY - h - 16);
    }
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function over(e) {
    var el = e.target;
    if (!el || !el.tagName || tip.contains(el) || el === btn) return;
    if (el === lastEl) return;
    lastEl = el;
    render(el);
    tip.style.display = 'block';
    place(e);
  }

  function copyVal(v, node) {
    function done() {
      var o = node.textContent;
      node.textContent = 'copied!';
      setTimeout(function () {
        node.textContent = o;
      }, 900);
    }
    function fb() {
      var ta = document.createElement('textarea');
      ta.value = v;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (e) {}
      ta.remove();
    }
    try {
      navigator.clipboard.writeText(v).then(done, function () {
        fb();
      });
    } catch (e) {
      fb();
    }
  }

  function onClick(e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-copy')) {
      e.preventDefault();
      e.stopPropagation();
      copyVal(t.getAttribute('data-copy'), t);
    }
  }

  function destroy() {
    document.removeEventListener('mouseover', over);
    document.removeEventListener('click', onClick, true);
    tip.remove();
    btn.remove();
    lastEl = null;
    window.__wf = null;
  }

  btn.addEventListener('click', destroy);
  document.addEventListener('mouseover', over);
  document.addEventListener('click', onClick, true);
  window.__wf = { destroy: destroy };
})();