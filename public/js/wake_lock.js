/**
 * Keep the screen on (Screen Wake Lock API).
 *
 * The pages people read from during a service — leader, observer, musician,
 * pianist, sermon display — must not dim or lock the phone / tablet while
 * they are open. Self-contained, no Angular, no UI.
 *
 *   - The browser drops the lock whenever the page is hidden (other app,
 *     screen locked with the power button), so it is re-acquired when the
 *     page becomes visible again.
 *   - A request refused without a user gesture (Safari) is retried on the
 *     next tap / key press; a held or pending lock makes that a no-op.
 *   - No-op where the API is missing (iOS < 16.4, old browsers). iOS home-
 *     screen apps get a real lock since iOS 18.4.
 *
 * Included by leader.html, observer.html, musician.html, piano.html and
 * sermon_layout.html.
 */
(function () {
    'use strict';

    if (!('wakeLock' in navigator)) return;

    var sentinel = null;   // the held WakeLockSentinel
    var pending  = false;  // a request is in flight

    function acquire() {
        if (sentinel || pending || document.visibilityState !== 'visible') return;
        pending = true;
        navigator.wakeLock.request('screen').then(function (s) {
            pending = false;
            sentinel = s;
            s.addEventListener('release', function () {
                if (sentinel === s) sentinel = null;
            });
        }, function () {
            pending = false;   // refused: retried on the next gesture / return to the page
        });
    }

    document.addEventListener('visibilitychange', acquire);
    window.addEventListener('pageshow', acquire);
    // Events that carry user activation (touchend / pointerup on touch screens).
    ['click', 'touchend', 'pointerup', 'keydown'].forEach(function (type) {
        document.addEventListener(type, acquire, { capture: true, passive: true });
    });
    acquire();
})();
