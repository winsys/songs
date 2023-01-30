app.controller('Leader', function ($scope, $http, $timeout)
{
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;

    $scope.reloadSongList = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_song_list' } }).then(
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
            $http({ method: "POST", url: "/ajax", data: {command: 'set_image', image_num: img_num } }).then(
                function success(respond){
                    document.getElementById('img'+elemId).requestFullscreen();
                    $scope.fullScreen = true;
                });
        }else{
            $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
                function success(respond){
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                        $scope.fullScreen = false;
                    }
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

    $scope.showNextItem = function(curItem){
        if(!$scope.fullScreen) return;

        let nextItem = curItem;

        let index = $scope.favorites.indexOf(curItem);
        if($scope.favorites.length > 1) {
            if (index >= 0)
                if (index < $scope.favorites.length - 1) {
                    nextItem = $scope.favorites[index + 1]
                } else {
                    nextItem = $scope.favorites[0]
                }
        }

        if (document.exitFullscreen){
            document.exitFullscreen();
            $scope.fullScreen = false;
        }
        $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
            function success(respond){
                $http({ method: "POST", url: "/ajax", data: {command: 'set_image', image_num: nextItem.NUM } }).then(
                    function success(respond){
                        document.getElementById('img'+nextItem.ID).requestFullscreen();
                        $scope.fullScreen = true;
                    });
            });
    };



    $scope.showPrevItem = function(curItem){

        if(!$scope.fullScreen) return;

        let prevItem = curItem;

        if($scope.favorites.length > 1)
        {
            let index = $scope.favorites.indexOf(curItem);
            if(index > 0) {
                prevItem = $scope.favorites[index - 1]
            } else {
                prevItem = $scope.favorites[$scope.favorites.length - 1]
            }
        }

        if (document.exitFullscreen){
            document.exitFullscreen();
            $scope.fullScreen = false;
        }
        $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
            function success(respond){
                $http({ method: "POST", url: "/ajax", data: {command: 'set_image', image_num: prevItem.NUM } }).then(
                    function success(respond){
                        document.getElementById('img'+prevItem.ID).requestFullscreen();
                        $scope.fullScreen = true;
                    });
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

    $scope.confirmationDialogConfig = {};
    $scope.confirmationDialog = function(msg, callback) {
        $scope.confirmationDialogConfig = {
            title: 'УДАЛЕНИЕ',
            message: 'Удалить "' + msg + '"? Вы уверены?',
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


    $scope.reloadSongList();
    $scope.reloadFavorites();
});

