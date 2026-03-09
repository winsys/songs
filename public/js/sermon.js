/**
 * sermon.js
 * Presentation mode: left = scrollable notes, right = text/image display.
 */
angular.module('Songs', [])
.controller('Sermon', function ($scope, $http, $timeout, $sce) {

    // ── State ─────────────────────────────────────────────────
    $scope.sermonList      = [];
    $scope.selectedSermonId = '';
    $scope.currentSermon   = null;
    $scope.notesHtml       = null;

    // Right panel
    $scope.displayText      = '';
    $scope.displayTitle     = '';
    $scope.displayFontSize  = 20;
    $scope.displayImageSrc  = '';

    // User display settings
    var userSettings = null;

    // Active element tracking
    var activeEl = null;

    // ==========================================================
    // INIT
    // ==========================================================

    angular.element(document).ready(function () {
        loadUserSettings();
        $scope.loadSermonList();
    });

    // ==========================================================
    // COLOUR UTILITIES
    // ==========================================================

    /** Parse "#rrggbb" → [r, g, b] (0-255) */
    function hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(function(c){ return c+c; }).join('');
        var n = parseInt(hex, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    /** [r,g,b] (0-255) → "#rrggbb" */
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(v) {
            return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
        }).join('');
    }

    /** [r,g,b] (0-255) → [h (0-360), s (0-100), l (0-100)] */
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return [h * 360, s * 100, l * 100];
    }

    /** [h (0-360), s (0-100), l (0-100)] → [r, g, b] (0-255) */
    function hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        var r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            var hue2rgb = function(p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [r * 255, g * 255, b * 255];
    }

    /** "#rrggbb" → "#rrggbb"  (force specific HSL lightness) */
    function setLightness(hex, newL) {
        var rgb = hexToRgb(hex);
        var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        var rgb2 = hslToRgb(hsl[0], hsl[1], newL);
        return rgbToHex(rgb2[0], rgb2[1], rgb2[2]);
    }

    /** "#rrggbb" → "#rrggbb"  (force specific H and L, keep source S clamped) */
    function hslColor(hex, newS, newL) {
        var rgb = hexToRgb(hex);
        var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        var rgb2 = hslToRgb(hsl[0], newS, newL);
        return rgbToHex(rgb2[0], rgb2[1], rgb2[2]);
    }

    /**
     * Given the "base" colour (= cite-ref header text colour), derive the full
     * set of CSS tokens needed to paint a chip group.
     *
     * The derivation keeps the hue of the base and adjusts saturation/lightness
     * so the result matches the current hard-coded look.
     */
    function deriveChipColors(baseHex) {
        var rgb = hexToRgb(baseHex);
        var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        var h = hsl[0];
        // Keep saturation in a useful range for dark-theme chips
        var s  = Math.max(35, Math.min(hsl[1], 65));
        var sH = Math.max(50, Math.min(hsl[1] * 1.1, 75));  // slightly richer for hover/active

        return {
            // Normal chip
            bg:          rgbToHex.apply(null, hslToRgb(h, s * 0.70, 18)),   // very dark
            border:      rgbToHex.apply(null, hslToRgb(h, s * 0.85, 33)),   // medium dark
            refColor:    baseHex,                                              // = input
            verseColor:  rgbToHex.apply(null, hslToRgb(h, s * 0.80, Math.min(hsl[2] - 8, 80))),

            // Hover
            hoverBg:     rgbToHex.apply(null, hslToRgb(h, s * 0.75, 25)),
            hoverBorder: rgbToHex.apply(null, hslToRgb(h, sH,        42)),

            // Active
            activeBg:     rgbToHex.apply(null, hslToRgb(h, sH,        40)),
            activeBorder: rgbToHex.apply(null, hslToRgb(h, sH * 1.1,  55)),
            activeVerse:  rgbToHex.apply(null, hslToRgb(h, 40,         88)),

            // Glow shadow (same hue, medium)
            shadow:       rgbToHex.apply(null, hslToRgb(h, s, 35))
        };
    }

    /**
     * Given the notes-panel background hex, derive header/border/select colours.
     */
    function deriveNotesPanelColors(bgHex) {
        var rgb = hexToRgb(bgHex);
        var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        var h = hsl[0], s = hsl[1], l = hsl[2];
        return {
            bg:         bgHex,
            headerBg:   rgbToHex.apply(null, hslToRgb(h, s, Math.max(l - 5, 0))),
            border:     rgbToHex.apply(null, hslToRgb(h, s, Math.min(l + 12, 55))),
            selectBg:   rgbToHex.apply(null, hslToRgb(h, s, Math.min(l + 4, 50))),
            bodyBg:     rgbToHex.apply(null, hslToRgb(h, s, Math.max(l - 2, 0)))
        };
    }

    // ==========================================================
    // USER SETTINGS (colours / font for right panel + sermon colours)
    // ==========================================================

    function loadUserSettings() {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_user_settings' } }).then(
            function (r) {
                if (r.data) {
                    userSettings = r.data;
                    applyDisplaySettings();
                    applySermonColors();
                }
            }
        );
    }

    function applyDisplaySettings() {
        if (!userSettings) return;
        var panel = document.getElementById('display-panel');
        if (panel) {
            panel.style.backgroundColor = userSettings.main_bg_color  || '#000000';
            panel.style.color           = userSettings.main_font_color || '#ffffff';
            panel.style.fontFamily      = userSettings.main_font       || 'Arial';
        }
        var textEl = document.getElementById('display-text');
        if (textEl) {
            textEl.style.fontFamily = userSettings.main_font       || 'Arial';
            textEl.style.color      = userSettings.main_font_color || '#ffffff';
        }
    }

    function applySermonColors() {
        if (!userSettings) return;

        var root = document.documentElement;

        // ── Notes panel ───────────────────────────────────────────────────
        var notesBg = userSettings.sermon_notes_bg_color || '#2b2b2b';
        var np = deriveNotesPanelColors(notesBg);
        root.style.setProperty('--sn-body-bg',       np.bodyBg);
        root.style.setProperty('--sn-notes-bg',      np.bg);
        root.style.setProperty('--sn-notes-header',  np.headerBg);
        root.style.setProperty('--sn-notes-border',  np.border);
        root.style.setProperty('--sn-select-bg',     np.selectBg);

        // ── Bible chips ───────────────────────────────────────────────────
        var bibleBase = userSettings.sermon_bible_base_color || '#7ec8f8';
        var bc = deriveChipColors(bibleBase);
        root.style.setProperty('--sn-bible-bg',           bc.bg);
        root.style.setProperty('--sn-bible-border',       bc.border);
        root.style.setProperty('--sn-bible-ref',          bc.refColor);
        root.style.setProperty('--sn-bible-verse',        bc.verseColor);
        root.style.setProperty('--sn-bible-hover-bg',     bc.hoverBg);
        root.style.setProperty('--sn-bible-hover-border', bc.hoverBorder);
        root.style.setProperty('--sn-bible-active-bg',    bc.activeBg);
        root.style.setProperty('--sn-bible-active-bdr',   bc.activeBorder);
        root.style.setProperty('--sn-bible-active-verse', bc.activeVerse);
        root.style.setProperty('--sn-bible-shadow',       bc.shadow);

        // ── Message / Epistle chips ───────────────────────────────────────
        var msgBase = userSettings.sermon_msg_base_color || '#ce93d8';
        var mc = deriveChipColors(msgBase);
        root.style.setProperty('--sn-msg-bg',           mc.bg);
        root.style.setProperty('--sn-msg-border',       mc.border);
        root.style.setProperty('--sn-msg-color',        mc.refColor);
        root.style.setProperty('--sn-msg-hover-bg',     mc.hoverBg);
        root.style.setProperty('--sn-msg-hover-border', mc.hoverBorder);
        root.style.setProperty('--sn-msg-active-bg',    mc.activeBg);
        root.style.setProperty('--sn-msg-active-bdr',   mc.activeBorder);
        root.style.setProperty('--sn-msg-shadow',       mc.shadow);
    }

    // ==========================================================
    // SERMON LIST & LOAD
    // ==========================================================

    $scope.loadSermonList = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon_list' } }).then(
            function (r) { $scope.sermonList = r.data; }
        );
    };

    $scope.loadSermon = function (id) {
        if (!id) { $scope.currentSermon = null; $scope.notesHtml = null; return; }
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon', id: id } }).then(
            function (r) {
                $scope.currentSermon = r.data;
                $scope.notesHtml = $sce.trustAsHtml(r.data.CONTENT || '');
                $timeout(attachNoteHandlers, 100);
                $scope.displayText     = '';
                $scope.displayTitle    = '';
                $scope.displayImageSrc = '';
                activeEl = null;
            }
        );
    };

    // ==========================================================
    // CLICK HANDLERS on rendered notes HTML
    // ==========================================================

    function attachNoteHandlers() {
        var body = document.getElementById('notes-body');
        if (!body) return;

        // Bible cite chips
        body.querySelectorAll('.bible-cite').forEach(function (el) {
            el.style.cursor = 'pointer';
            el.onclick = function (e) {
                e.preventDefault();
                if (activeEl === el) {
                    deactivateAll();
                    $timeout(function () { clearDisplay(); }, 0);
                    return;
                }
                activateElement(el);
                var bookId   = el.getAttribute('data-book-id');
                var chapter  = el.getAttribute('data-chapter');
                var verseNum = el.getAttribute('data-verse-nums');
                var refLabel = el.getAttribute('data-ref-label') || '';
                var trId     = el.getAttribute('data-translation-id') || 1;
                $timeout(function () {
                    fetchAndShowVerse(trId, bookId, chapter, verseNum, refLabel);
                }, 0);
            };
        });

        // Sermon images
        body.querySelectorAll('.sermon-img-wrap').forEach(function (el) {
            el.style.cursor = 'pointer';
            el.onclick = function (e) {
                e.preventDefault();
                if (activeEl === el) {
                    deactivateAll();
                    sendImageToDisplay('');
                    return;
                }
                activateElement(el);
                var path = el.getAttribute('data-image-path');
                if (path) {
                    showImage(path);
                    sendImageToDisplay(path);
                }
            };
        });

        // Message citation chips
        body.querySelectorAll('.message-cite').forEach(function (el) {
            el.style.cursor = 'pointer';
            el.onclick = function (e) {
                e.preventDefault();
                if (activeEl === el) {
                    deactivateAll();
                    $timeout(function () { clearDisplay(); }, 0);
                    return;
                }
                activateElement(el);
                var paraText = el.getAttribute('data-para-text') || '';
                var msgTitle = el.getAttribute('data-msg-title') || '';
                $timeout(function () {
                    showText(paraText, msgTitle);
                    $http({ method: "POST", url: "/ajax", data: {
                        command: 'set_message_text',
                        text: paraText,
                        song_name: msgTitle
                    }});
                }, 0);
            };
        });
    }

    function activateElement(el) {
        if (activeEl && activeEl !== el) {
            activeEl.classList.remove('active-cite', 'active-img');
        }
        activeEl = el;
        el.classList.add(
            (el.classList.contains('bible-cite') || el.classList.contains('message-cite'))
                ? 'active-cite' : 'active-img'
        );
    }

    function deactivateAll() {
        if (activeEl) {
            activeEl.classList.remove('active-cite', 'active-img');
            activeEl = null;
        }
    }

    function clearDisplay() {
        $scope.displayText     = '';
        $scope.displayTitle    = '';
        $scope.displayImageSrc = '';
        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' } });
    }

    // ==========================================================
    // FETCH BIBLE VERSE, SHOW LOCALLY + SEND TO /text/ via Ajax
    // ==========================================================

    function fetchAndShowVerse(translationId, bookId, chapter, verseNum, refLabel) {
        $http({ method: "POST", url: "/ajax", data: {
            command: 'get_bible_verses',
            book_id: bookId,
            chapter_num: chapter
        }}).then(function (r) {
            var verses = r.data;
            var found  = null;
            for (var i = 0; i < verses.length; i++) {
                if (parseInt(verses[i].VERSE_NUM) === parseInt(verseNum)) {
                    found = verses[i];
                    break;
                }
            }
            if (found) {
                var text = verseNum + '. ' + (found.TEXT || '');
                showText(text, refLabel);
                $http({ method: "POST", url: "/ajax", data: {
                    command: 'set_message_text',
                    text: text,
                    song_name: refLabel
                }});
            }
        });
    }

    // ==========================================================
    // LOCAL DISPLAY HELPERS
    // ==========================================================

    function showText(text, title) {
        $scope.displayText      = text;
        $scope.displayTitle     = title || '';
        $scope.displayImageSrc  = '';
        $scope.displayFontSize  = 20;
        $timeout(autoFitText, 50);
    }

    function showImage(path) {
        $scope.displayText     = '';
        $scope.displayTitle    = '';
        $scope.displayImageSrc = path;
    }

    function sendImageToDisplay(path) {
        $http({ method: "POST", url: "/ajax", data: { command: path ? 'set_image' : 'clear_image', image: path } });
    }

    function autoFitText() {
        var wrap = document.getElementById('display-text-wrap');
        var el   = document.getElementById('display-text');
        if (!wrap || !el || !$scope.displayText) return;

        var maxH = wrap.clientHeight * 0.85;
        var maxW = wrap.clientWidth  * 0.92;
        var size = 10;
        el.style.fontSize = size + 'px';

        while (size < 120 && el.scrollHeight <= maxH && el.scrollWidth <= maxW) {
            size++;
            el.style.fontSize = size + 'px';
        }
        while ((el.scrollHeight > maxH || el.scrollWidth > maxW) && size > 8) {
            size--;
            el.style.fontSize = size + 'px';
        }
        $scope.$apply(function () { $scope.displayFontSize = size; });
    }

    // ==========================================================
    // FULLSCREEN
    // ==========================================================

    $scope.toggleFullscreen = function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };
});
