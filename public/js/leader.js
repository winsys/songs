app.controller('Leader', function ($scope, $http)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.availableSongLists = [];
    $scope.visibleSongLists = [];
    $scope.langList = [];
    $scope.currentSongId = null;

    function loadLanguages() {
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_languages' } }).then(
            function (r) {
                $scope.langList = r.data || [];
            },
            function () {
                console.error('leader.js: не удалось загрузить список языков');
            }
        );
    }

    // Load available song lists and user settings
    $scope.loadSongLists = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_song_lists' } }).then(
            function success(respond){
                $scope.availableSongLists = respond.data;

                // Load user settings to filter lists
                $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
                    function success(settingsRespond){
                        if (settingsRespond.data && settingsRespond.data.available_lists) {
                            var selectedListIds = settingsRespond.data.available_lists.split(',');
                            $scope.visibleSongLists = $scope.availableSongLists.filter(function(list) {
                                return selectedListIds.indexOf(String(list.LIST_ID)) !== -1;
                            });
                        } else {
                            // Show all lists if no settings
                            $scope.visibleSongLists = $scope.availableSongLists;
                        }
                    },
                    function error(erespond){
                        // Show all lists on error
                        $scope.visibleSongLists = $scope.availableSongLists;
                    }
                );
            },
            function error(erespond){
                console.log('Ajax call error: ', erespond)
            });
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
                console.log('Ajax call error: ', erespond)
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
                    console.log('Ajax call error: ',erespond)
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
                console.log('Ajax call error: ',erespond)
            });
    };

    $scope.openFullscreen = function(elemId, img_num, list_id, song_id) {
        console.log('Leader: openFullscreen called, elemId=' + elemId + ', fullScreen=' + $scope.fullScreen);

        if(!$scope.fullScreen){
            console.log('Leader: opening fullscreen, calling set_image');
            $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_image',
                            image_num: img_num,
                            list_id: list_id,
                            song_id: song_id }
            }).then(
                function success(){
                    console.log('Leader: set_image success, requesting fullscreen');
                    var imgElement = document.getElementById('img'+elemId);
                    if (imgElement && imgElement.requestFullscreen) {
                        imgElement.requestFullscreen().then(function() {
                            console.log('Leader: fullscreen opened successfully');
                            $scope.$apply(function() {
                                $scope.fullScreen = true;
                            });
                        }).catch(function(err) {
                            console.log('Leader: fullscreen request failed:', err);
                            $scope.$apply(function() {
                                $scope.fullScreen = false;
                            });
                        });
                    } else {
                        console.log('Leader: imgElement or requestFullscreen not available');
                    }
                });
        }else{
            console.log('Leader: closing fullscreen, calling clear_image');
            $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
                function success(){
                    console.log('Leader: clear_image success, exiting fullscreen');
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
                console.log('Ajax call error: ',erespond)
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
    // RESTORE CURRENT STATE
    // ==========================================================

    function restoreCurrentState() {
        console.log('Leader: restoreCurrentState called, favorites count:', $scope.favorites.length);
        $http({ method: "POST", url: "/ajax", data: { command: 'get_current_state' } }).then(
            function(response) {
                var state = response.data;
                console.log('Leader: current state:', state);

                // Reset current song highlight
                $scope.currentSongId = null;

                // Restore song if image path matches song image pattern
                if (state.image && state.image.match(/\/images\/\d+\/\d+\.jpg/)) {
                    var matches = state.image.match(/\/images\/(\d+)\/(\d+)\.jpg/);
                    if (matches) {
                        var listId = parseInt(matches[1]);
                        var songNum = matches[2];
                        console.log('Leader: looking for song listId=' + listId + ' songNum=' + songNum);

                        // Find the song in favorites and highlight it
                        for (var i = 0; i < $scope.favorites.length; i++) {
                            if ($scope.favorites[i].LISTID == listId && $scope.favorites[i].NUM == songNum) {
                                var itemId = $scope.favorites[i].ID;
                                console.log('Leader: found song, itemId=' + itemId + ' - highlighting');
                                $scope.currentSongId = itemId;

                                // Scroll to the highlighted song
                                setTimeout(function() {
                                    var elements = document.querySelectorAll('.prod-list-item.active-song');
                                    if (elements.length > 0) {
                                        elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }, 100);
                                break;
                            }
                        }
                    }
                } else {
                    console.log('Leader: no active song image');
                }
            }
        );
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
                console.log('Leader: update_needed received, fullScreen=' + $scope.fullScreen);
                $scope.$apply(function() {
                    $scope.reloadFavorites(function() {
                        // Only restore state if not in fullscreen mode
                        // (to avoid closing fullscreen when we just opened it)
                        if (!$scope.fullScreen) {
                            setTimeout(function() {
                                restoreCurrentState();
                            }, 200);
                        } else {
                            console.log('Leader: skipping restoreCurrentState - already in fullscreen');
                        }
                    });
                });
            }
        },
        function(error) {
            console.error('WebSocket error:', error);
        }
    );

    // Listen for fullscreen changes (e.g., when user presses ESC)
    document.addEventListener('fullscreenchange', function() {
        console.log('Leader: fullscreenchange event, fullscreenElement:', document.fullscreenElement);
        $scope.$apply(function() {
            if (!document.fullscreenElement) {
                console.log('Leader: fullscreen exited, setting fullScreen=false');
                $scope.fullScreen = false;
            }
        });
    });

    $scope.loadSongLists();
    loadLanguages();
    $scope.reloadSongList();

    // Load favorites and restore state after they're loaded
    $scope.reloadFavorites(function() {
        setTimeout(function() {
            restoreCurrentState();
        }, 500);
    });
});

