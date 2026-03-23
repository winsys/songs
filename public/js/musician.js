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

    $scope.checkImage = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_image' } }).then(
            function success(respond){
                if (respond.data.length > 0) {
                    var imagePath = respond.data[0].image || '';
                    // Show placeholder for: sermon images, bible text marker, empty path
                    var isSermonImage = (imagePath.indexOf('/sermon_images/') === 0);
                    var isBible = (imagePath === '__bible__');
                    var isEmpty = (imagePath === '');
                    if (isSermonImage || isBible || isEmpty) {
                        $scope.imgName = $scope.placeholderImage;
                    } else {
                        $scope.imgName = imagePath + '?t=' + new Date().getTime();
                    }
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
                if (data.type === 'update_needed') {
                    $scope.$apply(function() {
                        $scope.checkImage();
                    });
                }
            }
        );
    }

    $scope.loadPlaceholderImage();
    $scope.checkImage();
    initSocket();
});