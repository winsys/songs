/**
 * yt_bridge.js — position/state bridge to an embedded YouTube player.
 *
 * Speaks the postMessage protocol of YouTube's IFrame Player API directly
 * (the one www-widgetapi.js uses under the hood), so no external script is
 * loaded. The iframe must be embedded with `enablejsapi=1`.
 *
 *   parent → player : {event:'listening', id, channel:'widget'}  handshake
 *                     {event:'command', func, args}                commands
 *   player → parent : initialDelivery (full state), infoDelivery (changed
 *                     fields: currentTime ~2×/s while playing, playerState,
 *                     duration, playbackRate…), onReady, alreadyInitialized
 *                     (reply to a repeated handshake), onStateChange (only
 *                     after an `addEventListener` command)
 *
 * Messages are accepted only from the bridged iframe's own window, so any
 * other postMessage traffic on the page is ignored. If the player never
 * answers (blocked network, protocol change) the bridge simply never
 * becomes ready and getTime() stays null — callers must treat null as
 * "position unknown" and degrade gracefully.
 *
 *   var b = window.createYouTubeBridge(iframe, {
 *       onInfo: function (info) {}        // {time, duration, state, rate}
 *                                         // after every position report
 *       onStateChange: function (s) {}    // YouTube state code
 *                                         // (-1 unstarted, 0 ended, 1 playing,
 *                                         //  2 paused, 3 buffering, 5 cued)
 *   });
 *   b.getTime()      → seconds (extrapolated while playing) or null
 *   b.getDuration()  → seconds or null
 *   b.getState()     → last known state code (-1 = unknown)
 *   b.isPlaying()    → state === 1
 *   b.isReady()      → the player has answered the handshake
 *   b.seekTo(sec)    → queued until the player is ready
 *   b.destroy()      → detach listeners/timers (call before dropping the iframe)
 *
 * Create one bridge per video: when the iframe gets a new src, destroy the
 * old bridge and create a new one (the sermon page reuses its iframe).
 */
(function (window) {
    'use strict';

    var STATE_PLAYING = 1;
    var HANDSHAKE_MS  = 500;   // `listening` retry period until the player answers
    var HANDSHAKE_MAX = 60;    // …at most this many retries (30 s)
    var STALE_MS      = 6000;  // a playing player reports its position about twice a second

    function createYouTubeBridge(iframe, handlers) {
        handlers = handlers || {};

        var alive = true;
        var ready = false;
        var state = -1;
        var rate  = 1;
        var duration = null;
        var lastTime = null;   // last reported position…
        var lastWall = 0;      // …and Date.now() when it was reported
        var pendingSeek = null;
        var handshakeTimer = null;
        var handshakeLeft  = HANDSHAKE_MAX;

        function post(msg) {
            if (!alive || !iframe) return;
            var win = iframe.contentWindow;
            if (!win) return;
            try {
                win.postMessage(JSON.stringify(msg), '*');
            } catch (e) { /* detached iframe */ }
        }

        function extrapolate(now) {
            if (lastTime === null) return null;
            if (state !== STATE_PLAYING) return lastTime;
            if (now - lastWall > STALE_MS) return null;   // no reports — position unknown
            var t = lastTime + (now - lastWall) / 1000 * rate;
            return (duration !== null && t > duration) ? duration : t;
        }

        function stopHandshake() {
            if (handshakeTimer) { clearInterval(handshakeTimer); handshakeTimer = null; }
        }

        function startHandshake() {
            stopHandshake();
            if (!alive) return;
            handshakeLeft = HANDSHAKE_MAX;
            post({ event: 'listening', id: 1, channel: 'widget' });
            handshakeTimer = setInterval(function () {
                if (ready || --handshakeLeft <= 0) { stopHandshake(); return; }
                post({ event: 'listening', id: 1, channel: 'widget' });
            }, HANDSHAKE_MS);
        }

        function onLoad() {
            // The iframe's load event fires long after the player started
            // talking (it waits for every subresource) — or this is a new
            // document after a src change. Either way re-handshake: an
            // already-initialised player just answers `alreadyInitialized`,
            // a new one sends a full `initialDelivery` that replaces the
            // previous values.
            ready = false;
            startHandshake();
        }

        function setState(next, now) {
            if (next === state) return;
            // Freeze the extrapolated position when playback stops advancing.
            if (state === STATE_PLAYING && lastTime !== null) {
                var t = extrapolate(now);
                if (t !== null) { lastTime = t; lastWall = now; }
            }
            state = next;
            if (handlers.onStateChange) handlers.onStateChange(state);
        }

        function onMessage(ev) {
            if (!alive || !iframe || ev.source !== iframe.contentWindow) return;
            if (typeof ev.data !== 'string') return;
            var msg;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            if (!msg || typeof msg !== 'object' || typeof msg.event !== 'string') return;

            var now = Date.now();
            if (!ready) {
                ready = true;
                stopHandshake();
                // Like www-widgetapi.js: state-change events are pushed only
                // once subscribed (position reports carry playerState as
                // well; the subscription just makes changes prompt).
                post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
            }

            if (msg.event === 'infoDelivery' || msg.event === 'initialDelivery') {
                var info = msg.info || {};
                var hasTime = (typeof info.currentTime === 'number' && isFinite(info.currentTime));
                if (typeof info.playbackRate === 'number' && info.playbackRate > 0) rate = info.playbackRate;
                if (typeof info.duration === 'number' && isFinite(info.duration) && info.duration > 0) {
                    duration = info.duration;
                }
                if (hasTime) {
                    lastTime = info.currentTime;
                    lastWall = now;
                }
                if (typeof info.playerState === 'number') setState(info.playerState, now);
                if (hasTime && handlers.onInfo) {
                    handlers.onInfo({ time: lastTime, duration: duration, state: state, rate: rate });
                }
            } else if (msg.event === 'onStateChange' && typeof msg.info === 'number') {
                setState(msg.info, now);
            }

            if (pendingSeek !== null) {
                var s = pendingSeek;
                pendingSeek = null;
                api.seekTo(s);
            }
        }

        var api = {
            getTime:     function () { return extrapolate(Date.now()); },
            getDuration: function () { return duration; },
            getState:    function () { return state; },
            isPlaying:   function () { return state === STATE_PLAYING; },
            isReady:     function () { return ready; },
            seekTo: function (sec) {
                sec = +sec;
                if (!alive || !isFinite(sec) || sec < 0) return;
                if (!ready) { pendingSeek = sec; return; }
                post({ event: 'command', func: 'seekTo', args: [sec, true] });
                lastTime = sec;          // assume success until the player reports
                lastWall = Date.now();
            },
            destroy: function () {
                alive = false;
                stopHandshake();
                window.removeEventListener('message', onMessage);
                if (iframe) iframe.removeEventListener('load', onLoad);
                iframe = null;
            }
        };

        window.addEventListener('message', onMessage);
        iframe.addEventListener('load', onLoad);
        startHandshake();   // retried until the player answers

        return api;
    }

    /**
     * Seconds encoded in a YouTube link's time parameter:
     * `?t=90`, `&t=90s`, `#t=1m30s`, `t=1h2m3s`, `?start=90` → 90 / 90 / 90 / 3723 / 90.
     * 0 when absent or malformed.
     */
    function ytStartSeconds(url) {
        var m = String(url || '').match(/[?&#](?:t|start)=((?:\d+h)?(?:\d+m)?(?:\d+s?)?)(?=[&#]|$)/i);
        if (!m || !m[1]) return 0;
        var p = m[1].match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
        if (!p) return 0;
        var sec = (parseInt(p[1] || 0, 10) * 3600) + (parseInt(p[2] || 0, 10) * 60) + parseInt(p[3] || 0, 10);
        return isFinite(sec) && sec > 0 ? sec : 0;
    }

    window.createYouTubeBridge = createYouTubeBridge;
    window.ytStartSeconds = ytStartSeconds;
})(window);
