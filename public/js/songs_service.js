/**
 * SongsService — общие Ajax-вызовы, используемые в нескольких контроллерах.
 *
 * Зачем: loadSongLists и loadLanguages были продублированы дословно
 * в leader.js и tech.js. Сервис убирает дублирование и делает запросы
 * параллельными там, где раньше они шли последовательно.
 *
 * Использование:
 *   app.controller('MyCtrl', function($scope, SongsService) {
 *       SongsService.getVisibleSongLists().then(function(lists) {
 *           $scope.visibleSongLists = lists;
 *       });
 *       SongsService.getLanguages().then(function(langs) {
 *           $scope.langList = langs;
 *       });
 *   });
 */
app.service('SongsService', function ($http, $q) {

    /**
     * Загрузить списки песен с учётом настроек пользователя.
     * Оба запроса выполняются параллельно через $q.all.
     * @returns {Promise<Array>} — отфильтрованный список, готовый для visibleSongLists
     */
    this.getVisibleSongLists = function () {
        return $q.all({
            lists:    $http.post('/ajax', { command: 'get_all_song_lists' }),
            settings: $http.post('/ajax', { command: 'get_user_settings' })
        }).then(function (results) {
            var allLists = results.lists.data   || [];
            var settings = results.settings.data;

            if (settings && settings.available_lists) {
                var selectedIds = settings.available_lists.split(',').map(function(id) { return id.trim(); });
                // Preserve the order defined in available_lists
                return selectedIds
                    .map(function(id) {
                        for (var i = 0; i < allLists.length; i++) {
                            if (String(allLists[i].LIST_ID) === id) return allLists[i];
                        }
                        return null;
                    })
                    .filter(Boolean);
            }
            return allLists;
        });
    };

    /**
     * Загрузить все песни из указанных сборников для поиска.
     * @param {Array} listIds — массив числовых ID сборников
     * @returns {Promise<Array>}
     */
    this.getSongsForSearch = function (listIds) {
        if (!listIds || !listIds.length) return $q.resolve([]);
        return $http.post('/ajax', { command: 'get_songs_for_search', list_ids: listIds.join(',') })
            .then(function (r) { return r.data || []; });
    };

    /**
     * Загрузить список языков.
     * @returns {Promise<Array>} — массив объектов языка [{code, label, col_suffix, is_default}, ...]
     */
    this.getLanguages = function () {
        return $http.post('/ajax', { command: 'get_languages' })
            .then(function (r) { return r.data || []; });
    };

    // ─── Song search (leader, tech console, piano) ──────────────────
    // The search fields use it as angucomplete's local-search
    // ("songLocalSearch" on the scope). The widget's own search found only
    // an exact piece of the default-language TEXT: a skipped comma
    // («Вот, настал»), е for ё, double spaces, words out of order and the
    // lyrics in the other languages (TEXT_LT, TEXT_EN, …) all missed.
    // Here every query word must occur in the number + name, or in the
    // lyrics of any language. Ranked: exact number, number prefix, name,
    // the query as a phrase in the lyrics, its words anywhere in the lyrics.

    var SONG_SEARCH_LIMIT = 150;
    // Punctuation / whitespace → one space (explicit list: \p{L} needs
    // newer Safari than some church tablets run).
    var SEARCH_SEP = /[\s.,;:!?¡¿"'`´«»„“”‘’‚‹›()\[\]{}\-‐‑–—―…*\/\\|_~@#$%^&+=<>·•]+/g;

    // Latin letters with diacritics → the bare letter, one character for one
    // (the observer page cuts its snippets at the positions found in the
    // folded text): «viskas imanoma» finds «Viskas įmanoma», «sirdis» —
    // «širdis» (Lithuanian, Polish, German, … typed without the marks).
    // Cyrillic is left alone: й / и are different letters.
    var FOLD_GROUPS = {
        a: 'ąàáâãäåāă', c: 'ćčç', d: 'ďđ', e: 'ęėèéêëěē', i: 'įìíîïī',
        l: 'łľĺ', n: 'ńňñ', o: 'óòôõöøőō', r: 'ŕř', s: 'śšş', t: 'ťţ',
        u: 'ųūùúûüůű', y: 'ýÿ', z: 'źżž'
    };
    var FOLD_MAP = {}, foldChars = '';
    Object.keys(FOLD_GROUPS).forEach(function (base) {
        var g = FOLD_GROUPS[base];
        for (var i = 0; i < g.length; i++) FOLD_MAP[g.charAt(i)] = base;
        foldChars += g;
    });
    var FOLD_RE = new RegExp('[' + foldChars + ']', 'g');
    function foldChar(c) { return FOLD_MAP[c]; }

    /** Lowercase, ё → е, Latin diacritics dropped; the length never changes. */
    function searchFold(s) {
        return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е')
            .replace(FOLD_RE, foldChar);
    }
    this.searchFold = searchFold;

    function searchNorm(s) {
        return searchFold(s).replace(SEARCH_SEP, ' ').trim();
    }

    function stripZeros(n) { return n.replace(/^0+(?=\d)/, ''); }

    // Normalized number / name / lyrics, cached on the song row (rows are
    // replaced on every reload of the search list, so it never goes stale).
    function songSearchIndex(song) {
        if (song._sx) return song._sx;
        var texts = [];
        for (var k in song) {
            if (/^TEXT(_[A-Z]+)?$/.test(k) && song[k]) texts.push(song[k]);
        }
        var num = searchNorm(song.NUM);
        song._sx = {
            num:  num,
            bare: stripZeros(num),
            head: ' ' + num + ' ' + searchNorm(song.NAME) + ' ',
            text: ' ' + searchNorm(texts.join('\n')) + ' '
        };
        return song._sx;
    }

    function allIn(tokens, s) {
        for (var i = 0; i < tokens.length; i++) {
            if (s.indexOf(tokens[i]) === -1) return false;
        }
        return true;
    }

    /** angucomplete local-search: (query, songs) → matching songs, best first. */
    this.songLocalSearch = function (query, songs) {
        var q = searchNorm(query);
        if (!q || !songs) return [];
        var tokens = q.split(' ');
        var qBare  = stripZeros(q);
        var hits = [];
        for (var i = 0; i < songs.length; i++) {
            var x = songSearchIndex(songs[i]);
            var score = -1;
            if (x.num === q || x.bare === qBare)                         score = 0;
            else if (x.num.indexOf(q) === 0 || x.bare.indexOf(qBare) === 0) score = 1;
            else if (allIn(tokens, x.head))                              score = 2;
            else if (x.text.indexOf(q) !== -1)                           score = 3;
            else if (allIn(tokens, x.text))                              score = 4;
            if (score >= 0) hits.push({ s: songs[i], score: score, i: i });
        }
        hits.sort(function (a, b) { return (a.score - b.score) || (a.i - b.i); });
        return hits.slice(0, SONG_SEARCH_LIMIT).map(function (h) { return h.s; });
    };

});
