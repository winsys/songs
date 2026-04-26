app.controller('Tech', function ($scope, $http, $timeout, $interval, $sce, SongsService)
{
    // ── "Songs" mode state ─────────────────────────────────────
    $scope.listId = 1;
    $scope.songList = [];
    $scope.searchSongList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.preparedChapters = [];
    $scope.showingSong = null;
    $scope.showingChapter = null;
    $scope.selectedChapters = [];
    $scope.visibleSongLists = [];
    $scope.songPreview = { visible: false, song: null, imgError: false };

    // ── Bible mode state ──────────────────────────────────────
    $scope.bibleTranslations    = [];
    $scope.bibleTranslationId   = null;
    $scope.bibleBooks           = [];
    $scope.selectedBibleBook    = null;
    $scope.bibleChapters        = [];
    $scope.selectedBibleChapter = null;
    $scope.bibleVerses          = [];   // raw from server
    $scope.biblePreparedVerses  = [];   // formatted for display
    $scope.selectedBibleVerses  = [];
    $scope.showingBibleVerse    = null;
    $scope.bibleVerseCount      = 1;
    $scope.bibleSearchQuery     = '';
    $scope.bibleSearchResults   = [];
    $scope.bibleSearchQuery     = '';
    var bibleSearchTimer        = null;

    // ── Messages mode state ───────────────────────────────────
    $scope.messageTitleQuery    = '';
    $scope.messageTextQuery     = '';
    $scope.messageSearchResults = [];
    $scope.selectedMessage      = null;
    $scope.messageParagraphs    = [];
    $scope.showingMessagePara   = null;
    var messageSearchTimer      = null;

    // ── Messages audio ────────────────────────────────────────
    $scope.msgAudioPlaying  = false;
    $scope.msgAudioLoaded   = false;
    $scope.msgCalibrating   = false;   // calibration mode
    $scope.msgTimecodes     = [];      // array of seconds (floats)
    $scope.msgCurrentTime   = 0;      // current audio position (seconds) for display
    var msgAudio            = null;    // HTMLAudioElement (lazy init)
    var msgTimerInterval    = null;    // $interval handle for timer display

    function parseMsgTimecodes(raw) {
        if (!raw) return [];
        return raw.split(/\r?\n/).map(function(tc) {
            tc = tc.trim();
            if (!tc) return null;
            var parts = tc.split(':').map(Number);
            var s;
            if (parts.length === 3) s = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) s = parts[0] * 60 + parts[1];
            else s = parts[0];
            return isNaN(s) ? null : s;
        }).filter(function(v) { return v !== null; });
    }

    $scope.formatMsgTimecode = function(secs) {
        if (secs === undefined || secs === null) return '';
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var s = Math.floor(secs % 60);
        if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        return m + ':' + (s < 10 ? '0' : '') + s;
    };

    // ── Tech Media state ──────────────────────────────────────
    $scope.showMediaAddPanel  = false;   // media add panel
    $scope.mediaUrlInput      = '';      // URL input field
    $scope.mediaUrlType       = 'video'; // 'image' | 'video'
    $scope.mediaUrlName       = '';      // name for URL link
    $scope.uploadingImage     = false;   // image upload flag
    $scope.uploadingVideo     = false;   // video upload flag

    // ── Standard Wallpapers state ─────────────────────────────
    $scope.showWallpapersPanel = false;  // standard wallpapers panel
    $scope.standardWallpapers  = []; // standard wallpapers list
    $scope.isAdmin             = false;  // whether user is an administrator

    // ── Active media item (video controls) ────────────────────
    $scope.activeMediaItem    = null;    // { FID, itemType, name, src }
    $scope.techVideoPlaying   = false;
    var techVideoSrc          = '';

    // ── Access Request state ──────────────────────────────────
    $scope.currentAccessRequest = null;  // Currently shown access request
    var accessRequestQueue = [];         // Queue of pending requests

    // ── Page mode ─────────────────────────────────────────────
    $scope.pageMode = 'songs';  // 'songs' | 'bible' | 'messages'

    // ── Language selection ────────────────────────────────────
    $scope.languages = {};   // populated dynamically from get_languages
    $scope.langList  = [];   // [{code, label, col_suffix, is_default}, ...]

    // ==========================================================
    // MODE SWITCHING
    // ==========================================================

    $scope.songMode = function() {
        $scope.pageMode = 'songs';
    };

    $scope.bibleMode = function() {
        $scope.pageMode = 'bible';
        if ($scope.bibleTranslations.length === 0) {
            $scope.loadBibleTranslations();
        }
    };

    $scope.messagesMode = function() {
        $scope.pageMode = 'messages';
    };

    // ==========================================================
    // LANGUAGE TOGGLE (shared between modes)
    // ==========================================================

    $scope.toggleLanguage = function(lang) {
        // Find the language object in langList
        var langObj = null;
        for (var i = 0; i < $scope.langList.length; i++) {
            if ($scope.langList[i].code === lang) { langObj = $scope.langList[i]; break; }
        }

        // If language is not available in this context — do not enable
        if (!$scope.languages[lang] && langObj && !$scope.isLangAvailable(langObj)) return;

        $scope.languages[lang] = !$scope.languages[lang];

        // At least one language must be enabled.
        // Fallback — language with is_default=1, otherwise first in list.
        var anyActive = false;
        for (var k in $scope.languages) {
            if ($scope.languages[k]) { anyActive = true; break; }
        }
        if (!anyActive) {
            var fallback = null;
            for (var i = 0; i < $scope.langList.length; i++) {
                if ($scope.langList[i].is_default == '1') { fallback = $scope.langList[i].code; break; }
            }
            if (!fallback && $scope.langList.length > 0) fallback = $scope.langList[0].code;
            if (fallback) $scope.languages[fallback] = true;
        }

        // Update display (these lines remain unchanged)
        if ($scope.pageMode === 'songs' && $scope.showingSong) {
            splitText($scope.showingSong);
        }
        if ($scope.pageMode === 'bible' && $scope.bibleVerses.length > 0) {
            $scope.biblePreparedVerses = prepareBibleVerses($scope.bibleVerses);
        }
        if ($scope.pageMode === 'messages' && $scope.showingMessage) {
            prepareMessageText($scope.showingMessage);
        }
    };

    // ── Helpers for dynamic languages ───────────────────────

    /** Returns languages from langList that are currently enabled. */
    function getActiveLangs() {
        return $scope.langList.filter(function(l) {
            return $scope.languages[l.code];
        });
    }

    /**
     * Checks if data exists for the language in the current context.
     * Used for ng-disabled on language buttons.
     *
     * Rules:
     *   songs   — if a song is selected: does its column have text?
     *             if not selected: all available (nothing to restrict)
     *   bible   — if verses are loaded: does at least one have text?
     *             if not: all available
     *   messages — if a message is selected (with full data): does it have text?
     *              if not: all available
     *
     * @param  {Object} lang  — element from langList {code, col_suffix, ...}
     * @return {boolean}      true = button active, false = disabled
     */
    $scope.isLangAvailable = function(lang) {
        var field = 'TEXT' + lang.col_suffix;   // 'TEXT', 'TEXT_LT', 'TEXT_DE'...

        if ($scope.pageMode === 'songs') {
            if (!$scope.showingSong) return true;
            return !!($scope.showingSong[field] && $scope.showingSong[field].trim());
        }

        if ($scope.pageMode === 'bible') {
            if (!$scope.bibleVerses || $scope.bibleVerses.length === 0) return true;
            // One verse with data is enough
            for (var i = 0; i < $scope.bibleVerses.length; i++) {
                if ($scope.bibleVerses[i][field]) return true;
            }
            return false;
        }

        if ($scope.pageMode === 'messages') {
            // No message selected — do not block anything
            if (!$scope.selectedMessage) return true;

            // If selectedMessage has not yet been updated with full data
            // (no TEXT* fields yet) — do not block
            var hasAnyTextField = false;
            for (var fi = 0; fi < $scope.langList.length; fi++) {
                var f = 'TEXT' + $scope.langList[fi].col_suffix;
                if (f in $scope.selectedMessage) { hasAnyTextField = true; break; }
            }
            if (!hasAnyTextField) return true;

            // Full data is loaded — check the specific field
            var val = $scope.selectedMessage[field];
            return !!(val && val.trim());
        }

        return true;   // unknown mode — do not block
    };


    /**
     * Text column name for language: '' → 'TEXT', '_LT' → 'TEXT_LT'.
     * Works for song_list (TEXT / TEXT_LT / TEXT_EN / TEXT_DE…)
     * and for bible_verses (same names).
     */
    function textCol(lang) {
        return 'TEXT' + lang.col_suffix;
    }

    /**
     * Name column for language: '' → 'NAME', '_LT' → 'NAME_LT'.
     * Used for bible_books.
     */
    function nameCol(lang) {
        return 'NAME' + lang.col_suffix;
    }

    function loadLanguages() {
        SongsService.getLanguages().then(
            function (list) {
                $scope.langList = list;

                // Find default language
                var defaultCode = null;
                for (var i = 0; i < list.length; i++) {
                    if (list[i].is_default == '1') { defaultCode = list[i].code; break; }
                }
                if (!defaultCode && list.length > 0) defaultCode = list[0].code;

                // Initialize $scope.languages:
                //   - default language enabled,
                //   - others disabled,
                //   - existing values preserved (on reload).
                var newLangs = {};
                for (var j = 0; j < list.length; j++) {
                    var code = list[j].code;
                    // Preserve existing value; otherwise enable only the default
                    if (code in $scope.languages) {
                        newLangs[code] = $scope.languages[code];
                    } else {
                        newLangs[code] = (code === defaultCode);
                    }
                }
                $scope.languages = newLangs;
            },
            function () {
                console.error('tech.js: failed to load language list');
            }
        );
    }


    // ==========================================================
    // SONGS MODE — load helpers
    // ==========================================================

    $scope.loadSongLists = function () {
        SongsService.getVisibleSongLists().then(function (lists) {
            $scope.visibleSongLists = lists;
            if (lists.length > 0) {
                $scope.listId = lists[0].LIST_ID;  // $watch triggers reloadSongList if changed
            }
            $scope.loadSearchSongs(lists);
        }, function () {
            console.error('tech.js: failed to load song lists');
        });
    };

    $scope.loadSearchSongs = function (lists) {
        var ids = lists.map(function (l) { return l.LIST_ID; });
        SongsService.getSongsForSearch(ids).then(function (songs) {
            angular.forEach(songs, function (song) {
                var langs = [];
                angular.forEach($scope.langList, function (lang) {
                    if (song['hasText_' + lang.code] === '1') {
                        langs.push(lang.label);
                    }
                });
                var bookPart = song.bookName ? song.bookName : '';
                var langPart = langs.length ? langs.join(' · ') : '';
                song.langInfo = bookPart + (bookPart && langPart ? '  ·  ' : '') + langPart;
            });
            $scope.searchSongList = songs;
        });
    };

    /**
     * Builds $scope.preparedChapters for the selected song.
     * Iterates active languages from langList — no hard-coding.
     *
     * @param {Object} song  — object from favorites (contains TEXT, TEXT_LT, TEXT_DE…)
     */
    function splitText(song) {
        $scope.preparedChapters = [];
        if (!song) return;

        // Default language defines the verse "skeleton" (count and order).
        var defaultLang = null;
        for (var i = 0; i < $scope.langList.length; i++) {
            if ($scope.langList[i].is_default == '1') { defaultLang = $scope.langList[i]; break; }
        }
        if (!defaultLang && $scope.langList.length > 0) defaultLang = $scope.langList[0];
        if (!defaultLang) return;

        var baseField  = textCol(defaultLang);
        var baseText   = song[baseField] || '';
        if (!baseText) {
            // Fallback: try first active language with non-empty text
            var activeLangs = getActiveLangs();
            for (var j = 0; j < activeLangs.length; j++) {
                var t = song[textCol(activeLangs[j])];
                if (t) { baseText = t; defaultLang = activeLangs[j]; baseField = textCol(activeLangs[j]); break; }
            }
        }
        if (!baseText) return;

        var baseVerses = baseText.split('\r\n');

        baseVerses.forEach(function(baseVerse, idx) {
            if (!baseVerse.trim()) return;

            var parts = [];
            getActiveLangs().forEach(function(lang) {
                var field  = textCol(lang);
                var verses = song[field] ? song[field].split('\r\n') : [];
                var v = verses[idx];
                if (v && v.trim()) parts.push(v);
            });

            if (parts.length === 0) return;

            var combined = parts.join('\r\n- - - - - - - -\r\n');
            $scope.preparedChapters.push(combined + '\n(' + idx + ')');
        });
    }


    $scope.reloadFavorites = function (callback) {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_favorites_with_text' }}).then(
            function success(respond) {
                $scope.favorites = respond.data;

                // Restore showingSong state after reload
                angular.forEach($scope.favorites, function (item) {
                    if (item.itemType === 'song' &&
                        $scope.showingSong && item.FID === $scope.showingSong.FID) {
                        $scope.showingSong = item;
                    }
                    // Restore activeMediaItem for images and videos
                    if ((item.itemType === 'image' || item.itemType === 'video') &&
                        $scope.activeMediaItem && item.FID === $scope.activeMediaItem.FID) {
                        $scope.activeMediaItem = item;
                    }
                });

                // Call callback after favorites are loaded (for state restoration)
                if (callback) callback();
            },
            function error(e) { console.log('reloadFavorites error:', e); }
        );
    };

    $scope.prepareText = function(aText, favoriteItem) {
        if( $scope.showingSong === favoriteItem ){
            $scope.showingSong = null;
            $scope.preparedChapters = [];
            $scope.showingChapter = null;
            $scope.selectedChapters = [];
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'clear_image' }
            });
        } else {
            $scope.showingSong = favoriteItem;
            splitText(favoriteItem);
            $scope.showingChapter = null;
            $scope.selectedChapters = [];
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_tech_image',
                    image_name: $scope.showingSong.imageName }
            });
        }
    };

    $scope.toggleCurrentTextChapter = function(chapterText, $event) {
        var ctrlKey = $event.ctrlKey || $event.metaKey;

        if (ctrlKey) {
            var index = $scope.selectedChapters.indexOf(chapterText);
            if (index > -1) {
                $scope.selectedChapters.splice(index, 1);
            } else {
                $scope.selectedChapters.push(chapterText);
            }

            if ($scope.selectedChapters.length === 0) {
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: '',
                        song_name: '' }
                }).then(function success(){
                    $scope.showingChapter = null;
                });
            } else {
                var verseIndices = $scope.selectedChapters.map(function(chapter) {
                    var match = chapter.match(/\n\((\d+)\)$/);
                    return match ? parseInt(match[1]) : -1;
                }).filter(function(idx) { return idx >= 0; });

                var languageParts = [];
                getActiveLangs().forEach(function(lang) {
                    var field    = textCol(lang);
                    var chapters = $scope.showingSong[field] ? $scope.showingSong[field].split('\r\n') : [];
                    var verses   = verseIndices
                        .map(function(idx) { return chapters[idx]; })
                        .filter(function(v) { return v; });
                    if (verses.length > 0) languageParts.push(verses.join('\r\n'));
                });

                var combinedText = languageParts.join('\r\n- - - - - - - -\r\n');
                // Save verse indices to chapter_indices field
                var chapterIndices = verseIndices.join(',');

                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: combinedText,
                        song_name: $scope.showingSong.NAME,
                        chapter_indices: chapterIndices }
                }).then(function success(){
                    $scope.showingChapter = combinedText;
                });
            }
        } else {
            $scope.selectedChapters = [];
            if ( $scope.showingChapter === chapterText ) {
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        song_name: '',
                        text: '' }
                }).then(function success(){
                    $scope.showingChapter = null;
                });
            } else {
                $scope.selectedChapters = [chapterText];
                var cleanText = chapterText.replace(/\n\(\d+\)$/, '');
                // Extract chapter index for chapter_indices field
                var match = chapterText.match(/\n\((\d+)\)$/);
                var chapterIndex = match ? match[1] : '';
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: cleanText,
                        song_name: $scope.showingSong.NAME,
                        chapter_indices: chapterIndex }
                }).then(function success(){
                    $scope.showingChapter = chapterText;
                });
            }
        }
    };

    $scope.reloadSongList = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_song_list', list_id: $scope.listId } }).then(
            function success(respond){
                $scope.songList = respond.data;
                angular.forEach($scope.songList, function(song) {
                    var langs = [];
                    angular.forEach($scope.langList, function(lang) {
                        if (song['hasText_' + lang.code] === '1') {
                            langs.push(lang.label);
                        }
                    });
                    var bookPart = song.bookName ? song.bookName : '';
                    var langPart = langs.length ? langs.join(' · ') : '—';
                    song.langInfo = bookPart + (bookPart && langPart ? '  ·  ' : '') + langPart;
                });
            },
            function error(erespond){
                console.log('Ajax call error: ', erespond);
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
                    console.log('Ajax call error: ', erespond);
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
                console.log('Ajax call error: ', erespond);
            });
    };

    $scope.clearFavorites = function(){
        if($scope.favorites.length > 0)
            $scope.confirmationDialog(window.t('leader.confirm.clearTitle'), function() {
                $http({method: "POST", url: "/ajax", data: {command: 'clear_favorites'}}).then(
                    function success() {
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' } });
                        $scope.preparedChapters = [];
                        $scope.reloadFavorites();
                    }
                );
                $scope.showDialog(false);
            });
    };

    // ─────────────────────────────────────────────────────────
    // Open/close the media add panel
    // ─────────────────────────────────────────────────────────

    $scope.toggleMediaAddPanel = function () {
        $scope.showMediaAddPanel = !$scope.showMediaAddPanel;
        if ($scope.showMediaAddPanel) {
            $scope.mediaUrlInput = '';
            $scope.mediaUrlName  = '';
            $scope.mediaUrlType  = 'video';
            $scope.showWallpapersPanel = false; // close wallpapers panel
        }
    };

    // ─────────────────────────────────────────────────────────
    // Open/close the standard wallpapers panel
    // ─────────────────────────────────────────────────────────

    $scope.toggleWallpapersPanel = function () {
        $scope.showWallpapersPanel = !$scope.showWallpapersPanel;
        if ($scope.showWallpapersPanel) {
            $scope.showMediaAddPanel = false; // close media add panel
            $scope.loadStandardWallpapers();
        }
    };

    // ─────────────────────────────────────────────────────────
    // Load standard wallpapers list
    // ─────────────────────────────────────────────────────────

    $scope.loadStandardWallpapers = function () {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_standard_wallpapers' }}).then(
            function (r) {
                if (r.data && r.data.status === 'success') {
                    $scope.standardWallpapers = r.data.wallpapers || [];
                    $scope.isAdmin = r.data.is_admin || false;
                }
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Add image to standard wallpapers
    // ─────────────────────────────────────────────────────────

    $scope.addToWallpapers = function (item) {
        var confirmMsg = window.t('tech.confirm.addToWallpapers', { name: item.NAME || item.dispName });
        if (!confirm(confirmMsg)) return;

        $http({ method: "POST", url: "/ajax", data: {
                command: 'add_to_wallpapers',
                name: item.NAME || item.dispName,
                src: item.src
            }}).then(
            function (r) {
                if (r.data && r.data.status === 'success') {
                    alert(window.t('tech.confirm.addedToWallpapers'));
                } else {
                    alert(window.t('sermon.errorPrefix', { message: r.data && r.data.message ? r.data.message : window.t('common.unknownError') }));
                }
            },
            function (e) {
                alert('HTTP error: ' + e.status);
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Add wallpaper from list to favorites
    // ─────────────────────────────────────────────────────────

    $scope.addWallpaperToFavorites = function (wallpaper) {
        $http({ method: "POST", url: "/ajax", data: {
                command: 'add_media_to_favorites',
                name: wallpaper.name,
                src: wallpaper.src,
                media_type: 'image'
            }}).then(
            function () {
                $scope.showWallpapersPanel = false;
                $scope.reloadFavorites();
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Remove wallpaper from standard list (admin only)
    // ─────────────────────────────────────────────────────────

    $scope.deleteWallpaper = function (id, name) {
        var confirmMsg = window.t('tech.confirm.removeWallpaper', { name: name });
        if (!confirm(confirmMsg)) return;

        $http({ method: "POST", url: "/ajax", data: {
                command: 'delete_wallpaper',
                id: id
            }}).then(
            function (r) {
                if (r.data && r.data.status === 'success') {
                    $scope.loadStandardWallpapers();
                } else {
                    alert(window.t('sermon.errorPrefix', { message: r.data && r.data.message ? r.data.message : window.t('common.unknownError') }));
                }
            },
            function (e) {
                alert('HTTP error: ' + e.status);
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Determine media type by URL
    // ─────────────────────────────────────────────────────────

    function _detectMediaType(url) {
        if (/(?:youtube\.com|youtu\.be)/.test(url)) return 'video';
        if (/\.(mp4|webm|ogg|mov|avi)$/i.test(url)) return 'video';
        return 'image';
    }

    function _ytId(url) {
        var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
        return m ? m[1] : null;
    }

    // ─────────────────────────────────────────────────────────
    // Add media by URL
    // ─────────────────────────────────────────────────────────

    $scope.addMediaUrl = function () {
        var url  = ($scope.mediaUrlInput || '').trim();
        if (!url) return;

        var type = _detectMediaType(url);
        var name = ($scope.mediaUrlName || '').trim();

        if (!name) {
            var ytId = _ytId(url);
            if (ytId) {
                name = 'YouTube · ' + ytId;
            } else {
                var parts = url.split('/');
                name = parts[parts.length - 1] || url;
                if (name.length > 60) name = name.substring(0, 60) + '…';
            }
        }

        $http({ method: "POST", url: "/ajax", data: {
                command:    'add_media_to_favorites',
                name:       name,
                src:        url,
                media_type: type
            }}).then(
            function () {
                $scope.mediaUrlInput     = '';
                $scope.mediaUrlName      = '';
                $scope.showMediaAddPanel = false;
                $scope.reloadFavorites();
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Upload image → add to playlist
    // ─────────────────────────────────────────────────────────

    $scope.triggerMediaImageUpload = function () {
        document.getElementById('techMediaImageInput').click();
    };

    $scope.onMediaImageSelected = function (input) {
        if (!input.files || !input.files[0]) return;

        // Prompt for image name
        var mediaName = prompt(window.t('tech.prompt.imageName'));
        if (mediaName === null) {
            input.value = '';
            return; // user cancelled
        }
        mediaName = mediaName.trim();
        if (!mediaName) {
            mediaName = input.files[0].name; // use filename as default
        }

        $scope.uploadingImage = true;
        var formData = new FormData();
        formData.append('file',    input.files[0]);
        formData.append('command', 'upload_media_image');
        formData.append('name',    mediaName);
        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.uploadingImage = false;
                if (r.data && r.data.status === 'success') {
                    $scope.showMediaAddPanel = false;
                    $scope.reloadFavorites();
                } else {
                    alert(window.t('sermon.errorPrefix', { message: r.data && r.data.message ? r.data.message : '' }));
                }
                input.value = '';
            },
            function (e) {
                $scope.uploadingImage = false;
                alert('HTTP error: ' + e.status);
                input.value = '';
            }
        );
    };


    // ─────────────────────────────────────────────────────────
    // Upload video → add to playlist
    // ─────────────────────────────────────────────────────────

    $scope.triggerMediaVideoUpload = function () {
        document.getElementById('techMediaVideoInput').click();
    };

    $scope.onMediaVideoSelected = function (input) {
        if (!input.files || !input.files[0]) return;
        // Prompt for video name
        var mediaName = prompt(window.t('tech.prompt.videoName'));
        if (mediaName === null) {
            input.value = '';
            return; // user cancelled
        }
        mediaName = mediaName.trim();
        if (!mediaName) {
            mediaName = input.files[0].name; // use filename as default
        }
        $scope.uploadingVideo = true;
        var formData = new FormData();
        formData.append('file',    input.files[0]);
        formData.append('command', 'upload_media_video');
        formData.append('name',    mediaName);
        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.uploadingVideo = false;
                if (r.data && r.data.status === 'success') {
                    $scope.showMediaAddPanel = false;
                    $scope.reloadFavorites();
                } else {
                    alert(window.t('sermon.errorPrefix', { message: r.data && r.data.message ? r.data.message : '' }));
                }
                input.value = '';
            },
            function (e) {
                $scope.uploadingVideo = false;
                alert('HTTP error: ' + e.status);
                input.value = '';
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Click on a media item in the playlist
    // ─────────────────────────────────────────────────────────

    $scope.activateMediaItem = function (item) {
        // Repeated click = deactivation
        if ($scope.activeMediaItem && $scope.activeMediaItem.FID === item.FID) {
            // Clear active item
            $scope.activeMediaItem  = null;
            $scope.techVideoPlaying = false;

            // Clear image on display
            $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' }});
            return;
        }

         // Deselect song
        $scope.showingSong      = null;
        $scope.preparedChapters = [];
        $scope.showingChapter   = null;
        $scope.selectedChapters = [];

        $scope.activeMediaItem = item;

        if (item.itemType === 'image') {
            // Image → set_tech_image
            $scope.techVideoPlaying = false;
            $http({ method: "POST", url: "/ajax", data: {
                    command:    'set_tech_image',
                    image_name: item.src
                }});
        } else {
            // Video → set_video
            $scope.techVideoPlaying = true;
            techVideoSrc = item.src;
            $http({ method: "POST", url: "/ajax", data: {
                    command:     'set_video',
                    video_src:   item.src,
                    video_state: 'playing'
                }});
        }
    };

    // ─────────────────────────────────────────────────────────
    // Video control in tech mode
    // ─────────────────────────────────────────────────────────

    $scope.techToggleVideo = function () {
        if ($scope.techVideoPlaying) {
            $scope.techVideoPlaying = false;
            $http({ method: "POST", url: "/ajax", data: { command: 'video_control', video_state: 'paused' }});
        } else {
            $scope.techVideoPlaying = true;
            $http({ method: "POST", url: "/ajax", data: { command: 'video_control', video_state: 'playing' }});
        }
    };

    $scope.techStopVideo = function () {
        $scope.activeMediaItem  = null;
        $scope.techVideoPlaying = false;
        techVideoSrc = '';
        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' }});
    };

    $scope.deleteFavoriteItem = function (fav_id, fav_title, itemType) {
        $scope.confirmationDialog(fav_title || '?', function () {

            var isMedia  = (itemType === 'image' || itemType === 'video');
            var command  = isMedia ? 'delete_media_favorite' : 'delete_favorite_item';

            // If deleting active item — clear display
            var isDeletingActive = $scope.showingSong && $scope.showingSong.FID === fav_id &&
                (!isMedia);
            var isDeletingActiveMedia = $scope.activeMediaItem &&
                $scope.activeMediaItem.FID === fav_id && isMedia;

            $http({ method: "POST", url: "/ajax", data: { command: command, id: fav_id }}).then(
                function success() {
                    if (isDeletingActive) {
                        $scope.showingSong       = null;
                        $scope.preparedChapters  = [];
                        $scope.showingChapter    = null;
                        $scope.selectedChapters  = [];
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' }});
                    }
                    if (isDeletingActiveMedia) {
                        $scope.activeMediaItem = null;
                        $scope.techVideoPlaying = false;
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' }});
                    }
                    $scope.reloadFavorites();
                }
            );
            $scope.showDialog(false);
        });
    };

    $scope.setList = function( listId ){
        $scope.listId = listId;
        $scope.reloadSongList();
    };

    $scope.$watch('listId', function(newVal, oldVal) {
        if (newVal !== oldVal) $scope.reloadSongList();
    });


    // ==========================================================
    // BIBLE MODE — load helpers
    // ==========================================================

    $scope.loadBibleTranslations = function() {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_translations' } }).then(
            function success(respond) {
                $scope.bibleTranslations = respond.data;
                // Auto-select first translation if none selected
                if ($scope.bibleTranslations.length > 0 && !$scope.bibleTranslationId) {
                    $scope.setBibleTranslation($scope.bibleTranslations[0].ID);
                }
            },
            function error(erespond) {
                console.log('Ajax call error: ', erespond);
            });
    };

    $scope.setBibleTranslation = function(translationId) {
        // Save current position so we can restore it after the translation changes
        var prevBookNum   = $scope.selectedBibleBook ? parseInt($scope.selectedBibleBook.BOOK_NUM) : null;
        var prevChapter   = $scope.selectedBibleChapter;
        var prevVerseNums = [];
        if ($scope.selectedBibleVerses.length > 0 && $scope.bibleVerses.length > 0) {
            angular.forEach($scope.selectedBibleVerses, function(verseStr) {
                var m = verseStr.match(/\n\((\d+)\)$/);
                if (m) {
                    var idx = parseInt(m[1]);
                    if ($scope.bibleVerses[idx]) {
                        prevVerseNums.push(parseInt($scope.bibleVerses[idx].VERSE_NUM));
                    }
                }
            });
        }

        $scope.bibleTranslationId   = translationId;
        $scope.bibleBooks           = [];
        $scope.selectedBibleBook    = null;
        $scope.bibleChapters        = [];
        $scope.selectedBibleChapter = null;
        $scope.bibleVerses          = [];
        $scope.biblePreparedVerses  = [];
        $scope.selectedBibleVerses  = [];
        $scope.bibleSearchResults   = [];

        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_books', translation_id: translationId } }).then(
            function(respond) {
                $scope.bibleBooks = respond.data;

                if (!prevBookNum) return null;

                // Find the same book by BOOK_NUM (canonical across all translations)
                var matchBook = null;
                angular.forEach($scope.bibleBooks, function(b) {
                    if (parseInt(b.BOOK_NUM) === prevBookNum) matchBook = b;
                });
                if (!matchBook) return null;

                $scope.selectedBibleBook = matchBook;
                return $http({ method: "POST", url: "/ajax",
                    data: { command: 'get_bible_chapters', book_id: matchBook.ID }
                });
            },
            function(erespond) { console.log('Ajax call error: ', erespond); }
        ).then(function(resp) {
            if (!resp) { scrollBiblePanels(); return null; }
            $scope.bibleChapters = resp.data;

            if (!prevChapter) { scrollBiblePanels(); return null; }

            // Check that the chapter exists in the new translation
            var chapterExists = false;
            angular.forEach($scope.bibleChapters, function(c) {
                if (c === prevChapter) chapterExists = true;
            });
            if (!chapterExists) { scrollBiblePanels(); return null; }

            $scope.selectedBibleChapter = prevChapter;
            return $http({ method: "POST", url: "/ajax",
                data: { command: 'get_bible_verses',
                    book_id: $scope.selectedBibleBook.ID,
                    chapter_num: prevChapter }
            });
        }).then(function(resp) {
            if (!resp) return;
            $scope.bibleVerses         = resp.data;
            $scope.biblePreparedVerses = prepareBibleVerses($scope.bibleVerses);

            if (prevVerseNums.length === 0) { scrollBiblePanels(); return; }

            // Restore verse selection by matching VERSE_NUM
            var restoredVerses = [];
            angular.forEach(prevVerseNums, function(verseNum) {
                angular.forEach($scope.bibleVerses, function(v, idx) {
                    if (parseInt(v.VERSE_NUM) === verseNum && $scope.biblePreparedVerses[idx]) {
                        restoredVerses.push($scope.biblePreparedVerses[idx]);
                    }
                });
            });

            if (restoredVerses.length > 0) {
                $scope.selectedBibleVerses = restoredVerses;
                var combinedText = buildBibleCombinedText(restoredVerses);
                $scope.showingBibleVerse   = combinedText;
                var bookName = $scope.getBibleBookName($scope.selectedBibleBook);
                sendBibleText(combinedText, bookName + ' ' + prevChapter);
            }
            scrollBiblePanels();
        });
    };

    $scope.selectBibleBook = function(book) {
        $scope.selectedBibleBook    = book;
        $scope.bibleChapters        = [];
        $scope.selectedBibleChapter = null;
        $scope.bibleVerses          = [];
        $scope.biblePreparedVerses  = [];
        $scope.selectedBibleVerses  = [];

        $http({ method: "POST", url: "/ajax", data: { command: 'get_bible_chapters', book_id: book.ID } }).then(
            function success(respond) {
                $scope.bibleChapters = respond.data;
            },
            function error(erespond) {
                console.log('Ajax call error: ', erespond);
            });
    };

    $scope.selectBibleChapter = function(chapterNum) {
        $scope.selectedBibleChapter = chapterNum;
        $scope.bibleVerses          = [];
        $scope.biblePreparedVerses  = [];
        $scope.selectedBibleVerses  = [];

        $http({ method: "POST", url: "/ajax",
            data: { command: 'get_bible_verses',
                book_id: $scope.selectedBibleBook.ID,
                chapter_num: chapterNum } }).then(
            function success(respond) {
                $scope.bibleVerses         = respond.data;
                $scope.biblePreparedVerses = prepareBibleVerses($scope.bibleVerses);
            },
            function error(erespond) {
                console.log('Ajax call error: ', erespond);
            });
    };

    /**
     * Build display strings for Bible verses (same pattern as song verses).
     * Format: "visible text\n(verseIndex)" — index is used for selection tracking.
     */
    function prepareBibleVerses(verses) {
        var result = [];
        angular.forEach(verses, function(verse, idx) {
            var parts    = [];
            var verseNum = verse.VERSE_NUM;
            getActiveLangs().forEach(function(lang) {
                var field = textCol(lang);
                if (verse[field]) parts.push(verseNum + '. ' + verse[field]);
            });
            if (parts.length === 0) return;
            var combined = parts.join('\r\n- - - - - - - -\r\n');
            result.push(combined + '\n(' + idx + ')');
        });
        return result;
    }

    /**
     * Get a book display name based on active languages.
     */
    $scope.getBibleBookName = function(book) {
        if (!book) return '';
        // Iterate active languages in sort_order.
        // First non-default (col_suffix != '') with a filled field wins.
        // If nothing found — return base NAME.
        var active = getActiveLangs();
        for (var i = 0; i < active.length; i++) {
            var lang  = active[i];
            if (lang.col_suffix === '') continue;           // skip default language
            var field = nameCol(lang);
            if (book[field]) return book[field];
        }
        return book.NAME || '';
    };

    /**
     * Get verse display text for search results.
     */
    $scope.getBibleVerseDisplay = function(verse) {
        // Return text of first active language with a non-empty field.
        var active = getActiveLangs();
        for (var i = 0; i < active.length; i++) {
            var v = verse[textCol(active[i])];
            if (v) return v;
        }
        return verse.TEXT || '';
    };


    // ==========================================================
    // BIBLE VERSE SELECTION (mirrors song verse selection)
    // ==========================================================

    $scope.toggleBibleVerse = function(verseText, $event) {
        var ctrlKey = $event.ctrlKey || $event.metaKey;
        var bookName = $scope.getBibleBookName($scope.selectedBibleBook);
        var refLabel = bookName + ' ' + $scope.selectedBibleChapter;

        if (ctrlKey) {
            var index = $scope.selectedBibleVerses.indexOf(verseText);
            if (index > -1) {
                $scope.selectedBibleVerses.splice(index, 1);
            } else {
                $scope.selectedBibleVerses.push(verseText);
            }

            if ($scope.selectedBibleVerses.length === 0) {
                sendBibleText('', '');
                $scope.showingBibleVerse = null;
            } else {
                var combinedText = buildBibleCombinedText($scope.selectedBibleVerses);
                sendBibleText(combinedText, refLabel);
                $scope.showingBibleVerse = combinedText;
            }
        } else {
            var wasShowing = $scope.selectedBibleVerses.indexOf(verseText) > -1;
            $scope.selectedBibleVerses = [];

            if (wasShowing) {
                sendBibleText('', '');
                $scope.showingBibleVerse = null;
            } else {
                var count = $scope.bibleVerseCount || 1;
                if (count <= 1) {
                    $scope.selectedBibleVerses = [verseText];
                    var cleanText = verseText.replace(/\n\(\d+\)$/, '');
                    sendBibleText(cleanText, refLabel);
                    $scope.showingBibleVerse = verseText;
                } else {
                    var startIdx = $scope.biblePreparedVerses.indexOf(verseText);
                    var verses = [];
                    for (var i = 0; i < count; i++) {
                        var idx = startIdx + i;
                        if (idx < $scope.biblePreparedVerses.length) {
                            verses.push($scope.biblePreparedVerses[idx]);
                        }
                    }
                    $scope.selectedBibleVerses = verses;
                    var combinedText = buildBibleCombinedText(verses);
                    sendBibleText(combinedText, refLabel);
                    $scope.showingBibleVerse = combinedText;
                }
            }
        }
    };

    /**
     * Build combined multi-verse text from selected verse display strings.
     * Re-collects verse indices and looks up raw data to honour language toggles.
     */
    function buildBibleCombinedText(selectedVerseStrings) {
        var verseIndices = selectedVerseStrings.map(function(v) {
            var match = v.match(/\n\((\d+)\)$/);
            return match ? parseInt(match[1]) : -1;
        }).filter(function(idx) { return idx >= 0; });

        var langBuckets = {};
        getActiveLangs().forEach(function(lang) { langBuckets[lang.code] = []; });

        verseIndices.forEach(function(idx) {
            var verse = $scope.bibleVerses[idx];
            if (!verse) return;
            var num = verse.VERSE_NUM;
            getActiveLangs().forEach(function(lang) {
                var field = textCol(lang);
                if (verse[field]) langBuckets[lang.code].push(num + '. ' + verse[field]);
            });
        });

        var languageParts = [];
        getActiveLangs().forEach(function(lang) {
            var parts = langBuckets[lang.code];
            if (parts.length > 0) languageParts.push(parts.join('\r\n'));
        });

        return languageParts.join('\r\n- - - - - - - -\r\n');
    }

    /**
     * After Angular digest, scroll each bible panel so the selected item is visible.
     */
    function scrollBiblePanels() {
        $timeout(function() {
            var panels = [
                { id: 'bible-books-panel',    sel: '.bible-list-item.selected' },
                { id: 'bible-chapters-panel', sel: '.bible-list-item.selected' },
                { id: 'bible-verses-panel',   sel: '.bible-verse-item.chapter-selected' }
            ];
            panels.forEach(function(p) {
                var panel = document.getElementById(p.id);
                if (!panel) return;
                var el = panel.querySelector(p.sel);
                if (!el) return;
                var panelTop    = panel.scrollTop;
                var panelBottom = panelTop + panel.clientHeight;
                var elTop       = el.offsetTop;
                var elBottom    = elTop + el.offsetHeight;
                if (elTop < panelTop) {
                    panel.scrollTop = elTop - 8;
                } else if (elBottom > panelBottom) {
                    panel.scrollTop = elBottom - panel.clientHeight + 8;
                }
            });
        }, 50);
    }

    // ==========================================================
    // MESSAGES MODE
    // ==========================================================

    function hlEscapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function hlEscapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    function makeHighlightHtml(text, q) {
        var html = hlEscapeHtml(text);
        if (q && q.trim().length >= 2) {
            html = html.replace(new RegExp('(' + hlEscapeRe(hlEscapeHtml(q.trim())) + ')', 'gi'),
                '<mark class="search-hl">$1</mark>');
        }
        return $sce.trustAsHtml(html);
    }
    $scope.highlightMsg = function(text) {
        return makeHighlightHtml(text, $scope.messageTextQuery || '');
    };
    $scope.highlightBibleVerse = function(verse) {
        return makeHighlightHtml(verse, $scope.bibleHighlightQuery || '');
    };

    $scope.searchMessages = function() {
        if (messageSearchTimer) $timeout.cancel(messageSearchTimer);

        var titleQ = $scope.messageTitleQuery  || '';
        var textQ  = $scope.messageTextQuery   || '';

        if (titleQ.length < 2 && textQ.length < 2) {
            $scope.messageSearchResults = [];
            return;
        }

        messageSearchTimer = $timeout(function() {
            $http({ method: "POST", url: "/ajax", data: {
                    command: 'search_messages',
                    title_query: titleQ,
                    text_query:  textQ
                }}).then(function(r) {
                $scope.messageSearchResults = r.data;
            });
        }, 400);
    };

    $scope.selectMessage = function(msg) {
        $scope.selectedMessage    = msg;   // preliminary (for list highlight)
        $scope.messageParagraphs  = [];
        $scope.showingMessagePara = null;
        // Reset audio
        $scope.msgTimecodes    = [];
        $scope.msgAudioPlaying = false;
        $scope.msgAudioLoaded  = false;
        $scope.msgCalibrating  = false;
        if (msgAudio) { msgAudio.pause(); msgAudio.src = ''; }

        $http({ method: "POST", url: "/ajax", data: {
                command: 'get_message',
                id: msg.ID
            }}).then(function(r) {
            if (!r.data) return;

            // Always update with full data (TEXT, TEXT_LT, TEXT_EN, …)
            $scope.selectedMessage = r.data;

            // Build paragraphs from first active language with data
            var text = '';
            var active = getActiveLangs();
            for (var i = 0; i < active.length; i++) {
                var field = 'TEXT' + active[i].col_suffix;
                if (r.data[field] && r.data[field].trim()) {
                    text = r.data[field];
                    break;
                }
            }
            // Fallback: any non-empty field from all known languages
            if (!text) {
                for (var j = 0; j < $scope.langList.length; j++) {
                    var fbField = 'TEXT' + $scope.langList[j].col_suffix;
                    if (r.data[fbField] && r.data[fbField].trim()) {
                        text = r.data[fbField];
                        break;
                    }
                }
            }

            if (text) {
                var lines = text.split(/\r?\n/);
                $scope.messageParagraphs = lines.filter(function(l) {
                    return l.trim().length > 0;
                });
                var q = ($scope.messageTextQuery || '').trim();
                if (q.length >= 2) {
                    $timeout(function() {
                        var panel = document.getElementById('messages-para-panel');
                        var hl = panel && panel.querySelector('.search-hl');
                        if (hl) hl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }, 80);
                }
            }

            // Parse timecodes and initialize audio
            $scope.msgTimecodes = parseMsgTimecodes(r.data.TIMECODES);
            if (r.data.AUDIO_SRC) {
                // Lazy initialization of <audio> element
                if (!msgAudio) {
                    msgAudio = document.getElementById('msgAudioEl');
                    if (msgAudio) {
                        msgAudio.addEventListener('ended', function() {
                            $scope.$apply(function() { $scope.msgAudioPlaying = false; });
                        });
                        msgAudio.addEventListener('timeupdate', function() {
                            if (!$scope.msgAudioPlaying || $scope.msgCalibrating) return;
                            var ct = msgAudio.currentTime;
                            var curIdx  = $scope.messageParagraphs.indexOf($scope.showingMessagePara);
                            var nextIdx = curIdx + 1;
                            if (nextIdx < $scope.messageParagraphs.length &&
                                nextIdx < $scope.msgTimecodes.length &&
                                ct >= $scope.msgTimecodes[nextIdx]) {
                                $scope.$apply(function() {
                                    var nextPara = $scope.messageParagraphs[nextIdx];
                                    $scope.showingMessagePara = nextPara;
                                    var title = $scope.selectedMessage ? $scope.selectedMessage.TITLE : '';
                                    $http({ method: 'POST', url: '/ajax', data: {
                                        command: 'set_message_text', text: nextPara, song_name: title
                                    }});
                                    $timeout(function() {
                                        var panel = document.getElementById('messages-para-panel');
                                        if (!panel) return;
                                        var items = panel.querySelectorAll('.bible-verse-item');
                                        if (items[nextIdx]) items[nextIdx].scrollIntoView({ block: 'nearest' });
                                    }, 50);
                                });
                            }
                        });
                    }
                }
                if (msgAudio) {
                    msgAudio.src = r.data.AUDIO_SRC;
                    $scope.msgAudioLoaded = true;
                }
            }
        });
    };

    $scope.toggleMessageParagraph = function(para) {
        if ($scope.showingMessagePara === para) {
            // Toggle off
            $scope.showingMessagePara = null;
            $http({ method: "POST", url: "/ajax", data: {
                    command: 'set_message_text',
                    text: '',
                    song_name: ''
                }});
        } else {
            $scope.showingMessagePara = para;
            var title = $scope.selectedMessage ? $scope.selectedMessage.TITLE : '';
            $http({ method: "POST", url: "/ajax", data: {
                    command: 'set_message_text',
                    text: para,
                    song_name: title
                }});
        }
    };

    function saveMsgTimecodesToDb() {
        if (!$scope.selectedMessage || $scope.msgTimecodes.length === 0) return;
        var tcStr = $scope.msgTimecodes.map(function(s) {
            return $scope.formatMsgTimecode(s);
        }).join('\r\n');
        $http({ method: 'POST', url: '/ajax', data: {
            command:   'save_message_timecodes',
            id:        $scope.selectedMessage.ID,
            timecodes: tcStr
        }}).then(function(r) {
            if (r.data && r.data.status === 'success') {
                $scope.selectedMessage.TIMECODES = tcStr;
            }
        });
    }

    // Paragraph click: show/hide text on display + jump to timecode if audio is playing
    // Repeated click on active playing paragraph = Stop
    $scope.onMsgParaClick = function(idx, para) {
        if ($scope.msgAudioPlaying && $scope.showingMessagePara === para && !$scope.msgCalibrating) {
            $scope.stopMsgAudio();
            return;
        }
        // Calibration mode: capture timecode, activate paragraph, save to DB
        if ($scope.msgCalibrating && msgAudio && $scope.msgAudioLoaded) {
            $scope.msgTimecodes[idx] = Math.round(msgAudio.currentTime * 10) / 10;
            $scope.showingMessagePara = para;
            var title = $scope.selectedMessage ? $scope.selectedMessage.TITLE : '';
            $http({ method: 'POST', url: '/ajax', data: {
                command: 'set_message_text', text: para, song_name: title
            }});
            saveMsgTimecodesToDb();
            return;
        }
        if (msgAudio && $scope.msgAudioPlaying && $scope.msgTimecodes.length > idx) {
            msgAudio.currentTime = $scope.msgTimecodes[idx];
        }
        $scope.toggleMessageParagraph(para);
    };

    $scope.toggleMsgAudio = function() {
        if (!msgAudio || !$scope.msgAudioLoaded) return;
        if ($scope.msgAudioPlaying) {
            msgAudio.pause();
            $scope.msgAudioPlaying = false;
            if (msgTimerInterval) { $interval.cancel(msgTimerInterval); msgTimerInterval = null; }
        } else {
            // Start from current paragraph timecode (or from beginning)
            var idx = $scope.messageParagraphs.indexOf($scope.showingMessagePara);
            if (idx >= 0 && $scope.msgTimecodes[idx] !== undefined) {
                msgAudio.currentTime = $scope.msgTimecodes[idx];
            }
            msgAudio.play();
            $scope.msgAudioPlaying = true;
            // Update timer every 500 ms — no extra digest cycles
            msgTimerInterval = $interval(function() {
                $scope.msgCurrentTime = msgAudio ? msgAudio.currentTime : 0;
            }, 500);
        }
    };

    $scope.stopMsgAudio = function() {
        if (!msgAudio) return;
        msgAudio.pause();
        msgAudio.currentTime = 0;
        $scope.msgAudioPlaying = false;
        $scope.msgCurrentTime  = 0;
        if (msgTimerInterval) { $interval.cancel(msgTimerInterval); msgTimerInterval = null; }
        // Clear active paragraph from display
        if ($scope.showingMessagePara !== null) {
            $scope.showingMessagePara = null;
            $http({ method: 'POST', url: '/ajax', data: { command: 'set_message_text', text: '', song_name: '' }});
        }
        // In calibration mode, save updated timecodes to DB
        if ($scope.msgCalibrating) {
            saveMsgTimecodesToDb();
        }
    };

    function sendBibleText(text, refLabel) {
        $http({ method: "POST", url: "/ajax",
            data: { command: 'set_bible_text',
                text: text,
                song_name: refLabel } });
    }


    // ==========================================================
    // BIBLE SEARCH
    // ==========================================================

    $scope.searchBible = function() {
        if (bibleSearchTimer) $timeout.cancel(bibleSearchTimer);

        if (!$scope.bibleSearchQuery || $scope.bibleSearchQuery.length < 2) {
            $scope.bibleSearchResults = [];
            return;
        }

        bibleSearchTimer = $timeout(function() {
            $http({ method: "POST", url: "/ajax",
                data: { command: 'search_bible_verses',
                    translation_id: $scope.bibleTranslationId || 1,
                    query: $scope.bibleSearchQuery } }).then(
                function success(respond) {
                    $scope.bibleSearchResults = respond.data;
                },
                function error(erespond) {
                    console.log('Bible search error: ', erespond);
                });
        }, 400); // 400ms debounce
    };

    $scope.getFilteredBibleBooks = function() {
        if (!$scope.bibleBookSearchQuery || $scope.bibleBookSearchQuery.length === 0) {
            return $scope.bibleBooks;
        }
        var q = $scope.bibleBookSearchQuery.toLowerCase();
        return $scope.bibleBooks.filter(function(book) {
            if (book.NAME && book.NAME.toLowerCase().indexOf(q) >= 0) return true;
            for (var i = 0; i < $scope.langList.length; i++) {
                var col = 'NAME' + $scope.langList[i].col_suffix;
                if (book[col] && book[col].toLowerCase().indexOf(q) >= 0) return true;
            }
            return false;
        });
    };

    /**
     * When user clicks a search result, navigate to the book/chapter
     * and highlight (select) the verse.
     * Uses direct HTTP promise chaining instead of $watch to avoid
     * digest-cycle timing issues with highlighted chapter.
     */
    $scope.selectSearchResult = function(result) {
        // Find the book in current list
        var book = null;
        angular.forEach($scope.bibleBooks, function(b) {
            if (b.ID === result.BOOK_ID) book = b;
        });

        if (!book) {
            $scope.setBibleTranslation($scope.bibleTranslationId || 1);
            return;
        }

        $scope.bibleHighlightQuery = $scope.bibleSearchQuery;
        $scope.bibleSearchQuery = ''; // close search results

        // Step 1 — select book (reset state, load chapters)
        $scope.selectedBibleBook    = book;
        $scope.bibleChapters        = [];
        $scope.selectedBibleChapter = null;
        $scope.bibleVerses          = [];
        $scope.biblePreparedVerses  = [];
        $scope.selectedBibleVerses  = [];

        $http({ method: "POST", url: "/ajax",
            data: { command: 'get_bible_chapters', book_id: book.ID }
        }).then(function(resp) {
            $scope.bibleChapters = resp.data;

            // Step 2 — select chapter
            $scope.selectedBibleChapter = parseInt(result.CHAPTER_NUM);
            $scope.bibleVerses          = [];
            $scope.biblePreparedVerses  = [];
            $scope.selectedBibleVerses  = [];

            return $http({ method: "POST", url: "/ajax",
                data: { command: 'get_bible_verses',
                    book_id: book.ID,
                    chapter_num: result.CHAPTER_NUM }
            });
        }).then(function(resp) {
            $scope.bibleVerses         = resp.data;
            $scope.biblePreparedVerses = prepareBibleVerses($scope.bibleVerses);

            // Step 3 — find and select the verse
            var verseIdx = -1;
            angular.forEach($scope.bibleVerses, function(v, idx) {
                if (parseInt(v.VERSE_NUM) === parseInt(result.VERSE_NUM)) verseIdx = idx;
            });

            if (verseIdx >= 0 && $scope.biblePreparedVerses[verseIdx]) {
                var verseText = $scope.biblePreparedVerses[verseIdx];
                $scope.selectedBibleVerses = [verseText];
                $scope.showingBibleVerse   = verseText;
                var cleanText  = verseText.replace(/\n\(\d+\)$/, '');
                var bookName   = $scope.getBibleBookName(book);
                sendBibleText(cleanText, bookName + ' ' + result.CHAPTER_NUM + ':' + result.VERSE_NUM);
            }
            scrollBiblePanels();
        });
    };


    // ==========================================================
    // SONG EDIT / UPLOAD (unchanged)
    // ==========================================================

    $scope.listConfig = {};
    $scope.openList = function(callback) {
        $scope.listConfig = { buttons: [{ label: window.t('leader.list.select'), action: callback }] };
        $scope.showList(true);
    };
    $scope.showList = function(flag) {
        jQuery("#list-popup .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.addSongToFavorites = function( songId ){
        $http({ method: "POST", url: "/ajax", data: {command: 'add_to_favorites', id: songId } }).then(
            function success(){
                $scope.reloadFavorites();
            },
            function error(erespond){
                console.log('Ajax call error: ',erespond);
            });
    };

    $scope.confirmationDialogConfig = {};
    $scope.confirmationDialog = function(msg, callback) {
        $scope.confirmationDialogConfig = {
            title: window.t('leader.confirm.deleteTitle'),
            message: window.t('leader.confirm.deleteMessage', { name: msg }),
            buttons: [{ label: window.t('common.button.yes'), action: callback }]
        };
        $scope.showDialog(true);
    };
    $scope.showDialog = function(flag) {
        jQuery("#confirmation-dialog .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.addConfig = {};
    $scope.addSong = function(callback) {
        $scope.addConfig = {
            image: null,
            buttons: [
                { label: window.t('leader.addSong.takePhoto'), action: callback },
                { label: window.t('leader.addSong.save'),      action: callback }
            ]
        };
        $scope.addSongPopup(true);
    };
    $scope.addSongPopup = function(flag) {
        jQuery("#add-song-popup .modal").modal(flag ? 'show' : 'hide');
    };

    function songTextForDisplay(text) {
        return (text || '').replace(/\r\n|\r/g, '\n').replace(/\n/g, '\n\n');
    }
    function songTextForSave(text) {
        return (text || '').replace(/\r/g, '').replace(/\n+/g, '\r\n');
    }

    $scope.editFavorite = function(listItem) {
        var texts = {};
        for (var i = 0; i < $scope.langList.length; i++) {
            var lang = $scope.langList[i];
            texts[lang.code] = songTextForDisplay(listItem['TEXT' + lang.col_suffix]);
        }
        $scope.editConfig = {
            title: window.t('tech.dialog.editSong'),
            songId: listItem.ID,
            texts: texts,
            songName: listItem.NAME,
            songNum: listItem.NUM,
            dispName: listItem.dispName,
            currentImage: listItem.imageName,
            previewImage: null,
            isNewSong: false
        };
        $scope.showEditDialog(true);
    };

    $scope.addNewSong = function() {
        var texts = {};
        for (var i = 0; i < $scope.langList.length; i++) {
            texts[$scope.langList[i].code] = '';
        }
        $scope.editConfig = {
            title: window.t('tech.dialog.addSong'),
            songId: null,
            texts: texts,
            songName: '',
            songNum: null,
            dispName: '',
            currentImage: null,
            previewImage: null,
            isNewSong: true
        };
        $scope.showEditDialog(true);
    };

    $scope.showEditDialog = function(flag) {
        jQuery("#edit-song-popup .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.previewImage = function() {
        var fileInput = document.getElementById('imageUpload');
        var file = fileInput.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function(e) {
                $scope.$apply(function() {
                    $scope.editConfig.previewImage = e.target.result;
                });
            };
            reader.readAsDataURL(file);
        }
    };

    $scope.clearImagePreview = function() {
        $scope.editConfig.previewImage = null;
        document.getElementById('imageUpload').value = '';
    };

    $scope.checkSongNumUniqueness = function() {
        if (!$scope.editConfig.isNewSong || !$scope.editConfig.songNum) {
            $scope.songNumError = '';
            return;
        }
        $http({ method: "POST", url: "/ajax",
            data: { command: 'check_song_num_exists',
                list_id: $scope.listId,
                song_num: $scope.editConfig.songNum } }).then(
            function(response) {
                if (response.data.exists) {
                    $scope.songNumError = window.t('tech.error.numberInUse');
                } else {
                    $scope.songNumError = '';
                }
            }
        );
    };

    $scope.saveSongEdits = function() {
        var textData = {};
        for (var i = 0; i < $scope.langList.length; i++) {
            var lang = $scope.langList[i];
            textData['text' + lang.col_suffix.toLowerCase()] = songTextForSave(($scope.editConfig.texts || {})[lang.code]);
        }
        if ($scope.editConfig.isNewSong) {
            // Check if song number is provided and unique
            if ($scope.songNumError) {
                alert(window.t('tech.error.fixBeforeSave'));
                return;
            }
            $http({ method: "POST", url: "/ajax",
                data: angular.extend({ command: 'create_song',
                    list_id: $scope.listId,
                    name: $scope.editConfig.songName,
                    song_num: $scope.editConfig.songNum }, textData) }).then(
                function success(response) {
                    $scope.editConfig.songId  = response.data.song_id;
                    $scope.editConfig.songNum = $scope.listId + '/' + response.data.num;
                    var fileInput = document.getElementById('imageUpload');
                    if (fileInput.files.length > 0) {
                        $scope.uploadImage(function() {
                            $scope.addSongToFavorites($scope.editConfig.songId);
                            $scope.showEditDialog(false);
                        });
                    } else {
                        $scope.addSongToFavorites($scope.editConfig.songId);
                        $scope.showEditDialog(false);
                    }
                },
                function error(erespond) {
                    console.log('Ajax call error: ', erespond);
                }
            );
        } else {
            $http({ method: "POST", url: "/ajax",
                data: angular.extend({ command: 'update_song',
                    id: $scope.editConfig.songId,
                    name: $scope.editConfig.songName }, textData) }).then(
                function success() {
                    var fileInput = document.getElementById('imageUpload');
                    if (fileInput.files.length > 0) {
                        $scope.uploadImage(function() {
                            $scope.reloadFavorites();
                            $scope.showEditDialog(false);
                        });
                    } else {
                        $scope.reloadFavorites();
                        $scope.showEditDialog(false);
                    }
                },
                function error(erespond) {
                    console.log('Ajax call error: ', erespond);
                }
            );
        }
    };

    $scope.uploadImage = function(callback) {
        var fileInput = document.getElementById('imageUpload');
        var file = fileInput.files[0];
        var formData = new FormData();
        formData.append('image', file);
        formData.append('command', 'upload_song_image');
        formData.append('song_id', $scope.editConfig.songId);
        formData.append('list_id', $scope.editConfig.songNum.split('/')[0]);

        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: {'Content-Type': undefined}
        }).then(
            function success() { if (callback) callback(); },
            function error(erespond) { console.log('Image upload error: ', erespond); }
        );
    };


    // ==========================================================
    // WEBSOCKET
    // ==========================================================

    // [SECURITY] Use authenticated WebSocket connection
    $scope.wsConnected = null; // null = not yet connected, true/false after first connection
    var wsDisconnectTimer = null;

    // URL is auto-detected (wss:// for HTTPS, ws:// for HTTP)
    window.createAuthenticatedWebSocket(
        null, // Use default /ws endpoint
        function(data) {
            // Handle incoming messages (only after authentication)
            if (data.type === 'update_needed') {
                $scope.$apply(function() {
                    // Restore state immediately after favorites are reloaded
                    $scope.reloadFavorites(function() {
                        restoreCurrentState();
                    });
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
                // Show banner only if disconnect lasts more than 5 seconds
                wsDisconnectTimer = setTimeout(function() {
                    wsDisconnectTimer = null;
                    $scope.$applyAsync(function() { $scope.wsConnected = false; });
                }, 5000);
            }
        }
    );


    // ==========================================================
    // KEYBOARD NAVIGATION (Arrow Up / Arrow Down)
    // ==========================================================

    document.addEventListener('keydown', function(e) {
        // Only act on ArrowUp / ArrowDown; ignore if focus is in an input/textarea
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        e.preventDefault();
        var dir = (e.key === 'ArrowDown') ? 1 : -1;

        $scope.$apply(function() {
            if ($scope.pageMode === 'bible') {
                navigateBibleVerse(dir);
            } else if ($scope.pageMode === 'messages') {
                navigateMessageParagraph(dir);
            } else {
                navigateSongChapter(dir);
            }
        });
    });

    function navigateMessageParagraph(dir) {
        var list = $scope.messageParagraphs;
        if (!list || list.length === 0) return;

        var currentIdx = list.indexOf($scope.showingMessagePara);
        var nextIdx;

        if (currentIdx === -1) {
            nextIdx = dir === 1 ? 0 : list.length - 1;
        } else {
            nextIdx = currentIdx + dir;
            if (nextIdx < 0 || nextIdx >= list.length) return;
        }

        var nextPara = list[nextIdx];
        $scope.toggleMessageParagraph(nextPara);

        $timeout(function() {
            var panel = document.getElementById('messages-para-panel');
            if (!panel) return;
            var items = panel.querySelectorAll('.bible-verse-item');
            if (items[nextIdx]) items[nextIdx].scrollIntoView({ block: 'nearest' });
        }, 50);
    }

    function navigateSongChapter(dir) {
        var list = $scope.preparedChapters;
        if (!list || list.length === 0) return;

        // Find current index — use the last selected chapter as anchor
        var anchor = $scope.selectedChapters.length > 0
            ? $scope.selectedChapters[$scope.selectedChapters.length - 1]
            : $scope.showingChapter;

        var currentIdx = list.indexOf(anchor);
        var nextIdx;

        if (currentIdx === -1) {
            nextIdx = dir === 1 ? 0 : list.length - 1;
        } else {
            nextIdx = currentIdx + dir;
            if (nextIdx < 0 || nextIdx >= list.length) return; // already at edge
        }

        // Simulate a single-select click on the next chapter
        var nextChapter = list[nextIdx];
        $scope.toggleCurrentTextChapter(nextChapter, { ctrlKey: false, metaKey: false });

        // Scroll the item into view
        $timeout(function() {
            var el = document.querySelector('.chapter-item.selected-chapter, .chapter-item.active');
            if (!el) {
                // fallback: find by index
                var items = document.querySelectorAll('.chapter-item');
                if (items[nextIdx]) items[nextIdx].scrollIntoView({ block: 'nearest' });
            } else {
                el.scrollIntoView({ block: 'nearest' });
            }
        }, 50);
    }

    function navigateBibleVerse(dir) {
        var list = $scope.biblePreparedVerses;
        if (!list || list.length === 0) return;

        var anchor = $scope.selectedBibleVerses.length > 0
            ? $scope.selectedBibleVerses[$scope.selectedBibleVerses.length - 1]
            : $scope.showingBibleVerse;

        var currentIdx = list.indexOf(anchor);
        var nextIdx;

        if (currentIdx === -1) {
            nextIdx = dir === 1 ? 0 : list.length - 1;
        } else {
            nextIdx = currentIdx + dir;
            if (nextIdx < 0 || nextIdx >= list.length) return;
        }

        var nextVerse = list[nextIdx];
        $scope.toggleBibleVerse(nextVerse, { ctrlKey: false, metaKey: false });

        $timeout(function() {
            var items = document.querySelectorAll('.bible-verse-item');
            if (items[nextIdx]) items[nextIdx].scrollIntoView({ block: 'nearest' });
        }, 50);
    }

    // ==========================================================
    // ACCESS REQUEST MANAGEMENT (WebSocket-based)
    // ==========================================================

    // Load pending requests on page load
    function loadPendingAccessRequests() {
        $http.post('/ajax', { command: 'get_pending_access_requests' }).then(
            function (r) {
                if (r.data && r.data.status === 'ok') {
                    var requests = r.data.requests || [];
                    if (requests.length > 0) {
                        accessRequestQueue = requests;
                        $scope.currentAccessRequest = accessRequestQueue[0];
                    }
                }
            },
            function (e) { console.error('Failed to load pending access requests', e); }
        );
    }

    $scope.respondToAccessRequest = function (action) {
        if (!$scope.currentAccessRequest) return;

        var requestId = $scope.currentAccessRequest.id;
        $http.post('/ajax', {
            command: 'respond_to_access_request',
            request_id: requestId,
            action: action
        }).then(
            function (r) {
                if (r.data && r.data.status === 'ok') {
                    // Remove from queue and show next if any
                    accessRequestQueue.shift();
                    $scope.currentAccessRequest = accessRequestQueue.length > 0 ? accessRequestQueue[0] : null;
                } else {
                    alert(window.t('sermon.errorPrefix', { message: r.data.message || window.t('common.unknownError') }));
                }
            },
            function (e) { alert('HTTP error: ' + e.status); }
        );
    };

    // ==========================================================
    // WEBSOCKET MESSAGE HANDLER
    // ==========================================================

    // Listen for WebSocket messages (setup in common.js)
    window.addEventListener('websocket_message', function(event) {
        var message = event.detail;

        if (message.type === 'access_request') {
            // New access request received
            $scope.$apply(function() {
                var request = message.data;
                // Add to queue if not already there
                var exists = false;
                for (var i = 0; i < accessRequestQueue.length; i++) {
                    if (accessRequestQueue[i].id === request.id) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    accessRequestQueue.push(request);
                    // Show if no current request
                    if (!$scope.currentAccessRequest) {
                        $scope.currentAccessRequest = request;
                    }
                }
            });
        }
    });

    // ==========================================================
    // RESTORE CURRENT STATE
    // ==========================================================

    function restoreCurrentState() {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_current_state' } }).then(
            function(response) {
                var state = response.data;

                // Determine what type of state we're restoring to avoid clearing it prematurely
                // Priority: Bible > Message > Song > Media
                var isRestoringBible = state.text && state.song_name &&
                    state.song_name.match(/\d+:\d+/);
                var isRestoringMessage = !isRestoringBible && state.text && state.song_name;
                var isRestoringSong = !isRestoringBible && !isRestoringMessage &&
                    state.image && state.image.match(/\/images\/\d+\/.+\.jpg/);
                var isRestoringMedia = !isRestoringBible && !isRestoringMessage && !isRestoringSong &&
                    (state.image || state.video_src);

                // Clear previous state (but preserve message paragraph if we're restoring it)
                if (!isRestoringSong) {
                    $scope.showingSong = null;
                    $scope.showingChapter = null;
                    $scope.selectedChapters = [];
                    $scope.preparedChapters = [];
                }
                if (!isRestoringBible) {
                    $scope.showingBibleVerse = null;
                }
                if (!isRestoringMessage) {
                    $scope.showingMessagePara = null;
                }
                if (!isRestoringMedia) {
                    $scope.activeMediaItem = null;
                }

                // Restore song if image path matches song image pattern
                if (state.image && state.image.match(/\/images\/\d+\/.+\.jpg/)) {
                    var matches = state.image.match(/\/images\/(\d+)\/(.+)\.jpg/);
                    if (matches) {
                        var listId = parseInt(matches[1]);
                        var songNum = matches[2];

                        // Find and select the song in favorites
                        for (var i = 0; i < $scope.favorites.length; i++) {
                            if ($scope.favorites[i].LISTID == listId && $scope.favorites[i].NUM == songNum) {
                                $scope.showingSong = $scope.favorites[i];
                                // Split text to prepare chapters
                                splitText($scope.favorites[i]);
                                // Restore chapters if chapter_indices field has data
                                if (state.chapter_indices && state.chapter_indices.match(/^\d+(,\d+)*$/)) {
                                    // chapter_indices contains verse indices like "0,2,4"
                                    $scope.restoreChaptersFromSongName(state.chapter_indices, $scope.favorites[i]);
                                    // Set showingChapter to match the actual text (either single or combined)
                                    if ($scope.selectedChapters.length > 0) {
                                        if ($scope.selectedChapters.length === 1) {
                                            $scope.showingChapter = $scope.selectedChapters[0];
                                        } else {
                                            var combinedText = $scope.selectedChapters.map(function(ch) {
                                                return ch.replace(/\n\(\d+\)$/, '');
                                            }).join('\r\n');
                                            $scope.showingChapter = combinedText;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }

                // Restore Bible verse if text and song_name indicate Bible content
                if (state.text && state.song_name && state.song_name.match(/\d+:\d+/)) {
                    // Find the matching prepared verse string (same format used by toggleBibleVerse)
                    var foundBibleVerse = null;
                    for (var bi = 0; bi < $scope.biblePreparedVerses.length; bi++) {
                        var pv = $scope.biblePreparedVerses[bi];
                        if (pv.replace(/\n\(\d+\)$/, '') === state.text) {
                            foundBibleVerse = pv;
                            break;
                        }
                    }
                    $scope.showingBibleVerse    = foundBibleVerse;
                    $scope.selectedBibleVerses  = foundBibleVerse ? [foundBibleVerse] : [];
                    // Switch to Bible mode if needed
                    if ($scope.pageMode !== 'bible') {
                        $scope.pageMode = 'bible';
                    }
                }

                // Restore message paragraph if song_name doesn't match other patterns
                if (state.text && state.song_name && !state.song_name.match(/\d+:\d+/) && !state.image) {
                    // Switch to messages mode if needed
                    if ($scope.pageMode !== 'messages') {
                        $scope.pageMode = 'messages';
                    }

                    // If message is already loaded and paragraphs exist, restore selection
                    if ($scope.selectedMessage && $scope.selectedMessage.TITLE === state.song_name && $scope.messageParagraphs.length > 0) {
                        // Find the matching paragraph in messageParagraphs list
                        var foundPara = null;
                        for (var i = 0; i < $scope.messageParagraphs.length; i++) {
                            if ($scope.messageParagraphs[i] === state.text) {
                                foundPara = $scope.messageParagraphs[i];
                                break;
                            }
                        }
                        $scope.showingMessagePara = foundPara || state.text;
                    } else {
                        // Message not loaded - need to search and load it first
                        // Search for message by title
                        $http({ method: "POST", url: "/ajax", data: {
                                command: 'search_messages',
                                title_query: state.song_name,
                                text_query: ''
                            }}).then(function(r) {
                            if (r.data && r.data.length > 0) {
                                // Find exact title match
                                var matchedMsg = null;
                                for (var j = 0; j < r.data.length; j++) {
                                    if (r.data[j].TITLE === state.song_name) {
                                        matchedMsg = r.data[j];
                                        break;
                                    }
                                }
                                if (matchedMsg) {
                                    // Load the message and restore paragraph selection
                                    $scope.selectMessage(matchedMsg);
                                    // Wait for message to load, then restore paragraph
                                    $timeout(function() {
                                        for (var k = 0; k < $scope.messageParagraphs.length; k++) {
                                            if ($scope.messageParagraphs[k] === state.text) {
                                                $scope.showingMessagePara = $scope.messageParagraphs[k];
                                                break;
                                            }
                                        }
                                    }, 200);
                                }
                            }
                        });
                    }
                }

                // Restore image if state.image is a media item (not a song image)
                if (state.image && !state.image.match(/\/images\/\d+\/\d+\.jpg/)) {
                    // This is a media image, not a song image
                    for (var i = 0; i < $scope.favorites.length; i++) {
                        if ($scope.favorites[i].itemType === 'image' && $scope.favorites[i].src === state.image) {
                            $scope.activeMediaItem = $scope.favorites[i];
                            break;
                        }
                    }
                }

                // Restore video if video_src is set
                if (state.video_src) {
                    // Find media item in favorites
                    for (var i = 0; i < $scope.favorites.length; i++) {
                        if ($scope.favorites[i].itemType === 'video' && $scope.favorites[i].src === state.video_src) {
                            $scope.activeMediaItem = $scope.favorites[i];
                            break;
                        }
                    }
                    // If not found in favorites, create temporary item
                    if (!$scope.activeMediaItem) {
                        $scope.activeMediaItem = { src: state.video_src, itemType: 'video' };
                    }
                }
            }
        );
    }

    // Helper to restore chapters from chapter_indices like "0,2,4"
    // NOTE: preparedChapters must already be filled by splitText() before calling this
    $scope.restoreChaptersFromSongName = function(chapterIndices, song) {
        if (!chapterIndices) return;
        // Parse chapter numbers from chapter_indices
        var chapterNums = chapterIndices.split(',').map(function(n) { return parseInt(n.trim()); });

        // Select the chapters that were showing
        // preparedChapters format: "text\n(index)"
        $scope.selectedChapters = [];
        for (var i = 0; i < $scope.preparedChapters.length; i++) {
            // Extract index from "(index)" at the end
            var match = $scope.preparedChapters[i].match(/\((\d+)\)$/);
            if (match) {
                var chapterIndex = parseInt(match[1]);
                if (chapterNums.indexOf(chapterIndex) !== -1) {
                    $scope.selectedChapters.push($scope.preparedChapters[i]);
                }
            }
        }
    };

    // ==========================================================
    // INIT
    // ==========================================================

    $scope.loadSongLists();
    loadLanguages();   // initializes langList + $scope.languages (toggles)
    $scope.reloadSongList();
    loadPendingAccessRequests();  // Load any existing pending requests on page load

    // Restore state immediately after favorites are loaded
    $scope.reloadFavorites(function() {
        restoreCurrentState();
    });

});