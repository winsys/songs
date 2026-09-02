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
    $scope.bibleLang            = null;   // language of the PRIMARY translation (code)
    // Parallel Bible languages: lang code => {on: bool, trId: translation id}.
    // Persisted in localStorage; translations resolved when the list loads.
    $scope.bibleExtra           = {};
    // Parallel chapter data from get_bible_parallel:
    // trId => {name, lang, book, verses: {primaryVerseNum: {c, v, t}}}
    $scope.bibleParallel        = {};
    var bibleParallelSeq        = 0;
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
    $scope.messageParaResults   = [];   // quick paragraph results for the text search
    $scope.quickParaActive      = null; // last clicked quick result (list highlight)
    $scope.selectedMessage      = null;
    $scope.messageParagraphs    = [];
    $scope.showingMessagePara   = null;  // display string (kept in sync with the index)
    $scope.showingMsgParaIdx    = null;  // AUTHORITATIVE: active paragraph INDEX (duplicate texts make string identity ambiguous)
    var messageSearchTimer      = null;
    var pendingQuickPara        = null; // {id, idx} — set by selectParaResult, consumed after get_message loads

    // ── Messages audio ────────────────────────────────────────
    $scope.msgAudioPlaying  = false;
    $scope.msgAudioLoaded   = false;
    $scope.msgCalibrating   = false;   // calibration mode
    $scope.msgTimecodes     = [];      // array of seconds (floats)
    $scope.msgCurrentTime   = 0;      // current audio position (seconds) for display
    $scope.msgStopMarkerIdx = null;   // ephemeral end-of-playback marker (paragraph index); not persisted
    var msgAudio            = null;    // HTMLAudioElement (lazy init)
    var msgTimerInterval    = null;    // $interval handle for timer display
    var msgAdvanceTimer     = null;    // $timeout armed for the exact next timecode boundary

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

    // Like formatMsgTimecode but keeps 0.05 s precision (two decimals) — used
    // for SAVING so the calibrated sub-second value is not truncated.
    function formatMsgTimecodePrecise(secs) {
        if (secs === undefined || secs === null) return '';
        secs = Math.round(secs * 20) / 20;             // snap to 0.05 s
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs - h * 3600) / 60);
        var s = secs - h * 3600 - m * 60;              // 0..59.95
        var sStr = (s < 10 ? '0' : '') + s.toFixed(2);
        if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + sStr;
        return m + ':' + sStr;
    }

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
    $scope.activeAudioItem    = null;    // mp3 selected in playlist — local player only
    $scope.techVideoPlaying   = false;
    var techVideoSrc          = '';

    // ── External display override ─────────────────────────────
    // True when the main display shows content that did not originate from
    // this tech's UI (typically a preacher's sermon push). Drives a hidden
    // override button that clears the screen and notifies the source.
    $scope.externalContentActive = false;

    // ── Access Request state ──────────────────────────────────
    $scope.currentAccessRequest = null;  // Currently shown access request
    var accessRequestQueue = [];         // Queue of pending requests

    // ── Shared display targets (technician sets where leader/sermon broadcast) ──
    $scope.displayTargets        = [];    // own group + approved groups
    $scope.leaderDisplayTarget   = null;  // group_id or null ("do not broadcast")
    $scope.sermonDisplayTarget   = null;
    $scope.showAccessRequestModal  = false;
    $scope.availableGroups         = [];
    $scope.selectedGroupForRequest = '';

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
        // Fallback — the first language in the (group-ordered) list, i.e. the default.
        var anyActive = false;
        for (var k in $scope.languages) {
            if ($scope.languages[k]) { anyActive = true; break; }
        }
        if (!anyActive && $scope.langList.length > 0) {
            $scope.languages[$scope.langList[0].code] = true;
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
        // Bible mode is not affected: its languages are per-translation
        // (primary translation + bibleExtra parallel selections).
    };

    // ── Helpers for dynamic languages ───────────────────────

    /** Returns languages from langList that are currently enabled. */
    function getActiveLangs() {
        return $scope.langList.filter(function(l) {
            return $scope.languages[l.code];
        });
    }

    /** Returns the langList entry for the primary Bible language. */
    function getBibleLangObj() {
        if (!$scope.bibleLang) return null;
        for (var i = 0; i < $scope.langList.length; i++) {
            if ($scope.langList[i].code === $scope.bibleLang) return $scope.langList[i];
        }
        return null;
    }

    // ── Parallel Bible languages ─────────────────────────────
    // The primary translation (row-2 buttons) defines the language of the
    // books/chapters/verses panels; bibleExtra adds parallel languages,
    // each mapped to one translation of that language. The display text
    // gets one block per language, joined like multi-language songs.

    /** Translations whose LANG matches the given language code. */
    $scope.bibleTranslationsForLang = function(code) {
        return $scope.bibleTranslations.filter(function(t) { return t.LANG === code; });
    };

    $scope.isBibleExtraOn = function(code) {
        return !!($scope.bibleExtra[code] && $scope.bibleExtra[code].on);
    };

    /** Active parallel selections as [{lang, trId}], in langList order. */
    function bibleExtraActiveList() {
        var out = [];
        $scope.langList.forEach(function(l) {
            if (l.code === $scope.bibleLang) return;
            var e = $scope.bibleExtra[l.code];
            if (e && e.on && e.trId) out.push({ lang: l.code, trId: e.trId });
        });
        return out;
    }

    function saveBibleExtra() {
        try {
            localStorage.setItem('tech_bible_extra', JSON.stringify($scope.bibleExtra));
        } catch (e) { /* storage unavailable — selection just won't persist */ }
    }

    function loadBibleExtraFromStorage() {
        try {
            var raw = localStorage.getItem('tech_bible_extra');
            if (raw) $scope.bibleExtra = JSON.parse(raw) || {};
        } catch (e) { $scope.bibleExtra = {}; }
    }
    loadBibleExtraFromStorage();

    $scope.toggleBibleExtraLang = function(code) {
        if (code === $scope.bibleLang) return;
        var e = $scope.bibleExtra[code] || { on: false, trId: null };
        e.on = !e.on;
        if (e.on && !e.trId) {
            var list = $scope.bibleTranslationsForLang(code);
            e.trId = list.length > 0 ? list[0].ID : null;
        }
        $scope.bibleExtra[code] = e;
        saveBibleExtra();
        loadBibleParallel();
    };

    $scope.setBibleExtraTranslation = function(code) {
        saveBibleExtra();
        loadBibleParallel();
    };

    /**
     * (Re)load parallel chapter data for the active extra languages and,
     * once it arrives, upgrade whatever is currently on the display.
     * With no extras active it clears the data and re-sends primary-only
     * text so parallel blocks disappear from the screen.
     */
    function loadBibleParallel() {
        var seq = ++bibleParallelSeq;
        var extras = bibleExtraActiveList();

        if (extras.length === 0 || !$scope.selectedBibleBook || !$scope.selectedBibleChapter) {
            var hadData = Object.keys($scope.bibleParallel).length > 0;
            $scope.bibleParallel = {};
            if (hadData) resendCurrentBibleSelection();
            return;
        }

        $http({ method: "POST", url: "/ajax",
            data: { command: 'get_bible_parallel',
                book_num: parseInt($scope.selectedBibleBook.BOOK_NUM),
                chapter_num: $scope.selectedBibleChapter,
                primary_id: $scope.bibleTranslationId,
                translation_ids: extras.map(function(e) { return e.trId; }) } }).then(
            function success(respond) {
                if (seq !== bibleParallelSeq) return; // stale: chapter/extras changed
                $scope.bibleParallel = (respond.data && respond.data.extras) || {};
                resendCurrentBibleSelection();
            },
            function error(erespond) {
                console.log('get_bible_parallel error: ', erespond);
            });
    }

    /** Re-compose and re-send the current selection (if something is shown). */
    function resendCurrentBibleSelection() {
        if (!$scope.showingBibleVerse || $scope.selectedBibleVerses.length === 0) return;
        var combined = buildBibleCombinedText($scope.selectedBibleVerses);
        if (!combined) return;
        $scope.showingBibleVerse = combined;
        sendBibleText(combined, buildBibleRefLabel($scope.selectedBibleVerses));
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

                // Default language = first in the (group-ordered) list.
                var defaultCode = list.length > 0 ? list[0].code : null;

                // Initialize $scope.languages:
                //   - default language enabled,
                //   - language matching window.UI_LANG enabled (if different),
                //   - others disabled,
                //   - existing values preserved (on reload).
                var uiLang = window.UI_LANG || 'ru';
                var newLangs = {};
                for (var j = 0; j < list.length; j++) {
                    var code = list[j].code;
                    if (code in $scope.languages) {
                        newLangs[code] = $scope.languages[code];
                    } else {
                        newLangs[code] = (code === defaultCode || code === uiLang);
                    }
                }
                $scope.languages = newLangs;

                // Initial Bible language preference: steers which
                // translation gets auto-selected as primary. Afterwards
                // bibleLang always follows the primary translation's LANG.
                if (!$scope.bibleLang) {
                    var hasUi = list.some(function(l) { return l.code === uiLang; });
                    $scope.bibleLang = hasUi ? uiLang : (defaultCode || (list[0] && list[0].code) || null);
                }
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

        // The first language in the (group-ordered) list is the default and
        // defines the verse "skeleton" (count and order).
        var defaultLang = $scope.langList.length > 0 ? $scope.langList[0] : null;
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
                var audioStillListed = false;
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
                    // Re-point activeAudioItem at the fresh row
                    if (item.itemType === 'audio' &&
                        $scope.activeAudioItem && item.FID === $scope.activeAudioItem.FID) {
                        $scope.activeAudioItem = item;
                        audioStillListed = true;
                    }
                });

                // Selected mp3 vanished from the playlist (deleted elsewhere):
                // pause NOW, while the <audio> element is still in the DOM —
                // after the digest ng-if tears it down and a playing detached
                // element would keep sounding with no controls.
                if ($scope.activeAudioItem && !audioStillListed) {
                    pauseTechAudio();
                    $scope.activeAudioItem = null;
                }

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
            // Song toggle-off is the tech's notes off-switch (clear_notes);
            // playing media on the screen survives it server-side.
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'clear_image', clear_notes: 1 }
            });
            observerOff();
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
            observerSong(favoriteItem, -1);
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
                observerSong($scope.showingSong, -1);
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
                // Observers show a single verse: the first selected one.
                observerSong($scope.showingSong, verseIndices.length ? verseIndices[0] : -1);
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
                observerSong($scope.showingSong, -1);
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
                observerSong($scope.showingSong, chapterIndex === '' ? -1 : parseInt(chapterIndex));
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
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image', clear_notes: 1 } });
                        observerOff();
                        $scope.preparedChapters = [];
                        pauseTechAudio();
                        $scope.activeAudioItem = null;
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
    // Add image / mp3 to standard wallpapers
    // ─────────────────────────────────────────────────────────

    $scope.addToWallpapers = function (item) {
        var confirmMsg = window.t('tech.confirm.addToWallpapers', { name: item.NAME || item.dispName });
        if (!confirm(confirmMsg)) return;

        $http({ method: "POST", url: "/ajax", data: {
                command: 'add_to_wallpapers',
                name: item.NAME || item.dispName,
                src: item.src,
                media_type: item.itemType || 'image'
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
                media_type: wallpaper.media_type || 'image'
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
        if (/\.(mp3|m4a|aac|wav)$/i.test(url))      return 'audio';
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
    // Upload mp3 → add to playlist
    // ─────────────────────────────────────────────────────────

    $scope.triggerMediaAudioUpload = function () {
        document.getElementById('techMediaAudioInput').click();
    };

    $scope.onMediaAudioSelected = function (input) {
        if (!input.files || !input.files[0]) return;
        // Prompt for audio name
        var mediaName = prompt(window.t('tech.prompt.audioName'));
        if (mediaName === null) {
            input.value = '';
            return; // user cancelled
        }
        mediaName = mediaName.trim();
        if (!mediaName) {
            mediaName = input.files[0].name; // use filename as default
        }
        $scope.uploadingAudio = true;
        var formData = new FormData();
        formData.append('file',    input.files[0]);
        formData.append('command', 'upload_media_audio');
        formData.append('name',    mediaName);
        $http.post('/ajax', formData, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.uploadingAudio = false;
                if (r.data && r.data.status === 'success') {
                    $scope.showMediaAddPanel = false;
                    $scope.reloadFavorites();
                } else {
                    alert(window.t('sermon.errorPrefix', { message: r.data && r.data.message ? r.data.message : '' }));
                }
                input.value = '';
            },
            function (e) {
                $scope.uploadingAudio = false;
                alert('HTTP error: ' + e.status);
                input.value = '';
            }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Click on a media item in the playlist
    // ─────────────────────────────────────────────────────────

    // Pause the local mp3 player if it exists (the <audio> element lives
    // inside an ng-if and only exists while an audio item is selected).
    function pauseTechAudio() {
        var el = document.getElementById('techAudioEl');
        if (el) el.pause();
    }

    $scope.activateMediaItem = function (item) {
        // Audio plays locally on the tech console (sound desk) and never
        // touches the main display or the musician's notes — selection just
        // shows/hides the inline player under the chip.
        if (item.itemType === 'audio') {
            pauseTechAudio();
            $scope.activeAudioItem =
                ($scope.activeAudioItem && $scope.activeAudioItem.FID === item.FID) ? null : item;
            return;
        }

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

            var isMedia  = (itemType === 'image' || itemType === 'video' || itemType === 'audio');
            var command  = isMedia ? 'delete_media_favorite' : 'delete_favorite_item';

            // If deleting active item — clear display
            var isDeletingActive = $scope.showingSong && $scope.showingSong.FID === fav_id &&
                (!isMedia);
            var isDeletingActiveMedia = $scope.activeMediaItem &&
                $scope.activeMediaItem.FID === fav_id && isMedia;
            // Audio is local-only: stop the player, never touch the display
            var isDeletingActiveAudio = $scope.activeAudioItem &&
                $scope.activeAudioItem.FID === fav_id && itemType === 'audio';

            $http({ method: "POST", url: "/ajax", data: { command: command, id: fav_id }}).then(
                function success() {
                    if (isDeletingActive) {
                        $scope.showingSong       = null;
                        $scope.preparedChapters  = [];
                        $scope.showingChapter    = null;
                        $scope.selectedChapters  = [];
                        // Deleting the active song switches its notes off too.
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image', clear_notes: 1 }});
                        observerOff();
                    }
                    if (isDeletingActiveMedia) {
                        $scope.activeMediaItem = null;
                        $scope.techVideoPlaying = false;
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' }});
                    }
                    if (isDeletingActiveAudio) {
                        pauseTechAudio();
                        $scope.activeAudioItem = null;
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

    // Name of the currently selected song collection (for button labels).
    $scope.currentListName = function() {
        for (var i = 0; i < $scope.visibleSongLists.length; i++) {
            if ($scope.visibleSongLists[i].LIST_ID == $scope.listId) {
                return $scope.visibleSongLists[i].LIST_NAME;
            }
        }
        return '';
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
                // Auto-select the primary translation: prefer one whose
                // LANG matches the preferred Bible/UI language, otherwise
                // take the first one (they come sorted by SORT_ORDER).
                if ($scope.bibleTranslations.length > 0 && !$scope.bibleTranslationId) {
                    var preferred = $scope.bibleLang || window.UI_LANG || 'ru';
                    var match = null;
                    for (var i = 0; i < $scope.bibleTranslations.length; i++) {
                        if ($scope.bibleTranslations[i].LANG === preferred) { match = $scope.bibleTranslations[i]; break; }
                    }
                    $scope.setBibleTranslation((match || $scope.bibleTranslations[0]).ID);
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
        // The primary language follows the primary translation.
        for (var ti = 0; ti < $scope.bibleTranslations.length; ti++) {
            if ($scope.bibleTranslations[ti].ID == translationId) {
                $scope.bibleLang = $scope.bibleTranslations[ti].LANG;
                break;
            }
        }
        $scope.bibleBooks           = [];
        $scope.selectedBibleBook    = null;
        $scope.bibleChapters        = [];
        $scope.selectedBibleChapter = null;
        $scope.bibleVerses          = [];
        $scope.biblePreparedVerses  = [];
        $scope.selectedBibleVerses  = [];
        $scope.bibleSearchResults   = [];
        $scope.bibleParallel        = {};
        bibleParallelSeq++;         // invalidate any in-flight parallel load

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

            if (prevVerseNums.length === 0) { scrollBiblePanels(); loadBibleParallel(); return; }

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
                sendBibleText(combinedText, buildBibleRefLabel(restoredVerses));
            }
            scrollBiblePanels();
            // Parallel data for the new chapter; re-sends with extras when loaded.
            loadBibleParallel();
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
                loadBibleParallel();
            },
            function error(erespond) {
                console.log('Ajax call error: ', erespond);
            });
    };

    /**
     * Build display strings for Bible verses in the single active Bible
     * language. Format: "visible text\n(verseIndex)" — the index is used
     * for selection tracking and to recover raw data later. Falls back
     * to verse.TEXT when the language-suffixed column is absent (e.g.
     * after the parallel-column migration, verses only carry TEXT).
     */
    function prepareBibleVerses(verses) {
        var result = [];
        var lang = getBibleLangObj();
        var field = lang ? textCol(lang) : 'TEXT';
        angular.forEach(verses, function(verse, idx) {
            var text = verse[field] || verse.TEXT;
            if (!text) return;
            result.push(verse.VERSE_NUM + '. ' + text + '\n(' + idx + ')');
        });
        return result;
    }

    /**
     * Get a book display name. Resolution order:
     *   1. NAME column for the active Bible language ($scope.bibleLang).
     *   2. NAME column for window.UI_LANG (fallback for early renders
     *      before bibleLang is set).
     *   3. Default NAME column (typically Russian for Synodal, German
     *      for Luther).
     *   4. Any other non-empty NAME_* column.
     */
    $scope.getBibleBookName = function(book) {
        if (!book) return '';
        var preferred = $scope.bibleLang || window.UI_LANG || 'ru';
        for (var i = 0; i < $scope.langList.length; i++) {
            if ($scope.langList[i].code === preferred) {
                var col = 'NAME' + $scope.langList[i].col_suffix;
                if (book[col]) return book[col];
                break;
            }
        }
        if (book.NAME) return book.NAME;
        for (var j = 0; j < $scope.langList.length; j++) {
            var altCol = 'NAME' + $scope.langList[j].col_suffix;
            if (book[altCol]) return book[altCol];
        }
        // Final fallback: scan any NAME_* property on the row (in case the
        // server returned a column not in langList).
        for (var key in book) {
            if (key.indexOf('NAME') === 0 && book[key]) return book[key];
        }
        return '';
    };

    /**
     * Get verse display text for search results in the active Bible
     * language. Falls back to the default TEXT column when the
     * language-suffixed column is absent or empty.
     */
    $scope.getBibleVerseDisplay = function(verse) {
        var lang = getBibleLangObj();
        if (lang) {
            var v = verse[textCol(lang)];
            if (v) return v;
        }
        return verse.TEXT || '';
    };


    // ==========================================================
    // BIBLE VERSE SELECTION (mirrors song verse selection)
    // ==========================================================

    $scope.toggleBibleVerse = function(verseText, $event) {
        var ctrlKey = $event.ctrlKey || $event.metaKey;

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
                sendBibleText(combinedText, buildBibleRefLabel($scope.selectedBibleVerses));
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
                var verses;
                if (count <= 1) {
                    verses = [verseText];
                } else {
                    var startIdx = $scope.biblePreparedVerses.indexOf(verseText);
                    verses = [];
                    for (var i = 0; i < count; i++) {
                        var idx = startIdx + i;
                        if (idx < $scope.biblePreparedVerses.length) {
                            verses.push($scope.biblePreparedVerses[idx]);
                        }
                    }
                }
                $scope.selectedBibleVerses = verses;
                var combined = buildBibleCombinedText(verses);
                sendBibleText(combined, buildBibleRefLabel(verses));
                $scope.showingBibleVerse = combined;
            }
        }
    };

    /** Primary verse numbers (ints) for selected verse display strings. */
    function selectedVerseNums(selectedVerseStrings) {
        var nums = [];
        selectedVerseStrings.forEach(function(v) {
            var match = v.match(/\n\((\d+)\)$/);
            if (!match) return;
            var verse = $scope.bibleVerses[parseInt(match[1])];
            if (verse) nums.push(parseInt(verse.VERSE_NUM));
        });
        return nums;
    }

    /**
     * Build combined multi-verse text from selected verse display strings:
     * first the primary-translation block, then one block per active
     * parallel language (from bibleParallel, mapped by primary verse
     * number), joined with the same separator multi-language songs use.
     * Every block carries its own verse numbers, so a versification shift
     * between translations stays visible.
     */
    function buildBibleCombinedText(selectedVerseStrings) {
        var lang = getBibleLangObj();
        var field = lang ? textCol(lang) : 'TEXT';
        var parts = [];
        var nums  = [];
        selectedVerseStrings.forEach(function(v) {
            var match = v.match(/\n\((\d+)\)$/);
            if (!match) return;
            var verse = $scope.bibleVerses[parseInt(match[1])];
            if (!verse) return;
            var text = verse[field] || verse.TEXT;
            if (text) {
                parts.push(verse.VERSE_NUM + '. ' + text);
                nums.push(parseInt(verse.VERSE_NUM));
            }
        });

        var blocks = [];
        if (parts.length > 0) blocks.push(parts.join('\r\n'));

        bibleExtraActiveList().forEach(function(ex) {
            var p = $scope.bibleParallel[ex.trId];
            if (!p || !p.verses) return;
            var lines = [];
            nums.forEach(function(vn) {
                var mv = p.verses[vn];
                if (mv && mv.t) lines.push(mv.v + '. ' + mv.t);
            });
            if (lines.length > 0) blocks.push(lines.join('\r\n'));
        });

        return blocks.join('\r\n- - - - - - - -\r\n');
    }

    /**
     * Reference caption for the current selection: primary "Book Chapter"
     * (with ":verse" when a single verse is selected), plus the parallel
     * translations' own references when their numbering diverges — e.g.
     * "Псалтирь 21:2 / Psalms 22:1". Extras with matching chapter and
     * verse numbers are omitted to keep the caption short.
     */
    function buildBibleRefLabel(selectedVerseStrings) {
        var nums = selectedVerseNums(selectedVerseStrings);
        var single = nums.length === 1 ? nums[0] : null;
        var label = $scope.getBibleBookName($scope.selectedBibleBook) + ' ' + $scope.selectedBibleChapter;
        if (single !== null) label += ':' + single;

        if (nums.length > 0) {
            var extraRefs = [];
            bibleExtraActiveList().forEach(function(ex) {
                var p = $scope.bibleParallel[ex.trId];
                if (!p || !p.verses) return;
                var mv = p.verses[nums[0]];
                if (!mv) return;
                var diverges = parseInt(mv.c) !== parseInt($scope.selectedBibleChapter)
                    || parseInt(mv.v) !== nums[0];
                if (!diverges) return;
                var ref = (p.book || p.name) + ' ' + mv.c;
                if (single !== null) ref += ':' + mv.v;
                if (extraRefs.indexOf(ref) === -1 && ref !== label) extraRefs.push(ref);
            });
            if (extraRefs.length > 0) label += ' / ' + extraRefs.join(' / ');
        }
        return label;
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
            $scope.messageParaResults   = [];
            return;
        }
        if (textQ.trim().length < 2) {
            $scope.messageParaResults = [];
            $scope.quickParaActive    = null;
        }

        messageSearchTimer = $timeout(function() {
            $http({ method: "POST", url: "/ajax", data: {
                    command: 'search_messages',
                    title_query: titleQ,
                    text_query:  textQ
                }}).then(function(r) {
                $scope.messageSearchResults = r.data;
            });
            // Quick paragraph results (only when searching by text)
            if (textQ.trim().length >= 2) {
                $http({ method: "POST", url: "/ajax", data: {
                        command: 'search_message_paragraphs',
                        title_query: titleQ,
                        text_query:  textQ
                    }}).then(function(r) {
                    $scope.messageParaResults = r.data;
                    $scope.quickParaActive    = null;
                });
            }
        }, 400);
    };

    // Quick result click: load the message if needed, then scroll the paragraph
    // panel to the matched paragraph and show it on the display.
    $scope.selectParaResult = function(item) {
        $scope.quickParaActive = item;
        if ($scope.selectedMessage && String($scope.selectedMessage.ID) === String(item.ID) &&
            $scope.messageParagraphs.length > 0) {
            activateMsgParaByIdx(item.PARA_IDX);
        } else {
            pendingQuickPara = { id: item.ID, idx: item.PARA_IDX };
            $scope.selectMessage({ ID: item.ID, CODE: item.CODE, TITLE: item.TITLE, CITY: item.CITY });
        }
    };

    // Show paragraph #idx on the display (no-op if already showing) and scroll
    // the paragraph panel to it. Mirrors the audio-seek part of onMsgParaClick.
    function activateMsgParaByIdx(idx) {
        if ($scope.messageParagraphs[idx] === undefined) return;
        if (msgAudio && $scope.msgAudioPlaying && $scope.msgTimecodes.length > idx) {
            msgAudio.currentTime = $scope.msgTimecodes[idx];
            armMsgBoundaryTimer();
        }
        if ($scope.showingMsgParaIdx !== idx) {
            showMsgParagraph(idx);
        }
        scrollMsgParaIntoView(idx, 'center', 80, true);
    }

    $scope.selectMessage = function(msg) {
        $scope.selectedMessage    = msg;   // preliminary (for list highlight)
        $scope.messageParagraphs  = [];
        $scope.showingMessagePara = null;
        $scope.showingMsgParaIdx  = null;
        // Reset audio
        $scope.msgTimecodes    = [];
        $scope.msgAudioPlaying = false;
        $scope.msgAudioLoaded  = false;
        $scope.msgCalibrating  = false;
        $scope.msgStopMarkerIdx = null;
        stopMsgTimers();
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
                if (pendingQuickPara && String(pendingQuickPara.id) === String(r.data.ID)) {
                    // Arrived here from a quick paragraph result — activate it
                    var quickIdx = pendingQuickPara.idx;
                    pendingQuickPara = null;
                    activateMsgParaByIdx(quickIdx);
                } else {
                    pendingQuickPara = null; // stale (another message was opened meanwhile)
                    var q = ($scope.messageTextQuery || '').trim();
                    if (q.length >= 2) {
                        $timeout(function() {
                            var panel = document.getElementById('messages-para-panel');
                            var hl = panel && panel.querySelector('.search-hl');
                            if (hl) hl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }, 80);
                    }
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
                            $scope.$apply(function() {
                                $scope.msgAudioPlaying = false;
                                stopMsgTimers();
                            });
                        });
                        // Fallback sync (~4 Hz): the precise boundary timer
                        // does the on-time switching; this corrects any missed
                        // timer (tab throttling, drift) from the audio clock.
                        msgAudio.addEventListener('timeupdate', function() {
                            if (!$scope.msgAudioPlaying || $scope.msgCalibrating) return;
                            $scope.$applyAsync(function() { msgSyncToTime(); });
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

    // ── Message audio ↔ paragraph sync engine ────────────────────────
    // The displayed paragraph is DERIVED from the audio position: it is
    // always the last paragraph whose calibrated timecode has been reached.
    // Switching is driven by a timer armed for the exact next boundary, with
    // the timeupdate listener as a low-frequency safety net. All tracking is
    // index-based; string identity is never used (paragraph texts may repeat).

    /** Show paragraph #idx on the display (null = clear) and track it. */
    function showMsgParagraph(idx) {
        if (idx === null || $scope.messageParagraphs[idx] === undefined) {
            $scope.showingMsgParaIdx  = null;
            $scope.showingMessagePara = null;
            $http({ method: 'POST', url: '/ajax', data: {
                command: 'set_message_text', text: '', song_name: ''
            }});
            observerText('', '');
            return;
        }
        $scope.showingMsgParaIdx  = idx;
        $scope.showingMessagePara = $scope.messageParagraphs[idx];
        var msgTitle = $scope.selectedMessage ? $scope.selectedMessage.TITLE : '';
        $http({ method: 'POST', url: '/ajax', data: {
            command: 'set_message_text',
            text: $scope.messageParagraphs[idx],
            song_name: msgTitle
        }});
        observerText($scope.messageParagraphs[idx], msgTitle);
    }

    function scrollMsgParaIntoView(idx, block, delay, smooth) {
        $timeout(function() {
            var panel = document.getElementById('messages-para-panel');
            if (!panel) return;
            var el = panel.querySelectorAll('.bible-verse-item')[idx];
            if (el) el.scrollIntoView(smooth ? { block: block, behavior: 'smooth' } : { block: block });
        }, delay || 50);
    }

    /** Paragraph that must be on display at audio position ct (-1 = none yet). */
    function msgParaForTime(ct) {
        var n = Math.min($scope.msgTimecodes.length, $scope.messageParagraphs.length);
        var target = -1;
        for (var i = 0; i < n; i++) {
            if (ct >= $scope.msgTimecodes[i] - 0.03) target = i;
            else break;
        }
        return target;
    }

    /** Bring the display in line with the audio clock; re-arm the timer. */
    function msgSyncToTime() {
        if (!msgAudio || !$scope.msgAudioPlaying || $scope.msgCalibrating) return;
        var target = msgParaForTime(msgAudio.currentTime);
        if (target >= 0 && target !== $scope.showingMsgParaIdx) {
            // Stop marker: playback is leaving the marked paragraph — pause
            // at the boundary instead of advancing.
            if ($scope.msgStopMarkerIdx !== null &&
                $scope.showingMsgParaIdx === $scope.msgStopMarkerIdx &&
                target > $scope.msgStopMarkerIdx) {
                msgAudio.pause();
                $scope.msgAudioPlaying = false;
                $scope.msgCurrentTime  = msgAudio.currentTime;
                stopMsgTimers();
                return;
            }
            showMsgParagraph(target);
            scrollMsgParaIntoView(target, 'nearest');
        }
        armMsgBoundaryTimer();
    }

    function stopMsgBoundaryTimer() {
        if (msgAdvanceTimer) { $timeout.cancel(msgAdvanceTimer); msgAdvanceTimer = null; }
    }

    /** Arm a timer for the exact moment the next timecode is reached. */
    function armMsgBoundaryTimer() {
        stopMsgBoundaryTimer();
        if (!msgAudio || !$scope.msgAudioPlaying || $scope.msgCalibrating) return;
        var ct   = msgAudio.currentTime;
        var next = msgParaForTime(ct) + 1;
        var n    = Math.min($scope.msgTimecodes.length, $scope.messageParagraphs.length);
        if (next >= n) return;
        var rate  = msgAudio.playbackRate || 1;
        var delay = Math.max(10, (($scope.msgTimecodes[next] - ct) / rate) * 1000 + 15);
        msgAdvanceTimer = $timeout(function() {
            msgAdvanceTimer = null;
            msgSyncToTime();
        }, delay);
    }

    function stopMsgTimers() {
        if (msgTimerInterval) { $interval.cancel(msgTimerInterval); msgTimerInterval = null; }
        stopMsgBoundaryTimer();
    }

    function saveMsgTimecodesToDb() {
        if (!$scope.selectedMessage || $scope.msgTimecodes.length === 0) return;
        var tcStr = $scope.msgTimecodes.map(function(s) {
            return formatMsgTimecodePrecise(s);
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
        // Calibration mode: a mouse click always (re)captures the timecode for
        // this paragraph from the current audio position — including a click on
        // the paragraph that is already active. Checked first so the "repeated
        // click = Stop" rule below never intercepts a calibration capture.
        if ($scope.msgCalibrating && msgAudio && $scope.msgAudioLoaded) {
            // Snap to 0.05 s — fine enough that calibration is not off by a
            // perceptible amount, and preserved through save (see formatMsgTimecodePrecise).
            $scope.msgTimecodes[idx] = Math.round(msgAudio.currentTime * 20) / 20;
            showMsgParagraph(idx);
            saveMsgTimecodesToDb();
            return;
        }
        if ($scope.msgAudioPlaying && $scope.showingMsgParaIdx === idx) {
            $scope.stopMsgAudio();
            return;
        }
        if (msgAudio && $scope.msgAudioPlaying && $scope.msgTimecodes.length > idx) {
            msgAudio.currentTime = $scope.msgTimecodes[idx];
            armMsgBoundaryTimer();
        }
        // Toggle by index — string comparison is ambiguous for repeated texts
        showMsgParagraph($scope.showingMsgParaIdx === idx ? null : idx);
    };

    // Toggle an ephemeral "stop here" marker on a paragraph. During playback the
    // sermon plays continuously up to and including the marked paragraph, then
    // stops. Not persisted — lives only while the page is open.
    $scope.toggleMsgStopMarker = function(idx, $event) {
        if ($event) { $event.stopPropagation(); $event.preventDefault(); }
        $scope.msgStopMarkerIdx = ($scope.msgStopMarkerIdx === idx) ? null : idx;
    };

    $scope.toggleMsgAudio = function() {
        if (!msgAudio || !$scope.msgAudioLoaded) return;
        if ($scope.msgAudioPlaying) {
            msgAudio.pause();
            $scope.msgAudioPlaying = false;
            stopMsgTimers();
        } else {
            // Start from the active paragraph's timecode; with no active
            // paragraph resume from the current position — msgSyncToTime will
            // put the matching paragraph on display (never restarts from #0).
            var idx = $scope.showingMsgParaIdx;
            if (idx !== null && $scope.msgTimecodes[idx] !== undefined) {
                msgAudio.currentTime = $scope.msgTimecodes[idx];
            }
            msgAudio.play();
            $scope.msgAudioPlaying = true;
            // Update timer every 500 ms — no extra digest cycles
            msgTimerInterval = $interval(function() {
                $scope.msgCurrentTime = msgAudio ? msgAudio.currentTime : 0;
            }, 500);
            armMsgBoundaryTimer();
        }
    };

    // Rewind audio by a fixed step (calibration mode); clamps at 0
    $scope.rewindMsgAudio = function() {
        if (!msgAudio || !$scope.msgAudioLoaded) return;
        msgAudio.currentTime = Math.max(0, msgAudio.currentTime - 2);
        $scope.msgCurrentTime = msgAudio.currentTime;
    };

    $scope.stopMsgAudio = function() {
        if (!msgAudio) return;
        msgAudio.pause();
        msgAudio.currentTime = 0;
        $scope.msgAudioPlaying = false;
        $scope.msgCurrentTime  = 0;
        stopMsgTimers();
        // Clear active paragraph from display
        if ($scope.showingMsgParaIdx !== null || $scope.showingMessagePara !== null) {
            showMsgParagraph(null);
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
        observerText(text, refLabel);
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
                var combined = buildBibleCombinedText($scope.selectedBibleVerses);
                $scope.showingBibleVerse   = combined;
                sendBibleText(combined, buildBibleRefLabel($scope.selectedBibleVerses));
            }
            scrollBiblePanels();
            // Parallel data for the navigated chapter; re-sends when loaded.
            loadBibleParallel();
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
            enlargedImage: null,
            imageGroups: [],
            imgBuster: '',
            isNewSong: false
        };
        $scope.showEditDialog(true);
        $scope.loadSongImages();
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
            enlargedImage: null,
            imageGroups: [],
            imgBuster: '',
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

    // ── Image groups in the edit dialog (Aug 2026) ─────────────
    // Every group ("type") of the song's collection with the song's single
    // image in it. Uploads / deletions apply immediately (they are files,
    // not song fields). The classic "Картинка" row (deferred upload on
    // Save) is shown for NEW songs only.

    $scope.showEnlargedImage = function(src) {
        if (!src) return;
        $scope.editConfig.enlargedImage = src;
        jQuery('#enlarged-image-popup .modal').modal('show');
    };
    // Bootstrap 3 drops body.modal-open when the enlarged popup closes even
    // though the edit dialog below is still open — restore it.
    jQuery('#enlarged-image-popup .modal').on('hidden.bs.modal', function () {
        if (jQuery('#edit-song-popup .modal').hasClass('in')) jQuery('body').addClass('modal-open');
    });

    function applySongImages(groups) {
        if (!$scope.editConfig) return;
        $scope.editConfig.imageGroups = groups || [];
        $scope.editConfig.imgBuster   = '?t=' + new Date().getTime();
        // currentImage mirrors the main group's image (the legacy main sheet).
        var main = null;
        angular.forEach($scope.editConfig.imageGroups, function(g) { if (!main && g.is_main) main = g; });
        if (main) {
            $scope.editConfig.currentImage = main.image ? main.image + $scope.editConfig.imgBuster : null;
        }
    }

    $scope.loadSongImages = function() {
        var songId = $scope.editConfig && $scope.editConfig.songId;
        if (!songId) return;
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_song_images', song_id: songId } }).then(
            function(r) {
                if (!$scope.editConfig || $scope.editConfig.songId !== songId) return;
                if (r.data && r.data.status === 'success') applySongImages(r.data.groups);
            }
        );
    };

    function findImageGroup(gid) {
        var groups = ($scope.editConfig && $scope.editConfig.imageGroups) || [];
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].id === gid) return groups[i];
        }
        return null;
    }

    // Native onchange of the per-group file input (outside the digest):
    // the chosen file becomes the group's image (adds or replaces it).
    $scope.onGroupFileSelected = function(input) {
        var gid  = parseInt(input.getAttribute('data-gid'), 10);
        var file = input.files && input.files[0];
        input.value = '';
        var group = findImageGroup(gid);
        if (!group || !file || group.uploading) return;
        $scope.$applyAsync(function() { group.uploading = true; });

        var fd = new FormData();
        fd.append('command',  'upload_song_group_image');
        fd.append('song_id',  $scope.editConfig.songId);
        fd.append('group_id', gid);
        fd.append('image',    file);
        $http.post('/ajax', fd, { transformRequest: angular.identity, headers: { 'Content-Type': undefined } }).then(
            function(r) {
                group.uploading = false;
                var d = r.data;
                if (!d || d.status !== 'success') {
                    alert(window.t('settings.alert.imageUploadError') + (d && d.message ? '\n' + d.message : ''));
                    $scope.loadSongImages();
                    return;
                }
                applySongImages(d.groups);
                if (group.is_main) $scope.reloadFavorites();   // list thumbs show the main sheet
            },
            function() {
                group.uploading = false;
                alert(window.t('settings.alert.imageUploadError'));
            }
        );
    };

    $scope.deleteGroupImage = function(group) {
        if (!confirm(window.t('tech.esp.deleteImageConfirm', { group: group.name }))) return;
        $http({ method: 'POST', url: '/ajax', data: {
                command: 'delete_song_group_image',
                song_id: $scope.editConfig.songId,
                group_id: group.id } }).then(
            function(r) {
                var d = r.data;
                if (!d || d.status !== 'success') {
                    alert(d && d.message ? d.message : window.t('import.log.serverError'));
                    return;
                }
                applySongImages(d.groups);
                if (group.is_main) $scope.reloadFavorites();
            }
        );
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
                    var fileInput = document.getElementById('imageUpload');   // absent for saved songs (groups block instead)
                    if (fileInput && fileInput.files.length > 0) {
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
                    var fileInput = document.getElementById('imageUpload');   // absent for saved songs (groups block instead)
                    if (fileInput && fileInput.files.length > 0) {
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
            function success(response) {
                var data = response.data;
                // Server returns HTTP 200 even on failure
                // ({status:'error', message:...}). Don't treat that as
                // success — surface it instead of silently closing.
                if (!data || data.status !== 'success') {
                    var msg = (data && data.message) ? data.message : '';
                    console.log('Image upload failed: ', msg);
                    alert(window.t('settings.alert.imageUploadError') + (msg ? '\n' + msg : ''));
                    return;
                }
                if (callback) callback();
            },
            function error(erespond) {
                console.log('Image upload error: ', erespond);
                alert(window.t('settings.alert.imageUploadError'));
            }
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

        var currentIdx = ($scope.showingMsgParaIdx === null) ? -1 : $scope.showingMsgParaIdx;
        var nextIdx;

        if (currentIdx === -1) {
            nextIdx = dir === 1 ? 0 : list.length - 1;
        } else {
            nextIdx = currentIdx + dir;
            if (nextIdx < 0 || nextIdx >= list.length) return;
        }

        if ($scope.msgCalibrating && msgAudio && $scope.msgAudioLoaded) {
            // Calibration mode: arrow keys move to the adjacent paragraph and
            // seek the audio to its stored timecode. They do NOT record a new
            // timecode — capturing happens only on a mouse click.
            showMsgParagraph(nextIdx);
            if ($scope.msgTimecodes[nextIdx] !== undefined) {
                msgAudio.currentTime  = $scope.msgTimecodes[nextIdx];
                $scope.msgCurrentTime = msgAudio.currentTime;
            }
        } else {
            // During playback arrows behave like a click: seek the audio to
            // the paragraph's timecode so display and sound stay locked to
            // the calibrated times.
            if (msgAudio && $scope.msgAudioPlaying && $scope.msgTimecodes.length > nextIdx) {
                msgAudio.currentTime = $scope.msgTimecodes[nextIdx];
                armMsgBoundaryTimer();
            }
            showMsgParagraph(nextIdx);
        }

        scrollMsgParaIntoView(nextIdx, 'nearest');
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
    // DISPLAY TARGETS (technician-controlled, shared with leader/sermon pages)
    // ==========================================================

    // Load available targets (own group + approved) and the saved selections.
    // ==========================================================
    // OBSERVER CHANNEL (группа наблюдателей, Aug 2026)
    // ==========================================================
    // One toggle per GROUP, shared with the leader page (the DB row is
    // authoritative; observer_update keeps every console in sync). While it
    // is on, the console ADDITIONALLY tells the observers what it shows:
    // the song / verse (observer_set_song — observers pick language and
    // image type themselves) and the Bible verse / message paragraph as a
    // text overlay (observer_set_text; '' clears it and the song returns).
    // The existing screen commands are untouched; the server ignores the
    // observer commands while the toggle is off.
    $scope.observer = { active: false };

    function observerSong(song, verseIdx) {
        if (!$scope.observer.active || !song) return;
        var songId = parseInt(song.SONGID || song.ID) || 0;
        if (!songId) return;
        $http({ method: "POST", url: "/ajax",
            data: { command: 'observer_set_song',
                song_id: songId,
                verse_idx: (verseIdx == null || isNaN(verseIdx)) ? -1 : verseIdx,
                langs: getActiveLangs().map(function(l) { return l.code; }) } });
    }

    function observerOff() {
        if (!$scope.observer.active) return;
        $http({ method: "POST", url: "/ajax",
            data: { command: 'observer_set_song', song_id: 0, verse_idx: -1, langs: [] } });
    }

    function observerText(text, title) {
        if (!$scope.observer.active) return;
        $http({ method: "POST", url: "/ajax",
            data: { command: 'observer_set_text', text: text || '', title: title || '' } });
    }

    // Turning the toggle on pushes what the console shows right now.
    function observerResend() {
        if ($scope.showingBibleVerse && $scope.pageMode === 'bible') {
            var text = buildBibleCombinedText($scope.selectedBibleVerses);
            observerText(text, buildBibleRefLabel($scope.selectedBibleVerses));
            return;
        }
        if ($scope.showingMessagePara !== null && $scope.showingMsgParaIdx !== null) {
            observerText($scope.showingMessagePara, $scope.selectedMessage ? $scope.selectedMessage.TITLE : '');
            return;
        }
        if ($scope.showingSong) {
            var idx = -1;
            if ($scope.selectedChapters.length) {
                var m = String($scope.selectedChapters[0]).match(/\n\((\d+)\)$/);
                if (m) idx = parseInt(m[1]);
            }
            observerSong($scope.showingSong, idx);
        }
    }

    $scope.toggleObserver = function() {
        var next = !$scope.observer.active;
        $http({ method: "POST", url: "/ajax",
            data: { command: 'observer_set_active', active: next ? 1 : 0 } }).then(function(r) {
            var d = r.data || {};
            if (d.status !== 'ok') return;
            $scope.observer.active = !!parseInt(d.active);
            if ($scope.observer.active) observerResend();
        });
    };

    function loadObserverState() {
        $http({ method: "POST", url: "/ajax", data: { command: 'observer_get_state' } }).then(function(r) {
            $scope.observer.active = !!parseInt((r.data || {}).active);
        });
    }

    function loadDisplayTargetSettings() {
        $http.post('/ajax', { command: 'get_display_targets' }).then(function (r) {
            if (r.data && r.data.status === 'ok') {
                $scope.displayTargets = [
                    { group_id: null, display_name: window.t('sermon.broadcast.none') }
                ].concat(r.data.targets || []);
            }
        });
        $http.post('/ajax', { command: 'get_display_target_settings' }).then(function (r) {
            if (r.data && r.data.status === 'ok') {
                $scope.leaderDisplayTarget = (r.data.leader_display_target != null) ? r.data.leader_display_target : null;
                $scope.sermonDisplayTarget = (r.data.sermon_display_target != null) ? r.data.sermon_display_target : null;
            }
        });
    }

    // Persist a channel's target and broadcast it to the group (server-side WS).
    $scope.setDisplayTarget = function (channel) {
        var value = channel === 'leader' ? $scope.leaderDisplayTarget : $scope.sermonDisplayTarget;
        $http.post('/ajax', {
            command: 'set_display_target',
            channel: channel,
            target_group_id: (value == null ? null : value)
        });
    };

    $scope.loadAvailableGroups = function () {
        $http.post('/ajax', { command: 'get_available_groups' }).then(function (r) {
            if (r.data && r.data.status === 'ok') {
                $scope.availableGroups = r.data.groups || [];
            }
        });
    };

    $scope.$watch('showAccessRequestModal', function (newVal) {
        if (newVal) { $scope.loadAvailableGroups(); }
    });

    $scope.sendAccessRequest = function () {
        if (!$scope.selectedGroupForRequest) return;
        $http.post('/ajax', {
            command: 'request_display_access',
            target_group_id: parseInt($scope.selectedGroupForRequest)
        }).then(function (r) {
            if (r.data && r.data.status === 'ok') {
                alert(window.t('sermon.requestSent'));
                $scope.showAccessRequestModal = false;
                $scope.selectedGroupForRequest = '';
            } else {
                alert(window.t('sermon.errorPrefix', {
                    message: (r.data && r.data.message) || window.t('common.unknownError')
                }));
            }
        }, function () {
            alert(window.t('sermon.errorPrefix', { message: window.t('common.unknownError') }));
        });
    };

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

    // Monotonic counter for notes_update → get_notes fetches (see below).
    var notesSyncSeq = 0;

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
        } else if (message.type === 'access_response') {
            // Another group approved/rejected our request: refresh the target list.
            loadDisplayTargetSettings();
        } else if (message.type === 'observer_update') {
            // Shared group toggle: keep the console's button in sync with
            // the leader page / other consoles.
            $scope.$applyAsync(function() {
                $scope.observer.active = !!parseInt((message.data || {}).active);
            });
        } else if (message.type === 'leader_song_changed') {
            // The leader opened a song: follow it on the console (select the
            // song and prepare its verses) WITHOUT touching any screen — the
            // display write, if any, is already resolved server-side by the
            // leader-channel display target.
            var d = message.data || {};
            $scope.$apply(function() {
                $scope.reloadFavorites(function() {
                    for (var i = 0; i < $scope.favorites.length; i++) {
                        var f = $scope.favorites[i];
                        if (f.itemType === 'song' && f.LISTID == d.list_id && f.NUM == d.image_num) {
                            if ($scope.showingSong !== f) {
                                $scope.showingSong = f;
                                splitText(f);
                                $scope.showingChapter = null;
                                $scope.selectedChapters = [];
                            }
                            break;
                        }
                    }
                });
            });
        } else if (message.type === 'notes_update') {
            // Notes channel changed (leader or another console of this group
            // toggled a song): sync the console's song selection with it.
            // Off → drop the highlight and the verse list; on → select the
            // matching song. Idempotent for this console's own toggles.
            // Sequence-guarded: rapid toggles fire several events and the
            // get_notes responses can arrive out of order — an older response
            // must never overwrite a newer selection.
            // ($http.then runs inside a digest — no $apply needed.)
            var notesSeq = ++notesSyncSeq;
            $http({ method: 'POST', url: '/ajax', data: { command: 'get_notes' } }).then(function(r) {
                if (notesSeq !== notesSyncSeq) return; // stale response
                var img = (r.data && r.data.image) || '';
                if (!img) {
                    $scope.showingSong      = null;
                    $scope.preparedChapters = [];
                    $scope.showingChapter   = null;
                    $scope.selectedChapters = [];
                    return;
                }
                if ($scope.showingSong && $scope.showingSong.imageName === img) return;
                var m = img.match(/\/images\/(\d+)\/(.+)\.jpg/);
                if (!m) return;
                for (var i = 0; i < $scope.favorites.length; i++) {
                    var f = $scope.favorites[i];
                    if (f.itemType === 'song' && f.LISTID == m[1] && f.NUM == m[2]) {
                        $scope.showingSong = f;
                        splitText(f);
                        $scope.showingChapter = null;
                        $scope.selectedChapters = [];
                        break;
                    }
                }
            });
        } else if (message.type === 'leader_langs_changed') {
            // The leader switched languages in the split-screen verse mode:
            // mirror the selection on the console's shared language toggles so
            // the song verse chips show the same language(s). Only the songs
            // view is rebuilt here; the verse highlight is re-mapped by index
            // because the chip strings change with the language.
            var langCodes = (message.data && message.data.langs) || [];
            if (langCodes.length) {
                $scope.$apply(function() {
                    var langsChanged = false;
                    angular.forEach($scope.langList, function(l) {
                        var on = langCodes.indexOf(l.code) !== -1;
                        if (!!$scope.languages[l.code] !== on) {
                            $scope.languages[l.code] = on;
                            langsChanged = true;
                        }
                    });
                    if (!langsChanged || !$scope.showingSong) return;
                    var selIdx = $scope.selectedChapters.map(function(ch) {
                        var m = ch.match(/\((\d+)\)$/);
                        return m ? m[1] : null;
                    }).filter(function(x) { return x !== null; });
                    splitText($scope.showingSong);
                    $scope.selectedChapters = [];
                    if (selIdx.length) {
                        $scope.restoreChaptersFromSongName(selIdx.join(','), $scope.showingSong);
                        if ($scope.selectedChapters.length === 1) {
                            $scope.showingChapter = $scope.selectedChapters[0];
                        } else if ($scope.selectedChapters.length > 1) {
                            $scope.showingChapter = $scope.selectedChapters.map(function(ch) {
                                return ch.replace(/\n\(\d+\)$/, '');
                            }).join('\r\n');
                        } else {
                            $scope.showingChapter = null;
                        }
                    }
                });
            }
        }
    });

    // ==========================================================
    // RESTORE CURRENT STATE
    // ==========================================================

    function restoreCurrentState() {
        $http({ method: "POST", url: "/ajax", data: { command: 'get_current_state' } }).then(
            function(response) {
                var state = response.data;

                // The selected song comes from the NOTES CHANNEL (current_notes)
                // ONLY. The screen row is never used as a fallback: with shared
                // display targets it can hold a song image broadcast by ANOTHER
                // group, which must not select anything on this console.
                var songImgRe = /\/images\/\d+\/.+\.jpg/;
                var songImg = (state.notes_image && state.notes_image.match(songImgRe))
                    ? state.notes_image
                    : '';

                // Determine what type of state we're restoring to avoid clearing it prematurely
                var isRestoringBible = state.text && state.song_name &&
                    state.song_name.match(/\d+:\d+/);
                var isRestoringMessage = !isRestoringBible && state.text && state.song_name;
                var isRestoringSong = !!songImg;   // notes coexist with any screen content
                var isRestoringMedia = !isRestoringBible && !isRestoringMessage &&
                    !!((state.image && !state.image.match(songImgRe)) || state.video_src);

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
                    $scope.showingMsgParaIdx  = null;
                }
                if (!isRestoringMedia) {
                    $scope.activeMediaItem = null;
                }

                // Restore song from the notes channel (or a song-image row)
                if (songImg) {
                    var matches = songImg.match(/\/images\/(\d+)\/(.+)\.jpg/);
                    if (matches) {
                        var listId = parseInt(matches[1]);
                        var songNum = matches[2];

                        // Find and select the song in favorites
                        for (var i = 0; i < $scope.favorites.length; i++) {
                            if ($scope.favorites[i].LISTID == listId && $scope.favorites[i].NUM == songNum) {
                                $scope.showingSong = $scope.favorites[i];
                                // Split text to prepare chapters
                                splitText($scope.favorites[i]);
                                // No verse indices in DB — the verse is off
                                // (e.g. screen cleared while notes stay up):
                                // drop any stale selection from this console.
                                if (!state.chapter_indices || !state.chapter_indices.match(/^\d+(,\d+)*$/)) {
                                    $scope.showingChapter   = null;
                                    $scope.selectedChapters = [];
                                }
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

                // Restore message paragraph if song_name doesn't match other
                // patterns. Requires an empty image: a Bible ref without a
                // verse number ("Иоанна 3") is indistinguishable from a
                // message title here, and quotes may now sit on top of a notes
                // image — without this guard the console would flip into
                // messages mode on a plain Bible verse click.
                if (state.text && state.song_name && !state.song_name.match(/\d+:\d+/) && !state.image) {
                    // Switch to messages mode if needed
                    if ($scope.pageMode !== 'messages') {
                        $scope.pageMode = 'messages';
                    }

                    // If message is already loaded and paragraphs exist, restore selection
                    if ($scope.selectedMessage && $scope.selectedMessage.TITLE === state.song_name && $scope.messageParagraphs.length > 0) {
                        // Find the matching paragraph in messageParagraphs list
                        var foundPara = null;
                        var foundIdx  = null;
                        for (var i = 0; i < $scope.messageParagraphs.length; i++) {
                            if ($scope.messageParagraphs[i] === state.text) {
                                foundPara = $scope.messageParagraphs[i];
                                foundIdx  = i;
                                break;
                            }
                        }
                        $scope.showingMessagePara = foundPara || state.text;
                        $scope.showingMsgParaIdx  = foundIdx;
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
                                                $scope.showingMsgParaIdx  = k;
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
                var mediaFromFavorites = false;
                if (state.image && !state.image.match(/\/images\/\d+\/\d+\.jpg/)) {
                    // This is a media image, not a song image
                    for (var i = 0; i < $scope.favorites.length; i++) {
                        if ($scope.favorites[i].itemType === 'image' && $scope.favorites[i].src === state.image) {
                            $scope.activeMediaItem = $scope.favorites[i];
                            mediaFromFavorites = true;
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
                            mediaFromFavorites = true;
                            break;
                        }
                    }
                    // If not found in favorites, create temporary item
                    if (!$scope.activeMediaItem) {
                        $scope.activeMediaItem = { src: state.video_src, itemType: 'video' };
                    }
                }

                // Detect content that didn't originate from this technician's UI
                // (typical case: preacher pushed a sermon item to this display).
                $scope.externalContentActive = computeExternalContent(state, mediaFromFavorites);
            }
        );
    }

    // External = something is on the main display that this tech's UI did not
    // produce. Sermon-only markers (__slide__, /sermon_images/, sermon_videos,
    // YouTube videos) are unconditional. Bible/message/song/media count as
    // external only when no local anchor matched during restoreCurrentState.
    function computeExternalContent(state, mediaFromFavorites) {
        var hasContent = !!(state.image || state.text || state.video_src);
        if (!hasContent) return false;

        if (state.image === '__slide__') return true;
        if (state.image && state.image.indexOf('/sermon_images/') === 0) return true;
        if (state.video_src && state.video_src.indexOf('/sermon_videos/') === 0) return true;
        if (state.video_src && /youtube\.com|youtu\.be/.test(state.video_src)) return true;

        if (state.text && state.song_name) {
            if (state.song_name.match(/\d+:\d+/)) {
                return !$scope.showingBibleVerse;
            }
            return !$scope.showingMessagePara;
        }

        if (state.image && state.image.match(/\/images\/\d+\/.+\.jpg/)) {
            return !$scope.showingSong;
        }

        if (state.image || state.video_src) {
            return !mediaFromFavorites;
        }

        return false;
    }

    // Tech-side override that clears whatever is currently shown on this
    // group's main display (e.g. a sermon push) and notifies the preacher's
    // sermon page (via a global WS broadcast) so its right panel and active
    // chip reset, mirroring a second click on the displayed element.
    $scope.disableExternalDisplay = function () {
        $http({ method: 'POST', url: '/ajax', data: { command: 'disable_external_display' } });
        $scope.externalContentActive = false;
        // The screen goes blank: drop every active-content highlight on the
        // console. showingSong stays — the musician's notes survive the clear.
        $scope.showingChapter      = null;
        $scope.selectedChapters    = [];
        $scope.showingBibleVerse   = null;
        $scope.selectedBibleVerses = [];
        $scope.showingMessagePara  = null;
        $scope.showingMsgParaIdx   = null;
        $scope.activeMediaItem     = null;
        $scope.techVideoPlaying    = false;
    };

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
    loadDisplayTargetSettings();  // Load shared display targets (leader/sermon channels)
    loadObserverState();          // Shared "broadcast to the group" toggle (observer channel)

    // Restore state immediately after favorites are loaded
    $scope.reloadFavorites(function() {
        restoreCurrentState();
    });

});