import { RALLY } from '../../data/cards.js';
import { getLaneCenterX, getLaneYPositions } from './utils.js';
import { showImpactFeedback } from './effects.js';

/**
 * Schedule note spawns with simultaneous launch for different lanes
 */
export function scheduleNoteSpawns(gameState, isPlayerAttacker, notesByLane, startAnimationFn) {
    const { startY, endY, parryY } = getLaneYPositions(isPlayerAttacker);

    // Determine detailed speed modifiers per PASSIVE checks
    // 1. Attacker Passive (Origami)
    const attackerCards = isPlayerAttacker ? gameState.playerCards : gameState.enemyCards;
    const attackerCard = attackerCards[gameState.rallyState.attackerIndex];

    let attackerSpeedMult = 1.0;
    if (attackerCard.passive && attackerCard.passive.id === 'SPEED_BOOST') {
        attackerSpeedMult = 1.3;
        console.log('[Passive] Origami Speed Boost Active (30%)');
    }

    Object.keys(notesByLane).forEach(laneStr => {
        const lane = parseInt(laneStr);
        const notesInLane = notesByLane[laneStr];
        const laneX = getLaneCenterX(lane);

        // 2. Target Lane Debuff (Rovi)
        // If Player Attacking -> hitting Enemy Lane -> Check EnemyLaneDebuffs
        const targetDebuffs = isPlayerAttacker ? gameState.enemyLaneDebuffs : gameState.playerLaneDebuffs;
        const laneDebuff = targetDebuffs[lane] || 0;

        // Calculate Speed for this lane/batch
        // Formula: Base * AttackerBonus / (1 + Debuff)
        const combinedSpeedMult = (RALLY.BASE_SPEED_MULTIPLIER * attackerSpeedMult) / (1 + laneDebuff);

        // Calculate Duration based on Speed
        // Parry Point is '1 beat' away at Base Speed
        // duration = BaseDuration / SpeedMult
        const parryDurationFinal = RALLY.NOTE_DURATION / combinedSpeedMult;

        // Calculate Physical Speed (px/ms)
        const distanceToParry = Math.abs(parryY - startY);
        const speedPx = distanceToParry / parryDurationFinal;

        const distanceTotal = Math.abs(endY - startY);
        const totalDurationFinal = distanceTotal / speedPx;

        notesInLane.forEach((_, noteIndex) => {
            const delay = noteIndex * RALLY.STACKED_NOTE_DELAY;

            setTimeout(() => {
                if (!gameState.rallyState) return;

                const note = {
                    id: `${lane}-${noteIndex}`,
                    lane: lane,
                    progress: 0,
                    startTime: Date.now(),
                    duration: parryDurationFinal,
                    totalDuration: totalDurationFinal,
                    startX: laneX,
                    startY: startY,
                    endX: laneX,
                    endY: endY,
                    parryY: parryY,
                    direction: isPlayerAttacker ? 'toEnemy' : 'toPlayer',
                    bounceCount: 0,
                    resolved: false,
                    parryAttempted: false,
                    missedParry: false,
                    attackerColor: attackerCard.noteColor || '#9b59b6',
                    hasSpeedBoost: !!(attackerCard.passive && attackerCard.passive.id === 'SPEED_BOOST')
                };

                gameState.activeNotes.push(note);

                // Start animation loop only if not already running
                if (gameState.activeNotes.length === 1 && !gameState.isAnimating) {
                    gameState.isAnimating = true;
                    if (startAnimationFn) startAnimationFn();
                }
            }, delay);
        });
    });
}

/**
 * Handle note impact (when note reaches target without parry)
 */
export function handleNoteImpact(gameState, note, renderFn, checkRallyCompleteFn) {
    const targetSide = note.direction === 'toPlayer' ? 'player' : 'enemy';
    const targetCards = targetSide === 'player' ?
        gameState.playerCards : gameState.enemyCards;
    const targetCard = targetCards[note.lane];

    // Dead card = fizzle (no damage, note just disappears)
    if (!targetCard || targetCard.pv <= 0) {
        note.resolved = true;
        gameState.rallyState.completedNotes++;
        showImpactFeedback(gameState, 'FIZZLE', note, renderFn);
        return;
    }

    const damagedSide = note.direction === 'toPlayer' ? 'player' : 'enemy';

    gameState.rallyResults.push({
        lane: note.lane,
        result: 'HIT',
        damagedSide: damagedSide
    });

    showImpactFeedback(gameState, 'HIT', note, renderFn);
    note.resolved = true;
    gameState.rallyState.completedNotes++;

    // Check completion immediately or depend on caller?
    // The original code didn't call checkRallyComplete inside handleNoteImpact usually, 
    // BUT animateNotes called it after loop if needed.
    // However, handleNoteImpact is called FROM animateNotes.
    // Wait, let's check original.
    // Original: handleNoteImpact set resolved=true, incomplete++.
    // Then animateNotes loop continues.
    // At end of animateNotes, it checks if anyActive.

    // BUT, for the "Missed Parry" setTimeout case (which calls handleNoteImpact implicitly via duplicate logic), 
    // it IS important.

    // Actually, looking at `scheduleAIParryForNote` in original:
    // It called showImpactFeedback('HIT') then setTimeout -> resolved=true -> checkRallyComplete.

    // We should probably allow passing checkRallyCompleteFn for those async cases,
    // but synchronous calls from animateNotes might not strict need it if animateNotes checks end of frame.
    // Safe to call it? checkRallyComplete checks if all resolved.
    // If called from animateNotes loop, we might be mid-loop.
    // But resolved notes are skipped in loop.

    if (checkRallyCompleteFn) checkRallyCompleteFn();
}
