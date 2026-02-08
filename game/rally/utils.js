import { layout } from '../../render/canvas.js';
import { CARD } from '../../data/cards.js';

/**
 * Get lane center X position
 */
export function getLaneCenterX(laneIndex) {
    const pos = layout.cardPositions.player[laneIndex] || layout.cardPositions.enemy[laneIndex];
    return pos ? pos.x + CARD.WIDTH / 2 : 0;
}

/**
 * Get lane start/end Y positions based on direction
 */
export function getLaneYPositions(isPlayerAttacker) {
    const enemyCardY = layout.cardPositions.enemy[0].y;
    const playerCardY = layout.cardPositions.player[0].y;

    // External Parry Points (Discs)
    // "In front" means towards the center of the battlefield
    const enemyParryY = enemyCardY + CARD.HEIGHT + 40; // Below enemy card
    const playerParryY = playerCardY - 40;             // Above player card

    if (isPlayerAttacker) {
        // Player attacking: From Player Shield to Enemy Shield
        return { startY: playerParryY, endY: enemyParryY, parryY: enemyParryY };
    } else {
        // Enemy attacking: From Enemy Shield to Player Shield
        return { startY: enemyParryY, endY: playerParryY, parryY: playerParryY };
    }
}
