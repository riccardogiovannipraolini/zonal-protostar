// ===== UI RENDERING =====

import { COLORS, STAMINA } from '../data/cards.js';
import { getCtx, getCanvas } from './canvas.js';

/**
 * Draw phase indicator at top
 */
export function drawPhaseIndicator(gameState) {
    const ctx = getCtx();
    const canvas = getCanvas();
    const phases = ['REPOSITION', 'SELECTION', 'DISTRIBUTION', 'RALLY', 'END_TURN'];
    const indicatorWidth = 110; // Slightly smaller to fit 5
    const indicatorHeight = 24;
    const spacing = 8;
    const totalIndicatorWidth = (indicatorWidth * phases.length) + (spacing * (phases.length - 1));
    const startIndicatorX = (canvas.width - totalIndicatorWidth) / 2;
    const indicatorY = 3;

    for (let i = 0; i < phases.length; i++) {
        const x = startIndicatorX + (i * (indicatorWidth + spacing));
        const phase = phases[i];
        const isActive = gameState.phase === phase;

        // Background
        ctx.fillStyle = isActive ? COLORS.phases[phase] : 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(x, indicatorY, indicatorWidth, indicatorHeight, 4);
        ctx.fill();

        // Border for active
        if (isActive) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, indicatorY, indicatorWidth, indicatorHeight, 4);
            ctx.stroke();
        }

        // Text
        ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
        ctx.font = `${isActive ? 'bold' : 'normal'} 10px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(phase, x + indicatorWidth / 2, indicatorY + indicatorHeight / 2);
    }

    // Turn indicator
    ctx.fillStyle = gameState.currentTurn === 'player' ? '#51cf66' : '#ff6b6b';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${gameState.currentTurn.toUpperCase()}'S TURN`, canvas.width - 15, indicatorY + indicatorHeight / 2);
}

/**
 * Draw battle timer (MM:SS format) in top right corner
 */
export function drawBattleTimer(gameState) {
    if (!gameState.battleStartTime) return;

    const ctx = getCtx();
    const canvas = getCanvas();

    const elapsed = Date.now() - gameState.battleStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    const timeString = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;

    // Position: top right, below turn indicator
    ctx.save();
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`⏱ ${timeString}`, canvas.width - 15, 22);
    ctx.restore();
}

/**
 * Draw a single stamina bar
 */
function drawStaminaBar(x, y, width, height, current, max, side) {
    const ctx = getCtx();
    const isPlayer = side === 'player';
    const isExhausted = current === 0;

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();

    // Fill bar
    const fillWidth = (current / max) * (width - 4);
    if (fillWidth > 0) {
        const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
        if (isExhausted) {
            gradient.addColorStop(0, '#666');
            gradient.addColorStop(1, '#444');
        } else {
            gradient.addColorStop(0, '#ffd700');
            gradient.addColorStop(1, '#ff8c00');
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, fillWidth, height - 4, 3);
        ctx.fill();
    }

    // Border
    ctx.strokeStyle = isExhausted ? '#666' : '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.stroke();

    // Text
    ctx.fillStyle = isExhausted ? '#ff4757' : '#ffffff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;

    if (isExhausted) {
        ctx.fillText('EXHAUSTED', x + width / 2, y + height / 2);
    } else {
        ctx.fillText(`⚡ ${current}/${max}`, x + width / 2, y + height / 2);
    }

    // Label
    ctx.fillStyle = isPlayer ? '#51cf66' : '#ff6b6b';
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(isPlayer ? 'PLAYER' : 'ENEMY', x, y - 5);

    ctx.restore();
}

/**
 * Draw stamina bars for both players
 */
export function drawStaminaBars(gameState) {
    const canvas = getCanvas();
    const barWidth = 120;
    const barHeight = 20;
    const padding = 15;

    // Enemy stamina (top-left)
    drawStaminaBar(padding, 35, barWidth, barHeight, gameState.enemyStamina, gameState.enemyMaxStamina, 'enemy');

    // Player stamina (bottom-left)
    drawStaminaBar(padding, canvas.height - 35, barWidth, barHeight, gameState.playerStamina, gameState.playerMaxStamina, 'player');
}

/**
 * Draw regen animation
 */
export function drawRegenAnimation(gameState) {
    if (!gameState.regenAnimation) return;

    const ctx = getCtx();
    const canvas = getCanvas();

    const elapsed = Date.now() - gameState.regenAnimation.startTime;
    const duration = 1000;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
        gameState.regenAnimation = null;
        return;
    }

    const isPlayer = gameState.regenAnimation.side === 'player';
    const baseY = isPlayer ? canvas.height - 55 : 55;
    const x = 75;
    const y = baseY - (progress * 30);

    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.fillText(`+${gameState.regenAnimation.amount}⚡`, x, y);
    ctx.restore();
}

/**
 * Draw floating texts (HIT!, PARRY!, etc.)
 */
export function drawFloatingTexts(gameState) {
    const ctx = getCtx();

    gameState.floatingTexts.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.fillStyle = t.color;
        ctx.font = 'bold 24px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 10;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
    });
}

/**
 * Draw message overlay
 */
export function drawMessage(gameState) {
    if (!gameState.message) return;

    const ctx = getCtx();
    const canvas = getCanvas();

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 10;
    ctx.fillText(gameState.message.text, canvas.width / 2, canvas.height / 2);
    ctx.restore();
}

/**
 * Draw game over screen
 */
export function drawGameOverScreen(gameState) {
    if (!gameState.gameOver) return;

    const ctx = getCtx();
    const canvas = getCanvas();
    const isVictory = gameState.gameOver.winner === 'player';

    // Semi-transparent overlay
    ctx.save();
    ctx.fillStyle = isVictory ? 'rgba(46, 204, 113, 0.85)' : 'rgba(231, 76, 60, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Main text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 15;

    const mainText = isVictory ? '🎉 VICTORY! 🎉' : '💀 DEFEAT 💀';
    ctx.fillText(mainText, canvas.width / 2, canvas.height / 2 - 60);

    // Reason text
    ctx.font = '24px "Segoe UI", sans-serif';
    ctx.fillText(gameState.gameOver.reason, canvas.width / 2, canvas.height / 2);

    // Play Again button
    const buttonWidth = 200;
    const buttonHeight = 50;
    const buttonX = (canvas.width - buttonWidth) / 2;
    const buttonY = canvas.height / 2 + 50;

    // Store button position for click detection
    gameState.playAgainButton = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

    // Button background
    ctx.fillStyle = isVictory ? '#27ae60' : '#c0392b';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 10);
    ctx.fill();

    // Button border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 10);
    ctx.stroke();

    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillText(isVictory ? 'Play Again' : 'Try Again', canvas.width / 2, buttonY + buttonHeight / 2);

    ctx.restore();
}

/**
 * Draw UI specific to Reposition Phase
 */
export function drawRepositionUI(gameState) {
    if (gameState.phase !== 'REPOSITION') return;

    const ctx = getCtx();
    const canvas = getCanvas();

    // Draw "Skip/Done" button
    const buttonWidth = 160;
    const buttonHeight = 40;
    const buttonX = (canvas.width - buttonWidth) / 2;
    const buttonY = canvas.height / 2;

    ctx.save();

    // Button bg
    ctx.fillStyle = '#34495e';
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 8);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ecf0f1';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Skip Reposition", buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);

    // Instruction text
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText("Swap any 2 cards (once per turn)", canvas.width / 2, buttonY - 30);

    ctx.restore();
}
