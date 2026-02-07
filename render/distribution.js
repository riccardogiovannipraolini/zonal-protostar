// ===== DISTRIBUTION OVERLAY RENDERING =====

import { CARD } from '../data/cards.js';
import { getCtx, getCanvas, layout } from './canvas.js';

import { isLanePlayable } from '../game/rules.js';

/**
 * Draw the note distribution overlay during DISTRIBUTION phase
 */
export function drawNoteDistributionOverlay(gameState) {
    if (gameState.phase !== 'DISTRIBUTION' || gameState.currentTurn !== 'player' || gameState.selectedCard === null) {
        return;
    }

    const ctx = getCtx();
    const canvas = getCanvas();
    const positions = layout.cardPositions;

    const selectedCard = gameState.playerCards[gameState.selectedCard];

    // Alive lanes calc might strictly be just enemy > 0 for potential limits, 
    // but the rule says we can only distribute to "playable" lanes.
    const playableLanesCount = [0, 1, 2, 3].filter(i => isLanePlayable(gameState, i)).length;

    // Allow stacking notes
    const maxNotes = Math.min(selectedCard.na, gameState.playerStamina);
    const cardMaxNotes = selectedCard.na;

    // Semi-transparent overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Calculate lane dimensions
    const laneWidth = 80;
    const laneSpacing = 20;
    const totalLanesWidth = (laneWidth * 4) + (laneSpacing * 3);
    const lanesStartX = (canvas.width - totalLanesWidth) / 2;
    const laneTopY = positions.enemy[0].y + CARD.HEIGHT + 30;
    const laneBottomY = positions.player[0].y - 30;
    const laneHeight = laneBottomY - laneTopY;

    // Reset lane positions
    layout.lanePositions = [];

    // Draw lanes
    for (let i = 0; i < 4; i++) {
        const laneX = lanesStartX + (i * (laneWidth + laneSpacing));
        const isHovered = gameState.hoveredLane === i;
        const hasNote = gameState.assignedNotes.includes(i);

        // Use helper
        const isDisabled = !isLanePlayable(gameState, i);

        // Store lane position
        layout.lanePositions.push({ x: laneX, y: laneTopY, width: laneWidth, height: laneHeight, disabled: isDisabled });

        // Lane background
        ctx.save();
        if (isDisabled) {
            ctx.fillStyle = 'rgba(50, 50, 50, 0.3)'; // Opacity 0.3
        } else {
            ctx.fillStyle = hasNote ? 'rgba(155, 89, 182, 0.3)' : 'rgba(255, 255, 255, 0.1)';
            if (isHovered && gameState.assignedNotes.length < maxNotes || (isHovered && hasNote)) {
                ctx.fillStyle = hasNote ? 'rgba(155, 89, 182, 0.5)' : 'rgba(255, 255, 255, 0.2)';
                ctx.shadowColor = '#9b59b6';
                ctx.shadowBlur = 20;
            }
        }
        ctx.fillRect(laneX, laneTopY, laneWidth, laneHeight);
        ctx.restore();

        // Lane border
        ctx.save();
        if (isDisabled) {
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = hasNote ? '#9b59b6' : 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            if (isHovered) {
                ctx.strokeStyle = '#9b59b6';
                ctx.lineWidth = 3;
            }
        }
        ctx.strokeRect(laneX, laneTopY, laneWidth, laneHeight);
        ctx.restore();

        // Lane number
        ctx.save();
        ctx.fillStyle = isDisabled ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Lane ${i + 1}`, laneX + laneWidth / 2, laneTopY - 10);
        ctx.restore();

        // X for disabled lanes
        if (isDisabled) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#ff4757'; // Red X
            ctx.font = 'bold 60px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('X', laneX + laneWidth / 2, laneTopY + laneHeight / 2);

            // Tooltip on hover
            if (isHovered) {
                ctx.font = 'bold 14px "Segoe UI", sans-serif';
                ctx.fillStyle = '#ff4757';
                ctx.fillText('Lane Blocked', laneX + laneWidth / 2, laneTopY + laneHeight / 2 + 40);
            }
            ctx.restore();
        } else {
            // Draw note icons
            const noteCount = gameState.assignedNotes.filter(n => n === i).length;

            if (noteCount > 0) {
                const noteY = laneTopY + laneHeight / 2;
                const noteX = laneX + laneWidth / 2;
                const pulseScale = 1 + Math.sin(Date.now() / 200) * 0.1;

                ctx.save();
                ctx.translate(noteX, noteY);
                ctx.scale(pulseScale, pulseScale);

                ctx.fillStyle = '#9b59b6';
                ctx.font = 'bold 40px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#9b59b6';
                ctx.shadowBlur = 15;
                ctx.fillText('♪', 0, 0);

                ctx.restore();

                // Count badge
                if (noteCount > 1) {
                    const badgeX = noteX + 20;
                    const badgeY = noteY - 20;

                    ctx.save();
                    ctx.fillStyle = '#e74c3c';
                    ctx.beginPath();
                    ctx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 12px "Segoe UI", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(noteCount.toString(), badgeX, badgeY);
                    ctx.restore();
                }
            }
        }
    }

    // Notes counter with stamina info
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 5;
    ctx.fillText(`Notes: ${gameState.assignedNotes.length}/${maxNotes}`, canvas.width / 2, laneTopY - 40);

    // Stamina warning
    if (gameState.playerStamina < cardMaxNotes) {
        ctx.fillStyle = '#ffd700';
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.fillText(`⚠️ Low stamina! (${selectedCard.na} NA, but only ${gameState.playerStamina}⚡ available)`, canvas.width / 2, laneTopY - 20);
    }
    ctx.restore();

    // Buttons
    const buttonY = laneBottomY + 40;
    const buttonWidth = 120;
    const buttonHeight = 40;
    const buttonSpacing = 20;

    // Cancel button
    const cancelX = canvas.width / 2 - buttonWidth - buttonSpacing / 2;
    ctx.save();
    ctx.fillStyle = '#e74c3c';
    ctx.shadowColor = '#e74c3c';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(cancelX, buttonY, buttonWidth, buttonHeight, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Cancel', cancelX + buttonWidth / 2, buttonY + buttonHeight / 2);
    ctx.restore();

    // Confirm button
    if (gameState.assignedNotes.length > 0) {
        const confirmX = canvas.width / 2 + buttonSpacing / 2;
        ctx.save();
        ctx.fillStyle = '#2ecc71';
        ctx.shadowColor = '#2ecc71';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(confirmX, buttonY, buttonWidth, buttonHeight, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Confirm', confirmX + buttonWidth / 2, buttonY + buttonHeight / 2);
        ctx.restore();
    }
}
