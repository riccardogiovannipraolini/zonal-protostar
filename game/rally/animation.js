import { RALLY, AI_CONFIG } from '../../data/cards.js';
import { getCanvas } from '../../render/canvas.js';
import { getLaneCenterX, getLaneYPositions } from './utils.js';
import { showImpactFeedback, showIdentityEffectFeedback } from './effects.js';
import { startTensionLoop } from '../audio.js';
import { handleNoteImpact } from './note.js';

// Circular dependency imports (will be passed as args or imported if possible)
// We need 'scheduleAIParryForNote' which is in parry.js (not yet created) or rally.js
// For now, we will expect it to be passed or we will extract it here if it belongs here.
// 'scheduleAIParryForNote' is logic, but it triggers animation? 
// Actually 'scheduleAIParryForNote' is reaction logic. It belongs in a 'parry.js' or 'ai-reaction.js'.
// But 'animateNotes' calls it.

// Helper to check intersection
function checkCrossed(y, prevY, newY, direction) {
    if (direction === 'toEnemy') {
        return prevY >= y && newY <= y;
    } else {
        return prevY <= y && newY >= y;
    }
}

/**
 * Animate all active notes using requestAnimationFrame
 */
export function animateNotes(gameState, renderFn, checkRallyCompleteFn, scheduleAIParryFn) {
    if (!gameState.rallyState || gameState.activeNotes.length === 0) {
        // Check if rally is complete
        gameState.isAnimating = false;
        if (checkRallyCompleteFn) checkRallyCompleteFn();
        return;
    }

    let anyNoteActive = false;

    // Cache canvas height calculation (used for all notes)
    const canvas = getCanvas();
    const identityLaneY = canvas.height / 2;

    gameState.activeNotes.forEach(note => {
        if (note.resolved) return;

        const elapsed = Date.now() - note.startTime;
        const progress = Math.min(elapsed / note.duration, 1);

        note.progress = progress;
        const previousY = note.y;
        note.x = note.startX; // X stays constant (vertical movement)
        const newY = note.startY + (note.endY - note.startY) * progress;

        // CHECK IDENTITY CARD INTERSECTION (Single Lane at 50%)

        // Check Single Lane Intersection
        if (!note.identityEffectApplied && checkCrossed(identityLaneY, previousY, newY, note.direction)) {
            applyIdentityEffect(gameState, note, renderFn);
            note.identityEffectApplied = true;
        }

        note.y = newY;
        if (progress >= 0.5 && !note.timingIndicator) {
            const remainingTime = note.duration * 0.5;
            // Cache Math.pow result - bounceCount rarely exceeds 5-6
            const bounceCount = note.bounceCount || 0;
            const windowMultiplier = bounceCount <= 10
                ? Math.pow(RALLY.WINDOW_MULTIPLIER_PER_BOUNCE, bounceCount)
                : Math.pow(RALLY.WINDOW_MULTIPLIER_PER_BOUNCE, 10); // Cap at 10 for performance
            const scaledParryWindow = RALLY.PARRY_WINDOW * windowMultiplier;

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
            if (note.direction === 'toEnemy' && !note.aiParryScheduled) {
                note.aiParryScheduled = true;
                if (scheduleAIParryFn) scheduleAIParryFn(note, remainingTime);
            }
        }

        if (progress < 1) {
            anyNoteActive = true;
        } else if (!note.parryAttempted) {
            // Note reached target without parry - it's a HIT
            handleNoteImpact(gameState, note, renderFn, checkRallyCompleteFn);
        }
    });

    renderFn();

    // anyNoteActive already checks if any note is unresolved, no need for .some()
    if (anyNoteActive) {
        requestAnimationFrame(() => animateNotes(gameState, renderFn, checkRallyCompleteFn, scheduleAIParryFn));
    } else {
        gameState.isAnimating = false;
        if (checkRallyCompleteFn) checkRallyCompleteFn();
    }
}

/**
 * Trigger spin animation on a note
 * Optimized to integrate with main animation loop instead of creating separate loop
 */
export function triggerSpinAnimation(gameState, note, callback, renderFn) {
    const duration = 300;
    const startTime = Date.now();
    note.isSpinning = true;
    note.spinStartTime = startTime;
    note.spinDuration = duration;

    // If main animation is already running, it will handle the spin
    // Otherwise, start the animation loop
    if (!gameState.isAnimating) {
        function animateSpin() {
            if (!note.isSpinning || !gameState.rallyState) {
                note.isSpinning = false;
                callback();
                return;
            }

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
    } else {
        // Main animation loop is running, use setTimeout to trigger callback after duration
        setTimeout(() => {
            if (note.isSpinning && gameState.rallyState) {
                note.isSpinning = false;
                note.spinProgress = 1;
                callback();
            }
        }, duration);
    }
}

/**
 * Bounce note back to other side (vertical only)
 * @param {boolean} isPerfect - Whether previous parry was perfect (affects speed)
 */
export function bounceNote(gameState, note, isPerfect = true, checkRallyCompleteFn, scheduleAIParryFn, renderFn) {
    if (!note || !gameState.rallyState) return;

    const newBounceCount = (note.bounceCount || 0) + 1;

    // Calculate velocity-scaled duration
    // If Imperfect: Reset speed to base (remove accumulate multiplier)
    // If Perfect: Stack multiplier normally

    let totalSpeedMultiplier;

    if (isPerfect) {
        // Perfect: Continue stacking speed
        const baseSpeed = RALLY.BASE_SPEED_MULTIPLIER || 1;
        // Optimize: cap bounce count for performance
        const cappedBounce = Math.min(newBounceCount, 15);
        const bounceSpeedMultiplier = Math.pow(RALLY.SPEED_MULTIPLIER_PER_BOUNCE, cappedBounce);
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

    // Continue animation only if not already animating
    // The existing animation loop will pick up the updated note state
    if (!gameState.isAnimating) {
        animateNotes(gameState, renderFn, checkRallyCompleteFn, scheduleAIParryFn);
    }
}

/**
 * Apply identity card effect when note crosses the center lane
 */
function applyIdentityEffect(gameState, note, renderFn) {
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
            showIdentityEffectFeedback(gameState, note, 'SLOW', '#3498db', renderFn);
        }

        // Scudo (Active)
        // "Spend 2 Stamina: Next 3 notes crossing get -50% speed. CD: 3."
        if (card.id === 'SCUDO' && card.active && card.currentCharges > 0) {
            const speedMult = card.value || 0.5;
            applySpeedChange(note, speedMult);
            showIdentityEffectFeedback(gameState, note, 'SHIELD', '#2ecc71', renderFn);

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
