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
        note.x = note.startX; // X stays constant (vertical movement)
        note.y = note.startY + (note.endY - note.startY) * progress;

        // Start timing indicator at 50% progress for player-defending notes
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
function scheduleAIParryForNote(note, remainingTime) {
    const parryWindow = note.timingIndicator.parryWindow;
    const perfectStart = 1 - (parryWindow / remainingTime);

    const aiDelay = AI_CONFIG.parryDelayMinMs +
        Math.random() * (AI_CONFIG.parryDelayMaxMs - AI_CONFIG.parryDelayMinMs);
    const targetTime = remainingTime * perfectStart + aiDelay;

    setTimeout(() => {
        if (!note || note.resolved || note.parryAttempted) return;

        // Calculate parry success with bounce penalty
        const bounceCount = note.bounceCount || 0;
        const baseRate = AI_CONFIG.parrySuccessRate;
        const penalty = bounceCount * (AI_CONFIG.parryPenaltyPerBounce || 0.1);
        const adjustedRate = Math.max(0.1, baseRate - penalty);

        const parrySuccess = Math.random() < adjustedRate;
        console.log('[Rally] AI parry attempt on note', note.id, '- success:', parrySuccess);

        // Visual flash
        gameState.aiParryFlash = {
            cardIndex: note.lane,
            startTime: Date.now()
        };

        note.parryAttempted = true;

        if (parrySuccess) {
            const currentBounceCount = (note.bounceCount || 0) + 1;

            if (currentBounceCount >= RALLY.MAX_BOUNCES) {
                // STALEMATE
                gameState.rallyResults.push({ lane: note.lane, result: 'STALEMATE' });
                showImpactFeedback('STALEMATE', note);
                note.resolved = true;
                gameState.rallyState.completedNotes++;
            } else {
                // PARRY - bounce note back
                gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
                showImpactFeedback('PARRY', note);

                triggerSpinAnimation(note, () => {
                    if (!gameState.rallyState) return;
                    bounceNote(note);
                });
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
    const timingProgress = elapsed / duration;

    const perfectStart = 1 - (note.timingIndicator.parryWindow / duration);
    const perfectCenter = (perfectStart + 1) / 2;
    const msFromPerfect = Math.abs(elapsed - (perfectCenter * duration));
    const isPerfect = msFromPerfect <= 50;

    if (timingProgress >= perfectStart && timingProgress <= 1) {
        // PARRY SUCCESS
        const currentBounceCount = (note.bounceCount || 0) + 1;

        if (currentBounceCount >= RALLY.MAX_BOUNCES) {
            // STALEMATE
            gameState.rallyResults.push({ lane: note.lane, result: 'STALEMATE' });
            showImpactFeedback('STALEMATE', note);
            note.resolved = true;
            gameState.rallyState.completedNotes++;
            return;
        }

        // Normal parry - bounce note back
        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback(isPerfect ? 'PERFECT' : 'RETURN', note);

        triggerSpinAnimation(note, () => {
            if (!gameState.rallyState) return;
            bounceNote(note);
        });
    } else {
        // PARRY FAILED
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
function bounceNote(note) {
    if (!note || !gameState.rallyState) return;

    const newBounceCount = (note.bounceCount || 0) + 1;

    // Calculate velocity-scaled duration
    const baseSpeed = RALLY.BASE_SPEED_MULTIPLIER || 1;
    const bounceSpeedMultiplier = Math.pow(RALLY.SPEED_MULTIPLIER_PER_BOUNCE, newBounceCount);
    const totalSpeedMultiplier = baseSpeed * bounceSpeedMultiplier;
    const scaledDuration = RALLY.NOTE_DURATION / totalSpeedMultiplier;

    console.log('[Rally] Bounce #' + newBounceCount + ' - Speed: ' + totalSpeedMultiplier.toFixed(2) + 'x');

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
        color = '#ffd700';
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
        const shakeInterval = setInterval(() => {
            shakeFrames++;
            gameState.shakeCard.frames = shakeFrames;
            renderFn();

            if (shakeFrames >= maxShakeFrames) {
                clearInterval(shakeInterval);
                gameState.shakeCard = null;
            }
        }, 50);
    }
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
