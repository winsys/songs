/**
 * Musician page: sheet music from the NOTES CHANNEL (current_notes +
 * notes_update) with per-collection image groups ("types", Aug 2026).
 *
 * The server (`get_notes` with `with_groups: 1`) returns the song's groups,
 * each with at most one image. The musician picks a group with the large
 * translucent buttons at the top of the screen; the choice is remembered per
 * collection for the browser session (sessionStorage). When the chosen group
 * has no image for the current song, the groups are tried in their order and
 * the first one with an image is shown — the selection itself stays
 * untouched. A song without any image shows the "no images yet" picture in
 * the user's UI language. Fullscreen shows only the image (the <img> element
 * itself goes fullscreen); a tap toggles it, as before.
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
    $scope.shownGroup = null;       // group whose image is on screen (selected or fallback)
    var cacheBuster = '';

    // ─── Remembered group selection (per collection, browser session) ───
    var SEL_KEY = 'musicianImageGroup';
    var sel = { byList: {}, lastName: '', lastOrig: '' };
    try {
        var stored = JSON.parse(sessionStorage.getItem(SEL_KEY));
        if (stored && typeof stored === 'object') {
            sel.byList   = stored.byList || {};
            sel.lastName = stored.lastName || '';
            sel.lastOrig = stored.lastOrig || '';
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

    function firstWithImage(groups) {
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].image) return groups[i];
        }
        return null;
    }

    // Selected group for a collection: the remembered id, else a group with
    // the same name as the last choice made in another collection (the
    // defaults "НОТЫ"/"АККОРДЫ" exist everywhere; matched by the translated
    // AND the original name), else the first group.
    function resolveSelected(groups, listId) {
        var g = findGroup(groups, sel.byList[listId]);
        if (g) return g;
        var wanted = [sel.lastName, sel.lastOrig].filter(Boolean).map(function(s) { return String(s).toLowerCase(); });
        if (wanted.length) {
            for (var i = 0; i < groups.length; i++) {
                var n = String(groups[i].name || '').toLowerCase();
                var o = String(groups[i].orig || '').toLowerCase();
                if (wanted.indexOf(n) !== -1 || (o && wanted.indexOf(o) !== -1)) return groups[i];
            }
        }
        return groups.length ? groups[0] : null;
    }

    // Warm the cache for the other groups' images so switching is instant.
    function preloadOthers() {
        var groups = $scope.notes.groups || [];
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].image && groups[i] !== $scope.shownGroup) {
                var im = new Image();
                im.src = groups[i].image + cacheBuster;
            }
        }
    }

    function render() {
        var shown = $scope.shownGroup;
        if (shown && shown.image) {
            $scope.imgName = shown.image + cacheBuster;
            preloadOthers();
            return;
        }
        $scope.imgName = $scope.notes.image ? noImageSrc : $scope.placeholderImage;
    }

    // Apply a get_notes response.
    function applyNotes(data) {
        var image  = (data && data.image) || '';
        var groups = (data && data.groups) || [];
        var listId = (data && data.list_id != null) ? String(data.list_id) : null;
        var num    = (data && data.num) || '';

        $scope.notes = { image: image, listId: listId, num: num, groups: groups };
        cacheBuster = '?t=' + new Date().getTime();

        if (!image) {
            // Notes off: placeholder, no buttons
            $scope.selectedGroupId = null;
            $scope.shownGroup = null;
            render();
            return;
        }
        if (!groups.length) {
            // Server without groups (pre-migration): the main sheet only
            $scope.selectedGroupId = null;
            $scope.shownGroup = { id: 0, name: '', image: image };
            render();
            return;
        }
        var selected = resolveSelected(groups, listId);
        $scope.selectedGroupId = selected ? selected.id : null;
        $scope.shownGroup = (selected && selected.image) ? selected : firstWithImage(groups);
        render();
    }

    $scope.selectGroup = function(g) {
        if (!g || $scope.notes.listId === null) return;
        sel.byList[$scope.notes.listId] = g.id;
        sel.lastName = g.name;
        sel.lastOrig = g.orig || '';
        saveSel();
        $scope.selectedGroupId = g.id;
        $scope.shownGroup = g.image ? g : firstWithImage($scope.notes.groups);
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
                if (!$scope.notes.image) render();
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

    // A listed image that fails to load (file removed meanwhile, legacy
    // server without group data) falls back to the "no images" picture.
    $scope.onImageError = function() {
        var src = String($scope.imgName || '');
        if (src.indexOf(noImageSrc) === 0 || src === $scope.placeholderImage) return;
        $scope.$applyAsync(function() {
            if ($scope.imgName === src) $scope.imgName = noImageSrc;
        });
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
