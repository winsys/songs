/**
 * sermon_prep.js
 * AngularJS controller for the Sermon Preparation mode.
 */
app.controller('SermonPrep', function ($scope, $http, $timeout) {

    // ── Sermon data ─────────────────────────────────────────
    $scope.sermon = {
        id: null,
        title: '',
        date: ''
    };
    $scope.sermonList   = [];
    $scope.showSermonList = false;
    $scope.saveStatus   = '';

    // ── Bible navigator state ────────────────────────────────
    $scope.bibleTranslations    = [];
    $scope.bibleTranslationId   = null;
    $scope.bibleBooks           = [];
    $scope.selectedBook         = null;
    $scope.bibleChapters        = [];
    $scope.selectedChapter      = null;
    $scope.rawVerses            = [];
    $scope.preparedVerses       = [];          // [{num, display}]
    $scope.selectedBibleVerseNums = [];        // verse numbers selected (int[])

    // ── UI state ─────────────────────────────────────────────
    $scope.bookSearchQuery      = '';
    $scope.biblePanelCollapsed  = false;
    $scope.showColorPicker      = false;
    $scope.currentColor         = '#e53935';
    $scope.modalImgSrc          = '';
    $scope.colorPalette = [
        '#e53935','#d81b60','#8e24aa','#3949ab','#1e88e5',
        '#00acc1','#43a047','#f4511e','#fb8c00','#fdd835',
        '#6d4c41','#546e7a','#000000','#607d8b'
    ];

    // ── Editor DOM reference + cursor ────────────────────────
    var editorEl  = null;
    var lastRange = null;   // last saved selection range inside editor

    // ── Auto-save timer ──────────────────────────────────────
    var autoSaveTimer = null;

    // ==========================================================
    // INIT
    // ==========================================================

    angular.element(document).ready(function () {
        editorEl = document.getElementById('sermon-editor');

        // Track cursor position whenever user interacts with editor
        ['mouseup', 'keyup', 'touchend'].forEach(function (ev) {
            editorEl.addEventListener(ev, saveRange);
        });

        // Trigger auto-save on content change
        editorEl.addEventListener('input', function () {
            scheduleAutoSave();
        });

        // File input listener — avoids onchange="angular.element..." pattern
        var fileInput = document.getElementById('sermon-image-input');
        fileInput.addEventListener('change', function () {
            $scope.$apply(function () {
                $scope.onImageSelected(fileInput);
            });
        });

        // Close color picker when clicking outside toolbar
        document.addEventListener('mousedown', function (e) {
            if (!e.target.closest('.color-picker-wrap')) {
                $scope.$apply(function () { $scope.showColorPicker = false; });
            }
        });

        // Init: set default date (today + 1 day) and load data
        $scope.$apply(function () {
            var d = new Date();
            d.setDate(d.getDate() + 1);
            $scope.sermon.date = d.toISOString().slice(0, 10);
            $scope.loadSermonList();
            $scope.loadBibleTranslations();
        });
    });

    function saveRange() {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            var r = sel.getRangeAt(0);
            // Only save if range is inside the editor
            if (editorEl && editorEl.contains(r.commonAncestorContainer)) {
                lastRange = r.cloneRange();
            }
        }
    }

    function restoreRange() {
        if (!lastRange) {
            // Place cursor at end
            var sel = window.getSelection();
            var r = document.createRange();
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

    // ==========================================================
    // SERMON CRUD
    // ==========================================================

    $scope.loadSermonList = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_sermon_list' } }).then(
            function (r) { $scope.sermonList = r.data; },
            function (e) { console.error('get_sermon_list error', e); }
        );
    };

    $scope.newSermon = function () {
        $scope.sermon = { id: null, title: '', date: '' };
        var d = new Date();
        d.setDate(d.getDate() + 1);
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
                    // Re-attach citation/image click handlers after load
                    attachEditorHandlers();
                }
                lastRange = null;
                $scope.saveStatus = '';
                $scope.showSermonList = false;
            },
            function (e) { console.error('get_sermon error', e); }
        );
    };

    $scope.saveSermon = function () {
        var content = editorEl ? editorEl.innerHTML : '';
        var isNew = !$scope.sermon.id;
        $scope.saveStatus = 'saving';
        $http({ method: "POST", url: "/ajax", data: {
                command: 'save_sermon',
                id: $scope.sermon.id || 0,
                title: $scope.sermon.title,
                date: $scope.sermon.date,
                content: content
            }}).then(
            function (r) {
                if (r.data && r.data.status === 'error') {
                    console.error('save_sermon server error:', r.data.message);
                    alert('Ошибка сохранения: ' + r.data.message);
                    $scope.saveStatus = '';
                    return;
                }
                if (r.data && r.data.id != null && r.data.id !== false) {
                    $scope.sermon.id = r.data.id;
                }
                $scope.saveStatus = 'saved';
                // For new sermons — open the list so user sees it was added
                if (isNew) {
                    $scope.showSermonList = true;
                }
                $scope.loadSermonList();
                $timeout(function () { $scope.saveStatus = ''; }, 2500);
            },
            function (e) {
                console.error('save_sermon HTTP error:', e);
                alert('Ошибка сохранения (HTTP ' + (e.status || '?') + ')');
                $scope.saveStatus = '';
            }
        );
    };

    $scope.confirmDelete = function () {
        if (!$scope.sermon.id) return;
        if (!confirm('Удалить эту проповедь?')) return;
        $http({ method: "POST", url: "/ajax", data: { command: 'delete_sermon', id: $scope.sermon.id } }).then(
            function () {
                $scope.newSermon();
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
        }, 5000); // auto-save after 5s of inactivity
    }

    // ==========================================================
    // TEXT FORMATTING
    // ==========================================================

    $scope.execFmt = function (cmd) {
        // ng-mousedown with preventDefault keeps selection alive — just run the command
        document.execCommand(cmd, false, null);
    };

    $scope.toggleColorPicker = function () {
        // Selection is still alive here (mousedown was prevented)
        saveRange();
        $scope.showColorPicker = !$scope.showColorPicker;
    };

    $scope.applyColor = function (color) {
        $scope.currentColor  = color;
        $scope.showColorPicker = false;
        // Restore the selection that was saved when picker opened
        restoreRange();
        document.execCommand('foreColor', false, color);
    };

    // ==========================================================
    // IMAGE UPLOAD + INSERT
    // ==========================================================

    $scope.triggerImageUpload = function () {
        saveRange();  // save cursor before losing focus
        document.getElementById('sermon-image-input').click();
    };

    $scope.onImageSelected = function (input) {
        if (!input.files || input.files.length === 0) return;
        var file = input.files[0];
        var formData = new FormData();
        formData.append('image', file);
        formData.append('command', 'upload_sermon_image');

        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                console.log('upload_sermon_image response:', r.data);
                if (r.data && r.data.path) {
                    insertImageNode(r.data.path);
                } else {
                    var msg = (r.data && r.data.message) ? r.data.message : JSON.stringify(r.data);
                    alert('Ошибка загрузки: ' + msg);
                }
                input.value = '';
            },
            function (e) {
                console.error('upload_sermon_image HTTP error:', e);
                alert('Ошибка загрузки (HTTP ' + (e.status || '?') + '): ' + (e.statusText || ''));
                input.value = '';
            }
        );
    };

    function insertImageNode(path) {
        var span = document.createElement('span');
        span.className = 'sermon-img-wrap';
        span.contentEditable = 'false';
        span.setAttribute('data-image-path', path);

        var img = document.createElement('img');
        img.src = path;
        img.className = 'sermon-img-thumb';
        img.alt = 'Изображение';

        var removeBtn = document.createElement('span');
        removeBtn.className = 'sermon-img-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = function (e) {
            e.stopPropagation();
            span.remove();
            scheduleAutoSave();
        };

        // Click on image = open fullscreen
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

    // ==========================================================
    // BIBLE CITATION INSERT
    // ==========================================================

    $scope.getRefLabel = function () {
        if (!$scope.selectedBook || !$scope.selectedChapter) return '';
        var bookName = $scope.getBookName($scope.selectedBook);
        var nums = $scope.selectedBibleVerseNums.slice().sort(function(a,b){return a-b;});
        if (nums.length === 0) return '';
        if (nums.length === 1) return bookName + ' ' + $scope.selectedChapter + ':' + nums[0];
        // Check consecutive
        var consecutive = true;
        for (var i = 1; i < nums.length; i++) {
            if (nums[i] !== nums[i-1] + 1) { consecutive = false; break; }
        }
        if (consecutive) {
            return bookName + ' ' + $scope.selectedChapter + ':' + nums[0] + '-' + nums[nums.length-1];
        }
        return bookName + ' ' + $scope.selectedChapter + ':' + nums.join(',');
    };

    $scope.insertBibleCitation = function () {
        if ($scope.selectedBibleVerseNums.length === 0) return;

        var nums = $scope.selectedBibleVerseNums.slice().sort(function(a,b){return a-b;});
        var bookName = $scope.selectedBook ? $scope.getBookName($scope.selectedBook) : '';

        // Insert one chip per verse
        nums.forEach(function (num) {
            var refLabel = bookName + ' ' + $scope.selectedChapter + ':' + num;

            var span = document.createElement('span');
            span.className = 'bible-cite';
            span.contentEditable = 'false';
            span.setAttribute('data-translation-id', $scope.bibleTranslationId || '');
            span.setAttribute('data-book-id', $scope.selectedBook ? $scope.selectedBook.ID : '');
            span.setAttribute('data-book-name', bookName);
            span.setAttribute('data-chapter', $scope.selectedChapter || '');
            span.setAttribute('data-verse-nums', num);
            span.setAttribute('data-ref-label', refLabel);

            span.innerHTML = '📖 ' + refLabel +
                ' <span class="cite-remove" title="Удалить">×</span>';

            span.querySelector('.cite-remove').onclick = function (e) {
                e.stopPropagation();
                span.remove();
                scheduleAutoSave();
            };

            insertNodeAtCursor(span);
        });

        // Clear verse selection after insert
        $scope.selectedBibleVerseNums = [];
    };

    // ==========================================================
    // DOM UTILITY: insert node at saved cursor position
    // ==========================================================

    function insertNodeAtCursor(node) {
        editorEl.focus();
        restoreRange();

        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);

        // Move cursor after inserted node
        var afterRange = document.createRange();
        afterRange.setStartAfter(node);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);
        lastRange = afterRange.cloneRange();

        // Insert a zero-width space after span so user can type after it
        var zws = document.createTextNode('\u200B');
        afterRange.insertNode(zws);
        afterRange.setStartAfter(zws);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);
        lastRange = afterRange.cloneRange();

        scheduleAutoSave();
    }

    // Re-attach click handlers to existing citation/image nodes (after loading from DB)
    function attachEditorHandlers() {
        if (!editorEl) return;

        // Bible citations
        editorEl.querySelectorAll('.bible-cite').forEach(function (span) {
            var removeBtn = span.querySelector('.cite-remove');
            if (removeBtn) {
                removeBtn.onclick = function (e) {
                    e.stopPropagation();
                    span.remove();
                    scheduleAutoSave();
                };
            }
        });

        // Images
        editorEl.querySelectorAll('.sermon-img-wrap').forEach(function (span) {
            var path = span.getAttribute('data-image-path');
            var removeBtn = span.querySelector('.sermon-img-remove');
            if (removeBtn) {
                removeBtn.onclick = function (e) {
                    e.stopPropagation();
                    span.remove();
                    scheduleAutoSave();
                };
            }
            span.onclick = function (e) {
                if (e.target === removeBtn) return;
                $scope.$apply(function () {
                    $scope.modalImgSrc = path;
                    document.getElementById('sermon-img-modal').classList.add('open');
                });
            };
        });
    }

    // ==========================================================
    // IMAGE MODAL
    // ==========================================================

    $scope.closeImgModal = function () {
        document.getElementById('sermon-img-modal').classList.remove('open');
        $scope.modalImgSrc = '';
    };

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            $scope.$apply(function () { $scope.closeImgModal(); });
        }
    });

    // ==========================================================
    // BIBLE NAVIGATION
    // ==========================================================

    $scope.loadBibleTranslations = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_translations' } }).then(
            function (r) {
                $scope.bibleTranslations = r.data;
                if (r.data.length > 0 && !$scope.bibleTranslationId) {
                    $scope.setBibleTranslation(r.data[0].ID);
                }
            }
        );
    };

    $scope.setBibleTranslation = function (id) {
        $scope.bibleTranslationId = id;
        $scope.bibleBooks = [];
        $scope.selectedBook = null;
        $scope.bibleChapters = [];
        $scope.selectedChapter = null;
        $scope.rawVerses = [];
        $scope.preparedVerses = [];
        $scope.selectedBibleVerseNums = [];

        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_books', translation_id: id } }).then(
            function (r) { $scope.bibleBooks = r.data; }
        );
    };

    $scope.getBookName = function (book) {
        if (!book) return '';
        return book.NAME || '';
    };

    $scope.getFilteredBooks = function () {
        if (!$scope.bookSearchQuery) return $scope.bibleBooks;
        var q = $scope.bookSearchQuery.toLowerCase();
        return $scope.bibleBooks.filter(function (b) {
            return (b.NAME && b.NAME.toLowerCase().indexOf(q) >= 0) ||
                (b.NAME_LT && b.NAME_LT.toLowerCase().indexOf(q) >= 0) ||
                (b.NAME_EN && b.NAME_EN.toLowerCase().indexOf(q) >= 0);
        });
    };

    $scope.selectBook = function (book) {
        $scope.selectedBook = book;
        $scope.bibleChapters = [];
        $scope.selectedChapter = null;
        $scope.rawVerses = [];
        $scope.preparedVerses = [];
        $scope.selectedBibleVerseNums = [];

        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_chapters', book_id: book.ID } }).then(
            function (r) { $scope.bibleChapters = r.data; }
        );
    };

    $scope.selectChapter = function (ch) {
        $scope.selectedChapter = ch;
        $scope.rawVerses = [];
        $scope.preparedVerses = [];
        $scope.selectedBibleVerseNums = [];

        $http({ method: "POST", url: "/ajax", data: {
                command: 'get_bible_verses',
                book_id: $scope.selectedBook.ID,
                chapter_num: ch
            }}).then(function (r) {
            $scope.rawVerses = r.data;
            $scope.preparedVerses = r.data.map(function (v) {
                return { num: parseInt(v.VERSE_NUM), display: v.VERSE_NUM + '. ' + (v.TEXT || '') };
            });
        });
    };

    $scope.toggleVerse = function (v, $event) {
        var idx = $scope.selectedBibleVerseNums.indexOf(v.num);
        var ctrlKey = $event.ctrlKey || $event.metaKey;

        if (ctrlKey) {
            // Multi-select with Ctrl
            if (idx > -1) {
                $scope.selectedBibleVerseNums.splice(idx, 1);
            } else {
                $scope.selectedBibleVerseNums.push(v.num);
            }
        } else {
            // Single select (toggle off if already selected alone)
            if ($scope.selectedBibleVerseNums.length === 1 && idx > -1) {
                $scope.selectedBibleVerseNums = [];
            } else {
                $scope.selectedBibleVerseNums = [v.num];
            }
        }
    };

});