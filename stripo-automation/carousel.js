// Builds Stripo's native AMP + CSS-checkbox-hack carousel markup for any
// number of photos, following the exact pattern Stripo's own editor
// generates (verified against a real 4-photo export — see README).
//
// The whole thing lives inside one <td class="esd-block-amp-carousel">.
// Every part scales with N except a couple of small static CSS rules that
// Stripo itself always caps at 3 clauses regardless of N (confirmed by
// diffing a 1-photo vs 4-photo export — those are left untouched here).

const CAROUSEL_ID = "carousel-7559";
const AMP_ID = "amp-carousel-7559";

function hopsToDiv(hops, target = "div") {
  return hops === 0 ? `+${target}` : `+${"*+".repeat(hops)}${target}`;
}

export function buildCarouselTd(photoUrls, { width = 320, height = 240 } = {}) {
  const photos = photoUrls.length ? photoUrls : [`https://placehold.co/${width}x${height}/2d2d2b/ddb305?text=Equipment+Photo`];
  const n = photos.length;

  const ampSlides = photos
    .map((url, i) => `<div class="slide-${i + 1}">\n          <div><amp-img src="${url}" layout="responsive" alt="" title="" height="${height}" width="${width}"></amp-img></div>\n      </div>`)
    .join("");

  const ampSelector = photos
    .map((url, i) => `<amp-img alt="" title="" height="40" width="60" src="${url}" option="${i}"${i === 0 ? " selected" : ""}></amp-img>`)
    .join("");

  const baseHideRule = photos.map((_, i) => `.${CAROUSEL_ID}-input:checked${hopsToDiv(i)} .carousel-image`).join(",");

  const showRule = photos
    .map((_, idx) => {
      const k = idx + 1;
      const hops = n - k;
      return `.${CAROUSEL_ID}-input-${k}:checked${hopsToDiv(hops)} .carousel-image-${k}`;
    })
    .join(",");

  const arrowRule = photos
    .map((_, idx) => {
      const k = idx + 1;
      const hops = n - k;
      const nextTarget = (k % n) + 1;
      const prevTarget = ((k - 2 + n) % n) + 1;
      return `.${CAROUSEL_ID}-input-${k}:checked${hopsToDiv(hops)} .carousel-next-${nextTarget},.${CAROUSEL_ID}-input-${k}:checked${hopsToDiv(hops)} .carousel-previous-${prevTarget}`;
    })
    .join(",");

  const thumbActiveRule = photos
    .map((_, idx) => {
      const k = idx + 1;
      const hops = n - k;
      return `.${CAROUSEL_ID}-input-${k}:checked${hopsToDiv(hops)} .${CAROUSEL_ID}-thumbnail-${k}`;
    })
    .join(",");

  const thumbHoverRule = photos
    .map((_, idx) => {
      const k = idx + 1;
      const hops = n - k;
      return `.${CAROUSEL_ID}-thumbnail-${k}:hover${hopsToDiv(hops, ".carousel-content")} .carousel-image-${k}`;
    })
    .join(",");

  const fallbackMainImg = photos[0];
  const fallbackThumbs = photos.map((url) => `<td class="es-p5r"><a><img src="${url}" alt="" width="61" height="40"></a></td>`).join("");

  const inputs = photos
    .map((_, i) => `<input class="${CAROUSEL_ID}-input ${CAROUSEL_ID}-input-${i + 1}" type="radio" name="${CAROUSEL_ID}-input" id="${CAROUSEL_ID}-input-${i + 1}" style="display:none;"${i === 0 ? " checked" : ""}>`)
    .join("");

  const thumbnails = photos
    .map((url, i) => `<label for="${CAROUSEL_ID}-input-${i + 1}" class="carousel-thumbnail ${CAROUSEL_ID}-thumbnail ${CAROUSEL_ID}-thumbnail-${i + 1}"><img style="display:block" src="${url}" height="40" width="61" alt=""></label>`)
    .join("");

  const prevLabels = photos.map((_, i) => `<label for="${CAROUSEL_ID}-input-${i + 1}" class="carousel-previous carousel-previous-${i + 1}"></label>`).join("");
  const nextLabels = photos.map((_, i) => `<label for="${CAROUSEL_ID}-input-${i + 1}" class="carousel-next carousel-next-${i + 1}"></label>`).join("");

  const imageDivs = photos
    .map((url, i) => `<div class="carousel-image carousel-image-${i + 1}"><img src="${url}" style="display:block;width:${width}px;max-width:100%;height:auto;" width="${width}" border="0" alt=""></div>`)
    .join("");

  return `<td align="left" class="esd-block-amp-carousel">
                <amp-carousel height="${height}" width="${width}" id="${AMP_ID}" on="slideChange:${AMP_ID}-selector.toggle(index=event.index, value=true)" controls layout="responsive" type="slides" class="es-visible-amp-html-only">
                    ${ampSlides}
                </amp-carousel><div class="carousel-preview es-visible-amp-html-only">
          <amp-selector layout="container" id="${AMP_ID}-selector" on="select:${AMP_ID}.goToSlide(index=event.targetOption)">
              ${ampSelector}
          </amp-selector>
      </div>
            <div id="htmlfallback" class="es-visible-simple-html-only"><style type="text/css">
      input.fallback_ctrl:checked~.container {
        display: block !important;
      }
      input.fallback_ctrl:checked~#fallback {
        display: none !important;
      }
      [owa] .container {
        display: none !important;
      }
      [class~="x_container"] {
        display: none !important;
      }
      [id~="x_fallback"] {
        display: block !important;
      }
      .carousel-previous-container label {
        background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEsAAABLBAMAAADKYGfZAAAAG1BMVEUAAAD////////////////////////////////rTT7CAAAACHRSTlMAn7+Az2AQcIgjE1sAAABrSURBVEjH7dEhDoAwEETRQRBsJZoTcIpqJLJXKamYY3OAIn5CwHS/bl66u4pGaCkirVmgya0QzM4EsxvCXBHmFFhgP2DX1nV02GN7h4Fnp19q8G9wUrQ3foXggvuYq0JcEuGqSGsSaVY0QjfDiZ+hLMomvgAAAABJRU5ErkJggg==');
      }
      .carousel-next-container label {
        background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEsAAABLBAMAAADKYGfZAAAAG1BMVEUAAAD////////////////////////////////rTT7CAAAACHRSTlMAn7+Az2AQcIgjE1sAAABsSURBVEjH7dEhDoAwEETRbgLoldWcgiMgCWcg4Rx1c2xIkFR8UTDd0T+vaTbFetiJqml1kh0qCJMAN0iEMwlxObjgvub2+TVVuEX1OcsKy7S11Jz9tNUZcmCB/YDZg5FHHWSGsJtzlI0p1sMuR3WfoQZCdoQAAAAASUVORK5CYII=');
      }
      .carousel-previous-container label,
      .carousel-next-container label {
        display: block;
        height: 100%;
        width: 100%;
        background-position: 50% 50%;
        background-repeat: no-repeat;
        background-size: 18px 18px;
        cursor: pointer;
      }
      .carousel-next,
      .carousel-previous {
        display: none !important;
      }
      .carousel-previous-container,
      .carousel-next-container {
        position: absolute;
        transform: translateY(-50%);
        display: none;
      }
      .carousel-thumbnail {
          border: 2px solid transparent;
          display: inline-block;
          overflow: hidden;
          cursor: pointer;
        }
      .es-fallback-thumbnail td {
        display: inline-block;
      }
      .es-fallback-thumbnail img {
        border: 2px solid transparent;
      }
      .carousel-content {
        width: 100%;
        text-align: center;
        position: relative;
        caption-side: top;
        display: table-caption;
        table-layout: fixed;
      }
      .carousel-image,
      .es-fallback-slide {
        overflow: hidden;
      }
      .carousel-previous-container {
        left: 16px;
      }
      .carousel-next-container {
        right: 16px;
      }

      ${baseHideRule} {
        display: none !important;
      }

      ${showRule} {
        display: block !important;
      }

      ${arrowRule} {
        display: block !important;
      }

      .${CAROUSEL_ID}-thumbnail:hover,
        ${thumbActiveRule} {
          border-color: #2cb543 !important;
        }

      .${CAROUSEL_ID}-thumbnail,
      .fallback-7559 .es-fallback-thumbnail img {
        border-color: #dddddd !important;
      }

      .${CAROUSEL_ID}-thumbnail:hover+*+*+.carousel-content .carousel-image,
           .${CAROUSEL_ID}-thumbnail:hover+*+.carousel-content .carousel-image,
           .${CAROUSEL_ID}-thumbnail:hover+.carousel-content .carousel-image {
              display: none !important;
            }

      ${thumbHoverRule} {
        display: block !important;
      }

      .${CAROUSEL_ID}-content .carousel-previous-container label,
      .${CAROUSEL_ID}-content .carousel-next-container label {
        border-radius: 0px;
        background-color: #0000007F;
      }
      .${CAROUSEL_ID}-content .carousel-previous-container,
      .${CAROUSEL_ID}-content .carousel-next-container {
        height: 34px;
        width: 34px;
        top: 50%;
      }
      .${CAROUSEL_ID}-thumbnail {
        height: 40px;
        border-radius: 0px;
        margin-right: 5px;
      }
      .fallback-7559 .es-fallback-thumbnail img {
        border-radius: 0px;
      }
      .fallback-7559 .es-fallback-thumbnail a {
        display: block;
        width: 40px;
        height: 40px;
        border-radius: 0px;
      }
      .${CAROUSEL_ID}-content .carousel-image,
      .fallback-7559 .es-fallback-slide {
        border-radius: 0px;
      }

      @media screen and (-webkit-min-device-pixel-ratio: 0) {
        .carousel-previous-container,
        .carousel-next-container {
          display: block;
        }
      }

      @media only screen and (max-width: 600px) {
        .${CAROUSEL_ID}-thumbnail {
          hieght: 40px;
        }
        .carousel-image img {
          width: 100% !important;
        }
        body[data-outlook-cycle] #fallback {
          display: block !important;
        }
        body[data-outlook-cycle] .container {
          display: none !important;
        }
      }
    </style><!--[if !mso]><!--><input type="checkbox" id="fallback_ctrl" class="fallback_ctrl" style="display:none !important;mso-hide:all;" checked><!--<![endif]--><!-- FALLBACK --><div id="fallback" class="fallback fallback-7559"><table width="100%" cellpadding="0" cellspasing="0"><tbody><tr align="center"><td class="es-p5b"><a><img src="${fallbackMainImg}" alt="" width="${width}" class="adapt-img es-fallback-slide"></a></td></tr><tr><td align="center"><table cellpadding="0" cellspasing="0" class="es-table-not-adapt es-fallback-thumbnail" align="center" style="text-align:center"><tbody><tr>${fallbackThumbs}</tr></tbody></table></td></tr></tbody></table></div><!-- /FALLBACK --><!-- INTERACTIVE ELEMENT --><!--[if !mso]><!--><div class="container" style="display:none;mso-hide:all;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%"><tbody><tr><td align="center">${inputs}<div style="display:table;width:100%;table-layout:fixed;text-align:center;font-size:0px">${thumbnails}<table class="carousel-content ${CAROUSEL_ID}-content" align="center" border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td style="padding:0;Margin:0;padding-bottom:5px"><div class="carousel-previous-container">${prevLabels}</div><div>${imageDivs}</div><div class="carousel-next-container">${nextLabels}</div></td></tr></tbody></table></div></td></tr></tbody></table></div><!--<![endif]--><!-- /INTERACTIVE ELEMENT --></div></td>`;
}
