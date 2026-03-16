app.controller('SermonPrep', function ($scope, $http, $timeout, $sce) {

    // ── Sermon data ─────────────────────────────────────────
    $scope.sermon = { id: null, title: '', date: '' };
    $scope.sermonList    = [];
    $scope.showSermonList = false;
    $scope.saveStatus    = '';

    // ── Bible navigator state ────────────────────────────────
    $scope.bibleTranslations      = [];
    $scope.bibleTranslationId     = null;
    $scope.bibleBooks             = [];
    $scope.selectedBook           = null;
    $scope.bibleChapters          = [];
    $scope.selectedChapter        = null;
    $scope.rawVerses              = [];
    $scope.preparedVerses         = [];
    $scope.selectedBibleVerseNums = [];

    // ── UI state ─────────────────────────────────────────────
    $scope.bookSearchQuery     = '';
    $scope.biblePanelCollapsed = false;
    $scope.leftPanelTab        = 'bible';
    $scope.showColorPicker     = false;
    $scope.currentColor        = '#e53935';
    $scope.modalImgSrc         = '';
    $scope.colorPalette = [
        '#e53935','#d81b60','#8e24aa','#3949ab','#1e88e5',
        '#00acc1','#43a047','#f4511e','#fb8c00','#fdd835',
        '#6d4c41','#546e7a','#000000','#607d8b'
    ];

    // ── Editor DOM reference + cursor ────────────────────────
    var editorEl  = null;
    var lastRange = null;

    // ── Auto-save timer ──────────────────────────────────────
    var autoSaveTimer = null;

    // ── Messages panel state ─────────────────────────────────
    $scope.prepMsgTitleQuery   = '';
    $scope.prepMsgTextQuery    = '';
    $scope.prepMsgResults      = [];
    $scope.prepSelectedMessage = null;
    $scope.prepMsgParagraphs   = [];
    $scope.prepSelectedParaIdx = null;
    var prepMsgSearchTimer     = null;
    $scope.prepMsgParaExpanded = false;
    $scope.prepLangList = [];   // [{code, label, col_suffix, is_default}, ...]
    $scope.prepLangs    = {};   // code → bool

    // ── VIDEO state ──────────────────────────────────────────
    $scope.showVideoPanel  = false;   // toolbar dropdown open
    $scope.videoUrlInput   = '';      // URL field value
    // Preview modal
    $scope.modalVideoSrc          = '';
    $scope.modalVideoSrcTrusted   = null;
    $scope.modalVideoEmbedSrc     = null;

    // ── Upload loading state ─────────────────────────────────
    $scope.uploadingImage = false;
    $scope.uploadingVideo = false;

    // ── Display Access state ─────────────────────────────────
    $scope.displayTargets = [];
    $scope.selectedDisplayTarget = null;
    $scope.showAccessRequestModal = false;
    $scope.availableGroups = [];

    // ── Helper to delete uploaded media file ─────────────────
    function deleteSermonMedia(path) {
        // Only delete if it's an uploaded file (starts with /sermon_images/ or /sermon_videos/)
        if (path && (path.indexOf('/sermon_images/') === 0 || path.indexOf('/sermon_videos/') === 0)) {
            $http.post('/ajax', { command: 'delete_sermon_media', path: path });
        }
    }

    // ──────────────────────────────────────────────────────────
    // COLOUR UTILITIES (unchanged from v1)
    // ──────────────────────────────────────────────────────────

    function _hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(function(c){ return c+c; }).join('');
        var n = parseInt(hex, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function _rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(v){
            return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
        }).join('');
    }
    function _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r,g,b), min = Math.min(r,g,b);
        var h, s, l = (max+min)/2;
        if (max===min) { h=s=0; } else {
            var d = max-min;
            s = l>0.5 ? d/(2-max-min) : d/(max+min);
            switch (max) {
                case r: h=((g-b)/d+(g<b?6:0))/6; break;
                case g: h=((b-r)/d+2)/6; break;
                case b: h=((r-g)/d+4)/6; break;
            }
        }
        return [h*360, s*100, l*100];
    }
    function _hslToRgb(h, s, l) {
        h/=360; s/=100; l/=100;
        var r,g,b;
        if (s===0) { r=g=b=l; } else {
            var hue2rgb=function(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
            var q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
            r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
        }
        return [r*255, g*255, b*255];
    }
    function shadeHex(hex, amount) {
        var rgb=_hexToRgb(hex);
        return _rgbToHex(rgb[0]+amount, rgb[1]+amount, rgb[2]+amount);
    }
    function hexWithAlpha(hex, alpha) {
        var rgb=_hexToRgb(hex);
        return 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+alpha+')';
    }
    function deriveChipColorsLight(baseHex) {
        return {
            bg:      hexWithAlpha(baseHex, 0.1),
            border:  shadeHex(baseHex, -28),
            ref:     baseHex,
            verse:   shadeHex(baseHex, -40),
            hoverBg: hexWithAlpha(baseHex, 0.18),
        };
    }
    function applyPrepChipColors(bibleBase, msgBase) {
        var root = document.documentElement;
        var bc = deriveChipColorsLight(bibleBase);
        root.style.setProperty('--sp-bible-bg',       bc.bg);
        root.style.setProperty('--sp-bible-border',   bc.border);
        root.style.setProperty('--sp-bible-ref',      bc.ref);
        root.style.setProperty('--sp-bible-verse',    bc.verse);
        root.style.setProperty('--sp-bible-hover-bg', bc.hoverBg);
        var mc = deriveChipColorsLight(msgBase);
        root.style.setProperty('--sp-msg-bg',         mc.bg);
        root.style.setProperty('--sp-msg-border',     mc.border);
        root.style.setProperty('--sp-msg-color',      mc.ref);
        root.style.setProperty('--sp-msg-hover-bg',   mc.hoverBg);
    }
    function loadPrepUserSettings() {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_user_settings' } }).then(
            function(r) {
                if (r.data) {
                    applyPrepChipColors(
                        r.data.sermon_bible_base_color || '#1565c0',
                        r.data.sermon_msg_base_color   || '#6a1b9a'
                    );
                }
            }
        );
    }

    function loadPrepLanguages() {
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_languages' } }).then(
            function (r) {
                var list = r.data || [];
                $scope.prepLangList = list;
                var newLangs = {};
                list.forEach(function (l) {
                    // сохранить уже выбранное, иначе: включён только язык по умолчанию
                    newLangs[l.code] = ($scope.prepLangs[l.code] !== undefined)
                        ? $scope.prepLangs[l.code]
                        : (l.is_default == '1');
                });
                $scope.prepLangs = newLangs;
            }
        );
    }

    // ──────────────────────────────────────────────────────────
    // INIT
    // ──────────────────────────────────────────────────────────

    angular.element(document).ready(function () {
        // Close color picker when clicking outside toolbar
        document.addEventListener('mousedown', function (e) {
            if (!e.target.closest('.color-picker-wrap')) {
                $scope.$apply(function () { $scope.showColorPicker = false; });
            }
        });
        // Close video panel when clicking outside it
        document.addEventListener('mousedown', function (e) {
            if (!e.target.closest('.video-insert-wrap')) {
                $scope.$apply(function () { $scope.showVideoPanel = false; });
            }
        });

        $scope.$apply(function () {
            var d = new Date();
            d.setDate(d.getDate() + 1);
            $scope.sermon.date = d.toISOString().slice(0, 10);
            $scope.loadSermonList();
            $scope.loadBibleTranslations();
            loadPrepLanguages();
            loadPrepUserSettings();
            loadDisplayTargets();
        });

        $timeout(function () {
            editorEl = document.getElementById('sermon-editor');
            if (!editorEl) { console.warn('sermon-editor not found'); return; }

            ['mouseup','keyup','touchend'].forEach(function (ev) {
                editorEl.addEventListener(ev, saveRange);
            });
            editorEl.addEventListener('input', function () { scheduleAutoSave(); });

            var fileInput = document.getElementById('sermon-image-input');
            if (fileInput) {
                fileInput.addEventListener('change', function () {
                    $scope.$apply(function () { $scope.onImageSelected(fileInput); });
                });
            }

            var videoInput = document.getElementById('sermon-video-input');
            if (videoInput) {
                videoInput.addEventListener('change', function () {
                    $scope.$apply(function () { $scope.onVideoSelected(videoInput); });
                });
            }

            // Setup drag and drop for chips
            setupEditorDropZone();
            initChipEditor()
        }, 0);
    });

    function saveRange() {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            var r = sel.getRangeAt(0);
            if (editorEl && editorEl.contains(r.commonAncestorContainer)) {
                lastRange = r.cloneRange();
            }
        }
    }
    function restoreRange() {
        if (!lastRange) {
            var sel = window.getSelection();
            var r   = document.createRange();
            r.selectNodeContents(editorEl);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
            lastRange = r;
        } else {
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(lastRange);
        }
    }

    // ──────────────────────────────────────────────────────────
    // DRAG AND DROP FOR CHIPS
    // ──────────────────────────────────────────────────────────
    var draggedChip = null;
    var dropRange = null;

    function makeDraggable(chip) {
        chip.setAttribute('draggable', 'true');
        chip.style.cursor = 'move';

        chip.addEventListener('dragstart', function(e) {
            draggedChip = chip;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', chip.outerHTML);
            chip.style.opacity = '0.5';
        });

        chip.addEventListener('dragend', function(e) {
            chip.style.opacity = '1';
            draggedChip = null;
            dropRange = null;
        });
    }

    // Setup editor drop zone
    function setupEditorDropZone() {
        if (!editorEl) return;

        editorEl.addEventListener('dragover', function(e) {
            if (!draggedChip) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Get caret position from mouse coordinates
            var range;
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
            } else if (document.caretPositionFromPoint) {
                var pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
            }
            dropRange = range;

            // Show visual cursor at drop position
            if (range) {
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        editorEl.addEventListener('drop', function(e) {
            if (!draggedChip || !dropRange) return;
            e.preventDefault();
            e.stopPropagation();

            // Remove chip from old position
            var chipToMove = draggedChip;
            chipToMove.remove();

            // Insert at drop position
            dropRange.insertNode(chipToMove);

            // Clean up
            draggedChip = null;
            dropRange = null;
            chipToMove.style.opacity = '1';
            scheduleAutoSave();
        });

        editorEl.addEventListener('dragleave', function(e) {
            if (!draggedChip) return;
            // Clear selection when dragging outside editor
            if (e.target === editorEl) {
                var sel = window.getSelection();
                sel.removeAllRanges();
            }
        });
    }

    // ──────────────────────────────────────────────────────────
    // SERMON CRUD (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.loadSermonList = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon_list' } }).then(
            function (r) { $scope.sermonList = r.data; }
        );
    };
    $scope.newSermon = function () {
        // Set today's date in YYYY-MM-DD format
        var today = new Date();
        var dateStr = today.toISOString().slice(0, 10);

        $scope.sermon = { id: null, title: '', date: dateStr };
        if (editorEl) editorEl.innerHTML = '';
        lastRange = null;
        $scope.saveStatus = '';
        $scope.showSermonList = false;
    };
    $scope.loadSermon = function (id) {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon', id: id } }).then(
            function (r) {
                var s = r.data;
                // Handle date: convert "0000-00-00" or null to empty string
                var sermonDate = s.SERMON_DATE;
                if (!sermonDate || sermonDate === '0000-00-00') {
                    sermonDate = '';
                }
                $scope.sermon = { id: s.ID, title: s.TITLE, date: sermonDate };
                if (editorEl) {
                    editorEl.innerHTML = s.CONTENT || '';
                    attachEditorHandlers();
                }
                lastRange = null;
                $scope.saveStatus   = '';
                $scope.showSermonList = false;
            }
        );
    };
    $scope.saveSermon = function () {
        var content = editorEl ? editorEl.innerHTML : '';
        // Use current date if date is not set
        var sermonDate = $scope.sermon.date;
        if (!sermonDate) {
            var today = new Date();
            sermonDate = today.toISOString().slice(0, 10);
            $scope.sermon.date = sermonDate;
        }
        $scope.saveStatus = 'saving';
        $http({ method: "POST", url: "/ajax", data: {
                command:      'save_sermon',
                id:           $scope.sermon.id || '',
                title:        $scope.sermon.title || '',
                sermon_date:  sermonDate,
                content:      content
            }}).then(
            function (r) {
                if (r.data && r.data.id) $scope.sermon.id = r.data.id;
                $scope.saveStatus = 'saved';
                $scope.loadSermonList();
                $timeout(function () { $scope.saveStatus = ''; }, 3000);
            },
            function () { $scope.saveStatus = ''; alert('Ошибка сохранения'); }
        );
    };

    $scope.deleteSermonFromList = function (id, $event) {
        $event.stopPropagation(); // не открывать проповедь при клике
        if (!confirm('Удалить эту проповедь?')) return;
        $http({ method: "POST", url: "/ajax", data: { command: 'delete_sermon', id: id } }).then(
            function () {
                // Если удаляем текущую открытую — сбросить редактор
                if ($scope.sermon.id == id) {
                    $scope.newSermon();
                }
                $scope.loadSermonList();
            }
        );
    };

    function scheduleAutoSave() {
        if (autoSaveTimer) $timeout.cancel(autoSaveTimer);
        autoSaveTimer = $timeout(function () {
            if ($scope.sermon.id || ($scope.sermon.title && editorEl && editorEl.innerHTML.length > 20)) {
                $scope.saveSermon();
            }
        }, 5000);
    }

    // ──────────────────────────────────────────────────────────
    // TEXT FORMATTING (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.execFmt = function (cmd, arg) {
        document.execCommand(cmd, false, arg || null);
    };
    $scope.toggleColorPicker = function () {
        saveRange();
        $scope.showColorPicker = !$scope.showColorPicker;
    };
    $scope.applyColor = function (color) {
        $scope.currentColor    = color;
        $scope.showColorPicker = false;
        restoreRange();
        document.execCommand('foreColor', false, color);
    };


    // ──────────────────────────────────────────────────────────
    // TEXT CONVERT TO MD (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.exportToMarkdown = function() {
        var htmlContent = document.getElementById('sermon-editor').innerHTML;

        // Инициализация сервиса
        var turndownService = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-'
        });

        // УНИВЕРСАЛЬНОЕ ПРАВИЛО для всех спец-блоков
        turndownService.addRule('keep-special-wrappers', {
            filter: function (node) {
                // Перечисляем все классы ваших специальных вставок
                const specialClasses = [
                    'bible-cite',
                    'message-cite',
                    'sermon-video-wrap',
                    'sermon-img-wrap'
                ];
                // Проверяем, есть ли у элемента хотя бы один из этих классов
                return specialClasses.some(className => node.classList.contains(className));
            },
            replacement: function (content, node) {
                // Создаем клон узла, чтобы не ломать оригинал в редакторе
                var clone = node.cloneNode(true);

                // Удаляем кнопки "Удалить" (крестики) внутри клона перед сохранением
                var removeButtons = clone.querySelectorAll('.cite-remove, .svw-del, .sermon-img-remove');
                removeButtons.forEach(btn => btn.remove());

                // Возвращаем чистый HTML без крестиков
                return clone.outerHTML;
            }
        });

        var markdown = turndownService.turndown(htmlContent);

        // Логика скачивания файла
        var blob = new Blob([markdown], { type: 'text/markdown' });
        var url = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.download = ($scope.sermon.TITLE || 'sermon') + '.md';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };


    // ──────────────────────────────────────────────────────────
    // IMAGE UPLOAD + INSERT (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.triggerImageUpload = function () {
        saveRange();
        document.getElementById('sermon-image-input').click();
    };
    $scope.onImageSelected = function (input) {
        if (!input.files || input.files.length === 0) return;
        $scope.uploadingImage = true;
        var file     = input.files[0];
        var formData = new FormData();
        formData.append('image',   file);
        formData.append('command', 'upload_sermon_image');
        formData.append('_csrf_token', window._getCsrfToken ? window._getCsrfToken() : '');
        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.uploadingImage = false;
                if (r.data && r.data.path) {
                    insertImageNode(r.data.path);
                } else {
                    var msg = (r.data && r.data.message) ? r.data.message : JSON.stringify(r.data);
                    alert('Ошибка загрузки: ' + msg);
                }
                input.value = '';
            },
            function (e) {
                $scope.uploadingImage = false;
                alert('Ошибка загрузки (HTTP ' + (e.status || '?') + '): ' + (e.statusText || ''));
                input.value = '';
            }
        );
    };
    function insertImageNode(path) {
        var span = document.createElement('span');
        span.className       = 'sermon-img-wrap';
        span.contentEditable = 'false';
        span.setAttribute('data-image-path', path);

        var img        = document.createElement('img');
        img.src        = path;
        img.className  = 'sermon-img-thumb';
        img.alt        = 'Изображение';

        var removeBtn       = document.createElement('span');
        removeBtn.className = 'sermon-img-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick   = function (e) {
            e.stopPropagation();
            deleteSermonMedia(path);
            span.remove();
            scheduleAutoSave();
        };

        span.onclick = function (e) {
            if (e.target === removeBtn) return;
            $scope.$apply(function () {
                $scope.modalImgSrc = path;
                document.getElementById('sermon-img-modal').classList.add('open');
            });
        };

        span.appendChild(img);
        span.appendChild(removeBtn);
        makeDraggable(span);
        insertNodeAtCursor(span);
    }

    // ──────────────────────────────────────────────────────────
    // VIDEO INSERT  ◄── НОВЫЙ БЛОК
    // ──────────────────────────────────────────────────────────

    /** Распознать YouTube-ссылку и извлечь videoId */
    function getYouTubeId(url) {
        var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
        return m ? m[1] : null;
    }

    /** Открыть/закрыть панель вставки видео */
    $scope.toggleVideoPanel = function ($event) {
        if ($event) { $event.preventDefault(); $event.stopPropagation(); }
        saveRange(); // сохранить курсор перед тем как фокус уйдёт
        $scope.showVideoPanel  = !$scope.showVideoPanel;
        $scope.videoUrlInput   = '';
    };

    /** Вставить видео по URL */
    $scope.insertVideoUrl = function () {
        var url = ($scope.videoUrlInput || '').trim();
        if (!url) return;
        var ytId  = getYouTubeId(url);
        var label = ytId ? ('YouTube · ' + ytId)
            : (url.split('/').pop() || url).substring(0, 50);
        restoreRange();
        insertVideoNode(url, label);
        $scope.showVideoPanel = false;
        $scope.videoUrlInput  = '';
    };

    /** Открыть диалог выбора видеофайла */
    $scope.triggerVideoUpload = function () {
        saveRange();
        $scope.showVideoPanel = false;
        document.getElementById('sermon-video-input').click();
    };

    /** Обработчик выбора видеофайла */
    $scope.onVideoSelected = function (input) {
        if (!input.files || input.files.length === 0) return;
        $scope.uploadingVideo = true;
        var file     = input.files[0];
        var formData = new FormData();
        formData.append('video',   file);
        formData.append('command', 'upload_sermon_video');
        formData.append('_csrf_token', window._getCsrfToken ? window._getCsrfToken() : '');

        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.uploadingVideo = false;
                if (r.data && r.data.path) {
                    restoreRange();
                    insertVideoNode(r.data.path, r.data.name || r.data.path.split('/').pop());
                } else {
                    alert('Ошибка загрузки видео: ' + (r.data && r.data.message ? r.data.message : ''));
                }
                input.value = '';
            },
            function (e) {
                $scope.uploadingVideo = false;
                alert('Ошибка загрузки видео (HTTP ' + (e.status || '?') + ')');
                input.value = '';
            }
        );
    };

    /** Создать DOM-узел видео-чипа и вставить в редактор */
    function insertVideoNode(src, label) {
        var wrap           = document.createElement('span');
        wrap.className     = 'sermon-video-wrap';
        wrap.contentEditable = 'false';
        wrap.setAttribute('data-video-src',   src);
        wrap.setAttribute('data-video-label', label);

        var icon       = document.createElement('span');
        icon.className = 'svw-icon';
        icon.textContent = '🎬';

        var lbl        = document.createElement('span');
        lbl.className  = 'svw-label';
        lbl.textContent = label;

        var del        = document.createElement('span');
        del.className  = 'svw-del';
        del.innerHTML  = '×';
        del.title      = 'Удалить';
        del.onclick    = function (e) {
            e.stopPropagation();
            deleteSermonMedia(src);
            wrap.remove();
            scheduleAutoSave();
        };

        // Клик = предпросмотр в модалке
        wrap.onclick = function (e) {
            if (e.target === del) return;
            _openVideoModal(src);
        };

        wrap.appendChild(icon);
        wrap.appendChild(lbl);
        wrap.appendChild(del);
        makeDraggable(wrap);
        insertNodeAtCursor(wrap);
    }

    /** Открыть модалку предпросмотра видео */
    function _openVideoModal(src) {
        var ytId = getYouTubeId(src);
        $scope.$apply(function () {
            $scope.modalVideoSrc = src;
            if (ytId) {
                $scope.modalVideoSrcTrusted = null;
                $scope.modalVideoEmbedSrc   = $sce.trustAsResourceUrl(
                    'https://www.youtube.com/embed/' + ytId + '?autoplay=1&rel=0'
                );
            } else {
                $scope.modalVideoSrcTrusted = $sce.trustAsResourceUrl(src);
                $scope.modalVideoEmbedSrc   = null;
            }
        });
        document.getElementById('sermon-video-modal').classList.add('open');
    }

    $scope.closeVideoModal = function () {
        document.getElementById('sermon-video-modal').classList.remove('open');
        $scope.modalVideoSrc = '';
    };

    // ──────────────────────────────────────────────────────────
    // DOM UTILITY: insert node at saved cursor position
    // ──────────────────────────────────────────────────────────

    function insertNodeAtCursor(node) {
        editorEl.focus();
        restoreRange();

        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);

        var afterRange = document.createRange();
        afterRange.setStartAfter(node);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);
        lastRange = afterRange.cloneRange();

        // Zero-width space so cursor can be placed after chip
        var zws = document.createTextNode('\u200B');
        afterRange.insertNode(zws);
        afterRange.setStartAfter(zws);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);
        lastRange = afterRange.cloneRange();

        scheduleAutoSave();
    }

    // ──────────────────────────────────────────────────────────
    // ATTACH HANDLERS (called after load from DB)
    // ──────────────────────────────────────────────────────────

    function attachEditorHandlers() {
        if (!editorEl) return;

        // Bible citations — re-attach remove buttons
        editorEl.querySelectorAll('.bible-cite').forEach(function (span) {
            var removeBtn = span.querySelector('.cite-remove');
            if (removeBtn) removeBtn.onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
            makeDraggable(span);
            span.ondblclick = function (e) { e.stopPropagation(); openChipEditor(span); };
        });

        // Message citations — re-attach remove buttons
        editorEl.querySelectorAll('.message-cite').forEach(function (span) {
            var removeBtn = span.querySelector('.cite-remove');
            if (removeBtn) removeBtn.onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
            makeDraggable(span);
            span.ondblclick = function (e) { e.stopPropagation(); openChipEditor(span); };
        });

        // Images — re-attach remove + click
        editorEl.querySelectorAll('.sermon-img-wrap').forEach(function (span) {
            var path      = span.getAttribute('data-image-path');
            var removeBtn = span.querySelector('.sermon-img-remove');
            if (removeBtn) removeBtn.onclick = function (e) {
                e.stopPropagation();
                deleteSermonMedia(path);
                span.remove();
                scheduleAutoSave();
            };
            span.onclick = function (e) {
                if (e.target === removeBtn) return;
                $scope.$apply(function () {
                    $scope.modalImgSrc = path;
                    document.getElementById('sermon-img-modal').classList.add('open');
                });
            };
            makeDraggable(span);
        });

        // ── VIDEO chips — re-attach (НОВЫЙ блок) ──
        editorEl.querySelectorAll('.sermon-video-wrap').forEach(function (span) {
            var src = span.getAttribute('data-video-src');
            var del = span.querySelector('.svw-del');
            if (del) del.onclick = function (e) {
                e.stopPropagation();
                deleteSermonMedia(src);
                span.remove();
                scheduleAutoSave();
            };
            span.onclick = function (e) {
                if (e.target === del) return;
                _openVideoModal(src);
            };
            makeDraggable(span);
        });
    }

    // ──────────────────────────────────────────────────────────
    // BIBLE NAVIGATION (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.loadBibleTranslations = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_translations' } }).then(
            function (r) {
                $scope.bibleTranslations = r.data;
                if (r.data.length > 0) {
                    $scope.bibleTranslationId = r.data[0].ID;
                    $scope.loadBibleBooks();
                }
            }
        );
    };
    $scope.setBibleTranslation = function (id) {
        $scope.bibleTranslationId     = id;
        $scope.selectedBook           = null;
        $scope.selectedChapter        = null;
        $scope.rawVerses              = [];
        $scope.preparedVerses         = [];
        $scope.selectedBibleVerseNums = [];
        $scope.loadBibleBooks();
    };
    $scope.loadBibleBooks = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_books', translation_id: $scope.bibleTranslationId } }).then(
            function (r) { $scope.bibleBooks = r.data; }
        );
    };
    $scope.getFilteredBooks = function () {
        if (!$scope.bookSearchQuery || $scope.bookSearchQuery.length === 0) {
            return $scope.bibleBooks;
        }
        var q = $scope.bookSearchQuery.toLowerCase();
        return $scope.bibleBooks.filter(function (book) {
            return (book.NAME    && book.NAME.toLowerCase().indexOf(q)    >= 0) ||
                (book.NAME_LT && book.NAME_LT.toLowerCase().indexOf(q) >= 0) ||
                (book.NAME_EN && book.NAME_EN.toLowerCase().indexOf(q) >= 0);
        });
    };
    $scope.getBookName = function (book) {
        if (!book) return '';
        return book.NAME || book.NAME_LT || book.NAME_EN || '';
    };
    $scope.selectBook = function (book) {
        $scope.selectedBook           = book;
        $scope.selectedChapter        = null;
        $scope.bibleChapters          = [];
        $scope.rawVerses              = [];
        $scope.preparedVerses         = [];
        $scope.selectedBibleVerseNums = [];

        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_chapters', book_id: book.ID } }).then(
            function (r) { $scope.bibleChapters = r.data; }
        );
    };
    $scope.selectChapter = function (ch) {
        $scope.selectedChapter        = ch;
        $scope.rawVerses              = [];
        $scope.preparedVerses         = [];
        $scope.selectedBibleVerseNums = [];
        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_verses', book_id: $scope.selectedBook.ID, chapter_num: ch } }).then(
            function (r) {
                $scope.rawVerses      = r.data;
                $scope.preparedVerses = r.data.map(function (v) {
                    return { num: parseInt(v.VERSE_NUM), display: v.VERSE_NUM + '. ' + (v.TEXT || '') };
                });
            }
        );
    };
    $scope.togglePrepLang = function (code) {
        $scope.prepLangs[code] = !$scope.prepLangs[code];
        // хотя бы один язык должен быть активен
        var anyOn = $scope.prepLangList.some(function (l) { return $scope.prepLangs[l.code]; });
        if (!anyOn) $scope.prepLangs[code] = true;
    };
    $scope.langHasData = function (lang) {
        if (lang.is_default == '1') return true;             // язык по умолчанию всегда доступен
        if (!$scope.rawVerses || $scope.rawVerses.length === 0) return true;  // стихи ещё не загружены — не блокировать
        var col = 'TEXT' + lang.col_suffix;
        return $scope.rawVerses.some(function (v) { return v[col] && v[col].trim() !== ''; });
    };
    $scope.toggleVerse = function (v, $event) {
        var idx     = $scope.selectedBibleVerseNums.indexOf(v.num);
        var ctrlKey = $event.ctrlKey || $event.metaKey;
        if (ctrlKey) {
            if (idx > -1) $scope.selectedBibleVerseNums.splice(idx, 1);
            else          $scope.selectedBibleVerseNums.push(v.num);
        } else {
            if ($scope.selectedBibleVerseNums.length === 1 && idx > -1) $scope.selectedBibleVerseNums = [];
            else                                                          $scope.selectedBibleVerseNums = [v.num];
        }
    };
    $scope.getRefLabel = function () {
        if (!$scope.selectedBook || !$scope.selectedChapter) return '';
        var bookName = $scope.getBookName($scope.selectedBook);
        var nums = $scope.selectedBibleVerseNums.slice().sort(function(a,b){return a-b;});
        if (nums.length === 0) return '';
        if (nums.length === 1) return bookName + ' ' + $scope.selectedChapter + ':' + nums[0];
        var consecutive = true;
        for (var i = 1; i < nums.length; i++) { if (nums[i]!==nums[i-1]+1){ consecutive=false; break; } }
        if (consecutive) return bookName+' '+$scope.selectedChapter+':'+nums[0]+'-'+nums[nums.length-1];
        return bookName+' '+$scope.selectedChapter+':'+nums.join(',');
    };
    $scope.togglePrepLang = function (lang) {
        $scope.prepLangs[lang] = !$scope.prepLangs[lang];
        // хотя бы один язык должен быть включён
        if (!$scope.prepLangs.ru && !$scope.prepLangs.lt && !$scope.prepLangs.en) {
            $scope.prepLangs[lang] = true;
        }
    };
    $scope.insertBibleCitation = function () {
        if ($scope.selectedBibleVerseNums.length === 0) return;
        var nums     = $scope.selectedBibleVerseNums.slice().sort(function(a,b){return a-b;});
        var refLabel = $scope.getRefLabel();
        var book     = $scope.selectedBook;

        // Только активные и доступные языки
        var activeLangs = $scope.prepLangList.filter(function (l) {
            return $scope.prepLangs[l.code] && $scope.langHasData(l);
        });

        // Собрать тексты стихов для каждого языка
        var langTexts = {};
        activeLangs.forEach(function (l) {
            var col  = 'TEXT' + l.col_suffix;
            var text = '';
            nums.forEach(function (n) {
                for (var i = 0; i < $scope.rawVerses.length; i++) {
                    if (parseInt($scope.rawVerses[i].VERSE_NUM) === n) {
                        text += (text ? ' / ' : '') + ($scope.rawVerses[i][col] || '');
                        break;
                    }
                }
            });
            langTexts[l.code] = text;
        });

        $http({ method:"POST", url:"/ajax", data:{ command:'get_bible_verses', book_id:book.ID, chapter_num:$scope.selectedChapter }}).then(
            function () {
                activeLangs.forEach(function (l) {
                    var verseText  = langTexts[l.code] || '';
                    var langSuffix = activeLangs.length > 1 ? ' [' + l.label + ']' : '';

                    // Имя книги на языке цитаты
                    var nameField   = 'NAME' + l.col_suffix;
                    var langBookName = (book[nameField] && book[nameField].trim())
                        ? book[nameField]
                        : book.NAME || '';

                    // Ссылка с языковым именем книги
                    var langRefLabel = langBookName + ' ' + $scope.selectedChapter + ':' + nums[0];
                    if (nums.length > 1) {
                        var consecutive = true;
                        for (var ci = 1; ci < nums.length; ci++) {
                            if (nums[ci] !== nums[ci-1]+1) { consecutive = false; break; }
                        }
                        langRefLabel = consecutive
                            ? langBookName + ' ' + $scope.selectedChapter + ':' + nums[0] + '-' + nums[nums.length-1]
                            : langBookName + ' ' + $scope.selectedChapter + ':' + nums.join(',');
                    }

                    var span = document.createElement('span');
                    span.className       = 'bible-cite';
                    span.contentEditable = 'false';
                    span.setAttribute('data-translation-id', l.translation_id || 1);
                    span.setAttribute('data-col-suffix', l.col_suffix || '');
                    span.setAttribute('data-book-id',    book ? book.ID : '');
                    span.setAttribute('data-book-num',   book ? book.BOOK_NUM : '');
                    span.setAttribute('data-book-name',   langBookName);
                    span.setAttribute('data-chapter',     $scope.selectedChapter || '');
                    span.setAttribute('data-verse-nums',  nums.join(','));
                    span.setAttribute('data-ref-label',   langRefLabel);
                    span.setAttribute('data-lang',        l.code);
                    span.setAttribute('data-verse-text',  verseText);

                    span.innerHTML =
                        '<span class="cite-body">' +
                        '<span class="cite-ref">📖 ' + langRefLabel + langSuffix + '</span>' +
                        (verseText ? '<span class="cite-verse-text">' + verseText + '</span>' : '') +
                        '<span class="cite-edit-hint">двойной клик — редактировать</span>' +
                        '</span>' +
                        '<span class="cite-remove" title="Удалить">×</span>';

                    span.querySelector('.cite-remove').onclick = function (e) {
                        e.stopPropagation(); span.remove(); scheduleAutoSave();
                    };
                    makeDraggable(span);
                    insertNodeAtCursor(span);
                });
                $scope.selectedBibleVerseNums = [];
            }
        );
    };

    // ──────────────────────────────────────────────────────────
    // MESSAGES PANEL (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.searchMessagesPrep = function () {
        if (prepMsgSearchTimer) $timeout.cancel(prepMsgSearchTimer);
        var titleQ = $scope.prepMsgTitleQuery || '';
        var textQ  = $scope.prepMsgTextQuery  || '';
        if (titleQ.length < 2 && textQ.length < 2) { $scope.prepMsgResults = []; return; }
        prepMsgSearchTimer = $timeout(function () {
            $http({ method:"POST", url:"/ajax", data:{ command:'search_messages', title_query:titleQ, text_query:textQ }}).then(
                function (r) { $scope.prepMsgResults = r.data; }
            );
        }, 400);
    };
    $scope.selectMessagePrep = function (msg) {
        $scope.prepSelectedMessage = msg;
        $scope.prepMsgParagraphs   = [];
        $scope.prepSelectedParaIdx = null;
        $http({ method:"POST", url:"/ajax", data:{ command:'get_message', id:msg.ID }}).then(
            function (r) {
                if (r.data && r.data.TEXT) {
                    var lines = r.data.TEXT.split(/\r?\n/);
                    var paras = [];
                    lines.forEach(function (line, i) { if (line.trim().length>0) paras.push({idx:i,text:line.trim()}); });
                    $scope.prepMsgParagraphs = paras;
                }
            }
        );
    };
    $scope.togglePrepPara = function (para) {
        if ($scope.prepSelectedParaIdx === para.idx) {
            $scope.prepSelectedParaIdx = null;
            // не сворачиваем — пусть пользователь жмёт стрелку сам
        } else {
            $scope.prepSelectedParaIdx = para.idx;
            $scope.prepMsgParaExpanded = true;   // ← расширяем при выборе абзаца
        }
    };
    $scope.collapseMsgSearch = function () {
        $scope.prepMsgParaExpanded = false;
    };
    $scope.insertMessageCitation = function () {
        if ($scope.prepSelectedParaIdx === null || !editorEl) return;
        var para = null;
        for (var i=0;i<$scope.prepMsgParagraphs.length;i++) {
            if ($scope.prepMsgParagraphs[i].idx===$scope.prepSelectedParaIdx) { para=$scope.prepMsgParagraphs[i]; break; }
        }
        if (!para) return;
        var msgTitle = $scope.prepSelectedMessage ? $scope.prepSelectedMessage.TITLE : '';
        var span = document.createElement('span');
        span.className       = 'message-cite';
        span.contentEditable = 'false';
        span.setAttribute('data-msg-title',   msgTitle);
        span.setAttribute('data-para-text',   para.text);
        span.innerHTML = '✍️ ' + para.text +
            '<span class="cite-edit-hint">двойной клик — редактировать</span>' +
            ' <span class="cite-remove" title="Удалить">×</span>';
        span.querySelector('.cite-remove').onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
        span.ondblclick = function (e) { e.stopPropagation(); openChipEditor(span); };
        makeDraggable(span);
        insertNodeAtCursor(span);
        $scope.prepSelectedParaIdx = null;
    };

    // ──────────────────────────────────────────────────────────
    // DISPLAY ACCESS MANAGEMENT
    // ──────────────────────────────────────────────────────────

    function loadDisplayTargets() {
        $http.post('/ajax', { command: 'get_display_targets' }).then(
            function (r) {
                if (r.data && r.data.status === 'ok') {
                    $scope.displayTargets = r.data.targets || [];
                    // Set default to own group (first item)
                    if ($scope.displayTargets.length > 0) {
                        $scope.selectedDisplayTarget = $scope.displayTargets[0].group_id;
                    }
                }
            },
            function (e) { console.error('Failed to load display targets', e); }
        );
    }

    $scope.onDisplayTargetChange = function () {
        if ($scope.selectedDisplayTarget === '__request__') {
            // Reset to own group
            if ($scope.displayTargets.length > 0) {
                $scope.selectedDisplayTarget = $scope.displayTargets[0].group_id;
            }
            // Show request access modal
            $scope.showAccessRequestModal = true;
            loadAvailableGroups();
        }
    };

    function loadAvailableGroups() {
        $http.post('/ajax', { command: 'get_available_groups' }).then(
            function (r) {
                if (r.data && r.data.status === 'ok') {
                    $scope.availableGroups = r.data.groups || [];
                    $scope.availableGroups.forEach(function (g) { g.requested = false; });
                }
            },
            function (e) { console.error('Failed to load available groups', e); }
        );
    }

    $scope.sendAccessRequest = function (groupId) {
        $http.post('/ajax', { command: 'request_display_access', target_group_id: groupId }).then(
            function (r) {
                if (r.data && r.data.status === 'ok') {
                    // Mark as requested
                    for (var i = 0; i < $scope.availableGroups.length; i++) {
                        if ($scope.availableGroups[i].group_id === groupId) {
                            $scope.availableGroups[i].requested = true;
                            break;
                        }
                    }
                    alert('Запрос отправлен');
                } else {
                    alert('Ошибка: ' + (r.data.message || 'unknown'));
                }
            },
            function (e) { alert('HTTP error: ' + e.status); }
        );
    };

    $scope.closeAccessRequestModal = function () {
        $scope.showAccessRequestModal = false;
        // Reload targets in case access was granted
        loadDisplayTargets();
    };

    // ──────────────────────────────────────────────────────────
    // WEBSOCKET MESSAGE HANDLER
    // ──────────────────────────────────────────────────────────

    // Listen for WebSocket messages (setup in common.js)
    window.addEventListener('websocket_message', function(event) {
        var message = event.detail;

        if (message.type === 'access_response') {
            // Access request response received
            $scope.$apply(function() {
                var data = message.data;
                if (data.status === 'approved') {
                    // Show success notification
                    alert('✓ Доступ одобрен: ' + data.target_name);
                    // Reload display targets to include new approved group
                    loadDisplayTargets();
                } else if (data.status === 'rejected') {
                    alert('✗ Доступ отклонен: ' + data.target_name);
                }
            });
        }
    });


    // ──────────────────────────────────────────────────────────────────────
    // CHIP EDITOR — переменные состояния
    // ──────────────────────────────────────────────────────────────────────
    var cemCurrentSpan  = null;   // чип, открытый в редакторе
    var cemComments     = [];     // [{id, cnum, highlightText, text, color}]
    var cemCommentIdSeq = 0;
    var cemSavedSel     = null;   // сохранённый Selection для добавления комментария
    var cemTextColorOpen     = false;
    var cemHighlightColorOpen = false;

    var CEM_TEXT_COLORS = [
        '#000000','#ffffff','#e53935','#d81b60','#8e24aa',
        '#1e88e5','#00897b','#43a047','#f4511e','#fb8c00',
        '#fdd835','#6d4c41','#546e7a','#1565c0','#2e7d32'
    ];
    var CEM_HIGHLIGHT_COLORS = [
        'transparent',
        'rgba(255,235,59,0.55)',  // жёлтый
        'rgba(76,175,80,0.40)',   // зелёный
        'rgba(33,150,243,0.35)',  // синий
        'rgba(244,67,54,0.35)',   // красный
        'rgba(156,39,176,0.35)',  // фиолетовый
        'rgba(255,152,0,0.45)',   // оранжевый
    ];

    // ──────────────────────────────────────────────────────────────────────
    // Глобальные функции (вызываются из onclick в HTML)
    // ──────────────────────────────────────────────────────────────────────
    window.cemToggleColorDropdown = function (type) {
        var dd = document.getElementById(type === 'text' ? 'cem-textcolor-dropdown' : 'cem-highlight-dropdown');
        if (!dd) return;
        var other = document.getElementById(type === 'text' ? 'cem-highlight-dropdown' : 'cem-textcolor-dropdown');
        if (other) other.style.display = 'none';
        dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
    };

    // ──────────────────────────────────────────────────────────────────────
    // Инициализация модального окна (вызывается один раз при загрузке)
    // ──────────────────────────────────────────────────────────────────────
    function initChipEditor() {
        var overlay    = document.getElementById('chip-editor-overlay');
        var editArea   = document.getElementById('cem-edit-area');
        var saveBtn    = document.getElementById('cem-save-btn');
        var cancelBtn  = document.getElementById('cem-cancel-btn');
        var closeBtn   = document.getElementById('cem-close-btn');
        var boldBtn    = document.getElementById('cem-bold');
        var italicBtn  = document.getElementById('cem-italic');
        var underlineBtn = document.getElementById('cem-underline');
        var clearFmtBtn  = document.getElementById('cem-clear-format');
        var fontSizeInput = document.getElementById('cem-fontsize');
        var addCommentBtn = document.getElementById('cem-add-comment-btn');
        var commentInputWrap = document.getElementById('cem-comment-input-wrap');
        var commentTextInput = document.getElementById('cem-comment-text-input');
        var commentOkBtn   = document.getElementById('cem-comment-ok');
        var commentCancelBtn = document.getElementById('cem-comment-cancel');

        if (!overlay || !editArea) return;

        // ── Close overlay on backdrop click ──
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeCEM(false);
        });
        closeBtn.addEventListener('click',  function () { closeCEM(false); });
        cancelBtn.addEventListener('click', function () { closeCEM(false); });
        saveBtn.addEventListener('click',   function () { closeCEM(true); });

        // ── Keyboard shortcuts ──
        editArea.addEventListener('keydown', function (e) {
            var ctrl = e.ctrlKey || e.metaKey;

            // Allow: Ctrl+B, Ctrl+I, Ctrl+U (formatting)
            if (ctrl && (e.keyCode === 66 || e.keyCode === 73 || e.keyCode === 85)) return;
            // Allow: Ctrl+Z / Ctrl+Y (undo/redo)
            if (ctrl && (e.keyCode === 90 || e.keyCode === 89)) return;
            // Allow: Ctrl+A (select all), Ctrl+C (copy), Ctrl+X (copy, will block delete part)
            if (ctrl && (e.keyCode === 65 || e.keyCode === 67)) return;
            // Allow: arrow keys, Home, End, PageUp, PageDown, Shift combos
            if (e.keyCode >= 33 && e.keyCode <= 40) return;
            // Allow: Shift (modifier)
            if (e.keyCode === 16 || e.keyCode === 17 || e.keyCode === 18 || e.keyCode === 91) return;
            // Allow: Escape → cancel
            if (e.keyCode === 27) { closeCEM(false); return; }
            // Allow: F1-F12 (browser shortcuts)
            if (e.keyCode >= 112 && e.keyCode <= 123) return;

            // BLOCK everything else (printable chars, Delete, Backspace, Enter, paste)
            e.preventDefault();
        });

        // Block paste entirely
        editArea.addEventListener('paste', function (e) { e.preventDefault(); });
        // Block drop (could insert text)
        editArea.addEventListener('drop',  function (e) { e.preventDefault(); });
        // Block Ctrl+X (cut would delete)
        editArea.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.keyCode === 88) e.preventDefault();
        });

        // ── Toolbar buttons ──
        boldBtn.addEventListener('click', function () {
            editArea.focus();
            document.execCommand('bold', false, null);
            updateToolbarState();
        });
        italicBtn.addEventListener('click', function () {
            editArea.focus();
            document.execCommand('italic', false, null);
            updateToolbarState();
        });
        underlineBtn.addEventListener('click', function () {
            editArea.focus();
            document.execCommand('underline', false, null);
            updateToolbarState();
        });
        clearFmtBtn.addEventListener('click', function () {
            editArea.focus();
            document.execCommand('removeFormat', false, null);
            updateToolbarState();
        });

        // ── Font size ──
        fontSizeInput.addEventListener('change', function () {
            var sz = parseInt(fontSizeInput.value);
            if (isNaN(sz) || sz < 8) sz = 8;
            if (sz > 72) sz = 72;
            fontSizeInput.value = sz;
            editArea.focus();
            // Wrap selection in span with font-size if there's a selection
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                document.execCommand('fontSize', false, '7'); // use size 7 as marker
                // Replace all <font size=7> with <span style="font-size:Xpx">
                editArea.querySelectorAll('font[size="7"]').forEach(function (f) {
                    var span = document.createElement('span');
                    span.style.fontSize = sz + 'px';
                    while (f.firstChild) span.appendChild(f.firstChild);
                    f.parentNode.replaceChild(span, f);
                });
            }
        });

        // ── Build color dropdowns ──
        function buildColorDropdown(ddId, colors, applyFn, swatchId) {
            var dd = document.getElementById(ddId);
            var sw = document.getElementById(swatchId);
            if (!dd) return;
            dd.innerHTML = '';
            colors.forEach(function (c) {
                var dot = document.createElement('div');
                dot.className = 'cem-color-dot';
                dot.style.background = c === 'transparent' ? 'linear-gradient(135deg, #fff 45%, #e53935 45%)' : c;
                dot.title = c;
                dot.addEventListener('click', function (e) {
                    e.stopPropagation();
                    applyFn(c);
                    if (sw) sw.style.background = (c === 'transparent') ? '#fff' : c;
                    dd.style.display = 'none';
                });
                dd.appendChild(dot);
            });
        }
        buildColorDropdown('cem-textcolor-dropdown', CEM_TEXT_COLORS, function (c) {
            editArea.focus();
            document.execCommand('foreColor', false, c);
        }, 'cem-textcolor-swatch');
        buildColorDropdown('cem-highlight-dropdown', CEM_HIGHLIGHT_COLORS, function (c) {
            editArea.focus();
            applyHighlight(c);
        }, 'cem-highlight-swatch');

        // Close color dropdowns when clicking outside
        document.addEventListener('click', function (e) {
            if (!e.target.closest('#cem-textcolor-wrap'))  document.getElementById('cem-textcolor-dropdown').style.display = 'none';
            if (!e.target.closest('#cem-highlight-wrap')) document.getElementById('cem-highlight-dropdown').style.display = 'none';
        });

        // ── Track selection for toolbar state ──
        editArea.addEventListener('keyup', updateToolbarState);
        editArea.addEventListener('mouseup', updateToolbarState);

        // ── Add Comment ──
        addCommentBtn.addEventListener('click', function () {
            var sel = window.getSelection();
            if (!sel || sel.isCollapsed || !editArea.contains(sel.anchorNode)) {
                alert('Сначала выделите фразу в тексте стиха.');
                return;
            }
            cemSavedSel = { range: sel.getRangeAt(0).cloneRange(), text: sel.toString().trim() };
            commentTextInput.value = '';
            commentInputWrap.classList.add('open');
            commentTextInput.focus();
        });
        commentCancelBtn.addEventListener('click', function () {
            commentInputWrap.classList.remove('open');
            cemSavedSel = null;
        });
        commentOkBtn.addEventListener('click', cemConfirmAddComment);
        commentTextInput.addEventListener('keydown', function (e) {
            if (e.keyCode === 13) { cemConfirmAddComment(); }
            if (e.keyCode === 27) { commentInputWrap.classList.remove('open'); cemSavedSel = null; }
        });
    }

    function applyHighlight(color) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        var range = sel.getRangeAt(0);
        if (color === 'transparent') {
            // Remove highlight spans
            document.execCommand('removeFormat', false, null);
        } else {
            var span = document.createElement('span');
            span.style.backgroundColor = color;
            span.style.borderRadius = '2px';
            try {
                range.surroundContents(span);
            } catch (ex) {
                // If range spans multiple elements, use execCommand
                document.execCommand('backColor', false, color);
            }
        }
    }

    function updateToolbarState() {
        var boldBtn    = document.getElementById('cem-bold');
        var italicBtn  = document.getElementById('cem-italic');
        var underBtn   = document.getElementById('cem-underline');
        if (boldBtn)   boldBtn.classList.toggle('cem-active',    document.queryCommandState('bold'));
        if (italicBtn) italicBtn.classList.toggle('cem-active',  document.queryCommandState('italic'));
        if (underBtn)  underBtn.classList.toggle('cem-active',   document.queryCommandState('underline'));
    }

    function cemConfirmAddComment() {
        var commentInputWrap = document.getElementById('cem-comment-input-wrap');
        var commentTextInput = document.getElementById('cem-comment-text-input');
        var editArea = document.getElementById('cem-edit-area');

        var text = commentTextInput.value.trim();
        if (!text || !cemSavedSel) return;

        cemCommentIdSeq++;
        var cid   = 'c' + cemCommentIdSeq;
        var cnum  = cemComments.length + 1;
        var hlText = cemSavedSel.text.substring(0, 60);
        var hlColor = CEM_HIGHLIGHT_COLORS[1]; // yellow default

        // Restore selection and wrap in comment span
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(cemSavedSel.range);

        var commentSpan = document.createElement('span');
        commentSpan.className = 'verse-comment';
        commentSpan.setAttribute('data-cid', cid);
        commentSpan.setAttribute('data-cnum', cnum);
        commentSpan.style.backgroundColor = hlColor;
        commentSpan.style.borderRadius = '3px';
        commentSpan.style.padding = '0 2px';

        try {
            cemSavedSel.range.surroundContents(commentSpan);
        } catch (ex) {
            // partial selection across nodes — just mark with background
            document.execCommand('backColor', false, hlColor);
        }

        cemComments.push({ id: cid, cnum: cnum, highlightText: hlText, text: text, color: hlColor });
        renderCEMCommentsList();

        commentInputWrap.classList.remove('open');
        cemSavedSel = null;
        commentTextInput.value = '';
        editArea.focus();
    }

    function renderCEMCommentsList() {
        var list = document.getElementById('cem-comments-list');
        var noMsg = document.getElementById('cem-no-comments-msg');
        if (!list) return;

        // Clear existing items (keep no-comments msg)
        list.querySelectorAll('.cem-comment-item').forEach(function (el) { el.remove(); });

        if (cemComments.length === 0) {
            if (noMsg) noMsg.style.display = '';
            return;
        }
        if (noMsg) noMsg.style.display = 'none';

        cemComments.forEach(function (c) {
            var item = document.createElement('div');
            item.className = 'cem-comment-item';
            item.innerHTML =
                '<div class="cem-comment-num">' + c.cnum + '</div>' +
                '<div class="cem-comment-body">' +
                '<div class="cem-comment-highlight">«' + escapeHtml(c.highlightText) + '»</div>' +
                '<div class="cem-comment-text">' + escapeHtml(c.text) + '</div>' +
                '</div>' +
                '<button class="cem-comment-del" data-cid="' + c.id + '" title="Удалить комментарий">×</button>';
            item.querySelector('.cem-comment-del').addEventListener('click', function () {
                cemDeleteComment(c.id);
            });
            list.appendChild(item);
        });
    }

    function cemDeleteComment(cid) {
        var editArea = document.getElementById('cem-edit-area');
        // Remove the span wrapping from the edit area
        var spanEl = editArea.querySelector('[data-cid="' + cid + '"]');
        if (spanEl) {
            var parent = spanEl.parentNode;
            while (spanEl.firstChild) parent.insertBefore(spanEl.firstChild, spanEl);
            parent.removeChild(spanEl);
        }
        cemComments = cemComments.filter(function (c) { return c.id !== cid; });
        // Re-number
        cemComments.forEach(function (c, i) { c.cnum = i + 1; });
        // Update cnum attrs in edit area
        editArea.querySelectorAll('.verse-comment').forEach(function (el) {
            var foundIdx = cemComments.findIndex(function(c) { return c.id === el.getAttribute('data-cid'); });
            if (foundIdx >= 0) el.setAttribute('data-cnum', cemComments[foundIdx].cnum);
        });
        renderCEMCommentsList();
    }

    // ──────────────────────────────────────────────────────────────────────
    // openChipEditor — открыть редактор для данного чипа
    // ──────────────────────────────────────────────────────────────────────
    function openChipEditor(span) {
        var overlay   = document.getElementById('chip-editor-overlay');
        var editArea  = document.getElementById('cem-edit-area');
        var titleEl   = document.getElementById('cem-title');
        var commentInputWrap = document.getElementById('cem-comment-input-wrap');
        var fontSizeInput    = document.getElementById('cem-fontsize');
        if (!overlay || !editArea) return;

        cemCurrentSpan = span;

        // Load title
        var refEl = span.querySelector('.cite-ref');
        var ref   = refEl ? refEl.textContent.trim() : 'Редактировать';
        if (titleEl) titleEl.textContent = 'Редактировать: ' + ref;

        // Load verse text (formatted HTML if available, else plain text)
        var verseEl = span.querySelector('.cite-verse-text');
        var verseHtml = span.getAttribute('data-verse-html') ||
            (verseEl ? verseEl.innerHTML : '') ||
            (span.getAttribute('data-verse-text') || '');
        editArea.innerHTML = verseHtml;

        // Load existing comments
        var commentsJson = span.getAttribute('data-verse-comments') || '[]';
        try { cemComments = JSON.parse(commentsJson); } catch(e) { cemComments = []; }
        cemCommentIdSeq = cemComments.reduce(function (mx, c) {
            var n = parseInt(c.id.replace('c','')) || 0;
            return n > mx ? n : mx;
        }, 0);
        renderCEMCommentsList();

        // Reset comment input
        if (commentInputWrap) commentInputWrap.classList.remove('open');
        if (fontSizeInput)    fontSizeInput.value = 15;

        // Open overlay
        overlay.classList.add('open');
        setTimeout(function () { editArea.focus(); }, 50);
    }

    // ──────────────────────────────────────────────────────────────────────
    // closeCEM — закрыть редактор (save=true → сохранить изменения)
    // ──────────────────────────────────────────────────────────────────────
    function closeCEM(save) {
        var overlay  = document.getElementById('chip-editor-overlay');
        var editArea = document.getElementById('cem-edit-area');
        if (!overlay) return;

        if (save && cemCurrentSpan) {
            var formattedHtml = editArea.innerHTML;
            var commentsJson  = JSON.stringify(cemComments);

            // Update data attributes
            cemCurrentSpan.setAttribute('data-verse-html',     formattedHtml);
            cemCurrentSpan.setAttribute('data-verse-comments', commentsJson);

            // Update the visual .cite-verse-text span inside the chip
            var verseEl = cemCurrentSpan.querySelector('.cite-verse-text');
            if (verseEl) {
                verseEl.innerHTML = formattedHtml;
                // Add comment markers to cite-verse-text for preview
                cemComments.forEach(function (c) {
                    var commentSpan = verseEl.querySelector('[data-cid="' + c.id + '"]');
                    if (commentSpan) commentSpan.setAttribute('data-cnum', c.cnum);
                });
            }

            scheduleAutoSave();
        }

        overlay.classList.remove('open');
        cemCurrentSpan = null;
        cemComments    = [];
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

});