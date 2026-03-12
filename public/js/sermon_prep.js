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

    // ── VIDEO state ──────────────────────────────────────────
    $scope.showVideoPanel  = false;   // toolbar dropdown open
    $scope.videoUrlInput   = '';      // URL field value
    // Preview modal
    $scope.modalVideoSrc          = '';
    $scope.modalVideoSrcTrusted   = null;
    $scope.modalVideoEmbedSrc     = null;

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
            loadPrepUserSettings();
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
    // SERMON CRUD (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.loadSermonList = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon_list' } }).then(
            function (r) { $scope.sermonList = r.data; }
        );
    };
    $scope.newSermon = function () {
        $scope.sermon = { id: null, title: '', date: '' };
        var d = new Date(); d.setDate(d.getDate() + 1);
        $scope.sermon.date = d.toISOString().slice(0, 10);
        if (editorEl) editorEl.innerHTML = '';
        lastRange = null;
        $scope.saveStatus = '';
        $scope.showSermonList = false;
    };
    $scope.loadSermon = function (id) {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon', id: id } }).then(
            function (r) {
                var s = r.data;
                $scope.sermon = { id: s.ID, title: s.TITLE, date: s.SERMON_DATE };
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
        $scope.saveStatus = 'saving';
        $http({ method: "POST", url: "/ajax", data: {
                command:      'save_sermon',
                id:           $scope.sermon.id || '',
                title:        $scope.sermon.title || '',
                sermon_date:  $scope.sermon.date  || '',
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
    $scope.confirmDelete = function () {
        if (!$scope.sermon.id) return;
        if (!confirm('Удалить эту проповедь?')) return;
        $http({ method: "POST", url: "/ajax", data: { command: 'delete_sermon', id: $scope.sermon.id } }).then(
            function () { $scope.newSermon(); $scope.loadSermonList(); }
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

    $scope.execFmt = function (cmd) {
        document.execCommand(cmd, false, null);
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
    // IMAGE UPLOAD + INSERT (unchanged)
    // ──────────────────────────────────────────────────────────

    $scope.triggerImageUpload = function () {
        saveRange();
        document.getElementById('sermon-image-input').click();
    };
    $scope.onImageSelected = function (input) {
        if (!input.files || input.files.length === 0) return;
        var file     = input.files[0];
        var formData = new FormData();
        formData.append('image',   file);
        formData.append('command', 'upload_sermon_image');
        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                if (r.data && r.data.path) {
                    insertImageNode(r.data.path);
                } else {
                    var msg = (r.data && r.data.message) ? r.data.message : JSON.stringify(r.data);
                    alert('Ошибка загрузки: ' + msg);
                }
                input.value = '';
            },
            function (e) {
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
        removeBtn.onclick   = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };

        span.onclick = function (e) {
            if (e.target === removeBtn) return;
            $scope.$apply(function () {
                $scope.modalImgSrc = path;
                document.getElementById('sermon-img-modal').classList.add('open');
            });
        };

        span.appendChild(img);
        span.appendChild(removeBtn);
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
        var file     = input.files[0];
        var formData = new FormData();
        formData.append('video',   file);
        formData.append('command', 'upload_sermon_video');

        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                if (r.data && r.data.path) {
                    restoreRange();
                    insertVideoNode(r.data.path, r.data.name || r.data.path.split('/').pop());
                } else {
                    alert('Ошибка загрузки видео: ' + (r.data && r.data.message ? r.data.message : ''));
                }
                input.value = '';
            },
            function (e) {
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
        del.onclick    = function (e) { e.stopPropagation(); wrap.remove(); scheduleAutoSave(); };

        // Клик = предпросмотр в модалке
        wrap.onclick = function (e) {
            if (e.target === del) return;
            _openVideoModal(src);
        };

        wrap.appendChild(icon);
        wrap.appendChild(lbl);
        wrap.appendChild(del);
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
        });

        // Message citations — re-attach remove buttons
        editorEl.querySelectorAll('.message-cite').forEach(function (span) {
            var removeBtn = span.querySelector('.cite-remove');
            if (removeBtn) removeBtn.onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
        });

        // Images — re-attach remove + click
        editorEl.querySelectorAll('.sermon-img-wrap').forEach(function (span) {
            var path      = span.getAttribute('data-image-path');
            var removeBtn = span.querySelector('.sermon-img-remove');
            if (removeBtn) removeBtn.onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
            span.onclick = function (e) {
                if (e.target === removeBtn) return;
                $scope.$apply(function () {
                    $scope.modalImgSrc = path;
                    document.getElementById('sermon-img-modal').classList.add('open');
                });
            };
        });

        // ── VIDEO chips — re-attach (НОВЫЙ блок) ──
        editorEl.querySelectorAll('.sermon-video-wrap').forEach(function (span) {
            var src = span.getAttribute('data-video-src');
            var del = span.querySelector('.svw-del');
            if (del) del.onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
            span.onclick = function (e) {
                if (e.target === del) return;
                _openVideoModal(src);
            };
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
    $scope.getBookName = function (book) {
        if (!book) return '';
        return book.NAME || book.NAME_LT || book.NAME_EN || '';
    };
    $scope.selectBook = function (book) {
        $scope.selectedBook           = book;
        $scope.selectedChapter        = null;
        $scope.rawVerses              = [];
        $scope.preparedVerses         = [];
        $scope.selectedBibleVerseNums = [];
        var max = 0;
        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_books', translation_id: $scope.bibleTranslationId } }).then(
            function (r) {
                for (var i = 0; i < r.data.length; i++) {
                    if (r.data[i].ID === book.ID) { max = r.data[i].CHAPTER_COUNT || 50; break; }
                }
                $scope.bibleChapters = [];
                for (var c = 1; c <= max; c++) $scope.bibleChapters.push(c);
            }
        );
        // Simpler: just get chapter count via a quick verse probe
        $scope.bibleChapters = [];
        for (var c = 1; c <= 150; c++) $scope.bibleChapters.push(c);
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
    $scope.insertBibleCitation = function () {
        if ($scope.selectedBibleVerseNums.length === 0) return;
        var nums     = $scope.selectedBibleVerseNums.slice().sort(function(a,b){return a-b;});
        var bookName = $scope.getBookName($scope.selectedBook);
        var refLabel = $scope.getRefLabel();

        var verseText = '';
        nums.forEach(function (n) {
            for (var i=0;i<$scope.rawVerses.length;i++) {
                if (parseInt($scope.rawVerses[i].VERSE_NUM)===n) { verseText += (verseText?' / ':'')+($scope.rawVerses[i].TEXT||''); break; }
            }
        });

        $http({ method:"POST", url:"/ajax", data:{ command:'get_bible_verses', book_id:$scope.selectedBook.ID, chapter_num:$scope.selectedChapter }}).then(
            function () {
                var span = document.createElement('span');
                span.className       = 'bible-cite';
                span.contentEditable = 'false';
                span.setAttribute('data-translation-id', $scope.bibleTranslationId || 1);
                span.setAttribute('data-book-id',   $scope.selectedBook ? $scope.selectedBook.ID : '');
                span.setAttribute('data-book-name',  bookName);
                span.setAttribute('data-chapter',    $scope.selectedChapter || '');
                span.setAttribute('data-verse-nums',  nums.join(','));
                span.setAttribute('data-ref-label',   refLabel);
                span.setAttribute('data-verse-text',  verseText);

                span.innerHTML =
                    '<span class="cite-body">' +
                    '<span class="cite-ref">📖 ' + refLabel + '</span>' +
                    (verseText ? '<span class="cite-verse-text">' + verseText + '</span>' : '') +
                    '</span>' +
                    '<span class="cite-remove" title="Удалить">×</span>';

                span.querySelector('.cite-remove').onclick = function (e) {
                    e.stopPropagation(); span.remove(); scheduleAutoSave();
                };
                insertNodeAtCursor(span);
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
        $scope.prepSelectedParaIdx = ($scope.prepSelectedParaIdx === para.idx) ? null : para.idx;
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
        span.innerHTML = '✍️ ' + para.text + ' <span class="cite-remove" title="Удалить">×</span>';
        span.querySelector('.cite-remove').onclick = function (e) { e.stopPropagation(); span.remove(); scheduleAutoSave(); };
        insertNodeAtCursor(span);
        $scope.prepSelectedParaIdx = null;
    };

});