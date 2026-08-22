/**
 * Musician page: sheet music from the NOTES CHANNEL (current_notes +
 * notes_update) with per-collection image groups (Aug 2026).
 *
 * The server (`get_notes` with `with_groups: 1`) returns the song's groups and
 * their page images. The musician picks a group with the translucent buttons;
 * the choice is remembered per collection for the browser session
 * (sessionStorage). When the chosen group has no image for the current song,
 * the groups are tried in their order and the first one with an image is
 * shown — the selection itself stays untouched. Fullscreen shows only the
 * current image (the <img> element itself goes fullscreen); pages are flipped
 * by horizontal swipe / arrow keys, a tap toggles fullscreen as before.
 */
app.controller('Musician', ['$scope', '$http', '$timeout', function ($scope, $http, $timeout)
{
    $scope.fullScreen = false;
    $scope.imgName = '/field_small.jpg';
    $scope.placeholderImage = '/field_small.jpg';

    // "No images for this song yet" picture in the user's UI language —
    // shown when a song is on but no group holds an image for it (or the
    // listed file fails to load). Notes OFF keeps the configured placeholder.
    var NO_IMAGE_LANGS = ['ru', 'de', 'en', 'lt'];
    var uiLang = String(window.UI_LANG || 'ru').toLowerCase();
    var noImageSrc = '/no_image/' + (NO_IMAGE_LANGS.indexOf(uiLang) !== -1 ? uiLang : 'ru') + '.png';

    // Current song from the notes channel + its image groups
    $scope.notes = { image: '', listId: null, num: '', groups: [] };
    $scope.selectedGroupId = null;  // the musician's choice for the current collection
    $scope.shownGroup = null;       // group whose pages are on screen (selected or fallback)
    $scope.pages = [];              // web paths of the shown group's pages
    $scope.pageIdx = 0;
    var cacheBuster = '';
    var lastSwipeAt = 0;

    // ─── Remembered group selection (per collection, browser session) ───
    var SEL_KEY = 'musicianImageGroup';
    var sel = { byList: {}, lastName: '' };
    try {
        var stored = JSON.parse(sessionStorage.getItem(SEL_KEY));
        if (stored && typeof stored === 'object') {
            sel.byList   = stored.byList || {};
            sel.lastName = stored.lastName || '';
        }
    } catch (e) { /* private mode / disabled storage: selection lives in memory only */ }

    function saveSel() {
        try { sessionStorage.setItem(SEL_KEY, JSON.stringify(sel)); } catch (e) { /* ignore */ }
    }

    function findGroup(groups, id) {
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].id === id) return groups[i];
        }
        return null;
    }

    function firstWithImages(groups) {
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].images && groups[i].images.length) return groups[i];
        }
        return null;
    }

    // Selected group for a collection: the remembered id, else a group with
    // the same name as the last choice made in another collection (the
    // defaults "НОТЫ"/"АККОРДЫ" exist everywhere), else the first group.
    function resolveSelected(groups, listId) {
        var g = findGroup(groups, sel.byList[listId]);
        if (g) return g;
        if (sel.lastName) {
            var want = sel.lastName.toLowerCase();
            for (var i = 0; i < groups.length; i++) {
                if (String(groups[i].name).toLowerCase() === want) return groups[i];
            }
        }
        return groups.length ? groups[0] : null;
    }

    function preloadPages() {
        for (var i = 0; i < $scope.pages.length; i++) {
            if (i === $scope.pageIdx) continue;
            var im = new Image();
            im.src = $scope.pages[i] + cacheBuster;
        }
    }

    function render() {
        if (!$scope.pages.length) {
            $scope.imgName = $scope.notes.image ? noImageSrc : $scope.placeholderImage;
            return;
        }
        if ($scope.pageIdx < 0 || $scope.pageIdx >= $scope.pages.length) $scope.pageIdx = 0;
        $scope.imgName = $scope.pages[$scope.pageIdx] + cacheBuster;
        preloadPages();
    }

    function showGroup(group, keepPage) {
        var prevPages = $scope.pages;
        $scope.shownGroup = group;
        $scope.pages = (group && group.images) ? group.images.slice() : [];
        var samePages = keepPage && prevPages.length === $scope.pages.length;
        if (!samePages) $scope.pageIdx = 0;
        render();
    }

    // Apply a get_notes response. keepPage: same song re-fetched (reconnect,
    // re-upload) — stay on the current page when the page set is unchanged.
    function applyNotes(data) {
        var image  = (data && data.image) || '';
        var groups = (data && data.groups) || [];
        var listId = (data && data.list_id != null) ? String(data.list_id) : null;
        var num    = (data && data.num) || '';
        var sameSong = image && image === $scope.notes.image && listId === $scope.notes.listId;

        $scope.notes = { image: image, listId: listId, num: num, groups: groups };
        cacheBuster = '?t=' + new Date().getTime();

        if (!image) {
            // Notes off: placeholder, no buttons
            $scope.selectedGroupId = null;
            showGroup(null, false);
            return;
        }
        if (!groups.length) {
            // Server without groups (pre-migration): the main sheet only
            $scope.selectedGroupId = null;
            showGroup({ id: 0, name: '', images: [image] }, sameSong);
            return;
        }
        var selected = resolveSelected(groups, listId);
        $scope.selectedGroupId = selected ? selected.id : null;
        var shown = (selected && selected.images.length) ? selected : firstWithImages(groups);
        var sameGroup = sameSong && $scope.shownGroup && shown && $scope.shownGroup.id === shown.id;
        showGroup(shown, sameGroup);
    }

    $scope.selectGroup = function(g) {
        if (!g || $scope.notes.listId === null) return;
        sel.byList[$scope.notes.listId] = g.id;
        sel.lastName = g.name;
        saveSel();
        $scope.selectedGroupId = g.id;
        var shown = g.images.length ? g : firstWithImages($scope.notes.groups);
        showGroup(shown, false);
    };

    $scope.nextPage = function() {
        if ($scope.pages.length < 2) return;
        lastSwipeAt = new Date().getTime();
        $scope.pageIdx = ($scope.pageIdx + 1) % $scope.pages.length;
        render();
    };

    $scope.prevPage = function() {
        if ($scope.pages.length < 2) return;
        lastSwipeAt = new Date().getTime();
        $scope.pageIdx = ($scope.pageIdx - 1 + $scope.pages.length) % $scope.pages.length;
        render();
    };

    // Load placeholder image from settings
    $scope.loadPlaceholderImage = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
            function success(respond){
                if (respond.data && respond.data.placeholder_image) {
                    $scope.placeholderImage = respond.data.placeholder_image;
                } else {
                    $scope.placeholderImage = '/field_small.jpg';
                }
                if (!$scope.pages.length) $scope.imgName = $scope.placeholderImage;
            },
            function error(erespond){
                $scope.placeholderImage = '/field_small.jpg';
            }
        );
    };

    // The musician page listens to the dedicated NOTES CHANNEL only
    // (current_notes + notes_update). Screen traffic (update_needed, Bible,
    // messages, slides, videos, wallpapers) can never disturb the sheet
    // music: notes change exclusively when the leader or the technician
    // toggles a song.
    // Sequence guard: rapid song switching fires several notes_update events,
    // and the resulting get_notes responses can arrive out of order — an older
    // response must never overwrite a newer one (it would pin the previous
    // song's sheet on the screen).
    var notesFetchSeq = 0;
    $scope.checkNotes = function(){
        var seq = ++notesFetchSeq;
        $http({ method: "POST", url: "/ajax", data: {command: 'get_notes', with_groups: 1 } }).then(
            function success(respond){
                if (seq !== notesFetchSeq) return; // stale out-of-order response
                applyNotes(respond.data || {});
            }
        );
    };

    // A listed page that fails to load (file removed meanwhile, legacy server
    // without group data) falls back to the "no images" picture.
    $scope.onImageError = function() {
        var src = String($scope.imgName || '');
        if (src.indexOf(noImageSrc) === 0 || src === $scope.placeholderImage) return;
        $scope.$applyAsync(function() {
            if ($scope.imgName === src) $scope.imgName = noImageSrc;
        });
    };

    // A tap toggles fullscreen; a swipe that just flipped a page must not.
    $scope.onImageClick = function() {
        if (new Date().getTime() - lastSwipeAt < 500) return;
        $scope.toggleFullscreen();
    };

    $scope.toggleFullscreen = function() {
        var el = document.getElementById('img0');
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) {
            var req = el.requestFullscreen || el.webkitRequestFullscreen;
            if (!req) return; // iPhone Safari: no element fullscreen
            $scope.fullScreen = true;
            try {
                var p = req.call(el);
                if (p && p.catch) p.catch(function() { $scope.$applyAsync(function() { $scope.fullScreen = false; }); });
            } catch (e) {
                $scope.fullScreen = false;
            }
        } else {
            var exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
            $scope.fullScreen = false;
        }
    };

    // Keep the flag in sync when fullscreen is left with ESC / system gesture.
    function onFsChange() {
        $scope.$applyAsync(function() {
            $scope.fullScreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        });
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // Arrow keys flip pages (desktop / keyboard-equipped tablets)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            $scope.$apply($scope.nextPage);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            $scope.$apply($scope.prevPage);
        }
    });

    function initSocket() {
        // [SECURITY] Use authenticated WebSocket connection
        // URL is auto-detected (wss:// for HTTPS, ws:// for HTTP)
        window.createAuthenticatedWebSocket(
            null,
            function(data) {
                if (data.type === 'notes_update') {
                    $scope.$apply(function() {
                        $scope.checkNotes();
                    });
                }
            },
            null,
            function(connected) {
                // Refetch on reconnect to catch a notes_update missed offline.
                if (connected) {
                    $scope.$applyAsync(function() { $scope.checkNotes(); });
                }
            }
        );
    }

    $scope.loadPlaceholderImage();
    $scope.checkNotes();
    initSocket();
}]);
