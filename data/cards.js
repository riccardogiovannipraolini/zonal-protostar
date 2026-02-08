// ===== CARD DATA & GAME CONFIGURATION =====

// Musical Categories
export const MUSICAL_CATEGORIES = {
    DO: { id: 'DO', icon: 'C', name: 'DO' },
    RE: { id: 'RE', icon: 'D', name: 'RE' },
    MI: { id: 'MI', icon: 'E', name: 'MI' },
    FA: { id: 'FA', icon: 'F', name: 'FA' },
    SOL: { id: 'SOL', icon: 'G', name: 'SOL' },
    LA: { id: 'LA', icon: 'A', name: 'LA' },
    SI: { id: 'SI', icon: 'B', name: 'SI' }
};

// Identity Cards
export const IDENTITY_CARDS = {
    METRONOMO: {
        id: 'METRONOMO',
        name: 'Metronomo Spezzato',
        type: 'PASSIVE',
        description: 'Notes crossing center lane get -0.15 speed',
        cost: 0,
        cooldown: 0,
        effect: 'SLOW',
        value: 0.85
    },
    SCUDO: {
        id: 'SCUDO',
        name: 'Scudo Armonico',
        type: 'ACTIVE',
        description: 'Spend 2 Stamina: Next 3 notes crossing get -50% speed. CD: 3.',
        cost: 2,
        cooldown: 3,
        effect: 'SHIELD',
        value: 0.5,
        charges: 3
    }
};

// Card definitions
export const PLAYER_CARDS = [
    {
        name: 'Virgil', pv: 3, maxPv: 3, na: 4, speed: 3, category: 'DO', requiredCategory: 'SOL',
        passive: { id: 'LOCKED', name: '???', description: 'Passive not unlocked yet.' }
    },
    {
        name: 'Salvataggio', pv: 5, maxPv: 5, na: 1, speed: 2, category: 'SOL', requiredCategory: 'FA',
        passive: { id: 'RESURRECT', name: 'Capacità di Recupero', description: 'Resurrects the first destroyed ally with 1 PV. (Once per battle)' }
    },
    {
        name: 'Origami', pv: 2, maxPv: 2, na: 3, speed: 4, category: 'SI', requiredCategory: 'LA',
        passive: { id: 'SPEED_BOOST', name: 'Potenziamento Offensivo', description: 'Attacks have +30% speed.' }
    },
    {
        name: 'Rovi', pv: 2, maxPv: 2, na: 5, speed: 5, category: 'RE', requiredCategory: 'SI',
        passive: { id: 'THORNS', name: 'Effetto sul Campo', description: 'When hit, slows enemy notes in this lane by 30% for the next turn.' }
    }
];

export const ENEMY_CARDS = [
    {
        name: 'Virgil', pv: 3, maxPv: 3, na: 4, speed: 3, category: 'DO', requiredCategory: 'SOL',
        passive: { id: 'LOCKED', name: '???', description: 'Passive not unlocked yet.' }
    },
    {
        name: 'Salvataggio', pv: 5, maxPv: 5, na: 1, speed: 2, category: 'SOL', requiredCategory: 'FA',
        passive: { id: 'RESURRECT', name: 'Capacità di Recupero', description: 'Resurrects the first destroyed ally with 1 PV. (Once per battle)' }
    },
    {
        name: 'Origami', pv: 2, maxPv: 2, na: 3, speed: 4, category: 'SI', requiredCategory: 'LA',
        passive: { id: 'SPEED_BOOST', name: 'Potenziamento Offensivo', description: 'Attacks have +30% speed.' }
    },
    {
        name: 'Rovi', pv: 2, maxPv: 2, na: 5, speed: 5, category: 'RE', requiredCategory: 'SI',
        passive: { id: 'THORNS', name: 'Effetto sul Campo', description: 'When hit, slows enemy notes in this lane by 30% for the next turn.' }
    }
];


// AI Configuration
export const AI_CONFIG = {
    parrySuccessRate: 0.5,       // 50% base chance to successfully parry (reduced from 60%)
    parryPenaltyPerBounce: 0.1,  // -10% per bounce (makes long rallies favor player)
    preferAliveTargets: true,    // Prefer lanes with alive player cards
    focusFireChance: 0.3,        // 30% chance to focus fire on one lane
    staminaSaveChance: 0.2,      // 20% chance to save stamina (not use all)
    selectionDelayMs: 1000,      // 1 second delay during selection
    distributionDelayMs: 1500,   // 1.5 second delay during distribution
    parryDelayMinMs: 50,         // Min delay before AI parry attempt
    parryDelayMaxMs: 150         // Max delay before AI parry attempt
};

// Rally timing constants
export const RALLY = {
    NOTE_DURATION: 1200,     // ms for note to travel (base)
    BASE_SPEED_MULTIPLIER: 1.3, // Global speed multiplier for all notes
    PARRY_WINDOW: 200,       // ms timing window for parry
    STACKED_NOTE_DELAY: 200, // ms gap between notes on same lane
    IMPACT_DELAY: 300,       // ms pause after note impact
    // Velocity stacking
    SPEED_MULTIPLIER_PER_BOUNCE: 1.1,   // 10% faster each bounce
    WINDOW_MULTIPLIER_PER_BOUNCE: 0.8,  // 20% smaller window each bounce
    MAX_BOUNCES: 5                       // Stalemate after 5 bounces
};

// Stamina settings
export const STAMINA = {
    MAX: 10,
    REGEN_PER_TURN: 3
};

// Visual configuration
export const COLORS = {
    enemyCard: { top: '#8b0000', bottom: '#4a0000' },
    playerCard: { top: '#1e5128', bottom: '#0d2818' },
    cardBorder: '#ffd700',
    selectedBorder: '#ffea00',
    text: '#ffffff',
    heart: '#ff4757',
    phases: {
        SELECTION: '#3498db',
        DISTRIBUTION: '#9b59b6',
        RALLY: '#e74c3c',
        END_TURN: '#2ecc71',
        GAME_OVER: '#f39c12'
    }
};

// Card dimensions
export const CARD = {
    WIDTH: 100,
    HEIGHT: 130,
    SPACING: 20
};
