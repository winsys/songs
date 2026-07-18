/**
 * drawio_import.js — client-side draw.io (.drawio / mxGraph XML) → SVG converter.
 *
 * Used by the sermon prep editor to import diagram pages as slides.
 * No third-party dependencies: compressed pages are inflated with the
 * browser-native DecompressionStream('deflate-raw').
 *
 * Public API:
 *   window.DrawioImport.parse(fileText)
 *     → Promise<[{ name, svg, background, bytes, oversize }]>
 *        name       — diagram page name
 *        svg        — self-contained inline <svg> markup (responsive)
 *        background — page background color ('#rrggbb') or null
 *        bytes      — UTF-8 size of the svg string
 *        oversize   — true when the svg may not fit the `current.text` column (64 KB)
 *
 * Supported subset (a full mxGraph renderer is out of scope):
 *   - shapes: rectangle (incl. rounded), ellipse, double ellipse, rhombus,
 *     triangle (direction-aware), hexagon, parallelogram, step, card, note,
 *     process, cylinder, swimlane, line, text, image (data:/http URLs);
 *     unknown shapes fall back to a rounded rectangle with the label kept
 *   - fill/stroke/font colors, stroke width, dashed lines, opacity,
 *     linear gradients, shadow, rotation, bold/italic/underline
 *   - labels: plain text and HTML labels (sanitized), align/verticalAlign,
 *     whiteSpace=wrap, labelPosition/verticalLabelPosition (top/bottom)
 *   - edges: straight and waypoint routes, simple orthogonal elbows,
 *     exit/entry anchors, perimeter clipping (rect/ellipse/rhombus),
 *     start/end arrows (classic, block, open, oval, diamond), edge labels
 *   - multi-page files → one result per page; compressed and uncompressed
 */
(function () {
    'use strict';

    /** i18n helper — falls back to the raw key when i18n.js is not loaded. */
    function _t(key, params) {
        return (typeof window.t === 'function') ? window.t(key, params) : key;
    }

    // ──────────────────────────────────────────────────────────
    // Small helpers
    // ──────────────────────────────────────────────────────────

    function num(v, dflt) {
        var n = parseFloat(v);
        return isNaN(n) ? dflt : n;
    }

    /** Format a coordinate with max 2 decimals (keeps the SVG compact). */
    function fmt(n) {
        return String(Math.round(n * 100) / 100);
    }

    function escapeXml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Resolve a drawio color value.
     * 'none' stays 'none'; absent / 'default' / 'inherit' → fallback.
     */
    function color(v, dflt) {
        if (v == null || v === '' || v === 'default' || v === 'inherit') return dflt;
        if (v === 'none') return 'none';
        return v;
    }

    /** Normalize '#abc'/'#aabbcc' to '#aabbcc'; anything else → null. */
    function normHex(v) {
        if (typeof v !== 'string') return null;
        var m = v.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
        if (!m) return null;
        var h = m[1];
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return '#' + h.toLowerCase();
    }

    // ──────────────────────────────────────────────────────────
    // Decompression of compressed <diagram> payloads
    // (base64 → raw deflate → URI-encoded XML)
    // ──────────────────────────────────────────────────────────

    function inflateB64(b64) {
        var bin;
        try {
            bin = atob(b64.replace(/\s+/g, ''));
        } catch (e) {
            return Promise.reject(new Error(_t('prep.drawio.badFormat')));
        }
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        if (typeof DecompressionStream === 'undefined') {
            return Promise.reject(new Error(_t('prep.drawio.noDecompress')));
        }
        var stream = new Blob([bytes]).stream()
            .pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (buf) {
            var str = new TextDecoder().decode(buf);
            try { return decodeURIComponent(str); } catch (e) { return str; }
        }, function () {
            throw new Error(_t('prep.drawio.badFormat'));
        });
    }

    // ──────────────────────────────────────────────────────────
    // mxGraph model parsing
    // ──────────────────────────────────────────────────────────

    /** 'rounded=1;fillColor=#fff' → {rounded:'1', fillColor:'#fff', _shape:...} */
    function parseStyle(str) {
        var map = { _shape: null };
        String(str || '').split(';').forEach(function (tok, idx) {
            if (!tok) return;
            var eq = tok.indexOf('=');
            if (eq < 0) {
                if (idx === 0) map._shape = tok; else map[tok] = '1';
            } else {
                map[tok.slice(0, eq)] = tok.slice(eq + 1);
            }
        });
        if (map.shape) map._shape = map.shape;
        return map;
    }

    function readGeometry(cellEl) {
        var g = null, i;
        for (i = 0; i < cellEl.children.length; i++) {
            if (cellEl.children[i].nodeName === 'mxGeometry') { g = cellEl.children[i]; break; }
        }
        if (!g) return null;
        var geo = {
            x: num(g.getAttribute('x'), 0),
            y: num(g.getAttribute('y'), 0),
            w: num(g.getAttribute('width'), 0),
            h: num(g.getAttribute('height'), 0),
            relative: g.getAttribute('relative') === '1',
            points: [], sourcePoint: null, targetPoint: null, offset: null
        };
        for (i = 0; i < g.children.length; i++) {
            var ch = g.children[i];
            if (ch.nodeName === 'mxPoint') {
                var pt = { x: num(ch.getAttribute('x'), 0), y: num(ch.getAttribute('y'), 0) };
                var as = ch.getAttribute('as');
                if (as === 'sourcePoint') geo.sourcePoint = pt;
                else if (as === 'targetPoint') geo.targetPoint = pt;
                else if (as === 'offset') geo.offset = pt;
            } else if (ch.nodeName === 'Array' && ch.getAttribute('as') === 'points') {
                for (var j = 0; j < ch.children.length; j++) {
                    var p = ch.children[j];
                    if (p.nodeName === 'mxPoint') {
                        geo.points.push({ x: num(p.getAttribute('x'), 0), y: num(p.getAttribute('y'), 0) });
                    }
                }
            }
        }
        return geo;
    }

    /**
     * Read all cells of an mxGraphModel.
     * Handles both plain <mxCell> and wrapped <object>/<UserObject label=...> cells.
     */
    function readCells(model) {
        var rootEl = null, i;
        for (i = 0; i < model.children.length; i++) {
            if (model.children[i].nodeName === 'root') { rootEl = model.children[i]; break; }
        }
        var cells = [], byId = {};
        if (!rootEl) return { cells: cells, byId: byId };

        for (i = 0; i < rootEl.children.length; i++) {
            var el = rootEl.children[i];
            var cellEl = null, label = '', id = null;
            if (el.nodeName === 'mxCell') {
                cellEl = el;
                label = el.getAttribute('value') || '';
                id = el.getAttribute('id');
            } else {
                // <object>/<UserObject> wrapper: label attr + inner mxCell
                for (var j = 0; j < el.children.length; j++) {
                    if (el.children[j].nodeName === 'mxCell') { cellEl = el.children[j]; break; }
                }
                if (!cellEl) continue;
                label = el.getAttribute('label') || '';
                id = el.getAttribute('id') || cellEl.getAttribute('id');
            }
            var c = {
                id: id,
                order: cells.length,
                parent: cellEl.getAttribute('parent'),
                vertex: cellEl.getAttribute('vertex') === '1',
                edge: cellEl.getAttribute('edge') === '1',
                visible: cellEl.getAttribute('visible') !== '0',
                style: parseStyle(cellEl.getAttribute('style')),
                label: label,
                source: cellEl.getAttribute('source'),
                target: cellEl.getAttribute('target'),
                geo: readGeometry(cellEl),
                abs: null
            };
            cells.push(c);
            if (c.id != null) byId[c.id] = c;
        }
        return { cells: cells, byId: byId };
    }

    /** Sum of ancestor vertex offsets (group containers). Layers contribute 0. */
    function parentOffset(cell, byId) {
        var ox = 0, oy = 0, guard = 0;
        var p = byId[cell.parent];
        while (p && guard++ < 64) {
            if (p.vertex && p.geo && !p.geo.relative) { ox += p.geo.x; oy += p.geo.y; }
            p = byId[p.parent];
        }
        return { x: ox, y: oy };
    }

    function isHidden(cell, byId) {
        var c = cell, guard = 0;
        while (c && guard++ < 64) {
            if (!c.visible) return true;
            c = byId[c.parent];
        }
        return false;
    }

    // ──────────────────────────────────────────────────────────
    // Geometry helpers (edge endpoints)
    // ──────────────────────────────────────────────────────────

    function center(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

    /** Perimeter kind used for edge clipping. */
    function shapeKind(style) {
        var s = style._shape;
        if (s === 'ellipse' || s === 'doubleEllipse' || s === 'cloud') return 'ellipse';
        if (s === 'rhombus') return 'rhombus';
        return 'rect';
    }

    /** Point on the shape perimeter on the segment center→toward. */
    function perimeterPoint(r, kind, toward) {
        var c = center(r);
        var dx = toward.x - c.x, dy = toward.y - c.y;
        if (dx === 0 && dy === 0) return c;
        var t;
        if (kind === 'ellipse') {
            var rx = r.w / 2 || 1, ry = r.h / 2 || 1;
            t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
        } else if (kind === 'rhombus') {
            var qx = Math.abs(dx) / (r.w / 2 || 1), qy = Math.abs(dy) / (r.h / 2 || 1);
            t = 1 / (qx + qy);
        } else {
            var mx = Math.abs(dx) / (r.w / 2 || 1), my = Math.abs(dy) / (r.h / 2 || 1);
            t = 1 / Math.max(mx, my);
        }
        if (!isFinite(t)) return c;
        t = Math.min(t, 1);
        return { x: c.x + dx * t, y: c.y + dy * t };
    }

    function routeLength(pts) {
        var len = 0;
        for (var i = 1; i < pts.length; i++) {
            len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        }
        return len;
    }

    function pointAlong(pts, dist) {
        for (var i = 1; i < pts.length; i++) {
            var seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (dist <= seg && seg > 0) {
                var k = dist / seg;
                return {
                    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
                    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k
                };
            }
            dist -= seg;
        }
        return pts[pts.length - 1];
    }

    // ──────────────────────────────────────────────────────────
    // Label rendering (foreignObject with sanitized HTML)
    // ──────────────────────────────────────────────────────────

    /** Strip scripts, event handlers and javascript: URLs from an HTML label. */
    function sanitizeHtml(html) {
        var tpl = document.createElement('template');
        tpl.innerHTML = String(html);
        tpl.content.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach(function (el) {
            el.remove();
        });
        tpl.content.querySelectorAll('*').forEach(function (el) {
            for (var i = el.attributes.length - 1; i >= 0; i--) {
                var a = el.attributes[i], n = a.name.toLowerCase();
                if (n.indexOf('on') === 0) el.removeAttribute(a.name);
                else if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
            }
        });
        return tpl.innerHTML;
    }

    var ALIGN_FLEX = { left: 'flex-start', center: 'center', right: 'flex-end' };
    var VALIGN_FLEX = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

    /**
     * Render a label into a foreignObject.
     * box — {x,y,w,h} in model coordinates. Returns '' for empty labels.
     */
    function renderLabel(ctx, label, s, box) {
        if (label == null || String(label).trim() === '') return '';

        var html;
        if (s.html === '1') html = sanitizeHtml(label);
        else html = escapeXml(label).replace(/\n/g, '<br/>');
        if (html.trim() === '') return '';

        var fontSize = num(s.fontSize, 12);
        var fontColor = color(s.fontColor, '#000000');
        if (fontColor === 'none') return '';
        var family = s.fontFamily ? (s.fontFamily + ', Helvetica, Arial, sans-serif')
                                  : 'Helvetica, Arial, sans-serif';
        var fbits = num(s.fontStyle, 0);
        var align = s.align || 'center';
        var valign = s.verticalAlign || 'middle';
        var wrap = s.whiteSpace === 'wrap';

        // Label placement outside the shape (common for images)
        var b = { x: box.x, y: box.y, w: Math.max(box.w, 1), h: Math.max(box.h, 1) };
        var vlp = s.verticalLabelPosition;
        if (vlp === 'bottom') { b.y = box.y + box.h; b.h = fontSize * 3; valign = s.verticalAlign || 'top'; }
        else if (vlp === 'top') { b.h = fontSize * 3; b.y = box.y - b.h; valign = s.verticalAlign || 'bottom'; }
        var lp = s.labelPosition;
        if (lp === 'left') { b.w = Math.max(box.w, 100); b.x = box.x - b.w; align = s.align || 'right'; }
        else if (lp === 'right') { b.x = box.x + box.w; b.w = Math.max(box.w, 100); align = s.align || 'left'; }

        var padT = 2 + num(s.spacingTop, 0) + num(s.spacing, 0);
        var padR = 2 + num(s.spacingRight, 0) + num(s.spacing, 0);
        var padB = 2 + num(s.spacingBottom, 0) + num(s.spacing, 0);
        var padL = 2 + num(s.spacingLeft, 0) + num(s.spacing, 0);

        var outer = 'display:flex;box-sizing:border-box;width:100%;height:100%;' +
            'align-items:' + (VALIGN_FLEX[valign] || 'center') + ';' +
            'justify-content:' + (ALIGN_FLEX[align] || 'center') + ';' +
            'padding:' + padT + 'px ' + padR + 'px ' + padB + 'px ' + padL + 'px;' +
            'font-family:' + family.replace(/"/g, '') + ';' +
            'font-size:' + fontSize + 'px;line-height:1.2;color:' + fontColor + ';' +
            ((fbits & 1) ? 'font-weight:bold;' : '') +
            ((fbits & 2) ? 'font-style:italic;' : '') +
            ((fbits & 4) ? 'text-decoration:underline;' : '');
        var inner = 'text-align:' + align + ';' +
            (wrap ? 'width:100%;overflow-wrap:break-word;' : 'white-space:nowrap;');

        ctx.expand(b.x, b.y); ctx.expand(b.x + b.w, b.y + b.h);

        return '<foreignObject x="' + fmt(b.x) + '" y="' + fmt(b.y) +
            '" width="' + fmt(b.w) + '" height="' + fmt(b.h) +
            '" style="overflow:visible;pointer-events:none;">' +
            '<div xmlns="http://www.w3.org/1999/xhtml" style="' + outer + '">' +
            '<div style="' + inner + '">' + html + '</div></div></foreignObject>';
    }

    // ──────────────────────────────────────────────────────────
    // Vertex rendering
    // ──────────────────────────────────────────────────────────

    function polygonStr(pts, attrs) {
        var d = pts.map(function (p) { return fmt(p.x) + ',' + fmt(p.y); }).join(' ');
        return '<polygon points="' + d + '"' + attrs + '/>';
    }

    /** Common fill/stroke/effect attribute string for a shape. */
    function shapeAttrs(ctx, s, fill, stroke) {
        var a = '';
        if (s.gradientColor && fill !== 'none' && normHex(fill)) {
            var gid = ctx.gradient(fill, s.gradientColor, s.gradientDirection || 'south');
            a += ' fill="url(#' + gid + ')"';
        } else {
            a += ' fill="' + escapeXml(fill) + '"';
        }
        a += ' stroke="' + escapeXml(stroke) + '"';
        var sw = num(s.strokeWidth, 1);
        if (stroke !== 'none' && sw !== 1) a += ' stroke-width="' + fmt(sw) + '"';
        if (s.dashed === '1') {
            var dp = s.dashPattern ? s.dashPattern.trim().split(/\s+/).join(',') : '3,3';
            a += ' stroke-dasharray="' + escapeXml(dp) + '"';
        }
        if (s.shadow === '1') { ctx.shadow = true; a += ' filter="url(#dio-shadow)"'; }
        return a;
    }

    function trianglePoints(r, dir) {
        switch (dir) {
            case 'north': return [{ x: r.x + r.w / 2, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
            case 'south': return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w / 2, y: r.y + r.h }];
            case 'west': return [{ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h / 2 }];
            default: return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h / 2 }, { x: r.x, y: r.y + r.h }];
        }
    }

    function renderVertex(ctx, c) {
        var s = c.style, r = c.abs;
        var shape = s._shape || 'rect';
        if (shape === 'group' && !s.fillColor) return renderLabel(ctx, c.label, s, r);

        var isText = (shape === 'text');
        var fill = color(s.fillColor, isText ? 'none' : '#ffffff');
        var stroke = color(s.strokeColor, isText ? 'none' : '#000000');
        var attrs = shapeAttrs(ctx, s, fill, stroke);
        var out = '';
        var cx = r.x + r.w / 2, cy = r.y + r.h / 2;

        var rectAttrs = ' x="' + fmt(r.x) + '" y="' + fmt(r.y) +
            '" width="' + fmt(Math.max(r.w, 0.01)) + '" height="' + fmt(Math.max(r.h, 0.01)) + '"';

        switch (shape) {
            case 'ellipse':
            case 'cloud': // approximated
                out = '<ellipse cx="' + fmt(cx) + '" cy="' + fmt(cy) +
                    '" rx="' + fmt(r.w / 2) + '" ry="' + fmt(r.h / 2) + '"' + attrs + '/>';
                break;
            case 'doubleEllipse':
                out = '<ellipse cx="' + fmt(cx) + '" cy="' + fmt(cy) +
                    '" rx="' + fmt(r.w / 2) + '" ry="' + fmt(r.h / 2) + '"' + attrs + '/>' +
                    '<ellipse cx="' + fmt(cx) + '" cy="' + fmt(cy) +
                    '" rx="' + fmt(Math.max(r.w / 2 - 4, 1)) + '" ry="' + fmt(Math.max(r.h / 2 - 4, 1)) +
                    '" fill="none" stroke="' + escapeXml(stroke) + '"/>';
                break;
            case 'rhombus':
                out = polygonStr([
                    { x: cx, y: r.y }, { x: r.x + r.w, y: cy },
                    { x: cx, y: r.y + r.h }, { x: r.x, y: cy }
                ], attrs);
                break;
            case 'triangle':
                out = polygonStr(trianglePoints(r, s.direction), attrs);
                break;
            case 'hexagon':
                out = polygonStr([
                    { x: r.x + r.w * 0.25, y: r.y }, { x: r.x + r.w * 0.75, y: r.y },
                    { x: r.x + r.w, y: cy }, { x: r.x + r.w * 0.75, y: r.y + r.h },
                    { x: r.x + r.w * 0.25, y: r.y + r.h }, { x: r.x, y: cy }
                ], attrs);
                break;
            case 'parallelogram': {
                var dx = Math.min(num(s.size, 20), r.w / 2);
                out = polygonStr([
                    { x: r.x + dx, y: r.y }, { x: r.x + r.w, y: r.y },
                    { x: r.x + r.w - dx, y: r.y + r.h }, { x: r.x, y: r.y + r.h }
                ], attrs);
                break;
            }
            case 'step': {
                var st = Math.min(r.w * 0.2, 30);
                out = polygonStr([
                    { x: r.x, y: r.y }, { x: r.x + r.w - st, y: r.y }, { x: r.x + r.w, y: cy },
                    { x: r.x + r.w - st, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x + st, y: cy }
                ], attrs);
                break;
            }
            case 'card': {
                var cs = Math.min(15, r.w / 4, r.h / 4);
                out = '<path d="M ' + fmt(r.x + cs) + ' ' + fmt(r.y) +
                    ' L ' + fmt(r.x + r.w) + ' ' + fmt(r.y) +
                    ' L ' + fmt(r.x + r.w) + ' ' + fmt(r.y + r.h) +
                    ' L ' + fmt(r.x) + ' ' + fmt(r.y + r.h) +
                    ' L ' + fmt(r.x) + ' ' + fmt(r.y + cs) + ' Z"' + attrs + '/>';
                break;
            }
            case 'note': {
                var ns = Math.min(15, r.w / 4, r.h / 4);
                out = '<path d="M ' + fmt(r.x) + ' ' + fmt(r.y) +
                    ' L ' + fmt(r.x + r.w - ns) + ' ' + fmt(r.y) +
                    ' L ' + fmt(r.x + r.w) + ' ' + fmt(r.y + ns) +
                    ' L ' + fmt(r.x + r.w) + ' ' + fmt(r.y + r.h) +
                    ' L ' + fmt(r.x) + ' ' + fmt(r.y + r.h) + ' Z"' + attrs + '/>' +
                    '<path d="M ' + fmt(r.x + r.w - ns) + ' ' + fmt(r.y) +
                    ' L ' + fmt(r.x + r.w - ns) + ' ' + fmt(r.y + ns) +
                    ' L ' + fmt(r.x + r.w) + ' ' + fmt(r.y + ns) +
                    '" fill="none" stroke="' + escapeXml(stroke) + '"/>';
                break;
            }
            case 'process': {
                var pi = Math.max(num(s.size, 0.1), 0) * r.w;
                out = '<rect' + rectAttrs + attrs + (s.rounded === '1' ? ' rx="' + fmt(Math.min(r.w, r.h) * 0.1) + '"' : '') + '/>' +
                    '<line x1="' + fmt(r.x + pi) + '" y1="' + fmt(r.y) + '" x2="' + fmt(r.x + pi) + '" y2="' + fmt(r.y + r.h) +
                    '" stroke="' + escapeXml(stroke) + '"/>' +
                    '<line x1="' + fmt(r.x + r.w - pi) + '" y1="' + fmt(r.y) + '" x2="' + fmt(r.x + r.w - pi) + '" y2="' + fmt(r.y + r.h) +
                    '" stroke="' + escapeXml(stroke) + '"/>';
                break;
            }
            case 'cylinder':
            case 'cylinder3': { // cylinder3 = current drawio DB-shape name
                var ry = Math.min(num(s.size, 15), r.h / 3);
                var rx2 = r.w / 2;
                out = '<path d="M ' + fmt(r.x) + ' ' + fmt(r.y + ry) +
                    ' A ' + fmt(rx2) + ' ' + fmt(ry) + ' 0 0 1 ' + fmt(r.x + r.w) + ' ' + fmt(r.y + ry) +
                    ' L ' + fmt(r.x + r.w) + ' ' + fmt(r.y + r.h - ry) +
                    ' A ' + fmt(rx2) + ' ' + fmt(ry) + ' 0 0 1 ' + fmt(r.x) + ' ' + fmt(r.y + r.h - ry) +
                    ' Z"' + attrs + '/>' +
                    '<path d="M ' + fmt(r.x) + ' ' + fmt(r.y + ry) +
                    ' A ' + fmt(rx2) + ' ' + fmt(ry) + ' 0 0 0 ' + fmt(r.x + r.w) + ' ' + fmt(r.y + ry) +
                    '" fill="none" stroke="' + escapeXml(stroke) + '"/>';
                break;
            }
            case 'swimlane': {
                var ss = num(s.startSize, 26);
                var bodyFill = color(s.swimlaneFillColor, 'none');
                out = '<rect' + rectAttrs + ' fill="' + escapeXml(bodyFill) + '" stroke="' + escapeXml(stroke) + '"/>' +
                    '<rect x="' + fmt(r.x) + '" y="' + fmt(r.y) + '" width="' + fmt(r.w) + '" height="' + fmt(Math.min(ss, r.h)) + '"' +
                    shapeAttrs(ctx, s, fill, stroke) + '/>';
                // Title label inside the header band, then skip the normal label
                out += renderLabel(ctx, c.label, s, { x: r.x, y: r.y, w: r.w, h: Math.min(ss, r.h) });
                return wrapTransform(ctx, out, s, r);
            }
            case 'line':
                out = '<line x1="' + fmt(r.x) + '" y1="' + fmt(cy) + '" x2="' + fmt(r.x + r.w) + '" y2="' + fmt(cy) +
                    '" stroke="' + escapeXml(stroke === 'none' ? '#000000' : stroke) + '"' +
                    (num(s.strokeWidth, 1) !== 1 ? ' stroke-width="' + fmt(num(s.strokeWidth, 1)) + '"' : '') + '/>';
                break;
            case 'image':
            case 'label': {
                var href = s.image || '';
                // drawio style stores data URIs without the ';base64' marker
                if (/^data:image\/[^;,]+,/.test(href) && href.indexOf(';base64') < 0) {
                    href = href.replace(/^data:image\/([^;,]+),/, 'data:image/$1;base64,');
                }
                if (/^(data:image\/|https?:\/\/|\/)/.test(href)) {
                    out = '<image' + rectAttrs + ' href="' + escapeXml(href) + '" preserveAspectRatio="' +
                        (s.imageAspect === '0' ? 'none' : 'xMidYMid meet') + '"/>';
                    if (s.imageBorder) {
                        out += '<rect' + rectAttrs + ' fill="none" stroke="' + escapeXml(s.imageBorder) + '"/>';
                    }
                } else {
                    out = '<rect' + rectAttrs + ' fill="#f5f5f5" stroke="#b0b0b0"/>';
                }
                break;
            }
            case 'text':
            case 'rect':
            default: {
                if (isText && fill === 'none' && stroke === 'none') { out = ''; break; }
                var rx = '';
                if (s.rounded === '1' || (shape !== 'rect' && shape !== 'text')) {
                    // unknown shapes fall back to a rounded rectangle
                    var arc = (s.absoluteArcSize === '1') ? num(s.arcSize, 10)
                        : Math.min(r.w, r.h) * (num(s.arcSize, 12) / 100);
                    rx = ' rx="' + fmt(Math.max(Math.min(arc, Math.min(r.w, r.h) / 2), 2)) + '"';
                }
                out = '<rect' + rectAttrs + rx + attrs + '/>';
                break;
            }
        }

        out += renderLabel(ctx, c.label, s, r);
        return wrapTransform(ctx, out, s, r);
    }

    /** Wrap shape+label output in a <g> carrying rotation/opacity; update bounds. */
    function wrapTransform(ctx, out, s, r) {
        if (out === '') return '';
        var rot = num(s.rotation, 0);
        var cx = r.x + r.w / 2, cy = r.y + r.h / 2;

        // Bounds: plain corners, or rotated corners when rotation is set
        var corners = [
            { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
            { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }
        ];
        var rad = rot * Math.PI / 180;
        corners.forEach(function (p) {
            if (rot) {
                var dx = p.x - cx, dy = p.y - cy;
                p = { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) };
            }
            ctx.expand(p.x, p.y);
        });

        var attrs = '';
        if (rot) attrs += ' transform="rotate(' + fmt(rot) + ' ' + fmt(cx) + ' ' + fmt(cy) + ')"';
        var op = s.opacity != null ? num(s.opacity, 100) : 100;
        if (op < 100) attrs += ' opacity="' + fmt(Math.max(op, 0) / 100) + '"';
        return attrs ? '<g' + attrs + '>' + out + '</g>' : out;
    }

    // ──────────────────────────────────────────────────────────
    // Edge rendering
    // ──────────────────────────────────────────────────────────

    function renderEdge(ctx, edge, byId, labelCells) {
        var s = edge.style;
        var stroke = color(s.strokeColor, '#000000');
        if (stroke === 'none') return '';
        var sw = num(s.strokeWidth, 1);
        var off = parentOffset(edge, byId);

        var src = byId[edge.source], tgt = byId[edge.target];
        if (src && !src.abs) src = null;
        if (tgt && !tgt.abs) tgt = null;

        var pts = [];
        if (edge.geo) {
            edge.geo.points.forEach(function (p) { pts.push({ x: p.x + off.x, y: p.y + off.y }); });
        }
        var srcFixed = (edge.geo && edge.geo.sourcePoint)
            ? { x: edge.geo.sourcePoint.x + off.x, y: edge.geo.sourcePoint.y + off.y } : null;
        var tgtFixed = (edge.geo && edge.geo.targetPoint)
            ? { x: edge.geo.targetPoint.x + off.x, y: edge.geo.targetPoint.y + off.y } : null;

        // exit/entry anchors (fractions of the shape box)
        var exitP = (src && s.exitX != null && s.exitY != null) ? {
            x: src.abs.x + num(s.exitX, 0.5) * src.abs.w + num(s.exitDx, 0),
            y: src.abs.y + num(s.exitY, 0.5) * src.abs.h + num(s.exitDy, 0)
        } : null;
        var entryP = (tgt && s.entryX != null && s.entryY != null) ? {
            x: tgt.abs.x + num(s.entryX, 0.5) * tgt.abs.w + num(s.entryDx, 0),
            y: tgt.abs.y + num(s.entryY, 0.5) * tgt.abs.h + num(s.entryDy, 0)
        } : null;

        var srcRef = pts[0] || entryP || (tgt ? center(tgt.abs) : null) || tgtFixed;
        var tgtRef = pts[pts.length - 1] || exitP || (src ? center(src.abs) : null) || srcFixed;

        var start = src
            ? (exitP || (srcRef ? perimeterPoint(src.abs, shapeKind(src.style), srcRef) : center(src.abs)))
            : (srcFixed || srcRef);
        var end = tgt
            ? (entryP || (tgtRef ? perimeterPoint(tgt.abs, shapeKind(tgt.style), tgtRef) : center(tgt.abs)))
            : (tgtFixed || tgtRef);
        if (!start || !end) return '';

        // Cheap orthogonal elbow when drawio saved no explicit waypoints
        var eStyle = s.edgeStyle || '';
        if (!pts.length && /orthogonal|elbow|entityRelation/.test(eStyle)) {
            if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
                var mx = (start.x + end.x) / 2;
                pts = [{ x: mx, y: start.y }, { x: mx, y: end.y }];
            } else {
                var my = (start.y + end.y) / 2;
                pts = [{ x: start.x, y: my }, { x: end.x, y: my }];
            }
        }

        var route = [start].concat(pts, [end]).filter(function (p, i, a) {
            return i === 0 || Math.abs(p.x - a[i - 1].x) > 0.01 || Math.abs(p.y - a[i - 1].y) > 0.01;
        });
        if (route.length < 2) return '';
        route.forEach(function (p) { ctx.expand(p.x, p.y); });

        var d = 'M ' + fmt(route[0].x) + ' ' + fmt(route[0].y);
        for (var i = 1; i < route.length; i++) d += ' L ' + fmt(route[i].x) + ' ' + fmt(route[i].y);

        var attrs = ' fill="none" stroke="' + escapeXml(stroke) + '"';
        if (sw !== 1) attrs += ' stroke-width="' + fmt(sw) + '"';
        if (s.dashed === '1') {
            var dp = s.dashPattern ? s.dashPattern.trim().split(/\s+/).join(',') : '3,3';
            attrs += ' stroke-dasharray="' + escapeXml(dp) + '"';
        }

        var endArrow = (s.endArrow != null) ? s.endArrow : 'classic';
        var startArrow = (s.startArrow != null) ? s.startArrow : 'none';
        if (endArrow && endArrow !== 'none') {
            attrs += ' marker-end="url(#' + ctx.marker(endArrow, stroke, s.endFill !== '0') + ')"';
        }
        if (startArrow && startArrow !== 'none') {
            attrs += ' marker-start="url(#' + ctx.marker(startArrow, stroke, s.startFill !== '0') + ')"';
        }

        var out = '<path d="' + d + '"' + attrs + '/>';

        // Label carried by the edge itself (relative geometry x ∈ [-1..1])
        var totalLen = routeLength(route);
        if (edge.label && String(edge.label).trim() !== '') {
            out += renderEdgeLabel(ctx, edge.label, s, route, totalLen,
                (edge.geo && edge.geo.relative) ? edge.geo.x : 0,
                edge.geo ? edge.geo.offset : null);
        }
        // Child label cells attached to this edge
        (labelCells || []).forEach(function (lc) {
            out += renderEdgeLabel(ctx, lc.label, lc.style, route, totalLen,
                lc.geo ? lc.geo.x : 0, lc.geo ? lc.geo.offset : null);
        });
        return out;
    }

    /** Small centered label box near a point along the edge route. */
    function renderEdgeLabel(ctx, label, s, route, totalLen, t, offset) {
        if (label == null || String(label).trim() === '') return '';
        var frac = (Math.max(-1, Math.min(1, num(t, 0))) + 1) / 2;
        var p = pointAlong(route, totalLen * frac);
        if (offset) p = { x: p.x + offset.x, y: p.y + offset.y };

        var fontSize = num(s.fontSize, 12);
        var plain = String(label).replace(/<[^>]*>/g, ' ');
        var lines = plain.split(/\n|<br/i).length;
        var w = Math.min(Math.max(40, plain.length * fontSize * 0.62), 260);
        var h = Math.max(lines, 1) * fontSize * 1.4 + 4;
        var bg = color(s.labelBackgroundColor, '#ffffff');

        var box = { x: p.x - w / 2, y: p.y - h / 2, w: w, h: h };
        var ls = Object.assign({}, s, { whiteSpace: 'wrap' });
        var lbl = renderLabel(ctx, label, ls, box);
        if (lbl === '') return '';
        var rect = (bg !== 'none')
            ? '<rect x="' + fmt(box.x) + '" y="' + fmt(box.y) + '" width="' + fmt(w) + '" height="' + fmt(h) +
              '" fill="' + escapeXml(bg) + '" fill-opacity="0.85" stroke="none"/>'
            : '';
        return rect + lbl;
    }

    // ──────────────────────────────────────────────────────────
    // Page renderer
    // ──────────────────────────────────────────────────────────

    var MARKERS = {
        classic: function (col, fill) {
            return '<path d="M 1 2 L 11 6 L 1 10 L 3.5 6 Z" fill="' + fill + '" stroke="' + col + '"/>';
        },
        block: function (col, fill) {
            return '<path d="M 1 1.5 L 11 6 L 1 10.5 Z" fill="' + fill + '" stroke="' + col + '"/>';
        },
        open: function (col) {
            return '<path d="M 1 2 L 11 6 L 1 10" fill="none" stroke="' + col + '" stroke-width="1.5"/>';
        },
        oval: function (col, fill) {
            return '<circle cx="6" cy="6" r="4" fill="' + fill + '" stroke="' + col + '"/>';
        },
        diamond: function (col, fill) {
            return '<path d="M 1 6 L 6 2.2 L 11 6 L 6 9.8 Z" fill="' + fill + '" stroke="' + col + '"/>';
        }
    };

    function renderModel(model) {
        var parsed = readCells(model);
        var cells = parsed.cells, byId = parsed.byId;

        var ctx = {
            minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
            shadow: false,
            _markers: {}, _gradients: {}, _defs: [],
            expand: function (x, y) {
                if (!isFinite(x) || !isFinite(y)) return;
                if (x < this.minX) this.minX = x;
                if (y < this.minY) this.minY = y;
                if (x > this.maxX) this.maxX = x;
                if (y > this.maxY) this.maxY = y;
            },
            marker: function (type, col, filled) {
                var kind = MARKERS[String(type).replace(/Thin$/, '')] ? String(type).replace(/Thin$/, '') : 'classic';
                var key = kind + '|' + col + '|' + (filled ? 'f' : 'o');
                if (this._markers[key]) return this._markers[key];
                var id = 'dio-m-' + Object.keys(this._markers).length + '-' +
                    kind + (filled ? 'f' : 'o');
                this._markers[key] = id;
                var fillCol = filled ? col : '#ffffff';
                this._defs.push('<marker id="' + id + '" viewBox="0 0 12 12" refX="10" refY="6"' +
                    ' markerWidth="9" markerHeight="9" orient="auto-start-reverse">' +
                    MARKERS[kind](escapeXml(col), escapeXml(fillCol)) + '</marker>');
                return id;
            },
            gradient: function (from, to, dir) {
                var key = from + '|' + to + '|' + dir;
                if (this._gradients[key]) return this._gradients[key];
                var id = 'dio-g-' + Object.keys(this._gradients).length;
                this._gradients[key] = id;
                var coords = { south: 'x1="0" y1="0" x2="0" y2="1"', north: 'x1="0" y1="1" x2="0" y2="0"',
                               east: 'x1="0" y1="0" x2="1" y2="0"', west: 'x1="1" y1="0" x2="0" y2="0"' };
                this._defs.push('<linearGradient id="' + id + '" ' + (coords[dir] || coords.south) + '>' +
                    '<stop offset="0" stop-color="' + escapeXml(from) + '"/>' +
                    '<stop offset="1" stop-color="' + escapeXml(to) + '"/></linearGradient>');
                return id;
            }
        };

        // Classify cells; compute absolute positions for vertices
        var drawables = [];          // vertices + edges in document order
        var edgeLabelsByParent = {}; // edge id → [label cells]

        cells.forEach(function (c) {
            if (isHidden(c, byId)) return;
            if (c.vertex && c.geo) {
                var parent = byId[c.parent];
                if (c.geo.relative && parent && parent.edge) {
                    // Edge label cell — rendered together with its edge
                    (edgeLabelsByParent[c.parent] = edgeLabelsByParent[c.parent] || []).push(c);
                    return;
                }
                var o = parentOffset(c, byId);
                if (c.geo.relative && parent && parent.vertex && parent.geo) {
                    // Relative child of a vertex (port): fraction of the parent box
                    c.abs = {
                        x: o.x + parent.geo.x + c.geo.x * parent.geo.w + (c.geo.offset ? c.geo.offset.x : 0),
                        y: o.y + parent.geo.y + c.geo.y * parent.geo.h + (c.geo.offset ? c.geo.offset.y : 0),
                        w: c.geo.w, h: c.geo.h
                    };
                } else {
                    c.abs = { x: c.geo.x + o.x, y: c.geo.y + o.y, w: c.geo.w, h: c.geo.h };
                }
                drawables.push(c);
            } else if (c.edge) {
                drawables.push(c);
            }
        });

        if (!drawables.length) return null;

        var body = '';
        drawables.forEach(function (c) {
            try {
                body += c.vertex
                    ? renderVertex(ctx, c)
                    : renderEdge(ctx, c, byId, edgeLabelsByParent[c.id]);
            } catch (e) {
                // A single broken cell must not kill the whole page
                if (window.console && console.warn) console.warn('drawio import: cell skipped', c.id, e);
            }
        });

        if (!isFinite(ctx.minX) || body === '') return null;

        if (ctx.shadow) {
            ctx._defs.push('<filter id="dio-shadow" x="-15%" y="-15%" width="140%" height="140%">' +
                '<feDropShadow dx="2" dy="2" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.3"/></filter>');
        }

        var PAD = 10;
        var vx = ctx.minX - PAD, vy = ctx.minY - PAD;
        var vw = (ctx.maxX - ctx.minX) + PAD * 2, vh = (ctx.maxY - ctx.minY) + PAD * 2;
        var defs = ctx._defs.length ? '<defs>' + ctx._defs.join('') + '</defs>' : '';

        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
            fmt(vx) + ' ' + fmt(vy) + ' ' + fmt(vw) + ' ' + fmt(vh) +
            '" width="' + fmt(vw) + '" height="' + fmt(vh) +
            '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;aspect-ratio:' +
            fmt(vw) + '/' + fmt(vh) + ';max-height:78vh;display:block;">' +
            defs + body + '</svg>';

        var bytes = 0;
        try { bytes = new TextEncoder().encode(svg).length; } catch (e) { bytes = svg.length; }

        return {
            svg: svg,
            background: normHex(model.getAttribute('background')),
            bytes: bytes,
            oversize: bytes > 60000 // current.text is a 64 KB TEXT column
        };
    }

    // ──────────────────────────────────────────────────────────
    // Entry point
    // ──────────────────────────────────────────────────────────

    /**
     * Parse a .drawio / mxGraph XML file into renderable pages.
     * @param {string} text — raw file contents
     * @returns {Promise<Array>} pages (empty pages are skipped)
     */
    function parse(text) {
        return Promise.resolve().then(function () {
            var doc = new DOMParser().parseFromString(String(text || ''), 'text/xml');
            if (doc.getElementsByTagName('parsererror').length) {
                throw new Error(_t('prep.drawio.badFormat'));
            }
            var root = doc.documentElement;

            if (root.nodeName === 'mxGraphModel') {
                return [{ name: 'Page 1', model: Promise.resolve(root) }];
            }
            if (root.nodeName !== 'mxfile') {
                throw new Error(_t('prep.drawio.badFormat'));
            }
            var out = [];
            for (var i = 0; i < root.children.length; i++) {
                var d = root.children[i];
                if (d.nodeName !== 'diagram') continue;
                var name = d.getAttribute('name') || ('Page ' + (out.length + 1));
                var embedded = d.getElementsByTagName('mxGraphModel')[0];
                if (embedded) {
                    out.push({ name: name, model: Promise.resolve(embedded) });
                } else {
                    var payload = (d.textContent || '').trim();
                    if (!payload) continue;
                    out.push({
                        name: name,
                        model: inflateB64(payload).then(function (xml) {
                            var mdoc = new DOMParser().parseFromString(xml, 'text/xml');
                            var m = mdoc.documentElement;
                            return (m && m.nodeName === 'mxGraphModel') ? m : null;
                        })
                    });
                }
            }
            return out;
        }).then(function (entries) {
            return Promise.all(entries.map(function (e) { return e.model; })).then(function (models) {
                var pages = [];
                models.forEach(function (model, idx) {
                    if (!model) return;
                    var page = renderModel(model);
                    if (page) {
                        page.name = entries[idx].name;
                        pages.push(page);
                    }
                });
                return pages;
            });
        });
    }

    window.DrawioImport = { parse: parse };
})();
