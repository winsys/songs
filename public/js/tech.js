app.controller('Tech', function ($scope, $http)
{
    $scope.listId = 1;
    $scope.songList = [];
    $scope.favorites = [];
    $scope.fullScreen = false;
    $scope.preparedChapters = [];
    $scope.showingSong = null;
    $scope.showingChapter = null;
    $scope.selectedChapters = [];
    $scope.availableSongLists = [];
    $scope.visibleSongLists = [];

    // Language selection state (RU enabled by default)
    $scope.languages = {
        ru: true,
        lt: false,
        en: false
    };

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

    // Toggle language selection
    $scope.toggleLanguage = function(lang) {
        $scope.languages[lang] = !$scope.languages[lang];
        // If all are disabled, re-enable RU
        if (!$scope.languages.ru && !$scope.languages.lt && !$scope.languages.en) {
            $scope.languages.ru = true;
        }
        // Refresh the prepared chapters if a song is selected
        if ($scope.showingSong) {
            splitText($scope.showingSong.TEXT, $scope.showingSong.TEXT_LT, $scope.showingSong.TEXT_EN);
        }
    };

    function splitText(src, srcLt, srcEn){
        if(src){
            var ruChapters = src.split("\r\n");
            var ltChapters = srcLt ? srcLt.split("\r\n") : [];
            var enChapters = srcEn ? srcEn.split("\r\n") : [];

            $scope.preparedChapters = [];
            angular.forEach(ruChapters, function(value, key){
                // Build combined verse based on selected languages
                var verseParts = [];

                if($scope.languages.ru && value) {
                    verseParts.push(value);
                }
                if($scope.languages.lt && ltChapters[key]) {
                    verseParts.push(ltChapters[key]);
                }
                if($scope.languages.en && enChapters[key]) {
                    verseParts.push(enChapters[key]);
                }

                // Join with dashed line separator
                var combinedVerse = verseParts.join('\r\n- - - - - - - -\r\n');

                $scope.preparedChapters[key] = combinedVerse + '\n(' + key + ')';
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
                                $scope.preparedChapters = splitText(value.TEXT, value.TEXT_LT, value.TEXT_EN);
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
            splitText(aText, favoriteItem.TEXT_LT, favoriteItem.TEXT_EN);
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

            if ($scope.selectedChapters.length === 0) {
                // Clear if nothing selected
                $http({ method: "POST",
                    url: "/ajax",
                    data: { command: 'set_text',
                        image_name: $scope.showingSong.imageName,
                        text: '',
                        song_name: '' }
                }).then(function success(){
                    $scope.showingChapter = null;
                });
            } else {
                // Group verses by language
                var ruChapters = $scope.showingSong.TEXT ? $scope.showingSong.TEXT.split("\r\n") : [];
                var ltChapters = $scope.showingSong.TEXT_LT ? $scope.showingSong.TEXT_LT.split("\r\n") : [];
                var enChapters = $scope.showingSong.TEXT_EN ? $scope.showingSong.TEXT_EN.split("\r\n") : [];

                var languageParts = [];

                // Extract verse indices from selected chapters
                var verseIndices = $scope.selectedChapters.map(function(chapter) {
                    var match = chapter.match(/\n\((\d+)\)$/);
                    return match ? parseInt(match[1]) : -1;
                }).filter(function(idx) { return idx >= 0; });

                // Collect all verses for each language
                if ($scope.languages.ru) {
                    var ruVerses = verseIndices.map(function(idx) {
                        return ruChapters[idx];
                    }).filter(function(v) { return v; });
                    if (ruVerses.length > 0) {
                        languageParts.push(ruVerses.join('\r\n'));
                    }
                }

                if ($scope.languages.lt) {
                    var ltVerses = verseIndices.map(function(idx) {
                        return ltChapters[idx];
                    }).filter(function(v) { return v; });
                    if (ltVerses.length > 0) {
                        languageParts.push(ltVerses.join('\r\n'));
                    }
                }

                if ($scope.languages.en) {
                    var enVerses = verseIndices.map(function(idx) {
                        return enChapters[idx];
                    }).filter(function(v) { return v; });
                    if (enVerses.length > 0) {
                        languageParts.push(enVerses.join('\r\n'));
                    }
                }

                // Join language groups with dashed separator
                var combinedText = languageParts.join('\r\n- - - - - - - -\r\n');

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
                        song_name: '',
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
            // Find the item being deleted
            var deletingItem = null;
            angular.forEach($scope.favorites, function(item) {
                if (item.FID === fav_id) {
                    deletingItem = item;
                }
            });

            // Check if we're deleting the currently displayed song
            var isDeletingCurrentSong = ($scope.showingSong && deletingItem &&
                                         $scope.showingSong.FID === deletingItem.FID);

            $http({ method: "POST", url: "/ajax", data: {command: 'delete_favorite_item', id: fav_id } }).then(
                function success(){
                    // Only clear the image if we're deleting the currently displayed song
                    if (isDeletingCurrentSong) {
                        $http({ method: "POST",
                            url: "/ajax",
                            data: { command: 'clear_image' }
                        });
                        $scope.showingSong = null;
                        $scope.preparedChapters = [];
                        $scope.showingChapter = null;
                    }
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
    };

    // Watch for listId changes to reload song list for search
    $scope.$watch('listId', function(newVal, oldVal) {
        if (newVal !== oldVal) {
            $scope.reloadSongList();
        }
    });


    // $interval(function() {
    //     $scope.reloadFavorites();
    // }, 1000);
    //
    $scope.editFavorite = function(listItem) {
        $scope.editConfig = {
            title: 'Редактирование песни',
            songId: listItem.ID,
            songText: listItem.TEXT,
            songTextLt: listItem.TEXT_LT || '',
            songTextEn: listItem.TEXT_EN || '',
            songName: listItem.NAME,  // Original name without number
            songNum: listItem.NUM,
            dispName: listItem.dispName,
            currentImage: listItem.imageName,
            previewImage: null,
            isNewSong: false
        };
        $scope.showEditDialog(true);
    };

    $scope.addNewSong = function() {
        $scope.editConfig = {
            title: 'Добавление новой песни',
            songId: null,
            songText: '',
            songTextLt: '',
            songTextEn: '',
            songName: '',
            songNum: null,
            dispName: '',
            currentImage: null,
            previewImage: null,
            isNewSong: true
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
        var textLtWithCRLF = $scope.editConfig.songTextLt ? $scope.editConfig.songTextLt.replace(/\r?\n/g, '\r\n') : '';
        var textEnWithCRLF = $scope.editConfig.songTextEn ? $scope.editConfig.songTextEn.replace(/\r?\n/g, '\r\n') : '';

        if ($scope.editConfig.isNewSong) {
            // Create new song
            $http({
                method: "POST",
                url: "/ajax",
                data: {
                    command: 'create_song',
                    list_id: $scope.listId,
                    text: textWithCRLF,
                    text_lt: textLtWithCRLF,
                    text_en: textEnWithCRLF,
                    name: $scope.editConfig.songName
                }
            }).then(
                function success(response) {
                    // Set the songId and songNum from the response
                    $scope.editConfig.songId = response.data.song_id;
                    $scope.editConfig.songNum = $scope.listId + '/' + response.data.num;

                    // If image was selected, upload it
                    var fileInput = document.getElementById('imageUpload');
                    if (fileInput.files.length > 0) {
                        $scope.uploadImage(function() {
                            // Add the new song to favorites
                            $scope.addSongToFavorites($scope.editConfig.songId);
                            $scope.showEditDialog(false);
                        });
                    } else {
                        // Add the new song to favorites
                        $scope.addSongToFavorites($scope.editConfig.songId);
                        $scope.showEditDialog(false);
                    }
                },
                function error(erespond) {
                    console.log('Ajax call error: ', erespond);
                }
            );
        } else {
            // Update existing song
            $http({
                method: "POST",
                url: "/ajax",
                data: {
                    command: 'update_song',
                    id: $scope.editConfig.songId,
                    text: textWithCRLF,
                    text_lt: textLtWithCRLF,
                    text_en: textEnWithCRLF,
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
        }
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

    const socket = new WebSocket("wss://" + window.location.host + "/ws");

    console.log(socket);

    socket.onmessage = function(event) {
        let data = JSON.parse(event.data);

        console.log(event.data);

        if (data.type === 'update_needed') {
            // Как только получили сигнал — обновляем данные
            $scope.$apply(function() {
                $scope.reloadFavorites();
            });
        }
    };

    $scope.loadSongLists();
    $scope.reloadFavorites();
    $scope.reloadSongList();

});

