app.controller('Musician', function ($scope, $http, $timeout)
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

    // Server polling, refresh every 5 sec
    $scope.start = function myhandler()
    {
        $scope.checkImage();
        $timeout(myhandler, 1000);
    };

    $scope.start();

});

