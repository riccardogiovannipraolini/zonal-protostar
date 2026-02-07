// ===== AI TURN LOGIC =====
// Enhanced AI with stamina handling, focus fire, and smart targeting

import { AI_CONFIG } from '../data/cards.js';
import { startRallyPhase } from './rally.js';
import { isLanePlayable } from './rules.js';

// Module-level references
let gameState = null;
let renderFn = null;

/**
 * Initialize AI module with game state reference
 */
export function initAI(state, render) {
    gameState = state;
    renderFn = render;
}

/**
 * Get AI cards that have stamina > 0 and are alive
 */
function getAvailableAiCards() {
    return gameState.enemyCards
        .map((c, i) => ({ card: c, index: i }))
        .filter(c => c.card.pv > 0);  // AI stamina is global, not per-card
}

/**
 * Find the player's lowest PV card (for focus fire targeting)
 */
function findLowestPvPlayerLane() {
    let lowestPv = Infinity;
    let lowestLane = -1;

    gameState.playerCards.forEach((card, lane) => {
        if (card.pv > 0 && card.pv < lowestPv) {
            lowestPv = card.pv;
            lowestLane = lane;
        }
    });

    return lowestLane;
}

/**
 * Decide how many notes to use (stamina saving logic)
 */
function decideNoteCount(maxNotes) {
    if (maxNotes <= 1) return maxNotes;

    // 20% chance to save stamina
    if (Math.random() < AI_CONFIG.staminaSaveChance) {
        // Use 1-2 fewer notes
        const reduction = Math.floor(Math.random() * 2) + 1;
        const savedNotes = Math.max(1, maxNotes - reduction);
        console.log('[AI] Saving stamina, using', savedNotes, 'notes instead of', maxNotes);
        return savedNotes;
    }

    return maxNotes;
}

/**
 * Distribute notes with focus fire logic
 */
function distributeNotes(noteCount, aliveLanes) {
    if (noteCount <= 0 || aliveLanes.length === 0) return [];

    const assignedNotes = [];

    // 30% chance to focus fire
    const shouldFocusFire = Math.random() < AI_CONFIG.focusFireChance && noteCount >= 2;

    if (shouldFocusFire) {
        // Focus on lowest PV player card
        const targetLane = findLowestPvPlayerLane();

        if (targetLane >= 0 && aliveLanes.includes(targetLane) && isLanePlayable(gameState, targetLane)) {
            console.log('[AI] Focus fire on lane', targetLane, 'with', noteCount, 'notes');
            for (let i = 0; i < noteCount; i++) {
                assignedNotes.push(targetLane);
            }
            return assignedNotes;
        }
    }

    // Normal distribution - spread across lanes
    for (let i = 0; i < noteCount; i++) {
        const lane = aliveLanes[Math.floor(Math.random() * aliveLanes.length)];
        assignedNotes.push(lane);
    }

    return assignedNotes;
}

/**
 * Execute AI turn with new mechanics
 */
export function aiTurn() {
    // Get alive AI cards
    const aliveAiCards = getAvailableAiCards();

    if (aliveAiCards.length === 0) {
        console.log('[AI] No alive cards, skipping turn');
        return;
    }

    // Check if AI has stamina
    if (gameState.enemyStamina <= 0) {
        console.log('[AI] No stamina, skipping attack phase');
        // AI might still need to end turn, handled by caller
        return;
    }

    renderFn();

    // Selection delay
    setTimeout(() => {
        // Select a random alive card
        const aiChoice = aliveAiCards[Math.floor(Math.random() * aliveAiCards.length)];
        gameState.selectedCard = aiChoice.index;

        console.log('[AI] Selected card:', gameState.enemyCards[aiChoice.index].name);
        renderFn();

        // Transition to DISTRIBUTION
        setTimeout(() => {
            gameState.phase = 'DISTRIBUTION';
            renderFn();

            // Distribution delay
            setTimeout(() => {
                const aiCard = gameState.enemyCards[aiChoice.index];

                // Get playable lanes (both player and enemy cards must be alive)
                const aliveLanes = [0, 1, 2, 3].filter(lane => isLanePlayable(gameState, lane));

                // Max notes = min of card's NA, available lanes, and AI stamina
                const maxNotes = Math.min(aiCard.na, aliveLanes.length, gameState.enemyStamina);

                // Decide actual note count (may save stamina)
                const noteCount = decideNoteCount(maxNotes);

                // Distribute notes (may focus fire)
                gameState.assignedNotes = distributeNotes(noteCount, aliveLanes);

                // Consume stamina
                gameState.enemyStamina -= gameState.assignedNotes.length;
                if (gameState.enemyStamina < 0) gameState.enemyStamina = 0;

                console.log('[AI] Assigned', gameState.assignedNotes.length, 'notes, stamina:', gameState.enemyStamina);
                renderFn();

                // Start rally
                setTimeout(() => {
                    if (gameState.assignedNotes.length > 0) {
                        startRallyPhase('enemy', aiChoice.index);
                    }
                }, 500);

            }, AI_CONFIG.distributionDelayMs);
        }, 300);

    }, AI_CONFIG.selectionDelayMs);
}

/**
 * AI Reposition Phase Logic
 */
export function aiRepositionPhase() {
    console.log('[AI] Starting Reposition Phase');

    // 20% chance to swap
    const shouldSwap = Math.random() < 0.2;

    if (shouldSwap) {
        // Simple logic: Swap a low HP card with a high HP card?
        // Or just random swap for "tactics" simulation

        // Let's find lowest HP active card
        let lowestIdx = -1;
        let lowestPv = Infinity;
        gameState.enemyCards.forEach((c, i) => {
            if (c.pv > 0 && c.pv < lowestPv) {
                lowestPv = c.pv;
                lowestIdx = i;
            }
        });

        // Find best candidate to swap with (e.g., highest HP)
        let highestIdx = -1;
        let highestPv = -1;
        gameState.enemyCards.forEach((c, i) => {
            if (i !== lowestIdx && c.pv > highestPv) {
                highestPv = c.pv;
                highestIdx = i;
            }
        });

        if (lowestIdx !== -1 && highestIdx !== -1) {
            console.log(`[AI] Repositioning: Swapping ${lowestIdx} (${gameState.enemyCards[lowestIdx].name}) with ${highestIdx} (${gameState.enemyCards[highestIdx].name})`);

            // Swap
            const temp = gameState.enemyCards[lowestIdx];
            gameState.enemyCards[lowestIdx] = gameState.enemyCards[highestIdx];
            gameState.enemyCards[highestIdx] = temp;

            renderFn();
        }
    } else {
        console.log('[AI] Skipping Reposition');
    }

    // Proceed to Selection
    setTimeout(() => {
        gameState.phase = 'SELECTION';
        renderFn();

        // Trigger AI Selection Logic
        setTimeout(() => aiTurn(), 500);
    }, 1000);
}
