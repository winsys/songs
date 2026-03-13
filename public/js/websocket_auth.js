/**
 * [SECURITY] Authenticated WebSocket Connection Helper
 * Automatically handles authentication on connection
 */
(function(window) {
    'use strict';

    /**
     * Create an authenticated WebSocket connection
     * @param {string} url - WebSocket URL (optional, defaults to current host /ws endpoint)
     * @param {function} onMessage - Callback for incoming messages
     * @param {function} onError - Optional error callback
     * @returns {WebSocket}
     */
    window.createAuthenticatedWebSocket = function(url, onMessage, onError) {
        // [SECURITY] Auto-detect protocol and use /ws endpoint via reverse proxy
        if (!url || typeof url !== 'string') {
            // Default: use current host with /ws endpoint (goes through reverse proxy)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            url = protocol + '//' + window.location.host + '/ws';
        }

        const socket = new WebSocket(url);
        let authenticated = false;

        socket.addEventListener('open', function() {
            // [SECURITY] Send authentication as first message
            const authData = {
                type: 'auth',
                userId: window.WS_USER_ID,
                token: window.WS_AUTH_TOKEN
            };

            // Only include groupId if it's set and valid
            if (window.WS_GROUP_ID && window.WS_GROUP_ID > 0) {
                authData.groupId = window.WS_GROUP_ID;
            }

            socket.send(JSON.stringify(authData));
        });

        socket.addEventListener('message', function(event) {
            try {
                const data = JSON.parse(event.data);

                // Handle authentication response
                if (data.type === 'auth_success') {
                    authenticated = true;
                    console.log('WebSocket authenticated successfully');
                    return;
                }

                // Handle authentication errors
                if (data.error) {
                    console.error('WebSocket error:', data.error);
                    if (onError) {
                        onError(data.error);
                    }
                    socket.close();
                    return;
                }

                // Pass other messages to callback
                if (authenticated && onMessage) {
                    onMessage(data);
                }

                // Also dispatch as custom event for global listeners
                if (authenticated) {
                    window.dispatchEvent(new CustomEvent('websocket_message', { detail: data }));
                }
            } catch (e) {
                console.error('WebSocket message parse error:', e);
            }
        });

        socket.addEventListener('error', function(error) {
            console.error('WebSocket connection error:', error);
            if (onError) {
                onError(error);
            }
        });

        socket.addEventListener('close', function() {
            console.log('WebSocket connection closed');
            authenticated = false;
        });

        return socket;
    };

})(window);
