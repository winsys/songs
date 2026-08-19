app.controller('Musician', function ($scope, $http)
{
    $scope.fullScreen = false;
    $scope.imgName = '/field_small.jpg';
    $scope.placeholderImage = '/field_small.jpg';

    // Load placeholder image from settings
    $scope.loadPlaceholderImage = function() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_user_settings' } }).then(
            function success(respond){
                if (respond.data && respond.data.placeholder_image) {
                    $scope.placeholderImage = respond.data.placeholder_image;
                } else {
                    $scope.placeholderImage = '/field_small.jpg';
                }
            },
            function error(erespond){
                $scope.placeholderImage = '/field_small.jpg';
            }
        );
    };

    // The musician page listens to the dedicated NOTES CHANNEL only
    // (current_notes + notes_update). Screen traffic (update_needed, Bible,
    // messages, slides, videos, wallpapers) can never disturb the sheet
    // music: notes change exclusively when the leader or the technician
    // toggles a song.
    // Sequence guard: rapid song switching fires several notes_update events,
    // and the resulting get_notes responses can arrive out of order — an older
    // response must never overwrite a newer one (it would pin the previous
    // song's sheet on the screen).
    var notesFetchSeq = 0;
    $scope.checkNotes = function(){
        var seq = ++notesFetchSeq;
        $http({ method: "POST", url: "/ajax", data: {command: 'get_notes' } }).then(
            function success(respond){
                if (seq !== notesFetchSeq) return; // stale out-of-order response
                var imagePath = (respond.data && respond.data.image) || '';
                if (imagePath) {
                    $scope.imgName = imagePath + '?t=' + new Date().getTime();
                } else {
                    $scope.imgName = $scope.placeholderImage;
                }
            }
        );
    };

    $scope.toggleFullscreen = function() {
        if(!$scope.fullScreen){
            document.getElementById('img0').requestFullscreen();
            $scope.fullScreen = true;
        }else{
            if (document.exitFullscreen) {
                document.exitFullscreen();
                $scope.fullScreen = false;
            }
        }
    }

    function initSocket() {
        // [SECURITY] Use authenticated WebSocket connection
        // URL is auto-detected (wss:// for HTTPS, ws:// for HTTP)
        window.createAuthenticatedWebSocket(
            null,
            function(data) {
                if (data.type === 'notes_update') {
                    $scope.$apply(function() {
                        $scope.checkNotes();
                    });
                }
            },
            null,
            function(connected) {
                // Refetch on reconnect to catch a notes_update missed offline.
                if (connected) {
                    $scope.$applyAsync(function() { $scope.checkNotes(); });
                }
            }
        );
    }

    $scope.loadPlaceholderImage();
    $scope.checkNotes();
    initSocket();
});
