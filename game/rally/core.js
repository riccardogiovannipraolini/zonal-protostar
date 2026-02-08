import { RALLY, AI_CONFIG, CARD } from '../../data/cards.js';
import { layout, getCanvas } from '../../render/canvas.js';
import { getLaneCenterX, getLaneYPositions } from './utils.js';
import { showImpactFeedback, showStaminaChange, showIdentityEffectFeedback } from './effects.js';
import { scheduleNoteSpawns, handleNoteImpact } from './note.js';
import { animateNotes, triggerSpinAnimation, bounceNote } from './animation.js';
import { scheduleAIParryForNote as scheduleAIParryImpl, attemptParryLogic as attemptParryImpl } from './parry.js';

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
    scheduleNoteSpawns(gameState, isPlayerAttacker, notesByLane, startAnimationLoop);
}

/**
 * Wrapper to start animation loop with dependencies
 */
function startAnimationLoop() {
    animateNotes(gameState, renderFn, checkRallyComplete, scheduleAIParryForNote);
}

/**
 * Wrapper for AI Parry Scheduling (to inject dependencies)
 */
function scheduleAIParryForNote(note, remainingTime) {
    scheduleAIParryImpl(gameState, note, remainingTime, renderFn, checkRallyComplete, scheduleAIParryForNote);
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
        const isPlayerHit = hit.damagedSide === 'player';
        const targetCards = isPlayerHit ? gameState.playerCards : gameState.enemyCards;
        const targetCard = targetCards[hit.lane];

        if (targetCard && targetCard.pv > 0) {
            targetCard.pv -= 1;
            if (targetCard.pv < 0) targetCard.pv = 0;

            // --- PASSIVE: ROVI (THORNS) ---
            if (targetCard.passive && targetCard.passive.id === 'THORNS') {
                const debuffArr = isPlayerHit ? gameState.playerLaneDebuffs : gameState.enemyLaneDebuffs;
                debuffArr[hit.lane] += 0.3;

                // Show feedback
                const x = getLaneCenterX(hit.lane);
                const y = isPlayerHit ? layout.cardPositions.player[hit.lane].y : layout.cardPositions.enemy[hit.lane].y;
                showIdentityEffectFeedback(gameState, { x, y }, 'THORNS! NEXT TURN SLOWED', '#8bc34a', renderFn);
                console.log(`[Passive] Rovi Triggered on lane ${hit.lane}. Debuff: ${debuffArr[hit.lane].toFixed(1)}`);
            }
        }
    });

    // --- PASSIVE: SALVATAGGIO (RESURRECT) ---
    // Check both sides for resurrection opportunities
    ['player', 'enemy'].forEach(side => {
        const cards = side === 'player' ? gameState.playerCards : gameState.enemyCards;
        const passivesUsed = side === 'player' ? gameState.playerPassivesUsed : gameState.enemyPassivesUsed;

        // Find Salvataggio
        const salvataggioIndex = cards.findIndex(c => c.name === 'Salvataggio');
        const salvataggio = cards[salvataggioIndex];

        // Check if Salvataggio is viable
        if (salvataggio && salvataggio.pv > 0 && !passivesUsed[salvataggioIndex]) {
            // Find a card that is dead (PV <= 0)
            // Note: In a real game we might want to track if they died *just now*, but for prototype,
            // reviving any dead card is fine as long as it happens once per battle.
            const deadCardIndex = cards.findIndex(c => c.pv <= 0);

            if (deadCardIndex !== -1) {
                // Trigger Revive
                const deadCard = cards[deadCardIndex];
                deadCard.pv = 1;
                passivesUsed[salvataggioIndex] = true;

                // Feedback
                const pos = side === 'player' ? layout.cardPositions.player[deadCardIndex] : layout.cardPositions.enemy[deadCardIndex];
                showIdentityEffectFeedback(gameState, { x: pos.x + CARD.WIDTH / 2, y: pos.y + CARD.HEIGHT / 2 }, 'RESURRECTED!', '#ffd700', renderFn);
                console.log(`[Passive] Salvataggio revived ${deadCard.name} on ${side} side.`);

                // Also show indicator on Salvataggio
                const salvPos = side === 'player' ? layout.cardPositions.player[salvataggioIndex] : layout.cardPositions.enemy[salvataggioIndex];
                showIdentityEffectFeedback(gameState, { x: salvPos.x + CARD.WIDTH / 2, y: salvPos.y }, 'SAVING GRACE!', '#ffffff', renderFn);
            }
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

    // Cleanup temporary debuffs for the ATTACKER (since they just used their turn)
    if (gameState.rallyState) {
        const attackerSide = gameState.rallyState.attacker;
        const attackerDebuffs = attackerSide === 'player' ? gameState.playerLaneDebuffs : gameState.enemyLaneDebuffs;

        // Reset all to 0
        for (let i = 0; i < 4; i++) attackerDebuffs[i] = 0;
        console.log(`[Rally] Resetting lane debuffs for ${attackerSide}`);
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
    gameState.isAnimating = false;
    gameState.timingIndicator = null;
    gameState.assignedNotes = [];
}

// Export for external use
export function getRallyAttacker() {
    return gameState.rallyState ? gameState.rallyState.attacker : null;
}

// Legacy export for compatibility (removed)
// export function spawnNextNote() { ... }

/**
 * Attempt player parry on a specific lane (QWER keys)
 * @param {number|null} targetLane - Lane to parry (0-3), or null for any lane
 */
export function attemptParry(targetLane = null) {
    attemptParryImpl(gameState, targetLane, renderFn, checkRallyComplete, scheduleAIParryForNote);
}
