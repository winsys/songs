/**
 * Network status banner.
 *
 * Shows a fixed top bar when the internet connection or the WebSocket link
 * to the server is lost, and a short green "restored" note when it comes
 * back. Self-contained: injects its own DOM and styles, no Angular.
 *
 * Signals:
 *   - browser online/offline events (immediate — network interface gone);
 *   - the global 'websocket_status' CustomEvent dispatched by
 *     websocket_auth.js (detail.connected), debounced by WS_GRACE_MS so a
 *     quick reconnect cycle does not flash the banner.
 *
 * Included via layout.html (every view except the musician page) and
 * sermon_layout.html. The main screen and the streaming screen use their
 * own layouts and deliberately have no banner. z-index sits far above
 * Bootstrap modals (1050), so the banner stays visible over popups —
 * e.g. the leader's song-selection dialog.
 */
(function () {
    'use strict';

    var WS_GRACE_MS = 2000;  // delay before showing on a WS drop (reconnect flaps)
    var RESTORED_MS = 2500;  // how long the green "restored" note stays

    var browserOnline = (typeof navigator.onLine === 'boolean') ? navigator.onLine : true;
    var wsConnected   = null;   // null = no WebSocket used on this page (yet)
    var wsTimer       = null;
    var hideTimer     = null;
    var showingProblem = false;

    var el = null;

    function ensureEl() {
        if (el) return el;
        el = document.createElement('div');
        el.id = 'net-status-banner';
        el.style.cssText =
            'display:none; position:fixed; top:0; left:0; right:0; z-index:99999;' +
            'padding:8px 14px; text-align:center; color:#fff;' +
            'font:600 15px/1.35 "Helvetica Neue",Helvetica,Arial,sans-serif;' +
            'box-shadow:0 1px 5px rgba(0,0,0,.35); pointer-events:none;';
        document.body.appendChild(el);
        return el;
    }

    /** i18n with a hard fallback for pages where the dictionary is absent. */
    function msg(key, fallback) {
        try {
            if (window.t) {
                var s = window.t(key);
                if (s && s !== key) return s;
            }
        } catch (e) { /* ignore */ }
        return fallback;
    }

    function offline() {
        return !browserOnline || wsConnected === false;
    }

    function render() {
        if (!document.body) return; // too early; the DOMContentLoaded render will catch up
        if (offline()) {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            ensureEl();
            el.textContent = msg('net.offline', 'Нет соединения с сервером');
            el.style.background = '#c0392b';
            el.style.display = 'block';
            showingProblem = true;
        } else if (showingProblem) {
            showingProblem = false;
            ensureEl();
            el.textContent = msg('net.restored', 'Соединение восстановлено');
            el.style.background = '#27ae60';
            el.style.display = 'block';
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(function () { el.style.display = 'none'; }, RESTORED_MS);
        }
    }

    window.addEventListener('offline', function () { browserOnline = false; render(); });
    window.addEventListener('online',  function () { browserOnline = true;  render(); });

    window.addEventListener('websocket_status', function (e) {
        var connected = !!(e && e.detail && e.detail.connected);
        if (wsTimer) { clearTimeout(wsTimer); wsTimer = null; }
        if (connected) {
            wsConnected = true;
            render();
        } else {
            // Grace period: auto-reconnect usually recovers in a moment.
            wsTimer = setTimeout(function () {
                wsConnected = false;
                render();
            }, WS_GRACE_MS);
        }
    });

    // Initial state (e.g. the page was opened from cache while offline).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
