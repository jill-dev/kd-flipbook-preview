(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const slug = params.get('auction') || 'south-bend';
  const outputBase = `../output/${slug}`;

  const bookEl = document.getElementById('book');
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
  const PAGE_H = 1294;

  let pageFlip = null;
  let zoom = 1;
  let manifest = null;

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

    pageFlip = new St.PageFlip(bookEl, {
      width: PAGE_W,
      height: PAGE_H,
      size: 'stretch',
      minWidth: 180,
      maxWidth: PAGE_W,
      minHeight: 233,
      maxHeight: PAGE_H,
      maxShadowOpacity: 0.4,
      showCover: true,
      usePortrait: true,
      mobileScrollSupport: false,
      useMouseEvents: true,
    });

    pageFlip.loadFromHTML(document.querySelectorAll('.kd-page-el'));

    const resizeObserver = new ResizeObserver(applyPageScale);
    resizeObserver.observe(bookEl);

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
    const firstPage = bookEl.querySelector('.kd-page-el');
    if (!firstPage) return;
    const scale = firstPage.clientWidth ? firstPage.clientWidth / PAGE_W : 0.26;
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
