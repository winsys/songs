/**
 * Swipe-to-delete for playlist rows (leader page + pianist mode).
 *
 * Vanilla pointer events, no libraries. A row is a wrapper (config.rowSelector)
 * holding the delete action buttons and, on top of them, the sliding surface
 * (config.slideSelector). Swiping the surface left or right uncovers a red
 * action button; the button's own ng-click performs the deletion, so the
 * uncovered button IS the confirmation. Nothing is deleted by the gesture.
 *
 * Coexistence rules:
 *   - a touch that starts on .drag-handle always belongs to drag_reorder.js;
 *   - the axis is locked after LOCK px: vertical movement stays a page scroll
 *     (the surface carries `touch-action: pan-y` in CSS), horizontal movement
 *     becomes the swipe;
 *   - the click that ends a swipe is swallowed, so ¶ / Аа / notes never fire
 *     by accident; a tap on an open row just closes it.
 *
 * window.createSwipeDelete(config) -> { close(), destroy() }
 *   config.container      DOM element with the rows (delegated listeners)
 *   config.rowSelector    CSS selector of the row wrapper
 *   config.slideSelector  CSS selector of the sliding surface inside a row
 *   config.actionWidth    px the surface travels when open (default 104)
 */
(function () {
    'use strict';

    var LOCK = 10; // px of movement before the gesture axis is decided

    window.createSwipeDelete = function (config) {
        var container = config.container;
        var width = config.actionWidth || 104;
        var st = null;            // {row, slide, x0, y0, base, swiping, pointerId}
        var openRow = null;
        var openDir = 0;          // -1 = surface moved left, 1 = right
        var suppressClick = false;

        function setX(row, slide, x, animate) {
            slide.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
            slide.style.transform = x ? 'translateX(' + x + 'px)' : '';
            row.classList.toggle('swipe-left', x < 0);
            row.classList.toggle('swipe-right', x > 0);
        }

        function close() {
            if (!openRow) return;
            var slide = openRow.querySelector(config.slideSelector);
            if (slide) setX(openRow, slide, 0, true);
            openRow.classList.remove('swipe-open');
            openRow = null;
            openDir = 0;
        }

        function swallowNextClick() {
            suppressClick = true;
            setTimeout(function () { suppressClick = false; }, 350);
        }

        function onPointerDown(e) {
            if (st || (e.button !== undefined && e.button !== 0)) return;
            var t = e.target;
            if (!t.closest || t.closest('.drag-handle') || t.closest('.swipe-action')) return;
            var row = t.closest(config.rowSelector);
            if (!row || !container.contains(row)) return;
            var slide = row.querySelector(config.slideSelector);
            if (!slide) return;
            st = { row: row, slide: slide, x0: e.clientX, y0: e.clientY,
                   base: row === openRow ? openDir * width : 0,
                   swiping: false, pointerId: e.pointerId };
        }

        function onPointerMove(e) {
            if (!st || e.pointerId !== st.pointerId) return;
            var dx = e.clientX - st.x0, dy = e.clientY - st.y0;
            if (!st.swiping) {
                if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
                if (Math.abs(dy) >= Math.abs(dx)) { st = null; return; } // vertical: page scroll
                st.swiping = true;
                if (openRow && openRow !== st.row) close();
                try { st.slide.setPointerCapture(e.pointerId); } catch (err) {}
                st.row.classList.add('swiping');
            }
            e.preventDefault();
            var limit = width * 1.25;
            var x = Math.max(-limit, Math.min(limit, st.base + dx));
            setX(st.row, st.slide, x, false);
        }

        function onPointerUp(e) {
            if (!st || e.pointerId !== st.pointerId) return;
            var s = st;
            st = null;
            if (!s.swiping) {
                // A plain tap on the surface of an open row closes it
                if (s.row === openRow) { close(); swallowNextClick(); }
                return;
            }
            s.row.classList.remove('swiping');
            swallowNextClick();
            var x = s.base + (e.clientX - s.x0);
            var dir = x <= -width / 2 ? -1 : (x >= width / 2 ? 1 : 0);
            if (dir === 0) {
                setX(s.row, s.slide, 0, true);
                s.row.classList.remove('swipe-open');
                if (openRow === s.row) { openRow = null; openDir = 0; }
                return;
            }
            setX(s.row, s.slide, dir * width, true);
            s.row.classList.add('swipe-open');
            openRow = s.row;
            openDir = dir;
        }

        function onPointerCancel(e) {
            if (!st || e.pointerId !== st.pointerId) return;
            var s = st;
            st = null;
            if (!s.swiping) return;
            s.row.classList.remove('swiping');
            setX(s.row, s.slide, s.row === openRow ? openDir * width : 0, true);
        }

        function onClickCapture(e) {
            if (!suppressClick) return;
            suppressClick = false;
            // Only the click produced by the swipe gesture itself is swallowed;
            // a quick tap on the uncovered action button must always work.
            if (e.target.closest && e.target.closest('.swipe-action')) return;
            e.stopPropagation();
            e.preventDefault();
        }

        // A press anywhere outside the open row closes it
        function onDocPointerDown(e) {
            if (!openRow) return;
            if (!document.documentElement.contains(openRow)) { openRow = null; openDir = 0; return; }
            if (!openRow.contains(e.target)) close();
        }

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerUp);
        container.addEventListener('pointercancel', onPointerCancel);
        container.addEventListener('click', onClickCapture, true);
        document.addEventListener('pointerdown', onDocPointerDown, true);

        return {
            close: close,
            destroy: function () {
                container.removeEventListener('pointerdown', onPointerDown);
                container.removeEventListener('pointermove', onPointerMove);
                container.removeEventListener('pointerup', onPointerUp);
                container.removeEventListener('pointercancel', onPointerCancel);
                container.removeEventListener('click', onClickCapture, true);
                document.removeEventListener('pointerdown', onDocPointerDown, true);
            }
        };
    };
})();
