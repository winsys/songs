app.controller('Settings', function ($scope, $http)
{
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
        sermon_notes_bg_color:   '#2b2b2b',
        sermon_bible_base_color: '#1565c0',
        sermon_msg_base_color:   '#6a1b9a'
    };

    $scope.availableLists = [];
    $scope.selectedLists = {};
    $scope.placeholderImages = [
        { path: '/field_small.jpg', name: 'field_small.jpg (по умолчанию)' },
        { path: '/icon-192.png', name: 'icon-192.png' }
    ];

    $scope.loadAvailableLists = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_song_lists' } }).then(
            function success(r){ $scope.availableLists = r.data; },
            function error(e){ console.log('Ajax call error: ', e); });
    };

    $scope.loadSettings = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
            function success(r){
                if (r.data && r.data.user_id) {
                    angular.extend($scope.settings, r.data);
                    if ($scope.settings.available_lists) {
                        var ids = $scope.settings.available_lists.split(',');
                        angular.forEach(ids, function(id){ $scope.selectedLists[id] = true; });
                    }
                    if ($scope.settings.streaming_height_percent)
                        $scope.settings.streaming_height_percent = parseInt($scope.settings.streaming_height_percent, 10);
                    if (!$scope.settings.sermon_notes_bg_color)   $scope.settings.sermon_notes_bg_color   = '#2b2b2b';
                    if (!$scope.settings.sermon_bible_base_color)  $scope.settings.sermon_bible_base_color  = '#1565c0';
                    if (!$scope.settings.sermon_msg_base_color)    $scope.settings.sermon_msg_base_color    = '#6a1b9a';
                }
            },
            function error(e){ console.log('Ajax call error: ', e); });
    };

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
                        var exists = $scope.placeholderImages.some(function(img){ return img.path === response.data.path; });
                        if (!exists) {
                            $scope.placeholderImages.push({ path: response.data.path, name: response.data.path.split('/').pop() });
                        }
                        alert('Изображение загружено успешно!');
                        fileInput.value = '';
                    }
                },
                function error(e){ alert('Ошибка загрузки изображения!'); }
            );
        }
    };

    $scope.saveSettings = function() {
        var ids = [];
        angular.forEach($scope.selectedLists, function(v, k){ if (v) ids.push(k); });
        $scope.settings.available_lists = ids.join(',');
        $http({ method: "POST", url: "/ajax", data: { command: 'save_user_settings', settings: $scope.settings } }).then(
            function success(r){
                alert(r.data.status === 'success' ? '✅ Настройки успешно сохранены!' : '❌ Ошибка при сохранении настроек!');
            },
            function error(e){ alert('❌ Ошибка при сохранении настроек!'); }
        );
    };

    // Colour helper for live chip previews in the settings template.
    // amount: negative = darker, positive = lighter (-100..+100)
    $scope.shadeColor = function(hex, amount) {
        if (!hex || hex.length < 7) return hex;
        try {
            var n = parseInt(hex.replace(/^#/,''), 16);
            var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            var f = amount / 100;
            var c = function(v){ return Math.max(0, Math.min(255, Math.round(v + 255*f))); };
            return '#' + [c(r),c(g),c(b)].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
        } catch(e){ return hex; }
    };

    $scope.loadAvailableLists();
    $scope.loadSettings();
});