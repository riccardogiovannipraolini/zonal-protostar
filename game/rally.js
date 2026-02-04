// ===== RALLY PHASE GAME LOGIC =====

import { RALLY, AI_CONFIG, CARD } from '../data/cards.js';
import { layout } from '../render/canvas.js';

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
 * Start rally phase with given attacker
 */
export function startRallyPhase(attacker, attackerIndex) {
    gameState.rallyState = {
        attacker: attacker,
        attackerIndex: attackerIndex,
        lanes: [...gameState.assignedNotes],
        currentLaneIndex: 0,
        currentDefender: attacker === 'player' ? 'enemy' : 'player',
        bounceCount: 0
    };

    gameState.rallyResults = [];
    gameState.phase = 'RALLY';

    spawnNextNote();
}

/**
 * Spawn the next note in sequence
 */
export function spawnNextNote() {
    console.log('[Rally] spawnNextNote called, currentLaneIndex:', gameState.rallyState?.currentLaneIndex, 'lanes:', gameState.rallyState?.lanes);

    if (!gameState.rallyState || gameState.rallyState.currentLaneIndex >= gameState.rallyState.lanes.length) {
        console.log('[Rally] All notes processed, calling finishRallyPhase');
        finishRallyPhase();
        return;
    }

    const isPlayerAttacker = gameState.rallyState.attacker === 'player';
    const defenderCards = isPlayerAttacker ? gameState.enemyCards : gameState.playerCards;
    const lane = gameState.rallyState.lanes[gameState.rallyState.currentLaneIndex];
    const defenderCard = defenderCards[lane];

    // Skip destroyed targets
    if (defenderCard.pv <= 0) {
        gameState.rallyState.currentLaneIndex++;
        spawnNextNote();
        return;
    }

    // Calculate positions
    const attackerPos = isPlayerAttacker ?
        layout.cardPositions.player[gameState.rallyState.attackerIndex] :
        layout.cardPositions.enemy[gameState.rallyState.attackerIndex];

    const defenderPos = isPlayerAttacker ?
        layout.cardPositions.enemy[lane] :
        layout.cardPositions.player[lane];

    const startX = attackerPos.x + CARD.WIDTH / 2;
    const startY = attackerPos.y + CARD.HEIGHT / 2;
    const endX = defenderPos.x + CARD.WIDTH / 2;
    const endY = defenderPos.y + CARD.HEIGHT / 2;

    // Check for stacked note delay
    const currentLaneIdx = gameState.rallyState.currentLaneIndex;
    const previousLane = currentLaneIdx > 0 ? gameState.rallyState.lanes[currentLaneIdx - 1] : null;
    const isStackedNote = previousLane === lane;
    const spawnDelay = isStackedNote ? RALLY.STACKED_NOTE_DELAY : 0;

    setTimeout(() => {
        if (!gameState.rallyState) return;

        gameState.currentNote = {
            lane: lane,
            progress: 0,
            startTime: Date.now(),
            duration: RALLY.NOTE_DURATION,
            startX, startY, endX, endY,
            direction: isPlayerAttacker ? 'toEnemy' : 'toPlayer'
        };

        gameState.rallyState.bounceCount = 0;
        gameState.rallyState.currentDefender = isPlayerAttacker ? 'enemy' : 'player';
        gameState.timingIndicator = null;
        gameState.parryAttempted = false;

        animateNote();
    }, spawnDelay);
}

/**
 * Animate note movement using requestAnimationFrame
 */
function animateNote() {
    if (!gameState.currentNote || !gameState.rallyState) return;

    const elapsed = Date.now() - gameState.currentNote.startTime;
    const progress = Math.min(elapsed / gameState.currentNote.duration, 1);

    gameState.currentNote.progress = progress;
    gameState.currentNote.x = gameState.currentNote.startX + (gameState.currentNote.endX - gameState.currentNote.startX) * progress;
    gameState.currentNote.y = gameState.currentNote.startY + (gameState.currentNote.endY - gameState.currentNote.startY) * progress;

    // Start timing indicator at 50% progress
    if (progress >= 0.5 && !gameState.timingIndicator) {
        const remainingTime = gameState.currentNote.duration * 0.5;

        gameState.timingIndicator = {
            startTime: Date.now(),
            duration: remainingTime,
            parryWindow: RALLY.PARRY_WINDOW
        };

        // AI parry when defending
        if (gameState.rallyState.currentDefender === 'enemy') {
            scheduleAIParry(remainingTime);
        }
    }

    renderFn();

    if (progress < 1) {
        requestAnimationFrame(animateNote);
    } else if (!gameState.parryAttempted) {
        // Note reached target without parry - it's a HIT
        handleNoteImpact();
    } else {
        // Parry was attempted - AI setTimeout should handle transition
        // But add a fallback in case the setTimeout fails
        console.log('[Rally] Animation ended with parryAttempted=true, waiting for AI callback...');

        // Fallback: if nothing happens within 500ms, force transition
        setTimeout(() => {
            if (gameState.phase === 'RALLY' && gameState.currentNote && gameState.currentNote.progress >= 1) {
                console.log('[Rally] FALLBACK: Forcing transition after parry timeout');
                gameState.timingIndicator = null;
                gameState.aiParryFlash = null;
                gameState.rallyState.currentLaneIndex++;
                gameState.currentNote = null;
                spawnNextNote();
            }
        }, 500);
    }
}

/**
 * Schedule AI parry attempt
 */
function scheduleAIParry(remainingTime) {
    const parryWindow = gameState.timingIndicator.parryWindow;
    const perfectStart = 1 - (parryWindow / remainingTime);

    const aiDelay = AI_CONFIG.parryDelayMinMs +
        Math.random() * (AI_CONFIG.parryDelayMaxMs - AI_CONFIG.parryDelayMinMs);
    const targetTime = remainingTime * perfectStart + aiDelay;

    setTimeout(() => {
        if (!gameState.currentNote || !gameState.timingIndicator || gameState.parryAttempted) {
            return;
        }

        const parrySuccess = Math.random() < AI_CONFIG.parrySuccessRate;

        // Visual flash
        gameState.aiParryFlash = {
            cardIndex: gameState.currentNote.lane,
            startTime: Date.now()
        };

        gameState.parryAttempted = true;
        console.log('[Rally] AI parryAttempted set to true, parrySuccess:', parrySuccess);

        if (parrySuccess) {
            gameState.rallyResults.push({
                lane: gameState.currentNote.lane,
                result: 'PARRY'
            });
            showImpactFeedback('PARRY');
            console.log('[Rally] AI PARRY success, scheduling next note in', RALLY.IMPACT_DELAY, 'ms');

            // Move to next note after delay
            setTimeout(() => {
                console.log('[Rally] Post-PARRY timeout fired, rallyState exists:', !!gameState.rallyState);
                if (!gameState.rallyState) return;
                gameState.timingIndicator = null;
                gameState.aiParryFlash = null;
                gameState.rallyState.currentLaneIndex++;
                gameState.currentNote = null;
                console.log('[Rally] Calling spawnNextNote after PARRY');
                spawnNextNote();
            }, RALLY.IMPACT_DELAY);
        } else {
            // Failed parry = HIT
            showImpactFeedback('HIT');
            gameState.rallyResults.push({
                lane: gameState.currentNote.lane,
                result: 'HIT',
                damagedSide: 'enemy'
            });
            console.log('[Rally] AI PARRY failed (HIT), scheduling next note in', RALLY.IMPACT_DELAY, 'ms');

            // Move to next note after delay (same as successful parry)
            setTimeout(() => {
                console.log('[Rally] Post-HIT timeout fired, rallyState exists:', !!gameState.rallyState);
                if (!gameState.rallyState) return;
                gameState.timingIndicator = null;
                gameState.aiParryFlash = null;
                gameState.rallyState.currentLaneIndex++;
                gameState.currentNote = null;
                console.log('[Rally] Calling spawnNextNote after HIT');
                spawnNextNote();
            }, RALLY.IMPACT_DELAY);
        }

        // Clear flash
        setTimeout(() => {
            gameState.aiParryFlash = null;
            renderFn();
        }, 150);

    }, targetTime);

    console.log('[Rally] AI parry scheduled for', targetTime, 'ms from now');
}

/**
 * Handle note impact (when note reaches target without parry)
 */
function handleNoteImpact() {
    const defenderSide = gameState.rallyState.currentDefender;

    gameState.rallyResults.push({
        lane: gameState.currentNote.lane,
        result: 'HIT',
        damagedSide: defenderSide
    });

    showImpactFeedback('HIT');

    // Move to next note after delay
    setTimeout(() => {
        if (!gameState.rallyState) return;
        gameState.timingIndicator = null;
        gameState.currentNote = null;
        gameState.rallyState.currentLaneIndex++;
        spawnNextNote();
    }, RALLY.IMPACT_DELAY);
}

/**
 * Attempt player parry
 */
export function attemptParry() {
    if (!gameState.currentNote || !gameState.timingIndicator || gameState.parryAttempted) {
        return;
    }

    gameState.parryAttempted = true;

    const elapsed = Date.now() - gameState.timingIndicator.startTime;
    const timingProgress = elapsed / gameState.timingIndicator.duration;

    const perfectStart = 1 - (gameState.timingIndicator.parryWindow / gameState.timingIndicator.duration);
    const perfectCenter = (perfectStart + 1) / 2;
    const msFromPerfect = Math.abs(elapsed - (perfectCenter * gameState.timingIndicator.duration));
    const isPerfect = msFromPerfect <= 50;

    if (timingProgress >= perfectStart && timingProgress <= 1) {
        // PARRY SUCCESS - bounce note back
        gameState.rallyResults.push({
            lane: gameState.currentNote.lane,
            result: 'PARRY'
        });

        showImpactFeedback(isPerfect ? 'PERFECT' : 'RETURN');

        // Bounce after delay
        setTimeout(() => {
            if (!gameState.rallyState) return;
            bounceNote();
        }, 200);
    } else {
        // PARRY FAILED
        const defenderSide = gameState.rallyState.currentDefender;

        gameState.rallyResults.push({
            lane: gameState.currentNote.lane,
            result: 'HIT',
            damagedSide: defenderSide
        });
        showImpactFeedback('HIT');
    }
}

/**
 * Bounce note back to other side
 */
function bounceNote() {
    if (!gameState.currentNote || !gameState.rallyState) return;

    const note = gameState.currentNote;

    gameState.currentNote = {
        lane: note.lane,
        progress: 0,
        startTime: Date.now(),
        duration: RALLY.NOTE_DURATION,
        startX: note.endX,
        startY: note.endY,
        endX: note.startX,
        endY: note.startY,
        direction: note.direction === 'toEnemy' ? 'toPlayer' : 'toEnemy',
        bouncing: true
    };

    // Swap defender
    gameState.rallyState.currentDefender =
        gameState.rallyState.currentDefender === 'player' ? 'enemy' : 'player';
    gameState.rallyState.bounceCount++;

    gameState.timingIndicator = null;
    gameState.parryAttempted = false;

    animateNote();
}

/**
 * Show impact feedback (HIT!, PARRY!, etc.)
 */
function showImpactFeedback(result) {
    const note = gameState.currentNote;

    const x = note.endX;
    const y = note.endY - 40;

    let text, color;
    if (result === 'PERFECT') {
        text = '✨ PERFECT! ✨';
        color = '#ffd700';
    } else if (result === 'RETURN') {
        text = '↩ RETURN!';
        color = '#f1c40f';
    } else if (result === 'PARRY') {
        text = 'PARRY!';
        color = '#2ecc71';
    } else {
        text = 'HIT!';
        color = '#e74c3c';
    }

    // Add floating text
    const floatingText = {
        text, x, y,
        opacity: 1,
        color,
        startTime: Date.now()
    };
    gameState.floatingTexts.push(floatingText);

    // Animate floating text
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
        gameState.shakeCard = {
            side: defenderSide,
            index: gameState.currentNote.lane,
            frames: 0
        };

        let shakeFrames = 0;
        const shakeInterval = setInterval(() => {
            shakeFrames++;
            gameState.shakeCard.frames = shakeFrames;
            renderFn();

            if (shakeFrames >= 10) {
                clearInterval(shakeInterval);
                gameState.shakeCard = null;
            }
        }, 50);
    }
}

/**
 * Finish rally phase and apply damage
 */
export function finishRallyPhase() {
    console.log('[Rally] finishRallyPhase called, rallyState exists:', !!gameState.rallyState);

    // Guard: if rallyState is already null, we can't proceed properly
    if (!gameState.rallyState) {
        console.error('[Rally] finishRallyPhase called but rallyState is null!');
        // Still try to end the turn - default to player attacker
        if (endTurnFn) {
            endTurnFn('player');
        }
        return;
    }

    // Save attacker before cleanup
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

    if (!enemyAlive) {
        gameState.phase = 'GAME_OVER';
        gameState.gameOver = { winner: 'player', reason: 'All enemy cards destroyed!' };
        cleanupRally();
        renderFn();
        return;
    }

    if (!playerAlive) {
        gameState.phase = 'GAME_OVER';
        gameState.gameOver = { winner: 'enemy', reason: 'All your cards destroyed!' };
        cleanupRally();
        renderFn();
        return;
    }

    cleanupRally();

    // Call endTurn to transition to next player
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
    gameState.timingIndicator = null;
    gameState.assignedNotes = [];
}

// Export for external use
export function getRallyAttacker() {
    return gameState.rallyState ? gameState.rallyState.attacker : null;
}
