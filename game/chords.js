/**
 * Musical Chord Synergy System
 * 
 * Logic for detecting and applying musical chord bonuses.
 */

/**
 * Calculate and apply chord bonuses to a deck of cards
 * @param {Array} cards - The deck of cards (gameState.playerCards or gameState.enemyCards)
 */
export function calculateChordBonuses(cards) {
    // 1. Identification Phase: active chords
    cards.forEach(card => {
        if (!card.requiredCategory) return;

        // Check if required category exists in the deck
        // (excluding self, though usually a card won't require itself)
        const synergyFound = cards.some(other =>
            other !== card && other.category === card.requiredCategory
        );

        card.isChordActive = synergyFound;

        // Reset to base stats before applying bonus (store base if not exists)
        if (card.baseNa === undefined) {
            card.baseNa = card.na;
        } else {
            card.na = card.baseNa;
        }
    });

    // 2. Application Phase: apply bonuses
    cards.forEach(card => {
        if (card.isChordActive) {
            applyChordBonus(card);
        }
    });
}

/**
 * Apply specific bonus based on card identity/category
 */
function applyChordBonus(card) {
    // Specific bonuses based on card name or category

    // Virgil (DO) -> Synergy with SOL -> +2 NA
    if (card.name === 'Virgil' && card.category === 'DO') {
        card.na += 2;
        console.log(`[Chord] ${card.name} activated! +2 NA`);
    }

    // Rovi (RE) -> Synergy with SI -> +1 NA
    else if (card.name === 'Rovi' && card.category === 'RE') {
        card.na += 1;
        console.log(`[Chord] ${card.name} activated! +1 NA`);
    }

    // Future bonuses can be added here
}
