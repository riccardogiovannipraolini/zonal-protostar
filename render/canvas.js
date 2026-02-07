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
 * Draw a filled heart shape
 */
export function drawHeart(x, y, size) {
    ctx.save();
    ctx.fillStyle = COLORS.heart;
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 5;

    ctx.beginPath();
    ctx.moveTo(x, y + size / 4);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
    ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.7, x, y + size);
    ctx.bezierCurveTo(x, y + size * 0.7, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
    ctx.fill();

    ctx.restore();
}

/**
 * Draw an empty heart outline
 */
export function drawEmptyHeart(x, y, size) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 71, 87, 0.4)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, y + size / 4);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
    ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.7, x, y + size);
    ctx.bezierCurveTo(x, y + size * 0.7, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
    ctx.stroke();

    ctx.restore();
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
    layout.cardPositions.player = [];
    layout.cardPositions.enemy = [];

    for (let i = 0; i < 4; i++) {
        layout.cardPositions.player.push(getCardPosition('player', i));
        layout.cardPositions.enemy.push(getCardPosition('enemy', i));
    }

    // Identity Card Positions (Left/Right edges)
    // 2 cards per side
    const leftY = canvas.height * 0.42; // Top Lane
    const rightY = canvas.height * 0.58; // Bottom Lane
    const width = 80;
    const height = 100;

    layout.identityCardPositions = {
        player: [
            { x: 20, y: leftY, width, height },   // Top (Left implied)
            { x: 20, y: rightY, width, height }   // Bottom (Right implied)
        ],
        enemy: [
            { x: canvas.width - width - 20, y: leftY, width, height }, // Top
            { x: canvas.width - width - 20, y: rightY, width, height } // Bottom
        ]
    };
}
