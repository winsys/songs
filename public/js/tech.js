app.controller('Tech', function ($scope, $http)
{

    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.preparedChapters = [];
    $scope.showingSong = null;
    $scope.showingChapter = null;

    function splitText(src){
        if(src){
            $scope.preparedChapters = src.split("\r\n");
            angular.forEach($scope.preparedChapters, function(value, key){
                $scope.preparedChapters[key] = value + '\n(' + key + ')';
            });
        }else{
            $scope.preparedChapters = [];
        }
        return $scope.preparedChapters;
    }

    $scope.reloadFavorites = function()
    {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_image' } }).then(
            function success(respond){
                $scope.current = respond.data;
                if ($scope.current.length === 0){
                    $scope.curImage = null;
                    $scope.curChapter = null;
                    $scope.preparedChapters = [];
                } else {
                    $scope.curImage = $scope.current[0].image;
                    $scope.curChapter = $scope.current[0].text;
                }
                $http({ method: "POST", url: "/ajax", data: {command: 'get_favorites_with_text' } }).then(
                    function success(respond){
                        $scope.favorites = respond.data;
                        angular.forEach($scope.favorites, function(value, key){
                            if(($scope.curImage) && (value.imageName == $scope.curImage)) {
                                $scope.showingSong = value;
                                $scope.preparedChapters = splitText(value.TEXT);
                                angular.forEach($scope.preparedChapters, function (value, key) {
                                    if (value === $scope.curChapter) {
                                        $scope.showingChapter = value;
                                    }
                                });
                            }
                    })},
                    function error(erespond){
                        console.log('Ajax call error: ',erespond)
                    });
            },
            function error(erespond){
                console.log('Ajax call error: ',erespond)
            });
    };

    $scope.prepareText = function(aText, favoriteItem) {
        if( $scope.showingSong === favoriteItem ){
            $scope.showingSong = null;
            $scope.preparedChapters = [];
            $scope.showingChapter = null;
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'clear_image' }
            });
        } else {
            $scope.showingSong = favoriteItem;
            splitText(aText);
            $scope.showingChapter = null;
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_tech_image',
                        image_name: $scope.showingSong.imageName }
            });
        }
    }


    $scope.toggleCurrentTextChapter = function(chapterText) {
        console.log($scope.showingSong);
        if ( $scope.showingChapter === chapterText ) {
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_text',
                    image_name: $scope.showingSong.imageName,
                    text: '' }
            }).then(
                function success(){
                    $scope.showingChapter = null;
                });
        } else {
            let preparedText = chapterText.substring(0, chapterText.length - 4);
            preparedText = preparedText.replace(/\$+/g, '') + "\r\n\r\n" + $scope.showingSong.NAME;
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_text',
                    image_name: $scope.showingSong.imageName,
                    text: preparedText }
            }).then(
                function success(){
                    $scope.showingChapter = chapterText;
                });
        }
    }

    $scope.reloadSongList = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_song_list', list_id: $scope.listId } }).then(
            function success(respond){
                $scope.songList = respond.data;
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

    $scope.clearFavorites = function(){
        if($scope.favorites.length > 0)
            $scope.confirmationDialog("Список выбранных песен", function() {
                $http({method: "POST", url: "/ajax", data: {command: 'clear_favorites'}}).then(
                    function success() {
                        $http({ method: "POST",
                            url: "/ajax",
                            data: { command: 'clear_image' }
                        });
                        $scope.preparedChapters = [];
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

    $scope.reloadFavorites();
});

