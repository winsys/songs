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
        { path: '/field_small.jpg', name: 'field_small.jpg (по умолчанию)' }
    ];

    $scope.loadAvailableLists = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_song_lists' } }).then(
            function success(r){ $scope.availableLists = r.data; },
            function error(e){ console.log('Ajax call error: ', e); });
    };

    $scope.loadSettings = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
            function success(r){
                if (r.data && r.data.group_id) {
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
                    $scope.settings.sermon_scale_chips = parseInt($scope.settings.sermon_scale_chips) || 0;
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

    $scope.chipBgColor = function(hex, alpha) {
        if (!hex || hex.length < 7) return 'transparent';
        try {
            var n = parseInt(hex.replace(/^#/, ''), 16);
            var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        } catch(e) { return 'transparent'; }
    };

    $scope.loadAvailableLists();

    // ============================================================
    // ПОЛЬЗОВАТЕЛИ ГРУППЫ
    // Вставить в public/js/settings.js ПЕРЕД строкой loadSettings();
    // ============================================================

    var ALL_ROLES = [
        { role: 'admin',    roleLabel: 'Администратор' },
        { role: 'leader',   roleLabel: 'Ведущий' },
        { role: 'musician', roleLabel: 'Музыкант' },
        { role: 'preacher', roleLabel: 'Проповедник' }
    ];

    $scope.userSlots = ALL_ROLES.map(function(r) {
        return { role: r.role, roleLabel: r.roleLabel, user: null };
    });

    $scope.getRoleBadgeStyle = function(role) {
        var colors = {
            admin:    { color: '#fff', background: '#c62828', border: '1px solid #b71c1c' },
            leader:   { color: '#fff', background: '#1565c0', border: '1px solid #0d47a1' },
            musician: { color: '#fff', background: '#2e7d32', border: '1px solid #1b5e20' },
            preacher: { color: '#fff', background: '#6a1b9a', border: '1px solid #4a148c' }
        };
        return colors[role] || { color: '#333', background: '#e0e0e0' };
    };

    $scope.loadGroupUsers = function() {
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_group_users' } }).then(
            function success(r) {
                var users = r.data || [];
                // Сбросить слоты
                $scope.userSlots = ALL_ROLES.map(function(slot) {
                    var found = null;
                    for (var i = 0; i < users.length; i++) {
                        if (users[i].ROLE === slot.role) { found = users[i]; break; }
                    }
                    return { role: slot.role, roleLabel: slot.roleLabel, user: found };
                });
            },
            function error(e) { console.log('loadGroupUsers error:', e); }
        );
    };

    $scope.createGroupUser = function(role) {
        $http({ method: 'POST', url: '/ajax', data: { command: 'create_group_user', role: role } }).then(
            function success(r) {
                if (r.data && r.data.status === 'success') {
                    // Найти слот и вставить нового пользователя
                    for (var i = 0; i < $scope.userSlots.length; i++) {
                        if ($scope.userSlots[i].role === role) {
                            $scope.userSlots[i].user = r.data.user;
                            break;
                        }
                    }
                } else {
                    alert('❌ Ошибка создания пользователя: ' + (r.data.message || ''));
                }
            },
            function error(e) { alert('❌ Ошибка при создании пользователя!'); }
        );
    };

    $scope.updateGroupUser = function(user) {
        $http({ method: 'POST', url: '/ajax', data: {
                command: 'update_group_user',
                id:    user.ID,
                name:  user.NAME,
                login: user.LOGIN,
                pass:  user.PASS
            }}).then(
            function success(r) {
                if (r.data && r.data.status === 'success') {
                    alert('✅ Пользователь сохранён!');
                } else {
                    alert('❌ Ошибка при сохранении!');
                }
            },
            function error(e) { alert('❌ Ошибка при сохранении!'); }
        );
    };

    $scope.shareUser = function(user, roleLabel) {
        var text =
            'https://songs.winsys.lv' + '\n' +
            'Роль: '   + roleLabel    + '\n' +
            'Имя: '    + user.NAME   + '\n' +
            'Логин: '  + user.LOGIN  + '\n' +
            'Пароль: ' + user.PASS;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function() { alert('📋 Данные скопированы в буфер обмена!'); },
                function() { prompt('Скопируйте данные:', text); }
            );
        } else {
            prompt('Скопируйте данные:', text);
        }
    };

    $scope.loadGroupUsers();
    $scope.loadSettings();
});