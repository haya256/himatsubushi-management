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

// データ構造:
// 30分スロット: { value, subdivided, subSlots[3] }
// 10分サブスロット: { value, subdivided, microSlots[10] }
// 1分マイクロスロット: { value, subdivided, nanoSlots[6] }
// 10秒ナノスロット: { value }
const timeSlots = [];

function createNanoSlots() {
    return Array.from({ length: 6 }, () => ({ value: null }));
}

function createMicroSlots() {
    return Array.from({ length: 10 }, () => ({ value: null, subdivided: false, nanoSlots: createNanoSlots() }));
}

function createSubSlots() {
    return Array.from({ length: 3 }, () => ({
        value: null,
        subdivided: false,
        microSlots: createMicroSlots()
    }));
}

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
                subSlots: createSubSlots()
            });
        }
    }
}

let selectedSlots = new Set();
let cursorSlotId = null;
let isDragging = false;
let dragStartId = null;
let dragCurrentId = null;
let preselectedSlots = new Set();
let contextMenuTarget = null;

function getValueDisplay(value) {
    if (!value) return '--';
    const codeInfo = himatsubushiCodes.find(c => c.code === value);
    if (codeInfo) {
        return `<span class="value-code">${value}</span><span class="value-desc">${codeInfo.description}</span>`;
    }
    return value;
}

function getSlotLabel(slotIndex, subIndex = null, microIndex = null, nanoIndex = null) {
    const slot = timeSlots[slotIndex];
    const fmt = (h, m) => `${h}:${m.toString().padStart(2, '0')}`;

    if (subIndex === null) {
        return slot.start;
    } else if (microIndex === null) {
        const baseMin = slot.startMin + subIndex * 10;
        const startH = slot.startHour + Math.floor(baseMin / 60);
        const startM = baseMin % 60;
        return fmt(startH, startM);
    } else if (nanoIndex === null) {
        const baseMin = slot.startMin + subIndex * 10 + microIndex;
        const startH = slot.startHour + Math.floor(baseMin / 60);
        const startM = baseMin % 60;
        return fmt(startH, startM);
    } else {
        const baseSec = (slot.startMin + subIndex * 10 + microIndex) * 60 + nanoIndex * 10;
        const totalMin = Math.floor(baseSec / 60);
        const sec = baseSec % 60;
        const startH = slot.startHour + Math.floor(totalMin / 60);
        const startM = totalMin % 60;
        return `${startH}:${startM.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}

function renderTimeSlots() {
    const container = document.getElementById('timeSlots');
    let html = '';

    const halfPoint = Math.ceil(timeSlots.length / 2);
    timeSlots.forEach((slot, index) => {
        const column = index < halfPoint ? 'left-column' : 'right-column';
        html += `<div class="slot-group ${column}" data-slot-index="${index}">`;

        if (slot.subdivided) {
            // 10分サブスロットを表示
            for (let sub = 0; sub < 3; sub++) {
                const subSlot = slot.subSlots[sub];

                if (subSlot.subdivided) {
                    // 1分マイクロスロットを表示
                    for (let micro = 0; micro < 10; micro++) {
                        const microSlot = subSlot.microSlots[micro];

                        if (microSlot.subdivided) {
                            // 10秒ナノスロットを表示
                            for (let nano = 0; nano < 6; nano++) {
                                const slotId = `${index}-${sub}-${micro}-${nano}`;
                                const nanoValue = microSlot.nanoSlots[nano].value;
                                const display = getValueDisplay(nanoValue);
                                html += `
                                    <div class="time-slot nano-slot" data-slot-id="${slotId}">
                                        <span class="time-label">${getSlotLabel(index, sub, micro, nano)}</span>
                                        <span class="time-value ${nanoValue ? '' : 'empty'}">${display}</span>
                                    </div>
                                `;
                            }
                        } else {
                            const slotId = `${index}-${sub}-${micro}`;
                            const microValue = microSlot.value;
                            const display = getValueDisplay(microValue);
                            html += `
                                <div class="time-slot micro-slot" data-slot-id="${slotId}">
                                    <span class="time-label">${getSlotLabel(index, sub, micro)}</span>
                                    <span class="time-value ${microValue ? '' : 'empty'}">${display}</span>
                                </div>
                            `;
                        }
                    }
                } else {
                    // 10分スロットを表示
                    const slotId = `${index}-${sub}`;
                    const subValue = subSlot.value;
                    const display = getValueDisplay(subValue);
                    html += `
                        <div class="time-slot sub-slot" data-slot-id="${slotId}">
                            <span class="time-label">${getSlotLabel(index, sub)}</span>
                            <span class="time-value ${subValue ? '' : 'empty'}">${display}</span>
                        </div>
                    `;
                }
            }
        } else {
            // 30分スロットを表示
            const slotId = `${index}`;
            const display = getValueDisplay(slot.value);
            html += `
                <div class="time-slot" data-slot-id="${slotId}">
                    <span class="time-label">${slot.start}</span>
                    <span class="time-value ${slot.value ? '' : 'empty'}">${display}</span>
                </div>
            `;
        }

        html += '</div>';
    });

    container.innerHTML = html;
    attachSlotEvents();
}

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
    });
}

function getAllSlotIds() {
    const ids = [];
    timeSlots.forEach((slot, index) => {
        if (slot.subdivided) {
            for (let sub = 0; sub < 3; sub++) {
                const subSlot = slot.subSlots[sub];
                if (subSlot.subdivided) {
                    for (let micro = 0; micro < 10; micro++) {
                        const microSlot = subSlot.microSlots[micro];
                        if (microSlot.subdivided) {
                            for (let nano = 0; nano < 6; nano++) {
                                ids.push(`${index}-${sub}-${micro}-${nano}`);
                            }
                        } else {
                            ids.push(`${index}-${sub}-${micro}`);
                        }
                    }
                } else {
                    ids.push(`${index}-${sub}`);
                }
            }
        } else {
            ids.push(`${index}`);
        }
    });
    return ids;
}

function getColumnSlotIds() {
    const halfPoint = Math.ceil(timeSlots.length / 2);
    const leftIds = [];
    const rightIds = [];

    timeSlots.forEach((slot, index) => {
        const target = index < halfPoint ? leftIds : rightIds;
        if (slot.subdivided) {
            for (let sub = 0; sub < 3; sub++) {
                const subSlot = slot.subSlots[sub];
                if (subSlot.subdivided) {
                    for (let micro = 0; micro < 10; micro++) {
                        const microSlot = subSlot.microSlots[micro];
                        if (microSlot.subdivided) {
                            for (let nano = 0; nano < 6; nano++) {
                                target.push(`${index}-${sub}-${micro}-${nano}`);
                            }
                        } else {
                            target.push(`${index}-${sub}-${micro}`);
                        }
                    }
                } else {
                    target.push(`${index}-${sub}`);
                }
            }
        } else {
            target.push(`${index}`);
        }
    });

    return { leftIds, rightIds };
}

function moveCursor(direction, shiftKey) {
    const { leftIds, rightIds } = getColumnSlotIds();
    const allIds = getAllSlotIds();

    if (!cursorSlotId || !allIds.includes(cursorSlotId)) {
        // カーソルがなければ最初のスロットへ
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
    const otherCol = inLeft ? rightIds : leftIds;
    const currentIdx = currentCol.indexOf(cursorSlotId);
    let newId = null;

    if (direction === 'up') {
        if (currentIdx > 0) {
            newId = currentCol[currentIdx - 1];
        } else if (inLeft) {
            // 左列の一番上 → 右列の一番下（ループではなく逆カラムには飛ばない）
        } else {
            // 右列の一番上 → 左列の一番下
            newId = leftIds[leftIds.length - 1];
        }
    } else if (direction === 'down') {
        if (currentIdx < currentCol.length - 1) {
            newId = currentCol[currentIdx + 1];
        } else if (inLeft) {
            // 左列の一番下 → 右列の一番上
            newId = rightIds[0];
        }
    } else if (direction === 'left' || direction === 'right') {
        const targetCol = (direction === 'left') ? leftIds : rightIds;
        if (targetCol === currentCol) return;
        // 同じ行位置あたりに飛ぶ
        const ratio = currentCol.length > 1 ? currentIdx / (currentCol.length - 1) : 0;
        const targetIdx = Math.round(ratio * (targetCol.length - 1));
        newId = targetCol[targetIdx];
    }

    if (!newId) return;

    const anchorId = cursorSlotId;
    cursorSlotId = newId;

    if (shiftKey) {
        // Shift+矢印: 選択範囲を拡張
        selectedSlots.add(newId);
    } else {
        selectedSlots.clear();
        selectedSlots.add(newId);
    }

    updateSlotStyles();
    updateSelectionHint();

    // カーソル位置が見えるようにスクロール
    const el = document.querySelector(`[data-slot-id="${newId}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
}

function updateCursorStyle() {
    document.querySelectorAll('.time-slot').forEach(el => {
        el.classList.toggle('cursor', el.dataset.slotId === cursorSlotId);
    });
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

function showContextMenu(x, y, slotId) {
    const menu = document.getElementById('contextMenu');
    const splitTo10 = document.getElementById('menuSplitTo10');
    const splitTo1 = document.getElementById('menuSplitTo1');
    const splitTo10sec = document.getElementById('menuSplitTo10sec');
    const mergeTo30 = document.getElementById('menuMergeTo30');
    const mergeTo10 = document.getElementById('menuMergeTo10');
    const mergeTo1 = document.getElementById('menuMergeTo1');
    const fillEmpty = document.getElementById('menuFillEmpty');

    const parts = slotId.split('-');
    const mainIndex = parseInt(parts[0]);
    const slot = timeSlots[mainIndex];

    contextMenuTarget = { slotId, parts, mainIndex };

    // すべて非表示/無効にする
    splitTo10.classList.add('hidden');
    splitTo1.classList.add('hidden');
    splitTo10sec.classList.add('hidden');
    mergeTo30.classList.add('hidden');
    mergeTo10.classList.add('hidden');
    mergeTo1.classList.add('hidden');
    fillEmpty.classList.add('hidden');
    document.getElementById('menuClearSlot').classList.add('hidden');

    if (parts.length === 1) {
        // 30分スロット
        if (!slot.subdivided) {
            splitTo10.classList.remove('hidden');
        } else {
            mergeTo30.classList.remove('hidden');
        }
    } else if (parts.length === 2) {
        // 10分スロット
        const subIndex = parseInt(parts[1]);
        const subSlot = slot.subSlots[subIndex];
        if (!subSlot.subdivided) {
            splitTo1.classList.remove('hidden');
        }
        mergeTo30.classList.remove('hidden');
    } else if (parts.length === 3) {
        // 1分スロット
        const subIndex = parseInt(parts[1]);
        const microIndex = parseInt(parts[2]);
        const microSlot = slot.subSlots[subIndex].microSlots[microIndex];
        if (!microSlot.subdivided) {
            splitTo10sec.classList.remove('hidden');
        }
        mergeTo10.classList.remove('hidden');
        mergeTo30.classList.remove('hidden');
    } else if (parts.length === 4) {
        // 10秒スロット
        mergeTo1.classList.remove('hidden');
        mergeTo10.classList.remove('hidden');
        mergeTo30.classList.remove('hidden');
    }

    // 値があるスロットなら「以降の連続空き埋め」を表示
    if (getSlotValue(slotId)) {
        fillEmpty.classList.remove('hidden');
    }

    // クリアは常に表示
    document.getElementById('menuClearSlot').classList.remove('hidden');

    menu.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 120)}px`;
    menu.classList.add('show');
}

// 30分→10分に分割
document.getElementById('menuSplitTo10').addEventListener('click', () => {
    if (!contextMenuTarget) return;
    const slot = timeSlots[contextMenuTarget.mainIndex];

    if (!slot.subdivided) {
        slot.subdivided = true;
        if (slot.value) {
            slot.subSlots.forEach(sub => sub.value = slot.value);
        }
        slot.value = null;
        selectedSlots.clear();
        renderTimeSlots();
        updateSummary();
    }

    document.getElementById('contextMenu').classList.remove('show');
});

// 10分→1分に分割
document.getElementById('menuSplitTo1').addEventListener('click', () => {
    if (!contextMenuTarget || contextMenuTarget.parts.length !== 2) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];
    const subIndex = parseInt(contextMenuTarget.parts[1]);
    const subSlot = slot.subSlots[subIndex];

    if (!subSlot.subdivided) {
        subSlot.subdivided = true;
        if (subSlot.value) {
            subSlot.microSlots.forEach(micro => micro.value = subSlot.value);
        }
        subSlot.value = null;
        selectedSlots.clear();
        renderTimeSlots();
        updateSummary();
    }

    document.getElementById('contextMenu').classList.remove('show');
});

// 1分→10秒に分割
document.getElementById('menuSplitTo10sec').addEventListener('click', () => {
    if (!contextMenuTarget || contextMenuTarget.parts.length !== 3) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];
    const subIndex = parseInt(contextMenuTarget.parts[1]);
    const microIndex = parseInt(contextMenuTarget.parts[2]);
    const microSlot = slot.subSlots[subIndex].microSlots[microIndex];

    if (!microSlot.subdivided) {
        microSlot.subdivided = true;
        if (microSlot.value) {
            microSlot.nanoSlots.forEach(nano => nano.value = microSlot.value);
        }
        microSlot.value = null;
        selectedSlots.clear();
        renderTimeSlots();
        updateSummary();
    }

    document.getElementById('contextMenu').classList.remove('show');
});

// 10分→30分に戻す
document.getElementById('menuMergeTo30').addEventListener('click', () => {
    if (!contextMenuTarget) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];

    if (slot.subdivided) {
        // すべてのサブスロットの値を確認
        const allValues = [];
        slot.subSlots.forEach(sub => {
            if (sub.subdivided) {
                sub.microSlots.forEach(micro => {
                    if (micro.subdivided) {
                        micro.nanoSlots.forEach(nano => allValues.push(nano.value));
                    } else {
                        allValues.push(micro.value);
                    }
                });
            } else {
                allValues.push(sub.value);
            }
        });

        // すべて同じ値なら引き継ぐ、違う場合は確認
        const uniqueValues = [...new Set(allValues)];
        if (uniqueValues.length > 1) {
            if (!confirm('異なるコードが混在しているため、全てクリアされます。良いですか？')) {
                document.getElementById('contextMenu').classList.remove('show');
                return;
            }
        }
        slot.value = (uniqueValues.length === 1) ? uniqueValues[0] : null;

        slot.subdivided = false;
        slot.subSlots = createSubSlots();

        selectedSlots.clear();
        renderTimeSlots();
        updateSummary();
    }

    document.getElementById('contextMenu').classList.remove('show');
});

// 10秒→1分に戻す
document.getElementById('menuMergeTo1').addEventListener('click', () => {
    if (!contextMenuTarget || contextMenuTarget.parts.length !== 4) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];
    const subIndex = parseInt(contextMenuTarget.parts[1]);
    const microIndex = parseInt(contextMenuTarget.parts[2]);
    const microSlot = slot.subSlots[subIndex].microSlots[microIndex];

    if (microSlot.subdivided) {
        const vals = microSlot.nanoSlots.map(n => n.value);
        const uniqueVals = [...new Set(vals)];

        if (uniqueVals.length > 1) {
            if (!confirm('異なる値が混在しています。クリアします。良いですか？')) {
                document.getElementById('contextMenu').classList.remove('show');
                return;
            }
        }
        microSlot.value = (uniqueVals.length === 1) ? uniqueVals[0] : null;

        microSlot.subdivided = false;
        microSlot.nanoSlots = createNanoSlots();

        selectedSlots.clear();
        renderTimeSlots();
        updateSummary();
    }

    document.getElementById('contextMenu').classList.remove('show');
});

// 1分→10分に戻す
document.getElementById('menuMergeTo10').addEventListener('click', () => {
    if (!contextMenuTarget || contextMenuTarget.parts.length < 3) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];
    const subIndex = parseInt(contextMenuTarget.parts[1]);
    const subSlot = slot.subSlots[subIndex];

    if (subSlot.subdivided) {
        const vals = [];
        subSlot.microSlots.forEach(m => {
            if (m.subdivided) {
                m.nanoSlots.forEach(n => vals.push(n.value));
            } else {
                vals.push(m.value);
            }
        });
        const uniqueVals = [...new Set(vals)];

        if (uniqueVals.length > 1) {
            if (!confirm('異なる値が混在しています。クリアします。良いですか？')) {
                document.getElementById('contextMenu').classList.remove('show');
                return;
            }
        }
        subSlot.value = (uniqueVals.length === 1) ? uniqueVals[0] : null;

        subSlot.subdivided = false;
        subSlot.microSlots = createMicroSlots();

        selectedSlots.clear();
        renderTimeSlots();
        updateSummary();
    }

    document.getElementById('contextMenu').classList.remove('show');
});

// 以降の連続空き埋め
document.getElementById('menuFillEmpty').addEventListener('click', () => {
    if (!contextMenuTarget) return;

    const code = getSlotValue(contextMenuTarget.slotId);
    if (!code) return;

    const allIds = getAllSlotIds();
    const startIdx = allIds.indexOf(contextMenuTarget.slotId);
    if (startIdx === -1) return;

    for (let i = startIdx + 1; i < allIds.length; i++) {
        if (getSlotValue(allIds[i])) break;
        setSlotValue(allIds[i], code);
    }

    renderTimeSlots();
    updateSummary();
    document.getElementById('contextMenu').classList.remove('show');
});

// クリア（選択中のスロットを一括クリア）
document.getElementById('menuClearSlot').addEventListener('click', () => {
    if (!contextMenuTarget) return;
    const targets = selectedSlots.size > 0 ? selectedSlots : new Set([contextMenuTarget.slotId]);
    targets.forEach(slotId => setSlotValue(slotId, null));
    updateSlotStyles();
    updateSummary();
    document.getElementById('contextMenu').classList.remove('show');
});

function renderCodeButtons() {
    const container = document.getElementById('codeButtons');
    container.innerHTML = himatsubushiCodes.map(item => `
        <div class="code-btn" data-code="${item.code}" onclick="applyCode('${item.code}')">
            <div class="code-btn-code">${item.code}</div>
            <div class="code-btn-desc">${item.description}</div>
        </div>
    `).join('') + `
        <div class="code-btn clear-btn" onclick="applyCode(null)">
            <div class="code-btn-code">CLR</div>
            <div class="code-btn-desc">クリア</div>
        </div>
    `;

    // コードボタンの右クリックメニュー
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

// スロットにコードを再帰的に設定（既存の分割構造を維持）
function fillSlotRecursive(slotIndex, code, subIndex, microIndex) {
    const slot = timeSlots[slotIndex];

    if (subIndex === undefined) {
        if (slot.subdivided) {
            for (let s = 0; s < 3; s++) fillSlotRecursive(slotIndex, code, s);
        } else {
            slot.value = code;
        }
        return;
    }

    const subSlot = slot.subSlots[subIndex];
    if (microIndex === undefined) {
        if (subSlot.subdivided) {
            for (let m = 0; m < 10; m++) fillSlotRecursive(slotIndex, code, subIndex, m);
        } else {
            subSlot.value = code;
        }
        return;
    }

    const microSlot = subSlot.microSlots[microIndex];
    if (microSlot.subdivided) {
        for (let n = 0; n < 6; n++) microSlot.nanoSlots[n].value = code;
    } else {
        microSlot.value = code;
    }
}

// 「今からこれやります！」
function startActivity(code) {
    const now = new Date();
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    // 現在時刻を含む30分スロットを探す
    let currentSlotIndex = -1;
    for (let i = 0; i < timeSlots.length; i++) {
        const s = timeSlots[i];
        const startSec = s.startHour * 3600 + s.startMin * 60;
        if (nowSec >= startSec && nowSec < startSec + 1800) {
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
    const subIndex = Math.floor(offsetSec / 600);
    const microIndex = Math.floor((offsetSec % 600) / 60);
    const nanoIndex = Math.floor((offsetSec % 60) / 10);

    // --- 現在の30分スロットを10秒精度まで分割 ---
    if (!slot.subdivided) {
        slot.subdivided = true;
        if (slot.value) {
            slot.subSlots.forEach(sub => sub.value = slot.value);
        }
        slot.value = null;
    }

    const subSlot = slot.subSlots[subIndex];
    if (!subSlot.subdivided) {
        subSlot.subdivided = true;
        if (subSlot.value) {
            subSlot.microSlots.forEach(micro => micro.value = subSlot.value);
        }
        subSlot.value = null;
    }

    const microSlot = subSlot.microSlots[microIndex];
    if (!microSlot.subdivided) {
        microSlot.subdivided = true;
        if (microSlot.value) {
            microSlot.nanoSlots.forEach(nano => nano.value = microSlot.value);
        }
        microSlot.value = null;
    }

    // 現在のナノスロットから分末まで埋める
    for (let n = nanoIndex; n < 6; n++) {
        microSlot.nanoSlots[n].value = code;
    }

    // 残りの1分スロット（同じ10分ブロック内）を埋める
    for (let m = microIndex + 1; m < 10; m++) {
        fillSlotRecursive(currentSlotIndex, code, subIndex, m);
    }

    // 残りの10分スロット（同じ30分ブロック内）を埋める
    for (let s = subIndex + 1; s < 3; s++) {
        fillSlotRecursive(currentSlotIndex, code, s);
    }

    // --- 次の30分間のスロットを埋める（分割せず） ---
    const endSec = nowSec + 1800;
    for (let i = currentSlotIndex + 1; i < timeSlots.length; i++) {
        const s = timeSlots[i];
        const sStartSec = s.startHour * 3600 + s.startMin * 60;

        fillSlotRecursive(i, code);

        // このスロットがnow+30minを含んでいたら終了
        if (endSec < sStartSec + 1800) break;
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

function getSlotValue(slotId) {
    const parts = slotId.split('-');
    const mainIndex = parseInt(parts[0]);
    const slot = timeSlots[mainIndex];

    if (parts.length === 1) {
        return slot.value;
    } else if (parts.length === 2) {
        return slot.subSlots[parseInt(parts[1])].value;
    } else if (parts.length === 3) {
        return slot.subSlots[parseInt(parts[1])].microSlots[parseInt(parts[2])].value;
    } else {
        return slot.subSlots[parseInt(parts[1])].microSlots[parseInt(parts[2])].nanoSlots[parseInt(parts[3])].value;
    }
}

function setSlotValue(slotId, value) {
    const parts = slotId.split('-');
    const mainIndex = parseInt(parts[0]);
    const slot = timeSlots[mainIndex];

    if (parts.length === 1) {
        slot.value = value;
    } else if (parts.length === 2) {
        slot.subSlots[parseInt(parts[1])].value = value;
    } else if (parts.length === 3) {
        slot.subSlots[parseInt(parts[1])].microSlots[parseInt(parts[2])].value = value;
    } else {
        slot.subSlots[parseInt(parts[1])].microSlots[parseInt(parts[2])].nanoSlots[parseInt(parts[3])].value = value;
    }
}

function updateSlotStyles() {
    document.querySelectorAll('.time-slot').forEach(el => {
        const slotId = el.dataset.slotId;
        const isSelected = selectedSlots.has(slotId);
        const value = getSlotValue(slotId);

        el.classList.toggle('selected', isSelected);
        el.classList.toggle('has-value', !!value);
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
    let totalSeconds = 0;

    timeSlots.forEach(slot => {
        if (slot.subdivided) {
            slot.subSlots.forEach(sub => {
                if (sub.subdivided) {
                    sub.microSlots.forEach(micro => {
                        if (micro.subdivided) {
                            // 10秒単位
                            micro.nanoSlots.forEach(nano => {
                                if (nano.value) {
                                    if (!summary[nano.value]) summary[nano.value] = 0;
                                    summary[nano.value] += 10;
                                    totalSeconds += 10;
                                }
                            });
                        } else {
                            // 1分単位
                            if (micro.value) {
                                if (!summary[micro.value]) summary[micro.value] = 0;
                                summary[micro.value] += 60;
                                totalSeconds += 60;
                            }
                        }
                    });
                } else {
                    // 10分単位
                    if (sub.value) {
                        if (!summary[sub.value]) summary[sub.value] = 0;
                        summary[sub.value] += 600;
                        totalSeconds += 600;
                    }
                }
            });
        } else {
            // 30分単位
            if (slot.value) {
                if (!summary[slot.value]) summary[slot.value] = 0;
                summary[slot.value] += 1800;
                totalSeconds += 1800;
            }
        }
    });

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
                        <span class="summary-item-code">${code} ${codeInfo?.description || ''}</span>
                        <span class="summary-item-time">${timeStr}</span>
                    </div>
                `;
            }).join('');
    }

    const totalTruncated = Object.values(truncated).reduce((a, b) => a + b, 0);
    const totalHours = Math.floor(totalTruncated / 3600);
    const totalMins = Math.floor((totalTruncated % 3600) / 60);
    document.getElementById('totalTime').textContent = `${totalHours}:${totalMins.toString().padStart(2, '0')}`;
}

function copyToClipboard() {
    const summary = {};

    timeSlots.forEach(slot => {
        if (slot.subdivided) {
            slot.subSlots.forEach(sub => {
                if (sub.subdivided) {
                    sub.microSlots.forEach(micro => {
                        if (micro.subdivided) {
                            micro.nanoSlots.forEach(nano => {
                                if (nano.value) {
                                    if (!summary[nano.value]) summary[nano.value] = 0;
                                    summary[nano.value] += 10;
                                }
                            });
                        } else {
                            if (micro.value) {
                                if (!summary[micro.value]) summary[micro.value] = 0;
                                summary[micro.value] += 60;
                            }
                        }
                    });
                } else {
                    if (sub.value) {
                        if (!summary[sub.value]) summary[sub.value] = 0;
                        summary[sub.value] += 600;
                    }
                }
            });
        } else {
            if (slot.value) {
                if (!summary[slot.value]) summary[slot.value] = 0;
                summary[slot.value] += 1800;
            }
        }
    });

    if (Object.keys(summary).length === 0) {
        showToast('記録がありません');
        return;
    }

    // 各コードの秒を分単位に切り捨て
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

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // 矢印キー: カーソル移動
    const arrowMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (arrowMap[e.key]) {
        e.preventDefault();
        moveCursor(arrowMap[e.key], e.shiftKey);
        return;
    }

    // Backspace: クリア
    if (e.key === 'Backspace') {
        e.preventDefault();
        applyCode(null);
        return;
    }

    // 数字キー: 1-9でコード適用、0でクリア
    const key = parseInt(e.key);
    if (isNaN(key)) return;

    if (key >= 1 && key <= himatsubushiCodes.length) {
        applyCode(himatsubushiCodes[key - 1].code);
    } else if (key === 0) {
        applyCode(null);
    }
});

// 初期化
initTimeSlots();
renderTimeSlots();
renderCodeButtons();
updateSummary();
