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
            $http({ method: "POST", url: "/ajax", data: {command: 'clear_image', image_num: img_num } }).then(
                function success(respond){
                    document.exitFullscreen();
                    $scope.fullScreen = false;
                });
        }
    }

    $scope.clearFavorites = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'clear_favorites' } }).then(
            function success(respond){
                $scope.reloadFavorites();
            },
        );
    };

    $scope.reloadSongList();
    $scope.reloadFavorites();
});

