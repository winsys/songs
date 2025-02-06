app.controller('Tech', function ($scope, $http)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;

    $scope.reloadFavorites = function()
    {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_favorites_with_text' } }).then(
            function success(respond){
                $scope.favorites = respond.data;
            },
            function error(erespond){
                console.log('Ajax call error: ',erespond)
            });
    };

    $scope.setTextChapter = function(elemId, img_num, list_id, song_id) {
        if(!$scope.fullScreen){
            $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_image',
                            image_num: img_num,
                            list_id: list_id,
                            song_id: song_id }
            }).then(
                function success(){
                    document.getElementById('img'+elemId).requestFullscreen();
                    $scope.fullScreen = true;
                });
        }else{
            $http({ method: "POST", url: "/ajax", data: {command: 'clear_image' } }).then(
                function success(){
                    document.exitFullscreen();
                    $scope.fullScreen = false;
                });
        }
    }

    /**
     * Song full list popup
     */
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

    $scope.uploadPhoto = function(fm)
    {
        var input = $('#imageCapDialog');
        var reader = new FileReader();
        reader.onload = function(){
            $http({
                method: "PUT",
                url: $scope._ROOT + "image/" + fm.file.name + "/" + $scope.curQuestion.protocol_record_id,
                data: reader.result
            }).then(
                function success(respond)
                {
                    $scope.curQuestion.photos.push(respond.data.result);
                },
                function error(erespond){
                    console.log('API call error: '+erespond)
                });
        };
        reader.readAsDataURL(input[0].files[0]);
    };



    $scope.setList = function( listId ){
        $scope.listId = listId;
        $scope.reloadSongList();
    }

    $scope.reloadSongList();
    $scope.reloadFavorites();
});

