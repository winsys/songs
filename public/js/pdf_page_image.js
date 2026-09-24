/**
 * PDF page -> sheet-music JPEG, fully client-side (Sept 2026).
 *
 * The song edit dialog (tech console) accepts a PDF wherever it accepts a
 * JPG/PNG: one page of the PDF is rendered with the vendored pdf.js
 * (public/js/vendor/pdfjs, Apache-2.0, legacy build 4.10.38 — ES modules
 * renamed to .js so any Apache serves them with a JavaScript MIME type),
 * the white page margins are cropped away and the content is encoded as a
 * JPEG that goes through the existing image upload commands unchanged.
 *
 * Rules:
 *   - portrait pages only (a landscape page is refused, never rotated);
 *   - a multi-page PDF asks which page to take (1 page = 1 image);
 *   - the page's long side is rendered at ~3200 px before cropping, enough
 *     for a full-screen 11"/14" display in portrait orientation.
 *
 * pdf.js is loaded lazily (dynamic import) on the first PDF only.
 *
 * API: window.PdfPageImage.isPdf(file) -> bool
 *      window.PdfPageImage.fromFile(file) -> Promise<File|null>
 *        (null = the user cancelled the page question; a rejection carries
 *         an already translated message)
 */
(function () {
    'use strict';

    var LIB_URL    = '/js/vendor/pdfjs/pdf.min.js?v=4.10.38';
    var WORKER_URL = '/js/vendor/pdfjs/pdf.worker.min.js?v=4.10.38';

    var TARGET_LONG_PX = 3200;       // page long side before cropping
    var MAX_CANVAS_PX  = 16000000;   // stay below browser canvas area limits
    var INK_LUMA       = 200;        // darker than this = content (scan-noise tolerant)
    var EDGE_NOISE     = 0.003;      // edge ink cluster below this share of all ink = noise
    var PAD_RATIO      = 0.01;       // white border kept around the content
    var JPEG_QUALITY   = 0.88;

    var libPromise = null;

    function tr(key, params) {
        return window.t ? window.t(key, params) : key;
    }

    function fail(key, detail) {
        var e = new Error(tr(key) + (detail ? '\n' + detail : ''));
        e.translated = true;
        return e;
    }

    function loadLib() {
        if (!libPromise) {
            libPromise = import(LIB_URL).then(function (lib) {
                lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
                return lib;
            });
            // A failed load (network) must not be cached forever.
            libPromise.catch(function () { libPromise = null; });
        }
        return libPromise;
    }

    function isPdf(file) {
        return !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
    }

    /** Asks which page to import; 0 = cancelled. */
    function askPage(count) {
        var msg = tr('tech.esp.pdfPagePrompt', { count: count });
        var val = '1';
        for (;;) {
            val = window.prompt(msg, val);
            if (val === null) return 0;
            val = String(val).trim();
            var n = parseInt(val, 10);
            if (String(n) === val && n >= 1 && n <= count) return n;
            msg = tr('tech.esp.pdfPageInvalid', { count: count });
        }
    }

    /**
     * Content span along one axis from its ink projection. Ink runs closer
     * than `gap` form one cluster (a text line, a staff); edge clusters holding
     * less than EDGE_NOISE of all ink (scan specks, dust) are dropped.
     * Returns [start, end] or null when there is no ink.
     */
    function trimAxis(counts, gap) {
        var clusters = [], total = 0, cur = null, blank = 0;
        for (var i = 0; i < counts.length; i++) {
            if (counts[i]) {
                if (cur && blank < gap) {
                    cur.end = i;
                } else {
                    cur = { start: i, end: i, ink: 0 };
                    clusters.push(cur);
                }
                cur.ink += counts[i];
                total   += counts[i];
                blank = 0;
            } else {
                blank++;
            }
        }
        if (!total) return null;
        var a = 0, b = clusters.length - 1;
        while (a < b && clusters[a].ink < total * EDGE_NOISE) a++;
        while (b > a && clusters[b].ink < total * EDGE_NOISE) b--;
        return [clusters[a].start, clusters[b].end];
    }

    /** Bounding box of the page content (rows first, then columns inside them). */
    function contentBox(ctx, w, h) {
        var data  = ctx.getImageData(0, 0, w, h).data;
        var limit = INK_LUMA * 1000;
        var gap   = Math.max(4, Math.round(Math.max(w, h) * 0.006));
        var rows  = new Uint32Array(h);
        var x, y, i;
        for (y = 0, i = 0; y < h; y++) {
            for (x = 0; x < w; x++, i += 4) {
                if (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114 < limit) rows[y]++;
            }
        }
        var ys = trimAxis(rows, gap);
        if (!ys) return null;                            // blank page
        var cols = new Uint32Array(w);
        for (y = ys[0]; y <= ys[1]; y++) {
            for (x = 0, i = y * w * 4; x < w; x++, i += 4) {
                if (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114 < limit) cols[x]++;
            }
        }
        var xs = trimAxis(cols, gap);
        if (!xs) return null;
        return { x: xs[0], y: ys[0], w: xs[1] - xs[0] + 1, h: ys[1] - ys[0] + 1 };
    }

    function renderPage(page) {
        var base = page.getViewport({ scale: 1 });       // honours /Rotate
        if (base.width > base.height) {
            return Promise.reject(fail('tech.esp.pdfErrorLandscape'));
        }
        var scale = TARGET_LONG_PX / base.height;
        if (base.width * base.height * scale * scale > MAX_CANVAS_PX) {
            scale = Math.sqrt(MAX_CANVAS_PX / (base.width * base.height));
        }
        var vp = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        var w = canvas.width  = Math.floor(vp.width);
        var h = canvas.height = Math.floor(vp.height);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
            var box = contentBox(ctx, w, h);
            if (!box) throw fail('tech.esp.pdfErrorEmpty');
            var pad = Math.round(Math.max(box.w, box.h) * PAD_RATIO);
            var x0 = Math.max(0, box.x - pad);
            var y0 = Math.max(0, box.y - pad);
            var x1 = Math.min(w, box.x + box.w + pad);
            var y1 = Math.min(h, box.y + box.h + pad);

            var out = document.createElement('canvas');
            out.width  = x1 - x0;
            out.height = y1 - y0;
            var octx = out.getContext('2d');
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, out.width, out.height);
            octx.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
            canvas.width = canvas.height = 0;            // free the big bitmap early

            return new Promise(function (resolve, reject) {
                out.toBlob(function (blob) {
                    out.width = out.height = 0;
                    if (blob) resolve(blob);
                    else reject(fail('tech.esp.pdfErrorRead'));
                }, 'image/jpeg', JPEG_QUALITY);
            });
        });
    }

    function fromFile(file) {
        var pdf = null;
        return loadLib().catch(function (e) {
            throw fail('tech.esp.pdfErrorLib', e && e.message);
        }).then(function (lib) {
            return file.arrayBuffer().then(function (buf) {
                return lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
            }).catch(function (e) {
                throw fail('tech.esp.pdfErrorRead', e && e.message);
            });
        }).then(function (doc) {
            pdf = doc;
            var pageNo = pdf.numPages > 1 ? askPage(pdf.numPages) : 1;
            if (!pageNo) return null;
            return pdf.getPage(pageNo).then(renderPage).then(function (blob) {
                var name = (file.name || 'sheet').replace(/\.pdf$/i, '') + '_p' + pageNo + '.jpg';
                return new File([blob], name, { type: 'image/jpeg' });
            });
        }).then(function (result) {
            if (pdf) pdf.destroy();
            return result;
        }, function (e) {
            if (pdf) pdf.destroy();
            throw (e && e.translated) ? e : fail('tech.esp.pdfErrorRead', e && e.message);
        });
    }

    window.PdfPageImage = { isPdf: isPdf, fromFile: fromFile };
})();
