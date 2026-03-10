import { RALLY, AI_CONFIG } from '../../data/cards.js';
import { showImpactFeedback, showStaminaChange } from './effects.js';
import { triggerSpinAnimation, bounceNote } from './animation.js';
import { handleNoteImpact } from './note.js';

/**
 * Schedule AI parry for a specific note
 */
export function scheduleAIParryForNote(gameState, note, remainingTime, renderFn, checkRallyCompleteFn, scheduleAIParryFn) {
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
                showStaminaChange(gameState, 0.5, 'enemy', renderFn);

                gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
                showImpactFeedback(gameState, 'PERFECT', note, renderFn);
                handleParrySuccess(gameState, note, true, renderFn, checkRallyCompleteFn, scheduleAIParryFn);
            } else {
                // Imperfect: -0.5 Stamina
                gameState.enemyStamina -= 0.5;
                showStaminaChange(gameState, -0.5, 'enemy', renderFn);

                gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
                showImpactFeedback(gameState, 'GOOD', note, renderFn); // Yellow
                handleParrySuccess(gameState, note, false, renderFn, checkRallyCompleteFn, scheduleAIParryFn);
            }
        } else {
            // Failed parry = HIT
            const damagedSide = note.direction === 'toPlayer' ? 'player' : 'enemy';
            showImpactFeedback(gameState, 'HIT', note, renderFn);
            gameState.rallyResults.push({
                lane: note.lane,
                result: 'HIT',
                damagedSide: damagedSide
            });

            setTimeout(() => {
                note.resolved = true;
                gameState.rallyState.completedNotes++;
                if (checkRallyCompleteFn) checkRallyCompleteFn();
                if (renderFn) renderFn();
            }, RALLY.IMPACT_DELAY);
        }

        // Clear flash
        setTimeout(() => {
            gameState.aiParryFlash = null;
            if (renderFn) renderFn();
        }, 150);

    }, targetTime);
}

/**
 * Attempt player parry on a specific lane (QWER keys)
 * @param {number|null} targetLane - Lane to parry (0-3), or null for any lane
 */
export function attemptParryLogic(gameState, targetLane = null, renderFn, checkRallyCompleteFn, scheduleAIParryFn) {
    if (!gameState.activeNotes) return;

    // Find note on the specified lane (or first unresolved if no lane specified)
    const note = gameState.activeNotes.find(n =>
        !n.resolved &&
        !n.parryAttempted &&
        n.timingIndicator &&
        n.direction === 'toPlayer' &&
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
    // Optimize: pre-calculate common bounce counts or use iterative multiplication
    const shrinkFactor = bounceCount <= 10
        ? Math.pow(0.8, bounceCount)
        : Math.pow(0.8, 10); // Cap at 10 for performance
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
        showStaminaChange(gameState, 0.5, 'player', renderFn);

        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback(gameState, 'PERFECT', note, renderFn); // Green

        handleParrySuccess(gameState, note, true, renderFn, checkRallyCompleteFn, scheduleAIParryFn); // true = isPerfect

    } else if (isInWindow && canAffordImperfect) {
        // === 2. IMPERFECT PARRY ===
        // Limit: Inside scaled window but > 50ms from center
        // Condition: Player must have > 0 stamina
        // Effect: Bounce back + Speed Reset (Base) + Stamina Cost (-0.5)

        // Stamina cost (-0.5)
        gameState.playerStamina -= 0.5;
        // No min cap, can go negative
        showStaminaChange(gameState, -0.5, 'player', renderFn);

        gameState.rallyResults.push({ lane: note.lane, result: 'PARRY' });
        showImpactFeedback(gameState, 'GOOD', note, renderFn); // Yellow

        handleParrySuccess(gameState, note, false, renderFn, checkRallyCompleteFn, scheduleAIParryFn); // false = not perfect (imperfect)

    } else {
        // === 3. MISS ===
        // Outside window OR inside imperfect window but 0 stamina
        // Effect: Damage + Rally Ends

        const damagedSide = note.direction === 'toPlayer' ? 'player' : 'enemy';

        gameState.rallyResults.push({
            lane: note.lane,
            result: 'HIT',
            damagedSide: damagedSide
        });
        showImpactFeedback(gameState, 'HIT', note, renderFn);

        setTimeout(() => {
            note.resolved = true;
            gameState.rallyState.completedNotes++;
            if (checkRallyCompleteFn) checkRallyCompleteFn();
            if (renderFn) renderFn();
        }, RALLY.IMPACT_DELAY);
    }
}

/**
 * Handle successful parry (bounce logic wrapper)
 */
export function handleParrySuccess(gameState, note, isPerfect, renderFn, checkRallyCompleteFn, scheduleAIParryFn) {
    const currentBounceCount = (note.bounceCount || 0) + 1;

    if (currentBounceCount >= RALLY.MAX_BOUNCES) {
        // STALEMATE
        gameState.rallyResults.push({ lane: note.lane, result: 'STALEMATE' });
        showImpactFeedback(gameState, 'STALEMATE', note, renderFn);
        note.resolved = true;
        gameState.rallyState.completedNotes++;
        return;
    }

    triggerSpinAnimation(gameState, note, () => {
        if (!gameState.rallyState) return;
        bounceNote(gameState, note, isPerfect, checkRallyCompleteFn, scheduleAIParryFn, renderFn);
    }, renderFn);
}
