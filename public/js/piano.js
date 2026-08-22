/**
 * Pianist page (Aug 2026) — a private copy of the leader page.
 *
 * The pianist searches the allowed collections, keeps a personal song list
 * (PHP session — piano_* commands; gone with the logout) and opens sheet
 * music or lyrics on his OWN screen only. Nothing on this page touches the
 * screens, the notes channel or the group's favorites: no WebSocket, no
 * set_image / clear_image, no update_needed.
 *
 * Notes view: a full-viewport overlay (browser fullscreen when available)
 * with the image of the chosen image group ("type") — the same translucent
 * group buttons and the same remembered choice (sessionStorage
 * 'musicianImageGroup') as the musician page. Lyrics view: the leader's
 * black auto-fitted text screen.
 */
app.controller('Piano', ['$scope', '$http', 'SongsService', '$timeout', function ($scope, $http, SongsService, $timeout)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.searchSongList = [];
    $scope.favorites = [];
    $scope.visibleSongLists = [];
    $scope.langList = [];
    $scope.songPreview = { visible: false, song: null, imgError: false };

    // ── Song lists / search (same as the leader page) ───────────
    $scope.loadSongLists = function () {
        SongsService.getVisibleSongLists().then(function (lists) {
            $scope.visibleSongLists = lists;
            if (lists.length > 0) {
                $scope.listId = lists[0].LIST_ID;
            }
            $scope.reloadSongList();
            $scope.loadSearchSongs(lists);
        }, function () {
            console.error('piano.js: failed to load song lists');
            $scope.reloadSongList();
        });
    };

    function addLangInfo(song, emptyMark) {
        var langs = [];
        angular.forEach($scope.langList, function (lang) {
            if (song['hasText_' + lang.code] === '1') langs.push(lang.code.toUpperCase());
        });
        var bookPart = song.bookName ? song.bookName : '';
        var langPart = langs.length ? langs.join(' · ') : emptyMark;
        song.langInfo = bookPart + (bookPart && langPart ? '  ·  ' : '') + langPart;
    }

    $scope.loadSearchSongs = function (lists) {
        var ids = lists.map(function (l) { return l.LIST_ID; });
        SongsService.getSongsForSearch(ids).then(function (songs) {
            angular.forEach(songs, function (song) { addLangInfo(song, ''); });
            $scope.searchSongList = songs;
        });
    };

    $scope.reloadSongList = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_song_list', list_id: $scope.listId } }).then(
            function success(respond) {
                $scope.songList = respond.data;
                angular.forEach($scope.songList, function (song) { addLangInfo(song, '—'); });
            },
            function error(erespond) { console.error('piano.js Ajax error:', erespond); }
        );
    };

    $scope.setList = function (listId) {
        $scope.listId = listId;
        $scope.reloadSongList();
    };

    // Name of the currently selected song collection (for button labels).
    $scope.currentListName = function () {
        for (var i = 0; i < $scope.visibleSongLists.length; i++) {
            if ($scope.visibleSongLists[i].LIST_ID == $scope.listId) {
                return $scope.visibleSongLists[i].LIST_NAME;
            }
        }
        return '';
    };

    // ── Personal list (PHP session) ─────────────────────────────
    $scope.reloadFavorites = function (callback) {
        $http({ method: "POST", url: "/ajax", data: { command: 'piano_get_favorites' } }).then(
            function success(respond) {
                $scope.favorites = respond.data || [];
                if (callback) callback();
            },
            function error(erespond) { console.error('piano.js Ajax error:', erespond); }
        );
    };

    function addSong(songId, done) {
        $http({ method: "POST", url: "/ajax", data: { command: 'piano_add_favorite', id: songId } }).then(
            function success(r) {
                if (r.data && r.data.status === 'error' && r.data.message) alert(r.data.message);
                $scope.reloadFavorites();
                if (done) done();
            },
            function error(erespond) { console.error('piano.js Ajax error:', erespond); }
        );
    }

    // angucomplete selection
    $scope.selectedItem = function (item) {
        if (typeof item !== 'undefined') {
            addSong(item.originalObject.ID, function () {
                $scope.$broadcast('angucomplete-alt:clearInput');
            });
        }
    };

    $scope.$on('song:previewSong', function (e, song) {
        $scope.songPreview = { visible: true, song: song, imgError: false };
    });

    $scope.closeSongPreview = function () {
        $scope.songPreview.visible = false;
    };

    $scope.confirmAddSongFromPreview = function () {
        if (!$scope.songPreview.song) return;
        addSong($scope.songPreview.song.ID, function () {
            $scope.songPreview.visible = false;
            $scope.$broadcast('angucomplete-alt:clearInput');
        });
    };

    // Full list popup
    $scope.addSongToFavorites = function (songId) {
        addSong(songId);
    };

    $scope.openList = function () {
        $scope.showList(true);
    };

    $scope.showList = function (flag) {
        jQuery("#list-popup .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.toggleInlineNotes = function (song) {
        song.showInlineNotes = !song.showInlineNotes;
    };

    $scope.clearFavorites = function () {
        if ($scope.favorites.length > 0) {
            $scope.confirmationDialog(window.t('leader.confirm.clearTitle'), function () {
                $http({ method: "POST", url: "/ajax", data: { command: 'piano_clear_favorites' } }).then(
                    function success() { $scope.reloadFavorites(); }
                );
                $scope.showDialog(false);
            });
        }
    };

    $scope.deleteFavoriteItem = function (fav_id, fav_title) {
        $scope.confirmationDialog(fav_title, function () {
            $http({ method: "POST", url: "/ajax", data: { command: 'piano_delete_favorite', id: fav_id } }).then(
                function success() { $scope.reloadFavorites(); }
            );
            $scope.showDialog(false);
        });
    };

    // Confirmation dialog (same markup as the leader page)
    $scope.confirmationDialogConfig = {};
    $scope.confirmationDialog = function (msg, callback) {
        $scope.confirmationDialogConfig = {
            title: window.t('leader.confirm.deleteTitle'),
            message: window.t('leader.confirm.deleteMessage', { name: msg }),
            buttons: [{ label: window.t('common.button.yes'), action: callback }]
        };
        $scope.showDialog(true);
    };

    $scope.showDialog = function (flag) {
        jQuery("#confirmation-dialog .modal").modal(flag ? 'show' : 'hide');
    };

    // ── Browser fullscreen helpers (best effort) ────────────────
    function requestFs(el) {
        if (!el) return;
        var req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return;
        try {
            var p = req.call(el);
            if (p && p.catch) p.catch(function () {});
        } catch (e) { /* ignore */ }
    }

    function exitFs() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            var exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
        }
    }

    // ── Notes view (image of the chosen group) ──────────────────
    var NO_IMAGE_LANGS = ['ru', 'de', 'en', 'lt'];
    var uiLang = String(window.UI_LANG || 'ru').toLowerCase();
    var noImageSrc = '/no_image/' + (NO_IMAGE_LANGS.indexOf(uiLang) !== -1 ? uiLang : 'ru') + '.png';

    $scope.notesFs = { open: false, song: null, groups: [], selectedGroupId: null, shownGroup: null, image: '' };
    var notesSeq = 0;

    // Remembered image-group choice — shared with the musician page.
    var SEL_KEY = 'musicianImageGroup';
    function loadSel() {
        var sel = { byList: {}, lastName: '', lastOrig: '' };
        try {
            var stored = JSON.parse(sessionStorage.getItem(SEL_KEY));
            if (stored && typeof stored === 'object') {
                sel.byList   = stored.byList || {};
                sel.lastName = stored.lastName || '';
                sel.lastOrig = stored.lastOrig || '';
            }
        } catch (e) { /* ignore */ }
        return sel;
    }
    function saveSel(sel) {
        try { sessionStorage.setItem(SEL_KEY, JSON.stringify(sel)); } catch (e) { /* ignore */ }
    }
    function firstWithImage(groups) {
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].image) return groups[i];
        }
        return null;
    }
    function resolveSelected(groups, listId) {
        var sel = loadSel();
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].id === sel.byList[listId]) return groups[i];
        }
        var wanted = [sel.lastName, sel.lastOrig].filter(Boolean).map(function (s) { return String(s).toLowerCase(); });
        if (wanted.length) {
            for (var j = 0; j < groups.length; j++) {
                var n = String(groups[j].name || '').toLowerCase();
                var o = String(groups[j].orig_name || '').toLowerCase();
                if (wanted.indexOf(n) !== -1 || (o && wanted.indexOf(o) !== -1)) return groups[j];
            }
        }
        return groups.length ? groups[0] : null;
    }

    function renderNotes() {
        var nf = $scope.notesFs;
        var buster = '?t=' + new Date().getTime();
        if (nf.shownGroup && nf.shownGroup.image) {
            nf.image = nf.shownGroup.image + buster;
        } else if (!nf.groups.length && nf.song) {
            nf.image = nf.song.imageName + buster;   // server without group data
        } else {
            nf.image = noImageSrc;
        }
    }

    $scope.openNotes = function (listItem) {
        var nf = $scope.notesFs;
        var seq = ++notesSeq;
        nf.open = true;
        nf.song = listItem;
        nf.groups = [];
        nf.selectedGroupId = null;
        nf.shownGroup = { id: 0, name: '', image: listItem.imageName };   // main sheet until the groups arrive
        renderNotes();
        $timeout(function () { requestFs(document.getElementById('pianoNotesFs')); }, 0);

        $http({ method: "POST", url: "/ajax", data: { command: 'get_song_images', song_id: listItem.ID } }).then(
            function (r) {
                if (seq !== notesSeq || !nf.open) return;
                var d = r.data || {};
                if (d.status !== 'success' || !d.groups || !d.groups.length) return;
                nf.groups = d.groups;
                var selected = resolveSelected(nf.groups, String(listItem.LISTID));
                nf.selectedGroupId = selected ? selected.id : null;
                nf.shownGroup = (selected && selected.image) ? selected : firstWithImage(nf.groups);
                renderNotes();
            }
        );
    };

    $scope.selectNotesGroup = function (g, $event) {
        if ($event) $event.stopPropagation();
        var nf = $scope.notesFs;
        if (!g || !nf.song) return;
        var sel = loadSel();
        sel.byList[String(nf.song.LISTID)] = g.id;
        sel.lastName = g.name;
        sel.lastOrig = g.orig_name || '';
        saveSel(sel);
        nf.selectedGroupId = g.id;
        nf.shownGroup = g.image ? g : firstWithImage(nf.groups);
        renderNotes();
    };

    $scope.closeNotes = function () {
        notesSeq++;
        $scope.notesFs.open = false;
        $scope.notesFs.song = null;
        exitFs();
    };

    $scope.onNotesImageError = function () {
        var nf = $scope.notesFs;
        if (!nf.open || String(nf.image).indexOf(noImageSrc) === 0) return;
        $scope.$applyAsync(function () { nf.image = noImageSrc; });
    };

    // ── Lyrics view (black auto-fitted screen, as on the leader page) ──
    $scope.fullScreenText = null;   // text shown, or null = closed

    // Pick the best song text: default language first, else first lang with text.
    function pickSongText(listItem) {
        var langs = ($scope.langList || []).slice().sort(function (a, b) {
            return (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0);
        });
        for (var i = 0; i < langs.length; i++) {
            if (listItem['hasText_' + langs[i].code] === '1') {
                var col = 'TEXT' + (langs[i].col_suffix || '');
                if (listItem[col]) return listItem[col];
            }
        }
        return listItem.TEXT || '';
    }

    // Render the song as verse blocks (one per source line); the fit below
    // scales the font so the whole thing fills the screen.
    function buildText(raw) {
        var inner = document.getElementById('pianoTextFsInner');
        if (!inner) return;
        var text = (raw || '');
        text = text.replace('$ $', '\r\n-----\r\n');
        text = text.replace(/\$(\*{5,})\$/g, function (m, stars) { return '·'.repeat(stars.length); });
        text = text.replace('$', '');
        var verses = text.split(/\r?\n/).filter(function (l) { return l.trim().length; });
        inner.innerHTML = '';
        inner.style.fontSize = '';
        inner.style.display = 'block';
        var first = true;
        verses.forEach(function (v) {
            var div = document.createElement('div');
            div.style.whiteSpace   = 'pre-wrap';
            div.style.overflowWrap = 'anywhere';
            div.style.margin       = first ? '0' : '0.6em 0 0';
            div.textContent = v;   // text-only: no HTML injection
            inner.appendChild(div);
            first = false;
        });
    }

    // Largest font size that fills the screen (binary search, integer-safe
    // width compare — see the leader page / CLAUDE.md fit-text lesson).
    function fitText(_retry) {
        $timeout(function () {
            var inner = document.getElementById('pianoTextFsInner');
            if (!inner) return;
            var vw = Math.max(document.documentElement.clientWidth  || 0, window.innerWidth  || 0);
            var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            var availW = vw * 0.92;
            var availH = vh * 0.92;
            if (availH <= 20 || availW <= 20) {
                if ((_retry || 0) < 10) fitText((_retry || 0) + 1);
                return;
            }
            var wrapW = Math.floor(availW);
            inner.style.width = wrapW + 'px';
            var lo = 10, hi = 1000, best = 10;
            for (var i = 0; i < 22; i++) {
                var mid = (lo + hi) / 2;
                inner.style.fontSize = mid + 'px';
                if (inner.scrollHeight <= availH + 1 && inner.scrollWidth <= wrapW + 2) {
                    best = mid; lo = mid;
                } else {
                    hi = mid;
                }
            }
            inner.style.fontSize = best + 'px';
        }, 50);
    }

    $scope.openFullscreenText = function (listItem) {
        $scope.fullScreenText = pickSongText(listItem) || ' ';
        $timeout(function () {
            buildText($scope.fullScreenText);
            requestFs(document.getElementById('pianoTextFs'));
            fitText();
            $timeout(fitText, 400);   // re-fit after layout settles
        }, 0);
    };

    $scope.exitFullscreenText = function () {
        $scope.fullScreenText = null;
        exitFs();
    };

    // ESC / system gesture left fullscreen: close whatever view is open.
    function onFsChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if ($scope.fullScreenText != null) fitText();
            return;
        }
        $scope.$applyAsync(function () {
            $scope.fullScreenText = null;
            if ($scope.notesFs.open) { notesSeq++; $scope.notesFs.open = false; $scope.notesFs.song = null; }
        });
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // Re-fit the lyrics when the viewport changes (debounced: mobile address bar).
    var resizeTimer = null;
    function scheduleRefit() {
        if ($scope.fullScreenText == null) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { resizeTimer = null; fitText(); }, 200);
    }
    window.addEventListener('resize', scheduleRefit);
    window.addEventListener('orientationchange', scheduleRefit);

    $scope.loadSongLists();
    SongsService.getLanguages().then(function (langs) { $scope.langList = langs; });
    $scope.reloadFavorites();
}]);
