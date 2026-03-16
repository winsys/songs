/**
 * sermon_chip_editor.js — v2
 * Редактор форматирования чипов (Стих / Послание) для sermon_prep.
 *
 * Подключить в sermon_prep.html перед закрывающим </body>:
 *   <script src="/js/sermon_chip_editor.js"></script>
 *
 * Требует:
 *   - initChipEditor() вызвать один раз после загрузки DOM
 *     (см. инструкцию внизу файла)
 *   - openChipEditor(spanEl) вызывать из ondblclick на чипе
 */

// ════════════════════════════════════════════════════════════════════
// СОСТОЯНИЕ МОДУЛЯ
// ════════════════════════════════════════════════════════════════════

var _cemCurrentSpan   = null;
var _cemComments      = [];
var _cemCommentIdSeq  = 0;
var _cemSavedSel      = null;   // Range, сохранённый для добавления комментария
var _cemSavedRangeForFontSize = null;  // Range, сохранённый при клике на input[number]

var CEM_TEXT_COLORS = [
    '#000000','#ffffff','#e53935','#d81b60','#8e24aa',
    '#1e88e5','#00897b','#43a047','#f4511e','#fb8c00',
    '#fdd835','#6d4c41','#546e7a','#1565c0','#2e7d32'
];
var CEM_HIGHLIGHT_COLORS = [
    'transparent',
    'rgba(255,235,59,0.6)',
    'rgba(76,175,80,0.45)',
    'rgba(33,150,243,0.4)',
    'rgba(244,67,54,0.4)',
    'rgba(156,39,176,0.4)',
    'rgba(255,152,0,0.5)'
];

// ════════════════════════════════════════════════════════════════════
// ПУБЛИЧНЫЕ ФУНКЦИИ (вызываются снаружи)
// ════════════════════════════════════════════════════════════════════

/**
 * Вызвать один раз при загрузке страницы.
 * Например в $timeout(function(){ ... initChipEditor(); }, 0)
 */
function initChipEditor() {
    _cemBuildModal();
    _cemBindAll();
}

/**
 * Открыть редактор для конкретного чипа.
 * Вызывается из ondblclick на span.bible-cite / span.message-cite
 */
function openChipEditor(span) {
    var overlay  = document.getElementById('chip-editor-overlay');
    var editArea = document.getElementById('cem-edit-area');
    var titleEl  = document.getElementById('cem-title');
    var commentInputWrap = document.getElementById('cem-comment-input-wrap');
    if (!overlay || !editArea) return;

    _cemCurrentSpan = span;

    // Заголовок модального окна
    var isMsg  = span.classList.contains('message-cite');
    var refEl  = span.querySelector('.cite-ref');
    var ref    = refEl ? refEl.textContent.trim() : (isMsg ? '✍️ Послание' : '📖 Стих');
    if (titleEl) titleEl.textContent = 'Редактировать: ' + ref;

    // Загружаем HTML текста
    var verseEl   = span.querySelector('.cite-verse-text');
    var htmlAttr  = isMsg ? 'data-para-html' : 'data-verse-html';
    var savedHtml = span.getAttribute(htmlAttr) || '';
    if (!savedHtml && verseEl) savedHtml = verseEl.innerHTML;
    if (!savedHtml) savedHtml = span.getAttribute('data-verse-text') || span.getAttribute('data-para-text') || '';
    editArea.innerHTML = savedHtml;

    // Загружаем комментарии
    var commJson = span.getAttribute('data-verse-comments') || '[]';
    try { _cemComments = JSON.parse(commJson); } catch(e) { _cemComments = []; }
    _cemCommentIdSeq = _cemComments.reduce(function(mx, c) {
        var n = parseInt((c.id || '').replace('c','')) || 0;
        return n > mx ? n : mx;
    }, 0);
    _cemRenderComments();

    // Сброс состояния
    if (commentInputWrap) commentInputWrap.classList.remove('open');

    overlay.classList.add('open');
    setTimeout(function() { editArea.focus(); }, 60);
}

// ════════════════════════════════════════════════════════════════════
// ПОСТРОЕНИЕ МОДАЛЬНОГО ОКНА (создаётся в DOM программно)
// ════════════════════════════════════════════════════════════════════

function _cemBuildModal() {
    if (document.getElementById('chip-editor-overlay')) return; // уже есть

    var div = document.createElement('div');
    div.innerHTML = _cemModalTemplate();
    document.body.appendChild(div.firstElementChild);

    // Добавить CSS
    var style = document.createElement('style');
    style.textContent = _cemModalCSS();
    document.head.appendChild(style);
}

function _cemModalTemplate() {
    return '<div id="chip-editor-overlay">' +
    '<div id="chip-editor-modal">' +

      '<div class="cem-header">' +
        '<span class="cem-title" id="cem-title">Редактировать</span>' +
        '<button class="cem-close" id="cem-close-btn" type="button">×</button>' +
      '</div>' +

      '<div class="cem-toolbar">' +
        '<button class="cem-btn" id="cem-bold"      type="button"><b>Ж</b></button>' +
        '<button class="cem-btn" id="cem-italic"    type="button"><i>К</i></button>' +
        '<button class="cem-btn" id="cem-underline" type="button"><u>П</u></button>' +
        '<div class="cem-sep"></div>' +

        // Цвет текста
        '<div class="cem-color-wrap" id="cem-tc-wrap">' +
          '<div class="cem-swatch-btn" id="cem-tc-btn" title="Цвет текста">' +
            '<span style="font-size:13px;font-weight:700;color:inherit;">A</span>' +
            '<div class="cem-swatch-bar" id="cem-tc-bar" style="background:#e53935;"></div>' +
          '</div>' +
          '<div class="cem-color-dd" id="cem-tc-dd"></div>' +
        '</div>' +

        // Цвет выделения
        '<div class="cem-color-wrap" id="cem-hl-wrap">' +
          '<div class="cem-swatch-btn" id="cem-hl-btn" title="Выделение фона">' +
            '<span style="font-size:12px;">🖊</span>' +
            '<div class="cem-swatch-bar" id="cem-hl-bar" style="background:rgba(255,235,59,0.6);"></div>' +
          '</div>' +
          '<div class="cem-color-dd" id="cem-hl-dd"></div>' +
        '</div>' +

        '<div class="cem-sep"></div>' +

        '<span class="cem-label">Размер:</span>' +
        '<input class="cem-fontsize" id="cem-fontsize" type="number" min="8" max="72" value="15" />' +
        '<button class="cem-btn" id="cem-apply-size" type="button">✓</button>' +

        '<div class="cem-sep"></div>' +

        '<button class="cem-btn" id="cem-clear-fmt" type="button">✕ сброс</button>' +
      '</div>' +

      // Строка ввода комментария (скрыта)
      '<div id="cem-comment-input-wrap">' +
        '<span class="cem-ci-label">Комментарий:</span>' +
        '<input id="cem-ci-text" type="text" placeholder="Введите комментарий к выделению…" maxlength="300" />' +
        '<button class="cem-ci-ok"  id="cem-ci-ok"     type="button">Добавить</button>' +
        '<button class="cem-ci-can" id="cem-ci-cancel"  type="button">Отмена</button>' +
      '</div>' +

      // Область редактирования
      '<div id="cem-edit-area" contenteditable="true" spellcheck="false"></div>' +

      // Список комментариев
      '<div class="cem-comments">' +
        '<div class="cem-comments-hdr">' +
          '<span>💬 Комментарии к фразам</span>' +
          '<button class="cem-add-c-btn" id="cem-add-c-btn" type="button">+ К выделению</button>' +
        '</div>' +
        '<div id="cem-comments-list">' +
          '<div class="cem-no-c" id="cem-no-c">Нет комментариев</div>' +
        '</div>' +
      '</div>' +

      '<div class="cem-footer">' +
        '<button class="cem-cancel-btn" id="cem-cancel-btn" type="button">Отмена</button>' +
        '<button class="cem-save-btn"   id="cem-save-btn"   type="button">💾 Сохранить</button>' +
      '</div>' +

    '</div>' +
  '</div>';
}

// ════════════════════════════════════════════════════════════════════
// ПРИВЯЗКА СОБЫТИЙ
// ════════════════════════════════════════════════════════════════════

function _cemBindAll() {
    var overlay  = document.getElementById('chip-editor-overlay');
    var editArea = document.getElementById('cem-edit-area');
    if (!overlay || !editArea) return;

    // ── Закрыть по клику на фон / кнопки ──
    overlay.addEventListener('mousedown', function(e) {
        if (e.target === overlay) _cemClose(false);
    });
    document.getElementById('cem-close-btn') .addEventListener('click', function(){ _cemClose(false); });
    document.getElementById('cem-cancel-btn').addEventListener('click', function(){ _cemClose(false); });
    document.getElementById('cem-save-btn')  .addEventListener('click', function(){ _cemClose(true);  });

    // ── ESC закрывает ──
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 27 && overlay.classList.contains('open')) _cemClose(false);
    });

    // ── БЛОКИРОВКА ввода в editArea (только форматирование) ──
    editArea.addEventListener('keydown', function(e) {
        var ctrl = e.ctrlKey || e.metaKey;
        // Разрешаем: Ctrl+B/I/U, Ctrl+Z/Y/A/C, стрелки, Home/End/PgUp/PgDn, Shift, Esc
        if (ctrl && [66,73,85,90,89,65,67].indexOf(e.keyCode) >= 0) return;
        if (e.keyCode >= 33 && e.keyCode <= 40) return;
        if ([16,17,18,91,92,93].indexOf(e.keyCode) >= 0) return;
        if (e.keyCode === 27) return;
        if (e.keyCode >= 112 && e.keyCode <= 123) return;
        // Блокируем всё остальное (Delete, Backspace, Enter, печатные символы)
        e.preventDefault();
    });
    editArea.addEventListener('paste', function(e) { e.preventDefault(); });
    editArea.addEventListener('drop',  function(e) { e.preventDefault(); });

    // Обновление состояния тулбара
    editArea.addEventListener('keyup',   _cemUpdateToolbar);
    editArea.addEventListener('mouseup', _cemUpdateToolbar);

    // ── Кнопки Ж/К/П — mousedown + preventDefault, чтобы не потерять выделение ──
    ['cem-bold','cem-italic','cem-underline'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('mousedown', function(e) {
            e.preventDefault();
            var cmd = id === 'cem-bold' ? 'bold' : id === 'cem-italic' ? 'italic' : 'underline';
            document.execCommand(cmd, false, null);
            _cemUpdateToolbar();
        });
    });

    // Сброс форматирования
    document.getElementById('cem-clear-fmt').addEventListener('mousedown', function(e) {
        e.preventDefault();
        document.execCommand('removeFormat', false, null);
        _cemUpdateToolbar();
    });

    // ── ЦВЕТ ТЕКСТА ──
    // Кнопка-переключатель дропдауна — mousedown + preventDefault
    document.getElementById('cem-tc-btn').addEventListener('mousedown', function(e) {
        e.preventDefault(); // ← не теряем выделение
        _cemToggleDd('tc');
    });
    // Строим цветовой дропдаун
    _cemBuildColorDd('cem-tc-dd', CEM_TEXT_COLORS, function(c) {
        document.execCommand('foreColor', false, c);
        document.getElementById('cem-tc-bar').style.background = c;
    });

    // ── ЦВЕТ ВЫДЕЛЕНИЯ (highlight) ──
    document.getElementById('cem-hl-btn').addEventListener('mousedown', function(e) {
        e.preventDefault();
        _cemToggleDd('hl');
    });
    _cemBuildColorDd('cem-hl-dd', CEM_HIGHLIGHT_COLORS, function(c) {
        _cemApplyHighlight(c);
        document.getElementById('cem-hl-bar').style.background =
            c === 'transparent' ? 'linear-gradient(135deg,#fff 45%,#e53935 45%)' : c;
    });

    // Закрыть дропдауны при клике вне
    document.addEventListener('mousedown', function(e) {
        if (!e.target.closest('#cem-tc-wrap')) _cemHideDd('tc');
        if (!e.target.closest('#cem-hl-wrap')) _cemHideDd('hl');
    });

    // ── РАЗМЕР ШРИФТА ──
    // При клике на input — сохраняем выделение (до потери фокуса editArea)
    document.getElementById('cem-fontsize').addEventListener('mousedown', function() {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editArea.contains(sel.anchorNode)) {
            _cemSavedRangeForFontSize = sel.getRangeAt(0).cloneRange();
        }
    });
    // Кнопка "✓ применить" — тоже mousedown чтобы не терять выделение
    document.getElementById('cem-apply-size').addEventListener('mousedown', function(e) {
        e.preventDefault();
        _cemApplyFontSize();
    });
    // Enter в поле размера
    document.getElementById('cem-fontsize').addEventListener('keydown', function(e) {
        if (e.keyCode === 13) { e.preventDefault(); _cemApplyFontSize(); }
    });

    // ── КОММЕНТАРИИ ──
    document.getElementById('cem-add-c-btn').addEventListener('mousedown', function(e) {
        e.preventDefault();
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !editArea.contains(sel.anchorNode)) {
            alert('Сначала выделите фразу в тексте стиха.');
            return;
        }
        _cemSavedSel = { range: sel.getRangeAt(0).cloneRange(), text: sel.toString().trim() };
        document.getElementById('cem-ci-text').value = '';
        document.getElementById('cem-comment-input-wrap').classList.add('open');
        setTimeout(function(){ document.getElementById('cem-ci-text').focus(); }, 30);
    });

    document.getElementById('cem-ci-ok').addEventListener('click', _cemConfirmComment);
    document.getElementById('cem-ci-cancel').addEventListener('click', function() {
        document.getElementById('cem-comment-input-wrap').classList.remove('open');
        _cemSavedSel = null;
    });
    document.getElementById('cem-ci-text').addEventListener('keydown', function(e) {
        if (e.keyCode === 13) _cemConfirmComment();
        if (e.keyCode === 27) {
            document.getElementById('cem-comment-input-wrap').classList.remove('open');
            _cemSavedSel = null;
        }
    });
}

// ════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ════════════════════════════════════════════════════════════════════

function _cemToggleDd(which) {
    var ddId  = which === 'tc' ? 'cem-tc-dd' : 'cem-hl-dd';
    var othId = which === 'tc' ? 'cem-hl-dd' : 'cem-tc-dd';
    var dd  = document.getElementById(ddId);
    var oth = document.getElementById(othId);
    if (oth) oth.style.display = 'none';
    if (dd)  dd.style.display  = dd.style.display === 'flex' ? 'none' : 'flex';
}
function _cemHideDd(which) {
    var dd = document.getElementById(which === 'tc' ? 'cem-tc-dd' : 'cem-hl-dd');
    if (dd) dd.style.display = 'none';
}

function _cemBuildColorDd(ddId, colors, applyFn) {
    var dd = document.getElementById(ddId);
    if (!dd) return;
    colors.forEach(function(c) {
        var dot = document.createElement('div');
        dot.className = 'cem-color-dot';
        dot.style.background = c === 'transparent'
            ? 'linear-gradient(135deg,#fff 45%,#e53935 45%)' : c;
        dot.title = c;
        // mousedown + preventDefault — не теряем выделение!
        dot.addEventListener('mousedown', function(e) {
            e.preventDefault();
            applyFn(c);
            _cemHideDd(ddId.includes('tc') ? 'tc' : 'hl');
            _cemUpdateToolbar();
        });
        dd.appendChild(dot);
    });
}

function _cemApplyHighlight(color) {
    var editArea = document.getElementById('cem-edit-area');
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editArea.contains(sel.anchorNode)) return;
    if (color === 'transparent') {
        document.execCommand('removeFormat', false, null);
        return;
    }
    var range = sel.getRangeAt(0);
    var span  = document.createElement('span');
    span.style.backgroundColor = color;
    span.style.borderRadius    = '2px';
    try {
        range.surroundContents(span);
    } catch(ex) {
        // Выделение пересекает несколько узлов — используем execCommand
        document.execCommand('backColor', false, color);
    }
}

function _cemApplyFontSize() {
    var editArea = document.getElementById('cem-edit-area');
    var input    = document.getElementById('cem-fontsize');
    var sz = parseInt(input.value);
    if (isNaN(sz) || sz < 8)  sz = 8;
    if (sz > 72) sz = 72;
    input.value = sz;

    // Восстанавливаем сохранённое выделение
    if (_cemSavedRangeForFontSize) {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_cemSavedRangeForFontSize);
        _cemSavedRangeForFontSize = null;
    }
    editArea.focus();

    // Применяем размер через маркер-шрифт-7
    var sel2 = window.getSelection();
    if (!sel2 || sel2.isCollapsed) return;
    document.execCommand('fontSize', false, '7');
    editArea.querySelectorAll('font[size="7"]').forEach(function(f) {
        var sp = document.createElement('span');
        sp.style.fontSize = sz + 'px';
        while (f.firstChild) sp.appendChild(f.firstChild);
        f.parentNode.replaceChild(sp, f);
    });
    _cemUpdateToolbar();
}

function _cemUpdateToolbar() {
    var b = document.getElementById('cem-bold');
    var i = document.getElementById('cem-italic');
    var u = document.getElementById('cem-underline');
    if (b) b.classList.toggle('cem-active', document.queryCommandState('bold'));
    if (i) i.classList.toggle('cem-active', document.queryCommandState('italic'));
    if (u) u.classList.toggle('cem-active', document.queryCommandState('underline'));
}

function _cemConfirmComment() {
    var editArea  = document.getElementById('cem-edit-area');
    var ciWrap    = document.getElementById('cem-comment-input-wrap');
    var ciText    = document.getElementById('cem-ci-text');
    var text = ciText.value.trim();
    if (!text || !_cemSavedSel) return;

    _cemCommentIdSeq++;
    var cid   = 'c' + _cemCommentIdSeq;
    var cnum  = _cemComments.length + 1;
    var hlTxt = _cemSavedSel.text.substring(0, 60);
    var hlBg  = CEM_HIGHLIGHT_COLORS[1];

    // Восстанавливаем выделение и оборачиваем
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_cemSavedSel.range);

    var cs = document.createElement('span');
    cs.className = 'verse-comment';
    cs.setAttribute('data-cid',  cid);
    cs.setAttribute('data-cnum', cnum);
    cs.style.backgroundColor = hlBg;
    cs.style.borderRadius    = '3px';
    cs.style.padding         = '0 2px';
    try {
        _cemSavedSel.range.surroundContents(cs);
    } catch(ex) {
        document.execCommand('backColor', false, hlBg);
    }

    _cemComments.push({ id: cid, cnum: cnum, highlightText: hlTxt, text: text });
    _cemRenderComments();

    ciWrap.classList.remove('open');
    _cemSavedSel = null;
    ciText.value = '';
    editArea.focus();
}

function _cemRenderComments() {
    var list  = document.getElementById('cem-comments-list');
    var noMsg = document.getElementById('cem-no-c');
    if (!list) return;

    list.querySelectorAll('.cem-c-item').forEach(function(el){ el.remove(); });

    if (_cemComments.length === 0) {
        if (noMsg) noMsg.style.display = '';
        return;
    }
    if (noMsg) noMsg.style.display = 'none';

    _cemComments.forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'cem-c-item';
        item.innerHTML =
            '<div class="cem-c-num">' + c.cnum + '</div>' +
            '<div class="cem-c-body">' +
              '<div class="cem-c-hl">«' + _cemEsc(c.highlightText) + '»</div>' +
              '<div class="cem-c-txt">' + _cemEsc(c.text) + '</div>' +
            '</div>' +
            '<button class="cem-c-del" data-cid="' + c.id + '" type="button">×</button>';
        item.querySelector('.cem-c-del').addEventListener('click', function() {
            _cemDeleteComment(c.id);
        });
        list.appendChild(item);
    });
}

function _cemDeleteComment(cid) {
    var editArea = document.getElementById('cem-edit-area');
    var el = editArea.querySelector('[data-cid="' + cid + '"]');
    if (el) {
        var p = el.parentNode;
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        p.removeChild(el);
    }
    _cemComments = _cemComments.filter(function(c){ return c.id !== cid; });
    _cemComments.forEach(function(c, i){ c.cnum = i + 1; });
    editArea.querySelectorAll('.verse-comment').forEach(function(el) {
        var c = _cemComments.find(function(x){ return x.id === el.getAttribute('data-cid'); });
        if (c) el.setAttribute('data-cnum', c.cnum);
    });
    _cemRenderComments();
}

function _cemToInlineHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Заменяем все блочные элементы (div, p) на их содержимое + пробел
    tmp.querySelectorAll('div, p').forEach(function(el) {
        var space = document.createTextNode(' ');
        el.parentNode.insertBefore(space, el);
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.parentNode.removeChild(el);
    });
    // Заменяем <br> на пробел
    tmp.querySelectorAll('br').forEach(function(el) {
        el.parentNode.replaceChild(document.createTextNode(' '), el);
    });
    // Возвращаем чистый HTML без лишних пробелов
    return tmp.innerHTML.replace(/\s{2,}/g, ' ').trim();
}

function _cemClose(save) {
    var overlay  = document.getElementById('chip-editor-overlay');
    var editArea = document.getElementById('cem-edit-area');
    if (!overlay) return;

    if (save && _cemCurrentSpan) {
        var html         = editArea.innerHTML;
        var commentsJson = JSON.stringify(_cemComments);
        var isMsg        = _cemCurrentSpan.classList.contains('message-cite');

        // Сохраняем HTML и комментарии в data-атрибуты
        _cemCurrentSpan.setAttribute(isMsg ? 'data-para-html' : 'data-verse-html', html);
        _cemCurrentSpan.setAttribute('data-verse-comments', commentsJson);

        // Обновляем видимый текст внутри чипа
        var verseEl = _cemCurrentSpan.querySelector('.cite-verse-text');
        if (verseEl) {
            verseEl.innerHTML = html;
        } else if (isMsg) {
            // У message-cite нет .cite-verse-text — обновляем весь текст узла
            // Сохраняем кнопку удаления и подсказку
            var removeBtn = _cemCurrentSpan.querySelector('.cite-remove');
            var hint      = _cemCurrentSpan.querySelector('.cite-edit-hint');
            _cemCurrentSpan.innerHTML = '✍️ ' + _cemToInlineHtml(html);
            if (hint) {
                var newHint = document.createElement('span');
                newHint.className = 'cite-edit-hint';
                newHint.textContent = 'двойной клик — редактировать';
                _cemCurrentSpan.appendChild(newHint);
            }
            if (removeBtn) _cemCurrentSpan.appendChild(removeBtn);
        }

        // Сигнализируем AngularJS, что контент изменился (если доступен)
        if (window._sermonScheduleAutoSave) window._sermonScheduleAutoSave();
        else if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
    }

    overlay.classList.remove('open');
    _cemCurrentSpan  = null;
    _cemComments     = [];
}

function _cemEsc(s) {
    return String(s||'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════════════════════════
// CSS (вставляется программно в <head>)
// ════════════════════════════════════════════════════════════════════

function _cemModalCSS() { return `
/* ── Overlay ───────────────────────────────────────────── */
#chip-editor-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.65); z-index: 4000;
    align-items: center; justify-content: center;
}
#chip-editor-overlay.open { display: flex; }

/* ── Modal box ─────────────────────────────────────────── */
#chip-editor-modal {
    background: #fff; border-radius: 14px;
    box-shadow: 0 8px 40px rgba(0,0,0,.28);
    width: min(720px, 96vw); max-height: 92vh;
    display: flex; flex-direction: column; overflow: hidden;
}

/* ── Header ────────────────────────────────────────────── */
.cem-header {
    background: #f8f9fa; border-bottom: 1.5px solid #dee2e6;
    padding: 11px 18px; display: flex;
    align-items: center; justify-content: space-between; flex-shrink: 0;
}
.cem-title { font-size: 14px; font-weight: 700; color: #2c3e50; }
.cem-close {
    width: 28px; height: 28px; border: none; background: none;
    font-size: 20px; cursor: pointer; color: #888; border-radius: 6px;
    display: flex; align-items: center; justify-content: center; line-height:1;
    transition: background .12s;
}
.cem-close:hover { background: #f0f0f0; color: #333; }

/* ── Toolbar ───────────────────────────────────────────── */
.cem-toolbar {
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 8px 12px; background: #f8f9fa;
    border-bottom: 1.5px solid #dee2e6;
    flex-shrink: 0; align-items: center;
}
.cem-btn {
    padding: 4px 10px; border: 1.5px solid #dee2e6;
    background: #fff; border-radius: 6px; cursor: pointer;
    font-size: 13px; height: 30px;
    display: flex; align-items: center; gap: 3px;
    color: #2c3e50; transition: all .12s;
    /* ВАЖНО: нет outline при фокусе, т.к. кнопки используют mousedown */
    outline: none;
}
.cem-btn:hover { background: #f0f4f8; border-color: #c8d0db; }
.cem-btn.cem-active { background: #1a6db5; color: #fff; border-color: #1a6db5; }

.cem-sep { width: 1px; height: 22px; background: #dee2e6; margin: 0 2px; flex-shrink: 0; }
.cem-label { font-size: 12px; color: #888; flex-shrink: 0; }

.cem-fontsize {
    width: 46px; border: 1.5px solid #dee2e6;
    border-radius: 6px; padding: 2px 6px;
    font-size: 13px; text-align: center; height: 30px; outline: none;
}
.cem-fontsize:focus { border-color: #1a6db5; }

/* ── Colour swatch button ──────────────────────────────── */
.cem-color-wrap { position: relative; display: inline-flex; align-items: center; }
.cem-swatch-btn {
    display: flex; flex-direction: column; align-items: center;
    width: 28px; padding: 3px 2px;
    border: 1.5px solid #dee2e6; border-radius: 6px;
    cursor: pointer; background: #fff;
    gap: 2px; transition: border-color .12s;
    outline: none; /* убираем outline */
}
.cem-swatch-btn:hover { border-color: #1a6db5; background: #f0f4f8; }
.cem-swatch-bar { width: 20px; height: 4px; border-radius: 2px; flex-shrink: 0; }

.cem-color-dd {
    display: none; position: absolute; top: 36px; left: 0;
    background: #fff; border: 1.5px solid #dee2e6;
    border-radius: 8px; padding: 8px; gap: 5px;
    flex-wrap: wrap; width: 152px; z-index: 5000;
    box-shadow: 0 4px 16px rgba(0,0,0,.14);
}
.cem-color-dot {
    width: 22px; height: 22px; border-radius: 4px;
    cursor: pointer; border: 2px solid transparent;
    transition: border-color .1s, transform .1s;
}
.cem-color-dot:hover { border-color: #333; transform: scale(1.12); }

/* ── Comment input row ─────────────────────────────────── */
#cem-comment-input-wrap {
    display: none; padding: 9px 14px;
    background: #fff8e6; border-bottom: 1.5px solid #f0c040;
    align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0;
}
#cem-comment-input-wrap.open { display: flex; }
.cem-ci-label { font-size: 12px; font-weight: 600; color: #7a5a00; flex-shrink: 0; }
#cem-ci-text {
    flex: 1; min-width: 160px;
    border: 1.5px solid #f0c040; border-radius: 6px;
    padding: 5px 10px; font-size: 13px; outline: none; background: #fff;
}
#cem-ci-text:focus { border-color: #e6a800; }
.cem-ci-ok {
    padding: 5px 14px; border: none; background: #e6a800;
    color: #fff; border-radius: 6px; cursor: pointer;
    font-size: 13px; font-weight: 600; transition: background .12s;
}
.cem-ci-ok:hover { background: #c8900a; }
.cem-ci-can {
    padding: 5px 12px; border: 1.5px solid #ddd;
    background: #fff; border-radius: 6px; cursor: pointer;
    font-size: 13px; transition: background .12s;
}
.cem-ci-can:hover { background: #f0f0f0; }

/* ── Edit area ─────────────────────────────────────────── */
#cem-edit-area {
    min-height: 80px; max-height: 200px; overflow-y: auto;
    padding: 14px 18px; font-size: 15px; line-height: 1.7;
    outline: none; white-space: pre-wrap; word-break: break-word;
    color: #1a2533; border-bottom: 1.5px solid #dee2e6;
    cursor: text;
}
/* Комментарий-спан внутри edit area */
#cem-edit-area .verse-comment { border-radius: 3px; padding: 0 2px; }
#cem-edit-area .verse-comment::after {
    content: attr(data-cnum); font-size: 9px; font-weight: 700;
    vertical-align: super; color: #fff;
    background: #e67e22; border-radius: 3px;
    padding: 0 3px; margin-left: 1px; pointer-events: none;
}

/* ── Comments list ─────────────────────────────────────── */
.cem-comments {
    flex-shrink: 0; padding: 10px 14px;
    background: #fafbfc; max-height: 170px; overflow-y: auto;
    border-bottom: 1.5px solid #dee2e6;
}
.cem-comments-hdr {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; font-size: 12px; font-weight: 700;
    color: #888; text-transform: uppercase; letter-spacing: .6px;
}
.cem-add-c-btn {
    padding: 3px 10px; border: 1.5px solid #1a6db5;
    background: #e8f1fb; border-radius: 6px; cursor: pointer;
    font-size: 12px; color: #1a6db5; font-weight: 600; transition: background .12s;
}
.cem-add-c-btn:hover { background: #d0e4f7; }
.cem-no-c { font-size: 13px; color: #b0b8c1; font-style: italic; padding: 4px 2px; }

.cem-c-item {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 6px 10px; background: #fff;
    border: 1.5px solid #e8eaed; border-radius: 8px;
    margin-bottom: 6px; font-size: 13px;
}
.cem-c-num {
    width: 18px; height: 18px; background: #e67e22; color: #fff;
    border-radius: 50%; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
}
.cem-c-body { flex: 1; min-width: 0; }
.cem-c-hl { font-weight: 600; color: #555; font-size: 12px; margin-bottom: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cem-c-txt { color: #2c3e50; line-height: 1.4; }
.cem-c-del {
    flex-shrink: 0; background: none; border: none;
    color: #bbb; font-size: 16px; cursor: pointer; padding: 0 2px;
    transition: color .12s; line-height: 1;
}
.cem-c-del:hover { color: #e53935; }

/* ── Footer ────────────────────────────────────────────── */
.cem-footer {
    padding: 10px 18px; background: #f8f9fa;
    border-top: 1.5px solid #dee2e6;
    display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
}
.cem-cancel-btn {
    padding: 7px 20px; border: 1.5px solid #dee2e6;
    background: #fff; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 500; color: #666; transition: background .12s;
}
.cem-cancel-btn:hover { background: #f0f0f0; }
.cem-save-btn {
    padding: 7px 22px; border: none; background: #1a6db5;
    color: #fff; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 600; transition: background .12s;
    box-shadow: 0 2px 6px rgba(26,109,181,.22);
}
.cem-save-btn:hover { background: #155a96; }

/* ── Hint на чипах ─────────────────────────────────────── */
.bible-cite .cite-edit-hint,
.message-cite .cite-edit-hint {
    display: block; font-size: 9px; color: #aaa;
    font-style: italic; margin-top: 1px; pointer-events: none;
    opacity: 0; transition: opacity .15s;
}
.bible-cite:hover .cite-edit-hint,
.message-cite:hover .cite-edit-hint { opacity: 1; }

/* verse-comment на дисплее (sermon_layout) */
.verse-comment { border-radius: 3px; padding: 0 2px; }
`; }
