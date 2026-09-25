/**
 * Song edit / add dialog shared by the tech console and the leader page.
 * Markup + CSS: templates/song_edit_dialog.html (PHP-included by both pages).
 *
 * window.installSongEditor($scope, $http, opts) puts the dialog's state and
 * handlers on the page controller's scope (the template calls them):
 *   editConfig, songNumError, editFavorite(item), addNewSong(), showEditDialog(flag),
 *   previewImage(), clearImagePreview(), showEnlargedImage(src), loadSongImages(),
 *   onGroupFileSelected(input), deleteGroupImage(group), checkSongNumUniqueness(),
 *   saveSongEdits()
 * The scope must provide langList (content languages, group order).
 *
 * opts:
 *   listId()                 collection a NEW song is created in
 *   listName()               its name for the dialog title (optional)
 *   onSaved(songId, isNew)   after a successful Save (playlist reload, add to favorites, ...)
 *   onMainImage()            the main group's image changed (playlist thumbnails show it)
 *
 * Image groups of a saved song upload / delete immediately (they are files,
 * not song fields); a NEW song gets its main image on Save (pendingFile).
 * A PDF picked as sheet music becomes one cropped JPEG page (pdf_page_image.js).
 */
(function () {
    'use strict';

    window.installSongEditor = function ($scope, $http, opts) {
        opts = opts || {};

        function notify(fn) {
            if (typeof opts[fn] === 'function') {
                opts[fn].apply(null, Array.prototype.slice.call(arguments, 1));
            }
        }

        function songTextForDisplay(text) {
            return (text || '').replace(/\r\n|\r/g, '\n').replace(/\n/g, '\n\n');
        }
        function songTextForSave(text) {
            return (text || '').replace(/\r/g, '').replace(/\n+/g, '\r\n');
        }

        $scope.editConfig   = {};
        $scope.songNumError = '';

        $scope.editFavorite = function (listItem) {
            var texts = {};
            for (var i = 0; i < $scope.langList.length; i++) {
                var lang = $scope.langList[i];
                texts[lang.code] = songTextForDisplay(listItem['TEXT' + lang.col_suffix]);
            }
            $scope.songNumError = '';
            $scope.editConfig = {
                title: window.t('tech.dialog.editSong'),
                songId: listItem.ID,
                texts: texts,
                songName: listItem.NAME,
                songNum: listItem.NUM,
                dispName: listItem.dispName,
                currentImage: listItem.imageName,
                previewImage: null,
                enlargedImage: null,
                imageGroups: [],
                imgBuster: '',
                isNewSong: false
            };
            $scope.showEditDialog(true);
            $scope.loadSongImages();
        };

        $scope.addNewSong = function () {
            var texts = {};
            for (var i = 0; i < $scope.langList.length; i++) {
                texts[$scope.langList[i].code] = '';
            }
            var listName = typeof opts.listName === 'function' ? opts.listName() : '';
            $scope.songNumError = '';
            $scope.editConfig = {
                title: window.t('tech.dialog.addSong') + (listName ? ': ' + listName : ''),
                songId: null,
                listId: opts.listId(),
                texts: texts,
                songName: '',
                songNum: null,
                dispName: '',
                currentImage: null,
                previewImage: null,
                enlargedImage: null,
                imageGroups: [],
                imgBuster: '',
                isNewSong: true
            };
            $scope.showEditDialog(true);
        };

        $scope.showEditDialog = function (flag) {
            jQuery('#edit-song-popup .modal').modal(flag ? 'show' : 'hide');
        };

        // A picked sheet-music file ready for upload: images pass through, a PDF
        // becomes one cropped JPEG page (pdf_page_image.js). Resolves to null when
        // the user cancels the PDF page question; rejections carry a UI message.
        function prepareSheetFile(file) {
            if (!window.PdfPageImage || !window.PdfPageImage.isPdf(file)) return Promise.resolve(file);
            return window.PdfPageImage.fromFile(file);
        }

        // Native onchange of the NEW song's image input: the prepared file waits
        // in editConfig.pendingFile until Save uploads it.
        $scope.previewImage = function () {
            var fileInput = document.getElementById('imageUpload');
            var file = fileInput.files[0];
            fileInput.value = '';   // re-picking the same file must fire onchange again
            if (!file || !$scope.editConfig || $scope.editConfig.imageBusy) return;
            var cfg = $scope.editConfig;
            $scope.$applyAsync(function () { cfg.imageBusy = true; });
            prepareSheetFile(file).then(function (ready) {
                if (!ready) {
                    $scope.$applyAsync(function () { cfg.imageBusy = false; });
                    return;
                }
                var reader = new FileReader();
                reader.onload = function (e) {
                    $scope.$applyAsync(function () {
                        cfg.imageBusy    = false;
                        cfg.pendingFile  = ready;
                        cfg.previewImage = e.target.result;
                    });
                };
                reader.readAsDataURL(ready);
            }, function (err) {
                $scope.$applyAsync(function () { cfg.imageBusy = false; });
                alert(err && err.message ? err.message : window.t('settings.alert.imageUploadError'));
            });
        };

        $scope.clearImagePreview = function () {
            $scope.editConfig.previewImage = null;
            $scope.editConfig.pendingFile  = null;
            document.getElementById('imageUpload').value = '';
        };

        $scope.showEnlargedImage = function (src) {
            if (!src) return;
            $scope.editConfig.enlargedImage = src;
            jQuery('#enlarged-image-popup .modal').modal('show');
        };
        // Bootstrap 3 drops body.modal-open when the enlarged popup closes even
        // though the edit dialog below is still open — restore it.
        jQuery(document).on('hidden.bs.modal', '#enlarged-image-popup .modal', function () {
            if (jQuery('#edit-song-popup .modal').hasClass('in')) jQuery('body').addClass('modal-open');
        });

        // ── Image groups ("types") of the song's collection ─────────────
        function applySongImages(groups) {
            if (!$scope.editConfig) return;
            $scope.editConfig.imageGroups = groups || [];
            $scope.editConfig.imgBuster   = '?t=' + new Date().getTime();
            // currentImage mirrors the main group's image (the legacy main sheet).
            var main = null;
            angular.forEach($scope.editConfig.imageGroups, function (g) { if (!main && g.is_main) main = g; });
            if (main) {
                $scope.editConfig.currentImage = main.image ? main.image + $scope.editConfig.imgBuster : null;
            }
        }

        $scope.loadSongImages = function () {
            var songId = $scope.editConfig && $scope.editConfig.songId;
            if (!songId) return;
            $http({ method: 'POST', url: '/ajax', data: { command: 'get_song_images', song_id: songId } }).then(
                function (r) {
                    if (!$scope.editConfig || $scope.editConfig.songId !== songId) return;
                    if (r.data && r.data.status === 'success') applySongImages(r.data.groups);
                }
            );
        };

        function findImageGroup(gid) {
            var groups = ($scope.editConfig && $scope.editConfig.imageGroups) || [];
            for (var i = 0; i < groups.length; i++) {
                if (groups[i].id === gid) return groups[i];
            }
            return null;
        }

        // Native onchange of the per-group file input (outside the digest):
        // the chosen file becomes the group's image (adds or replaces it).
        $scope.onGroupFileSelected = function (input) {
            var gid  = parseInt(input.getAttribute('data-gid'), 10);
            var file = input.files && input.files[0];
            input.value = '';
            var group = findImageGroup(gid);
            if (!group || !file || group.uploading || group.converting) return;
            var pdf = !!(window.PdfPageImage && window.PdfPageImage.isPdf(file));
            $scope.$applyAsync(function () { if (pdf) group.converting = true; else group.uploading = true; });
            prepareSheetFile(file).then(function (ready) {
                $scope.$applyAsync(function () {
                    group.converting = false;
                    if (ready) uploadGroupImage(group, gid, ready);
                });
            }, function (err) {
                $scope.$applyAsync(function () { group.converting = false; });
                alert(err && err.message ? err.message : window.t('settings.alert.imageUploadError'));
            });
        };

        function uploadGroupImage(group, gid, file) {
            group.uploading = true;
            var fd = new FormData();
            fd.append('command',  'upload_song_group_image');
            fd.append('song_id',  $scope.editConfig.songId);
            fd.append('group_id', gid);
            fd.append('image',    file);
            $http.post('/ajax', fd, { transformRequest: angular.identity, headers: { 'Content-Type': undefined } }).then(
                function (r) {
                    group.uploading = false;
                    var d = r.data;
                    if (!d || d.status !== 'success') {
                        alert(window.t('settings.alert.imageUploadError') + (d && d.message ? '\n' + d.message : ''));
                        $scope.loadSongImages();
                        return;
                    }
                    applySongImages(d.groups);
                    if (group.is_main) notify('onMainImage');   // list thumbs show the main sheet
                },
                function () {
                    group.uploading = false;
                    alert(window.t('settings.alert.imageUploadError'));
                }
            );
        }

        $scope.deleteGroupImage = function (group) {
            if (!confirm(window.t('tech.esp.deleteImageConfirm', { group: group.name }))) return;
            $http({ method: 'POST', url: '/ajax', data: {
                    command: 'delete_song_group_image',
                    song_id: $scope.editConfig.songId,
                    group_id: group.id } }).then(
                function (r) {
                    var d = r.data;
                    if (!d || d.status !== 'success') {
                        alert(d && d.message ? d.message : window.t('import.log.serverError'));
                        return;
                    }
                    applySongImages(d.groups);
                    if (group.is_main) notify('onMainImage');
                }
            );
        };

        $scope.checkSongNumUniqueness = function () {
            var cfg = $scope.editConfig;
            if (!cfg.isNewSong || !cfg.songNum) {
                $scope.songNumError = '';
                return;
            }
            $http({ method: 'POST', url: '/ajax',
                data: { command: 'check_song_num_exists',
                    list_id: cfg.listId,
                    song_num: cfg.songNum } }).then(
                function (response) {
                    $scope.songNumError = response.data.exists ? window.t('tech.error.numberInUse') : '';
                }
            );
        };

        // ── Save ────────────────────────────────────────────────────────
        $scope.saveSongEdits = function () {
            var cfg = $scope.editConfig;
            if (!cfg || cfg.imageBusy || cfg.saving) return;   // a PDF is still being converted / a request is running
            var textData = {};
            for (var i = 0; i < $scope.langList.length; i++) {
                var lang = $scope.langList[i];
                textData['text' + lang.col_suffix.toLowerCase()] = songTextForSave((cfg.texts || {})[lang.code]);
            }
            if (cfg.isNewSong) {
                if ($scope.songNumError) {
                    alert(window.t('tech.error.fixBeforeSave'));
                    return;
                }
                createSong(cfg, textData);
            } else {
                updateSong(cfg, textData);
            }
        };

        function createSong(cfg, textData) {
            cfg.saving = true;
            $http({ method: 'POST', url: '/ajax',
                data: angular.extend({ command: 'create_song',
                    list_id: cfg.listId,
                    name: cfg.songName,
                    song_num: cfg.songNum }, textData) }).then(
                function (response) {
                    cfg.saving = false;
                    var d = response.data || {};
                    if (d.status !== 'success' || !d.song_id) {
                        alert(d.message || window.t('import.log.serverError'));
                        return;
                    }
                    cfg.songId = d.song_id;
                    notify('onSaved', d.song_id, true);
                    if (!cfg.pendingFile) {
                        $scope.showEditDialog(false);
                        return;
                    }
                    cfg.saving = true;
                    uploadNewSongImage(cfg, function (ok) {
                        cfg.saving = false;
                        if (ok) {
                            notify('onMainImage');
                            $scope.showEditDialog(false);
                            return;
                        }
                        // The song exists already: from now on the dialog edits it
                        // (a second Save must not create a duplicate) and its image
                        // is managed in the groups block.
                        cfg.isNewSong   = false;
                        cfg.title       = window.t('tech.dialog.editSong');
                        cfg.pendingFile = null;
                        $scope.loadSongImages();
                    });
                },
                function (e) {
                    cfg.saving = false;
                    console.log('Ajax call error: ', e);
                    alert(window.t('import.log.serverError'));
                }
            );
        }

        function updateSong(cfg, textData) {
            cfg.saving = true;
            $http({ method: 'POST', url: '/ajax',
                data: angular.extend({ command: 'update_song',
                    id: cfg.songId,
                    name: cfg.songName }, textData) }).then(
                function () {
                    cfg.saving = false;
                    notify('onSaved', cfg.songId, false);
                    $scope.showEditDialog(false);
                },
                function (e) {
                    cfg.saving = false;
                    console.log('Ajax call error: ', e);
                    alert(window.t('import.log.serverError'));
                }
            );
        }

        // The NEW song's main image (picked before the song existed); done(ok).
        function uploadNewSongImage(cfg, done) {
            var formData = new FormData();
            formData.append('image', cfg.pendingFile);
            formData.append('command', 'upload_song_image');
            formData.append('song_id', cfg.songId);
            $http.post('/ajax', formData, {
                transformRequest: angular.identity,
                headers: { 'Content-Type': undefined }
            }).then(
                function (response) {
                    var data = response.data;
                    // The server answers HTTP 200 on failure too ({status:'error', message}).
                    if (!data || data.status !== 'success') {
                        var msg = (data && data.message) ? data.message : '';
                        console.log('Image upload failed: ', msg);
                        alert(window.t('settings.alert.imageUploadError') + (msg ? '\n' + msg : ''));
                        done(false);
                        return;
                    }
                    done(true);
                },
                function (e) {
                    console.log('Image upload error: ', e);
                    alert(window.t('settings.alert.imageUploadError'));
                    done(false);
                }
            );
        }
    };
})();
