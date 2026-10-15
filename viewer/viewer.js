(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const slug = params.get('auction') || 'south-bend';
  const outputBase = `../output/${slug}`;

  let bookEl = document.getElementById('book'); // replaced when the book is rebuilt on resize
  const bookWrapEl = document.querySelector('.kd-book-wrap');
  const loadingEl = document.getElementById('loading');
  const titleEl = document.getElementById('auctionTitle');
  const pageNumEl = document.getElementById('pageNum');
  const pageCountEl = document.getElementById('pageCount');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const thumbsBtn = document.getElementById('thumbsBtn');
  const thumbRail = document.getElementById('thumbRail');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const shareBtn = document.getElementById('shareBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const bidNowLink = document.getElementById('bidNowLink');

  // Page size now comes from manifest.json (generate.js writes it) -- these
  // are just the defaults for older outputs that predate that.
  let PAGE_W = 1000;
  // Was 1294 (portrait-ish, 1000:1294) -- on a typical wide-but-short browser
  // window or phone screen, that shape forces the book to be height-
  // constrained, rendering everything (including all body text) at a much
  // smaller scale than the available width would otherwise allow. 1100
  // keeps every template's actual content comfortably on-page (verified,
  // see templates/*.html) while meaningfully closing that gap.
  let PAGE_H = 1100;

  let pageFlip = null;
  let zoom = 1;
  let manifest = null;
  let suppressNextFlipTrack = false;

  // ── Analytics ─────────────────────────────────────────────────────────
  // Standalone prototype: no real GA4 Measurement ID is wired in, so events
  // just log to console. Once this viewer is embedded on kdauctions.com,
  // set auction.json's "measurementId" to the site's real GA4 ID (already
  // G-556NGJE25M on the live site) and these calls fire through window.gtag
  // exactly like the rest of the site's tracking.
  function trackEvent(name, data) {
    const payload = { auction: slug, ...data };
    if (manifest && manifest.measurementId && typeof window.gtag === 'function') {
      window.gtag('event', name, payload);
    } else {
      console.log('[kd-flipbook analytics]', name, payload);
    }
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.kdFlipbookTrack) {
      trackEvent(e.data.name, { lot: e.data.lot, page: pageFlip ? pageFlip.getCurrentPageIndex() + 1 : null });
    }
  });

  // ── Load manifest + build pages ─────────────────────────────────────────
  fetch(`${outputBase}/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`manifest.json not found for "${slug}" — run: node generate.js examples/${slug}`);
      return r.json();
    })
    .then((data) => {
      manifest = data;
      init(data);
    })
    .catch((err) => {
      loadingEl.textContent = err.message;
      console.error(err);
    });

  function init(data) {
    titleEl.textContent = data.title || 'KD Auctions Catalog';
    document.title = (data.title ? data.title + ' — ' : '') + 'KD Auctions Catalog';
    bidNowLink.href = data.bidUrl || data.siteUrl || '#';
    if (data.pageWidth && data.pageHeight) {
      PAGE_W = data.pageWidth;
      PAGE_H = data.pageHeight;
    }
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--kd-page-w', PAGE_W + 'px');
    rootStyle.setProperty('--kd-page-h', PAGE_H + 'px');
    rootStyle.setProperty('--kd-page-ratio', `${PAGE_W} / ${PAGE_H}`);
    rootStyle.setProperty('--kd-thumb-scale', (THUMB_W / PAGE_W).toString());
    buildLotIndex(data);

    buildBook(data, 0, true);

    // Try to attach a PDF export if one has been generated for this auction.
    const pdfHref = `${outputBase}/catalog.pdf`;
    fetch(pdfHref, { method: 'HEAD' })
      .then((r) => {
        if (r.ok) {
          downloadBtn.href = pdfHref;
          downloadBtn.removeAttribute('disabled');
        } else {
          downloadBtn.style.opacity = '0.4';
          downloadBtn.title = 'PDF not generated yet — run: node export-pdf.js examples/' + slug;
          downloadBtn.addEventListener('click', (e) => e.preventDefault());
        }
      })
      .catch(() => {});
  }


  // ── Book (re)build ─────────────────────────────────────────────────────
  // page-flip measures the space it has once, when it's created, and never
  // grows or shrinks again on its own. So if the window changes size after
  // the page loads (restoring/snapping a browser window, rotating a phone,
  // opening the link in a small window first), the book stayed stuck at the
  // old size -- e.g. a tiny thumbnail in the corner. Fix: when the window
  // size really changes, tear the book down and build it again at the new
  // size, on the same page.
  let resizeObserver = null;
  function buildBook(data, startIndex, firstTime) {
    data.pages.forEach((pagePath, i) => {
      const pageEl = document.createElement('div');
      pageEl.className = 'kd-page-el';
      pageEl.dataset.pageIndex = i;

      const iframe = document.createElement('iframe');
      iframe.src = `${outputBase}/${pagePath}`;
      iframe.loading = i < 2 ? 'eager' : 'lazy';
      pageEl.appendChild(iframe);

      const leftZone = document.createElement('div');
      leftZone.className = 'kd-edge-zone left';
      leftZone.addEventListener('click', () => pageFlip && pageFlip.flipPrev());
      pageEl.appendChild(leftZone);

      const rightZone = document.createElement('div');
      rightZone.className = 'kd-edge-zone right';
      rightZone.addEventListener('click', () => pageFlip && pageFlip.flipNext());
      pageEl.appendChild(rightZone);

      bookEl.appendChild(pageEl);
    });

    // minWidth/minHeight decide a width threshold (2x minWidth) below which
    // the library forces single-page "portrait" mode, AND become a hard CSS
    // floor it forces via inline style on the book element — so a fixed
    // 500/647 (fine on desktop) forces the book wider than the screen on any
    // phone under ~500px, which then just gets cropped by .kd-book-wrap's
    // overflow:hidden. Measure the actual space .kd-book-wrap has right now
    // (already correctly fit-to-screen by its CSS, see viewer.css) and use
    // that as the floor instead, capped at the page's native 1000x1294 so it
    // never upscales past native res on large monitors either. Since the
    // floor is then always ~equal to the real available width, "e < 2x
    // minWidth" stays true regardless of device size, so this still always
    // renders single-page rather than flipping into a double-page spread.
    const wrapBox = bookWrapEl.getBoundingClientRect();
    const fitWidth = Math.min(PAGE_W, Math.max(200, Math.floor(wrapBox.width)));
    const fitHeight = Math.min(PAGE_H, Math.max(260, Math.floor(wrapBox.height)));

    pageFlip = new St.PageFlip(bookEl, {
      width: PAGE_W,
      height: PAGE_H,
      size: 'stretch',
      minWidth: fitWidth,
      maxWidth: PAGE_W,
      minHeight: fitHeight,
      maxHeight: PAGE_H,
      maxShadowOpacity: 0.4,
      showCover: true,
      usePortrait: true,
      mobileScrollSupport: false,
      useMouseEvents: true,
    });

    pageFlip.loadFromHTML(document.querySelectorAll('.kd-page-el'));

    // page-flip resizes its page elements on its own schedule — notably,
    // pageFlip.update() (called when the thumbnail sidebar opens/closes,
    // see below) applies its resize asynchronously rather than immediately,
    // so watching #book alone isn't enough to catch every size change.
    // Watch the actual page element so --kd-page-scale always tracks
    // whatever page-flip decides its real rendered size is, whenever that
    // settles.
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(applyPageScale);
    resizeObserver.observe(bookEl);
    resizeObserver.observe(document.querySelector('.kd-page-el'));

    pageFlip.on('init', () => {
      loadingEl.style.display = 'none';
      bookEl.style.visibility = 'visible';
      pageCountEl.textContent = data.pages.length;
      if (!firstTime) {
        if (startIndex) pageFlip.turnToPage(startIndex);
        applyPageScale();
        updatePageUI();
        return;
      }
      applyPageScale();
      updatePageUI();
      buildThumbnails(data);
      trackEvent('flipbook_open', { pageCount: data.pages.length });
      // Shared links like viewer/index.html?auction=logan#lot-150 open
      // straight to that lot.
      const m = location.hash.match(/^#lot-(.+)$/);
      if (m) goToLot(decodeURIComponent(m[1]), { instant: true });
      // Phones: a flipbook page is never going to be comfortable to read on
      // a ~390px-wide screen, so open the scrolling lot list by default
      // (the flipbook is one tap away).
      if (window.matchMedia('(max-width: 720px)').matches && lotsList.length) openLotList();
    });

    pageFlip.on('flip', () => {
      updatePageUI();
      // pageFlip.update() (called below when the thumbnail sidebar toggles)
      // fires this same 'flip' event internally even though the page didn't
      // actually change — confirmed via testing. Don't log a page_turn for
      // that; only for a real navigation.
      if (suppressNextFlipTrack) {
        suppressNextFlipTrack = false;
        return;
      }
      trackEvent('page_turn', { page: pageFlip.getCurrentPageIndex() + 1 });
    });

  }

  let lastSize = { w: window.innerWidth, h: window.innerHeight };
  let rebuildTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!pageFlip || !manifest || (Math.abs(w - lastSize.w) < 40 && Math.abs(h - lastSize.h) < 40)) return;
      lastSize = { w, h };
      rebuildBook();
    }, 250);
  });

  function rebuildBook() {
    const current = pageFlip.getCurrentPageIndex();
    setZoom(1);
    try { pageFlip.destroy(); } catch (err) { /* already gone */ }
    // destroy() removes the book element itself -- put a fresh one back
    const fresh = document.createElement('div');
    fresh.className = 'kd-book';
    fresh.id = 'book';
    fresh.style.visibility = 'hidden';
    bookWrapEl.querySelectorAll('#book').forEach((el) => el.remove());
    bookWrapEl.appendChild(fresh);
    bookEl = fresh;
    buildBook(manifest, current, false);
  }

  function applyPageScale() {
    // page-flip only keeps the currently-shown page at real size — every
    // other page collapses to width 0 / display:none. Querying "the first
    // .kd-page-el" (as opposed to specifically the visible one) used to work
    // only by accident, because this only ever ran once, on init, while page
    // 1 (first in DOM order) still happened to be the one on screen.
    // Confirmed via testing: navigate away from page 1 and it stops being
    // true, so search for whichever page actually has real width instead.
    const activePage = Array.from(bookEl.querySelectorAll('.kd-page-el')).find((el) => el.clientWidth > 0);
    if (!activePage) return;
    const scale = activePage.clientWidth / PAGE_W;
    bookEl.style.setProperty('--kd-page-scale', scale);
  }

  function updatePageUI() {
    const current = pageFlip.getCurrentPageIndex() + 1;
    pageNumEl.textContent = current;
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= pageFlip.getPageCount();
    document.querySelectorAll('.kd-thumb').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.index) + 1 === current);
    });
  }

  function buildThumbnails(data) {
    thumbRail.innerHTML = '';
    data.pages.forEach((pagePath, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'kd-thumb';
      thumb.dataset.index = i;
      const iframe = document.createElement('iframe');
      iframe.loading = 'lazy';
      iframe.src = `${outputBase}/${pagePath}`;
      thumb.appendChild(iframe);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      thumb.appendChild(num);
      thumb.addEventListener('click', () => {
        pageFlip.flip(i);
        thumbRail.hidden = true;
      });
      thumbRail.appendChild(thumb);
    });
  }

  // ── Controls ─────────────────────────────────────────────────────────
  prevBtn.addEventListener('click', () => pageFlip && pageFlip.flipPrev());
  nextBtn.addEventListener('click', () => pageFlip && pageFlip.flipNext());

  document.addEventListener('keydown', (e) => {
    if (!pageFlip) return;
    if (e.target.closest && e.target.closest('input')) return;
    if (!lotPanel.hidden) { if (e.key === 'Escape') closeLotList(); return; }
    if (e.key === 'ArrowLeft') pageFlip.flipPrev();
    if (e.key === 'ArrowRight') pageFlip.flipNext();
  });

  thumbsBtn.addEventListener('click', () => {
    thumbRail.hidden = !thumbRail.hidden;
    // The thumbnail rail is now a real flex sibling of the book (a collapsible
    // side panel, not an overlay), so showing/hiding it can change how much
    // width the book actually has. page-flip doesn't watch for that on its
    // own — ask it to re-measure. (--kd-page-scale then gets recomputed by
    // the ResizeObserver above once the resize actually lands — it's
    // asynchronous, not immediate, so don't assume it's done right here.)
    if (pageFlip) {
      suppressNextFlipTrack = true;
      pageFlip.update();
    }
  });

  // ── Zoom + pan ──────────────────────────────────────────────────────────
  // `bookEl.style.transform = scale()` alone (the old implementation) was
  // effectively a dead button: .kd-stage/.kd-book-wrap/.kd-book all clip
  // overflow (needed for the normal fit-to-screen view), and a CSS
  // transform doesn't change an element's layout size, so there was no way
  // to actually reach the parts that scaled off the edge.
  //
  // Deliberately not relying on the browser's native pinch-zoom either --
  // confirmed the real embed (a position:fixed modal on kdauctions.com) is
  // a well-known case where native mobile pinch-zoom doesn't reliably pan
  // afterward. This implements drag-to-pan itself instead.
  //
  // First attempt at this listened for pointer events directly on
  // .kd-book-wrap -- confirmed via real event-dispatch testing (not
  // assumed) that this never fires: the visible page content is a same-
  // origin <iframe> (see .kd-page-el), and a click/touch landing on
  // content INSIDE an iframe is dispatched into that iframe's OWN document,
  // full stop -- it does not bubble into the parent page's DOM at all, by
  // basic web platform design, regardless of capture phase or
  // stopPropagation. So the pan/pinch logic needs to run on something that
  // actually lives in THIS document, on top of the iframe.
  //
  // Fix: a transparent overlay, added only while zoom > 1 (removed again at
  // zoom 1), sitting above the iframe and catching all pointer events
  // itself. Scoping it to "only while zoomed" (rather than always present)
  // is deliberate -- at the default zoom, nothing should get in the way of
  // normal in-page links (e.g. a lot's "Bid Now") or whatever swipe
  // handling page-flip does on its own; the trade-off (can't click through
  // to a link while zoomed in) is the same one most image/PDF viewers make.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  let panX = 0;
  let panY = 0;
  let panOverlay = null;

  function applyZoomTransform() {
    bookEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  // Keeps the zoomed book from being dragged so far that it leaves a gap
  // between its edge and the wrap's edge on the other side.
  function clampPan() {
    const wrap = bookWrapEl.getBoundingClientRect();
    const extraX = (wrap.width * (zoom - 1)) / 2;
    const extraY = (wrap.height * (zoom - 1)) / 2;
    panX = Math.max(-extraX, Math.min(extraX, panX));
    panY = Math.max(-extraY, Math.min(extraY, panY));
  }

  function ensurePanOverlay() {
    if (panOverlay) return;
    panOverlay = document.createElement('div');
    panOverlay.className = 'kd-pan-overlay';
    bookWrapEl.appendChild(panOverlay);

    const activePointers = new Map();
    let dragStart = null;
    let pinchStartDist = null;
    let pinchStartZoom = 1;

    function pointerList() { return [...activePointers.values()]; }
    function pointerDistance(pts) { return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); }

    panOverlay.addEventListener('pointerdown', (e) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        // A 2nd finger landing mid-drag turns this into a pinch -- drop any
        // single-pointer capture from the first one, it'd otherwise keep
        // routing that pointer's move events here as if still dragging.
        if (dragStart) { try { panOverlay.releasePointerCapture(dragStart.pointerId); } catch { /* already released */ } }
        dragStart = null;
        pinchStartDist = pointerDistance(pointerList());
        pinchStartZoom = zoom;
      } else if (activePointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, panX, panY, pointerId: e.pointerId };
        // setPointerCapture keeps receiving this pointer's move/up events
        // even if it drifts outside the overlay's bounds mid-drag -- only
        // valid for a pointer that's actually down (single-finger case),
        // and synthetic/edge-case pointers can still reject it, so this
        // stays best-effort rather than something a real drag depends on.
        try { panOverlay.setPointerCapture(e.pointerId); } catch { /* not critical */ }
      }
    });

    panOverlay.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2 && pinchStartDist) {
        setZoom(pinchStartZoom * (pointerDistance(pointerList()) / pinchStartDist));
      } else if (activePointers.size === 1 && dragStart) {
        panX = dragStart.panX + (e.clientX - dragStart.x);
        panY = dragStart.panY + (e.clientY - dragStart.y);
        clampPan();
        applyZoomTransform();
      }
    });

    function endPointer(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) pinchStartDist = null;
      if (activePointers.size < 1) dragStart = null;
    }
    panOverlay.addEventListener('pointerup', endPointer);
    panOverlay.addEventListener('pointercancel', endPointer);
    panOverlay.addEventListener('dblclick', () => setZoom(ZOOM_MIN));
  }

  function removePanOverlay() {
    if (!panOverlay) return;
    panOverlay.remove();
    panOverlay = null;
  }

  function setZoom(z) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (zoom === ZOOM_MIN) { panX = 0; panY = 0; }
    clampPan();
    applyZoomTransform();
    bookWrapEl.classList.toggle('kd-zoomed', zoom > ZOOM_MIN);
    zoomOutBtn.disabled = zoom <= ZOOM_MIN;
    zoomInBtn.disabled = zoom >= ZOOM_MAX;
    if (zoom > ZOOM_MIN) ensurePanOverlay();
    else removePanOverlay();
  }

  zoomInBtn.addEventListener('click', () => setZoom(zoom + 0.5));
  zoomOutBtn.addEventListener('click', () => setZoom(zoom - 0.5));

  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  shareBtn.addEventListener('click', () => {
    const url = location.href;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        const original = shareBtn.textContent;
        shareBtn.textContent = 'Link Copied!';
        setTimeout(() => (shareBtn.textContent = original), 1500);
      })
      .catch(() => {});
  });

  // ── Lot index: "Go to lot" box + searchable lot list ───────────────────
  // With 500+ lots, flipping page by page to find one machine is painful.
  // manifest.lots (written by generate.js) maps every lot to its page.
  const THUMB_W = 124;
  let lotsList = [];
  const lotByNumber = new Map();
  const lotPanel = document.getElementById('lotPanel');
  const lotSearch = document.getElementById('lotSearch');
  const lotResults = document.getElementById('lotResults');
  const lotCount = document.getElementById('lotCount');
  const lotListBtn = document.getElementById('lotListBtn');
  const lotPanelClose = document.getElementById('lotPanelClose');
  const gotoForm = document.getElementById('gotoForm');
  const gotoInput = document.getElementById('gotoInput');

  function buildLotIndex(data) {
    lotsList = data.lots || [];
    lotsList.forEach((l) => lotByNumber.set(String(l.lot).toLowerCase(), l));
    if (!lotsList.length) {
      lotListBtn.hidden = true;
      gotoForm.hidden = true;
    }
  }

  function goToLot(lotNo, opts = {}) {
    const lot = lotByNumber.get(String(lotNo).trim().toLowerCase().replace(/^#/, ''));
    if (!lot || lot.page == null || !pageFlip) return false;
    closeLotList();
    if (opts.instant) pageFlip.turnToPage(lot.page);
    else pageFlip.flip(lot.page);
    if (opts.instant) updatePageUI();
    highlightLot(lot);
    trackEvent('lot_jump', { lot: lot.lot });
    return true;
  }

  // Briefly outline the lot's card on its page so the eye lands on it.
  function highlightLot(lot) {
    const pageEl = bookEl.querySelector(`.kd-page-el[data-page-index="${lot.page}"] iframe`);
    if (!pageEl) return;
    const flash = () => {
      try {
        const card = pageEl.contentDocument && pageEl.contentDocument.getElementById('lot-' + lot.lot);
        if (!card) return;
        card.style.transition = 'box-shadow 0.3s, border-color 0.3s';
        card.style.boxShadow = '0 0 0 4px #ddb305, 0 0 30px rgba(221,179,5,0.55)';
        card.style.borderColor = '#ddb305';
        setTimeout(() => { card.style.boxShadow = ''; card.style.borderColor = ''; }, 2200);
      } catch (err) { /* cross-origin (shouldn't happen) -- skip the flash */ }
    };
    if (pageEl.contentDocument && pageEl.contentDocument.readyState === 'complete' && pageEl.contentDocument.getElementById('lot-' + lot.lot)) setTimeout(flash, 650);
    else pageEl.addEventListener('load', () => setTimeout(flash, 300), { once: true });
  }

  gotoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = gotoInput.value.trim();
    if (!v) return;
    if (goToLot(v)) {
      gotoInput.value = '';
      gotoInput.blur();
    } else {
      gotoInput.classList.add('kd-shake');
      setTimeout(() => gotoInput.classList.remove('kd-shake'), 500);
    }
  });

  let listRendered = false;
  function renderLotList(filter) {
    const q = (filter || '').trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const matches = lotsList.filter((l) => {
      if (!words.length) return true;
      const hay = (`lot ${l.lot} ` + (l.title || '') + ' ' + l.description + ' ' + (l.location || '')).toLowerCase();
      return words.every((w) => hay.includes(w)) || String(l.lot).toLowerCase() === q.replace(/^#|^lot\s*/, '');
    });
    lotCount.textContent = words.length ? `${matches.length} of ${lotsList.length} lots` : `${lotsList.length} lots`;
    const frag = document.createDocumentFragment();
    matches.forEach((l) => {
      const row = document.createElement('div');
      row.className = 'kd-lotrow';
      const bid = l.bidUrl || (manifest && (manifest.bidUrl || manifest.siteUrl)) || '#';
      row.innerHTML =
        `<button class="kd-lotrow-main" type="button">` +
          (l.photo ? `<img loading="lazy" src="${outputBase}/${l.photo}" alt="" />` : `<span class="kd-lotrow-noimg"></span>`) +
          `<span class="kd-lotrow-text"><span class="kd-lotrow-no">LOT ${escapeHtml(l.lot)}</span>` +
          (l.location ? `<span class="kd-lotrow-loc">${escapeHtml(l.location)}</span>` : '') +
          `<span class="kd-lotrow-desc">${escapeHtml(l.description)}</span></span>` +
        `</button>` +
        `<a class="kd-lotrow-bid" href="${escapeHtml(bid)}" target="_blank" rel="noopener">Bid &#8594;</a>`;
      row.querySelector('.kd-lotrow-main').addEventListener('click', () => goToLot(l.lot));
      row.querySelector('.kd-lotrow-bid').addEventListener('click', () => trackEvent('lot_click', { lot: l.lot, from: 'list' }));
      frag.appendChild(row);
    });
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'kd-lot-empty';
      empty.textContent = 'No lots match that search.';
      frag.appendChild(empty);
    }
    lotResults.replaceChildren(frag);
    listRendered = true;
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function openLotList() {
    if (!listRendered) renderLotList(lotSearch.value);
    lotPanel.hidden = false;
    lotListBtn.classList.add('active');
    if (!window.matchMedia('(max-width: 720px)').matches) lotSearch.focus();
    trackEvent('lot_list_open', {});
  }
  function closeLotList() {
    lotPanel.hidden = true;
    lotListBtn.classList.remove('active');
  }

  lotListBtn.addEventListener('click', () => (lotPanel.hidden ? openLotList() : closeLotList()));
  lotPanelClose.addEventListener('click', closeLotList);
  let searchTimer = null;
  lotSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderLotList(lotSearch.value), 120);
  });
  lotSearch.addEventListener('keydown', (e) => {
    // Enter on an exact lot number jumps straight there
    if (e.key === 'Enter' && goToLot(lotSearch.value.replace(/^lot\s*/i, ''))) lotSearch.value = '';
  });

  // Featured-lot cards on the cover (inside the page iframe) ask to jump
  window.addEventListener('message', (e) => {
    if (e.data && e.data.kdFlipbookGoto != null) goToLot(e.data.kdFlipbookGoto);
  });

  downloadBtn.addEventListener('click', () => trackEvent('pdf_download', {}));
})();
