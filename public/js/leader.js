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

    // Display target is set by the technician (shared, channel = 'leader') and
    // pushed here over WebSocket; this page no longer selects it locally.
    // null = "do not broadcast".
    $scope.selectedDisplayTarget   = null;

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

        // Broadcast to target display only if a target is selected
        if ($scope.selectedDisplayTarget !== null) {
            $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_image',
                            image_num: img_num,
                            list_id: list_id,
                            song_id: song_id,
                            target_group_id: $scope.selectedDisplayTarget }
            }).then(openLocal, function() {
                $scope.fullScreen = false; $scope.fullScreenText = null;
            });
        } else {
            openLocal();
        }
    }

    function leaderLeaveFullscreen() {
        var exitLocal = function() {
            if (document.fullscreenElement) { document.exitFullscreen(); }
            $scope.fullScreen = false;
            $scope.fullScreenText = null;
        };

        if ($scope.selectedDisplayTarget !== null) {
            $http({ method: "POST", url: "/ajax", data: {
                command: 'clear_image',
                target_group_id: $scope.selectedDisplayTarget
            }}).then(exitLocal, exitLocal);
        } else {
            exitLocal();
        }
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
        inner.innerHTML = '';
        inner.style.fontSize = '';
        text.split(/\r?\n/).forEach(function(line) {
            if (!line.trim().length) return;
            var div = document.createElement('div');
            div.className = 'leader-text-para';
            div.textContent = line;   // text-only: no HTML injection
            inner.appendChild(div);
        });
    }

    // Scale the text to the largest font size that fills the screen (grow until
    // it would overflow the available area, like the main display screen).
    function fitLeaderText(_retry) {
        $timeout(function() {
            var box   = document.getElementById('leaderTextFs');
            var inner = document.getElementById('leaderTextFsInner');
            if (!box || !inner) return;
            var cs    = window.getComputedStyle(box);
            var availH = box.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);
            var availW = box.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (availH <= 20 || availW <= 20) {
                // Overlay not laid out yet — retry a few times.
                if ((_retry || 0) < 10) fitLeaderText((_retry || 0) + 1);
                return;
            }
            // Grow the font to the largest size that still fits the screen in
            // both dimensions, so the lyrics fill the screen regardless of length.
            var lo = 10, hi = 1000, best = 10;
            for (var i = 0; i < 22; i++) {
                var mid = (lo + hi) / 2;
                inner.style.fontSize = mid + 'px';
                if (inner.scrollHeight <= availH && inner.scrollWidth <= availW) {
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

    // Re-fit the text if the viewport size changes while it is shown. Debounced
    // so the mobile address-bar show/hide (which fires many resize events) does
    // not cause flicker or a mid-transition tiny measurement.
    var leaderResizeTimer = null;
    window.addEventListener('resize', function() {
        if (!($scope.fullScreen && $scope.fullScreenText != null)) return;
        if (leaderResizeTimer) clearTimeout(leaderResizeTimer);
        leaderResizeTimer = setTimeout(function() {
            leaderResizeTimer = null;
            fitLeaderText();
        }, 200);
    });

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
    // DISPLAY TARGET MANAGEMENT (mirrors sermon presentation page)
    // ==========================================================

    // Load the technician-set target for the 'leader' channel on page load.
    $scope.loadDisplayTargets = function() {
        $http.post('/ajax', { command: 'get_display_targets', channel: 'leader' }).then(function(r) {
            if (r.data && r.data.status === 'ok') {
                $scope.selectedDisplayTarget =
                    (r.data.current_target != null) ? r.data.current_target : null;
            }
        });
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
            } else if (data.type === 'display_target_changed'
                       && data.data && data.data.channel === 'leader') {
                // Technician changed where the leader page broadcasts.
                $scope.$apply(function() {
                    $scope.selectedDisplayTarget =
                        (data.data.display_target != null) ? data.data.display_target : null;
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
    $scope.loadDisplayTargets();
}]);

