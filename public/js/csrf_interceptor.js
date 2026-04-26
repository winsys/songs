(function() {
    'use strict';

    // Read the CSRF token from the meta tag or global variable
    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        return window.CSRF_TOKEN || '';
    }

    var csrfToken = getCsrfToken();

    angular.module('csrfModule', [])
        .factory('csrfInterceptor', function() {
            return {
                request: function(config) {
                    if (csrfToken) {
                        config.headers['X-CSRF-Token'] = csrfToken;
                    }
                    return config;
                }
            };
        })
        .config(['$httpProvider', function($httpProvider) {
            $httpProvider.interceptors.push('csrfInterceptor');
        }]);

    window._getCsrfToken = getCsrfToken;
}());