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
                if( respond.data.length > 0 ){
                        $scope.imgName = respond.data[0].image + '?t=' + new Date().getTime();
                }else{
                        $scope.imgName = $scope.placeholderImage;
                }
            },
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
        const socket = new WebSocket("wss://" + window.location.host + "/ws");

        socket.onmessage = function(event) {
            let data = JSON.parse(event.data);

            console.log(event.data);

            if (data.type === 'update_needed') {
                $scope.$apply(function() {
                    $scope.checkImage();
                });
            }
        };

        socket.onclose = function(event) {
            setTimeout(initSocket, 2000);
        };

        socket.onopen = function(event) {
            setInterval(() => { socket.send(JSON.stringify({type: 'ping'})); }, 30000);
        };
    }

    $scope.loadPlaceholderImage();
    $scope.checkImage();
    initSocket();
});

