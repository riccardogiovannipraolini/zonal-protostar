document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Game State
    const gameState = {
        phase: 'SELECTION', // SELECTION, DISTRIBUTION, RALLY, END_TURN
        currentTurn: 'player',
        selectedCard: null,
        targetCard: null,
        assignedNotes: [], // Array of lane indices (0-3) where notes are assigned
        hoveredLane: null, // Currently hovered lane index
        animatingAttack: false,
        shakeCard: null, // { side: 'player'|'enemy', index: number, frames: number }
        message: null, // { text: string, frames: number }
        // Rally phase state
        rallyState: null, // { attacker: 'player'|'enemy', attackerIndex: number, defenderIndex: number, lanes: [] }
        currentNote: null, // { lane: number, progress: 0-1, startTime: timestamp, duration: ms, startX, startY, endX, endY }
        timingIndicator: null, // { startTime: timestamp, duration: 500, radius: number }
        rallyResults: [], // [{ lane: number, result: 'PARRY'|'HIT' }]
        parryAttempted: false, // Flag to prevent multiple parry attempts per note
        playerCards: [
            { name: 'Virgil', pv: 3, maxPv: 3, na: 4, speed: 3 },
            { name: 'Salvataggio', pv: 5, maxPv: 5, na: 1, speed: 2 },
            { name: 'Origami', pv: 2, maxPv: 2, na: 3, speed: 4 },
            { name: 'Rovi', pv: 2, maxPv: 2, na: 5, speed: 5 }
        ],
        enemyCards: [
            { name: 'Virgil', pv: 3, maxPv: 3, na: 4, speed: 3 },
            { name: 'Salvataggio', pv: 5, maxPv: 5, na: 1, speed: 2 },
            { name: 'Origami', pv: 2, maxPv: 2, na: 3, speed: 4 },
            { name: 'Rovi', pv: 2, maxPv: 2, na: 5, speed: 5 }
        ],
        floatingTexts: [],
        gameOver: null, // { winner: 'player'|'enemy', reason: string }
        aiParryFlash: null // { cardIndex: number, startTime: timestamp } - visual feedback for AI parry
    };

    // Card dimensions and positioning
    const cardWidth = 100;
    const cardHeight = 130;
    const cardSpacing = 20;
    const totalWidth = (cardWidth * 4) + (cardSpacing * 3);
    const startX = (canvas.width - totalWidth) / 2;

    // Colors
    const enemyCardGradient = { top: '#8b0000', bottom: '#4a0000' };
    const playerCardGradient = { top: '#1e5128', bottom: '#0d2818' };
    const cardBorder = '#ffd700';
    const selectedBorder = '#ffea00';
    const textColor = '#ffffff';
    const heartColor = '#ff4757';

    // Phase colors for indicator
    const phaseColors = {
        'SELECTION': '#3498db',
        'DISTRIBUTION': '#9b59b6',
        'RALLY': '#e74c3c',
        'END_TURN': '#2ecc71',
        'GAME_OVER': '#f39c12'
    };

    // AI Configuration (for tuning difficulty)
    const AI_CONFIG = {
        parrySuccessRate: 0.6,       // 60% chance to successfully parry
        preferAliveTargets: true,     // Prefer lanes with alive player cards
        selectionDelayMs: 1000,       // 1 second delay during selection
        distributionDelayMs: 1500,    // 1.5 second delay during distribution
        parryDelayMinMs: 50,          // Min delay before AI parry attempt
        parryDelayMaxMs: 150          // Max delay before AI parry attempt
    };

    // Store card positions for click detection
    let cardPositions = {
        player: [],
        enemy: []
    };

    // Store lane positions for click detection
    let lanePositions = [];

    // Draw phase indicator at top
    function drawPhaseIndicator() {
        const phases = ['SELECTION', 'DISTRIBUTION', 'RALLY', 'END_TURN'];
        const indicatorWidth = 140;
        const indicatorHeight = 24;
        const spacing = 10;
        const totalIndicatorWidth = (indicatorWidth * 4) + (spacing * 3);
        const startIndicatorX = (canvas.width - totalIndicatorWidth) / 2;
        const indicatorY = 3;

        for (let i = 0; i < phases.length; i++) {
            const x = startIndicatorX + (i * (indicatorWidth + spacing));
            const phase = phases[i];
            const isActive = gameState.phase === phase;

            // Background
            ctx.fillStyle = isActive ? phaseColors[phase] : 'rgba(255, 255, 255, 0.1)';
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

    // Draw a heart shape
    function drawHeart(x, y, size) {
        ctx.save();
        ctx.fillStyle = heartColor;
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

    // Draw empty heart (for lost PV)
    function drawEmptyHeart(x, y, size) {
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

    // Draw a single card
    function drawCard(x, y, card, isEnemy, index) {
        const gradient = isEnemy ? enemyCardGradient : playerCardGradient;
        const isSelected = !isEnemy && gameState.selectedCard === index;
        const isEnemySelected = isEnemy && gameState.currentTurn === 'enemy' && gameState.selectedCard === index;
        const isTarget = isEnemy && gameState.targetCard === index;
        const isSelectable = !isEnemy && card.pv > 0 && gameState.phase === 'SELECTION' && gameState.currentTurn === 'player';
        const isTargetable = isEnemy && card.pv > 0 && gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player';
        const isDead = card.pv <= 0;

        // AI parry flash effect (when AI attempts parry)
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
        ctx.shadowBlur = isSelected || isTarget ? 20 : 10;
        ctx.shadowOffsetY = isSelected || isTarget ? 0 : 3;

        // Card background
        const bgGradient = ctx.createLinearGradient(x, y, x, y + cardHeight);
        if (isDead) {
            bgGradient.addColorStop(0, '#333333');
            bgGradient.addColorStop(1, '#1a1a1a');
        } else {
            bgGradient.addColorStop(0, gradient.top);
            bgGradient.addColorStop(1, gradient.bottom);
        }

        ctx.fillStyle = bgGradient;
        ctx.beginPath();
        ctx.roundRect(x, y, cardWidth, cardHeight, 8);
        ctx.fill();
        ctx.restore();

        // Card border with glow
        ctx.save();
        if (hasAIFlash) {
            // AI parry flash - bright cyan glow
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 25;
        } else if (isEnemySelected) {
            // Enemy card selected during AI turn - orange highlight
            ctx.strokeStyle = '#ff8c00';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ff8c00';
            ctx.shadowBlur = 15;
        } else if (isSelected) {
            ctx.strokeStyle = selectedBorder;
            ctx.lineWidth = 3;
            ctx.shadowColor = selectedBorder;
            ctx.shadowBlur = 15;
        } else if (isTarget) {
            ctx.strokeStyle = '#ff4757';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ff4757';
            ctx.shadowBlur = 15;
        } else {
            ctx.strokeStyle = isDead ? '#666666' : cardBorder;
            ctx.lineWidth = 2;
            ctx.shadowColor = isDead ? 'transparent' : cardBorder;
            ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.roundRect(x, y, cardWidth, cardHeight, 8);
        ctx.stroke();
        ctx.restore();

        // Hover effect indicator for selectable cards
        if (isSelectable && !isSelected) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 234, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.roundRect(x - 2, y - 2, cardWidth + 4, cardHeight + 4, 10);
            ctx.stroke();
            ctx.restore();
        }

        // Targetable indicator for enemy cards in DISTRIBUTION phase
        if (isTargetable && !isTarget) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 71, 87, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.roundRect(x - 2, y - 2, cardWidth + 4, cardHeight + 4, 10);
            ctx.stroke();
            ctx.restore();
        }

        // Inner decorative border
        ctx.strokeStyle = isDead ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x + 5, y + 5, cardWidth - 10, cardHeight - 10, 5);
        ctx.stroke();

        // Card name
        ctx.save();
        ctx.fillStyle = isDead ? '#666666' : textColor;
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 3;
        ctx.fillText(card.name, x + cardWidth / 2, y + 22);
        ctx.restore();

        // Decorative line under name
        ctx.strokeStyle = isDead ? '#444444' : cardBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + 32);
        ctx.lineTo(x + cardWidth - 12, y + 32);
        ctx.stroke();

        // Character silhouette placeholder
        ctx.fillStyle = isDead ? 'rgba(100, 100, 100, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(x + cardWidth / 2, y + 60, 20, 0, Math.PI * 2);
        ctx.fill();

        // First letter as avatar
        ctx.save();
        ctx.fillStyle = isDead ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(card.name[0], x + cardWidth / 2, y + 60);
        ctx.restore();

        // Dead overlay
        if (isDead) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.roundRect(x, y, cardWidth, cardHeight, 8);
            ctx.fill();

            ctx.fillStyle = '#ff4757';
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💀', x + cardWidth / 2, y + cardHeight / 2);
            ctx.restore();
        }

        // PV label
        ctx.save();
        ctx.fillStyle = isDead ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PV', x + cardWidth / 2, y + cardHeight - 35);
        ctx.restore();

        // Draw hearts for PV (show maxPv hearts, fill based on current pv)
        const heartSize = 12;
        const heartSpacing = 16;
        const heartsWidth = card.maxPv * heartSpacing - (heartSpacing - heartSize);
        const heartsStartX = x + (cardWidth - heartsWidth) / 2;

        for (let i = 0; i < card.maxPv; i++) {
            if (i < card.pv) {
                drawHeart(heartsStartX + (i * heartSpacing) + heartSize / 2, y + cardHeight - 25, heartSize);
            } else {
                drawEmptyHeart(heartsStartX + (i * heartSpacing) + heartSize / 2, y + cardHeight - 25, heartSize);
            }
        }
    }

    // Draw battlefield divider
    function drawBattlefield() {
        // Background gradient
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

        // VS symbol
        ctx.save();
        ctx.fillStyle = '#e94560';
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#e94560';
        ctx.shadowBlur = 20;
        ctx.fillText('⚔ VS ⚔', canvas.width / 2, canvas.height / 2);
        ctx.restore();

        // Enemy label
        ctx.save();
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ENEMY', canvas.width / 2, 45);
        ctx.restore();

        // Player label
        ctx.save();
        ctx.fillStyle = '#51cf66';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PLAYER', canvas.width / 2, canvas.height - 12);
        ctx.restore();
    }

    // Main render function
    function render() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw battlefield
        drawBattlefield();

        // Draw phase indicator
        drawPhaseIndicator();

        // Reset card positions
        cardPositions.player = [];
        cardPositions.enemy = [];

        // Draw enemy cards (top row) - minimal margin to maximize rally gap
        const enemyY = 55;
        for (let i = 0; i < gameState.enemyCards.length; i++) {
            const x = startX + (i * (cardWidth + cardSpacing));
            drawCard(x, enemyY, gameState.enemyCards[i], true, i);
            cardPositions.enemy.push({ x, y: enemyY, width: cardWidth, height: cardHeight });
        }

        // Draw player cards (bottom row) - minimal margin to maximize rally gap
        const playerY = canvas.height - cardHeight - 20;
        for (let i = 0; i < gameState.playerCards.length; i++) {
            const x = startX + (i * (cardWidth + cardSpacing));
            drawCard(x, playerY, gameState.playerCards[i], false, i);
            cardPositions.player.push({ x, y: playerY, width: cardWidth, height: cardHeight });
        }
    }

    // Draw note distribution overlay
    function drawNoteDistributionOverlay() {
        if (gameState.phase !== 'DISTRIBUTION' || gameState.currentTurn !== 'player' || gameState.selectedCard === null) {
            return;
        }

        const selectedCard = gameState.playerCards[gameState.selectedCard];
        // Calculate how many enemy cards are still alive (valid targets)
        const aliveLanes = gameState.enemyCards.filter(c => c.pv > 0).length;
        const maxNotes = Math.min(selectedCard.na, aliveLanes); // Cap by NA and alive targets

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
        const laneTopY = cardPositions.enemy[0].y + cardHeight + 30;
        const laneBottomY = cardPositions.player[0].y - 30;
        const laneHeight = laneBottomY - laneTopY;

        // Reset lane positions
        lanePositions = [];

        // Draw lanes
        for (let i = 0; i < 4; i++) {
            const laneX = lanesStartX + (i * (laneWidth + laneSpacing));
            const isHovered = gameState.hoveredLane === i;
            const hasNote = gameState.assignedNotes.includes(i);
            const enemyCard = gameState.enemyCards[i];
            const isDisabled = enemyCard.pv <= 0; // Lane is disabled if target is destroyed

            // Store lane position (with disabled flag)
            lanePositions.push({ x: laneX, y: laneTopY, width: laneWidth, height: laneHeight, disabled: isDisabled });

            // Lane background
            ctx.save();
            if (isDisabled) {
                // Grayed out disabled lane
                ctx.fillStyle = 'rgba(50, 50, 50, 0.6)';
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
                ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
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
            ctx.fillStyle = isDisabled ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Lane ${i + 1}`, laneX + laneWidth / 2, laneTopY - 10);
            ctx.restore();

            // Draw skull icon for disabled lanes (destroyed targets)
            if (isDisabled) {
                const skullY = laneTopY + laneHeight / 2;
                const skullX = laneX + laneWidth / 2;

                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#666666';
                ctx.font = 'bold 50px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('💀', skullX, skullY);
                ctx.restore();
            }
            // Draw note icon if assigned
            else if (hasNote) {
                const noteY = laneTopY + laneHeight / 2;
                const noteX = laneX + laneWidth / 2;
                const pulseScale = 1 + Math.sin(Date.now() / 200) * 0.1;

                ctx.save();
                ctx.translate(noteX, noteY);
                ctx.scale(pulseScale, pulseScale);

                // Note icon (musical note)
                ctx.fillStyle = '#9b59b6';
                ctx.font = 'bold 40px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#9b59b6';
                ctx.shadowBlur = 15;
                ctx.fillText('♪', 0, 0);

                ctx.restore();
            }
        }

        // Draw counter (showing available targets)
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 5;
        ctx.fillText(`Notes: ${gameState.assignedNotes.length}/${maxNotes}`, canvas.width / 2, laneTopY - 40);
        ctx.restore();

        // Draw buttons
        const buttonY = laneBottomY + 40;
        const buttonWidth = 120;
        const buttonHeight = 40;
        const buttonSpacing = 20;

        // Cancel button (always visible)
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

        // Confirm button (only if notes assigned)
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


    // ===== RALLY PHASE FUNCTIONS =====

    // Get travel duration based on card speed
    function getTravelDuration(speed) {
        if (speed <= 2) return 2000; // Speed 0.8 (Salvataggio)
        if (speed <= 3) return 1500; // Speed 1.0 (Virgil, Rovi)
        return 1200; // Speed 1.3 (Origami)
    }

    // Get parry timing window based on card speed (in ms)
    // Larger windows make parry easier
    function getParryWindow(speed) {
        if (speed <= 2) return 400; // Slow cards - easiest to parry
        if (speed <= 3) return 350; // Medium speed
        return 300; // Fast cards - hardest to parry
    }

    // Start rally phase
    function startRallyPhase(attacker, attackerIndex) {
        const isPlayerAttacker = attacker === 'player';
        const attackerCards = isPlayerAttacker ? gameState.playerCards : gameState.enemyCards;

        gameState.rallyState = {
            attacker: attacker,
            attackerIndex: attackerIndex,
            lanes: [...gameState.assignedNotes], // Copy assigned lanes
            currentLaneIndex: 0
        };

        gameState.rallyResults = [];
        gameState.phase = 'RALLY';

        // Start first note
        spawnNextNote();
    }

    // Spawn the next note in sequence
    function spawnNextNote() {
        if (!gameState.rallyState || gameState.rallyState.currentLaneIndex >= gameState.rallyState.lanes.length) {
            // All notes processed, finish rally phase
            finishRallyPhase();
            return;
        }

        const isPlayerAttacker = gameState.rallyState.attacker === 'player';
        const attackerCards = isPlayerAttacker ? gameState.playerCards : gameState.enemyCards;
        const defenderCards = isPlayerAttacker ? gameState.enemyCards : gameState.playerCards;

        const attackerCard = attackerCards[gameState.rallyState.attackerIndex];
        const lane = gameState.rallyState.lanes[gameState.rallyState.currentLaneIndex];
        const defenderCard = defenderCards[lane];

        // Check if defender card is destroyed (empty lane)
        // This should not normally happen since destroyed lanes are disabled,
        // but as a safety fallback, skip to the next note silently
        if (defenderCard.pv <= 0) {
            gameState.rallyState.currentLaneIndex++;
            spawnNextNote();
            return;
        }

        // Calculate positions
        const attackerPos = isPlayerAttacker ?
            cardPositions.player[gameState.rallyState.attackerIndex] :
            cardPositions.enemy[gameState.rallyState.attackerIndex];

        const defenderPos = isPlayerAttacker ?
            cardPositions.enemy[lane] :
            cardPositions.player[lane];

        const startX = attackerPos.x + cardWidth / 2;
        const startY = attackerPos.y + cardHeight / 2;
        const endX = defenderPos.x + cardWidth / 2;
        const endY = defenderPos.y + cardHeight / 2;

        const duration = getTravelDuration(attackerCard.speed);

        gameState.currentNote = {
            lane: lane,
            progress: 0,
            startTime: Date.now(),
            duration: duration,
            startX: startX,
            startY: startY,
            endX: endX,
            endY: endY
        };

        gameState.timingIndicator = null;
        gameState.parryAttempted = false;

        // Start animation loop
        animateNote();
    }

    // Animate note movement
    function animateNote() {
        if (!gameState.currentNote) return;

        const elapsed = Date.now() - gameState.currentNote.startTime;
        const progress = Math.min(elapsed / gameState.currentNote.duration, 1);

        gameState.currentNote.progress = progress;

        // Start timing indicator at 50% progress for more reaction time
        if (progress >= 0.5 && !gameState.timingIndicator) {
            const isPlayerAttacker = gameState.rallyState.attacker === 'player';
            const defenderCards = isPlayerAttacker ? gameState.enemyCards : gameState.playerCards;
            const defenderCard = defenderCards[gameState.currentNote.lane];

            // Duration matches the remaining travel time (50% of total)
            const remainingTime = gameState.currentNote.duration * 0.5;

            gameState.timingIndicator = {
                startTime: Date.now(),
                duration: remainingTime,
                parryWindow: getParryWindow(defenderCard.speed)
            };

            // If player is attacking, AI needs to defend - schedule AI parry attempt
            if (isPlayerAttacker) {
                scheduleAIParry(remainingTime);
            }
        }

        render();
        drawRallyPhase();

        if (progress < 1) {
            requestAnimationFrame(animateNote);
        } else {
            // Note reached target
            handleNoteImpact();
        }
    }

    // Schedule AI parry attempt with random delay and success chance
    function scheduleAIParry(remainingTime) {
        // Calculate when AI should attempt parry (in the parry window)
        const parryWindow = gameState.timingIndicator.parryWindow;
        const perfectStart = 1 - (parryWindow / remainingTime);

        // AI attempts parry somewhere in the valid window with random variance
        const aiDelay = AI_CONFIG.parryDelayMinMs +
            Math.random() * (AI_CONFIG.parryDelayMaxMs - AI_CONFIG.parryDelayMinMs);

        // Calculate actual timing - AI tries to hit within the parry window
        const targetTime = remainingTime * perfectStart + aiDelay;

        setTimeout(() => {
            // Check if note still active and parry not already attempted
            if (!gameState.currentNote || !gameState.timingIndicator || gameState.parryAttempted) {
                return;
            }

            // AI decides whether to successfully parry based on success rate
            const parrySuccess = Math.random() < AI_CONFIG.parrySuccessRate;

            // Show AI "pressing" parry - visual flash on the defending card
            gameState.aiParryFlash = {
                cardIndex: gameState.currentNote.lane,
                startTime: Date.now()
            };

            gameState.parryAttempted = true;

            if (parrySuccess) {
                // AI PARRY SUCCESS
                gameState.rallyResults.push({
                    lane: gameState.currentNote.lane,
                    result: 'PARRY'
                });
                showImpactFeedback('PARRY');

                // Skip to next note
                setTimeout(() => {
                    gameState.currentNote = null;
                    gameState.timingIndicator = null;
                    gameState.aiParryFlash = null;
                    gameState.rallyState.currentLaneIndex++;
                    spawnNextNote();
                }, 300);
            } else {
                // AI PARRY FAILED - will be processed as HIT in handleNoteImpact
                showImpactFeedback('HIT');
                gameState.rallyResults.push({
                    lane: gameState.currentNote.lane,
                    result: 'HIT'
                });
            }

            // Clear flash after brief moment
            setTimeout(() => {
                gameState.aiParryFlash = null;
                render();
            }, 150);

        }, targetTime);
    }

    // Handle note impact (hit or parry)
    function handleNoteImpact() {
        if (!gameState.parryAttempted) {
            // No parry attempt, it's a HIT
            gameState.rallyResults.push({
                lane: gameState.currentNote.lane,
                result: 'HIT'
            });

            // Show hit animation
            showImpactFeedback('HIT');
        }

        // Move to next note after brief delay
        setTimeout(() => {
            gameState.currentNote = null;
            gameState.timingIndicator = null;
            gameState.rallyState.currentLaneIndex++;
            spawnNextNote();
        }, 300);
    }

    // Attempt parry
    function attemptParry() {
        if (!gameState.currentNote || !gameState.timingIndicator || gameState.parryAttempted) {
            return;
        }

        gameState.parryAttempted = true;

        const elapsed = Date.now() - gameState.timingIndicator.startTime;
        const timingProgress = elapsed / gameState.timingIndicator.duration;

        // Perfect timing is in the last portion of the shrink (based on parry window)
        const perfectStart = 1 - (gameState.timingIndicator.parryWindow / gameState.timingIndicator.duration);

        if (timingProgress >= perfectStart && timingProgress <= 1) {
            // PARRY SUCCESS
            gameState.rallyResults.push({
                lane: gameState.currentNote.lane,
                result: 'PARRY'
            });
            showImpactFeedback('PARRY');

            // Skip to next note
            setTimeout(() => {
                gameState.currentNote = null;
                gameState.timingIndicator = null;
                gameState.rallyState.currentLaneIndex++;
                spawnNextNote();
            }, 300);
        } else {
            // PARRY FAILED - treat as HIT
            gameState.rallyResults.push({
                lane: gameState.currentNote.lane,
                result: 'HIT'
            });
            showImpactFeedback('HIT');
        }
    }

    // Show impact feedback
    function showImpactFeedback(result) {
        const isPlayerAttacker = gameState.rallyState.attacker === 'player';
        const defenderSide = isPlayerAttacker ? 'enemy' : 'player';
        const note = gameState.currentNote;

        // Calculate position for feedback
        const x = note.endX;
        const y = note.endY - 40;

        // Add floating text
        const floatingText = {
            text: result === 'PARRY' ? 'PARRY!' : 'HIT!',
            x: x,
            y: y,
            opacity: 1,
            color: result === 'PARRY' ? '#2ecc71' : '#e74c3c',
            startTime: Date.now()
        };
        gameState.floatingTexts.push(floatingText);

        // Animate floating text
        const textDuration = 1000;
        const animateText = () => {
            const elapsed = Date.now() - floatingText.startTime;
            const progress = elapsed / textDuration;

            if (progress < 1) {
                floatingText.y = y - (progress * 50);
                floatingText.opacity = 1 - progress;
                render();
                requestAnimationFrame(animateText);
            } else {
                gameState.floatingTexts = gameState.floatingTexts.filter(t => t !== floatingText);
                render();
            }
        };
        requestAnimationFrame(animateText);

        if (result === 'HIT') {
            // Shake the defender card
            gameState.shakeCard = {
                side: defenderSide,
                index: gameState.currentNote.lane,
                frames: 0
            };

            let shakeFrames = 0;
            const shakeInterval = setInterval(() => {
                shakeFrames++;
                gameState.shakeCard.frames = shakeFrames;
                render();
                drawRallyPhase();

                if (shakeFrames >= 10) {
                    clearInterval(shakeInterval);
                    gameState.shakeCard = null;
                }
            }, 50);
        }
    }

    // Draw floating texts
    function drawFloatingTexts() {
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

    // Finish rally phase and apply damage
    function finishRallyPhase() {
        const isPlayerAttacker = gameState.rallyState.attacker === 'player';
        const attackerCards = isPlayerAttacker ? gameState.playerCards : gameState.enemyCards;
        const defenderCards = isPlayerAttacker ? gameState.enemyCards : gameState.playerCards;

        const attackerCard = attackerCards[gameState.rallyState.attackerIndex];

        // Apply damage for each HIT (only 1 damage per hit, not NA)
        const hits = gameState.rallyResults.filter(r => r.result === 'HIT');
        hits.forEach(hit => {
            const defenderCard = defenderCards[hit.lane];
            if (defenderCard.pv > 0) {
                defenderCard.pv -= 1;
                if (defenderCard.pv < 0) defenderCard.pv = 0;
            }
        });

        // Check win/lose conditions
        const playerAlive = gameState.playerCards.some(c => c.pv > 0);
        const enemyAlive = gameState.enemyCards.some(c => c.pv > 0);

        if (!enemyAlive) {
            gameState.phase = 'GAME_OVER';
            gameState.gameOver = { winner: 'player', reason: 'All enemy cards destroyed!' };
            render();
            return;
        }

        if (!playerAlive) {
            gameState.phase = 'GAME_OVER';
            gameState.gameOver = { winner: 'enemy', reason: 'All your cards destroyed!' };
            render();
            return;
        }

        // Clean up and end turn
        gameState.rallyState = null;
        gameState.currentNote = null;
        gameState.timingIndicator = null;
        gameState.assignedNotes = [];

        endTurn(isPlayerAttacker ? 'player' : 'enemy');
    }


    // Draw rally phase visuals
    function drawRallyPhase() {
        if (gameState.phase !== 'RALLY' || !gameState.currentNote) return;

        const note = gameState.currentNote;

        // Calculate current position
        const currentX = note.startX + (note.endX - note.startX) * note.progress;
        const currentY = note.startY + (note.endY - note.startY) * note.progress;

        // Draw note
        const pulseScale = 1 + Math.sin(Date.now() / 100) * 0.1;

        ctx.save();
        ctx.translate(currentX, currentY);
        ctx.scale(pulseScale, pulseScale);

        // Note glow
        ctx.shadowColor = '#9b59b6';
        ctx.shadowBlur = 20;

        // Note icon
        ctx.fillStyle = '#9b59b6';
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
            const maxRadius = cardWidth * 0.75;
            const minRadius = cardWidth * 0.5;
            const currentRadius = maxRadius - (maxRadius - minRadius) * progress;

            const isPlayerAttacker = gameState.rallyState.attacker === 'player';
            const defenderPos = isPlayerAttacker ?
                cardPositions.enemy[note.lane] :
                cardPositions.player[note.lane];

            const centerX = defenderPos.x + cardWidth / 2;
            const centerY = defenderPos.y + cardHeight / 2;

            // Color gradient based on timing
            const perfectStart = 1 - (gameState.timingIndicator.parryWindow / gameState.timingIndicator.duration);
            let color;
            if (progress < perfectStart) {
                color = '#e74c3c'; // Red - too early
            } else {
                color = '#2ecc71'; // Green - perfect zone
            }

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Draw parry prompt
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


    // Handle canvas click
    function handleClick(event) {
        if (gameState.animatingAttack) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        // GAME_OVER phase - Play Again button
        if (gameState.phase === 'GAME_OVER' && gameState.playAgainButton) {
            const btn = gameState.playAgainButton;
            if (x >= btn.x && x <= btn.x + btn.width &&
                y >= btn.y && y <= btn.y + btn.height) {
                resetGame();
                return;
            }
            return; // Ignore other clicks during game over
        }

        // Rally phase - parry attempt on click
        if (gameState.phase === 'RALLY' && gameState.currentNote && gameState.timingIndicator) {
            attemptParry();
            return;
        }




        // SELECTION phase - select player card
        if (gameState.phase === 'SELECTION' && gameState.currentTurn === 'player') {
            for (let i = 0; i < cardPositions.player.length; i++) {
                const pos = cardPositions.player[i];
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
                    render();
                    return;
                }
            }
        }

        // DISTRIBUTION phase - handle lane clicks and buttons
        if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
            const selectedCard = gameState.playerCards[gameState.selectedCard];
            const maxNotes = Math.min(selectedCard.na, 4);

            // Check button clicks
            const laneTopY = cardPositions.enemy[0].y + cardHeight + 30;
            const laneBottomY = cardPositions.player[0].y - 30;
            const buttonY = laneBottomY + 40;
            const buttonWidth = 120;
            const buttonHeight = 40;
            const buttonSpacing = 20;
            const cancelX = canvas.width / 2 - buttonWidth - buttonSpacing / 2;
            const confirmX = canvas.width / 2 + buttonSpacing / 2;

            // Cancel button
            if (x >= cancelX && x <= cancelX + buttonWidth &&
                y >= buttonY && y <= buttonY + buttonHeight) {
                gameState.phase = 'SELECTION';
                gameState.selectedCard = null;
                gameState.assignedNotes = [];
                render();
                return;
            }

            // Confirm button (only if notes assigned)
            if (gameState.assignedNotes.length > 0) {
                if (x >= confirmX && x <= confirmX + buttonWidth &&
                    y >= buttonY && y <= buttonY + buttonHeight) {
                    // Start rally phase with assigned notes
                    console.log('Notes assigned to lanes:', gameState.assignedNotes);
                    startRallyPhase('player', gameState.selectedCard);
                    return;
                }
            }

            // Check lane clicks
            // Calculate alive lanes for accurate maxNotes
            const aliveLanes = gameState.enemyCards.filter(c => c.pv > 0).length;
            const actualMaxNotes = Math.min(selectedCard.na, aliveLanes);

            for (let i = 0; i < lanePositions.length; i++) {
                const lane = lanePositions[i];
                if (x >= lane.x && x <= lane.x + lane.width &&
                    y >= lane.y && y <= lane.y + lane.height) {

                    // Skip disabled lanes (destroyed enemy cards)
                    if (lane.disabled) {
                        return; // Click does nothing on disabled lanes
                    }

                    const hasNote = gameState.assignedNotes.includes(i);

                    if (hasNote) {
                        // Remove note
                        gameState.assignedNotes = gameState.assignedNotes.filter(n => n !== i);
                    } else if (gameState.assignedNotes.length < actualMaxNotes) {
                        // Add note
                        gameState.assignedNotes.push(i);
                    }

                    render();
                    return;
                }
            }
        }

    }

    // Execute attack
    function executeAttack(attacker) {
        gameState.animatingAttack = true;

        let attackerCard, targetCard, targetSide;
        if (attacker === 'player') {
            attackerCard = gameState.playerCards[gameState.selectedCard];
            targetCard = gameState.enemyCards[gameState.targetCard];
            targetSide = 'enemy';
        } else {
            attackerCard = gameState.enemyCards[gameState.selectedCard];
            targetCard = gameState.playerCards[gameState.targetCard];
            targetSide = 'player';
        }

        // Start shake animation
        gameState.shakeCard = {
            side: targetSide,
            index: attacker === 'player' ? gameState.targetCard : gameState.targetCard,
            frames: 0
        };

        // Animate shake
        let shakeFrames = 0;
        const shakeInterval = setInterval(() => {
            shakeFrames++;
            gameState.shakeCard.frames = shakeFrames;
            render();

            if (shakeFrames >= 15) {
                clearInterval(shakeInterval);
                gameState.shakeCard = null;

                // Apply damage
                targetCard.pv -= attackerCard.na;
                if (targetCard.pv < 0) targetCard.pv = 0;

                // Check win/lose
                const playerAlive = gameState.playerCards.some(c => c.pv > 0);
                const enemyAlive = gameState.enemyCards.some(c => c.pv > 0);

                if (!enemyAlive) {
                    gameState.phase = 'END_TURN';
                    gameState.message = { text: '🎉 VITTORIA! 🎉', frames: 999 };
                    gameState.animatingAttack = false;
                    render();
                    return;
                }

                if (!playerAlive) {
                    gameState.phase = 'END_TURN';
                    gameState.message = { text: '💀 SCONFITTA 💀', frames: 999 };
                    gameState.animatingAttack = false;
                    render();
                    return;
                }

                // End turn
                endTurn(attacker);
            }
        }, 50);
    }

    // End turn and switch to other player
    function endTurn(currentAttacker) {
        gameState.phase = 'END_TURN';
        render();

        setTimeout(() => {
            gameState.selectedCard = null;
            gameState.targetCard = null;
            gameState.animatingAttack = false;

            if (currentAttacker === 'player') {
                gameState.currentTurn = 'enemy';
                gameState.phase = 'SELECTION';
                render();
                // AI takes turn
                setTimeout(() => aiTurn(), 500);
            } else {
                gameState.currentTurn = 'player';
                gameState.phase = 'SELECTION';
                render();
            }
        }, 500);
    }

    // AI turn logic
    function aiTurn() {
        // SELECTION PHASE: Select random alive AI card with delay
        const aliveAiCards = gameState.enemyCards
            .map((c, i) => ({ card: c, index: i }))
            .filter(c => c.card.pv > 0);

        if (aliveAiCards.length === 0) return;

        // Visual: brief "thinking" animation could go here
        render();

        // Selection delay for feel
        setTimeout(() => {
            const aiChoice = aliveAiCards[Math.floor(Math.random() * aliveAiCards.length)];
            gameState.selectedCard = aiChoice.index;

            // Highlight selected card briefly before moving to distribution
            render();

            // Transition to DISTRIBUTION after selection highlight
            setTimeout(() => {
                gameState.phase = 'DISTRIBUTION';
                render();

                // DISTRIBUTION PHASE: Assign notes with delay
                setTimeout(() => {
                    const aiCard = gameState.enemyCards[aiChoice.index];

                    // Get alive player lanes
                    const aliveLanes = [0, 1, 2, 3].filter(lane => gameState.playerCards[lane].pv > 0);
                    const maxNotes = Math.min(aiCard.na, aliveLanes.length);

                    gameState.assignedNotes = [];

                    if (AI_CONFIG.preferAliveTargets && aliveLanes.length > 0) {
                        // Smart targeting: prefer lanes with alive player cards
                        for (let i = 0; i < maxNotes; i++) {
                            // Weighted random selection - can attack same lane multiple times
                            const lane = aliveLanes[Math.floor(Math.random() * aliveLanes.length)];
                            gameState.assignedNotes.push(lane);
                        }
                    } else {
                        // Fallback: random lanes
                        for (let i = 0; i < maxNotes && aliveLanes.length > 0; i++) {
                            const randomIndex = Math.floor(Math.random() * aliveLanes.length);
                            const lane = aliveLanes[randomIndex];
                            gameState.assignedNotes.push(lane);
                        }
                    }

                    // Show notes appearing in lanes (visual feedback)
                    render();

                    // Brief pause to show note assignment, then start rally
                    setTimeout(() => {
                        startRallyPhase('enemy', aiChoice.index);
                    }, 500);

                }, AI_CONFIG.distributionDelayMs);
            }, 300); // Brief pause after selection

        }, AI_CONFIG.selectionDelayMs);
    }

    // Reset game to initial state
    function resetGame() {
        // Reset all cards to max PV
        gameState.playerCards.forEach(card => {
            card.pv = card.maxPv;
        });
        gameState.enemyCards.forEach(card => {
            card.pv = card.maxPv;
        });

        // Reset game state
        gameState.phase = 'SELECTION';
        gameState.currentTurn = 'player';
        gameState.selectedCard = null;
        gameState.targetCard = null;
        gameState.assignedNotes = [];
        gameState.hoveredLane = null;
        gameState.animatingAttack = false;
        gameState.shakeCard = null;
        gameState.message = null;
        gameState.rallyState = null;
        gameState.currentNote = null;
        gameState.timingIndicator = null;
        gameState.rallyResults = [];
        gameState.parryAttempted = false;
        gameState.floatingTexts = [];
        gameState.gameOver = null;

        render();
    }

    // Draw game over screen
    function drawGameOverScreen() {
        if (!gameState.gameOver) return;

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

    // Draw message overlay
    function drawMessage() {
        if (!gameState.message) return;

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


    // Add click listener
    canvas.addEventListener('click', handleClick);

    // Add spacebar listener for parry
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && gameState.phase === 'RALLY' && gameState.currentNote && gameState.timingIndicator) {
            event.preventDefault();
            attemptParry();
        }
    });

    // Add cursor style for hovering
    canvas.addEventListener('mousemove', (event) => {
        if (gameState.animatingAttack) {
            canvas.style.cursor = 'default';
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        let isOverInteractable = false;
        let prevHoveredLane = gameState.hoveredLane;
        gameState.hoveredLane = null;

        // Check lanes in DISTRIBUTION phase
        if (gameState.phase === 'DISTRIBUTION' && gameState.currentTurn === 'player') {
            const selectedCard = gameState.playerCards[gameState.selectedCard];
            const maxNotes = Math.min(selectedCard.na, 4);

            // Check lane hovers
            for (let i = 0; i < lanePositions.length; i++) {
                const lane = lanePositions[i];
                if (x >= lane.x && x <= lane.x + lane.width &&
                    y >= lane.y && y <= lane.y + lane.height) {
                    gameState.hoveredLane = i;
                    isOverInteractable = true;
                    break;
                }
            }

            // Check button hovers
            const laneTopY = cardPositions.enemy[0].y + cardHeight + 30;
            const laneBottomY = cardPositions.player[0].y - 30;
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

            // Re-render if hover state changed
            if (prevHoveredLane !== gameState.hoveredLane) {
                render();
            }
        }

        // Check player cards in SELECTION or DISTRIBUTION
        if ((gameState.phase === 'SELECTION' || gameState.phase === 'DISTRIBUTION') &&
            gameState.currentTurn === 'player') {
            for (let i = 0; i < cardPositions.player.length; i++) {
                const pos = cardPositions.player[i];
                if (x >= pos.x && x <= pos.x + pos.width &&
                    y >= pos.y && y <= pos.y + pos.height) {
                    if (gameState.playerCards[i].pv > 0) {
                        isOverInteractable = true;
                    }
                    break;
                }
            }
        }

        // Check enemy cards in DISTRIBUTION (removed - no longer needed)

        canvas.style.cursor = isOverInteractable ? 'pointer' : 'default';
    });

    // Update render to include message and note distribution overlay
    const originalRender = render;
    render = function () {
        originalRender();
        drawRallyPhase();
        drawNoteDistributionOverlay();
        drawFloatingTexts();
        drawMessage();
        drawGameOverScreen();
    };


    // Initial render
    render();

    // Expose gameState for debugging
    window.gameState = gameState;
    window.render = render;
});
