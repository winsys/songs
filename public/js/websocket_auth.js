/**
 * Authenticated WebSocket — with auto-reconnect, ping/keepalive, and session refresh.
 *
 * createAuthenticatedWebSocket(url, onMessage, onError, onStatusChange)
 *   url            – WebSocket URL (null = auto-detect from current host)
 *   onMessage      – called for every inbound application message
 *   onError        – called on auth/protocol error
 *   onStatusChange – called with (true|false) when connection is established / lost
 *
 * Returns { destroy() } – call destroy() to permanently close and stop reconnects.
 */
(function (window) {
    'use strict';

    var PING_INTERVAL       = 25 * 1000;   // send ping every 25 s
    var PONG_TIMEOUT        = 10 * 1000;   // expect pong within 10 s
    var RECONNECT_BASE      = 1000;        // first reconnect after 1 s
    var RECONNECT_MAX       = 30 * 1000;   // max reconnect delay 30 s
    var SESSION_PING_INTERVAL = 10 * 60 * 1000; // keep PHP session alive every 10 min

    window.createAuthenticatedWebSocket = function (url, onMessage, onError, onStatusChange) {

        // Auto-detect WebSocket URL
        if (!url || typeof url !== 'string') {
            var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            url = proto + '//' + window.location.host + '/ws';
        }

        var socket         = null;
        var authenticated  = false;
        var destroyed      = false;
        var reconnectDelay = RECONNECT_BASE;

        var reconnectTimer = null;
        var pingTimer      = null;
        var pongTimer      = null;
        var sessionTimer   = null;

        // ── Status helper ──────────────────────────────────────────
        function notifyStatus(connected) {
            if (onStatusChange) {
                try { onStatusChange(connected); } catch (e) { /* ignore */ }
            }
        }

        // ── Ping / Pong ────────────────────────────────────────────
        function stopPing() {
            if (pingTimer)  { clearInterval(pingTimer);  pingTimer  = null; }
            if (pongTimer)  { clearTimeout(pongTimer);   pongTimer  = null; }
        }

        function startPing() {
            stopPing();
            pingTimer = setInterval(function () {
                if (!socket || socket.readyState !== WebSocket.OPEN) return;
                socket.send(JSON.stringify({ type: 'ping' }));
                // Expect a pong back; if not received, close and reconnect
                pongTimer = setTimeout(function () {
                    console.warn('WebSocket: pong timeout — reconnecting');
                    socket.close();
                }, PONG_TIMEOUT);
            }, PING_INTERVAL);
        }

        // ── PHP Session keepalive ─────────────────────────────────
        // Sends a lightweight AJAX call every SESSION_PING_INTERVAL to prevent
        // the server-side session from expiring during long meetings.
        function startSessionKeepalive() {
            if (sessionTimer) return;
            sessionTimer = setInterval(function () {
                var csrfToken = (typeof window._getCsrfToken === 'function')
                    ? window._getCsrfToken() : '';
                fetch('/ajax', {
                    method:      'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ command: 'ping' })
                }).then(function (r) {
                    if (r.status === 401 || r.status === 403) {
                        // Session expired — redirect to login
                        window.location.href = '/login';
                    }
                }).catch(function () { /* ignore network errors — will retry next interval */ });
            }, SESSION_PING_INTERVAL);
        }

        function stopSessionKeepalive() {
            if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
        }

        // ── Reconnect ─────────────────────────────────────────────
        function scheduleReconnect() {
            if (destroyed) return;
            reconnectTimer = setTimeout(function () {
                reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
                connect();
            }, reconnectDelay);
        }

        // ── Connect ───────────────────────────────────────────────
        function connect() {
            if (destroyed) return;

            socket = new WebSocket(url);

            socket.addEventListener('open', function () {
                // Send auth as the very first message
                var authData = {
                    type:   'auth',
                    userId: window.WS_USER_ID,
                    token:  window.WS_AUTH_TOKEN
                };
                if (window.WS_GROUP_ID && window.WS_GROUP_ID > 0) {
                    authData.groupId = window.WS_GROUP_ID;
                }
                socket.send(JSON.stringify(authData));
            });

            socket.addEventListener('message', function (event) {
                try {
                    var data = JSON.parse(event.data);

                    // Pong response — cancel the timeout
                    if (data.type === 'pong') {
                        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
                        return;
                    }

                    // Authentication success
                    if (data.type === 'auth_success') {
                        authenticated  = true;
                        reconnectDelay = RECONNECT_BASE;   // reset backoff
                        notifyStatus(true);
                        startPing();
                        startSessionKeepalive();
                        return;
                    }

                    // Authentication or protocol error
                    if (data.error) {
                        console.error('WebSocket error from server:', data.error);
                        if (onError) { try { onError(data.error); } catch (e) {} }
                        socket.close();
                        return;
                    }

                    // Normal application message
                    if (authenticated) {
                        if (onMessage) { try { onMessage(data); } catch (e) {} }
                        window.dispatchEvent(
                            new CustomEvent('websocket_message', { detail: data })
                        );
                    }
                } catch (e) {
                    console.error('WebSocket message parse error:', e);
                }
            });

            socket.addEventListener('error', function (error) {
                console.error('WebSocket connection error:', error);
                if (onError) { try { onError(error); } catch (e) {} }
            });

            socket.addEventListener('close', function () {
                authenticated = false;
                stopPing();
                notifyStatus(false);
                scheduleReconnect();
            });
        }

        // ── Start ─────────────────────────────────────────────────
        connect();

        // ── Public API ────────────────────────────────────────────
        return {
            /** Permanently close the connection (no reconnect). */
            destroy: function () {
                destroyed = true;
                stopPing();
                stopSessionKeepalive();
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
                if (socket) { socket.close(); socket = null; }
            }
        };
    };

})(window);
