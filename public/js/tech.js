app.controller('Tech', function ($scope, $http, $timeout)
{
    // ── Songs mode state ──────────────────────────────────────
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.preparedChapters = [];
    $scope.showingSong = null;
    $scope.showingChapter = null;
    $scope.selectedChapters = [];
    $scope.availableSongLists = [];
    $scope.visibleSongLists = [];

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

    // ── Page mode ─────────────────────────────────────────────
    $scope.pageMode = 'songs';  // 'songs' | 'bible' | 'messages'

    // ── Language selection ────────────────────────────────────
    $scope.languages = {
        ru: true,
        lt: false,
        en: false
    };


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
        $scope.languages[lang] = !$scope.languages[lang];
        // Keep at least one language enabled
        if (!$scope.languages.ru && !$scope.languages.lt && !$scope.languages.en) {
            $scope.languages.ru = true;
        }
        // Refresh display
        if ($scope.pageMode === 'songs' && $scope.showingSong) {
            splitText($scope.showingSong.TEXT, $scope.showingSong.TEXT_LT, $scope.showingSong.TEXT_EN);
        }
        if ($scope.pageMode === 'bible' && $scope.bibleVerses.length > 0) {
            $scope.biblePreparedVerses = prepareBibleVerses($scope.bibleVerses);
        }
    };


    // ==========================================================
    // SONGS MODE — load helpers
    // ==========================================================

    $scope.loadSongLists = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_song_lists' } }).then(
            function success(respond){
                $scope.availableSongLists = respond.data;
                $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
                    function success(settingsRespond){
                        if (settingsRespond.data && settingsRespond.data.available_lists) {
                            var selectedListIds = settingsRespond.data.available_lists.split(',');
                            $scope.visibleSongLists = $scope.availableSongLists.filter(function(list) {
                                return selectedListIds.indexOf(String(list.LIST_ID)) !== -1;
                            });
                        } else {
                            $scope.visibleSongLists = $scope.availableSongLists;
                        }
                    },
                    function error(){
                        $scope.visibleSongLists = $scope.availableSongLists;
                    }
                );
            },
            function error(erespond){
                console.log('Ajax call error: ', erespond);
            });
    };

    function splitText(src, srcLt, srcEn){
        if(src){
            var ruChapters = src.split("\r\n");
            var ltChapters = srcLt ? srcLt.split("\r\n") : [];
            var enChapters = srcEn ? srcEn.split("\r\n") : [];

            $scope.preparedChapters = [];
            angular.forEach(ruChapters, function(value, key){
                var verseParts = [];
                if($scope.languages.ru && value) {
                    verseParts.push(value);
                }
                if($scope.languages.lt && ltChapters[key]) {
                    verseParts.push(ltChapters[key]);
                }
                if($scope.languages.en && enChapters[key]) {
                    verseParts.push(enChapters[key]);
                }
                var combinedVerse = verseParts.join('\r\n- - - - - - - -\r\n');
                $scope.preparedChapters[key] = combinedVerse + '\n(' + key + ')';
            });
        } else {
            $scope.preparedChapters = [];
        }
        return $scope.preparedChapters;
    }

    $scope.reloadFavorites = function()
    {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_image' } }).then(
            function success(respond){
                let current = respond.data;
                if (current.length === 0){
                    $scope.curImage = null;
                    $scope.curChapter = null;
                    $scope.preparedChapters = [];
                } else {
                    if( $scope.curImage !== current[0].image || $scope.curChapter !== current[0].text ){
                        $scope.curImage = current[0].image;
                        $scope.curChapter = current[0].text;
                    }
                }
                $http({ method: "POST", url: "/ajax", data: {command: 'get_favorites_with_text' } }).then(
                    function success(respond){
                        $scope.favorites = respond.data;
                        angular.forEach($scope.favorites, function(value, key){
                            if(($scope.curImage) && (value.imageName === $scope.curImage)) {
                                $scope.showingSong = value;
                                $scope.preparedChapters = splitText(value.TEXT, value.TEXT_LT, value.TEXT_EN);
                                angular.forEach($scope.preparedChapters, function (value, key) {
                                    if (value === $scope.curChapter) {
                                        $scope.showingChapter = value;
                                    }
                                });
                            }
                        });
                    },
                    function error(erespond){
                        console.log('Ajax call error: ',erespond);
                    });
            },
            function error(erespond){
                console.log('Ajax call error: ',erespond);
            });
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
            splitText(aText, favoriteItem.TEXT_LT, favoriteItem.TEXT_EN);
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
                var ruChapters = $scope.showingSong.TEXT ? $scope.showingSong.TEXT.split("\r\n") : [];
                var ltChapters = $scope.showingSong.TEXT_LT ? $scope.showingSong.TEXT_LT.split("\r\n") : [];
                var enChapters = $scope.showingSong.TEXT_EN ? $scope.showingSong.TEXT_EN.split("\r\n") : [];
                var languageParts = [];

                var verseIndices = $scope.selectedChapters.map(function(chapter) {
                    var match = chapter.match(/\n\((\d+)\)$/);
                    return match ? parseInt(match[1]) : -1;
                }).filter(function(idx) { return idx >= 0; });

                if ($scope.languages.ru) {
                    var ruVerses = verseIndices.map(function(idx) { return ruChapters[idx]; }).filter(function(v) { return v; });
                    if (ruVerses.length > 0) languageParts.push(ruVerses.join('\r\n'));
                }
                if ($scope.languages.lt) {
                    var ltVerses = verseIndices.map(function(idx) { return ltChapters[idx]; }).filter(function(v) { return v; });
                    if (ltVerses.length > 0) languageParts.push(ltVerses.join('\r\n'));
                }
                if ($scope.languages.en) {
                    var enVerses = verseIndices.map(function(idx) { return enChapters[idx]; }).filter(function(v) { return v; });
                    if (enVerses.length > 0) languageParts.push(enVerses.join('\r\n'));
                }

                var combinedText = languageParts.join('\r\n- - - - - - - -\r\n');
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: combinedText,
                        song_name: $scope.showingSong.NAME }
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
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: cleanText,
                        song_name: $scope.showingSong.NAME }
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
                    if (song.hasTextRu === '1') langs.push('RU');
                    if (song.hasTextLt === '1') langs.push('LT');
                    if (song.hasTextEn === '1') langs.push('EN');
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
        if( typeof item !== 'undefined' ){
            $http({ method: "POST", url: "/ajax", data: {command: 'add_to_favorites', id: item.originalObject.ID } }).then(
                function success(){
                    $scope.reloadFavorites();
                    $scope.$broadcast('angucomplete-alt:clearInput');
                },
                function error(erespond){
                    console.log('Ajax call error: ',erespond);
                });
        }
    };

    $scope.clearFavorites = function(){
        if($scope.favorites.length > 0)
            $scope.confirmationDialog("Список выбранных песен", function() {
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

    $scope.deleteFavoriteItem = function(fav_id, fav_title){
        $scope.confirmationDialog(fav_title, function(){
            var deletingItem = null;
            angular.forEach($scope.favorites, function(item) {
                if (item.FID === fav_id) deletingItem = item;
            });
            var isDeletingCurrentSong = ($scope.showingSong && deletingItem &&
                $scope.showingSong.FID === deletingItem.FID);
            $http({ method: "POST", url: "/ajax", data: {command: 'delete_favorite_item', id: fav_id } }).then(
                function success(){
                    if (isDeletingCurrentSong) {
                        $http({ method: "POST", url: "/ajax", data: { command: 'clear_image' } });
                        $scope.showingSong = null;
                        $scope.preparedChapters = [];
                        $scope.showingChapter = null;
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
            function success(respond) {
                $scope.bibleBooks = respond.data;
            },
            function error(erespond) {
                console.log('Ajax call error: ', erespond);
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
            var parts = [];
            var verseNum = verse.VERSE_NUM;

            if ($scope.languages.ru && verse.TEXT) {
                parts.push(verseNum + '. ' + verse.TEXT);
            }
            if ($scope.languages.lt && verse.TEXT_LT) {
                parts.push(verseNum + '. ' + verse.TEXT_LT);
            }
            if ($scope.languages.en && verse.TEXT_EN) {
                parts.push(verseNum + '. ' + verse.TEXT_EN);
            }

            if (parts.length === 0) return; // skip empty verses

            var combined = parts.join('\r\n- - - - - - - -\r\n');
            result.push(combined + '\n(' + idx + ')');
        });
        return result;
    }

    /**
     * Get book display name based on active languages.
     */
    $scope.getBibleBookName = function(book) {
        if (!book) return '';
        if ($scope.languages.lt && book.NAME_LT) return book.NAME_LT;
        if ($scope.languages.en && book.NAME_EN) return book.NAME_EN;
        return book.NAME;
    };

    /**
     * Get verse display text for search results.
     */
    $scope.getBibleVerseDisplay = function(verse) {
        if ($scope.languages.ru && verse.TEXT) return verse.TEXT;
        if ($scope.languages.lt && verse.TEXT_LT) return verse.TEXT_LT;
        if ($scope.languages.en && verse.TEXT_EN) return verse.TEXT_EN;
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
            $scope.selectedBibleVerses = [];

            if ($scope.showingBibleVerse === verseText) {
                sendBibleText('', '');
                $scope.showingBibleVerse = null;
            } else {
                $scope.selectedBibleVerses = [verseText];
                var cleanText = verseText.replace(/\n\(\d+\)$/, '');
                sendBibleText(cleanText, refLabel);
                $scope.showingBibleVerse = verseText;
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

        var ruParts = [], ltParts = [], enParts = [];

        verseIndices.forEach(function(idx) {
            var verse = $scope.bibleVerses[idx];
            if (!verse) return;
            var num = verse.VERSE_NUM;
            if ($scope.languages.ru && verse.TEXT)    ruParts.push(num + '. ' + verse.TEXT);
            if ($scope.languages.lt && verse.TEXT_LT) ltParts.push(num + '. ' + verse.TEXT_LT);
            if ($scope.languages.en && verse.TEXT_EN) enParts.push(num + '. ' + verse.TEXT_EN);
        });

        var languageParts = [];
        if (ruParts.length > 0) languageParts.push(ruParts.join('\r\n'));
        if (ltParts.length > 0) languageParts.push(ltParts.join('\r\n'));
        if (enParts.length > 0) languageParts.push(enParts.join('\r\n'));

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
        $scope.selectedMessage   = msg;
        $scope.messageParagraphs = [];
        $scope.showingMessagePara = null;

        $http({ method: "POST", url: "/ajax", data: {
                command: 'get_message',
                id: msg.ID
            }}).then(function(r) {
            if (r.data && r.data.TEXT) {
                // Split by newline — each line is a paragraph (same as song verses)
                var lines = r.data.TEXT.split(/\r?\n/);
                $scope.messageParagraphs = lines.filter(function(l) {
                    return l.trim().length > 0;
                });
                $scope.selectedMessage = r.data; // full data with TEXT
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
            return (book.NAME    && book.NAME.toLowerCase().indexOf(q)    >= 0) ||
                (book.NAME_LT && book.NAME_LT.toLowerCase().indexOf(q) >= 0) ||
                (book.NAME_EN && book.NAME_EN.toLowerCase().indexOf(q) >= 0);
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
        $scope.listConfig = { buttons: [{ label: 'Выбрать', action: callback }] };
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
            title: 'УДАЛЕНИЕ',
            message: 'Удалить [' + msg + ']?',
            buttons: [{ label: 'Да', action: callback }]
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
                { label: 'Сделать фото', action: callback },
                { label: 'Сохранить',    action: callback }
            ]
        };
        $scope.addSongPopup(true);
    };
    $scope.addSongPopup = function(flag) {
        jQuery("#add-song-popup .modal").modal(flag ? 'show' : 'hide');
    };

    $scope.editFavorite = function(listItem) {
        $scope.editConfig = {
            title: 'Редактирование песни',
            songId: listItem.ID,
            songText:   listItem.TEXT   || '',
            songTextLt: listItem.TEXT_LT || '',
            songTextEn: listItem.TEXT_EN || '',
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
        $scope.editConfig = {
            title: 'Добавление новой песни',
            songId: null,
            songText: '',
            songTextLt: '',
            songTextEn: '',
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

    $scope.saveSongEdits = function() {
        var textWithCRLF   = $scope.editConfig.songText.replace(/\r?\n/g, '\r\n');
        var textLtWithCRLF = $scope.editConfig.songTextLt   || ''.replace(/\r?\n/g, '\r\n');
        var textEnWithCRLF = $scope.editConfig.songTextEn   || ''.replace(/\r?\n/g, '\r\n');
        if ($scope.editConfig.isNewSong) {
            $http({ method: "POST", url: "/ajax",
                data: { command: 'create_song',
                    list_id: $scope.listId,
                    text: textWithCRLF,
                    text_lt: textLtWithCRLF,
                    text_en: textEnWithCRLF,
                    name: $scope.editConfig.songName } }).then(
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
                data: { command: 'update_song',
                    id: $scope.editConfig.songId,
                    text: textWithCRLF,
                    text_lt: textLtWithCRLF,
                    text_en: textEnWithCRLF,
                    name: $scope.editConfig.songName } }).then(
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

    const socket = new WebSocket("wss://" + window.location.host + "/ws");

    console.log(socket);

    socket.onmessage = function(event) {
        let data = JSON.parse(event.data);
        if (data.type === 'update_needed') {
            $scope.$apply(function() {
                $scope.reloadFavorites();
            });
        }
    };


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
    // INIT
    // ==========================================================

    $scope.loadSongLists();
    $scope.reloadFavorites();
    $scope.reloadSongList();

});