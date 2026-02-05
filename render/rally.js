// ===== RALLY PHASE RENDERING =====
// Enhanced visual polish for velocity stacking

import { CARD, RALLY } from '../data/cards.js';
import { getCtx, getCanvas } from './canvas.js';

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
    // 100% -> 80% -> 60% -> 40% -> 20%
    const shrinkPerBounce = 0.20;
    return Math.max(0.20, 1 - (bounceCount * shrinkPerBounce));
}

/**
 * Get rally counter color based on bounce count
 */
function getRallyCounterColor(bounceCount) {
    if (bounceCount >= 5) return '#ff3838';      // Red + flashing
    if (bounceCount >= 3) return '#ffa502';      // Orange/yellow
    return '#ffffff';                             // White
}

/**
 * Get note color with DRAMATIC intensity based on bounce count
 */
function getNoteColorWithIntensity(baseColor, bounceCount) {
    const hex = baseColor.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // DRAMATIC brightness increase: +50% per bounce
    const brightnessMultiplier = 1 + (bounceCount * 0.5);
    r = Math.min(255, Math.floor(r * brightnessMultiplier));
    g = Math.min(255, Math.floor(g * brightnessMultiplier));
    b = Math.min(255, Math.floor(b * brightnessMultiplier));

    return `rgb(${r}, ${g}, ${b})`;
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
 * Draw HUGE rally counter at top center
 */
function drawRallyCounter(ctx, canvas, bounceCount) {
    if (bounceCount <= 0) return;

    ctx.save();

    // Pulsing animation - grows with each bounce
    const pulseScale = 1 + Math.sin(Date.now() / 150) * 0.1;
    const baseSize = 36 + (bounceCount * 4); // Gets bigger with bounces
    const fontSize = Math.min(56, baseSize * pulseScale);

    // Position: TOP CENTER
    const x = canvas.width / 2;
    const y = 50;

    // Color with potential flash at max
    let color = getRallyCounterColor(bounceCount);
    if (bounceCount >= 5) {
        // FLASHING at max bounces
        const flash = Math.sin(Date.now() / 100) > 0;
        color = flash ? '#ff3838' : '#fffa65';
    }

    // Big glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 20 + (bounceCount * 5);

    // Text
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw text with outline for visibility
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(`⚡ RALLY: ${bounceCount} ⚡`, x, y);
    ctx.fillText(`⚡ RALLY: ${bounceCount} ⚡`, x, y);

    ctx.restore();
}

/**
 * Draw note with DRAMATIC glow effects
 */
function drawNote(ctx, note, bounceCount) {
    const currentX = (typeof note.x !== 'undefined') ? note.x :
        (note.startX + (note.endX - note.startX) * note.progress);
    const currentY = (typeof note.y !== 'undefined') ? note.y :
        (note.startY + (note.endY - note.startY) * note.progress);

    const baseNoteColor = (note.direction === 'toPlayer') ? '#e67e22' : '#9b59b6';
    const noteColor = getNoteColorWithIntensity(baseNoteColor, bounceCount);

    ctx.save();
    ctx.translate(currentX, currentY);

    // Pulsing scale - MORE INTENSE at high bounces
    const basePulse = 1 + Math.sin(Date.now() / 100) * 0.1;
    const intensePulse = bounceCount >= 3 ? Math.sin(Date.now() / 50) * 0.2 : 0;
    const pulseScale = basePulse + intensePulse + (bounceCount * 0.05);
    ctx.scale(pulseScale, pulseScale);

    // Apply spin rotation if active
    if (note.isSpinning) {
        const easeOutBack = (x) => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        };
        const rotation = easeOutBack(note.spinProgress || 0) * Math.PI * 2;
        ctx.rotate(rotation);
    }

    // DRAMATIC glow - increases massively with bounces
    // Bounce 0: 5px, 1: 15px, 2: 25px, 3: 40px, 4-5: 60px+
    const glowRadius = 5 + (bounceCount * 15);
    const glowOpacity = Math.min(1, 0.3 + (bounceCount * 0.2));

    // Multiple glow layers for intensity
    ctx.shadowColor = noteColor;
    ctx.shadowBlur = glowRadius;

    // Speed lines / trail behind note at high speeds
    if (bounceCount >= 2) {
        ctx.save();
        const trailLength = bounceCount * 3;
        for (let i = 1; i <= trailLength; i++) {
            ctx.globalAlpha = (1 - i / trailLength) * 0.4;
            ctx.fillStyle = noteColor;
            ctx.font = 'bold 40px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Trail in opposite direction of movement
            const trailOffset = i * 6;
            const trailX = note.direction === 'toPlayer' ? -trailOffset : trailOffset;
            ctx.fillText('♪', trailX, 0);
        }
        ctx.restore();
    }

    // "ON FIRE" effect at bounce 3+
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
 * Draw timing indicator with VISIBLE SHRINK based on bounceCount
 */
function drawTimingIndicator(ctx, gameState, note) {
    if (!gameState.timingIndicator) return;

    const bounceCount = note.bounceCount || 0;
    const elapsed = Date.now() - gameState.timingIndicator.startTime;
    const progress = Math.min(elapsed / gameState.timingIndicator.duration, 1);

    // BASE radius sizes
    const baseMaxRadius = CARD.WIDTH * 0.75;
    const baseMinRadius = CARD.WIDTH * 0.5;

    // SHRINK the circle based on bounceCount - THIS IS THE KEY VISUAL!
    const circleScale = getTimingCircleScale(bounceCount);
    const maxRadius = baseMaxRadius * circleScale;
    const minRadius = baseMinRadius * circleScale;
    const currentRadius = maxRadius - (maxRadius - minRadius) * progress;

    // Position at note's destination
    const centerX = note.endX;
    const centerY = note.endY;

    // Color progression based on BOUNCE COUNT (not timing!)
    const circleColor = getTimingCircleColor(bounceCount);

    // Change to green when in parry window
    const perfectStart = 1 - (gameState.timingIndicator.parryWindow / gameState.timingIndicator.duration);
    const displayColor = progress >= perfectStart ? '#2ecc71' : circleColor;

    ctx.save();

    // Thicker line at higher bounces for visibility
    ctx.strokeStyle = displayColor;
    ctx.lineWidth = 3 + (bounceCount * 0.5);
    ctx.shadowColor = displayColor;
    ctx.shadowBlur = 15 + (bounceCount * 5);

    // Draw main circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw inner danger ring at high bounces
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

        // More urgent text at high bounces
        const promptText = bounceCount >= 3 ? '⚡ QUICK! SPACE or CLICK ⚡' : 'PRESS SPACE or CLICK';
        ctx.fillText(promptText, centerX, centerY + currentRadius + 20);
        ctx.restore();
    }
}

/**
 * Draw rally phase visuals (note animation and timing indicator) - ENHANCED
 */
export function drawRallyPhase(gameState) {
    if (gameState.phase !== 'RALLY' || !gameState.currentNote) return;

    const ctx = getCtx();
    const canvas = getCanvas();
    const note = gameState.currentNote;
    const bounceCount = note.bounceCount || 0;

    // Draw vignette effect during rallies (subtle focus)
    if (bounceCount >= 1) {
        drawVignette(ctx, canvas, bounceCount);
    }

    // Draw HUGE rally counter at top center
    drawRallyCounter(ctx, canvas, bounceCount);

    // Draw note with enhanced glow effects
    drawNote(ctx, note, bounceCount);

    // Draw timing indicator with VISIBLE shrink
    drawTimingIndicator(ctx, gameState, note);
}
