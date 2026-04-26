
app.controller('Settings', function ($scope, $http)
{
    // Permissions - loading from server
    $scope.permissions = {
        canManageUsers: false,
        canEditFavoritesOrder: false,
        canEditSongLists: false,
        canEditSermonSettings: false,
        canEditAllSettings: false
    };

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
        sermon_msg_base_color:   '#6a1b9a',
        slide_bg_color:          '#1a237e',
        ui_lang:                 'ru'
    };

    // ui_lang at the time settings were loaded; used to decide whether to
    // reload the page after save so PHP-rendered chrome (UI_DICT) refreshes.
    var _initialUiLang = null;

    $scope.availableLists = [];
    $scope.selectedLists = {};
    $scope.sortedLists = [];    // ordered list of {LIST_ID, LIST_NAME, selected}
    $scope.allLanguages = [];
    $scope.selectedLanguages = {};
    $scope.placeholderImages = [
        { path: '/field_small.jpg', name: 'field_small.jpg (по умолчанию)' }
    ];

    // Load permissions from server
    $scope.loadPermissions = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_settings_permissions' } }).then(
            function success(r){
                if (r.data) {
                    angular.extend($scope.permissions, r.data);
                }
            },
            function error(e){ console.log('Failed to load permissions: ', e); });
    };

    // Flags to detect when both lists and settings have loaded, then build sortedLists
    var _listsLoaded = false, _settingsLoaded = false;

    function _buildSortedLists() {
        if (!_listsLoaded || !_settingsLoaded) return;
        var result = [];
        // First: selected lists in the order defined by available_lists
        if ($scope.settings.available_lists) {
            var ids = $scope.settings.available_lists.split(',').map(function(id) { return id.trim(); });
            ids.forEach(function(id) {
                for (var i = 0; i < $scope.availableLists.length; i++) {
                    if (String($scope.availableLists[i].LIST_ID) === id) {
                        result.push({ LIST_ID: $scope.availableLists[i].LIST_ID, LIST_NAME: $scope.availableLists[i].LIST_NAME, selected: true });
                        break;
                    }
                }
            });
        }
        // Then: remaining (unselected) lists
        $scope.availableLists.forEach(function(list) {
            var alreadyIn = result.some(function(r) { return r.LIST_ID === list.LIST_ID; });
            if (!alreadyIn) {
                result.push({ LIST_ID: list.LIST_ID, LIST_NAME: list.LIST_NAME, selected: false });
            }
        });
        $scope.sortedLists = result;
    }

    $scope.moveSongList = function(index, direction) {
        var target = index + direction;
        if (target < 0 || target >= $scope.sortedLists.length) return;
        if (!$scope.sortedLists[target].selected) return; // don't move past unselected items
        var temp = $scope.sortedLists[index];
        $scope.sortedLists[index] = $scope.sortedLists[target];
        $scope.sortedLists[target] = temp;
    };

    $scope.loadAvailableLists = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_song_lists' } }).then(
            function success(r){
                $scope.availableLists = r.data || [];
                _listsLoaded = true;
                _buildSortedLists();
            },
            function error(e){ console.log('Ajax call error: ', e); });
    };

    $scope.loadAllLanguages = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_all_languages' } }).then(
            function success(r){ $scope.allLanguages = r.data || []; },
            function error(e){ console.log('Ajax call error: ', e); });
    };

    $scope.loadSettings = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
            function success(r){
                if (r.data && r.data.group_id) {
                    angular.extend($scope.settings, r.data);
                    $scope.selectedLanguages = {};
                    if ($scope.settings.available_languages) {
                        var codes = $scope.settings.available_languages.split(',');
                        angular.forEach(codes, function(c){ $scope.selectedLanguages[c.trim()] = true; });
                    }
                    if ($scope.settings.streaming_height_percent)
                        $scope.settings.streaming_height_percent = parseInt($scope.settings.streaming_height_percent, 10);
                    if (!$scope.settings.sermon_notes_bg_color)   $scope.settings.sermon_notes_bg_color   = '#2b2b2b';
                    if (!$scope.settings.sermon_bible_base_color)  $scope.settings.sermon_bible_base_color  = '#1565c0';
                    if (!$scope.settings.sermon_msg_base_color)    $scope.settings.sermon_msg_base_color    = '#6a1b9a';
                    if (!$scope.settings.slide_bg_color)           $scope.settings.slide_bg_color           = '#1a237e';
                    $scope.settings.sermon_notes_font_size = parseInt($scope.settings.sermon_notes_font_size, 10) || 100;
                    $scope.settings.sermon_scale_chips = parseInt($scope.settings.sermon_scale_chips) || 0;
                    if (!$scope.settings.ui_lang) $scope.settings.ui_lang = 'ru';
                    _initialUiLang = $scope.settings.ui_lang;
                    _settingsLoaded = true;
                    _buildSortedLists();
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
        $scope.sortedLists.forEach(function(item) { if (item.selected) ids.push(String(item.LIST_ID)); });
        $scope.settings.available_lists = ids.join(',');

        var langCodes = [];
        angular.forEach($scope.selectedLanguages, function(v, k){ if (v) langCodes.push(k); });
        // null (empty string) means "all languages" — backwards-compatible default
        $scope.settings.available_languages = langCodes.length > 0 ? langCodes.join(',') : '';
        $http({ method: "POST", url: "/ajax", data: { command: 'save_user_settings', settings: $scope.settings } }).then(
            function success(r){
                if (r.data.status !== 'success') {
                    alert('❌ Ошибка при сохранении настроек!');
                    return;
                }
                // If UI language changed, reload so PHP re-injects window.UI_DICT.
                if ($scope.settings.ui_lang && $scope.settings.ui_lang !== _initialUiLang) {
                    window.location.reload();
                    return;
                }
                alert('✅ Настройки успешно сохранены!');
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
    $scope.loadAllLanguages();

    // ============================================================
    // GROUP USERS
    // Insert before loadSettings();
    // ============================================================

    var ALL_ROLES = [
        { role: 'admin',    roleLabel: 'Администратор' },
        { role: 'leader',   roleLabel: 'Ведущий' },
        { role: 'musician', roleLabel: 'Музыкант' },
        { role: 'preacher', roleLabel: 'Проповедник' },
        { role: 'tech',     roleLabel: 'Техник' },
        { role: 'screen',   roleLabel: 'Экраны' }
    ];

    $scope.userSlots = ALL_ROLES.map(function(r) {
        return { role: r.role, roleLabel: r.roleLabel, user: null };
    });

    $scope.getCurrentUserId = function() {
        // Get current user ID from session (passed via PHP)
        return parseInt(window.currentUserId) || 0;
    };

    $scope.canEditUser = function(user) {
        if (!user) return false;
        // Admin can edit all users, others can only edit themselves
        return $scope.permissions.canManageUsers || parseInt(user.ID) === $scope.getCurrentUserId();
    };

    $scope.getRoleBadgeStyle = function(role) {
        var colors = {
            admin:    { color: '#fff', background: '#c62828', border: '1px solid #b71c1c' },
            leader:   { color: '#fff', background: '#1565c0', border: '1px solid #0d47a1' },
            musician: { color: '#fff', background: '#2e7d32', border: '1px solid #1b5e20' },
            preacher: { color: '#fff', background: '#6a1b9a', border: '1px solid #4a148c' },
            tech:     { color: '#fff', background: '#f57c00', border: '1px solid #e65100' },
            screen:   { color: '#fff', background: '#00838f', border: '1px solid #006064' }
        };
        return colors[role] || { color: '#333', background: '#e0e0e0' };
    };

    $scope.loadGroupUsers = function() {
        $http({ method: 'POST', url: '/ajax', data: { command: 'get_group_users' } }).then(
            function success(r) {
                var users = r.data || [];

                // Reset slots
                $scope.userSlots = ALL_ROLES.map(function(slot) {
                    var found = null;
                    for (var i = 0; i < users.length; i++) {
                        if (users[i].ROLE === slot.role) {
                            found = users[i];
                            found.googleAccounts = [];
                            break;
                        }
                    }
                    return { role: slot.role, roleLabel: slot.roleLabel, user: found };
                });

                // Load Google accounts for each user
                $scope.userSlots.forEach(function(slot) {
                    if (slot.user) {
                        $scope.loadGoogleAccounts(slot.user);
                    }
                });
            },
            function error(e) { console.log('loadGroupUsers error:', e); }
        );
    };

    $scope.createGroupUser = function(role) {
        $http({ method: 'POST', url: '/ajax', data: { command: 'create_group_user', role: role } }).then(
            function success(r) {
                if (r.data && r.data.status === 'success') {
                    // Find slot and insert new user
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

    // ============================================================
    // GOOGLE ACCOUNT LINKING (Multiple accounts support)
    // ============================================================

    $scope.loadGoogleAccounts = function(user) {
        $http({ method: 'POST', url: '/ajax', data: {
            command: 'get_google_account_status',
            user_id: user.ID
        }}).then(
            function success(r) {
                if (r.data && r.data.status === 'ok') {
                    user.googleAccounts = r.data.accounts || [];
                } else {
                    user.googleAccounts = [];
                }
            },
            function error(e) {
                user.googleAccounts = [];
            }
        );
    };

    $scope.linkGoogleAccount = function(user) {
        $http({ method: 'POST', url: '/ajax', data: {
            command: 'get_google_oauth_url',
            user_id: user.ID
        }}).then(
            function success(r) {
                if (r.data && r.data.status === 'ok') {
                    // Redirect to Google OAuth
                    window.location.href = r.data.url;
                } else {
                    alert('❌ Ошибка: ' + (r.data.message || 'Unknown error'));
                }
            },
            function error(e) { alert('❌ Ошибка при получении OAuth URL!'); }
        );
    };

    $scope.unlinkGoogleAccount = function(user, accountId) {
        if (!confirm('Отвязать этот Google аккаунт?')) return;

        $http({ method: 'POST', url: '/ajax', data: {
            command: 'unlink_google_account',
            account_id: accountId
        }}).then(
            function success(r) {
                if (r.data && r.data.status === 'ok') {
                    $scope.loadGoogleAccounts(user);
                    alert('✅ Google аккаунт отвязан!');
                } else {
                    alert('❌ Ошибка: ' + (r.data.message || 'Unknown error'));
                }
            },
            function error(e) { alert('❌ Ошибка при отвязке Google аккаунта!'); }
        );
    };

    $scope.formatDate = function(dateString) {
        if (!dateString) return '';
        var d = new Date(dateString);
        return d.toLocaleDateString('ru-RU');
    };

    $scope.loadPermissions();
    $scope.loadGroupUsers();
    $scope.loadSettings();
    $scope.loadAvailableLists();
});