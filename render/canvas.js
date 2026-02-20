// ===== CANVAS SETUP & HELPERS =====

import { CARD, COLORS } from '../data/cards.js';

// Canvas and context (set by init)
let canvas, ctx;

// Computed layout values
export const layout = {
    startX: 0,
    enemyY: 55,
    playerY: 0,
    cardPositions: { player: [], enemy: [] },
    identityCardPositions: { player: [], enemy: [] },
    lanePositions: []
};

let layoutDirty = true; // global flag to prevent GC thrashing

export function invalidateLayout() {
    layoutDirty = true;
}

/**
 * Initialize canvas and compute layout
 */
export function initCanvas(canvasElement) {
    if (!canvasElement) {
        console.error('[Canvas] initCanvas called with null/undefined canvasElement!');
        return null;
    }

    canvas = canvasElement;
    ctx = canvas.getContext('2d');

    // Compute card layout
    const totalWidth = (CARD.WIDTH * 4) + (CARD.SPACING * 3);
    layout.startX = (canvas.width - totalWidth) / 2;
    layout.playerY = canvas.height - CARD.HEIGHT - 20;

    console.log('[Canvas] Canvas initialized successfully');
    return { canvas, ctx };
}

export function getCanvas() { return canvas; }
export function getCtx() { return ctx; }

/**
 * Clear canvas
 */
export function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Cache for static shapes with expensive properties like shadowBlur
 */
const shapeCache = new Map();

function getCachedShape(key, width, height, drawFn) {
    if (!shapeCache.has(key)) {
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const offCtx = offscreen.getContext('2d');
        drawFn(offCtx, width / 2, height / 2);
        shapeCache.set(key, offscreen);
    }
    return shapeCache.get(key);
}

/**
 * Draw a filled heart shape with shadow from cache to improve performance
 */
export function drawHeart(x, y, size) {
    // We need padding to account for the shadow blur (5 + a little extra)
    const padding = 15;
    const cacheSize = size + padding * 2;
    const cacheKey = `heart_${size}_${COLORS.heart}`;

    const cachedHeart = getCachedShape(cacheKey, cacheSize, cacheSize, (offCtx, cx, cy) => {
        offCtx.fillStyle = COLORS.heart;
        offCtx.shadowColor = '#ff0000';
        offCtx.shadowBlur = 5;

        offCtx.beginPath();
        offCtx.moveTo(cx, cy - size / 4); // Adjusted for center drawing
        offCtx.bezierCurveTo(cx, cy - size / 2, cx - size / 2, cy - size / 2, cx - size / 2, cy - size / 4);
        offCtx.bezierCurveTo(cx - size / 2, cy + size * 0.2, cx, cy + size * 0.45, cx, cy + size * 0.75);
        offCtx.bezierCurveTo(cx, cy + size * 0.45, cx + size / 2, cy + size * 0.2, cx + size / 2, cy - size / 4);
        offCtx.bezierCurveTo(cx + size / 2, cy - size / 2, cx, cy - size / 2, cx, cy - size / 4);
        offCtx.fill();
    });

    // Draw the cached image centered on the target coordinates
    ctx.drawImage(cachedHeart, x - cacheSize / 2, (y + size / 4) - cacheSize / 2);
}

/**
 * Draw an empty heart outline with shadow from cache to improve performance
 */
export function drawEmptyHeart(x, y, size) {
    // We need padding to account for the stroke width and potential shadow (even if not used here, for consistency with drawHeart)
    const padding = 5;
    const cacheSize = size + padding * 2;
    const cacheKey = `empty_heart_${size}`;

    const cachedHeart = getCachedShape(cacheKey, cacheSize, cacheSize, (offCtx, cx, cy) => {
        offCtx.strokeStyle = 'rgba(255, 71, 87, 0.4)';
        offCtx.lineWidth = 1;

        // No heavy shadow here, but cached anyway so we don't recalculate the bezier curves
        offCtx.beginPath();
        offCtx.moveTo(cx, cy - size / 4); // Adjusted for center drawing
        offCtx.bezierCurveTo(cx, cy - size / 2, cx - size / 2, cy - size / 2, cx - size / 2, cy - size / 4);
        offCtx.bezierCurveTo(cx - size / 2, cy + size * 0.2, cx, cy + size * 0.45, cx, cy + size * 0.75);
        offCtx.bezierCurveTo(cx, cy + size * 0.45, cx + size / 2, cy + size * 0.2, cx + size / 2, cy - size / 4);
        offCtx.bezierCurveTo(cx + size / 2, cy - size / 2, cx, cy - size / 2, cx, cy - size / 4);
        offCtx.stroke();
    });

    // Draw the cached image centered on the target coordinates
    ctx.drawImage(cachedHeart, x - cacheSize / 2, (y + size / 4) - cacheSize / 2);
}

/**
 * Get card position for a given side and index
 */
export function getCardPosition(side, index) {
    const x = layout.startX + (index * (CARD.WIDTH + CARD.SPACING));
    const y = side === 'enemy' ? layout.enemyY : layout.playerY;
    return { x, y, width: CARD.WIDTH, height: CARD.HEIGHT };
}

/**
 * Update stored card positions (called during render)
 */
export function updateCardPositions() {
    if (!layoutDirty) return; // skip if layout hasn't changed
    layoutDirty = false;

    layout.cardPositions.player = [];
    layout.cardPositions.enemy = [];

    for (let i = 0; i < 4; i++) {
        layout.cardPositions.player.push(getCardPosition('player', i));
        layout.cardPositions.enemy.push(getCardPosition('enemy', i));
    }

    // Identity Card Positions (Left/Right edges)
    // 2 cards per side
    // SINGLE CENTER LANE
    const centerY = canvas.height / 2;
    const width = 80;
    const height = 100;

    layout.identityLaneY = centerY;

    layout.identityCardPositions = {
        player: [
            { x: 20, y: centerY - height / 2, width, height },   // Left Slot (Metronomo)
            { x: canvas.width - width - 20, y: centerY - height / 2, width, height }   // Right Slot (Scudo)
        ],
        enemy: [
            { x: 20, y: centerY - height / 2, width, height },   // Left Slot (Shared physical space with Player Left?)

            { x: 20, y: centerY - height / 2, width, height }, // Enemy Left
            { x: canvas.width - width - 20, y: centerY - height / 2, width, height } // Enemy Right
        ]
    };
}
