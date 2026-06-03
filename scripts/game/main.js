const canvas = document.getElementById("gameCanvas");
        const ctx = canvas.getContext("2d");
        const castleHealthNode = document.getElementById("castleHealth");
        const killCountNode = document.getElementById("killCount");
        const waveNumberNode = document.getElementById("waveNumber");
        const gameOverOverlay = document.getElementById("gameOverOverlay");
        const gameOverText = document.getElementById("gameOverText");
        const restartButton = document.getElementById("restartButton");
        const restartOverlayButton = document.getElementById("restartOverlayButton");

        const world = {
            width: canvas.width,
            height: canvas.height,
            groundY: canvas.height - 92,
            castleX: 168,
            castleWidth: 130,
            castleHeight: 190,
            bridgeStartX: 360,
            bridgeEndX: 920,
            bridgeY: canvas.height - 210,
            waterTop: canvas.height - 126,
            waterBottom: canvas.height - 28
        };

        const state = {
            monsters: [],
            particles: [],
            draggingMonsterId: null,
            mouse: { x: 0, y: 0 },
            castleHealth: 100,
            kills: 0,
            wave: 1,
            spawnTimer: 0,
            spawnInterval: 1800,
            difficultyTimer: 0,
            lastTime: 0,
            gameOver: false,
            nextMonsterId: 1
        };

        const monsterArchetypes = [
            {
                key: "scout",
                name: "轻行怪",
                chance: 0.42,
                radiusRange: [24, 32],
                healthScale: 0.78,
                speedScale: 1.34,
                damageScale: 0.8,
                groundResist: 0.78,
                waterWeakness: 1.4,
                hueRange: [10, 36],
                bodyScaleY: 0.82,
                bridgeWeight: 0.65,
                bridgeBounce: 1.28,
                label: "轻"
            },
            {
                key: "brute",
                name: "重甲怪",
                chance: 0.33,
                radiusRange: [34, 46],
                healthScale: 1.52,
                speedScale: 0.82,
                damageScale: 1.45,
                groundResist: 1.4,
                waterWeakness: 0.86,
                hueRange: [2, 18],
                bodyScaleY: 0.97,
                bridgeWeight: 1.7,
                bridgeBounce: 0.8,
                label: "重"
            },
            {
                key: "spitter",
                name: "水惧怪",
                chance: 0.25,
                radiusRange: [26, 36],
                healthScale: 1,
                speedScale: 1.02,
                damageScale: 1,
                groundResist: 1,
                waterWeakness: 1.95,
                hueRange: [145, 182],
                bodyScaleY: 0.88,
                bridgeWeight: 1,
                bridgeBounce: 1.06,
                label: "惧水"
            }
        ];

        function pickMonsterArchetype() {
            const roll = Math.random();
            let cumulative = 0;
            for (const archetype of monsterArchetypes) {
                cumulative += archetype.chance;
                if (roll <= cumulative) {
                    return archetype;
                }
            }
            return monsterArchetypes[monsterArchetypes.length - 1];
        }

        function bridgeContainsX(x) {
            return x >= world.bridgeStartX && x <= world.bridgeEndX;
        }

        // 桥面动态形变缓存
        let bridgeSagArr = [];
        let bridgeSagVel = [];
        const BRIDGE_SEGMENTS = 32;
        function updateBridgeSag(deltaTime) {
            if (!bridgeSagArr.length) {
                bridgeSagArr = Array(BRIDGE_SEGMENTS + 1).fill(0);
                bridgeSagVel = Array(BRIDGE_SEGMENTS + 1).fill(0);
            }
            // 计算每段受力
            const forceArr = Array(BRIDGE_SEGMENTS + 1).fill(0);
            for (const monster of state.monsters) {
                if (!bridgeContainsX(monster.x)) continue;
                const seg = Math.round((monster.x - world.bridgeStartX) / (world.bridgeEndX - world.bridgeStartX) * BRIDGE_SEGMENTS);
                const idx = Math.max(0, Math.min(BRIDGE_SEGMENTS, seg));
                forceArr[idx] += (monster.bridgeWeight ?? 1) * (monster.dragging ? 1.3 : 1);
            }
            // 弹簧回弹+阻尼
            for (let i = 0; i <= BRIDGE_SEGMENTS; i++) {
                let target = Math.sin(i / BRIDGE_SEGMENTS * Math.PI) * 26 + forceArr[i] * 18;
                let acc = (target - bridgeSagArr[i]) * 12 - bridgeSagVel[i] * 7.2;
                bridgeSagVel[i] += acc * deltaTime;
                bridgeSagArr[i] += bridgeSagVel[i] * deltaTime;
            }
        }

        function getBridgeDeckY(x) {
            const ratio = (x - world.bridgeStartX) / (world.bridgeEndX - world.bridgeStartX);
            const clampedRatio = Math.max(0, Math.min(1, ratio));
            if (!bridgeSagArr.length) return world.bridgeY + Math.sin(clampedRatio * Math.PI) * 26;
            const idx = clampedRatio * BRIDGE_SEGMENTS;
            const i0 = Math.floor(idx), i1 = Math.min(BRIDGE_SEGMENTS, i0 + 1);
            const t = idx - i0;
            return world.bridgeY + bridgeSagArr[i0] * (1 - t) + bridgeSagArr[i1] * t;
        }

        function getPathY(x, phase = 0) {
            if (bridgeContainsX(x)) {
                return getBridgeDeckY(x) - 26 + Math.sin(phase) * 3;
            }

            if (x < world.bridgeStartX) {
                return world.groundY - 42 + Math.sin(phase) * 2;
            }

            return world.groundY - 38 + Math.sin(phase) * 2;
        }

        function isOverWater(x) {
            return x >= world.bridgeStartX + 26 && x <= world.bridgeEndX - 26;
        }

        function resetGame() {
            state.monsters = [];
            state.particles = [];
            state.draggingMonsterId = null;
            state.castleHealth = 100;
            state.kills = 0;
            state.wave = 1;
            state.spawnTimer = 0;
            state.spawnInterval = 1800;
            state.difficultyTimer = 0;
            state.lastTime = 0;
            state.gameOver = false;
            state.nextMonsterId = 1;
            canvas.classList.remove("dragging");
            gameOverOverlay.classList.remove("visible");
            updateHud();
        }

        function updateHud() {
            castleHealthNode.textContent = Math.max(0, Math.round(state.castleHealth));
            killCountNode.textContent = String(state.kills);
            waveNumberNode.textContent = String(state.wave);
        }

        function randomRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        function createMonster() {
            const archetype = pickMonsterArchetype();
            const radius = randomRange(archetype.radiusRange[0], archetype.radiusRange[1]);
            const maxHealth = Math.round((randomRange(40, 90) + state.wave * 6) * archetype.healthScale);
            const speed = (randomRange(44, 72) + state.wave * 4.2) * archetype.speedScale;
            const hue = randomRange(archetype.hueRange[0], archetype.hueRange[1]);
            const spawnX = world.width + radius + randomRange(0, 120);
            const wobble = randomRange(0, Math.PI * 2);

            state.monsters.push({
                id: state.nextMonsterId++,
                x: spawnX,
                y: getPathY(spawnX, wobble),
                radius,
                maxHealth,
                health: maxHealth,
                speed,
                baseSpeed: speed,
                damage: Math.max(8, Math.round(radius * 0.45 * archetype.damageScale)),
                hue,
                wobble,
                tilt: randomRange(-0.12, 0.12),
                squish: 1,
                archetypeKey: archetype.key,
                archetypeName: archetype.name,
                bodyScaleY: archetype.bodyScaleY,
                groundResist: archetype.groundResist,
                waterWeakness: archetype.waterWeakness,
                bridgeWeight: archetype.bridgeWeight,
                bridgeBounce: archetype.bridgeBounce,
                markerLabel: archetype.label,
                dragging: false,
                dragHistory: [],
                lastImpactAt: -9999,
                lastWaterAt: -9999,
                // 专属行为
                chargeCooldown: 0,
                chargeTime: 0,
                isCharging: false,
                jumpBackCooldown: 0,
                jumpBackTime: 0,
                isJumpingBack: false,
                impactAnim: 0
            });
        }

        function spawnBurst(count) {
            for (let i = 0; i < count; i += 1) {
                createMonster();
            }
        }

        function getPointerPosition(event) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (event.clientX - rect.left) * scaleX,
                y: (event.clientY - rect.top) * scaleY
            };
        }

        function pickMonster(x, y) {
            for (let i = state.monsters.length - 1; i >= 0; i -= 1) {
                const monster = state.monsters[i];
                const dx = x - monster.x;
                const dy = y - monster.y;
                if (Math.hypot(dx, dy) <= monster.radius) {
                    return monster;
                }
            }
            return null;
        }

        function beginDrag(event) {
            if (state.gameOver) {
                return;
            }

            const pointer = getPointerPosition(event);
            state.mouse = pointer;
            const monster = pickMonster(pointer.x, pointer.y);

            if (!monster) {
                return;
            }

            monster.dragging = true;
            monster.dragHistory = [{ x: pointer.x, y: pointer.y, time: performance.now() }];
            state.draggingMonsterId = monster.id;
            canvas.classList.add("dragging");
        }

        function endDrag() {
            if (state.draggingMonsterId === null) {
                return;
            }

            const monster = state.monsters.find((item) => item.id === state.draggingMonsterId);
            if (monster) {
                monster.dragging = false;
                monster.dragHistory = [];
            }

            state.draggingMonsterId = null;
            canvas.classList.remove("dragging");
        }

        function addParticles(x, y, color, amount) {
            for (let i = 0; i < amount; i += 1) {
                state.particles.push({
                    x,
                    y,
                    vx: randomRange(-160, 160),
                    vy: randomRange(-220, -50),
                    life: randomRange(0.35, 0.7),
                    age: 0,
                    color
                });
            }
        }

        function applyGroundImpact(monster, impactSpeed) {
            const now = performance.now();
            if (now - monster.lastImpactAt < 180) {
                return;
            }

            const damage = Math.max(6, Math.round(((impactSpeed - 320) / 14) / (monster.groundResist ?? 1)));
            if (damage <= 0) {
                return;
            }

            monster.lastImpactAt = now;
            monster.health -= damage;
            // 独立受击特效
            if (monster.archetypeKey === "brute") {
                addParticles(monster.x, world.groundY - 4, "rgba(90, 58, 26, 0.85)", 18);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 60%, 38%, 0.95)`, 18);
                addParticles(monster.x, monster.y, "rgba(255, 220, 120, 0.45)", 8);
            } else if (monster.archetypeKey === "scout") {
                addParticles(monster.x, world.groundY - 4, "rgba(90, 58, 26, 0.55)", 8);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 80%, 68%, 0.85)`, 14);
                addParticles(monster.x, monster.y, "rgba(255,255,255,0.7)", 6);
            } else if (monster.archetypeKey === "spitter") {
                addParticles(monster.x, world.groundY - 4, "rgba(90, 58, 26, 0.65)", 10);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 90%, 80%, 0.85)`, 12);
                addParticles(monster.x, monster.y, "rgba(118,245,233,0.55)", 8);
            } else {
                addParticles(monster.x, world.groundY - 4, "rgba(90, 58, 26, 0.65)", 12);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 80%, 58%, 0.85)`, 10);
            }

            if (monster.health <= 0) {
                state.kills += 1;
                if (monster.archetypeKey === "brute") {
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 32%, 0.98)`, 32);
                    addParticles(monster.x, monster.y, "rgba(255, 220, 120, 0.55)", 18);
                } else if (monster.archetypeKey === "scout") {
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 82%, 0.95)`, 18);
                    addParticles(monster.x, monster.y, "rgba(255,255,255,0.92)", 12);
                } else if (monster.archetypeKey === "spitter") {
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 82%, 0.95)`, 12);
                    addParticles(monster.x, monster.y, "rgba(118,245,233,0.85)", 18);
                } else {
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 62%, 0.95)`, 22);
                }
                state.monsters = state.monsters.filter((item) => item.id !== monster.id);
                if (state.draggingMonsterId === monster.id) {
                    state.draggingMonsterId = null;
                    canvas.classList.remove("dragging");
                }
            } else {
                monster.y = world.groundY - monster.radius;
            }

            updateHud();
        }

        function applyWaterImpact(monster, impactSpeed) {
            const now = performance.now();
            if (now - monster.lastWaterAt < 240) {
                return;
            }

            const damage = Math.max(16, Math.round(((impactSpeed - 220) / 8) * (monster.waterWeakness ?? 1)));
            monster.lastWaterAt = now;
            monster.health -= damage;
            monster.squish = 0.74;
            // 独立落水特效
            if (monster.archetypeKey === "brute") {
                addParticles(monster.x, world.waterTop + 10, "rgba(132, 216, 255, 0.9)", 18);
                addParticles(monster.x, world.waterTop + 6, "rgba(255, 255, 255, 0.85)", 10);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 60%, 38%, 0.85)`, 18);
                addParticles(monster.x, monster.y, "rgba(255, 220, 120, 0.45)", 8);
            } else if (monster.archetypeKey === "scout") {
                addParticles(monster.x, world.waterTop + 10, "rgba(132, 216, 255, 0.7)", 10);
                addParticles(monster.x, world.waterTop + 6, "rgba(255, 255, 255, 0.85)", 8);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 80%, 68%, 0.85)`, 10);
                addParticles(monster.x, monster.y, "rgba(255,255,255,0.7)", 6);
            } else if (monster.archetypeKey === "spitter") {
                addParticles(monster.x, world.waterTop + 10, "rgba(118,245,233,0.95)", 22);
                addParticles(monster.x, world.waterTop + 6, "rgba(255, 255, 255, 0.85)", 10);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 90%, 80%, 0.85)`, 12);
            } else {
                addParticles(monster.x, world.waterTop + 10, "rgba(132, 216, 255, 0.9)", 26);
                addParticles(monster.x, world.waterTop + 6, "rgba(255, 255, 255, 0.85)", 16);
                addParticles(monster.x, monster.y, `hsla(${monster.hue}, 90%, 60%, 0.8)`, 14);
            }

            if (monster.health <= 0) {
                state.kills += 1;
                if (monster.archetypeKey === "brute") {
                    addParticles(monster.x, world.waterTop + 8, "rgba(173, 238, 255, 0.95)", 24);
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 32%, 0.98)`, 18);
                } else if (monster.archetypeKey === "scout") {
                    addParticles(monster.x, world.waterTop + 8, "rgba(173, 238, 255, 0.75)", 12);
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 82%, 0.95)`, 10);
                } else if (monster.archetypeKey === "spitter") {
                    addParticles(monster.x, world.waterTop + 8, "rgba(118,245,233,0.95)", 28);
                    addParticles(monster.x, monster.y, `hsla(${monster.hue}, 95%, 82%, 0.95)`, 10);
                } else {
                    addParticles(monster.x, world.waterTop + 8, "rgba(173, 238, 255, 0.95)", 34);
                }
                state.monsters = state.monsters.filter((item) => item.id !== monster.id);
                if (state.draggingMonsterId === monster.id) {
                    state.draggingMonsterId = null;
                    canvas.classList.remove("dragging");
                }
            } else {
                monster.y = world.waterTop + monster.radius * 0.55;
            }

            updateHud();
        }

        function updateDragging(monster, now) {
            monster.x = Math.max(world.castleX + world.castleWidth + 10, Math.min(world.width - monster.radius, state.mouse.x));
            monster.y = Math.max(monster.radius + 30, Math.min(world.waterBottom + monster.radius * 0.7, state.mouse.y));
            monster.dragHistory.push({ x: monster.x, y: monster.y, time: now });

            if (monster.dragHistory.length > 5) {
                monster.dragHistory.shift();
            }

            monster.tilt = Math.max(-0.35, Math.min(0.35, (state.mouse.x - monster.x) / (monster.radius * 3)));
            monster.squish += (0.92 - monster.squish) * 0.16;

            if (bridgeContainsX(monster.x)) {
                const deckY = getBridgeDeckY(monster.x) - 12;
                monster.y = Math.min(monster.y, deckY + monster.radius * 1.45);
            }

            if (monster.y + monster.radius >= world.groundY) {
                const oldest = monster.dragHistory[0];
                const latest = monster.dragHistory[monster.dragHistory.length - 1];
                const deltaTime = Math.max(16, latest.time - oldest.time);
                const verticalSpeed = ((latest.y - oldest.y) / deltaTime) * 1000;
                if (verticalSpeed > 320) {
                    applyGroundImpact(monster, verticalSpeed);
                }
            }

            if (isOverWater(monster.x) && monster.y + monster.radius * 0.3 >= world.waterTop) {
                const oldest = monster.dragHistory[0];
                const latest = monster.dragHistory[monster.dragHistory.length - 1];
                const deltaTime = Math.max(16, latest.time - oldest.time);
                const verticalSpeed = ((latest.y - oldest.y) / deltaTime) * 1000;
                if (verticalSpeed > 220) {
                    applyWaterImpact(monster, verticalSpeed);
                }
            }
        }

        function hitCastle(monster) {
            state.castleHealth -= monster.damage;
            addParticles(world.castleX + world.castleWidth - 10, world.groundY - 90, "rgba(255, 205, 125, 0.85)", 20);
            state.monsters = state.monsters.filter((item) => item.id !== monster.id);

            if (state.draggingMonsterId === monster.id) {
                state.draggingMonsterId = null;
                canvas.classList.remove("dragging");
            }

            if (state.castleHealth <= 0) {
                state.castleHealth = 0;
                state.gameOver = true;
                gameOverText.textContent = `你挡住了 ${state.kills} 只小怪，但城堡已经被攻破。`;
                gameOverOverlay.classList.add("visible");
            }

            updateHud();
        }

        function updateMonsters(deltaTime, now) {
            updateBridgeSag(deltaTime);
            for (const monster of [...state.monsters]) {
                if (monster.dragging) {
                    updateDragging(monster, now);
                    continue;
                }

                // 怪物专属行为
                if (monster.archetypeKey === "scout") {
                    // 轻行怪偶尔冲刺
                    if (!monster.isCharging && monster.chargeCooldown <= 0 && Math.random() < 0.008) {
                        monster.isCharging = true;
                        monster.chargeTime = 0.38 + Math.random() * 0.22;
                        monster.chargeCooldown = 2.2 + Math.random() * 2.2;
                    }
                    if (monster.isCharging) {
                        monster.speed = monster.baseSpeed * 2.2;
                        monster.chargeTime -= deltaTime;
                        monster.squish = 0.7;
                        if (monster.chargeTime <= 0) {
                            monster.isCharging = false;
                            monster.speed = monster.baseSpeed;
                        }
                    } else {
                        monster.chargeCooldown -= deltaTime;
                        monster.speed = monster.baseSpeed;
                    }
                }

                if (monster.archetypeKey === "spitter") {
                    // 水惧怪偶尔后跳
                    if (!monster.isJumpingBack && monster.jumpBackCooldown <= 0 && Math.random() < 0.006 && !isOverWater(monster.x)) {
                        monster.isJumpingBack = true;
                        monster.jumpBackTime = 0.22 + Math.random() * 0.18;
                        monster.jumpBackCooldown = 2.5 + Math.random() * 2.5;
                        monster.impactAnim = 1.2;
                    }
                    if (monster.isJumpingBack) {
                        monster.x += monster.baseSpeed * 2.1 * deltaTime;
                        monster.jumpBackTime -= deltaTime;
                        monster.squish = 1.18;
                        if (monster.jumpBackTime <= 0) {
                            monster.isJumpingBack = false;
                        }
                    } else {
                        monster.jumpBackCooldown -= deltaTime;
                    }
                }

                monster.wobble += deltaTime * 7.2;
                // 重甲怪撞城时高伤动画
                if (monster.archetypeKey === "brute" && monster.x - monster.radius <= world.castleX + world.castleWidth + 12) {
                    monster.impactAnim = 1.5;
                }
                // 普通移动
                if (!monster.isJumpingBack) {
                    monster.x -= monster.speed * deltaTime;
                }
                const targetY = getPathY(monster.x, monster.wobble);
                monster.y += (targetY - monster.y) * Math.min(1, deltaTime * 9);
                monster.tilt += (Math.sin(monster.wobble * 0.5) * 0.12 - monster.tilt) * Math.min(1, deltaTime * 6);
                const bounceStrength = monster.bridgeBounce ?? 1;
                monster.squish += (1 + Math.sin(monster.wobble * 2) * 0.04 * bounceStrength - monster.squish) * Math.min(1, deltaTime * 8);
                monster.y = Math.max(monster.radius + 40, Math.min(world.waterBottom - monster.radius * 0.25, monster.y));
                if (monster.impactAnim > 0) {
                    monster.impactAnim -= deltaTime * 2.2;
                }

                if (monster.x - monster.radius <= world.castleX + world.castleWidth) {
                    // 重甲怪撞城高伤
                    if (monster.archetypeKey === "brute") {
                        state.castleHealth -= monster.damage * 1.7;
                    } else {
                        hitCastle(monster);
                    }
                    // 直接移除重甲怪
                    if (monster.archetypeKey === "brute") {
                        state.monsters = state.monsters.filter((item) => item.id !== monster.id);
                    }
                }
            }
        }

        function updateParticles(deltaTime) {
            state.particles = state.particles.filter((particle) => {
                particle.age += deltaTime;
                particle.x += particle.vx * deltaTime;
                particle.y += particle.vy * deltaTime;
                particle.vy += 420 * deltaTime;
                return particle.age < particle.life;
            });
        }

        function updateSpawning(deltaTime) {
            state.spawnTimer += deltaTime * 1000;
            state.difficultyTimer += deltaTime * 1000;

            if (state.spawnTimer >= state.spawnInterval) {
                state.spawnTimer = 0;
                const extra = Math.random() > 0.68 ? 1 : 0;
                spawnBurst(1 + extra);
            }

            if (state.difficultyTimer >= 12000) {
                state.difficultyTimer = 0;
                state.wave += 1;
                state.spawnInterval = Math.max(650, state.spawnInterval - 110);
                spawnBurst(Math.min(2 + Math.floor(state.wave / 3), 4));
                updateHud();
            }
        }

        function drawBackground() {
            const sky = ctx.createLinearGradient(0, 0, 0, world.height);
            sky.addColorStop(0, "#fdf3d8");
            sky.addColorStop(0.5, "#f5c981");
            sky.addColorStop(1, "#ce8a49");
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, world.width, world.height);

            ctx.fillStyle = "rgba(255,255,255,0.38)";
            ctx.beginPath();
            ctx.arc(1060, 120, 70, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(132, 89, 37, 0.20)";
            ctx.beginPath();
            ctx.moveTo(0, 410);
            ctx.quadraticCurveTo(280, 310, 560, 390);
            ctx.quadraticCurveTo(890, 470, 1280, 350);
            ctx.lineTo(1280, 520);
            ctx.lineTo(0, 520);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#7f5c34";
            ctx.fillRect(0, world.groundY, world.width, world.height - world.groundY);

            const water = ctx.createLinearGradient(0, world.waterTop, 0, world.waterBottom);
            water.addColorStop(0, "rgba(116, 197, 233, 0.95)");
            water.addColorStop(0.45, "rgba(56, 141, 205, 0.96)");
            water.addColorStop(1, "rgba(18, 89, 153, 0.98)");
            ctx.fillStyle = water;
            ctx.beginPath();
            ctx.moveTo(world.bridgeStartX - 16, world.waterTop + 2);
            ctx.quadraticCurveTo((world.bridgeStartX + world.bridgeEndX) / 2, world.waterTop + 18, world.bridgeEndX + 16, world.waterTop + 6);
            ctx.lineTo(world.bridgeEndX + 24, world.waterBottom);
            ctx.lineTo(world.bridgeStartX - 24, world.waterBottom);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(194, 242, 255, 0.45)";
            ctx.lineWidth = 3;
            for (let i = 0; i < 3; i += 1) {
                const y = world.waterTop + 10 + i * 16;
                ctx.beginPath();
                ctx.moveTo(world.bridgeStartX + 10, y);
                ctx.quadraticCurveTo((world.bridgeStartX + world.bridgeEndX) / 2, y + (i % 2 === 0 ? 9 : -7), world.bridgeEndX - 10, y + 3);
                ctx.stroke();
            }

            const postTopY = world.bridgeY - 58;
            const postBottomY = world.groundY + 12;
            ctx.fillStyle = "#6a4527";
            ctx.fillRect(world.bridgeStartX - 10, postTopY, 18, postBottomY - postTopY);
            ctx.fillRect(world.bridgeEndX - 8, postTopY, 18, postBottomY - postTopY);

            const plankCount = 12;
            const plankWidth = (world.bridgeEndX - world.bridgeStartX) / plankCount;
            ctx.strokeStyle = "#c9a16d";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(world.bridgeStartX - 6, getBridgeDeckY(world.bridgeStartX) - 18);
            ctx.quadraticCurveTo((world.bridgeStartX + world.bridgeEndX) / 2, world.bridgeY - 2, world.bridgeEndX + 6, getBridgeDeckY(world.bridgeEndX) - 18);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(world.bridgeStartX - 6, getBridgeDeckY(world.bridgeStartX) + 18);
            ctx.quadraticCurveTo((world.bridgeStartX + world.bridgeEndX) / 2, world.bridgeY + 34, world.bridgeEndX + 6, getBridgeDeckY(world.bridgeEndX) + 18);
            ctx.stroke();

            for (let i = 0; i < plankCount; i += 1) {
                const plankX = world.bridgeStartX + i * plankWidth;
                const centerX = plankX + plankWidth / 2;
                const deckY = getBridgeDeckY(centerX);
                // 木板晃动动画
                const shake = Math.sin(Date.now() / 120 + i * 0.7) * 2.2 * (bridgeSagVel && bridgeSagVel.length ? Math.abs(bridgeSagVel[Math.round(i / plankCount * BRIDGE_SEGMENTS)]) : 1);
                ctx.strokeStyle = "rgba(87, 56, 29, 0.7)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(centerX, deckY - 16 + shake);
                ctx.lineTo(centerX, deckY + 15 + shake);
                ctx.stroke();

                ctx.fillStyle = i % 2 === 0 ? "#9a6b3d" : "#85582f";
                ctx.save();
                ctx.translate(centerX, deckY + shake);
                ctx.rotate(Math.sin(i * 0.7 + Date.now() / 800) * 0.03 + shake * 0.01);
                ctx.fillRect(-plankWidth * 0.48, -11, plankWidth * 0.96, 22);
                ctx.restore();
            }

            ctx.fillStyle = "rgba(255, 241, 201, 0.14)";
            for (let x = -40; x < world.width + 50; x += 54) {
                if (x > world.bridgeStartX - 50 && x < world.bridgeEndX + 20) {
                    continue;
                }
                ctx.fillRect(x, world.groundY + 16 + ((x / 54) % 2) * 10, 30, 8);
            }
        }

        function drawCastle() {
            const baseY = world.groundY - world.castleHeight;
            ctx.fillStyle = "#84684c";
            ctx.fillRect(world.castleX, baseY, world.castleWidth, world.castleHeight);

            ctx.fillStyle = "#9f8461";
            ctx.fillRect(world.castleX + 14, baseY - 34, 26, 34);
            ctx.fillRect(world.castleX + 52, baseY - 54, 26, 54);
            ctx.fillRect(world.castleX + 90, baseY - 26, 26, 26);

            ctx.fillStyle = "#543a22";
            ctx.beginPath();
            ctx.arc(world.castleX + world.castleWidth / 2, world.groundY, 40, Math.PI, 0);
            ctx.fill();

            const healthRatio = state.castleHealth / 100;
            ctx.fillStyle = "rgba(33, 23, 15, 0.6)";
            ctx.fillRect(world.castleX - 4, baseY - 22, world.castleWidth + 8, 12);
            ctx.fillStyle = healthRatio > 0.4 ? "#91d04a" : healthRatio > 0.18 ? "#ffbe3b" : "#ef5a43";
            ctx.fillRect(world.castleX - 2, baseY - 20, (world.castleWidth + 4) * healthRatio, 8);
        }

        function drawMonster(monster) {
            const healthRatio = Math.max(0, monster.health / monster.maxHealth);
            const shineColor = `hsla(${monster.hue + 10}, 100%, 92%, 0.92)`;
            const shadowColor = `hsla(${monster.hue - 8}, 55%, 20%, 0.34)`;
            const limbSwing = Math.sin(monster.wobble * 1.6) * monster.radius * 0.22;

            ctx.save();
            ctx.translate(monster.x, monster.y + (monster.impactAnim > 0 ? Math.sin(monster.impactAnim * 8) * 8 * monster.impactAnim : 0));
            ctx.rotate(monster.tilt + (monster.impactAnim > 0 ? Math.sin(monster.impactAnim * 8) * 0.18 * monster.impactAnim : 0));
            ctx.scale(monster.dragging ? 1.08 : 1, monster.squish * (monster.impactAnim > 0 ? 1.1 - monster.impactAnim * 0.2 : 1));

            ctx.fillStyle = shadowColor;
            ctx.beginPath();
            ctx.ellipse(0, monster.radius * 0.8, monster.radius * 0.88, monster.radius * 0.36, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `hsla(${monster.hue - 5}, 50%, 24%, 0.8)`;
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(-monster.radius * 0.45, monster.radius * 0.38);
            ctx.lineTo(-monster.radius * 0.75, monster.radius * 0.72 + limbSwing * 0.25);
            ctx.moveTo(monster.radius * 0.32, monster.radius * 0.34);
            ctx.lineTo(monster.radius * 0.66, monster.radius * 0.7 - limbSwing * 0.2);
            ctx.moveTo(-monster.radius * 0.58, -monster.radius * 0.08);
            ctx.lineTo(-monster.radius * 0.9, -monster.radius * 0.26 - limbSwing * 0.18);
            ctx.moveTo(monster.radius * 0.5, -monster.radius * 0.12);
            ctx.lineTo(monster.radius * 0.86, -monster.radius * 0.3 + limbSwing * 0.16);
            ctx.stroke();

            const body = ctx.createRadialGradient(-monster.radius * 0.3, -monster.radius * 0.3, 4, 0, 0, monster.radius);
            body.addColorStop(0, `hsl(${monster.hue}, 95%, 66%)`);
            body.addColorStop(1, `hsl(${monster.hue}, 78%, 38%)`);
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.ellipse(0, 0, monster.radius, monster.radius * monster.bodyScaleY, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `hsla(${monster.hue + 2}, 92%, 54%, 0.68)`;
            ctx.beginPath();
            ctx.ellipse(monster.radius * 0.12, monster.radius * 0.12, monster.radius * 0.52, monster.radius * 0.34, 0.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = shineColor;
            ctx.beginPath();
            ctx.ellipse(-monster.radius * 0.26, -monster.radius * 0.32, monster.radius * 0.25, monster.radius * 0.16, -0.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#2e140f";
            ctx.beginPath();
            ctx.arc(-monster.radius * 0.28, -monster.radius * 0.1, monster.radius * 0.12, 0, Math.PI * 2);
            ctx.arc(monster.radius * 0.2, -monster.radius * 0.05, monster.radius * 0.12, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.beginPath();
            ctx.arc(-monster.radius * 0.24, -monster.radius * 0.14, monster.radius * 0.04, 0, Math.PI * 2);
            ctx.arc(monster.radius * 0.24, -monster.radius * 0.09, monster.radius * 0.04, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#2e140f";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, monster.radius * 0.08, monster.radius * 0.36, 0.15, Math.PI - 0.15);
            ctx.stroke();

            ctx.strokeStyle = `hsla(${monster.hue + 18}, 100%, 80%, 0.42)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, monster.radius * 0.82, -1.4, -0.2);
            ctx.stroke();

            if (monster.archetypeKey === "brute") {
                ctx.fillStyle = "rgba(88, 51, 25, 0.55)";
                ctx.beginPath();
                ctx.arc(0, -monster.radius * 0.72, monster.radius * 0.34, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(255, 226, 194, 0.65)";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-monster.radius * 0.18, -monster.radius * 0.88);
                ctx.lineTo(-monster.radius * 0.46, -monster.radius * 1.2);
                ctx.moveTo(monster.radius * 0.18, -monster.radius * 0.88);
                ctx.lineTo(monster.radius * 0.46, -monster.radius * 1.2);
                ctx.stroke();
            }

            if (monster.archetypeKey === "scout") {
                ctx.strokeStyle = "rgba(255,255,255,0.38)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, monster.radius * 1.08, -0.8, 0.65);
                ctx.stroke();
            }

            if (monster.archetypeKey === "spitter") {
                ctx.fillStyle = "rgba(118, 245, 233, 0.75)";
                ctx.beginPath();
                ctx.ellipse(0, monster.radius * 0.22, monster.radius * 0.22, monster.radius * 0.12, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();

            ctx.fillStyle = "rgba(45, 25, 12, 0.55)";
            ctx.fillRect(monster.x - monster.radius, monster.y - monster.radius - 22, monster.radius * 2, 8);
            ctx.fillStyle = healthRatio > 0.45 ? "#7ce05c" : healthRatio > 0.2 ? "#ffbb45" : "#f25747";
            ctx.fillRect(monster.x - monster.radius, monster.y - monster.radius - 22, monster.radius * 2 * healthRatio, 8);

            ctx.fillStyle = "rgba(42, 27, 15, 0.74)";
            ctx.font = "bold 11px Trebuchet MS";
            ctx.textAlign = "center";
            ctx.fillText(monster.markerLabel, monster.x, monster.y - monster.radius - 28);
            ctx.textAlign = "start";
        }

        function drawParticles() {
            for (const particle of state.particles) {
                const alpha = 1 - particle.age / particle.life;
                ctx.fillStyle = particle.color.replace(/\)$|\)$/g, "").includes("hsla")
                    ? particle.color.replace(/,\s*[^,)]*\)$/, `, ${alpha})`)
                    : particle.color.replace(/rgba\(([^)]+),\s*[^,]+\)/, `rgba($1, ${alpha})`);
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, 3 + alpha * 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function drawAimHint() {
            if (state.draggingMonsterId === null) {
                return;
            }

            ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 8]);
            ctx.beginPath();
            ctx.moveTo(state.mouse.x, state.mouse.y);
            ctx.lineTo(state.mouse.x, world.groundY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        function drawFrame() {
            drawBackground();
            drawCastle();

            for (const monster of state.monsters) {
                drawMonster(monster);
            }

            drawParticles();
            drawAimHint();

            if (!state.gameOver) {
                ctx.fillStyle = "rgba(37, 30, 22, 0.66)";
                ctx.font = "bold 18px Trebuchet MS";
                ctx.fillText("拖怪猛砸地面，或从软桥压进水里造成更高伤害", 24, world.height - 28);
            }
        }

        function gameLoop(timestamp) {
            if (!state.lastTime) {
                state.lastTime = timestamp;
            }

            const deltaTime = Math.min(0.032, (timestamp - state.lastTime) / 1000);
            state.lastTime = timestamp;

            if (!state.gameOver) {
                updateSpawning(deltaTime);
                updateMonsters(deltaTime, timestamp);
                updateParticles(deltaTime);
            } else {
                updateParticles(deltaTime);
            }

            drawFrame();
            requestAnimationFrame(gameLoop);
        }

        canvas.addEventListener("mousedown", beginDrag);
        canvas.addEventListener("mousemove", (event) => {
            state.mouse = getPointerPosition(event);
        });
        canvas.addEventListener("mouseup", endDrag);
        canvas.addEventListener("mouseleave", endDrag);

        canvas.addEventListener("touchstart", (event) => {
            event.preventDefault();
            beginDrag(event.touches[0]);
        }, { passive: false });

        canvas.addEventListener("touchmove", (event) => {
            event.preventDefault();
            state.mouse = getPointerPosition(event.touches[0]);
        }, { passive: false });

        canvas.addEventListener("touchend", endDrag);

        restartButton.addEventListener("click", resetGame);
        restartOverlayButton.addEventListener("click", resetGame);

        resetGame();
        spawnBurst(3);
        requestAnimationFrame(gameLoop);
