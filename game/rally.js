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
    const enemyCardY = layout.cardPositions.enemy[0].y;
    const playerCardY = layout.cardPositions.player[0].y;

    // External Parry Points (Discs)
    // "In front" means towards the center of the battlefield
    const enemyParryY = enemyCardY + CARD.HEIGHT + 40; // Below enemy card
    const playerParryY = playerCardY - 40;             // Above player card

    if (isPlayerAttacker) {
        // Player attacking: From Player Shield to Enemy Shield
        return { startY: playerParryY, endY: enemyParryY };
    } else {
        // Enemy attacking: From Enemy Shield to Player Shield
        return { startY: enemyParryY, endY: playerParryY };
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

        // CHECK IDENTITY CARD INTERSECTION (Single Lane at 50%)
        const identityLaneY = getCanvas().height / 2;

        // Helper to check intersection
        const checkCrossed = (y, prevY, newY, direction) => {
            if (direction === 'toEnemy') {
                return prevY >= y && newY <= y;
            } else {
                return prevY <= y && newY >= y;
            }
        };

        // Check Single Lane Intersection
        if (!note.identityEffectApplied && checkCrossed(identityLaneY, previousY, newY, note.direction)) {
            applyIdentityEffect(note);
            note.identityEffectApplied = true;
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
    // msFromPerfect is deviation from center of the window
    const msFromPerfect = Math.abs(elapsed - (perfectCenter * duration));

    // --- 3-TIER PARRY LOGIC ---
    // Total window shrinks with bounces: 200 * (0.8 ^ bounceCount)
    // Imperfect zone = total window - perfect zone
    // Perfect zone = Fixed ±50ms

    const bounceCount = note.bounceCount || 0;
    const baseWindow = 200;
    const shrinkFactor = Math.pow(0.8, bounceCount);
    const scaledWindow = baseWindow * shrinkFactor;

    const isPerfect = msFromPerfect <= 70;
    const isInWindow = msFromPerfect <= scaledWindow / 2;

    // Check Stamina for Imperfect availability
    // "Imperfect disc: hidden when stamina = 0" -> implies imperfect parry is UNAVAILABLE
    const canAffordImperfect = gameState.playerStamina > 0;

    if (isPerfect) {
        // === 1. PERFECT PARRY ===
        // Limit: +/- 50ms
        // Effect: Bounce back + Speed Up (1.1x) + Stamina Gain (+0.5)

        // Stamina gain (+0.5), capped at max
        gameState.playerStamina = Math.min(gameState.playerStamina + 0.5, gameState.playerMaxStamina);
        showStaminaChange(0.5, 'player');

        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback('PERFECT', note); // Green

        handleParrySuccess(note, true); // true = isPerfect

    } else if (isInWindow && canAffordImperfect) {
        // === 2. IMPERFECT PARRY ===
        // Limit: Inside scaled window but > 50ms from center
        // Condition: Player must have > 0 stamina
        // Effect: Bounce back + Speed Reset (Base) + Stamina Cost (-0.5)

        // Stamina cost (-0.5)
        gameState.playerStamina -= 0.5;
        // No min cap, can go negative
        showStaminaChange(-0.5, 'player');

        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback('GOOD', note); // Yellow

        handleParrySuccess(note, false); // false = not perfect (imperfect)

    } else {
        // === 3. MISS ===
        // Outside window OR inside imperfect window but 0 stamina
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
        // Imperfect: Reset speed to base 1.3
        // Note: We keep the bounce count incremented for window shrinking logic, 
        // but for speed visualization/duration we pretend it's base speed.
        totalSpeedMultiplier = 1.3;
    }

    // Recalculate duration
    // Old: const scaledDuration = RALLY.NOTE_DURATION / totalSpeedMultiplier;
    // New: We need to calculate Parry Duration and Total Duration based on Speed.

    // Swap Y positions for full path
    const newStartY = note.endY; // Was Card Impact
    const newEndY = note.startY; // Was Start (previous Card Impact)

    // Determine new Parry Target (Shield)
    // If going toEnemy, target is enemyParryY.
    // We can re-call getLaneYPositions or just derive it.
    // Or just swap note.parryY to the other shield.
    // note.parryY depends on direction.
    // If direction BECOMES 'toEnemy' (player parried), target is Enemy Shield.

    const isPlayerAttackingNow = note.direction === 'toPlayer'; // It WAS toPlayer, now becoming toEnemy
    const { parryY: newParryY } = getLaneYPositions(isPlayerAttackingNow);

    const distanceToParry = Math.abs(newParryY - newStartY);
    const distanceTotal = Math.abs(newEndY - newStartY);

    // Speed: Pixels per ms
    // Base Speed (Distance / BaseDuration)
    // We can just use the previous speed * multiplier?
    // Let's use standard reference:
    const baseStandardDuration = RALLY.NOTE_DURATION / RALLY.BASE_SPEED_MULTIPLIER;
    const baseSpeed = distanceToParry / baseStandardDuration; // Px/ms for parry distance

    const newSpeed = baseSpeed * totalSpeedMultiplier; // Or logic?

    // Actually simpler:
    // oldParryDuration = RALLY.NOTE_DURATION / totalSpeedMultiplier
    const newParryDuration = RALLY.NOTE_DURATION / totalSpeedMultiplier;

    // Speed = DistanceParry / newParryDuration
    const currentSpeed = distanceToParry / newParryDuration;
    const newTotalDuration = distanceTotal / currentSpeed;

    console.log(`[Rally] Bounce #${newBounceCount} (${isPerfect ? 'Perfect' : 'Imperfect'}) - Speed: ${totalSpeedMultiplier.toFixed(2)}x`);

    // Start tension audio at high bounces
    if (newBounceCount >= 2) {
        startTensionLoop(newBounceCount);
    }

    // Update note for bounce
    note.startY = newStartY;
    note.endY = newEndY;
    note.parryY = newParryY;
    note.progress = 0;
    note.startTime = Date.now();
    note.duration = newParryDuration; // For timing indicator
    note.totalDuration = newTotalDuration; // For movement
    note.direction = isPlayerAttackingNow ? 'toEnemy' : 'toPlayer';
    note.bounceCount = newBounceCount;
    note.parryAttempted = false;
    note.missedParry = false;
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
        text = 'PERFECT!';
        color = '#2ecc71'; // Green
        playParrySound(note.bounceCount || 0);
    } else if (result === 'GOOD') {
        text = 'GOOD';
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

/**
 * Apply identity card effect when note crosses a lane
 */
/**
 * Apply identity card effect when note crosses the center lane
 */
function applyIdentityEffect(note) {
    if (!gameState) return;

    // Check direction to determine whose territory the note is entering/effects apply to
    // Notes traveling "toPlayer" enter Player's territory -> Player Identity Cards apply
    // Notes traveling "toEnemy" enter Enemy's territory -> Enemy Identity Cards apply

    const side = note.direction === 'toPlayer' ? 'player' : 'enemy';
    const identityCards = side === 'player' ? gameState.playerIdentityCards : gameState.enemyIdentityCards;

    if (!identityCards) return;

    // Apply effects from ALL identity cards (Single Lane Shared)
    identityCards.forEach(card => {
        if (!card) return;

        // Metronomo (Passive)
        // "Notes crossing this lane get -0.15 speed" (Value 0.85)
        if (card.id === 'METRONOMO') {
            const speedMult = card.value || 0.85;
            applySpeedChange(note, speedMult);
            showIdentityEffectFeedback(note, 'SLOW', '#3498db');
        }

        // Scudo (Active)
        // "Spend 2 Stamina: Next 3 notes crossing get -50% speed. CD: 3."
        if (card.id === 'SCUDO' && card.active && card.currentCharges > 0) {
            const speedMult = card.value || 0.5;
            applySpeedChange(note, speedMult);
            showIdentityEffectFeedback(note, 'SHIELD', '#2ecc71');

            // Consume charge
            card.currentCharges--;
            console.log(`[Rally] Scudo consumed charge. Remaining: ${card.currentCharges}`);
            if (card.currentCharges <= 0) {
                card.active = false;
                console.log('[Rally] Scudo deactivated');
            }
        }
    });
}

/**
 * Apply speed change to a note by adjusting duration
 * @param {Object} note 
 * @param {number} multiplier (e.g. 0.85 for 15% slower)
 */
function applySpeedChange(note, multiplier) {
    const now = Date.now();
    const elapsed = now - note.startTime;
    const currentProgress = elapsed / note.duration;

    // Prevent division by zero or negative/zero duration craziness
    if (note.duration <= 0) return;

    const oldDuration = note.duration;
    const newDuration = oldDuration / multiplier;

    note.duration = newDuration;
    // Adjust startTime so progress remains continuous
    note.startTime = now - (currentProgress * newDuration);

    console.log(`[Rally] Note ${note.id} speed * ${multiplier}. Duration: ${oldDuration.toFixed(0)} -> ${newDuration.toFixed(0)}`);
}

/**
 * Show feedback for identity effect
 */
function showIdentityEffectFeedback(note, text, color) {
    const floatingText = {
        text: text,
        x: note.x,
        y: note.y,
        opacity: 1,
        color: color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    // Start animation loop for this text
    const textDuration = 1000;
    const animateText = () => {
        // Check if text still exists in state (it might be cleared on reset)
        if (!gameState.floatingTexts.includes(floatingText)) return;

        const elapsed = Date.now() - floatingText.startTime;
        const progress = elapsed / textDuration;

        if (progress < 1) {
            floatingText.y -= 0.5; // Slow float up
            floatingText.opacity = 1 - progress;
            if (renderFn) renderFn();
            requestAnimationFrame(animateText);
        } else {
            // Remove self from state
            gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
            if (renderFn) renderFn();
        }
    };
    requestAnimationFrame(animateText);
}
