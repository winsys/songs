app.controller('Leader', ['$scope', '$http', 'SongsService', function ($scope, $http, SongsService)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.visibleSongLists = [];
    $scope.langList = [];
    $scope.showNotes = false;   // режим «показывать ноты» в попапе списка

    $scope.loadSongLists = function () {
        SongsService.getVisibleSongLists().then(function (lists) {
            $scope.visibleSongLists = lists;
        }, function () {
            console.error('leader.js: не удалось загрузить списки песен');
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
        if( typeof item !== 'undefined' ){
            $http({ method: "POST", url: "/ajax", data: {command: 'add_to_favorites', id: item.originalObject.ID } }).then(
                function success(){
                    $scope.reloadFavorites();
                    $scope.$broadcast('angucomplete-alt:clearInput');
                },
                function error(erespond){
                    console.error('leader.js Ajax error:', erespond)
                });
        }
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

    $scope.openFullscreen = function(elemId, img_num, list_id, song_id) {
        if(!$scope.fullScreen){
            // Set fullScreen flag BEFORE sending set_image to prevent race condition with WebSocket
            $scope.fullScreen = true;

            $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_image',
                            image_num: img_num,
                            list_id: list_id,
                            song_id: song_id }
            }).then(
                function success(){
                    var wrapElement = document.getElementById('wrap'+elemId);
                    if (wrapElement && wrapElement.requestFullscreen) {
                        wrapElement.requestFullscreen().catch(function(err) {
                            $scope.$apply(function() {
                                $scope.fullScreen = false;
                            });
                        });
                    } else {
                        $scope.fullScreen = false;
                    }
                },
                function error(){
                    $scope.fullScreen = false;
                });
        }else{
            $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
                function success(){
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    }
                    $scope.fullScreen = false;
                });
        }
    }

    $scope.clearFavorites = function(){
        if($scope.favorites.length > 0)
            $scope.confirmationDialog("Список выбранных песен", function() {
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
                label: 'Выбрать',
                action: callback
            }]
        };
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
                console.error('leader.js Ajax error:', erespond)
            });

    };



    /**
     * Confirmation dialog
     */
    $scope.confirmationDialogConfig = {};
    $scope.confirmationDialog = function(msg, callback) {
        $scope.confirmationDialogConfig = {
            title: 'УДАЛЕНИЕ',
            message: 'Удалить [' + msg + ']?',
            buttons: [{
                label: 'Да',
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
            buttons: [{ label: 'Сделато фото',
                        action: callback
                      },
                      {
                        label: 'Сохранить',
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


    // ==========================================================
    // WEBSOCKET
    // ==========================================================

    // [SECURITY] Use authenticated WebSocket connection
    const socket = window.createAuthenticatedWebSocket(
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
            }
        },
        function(error) {
            console.error('WebSocket error:', error);
        }
    );

    // Listen for fullscreen changes (e.g., when user presses ESC)
    document.addEventListener('fullscreenchange', function() {
        $scope.$apply(function() {
            if (!document.fullscreenElement) {
                $scope.fullScreen = false;
                $scope.reloadFavorites();
            }
        });
    });

    $scope.loadSongLists();
    SongsService.getLanguages().then(function (langs) { $scope.langList = langs; });
    $scope.reloadSongList();
    $scope.reloadFavorites();
}]);

