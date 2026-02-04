// ===== AI TURN LOGIC =====

import { AI_CONFIG } from '../data/cards.js';
import { startRallyPhase } from './rally.js';

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
 * Execute AI turn
 */
export function aiTurn() {
    // Get alive AI cards
    const aliveAiCards = gameState.enemyCards
        .map((c, i) => ({ card: c, index: i }))
        .filter(c => c.card.pv > 0);

    if (aliveAiCards.length === 0) return;

    renderFn();

    // Selection delay
    setTimeout(() => {
        const aiChoice = aliveAiCards[Math.floor(Math.random() * aliveAiCards.length)];
        gameState.selectedCard = aiChoice.index;

        renderFn();

        // Transition to DISTRIBUTION
        setTimeout(() => {
            gameState.phase = 'DISTRIBUTION';
            renderFn();

            // Distribution delay
            setTimeout(() => {
                const aiCard = gameState.enemyCards[aiChoice.index];

                // Get alive player lanes
                const aliveLanes = [0, 1, 2, 3].filter(lane => gameState.playerCards[lane].pv > 0);
                const maxNotes = Math.min(aiCard.na, aliveLanes.length, gameState.enemyStamina);

                gameState.assignedNotes = [];

                if (AI_CONFIG.preferAliveTargets && aliveLanes.length > 0 && maxNotes > 0) {
                    for (let i = 0; i < maxNotes; i++) {
                        const lane = aliveLanes[Math.floor(Math.random() * aliveLanes.length)];
                        gameState.assignedNotes.push(lane);
                    }
                } else if (maxNotes > 0) {
                    for (let i = 0; i < maxNotes && aliveLanes.length > 0; i++) {
                        const randomIndex = Math.floor(Math.random() * aliveLanes.length);
                        const lane = aliveLanes[randomIndex];
                        gameState.assignedNotes.push(lane);
                    }
                }

                // Consume stamina
                gameState.enemyStamina -= gameState.assignedNotes.length;
                if (gameState.enemyStamina < 0) gameState.enemyStamina = 0;

                renderFn();

                // Start rally
                setTimeout(() => {
                    startRallyPhase('enemy', aiChoice.index);
                }, 500);

            }, AI_CONFIG.distributionDelayMs);
        }, 300);

    }, AI_CONFIG.selectionDelayMs);
}
