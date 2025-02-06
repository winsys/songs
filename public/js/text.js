app.controller('Text', function ($scope, $http, $timeout)
{
    $scope.fullScreen = false;
    $scope.text = "Загрузка...";
    $scope.fontSize = 10;

    $scope.enterFullscreen = function() {
        if(!$scope.fullScreen){
            document.getElementById('text-container').requestFullscreen();
            $scope.fullScreen = true;
        }else{
            if (document.exitFullscreen) {
                document.exitFullscreen();
                $scope.fullScreen = false;
            }
        }
    };

    function adjustTextSize() {
        $timeout(function() {
            const container = document.getElementById("text-container");
            const textElement = document.getElementById("text");

            $scope.fontSize = 10;

            while (textElement.scrollHeight <= container.clientHeight &&
            textElement.scrollWidth <= container.clientWidth) {
                $scope.fontSize++;
                textElement.style.fontSize = $scope.fontSize + "px";
            }

            $scope.fontSize--;
            $scope.$apply();
        }, 0);
    }

    function fetchText() {
        $http({ method: "POST", url: "/ajax", data: {command: 'get_text' } }).then(function(response) {
            if ($scope.text !== response.data[0].text) {
                $scope.text = response.data[0].text;
                $timeout(adjustTextSize, 0);
            }
        }).finally(function() {
            $timeout(fetchText, 1000);
        });
    }

    angular.element(window).on('load resize', adjustTextSize);
    fetchText();
});

