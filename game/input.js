// ===== INPUT HANDLING =====

import { CARD } from '../data/cards.js';
import { getCanvas, layout } from '../render/canvas.js';
import { attemptParry, startRallyPhase } from './rally.js';
import { resetGameState } from './state.js';

// Module-level references
let gameState = null;
let renderFn = null;
let endTurnFn = null;

/**
 * Initialize input module
 */
export function initInput(state, render, endTurn) {
    gameState = state;
    renderFn = render;
    endTurnFn = endTurn;
}

/**
 * Setup all event listeners
 */
export function setupEventListeners() {
    const canvas = getCanvas();

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle canvas click
 */
function handleClick(event) {
    if (gameState.animatingAttack) return;

    const { x, y } = getMousePosition(event);

    // GAME_OVER - Play Again button
    if (gameState.phase === 'GAME_OVER' && gameState.playAgainButton) {
        const btn = gameState.playAgainButton;
        if (x >= btn.x && x <= btn.x + btn.width &&
            y >= btn.y && y <= btn.y + btn.height) {
            resetGameState(gameState);
            renderFn();
            return;
        }
        return;
    }

    // RALLY - parry attempt
    if (gameState.phase === 'RALLY' && gameState.currentNote && gameState.timingIndicator) {
        attemptParry();
        return;
    }

    // SELECTION phase - select player card
    if (gameState.phase === 'SELECTION' && gameState.currentTurn === 'player') {
        for (let i = 0; i < layout.cardPositions.player.length; i++) {
            const pos = layout.cardPositions.player[i];
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                const card = gameState.playerCards[i];
                if (card.pv <= 0) return;

                if (gameState.selectedCard === i) {
                    gameState.selectedCard = null;
                } else {
                    gameState.selectedCard = i;
                    gameState.phase = 'DISTRIBUTION';
                }
                renderFn();
                return;
            }
        }
    }

    // DISTRIBUTION phase
    if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        handleDistributionClick(x, y);
    }
}

/**
 * Handle distribution phase clicks
 */
function handleDistributionClick(x, y) {
    const selectedCard = gameState.playerCards[gameState.selectedCard];
    const aliveLanes = gameState.enemyCards.filter(c => c.pv > 0).length;
    const maxNotes = Math.min(selectedCard.na, aliveLanes, gameState.playerStamina);

    const positions = layout.cardPositions;
    const laneTopY = positions.enemy[0].y + CARD.HEIGHT + 30;
    const laneBottomY = positions.player[0].y - 30;
    const buttonY = laneBottomY + 40;
    const buttonWidth = 120;
    const buttonHeight = 40;
    const buttonSpacing = 20;
    const cancelX = getCanvas().width / 2 - buttonWidth - buttonSpacing / 2;
    const confirmX = getCanvas().width / 2 + buttonSpacing / 2;

    // Cancel button
    if (x >= cancelX && x <= cancelX + buttonWidth &&
        y >= buttonY && y <= buttonY + buttonHeight) {
        gameState.phase = 'SELECTION';
        gameState.selectedCard = null;
        gameState.assignedNotes = [];
        renderFn();
        return;
    }

    // Confirm button
    if (gameState.assignedNotes.length > 0) {
        if (x >= confirmX && x <= confirmX + buttonWidth &&
            y >= buttonY && y <= buttonY + buttonHeight) {
            // Consume stamina
            gameState.playerStamina -= gameState.assignedNotes.length;
            if (gameState.playerStamina < 0) gameState.playerStamina = 0;

            startRallyPhase('player', gameState.selectedCard);
            return;
        }
    }

    // Lane clicks
    for (let i = 0; i < layout.lanePositions.length; i++) {
        const lane = layout.lanePositions[i];
        if (x >= lane.x && x <= lane.x + lane.width &&
            y >= lane.y && y <= lane.y + lane.height) {

            if (lane.disabled) return;

            const notesInLane = gameState.assignedNotes.filter(n => n === i).length;

            if (gameState.assignedNotes.length < maxNotes) {
                gameState.assignedNotes.push(i);
            } else if (notesInLane > 0) {
                const indexToRemove = gameState.assignedNotes.indexOf(i);
                if (indexToRemove !== -1) {
                    gameState.assignedNotes.splice(indexToRemove, 1);
                }
            }

            renderFn();
            return;
        }
    }
}

/**
 * Handle right-click for removing notes
 */
function handleContextMenu(event) {
    event.preventDefault();

    if (gameState.phase !== 'DISTRIBUTION' || gameState.currentTurn !== 'player') {
        return;
    }

    const { x, y } = getMousePosition(event);

    for (let i = 0; i < layout.lanePositions.length; i++) {
        const lane = layout.lanePositions[i];
        if (x >= lane.x && x <= lane.x + lane.width &&
            y >= lane.y && y <= lane.y + lane.height) {

            const indexToRemove = gameState.assignedNotes.indexOf(i);
            if (indexToRemove !== -1) {
                gameState.assignedNotes.splice(indexToRemove, 1);
                renderFn();
            }
            return;
        }
    }
}

/**
 * Handle keyboard input
 */
function handleKeyDown(event) {
    if (event.code === 'Space' && gameState.phase === 'RALLY' &&
        gameState.currentNote && gameState.timingIndicator) {
        event.preventDefault();
        attemptParry();
    }
}

/**
 * Handle mouse move for hover effects
 */
function handleMouseMove(event) {
    const canvas = getCanvas();

    if (gameState.animatingAttack) {
        canvas.style.cursor = 'default';
        return;
    }

    const { x, y } = getMousePosition(event);

    let isOverInteractable = false;
    const prevHoveredLane = gameState.hoveredLane;
    gameState.hoveredLane = null;

    // Check lanes in DISTRIBUTION phase
    if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
        for (let i = 0; i < layout.lanePositions.length; i++) {
            const lane = layout.lanePositions[i];
            if (x >= lane.x && x <= lane.x + lane.width &&
                y >= lane.y && y <= lane.y + lane.height) {
                gameState.hoveredLane = i;
                isOverInteractable = true;
                break;
            }
        }

        // Check buttons
        const positions = layout.cardPositions;
        const laneBottomY = positions.player[0].y - 30;
        const buttonY = laneBottomY + 40;
        const buttonWidth = 120;
        const buttonHeight = 40;
        const buttonSpacing = 20;
        const cancelX = canvas.width / 2 - buttonWidth - buttonSpacing / 2;
        const confirmX = canvas.width / 2 + buttonSpacing / 2;

        if ((x >= cancelX && x <= cancelX + buttonWidth &&
            y >= buttonY && y <= buttonY + buttonHeight) ||
            (gameState.assignedNotes.length > 0 &&
                x >= confirmX && x <= confirmX + buttonWidth &&
                y >= buttonY && y <= buttonY + buttonHeight)) {
            isOverInteractable = true;
        }

        // Re-render if hover changed
        if (prevHoveredLane !== gameState.hoveredLane) {
            renderFn();
        }
    }

    // Check player cards
    if ((gameState.phase === 'SELECTION' || gameState.phase === 'DISTRIBUTION') &&
        gameState.currentTurn === 'player') {
        for (let i = 0; i < layout.cardPositions.player.length; i++) {
            const pos = layout.cardPositions.player[i];
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                if (gameState.playerCards[i].pv > 0) {
                    isOverInteractable = true;
                }
                break;
            }
        }
    }

    canvas.style.cursor = isOverInteractable ? 'pointer' : 'default';
}

/**
 * Get mouse position relative to canvas
 */
function getMousePosition(event) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}
