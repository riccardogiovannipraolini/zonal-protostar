// ===== RALLY PHASE GAME LOGIC =====
// Vertical lanes + simultaneous launch system

import { RALLY, AI_CONFIG, CARD } from '../data/cards.js';
import { layout, getCanvas } from '../render/canvas.js';
import { initAudio, playParrySound, playHitSound, playStalemateSound, startTensionLoop, stopTensionLoop } from './audio.js';

// Module-level references (set by init)
let gameState = null;
let renderFn = null;
let endTurnFn = null;

/**
 * Initialize rally module with game state reference
 */
export function initRally(state, render, endTurn) {
    gameState = state;
    renderFn = render;
    endTurnFn = endTurn;
}

/**
 * Get lane center X position
 */
function getLaneCenterX(laneIndex) {
    const pos = layout.cardPositions.player[laneIndex] || layout.cardPositions.enemy[laneIndex];
    return pos ? pos.x + CARD.WIDTH / 2 : 0;
}

/**
 * Get lane start/end Y positions based on direction
 */
function getLaneYPositions(isPlayerAttacker) {
    const canvas = getCanvas();
    const enemyCardY = layout.cardPositions.enemy[0].y + CARD.HEIGHT / 2;
    const playerCardY = layout.cardPositions.player[0].y + CARD.HEIGHT / 2;

    if (isPlayerAttacker) {
        // Player attacking: notes travel from bottom (player) to top (enemy)
        return { startY: playerCardY, endY: enemyCardY };
    } else {
        // Enemy attacking: notes travel from top (enemy) to bottom (player)
        return { startY: enemyCardY, endY: playerCardY };
    }
}

/**
 * Start rally phase with simultaneous note spawning
 */
export function startRallyPhase(attacker, attackerIndex) {
    const isPlayerAttacker = attacker === 'player';
    const defenderCards = isPlayerAttacker ? gameState.enemyCards : gameState.playerCards;

    // Group notes by lane
    const notesByLane = {};
    gameState.assignedNotes.forEach(lane => {
        if (!notesByLane[lane]) notesByLane[lane] = [];
        notesByLane[lane].push(lane);
    });

    // Filter out destroyed targets
    const validLanes = Object.keys(notesByLane).filter(lane => {
        return defenderCards[parseInt(lane)].pv > 0;
    });

    if (validLanes.length === 0) {
        // No valid targets, skip rally
        console.log('[Rally] No valid targets, skipping rally');
        if (endTurnFn) endTurnFn(attacker);
        return;
    }

    gameState.rallyState = {
        attacker: attacker,
        attackerIndex: attackerIndex,
        lanes: [...gameState.assignedNotes],
        notesByLane: notesByLane,
        currentDefender: isPlayerAttacker ? 'enemy' : 'player',
        pendingNotes: [], // Notes waiting to spawn (with delays)
        completedNotes: 0,
        totalNotes: gameState.assignedNotes.length
    };

    gameState.activeNotes = []; // Multiple notes can be active at once
    gameState.rallyResults = [];
    gameState.phase = 'RALLY';

    // Schedule all note spawns
    scheduleNoteSpawns(isPlayerAttacker, notesByLane);
}

/**
 * Schedule note spawns with simultaneous launch for different lanes
 */
function scheduleNoteSpawns(isPlayerAttacker, notesByLane) {
    const { startY, endY } = getLaneYPositions(isPlayerAttacker);
    const baseDuration = RALLY.NOTE_DURATION / RALLY.BASE_SPEED_MULTIPLIER;

    Object.keys(notesByLane).forEach(laneStr => {
        const lane = parseInt(laneStr);
        const notesInLane = notesByLane[laneStr];
        const laneX = getLaneCenterX(lane);

        notesInLane.forEach((_, noteIndex) => {
            // First note in each lane spawns at t=0
            // Subsequent notes in same lane spawn with STACKED_NOTE_DELAY
            const delay = noteIndex * RALLY.STACKED_NOTE_DELAY;

            setTimeout(() => {
                if (!gameState.rallyState) return;

                const note = {
                    id: `${lane}-${noteIndex}`,
                    lane: lane,
                    progress: 0,
                    startTime: Date.now(),
                    duration: baseDuration,
                    startX: laneX,
                    startY: startY,
                    endX: laneX,  // Same X - vertical movement only
                    endY: endY,
                    direction: isPlayerAttacker ? 'toEnemy' : 'toPlayer',
                    bounceCount: 0,
                    resolved: false,
                    parryAttempted: false
                };

                gameState.activeNotes.push(note);
                console.log(`[Rally] Spawned note ${note.id} at t=${delay}ms on lane ${lane}`);

                // Start animation loop if this is the first note
                if (gameState.activeNotes.length === 1) {
                    animateNotes();
                }
            }, delay);
        });
    });
}

/**
 * Animate all active notes using requestAnimationFrame
 */
function animateNotes() {
    if (!gameState.rallyState || gameState.activeNotes.length === 0) {
        // Check if rally is complete
        checkRallyComplete();
        return;
    }

    let anyNoteActive = false;

    gameState.activeNotes.forEach(note => {
        if (note.resolved) return;

        const elapsed = Date.now() - note.startTime;
        const progress = Math.min(elapsed / note.duration, 1);

        note.progress = progress;
        const previousY = note.y;
        note.x = note.startX; // X stays constant (vertical movement)
        const newY = note.startY + (note.endY - note.startY) * progress;

        // CHECK IDENTITY CARD INTERSECTION
        // Lane 0: 42% height
        // Lane 1: 58% height
        const laneYs = [
            getCanvas().height * 0.42,
            getCanvas().height * 0.58
        ];

        // Helper to check intersection
        const checkCrossed = (y, prevY, newY, direction) => {
            if (direction === 'toEnemy') {
                return prevY >= y && newY <= y;
            } else {
                return prevY <= y && newY >= y;
            }
        };

        // Check Lane 0
        if (!note.lane0EffectApplied && checkCrossed(laneYs[0], previousY, newY, note.direction)) {
            applyIdentityEffect(note, laneYs[0], 0);
            note.lane0EffectApplied = true;
        }

        // Check Lane 1
        if (!note.lane1EffectApplied && checkCrossed(laneYs[1], previousY, newY, note.direction)) {
            applyIdentityEffect(note, laneYs[1], 1);
            note.lane1EffectApplied = true;
        }

        note.y = newY;
        if (progress >= 0.5 && !note.timingIndicator) {
            const remainingTime = note.duration * 0.5;
            const scaledParryWindow = RALLY.PARRY_WINDOW * Math.pow(RALLY.WINDOW_MULTIPLIER_PER_BOUNCE, note.bounceCount);

            note.timingIndicator = {
                startTime: Date.now(),
                duration: remainingTime,
                parryWindow: scaledParryWindow
            };

            // Set as current note for parry input (first unresolved note with indicator)
            if (!gameState.currentNote || gameState.currentNote.resolved) {
                gameState.currentNote = note;
                gameState.timingIndicator = note.timingIndicator;
            }

            // AI parry when defending
            if (gameState.rallyState.currentDefender === 'enemy' && !note.aiParryScheduled) {
                note.aiParryScheduled = true;
                scheduleAIParryForNote(note, remainingTime);
            }
        }

        if (progress < 1) {
            anyNoteActive = true;
        } else if (!note.parryAttempted) {
            // Note reached target without parry - it's a HIT
            handleNoteImpact(note);
        }
    });

    renderFn();

    if (anyNoteActive || gameState.activeNotes.some(n => !n.resolved)) {
        requestAnimationFrame(animateNotes);
    } else {
        checkRallyComplete();
    }
}

/**
 * Schedule AI parry for a specific note
 */
/**
 * Schedule AI parry for a specific note
 */
function scheduleAIParryForNote(note, remainingTime) {
    const parryWindow = note.timingIndicator.parryWindow;
    const perfectStart = 1 - (parryWindow / remainingTime);

    // AI Reaction logic
    // We want AI to sometimes hit Perfect, sometimes Imperfect, sometimes Miss.

    // Determine outcome based on success rates
    // Base success rate = chance to NOT MISS
    const baseRate = AI_CONFIG.parrySuccessRate;
    const bouncePenalty = (note.bounceCount || 0) * (AI_CONFIG.parryPenaltyPerBounce || 0.1);
    const successChance = Math.max(0.1, baseRate - bouncePenalty);

    // Roll for success (Not a miss)
    const willParry = Math.random() < successChance;

    // If successful, determine if Perfect or Good (Imperfect)
    // Let's say 40% chance of Perfect if it parries? Or make it speed dependent?
    // For now, simple 50/50 split on success to keep it dynamic
    const perfectChance = 0.5;
    const isPerfect = willParry && Math.random() < perfectChance;

    const aiDelay = AI_CONFIG.parryDelayMinMs +
        Math.random() * (AI_CONFIG.parryDelayMaxMs - AI_CONFIG.parryDelayMinMs);
    const targetTime = remainingTime * perfectStart + aiDelay;

    setTimeout(() => {
        if (!note || note.resolved || note.parryAttempted) return;

        console.log(`[Rally] AI attempt on note ${note.id} - WillParry: ${willParry}, IsPerfect: ${isPerfect}`);

        // Visual flash
        gameState.aiParryFlash = {
            cardIndex: note.lane,
            startTime: Date.now()
        };

        note.parryAttempted = true;

        if (willParry) {
            // Apply stamina effects to Enemy
            if (isPerfect) {
                // Perfect: +0.5 Stamina
                gameState.enemyStamina = Math.min(gameState.enemyStamina + 0.5, gameState.enemyMaxStamina);
                showStaminaChange(0.5, 'enemy');

                gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
                showImpactFeedback('PERFECT', note);
                handleParrySuccess(note, true);
            } else {
                // Imperfect: -0.5 Stamina
                gameState.enemyStamina -= 0.5;
                showStaminaChange(-0.5, 'enemy');

                gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
                showImpactFeedback('GOOD', note); // Yellow
                handleParrySuccess(note, false);
            }
        } else {
            // Failed parry = HIT
            showImpactFeedback('HIT', note);
            gameState.rallyResults.push({
                lane: note.lane,
                result: 'HIT',
                damagedSide: 'enemy'
            });

            setTimeout(() => {
                note.resolved = true;
                gameState.rallyState.completedNotes++;
            }, RALLY.IMPACT_DELAY);
        }

        // Clear flash
        setTimeout(() => {
            gameState.aiParryFlash = null;
            renderFn();
        }, 150);

    }, targetTime);
}

/**
 * Handle note impact (when note reaches target without parry)
 */
function handleNoteImpact(note) {
    const defenderSide = gameState.rallyState.currentDefender;
    const defenderCards = defenderSide === 'player' ?
        gameState.playerCards : gameState.enemyCards;
    const targetCard = defenderCards[note.lane];

    // Dead card = fizzle (no damage, note just disappears)
    if (!targetCard || targetCard.pv <= 0) {
        note.resolved = true;
        gameState.rallyState.completedNotes++;
        showImpactFeedback('FIZZLE', note);
        return;
    }

    gameState.rallyResults.push({
        lane: note.lane,
        result: 'HIT',
        damagedSide: defenderSide
    });

    showImpactFeedback('HIT', note);
    note.resolved = true;
    gameState.rallyState.completedNotes++;
}

/**
 * Attempt player parry on a specific lane (QWER keys)
 * @param {number|null} targetLane - Lane to parry (0-3), or null for any lane
 */
export function attemptParry(targetLane = null) {
    // Find note on the specified lane (or first unresolved if no lane specified)
    const note = gameState.activeNotes.find(n =>
        !n.resolved &&
        !n.parryAttempted &&
        n.timingIndicator &&
        gameState.rallyState.currentDefender === 'player' &&
        (targetLane === null || n.lane === targetLane)
    );

    if (!note) return;

    note.parryAttempted = true;

    const elapsed = Date.now() - note.timingIndicator.startTime;
    const duration = note.timingIndicator.duration;

    // Calculate timing from perfect center
    const perfectStart = 1 - (note.timingIndicator.parryWindow / duration);
    const perfectCenter = (perfectStart + 1) / 2;
    const msFromPerfect = Math.abs(elapsed - (perfectCenter * duration));

    // Current total window size for this bounce
    const scaledParryWindow = RALLY.PARRY_WINDOW * Math.pow(RALLY.WINDOW_MULTIPLIER_PER_BOUNCE, note.bounceCount);

    // Conditions
    const isPerfect = msFromPerfect <= 50;
    const isInWindow = msFromPerfect <= scaledParryWindow / 2;

    if (isPerfect) {
        // === PERFECT PARRY ===
        // Effect: Bounce back + Speed Up + Stamina Gain

        // Stamina gain (+0.5)
        gameState.playerStamina = Math.min(gameState.playerStamina + 0.5, gameState.playerMaxStamina);
        showStaminaChange(0.5, 'player');

        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback('PERFECT', note); // Green

        handleParrySuccess(note, true); // true = isPerfect
    } else if (isInWindow) {
        // === IMPERFECT PARRY ===
        // Effect: Bounce back + Speed Reset + Stamina Cost

        // Stamina cost (-0.5)
        gameState.playerStamina -= 0.5;
        // No min cap, can go negative as requested
        showStaminaChange(-0.5, 'player');

        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback('GOOD', note); // Yellow (Imperfect)

        handleParrySuccess(note, false); // false = not perfect
    } else {
        // === MISS (Timing off) ===
        // Effect: Damage + Rally Ends

        const defenderSide = gameState.rallyState.currentDefender;

        gameState.rallyResults.push({
            lane: note.lane,
            result: 'HIT',
            damagedSide: defenderSide
        });
        showImpactFeedback('HIT', note);

        setTimeout(() => {
            note.resolved = true;
            gameState.rallyState.completedNotes++;
        }, RALLY.IMPACT_DELAY);
    }
}

/**
 * Handle successful parry (bounce logic wrapper)
 */
function handleParrySuccess(note, isPerfect) {
    const currentBounceCount = (note.bounceCount || 0) + 1;

    if (currentBounceCount >= RALLY.MAX_BOUNCES) {
        // STALEMATE
        gameState.rallyResults.push({ lane: note.lane, result: 'STALEMATE' });
        showImpactFeedback('STALEMATE', note);
        note.resolved = true;
        gameState.rallyState.completedNotes++;
        return;
    }

    triggerSpinAnimation(note, () => {
        if (!gameState.rallyState) return;
        bounceNote(note, isPerfect);
    });
}

/**
 * Trigger spin animation on a note
 */
function triggerSpinAnimation(note, callback) {
    const duration = 300;
    const startTime = Date.now();
    note.isSpinning = true;

    function animateSpin() {
        if (!note.isSpinning) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        note.spinProgress = progress;
        renderFn();

        if (progress < 1) {
            requestAnimationFrame(animateSpin);
        } else {
            note.isSpinning = false;
            callback();
        }
    }

    requestAnimationFrame(animateSpin);
}

/**
 * Bounce note back to other side (vertical only)
 */
/**
 * Bounce note back to other side (vertical only)
 * @param {boolean} isPerfect - Whether previous parry was perfect (affects speed)
 */
function bounceNote(note, isPerfect = true) {
    if (!note || !gameState.rallyState) return;

    const newBounceCount = (note.bounceCount || 0) + 1;

    // Calculate velocity-scaled duration
    // If Imperfect: Reset speed to base (remove accumulate multiplier)
    // If Perfect: Stack multiplier normally

    let totalSpeedMultiplier;

    if (isPerfect) {
        // Perfect: Continue stacking speed
        const baseSpeed = RALLY.BASE_SPEED_MULTIPLIER || 1;
        const bounceSpeedMultiplier = Math.pow(RALLY.SPEED_MULTIPLIER_PER_BOUNCE, newBounceCount);
        totalSpeedMultiplier = baseSpeed * bounceSpeedMultiplier;
    } else {
        // Imperfect: Reset to base speed (punishment for poor timing is stamina loss + loss of momentum?)
        // Wait, "Effect: Bounces back (rally continues)" - User said "note.speedMultiplier = 1.0; // RESET speed to base" in request.
        // Assuming base speed multiplier from config.
        totalSpeedMultiplier = RALLY.BASE_SPEED_MULTIPLIER || 1;

        // IMPORTANT: We need to reset the logical bounce count FOR SPEED CALCULATION ONLY?
        // Or act as if it's the first bounce? The user prompt said:
        // "note.speedMultiplier = 1.0; // RESET speed to base"
        // But we calculate speed dynamically based on bounceCount.
        // To implement "Reset Speed", we effectively need to treat it as low speed.
        // However, we MUST increment bounceCount for the window shrinking logic (which depends on bounceCount).
        // PROPOSAL: We decouple visual speed from bounce count logic, OR we just set speed multiplier.
        // Since we calculate duration from scratch here:
    }

    // Recalculate duration
    const scaledDuration = RALLY.NOTE_DURATION / totalSpeedMultiplier;

    console.log(`[Rally] Bounce #${newBounceCount} (${isPerfect ? 'Perfect' : 'Imperfect'}) - Speed: ${totalSpeedMultiplier.toFixed(2)}x`);

    // Start tension audio at high bounces
    if (newBounceCount >= 2) {
        startTensionLoop(newBounceCount);
    }

    // Swap Y positions only - X stays fixed to lane
    const newStartY = note.endY;
    const newEndY = note.startY;

    // Update note for bounce
    note.startY = newStartY;
    note.endY = newEndY;
    note.progress = 0;
    note.startTime = Date.now();
    note.duration = scaledDuration;
    note.direction = note.direction === 'toEnemy' ? 'toPlayer' : 'toEnemy';
    note.bounceCount = newBounceCount;
    note.parryAttempted = false;
    note.timingIndicator = null;
    note.aiParryScheduled = false;

    // Swap defender
    gameState.rallyState.currentDefender =
        gameState.rallyState.currentDefender === 'player' ? 'enemy' : 'player';

    // Update global state for input handling
    gameState.currentNote = note;
    gameState.timingIndicator = null;
    gameState.parryAttempted = false;

    // Continue animation
    animateNotes();
}

/**
 * Show impact feedback
 */
function showImpactFeedback(result, note) {
    const x = note.endX;
    const y = note.endY - 40;

    let text, color;
    if (result === 'PERFECT') {
        text = '✨ PERFECT! ✨';
        color = '#2ecc71'; // Green
        playParrySound(note.bounceCount || 0);
    } else if (result === 'GOOD') {
        text = '⚠ GOOD';
        color = '#f1c40f'; // Yellow
        playParrySound(note.bounceCount || 0);
    } else if (result === 'RETURN') {
        text = '↩ RETURN!';
        color = '#f1c40f';
        playParrySound(note.bounceCount || 0);
    } else if (result === 'PARRY') {
        text = 'PARRY!';
        color = '#2ecc71';
        playParrySound(note.bounceCount || 0);
    } else if (result === 'STALEMATE') {
        text = '⚡ STALEMATE ⚡';
        color = '#9b59b6';
        playStalemateSound();
        stopTensionLoop();
    } else if (result === 'FIZZLE') {
        text = '~poof~';
        color = '#888888';
        // No sound for fizzle
    } else {
        text = 'HIT!';
        color = '#e74c3c';
        playHitSound();
        stopTensionLoop();
    }

    const floatingText = {
        text, x, y,
        opacity: 1,
        color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    const textDuration = 1000;
    const animateText = () => {
        const elapsed = Date.now() - floatingText.startTime;
        const progress = elapsed / textDuration;

        if (progress < 1) {
            floatingText.y = y - (progress * 50);
            floatingText.opacity = 1 - progress;
            renderFn();
            requestAnimationFrame(animateText);
        } else {
            gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
            renderFn();
        }
    };
    requestAnimationFrame(animateText);

    // Shake on HIT
    if (result === 'HIT') {
        // Clear any existing shake
        if (gameState.shakeInterval) {
            clearInterval(gameState.shakeInterval);
            gameState.shakeInterval = null;
        }

        const defenderSide = gameState.rallyState.currentDefender;
        const bounceCount = note.bounceCount || 0;
        const maxShakeFrames = 10 + (bounceCount * 2);

        gameState.shakeCard = {
            side: defenderSide,
            index: note.lane,
            frames: 0,
            intensity: 1 + (bounceCount * 0.3)
        };

        let shakeFrames = 0;
        gameState.shakeInterval = setInterval(() => {
            shakeFrames++;

            // Safety check
            if (gameState.shakeCard) {
                gameState.shakeCard.frames = shakeFrames;
                renderFn();
            } else {
                // If shakeCard is null (e.g. game reset), stop
                clearInterval(gameState.shakeInterval);
                gameState.shakeInterval = null;
                return;
            }

            if (shakeFrames >= maxShakeFrames) {
                if (gameState.shakeInterval) {
                    clearInterval(gameState.shakeInterval);
                    gameState.shakeInterval = null;
                }
                gameState.shakeCard = null;
                renderFn(); // Ensure one last render to clear shake
            }
        }, 50);
    }
}

/**
 * Show floating text for stamina change
 */
function showStaminaChange(amount, side) {
    const canvas = getCanvas();
    const isPlayer = side === 'player';
    const x = isPlayer ? 150 : 150; // Near stamina bars
    const y = isPlayer ? canvas.height - 50 : 50;

    const text = amount > 0 ? `+${amount}⚡` : `${amount}⚡`;
    const color = amount > 0 ? '#ffd700' : '#ff4757';

    const floatingText = {
        text, x, y,
        opacity: 1,
        color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    // Animate
    const textDuration = 800;
    const animateText = () => {
        const elapsed = Date.now() - floatingText.startTime;
        const progress = elapsed / textDuration;

        if (progress < 1) {
            floatingText.y = y - (progress * 20);
            floatingText.opacity = 1 - progress;
            renderFn();
            requestAnimationFrame(animateText);
        } else {
            gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
            renderFn();
        }
    };
    requestAnimationFrame(animateText);
}

/**
 * Check if rally is complete
 */
function checkRallyComplete() {
    if (!gameState.rallyState) return;

    const allResolved = gameState.activeNotes.every(n => n.resolved);

    if (allResolved) {
        console.log('[Rally] All notes resolved, finishing rally');
        finishRallyPhase();
    }
}

/**
 * Finish rally phase and apply damage
 */
export function finishRallyPhase() {
    console.log('[Rally] finishRallyPhase called');

    if (!gameState.rallyState) {
        console.error('[Rally] finishRallyPhase called but rallyState is null!');
        if (endTurnFn) endTurnFn('player');
        return;
    }

    const isPlayerAttacker = gameState.rallyState.attacker === 'player';

    // Apply damage based on who got hit
    const hits = gameState.rallyResults.filter(r => r.result === 'HIT');
    hits.forEach(hit => {
        const targetCards = hit.damagedSide === 'player' ? gameState.playerCards : gameState.enemyCards;
        const targetCard = targetCards[hit.lane];
        if (targetCard && targetCard.pv > 0) {
            targetCard.pv -= 1;
            if (targetCard.pv < 0) targetCard.pv = 0;
        }
    });

    // Check win/lose
    const playerAlive = gameState.playerCards.some(c => c.pv > 0);
    const enemyAlive = gameState.enemyCards.some(c => c.pv > 0);

    function logBattleDuration() {
        if (gameState.battleStartTime) {
            const elapsed = Date.now() - gameState.battleStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timeString = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
            console.log(`[Battle] Duration: ${timeString} (${seconds}s total)`);
        }
    }

    if (!enemyAlive) {
        gameState.phase = 'GAME_OVER';
        gameState.gameOver = { winner: 'player', reason: 'All enemy cards destroyed!' };
        logBattleDuration();
        cleanupRally();
        renderFn();
        return;
    }

    if (!playerAlive) {
        gameState.phase = 'GAME_OVER';
        gameState.gameOver = { winner: 'enemy', reason: 'All your cards destroyed!' };
        logBattleDuration();
        cleanupRally();
        renderFn();
        return;
    }

    cleanupRally();

    if (endTurnFn) {
        endTurnFn(isPlayerAttacker ? 'player' : 'enemy');
    }
}

/**
 * Clean up rally state
 */
function cleanupRally() {
    gameState.rallyState = null;
    gameState.currentNote = null;
    gameState.activeNotes = [];
    gameState.timingIndicator = null;
    gameState.assignedNotes = [];
}

// Export for external use
export function getRallyAttacker() {
    return gameState.rallyState ? gameState.rallyState.attacker : null;
}

// Legacy export for compatibility
export function spawnNextNote() {
    // No longer used - simultaneous spawning now handled by scheduleNoteSpawns
    console.warn('[Rally] spawnNextNote is deprecated');
}
