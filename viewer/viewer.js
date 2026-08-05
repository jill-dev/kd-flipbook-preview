(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const slug = params.get('auction') || 'south-bend';
  const outputBase = `../output/${slug}`;

  const bookEl = document.getElementById('book');
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

  const PAGE_W = 1000;
  // Was 1294 (portrait-ish, 1000:1294) -- on a typical wide-but-short browser
  // window or phone screen, that shape forces the book to be height-
  // constrained, rendering everything (including all body text) at a much
  // smaller scale than the available width would otherwise allow. 1100
  // keeps every template's actual content comfortably on-page (verified,
  // see templates/*.html) while meaningfully closing that gap.
  const PAGE_H = 1100;

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
    bidNowLink.href = data.siteUrl || '#';

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
    const resizeObserver = new ResizeObserver(applyPageScale);
    resizeObserver.observe(bookEl);
    resizeObserver.observe(document.querySelector('.kd-page-el'));

    pageFlip.on('init', () => {
      loadingEl.style.display = 'none';
      bookEl.style.visibility = 'visible';
      pageCountEl.textContent = data.pages.length;
      applyPageScale();
      updatePageUI();
      buildThumbnails(data);
      trackEvent('flipbook_open', { pageCount: data.pages.length });
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

  zoomInBtn.addEventListener('click', () => setZoom(Math.min(zoom + 0.2, 1.8)));
  zoomOutBtn.addEventListener('click', () => setZoom(Math.max(zoom - 0.2, 0.6)));
  function setZoom(z) {
    zoom = z;
    bookEl.style.transform = `scale(${zoom})`;
  }

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

  downloadBtn.addEventListener('click', () => trackEvent('pdf_download', {}));
})();
