/**
 * [SECURITY] Authenticated WebSocket Connection Helper
 * Automatically handles authentication on connection
 */
(function(window) {
    'use strict';

    /**
     * Create an authenticated WebSocket connection
     * @param {string} url - WebSocket URL (e.g., "wss://example.com/ws")
     * @param {function} onMessage - Callback for incoming messages
     * @param {function} onError - Optional error callback
     * @returns {WebSocket}
     */
    window.createAuthenticatedWebSocket = function(url, onMessage, onError) {
        const socket = new WebSocket(url);
        let authenticated = false;

        socket.addEventListener('open', function() {
            // [SECURITY] Send authentication as first message
            const authMessage = JSON.stringify({
                type: 'auth',
                userId: window.WS_USER_ID,
                token: window.WS_AUTH_TOKEN
            });
            socket.send(authMessage);
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
