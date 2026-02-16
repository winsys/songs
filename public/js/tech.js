app.controller('Tech', function ($scope, $http, $interval)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.preparedChapters = [];
    $scope.showingSong = null;
    $scope.showingChapter = null;
    $scope.selectedChapters = [];

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
                let current = respond.data;
                if (current.length === 0){
                    $scope.curImage = null;
                    $scope.curChapter = null;
                    $scope.preparedChapters = [];
                } else {
                    if( $scope.curImage !== current[0].image || $scope.curChapter !== current[0].text ){
                        $scope.curImage = current[0].image;
                        $scope.curChapter = current[0].text;
                    }
                }
                $http({ method: "POST", url: "/ajax", data: {command: 'get_favorites_with_text' } }).then(
                    function success(respond){
                        $scope.favorites = respond.data;
                        angular.forEach($scope.favorites, function(value, key){
                            if(($scope.curImage) && (value.imageName === $scope.curImage)) {
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
            $scope.selectedChapters = [];
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'clear_image' }
            });
        } else {
            $scope.showingSong = favoriteItem;
            splitText(aText);
            $scope.showingChapter = null;
            $scope.selectedChapters = [];
            $http({ method: "POST",
                url: "/ajax",
                data: { command: 'set_tech_image',
                        image_name: $scope.showingSong.imageName }
            });
        }
    }

    $scope.toggleCurrentTextChapter = function(chapterText, $event) {
        var ctrlKey = $event.ctrlKey || $event.metaKey; // metaKey for Mac Cmd key

        if (ctrlKey) {
            // Multi-select mode with Ctrl
            var index = $scope.selectedChapters.indexOf(chapterText);
            if (index > -1) {
                // Deselect if already selected
                $scope.selectedChapters.splice(index, 1);
            } else {
                // Add to selection
                $scope.selectedChapters.push(chapterText);
            }

            // Combine all selected chapters, removing verse numbers (the part after last newline that looks like "(N)")
            var combinedText = $scope.selectedChapters.map(function(chapter) {
                return chapter.replace(/\n\(\d+\)$/, '');
            }).join('\r\n- - - - -\r\n');

            if ($scope.selectedChapters.length === 0) {
                // Clear if nothing selected
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: '' }
                }).then(function success(){
                    $scope.showingChapter = null;
                });
            } else {
                // Send combined text
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: combinedText,
                        song_name: $scope.showingSong.NAME }
                }).then(function success(){
                    $scope.showingChapter = combinedText;
                });
            }
        } else {
            // Single select mode (original behavior)
            $scope.selectedChapters = [];

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
                $scope.selectedChapters = [chapterText];
                // Remove verse number before sending
                var cleanText = chapterText.replace(/\n\(\d+\)$/, '');
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: cleanText,
                        song_name: $scope.showingSong.NAME }
                }).then(
                    function success(){
                        $scope.showingChapter = chapterText;
                    });
            }
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
                    $http({ method: "POST",
                        url: "/ajax",
                        data: { command: 'clear_image' }
                    });
                    $scope.showingSong = null;
                    $scope.preparedChapters = [];
                    $scope.showingChapter = null;
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

    $interval(function() {
        $scope.reloadFavorites();
    }, 1000);

$scope.editFavorite = function(listItem) {
    $scope.editConfig = {
        title: 'Редактирование песни',
        songId: listItem.ID,
        songText: listItem.TEXT,
        songName: listItem.NAME,  // Original name without number
        songNum: listItem.NUM,
        dispName: listItem.dispName,
        currentImage: listItem.imageName,
        previewImage: null
    };
    $scope.showEditDialog(true);
};

$scope.showEditDialog = function(flag) {
    jQuery("#edit-song-popup .modal").modal(flag ? 'show' : 'hide');
};

// Preview image before upload
$scope.previewImage = function() {
    var fileInput = document.getElementById('imageUpload');
    var file = fileInput.files[0];
    
    if (file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            $scope.$apply(function() {
                $scope.editConfig.previewImage = e.target.result;
            });
        };
        reader.readAsDataURL(file);
    }
};

$scope.clearImagePreview = function() {
    $scope.editConfig.previewImage = null;
    document.getElementById('imageUpload').value = '';
};

$scope.saveSongEdits = function() {
    // Convert \n to \r\n for proper verse splitting
    var textWithCRLF = $scope.editConfig.songText.replace(/\r?\n/g, '\r\n');
    
    // First save text and title
    $http({ 
        method: "POST", 
        url: "/ajax", 
        data: {
            command: 'update_song',
            id: $scope.editConfig.songId,
            text: textWithCRLF,  // Send with CRLF
            name: $scope.editConfig.songName
        }
    }).then(
        function success() {
            // If image was selected, upload it
            var fileInput = document.getElementById('imageUpload');
            if (fileInput.files.length > 0) {
                $scope.uploadImage(function() {
                    $scope.reloadFavorites();
                    $scope.showEditDialog(false);
                });
            } else {
                $scope.reloadFavorites();
                $scope.showEditDialog(false);
            }
        },
        function error(erespond) {
            console.log('Ajax call error: ', erespond);
        }
    );
};

$scope.uploadImage = function(callback) {
    var fileInput = document.getElementById('imageUpload');
    var file = fileInput.files[0];
    var formData = new FormData();
    formData.append('image', file);
    formData.append('command', 'upload_song_image');
    formData.append('song_id', $scope.editConfig.songId);
    formData.append('list_id', $scope.editConfig.songNum.split('/')[0]);
    
    $http.post('/ajax', formData, {
        transformRequest: angular.identity,
        headers: {'Content-Type': undefined}
    }).then(
        function success() {
            if (callback) callback();
        },
        function error(erespond) {
            console.log('Image upload error: ', erespond);
        }
    );
};
});

