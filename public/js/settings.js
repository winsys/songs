app.controller('Settings', function ($scope, $http)
{
    // Initialize settings with defaults
    $scope.settings = {
        display_name: '',
        favorites_order: 'latest_bottom',
        available_lists: '',
        placeholder_image: null,
        main_bg_color: '#000000',
        main_font: 'Arial',
        main_font_color: '#FFFFFF',
        streaming_bg_color: '#000000',
        streaming_font: 'Arial',
        streaming_font_color: '#FFFFFF',
        streaming_height_percent: 100
    };

    $scope.availableLists = [];
    $scope.selectedLists = {};
    $scope.placeholderImages = [
        { path: '/field_small.jpg', name: 'field_small.jpg (по умолчанию)' },
        { path: '/icon-192.png', name: 'icon-192.png' }
    ];

    // Load available song lists
    $scope.loadAvailableLists = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_song_lists' } }).then(
            function success(respond){
                $scope.availableLists = respond.data;
            },
            function error(erespond){
                console.log('Ajax call error: ', erespond)
            });
    };

    // Load user settings
    $scope.loadSettings = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
            function success(respond){
                if (respond.data && respond.data.user_id) {
                    $scope.settings = respond.data;

                    // Parse available_lists string to checkbox object
                    if ($scope.settings.available_lists) {
                        var listIds = $scope.settings.available_lists.split(',');
                        angular.forEach(listIds, function(id) {
                            $scope.selectedLists[id] = true;
                        });
                    }

                    // Ensure streaming_height_percent is a number
                    if ($scope.settings.streaming_height_percent) {
                        $scope.settings.streaming_height_percent = parseInt($scope.settings.streaming_height_percent, 10);
                    }
                }
            },
            function error(erespond){
                console.log('Ajax call error: ', erespond)
            });
    };

    // Upload placeholder image
    $scope.uploadPlaceholderImage = function() {
        var fileInput = document.getElementById('placeholderUpload');
        var file = fileInput.files[0];

        if (file) {
            var formData = new FormData();
            formData.append('image', file);
            formData.append('command', 'upload_placeholder_image');

            $http.post('/ajax', formData, {
                transformRequest: angular.identity,
                headers: {'Content-Type': undefined}
            }).then(
                function success(response) {
                    if (response.data.path) {
                        $scope.settings.placeholder_image = response.data.path;

                        // Add to list if not already present
                        var exists = $scope.placeholderImages.some(function(img) {
                            return img.path === response.data.path;
                        });
                        if (!exists) {
                            var filename = response.data.path.split('/').pop();
                            $scope.placeholderImages.push({
                                path: response.data.path,
                                name: filename
                            });
                        }

                        alert('Изображение загружено успешно!');
                        fileInput.value = '';
                    }
                },
                function error(erespond) {
                    console.log('Image upload error: ', erespond);
                    alert('Ошибка загрузки изображения!');
                }
            );
        }
    };

    // Save settings
    $scope.saveSettings = function() {
        // Convert selectedLists object to comma-separated string
        var selectedListIds = [];
        angular.forEach($scope.selectedLists, function(value, key) {
            if (value) {
                selectedListIds.push(key);
            }
        });
        $scope.settings.available_lists = selectedListIds.join(',');

        $http({
            method: "POST",
            url: "/ajax",
            data: {
                command: 'save_user_settings',
                settings: $scope.settings
            }
        }).then(
            function success(response) {
                if (response.data.status === 'success') {
                    alert('✅ Настройки успешно сохранены!');
                } else {
                    alert('❌ Ошибка при сохранении настроек!');
                }
            },
            function error(erespond) {
                console.log('Ajax call error: ', erespond);
                alert('❌ Ошибка при сохранении настроек!');
            }
        );
    };

    // Initialize
    $scope.loadAvailableLists();
    $scope.loadSettings();
});
