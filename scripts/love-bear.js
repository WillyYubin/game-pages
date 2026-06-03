const sweetButton = document.getElementById("sweetButton");
const sweetMeter = document.getElementById("sweetMeter");
const sweetValue = document.getElementById("sweetValue");
const heartLayer = document.getElementById("heartLayer");
const loveFx = document.getElementById("loveFx");
const winnieBear = document.getElementById("winnieBear");
const loveTextLayer = document.getElementById("loveTextLayer");

const ctx = loveFx.getContext("2d");
let sweet = 52;
let width = 0;
let height = 0;
let dpr = 1;
const floatingHearts = [];
const burstHearts = [];
let bearDrag = null;

function setCanvasSize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    loveFx.width = Math.floor(width * dpr);
    loveFx.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function addFloatingHeart(initial = false) {
    floatingHearts.push({
        x: random(0, width),
        y: initial ? random(0, height) : height + random(10, 90),
        size: random(8, 20),
        speed: random(0.35, 1.2),
        drift: random(-0.35, 0.35),
        alpha: random(0.2, 0.75),
        hue: random(330, 20),
        wobble: random(0, Math.PI * 2),
        wobbleSpeed: random(0.008, 0.022)
    });
}

function createBurst(cx, cy, count = 24) {
    for (let i = 0; i < count; i += 1) {
        const angle = random(0, Math.PI * 2);
        const speed = random(1.8, 4.6);
        burstHearts.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.2,
            size: random(6, 14),
            life: random(34, 56),
            age: 0,
            hue: random(340, 20)
        });
    }
}

function heartPoint(t) {
    return {
        x: 16 * Math.pow(Math.sin(t), 3),
        y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    };
}

function drawHeartShape(x, y, size, color, alpha = 1, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(size / 18, size / 18);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= 100; i += 1) {
        const t = (i / 100) * Math.PI * 2;
        const p = heartPoint(t);
        if (i === 0) {
            ctx.moveTo(p.x, p.y);
        } else {
            ctx.lineTo(p.x, p.y);
        }
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawMainPulseHeart(time) {
    const cx = width * 0.5;
    const cy = Math.min(height * 0.34, 260);
    const pulse = 1 + Math.sin(time * 0.0022) * 0.08;

    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 180);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 180 * pulse, 0, Math.PI * 2);
    ctx.fill();

    drawHeartShape(cx, cy, 88 * pulse, "rgba(255, 93, 126, 0.20)", 0.95);
    drawHeartShape(cx, cy, 58 * pulse, "rgba(255, 168, 187, 0.30)", 0.9);
}

function drawOrbitDots(time) {
    const cx = width * 0.5;
    const cy = Math.min(height * 0.34, 260);
    const scale = 7.4 + Math.sin(time * 0.0017) * 0.45;
    const count = 30;

    for (let i = 0; i < count; i += 1) {
        const t = ((i / count) * Math.PI * 2 + time * 0.0012) % (Math.PI * 2);
        const p = heartPoint(t);
        const x = cx + p.x * scale;
        const y = cy + p.y * scale;
        const alpha = 0.35 + Math.sin(time * 0.002 + i) * 0.2;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.16, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function updateFloatingHearts() {
    if (floatingHearts.length < 34 && Math.random() < 0.38) {
        addFloatingHeart(false);
    }

    for (const heart of floatingHearts) {
        heart.y -= heart.speed;
        heart.x += Math.sin(heart.wobble) * 0.5 + heart.drift;
        heart.wobble += heart.wobbleSpeed;
        const color = `hsla(${heart.hue}, 92%, 72%, 1)`;
        drawHeartShape(heart.x, heart.y, heart.size, color, heart.alpha, Math.sin(heart.wobble) * 0.08);
    }

    for (let i = floatingHearts.length - 1; i >= 0; i -= 1) {
        if (floatingHearts[i].y < -40) {
            floatingHearts.splice(i, 1);
        }
    }
}

function updateBurstHearts() {
    for (const heart of burstHearts) {
        heart.age += 1;
        heart.x += heart.vx;
        heart.y += heart.vy;
        heart.vy += 0.03;
        const lifeRatio = Math.max(0, 1 - heart.age / heart.life);
        const color = `hsla(${heart.hue}, 96%, 68%, 1)`;
        drawHeartShape(heart.x, heart.y, heart.size * (0.6 + lifeRatio), color, lifeRatio);
    }

    for (let i = burstHearts.length - 1; i >= 0; i -= 1) {
        if (burstHearts[i].age >= burstHearts[i].life) {
            burstHearts.splice(i, 1);
        }
    }
}

function render(time) {
    ctx.clearRect(0, 0, width, height);
    drawMainPulseHeart(time);
    drawOrbitDots(time);
    updateFloatingHearts();
    updateBurstHearts();
    requestAnimationFrame(render);
}

function spawnDomHeart() {
    const heart = document.createElement("span");
    heart.className = "pop-heart";
    heart.textContent = Math.random() > 0.5 ? "❤" : "💕";
    const left = 24 + Math.random() * 52;
    heart.style.left = `${left}%`;
    heart.style.bottom = `${18 + Math.random() * 20}%`;
    heartLayer.appendChild(heart);
    setTimeout(() => heart.remove(), 1300);
}

function refreshSweet() {
    sweetMeter.style.width = `${sweet}%`;
    sweetValue.textContent = `${sweet}%`;
}

function showBearLoveText() {
    if (!winnieBear || !loveTextLayer) {
        return;
    }

    const rect = winnieBear.getBoundingClientRect();
    const text = document.createElement("span");
    text.className = "love-pop-text";
    text.textContent = "爱你彬彬";
    text.style.left = `${rect.left + rect.width / 2 + random(-10, 10)}px`;
    text.style.top = `${rect.top - 12}px`;
    loveTextLayer.appendChild(text);
    setTimeout(() => text.remove(), 1300);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setBearPosition(left, top) {
    if (!winnieBear) {
        return;
    }

    const maxLeft = Math.max(0, window.innerWidth - winnieBear.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - winnieBear.offsetHeight);
    winnieBear.style.left = `${clamp(left, 0, maxLeft)}px`;
    winnieBear.style.top = `${clamp(top, 0, maxTop)}px`;
}

function initBearPosition() {
    if (!winnieBear) {
        return;
    }

    const left = window.innerWidth * 0.78;
    const top = window.innerHeight * 0.64;
    setBearPosition(left, top);
}

function onBearPointerDown(event) {
    if (!winnieBear) {
        return;
    }

    const rect = winnieBear.getBoundingClientRect();
    bearDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: rect.left,
        originTop: rect.top,
        moved: false
    };
    winnieBear.classList.add("dragging");
    winnieBear.setPointerCapture(event.pointerId);
}

function onBearPointerMove(event) {
    if (!winnieBear || !bearDrag || event.pointerId !== bearDrag.pointerId) {
        return;
    }

    const dx = event.clientX - bearDrag.startX;
    const dy = event.clientY - bearDrag.startY;
    if (Math.hypot(dx, dy) > 6) {
        bearDrag.moved = true;
    }
    setBearPosition(bearDrag.originLeft + dx, bearDrag.originTop + dy);
}

function onBearPointerUp(event) {
    if (!winnieBear || !bearDrag || event.pointerId !== bearDrag.pointerId) {
        return;
    }

    winnieBear.classList.remove("dragging");
    winnieBear.releasePointerCapture(event.pointerId);
    const moved = bearDrag.moved;
    bearDrag = null;

    if (!moved) {
        showBearLoveText();
    }
}

function onBearKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showBearLoveText();
    }
}

sweetButton.addEventListener("click", () => {
    sweet = Math.min(100, sweet + 6);
    refreshSweet();

    const cx = width * 0.5;
    const cy = Math.min(height * 0.34, 260);
    createBurst(cx, cy, 30);

    for (let i = 0; i < 6; i += 1) {
        setTimeout(spawnDomHeart, i * 70);
    }
});

if (winnieBear) {
    winnieBear.addEventListener("pointerdown", onBearPointerDown);
    winnieBear.addEventListener("pointermove", onBearPointerMove);
    winnieBear.addEventListener("pointerup", onBearPointerUp);
    winnieBear.addEventListener("pointercancel", onBearPointerUp);
    winnieBear.addEventListener("keydown", onBearKeyDown);
}

window.addEventListener("resize", () => {
    setCanvasSize();
    initBearPosition();
});

setCanvasSize();
initBearPosition();
for (let i = 0; i < 24; i += 1) {
    addFloatingHeart(true);
}
createBurst(width * 0.5, Math.min(height * 0.34, 260), 20);
refreshSweet();
requestAnimationFrame(render);
