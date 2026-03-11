/**
 * ImportCtrl — контроллер страницы "Импорт данных"
 * Поддерживает импорт:
 *   - Сборников песен (SOG-текст + ZIP-картинки)
 *   - Посланий (SOG-текст)
 */
angular.module('Songs').controller('ImportCtrl', function ($scope, $http, $timeout) {

    // ── Общее ────────────────────────────────────────────────
    $scope.tab = 'songs';

    // ── Послания ─────────────────────────────────────────────
    $scope.msgLang       = 'ru';
    $scope.selectedMsgFile = null;
    $scope.msgImporting  = false;
    $scope.msgProgress   = 0;
    $scope.msgLog        = [];

    // ── Послания (ввод текстом) ───────────────────────────────
    $scope.txtCode      = '';
    $scope.txtTitle     = '';
    $scope.txtCity      = '';
    $scope.txtBody      = '';
    $scope.txtParaSep   = 'emptyline';
    $scope.txtImporting = false;

    // ── Сборники ─────────────────────────────────────────────
    $scope.songLists      = [];
    $scope.songListId     = '';
    $scope.songLang       = 'ru';
    $scope.newListName    = '';
    $scope.creating       = false;
    $scope.selectedSogFile = null;
    $scope.selectedZipFile = null;
    $scope.songImporting  = false;
    $scope.zipImporting   = false;
    $scope.songProgress   = 0;
    $scope.zipProgress    = 0;
    $scope.songLog        = [];

    // ── Послания ─────────────────────────────────────────────
    $scope.msgLang       = 'ru';
    $scope.selectedMsgFile = null;
    $scope.msgImporting  = false;
    $scope.msgProgress   = 0;
    $scope.msgLog        = [];

    $scope.txtMode      = 'new';

    // ─────────────────────────────────────────────────────────
    // Загрузить список сборников
    // ─────────────────────────────────────────────────────────
    function loadSongLists() {
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_all_song_lists' } }).then(
            function (r) { $scope.songLists = r.data || []; }
        );
    }
    loadSongLists();

    // ─────────────────────────────────────────────────────────
    // Создать новый сборник
    // ─────────────────────────────────────────────────────────
    $scope.createSongList = function () {
        if (!$scope.newListName) return;
        $scope.creating = true;
        $http({ method: 'POST', url: '/ajax', data: { command: 'create_song_list', name: $scope.newListName } }).then(
            function (r) {
                $scope.creating = false;
                if (r.data && r.data.status === 'success') {
                    $scope.newListName = '';
                    loadSongLists();
                    $scope.songListId = r.data.list_id;
                    songLog('ok', 'Сборник создан, ID=' + r.data.list_id);
                } else {
                    songLog('error', 'Ошибка: ' + (r.data && r.data.message ? r.data.message : 'неизвестная'));
                }
            },
            function () { $scope.creating = false; songLog('error', 'Ошибка соединения'); }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Выбор файлов
    // ─────────────────────────────────────────────────────────
    $scope.onSongSogSelected = function () {
        var f = document.getElementById('songSogFile');
        $scope.$apply(function () {
            $scope.selectedSogFile = f && f.files[0] ? f.files[0] : null;
        });
    };

    $scope.onSongZipSelected = function () {
        var f = document.getElementById('songZipFile');
        $scope.$apply(function () {
            $scope.selectedZipFile = f && f.files[0] ? f.files[0] : null;
        });
    };

    $scope.onMsgSogSelected = function () {
        var f = document.getElementById('msgSogFile');
        $scope.$apply(function () {
            $scope.selectedMsgFile = f && f.files[0] ? f.files[0] : null;
        });
    };

    // ─────────────────────────────────────────────────────────
    // Helpers: лог
    // ─────────────────────────────────────────────────────────
    function songLog(type, msg) {
        $scope.songLog.push({ type: type, msg: msg });
        $timeout(function () {
            var el = document.getElementById('songLogEl');
            if (el) el.scrollTop = el.scrollHeight;
        }, 50);
    }

    function msgLog(type, msg) {
        $scope.msgLog.push({ type: type, msg: msg });
        $timeout(function () {
            var el = document.getElementById('msgLogEl');
            if (el) el.scrollTop = el.scrollHeight;
        }, 50);
    }

    // ─────────────────────────────────────────────────────────
    // Импорт текстов песен (SOG)
    // Разбор происходит на СЕРВЕРЕ (PHP), клиент только отправляет файл.
    // ─────────────────────────────────────────────────────────
    $scope.importSongsSog = function () {
        if (!$scope.selectedSogFile || !$scope.songListId) return;
        $scope.songImporting = true;
        $scope.songProgress  = 0;
        $scope.songLog       = [];
        songLog('ok', 'Начинаем импорт текстов…');

        var fd = new FormData();
        fd.append('command',  'import_songs_sog');
        fd.append('list_id',  $scope.songListId);
        fd.append('lang',     $scope.songLang);
        fd.append('sogfile',  $scope.selectedSogFile);

        $http.post('/ajax', fd, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.songImporting = false;
                $scope.songProgress  = 100;
                var d = r.data;
                if (d.status === 'success') {
                    songLog('ok', '✅ Импорт завершён. Добавлено/обновлено: ' + d.updated + ', ошибок: ' + d.errors);
                    if (d.log && d.log.length) {
                        angular.forEach(d.log, function (l) { songLog(l.type, l.msg); });
                    }
                } else {
                    songLog('error', '❌ ' + (d.message || 'Ошибка сервера'));
                }
            },
            function () { $scope.songImporting = false; songLog('error', '❌ Ошибка соединения'); }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Импорт картинок (ZIP)
    // ─────────────────────────────────────────────────────────
    $scope.importSongZip = function () {
        if (!$scope.selectedZipFile || !$scope.songListId) return;
        $scope.zipImporting = true;
        $scope.zipProgress  = 0;
        $scope.songLog      = [];
        songLog('ok', 'Загружаем ZIP-архив…');

        var fd = new FormData();
        fd.append('command',  'import_song_images_zip');
        fd.append('list_id',  $scope.songListId);
        fd.append('zipfile',  $scope.selectedZipFile);

        $http.post('/ajax', fd, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.zipImporting = false;
                $scope.zipProgress  = 100;
                var d = r.data;
                if (d.status === 'success') {
                    songLog('ok', '✅ Картинки импортированы. Извлечено: ' + d.extracted + ', ошибок: ' + d.errors);
                    if (d.log && d.log.length) {
                        angular.forEach(d.log, function (l) { songLog(l.type, l.msg); });
                    }
                } else {
                    songLog('error', '❌ ' + (d.message || 'Ошибка сервера'));
                }
            },
            function () { $scope.zipImporting = false; songLog('error', '❌ Ошибка соединения'); }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Импорт посланий (SOG)
    // ─────────────────────────────────────────────────────────
    $scope.importMessagesSog = function () {
        if (!$scope.selectedMsgFile) return;
        $scope.msgImporting = true;
        $scope.msgProgress  = 0;
        $scope.msgLog       = [];
        msgLog('ok', 'Начинаем импорт посланий…');

        var fd = new FormData();
        fd.append('command', 'import_messages_sog');
        fd.append('lang',    $scope.msgLang);
        fd.append('sogfile', $scope.selectedMsgFile);

        $http.post('/ajax', fd, {
            transformRequest: angular.identity,
            headers: { 'Content-Type': undefined }
        }).then(
            function (r) {
                $scope.msgImporting = false;
                $scope.msgProgress  = 100;
                var d = r.data;
                if (d.status === 'success') {
                    msgLog('ok', '✅ Импорт завершён. Добавлено: ' + d.inserted + ', обновлено: ' + d.updated + ', ошибок: ' + d.errors);
                    if (d.log && d.log.length) {
                        angular.forEach(d.log, function (l) { msgLog(l.type, l.msg); });
                    }
                } else {
                    msgLog('error', '❌ ' + (d.message || 'Ошибка сервера'));
                }
            },
            function () { $scope.msgImporting = false; msgLog('error', '❌ Ошибка соединения'); }
        );
    };

    // ─────────────────────────────────────────────────────────
    // Импорт послания (ввод текстом вручную)
    // ─────────────────────────────────────────────────────────
    $scope.importMessagesText = function () {
        if (!$scope.txtCode || !$scope.txtBody) return;
        if ($scope.txtMode === 'new' && !$scope.txtTitle) return;
        $scope.txtImporting = true;
        $scope.msgLog = [];
        msgLog('ok', 'Сохраняем послание [' + $scope.txtCode + ']…');

        $http({
            method: 'POST',
            url: '/ajax',
            data: {
                command:  'import_messages_text',
                lang:     $scope.msgLang,
                code:     $scope.txtCode.trim(),
                title:    $scope.txtTitle.trim(),
                city:     $scope.txtCity.trim(),
                para_sep: $scope.txtParaSep,
                body:     $scope.txtBody,
                mode:     $scope.txtMode
            }
        }).then(
            function (r) {
                $scope.txtImporting = false;
                var d = r.data;
                if (d.status === 'success') {
                    msgLog('ok', '✅ ' + d.message);
                    if (d.action === 'inserted') {
                        $scope.txtCode  = '';
                        $scope.txtTitle = '';
                        $scope.txtCity  = '';
                        $scope.txtBody  = '';
                    }
                } else {
                    msgLog('error', '❌ ' + (d.message || 'Ошибка сервера'));
                }
            },
            function () {
                $scope.txtImporting = false;
                msgLog('error', '❌ Ошибка соединения');
            }
        );
    };
});