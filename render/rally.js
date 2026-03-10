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

    // Use a pre-rendered radial glow or simpler shadow
    // For performance, we disable it if it's too high, or use a semi-transparent stroke instead
    ctx.shadowBlur = bounceCount >= 5 ? 10 : 5;

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

    const noteColor = getNoteColorWithIntensity(note.attackerColor || '#9b59b6', bounceCount);

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

    // Replaced expensive shadowBlur on animated objects with an inner glow or simpler fill
    // Outer pseudo-glow using a radial gradient instead of shadowBlur (which calculates every frame)
    const glowRadius = 5 + (bounceCount * 15);
    const radGlow = ctx.createRadialGradient(0, 0, 10, 0, 0, 15 + glowRadius);
    radGlow.addColorStop(0, noteColor);
    radGlow.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = radGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 15 + glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Speed lines (always for speed-boosted notes, otherwise at bounce >= 2)
    const showTrail = note.hasSpeedBoost || bounceCount >= 2;
    if (showTrail) {
        ctx.save();
        const trailLength = note.hasSpeedBoost ? Math.max(3, bounceCount * 3) : bounceCount * 3;
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

    // Draw the note circle (No shadowBlur to save GPU)
    ctx.fillStyle = noteColor;

    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    // Add a light inner glow/border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw timing indicator for a note
 */
function drawTimingIndicator(ctx, gameState, note) {
    if (!note.timingIndicator) return;

    const bounceCount = note.bounceCount || 0;
    const elapsed = Date.now() - note.timingIndicator.startTime;
    const duration = note.timingIndicator.duration;

    // Safety check div/0
    if (duration <= 0) return;

    const progress = Math.min(elapsed / duration, 1);
    const timeToImpact = duration * (1 - progress);

    const baseMaxRadius = 60;
    const baseMinRadius = 15;

    // Pixel Scale (Pixels per Ms)
    // Distance from Max to Min radius must be traversed in 'duration' time?
    // Actually, usually the Approach Ring shrinks from Max to Min.
    // Let's assume MinRadius is the "Impact Line".

    const scaleFactor = 1.0; // Can tweak this
    // Pixels per MS: How fast the ring shrinks
    const pixelsPerMs = (baseMaxRadius - baseMinRadius) / duration;

    // Calculate Center Time of the Window
    // Window is [Impact - scaledWindow, Impact] generally?
    // Logic in attemptParry uses perfectCenter based on window size.
    // scaledWindow = 200 * 0.8^bounce
    const baseWindow = 200;
    const shrinkFactor = Math.pow(0.8, bounceCount);
    const scaledWindow = baseWindow * shrinkFactor;

    // Ideally, the "Center" of the parry is at Impact - (Window/2)
    const timeRemainingAtCenter = scaledWindow / 2;

    // Radius mapping function
    // R(t_left) = MinRadius + (pixelsPerMs * t_left * multiplier?)
    // To make it visible, let's just map directly relative to MinRadius.
    // But we need the Approach Ring to cross the Perfect Line at the right time.
    // Approach Ring Radius = Min + pixelsPerMs * timeToImpact ???
    // If we use linear interpolation:
    const approachRadius = baseMinRadius + (baseMaxRadius - baseMinRadius) * (timeToImpact / duration);

    // Target Radii
    // Perfect Zone: Center ± 50ms
    const perfectHalfWidth = 50;
    const perfectUpperTime = timeRemainingAtCenter + perfectHalfWidth;
    const perfectLowerTime = timeRemainingAtCenter - perfectHalfWidth;

    // Ensure lower bounds don't go below 0 (impact)
    const rPerfectUpper = baseMinRadius + (baseMaxRadius - baseMinRadius) * (perfectUpperTime / duration);
    const rPerfectLower = baseMinRadius + (baseMaxRadius - baseMinRadius) * (Math.max(0, perfectLowerTime) / duration);

    // Imperfect Zone: Center ± Window/2
    const imperfectHalfWidth = scaledWindow / 2;
    const imperfectUpperTime = timeRemainingAtCenter + imperfectHalfWidth;
    const imperfectLowerTime = timeRemainingAtCenter - imperfectHalfWidth; // Should be ~0

    const rImperfectUpper = baseMinRadius + (baseMaxRadius - baseMinRadius) * (imperfectUpperTime / duration);
    const rImperfectLower = baseMinRadius + (baseMaxRadius - baseMinRadius) * (Math.max(0, imperfectLowerTime) / duration);

    // Ensure visual visibility (min delta)
    const minDiff = 2;

    const centerX = note.endX;
    const centerY = note.endY;

    // 1. IMPERFECT DISC (Outer) - Yellow
    // Only visible if Stamina > 0
    if (gameState.playerStamina > 0 && note.direction === 'toPlayer') {
        ctx.save();
        ctx.strokeStyle = '#f1c40f'; // Yellow
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([5, 5]); // Dashed for imperfect

        ctx.beginPath();
        // Draw Ring between Upper and Lower? Or just lines?
        // Prompt says: "Dynamic size: starts at 200ms diameter... Surrounds the perfect disc"
        // "Yellow/orange outline, thick border"

        // Let's draw the Outer Boundary of Imperfect
        ctx.arc(centerX, centerY, rImperfectUpper, 0, Math.PI * 2);
        ctx.stroke();

        // Inner boundary (overlap with perfect?)
        // Let's just draw the zone as a thick band if needed, or just the outer limit
        // "Disc" usually implies filled or ring.
        // Let's draw a thick ring covering the Imperfect Zone
        ctx.beginPath();
        ctx.lineWidth = Math.max(2, rImperfectUpper - rPerfectUpper); // Fill the gap? 
        // Actually simple outline is cleaner.

        ctx.restore();
    }

    // 2. PERFECT DISC (Inner) - Green
    // Fixed size: ±50ms from center.
    // Always visible.
    ctx.save();
    ctx.strokeStyle = '#2ecc71'; // Green
    ctx.lineWidth = 3;
    // PERFORMANCE: Remove shadowBlur here to avoid 60FPS blur rendering
    // ctx.shadowColor = '#2ecc71';
    // ctx.shadowBlur = 10;

    ctx.beginPath();
    // Draw Upper Boundary of Perfect
    ctx.arc(centerX, centerY, rPerfectUpper, 0, Math.PI * 2);
    ctx.stroke();

    // Draw Lower Boundary?
    // If it's a "Disc", maybe fill it lightly?
    ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
    ctx.fill();

    ctx.beginPath();
    // Center Line of Perfect (Optimal Hit)
    const rCenter = baseMinRadius + (baseMaxRadius - baseMinRadius) * (timeRemainingAtCenter / duration);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.arc(centerX, centerY, rCenter, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // 3. APPROACH RING - White
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    // PERFORMANCE: Replace shadowBlur with a slight globalAlpha on stroke
    // ctx.shadowColor = '#ffffff';
    // ctx.shadowBlur = 5;

    // Pulse effect
    const pulse = 1 + Math.sin(Date.now() / 50) * 0.05;

    ctx.beginPath();
    ctx.arc(centerX, centerY, approachRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Parry Prompt
    if (gameState.rallyState && note.direction === 'toPlayer') {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        // PERFORMANCE: No shadow down here
        // ctx.shadowColor = '#000000';
        // ctx.shadowBlur = 5;

        // Show stamina warning if low
        if (gameState.playerStamina <= 0) {
            ctx.fillStyle = '#ff4757';
            ctx.fillText('ONLY PERFECT!', centerX, centerY + baseMaxRadius + 30);
        } else {
            const promptText = bounceCount >= 3 ? '⚡' : 'PARRY';
            ctx.fillText(promptText, centerX, centerY + baseMaxRadius + 30);
        }
        ctx.restore();
    }
}

/**
 * Draw thorn/bramble VFX on debuffed lanes (Rovi passive)
 */
function drawLaneDebuffs(ctx, canvas, gameState) {
    const debuffs = [
        ...(gameState.playerLaneDebuffs || []),
        ...(gameState.enemyLaneDebuffs || [])
    ];

    // Check player-side debuffs (enemy lanes that are thorned)
    for (let side = 0; side < 2; side++) {
        const laneDebuffs = side === 0 ? gameState.playerLaneDebuffs : gameState.enemyLaneDebuffs;
        if (!laneDebuffs) continue;

        for (let i = 0; i < 4; i++) {
            if (!laneDebuffs[i] || laneDebuffs[i] <= 0) continue;

            const cardPos = side === 0
                ? layout.cardPositions.player[i]
                : layout.cardPositions.enemy[i];
            if (!cardPos) continue;

            const x = cardPos.x + CARD.WIDTH / 2;
            const yBase = side === 0 ? cardPos.y - 15 : cardPos.y + CARD.HEIGHT + 15;

            ctx.save();
            ctx.globalAlpha = 0.7;

            // Animated thorn pattern
            const time = Date.now() / 800;
            const thornColor = '#8bc34a';

            // Draw 3 thorn marks
            for (let t = -1; t <= 1; t++) {
                const tx = x + t * 20;
                const ty = yBase + Math.sin(time + t) * 3;

                ctx.strokeStyle = thornColor;
                ctx.lineWidth = 2;

                // X-shaped thorn
                ctx.beginPath();
                ctx.moveTo(tx - 5, ty - 5);
                ctx.lineTo(tx + 5, ty + 5);
                ctx.moveTo(tx + 5, ty - 5);
                ctx.lineTo(tx - 5, ty + 5);
                ctx.stroke();
            }

            // "THORNS" label
            ctx.fillStyle = thornColor;
            ctx.font = 'bold 9px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🌿 THORNS', x, yBase + 15);

            ctx.restore();
        }
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

    // Draw thorn/debuff VFX on lanes
    drawLaneDebuffs(ctx, canvas, gameState);

    // Optimization: Iterate directly instead of filter/map to avoid GC
    const notes = gameState.activeNotes || [];
    if (notes.length === 0 && !gameState.currentNote) return;

    // Use currentNote if activeNotes is empty (legacy fallback)
    const effectiveNotes = notes.length > 0 ? notes : [gameState.currentNote];

    let maxBounce = 0;

    // First pass: Calculate max bounce (for vignette)
    for (let i = 0; i < effectiveNotes.length; i++) {
        const n = effectiveNotes[i];
        if (!n.resolved) {
            const b = n.bounceCount || 0;
            if (b > maxBounce) maxBounce = b;
        }
    }

    // Draw vignette effect
    if (maxBounce >= 1) {
        drawVignette(ctx, canvas, maxBounce);
    }

    // Draw rally counter
    drawRallyCounter(ctx, canvas, maxBounce);

    // Second pass: Draw notes
    // We do NOT use forEach to avoid function allocation per frame in tight loops if possible, 
    // but JS engines are good at this. The main win is avoiding .filter() allocation.
    for (let i = 0; i < effectiveNotes.length; i++) {
        const note = effectiveNotes[i];
        if (!note.resolved) {
            drawNote(ctx, note);
            if (note.timingIndicator) {
                drawTimingIndicator(ctx, gameState, note);
            }
        }
    }
}
