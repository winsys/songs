app.controller('Musician', function ($scope, $http)
{
    $scope.fullScreen = false;
    $scope.imgName = '/icon-192.png';

    $scope.checkImage = function(){
        $http({ method: "POST", url: "/ajax", data: {command: 'get_image' } }).then(
            function success(respond){
                if( respond.data.length > 0 ){
                        $scope.imgName = respond.data[0].image;
                }else{
                        $scope.imgName = '/field_small.jpg';
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

    $scope.checkImage();
    initSocket();
});

