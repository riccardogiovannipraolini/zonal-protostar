// ===== CARD RENDERING =====

import { CARD, COLORS } from '../data/cards.js';
import { getCtx, getCanvas, drawHeart, drawEmptyHeart, layout } from './canvas.js';

/**
 * Draw the battlefield background
 */
export function drawBattlefield() {
    const ctx = getCtx();
    const canvas = getCanvas();

    // Radial gradient background
    const bgGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, 400
    );
    bgGradient.addColorStop(0, '#1a1a2e');
    bgGradient.addColorStop(1, '#0a0a14');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center divider line
    ctx.save();
    const lineGradient = ctx.createLinearGradient(0, canvas.height / 2, canvas.width, canvas.height / 2);
    lineGradient.addColorStop(0, 'transparent');
    lineGradient.addColorStop(0.2, '#e94560');
    lineGradient.addColorStop(0.5, '#ffd700');
    lineGradient.addColorStop(0.8, '#e94560');
    lineGradient.addColorStop(1, 'transparent');

    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(50, canvas.height / 2);
    ctx.lineTo(canvas.width - 50, canvas.height / 2);
    ctx.stroke();
    ctx.restore();

    // VS symbol
    ctx.save();
    ctx.fillStyle = '#e94560';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#e94560';
    ctx.shadowBlur = 20;
    ctx.fillText('⚔ VS ⚔', canvas.width / 2, canvas.height / 2);
    ctx.restore();

    // Side labels
    ctx.save();
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('ENEMY', canvas.width / 2, 45);

    ctx.fillStyle = '#51cf66';
    ctx.fillText('PLAYER', canvas.width / 2, canvas.height - 12);
    ctx.restore();
}

/**
 * Draw a single card
 */
export function drawCard(x, y, card, isEnemy, index, gameState) {
    const ctx = getCtx();
    const gradient = isEnemy ? COLORS.enemyCard : COLORS.playerCard;

    // State checks
    const isSelected = !isEnemy && gameState.selectedCard === index;
    const isEnemySelected = isEnemy && gameState.currentTurn === 'enemy' && gameState.selectedCard === index;
    const isTarget = isEnemy && gameState.targetCard === index;
    const isSelectable = !isEnemy && card.pv > 0 && gameState.phase === 'SELECTION' && gameState.currentTurn === 'player';
    const isTargetable = isEnemy && card.pv > 0 && gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player';
    const isDead = card.pv <= 0;
    const hasAIFlash = isEnemy && gameState.aiParryFlash && gameState.aiParryFlash.cardIndex === index;

    // Shake animation offset
    let shakeOffsetX = 0;
    if (gameState.shakeCard &&
        gameState.shakeCard.side === (isEnemy ? 'enemy' : 'player') &&
        gameState.shakeCard.index === index) {
        shakeOffsetX = Math.sin(gameState.shakeCard.frames * 2) * 8;
    }
    x += shakeOffsetX;

    // Card shadow
    ctx.save();
    ctx.shadowColor = isSelected ? 'rgba(255, 234, 0, 0.8)' : isTarget ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = isSelected || isTarget ? 20 : 10;
    ctx.shadowOffsetY = isSelected || isTarget ? 0 : 3;

    // Card background
    const bgGradient = ctx.createLinearGradient(x, y, x, y + CARD.HEIGHT);
    if (isDead) {
        bgGradient.addColorStop(0, '#333333');
        bgGradient.addColorStop(1, '#1a1a1a');
    } else {
        bgGradient.addColorStop(0, gradient.top);
        bgGradient.addColorStop(1, gradient.bottom);
    }

    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.roundRect(x, y, CARD.WIDTH, CARD.HEIGHT, 8);
    ctx.fill();
    ctx.restore();

    // Card border
    ctx.save();
    if (hasAIFlash) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 25;
    } else if (isEnemySelected) {
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff8c00';
        ctx.shadowBlur = 15;
    } else if (isSelected) {
        ctx.strokeStyle = COLORS.selectedBorder;
        ctx.lineWidth = 3;
        ctx.shadowColor = COLORS.selectedBorder;
        ctx.shadowBlur = 15;
    } else if (isTarget) {
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff4757';
        ctx.shadowBlur = 15;
    } else {
        ctx.strokeStyle = isDead ? '#666666' : COLORS.cardBorder;
        ctx.lineWidth = 2;
        ctx.shadowColor = isDead ? 'transparent' : COLORS.cardBorder;
        ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, CARD.WIDTH, CARD.HEIGHT, 8);
    ctx.stroke();
    ctx.restore();

    // Selectable indicator
    if (isSelectable && !isSelected) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 234, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.roundRect(x - 2, y - 2, CARD.WIDTH + 4, CARD.HEIGHT + 4, 10);
        ctx.stroke();
        ctx.restore();
    }

    // Targetable indicator
    if (isTargetable && !isTarget) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 71, 87, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.roundRect(x - 2, y - 2, CARD.WIDTH + 4, CARD.HEIGHT + 4, 10);
        ctx.stroke();
        ctx.restore();
    }

    // Inner decorative border
    ctx.strokeStyle = isDead ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 5, y + 5, CARD.WIDTH - 10, CARD.HEIGHT - 10, 5);
    ctx.stroke();

    // Card name
    ctx.save();
    ctx.fillStyle = isDead ? '#666666' : COLORS.text;
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(card.name, x + CARD.WIDTH / 2, y + 22);
    ctx.restore();

    // Line under name
    ctx.strokeStyle = isDead ? '#444444' : COLORS.cardBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 32);
    ctx.lineTo(x + CARD.WIDTH - 12, y + 32);
    ctx.stroke();

    // Avatar circle
    ctx.fillStyle = isDead ? 'rgba(100, 100, 100, 0.1)' : 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(x + CARD.WIDTH / 2, y + 60, 20, 0, Math.PI * 2);
    ctx.fill();

    // First letter as avatar
    ctx.save();
    ctx.fillStyle = isDead ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.name[0], x + CARD.WIDTH / 2, y + 60);
    ctx.restore();

    // Dead overlay
    if (isDead) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(x, y, CARD.WIDTH, CARD.HEIGHT, 8);
        ctx.fill();

        ctx.fillStyle = '#ff4757';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', x + CARD.WIDTH / 2, y + CARD.HEIGHT / 2);
        ctx.restore();
    }

    // PV label
    ctx.save();
    ctx.fillStyle = isDead ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.7)';
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PV', x + CARD.WIDTH / 2, y + CARD.HEIGHT - 35);
    ctx.restore();

    // Draw hearts
    const heartSize = 12;
    const heartSpacing = 16;
    const heartsWidth = card.maxPv * heartSpacing - (heartSpacing - heartSize);
    const heartsStartX = x + (CARD.WIDTH - heartsWidth) / 2;

    for (let i = 0; i < card.maxPv; i++) {
        if (i < card.pv) {
            drawHeart(heartsStartX + (i * heartSpacing) + heartSize / 2, y + CARD.HEIGHT - 25, heartSize);
        } else {
            drawEmptyHeart(heartsStartX + (i * heartSpacing) + heartSize / 2, y + CARD.HEIGHT - 25, heartSize);
        }
    }
}

/**
 * Draw all cards
 */
export function drawAllCards(gameState) {
    const positions = layout.cardPositions;

    // Enemy cards
    for (let i = 0; i < gameState.enemyCards.length; i++) {
        const pos = positions.enemy[i];
        drawCard(pos.x, pos.y, gameState.enemyCards[i], true, i, gameState);
    }

    // Player cards
    for (let i = 0; i < gameState.playerCards.length; i++) {
        const pos = positions.player[i];
        drawCard(pos.x, pos.y, gameState.playerCards[i], false, i, gameState);
    }
}
