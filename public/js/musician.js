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

    const socket = new WebSocket("wss://" + window.location.host + ":2345");

    socket.onmessage = function(event) {
        let data = JSON.parse(event.data);

        console.log(event.data);

        if (data.type === 'update_needed') {
            // Как только получили сигнал — обновляем данные
            $scope.$apply(function() {
                $scope.checkImage();
            });
        }
    };

    $scope.checkImage();

});

