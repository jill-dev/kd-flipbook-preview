/* Runs inside each catalog page's iframe. Forwards clicks on [data-kd-track]
   elements (Bid Now, featured lot cards, lot rows) up to the viewer, which
   owns the actual GA4 call. Keeps analytics logic in one place (viewer.js). */
(function () {
  document.addEventListener('click', function (e) {
    // Featured-lot cards: ask the viewer to flip to that lot's page
    var go = e.target.closest('[data-kd-goto]');
    if (go && window.parent !== window) {
      e.preventDefault();
      try { window.parent.postMessage({ kdFlipbookGoto: go.getAttribute('data-kd-goto') }, '*'); } catch (err) { /* no-op */ }
    }
    var el = e.target.closest('[data-kd-track]');
    if (!el) return;
    try {
      window.parent.postMessage(
        { kdFlipbookTrack: true, name: el.getAttribute('data-kd-track'), lot: el.getAttribute('data-lot') || null },
        '*'
      );
    } catch (err) {
      /* not embedded in the viewer (e.g. page opened directly) — no-op */
    }
  });
})();
