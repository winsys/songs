app.controller('Tech', function ($scope, $http)
{
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.preparedChapters = [];
    $scope.showingSong = null;
    $scope.showingChapter = null;

    $scope.reloadFavorites = function()
    {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_image' } }).then(
            function success(respond){
                $scope.current = respond.data;
                if ($scope.current.length === 0){
                    $scope.curImage = null;
                    $scope.curChapter = null;
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
                                $scope.preparedChapters = value.TEXT.split("\r\n");
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
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'clear_image' }
            });
            $scope.showingSong = favoriteItem;
            $scope.preparedChapters = aText.split("\r\n");
            $scope.showingChapter = null;
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_tech_image',
                        image_name: $scope.showingSong.imageName }
            });
        }
    }


    $scope.toggleCurrentTextChapter = function(chapterText) {
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
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_text',
                    image_name: $scope.showingSong.imageName,
                    text: chapterText }
            }).then(
                function success(){
                    $scope.showingChapter = chapterText;
                });
        }
    }


    $scope.selectActiveSong = function( favoritesObject ){
        $scope.listId = listId;
        $scope.reloadSongList();
    }

    $scope.reloadFavorites();
});

