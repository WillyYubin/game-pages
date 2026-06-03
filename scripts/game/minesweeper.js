/* yubin@copyright.com */
const boardEl = document.getElementById("board");
const mineLeftEl = document.getElementById("mineLeft");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("statusText");
const difficultySelect = document.getElementById("difficultySelect");
const restartButton = document.getElementById("restartButton");

const MOBILE_LONG_PRESS_MS = 420;

function isMobileClient() {
    const ua = navigator.userAgent || "";
    const isPhoneUa = /android|iphone|ipod|windows phone|mobile/i.test(ua);
    const isTabletUa = /ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    return coarsePointer && (isPhoneUa || isTabletUa);
}

const enableMobileLongPressFlag = isMobileClient();

const LEVELS = {
    easy: { rows: 9, cols: 9, mines: 10 },
    medium: { rows: 12, cols: 12, mines: 24 },
    hard: { rows: 16, cols: 16, mines: 45 }
};

let state = null;
let timerId = null;

function updateBoardSizing() {
    if (!state) {
        return;
    }

    const wrap = boardEl.parentElement;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const wrapWidth = wrap ? wrap.clientWidth : boardEl.clientWidth;
    const compact = viewportWidth <= 760;
    const gap = state.cols >= 16 ? 2 : state.cols >= 12 ? 3 : 4;
    const usableWidth = Math.max(220, wrapWidth - (compact ? 4 : 0));
    const maxSize = compact ? 32 : 36;
    const minSize = compact ? 18 : 24;
    const cellSize = Math.max(minSize, Math.min(maxSize, Math.floor((usableWidth - gap * (state.cols - 1)) / state.cols)));

    boardEl.style.setProperty("--cell-gap", `${gap}px`);
    boardEl.style.setProperty("--cell-size", `${cellSize}px`);
    boardEl.style.setProperty("--cell-radius", `${Math.max(6, Math.round(cellSize * 0.28))}px`);
    boardEl.style.gridTemplateColumns = `repeat(${state.cols}, ${cellSize}px)`;
}

function createCell(row, col) {
    return {
        row,
        col,
        mine: false,
        revealed: false,
        flagged: false,
        around: 0,
        el: null
    };
}

function neighbors(row, col, rows, cols) {
    const list = [];
    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) {
                continue;
            }
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                list.push([nr, nc]);
            }
        }
    }
    return list;
}

function setStatus(text) {
    statusEl.textContent = text;
}

function updateHud() {
    const left = Math.max(0, state.mines - state.flags);
    mineLeftEl.textContent = String(left);
    timerEl.textContent = `${state.seconds}s`;
}

function tickTimer() {
    if (!state || state.ended || !state.started) {
        return;
    }
    state.seconds += 1;
    updateHud();
}

function startTimerIfNeeded() {
    if (state.started) {
        return;
    }
    state.started = true;
    timerId = window.setInterval(tickTimer, 1000);
}

function stopTimer() {
    if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
    }
}

function buildBoard(levelKey) {
    const level = LEVELS[levelKey] || LEVELS.medium;
    stopTimer();

    state = {
        rows: level.rows,
        cols: level.cols,
        mines: level.mines,
        flags: 0,
        revealedCount: 0,
        started: false,
        ended: false,
        seconds: 0,
        cells: []
    };

    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;

    for (let r = 0; r < state.rows; r += 1) {
        const row = [];
        for (let c = 0; c < state.cols; c += 1) {
            const cell = createCell(r, c);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "cell";
            button.setAttribute("aria-label", `第${r + 1}行第${c + 1}列`);
            button.dataset.row = String(r);
            button.dataset.col = String(c);
            cell.el = button;
            row.push(cell);
            boardEl.appendChild(button);
        }
        state.cells.push(row);
    }

    updateHud();
    setStatus("准备就绪，祝你好运。");
    updateBoardSizing();
}

function placeMines(firstRow, firstCol) {
    const blocked = new Set();
    blocked.add(`${firstRow},${firstCol}`);
    for (const [nr, nc] of neighbors(firstRow, firstCol, state.rows, state.cols)) {
        blocked.add(`${nr},${nc}`);
    }

    let placed = 0;
    while (placed < state.mines) {
        const r = Math.floor(Math.random() * state.rows);
        const c = Math.floor(Math.random() * state.cols);
        if (blocked.has(`${r},${c}`)) {
            continue;
        }
        const cell = state.cells[r][c];
        if (cell.mine) {
            continue;
        }
        cell.mine = true;
        placed += 1;
    }

    for (let r = 0; r < state.rows; r += 1) {
        for (let c = 0; c < state.cols; c += 1) {
            const cell = state.cells[r][c];
            if (cell.mine) {
                continue;
            }
            let count = 0;
            for (const [nr, nc] of neighbors(r, c, state.rows, state.cols)) {
                if (state.cells[nr][nc].mine) {
                    count += 1;
                }
            }
            cell.around = count;
        }
    }
}

function revealCell(cell) {
    if (cell.revealed || cell.flagged) {
        return;
    }

    cell.revealed = true;
    cell.el.classList.add("revealed");
    state.revealedCount += 1;

    if (cell.mine) {
        cell.el.textContent = "💣";
        cell.el.classList.add("mine");
        cell.el.classList.add("mine-hit");
        return;
    }

    if (cell.around > 0) {
        cell.el.textContent = String(cell.around);
        cell.el.dataset.num = String(cell.around);
    } else {
        cell.el.textContent = "";
    }
}

function floodReveal(row, col) {
    const queue = [[row, col]];
    let cursor = 0;

    while (cursor < queue.length) {
        const [cr, cc] = queue[cursor];
        cursor += 1;
        const cell = state.cells[cr][cc];
        if (cell.revealed || cell.flagged) {
            continue;
        }

        revealCell(cell);

        if (cell.mine || cell.around !== 0) {
            continue;
        }

        for (const [nr, nc] of neighbors(cr, cc, state.rows, state.cols)) {
            const next = state.cells[nr][nc];
            if (!next.revealed && !next.flagged) {
                queue.push([nr, nc]);
            }
        }
    }
}

function revealAllMines() {
    for (let r = 0; r < state.rows; r += 1) {
        for (let c = 0; c < state.cols; c += 1) {
            const cell = state.cells[r][c];
            if (cell.mine && !cell.revealed) {
                cell.revealed = true;
                cell.el.classList.add("revealed");
                cell.el.classList.add("mine");
                cell.el.textContent = "💣";
            }
        }
    }
}

function checkWin() {
    const safeCount = state.rows * state.cols - state.mines;
    if (state.revealedCount === safeCount) {
        state.ended = true;
        stopTimer();
        setStatus(`通关成功！总用时 ${state.seconds} 秒。`);
    }
}

function handleLeftClick(row, col) {
    if (state.ended) {
        return;
    }

    const cell = state.cells[row][col];
    if (cell.revealed || cell.flagged) {
        return;
    }

    if (!state.started) {
        placeMines(row, col);
        startTimerIfNeeded();
        setStatus("游戏进行中，注意观察数字提示。");
    }

    if (cell.mine) {
        revealCell(cell);
        revealAllMines();
        state.ended = true;
        stopTimer();
        setStatus("踩雷了，游戏结束。点击重新开始再来一局。");
        return;
    }

    floodReveal(row, col);
    checkWin();
}

function handleRightClick(row, col) {
    if (state.ended) {
        return;
    }

    const cell = state.cells[row][col];
    if (cell.revealed) {
        return;
    }

    cell.flagged = !cell.flagged;
    cell.el.classList.toggle("flagged", cell.flagged);
    cell.el.textContent = cell.flagged ? "🚩" : "";
    state.flags += cell.flagged ? 1 : -1;
    updateHud();
}

function bindBoardEvents() {
    let longPressTimer = null;
    let longPressTarget = null;
    let longPressStartX = 0;
    let longPressStartY = 0;
    let suppressNextTap = false;

    function clearLongPress() {
        if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressTarget = null;
    }

    boardEl.addEventListener("click", (event) => {
        if (enableMobileLongPressFlag && suppressNextTap) {
            suppressNextTap = false;
            return;
        }
        const target = event.target.closest(".cell");
        if (!target) {
            return;
        }
        const row = Number(target.dataset.row);
        const col = Number(target.dataset.col);
        handleLeftClick(row, col);
    });

    boardEl.addEventListener("contextmenu", (event) => {
        const target = event.target.closest(".cell");
        if (!target) {
            return;
        }
        event.preventDefault();

        // On mobile we use long-press to place flags, and avoid duplicate toggles from context menu.
        if (enableMobileLongPressFlag) {
            return;
        }

        const row = Number(target.dataset.row);
        const col = Number(target.dataset.col);
        handleRightClick(row, col);
    });

    if (!enableMobileLongPressFlag) {
        return;
    }

    boardEl.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") {
            return;
        }
        const target = event.target.closest(".cell");
        if (!target) {
            return;
        }

        const row = Number(target.dataset.row);
        const col = Number(target.dataset.col);
        const cell = state && state.cells[row] ? state.cells[row][col] : null;
        if (!cell || cell.revealed || state.ended) {
            return;
        }

        clearLongPress();
        longPressTarget = target;
        longPressStartX = event.clientX;
        longPressStartY = event.clientY;

        longPressTimer = window.setTimeout(() => {
            if (!longPressTarget) {
                return;
            }
            handleRightClick(row, col);
            suppressNextTap = true;
            clearLongPress();
        }, MOBILE_LONG_PRESS_MS);
    }, { passive: true });

    boardEl.addEventListener("pointermove", (event) => {
        if (!longPressTarget || event.pointerType !== "touch") {
            return;
        }
        const dx = event.clientX - longPressStartX;
        const dy = event.clientY - longPressStartY;
        if (Math.hypot(dx, dy) > 10) {
            clearLongPress();
        }
    }, { passive: true });

    boardEl.addEventListener("pointerup", clearLongPress, { passive: true });
    boardEl.addEventListener("pointercancel", clearLongPress, { passive: true });
}

restartButton.addEventListener("click", () => {
    buildBoard(difficultySelect.value);
});

difficultySelect.addEventListener("change", () => {
    buildBoard(difficultySelect.value);
});

window.addEventListener("resize", updateBoardSizing, { passive: true });

bindBoardEvents();
buildBoard(difficultySelect.value);
