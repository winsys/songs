/**
 * Horizontal scrolling for chip groups of the compact UI (tech console bars).
 *
 * Markup:
 *   <div class="cx-scroller">
 *     <button class="cx-scroll-btn cx-scroll-left">‹</button>
 *     <div class="cx-scroll-x" data-cx-scroll> ...chips... </div>
 *     <button class="cx-scroll-btn cx-scroll-right">›</button>
 *   </div>
 *
 * The group never wraps and never pushes its neighbours off the screen: when
 * the chips do not fit, arrow buttons appear at the edges (classes can-left /
 * can-right on the wrapper), the mouse wheel scrolls the group sideways, and a
 * clicked / selected chip (.btn-selected) is brought into view.
 * Vanilla JS, no dependencies; content changes (ng-repeat) and visibility
 * changes (ng-show) are picked up by Mutation/ResizeObserver.
 */
(function () {
    'use strict';

    function enhance(scroller) {
        var box = scroller.querySelector('[data-cx-scroll]');
        if (!box || box._cxScroll) return;
        box._cxScroll = true;
        var left  = scroller.querySelector('.cx-scroll-left');
        var right = scroller.querySelector('.cx-scroll-right');

        function update() {
            var max = box.scrollWidth - box.clientWidth;
            scroller.classList.toggle('can-left',  max > 1 && box.scrollLeft > 1);
            scroller.classList.toggle('can-right', max > 1 && box.scrollLeft < max - 1);
        }

        function step(dir) {
            box.scrollBy({ left: dir * Math.max(120, box.clientWidth * 0.6), behavior: 'smooth' });
        }

        function revealSelected() {
            var el = box.querySelector('.btn-selected');
            if (!el || box.scrollWidth <= box.clientWidth) return;
            var b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
            if (r.left < b.left + 28)        box.scrollLeft -= (b.left + 28 - r.left);
            else if (r.right > b.right - 28) box.scrollLeft += (r.right - b.right + 28);
        }

        if (left)  left.addEventListener('click',  function () { step(-1); });
        if (right) right.addEventListener('click', function () { step(1); });
        box.addEventListener('scroll', update);
        // Mouse wheel scrolls sideways while there is something to scroll
        box.addEventListener('wheel', function (e) {
            if (box.scrollWidth <= box.clientWidth) return;
            var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (!d) return;
            box.scrollLeft += d;
            e.preventDefault();
        }, { passive: false });
        box.addEventListener('click', function () { setTimeout(function () { revealSelected(); update(); }, 60); });

        if (window.MutationObserver) {
            new MutationObserver(function () { revealSelected(); update(); })
                .observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        if (window.ResizeObserver) {
            new ResizeObserver(function () { revealSelected(); update(); }).observe(box);
        } else {
            window.addEventListener('resize', update);
        }
        update();
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('.cx-scroller'), enhance);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.cxScrollInit = init;
})();
