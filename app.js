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
// 1分マイクロスロット: { value }
const timeSlots = [];

function createMicroSlots() {
    return Array.from({ length: 10 }, () => ({ value: null }));
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

function getSlotLabel(slotIndex, subIndex = null, microIndex = null) {
    const slot = timeSlots[slotIndex];
    const fmt = (h, m) => `${h}:${m.toString().padStart(2, '0')}`;

    if (subIndex === null) {
        // 30分スロット
        return slot.start;
    } else if (microIndex === null) {
        // 10分スロット
        const baseMin = slot.startMin + subIndex * 10;
        const startH = slot.startHour + Math.floor(baseMin / 60);
        const startM = baseMin % 60;
        return fmt(startH, startM);
    } else {
        // 1分スロット
        const baseMin = slot.startMin + subIndex * 10 + microIndex;
        const startH = slot.startHour + Math.floor(baseMin / 60);
        const startM = baseMin % 60;
        return fmt(startH, startM);
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
                        const slotId = `${index}-${sub}-${micro}`;
                        const microValue = subSlot.microSlots[micro].value;
                        const display = getValueDisplay(microValue);
                        html += `
                            <div class="time-slot micro-slot" data-slot-id="${slotId}">
                                <span class="time-label">${getSlotLabel(index, sub, micro)}</span>
                                <span class="time-value ${microValue ? '' : 'empty'}">${display}</span>
                            </div>
                        `;
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
                        ids.push(`${index}-${sub}-${micro}`);
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
    const mergeTo30 = document.getElementById('menuMergeTo30');
    const mergeTo10 = document.getElementById('menuMergeTo10');

    const parts = slotId.split('-');
    const mainIndex = parseInt(parts[0]);
    const slot = timeSlots[mainIndex];

    contextMenuTarget = { slotId, parts, mainIndex };

    // すべて非表示/無効にする
    splitTo10.classList.add('hidden');
    splitTo1.classList.add('hidden');
    mergeTo30.classList.add('hidden');
    mergeTo10.classList.add('hidden');

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
        mergeTo10.classList.remove('hidden');
        mergeTo30.classList.remove('hidden');
    }

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

// 10分→30分に戻す
document.getElementById('menuMergeTo30').addEventListener('click', () => {
    if (!contextMenuTarget) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];

    if (slot.subdivided) {
        // すべてのサブスロットの値を確認
        const allValues = [];
        slot.subSlots.forEach(sub => {
            if (sub.subdivided) {
                sub.microSlots.forEach(micro => allValues.push(micro.value));
            } else {
                allValues.push(sub.value);
            }
        });

        // すべて同じ値なら引き継ぐ、違う場合は確認
        const uniqueValues = [...new Set(allValues)];
        if (uniqueValues.length > 1) {
            if (!confirm('異なる値が混在しています。クリアします。良いですか？')) {
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

// 1分→10分に戻す
document.getElementById('menuMergeTo10').addEventListener('click', () => {
    if (!contextMenuTarget || contextMenuTarget.parts.length !== 3) return;

    const slot = timeSlots[contextMenuTarget.mainIndex];
    const subIndex = parseInt(contextMenuTarget.parts[1]);
    const subSlot = slot.subSlots[subIndex];

    if (subSlot.subdivided) {
        const vals = subSlot.microSlots.map(m => m.value);
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

function renderCodeButtons() {
    const container = document.getElementById('codeButtons');
    container.innerHTML = himatsubushiCodes.map(item => `
        <div class="code-btn" onclick="applyCode('${item.code}')">
            <div class="code-btn-code">${item.code}</div>
            <div class="code-btn-desc">${item.description}</div>
        </div>
    `).join('') + `
        <div class="code-btn clear-btn" onclick="applyCode(null)">
            <div class="code-btn-code">CLR</div>
            <div class="code-btn-desc">クリア</div>
        </div>
    `;
}

function getSlotValue(slotId) {
    const parts = slotId.split('-');
    const mainIndex = parseInt(parts[0]);
    const slot = timeSlots[mainIndex];

    if (parts.length === 1) {
        return slot.value;
    } else if (parts.length === 2) {
        return slot.subSlots[parseInt(parts[1])].value;
    } else {
        return slot.subSlots[parseInt(parts[1])].microSlots[parseInt(parts[2])].value;
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
    } else {
        slot.subSlots[parseInt(parts[1])].microSlots[parseInt(parts[2])].value = value;
    }
}

function updateSlotStyles() {
    document.querySelectorAll('.time-slot').forEach(el => {
        const slotId = el.dataset.slotId;
        const isSelected = selectedSlots.has(slotId);
        const value = getSlotValue(slotId);

        el.classList.toggle('selected', isSelected);
        el.classList.toggle('has-value', !!value);

        const valueEl = el.querySelector('.time-value');
        valueEl.innerHTML = getValueDisplay(value);
        valueEl.classList.toggle('empty', !value);
    });
}

function updateSelectionHint() {
    const hint = document.getElementById('selectionHint');
    const count = selectedSlots.size;
    if (count === 0) {
        hint.innerHTML = '時間枠を選択してください';
    } else {
        hint.innerHTML = `<strong>${count}個</strong>の時間枠を選択中`;
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

    selectedSlots.clear();
    updateSlotStyles();
    updateSelectionHint();
    updateSummary();
}

function updateSummary() {
    const summary = {};
    let totalMinutes = 0;

    timeSlots.forEach(slot => {
        if (slot.subdivided) {
            slot.subSlots.forEach(sub => {
                if (sub.subdivided) {
                    // 1分単位
                    sub.microSlots.forEach(micro => {
                        if (micro.value) {
                            if (!summary[micro.value]) summary[micro.value] = 0;
                            summary[micro.value] += 1;
                            totalMinutes += 1;
                        }
                    });
                } else {
                    // 10分単位
                    if (sub.value) {
                        if (!summary[sub.value]) summary[sub.value] = 0;
                        summary[sub.value] += 10;
                        totalMinutes += 10;
                    }
                }
            });
        } else {
            // 30分単位
            if (slot.value) {
                if (!summary[slot.value]) summary[slot.value] = 0;
                summary[slot.value] += 30;
                totalMinutes += 30;
            }
        }
    });

    const container = document.getElementById('summaryList');

    if (Object.keys(summary).length === 0) {
        container.innerHTML = '<p class="empty-message">まだ記録がありません</p>';
    } else {
        container.innerHTML = Object.entries(summary)
            .sort((a, b) => b[1] - a[1])
            .map(([code, minutes]) => {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                const timeStr = hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
                const codeInfo = himatsubushiCodes.find(c => c.code === code);
                return `
                    <div class="summary-item">
                        <span class="summary-item-code">${code} ${codeInfo?.description || ''}</span>
                        <span class="summary-item-time">${timeStr}</span>
                    </div>
                `;
            }).join('');
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const totalMins = totalMinutes % 60;
    document.getElementById('totalTime').textContent = `${totalHours}:${totalMins.toString().padStart(2, '0')}`;
}

function copyToClipboard() {
    const summary = {};

    timeSlots.forEach(slot => {
        if (slot.subdivided) {
            slot.subSlots.forEach(sub => {
                if (sub.subdivided) {
                    sub.microSlots.forEach(micro => {
                        if (micro.value) {
                            if (!summary[micro.value]) summary[micro.value] = 0;
                            summary[micro.value] += 1;
                        }
                    });
                } else {
                    if (sub.value) {
                        if (!summary[sub.value]) summary[sub.value] = 0;
                        summary[sub.value] += 10;
                    }
                }
            });
        } else {
            if (slot.value) {
                if (!summary[slot.value]) summary[slot.value] = 0;
                summary[slot.value] += 30;
            }
        }
    });

    if (Object.keys(summary).length === 0) {
        showToast('記録がありません');
        return;
    }

    const lines = ['【本日の暇潰実績】', ''];

    const formatTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    Object.entries(summary)
        .sort((a, b) => b[1] - a[1])
        .forEach(([code, minutes]) => {
            const codeInfo = himatsubushiCodes.find(c => c.code === code);
            lines.push(`${code}: ${formatTime(minutes)} (${codeInfo?.description || ''})`);
        });

    const totalMinutes = Object.values(summary).reduce((a, b) => a + b, 0);
    lines.push('');
    lines.push(`総暇潰時間: ${formatTime(totalMinutes)}`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        showToast('クリップボードにコピーしました！');
    }).catch(() => {
        showToast('コピーに失敗しました');
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// 初期化
initTimeSlots();
renderTimeSlots();
renderCodeButtons();
updateSummary();
