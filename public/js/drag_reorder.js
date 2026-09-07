/**
 * Drag-n-drop reordering for playlist rows (leader page + tech console).
 *
 * Vanilla pointer events, no libraries. Each row carries a drag handle
 * (.drag-handle); dragging the handle moves the row up/down the list.
 * Touch works because the handle has `touch-action: none` (set in CSS) —
 * page scrolling stays available everywhere else on the row.
 *
 * The DOM itself is never mutated here: on every crossing of a neighbor
 * row the ITEM ARRAY is reordered through config.onMove and AngularJS
 * re-renders (ng-repeat with track-by moves the nodes, so the captured
 * handle element survives). On release config.onDrop persists the order.
 *
 * window.createDragReorder(config) -> { destroy() }
 *   config.container      DOM element with the rows (delegated listeners)
 *   config.rowSelector    CSS selector of one row inside the container
 *   config.onMove(from, to)  reorder the scope array (inside $apply)
 *   config.onDrop(moved)     drag finished; moved=true when order changed
 *   config.onStart()         optional: drag passed the threshold
 */
(function () {
    'use strict';

    var THRESHOLD = 6; // px of movement before a drag begins

    window.createDragReorder = function (config) {
        var container = config.container;
        var drag = null; // {handle, row, startY, index, active, moved, pointerId}

        function rows() {
            return Array.prototype.slice.call(
                container.querySelectorAll(config.rowSelector));
        }

        function onPointerDown(e) {
            var handle = e.target.closest ? e.target.closest('.drag-handle') : null;
            if (!handle || !container.contains(handle)) return;
            if (drag || (e.button !== undefined && e.button !== 0)) return;
            var row = handle.closest(config.rowSelector);
            if (!row) return;
            var index = rows().indexOf(row);
            if (index < 0) return;
            drag = { handle: handle, row: row, startY: e.clientY, index: index,
                     active: false, moved: false, pointerId: e.pointerId };
            try { handle.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        }

        function onPointerMove(e) {
            if (!drag || e.pointerId !== drag.pointerId) return;
            if (!drag.active) {
                if (Math.abs(e.clientY - drag.startY) < THRESHOLD) return;
                drag.active = true;
                drag.row.classList.add('drag-active');
                document.body.classList.add('drag-reorder-busy');
                if (config.onStart) config.onStart();
            }
            e.preventDefault();
            var list = rows();
            var current = list.indexOf(drag.row);
            if (current < 0) return;
            // Target slot: the row whose vertical middle the pointer passed.
            var target = current;
            for (var i = 0; i < list.length; i++) {
                if (i === current) continue;
                var r = list[i].getBoundingClientRect();
                var mid = r.top + r.height / 2;
                if (i < current && e.clientY < mid) { target = Math.min(target, i); }
                if (i > current && e.clientY > mid) { target = Math.max(target, i); }
            }
            if (target !== current) {
                drag.moved = true;
                config.onMove(current, target);
            }
        }

        function finish(e, cancelled) {
            if (!drag || (e && e.pointerId !== drag.pointerId)) return;
            var wasActive = drag.active;
            var moved = drag.moved && !cancelled;
            drag.row.classList.remove('drag-active');
            document.body.classList.remove('drag-reorder-busy');
            try { drag.handle.releasePointerCapture(drag.pointerId); } catch (err) {}
            drag = null;
            if (wasActive) {
                suppressNextClick();
                config.onDrop(moved);
            }
        }

        function onPointerUp(e) { finish(e, false); }
        function onPointerCancel(e) { finish(e, true); }

        // A click fires right after pointerup on the same spot — swallow it
        // once so the row's own ng-click (open song, activate media) does
        // not trigger at the end of a drag.
        function suppressNextClick() {
            var swallow = function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
                document.removeEventListener('click', swallow, true);
            };
            document.addEventListener('click', swallow, true);
            setTimeout(function () {
                document.removeEventListener('click', swallow, true);
            }, 400);
        }

        // Plain click on the handle (no drag): keep it away from the row.
        function onClick(e) {
            if (e.target.closest && e.target.closest('.drag-handle')) {
                e.stopPropagation();
                e.preventDefault();
            }
        }

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerUp);
        container.addEventListener('pointercancel', onPointerCancel);
        container.addEventListener('click', onClick, true);

        return {
            destroy: function () {
                container.removeEventListener('pointerdown', onPointerDown);
                container.removeEventListener('pointermove', onPointerMove);
                container.removeEventListener('pointerup', onPointerUp);
                container.removeEventListener('pointercancel', onPointerCancel);
                container.removeEventListener('click', onClick, true);
            },
            isDragging: function () { return !!(drag && drag.active); }
        };
    };
})();
