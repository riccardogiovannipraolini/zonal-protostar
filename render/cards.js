// ===== CARD RENDERING =====

import { CARD, COLORS, MUSICAL_CATEGORIES } from '../data/cards.js';
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

    // VS symbol removed as requested

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
    // PERFORMANCE: Reduce shadow blur for performance (selected/target cards)
    ctx.shadowBlur = isSelected || isTarget ? 10 : 0;
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

    if (isDead) {
        ctx.globalAlpha = 0.5;
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
        ctx.shadowBlur = 10;
    } else if (isEnemySelected) {
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff8c00';
        ctx.shadowBlur = 8;
    } else if (isSelected) {
        ctx.strokeStyle = COLORS.selectedBorder;
        ctx.lineWidth = 3;
        // PERFORMANCE: Disable extreme shadow blur on selected cards, just keep the border thicker
        ctx.shadowColor = COLORS.selectedBorder;
        ctx.shadowBlur = 8;
    } else if (isTarget) {
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 3;
        // PERFORMANCE: Reduce target shadow blur
        ctx.shadowColor = '#ff4757';
        ctx.shadowBlur = 8;
    } else {
        ctx.strokeStyle = isDead ? '#666666' : COLORS.cardBorder;
        ctx.lineWidth = 2;
        ctx.shadowColor = isDead ? 'transparent' : COLORS.cardBorder;
        ctx.shadowBlur = 0;
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
    // PERFORMANCE: Remove text shadows on card numbers
    // ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    // ctx.shadowBlur = 3;
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

    // Dead overlay and grayscale effect simulation
    if (isDead) {
        // Grayscale overlay
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.fillRect(x, y, CARD.WIDTH, CARD.HEIGHT);
        ctx.restore();

        // Dark overlay
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(x, y, CARD.WIDTH, CARD.HEIGHT, 8);
        ctx.fill();

        // Skull icon
        ctx.fillStyle = '#ff4757';
        ctx.font = 'bold 30px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // PERFORMANCE: Remove shadow on skull text
        // ctx.shadowColor = '#000';
        // ctx.shadowBlur = 10;
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

    // Musical Category Icon
    if (card.category) {
        const cat = MUSICAL_CATEGORIES[card.category];
        if (cat) {
            ctx.save();

            // Background circle for icon
            ctx.fillStyle = card.isChordActive ? '#ffd700' : 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(x + 15, y + 15, 10, 0, Math.PI * 2);
            ctx.fill();

            // Icon Text
            ctx.fillStyle = card.isChordActive ? '#000000' : '#ffffff';
            ctx.font = 'bold 10px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cat.icon, x + 15, y + 15);

            // Active Chord Glow/Indicator
            if (card.isChordActive) {
                // Glow effect on border already handled by checking isChordActive? 
                // Let's add specific text or icon for synergy
                ctx.fillStyle = '#ffd700';
                ctx.font = '10px "Segoe UI", sans-serif';
                ctx.fillText('♪', x + CARD.WIDTH - 15, y + 15);
            }

            ctx.restore();
        }
    }

    // NA Stat Display (Boosted?)
    ctx.save();
    const naColor = (card.baseNa !== undefined && card.na > card.baseNa) ? '#2ecc71' : '#3498db';
    ctx.fillStyle = naColor;
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${card.na} 🎵`, x + CARD.WIDTH - 8, y + CARD.HEIGHT - 8);
    ctx.restore();
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

    // Identity Cards & Lanes
    drawHorizontalLanes(gameState);
    drawIdentityCards(gameState);
}

/**
 * Draw Identity Cards at edges
 */
function drawIdentityCards(gameState) {
    const positions = layout.identityCardPositions;

    // Player Identity Cards
    if (gameState.playerIdentityCards) {
        gameState.playerIdentityCards.forEach((card, index) => {
            if (card && positions.player[index]) {
                drawSingleIdentityCard(positions.player[index], card, 'player');
            }
        });
    }

    // Enemy Identity Cards
    /*
    if (gameState.enemyIdentityCards) {
        gameState.enemyIdentityCards.forEach((card, index) => {
            if (card && positions.enemy[index]) {
                drawSingleIdentityCard(positions.enemy[index], card, 'enemy');
            }
        });
    }
    */
}

/**
 * Draw a single identity card
 */
/**
 * Draw a single identity card
 */
function drawSingleIdentityCard(pos, card, side) {
    const ctx = getCtx();
    const isPlayer = side === 'player';

    // Card background
    ctx.save();

    // Check for Active State (Scudo)
    if (card.active) {
        ctx.fillStyle = isPlayer ? '#2c3e50' : '#8e44ad';
        ctx.strokeStyle = '#2ecc71'; // Green Glow
        ctx.lineWidth = 3;
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = 8;
    } else if (card.type === 'ACTIVE' && card.currentCooldown === 0 && isPlayer) {
        // Ready to activate
        ctx.fillStyle = isPlayer ? '#2c3e50' : '#8e44ad';
        ctx.strokeStyle = '#f1c40f'; // Gold
        ctx.lineWidth = 2;
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#f1c40f';
    } else {
        ctx.fillStyle = isPlayer ? '#2c3e50' : '#8e44ad';
        ctx.strokeStyle = isPlayer ? '#3498db' : '#9b59b6';
        ctx.lineWidth = 2;
        // PERFORMANCE: No shadow on static items
        // ctx.shadowBlur = 10;
        // ctx.shadowColor = 'rgba(0,0,0,0.5)';
    }

    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y, pos.width, pos.height, 6);
    ctx.fill();
    ctx.stroke();

    // Scudo Active Header/Overlay
    if (card.active) {
        ctx.fillStyle = '#2ecc71';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("ACTIVE!", pos.x + pos.width / 2, pos.y - 10);

        // Show Charges
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.fillText(`⚡ ${card.currentCharges}`, pos.x + pos.width / 2, pos.y + pos.height / 2 + 20);
    }
    else if (card.currentCooldown > 0) {
        // Cooldown Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(pos.x, pos.y, pos.width, pos.height, 6);
        ctx.fill();

        ctx.fillStyle = '#bdc3c7';
        ctx.font = 'bold 24px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(card.currentCooldown, pos.x + pos.width / 2, pos.y + pos.height / 2);

        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.fillText("COOLDOWN", pos.x + pos.width / 2, pos.y + pos.height / 2 + 20);
    } else if (card.type === 'ACTIVE' && isPlayer) {
        // "Click to Activate" hint
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'italic 9px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("CLICK ACTIVATE", pos.x + pos.width / 2, pos.y + pos.height + 12);
        ctx.fillText(`(2 Stamina)`, pos.x + pos.width / 2, pos.y + pos.height + 22);
    }

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';

    // Split name if too long
    const words = card.name.split(' ');
    ctx.fillText(words[0], pos.x + pos.width / 2, pos.y + 20);
    if (words[1]) ctx.fillText(words[1], pos.x + pos.width / 2, pos.y + 32);

    // NO HP for Identity Cards

    ctx.restore();
}

/**
 * Draw Horizontal Lanes projected by Identity Cards
 */
/**
 * Draw Horizontal Lanes projected by Identity Cards
 */
/**
 * Draw Horizontal Lanes projected by Identity Cards
 */
export function drawHorizontalLanes(gameState) {
    const ctx = getCtx();
    const canvas = getCanvas();
    const y = layout.identityLaneY || canvas.height / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);

    // Determine Lane Style based on ALL cards (Player + Enemy)
    const allCards = [
        ...(gameState.playerIdentityCards || []),
        ...(gameState.enemyIdentityCards || [])
    ];

    const hasMetronomo = allCards.some(c => c && c.id === 'METRONOMO'); // Passive Always On
    const hasActiveScudo = allCards.some(c => c && c.id === 'SCUDO' && c.active);

    ctx.lineWidth = 3;

    if (hasActiveScudo && hasMetronomo) {
        // Combined Effect
        const grad = ctx.createLinearGradient(0, y, canvas.width, y);
        grad.addColorStop(0, '#3498db'); // Blue
        grad.addColorStop(0.5, '#2ecc71'); // Green
        grad.addColorStop(1, '#3498db');
        ctx.strokeStyle = grad;
        // PERFORMANCE: remove high blur
        // ctx.shadowColor = '#00ffaa'; // Cyan-ish glow
        // ctx.shadowBlur = 15;
        ctx.setLineDash([]); // Solid
    } else if (hasActiveScudo) {
        // Green Pulse
        ctx.strokeStyle = '#2ecc71';
        // ctx.shadowColor = '#2ecc71';
        // ctx.shadowBlur = 15;
        ctx.setLineDash([]);
    } else if (hasMetronomo) {
        // Blue Glow
        ctx.strokeStyle = '#3498db';
        // ctx.shadowColor = '#3498db';
        // ctx.shadowBlur = 10;
        ctx.setLineDash([]);
    } else {
        // Inactive - Dashed
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([10, 10]);
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
    }

    ctx.stroke();
    ctx.restore();
}


