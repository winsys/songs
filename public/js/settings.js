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
        streaming_height_percent: 100,
        // ── Sermon display ──────────────────────
        sermon_notes_bg_color:   '#2b2b2b',
        sermon_bible_base_color: '#7ec8f8',
        sermon_msg_base_color:   '#ce93d8'
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
                    // Merge so that any missing keys keep defaults
                    angular.extend($scope.settings, respond.data);

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

                    // Ensure sermon colours have defaults if DB returned null/empty
                    if (!$scope.settings.sermon_notes_bg_color)   $scope.settings.sermon_notes_bg_color   = '#2b2b2b';
                    if (!$scope.settings.sermon_bible_base_color)  $scope.settings.sermon_bible_base_color  = '#7ec8f8';
                    if (!$scope.settings.sermon_msg_base_color)    $scope.settings.sermon_msg_base_color    = '#ce93d8';
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

    // ── Colour helper used in template for live chip previews ──
    // Returns a hex string that is `amount` lightness-points lighter (positive)
    // or darker (negative) than the input hex.
    $scope.shadeColor = function(hex, amount) {
        if (!hex || hex.length < 7) return hex;
        try {
            hex = hex.replace(/^#/, '');
            var n = parseInt(hex, 16);
            var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            // Simple approach: add `amount` to each channel
            var clamp = function(v) { return Math.max(0, Math.min(255, v)); };
            var factor = amount / 100;
            r = clamp(Math.round(r + 255 * factor));
            g = clamp(Math.round(g + 255 * factor));
            b = clamp(Math.round(b + 255 * factor));
            return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
        } catch(e) { return hex; }
    };

    // Initialize
    $scope.loadAvailableLists();
    $scope.loadSettings();
});
