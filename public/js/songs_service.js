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
                var selectedIds = settings.available_lists.split(',');
                return allLists.filter(function (list) {
                    return selectedIds.indexOf(String(list.LIST_ID)) !== -1;
                });
            }
            return allLists;
        });
    };

    /**
     * Загрузить список языков.
     * @returns {Promise<Array>} — массив объектов языка [{code, label, col_suffix, is_default}, ...]
     */
    this.getLanguages = function () {
        return $http.post('/ajax', { command: 'get_languages' })
            .then(function (r) { return r.data || []; });
    };

});
