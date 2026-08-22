app.controller('Leader', ['$scope', '$http', 'SongsService', '$timeout', function ($scope, $http, SongsService, $timeout)
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

    // The leader's black text-fullscreen content (null = image mode / off).
    $scope.fullScreenText = null;

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
    }

    function leaderLeaveFullscreen() {
        var exitLocal = function() {
            if (document.fullscreenElement) { document.exitFullscreen(); }
            $scope.fullScreen = false;
            $scope.fullScreenText = null;
        };

        // Same as above: the server decides whether any screen is cleared.
        $http({ method: "POST", url: "/ajax", data: {
            command: 'clear_image',
            channel: 'leader'
        }}).then(exitLocal, exitLocal);
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
        activeIdx: null   // verse currently on screen (null = off)
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
        var chip = (vm.activeIdx !== null) ? vmChipByIdx(vm.activeIdx) : null;
        el.textContent = chip ? vmCleanMarkers(chip.text) : '';
        vmFitText();
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

    // Broadcast one verse through the leader channel. The server resolves
    // the technician-set target (NULL = do not broadcast).
    function vmSend(chip) {
        var vm = $scope.verseMode;
        vm.activeIdx = chip.idx;
        vmRenderCurrent();
        $http({ method: "POST", url: "/ajax",
                data: { command: 'set_leader_text',
                        channel: 'leader',
                        image_name: vm.song.imageName,
                        text: chip.text,
                        song_name: vm.song.NAME || '',
                        chapter_indices: String(chip.idx) } });
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
        vm.activeIdx = null;
        vmRenderCurrent();
        $http({ method: "POST", url: "/ajax",
                data: { command: 'set_leader_text',
                        channel: 'leader',
                        image_name: vm.song ? vm.song.imageName : '',
                        text: '',
                        song_name: '',
                        chapter_indices: '' } });
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
    };

    // Close = the leader's song toggle-off: notes off, screen cleared
    // server-side (playing media survives; NULL target = screens untouched).
    $scope.vmClose = function() {
        $scope.verseMode.open = false;
        $scope.verseMode.activeIdx = null;
        if (document.fullscreenElement) { document.exitFullscreen(); }
        $http({ method: "POST", url: "/ajax",
                data: { command: 'clear_image', channel: 'leader' } });
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
        }
    };

    $scope.vmToggleVerse = function(chip) {
        if ($scope.verseMode.activeIdx === chip.idx) {
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
                if (!$scope.fullScreen) {
                    $scope.$apply(function() {
                        $scope.reloadFavorites();
                    });
                }
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
}]);

