app.controller('Leader', function ($scope, $http, $timeout)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;

    $scope.reloadSongList = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_song_list', list_id: $scope.listId } }).then(
            function success(respond){
                $scope.songList = respond.data;
            },
            function error(erespond){
                console.log('Ajax call error: ', erespond)
            });
    };

    $scope.selectedItem = function(item, index)
    {
        if( typeof item !== 'undefined' ){
            $http({ method: "POST", url: "/ajax", data: {command: 'add_to_favorites', id: item.originalObject.ID } }).then(
                function success(respond){
                    $scope.reloadFavorites();
                    $scope.$broadcast('angucomplete-alt:clearInput');
                },
                function error(erespond){
                    console.log('Ajax call error: ',erespond)
                });
        }
    };

    $scope.reloadFavorites = function()
    {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_favorites' } }).then(
            function success(respond){
                $scope.favorites = respond.data;
            },
            function error(erespond){
                console.log('Ajax call error: ',erespond)
            });
    };

    $scope.openFullscreen = function(elemId, img_num) {
        if(!$scope.fullScreen){
            $http({ method: "POST", url: "/ajax", data: {command: 'set_image', image_num: img_num, list_id: $scope.listId } }).then(
                function success(respond){
                    document.getElementById(elemId).requestFullscreen();
                    $scope.fullScreen = true;
                });
        }else{
            $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
                function success(respond){
                    document.exitFullscreen();
                    $scope.fullScreen = false;
                });
        }
    }

    $scope.clearFavorites = function(){
        if($scope.favorites.length > 0)
            $scope.confirmationDialog("Список выбранных песен", function() {
                $http({method: "POST", url: "/ajax", data: {command: 'clear_favorites'}}).then(
                    function success(respond) {
                        $scope.reloadFavorites();
                    },
                );
                $scope.showDialog(false);
            });
    };

    $scope.deleteFavoriteItem = function(fav_id, fav_title){
        $scope.confirmationDialog(fav_title, function(){
            $http({ method: "POST", url: "/ajax", data: {command: 'delete_favorite_item', id: fav_id } }).then(
                function success(respond){
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
            function success(respond){
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

    $scope.setList = function( listId ){
        $scope.listId = listId;
        $scope.reloadSongList();
    }

    $scope.reloadSongList();
    $scope.reloadFavorites();
});

