app.controller('Leader', ['$scope', '$http', 'SongsService', '$timeout', '$sce', function ($scope, $http, SongsService, $timeout, $sce)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.searchSongList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.visibleSongLists = [];
    $scope.langList = [];
    $scope.modalImgSrc = '';    // path to modal image (deprecated)
    $scope.songPreview = { visible: false, song: null, imgError: false };

    // The display target for the leader channel is set by the technician and
    // resolved SERVER-side on every set_image/clear_image (channel: 'leader');
    // this page keeps no local copy of it.

    $scope.loadSongLists = function () {
        SongsService.getVisibleSongLists().then(function (lists) {
            $scope.visibleSongLists = lists;
            if (lists.length > 0) {
                $scope.listId = lists[0].LIST_ID;
            }
            $scope.reloadSongList();
            $scope.loadSearchSongs(lists);
        }, function () {
            console.error('leader.js: failed to load song lists');
            $scope.reloadSongList();
        });
    };

    $scope.loadSearchSongs = function (lists) {
        var ids = lists.map(function (l) { return l.LIST_ID; });
        SongsService.getSongsForSearch(ids).then(function (songs) {
            angular.forEach(songs, function (song) {
                var langs = [];
                angular.forEach($scope.langList, function (lang) {
                    if (song['hasText_' + lang.code] === '1') {
                        langs.push(lang.code.toUpperCase());
                    }
                });
                var bookPart = song.bookName ? song.bookName : '';
                var langPart = langs.length ? langs.join(' · ') : '';
                song.langInfo = bookPart + (bookPart && langPart ? '  ·  ' : '') + langPart;
            });
            $scope.searchSongList = songs;
        });
    };

    $scope.reloadSongList = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_song_list', list_id: $scope.listId } }).then(
            function success(respond){
                $scope.songList = respond.data;
                angular.forEach($scope.songList, function(song) {
                    var langs = [];
                    angular.forEach($scope.langList, function(lang) {
                        if (song['hasText_' + lang.code] === '1') {
                            langs.push(lang.code.toUpperCase());
                        }
                    });
                    var bookPart = song.bookName ? song.bookName : '';
                    var langPart = langs.length ? langs.join(' · ') : '—';
                    song.langInfo = bookPart + (bookPart && langPart ? '  ·  ' : '') + langPart;
                });
            },
            function error(erespond){
                console.error('leader.js Ajax error:', erespond)
            });
    };

    $scope.selectedItem = function(item)
    {
        if (typeof item !== 'undefined') {
            $http({ method: "POST", url: "/ajax", data: { command: 'add_to_favorites', id: item.originalObject.ID } }).then(
                function success() {
                    $scope.reloadFavorites();
                    $scope.$broadcast('angucomplete-alt:clearInput');
                },
                function error(erespond) {
                    console.error('leader.js Ajax error:', erespond);
                });
        }
    };

    $scope.$on('song:previewSong', function(e, song) {
        $scope.songPreview = { visible: true, song: song, imgError: false };
    });

    $scope.closeSongPreview = function () {
        $scope.songPreview.visible = false;
    };

    $scope.confirmAddSongFromPreview = function () {
        if (!$scope.songPreview.song) return;
        $http({ method: "POST", url: "/ajax", data: { command: 'add_to_favorites', id: $scope.songPreview.song.ID } }).then(
            function success() {
                $scope.reloadFavorites();
                $scope.songPreview.visible = false;
                $scope.$broadcast('angucomplete-alt:clearInput');
            },
            function error(erespond) {
                console.error('leader.js Ajax error:', erespond);
            });
    };

    $scope.reloadFavorites = function(callback)
    {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_favorites' } }).then(
            function success(respond){
                $scope.favorites = respond.data;
                if (callback) callback();
            },
            function error(erespond){
                console.error('leader.js Ajax error:', erespond)
            });
    };

    // ==========================================================
    // OBSERVER CHANNEL (группа наблюдателей, Aug 2026)
    // ==========================================================
    // Separate from the screens and from the notes channel: while the
    // "broadcast to the group" toggle is on, the page ADDITIONALLY tells the
    // observer pages what it shows (song / verse / nothing). The existing
    // set_image / set_leader_text / clear_image calls are untouched; the
    // server ignores observer_set_song while the toggle is off.
    $scope.observer = { active: false };
    var observerCur = null;   // {songId, verseIdx, langs} — what is open now; re-sent when the toggle turns on

    function observerSend(songId, verseIdx, langs) {
        songId = parseInt(songId) || 0;
        observerCur = songId ? { songId: songId, verseIdx: verseIdx, langs: langs || [] } : null;
        if (!$scope.observer.active) return;
        $http({ method: "POST", url: "/ajax",
                data: { command: 'observer_set_song',
                        song_id: songId,
                        verse_idx: (verseIdx == null ? -1 : verseIdx),
                        langs: langs || [] } });
    }

    function observerOff() {
        observerSend(0, -1, []);
    }

    $scope.toggleObserver = function() {
        var next = !$scope.observer.active;
        $http({ method: "POST", url: "/ajax",
                data: { command: 'observer_set_active', active: next ? 1 : 0 } }).then(function(r) {
            var d = r.data || {};
            if (d.status !== 'ok') return;
            $scope.observer.active = !!parseInt(d.active);
            // Turned on with something already open: push it right away.
            if ($scope.observer.active && observerCur) {
                observerSend(observerCur.songId, observerCur.verseIdx, observerCur.langs);
            }
        });
    };

    function loadObserverState() {
        $http({ method: "POST", url: "/ajax", data: { command: 'observer_get_state' } }).then(function(r) {
            $scope.observer.active = !!parseInt((r.data || {}).active);
        });
    }

    // ---- Observer join link / QR code (button shown while the toggle is on) ----
    // /join/<token> logs a phone in as the group's shared observer account
    // without a password and opens /observer (users.JOIN_TOKEN). The server
    // returns the existing token (issues it on first use); replacing it stays
    // with the admin's «Новая ссылка» on the settings page. Same modal /
    // print page as there (qrcode-generator, vendored).
    $scope.joinQr = { visible: false, token: '', url: '', svg: '', groupName: '' };

    function joinQrSvg(url, cellSize, margin) {
        if (typeof qrcode !== 'function') return '';
        var code = qrcode(0, 'M');
        code.addData(url);
        code.make();
        return code.createSvgTag({ cellSize: cellSize, margin: margin, scalable: true });
    }

    $scope.showJoinQr = function() {
        $http({ method: "POST", url: "/ajax", data: { command: 'observer_join_link' } }).then(function(r) {
            var d = r.data || {};
            if (d.status === 'none') {
                alert(window.t('leader.joinQr.noAccount'));
                return;
            }
            if (d.status !== 'ok' || !d.token) {
                alert(window.t('settings.joinQr.error'));
                return;
            }
            var q = $scope.joinQr;
            q.token = d.token;
            q.groupName = d.group_name || '';
            q.url = window.location.origin + '/join/' + q.token;
            q.svg = $sce.trustAsHtml(joinQrSvg(q.url, 4, 2));
            q.visible = true;
        }, function() {
            alert(window.t('settings.joinQr.error'));
        });
    };

    $scope.closeJoinQr = function() { $scope.joinQr.visible = false; };

    $scope.copyJoinLink = function() {
        var text = $scope.joinQr.url;
        var done = function() { alert(window.t('settings.joinQr.copied')); };
        var fallback = function() { prompt(window.t('settings.share.copyPrompt'), text); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    };

    // Printable page (title, group name, QR, link): Blob + <a target="_blank">
    // with an onload print script — the reliable print pattern (CLAUDE.md).
    $scope.printJoinQr = function() {
        var q = $scope.joinQr;
        if (!q.token) return;
        var esc = function(s) {
            return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
        };
        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(window.t('settings.joinQr.printTitle')) + '</title>'
            + '<style>body{font-family:Arial,sans-serif;text-align:center;padding:40px 20px;color:#222}'
            + 'h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;font-weight:normal;color:#555;margin:0 0 18px}'
            + 'p{font-size:16px;color:#444;max-width:520px;margin:0 auto 24px;line-height:1.4}'
            + 'svg{width:320px;max-width:80vw;height:auto}.link{font-family:monospace;font-size:13px;word-break:break-all;margin-top:24px;color:#333}</style>'
            + '</head><body><h1>' + esc(window.t('settings.joinQr.printTitle')) + '</h1>'
            + (q.groupName ? '<h2>' + esc(q.groupName) + '</h2>' : '')
            + '<p>' + esc(window.t('settings.joinQr.printHint')) + '</p>'
            + joinQrSvg(q.url, 8, 4)
            + '<div class="link">' + esc(q.url) + '</div>'
            + '<script>window.onload=function(){window.print();};<\/script></body></html>';
        var blob = new Blob([html], { type: 'text/html' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // ---- Drag-n-drop reorder of the favorites list (drag_reorder.js) ----
    // The handle drags a row, the array is reordered live, the final order
    // goes to reorder_favorites (server stores favorites.sort_order and
    // broadcasts update_needed so the tech console follows).
    var favDrag = (window.createDragReorder && document.querySelector('.favorites-list'))
        ? window.createDragReorder({
            container: document.querySelector('.favorites-list'),
            rowSelector: '.prod-list-item',
            onMove: function (from, to) {
                $scope.$apply(function () {
                    var it = $scope.favorites.splice(from, 1)[0];
                    $scope.favorites.splice(to, 0, it);
                });
            },
            onDrop: function (moved) {
                if (!moved) return;
                $http({ method: 'POST', url: '/ajax', data: {
                        command: 'reorder_favorites',
                        items: $scope.favorites.map(function (f) {
                            return { type: 'song', fid: f.FID };
                        })
                    }}).then(null, function () { $scope.reloadFavorites(); });
            }
        })
        : null;

    // The leader's black text-fullscreen content (null = image mode / off).
    $scope.fullScreenText = null;
    var fsSong = null;   // favorites item shown by the notes / text fullscreen (for console follow)

    // Broadcast notes to the musician/display target, then put the LEADER's own
    // screen into fullscreen. When textContent is provided, the leader sees the
    // full song text on a black screen instead of the notes image; the
    // broadcast to musicians is identical in both cases.
    function leaderEnterFullscreen(elemId, img_num, list_id, song_id, textContent) {
        // Set fullScreen flag BEFORE sending set_image to prevent a race with WS.
        $scope.fullScreen = true;
        $scope.fullScreenText = (textContent != null) ? textContent : null;

        var openLocal = function() {
            if (textContent != null) {
                // Wait for ng-show to reveal the overlay, then build + fit. The
                // fixed overlay already covers the viewport, so the fit does not
                // depend on the fullscreen request succeeding (best-effort only).
                $timeout(function() {
                    buildLeaderText(textContent);
                    var el = document.getElementById('leaderTextFs');
                    if (el && el.requestFullscreen) {
                        try {
                            var p = el.requestFullscreen();
                            if (p && p.catch) p.catch(function() {});
                        } catch (e) { /* ignore */ }
                    }
                    fitLeaderText();
                    $timeout(fitLeaderText, 400);   // re-fit after layout settles
                }, 0);
            } else {
                var wrapElement = document.getElementById('wrap' + elemId);
                if (wrapElement && wrapElement.requestFullscreen) {
                    wrapElement.requestFullscreen().catch(function() {
                        $scope.$apply(function() { $scope.fullScreen = false; });
                    });
                } else {
                    $scope.fullScreen = false;
                }
            }
        };

        // Always send: the server resolves the technician-set leader-channel
        // target itself (NULL = do not broadcast, screens stay untouched), so
        // a stale local copy of the target can never overwrite what the
        // technician put on the screens.
        $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_image',
                        channel: 'leader',
                        image_num: img_num,
                        list_id: list_id,
                        song_id: song_id }
        }).then(openLocal, function() {
            $scope.fullScreen = false; $scope.fullScreenText = null;
        });
        observerSend(song_id, -1, []);
    }

    function leaderLeaveFullscreen() {
        var exitLocal = function() {
            if (document.fullscreenElement) { document.exitFullscreen(); }
            $scope.fullScreen = false;
            $scope.fullScreenText = null;
            fsSong = null;
        };

        // Same as above: the server decides whether any screen is cleared.
        $http({ method: "POST", url: "/ajax", data: {
            command: 'clear_image',
            channel: 'leader'
        }}).then(exitLocal, exitLocal);
        observerOff();
    }

    // Pick the best song text: default language first, else first lang with text.
    function leaderPickSongText(listItem) {
        var langs = ($scope.langList || []).slice().sort(function(a, b) {
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

    // Render the song as verse blocks (one per source line). Auto-wrapped lines
    // inside a verse stay tight; the CSS gap separates verses. The fit below
    // scales the font so the whole thing fills the screen.
    function buildLeaderText(raw) {
        var inner = document.getElementById('leaderTextFsInner');
        if (!inner) return;
        var text = (raw || '');
        text = text.replace('$ $', '\r\n-----\r\n');
        text = text.replace(/\$(\*{5,})\$/g, function(m, stars) { return '·'.repeat(stars.length); });
        text = text.replace('$', '');
        // One block per verse so the inter-verse gap can be controlled (about
        // half a blank line via margin), while the fit still fills the screen.
        var verses = text.split(/\r?\n/).filter(function(l) { return l.trim().length; });
        inner.innerHTML = '';
        inner.style.fontSize = '';
        inner.style.display = 'block';
        var first = true;
        verses.forEach(function(v) {
            var div = document.createElement('div');
            div.style.whiteSpace   = 'pre-wrap';
            div.style.overflowWrap = 'anywhere';
            div.style.margin       = first ? '0' : '0.6em 0 0';   // ~half-line verse gap
            div.textContent = v;   // text-only: no HTML injection
            inner.appendChild(div);
            first = false;
        });
    }

    // Scale the text to the largest font size that fills the screen (grow until
    // it would overflow the available area, like the main display screen).
    function fitLeaderText(_retry) {
        $timeout(function() {
            var inner = document.getElementById('leaderTextFsInner');
            if (!inner) return;
            // Use the real viewport; force the wrap width in px so wrapping and
            // the height measurement are consistent (avoids portrait under-fill).
            var vw = Math.max(document.documentElement.clientWidth  || 0, window.innerWidth  || 0);
            var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            var availW = vw * 0.92;
            var availH = vh * 0.92;
            if (availH <= 20 || availW <= 20) {
                // Overlay not laid out yet — retry a few times.
                if ((_retry || 0) < 10) fitLeaderText((_retry || 0) + 1);
                return;
            }
            // Floor the wrap width; scrollWidth is rounded to an integer, so an
            // exact float compare ("380 <= 379.96") would always fail and pin the
            // font at the floor. Compare with a small tolerance.
            var wrapW = Math.floor(availW);
            inner.style.width = wrapW + 'px';
            // Grow the font to the largest size that still fits the screen in
            // both dimensions, so the lyrics fill the screen regardless of length.
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

    $scope.openFullscreen = function(elemId, img_num, list_id, song_id) {
        if (!$scope.fullScreen) {
            fsSong = null;
            for (var i = 0; i < $scope.favorites.length; i++) {
                if ($scope.favorites[i].ID == elemId) { fsSong = $scope.favorites[i]; break; }
            }
            leaderEnterFullscreen(elemId, img_num, list_id, song_id, null);
        } else {
            leaderLeaveFullscreen();
        }
    };

    // Same broadcast as openFullscreen, but the leader sees the full song text
    // (maximized to fit a black screen) instead of the notes image.
    $scope.openFullscreenText = function(listItem) {
        if (!$scope.fullScreen) {
            var text = leaderPickSongText(listItem);
            fsSong = listItem;
            leaderEnterFullscreen(listItem.ID, listItem.NUM, listItem.LISTID, listItem.SONGID, text || ' ');
        } else {
            leaderLeaveFullscreen();
        }
    };

    // Click on the black text screen exits, mirroring a click on the notes.
    $scope.exitFullscreenText = function() {
        leaderLeaveFullscreen();
    };

    // ==========================================================
    // SPLIT-SCREEN VERSE MODE (слова по куплетам)
    // ==========================================================
    // Left half: language buttons + verse chips; right half: the verse that
    // is currently broadcast, rendered by the main screen's rules. Verse
    // clicks go through set_leader_text (leader channel, server-resolved
    // display target) using the tech console's text format, so the main
    // screen shows the verse and the tech console follows the highlight
    // through the same update_needed → restore path it already uses.

    $scope.verseMode = {
        open: false,
        song: null,       // snapshot of the favorites item (survives reloads)
        langs: [],        // languages the song has text in (group order)
        selected: {},     // lang code -> true
        multi: false,     // user_settings.leader_text_multilang
        chips: [],        // [{idx, text, preview}] — idx = base-skeleton index
        activeIdx: null,  // first verse currently on screen (null = off)
        activeIdxs: [],   // every verse on screen (the tech console can select several)
        renderText: null  // what the right pane shows: the leader's own chip
                          // text, or the screen row's text when synced from the console
    };

    var vmSettings = null;   // group user_settings (main-screen colors/font)

    function vmTextCol(lang) { return 'TEXT' + (lang.col_suffix || ''); }

    // True when the song has lyrics in at least one active language.
    $scope.songHasAnyText = function(listItem) {
        for (var i = 0; i < ($scope.langList || []).length; i++) {
            if (listItem['hasText_' + $scope.langList[i].code] === '1') return true;
        }
        return false;
    };

    // Strip the display markers the main screen replaces ('$ $' page break,
    // $*****$ dot row, stray '$') — same pipeline as text_layout.html.
    function vmCleanMarkers(s) {
        var text = (s || '');
        text = text.replace('$ $', '\r\n-----\r\n');
        text = text.replace(/\$(\*{5,})\$/g, function(m, stars) { return '·'.repeat(stars.length); });
        return text.replace('$', '');
    }

    // Verse skeleton — EXACTLY the tech console's splitText contract: the
    // group's default (first) language defines verse count and indices,
    // falling back to the first language with text; selected languages are
    // joined per verse with the dash separator line.
    function vmBuildChips() {
        var vm = $scope.verseMode;
        vm.chips = [];
        if (!vm.song) return;
        var langList = $scope.langList || [];
        var base = null;
        if (langList.length && (vm.song[vmTextCol(langList[0])] || '')) base = langList[0];
        if (!base) {
            for (var i = 0; i < langList.length; i++) {
                if (vm.song[vmTextCol(langList[i])]) { base = langList[i]; break; }
            }
        }
        if (!base) return;
        var baseVerses = (vm.song[vmTextCol(base)] || '').split('\r\n');
        var selLangs = vm.langs.filter(function(l) { return vm.selected[l.code]; });

        baseVerses.forEach(function(baseVerse, idx) {
            if (!baseVerse.trim()) return;
            var parts = [];
            selLangs.forEach(function(lang) {
                var verses = (vm.song[vmTextCol(lang)] || '').split('\r\n');
                var v = verses[idx];
                if (v && v.trim()) parts.push(v);
            });
            if (!parts.length) return;
            vm.chips.push({
                idx: idx,
                text: parts.join('\r\n- - - - - - - -\r\n'), // broadcast format (same as tech)
                preview: vmCleanMarkers(parts[0])            // chip shows the first selected language
            });
        });
    }

    function vmChipByIdx(idx) {
        var chips = $scope.verseMode.chips;
        for (var i = 0; i < chips.length; i++) {
            if (chips[i].idx === idx) return chips[i];
        }
        return null;
    }

    // Main-screen colors/font for the right pane (group user_settings).
    function vmApplyDisplayStyle() {
        var right = document.getElementById('lvmRight');
        if (!right || !vmSettings) return;
        right.style.backgroundColor = vmSettings.main_bg_color   || '#000000';
        right.style.color           = vmSettings.main_font_color || '#FFFFFF';
        var t = document.getElementById('lvmText');
        if (t) t.style.fontFamily = vmSettings.main_font || 'Arial';
    }

    // Render the active verse into the right pane and auto-fit the font
    // (binary search, capped by main_font_max_size — main screen rules).
    function vmRenderCurrent() {
        var el = document.getElementById('lvmText');
        if (!el) return;
        var vm = $scope.verseMode;
        el.textContent = (vm.activeIdxs.length && vm.renderText) ? vmCleanMarkers(vm.renderText) : '';
        vmFitText();
    }

    // Selection helpers keep activeIdx (first verse) and activeIdxs in step.
    function vmSetActive(idxs, text) {
        var vm = $scope.verseMode;
        vm.activeIdxs = idxs.slice();
        vm.activeIdx = idxs.length ? idxs[0] : null;
        vm.renderText = idxs.length ? text : null;
        vmRenderCurrent();
    }

    // ---- Following the tech console -----------------------------------
    // Both consoles write the same rows and fire update_needed: the notes
    // channel (current_notes.image = the group's current song; Bible/media
    // never touch it) and the screen row (current.image/text/chapter_indices).
    // On every update_needed the leader re-reads them like the tech console's
    // restoreCurrentState() and, if one of its song views is open, follows:
    //   - another song in current_notes -> that view switches to it (verse
    //     chips rebuilt / full text rebuilt / notes image swapped inside the
    //     element that is already fullscreen — a new requestFullscreen needs
    //     a user gesture);
    //   - the screen row of the same song -> verse highlight + right pane.
    // A screen row showing a different image (other content, or the leader
    // broadcasting to another group's screen) leaves the verse pane alone.

    // Image of the song the leader's open view shows (null = list view).
    function leaderShownImage() {
        if ($scope.verseMode.open && $scope.verseMode.song) return $scope.verseMode.song.imageName;
        if ($scope.fullScreen && fsSong) return fsSong.imageName;
        return null;
    }

    // The favorites item for a sheet path; the list may be stale (reloads are
    // skipped while fullscreen), so fall back to a fresh fetch that does not
    // touch the scope array.
    function findFavoriteByImage(image, cb) {
        for (var i = 0; i < $scope.favorites.length; i++) {
            if ($scope.favorites[i].imageName === image) { cb($scope.favorites[i]); return; }
        }
        $http({ method: "POST", url: "/ajax", data: { command: 'get_favorites' } }).then(function(r) {
            var list = r.data || [];
            for (var j = 0; j < list.length; j++) {
                if (list[j].imageName === image) { cb(list[j]); return; }
            }
            cb(null);
        }, function() { cb(null); });
    }

    function applyVerseState(st) {
        var vm = $scope.verseMode;
        if (!vm.open || !vm.song || st.image !== vm.song.imageName) return;
        var idxs = [];
        if (st.chapter_indices && /^\d+(,\d+)*$/.test(st.chapter_indices)) {
            idxs = st.chapter_indices.split(',').map(Number);
        }
        if (idxs.join(',') === vm.activeIdxs.join(',') && (st.text || '') === (vm.renderText || '')) return;
        vmSetActive(idxs, st.text || '');
    }

    // Verse mode moves to another song: languages kept where the song has
    // them, chips rebuilt, no broadcast (the console already did it).
    function vmSwitchSong(item) {
        var vm = $scope.verseMode;
        var prev = vm.selected || {};
        vm.song = item;
        vm.langs = ($scope.langList || []).filter(function(l) {
            return item['hasText_' + l.code] === '1' && (item[vmTextCol(l)] || '').length;
        });
        vm.selected = {};
        vm.langs.forEach(function(l) { if (prev[l.code]) vm.selected[l.code] = true; });
        var codes = vmSelectedCodes();
        if (!codes.length && vm.langs.length) vm.selected[vm.langs[0].code] = true;
        if (!vm.multi && codes.length > 1) {
            vm.selected = {};
            vm.selected[codes[0]] = true;
        }
        vmBuildChips();
        vmSetActive([], null);
    }

    function switchShownSong(item, st) {
        if ($scope.verseMode.open) {
            vmSwitchSong(item);
            applyVerseState(st);
            return;
        }
        if (!$scope.fullScreen) return;
        fsSong = item;
        if ($scope.fullScreenText != null) {
            var text = leaderPickSongText(item) || ' ';
            $scope.fullScreenText = text;
            buildLeaderText(text);
            fitLeaderText();
            $timeout(fitLeaderText, 400);
        } else {
            var fsEl = document.fullscreenElement;
            var img = fsEl && fsEl.querySelector ? fsEl.querySelector('img') : null;
            if (img) img.src = item.imageName;
        }
    }

    function syncFromScreen() {
        var mine = leaderShownImage();
        if (!mine) return;
        $http({ method: "POST", url: "/ajax", data: { command: 'get_current_state' } }).then(function(r) {
            var st = r.data || {};
            var shown = leaderShownImage();
            if (!shown) return;
            var songImage = st.notes_image || '';
            if (songImage && songImage !== shown) {
                findFavoriteByImage(songImage, function(item) {
                    if (!item || leaderShownImage() !== shown) return;   // view changed meanwhile
                    switchShownSong(item, st);
                });
                return;
            }
            applyVerseState(st);
        });
    }

    function vmFitText(_retry) {
        $timeout(function() {
            var el = document.getElementById('lvmText');
            var disp = el ? el.parentElement : null;
            if (!el || !disp || !$scope.verseMode.open) return;
            if (!el.textContent) { el.style.fontSize = ''; return; }
            var availW = disp.clientWidth  * 0.92;
            var availH = disp.clientHeight * 0.92;
            if (availH <= 20 || availW <= 20) {
                // Pane not laid out yet — retry a few times.
                if ((_retry || 0) < 10) vmFitText((_retry || 0) + 1);
                return;
            }
            // Floor the wrap width + compare with tolerance (sub-pixel fit
            // lesson: integer scrollWidth vs fractional derived width).
            var wrapW = Math.floor(availW);
            el.style.width = wrapW + 'px';
            var maxFont = (vmSettings && parseInt(vmSettings.main_font_max_size)) || 64;
            var lo = 8, hi = maxFont, best = 8;
            for (var i = 0; i < 16; i++) {
                var mid = (lo + hi) / 2;
                el.style.fontSize = mid + 'px';
                if (el.scrollHeight <= availH + 1 && el.scrollWidth <= wrapW + 2) {
                    best = mid; lo = mid;
                } else {
                    hi = mid;
                }
            }
            el.style.fontSize = best + 'px';
        }, 30);
    }

    // Codes of the selected languages, in group order.
    function vmSelectedCodes() {
        var vm = $scope.verseMode;
        return vm.langs.filter(function(l) { return vm.selected[l.code]; })
                       .map(function(l) { return l.code; });
    }

    // Broadcast one verse through the leader channel. The server resolves
    // the technician-set target (NULL = do not broadcast).
    function vmSend(chip) {
        var vm = $scope.verseMode;
        vmSetActive([chip.idx], chip.text);
        $http({ method: "POST", url: "/ajax",
                data: { command: 'set_leader_text',
                        channel: 'leader',
                        image_name: vm.song.imageName,
                        text: chip.text,
                        song_name: vm.song.NAME || '',
                        chapter_indices: String(chip.idx) } });
        observerSend(vm.song.SONGID || vm.song.ID, chip.idx, vmSelectedCodes());
    }

    // Mirror the selected language(s) to the tech consoles of the group
    // (leader_langs_changed side channel — fires regardless of the display
    // target, like leader_song_changed).
    function vmSendLangs() {
        var vm = $scope.verseMode;
        var codes = vm.langs.filter(function(l) { return vm.selected[l.code]; })
                            .map(function(l) { return l.code; });
        if (!codes.length) return;
        $http({ method: "POST", url: "/ajax",
                data: { command: 'set_leader_langs', langs: codes } });
    }

    // Verse off: screen falls back to the song image row (same as the tech
    // console's verse toggle-off).
    function vmSendOff() {
        var vm = $scope.verseMode;
        vmSetActive([], null);
        $http({ method: "POST", url: "/ajax",
                data: { command: 'set_leader_text',
                        channel: 'leader',
                        image_name: vm.song ? vm.song.imageName : '',
                        text: '',
                        song_name: '',
                        chapter_indices: '' } });
        if (vm.song) observerSend(vm.song.SONGID || vm.song.ID, -1, vmSelectedCodes());
    }

    $scope.openVerseMode = function(listItem) {
        var vm = $scope.verseMode;
        vm.song = listItem;   // snapshot: favorites reloads replace the array
        vm.langs = ($scope.langList || []).filter(function(l) {
            return listItem['hasText_' + l.code] === '1' && (listItem[vmTextCol(l)] || '').length;
        });
        vm.selected = {};
        if (vm.langs.length) vm.selected[vm.langs[0].code] = true;
        vm.activeIdx = null;
        vm.activeIdxs = [];
        vm.renderText = null;
        vm.open = true;

        // The multi-language toggle and main-screen rendering settings may
        // change between opens — refresh them each time.
        $http({ method: "POST", url: "/ajax", data: { command: 'get_user_settings' } }).then(function(r) {
            vmSettings = r.data || null;
            vm.multi = !!(vmSettings && parseInt(vmSettings.leader_text_multilang));
            vmApplyDisplayStyle();
        });
        vmBuildChips();
        vmSendLangs();

        // Go browser-fullscreen, like the black full-text mode: after the
        // digest reveals the overlay (best-effort — the fixed overlay already
        // covers the viewport if the request is denied).
        $timeout(function() {
            var el = document.getElementById('leaderVerseMode');
            if (el && el.requestFullscreen) {
                try {
                    var p = el.requestFullscreen();
                    if (p && p.catch) p.catch(function() {});
                } catch (e) { /* ignore */ }
            }
            vmRenderCurrent();
        }, 0);

        // Same broadcast as the "Аа"/notes toggle: notes on for musicians,
        // song image on the target screen, leader_song_changed for the tech
        // console. No verse is selected yet.
        $http({ method: "POST", url: "/ajax",
                data: { command: 'set_image',
                        channel: 'leader',
                        image_num: listItem.NUM,
                        list_id: listItem.LISTID,
                        song_id: listItem.SONGID } });
        observerSend(listItem.SONGID || listItem.ID, -1, vmSelectedCodes());
    };

    // Close = the leader's song toggle-off: notes off, screen cleared
    // server-side (playing media survives; NULL target = screens untouched).
    $scope.vmClose = function() {
        $scope.verseMode.open = false;
        $scope.verseMode.activeIdx = null;
        $scope.verseMode.activeIdxs = [];
        $scope.verseMode.renderText = null;
        if (document.fullscreenElement) { document.exitFullscreen(); }
        $http({ method: "POST", url: "/ajax",
                data: { command: 'clear_image', channel: 'leader' } });
        observerOff();
    };

    $scope.vmToggleLang = function(lang) {
        var vm = $scope.verseMode;
        if (vm.multi) {
            if (vm.selected[lang.code]) {
                // The last selected language cannot be switched off.
                var cnt = 0;
                angular.forEach(vm.selected, function(v) { if (v) cnt++; });
                if (cnt <= 1) return;
                delete vm.selected[lang.code];
            } else {
                vm.selected[lang.code] = true;
            }
        } else {
            if (vm.selected[lang.code]) return;   // radio: same language re-tap is a no-op
            vm.selected = {};
            vm.selected[lang.code] = true;
        }
        vmBuildChips();
        vmSendLangs();
        // Re-broadcast the verse on screen in the new language set.
        if (vm.activeIdx !== null) {
            var chip = vmChipByIdx(vm.activeIdx);
            if (chip) vmSend(chip); else vmSendOff();
        } else {
            vmRenderCurrent();
            // Observers use the leader's languages as a fallback — keep them current.
            if (vm.song) observerSend(vm.song.SONGID || vm.song.ID, -1, vmSelectedCodes());
        }
    };

    $scope.vmToggleVerse = function(chip) {
        // Off when the chip is on screen (also inside the console's multi-selection).
        if ($scope.verseMode.activeIdxs.indexOf(chip.idx) !== -1) {
            vmSendOff();
        } else {
            vmSend(chip);
        }
    };

    // Swipe navigation: step to the adjacent verse chip; when nothing is on
    // screen yet, any swipe starts from the first verse.
    $scope.vmStep = function(dir) {
        var vm = $scope.verseMode;
        if (!vm.open || !vm.chips.length) return;
        var pos = -1;
        for (var i = 0; i < vm.chips.length; i++) {
            if (vm.chips[i].idx === vm.activeIdx) { pos = i; break; }
        }
        var next = (pos === -1) ? 0 : pos + dir;
        if (next < 0 || next >= vm.chips.length) return;
        vmSend(vm.chips[next]);
        var chipEl = document.getElementById('lvm-chip-' + vm.chips[next].idx);
        if (chipEl) chipEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Vertical swipe on the right pane: up = next verse, down = previous —
    // same convention and 50px threshold as the sermon page's display panel.
    (function() {
        var pane = document.getElementById('lvmRight');
        if (!pane) return;
        var startY = 0, multi = false;
        pane.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) multi = true;
            startY = e.changedTouches[0].screenY;
        }, { passive: true });
        pane.addEventListener('touchend', function(e) {
            if (e.touches.length > 0) return; // wait for the last finger
            var wasMulti = multi;
            multi = false;
            if (wasMulti) return;             // pinch/two-finger gesture
            var deltaY = startY - e.changedTouches[0].screenY; // positive = swipe up
            if (Math.abs(deltaY) <= 50) return;
            $scope.$apply(function() {
                $scope.vmStep(deltaY > 0 ? 1 : -1);
            });
        }, { passive: true });
        pane.addEventListener('touchcancel', function(e) {
            if (e.touches.length === 0) multi = false;
        }, { passive: true });
    })();

    // Re-fit the text if the viewport size changes while it is shown. Debounced
    // so the mobile address-bar show/hide (which fires many resize events) does
    // not cause flicker or a mid-transition tiny measurement.
    var leaderResizeTimer = null;
    function leaderScheduleRefit() {
        var fsTextOpen = ($scope.fullScreen && $scope.fullScreenText != null);
        if (!fsTextOpen && !$scope.verseMode.open) return;
        if (leaderResizeTimer) clearTimeout(leaderResizeTimer);
        leaderResizeTimer = setTimeout(function() {
            leaderResizeTimer = null;
            if ($scope.fullScreen && $scope.fullScreenText != null) fitLeaderText();
            if ($scope.verseMode.open) vmRenderCurrent();
        }, 200);
    }
    window.addEventListener('resize', leaderScheduleRefit);
    window.addEventListener('orientationchange', leaderScheduleRefit);

    $scope.clearFavorites = function(){
        if($scope.favorites.length > 0)
            $scope.confirmationDialog(window.t('leader.confirm.clearTitle'), function() {
                $http({method: "POST", url: "/ajax", data: {command: 'clear_favorites'}}).then(
                    function success() {
                        $scope.reloadFavorites();
                    },
                );
                $scope.showDialog(false);
            });
    };

    $scope.deleteFavoriteItem = function(fav_id, fav_title){
        $scope.confirmationDialog(fav_title, function(){
            $http({ method: "POST", url: "/ajax", data: {command: 'delete_favorite_item', id: fav_id } }).then(
                function success(){
                    $scope.reloadFavorites();
                },
            );
            $scope.showDialog(false);
        });
    };

    /**
     * Song full list popup
     */
    $scope.listConfig = {};
    $scope.openList = function(callback) {
        $scope.listConfig = {
            buttons: [{
                label: window.t('leader.list.select'),
                action: callback
            }]
        };
        $scope.showList(true);
    };

    $scope.showList = function(flag) {
        jQuery("#list-popup .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.toggleInlineNotes = function(song) {
        song.showInlineNotes = !song.showInlineNotes;
    };

    $scope.addSongToFavorites = function( songId ){

        $http({ method: "POST", url: "/ajax", data: {command: 'add_to_favorites', id: songId } }).then(
            function success(){
                $scope.reloadFavorites();
            },
            function error(erespond){
                console.error('leader.js Ajax error:', erespond)
            });

    };



    /**
     * Confirmation dialog
     */
    $scope.confirmationDialogConfig = {};
    $scope.confirmationDialog = function(msg, callback) {
        $scope.confirmationDialogConfig = {
            title: window.t('leader.confirm.deleteTitle'),
            message: window.t('leader.confirm.deleteMessage', { name: msg }),
            buttons: [{
                label: window.t('common.button.yes'),
                action: callback
            }]
        };
        $scope.showDialog(true);
    };

    $scope.showDialog = function(flag) {
        jQuery("#confirmation-dialog .modal").modal(flag ? 'show' : 'hide');
    };

    /**
     * Add song popup
     */
    $scope.addConfig = {};
    $scope.addSong = function(callback) {
        $scope.addConfig = {
            image: null,
            buttons: [{ label: window.t('leader.addSong.takePhoto'),
                        action: callback
                      },
                      {
                        label: window.t('leader.addSong.save'),
                        action: callback
                      }]
        };
        $scope.addSongPopup(true);
    };

    $scope.addSongPopup = function(flag) {
        jQuery("#add-song-popup .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.setList = function( listId ){
        $scope.listId = listId;
        $scope.reloadSongList();
    }

    // Name of the currently selected song collection (for button labels).
    $scope.currentListName = function() {
        for (var i = 0; i < $scope.visibleSongLists.length; i++) {
            if ($scope.visibleSongLists[i].LIST_ID == $scope.listId) {
                return $scope.visibleSongLists[i].LIST_NAME;
            }
        }
        return '';
    };


    // ==========================================================
    // WEBSOCKET
    // ==========================================================

    $scope.wsConnected = null;
    var wsDisconnectTimer = null;

    // [SECURITY] Use authenticated WebSocket connection
    window.createAuthenticatedWebSocket(
        null, // Use default /ws endpoint
        function(data) {
            // Handle incoming messages (only after authentication)
            if (data.type === 'update_needed') {
                // Don't reload favorites while in fullscreen - it removes the DOM element
                // (nor mid-drag: the reload would replace the array under the pointer)
                if (!$scope.fullScreen && !(favDrag && favDrag.isDragging())) {
                    $scope.$apply(function() {
                        $scope.reloadFavorites();
                    });
                }
                // The open song view follows the tech console: its song switch
                // and its verse choice (inside a digest: the WS callback runs
                // outside Angular).
                $scope.$applyAsync(function() { syncFromScreen(); });
            } else if (data.type === 'observer_update') {
                // Keep the toggle in sync across the group's leader sessions.
                $scope.$applyAsync(function() {
                    $scope.observer.active = !!parseInt((data.data || {}).active);
                });
            }
        },
        function(error) {
            console.error('WebSocket error:', error);
        },
        function(connected) {
            if (connected) {
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
                $scope.$applyAsync(function() { $scope.wsConnected = true; });
            } else {
                wsDisconnectTimer = setTimeout(function() {
                    wsDisconnectTimer = null;
                    $scope.$applyAsync(function() { $scope.wsConnected = false; });
                }, 5000);
            }
        }
    );

    // Listen for fullscreen changes (e.g., when user presses ESC)
    document.addEventListener('fullscreenchange', function() {
        $scope.$apply(function() {
            if (!document.fullscreenElement) {
                $scope.fullScreen = false;
                $scope.fullScreenText = null;
                fsSong = null;
                $scope.reloadFavorites();
            } else if ($scope.fullScreenText != null) {
                // Entered real fullscreen with text — re-fit to the new size.
                fitLeaderText();
            }
        });
    });

    $scope.loadSongLists();  // sets listId to first visible list, then calls reloadSongList
    SongsService.getLanguages().then(function (langs) { $scope.langList = langs; });
    $scope.reloadFavorites();
    loadObserverState();
}]);

