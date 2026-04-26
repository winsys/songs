/**
 * i18n.js — global UI translation helper.
 *
 * Loaded after window.UI_LANG and window.UI_DICT are injected by PHP into layout.html.
 * Exposes:
 *   - window.t(key, params)  — string lookup with optional {param} interpolation
 *   - AngularJS filter `i18n` in module `i18nModule`, used as: {{ 'key' | i18n }}
 *
 * Missing keys fall back to the key itself, so untranslated strings are visible
 * (and easy to spot) rather than blank.
 */
(function () {
    'use strict';

    if (typeof window.UI_DICT !== 'object' || window.UI_DICT === null) {
        window.UI_DICT = {};
    }
    if (typeof window.UI_LANG !== 'string' || !window.UI_LANG) {
        window.UI_LANG = 'ru';
    }

    /**
     * Look up `key` in window.UI_DICT. If `params` is provided, replace {name}
     * placeholders in the value. Returns the key itself when no translation exists.
     */
    window.t = function (key, params) {
        var s = (window.UI_DICT[key] !== undefined && window.UI_DICT[key] !== null)
            ? String(window.UI_DICT[key])
            : key;
        if (params && typeof params === 'object') {
            Object.keys(params).forEach(function (k) {
                s = s.split('{' + k + '}').join(String(params[k]));
            });
        }
        return s;
    };

    if (typeof angular !== 'undefined') {
        angular.module('i18nModule', []).filter('i18n', function () {
            var f = function (input, params) {
                if (input === undefined || input === null || input === '') return '';
                return window.t(input, params);
            };
            // Stateless: AngularJS may treat the filter as stateful otherwise,
            // but UI_LANG only changes on full page reload, so $stateful=false is safe.
            f.$stateful = false;
            return f;
        });
    }
})();
