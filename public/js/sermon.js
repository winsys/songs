/**
 * sermon.js  v6
 * Presentation mode: left = scrollable notes, right = text/image display.
 */
angular.module('Songs', ['csrfModule'])
    .controller('Sermon', function ($scope, $http, $timeout, $sce) {

        $scope.sermonList       = [];
        $scope.selectedSermonId = '';
        $scope.currentSermon    = null;
        $scope.notesHtml        = null;

        $scope.displayText      = '';
        $scope.displayTitle     = '';
        $scope.displayImageSrc  = '';

        // Display target management
        $scope.displayTargets           = [];
        $scope.selectedDisplayTarget    = null;
        $scope.showAccessRequestModal   = false;
        $scope.availableGroups          = [];
        $scope.selectedGroupForRequest  = '';

         $scope.displayVideoSrc       = '';   // непустое = показывать оверлей
         $scope.displayVideoIsYouTube = false;
         $scope.displayVideoEmbedSrc  = null;  // trustAsResourceUrl для YT
         $scope.displayVideoSrcLocal  = null;  // trustAsResourceUrl для файла
         $scope.videoActive      = false;
         $scope.videoPlaying     = false;
         $scope.videoIsYouTube   = false;
         $scope.videoCurrentName = '';
         $scope.videoProgress    = 0;
         $scope.videoCurrentTime = '0:00';
         $scope.videoSeeking     = false;
         var videoProgressTimer  = null;

        var userSettings = null;
        var activeEl     = null;

        var scaleChips   = false;
        var fontSavePending = null;
        var NOTES_FONT_MIN = 8;
        var NOTES_FONT_MAX = 40;
        $scope.notesFontSize = 13;   // pt, matches CSS default

        // ==========================================================
        // INIT
        // ==========================================================

        angular.element(document).ready(function () {
            loadUserSettings();
            $scope.loadSermonList();
            loadDisplayTargets();
        });

        $scope.groupCitations = function() {
            setTimeout(function() {
                var container = document.getElementById('notes-body');
                if (!container) return;

                // Удаляем старые заголовки, если они были (на случай перезагрузки)
                container.querySelectorAll('.sermon-group-header').forEach(h => h.remove());

                var items = container.querySelectorAll('.bible-cite, .message-cite');
                var lastKey = null;

                items.forEach(function(el) {
                    var currentKey = "";
                    var titleText = "";

                    // Логика определения ключа и текста
                    if (el.classList.contains('bible-cite')) {
                        var book = el.getAttribute('data-book-name') || "";
                        var chapter = el.getAttribute('data-chapter') || "";
                        currentKey = "bible-" + book + "-" + chapter;
                        titleText = book + (chapter ? ", глава " + chapter : "");
                    } else if (el.classList.contains('message-cite')) {
                        titleText = el.getAttribute('data-msg-title') || "";
                        currentKey = "msg-" + titleText;
                    }

                    // ПРОВЕРКА НА РАЗРЫВ:
                    // Считаем группу новой, если:
                    // 1. Изменился ключ (другая глава/проповедь)
                    // 2. Между текущим и предыдущим элементами есть текст (кроме пустых пробелов)
                    var hasTextGap = false;
                    var prevNode = el.previousSibling;

                    // Проверяем все узлы между текущей и предыдущей цитатой
                    while (prevNode) {
                        // Если встретили другую цитату - стоп, проверяем ключ
                        if (prevNode.nodeType === 1 && (prevNode.classList.contains('bible-cite') || prevNode.classList.contains('message-cite'))) {
                            break;
                        }
                        // Если встретили текст, который не просто пробел - это разрыв
                        if (prevNode.nodeType === 3 && prevNode.textContent.trim().length > 0) {
                            hasTextGap = true;
                            break;
                        }
                        // Если встретили картинку или видео - это разрыв
                        if (prevNode.nodeType === 1 && (prevNode.classList.contains('sermon-img-wrap') || prevNode.classList.contains('sermon-video-wrap'))) {
                            hasTextGap = true;
                            break;
                        }
                        prevNode = prevNode.previousSibling;
                    }

                    if (currentKey !== lastKey || hasTextGap) {
                        if (titleText) {
                            var header = document.createElement('div');
                            header.className = 'sermon-group-header';
                            // Добавляем класс в зависимости от типа для разного цвета рамок, если нужно
                            header.classList.add(el.classList.contains('bible-cite') ? 'header-bible' : 'header-msg');
                            header.textContent = titleText;
                            el.parentNode.insertBefore(header, el);
                        }
                    }

                    lastKey = currentKey;
                });
            }, 150);
        };

        // ==========================================================
        // KEYBOARD SWITCHING CITATIONS
        // ==========================================================

        $scope.navigateSermonContent = function(direction) {
            // 1. Находим все интерактивные элементы в DOM
            var items = document.querySelectorAll('#notes-body .bible-cite, #notes-body .sermon-img-wrap, #notes-body .sermon-video-wrap, #notes-body .message-cite');
            if (!items.length) return;

            // 2. Ищем индекс текущего активного элемента по вашим классам
            var currentIndex = -1;
            for (var i = 0; i < items.length; i++) {
                var cl = items[i].classList;
                if (cl.contains('active-cite') || cl.contains('active-img') || cl.contains('active-video')) {
                    currentIndex = i;
                    break;
                }
            }

            // 3. Определяем индекс следующего элемента
            var nextIndex;
            if (direction === 'next') {
                nextIndex = currentIndex + 1;
                if (nextIndex >= items.length) return; // Дошли до конца
            } else {
                nextIndex = currentIndex - 1;
                // Если ничего не выбрано, при нажатии "назад" выберем первый элемент
                if (currentIndex === -1) nextIndex = 0;
                if (nextIndex < 0) return; // Дошли до начала
            }

            // 4. Активируем элемент
            var target = items[nextIndex];

            // Имитируем клик (это запустит вашу существующую логику отображения)
            target.click();

            // Плавно скроллим левую панель к этому элементу
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };


        document.addEventListener('keydown', function(e) {
            // Проверяем, не пишет ли пользователь в этот момент в каком-нибудь input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                $scope.$apply(function() { $scope.navigateSermonContent('next'); });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                $scope.$apply(function() { $scope.navigateSermonContent('prev'); });
            }
        });

        var displayPanel = document.getElementById('display-panel');
        var touchStartY = 0;

        displayPanel.addEventListener('touchstart', function(e) {
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        displayPanel.addEventListener('touchend', function(e) {
            var touchEndY = e.changedTouches[0].screenY;
            var deltaY = touchStartY - touchEndY; // Положительное число = свайп вверх

            var threshold = 50; // Чувствительность в пикселях

            if (Math.abs(deltaY) > threshold) {
                $scope.$apply(function() {
                    if (deltaY > 0) {
                        // Палец ушел вверх -> показываем следующий контент
                        $scope.navigateSermonContent('next');
                    } else {
                        // Палец ушел вниз -> показываем предыдущий контент
                        $scope.navigateSermonContent('prev');
                    }
                });
            }
        }, { passive: true });

        // ==========================================================
        // TOUCH ZOOM
        // ==========================================================

        var notesPanel = document.getElementById('notes-panel');
        var lastDistance = 0;
        var minPinchDistance = 40; // Чувствительность: через сколько пикселей срабатывает зум

        notesPanel.addEventListener('touchmove', function(e) {
            // Проверяем, что на экране именно 2 пальца
            if (e.touches.length === 2) {
                e.preventDefault(); // Предотвращаем стандартный зум браузера

                // Считаем расстояние между пальцами (гипотенуза)
                var dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );

                if (lastDistance > 0) {
                    var diff = dist - lastDistance;

                    // Если пальцы раздвигаются
                    if (diff > minPinchDistance) {
                        $scope.$apply(function() {
                            $scope.changeNotesFontSize(1);
                        });
                        lastDistance = dist;
                    }
                    // Если пальцы сжимаются
                    else if (diff < -minPinchDistance) {
                        $scope.$apply(function() {
                            $scope.changeNotesFontSize(-1);
                        });
                        lastDistance = dist;
                    }
                } else {
                    lastDistance = dist;
                }
            }
        }, { passive: false });

        notesPanel.addEventListener('touchend', function() {
            lastDistance = 0; // Сбрасываем при отпускании пальцев
        });

        // ==========================================================
        // COLOUR UTILITIES
        // ==========================================================

        function hexToRgb(hex) {
            hex = hex.replace(/^#/, '');
            if (hex.length === 3) hex = hex.split('').map(function(c){ return c+c; }).join('');
            var n = parseInt(hex, 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }

        function rgbToHex(r, g, b) {
            return '#' + [r, g, b].map(function(v){
                return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
            }).join('');
        }

        function rgbToHsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            var max = Math.max(r, g, b), min = Math.min(r, g, b);
            var h, s, l = (max + min) / 2;
            if (max === min) { h = s = 0; } else {
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

        function hslToRgb(h, s, l) {
            h /= 360; s /= 100; l /= 100;
            var r, g, b;
            if (s === 0) { r = g = b = l; } else {
                var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                var p = 2 * l - q;
                var hue = function(t) {
                    if (t < 0) t += 1; if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                };
                r = hue(h + 1/3); g = hue(h); b = hue(h - 1/3);
            }
            return [r * 255, g * 255, b * 255];
        }

        function hsl(h, s, l) { return rgbToHex.apply(null, hslToRgb(h, s, l)); }

        function hexWithAlpha(hex, alpha) {
            var rgb = hexToRgb(hex);
            return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
        }

        function shadeHex(hex, amount) {
            var rgb = hexToRgb(hex);
            return rgbToHex(rgb[0] + amount, rgb[1] + amount, rgb[2] + amount);
        }

        function deriveChipColorsLight(baseHex) {
            return {
                bg:           hexWithAlpha(baseHex, 0.1),
                border:       shadeHex(baseHex, -28),
                ref:          baseHex,
                verse:        shadeHex(baseHex, -40),
                hoverBg:      hexWithAlpha(baseHex, 0.18),
                hoverBorder:  shadeHex(baseHex, -50),
                activeBg:     hexWithAlpha(baseHex, 0.55),
                activeBorder: shadeHex(baseHex, -60),
                activeVerse:  shadeHex(baseHex, -80),
                shadow:       hexWithAlpha(baseHex, 0.40)
            };
        }

        function deriveNotesPanelColors(bgHex) {
            var rgb  = hexToRgb(bgHex);
            var hsl_ = rgbToHsl(rgb[0], rgb[1], rgb[2]);
            var h = hsl_[0], s = hsl_[1], l = hsl_[2];
            var dark = l < 50;                          // тёмный фон?
            return {
                bodyBg:    hsl(h, s, Math.max(l - 8, 0)),
                bg:        bgHex,
                headerBg:  hsl(h, s, Math.max(l - 5, 0)),
                border:    hsl(h, s, Math.min(l + 12, 55)),
                selectBg:  hsl(h, s, Math.min(l + 4,  50)),
                textColor: dark ? hsl(h, Math.min(s, 12), 88) : hsl(h, Math.min(s, 12), 12),  // основной текст
                textDim:   dark ? hsl(h, Math.min(s, 12), 55) : hsl(h, Math.min(s, 12), 48)   // второстепенный
            };
        }

        // ==========================================================
        // USER SETTINGS
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

        function getContrastColor(bgHex) {
            // Calculate luminance of background color
            var rgb = hexToRgb(bgHex);
            var r = rgb[0] / 255;
            var g = rgb[1] / 255;
            var b = rgb[2] / 255;

            // Convert to linear RGB
            r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
            g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
            b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

            // Calculate relative luminance
            var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Return white for dark backgrounds, black for light backgrounds
            return luminance > 0.5 ? '#000000' : '#ffffff';
        }

        function applyDisplaySettings() {
            if (!userSettings) return;
            var bgColor = userSettings.main_bg_color || '#000000';
            var autoTextColor = getContrastColor(bgColor);

            var panel = document.getElementById('display-panel');
            if (panel) {
                panel.style.backgroundColor = bgColor;
                panel.style.color           = autoTextColor;
                panel.style.fontFamily      = userSettings.main_font || 'Arial';
            }
            var textEl = document.getElementById('display-text');
            if (textEl) {
                textEl.style.fontFamily = userSettings.main_font || 'Arial';
                textEl.style.color      = autoTextColor;
            }
            var titleEl = document.getElementById('display-title');
            if (titleEl) {
                titleEl.style.color = autoTextColor;
            }
            // Restore notes font size and chip scaling from settings
            $scope.notesFontSize = parseInt(userSettings.sermon_notes_font_size) || 13;
            scaleChips = !!parseInt(userSettings.sermon_scale_chips || 0);
            applyNotesFontSize();
        }

        function applySermonColors() {
            if (!userSettings) return;
            var root = document.documentElement;

            var np = deriveNotesPanelColors(userSettings.sermon_notes_bg_color || '#2b2b2b');
            root.style.setProperty('--sn-body-bg',      np.bodyBg);
            root.style.setProperty('--sn-notes-bg',     np.bg);
            root.style.setProperty('--sn-notes-header', np.headerBg);
            root.style.setProperty('--sn-notes-border', np.border);
            root.style.setProperty('--sn-select-bg',    np.selectBg);

            root.style.setProperty('--sn-notes-text',     np.textColor);
            root.style.setProperty('--sn-notes-text-dim', np.textDim);

            var bc = deriveChipColorsLight(userSettings.sermon_bible_base_color || '#1565c0');
            root.style.setProperty('--sn-bible-bg',           bc.bg);
            root.style.setProperty('--sn-bible-border',       bc.border);
            root.style.setProperty('--sn-bible-ref',          bc.ref);
            root.style.setProperty('--sn-bible-verse',        bc.verse);
            root.style.setProperty('--sn-bible-hover-bg',     bc.hoverBg);
            root.style.setProperty('--sn-bible-hover-border', bc.hoverBorder);
            root.style.setProperty('--sn-bible-active-bg',    bc.activeBg);
            root.style.setProperty('--sn-bible-active-bdr',   bc.activeBorder);
            root.style.setProperty('--sn-bible-active-verse', bc.activeVerse);
            root.style.setProperty('--sn-bible-shadow',       bc.shadow);

            var mc = deriveChipColorsLight(userSettings.sermon_msg_base_color || '#6a1b9a');
            root.style.setProperty('--sn-msg-bg',           mc.bg);
            root.style.setProperty('--sn-msg-border',       mc.border);
            root.style.setProperty('--sn-msg-color',        mc.ref);
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
                    $scope.groupCitations();

                    $timeout(attachNoteHandlers, 100);
                    clearDisplayScope();
                    activeEl = null;
                }
            );
        };

        // ==========================================================
        // CLICK HANDLERS
        // ==========================================================

        function attachNoteHandlers() {
            var body = document.getElementById('notes-body');
            if (!body) return;

            body.querySelectorAll('.bible-cite').forEach(function (el) {
                el.style.cursor = 'pointer';
                el.onclick = function (e) {
                    e.preventDefault();
                    if (activeEl === el) {
                        deactivateAll();
                        $timeout(function () { clearDisplayScope(); sendImageToDisplay(''); });
                        return;
                    }
                    activateElement(el);
                    var bookId     = el.getAttribute('data-book-id');
                    var bookNum    = el.getAttribute('data-book-num') || bookId; // Fallback to bookId for old sermons
                    var chapter    = el.getAttribute('data-chapter');
                    var verseNum   = el.getAttribute('data-verse-nums');
                    var refLabel   = el.getAttribute('data-ref-label') || '';
                    var colSuffix  = el.getAttribute('data-col-suffix') || '';
                    $timeout(function () { fetchAndShowVerse(colSuffix, bookNum, chapter, verseNum, refLabel); });
                };
            });

            body.querySelectorAll('.sermon-img-wrap').forEach(function (el) {
                el.style.cursor = 'pointer';
                el.onclick = function (e) {
                    e.preventDefault();
                    if (activeEl === el) {
                        deactivateAll();
                        $timeout(function () { clearDisplayScope(); sendImageToDisplay(''); });
                        return;
                    }
                    activateElement(el);
                    var path = el.getAttribute('data-image-path');
                    if (path) {
                        $timeout(function () { showImage(path); sendImageToDisplay(path); });
                    }
                };
            });

            body.querySelectorAll('.message-cite').forEach(function (el) {
                el.style.cursor = 'pointer';
                el.onclick = function (e) {
                    e.preventDefault();
                    if (activeEl === el) {
                        deactivateAll();
                        $timeout(function () { clearDisplayScope(); sendImageToDisplay(''); });
                        return;
                    }
                    activateElement(el);
                    var paraText = el.getAttribute('data-para-text') || '';
                    var msgTitle = el.getAttribute('data-msg-title') || '';
                    $timeout(function () {
                        showText(paraText, msgTitle);
                        // Only send to display if a monitor is selected
                        if ($scope.selectedDisplayTarget !== null) {
                            $http({ method: "POST", url: "/ajax", data: {
                                command: 'set_message_text',
                                text: paraText,
                                song_name: msgTitle,
                                target_group_id: $scope.selectedDisplayTarget
                            }});
                        }
                    });
                };
            });

            // ── VIDEO CHIPS ──────────────────────────────────────
            body.querySelectorAll('.sermon-video-wrap').forEach(function (el) {
                el.style.cursor = 'pointer';
                el.onclick = function (e) {
                    e.preventDefault();

                    // Деактивировать при повторном клике
                    if (activeEl === el) {
                        el.classList.remove('active-video');
                        activeEl = null;
                        $timeout(function () { clearVideoDisplay(); sendVideoClear(); });
                        return;
                    }

                    // Деактивировать предыдущий элемент
                    if (activeEl) activeEl.classList.remove('active-cite', 'active-img', 'active-video');
                    activeEl = el;
                    el.classList.add('active-video');

                    var src  = el.getAttribute('data-video-src');
                    var name = el.getAttribute('data-video-label') || src;

                    $timeout(function () {
                        showVideo(src, name);
                        sendVideoToDisplay(src);
                    });
                };
            });
        }

        function activateElement(el) {
            if (activeEl && activeEl !== el) activeEl.classList.remove('active-cite', 'active-img', 'active-video');
            activeEl = el;
            el.classList.add(
                (el.classList.contains('bible-cite') || el.classList.contains('message-cite'))
                    ? 'active-cite' : 'active-img'
            );
        }

        function deactivateAll() {
            if (activeEl) { activeEl.classList.remove('active-cite', 'active-img', 'active-video'); activeEl = null; }
        }

        function clearDisplayScope() {
            $scope.displayText     = '';
            $scope.displayTitle    = '';
            $scope.displayImageSrc = '';
        }

        // ==========================================================
        // FETCH BIBLE VERSE
        // ==========================================================

        function fetchAndShowVerse(colSuffix, bookNumOrId, chapter, verseNum, refLabel) {
            // Try book_num first (new method), fallback to book_id (old method)
            var requestData = { command: 'get_bible_verses', chapter_num: chapter };
            // If bookNumOrId is <= 66, it's probably BOOK_NUM, otherwise it's BOOK_ID
            if (parseInt(bookNumOrId) <= 66) {
                requestData.book_num = bookNumOrId;
            } else {
                requestData.book_id = bookNumOrId;
            }
            $http({ method: "POST", url: "/ajax", data: requestData})
                .then(function (r) {
                    var found = null;
                    for (var i = 0; i < r.data.length; i++) {
                        if (parseInt(r.data[i].VERSE_NUM) === parseInt(verseNum)) { found = r.data[i]; break; }
                    }
                    if (found) {
                        // Select text based on col_suffix from languages table
                        // '' → TEXT, '_LT' → TEXT_LT, '_EN' → TEXT_EN
                        var fieldName = 'TEXT' + (colSuffix || '');
                        var verseText = found[fieldName] || found.TEXT || '';

                        var text = verseNum + '. ' + verseText;
                        showText(text, refLabel);
                        // Only send to display if a monitor is selected
                        if ($scope.selectedDisplayTarget !== null) {
                            $http({ method: "POST", url: "/ajax", data: {
                                command: 'set_message_text',
                                text: text,
                                song_name: refLabel,
                                target_group_id: $scope.selectedDisplayTarget
                            }});
                        }
                    }
                });
        }

        // ==========================================================
        // LOCAL DISPLAY HELPERS
        // ==========================================================

        function showText(text, title) {
            $scope.displayText     = text;
            $scope.displayTitle    = title || '';
            $scope.displayImageSrc = '';
            // Wait for Angular to finish rendering the new text into the DOM,
            // then use requestAnimationFrame so the browser has actually painted
            // (and #display-text-wrap has correct clientHeight/clientWidth).
            $timeout(function () {
                requestAnimationFrame(function () {
                    autoFitText(text);
                });
            });
        }

        function showImage(path) {
            $scope.displayText     = '';
            $scope.displayTitle    = '';
            $scope.displayImageSrc = path;
        }

        function sendImageToDisplay(path) {
            // Only send to display if a monitor is selected
            if ($scope.selectedDisplayTarget !== null) {
                $http({ method: "POST", url: "/ajax", data: {
                    command: path ? 'set_tech_image' : 'clear_image',
                    image_name: path,
                    target_group_id: $scope.selectedDisplayTarget
                }});
            }
        }

        // ---------- helpers ----------

        function _ytId(url) {
            var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
            return m ? m[1] : null;
        }
        function _fmtTime(s) {
            if (!s || isNaN(s)) return '0:00';
            var m = Math.floor(s / 60), sec = Math.floor(s % 60);
            return m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        // ---------- show/hide video on right panel ----------

        function showVideo(src, name) {
            var ytId = _ytId(src);

            $scope.displayVideoSrc = src;          // non-empty triggers ng-show
            if (ytId) {
                $scope.displayVideoIsYouTube = true;
                $scope.displayVideoEmbedSrc  = $sce.trustAsResourceUrl(
                    'https://www.youtube.com/embed/' + ytId + '?autoplay=1&rel=0&modestbranding=1&enablejsapi=1'
                );
                $scope.displayVideoSrcLocal  = null;
                $scope.videoIsYouTube        = true;
            } else {
                $scope.displayVideoIsYouTube = false;
                $scope.displayVideoEmbedSrc  = null;
                $scope.displayVideoSrcLocal  = $sce.trustAsResourceUrl(src);
                $scope.videoIsYouTube        = false;
            }

            $scope.videoActive      = true;
            $scope.videoPlaying     = true;
            $scope.videoCurrentName = name || src.split('/').pop();

            // Очищаем текст/картинку
            clearDisplayScope();

            if (!ytId) { _startProgress(); }
        }

        function clearVideoDisplay() {
            $scope.displayVideoSrc       = '';
            $scope.displayVideoIsYouTube = false;
            $scope.displayVideoEmbedSrc  = null;
            $scope.displayVideoSrcLocal  = null;
            $scope.videoActive           = false;
            $scope.videoPlaying          = false;
            $scope.videoProgress         = 0;
            $scope.videoCurrentTime      = '0:00';
            _stopProgress();
        }

        function sendVideoToDisplay(src) {
            // Only send to display if a monitor is selected
            if ($scope.selectedDisplayTarget !== null) {
                $http({ method: 'POST', url: '/ajax', data: {
                        command:     'set_video',
                        video_src:   src || '',
                        video_state: 'playing',
                        target_group_id: $scope.selectedDisplayTarget
                    }});
            }
        }

        function sendVideoClear() {
            // Only send to display if a monitor is selected
            if ($scope.selectedDisplayTarget !== null) {
                $http({ method: 'POST', url: '/ajax', data: {
                    command: 'clear_image',
                    target_group_id: $scope.selectedDisplayTarget
                }});
            }
        }

        function _sendVideoControl(state) {
            // Only send to display if a monitor is selected
            if ($scope.selectedDisplayTarget !== null) {
                $http({ method: 'POST', url: '/ajax', data: {
                    command: 'video_control',
                    video_state: state,
                    target_group_id: $scope.selectedDisplayTarget
                }});
            }
        }

        // ---------- progress bar for local files ----------

        function _startProgress() {
            _stopProgress();
            videoProgressTimer = setInterval(function () {
                if ($scope.videoSeeking) return;
                var el = document.getElementById('sermon-display-video');
                if (el && el.duration) {
                    $scope.$apply(function () {
                        $scope.videoProgress    = (el.currentTime / el.duration) * 100;
                        $scope.videoCurrentTime = _fmtTime(el.currentTime);
                    });
                }
            }, 500);
        }
        function _stopProgress() {
            if (videoProgressTimer) { clearInterval(videoProgressTimer); videoProgressTimer = null; }
        }

        // ---------- controls (called from left panel) ----------

        $scope.toggleVideoPlayback = function () {
            if ($scope.videoPlaying) {
                $scope.videoPlaying = false;
                if ($scope.videoIsYouTube) {
                    var iframe = document.getElementById('sermon-yt-player');
                    if (iframe) iframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'
                    );
                } else {
                    var el = document.getElementById('sermon-display-video');
                    if (el) el.pause();
                }
                _sendVideoControl('paused');
            } else {
                $scope.videoPlaying = true;
                if ($scope.videoIsYouTube) {
                    var iframe = document.getElementById('sermon-yt-player');
                    if (iframe) iframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
                    );
                } else {
                    var el = document.getElementById('sermon-display-video');
                    if (el) el.play().catch(function(){});
                }
                _sendVideoControl('playing');
            }
        };

        $scope.stopVideo = function () {
            var el = document.getElementById('sermon-display-video');
            if (el) { el.pause(); el.currentTime = 0; }
            clearVideoDisplay();
            sendVideoClear();
            // Снять активность с чипа
            if (activeEl) {
                activeEl.classList.remove('active-cite', 'active-img', 'active-video');
                activeEl = null;
            }
        };

        $scope.seekVideo = function () {
            var el = document.getElementById('sermon-display-video');
            if (el && el.duration) {
                el.currentTime = (el.duration * $scope.videoProgress) / 100;
            }
        };


        /**
         * autoFitText — grows font until the text fills the display panel.
         *
         * Key design decisions:
         *  - font-size is written directly to el.style — no ng-style binding,
         *    which would overwrite our value on every digest.
         *  - called via requestAnimationFrame so clientHeight/clientWidth of the
         *    wrapper are always the real painted dimensions, even at large window sizes.
         *  - if dimensions are still 0 (element hidden), retries once via rAF.
         *  - `expectedText` guard: if the user clicked something else while the
         *    async fetch was in flight, we skip stale calls.
         */
        function autoFitText(expectedText) {
            var wrap = document.getElementById('display-text-wrap');
            var el   = document.getElementById('display-text');
            if (!wrap || !el) return;

            // Guard: skip if scope changed while we were waiting
            if (expectedText !== undefined && $scope.displayText !== expectedText) return;

            var maxH = wrap.clientHeight * 0.90;
            var maxW = wrap.clientWidth  * 0.95;

            // If wrapper has no dimensions yet, retry after next paint
            if (maxH <= 0 || maxW <= 0) {
                requestAnimationFrame(function () { autoFitText(expectedText); });
                return;
            }

            // Start small and grow
            var size = 8;
            var maxSize = 100;
            el.style.fontSize = size + 'px';

            while (size < maxSize && el.scrollHeight <= maxH) {
                size++;
                el.style.fontSize = size + 'px';
            }
            // One step back if we overshot
            if (el.scrollHeight > maxH) {
                size = Math.max(8, size - 1);
                el.style.fontSize = size + 'px';
            }
        }

        function applyNotesFontSize() {
            var size = $scope.notesFontSize;
            var root = document.documentElement;
            root.style.setProperty('--sn-notes-font', size + 'pt');
            if (scaleChips) {
                var ratio = size / 13;
                root.style.setProperty('--sn-chip-font',       (10  * ratio).toFixed(1) + 'pt');
                root.style.setProperty('--sn-chip-verse-font', (9.5 * ratio).toFixed(1) + 'pt');
            } else {
                root.style.setProperty('--sn-chip-font',       '10pt');
                root.style.setProperty('--sn-chip-verse-font', '9.5pt');
            }
        }

        // ==========================================================
        // NOTES PANEL FONT SIZE
        // ==========================================================

        $scope.changeNotesFontSize = function (delta) {
            var next = $scope.notesFontSize + delta;
            if (next < NOTES_FONT_MIN || next > NOTES_FONT_MAX) return;
            $scope.notesFontSize = next;
            applyNotesFontSize();
            // Debounced save
            if (fontSavePending) $timeout.cancel(fontSavePending);
            fontSavePending = $timeout(function () {
                $http({ method: "POST", url: "/ajax", data: {
                        command: 'save_sermon_notes_settings',
                        sermon_notes_font_size: $scope.notesFontSize,
                        sermon_scale_chips: scaleChips ? 1 : 0
                    }});
            }, 800);
        };

        // ==========================================================
        // FULLSCREEN
        // ==========================================================

        $scope.toggleFullscreen = function () {
            if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); }
            else { document.exitFullscreen(); }
        };

        // ==========================================================
        // DISPLAY TARGET MANAGEMENT
        // ==========================================================

        function loadDisplayTargets() {
            $http.post('/ajax', { command: 'get_display_targets' }).then(
                function (r) {
                    if (r.data && r.data.status === 'ok') {
                        // Add "не транслировать" as first option
                        $scope.displayTargets = [
                            { group_id: null, display_name: '— не транслировать —' }
                        ].concat(r.data.targets || []);

                        // Set default to "не транслировать" (null)
                        if (!$scope.selectedDisplayTarget) {
                            $scope.selectedDisplayTarget = null;
                        }
                    }
                }
            );
        }

        function loadAvailableGroups() {
            $http.post('/ajax', { command: 'get_available_groups' }).then(
                function (r) {
                    if (r.data && r.data.status === 'ok') {
                        $scope.availableGroups = r.data.groups || [];
                    }
                }
            );
        }

        $scope.$watch('showAccessRequestModal', function(newVal) {
            if (newVal) {
                loadAvailableGroups();
            }
        });

        $scope.sendAccessRequest = function() {
            if (!$scope.selectedGroupForRequest) return;

            $http.post('/ajax', {
                command: 'request_display_access',
                target_group_id: parseInt($scope.selectedGroupForRequest)
            }).then(
                function(r) {
                    if (r.data && r.data.status === 'ok') {
                        alert('✓ Запрос отправлен. Ожидайте подтверждения от владельца дисплея.');
                        $scope.showAccessRequestModal = false;
                        $scope.selectedGroupForRequest = '';
                    } else {
                        alert('Ошибка: ' + (r.data.message || 'Неизвестная ошибка'));
                    }
                },
                function(err) {
                    alert('Ошибка отправки запроса');
                }
            );
        };
    });