// ===== RALLY PHASE RENDERING =====

import { CARD } from '../data/cards.js';
import { getCtx, getCanvas } from './canvas.js';

/**
 * Draw rally phase visuals (note animation and timing indicator)
 */
export function drawRallyPhase(gameState) {
    if (gameState.phase !== 'RALLY' || !gameState.currentNote) return;

    const ctx = getCtx();
    const note = gameState.currentNote;

    // Use pre-calculated coordinates if available
    const currentX = (typeof note.x !== 'undefined') ? note.x :
        (note.startX + (note.endX - note.startX) * note.progress);
    const currentY = (typeof note.y !== 'undefined') ? note.y :
        (note.startY + (note.endY - note.startY) * note.progress);

    // Draw note
    const pulseScale = 1 + Math.sin(Date.now() / 100) * 0.1;
    const noteColor = (note.direction === 'toPlayer') ? '#e67e22' : '#9b59b6';

    ctx.save();
    ctx.translate(currentX, currentY);
    ctx.scale(pulseScale, pulseScale);

    // Note glow
    ctx.shadowColor = noteColor;
    ctx.shadowBlur = 20;

    // Note icon
    ctx.fillStyle = noteColor;
    ctx.font = 'bold 50px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', 0, 0);

    ctx.restore();

    // Draw timing indicator
    if (gameState.timingIndicator) {
        const elapsed = Date.now() - gameState.timingIndicator.startTime;
        const progress = Math.min(elapsed / gameState.timingIndicator.duration, 1);

        // Calculate shrinking radius
        const maxRadius = CARD.WIDTH * 0.75;
        const minRadius = CARD.WIDTH * 0.5;
        const currentRadius = maxRadius - (maxRadius - minRadius) * progress;

        // Position at note's destination
        const centerX = note.endX;
        const centerY = note.endY;

        // Color gradient based on timing
        const perfectStart = 1 - (gameState.timingIndicator.parryWindow / gameState.timingIndicator.duration);
        const color = progress < perfectStart ? '#e74c3c' : '#2ecc71';

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Draw parry prompt for player
        if (gameState.rallyState && gameState.rallyState.currentDefender === 'player') {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 5;
            ctx.fillText('PRESS SPACE or CLICK', centerX, centerY + currentRadius + 20);
            ctx.restore();
        }
    }
}
