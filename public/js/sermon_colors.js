/**
 * Inline colours inside sermon HTML (Nov 2026).
 *
 * Sermon notes carry colours that were never chosen for the sermon display:
 * text pasted from other pages keeps its source colour (rgb(44,44,43) …),
 * Chrome's own editing (drag-moving text) bakes the light editor's look into
 * style="" (white background, #17212B text), and the palette colours are picked
 * on the white editor. The sermon display paints the notes on its own
 * background (group setting, dark by default), where such text vanishes.
 *
 * Neutral colours (greys, near black / near white — "default text") are
 * dropped, real colours keep their hue and get a lightness that reads on the
 * background they are painted on (WCAG contrast >= 4.5).
 *
 *   SermonColors.cleanArtifacts(root)           editor: drop inline backgrounds, font
 *                                               families and neutral text colours
 *   SermonColors.fitToBackground(root, panelRgb) display: the same + fit the remaining
 *                                               colours (also inside chips); re-runnable
 *
 * Chips keep their inner styling (verse-comment highlights) in the editor;
 * slides, PPT pages, images and videos are never touched (own colours).
 */
(function () {
    'use strict';

    var NAMED = {
        black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
        blue: [0, 0, 255], yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128],
        silver: [192, 192, 192], maroon: [128, 0, 0], navy: [0, 0, 128], purple: [128, 0, 128],
        orange: [255, 165, 0], windowtext: [0, 0, 0]
    };
    var PROTECTED = '.sermon-slide, .sermon-ppt-slide, .sermon-img-wrap, .sermon-video-wrap';
    var CHIPS     = '.bible-cite, .message-cite';
    var TARGET    = 4.5;

    /** CSS colour string -> [r, g, b, a] or null (var(), inherit, … are not colours). */
    function parse(c) {
        if (!c) return null;
        c = String(c).trim().toLowerCase();
        var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,\/]+([\d.]+%?))?\s*\)$/.exec(c);
        if (m) {
            var a = m[4] === undefined ? 1 : (m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
            return [+m[1], +m[2], +m[3], a];
        }
        m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
        if (m) {
            var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
        }
        return NAMED[c] ? NAMED[c].concat([1]) : null;
    }

    function toHex(rgb) {
        return '#' + rgb.slice(0, 3).map(function (v) {
            return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
        }).join('');
    }

    function lum(rgb) {
        var a = rgb.slice(0, 3).map(function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function contrast(a, b) {
        var l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    /** Paint `top` (may be translucent) over the opaque `bottom`. */
    function over(top, bottom) {
        var a = top.length > 3 ? top[3] : 1;
        return [0, 1, 2].map(function (i) { return top[i] * a + bottom[i] * (1 - a); }).concat([1]);
    }

    function rgbToHsl(rgb) {
        var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return [h, s, l];
    }

    function hslToRgb(h, s, l) {
        if (s === 0) return [l * 255, l * 255, l * 255, 1];
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        function hue(t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }
        return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255, 1];
    }

    /** Greys and near black / near white: a "default text" colour, not a chosen one. */
    function isNeutral(rgb) {
        if (!rgb) return false;
        var chroma = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
        var l = rgbToHsl(rgb)[2];
        return chroma <= 24 || l < 0.15 || l > 0.92;
    }

    /** Same hue and saturation, lightness moved away from bg until contrast >= target. */
    function fit(rgb, bg, target) {
        target = target || TARGET;
        if (contrast(rgb, bg) >= target) return rgb.slice(0, 3).concat([1]);
        var hsl = rgbToHsl(rgb);
        var up = contrast([255, 255, 255], bg) >= contrast([0, 0, 0], bg);
        var best = up ? [255, 255, 255, 1] : [0, 0, 0, 1];
        for (var l = hsl[2]; up ? l <= 1 : l >= 0; l += up ? 0.02 : -0.02) {
            var c = hslToRgb(hsl[0], hsl[1], Math.max(0, Math.min(1, l)));
            if (contrast(c, bg) >= target) { best = c; break; }
        }
        return best;
    }

    /** The colour painted under el: its own and its ancestors' backgrounds over fallbackRgb. */
    function effectiveBg(el, fallbackRgb) {
        var layers = [];
        for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
            var b = parse(window.getComputedStyle(e).backgroundColor);
            if (b && b[3] > 0) {
                layers.push(b);
                if (b[3] >= 1) break;
            }
        }
        var c = (fallbackRgb || [43, 43, 43]).slice(0, 3).concat([1]);
        for (var i = layers.length - 1; i >= 0; i--) c = over(layers[i], c);
        return c;
    }

    function inlineColor(el) {
        return el.style.color || (el.tagName === 'FONT' ? el.getAttribute('color') : '') || '';
    }

    // The editor offers no highlight and no font choice: an inline background or
    // font family in the notes text is always copied from elsewhere (the light
    // editor's white paper and Georgia when Chrome moves text, a pasted page …).
    function dropArtifacts(el) {
        if (el.style.background || el.style.backgroundColor || el.style.backgroundImage) {
            el.style.removeProperty('background');
            el.style.removeProperty('background-color');
            el.style.removeProperty('background-image');
        }
        if (el.style.fontFamily) el.style.removeProperty('font-family');
        if (el.hasAttribute('bgcolor')) el.removeAttribute('bgcolor');
        if (el.tagName === 'FONT' && el.hasAttribute('face')) el.removeAttribute('face');
    }

    function tidy(el) {
        if (el.getAttribute('style') !== null && !el.getAttribute('style').trim()) el.removeAttribute('style');
    }

    function attrs(el) {
        return el.getAttribute('style') + '|' + el.getAttribute('color') + '|' + el.getAttribute('bgcolor');
    }

    /** Editor content: drop inline backgrounds and neutral text colours (attributes only — the
     *  DOM structure, and with it the caret, stays as it is). Returns the number of elements changed. */
    function cleanArtifacts(root) {
        var n = 0;
        if (!root) return n;
        root.querySelectorAll('[style], font[color], font[face], [bgcolor]').forEach(function (el) {
            if (el.closest(PROTECTED) || el.closest(CHIPS)) return;
            var before = attrs(el);
            dropArtifacts(el);
            if (isNeutral(parse(inlineColor(el)))) {
                el.style.removeProperty('color');
                if (el.tagName === 'FONT') el.removeAttribute('color');
            }
            tidy(el);
            if (attrs(el) !== before) n++;
        });
        return n;
    }

    function sameColor(a, b) {
        var x = parse(a), y = parse(b);
        if (!x || !y) return (a || '') === (b || '');
        return x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
    }

    /** Make every coloured run under root readable on the background colour panelRgb —
     *  for reading only: the original colour stays in data-sc-orig (<font>: its color
     *  attribute, never changed), the fitted one we set in data-sc-fit, so the run is
     *  re-runnable (settings arriving late, a theme switch) and originalHtml() can put
     *  the originals back. A colour changed meanwhile (the editor) becomes the original. */
    function fitToBackground(root, panelRgb) {
        if (!root) return;
        var todo = [];
        root.querySelectorAll('[style], font[color], font[face], [bgcolor], [data-sc-orig]').forEach(function (el) {
            if (el.closest(PROTECTED)) return;
            var inChip = !el.matches(CHIPS) && !!el.closest(CHIPS);
            var isFont = el.tagName === 'FONT';
            var orig;
            if (isFont) {
                orig = el.getAttribute('color') || '';
                el.style.removeProperty('color');           // our override of a previous run
            } else if (!el.hasAttribute('data-sc-orig')) {
                orig = el.style.color || '';
            } else {
                var cur = el.style.color || '';
                var ours = el.hasAttribute('data-sc-fit') ? el.getAttribute('data-sc-fit')
                                                           : el.getAttribute('data-sc-orig');
                orig = sameColor(cur, ours) || (!cur && isNeutral(parse(el.getAttribute('data-sc-orig'))))
                    ? el.getAttribute('data-sc-orig') : cur;
                if (orig) el.style.color = orig; else el.style.removeProperty('color');
            }
            el.setAttribute('data-sc-orig', orig);
            el.removeAttribute('data-sc-fit');
            if (!inChip) dropArtifacts(el);
            var rgb = parse(orig);
            if (rgb && !inChip && isNeutral(rgb)) {
                if (isFont) el.style.color = 'inherit'; else el.style.removeProperty('color');
                return;
            }
            if (rgb || (inChip && el.style.backgroundColor)) todo.push(el);
        });
        // Second pass: backgrounds are final now, so the painted colour under each run is known.
        todo.forEach(function (el) {
            var fg = parse(window.getComputedStyle(el).color);
            if (!fg) return;
            var bg = effectiveBg(el, panelRgb);
            if (contrast(fg, bg) < TARGET) {
                var c = toHex(fit(fg, bg, TARGET));
                el.style.color = c;
                el.setAttribute('data-sc-fit', c);
            }
        });
    }

    /** root's HTML with the original colours instead of the fitted ones and without the
     *  data-sc-* marks (what the editor saves and exports). Neutral originals outside
     *  chips are dropped on the way (as cleanArtifacts does). */
    function originalHtml(root) {
        var clone = root.cloneNode(true);
        clone.querySelectorAll('[data-sc-orig], [data-sc-fit]').forEach(function (el) {
            var orig = el.getAttribute('data-sc-orig') || '';
            var fitted = el.getAttribute('data-sc-fit');
            var inChip = !el.matches(CHIPS) && !!el.closest(CHIPS);
            el.removeAttribute('data-sc-orig');
            el.removeAttribute('data-sc-fit');
            if (el.tagName === 'FONT') {
                el.style.removeProperty('color');
                if (!inChip && isNeutral(parse(el.getAttribute('color')))) el.removeAttribute('color');
            } else {
                var cur = el.style.color || '';
                var keep = (fitted && sameColor(cur, fitted)) || !cur ? orig : cur;
                if (keep && (inChip || !isNeutral(parse(keep)))) el.style.color = keep;
                else el.style.removeProperty('color');
            }
            tidy(el);
        });
        return clone.innerHTML;
    }

    window.SermonColors = {
        parse: parse, toHex: toHex, contrast: contrast, over: over, isNeutral: isNeutral, fit: fit,
        effectiveBg: effectiveBg, cleanArtifacts: cleanArtifacts, fitToBackground: fitToBackground,
        originalHtml: originalHtml
    };
})();
