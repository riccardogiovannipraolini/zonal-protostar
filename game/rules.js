/**
 * Game Rules Helper Functions
 */

/**
 * Check if a lane is playable (both cards at ends are alive)
 * @param {Object} gameState - The current game state
 * @param {number} laneIndex - The index of the lane (0-3)
 * @returns {boolean} - True if the lane is playable
 */
export function isLanePlayable(gameState, laneIndex) {
    if (!gameState || laneIndex < 0 || laneIndex > 3) return false;
    
    const playerCard = gameState.playerCards[laneIndex];
    const enemyCard = gameState.enemyCards[laneIndex];
    
    // Lane is playable only if BOTH cards are alive (hp > 0)
    return playerCard.pv > 0 && enemyCard.pv > 0;
}
