/* mdsu-unblock.js
 * MDSU student dashboard: email-verification modal ko client-side hide karta hai.
 * Load: <script src="https://cdn.jsdelivr.net/gh/USER/REPO@main/mdsu-unblock.js"></script>
 * Sirf UI hide hota hai — backend verification check alag se lagega.
 */
(function () {
  'use strict';

  var STYLE_ID = 'mdsu-unblock-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.mantine-Modal-root,.mantine-Overlay-root,.mantine-Modal-inner{display:none!important}',
      'body{overflow:auto!important;position:static!important}',
      '.with-scroll-bars-hidden{overflow:auto!important;padding-right:0!important}'
    ].join('');
    document.head.appendChild(st);
  }

  function clearScrollLock() {
    document.body.classList.remove('with-scroll-bars-hidden');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.paddingRight = '';
    document.documentElement.style.overflow = '';
  }

  function removeModalNodes() {
    var nodes = document.querySelectorAll(
      '.mantine-Modal-root,.mantine-Overlay-root,.mantine-Modal-inner'
    );
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function clearAriaHidden() {
    var app = document.querySelector('.mantine-AppShell-root');
    if (!app) return;
    var hidden = document.querySelectorAll('[aria-hidden="true"]');
    for (var i = 0; i < hidden.length; i++) {
      if (hidden[i].contains(app)) hidden[i].removeAttribute('aria-hidden');
    }
  }

  function clean() {
    injectStyle();
    removeModalNodes();
    clearScrollLock();
    clearAriaHidden();
  }

  clean();

  // React late re-render pe modal DOM wapas la sakta hai —
  // CSS already usko hidden rakhega, bas scroll-lock dobara clear kar dete hain.
  document.addEventListener('click', function () {
    clearScrollLock();
  }, { passive: true });

  console.log('[mdsu-unblock] modal bypassed (client-side only)');
})();