/**
 * sermon_prep.js  — v2 (video support)
 * AngularJS controller for the Sermon Preparation mode.
 *
 * ИЗМЕНЕНИЯ vs v1:
 *  + $sce добавлен к инжекции
 *  + video state variables
 *  + insertVideoNode()
 *  + $scope.toggleVideoPanel(), insertVideoUrl(), triggerVideoUpload(), onVideoFileSelected()
 *  + attachEditorHandlers() дополнен .sermon-video-wrap
 */
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
            // Инициализация редактора чипов
            initChipEditor();
            // Экспортируем scheduleAutoSave для sermon_chip_editor.js
            window._sermonScheduleAutoSave = scheduleAutoSave;
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
    // PPTX IMPORT
    // ──────────────────────────────────────────────────────────

    $scope.importingPptx = false;

    $scope.triggerPptxImport = function () {
        saveRange();
        document.getElementById('sermon-pptx-input').click();
    };

    $scope.onPptxSelected = function (input) {
        if (!input.files || input.files.length === 0) return;
        $scope.importingPptx = true;
        var file     = input.files[0];
        var formData = new FormData();
        formData.append('pptx',    file);
        formData.append('command', 'import_pptx');
        formData.append('_csrf_token', window._getCsrfToken ? window._getCsrfToken() : '');
        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.importingPptx = false;
                if (r.data && r.data.paths && r.data.paths.length) {
                    r.data.paths.forEach(function (path) {
                        _appendPptSlide(path);
                    });
                    scheduleAutoSave();
                } else {
                    var msg = (r.data && r.data.message) ? r.data.message : JSON.stringify(r.data);
                    alert('Ошибка импорта: ' + msg);
                }
                input.value = '';
            },
            function (e) {
                $scope.importingPptx = false;
                alert('Ошибка импорта (HTTP ' + (e.status || '?') + '): ' + (e.statusText || ''));
                input.value = '';
            }
        );
    };

    /**
     * Append a PPT slide as a block-level image chip at the end of the editor.
     * Non-editable, display-only.
     */
    function _appendPptSlide(path) {
        var editor = document.getElementById('sermon-editor');
        if (!editor) return;

        var wrap = document.createElement('div');
        wrap.className       = 'sermon-ppt-slide';
        wrap.contentEditable = 'false';
        wrap.setAttribute('data-image-path', path);

        var img   = document.createElement('img');
        img.src   = path;
        img.alt   = 'Слайд';
        img.style.cssText = 'max-width:100%; display:block; border-radius:4px;';

        var removeBtn       = document.createElement('span');
        removeBtn.className = 'sermon-img-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick   = function (e) {
            e.stopPropagation();
            wrap.remove();
            scheduleAutoSave();
        };

        wrap.appendChild(img);
        wrap.appendChild(removeBtn);

        // Insert at end of editor, after last child
        editor.appendChild(wrap);
        // Add trailing line break so cursor can be placed after it
        var br = document.createElement('p');
        br.innerHTML = '<br>';
        editor.appendChild(br);
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
    // SLIDES
    // ──────────────────────────────────────────────────────────

    /** Вставить новый пустой слайд после курсора */
    $scope.insertSlide = function () {
        saveRange();
        var slide = _buildSlideNode('<p><br></p>');
        _attachSlideHandlers(slide);
        insertNodeAtCursor(slide);
        // Поставить курсор внутрь слайда
        var inner = slide.querySelector('.sermon-slide-inner');
        if (inner) {
            var r = document.createRange();
            var sel = window.getSelection();
            r.setStart(inner, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            lastRange = r.cloneRange();
        }
    };

    /** Преобразовать выделенный текст/чипы в слайд */
    $scope.convertSelectionToSlide = function () {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            alert('Выделите фрагмент заметок для преобразования в слайд.');
            return;
        }
        var range = sel.getRangeAt(0);
        // Убедиться что выделение внутри редактора
        if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) {
            alert('Выделение должно быть внутри редактора заметок.');
            return;
        }
        var fragment = range.extractContents();
        var slide = _buildSlideNode('');
        var inner = slide.querySelector('.sermon-slide-inner');
        inner.appendChild(fragment);
        _attachSlideHandlers(slide);
        range.insertNode(slide);
        // Сдвинуть курсор за слайд
        var after = document.createRange();
        after.setStartAfter(slide);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
        lastRange = after.cloneRange();
        scheduleAutoSave();
    };

    /** Создать DOM-структуру слайда */
    var DEFAULT_SLIDE_BG = '#1a237e';
    var _lastSlideColor  = DEFAULT_SLIDE_BG;

    // Load saved default from user settings on init
    $http.post('/ajax', { command: 'get_user_settings' }).then(function(r) {
        if (r.data && r.data.slide_bg_color) {
            _lastSlideColor = r.data.slide_bg_color;
        }
    });

    var _saveSlideBgTimer = null;
    function _saveSlideColorDebounced(color) {
        if (_saveSlideBgTimer) clearTimeout(_saveSlideBgTimer);
        _saveSlideBgTimer = setTimeout(function() {
            $http.post('/ajax', { command: 'save_slide_bg_color', color: color });
        }, 600);
    }

    function _contrastColor(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        var r = parseInt(hex.substring(0,2), 16) / 255;
        var g = parseInt(hex.substring(2,4), 16) / 255;
        var b = parseInt(hex.substring(4,6), 16) / 255;
        r = r <= 0.03928 ? r/12.92 : Math.pow((r+0.055)/1.055, 2.4);
        g = g <= 0.03928 ? g/12.92 : Math.pow((g+0.055)/1.055, 2.4);
        b = b <= 0.03928 ? b/12.92 : Math.pow((b+0.055)/1.055, 2.4);
        return (0.2126*r + 0.7152*g + 0.0722*b) > 0.179 ? '#1a1a1a' : '#ffffff';
    }

    function _applySlideColor(wrap, color) {
        wrap.dataset.bg = color;
        var textColor = _contrastColor(color);
        var header = wrap.querySelector('.sermon-slide-header');
        var inner  = wrap.querySelector('.sermon-slide-inner');
        var pick   = wrap.querySelector('.slide-color-input');
        if (header) header.style.background = color;
        if (inner) {
            inner.style.background = color;
            inner.style.color      = textColor;
        }
        if (pick) pick.value = color;
    }

    function _buildSlideNode(innerHtml, bg) {
        bg = bg || _lastSlideColor || DEFAULT_SLIDE_BG;
        var wrap = document.createElement('div');
        wrap.className = 'sermon-slide';

        var header = document.createElement('div');
        header.className = 'sermon-slide-header';
        header.contentEditable = 'false';

        var label = document.createElement('span');
        label.className = 'sermon-slide-label';
        label.textContent = '▶ Слайд';

        var pick = document.createElement('input');
        pick.type = 'color';
        pick.className = 'slide-color-input';
        pick.title = 'Цвет фона слайда';
        pick.contentEditable = 'false';
        pick.value = bg;

        var del = document.createElement('span');
        del.className = 'sermon-slide-del';
        del.innerHTML = '×';
        del.title = 'Удалить слайд';
        del.contentEditable = 'false';
        del.onclick = function (e) {
            e.stopPropagation();
            wrap.remove();
            scheduleAutoSave();
        };

        header.appendChild(label);
        header.appendChild(pick);
        header.appendChild(del);

        var inner = document.createElement('div');
        inner.className = 'sermon-slide-inner';
        inner.contentEditable = 'true';
        inner.innerHTML = innerHtml;

        wrap.appendChild(header);
        wrap.appendChild(inner);
        _applySlideColor(wrap, bg);
        return wrap;
    }

    /** Навесить обработчики после загрузки из БД */
    function _attachSlideHandlers(wrap) {
        var bg = wrap.dataset.bg || DEFAULT_SLIDE_BG;
        _applySlideColor(wrap, bg);

        var del = wrap.querySelector('.sermon-slide-del');
        if (del) {
            del.onclick = function (e) {
                e.stopPropagation();
                wrap.remove();
                scheduleAutoSave();
            };
        }

        function _onPickChange() {
            var c = pick.value;
            _lastSlideColor = c;
            _applySlideColor(wrap, c);
            scheduleAutoSave();
            _saveSlideColorDebounced(c);
        }

        var pick = wrap.querySelector('.slide-color-input');

        // If no color input yet (old saved content without picker), add one
        if (!pick) {
            var header = wrap.querySelector('.sermon-slide-header');
            if (header) {
                pick = document.createElement('input');
                pick.type = 'color';
                pick.className = 'slide-color-input';
                pick.title = 'Цвет фона слайда';
                pick.contentEditable = 'false';
                pick.value = bg;
                var delEl = header.querySelector('.sermon-slide-del');
                header.insertBefore(pick, delEl || null);
            }
        }

        if (pick) pick.oninput = _onPickChange;
    }

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

        // ── SLIDES — re-attach ──
        editorEl.querySelectorAll('.sermon-slide').forEach(function (slide) {
            _attachSlideHandlers(slide);
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

                    span.setAttribute('data-verse-html',      '');
                    span.setAttribute('data-verse-comments',  '[]');
                    span.innerHTML =
                        '<span class="cite-body">' +
                        '<span class="cite-ref">📖 ' + langRefLabel + langSuffix + '</span>' +
                        (verseText ?
                            '<span class="cite-verse-text">' + verseText + '</span>' : '') +
                        '</span>' +
                        '<span class="cite-remove" title="Удалить">×</span>';

                    span.querySelector('.cite-remove').onclick = function (e) {
                        e.stopPropagation(); span.remove(); scheduleAutoSave();
                    };
                    span.ondblclick = function (e) { e.stopPropagation(); openChipEditor(span); };
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
        span.setAttribute('data-msg-title',       msgTitle);
        span.setAttribute('data-para-text',       para.text);
        span.setAttribute('data-para-html',       '');
        span.setAttribute('data-verse-comments',  '[]');
        span.innerHTML = '✍️ ' + para.text +
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
    // WEBSOCKET CONNECTION
    // ──────────────────────────────────────────────────────────

    $scope.wsConnected = null;

    window.createAuthenticatedWebSocket(
        null,
        function(data) {
            if (data.type === 'access_response') {
                $scope.$apply(function() {
                    if (data.data.status === 'approved') {
                        alert('✓ Доступ одобрен: ' + data.data.target_name);
                        loadDisplayTargets();
                    } else if (data.data.status === 'rejected') {
                        alert('✗ Доступ отклонен: ' + data.data.target_name);
                    }
                });
            }
        },
        function(error) {
            console.error('WebSocket error:', error);
        },
        function(connected) {
            $scope.$apply(function() {
                $scope.wsConnected = connected;
            });
        }
    );

});