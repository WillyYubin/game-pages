/* yubin@copyright.com */
const boardEl = document.getElementById("board");
const foundationZoneEl = document.querySelector(".foundation-zone");
const spiderToolbarEl = document.querySelector(".spider-toolbar");
const spiderTopEl = document.querySelector(".spider-top");
const foundationEl = document.getElementById("foundation");
const stockButton = document.getElementById("stockButton");
const stockRoundsEl = document.getElementById("stockRounds");
const statusText = document.getElementById("statusText");
const moveCountEl = document.getElementById("moveCount");
const timerTextEl = document.getElementById("timerText");
const doneCountEl = document.getElementById("doneCount");
const scoreTextEl = document.getElementById("scoreText");
const difficultySelect = document.getElementById("difficultySelect");
const hintButton = document.getElementById("hintButton");
const undoButton = document.getElementById("undoButton");
const redealButton = document.getElementById("redealButton");
const newGameButton = document.getElementById("newGameButton");

const SUIT_SYMBOL = {
    S: "♠",
    H: "♥",
    C: "♣",
    D: "♦"
};

const SUIT_IMAGE_KEY = {
    S: "c",
    H: "d",
    C: "b",
    D: "a"
};

const RANK_LABEL = {
    13: "K",
    12: "Q",
    11: "J",
    10: "10",
    9: "9",
    8: "8",
    7: "7",
    6: "6",
    5: "5",
    4: "4",
    3: "3",
    2: "2",
    1: "A"
};

const TABLEAU_COLS = 10;
const UNDO_LIMIT = 80;

let game = null;
let timerId = null;

const DRAG_THRESHOLD = 4;

const scrollState = {
    dragging: false,
    pointerId: null,
    lastClientY: 0,
    captureEl: null
};

const dragRenderState = {
    rafId: 0,
    x: 0,
    y: 0,
    layer: null
};

const interactionState = {
    mode: "idle"
};

function setInteractionMode(mode) {
    interactionState.mode = mode;
    document.body.classList.toggle("spider-dragging-card", mode === "card");
    document.body.classList.toggle("spider-dragging-rail", mode === "rail");
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setupFoundationDragScroll() {
    if (!foundationZoneEl || !spiderToolbarEl || !spiderTopEl) {
        return;
    }
    document.body.classList.add("spider-scroll-lock");

    const isScrollDragTarget = (target) => {
        if (!target) {
            return false;
        }
        const inAllowedZone = !!target.closest(".spider-toolbar, .spider-top, .foundation-zone");
        if (!inAllowedZone) {
            return false;
        }

        const inBlockedControl = !!target.closest("button, select, input, label, a, .actions, .stats, .stock, .done-pile");
        if (inBlockedControl) {
            return false;
        }

        return true;
    };

    const startDrag = (event, captureEl) => {
        scrollState.dragging = true;
        scrollState.pointerId = typeof event.pointerId === "number" ? event.pointerId : null;
        scrollState.lastClientY = event.clientY;
        scrollState.captureEl = captureEl;
        setInteractionMode("rail");
        if (captureEl && typeof captureEl.setPointerCapture === "function" && scrollState.pointerId !== null) {
            captureEl.setPointerCapture(scrollState.pointerId);
        }
    };

    document.addEventListener("pointerdown", (event) => {
        if (interactionState.mode === "card" || (game && game.drag)) {
            return;
        }
        if (!isScrollDragTarget(event.target)) {
            return;
        }
        event.preventDefault();
        const captureEl = event.target.closest(".spider-toolbar, .spider-top, .foundation-zone");
        startDrag(event, captureEl);
    });

    window.addEventListener("pointermove", (event) => {
        if (!scrollState.dragging) {
            return;
        }
        if (scrollState.pointerId !== null && typeof event.pointerId === "number" && event.pointerId !== scrollState.pointerId) {
            return;
        }
        event.preventDefault();

        const deltaY = event.clientY - scrollState.lastClientY;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const nextY = clamp(window.scrollY - deltaY, 0, maxScroll);
        window.scrollTo({ top: nextY, behavior: "auto" });
        scrollState.lastClientY = event.clientY;
    }, { passive: false });

    const stopDrag = () => {
        if (scrollState.pointerId !== null && scrollState.captureEl && typeof scrollState.captureEl.releasePointerCapture === "function") {
            try {
                scrollState.captureEl.releasePointerCapture(scrollState.pointerId);
            } catch (err) {
                // Ignore if already released.
            }
        }
        scrollState.dragging = false;
        scrollState.pointerId = null;
        scrollState.lastClientY = 0;
        scrollState.captureEl = null;
        if (!(game && game.drag)) {
            setInteractionMode("idle");
        }
    };

    window.addEventListener("pointerup", stopDrag, { passive: true });
    window.addEventListener("pointercancel", stopDrag, { passive: true });

    document.addEventListener("wheel", (event) => {
        if (scrollState.dragging) {
            return;
        }
        if (isScrollDragTarget(event.target)) {
            event.preventDefault();
            const delta = event.deltaY;
            const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: clamp(window.scrollY + delta, 0, maxScroll), behavior: "auto" });
            return;
        }
        event.preventDefault();
    }, { passive: false });
}

function flushDragFrame() {
    dragRenderState.rafId = 0;
    if (!dragRenderState.layer) {
        return;
    }
    dragRenderState.layer.style.transform = `translate3d(${dragRenderState.x}px, ${dragRenderState.y}px, 0)`;
}

function queueDragFrame(layer, x, y) {
    dragRenderState.layer = layer;
    dragRenderState.x = x;
    dragRenderState.y = y;
    if (dragRenderState.rafId) {
        return;
    }
    dragRenderState.rafId = window.requestAnimationFrame(flushDragFrame);
}

function readCssNumber(name, fallback) {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name);
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
}

function getStackOffset(card) {
    return card.faceUp ? readCssNumber("--stack-gap-faceup", 26) : readCssNumber("--stack-gap-facedown", 14);
}

function seededRng(seed) {
    let x = seed >>> 0;
    return () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return ((x >>> 0) % 100000) / 100000;
    };
}

function deepCloneState(state) {
    return {
        columns: state.columns.map((col) => col.map((card) => ({ ...card }))),
        stock: state.stock.map((card) => ({ ...card })),
        donePiles: state.donePiles.map((item) => ({ ...item })),
        moves: state.moves,
        score: state.score,
        started: state.started,
        seconds: state.seconds,
        difficulty: state.difficulty,
        seed: state.seed
    };
}

function getSuitPool(difficulty) {
    if (difficulty === 1) {
        return ["S"];
    }
    if (difficulty === 2) {
        return ["S", "H"];
    }
    return ["S", "H", "C", "D"];
}

function buildDeck(difficulty) {
    const suitPool = getSuitPool(difficulty);
    const deck = [];
    let id = 1;
    const repeat = Math.floor(8 / suitPool.length);
    for (let r = 0; r < repeat; r += 1) {
        for (const suit of suitPool) {
            for (let rank = 13; rank >= 1; rank -= 1) {
                deck.push({ id: id++, suit, rank, faceUp: false });
            }
        }
    }
    return deck;
}

function shuffleWithSeed(cards, seed) {
    const list = cards.slice();
    const rnd = seededRng(seed);
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        const temp = list[i];
        list[i] = list[j];
        list[j] = temp;
    }
    return list;
}

function pushUndoSnapshot() {
    if (!game) {
        return;
    }
    game.undoStack.push(deepCloneState(game.state));
    if (game.undoStack.length > UNDO_LIMIT) {
        game.undoStack.shift();
    }
}

function setStatus(text) {
    statusText.textContent = text;
}

function stopTimer() {
    if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
    }
}

function startTimerIfNeeded() {
    if (!game || game.state.started) {
        return;
    }
    game.state.started = true;
    timerId = window.setInterval(() => {
        game.state.seconds += 1;
        updateHud();
    }, 1000);
}

function initGame({ difficulty, seed }) {
    stopTimer();
    const deck = shuffleWithSeed(buildDeck(difficulty), seed);
    const columns = Array.from({ length: TABLEAU_COLS }, () => []);

    for (let c = 0; c < TABLEAU_COLS; c += 1) {
        const count = c < 4 ? 6 : 5;
        for (let i = 0; i < count; i += 1) {
            const card = deck.pop();
            card.faceUp = i === count - 1;
            columns[c].push(card);
        }
    }

    const stock = deck.map((card) => ({ ...card, faceUp: false }));

    game = {
        state: {
            columns,
            stock,
            donePiles: [],
            moves: 0,
            score: 500,
            started: false,
            seconds: 0,
            difficulty,
            seed
        },
        undoStack: [],
        selected: null,
        hintTimer: null,
        drag: null,
        suppressClick: false,
        collectedPulse: false
    };

    setStatus("准备开始，拖拽或点击移动卡牌。");
    render();
}

function getCardValueText(card) {
    return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

function createFaceArtSvg(rank, suit) {
        const tone = suit === "H" || suit === "D" ? "#b52d38" : "#1e2a35";
        const accent = suit === "H" || suit === "D" ? "#f2d3a9" : "#c9d8e6";
    const role = rank === 13 ? "K" : rank === 12 ? "Q" : "J";
        const symbol = SUIT_SYMBOL[suit];

    let ornament = "";
    if (role === "K") {
                ornament = '<polygon points="30,18 44,6 58,18" fill="#f1c44f"/><rect x="29" y="18" width="30" height="4" rx="2" fill="#f1c44f"/>';
    } else if (role === "Q") {
                ornament = '<path d="M28 19 Q44 7 60 19" fill="none" stroke="#f1c44f" stroke-width="3" stroke-linecap="round"/>';
    } else {
                ornament = '<path d="M27 20 L61 20 L53 28 L35 28 Z" fill="#f1c44f"/>';
    }

    const svg = `
<svg class="face-art" viewBox="0 0 88 118" aria-hidden="true">
    <rect x="8" y="8" width="72" height="102" rx="9" fill="#fffdf7" stroke="#d8d8d8" stroke-width="1"/>
    <line x1="10" y1="59" x2="78" y2="59" stroke="#ddd" stroke-width="1"/>
    <g>
        <rect x="16" y="14" width="56" height="42" rx="8" fill="${accent}" opacity="0.42"/>
        <circle cx="44" cy="30" r="10" fill="#f3d5b2" stroke="${tone}" stroke-width="1.8"/>
        <path d="M28 52 Q44 34 60 52 L60 56 L28 56 Z" fill="${tone}" opacity="0.9"/>
        <circle cx="40" cy="29" r="1.3" fill="#25313a"/>
        <circle cx="48" cy="29" r="1.3" fill="#25313a"/>
        <path d="M41 34 Q44 37 47 34" fill="none" stroke="#25313a" stroke-width="1.2" stroke-linecap="round"/>
        ${ornament}
        <text x="44" y="51" text-anchor="middle" font-size="16" font-weight="700" fill="${tone}">${symbol}</text>
        <text x="44" y="56" text-anchor="middle" font-size="11" font-weight="700" fill="${tone}">${role}</text>
    </g>
    <g transform="translate(88 118) rotate(180)">
        <rect x="16" y="14" width="56" height="42" rx="8" fill="${accent}" opacity="0.42"/>
        <circle cx="44" cy="30" r="10" fill="#f3d5b2" stroke="${tone}" stroke-width="1.8"/>
        <path d="M28 52 Q44 34 60 52 L60 56 L28 56 Z" fill="${tone}" opacity="0.9"/>
        <circle cx="40" cy="29" r="1.3" fill="#25313a"/>
        <circle cx="48" cy="29" r="1.3" fill="#25313a"/>
        <path d="M41 34 Q44 37 47 34" fill="none" stroke="#25313a" stroke-width="1.2" stroke-linecap="round"/>
        ${ornament}
        <text x="44" y="51" text-anchor="middle" font-size="16" font-weight="700" fill="${tone}">${symbol}</text>
        <text x="44" y="56" text-anchor="middle" font-size="11" font-weight="700" fill="${tone}">${role}</text>
    </g>
</svg>`;

    const wrap = document.createElement("div");
    wrap.innerHTML = svg.trim();
    return wrap.firstChild;
}

function createCornerEl(rankText, suitText, bottom = false) {
    const corner = document.createElement("div");
    corner.className = `corner ${bottom ? "corner-bottom" : "corner-top"}`;
    const rank = document.createElement("span");
    rank.className = "corner-rank";
    rank.textContent = rankText;
    const suit = document.createElement("span");
    suit.className = "corner-suit";
    suit.textContent = suitText;
    corner.appendChild(rank);
    corner.appendChild(suit);
    return corner;
}

function getPipLayout(rank) {
    const layouts = {
        1: ["c"],
        2: ["t", "b"],
        3: ["t", "c", "b"],
        4: ["tl", "tr", "bl", "br"],
        5: ["tl", "tr", "c", "bl", "br"],
        6: ["tl", "tr", "ml", "mr", "bl", "br"],
        7: ["tl", "tr", "ml", "mr", "c", "bl", "br"],
        8: ["tl", "tr", "ml", "mr", "cl", "cr", "bl", "br"],
        9: ["tl", "tr", "ml", "mr", "cl", "c", "cr", "bl", "br"],
        10: ["tl", "tr", "ml", "mr", "cl", "cr", "bl", "br", "t", "b"]
    };
    return layouts[rank] || ["c"];
}

function createPipsEl(rank, suit) {
    const pipWrap = document.createElement("div");
    pipWrap.className = "pips";
    getPipLayout(rank).forEach((slot) => {
        const pip = document.createElement("span");
        pip.className = `pip pip-${slot}`;
        pip.textContent = SUIT_SYMBOL[suit];
        pipWrap.appendChild(pip);
    });
    return pipWrap;
}

function createCardEl(card, colIndex, cardIndex) {
    const cardEl = document.createElement("div");
    cardEl.className = `card${card.faceUp ? "" : " face-down"}`;
    cardEl.dataset.col = String(colIndex);
    cardEl.dataset.index = String(cardIndex);
    cardEl.dataset.cardId = String(card.id);

    const art = document.createElement("img");
    art.className = "card-art";
    art.alt = card.faceUp ? getCardValueText(card) : "牌背";
    if (card.faceUp) {
        const suitKey = SUIT_IMAGE_KEY[card.suit] || "a";
        art.src = `../images/spider-cards/${suitKey}-${card.rank}.png`;
    } else {
        art.src = "../images/spider-cards/f-1.png";
    }
    cardEl.appendChild(art);

    return cardEl;
}

function renderFoundation() {
    foundationEl.innerHTML = "";
    for (let i = 0; i < game.state.donePiles.length; i += 1) {
        const pile = document.createElement("div");
        pile.className = "done-pile";
        if (game.collectedPulse && i === game.state.donePiles.length - 1) {
            pile.classList.add("done-pop");
        }
        foundationEl.appendChild(pile);
    }
}

function renderBoard() {
    boardEl.innerHTML = "";
    game.state.columns.forEach((column, colIndex) => {
        const colEl = document.createElement("div");
        colEl.className = "column";
        colEl.dataset.col = String(colIndex);

        let top = 0;
        column.forEach((card, cardIndex) => {
            const cardEl = createCardEl(card, colIndex, cardIndex);
            cardEl.style.top = `${top}px`;
            top += getStackOffset(card);
            colEl.appendChild(cardEl);
        });

        boardEl.appendChild(colEl);
    });
}

function updateHud() {
    moveCountEl.textContent = String(game.state.moves);
    timerTextEl.textContent = `${game.state.seconds}s`;
    doneCountEl.textContent = `${game.state.donePiles.length}/8`;
    scoreTextEl.textContent = String(game.state.score);
    const rounds = Math.floor(game.state.stock.length / 10);
    stockRoundsEl.textContent = String(rounds);
    stockButton.classList.toggle("empty", rounds === 0);
    undoButton.disabled = game.undoStack.length === 0;
}

function render() {
    renderBoard();
    renderFoundation();
    updateHud();
    applySelectionStyle();
    game.collectedPulse = false;
}

function isMovableStart(colIndex, index) {
    const column = game.state.columns[colIndex];
    const card = column[index];
    if (!card || !card.faceUp) {
        return false;
    }
    for (let i = index; i < column.length - 1; i += 1) {
        const current = column[i];
        const next = column[i + 1];
        if (!next.faceUp) {
            return false;
        }
        if (!(current.rank === next.rank + 1 && current.suit === next.suit)) {
            return false;
        }
    }
    return true;
}

function canDropSequence(cards, toCol) {
    const targetCol = game.state.columns[toCol];
    if (targetCol.length === 0) {
        return true;
    }
    const target = targetCol[targetCol.length - 1];
    if (!target.faceUp) {
        return false;
    }
    return target.rank === cards[0].rank + 1 && target.suit === cards[0].suit;
}

function revealTopIfNeeded(colIndex) {
    const col = game.state.columns[colIndex];
    if (col.length === 0) {
        return;
    }
    const top = col[col.length - 1];
    if (!top.faceUp) {
        top.faceUp = true;
        game.state.score += 5;
    }
}

function checkCollectRun(colIndex) {
    const col = game.state.columns[colIndex];
    if (col.length < 13) {
        return false;
    }
    const slice = col.slice(col.length - 13);
    if (!slice.every((card) => card.faceUp)) {
        return false;
    }
    const suit = slice[0].suit;
    for (let i = 0; i < slice.length - 1; i += 1) {
        const a = slice[i];
        const b = slice[i + 1];
        if (a.suit !== suit || b.suit !== suit || a.rank !== b.rank + 1) {
            return false;
        }
    }
    if (slice[0].rank !== 13 || slice[12].rank !== 1) {
        return false;
    }

    col.splice(col.length - 13, 13);
    game.state.donePiles.push({ suit });
    game.state.score += 100;
    revealTopIfNeeded(colIndex);
    return true;
}

function runAutoCollect() {
    let collected = false;
    for (let i = 0; i < TABLEAU_COLS; i += 1) {
        const hit = checkCollectRun(i);
        if (hit) {
            collected = true;
        }
    }
    game.collectedPulse = collected;
    if (game.state.donePiles.length === 8) {
        stopTimer();
        setStatus(`恭喜通关！总用时 ${game.state.seconds} 秒。`);
    } else if (collected) {
        setStatus("已自动收走一组同花顺序列。继续加油！");
    }
}

function clearSelection() {
    game.selected = null;
    applySelectionStyle();
}

function applySelectionStyle() {
    const selected = game.selected;
    boardEl.querySelectorAll(".card.selected").forEach((el) => el.classList.remove("selected"));
    if (!selected) {
        return;
    }
    const cards = boardEl.querySelectorAll(`.card[data-col=\"${selected.col}\"]`);
    cards.forEach((el) => {
        if (Number(el.dataset.index) >= selected.index) {
            el.classList.add("selected");
        }
    });
}

function consumeMovePenalty() {
    game.state.moves += 1;
    game.state.score = Math.max(0, game.state.score - 1);
}

function moveSequence(fromCol, fromIndex, toCol) {
    const from = game.state.columns[fromCol];
    const moving = from.slice(fromIndex);
    if (!canDropSequence(moving, toCol)) {
        return false;
    }

    pushUndoSnapshot();
    startTimerIfNeeded();

    game.state.columns[fromCol] = from.slice(0, fromIndex);
    game.state.columns[toCol] = game.state.columns[toCol].concat(moving);
    revealTopIfNeeded(fromCol);

    consumeMovePenalty();
    runAutoCollect();
    clearSelection();
    render();
    evaluateNoMoveState();
    return true;
}

function attemptSelectOrMove(col, index) {
    if (!isMovableStart(col, index)) {
        setStatus("只能移动同花递减的明牌序列。");
        return;
    }
    if (!game.selected) {
        game.selected = { col, index };
        applySelectionStyle();
        setStatus(`已选择 ${getCardValueText(game.state.columns[col][index])} 开头的序列。`);
        return;
    }

    const from = game.selected;
    if (from.col === col && from.index === index) {
        clearSelection();
        setStatus("已取消选择。");
        return;
    }

    const ok = moveSequence(from.col, from.index, col);
    if (!ok) {
        game.selected = { col, index };
        applySelectionStyle();
        setStatus("该位置不可放置，已切换选择。");
    }
}

function allColumnsHaveCards() {
    return game.state.columns.every((col) => col.length > 0);
}

function dealFromStock() {
    if (game.state.stock.length < 10) {
        setStatus("没有可发的牌了。");
        return;
    }
    if (!allColumnsHaveCards()) {
        setStatus("存在空列时不能发牌。");
        return;
    }

    pushUndoSnapshot();
    startTimerIfNeeded();
    for (let c = 0; c < TABLEAU_COLS; c += 1) {
        const card = game.state.stock.pop();
        card.faceUp = true;
        game.state.columns[c].push(card);
    }
    consumeMovePenalty();
    clearSelection();
    runAutoCollect();
    render();
    boardEl.querySelectorAll(".column .card:last-child").forEach((el) => {
        el.classList.add("deal-pop");
        window.setTimeout(() => el.classList.remove("deal-pop"), 190);
    });
    setStatus("已发一轮新牌。");
    evaluateNoMoveState();
}

function collectPossibleMoves() {
    const list = [];
    for (let c = 0; c < TABLEAU_COLS; c += 1) {
        const col = game.state.columns[c];
        for (let i = 0; i < col.length; i += 1) {
            if (!isMovableStart(c, i)) {
                continue;
            }
            const moving = col.slice(i);
            for (let t = 0; t < TABLEAU_COLS; t += 1) {
                if (t === c) {
                    continue;
                }
                if (canDropSequence(moving, t)) {
                    list.push({ fromCol: c, fromIndex: i, toCol: t });
                }
            }
        }
    }
    return list;
}

function showHint() {
    const moves = collectPossibleMoves();
    if (moves.length === 0) {
        setStatus("暂无可移动操作，可以尝试发牌。");
        return;
    }
    const move = moves[0];
    setStatus(`可尝试：第${move.fromCol + 1}列 移到 第${move.toCol + 1}列。`);
}

function evaluateNoMoveState() {
    if (game.state.donePiles.length === 8) {
        return;
    }
    const hasMove = collectPossibleMoves().length > 0;
    const hasStock = game.state.stock.length >= 10;
    if (!hasMove && !hasStock) {
        setStatus("当前无可移动操作，且没有可发牌轮次。可点击重开或重新开始。");
    }
}

function undo() {
    if (!game.undoStack.length) {
        setStatus("没有可撤销的操作。");
        return;
    }
    game.state = game.undoStack.pop();
    clearSelection();
    render();
    setStatus("已撤销一步。");
    evaluateNoMoveState();
}

function getPointer(e) {
    if (e.touches && e.touches[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function createDragLayer(fromCol, fromIndex) {
    const movingEls = Array.from(boardEl.querySelectorAll(`.card[data-col=\"${fromCol}\"]`)).filter((el) => Number(el.dataset.index) >= fromIndex);
    if (movingEls.length === 0) {
        return null;
    }

    const firstRect = movingEls[0].getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "drag-layer";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.transform = `translate3d(${firstRect.left}px, ${firstRect.top}px, 0)`;

    movingEls.forEach((el) => {
        const clone = el.cloneNode(true);
        const r = el.getBoundingClientRect();
        clone.style.left = `${r.left - firstRect.left}px`;
        clone.style.top = `${r.top - firstRect.top}px`;
        layer.appendChild(clone);
    });

    document.body.appendChild(layer);
    return { layer, offsetX: 0, offsetY: 0 };
}

function setSourceCardsDragging(fromCol, fromIndex, hidden) {
    const sourceCards = Array.from(boardEl.querySelectorAll(`.card[data-col="${fromCol}"]`)).filter((el) => Number(el.dataset.index) >= fromIndex);
    sourceCards.forEach((el) => {
        el.classList.toggle("source-hidden", hidden);
    });
}

function columnFromPoint(x, y) {
    const cols = Array.from(boardEl.querySelectorAll(".column"));
    for (const colEl of cols) {
        const rect = colEl.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return Number(colEl.dataset.col);
        }
    }
    return null;
}

function onPointerDown(event) {
    if (interactionState.mode === "rail" || scrollState.dragging) {
        return;
    }
    if (typeof event.button === "number" && event.button !== 0) {
        return;
    }
    const cardEl = event.target.closest(".card");
    if (!cardEl || cardEl.classList.contains("face-down")) {
        return;
    }
    const col = Number(cardEl.dataset.col);
    const index = Number(cardEl.dataset.index);
    if (!isMovableStart(col, index)) {
        return;
    }

    const pointer = getPointer(event);
    if (event.cancelable) {
        event.preventDefault();
    }
    if (typeof cardEl.setPointerCapture === "function" && typeof event.pointerId === "number") {
        cardEl.setPointerCapture(event.pointerId);
    }

    game.drag = {
        fromCol: col,
        fromIndex: index,
        layer: null,
        startX: pointer.x,
        startY: pointer.y,
        offsetX: 0,
        offsetY: 0,
        moved: false,
        started: false,
        pointerId: typeof event.pointerId === "number" ? event.pointerId : null
    };
    setInteractionMode("card");
}

function onPointerMove(event) {
    if (!game.drag) {
        return;
    }
    if (interactionState.mode === "rail") {
        return;
    }
    if (game.drag.pointerId !== null && typeof event.pointerId === "number" && event.pointerId !== game.drag.pointerId) {
        return;
    }
    if (event.cancelable) {
        event.preventDefault();
    }

    const p = getPointer(event);
    if (!game.drag.started) {
        const distance = Math.hypot(p.x - game.drag.startX, p.y - game.drag.startY);
        if (distance < DRAG_THRESHOLD) {
            return;
        }
        const dragPack = createDragLayer(game.drag.fromCol, game.drag.fromIndex);
        if (!dragPack) {
            game.drag = null;
            setInteractionMode("idle");
            return;
        }
        const src = boardEl.querySelector(`.card[data-col="${game.drag.fromCol}"][data-index="${game.drag.fromIndex}"]`);
        if (!src) {
            dragPack.layer.remove();
            game.drag = null;
            setInteractionMode("idle");
            return;
        }
        const rect = src.getBoundingClientRect();
        game.drag.layer = dragPack.layer;
        game.drag.offsetX = p.x - rect.left;
        game.drag.offsetY = p.y - rect.top;
        game.drag.started = true;
        setSourceCardsDragging(game.drag.fromCol, game.drag.fromIndex, true);
    }

    queueDragFrame(game.drag.layer, p.x - game.drag.offsetX, p.y - game.drag.offsetY);
    game.drag.moved = true;
}

function onPointerUp(event) {
    if (!game.drag) {
        return;
    }
    if (game.drag.pointerId !== null && typeof event.pointerId === "number" && event.pointerId !== game.drag.pointerId) {
        return;
    }

    const suppressNextClick = () => {
        game.suppressClick = true;
        window.setTimeout(() => {
            if (game) {
                game.suppressClick = false;
            }
        }, 0);
    };

    const drag = game.drag;
    game.drag = null;

    const sourceCard = boardEl.querySelector(`.card[data-col="${drag.fromCol}"][data-index="${drag.fromIndex}"]`);
    if (sourceCard && typeof sourceCard.releasePointerCapture === "function" && drag.pointerId !== null) {
        try {
            sourceCard.releasePointerCapture(drag.pointerId);
        } catch (err) {
            // Ignore release errors when pointer capture has already been cleared.
        }
    }

    const restoreSource = () => {
        if (drag.started) {
            setSourceCardsDragging(drag.fromCol, drag.fromIndex, false);
        }
    };

    if (!drag.started) {
        setInteractionMode("idle");
        suppressNextClick();
        attemptSelectOrMove(drag.fromCol, drag.fromIndex);
        return;
    }

    const p = getPointer(event);
    const targetCol = columnFromPoint(p.x, p.y);
    if (dragRenderState.rafId) {
        window.cancelAnimationFrame(dragRenderState.rafId);
        dragRenderState.rafId = 0;
    }
    dragRenderState.layer = null;
    drag.layer.remove();
    restoreSource();

    if (targetCol === null) {
        setInteractionMode("idle");
        suppressNextClick();
        if (!drag.moved) {
            attemptSelectOrMove(drag.fromCol, drag.fromIndex);
        }
        return;
    }

    if (targetCol === drag.fromCol && !drag.moved) {
        setInteractionMode("idle");
        suppressNextClick();
        attemptSelectOrMove(drag.fromCol, drag.fromIndex);
        return;
    }

    const moved = moveSequence(drag.fromCol, drag.fromIndex, targetCol);
    if (!moved) {
        setStatus("该列无法接收此序列。");
    }
    setInteractionMode("idle");
    suppressNextClick();
}

boardEl.addEventListener("click", (event) => {
    if (game.suppressClick) {
        return;
    }
    const cardEl = event.target.closest(".card");
    const colEl = event.target.closest(".column");

    if (cardEl && !cardEl.classList.contains("face-down")) {
        const col = Number(cardEl.dataset.col);
        const index = Number(cardEl.dataset.index);
        attemptSelectOrMove(col, index);
        return;
    }

    if (game.selected && colEl) {
        const toCol = Number(colEl.dataset.col);
        const from = game.selected;
        const ok = moveSequence(from.col, from.index, toCol);
        if (!ok) {
            setStatus("该列无法接收已选择的序列。");
        }
        return;
    }

    clearSelection();
});

boardEl.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove, { passive: false });
window.addEventListener("pointerup", onPointerUp, { passive: true });
window.addEventListener("pointercancel", onPointerUp, { passive: true });
window.addEventListener("resize", () => {
    if (game) {
        render();
    }
}, { passive: true });

setupFoundationDragScroll();

stockButton.addEventListener("click", dealFromStock);
hintButton.addEventListener("click", showHint);
undoButton.addEventListener("click", undo);

redealButton.addEventListener("click", () => {
    if (!game) {
        return;
    }
    initGame({ difficulty: game.state.difficulty, seed: game.state.seed });
});

newGameButton.addEventListener("click", () => {
    const difficulty = Number(difficultySelect.value);
    initGame({ difficulty, seed: Date.now() & 0xffffffff });
});

difficultySelect.addEventListener("change", () => {
    const difficulty = Number(difficultySelect.value);
    initGame({ difficulty, seed: Date.now() & 0xffffffff });
});

window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
    }
    if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        showHint();
        return;
    }
    if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        dealFromStock();
    }
});

initGame({ difficulty: Number(difficultySelect.value), seed: Date.now() & 0xffffffff });
