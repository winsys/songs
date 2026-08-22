/**
 * Observer page (Aug 2026) — for any church member on a phone.
 *
 * Search mode: songs (number / name / words, client-side over the allowed
 * collections), the Bible (translation → book → chapter, plus a word search)
 * and the messages (title/code list, plus a word search returning
 * paragraphs). Everything opens in a dark full-viewport viewer; a tap on the
 * content toggles "fullscreen" (bars hidden + best-effort browser
 * fullscreen). A song shows its lyrics in any language or its sheet-music
 * image of any type (image group); the choice is remembered for the browser
 * session. The viewing history lives in sessionStorage only.
 *
 * Group mode: passive. The page follows the OBSERVER CHANNEL
 * (current_observer + WS `observer_update`): the leader's "broadcast to the
 * group" toggle and the song / verse the leader has open. The observer picks
 * text language or image type on the own screen; a verse from the leader's
 * verse mode is shown alone, auto-fitted to the screen. Nothing on this page
 * ever writes shared state: all Ajax calls are read-only.
 */
app.controller('Observer', ['$scope', '$http', '$q', '$timeout', 'SongsService', function ($scope, $http, $q, $timeout, SongsService)
{
    var uiLang = String(window.UI_LANG || 'ru').toLowerCase();
    var NO_IMAGE_LANGS = ['ru', 'de', 'en', 'lt'];
    var noImageSrc = '/no_image/' + (NO_IMAGE_LANGS.indexOf(uiLang) !== -1 ? uiLang : 'ru') + '.png';

    // ─── Small helpers ──────────────────────────────────────────
    function lower(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е'); }
    function norm(s)  { return lower(s).replace(/\s+/g, ' ').trim(); }
    function textCol(lang) { return 'TEXT' + (lang.col_suffix || ''); }
    function nameCol(lang) { return 'NAME' + (lang.col_suffix || ''); }
    function langByCode(code) {
        for (var i = 0; i < $scope.langList.length; i++) {
            if ($scope.langList[i].code === code) return $scope.langList[i];
        }
        return null;
    }
    function hasLang(langs, code) {
        for (var i = 0; i < langs.length; i++) if (langs[i].code === code) return true;
        return false;
    }
    // Languages the song has lyrics in (group order).
    function langsWithText(song) {
        return $scope.langList.filter(function (l) {
            return String(song[textCol(l)] || '').trim().length > 0;
        });
    }
    // Display markers the main screen replaces ('$ $' page break, $*****$
    // dot row, stray '$') — same pipeline as the leader / main screen.
    function cleanMarkers(s) {
        var text = String(s || '');
        text = text.replace('$ $', '\r\n-----\r\n');
        text = text.replace(/\$(\*{5,})\$/g, function (m, stars) { return '·'.repeat(stars.length); });
        return text.replace('$', '');
    }
    // One block per source line (verse), empty lines dropped.
    function textBlocks(raw) {
        return cleanMarkers(raw).split(/\r?\n/).map(function (l) { return l.trim(); })
            .filter(function (l) { return l.length > 0; });
    }
    function findGroup(groups, id) {
        for (var i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i];
        return null;
    }
    function firstWithImage(groups) {
        for (var i = 0; i < groups.length; i++) if (groups[i].image) return groups[i];
        return null;
    }
    function groupByName(groups, name, orig) {
        var wanted = [name, orig].filter(Boolean).map(function (s) { return String(s).toLowerCase(); });
        if (!wanted.length) return null;
        for (var i = 0; i < groups.length; i++) {
            var n = String(groups[i].name || '').toLowerCase();
            var o = String(groups[i].orig_name || '').toLowerCase();
            if (wanted.indexOf(n) !== -1 || (o && wanted.indexOf(o) !== -1)) return groups[i];
        }
        return null;
    }
    function storageGet(key, fallback) {
        try {
            var v = JSON.parse(sessionStorage.getItem(key));
            return (v === null || v === undefined) ? fallback : v;
        } catch (e) { return fallback; }
    }
    function storageSet(key, val) {
        try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
    }
    function requestFs(el) {
        if (!el) return;
        var req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return;   // iPhone Safari: no element fullscreen — the fixed overlay is the fullscreen
        try {
            var p = req.call(el);
            if (p && p.catch) p.catch(function () {});
        } catch (e) { /* ignore */ }
    }
    function exitFs() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            var exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) { try { exit.call(document); } catch (e) { /* ignore */ } }
        }
    }
    function scrollContentTop(elId) {
        $timeout(function () {
            var root = document.getElementById(elId);
            var c = root ? root.querySelector('.obs-vcontent') : null;
            if (c) c.scrollTop = 0;
        }, 0);
    }
    function scrollToId(id) {
        $timeout(function () {
            var el = document.getElementById(id);
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
        }, 60);
    }

    $scope.moreText = function (n) { return window.t('observer.more', { count: n }); };

    // ─── State ──────────────────────────────────────────────────
    $scope.tab = 'songs';
    $scope.langList = [];
    $scope.visibleSongLists = [];
    $scope.searchSongList = [];
    $scope.songsLoaded = false;
    $scope.wsConnected = null;

    $scope.songs = { q: '', listId: 0, results: [], more: false };
    $scope.bible = { translations: [], tr: null, trId: null, langs: [], lang: null,
                     books: [], book: null, chapters: [], chapter: null, loaded: false,
                     q: '', results: [], searching: false };
    $scope.msgs  = { all: [], loaded: false, q: '', results: [], more: false,
                     tq: '', paraResults: [], searching: false };
    $scope.history = storageGet('observerHistory', []);
    if (!Array.isArray($scope.history)) $scope.history = [];

    // Reading font size (px) for lyrics / chapters / messages.
    $scope.fontPx = parseInt(storageGet('observerFontPx', 0)) || 22;
    $scope.fontStep = function (dir) {
        $scope.fontPx = Math.max(14, Math.min(44, $scope.fontPx + dir * 2));
        storageSet('observerFontPx', $scope.fontPx);
    };

    // Content viewer (search mode) and the group-mode screen share the song
    // view logic: .song, .langs (with text), .groups, .view, .blocks, .imageSrc.
    $scope.viewer = { open: false, fs: false, kind: '', title: '', hl: null,
                      song: null, langs: [], groups: [], view: { kind: 'none' },
                      blocks: [], verses: [], paras: [], imageSrc: '', shownGroupId: null, loadedAt: 0, msg: null };
    $scope.group  = { on: false, fs: false, active: false, songId: 0, verseIdx: -1, leaderLangs: [],
                      song: null, langs: [], groups: [], view: { kind: 'none' },
                      blocks: [], imageSrc: '', shownGroupId: null, loadedAt: 0, verseText: '' };

    var langsReady = SongsService.getLanguages().then(function (langs) {
        $scope.langList = langs || [];
        return $scope.langList;
    });

    $scope.setTab = function (tab) {
        $scope.tab = tab;
        if (tab === 'bible') ensureBible();
        if (tab === 'messages') ensureMessages();
    };

    // ─── Remembered song view (text language / image type) ─────
    var PREF_KEY = 'observerSongView';
    function loadPref() {
        var p = storageGet(PREF_KEY, null);
        return (p && typeof p === 'object') ? p : { kind: 'text', lang: uiLang };
    }
    function savePref(p) { storageSet(PREF_KEY, p); }

    function viewValid(t, view) {
        if (!view) return false;
        if (view.kind === 'text')  return hasLang(t.langs, view.lang);
        if (view.kind === 'image') return !!findGroup(t.groups, view.groupId);
        if (view.kind === 'none')  return !t.langs.length && !t.groups.length;
        return false;
    }

    // Preferred view for a song: the remembered image type (by name — the
    // defaults exist in every collection), else the remembered / UI /
    // leader's / first language with text, else the first image, else none.
    function resolveView(t) {
        var pref = loadPref();
        if (pref.kind === 'image' && t.groups.length) {
            var g = groupByName(t.groups, pref.groupName, pref.groupOrig) || firstWithImage(t.groups) || t.groups[0];
            return { kind: 'image', groupId: g.id };
        }
        if (t.langs.length) {
            var code = null;
            if (pref.kind === 'text' && pref.lang && hasLang(t.langs, pref.lang)) code = pref.lang;
            if (!code && hasLang(t.langs, uiLang)) code = uiLang;
            if (!code && t.leaderLangs) {
                for (var i = 0; i < t.leaderLangs.length; i++) {
                    if (hasLang(t.langs, t.leaderLangs[i])) { code = t.leaderLangs[i]; break; }
                }
            }
            if (!code) code = t.langs[0].code;
            return { kind: 'text', lang: code };
        }
        if (t.groups.length) {
            var fw = firstWithImage(t.groups) || t.groups[0];
            return { kind: 'image', groupId: fw.id };
        }
        return { kind: 'none' };
    }

    function renderSongView(t) {
        if (!t.song) return;
        if (!viewValid(t, t.view)) t.view = resolveView(t);
        var view = t.view;
        t.blocks = []; t.imageSrc = ''; t.shownGroupId = null;
        if (view.kind === 'text') {
            var lang = langByCode(view.lang);
            t.blocks = textBlocks(lang ? t.song[textCol(lang)] : '');
        } else if (view.kind === 'image') {
            var g = findGroup(t.groups, view.groupId);
            var shown = (g && g.image) ? g : firstWithImage(t.groups);
            t.shownGroupId = shown ? shown.id : null;
            t.imageSrc = (shown && shown.image) ? shown.image + '?t=' + t.loadedAt : noImageSrc;
        }
    }

    $scope.setView = function (t, kind, val) {
        if (t === $scope.viewer && t.kind === 'bible')   { $scope.setBibleLang(val); return; }
        if (t === $scope.viewer && t.kind === 'message') { t.view = { kind: 'text', lang: val }; renderMessage(); return; }
        if (kind === 'text') {
            t.view = { kind: 'text', lang: val };
            savePref({ kind: 'text', lang: val });
        } else {
            var g = findGroup(t.groups, val);
            t.view = { kind: 'image', groupId: val };
            savePref({ kind: 'image', groupName: g ? g.name : '', groupOrig: g ? g.orig_name : '' });
        }
        renderSongView(t);
        if (t === $scope.group) renderGroupVerse();
    };

    $scope.onImageError = function (which) {
        var t = which === 'group' ? $scope.group : $scope.viewer;
        if (String(t.imageSrc).indexOf(noImageSrc) === 0) return;
        $scope.$applyAsync(function () { t.imageSrc = noImageSrc; });
    };

    // ─── Fullscreen (bars hidden + best-effort browser fullscreen) ─
    $scope.toggleFs = function (t, elId) {
        if (t === $scope.group && !t.song) return;   // waiting screen keeps its buttons
        t.fs = !t.fs;
        if (t.fs) requestFs(document.getElementById(elId)); else exitFs();
        if (t === $scope.group) renderGroupVerse();
    };
    function onFsChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement) return;
        $scope.$applyAsync(function () {
            $scope.viewer.fs = false;
            $scope.group.fs = false;
            renderGroupVerse();
        });
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // ─── Viewer ─────────────────────────────────────────────────
    var songOpenSeq = 0, chapterSeq = 0, msgOpenSeq = 0;

    function openViewer(kind, title, hl) {
        var v = $scope.viewer;
        songOpenSeq++; chapterSeq++; msgOpenSeq++;
        v.open = true; v.fs = false; v.kind = kind; v.title = title; v.hl = (hl == null ? null : hl);
        v.song = null; v.langs = []; v.groups = []; v.view = { kind: 'none' };
        v.blocks = []; v.verses = []; v.paras = []; v.imageSrc = ''; v.shownGroupId = null; v.msg = null;
        v.loadedAt = new Date().getTime();
        scrollContentTop('obsViewer');
    }

    $scope.closeViewer = function () {
        var v = $scope.viewer;
        songOpenSeq++; chapterSeq++; msgOpenSeq++;
        v.open = false; v.fs = false;
        exitFs();
    };

    // ─── History (sessionStorage: gone when the tab closes) ─────
    function pushHistory(item) {
        item.key = item.k + ':' + item.id + ':' + (item.extra || '');
        $scope.history = $scope.history.filter(function (h) { return h.key !== item.key; });
        $scope.history.unshift(item);
        if ($scope.history.length > 40) $scope.history.length = 40;
        storageSet('observerHistory', $scope.history);
    }
    $scope.clearHistory = function () {
        $scope.history = [];
        storageSet('observerHistory', []);
    };
    $scope.openHistory = function (h) {
        if (h.k === 'song') {
            ensureSongs().then(function (songs) {
                for (var i = 0; i < songs.length; i++) {
                    if (String(songs[i].ID) === String(h.id)) { $scope.openSong(songs[i]); return; }
                }
            });
        } else if (h.k === 'bible') {
            openBibleRef(h.trId, h.id, parseInt(h.extra), null);
        } else if (h.k === 'msg') {
            $scope.openMessage(h.id, -1);
        }
    };

    // ─── Songs ──────────────────────────────────────────────────
    var songsReady = null;
    function ensureSongs() {
        if (songsReady) return songsReady;
        songsReady = langsReady.then(function () {
            return SongsService.getVisibleSongLists();
        }).then(function (lists) {
            $scope.visibleSongLists = lists || [];
            return SongsService.getSongsForSearch($scope.visibleSongLists.map(function (l) { return l.LIST_ID; }));
        }).then(function (songs) {
            songs = songs || [];
            songs.forEach(function (s, i) {
                s._i = i;
                s._nNum  = norm(s.NUM);
                s._nName = norm(s.NAME);
                var parts = [];
                $scope.langList.forEach(function (l) {
                    var t = s[textCol(l)];
                    if (t) parts.push(String(t));
                });
                s._text  = parts.join('\n');
                s._lText = lower(s._text);
            });
            $scope.searchSongList = songs;
            $scope.songsLoaded = true;
            $scope.songsChanged();
            return songs;
        }, function () {
            console.error('observer.js: failed to load songs');
            $scope.songsLoaded = true;
            return [];
        });
        return songsReady;
    }

    $scope.setSongList = function (listId) {
        $scope.songs.listId = listId || 0;
        $scope.songsChanged();
    };

    function snippet(s, token) {
        var pos = s._lText.indexOf(token);
        if (pos < 0) return '';
        var start = Math.max(0, pos - 30);
        var end   = Math.min(s._text.length, pos + token.length + 70);
        var out = s._text.substring(start, end).replace(/\s*\r?\n\s*/g, ' / ').trim();
        return (start > 0 ? '…' : '') + out + (end < s._text.length ? '…' : '');
    }

    // Client-side search: exact number, number prefix, all words in the
    // name, all words in the lyrics (any language, snippet shown).
    $scope.songsChanged = function () {
        var st = $scope.songs;
        var q = norm(st.q);
        var listId = st.listId;
        var pool = listId
            ? $scope.searchSongList.filter(function (s) { return String(s.LISTID) === String(listId); })
            : $scope.searchSongList;
        var LIMIT = q ? 60 : 500;
        if (!q) {
            st.results = listId ? pool.slice(0, LIMIT) : [];
            st.more = listId ? pool.length > LIMIT : false;
            return;
        }
        var tokens = q.split(' ').filter(Boolean);
        var hits = [];
        pool.forEach(function (s) {
            var score = null, snip = '';
            if (s._nNum === q) score = 0;
            else if (s._nNum.indexOf(q) === 0) score = 1;
            else if (tokens.every(function (t) { return s._nName.indexOf(t) !== -1; })) score = 2;
            else if (tokens.every(function (t) { return s._lText.indexOf(t) !== -1; })) { score = 3; snip = snippet(s, tokens[0]); }
            if (score !== null) hits.push({ s: s, score: score, snip: snip });
        });
        hits.sort(function (a, b) { return (a.score - b.score) || (a.s._i - b.s._i); });
        st.results = hits.slice(0, LIMIT).map(function (h) { h.s._snip = h.snip; return h.s; });
        st.more = hits.length > LIMIT;
    };

    $scope.openSong = function (s) {
        openViewer('song', s.NUM + ' — ' + s.NAME + (s.bookName ? '  ·  ' + s.bookName : ''), null);
        var v = $scope.viewer;
        var seq = songOpenSeq;
        v.song = s;
        v.langs = langsWithText(s);
        v.groups = [];
        v.view = null;
        // Lyrics right away; when the remembered view is an image, wait for
        // the groups to avoid a text → image flash.
        if (loadPref().kind === 'image') v.view = { kind: 'loading' };
        else renderSongView(v);
        pushHistory({ k: 'song', id: s.ID, ico: '🎵', title: s.NUM + ' — ' + s.NAME, sub: s.bookName || '' });

        $http({ method: 'POST', url: '/ajax', data: { command: 'get_song_images', song_id: s.ID } }).then(function (r) {
            if (seq !== songOpenSeq || !v.open || v.song !== s) return;
            var d = r.data || {};
            if (d.status !== 'success') { if (v.view && v.view.kind === 'loading') { v.view = null; renderSongView(v); } return; }
            v.groups = d.groups || [];
            if (!v.view || v.view.kind === 'loading' || v.view.kind === 'none') v.view = null;
            renderSongView(v);
        }, function () {
            if (seq !== songOpenSeq) return;
            if (v.view && v.view.kind === 'loading') { v.view = null; renderSongView(v); }
        });
    };

    // ─── Bible ──────────────────────────────────────────────────
    var bibleReady = null, bibleSearchSeq = 0, chaptersSeq = 0;

    function ensureBible() {
        if (bibleReady) return bibleReady;
        bibleReady = langsReady.then(function () {
            return $http({ method: 'POST', url: '/ajax', data: { command: 'get_bible_translations' } });
        }).then(function (r) {
            var list = r.data || [];
            $scope.bible.translations = list;
            var pick = null;
            list.forEach(function (t) { if (!pick && String(t.LANG).toLowerCase() === uiLang) pick = t; });
            list.forEach(function (t) { if (!pick && (t.supported_langs || []).indexOf(uiLang) !== -1) pick = t; });
            if (!pick) pick = list[0] || null;
            return pick ? $scope.setTranslation(pick) : null;
        });
        return bibleReady;
    }

    $scope.setTranslation = function (t) {
        var b = $scope.bible;
        b.tr = t; b.trId = t.ID;
        var supported = t.supported_langs || [];
        b.langs = $scope.langList.filter(function (l) { return supported.indexOf(l.code) !== -1; });
        if (!b.langs.length) b.langs = $scope.langList.filter(function (l) { return l.code === String(t.LANG).toLowerCase(); });
        if (!b.langs.length && $scope.langList.length) b.langs = [$scope.langList[0]];
        if (!b.lang || !hasLang(b.langs, b.lang)) {
            b.lang = hasLang(b.langs, uiLang) ? uiLang
                   : (hasLang(b.langs, String(t.LANG).toLowerCase()) ? String(t.LANG).toLowerCase()
                   : (b.langs[0] ? b.langs[0].code : null));
        }
        b.books = []; b.book = null; b.chapters = []; b.chapter = null; b.results = []; b.loaded = false;
        return $http({ method: 'POST', url: '/ajax', data: { command: 'get_bible_books', translation_id: t.ID } }).then(function (r) {
            if (b.trId !== t.ID) return;
            b.books = r.data || [];
            b.loaded = true;
            if (b.q.length >= 3) bibleSearch();
        });
    };

    $scope.setBibleLang = function (code) {
        var b = $scope.bible;
        if (!code || b.lang === code) return;
        b.lang = code;
        var v = $scope.viewer;
        if (v.open && v.kind === 'bible') {
            v.view = { kind: 'text', lang: code };
            v.verses = (v.verseRows || []).map(verseRow);
        }
    };

    function bibleLangObj() { return langByCode($scope.bible.lang); }

    $scope.bookName = function (book) {
        if (!book) return '';
        var l = bibleLangObj();
        if (l && book[nameCol(l)]) return book[nameCol(l)];
        if (book.NAME) return book.NAME;
        for (var i = 0; i < $scope.langList.length; i++) {
            var alt = book[nameCol($scope.langList[i])];
            if (alt) return alt;
        }
        return '';
    };

    function verseRow(v) {
        var l = bibleLangObj();
        var text = (l && v[textCol(l)]) ? v[textCol(l)] : (v.TEXT || '');
        return { num: parseInt(v.VERSE_NUM), text: String(text) };
    }

    $scope.selectBook = function (book) {
        var b = $scope.bible;
        b.book = book; b.chapters = []; b.chapter = null;
        var seq = ++chaptersSeq;
        return $http({ method: 'POST', url: '/ajax', data: { command: 'get_bible_chapters', book_id: book.ID } }).then(function (r) {
            if (seq !== chaptersSeq) return;
            b.chapters = r.data || [];
        });
    };

    $scope.backToBooks = function () {
        $scope.bible.book = null;
        $scope.bible.chapters = [];
        $scope.bible.chapter = null;
    };

    $scope.openChapter = function (c, hl) {
        var b = $scope.bible;
        var book = b.book;
        if (!book) return;
        b.chapter = c;
        var seq = ++chapterSeq;
        var title = $scope.bookName(book) + ' ' + c;
        return $http({ method: 'POST', url: '/ajax',
                       data: { command: 'get_bible_verses', book_id: book.ID, chapter_num: c } }).then(function (r) {
            if (seq !== chapterSeq) return;
            var rows = r.data || [];
            openViewer('bible', title, hl || null);
            var v = $scope.viewer;
            v.verseRows = rows;
            v.verses = rows.map(verseRow);
            v.langs = b.langs;
            v.view = { kind: 'text', lang: b.lang };
            pushHistory({ k: 'bible', id: book.ID, extra: String(c), trId: b.trId, ico: '📖',
                          title: title, sub: b.tr ? b.tr.NAME : '' });
            if (hl) scrollToId('obsv' + hl);
        });
    };

    $scope.canStep = function (dir) {
        var b = $scope.bible;
        var i = b.chapters.indexOf(b.chapter);
        return i !== -1 && !!b.chapters[i + dir];
    };
    $scope.chapterStep = function (dir) {
        var b = $scope.bible;
        var i = b.chapters.indexOf(b.chapter);
        if (i === -1 || !b.chapters[i + dir]) return;
        $scope.openChapter(b.chapters[i + dir], null);
    };

    $scope.bibleSearchChanged = function () {
        var b = $scope.bible;
        if (b.q.length < 3) { b.results = []; b.searching = false; return; }
        ensureBible().then(bibleSearch);
    };
    function bibleSearch() {
        var b = $scope.bible;
        if (!b.trId || b.q.length < 3) return;
        var seq = ++bibleSearchSeq;
        b.searching = true;
        $http({ method: 'POST', url: '/ajax',
                data: { command: 'search_bible_verses', translation_id: b.trId, query: b.q } }).then(function (r) {
            if (seq !== bibleSearchSeq) return;
            b.results = r.data || [];
            b.searching = false;
        }, function () { if (seq === bibleSearchSeq) b.searching = false; });
    }
    $scope.bibleResultRef = function (r) {
        var l = bibleLangObj();
        var name = (l && r['BOOK_NAME' + (l.col_suffix || '')]) ? r['BOOK_NAME' + (l.col_suffix || '')] : (r.BOOK_NAME || '');
        return name + ' ' + r.CHAPTER_NUM + ':' + r.VERSE_NUM;
    };
    $scope.bibleResultText = function (r) {
        var l = bibleLangObj();
        return (l && r[textCol(l)]) ? r[textCol(l)] : (r.TEXT || '');
    };
    $scope.openBibleResult = function (r) {
        openBibleRef($scope.bible.trId, r.BOOK_ID, parseInt(r.CHAPTER_NUM), parseInt(r.VERSE_NUM));
    };

    // Open a chapter by translation / book id / chapter (search result, history).
    function openBibleRef(trId, bookId, chapter, verse) {
        ensureBible().then(function () {
            var b = $scope.bible;
            var chain = $q.resolve();
            if (String(b.trId) !== String(trId)) {
                var tr = null;
                b.translations.forEach(function (t) { if (String(t.ID) === String(trId)) tr = t; });
                if (!tr) return;
                chain = $scope.setTranslation(tr);
            }
            chain.then(function () {
                var book = null;
                b.books.forEach(function (bk) { if (String(bk.ID) === String(bookId)) book = bk; });
                if (!book) return;
                if (!b.book || b.book.ID !== book.ID) $scope.selectBook(book);
                $scope.openChapter(chapter, verse);
                $scope.tab = 'bible';
            });
        });
    }

    // ─── Messages ───────────────────────────────────────────────
    var msgsReady = null, msgSearchSeq = 0;

    function ensureMessages() {
        if (msgsReady) return msgsReady;
        msgsReady = langsReady.then(function () {
            return $http({ method: 'POST', url: '/ajax', data: { command: 'observer_list_messages' } });
        }).then(function (r) {
            $scope.msgs.all = r.data || [];
            $scope.msgs.loaded = true;
            $scope.msgsFilter();
        });
        return msgsReady;
    }

    $scope.msgTitle = function (m) {
        if (!m) return '';
        return (m.CODE ? m.CODE + '  ·  ' : '') + (m.TITLE || '');
    };

    $scope.msgsFilter = function () {
        var m = $scope.msgs;
        var q = norm(m.q);
        var pool = q
            ? m.all.filter(function (x) { return norm((x.CODE || '') + ' ' + (x.TITLE || '') + ' ' + (x.CITY || '')).indexOf(q) !== -1; })
            : m.all;
        var LIMIT = 200;
        m.results = pool.slice(0, LIMIT);
        m.more = pool.length > LIMIT;
    };

    $scope.msgsTextChanged = function () {
        var m = $scope.msgs;
        var tq = String(m.tq || '').trim();
        if (tq.length < 2) { m.paraResults = []; m.searching = false; return; }
        var seq = ++msgSearchSeq;
        m.searching = true;
        $http({ method: 'POST', url: '/ajax',
                data: { command: 'search_message_paragraphs', title_query: '', text_query: tq } }).then(function (r) {
            if (seq !== msgSearchSeq) return;
            m.paraResults = r.data || [];
            m.searching = false;
        }, function () { if (seq === msgSearchSeq) m.searching = false; });
    };

    function renderMessage() {
        var v = $scope.viewer;
        var l = v.view ? langByCode(v.view.lang) : null;
        var text = (l && v.msg) ? (v.msg[textCol(l)] || '') : '';
        v.paras = String(text).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    $scope.openMessage = function (id, paraIdx) {
        var seq = ++msgOpenSeq;
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_message', id: id } }).then(function (r) {
            if (seq !== msgOpenSeq) return;
            var msg = r.data;
            if (!msg) return;
            var langs = $scope.langList.filter(function (l) { return String(msg[textCol(l)] || '').trim().length > 0; });
            openViewer('message', $scope.msgTitle(msg), (paraIdx >= 0 ? paraIdx : null));
            var v = $scope.viewer;
            v.msg = msg;
            v.langs = langs;
            var code = hasLang(langs, uiLang) ? uiLang : (langs[0] ? langs[0].code : null);
            v.view = { kind: 'text', lang: code };
            renderMessage();
            pushHistory({ k: 'msg', id: msg.ID, ico: '✉️', title: $scope.msgTitle(msg), sub: msg.CITY || '' });
            if (paraIdx >= 0) scrollToId('obsp' + paraIdx);
            $scope.tab = 'messages';
        });
    };

    // ─── Group mode (observer channel) ──────────────────────────
    var groupSeq = 0;

    function groupVerseText() {
        var g = $scope.group;
        if (!g.song || g.verseIdx < 0 || !g.view || g.view.kind !== 'text') return '';
        // Own language first, then the leader's selection, then the group's
        // language order — same line index in every language (tech/leader
        // verse contract: split by \r\n).
        var order = [g.view.lang].concat(g.leaderLangs || []);
        $scope.langList.forEach(function (l) { order.push(l.code); });
        var seen = {};
        for (var i = 0; i < order.length; i++) {
            var code = order[i];
            if (!code || seen[code]) continue;
            seen[code] = true;
            var l = langByCode(code);
            if (!l) continue;
            var lines = String(g.song[textCol(l)] || '').split('\r\n');
            var line = (lines[g.verseIdx] || '').trim();
            if (line) return cleanMarkers(line).trim();
        }
        return '';
    }

    // Fit the single verse to the content box (largest font that fits both
    // dimensions; floor the wrap width — integer scrollWidth vs fractional
    // box width, see the main screen's adjustTextSize).
    function fitVerse(_retry) {
        $timeout(function () {
            var inner = document.getElementById('obsGverseInner');
            if (!inner) return;
            var box = inner.parentElement;
            var text = $scope.group.verseText;
            inner.textContent = text;
            if (!text) { inner.style.fontSize = ''; return; }
            var availW = box.clientWidth * 0.92;
            var availH = box.clientHeight * 0.92;
            if (availH <= 20 || availW <= 20) {
                if ((_retry || 0) < 10) fitVerse((_retry || 0) + 1);
                return;
            }
            var wrapW = Math.floor(availW);
            inner.style.width = wrapW + 'px';
            var lo = 10, hi = 400, best = 10;
            for (var i = 0; i < 20; i++) {
                var mid = (lo + hi) / 2;
                inner.style.fontSize = mid + 'px';
                if (inner.scrollHeight <= availH + 1 && inner.scrollWidth <= wrapW + 2) {
                    best = mid; lo = mid;
                } else {
                    hi = mid;
                }
            }
            inner.style.fontSize = best + 'px';
        }, 30);
    }

    function renderGroupVerse() {
        var g = $scope.group;
        g.verseText = groupVerseText();
        if (g.verseText) fitVerse();
    }

    function clearGroupSong() {
        var g = $scope.group;
        g.song = null; g.langs = []; g.groups = []; g.blocks = []; g.imageSrc = '';
        g.shownGroupId = null; g.verseText = ''; g.view = { kind: 'none' };
    }

    function setGroupSong(song) {
        var g = $scope.group;
        g.song = song;
        g.langs = langsWithText(song);
        g.groups = song.groups || [];
        g.loadedAt = new Date().getTime();
        g.view = null;   // re-resolve from the remembered preference
    }

    function renderGroup() {
        var g = $scope.group;
        if (g.song) renderSongView(g);
        renderGroupVerse();
    }

    // Apply a channel state ({active, song_id, verse_idx, langs[, song]}).
    // `full` = response of observer_get_state (song included); WS events
    // carry only the compact state and trigger a fetch on a song change.
    function applyGroupState(d, full) {
        var g = $scope.group;
        g.active = !!parseInt(d.active);
        var sid = parseInt(d.song_id) || 0;
        // A clear event outranks any fetch still in flight (its response
        // could otherwise resurrect the song the leader just closed).
        if (!full && sid === 0) groupSeq++;
        g.leaderLangs = Array.isArray(d.langs) ? d.langs : [];
        g.verseIdx = (sid > 0 && d.verse_idx != null) ? parseInt(d.verse_idx) : -1;
        if (sid !== g.songId || (sid > 0 && !g.song)) {
            g.songId = sid;
            if (sid > 0) {
                if (full && d.song) setGroupSong(d.song);
                else if (!full) { fetchGroupState(); return; }
                else { clearGroupSong(); g.songId = 0; }
            } else {
                clearGroupSong();
            }
        }
        renderGroup();
    }

    function fetchGroupState() {
        var seq = ++groupSeq;
        $http({ method: 'POST', url: '/ajax', data: { command: 'observer_get_state' } }).then(function (r) {
            if (seq !== groupSeq || !$scope.group.on) return;
            applyGroupState(r.data || {}, true);
        });
    }

    $scope.enterGroup = function () {
        $scope.closeViewer();
        var g = $scope.group;
        g.on = true; g.fs = false;
        g.songId = 0; clearGroupSong();
        storageSet('observerGroup', 1);
        fetchGroupState();
    };

    $scope.leaveGroup = function () {
        var g = $scope.group;
        groupSeq++;
        g.on = false; g.fs = false;
        exitFs();
        storageSet('observerGroup', 0);
    };

    // Re-fit the verse when the viewport changes (debounced: mobile address bar).
    var resizeTimer = null;
    function scheduleRefit() {
        if (!$scope.group.on || !$scope.group.verseText) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { resizeTimer = null; fitVerse(); }, 200);
    }
    window.addEventListener('resize', scheduleRefit);
    window.addEventListener('orientationchange', scheduleRefit);

    // ─── WebSocket ──────────────────────────────────────────────
    var wsDisconnectTimer = null;
    window.createAuthenticatedWebSocket(
        null,
        function (data) {
            if (data.type !== 'observer_update') return;
            $scope.$applyAsync(function () {
                var d = data.data || {};
                if ($scope.group.on) applyGroupState(d, false);
                else $scope.group.active = !!parseInt(d.active);   // status dot only
            });
        },
        null,
        function (connected) {
            if (connected) {
                if (wsDisconnectTimer) { clearTimeout(wsDisconnectTimer); wsDisconnectTimer = null; }
                $scope.$applyAsync(function () {
                    $scope.wsConnected = true;
                    // Catch events missed while offline.
                    if ($scope.group.on) fetchGroupState();
                });
            } else {
                wsDisconnectTimer = setTimeout(function () {
                    wsDisconnectTimer = null;
                    $scope.$applyAsync(function () { $scope.wsConnected = false; });
                }, 5000);
            }
        }
    );

    // ─── Init ───────────────────────────────────────────────────
    ensureSongs();
    // Status dot on the group button before the first event arrives.
    $http({ method: 'POST', url: '/ajax', data: { command: 'observer_get_state' } }).then(function (r) {
        if (!$scope.group.on) $scope.group.active = !!parseInt((r.data || {}).active);
    });
    if (parseInt(storageGet('observerGroup', 0)) === 1) $scope.enterGroup();
}]);
