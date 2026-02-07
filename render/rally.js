// ===== RALLY PHASE RENDERING =====
// Enhanced visual polish for velocity stacking + vertical lanes

import { CARD, RALLY } from '../data/cards.js';
import { getCtx, getCanvas, layout } from './canvas.js';

/**
 * Get timing circle color based on bounce count
 */
function getTimingCircleColor(bounceCount) {
    if (bounceCount >= 4) return '#ff3838';      // Red - critical
    if (bounceCount >= 3) return '#ff9500';      // Orange - danger
    if (bounceCount >= 2) return '#ffd93d';      // Yellow - warning
    return '#ffffff';                             // White - normal
}

/**
 * Get timing circle scale (smaller = harder)
 */
function getTimingCircleScale(bounceCount) {
    const shrinkPerBounce = 0.20;
    return Math.max(0.20, 1 - (bounceCount * shrinkPerBounce));
}

/**
 * Get rally counter color based on bounce count
 */
function getRallyCounterColor(bounceCount) {
    if (bounceCount >= 5) return '#ff3838';
    if (bounceCount >= 3) return '#ffa502';
    return '#ffffff';
}

/**
 * Get note color with intensity based on bounce count
 */
function getNoteColorWithIntensity(baseColor, bounceCount) {
    const hex = baseColor.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    const brightnessMultiplier = 1 + (bounceCount * 0.5);
    r = Math.min(255, Math.floor(r * brightnessMultiplier));
    g = Math.min(255, Math.floor(g * brightnessMultiplier));
    b = Math.min(255, Math.floor(b * brightnessMultiplier));

    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draw vertical lane indicators during rally with QWER labels
 */
function drawLaneIndicators(ctx, canvas, gameState) {
    const enemyY = layout.cardPositions.enemy[0].y + CARD.HEIGHT;
    const playerY = layout.cardPositions.player[0].y;
    const labels = ['Q', 'W', 'E', 'R'];

    for (let i = 0; i < 4; i++) {
        const x = layout.cardPositions.player[i].x + CARD.WIDTH / 2;

        // Check for flash effect on this lane
        const isFlashing = gameState.laneFlash &&
            gameState.laneFlash.lane === i &&
            (Date.now() - gameState.laneFlash.startTime) < 200;

        ctx.save();

        // Lane flash overlay
        if (isFlashing) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(x - 40, enemyY + 10, 80, playerY - enemyY - 20);
        }

        // Dashed lane line
        ctx.strokeStyle = isFlashing ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(x, enemyY + 10);
        ctx.lineTo(x, playerY - 10);
        ctx.stroke();

        // QWER label at top of lane
        ctx.setLineDash([]);
        ctx.fillStyle = isFlashing ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], x, enemyY + 25);

        ctx.restore();
    }

    // Clear expired flash
    if (gameState.laneFlash && (Date.now() - gameState.laneFlash.startTime) >= 200) {
        gameState.laneFlash = null;
    }
}

/**
 * Draw vignette effect during rallies
 */
function drawVignette(ctx, canvas, intensity) {
    if (intensity <= 0) return;

    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${0.3 + intensity * 0.1})`);

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

/**
 * Draw rally counter at top center
 */
function drawRallyCounter(ctx, canvas, bounceCount) {
    if (bounceCount <= 0) return;

    ctx.save();

    const pulseScale = 1 + Math.sin(Date.now() / 150) * 0.1;
    const baseSize = 36 + (bounceCount * 4);
    const fontSize = Math.min(56, baseSize * pulseScale);

    const x = canvas.width / 2;
    const y = 50;

    let color = getRallyCounterColor(bounceCount);
    if (bounceCount >= 5) {
        const flash = Math.sin(Date.now() / 100) > 0;
        color = flash ? '#ff3838' : '#fffa65';
    }

    ctx.shadowColor = color;
    ctx.shadowBlur = 20 + (bounceCount * 5);

    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(`⚡ RALLY: ${bounceCount} ⚡`, x, y);
    ctx.fillText(`⚡ RALLY: ${bounceCount} ⚡`, x, y);

    ctx.restore();
}

/**
 * Draw a single note with effects
 */
function drawNote(ctx, note) {
    const bounceCount = note.bounceCount || 0;
    const currentX = note.x !== undefined ? note.x : note.startX;
    const currentY = note.y !== undefined ? note.y :
        (note.startY + (note.endY - note.startY) * note.progress);

    const baseNoteColor = (note.direction === 'toPlayer') ? '#e67e22' : '#9b59b6';
    const noteColor = getNoteColorWithIntensity(baseNoteColor, bounceCount);

    ctx.save();
    ctx.translate(currentX, currentY);

    // Pulsing scale
    const basePulse = 1 + Math.sin(Date.now() / 100) * 0.1;
    const intensePulse = bounceCount >= 3 ? Math.sin(Date.now() / 50) * 0.2 : 0;
    const pulseScale = basePulse + intensePulse + (bounceCount * 0.05);
    ctx.scale(pulseScale, pulseScale);

    // Spin rotation
    if (note.isSpinning) {
        const easeOutBack = (x) => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        };
        const rotation = easeOutBack(note.spinProgress || 0) * Math.PI * 2;
        ctx.rotate(rotation);
    }

    // Glow
    const glowRadius = 5 + (bounceCount * 15);
    ctx.shadowColor = noteColor;
    ctx.shadowBlur = glowRadius;

    // Speed lines at high speeds
    if (bounceCount >= 2) {
        ctx.save();
        const trailLength = bounceCount * 3;
        for (let i = 1; i <= trailLength; i++) {
            ctx.globalAlpha = (1 - i / trailLength) * 0.4;
            ctx.fillStyle = noteColor;
            ctx.font = 'bold 40px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Vertical trail (opposite direction of movement)
            const trailOffset = i * 6;
            const trailY = note.direction === 'toPlayer' ? -trailOffset : trailOffset;
            ctx.fillText('♪', 0, trailY);
        }
        ctx.restore();
    }

    // Fire effect at bounce 3+
    if (bounceCount >= 3) {
        ctx.save();
        const fireColors = ['#ff9500', '#ff5722', '#ffeb3b', '#ff3838'];
        const particleCount = bounceCount >= 4 ? 12 : 8;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Date.now() / 80 + i * (360 / particleCount)) * Math.PI / 180;
            const distance = 15 + Math.sin(Date.now() / 100 + i) * 8;
            const size = bounceCount >= 4 ? 6 : 4;
            ctx.fillStyle = fireColors[i % fireColors.length];
            ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 50 + i) * 0.3;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Draw the note icon
    ctx.fillStyle = noteColor;
    ctx.font = 'bold 50px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', 0, 0);

    ctx.restore();
}

/**
 * Draw timing indicator for a note
 */
function drawTimingIndicator(ctx, gameState, note) {
    if (!note.timingIndicator) return;

    const bounceCount = note.bounceCount || 0;
    const elapsed = Date.now() - note.timingIndicator.startTime;
    const progress = Math.min(elapsed / note.timingIndicator.duration, 1);

    const baseMaxRadius = CARD.WIDTH * 0.75;
    const baseMinRadius = CARD.WIDTH * 0.5;

    const circleScale = getTimingCircleScale(bounceCount);
    const maxRadius = baseMaxRadius * circleScale;
    const minRadius = baseMinRadius * circleScale;
    const currentRadius = maxRadius - (maxRadius - minRadius) * progress;

    const centerX = note.endX;
    const centerY = note.endY;

    const circleColor = getTimingCircleColor(bounceCount);

    const perfectStart = 1 - (note.timingIndicator.parryWindow / note.timingIndicator.duration);
    const displayColor = progress >= perfectStart ? '#2ecc71' : circleColor;

    ctx.save();

    ctx.strokeStyle = displayColor;
    ctx.lineWidth = 3 + (bounceCount * 0.5);
    ctx.shadowColor = displayColor;
    ctx.shadowBlur = 15 + (bounceCount * 5);

    ctx.beginPath();
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (bounceCount >= 3) {
        ctx.strokeStyle = circleColor;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();

    // Draw parry prompt for player
    if (gameState.rallyState && gameState.rallyState.currentDefender === 'player') {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 5;

        const promptText = bounceCount >= 3 ? '⚡ QUICK! Q/W/E/R ⚡' : 'PRESS Q/W/E/R TO PARRY';
        ctx.fillText(promptText, centerX, centerY + currentRadius + 20);
        ctx.restore();
    }
}

/**
 * Draw rally phase visuals - handles multiple simultaneous notes
 */
export function drawRallyPhase(gameState) {
    if (gameState.phase !== 'RALLY') return;

    const ctx = getCtx();
    const canvas = getCanvas();

    // Draw lane indicators with QWER labels
    drawLaneIndicators(ctx, canvas, gameState);

    // Handle multiple active notes OR single currentNote (for backwards compatibility)
    const notes = gameState.activeNotes && gameState.activeNotes.length > 0
        ? gameState.activeNotes.filter(n => !n.resolved)
        : (gameState.currentNote ? [gameState.currentNote] : []);

    if (notes.length === 0) return;

    // Get max bounce count for vignette/counter
    const maxBounce = Math.max(...notes.map(n => n.bounceCount || 0));

    // Draw vignette effect
    if (maxBounce >= 1) {
        drawVignette(ctx, canvas, maxBounce);
    }

    // Draw rally counter
    drawRallyCounter(ctx, canvas, maxBounce);

    // Draw all active notes
    notes.forEach(note => {
        drawNote(ctx, note);

        // Draw timing indicator for notes with indicators
        if (note.timingIndicator) {
            drawTimingIndicator(ctx, gameState, note);
        }
    });
}
