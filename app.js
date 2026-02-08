const himatsubushiCodes = [
    { code: 'HMTB1', description: 'チョコザップ' },
    { code: 'HMTB2', description: 'バイブコーディング' },
    { code: 'HMTB3', description: '昼寝' },
    { code: 'HMTB4', description: '読書' },
    { code: 'HMTB5', description: '映画見る' },
    { code: 'HMTB6', description: 'ドラマ見る' },
    { code: 'HMTB7', description: 'ショート動画見る' },
    { code: 'HMTB8', description: 'ごはん食べる' },
    { code: 'HMTB9', description: 'おやつ食べる' },
];

// レベル設定配列 — レベル追加は1行追加 + CSS追加のみ
const LEVELS = [
    { seconds: 1800, cssClass: '',        splitLabel: null,          mergeLabel: null },
    { seconds: 600,  cssClass: 'level-1', splitLabel: '10分に分割',  mergeLabel: '30分に戻す' },
    { seconds: 60,   cssClass: 'level-2', splitLabel: '1分に分割',   mergeLabel: '10分に戻す' },
    { seconds: 10,   cssClass: 'level-3', splitLabel: '10秒に分割',  mergeLabel: '1分に戻す' },
];

const timeSlots = [];

// --- コアユーティリティ関数 ---

function parseSlotId(id) {
    const parts = id.split('-').map(Number);
    return { slotIndex: parts[0], path: parts.slice(1) };
}

function createChildren(depth) {
    if (depth >= LEVELS.length - 1) return [];
    const count = LEVELS[depth].seconds / LEVELS[depth + 1].seconds;
    return Array.from({ length: count }, () => ({
        value: null,
        subdivided: false,
        children: createChildren(depth + 1)
    }));
}

function getNodeAtPath(slotIndex, path) {
    let node = timeSlots[slotIndex];
    for (const idx of path) {
        node = node.children[idx];
    }
    return node;
}

function collectLeafIds(node, prefix, depth) {
    if (node.subdivided && depth < LEVELS.length - 1) {
        const ids = [];
        for (let i = 0; i < node.children.length; i++) {
            ids.push(...collectLeafIds(node.children[i], `${prefix}-${i}`, depth + 1));
        }
        return ids;
    }
    return [prefix];
}

function collectLeafValues(node, depth) {
    if (node.subdivided && depth < LEVELS.length - 1) {
        const vals = [];
        for (const child of node.children) {
            vals.push(...collectLeafValues(child, depth + 1));
        }
        return vals;
    }
    return [node.value];
}

function accumulateSummary(node, depth, summary) {
    if (node.subdivided && depth < LEVELS.length - 1) {
        for (const child of node.children) {
            accumulateSummary(child, depth + 1, summary);
        }
    } else if (node.value) {
        const sec = LEVELS[depth].seconds;
        summary[node.value] = (summary[node.value] || 0) + sec;
    }
}

function fillNodeRecursive(node, depth, code) {
    if (node.subdivided && depth < LEVELS.length - 1) {
        for (const child of node.children) {
            fillNodeRecursive(child, depth + 1, code);
        }
    } else {
        node.value = code;
    }
}

// --- localStorage 保存/復元 ---

const STORAGE_KEY = 'himatsubushi-data';

function serializeNode(node) {
    return {
        value: node.value,
        subdivided: node.subdivided,
        children: node.children ? node.children.map(serializeNode) : []
    };
}

function restoreNode(node, saved) {
    node.value = saved.value;
    node.subdivided = saved.subdivided;
    if (saved.children && node.children) {
        for (let i = 0; i < Math.min(saved.children.length, node.children.length); i++) {
            restoreNode(node.children[i], saved.children[i]);
        }
    }
}

function saveToStorage() {
    try {
        const data = timeSlots.map(serializeNode);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        // localStorage容量超えなど — 黙って無視
    }
}

function loadFromStorage() {
    try {
        const json = localStorage.getItem(STORAGE_KEY);
        if (!json) return;
        const data = JSON.parse(json);
        if (!Array.isArray(data) || data.length !== timeSlots.length) return;
        for (let i = 0; i < timeSlots.length; i++) {
            restoreNode(timeSlots[i], data[i]);
        }
    } catch (e) {
        // パースエラーなど — 無視して初期状態で起動
    }
}

// --- 初期化 ---

function initTimeSlots() {
    for (let hour = 7; hour < 24; hour++) {
        for (let min = 0; min < 60; min += 30) {
            if (hour === 7 && min === 0) continue;
            if (hour === 23 && min === 30) continue;

            const startHour = hour;
            const startMin = min;
            const endHour = min === 30 ? hour + 1 : hour;
            const endMin = min === 30 ? 0 : 30;

            const formatTime = (h, m) => `${h}:${m.toString().padStart(2, '0')}`;
            timeSlots.push({
                start: formatTime(startHour, startMin),
                end: formatTime(endHour === 24 ? 0 : endHour, endMin),
                startHour,
                startMin,
                value: null,
                subdivided: false,
                children: createChildren(0)
            });
        }
    }
}

// --- 選択状態 ---

let selectedSlots = new Set();
let cursorSlotId = null;
let isDragging = false;
let didDrag = false;
let dragStartId = null;
let dragCurrentId = null;
let preselectedSlots = new Set();
let contextMenuTarget = null;

// --- 表示ヘルパー ---

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getValueDisplay(value) {
    if (!value) return '--';
    const safe = escapeHtml(value);
    const codeInfo = himatsubushiCodes.find(c => c.code === value);
    if (codeInfo) {
        return `<span class="value-code">${safe}</span><span class="value-desc">${escapeHtml(codeInfo.description)}</span>`;
    }
    return safe;
}

function getSlotLabel(slotIndex, path) {
    const slot = timeSlots[slotIndex];
    const baseSeconds = slot.startHour * 3600 + slot.startMin * 60;

    let offsetSeconds = 0;
    for (let d = 0; d < path.length; d++) {
        offsetSeconds += path[d] * LEVELS[d + 1].seconds;
    }

    const totalSeconds = baseSeconds + offsetSeconds;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (s > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${h}:${m.toString().padStart(2, '0')}`;
}

// --- レンダリング ---

function renderNode(node, prefix, depth) {
    if (node.subdivided && depth < LEVELS.length - 1) {
        let html = '';
        for (let i = 0; i < node.children.length; i++) {
            html += renderNode(node.children[i], `${prefix}-${i}`, depth + 1);
        }
        return html;
    }

    const { slotIndex, path } = parseSlotId(prefix);
    const cssClass = LEVELS[depth].cssClass;
    const display = getValueDisplay(node.value);
    return `
        <div class="time-slot ${cssClass}" data-slot-id="${prefix}">
            <span class="time-label">${getSlotLabel(slotIndex, path)}</span>
            <span class="time-value ${node.value ? '' : 'empty'}">${display}</span>
        </div>
    `;
}

function renderTimeSlots() {
    const container = document.getElementById('timeSlots');
    const halfPoint = Math.ceil(timeSlots.length / 2);
    let html = '';

    timeSlots.forEach((slot, index) => {
        const column = index < halfPoint ? 'left-column' : 'right-column';
        html += `<div class="slot-group ${column}" data-slot-index="${index}">`;
        html += renderNode(slot, `${index}`, 0);
        html += '</div>';
    });

    container.innerHTML = html;
    attachSlotEvents();
}

// --- イベント ---

function attachSlotEvents() {
    const slots = document.querySelectorAll('.time-slot');

    slots.forEach(el => {
        const slotId = el.dataset.slotId;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            isDragging = true;
            dragStartId = slotId;
            dragCurrentId = slotId;
            cursorSlotId = slotId;

            if (e.shiftKey && selectedSlots.size > 0) {
                preselectedSlots = new Set(selectedSlots);
                selectRange(Array.from(selectedSlots).pop(), slotId);
            } else if (e.ctrlKey || e.metaKey) {
                preselectedSlots = new Set(selectedSlots);
                selectedSlots.add(slotId);
            } else {
                preselectedSlots = new Set();
                selectedSlots.clear();
                selectedSlots.add(slotId);
            }

            updateSlotStyles();
            updateSelectionHint();
        });

        el.addEventListener('mouseenter', () => {
            if (isDragging) {
                dragCurrentId = slotId;
                updateDragSelection();
            }
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, slotId);
        });
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            didDrag = true;
            isDragging = false;
            dragStartId = null;
            dragCurrentId = null;
        }
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('contextMenu');
        if (!menu.contains(e.target)) {
            menu.classList.remove('show');
        }
        const codeMenu = document.getElementById('codeContextMenu');
        if (!codeMenu.contains(e.target)) {
            codeMenu.classList.remove('show');
        }

        // ドラッグ直後のclickでは選択解除しない
        if (didDrag) {
            didDrag = false;
            return;
        }

        // タイムスロット・コードボタン・メニュー以外をクリックしたら選択解除
        if (!e.target.closest('.time-slot, .code-btn, .context-menu')) {
            selectedSlots.clear();
            cursorSlotId = null;
            updateSlotStyles();
            updateSelectionHint();
        }
    });
}

// --- スロットID収集 ---

function getAllSlotIds() {
    const ids = [];
    timeSlots.forEach((slot, index) => {
        ids.push(...collectLeafIds(slot, `${index}`, 0));
    });
    return ids;
}

function getColumnSlotIds() {
    const halfPoint = Math.ceil(timeSlots.length / 2);
    const leftIds = [];
    const rightIds = [];

    timeSlots.forEach((slot, index) => {
        const target = index < halfPoint ? leftIds : rightIds;
        target.push(...collectLeafIds(slot, `${index}`, 0));
    });

    return { leftIds, rightIds };
}

// --- カーソル移動 ---

function moveCursor(direction, shiftKey) {
    const { leftIds, rightIds } = getColumnSlotIds();
    const allIds = getAllSlotIds();

    if (!cursorSlotId || !allIds.includes(cursorSlotId)) {
        cursorSlotId = allIds[0] || null;
        if (!shiftKey) {
            selectedSlots.clear();
            if (cursorSlotId) selectedSlots.add(cursorSlotId);
        }
        updateSlotStyles();
        updateSelectionHint();
        return;
    }

    const inLeft = leftIds.includes(cursorSlotId);
    const currentCol = inLeft ? leftIds : rightIds;
    const currentIdx = currentCol.indexOf(cursorSlotId);
    let newId = null;

    if (direction === 'up') {
        if (currentIdx > 0) {
            newId = currentCol[currentIdx - 1];
        } else if (!inLeft) {
            newId = leftIds[leftIds.length - 1];
        }
    } else if (direction === 'down') {
        if (currentIdx < currentCol.length - 1) {
            newId = currentCol[currentIdx + 1];
        } else if (inLeft) {
            newId = rightIds[0];
        }
    } else if (direction === 'left' || direction === 'right') {
        const targetCol = (direction === 'left') ? leftIds : rightIds;
        if (targetCol === currentCol) return;
        const ratio = currentCol.length > 1 ? currentIdx / (currentCol.length - 1) : 0;
        const targetIdx = Math.round(ratio * (targetCol.length - 1));
        newId = targetCol[targetIdx];
    }

    if (!newId) return;

    cursorSlotId = newId;

    if (shiftKey) {
        selectedSlots.add(newId);
    } else {
        selectedSlots.clear();
        selectedSlots.add(newId);
    }

    updateSlotStyles();
    updateSelectionHint();

    const el = document.querySelector(`[data-slot-id="${newId}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
}

function selectRange(startId, endId) {
    const allIds = getAllSlotIds();
    const startIdx = allIds.indexOf(startId);
    const endIdx = allIds.indexOf(endId);

    if (startIdx === -1 || endIdx === -1) return;

    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);

    for (let i = from; i <= to; i++) {
        selectedSlots.add(allIds[i]);
    }
}

function updateDragSelection() {
    if (dragStartId === null || dragCurrentId === null) return;

    selectedSlots = new Set(preselectedSlots);
    selectRange(dragStartId, dragCurrentId);

    updateSlotStyles();
    updateSelectionHint();
}

// --- get/set スロット値 ---

function getSlotValue(slotId) {
    const { slotIndex, path } = parseSlotId(slotId);
    return getNodeAtPath(slotIndex, path).value;
}

function setSlotValue(slotId, value) {
    const { slotIndex, path } = parseSlotId(slotId);
    getNodeAtPath(slotIndex, path).value = value;
}

// --- コンテキストメニュー ---

function showContextMenu(x, y, slotId) {
    const menu = document.getElementById('contextMenu');
    const { slotIndex, path } = parseSlotId(slotId);
    const depth = path.length; // 0=30分, 1=10分, 2=1分, 3=10秒
    const node = getNodeAtPath(slotIndex, path);

    contextMenuTarget = { slotId, slotIndex, path, depth };

    // メニューを動的生成
    let menuHtml = '';

    // 分割メニュー: 現在のレベルが最下位でなく、まだ分割されていない場合
    if (depth < LEVELS.length - 1 && !node.subdivided) {
        menuHtml += `<div class="context-menu-item" data-action="split">${LEVELS[depth + 1].splitLabel}</div>`;
    }

    // マージメニュー: 深さ1以上のすべての祖先レベルに戻せる
    for (let d = depth - 1; d >= 0; d--) {
        menuHtml += `<div class="context-menu-item" data-action="merge" data-merge-depth="${d}">${LEVELS[d + 1].mergeLabel}</div>`;
    }
    // 深さ0でsubdivided済みなら、自身に戻す（30分に戻す）
    if (depth === 0 && node.subdivided) {
        menuHtml += `<div class="context-menu-item" data-action="merge" data-merge-depth="0">${LEVELS[1].mergeLabel}</div>`;
    }

    // 以降の連続空き埋め
    if (getSlotValue(slotId)) {
        menuHtml += `<div class="context-menu-item" data-action="fill">以降の連続空き埋め</div>`;
    }

    // クリア
    menuHtml += `<div class="context-menu-item" data-action="clear">クリア</div>`;

    menu.innerHTML = menuHtml;

    // イベント設定
    menu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            handleContextMenuAction(item.dataset.action, item.dataset.mergeDepth != null ? parseInt(item.dataset.mergeDepth) : null);
            menu.classList.remove('show');
        });
    });

    menu.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 120)}px`;
    menu.classList.add('show');
}

function handleContextMenuAction(action, mergeDepth) {
    if (!contextMenuTarget) return;
    const { slotId, slotIndex, path, depth } = contextMenuTarget;

    if (action === 'split') {
        splitNode(slotIndex, path, depth);
    } else if (action === 'merge') {
        mergeNode(slotIndex, path, mergeDepth);
    } else if (action === 'fill') {
        fillEmpty(slotId);
    } else if (action === 'clear') {
        clearSlots();
    }
}

function splitNode(slotIndex, path, depth) {
    const node = getNodeAtPath(slotIndex, path);
    if (node.subdivided || depth >= LEVELS.length - 1) return;

    node.subdivided = true;
    if (node.value) {
        node.children.forEach(child => child.value = node.value);
    }
    node.value = null;
    selectedSlots.clear();
    renderTimeSlots();
    updateSummary();
}

function mergeNode(slotIndex, path, targetDepth) {
    // path を targetDepth まで切り詰めてそのノードをマージ
    const mergePath = path.slice(0, targetDepth);
    const node = getNodeAtPath(slotIndex, mergePath);

    if (targetDepth === 0 && !node.subdivided && path.length === 0) return;

    // 末端の値を全収集
    const allValues = collectLeafValues(node, targetDepth);
    const uniqueValues = [...new Set(allValues)];

    if (uniqueValues.length > 1) {
        if (!confirm('異なるコードが混在しているため、全てクリアされます。良いですか？')) {
            return;
        }
    }
    node.value = (uniqueValues.length === 1) ? uniqueValues[0] : null;
    node.subdivided = false;
    node.children = createChildren(targetDepth);

    selectedSlots.clear();
    renderTimeSlots();
    updateSummary();
}

function fillEmpty(slotId) {
    const code = getSlotValue(slotId);
    if (!code) return;

    const allIds = getAllSlotIds();
    const startIdx = allIds.indexOf(slotId);
    if (startIdx === -1) return;

    for (let i = startIdx + 1; i < allIds.length; i++) {
        if (getSlotValue(allIds[i])) break;
        setSlotValue(allIds[i], code);
    }

    renderTimeSlots();
    updateSummary();
}

function clearSlots() {
    if (!contextMenuTarget) return;
    const targets = selectedSlots.size > 0 ? selectedSlots : new Set([contextMenuTarget.slotId]);
    targets.forEach(slotId => setSlotValue(slotId, null));
    updateSlotStyles();
    updateSummary();
}

// --- コードボタン ---

function renderCodeButtons() {
    const container = document.getElementById('codeButtons');
    container.innerHTML = himatsubushiCodes.map(item => `
        <div class="code-btn" data-code="${escapeHtml(item.code)}">
            <div class="code-btn-code">${escapeHtml(item.code)}</div>
            <div class="code-btn-desc">${escapeHtml(item.description)}</div>
        </div>
    `).join('') + `
        <div class="code-btn clear-btn" data-action="clear">
            <div class="code-btn-code">CLR</div>
            <div class="code-btn-desc">クリア</div>
        </div>
    `;

    container.querySelectorAll('.code-btn[data-code]').forEach(btn => {
        btn.addEventListener('click', () => applyCode(btn.dataset.code));
    });
    container.querySelector('.code-btn[data-action="clear"]').addEventListener('click', () => applyCode(null));

    container.querySelectorAll('.code-btn[data-code]').forEach(btn => {
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const code = btn.dataset.code;
            const menu = document.getElementById('codeContextMenu');
            menu.dataset.code = code;
            menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
            menu.style.top = `${Math.min(e.clientY, window.innerHeight - 60)}px`;
            menu.classList.add('show');
        });
    });
}

// --- 「今からこれやります！」 ---

function startActivity(code) {
    const now = new Date();
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // 現在時刻を含む30分スロットを探す
    let currentSlotIndex = -1;
    for (let i = 0; i < timeSlots.length; i++) {
        const s = timeSlots[i];
        const startSec = s.startHour * 3600 + s.startMin * 60;
        if (nowSec >= startSec && nowSec < startSec + LEVELS[0].seconds) {
            currentSlotIndex = i;
            break;
        }
    }

    if (currentSlotIndex === -1) {
        showToast('現在の時刻はタイムスロットの範囲外です');
        return;
    }

    const slot = timeSlots[currentSlotIndex];
    const slotStartSec = slot.startHour * 3600 + slot.startMin * 60;
    const offsetSec = nowSec - slotStartSec;

    // 各レベルのインデックスを算出
    const indices = [];
    let remaining = offsetSec;
    for (let d = 1; d < LEVELS.length; d++) {
        const childSec = LEVELS[d].seconds;
        indices.push(Math.floor(remaining / childSec));
        remaining = remaining % childSec;
    }

    // 必要な分割深さを決定（末尾の連続する0は分割不要）
    let splitDepth = 0;
    for (let i = indices.length - 1; i >= 0; i--) {
        if (indices[i] !== 0) {
            splitDepth = i + 1;
            break;
        }
    }

    if (splitDepth === 0) {
        // 境界ぴったり → 分割せずそのまま埋める
        fillNodeRecursive(slot, 0, code);
    } else {
        // splitDepthまで分割
        let node = slot;
        for (let d = 0; d < splitDepth; d++) {
            if (!node.subdivided) {
                node.subdivided = true;
                if (node.value) {
                    node.children.forEach(child => child.value = node.value);
                }
                node.value = null;
            }
            if (d < splitDepth - 1) {
                node = node.children[indices[d]];
            }
        }

        // 分割した最深レベルで、現在のインデックスから末尾まで埋める
        const deepestParent = getNodeAtPath(currentSlotIndex, indices.slice(0, splitDepth - 1));
        for (let n = indices[splitDepth - 1]; n < deepestParent.children.length; n++) {
            fillNodeRecursive(deepestParent.children[n], splitDepth, code);
        }

        // 各レベルで残りの兄弟スロットを埋める（深い方から浅い方へ）
        for (let d = splitDepth - 1; d >= 1; d--) {
            const parent = getNodeAtPath(currentSlotIndex, indices.slice(0, d - 1));
            for (let i = indices[d - 1] + 1; i < parent.children.length; i++) {
                fillNodeRecursive(parent.children[i], d, code);
            }
        }
    }

    // 次の30分間のスロットを埋める
    const endSec = nowSec + LEVELS[0].seconds;
    for (let i = currentSlotIndex + 1; i < timeSlots.length; i++) {
        const s = timeSlots[i];
        const sStartSec = s.startHour * 3600 + s.startMin * 60;

        fillNodeRecursive(s, 0, code);

        if (endSec < sStartSec + LEVELS[0].seconds) break;
    }

    renderTimeSlots();
    updateSummary();

    const codeInfo = himatsubushiCodes.find(c => c.code === code);
    showToast(`${codeInfo?.description || code} を開始しました！`);
}

document.getElementById('menuStartActivity').addEventListener('click', () => {
    const menu = document.getElementById('codeContextMenu');
    const code = menu.dataset.code;
    menu.classList.remove('show');
    if (code) startActivity(code);
});

// --- スタイル更新 ---

function updateSlotStyles() {
    document.querySelectorAll('.time-slot').forEach(el => {
        const slotId = el.dataset.slotId;
        const isSelected = selectedSlots.has(slotId);
        const value = getSlotValue(slotId);

        el.classList.toggle('selected', isSelected);
        el.classList.toggle('cursor', slotId === cursorSlotId);

        const valueEl = el.querySelector('.time-value');
        valueEl.innerHTML = getValueDisplay(value);
        valueEl.classList.toggle('empty', !value);
    });
}

function updateSelectionHint() {
    const hint = document.getElementById('selectionHint');
    const count = selectedSlots.size;
    if (count === 0) {
        hint.innerHTML = 'タイムスロットを選択してください';
    } else {
        hint.innerHTML = `<strong>${count}個</strong>のタイムスロットを選択中`;
    }
}

function applyCode(code) {
    if (selectedSlots.size === 0) {
        showToast('時間枠を選択してください');
        return;
    }

    selectedSlots.forEach(slotId => {
        setSlotValue(slotId, code);
    });

    updateSlotStyles();
    updateSummary();
}

// --- サマリー ---

function formatSeconds(totalSec) {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (secs > 0) {
        return hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}${secs}s` : mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
    }
    return hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
}

function updateSummary() {
    const summary = {};
    timeSlots.forEach(slot => accumulateSummary(slot, 0, summary));

    // 各コードの秒を分単位に切り捨て
    const truncated = {};
    for (const [code, seconds] of Object.entries(summary)) {
        truncated[code] = Math.floor(seconds / 60) * 60;
    }

    const container = document.getElementById('summaryList');

    if (Object.keys(truncated).length === 0) {
        container.innerHTML = '<p class="empty-message">まだ記録がありません</p>';
    } else {
        container.innerHTML = Object.entries(truncated)
            .sort((a, b) => b[1] - a[1])
            .map(([code, seconds]) => {
                const timeStr = formatSeconds(seconds);
                const codeInfo = himatsubushiCodes.find(c => c.code === code);
                return `
                    <div class="summary-item">
                        <span class="summary-item-code">${escapeHtml(code)} ${escapeHtml(codeInfo?.description || '')}</span>
                        <span class="summary-item-time">${timeStr}</span>
                    </div>
                `;
            }).join('');
    }

    const totalTruncated = Object.values(truncated).reduce((a, b) => a + b, 0);
    const totalHours = Math.floor(totalTruncated / 3600);
    const totalMins = Math.floor((totalTruncated % 3600) / 60);
    document.getElementById('totalTime').textContent = `${totalHours}:${totalMins.toString().padStart(2, '0')}`;

    saveToStorage();
}

// --- クリップボード ---

function copyToClipboard() {
    const summary = {};
    timeSlots.forEach(slot => accumulateSummary(slot, 0, summary));

    if (Object.keys(summary).length === 0) {
        showToast('記録がありません');
        return;
    }

    const truncated = {};
    for (const [code, seconds] of Object.entries(summary)) {
        truncated[code] = Math.floor(seconds / 60) * 60;
    }

    const formatTime = (totalSec) => {
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    const now = new Date();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const header = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekdays[now.getDay()]})の暇潰管理レポート`;

    const lines = [header, '```'];

    Object.entries(truncated)
        .sort((a, b) => b[1] - a[1])
        .forEach(([code, seconds]) => {
            const codeInfo = himatsubushiCodes.find(c => c.code === code);
            lines.push(`【${formatTime(seconds)}】[${code}] ${codeInfo?.description || ''}`);
        });

    lines.push('```');

    const totalTruncated = Object.values(truncated).reduce((a, b) => a + b, 0);
    lines.push(`総暇潰時間：${formatTime(totalTruncated)}`);

    const text = lines.join('\n');
    showReportPreview(text);
}

// --- レポート ---

function showReportPreview(text) {
    const overlay = document.getElementById('reportOverlay');
    const content = document.getElementById('reportContent');
    content.textContent = text;
    overlay.classList.add('show');

    navigator.clipboard.writeText(text).then(() => {
        document.getElementById('reportCopyStatus').textContent = 'クリップボードにコピー済み';
    }).catch(() => {
        document.getElementById('reportCopyStatus').textContent = '';
    });
}

function closeReportPreview() {
    document.getElementById('reportOverlay').classList.remove('show');
}

function copyReport() {
    const text = document.getElementById('reportContent').textContent;
    navigator.clipboard.writeText(text).then(() => {
        document.getElementById('reportCopyStatus').textContent = 'コピーしました！';
    }).catch(() => {
        document.getElementById('reportCopyStatus').textContent = 'コピーに失敗しました';
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// --- キーボードショートカット ---

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const arrowMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (arrowMap[e.key]) {
        e.preventDefault();
        moveCursor(arrowMap[e.key], e.shiftKey);
        return;
    }

    // Cmd+A / Ctrl+A: 全選択
    if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const allIds = getAllSlotIds();
        selectedSlots = new Set(allIds);
        if (allIds.length > 0) cursorSlotId = allIds[allIds.length - 1];
        updateSlotStyles();
        updateSelectionHint();
        return;
    }

    if (e.key === 'Backspace') {
        e.preventDefault();
        applyCode(null);
        return;
    }

    const key = parseInt(e.key);
    if (isNaN(key)) return;

    if (key >= 1 && key <= himatsubushiCodes.length) {
        applyCode(himatsubushiCodes[key - 1].code);
    } else if (key === 0) {
        applyCode(null);
    }
});

// --- 初期化 ---

initTimeSlots();
loadFromStorage();
renderTimeSlots();
renderCodeButtons();
updateSummary();
