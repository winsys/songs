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
    // USER SETTINGS (colours / font for right panel)
    // ==========================================================

    function loadUserSettings() {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_user_settings' } }).then(
            function (r) {
                if (r.data) {
                    userSettings = r.data;
                    applyDisplaySettings();
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
                // Trust HTML so ng-bind-html renders it
                $scope.notesHtml = $sce.trustAsHtml(r.data.CONTENT || '');
                // After Angular renders the HTML, attach click handlers
                $timeout(attachNoteHandlers, 100);
                // Clear display
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

                // Toggle off if already active
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

                // Toggle off if already active
                if (activeEl === el) {
                    deactivateAll();
                    showImage('');
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
    }

    function activateElement(el) {
        if (activeEl && activeEl !== el) {
            activeEl.classList.remove('active-cite', 'active-img');
        }
        activeEl = el;
        el.classList.add(el.classList.contains('bible-cite') ? 'active-cite' : 'active-img');
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
        // Clear /text/ screen too
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
                // Update local right panel
                showText(text, refLabel);
                // Send to /text/ display (writes to `current`, triggers WebSocket)
                $http({ method: "POST", url: "/ajax", data: {
                    command: 'set_bible_text',
                    text: text,
                    song_name: refLabel
                }});
            }
        });
    }

    function sendImageToDisplay(path) {
        if (!path) {
            $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' } });
        } else {
            $http({ method: "POST", url: "/ajax", data: {
                command: 'set_tech_image',
                image_name: path
            }});
        }
    }

    // ==========================================================
    // SHOW TEXT / IMAGE ON RIGHT PANEL (local preview only)
    // ==========================================================

    function showText(text, title) {
        $scope.displayImageSrc = '';
        $scope.displayText     = text;
        $scope.displayTitle    = title || '';
        // Single $timeout — let Angular render, then measure
        $timeout(function () {
            applyDisplaySettings();
            adjustDisplayFontSize();
        }, 0);
    }

    function showImage(path) {
        if ($scope.$$phase) {
            $scope.displayImageSrc = path;
            $scope.displayText     = '';
            $scope.displayTitle    = '';
        } else {
            $scope.$apply(function () {
                $scope.displayImageSrc = path;
                $scope.displayText     = '';
                $scope.displayTitle    = '';
            });
        }
        $timeout(applyDisplaySettings, 50);
    }

    // ==========================================================
    // AUTO FONT SIZE
    // ==========================================================

    function adjustDisplayFontSize() {
        var container = document.getElementById('display-text-container');
        var textEl    = document.getElementById('display-text');
        if (!container || !textEl) return;

        var maxSize = 100, currentSize = 10;
        textEl.style.fontSize = currentSize + 'px';

        while (currentSize < maxSize &&
               textEl.scrollHeight <= container.clientHeight &&
               textEl.scrollWidth  <= container.clientWidth) {
            currentSize++;
            textEl.style.fontSize = currentSize + 'px';
        }
        while ((textEl.scrollHeight > container.clientHeight ||
                textEl.scrollWidth  > container.clientWidth) && currentSize > 1) {
            currentSize--;
            textEl.style.fontSize = currentSize + 'px';
        }
        if (currentSize > 64) currentSize = 64;
        $scope.displayFontSize = currentSize;
    }

    angular.element(window).on('resize', function () {
        if ($scope.displayText) adjustDisplayFontSize();
    });

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

    // ESC key — clear display
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !document.fullscreenElement) {
            $scope.$apply(function () {
                $scope.displayText     = '';
                $scope.displayTitle    = '';
                $scope.displayImageSrc = '';
                if (activeEl) {
                    activeEl.classList.remove('active-cite', 'active-img');
                    activeEl = null;
                }
            });
        }
    });
});
