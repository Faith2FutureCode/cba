import {
  DEFAULT_MONSTER_ICONS,
  MONSTER_ABILITY_IDS,
  MONSTER_SLOT_MACHINE_COLUMNS,
  MONSTER_SLOT_MACHINE_DEFAULT_SPIN_DURATION,
  MONSTER_SLOT_MACHINE_DEFAULT_REVEAL_DURATION
} from './constants.js';

export function createDefaultMonsterState(overrides){
  const monster = {
    id: 'raidMonster',
    active: true,
    x: 2600,
    y: 2600,
    size: 140,
    aggroRadius: 420,
    hp: 5000,
    maxHp: 5000,
    projectileDamage: 120,
    castInterval: 3,
    queueSize: 3,
    freezeDuration: 1.5,
    speedBoostPct: 25,
    healAmount: 200,
    projectileSpeed: 520,
    projectileIcons: { ...DEFAULT_MONSTER_ICONS },
    abilityQueue: [],
    castTimer: 3,
    lastTargetCount: 0,
    slotMachineSpinDuration: MONSTER_SLOT_MACHINE_DEFAULT_SPIN_DURATION,
    slotMachineRevealDuration: MONSTER_SLOT_MACHINE_DEFAULT_REVEAL_DURATION,
    slotMachineActive: false,
    slotMachineSpinTimer: 0,
    slotMachineRevealTimer: 0,
    slotMachineFaceTimer: 0,
    slotMachineImpactReady: false,
    slotMachineFaces: [],
    pendingAbility: null
  };
  if(overrides && typeof overrides === 'object'){
    Object.assign(monster, overrides);
  }
  if(!monster.projectileIcons || typeof monster.projectileIcons !== 'object'){
    monster.projectileIcons = { ...DEFAULT_MONSTER_ICONS };
  }
  return monster;
}

export function normalizeMonsterState(monster, gameState){
  const targetState = gameState && typeof gameState === 'object' ? gameState : {};
  let normalized = monster && typeof monster === 'object' ? monster : createDefaultMonsterState();
  if(normalized !== monster && targetState){
    targetState.monster = normalized;
  }
  normalized.active = normalized.active === false ? false : true;
  const clampCoordValue = (value, limit) => {
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return limit / 2;
    return Math.max(0, Math.min(limit, numeric));
  };
  const mapState = targetState.map && typeof targetState.map === 'object' ? targetState.map : {};
  const mapWidth = Number.isFinite(Number(mapState.width)) ? Number(mapState.width) : 5000;
  const mapHeight = Number.isFinite(Number(mapState.height)) ? Number(mapState.height) : 5000;
  normalized.x = clampCoordValue(normalized.x, mapWidth);
  normalized.y = clampCoordValue(normalized.y, mapHeight);
  normalized.size = Math.max(40, Math.min(400, Number(normalized.size) || 140));
  normalized.aggroRadius = Math.max(0, Number(normalized.aggroRadius) || 0);
  normalized.maxHp = Math.max(1, Number(normalized.maxHp) || 1);
  normalized.hp = Math.max(0, Math.min(normalized.maxHp, Number(normalized.hp) || normalized.maxHp));
  normalized.projectileDamage = Math.max(0, Number(normalized.projectileDamage) || 0);
  normalized.castInterval = Math.max(0.5, Number(normalized.castInterval) || 3);
  normalized.queueSize = Math.max(1, Math.min(6, Number(normalized.queueSize) || 3));
  normalized.freezeDuration = Math.max(0, Number(normalized.freezeDuration) || 0);
  normalized.speedBoostPct = Math.max(0, Number(normalized.speedBoostPct) || 0);
  normalized.healAmount = Math.max(0, Number(normalized.healAmount) || 0);
  normalized.projectileSpeed = Math.max(60, Number(normalized.projectileSpeed) || 520);
  if(!Array.isArray(normalized.abilityQueue)){
    normalized.abilityQueue = [];
  }
  if(!normalized.projectileIcons || typeof normalized.projectileIcons !== 'object'){
    normalized.projectileIcons = { ...DEFAULT_MONSTER_ICONS };
  }
  for(const key of Object.keys(normalized.projectileIcons)){
    const value = normalized.projectileIcons[key];
    if(typeof value !== 'string' || !value.trim()){
      normalized.projectileIcons[key] = DEFAULT_MONSTER_ICONS[key] || '';
    } else {
      normalized.projectileIcons[key] = value.trim();
    }
  }
  const rawSpinDuration = Number(normalized.slotMachineSpinDuration);
  normalized.slotMachineSpinDuration = Math.max(0, Number.isFinite(rawSpinDuration) ? rawSpinDuration : MONSTER_SLOT_MACHINE_DEFAULT_SPIN_DURATION);
  const rawRevealDuration = Number(normalized.slotMachineRevealDuration);
  normalized.slotMachineRevealDuration = Math.max(0, Number.isFinite(rawRevealDuration) ? rawRevealDuration : MONSTER_SLOT_MACHINE_DEFAULT_REVEAL_DURATION);
  normalized.slotMachineActive = normalized.slotMachineActive === true;
  normalized.slotMachineSpinTimer = Math.max(0, Number(normalized.slotMachineSpinTimer) || 0);
  normalized.slotMachineRevealTimer = Math.max(0, Number(normalized.slotMachineRevealTimer) || 0);
  normalized.slotMachineFaceTimer = Math.max(0, Number(normalized.slotMachineFaceTimer) || 0);
  normalized.slotMachineImpactReady = normalized.slotMachineImpactReady === true;
  if(!Array.isArray(normalized.slotMachineFaces)){
    normalized.slotMachineFaces = [];
  }
  for(let i = 0; i < MONSTER_SLOT_MACHINE_COLUMNS; i++){
    const face = normalized.slotMachineFaces[i];
    if(!MONSTER_ABILITY_IDS.includes(face)){
      normalized.slotMachineFaces[i] = randomMonsterAbility();
    }
  }
  normalized.slotMachineFaces.length = MONSTER_SLOT_MACHINE_COLUMNS;
  normalized.pendingAbility = MONSTER_ABILITY_IDS.includes(normalized.pendingAbility) ? normalized.pendingAbility : null;
  normalized.castTimer = Number.isFinite(Number(normalized.castTimer)) ? Math.max(0, Number(normalized.castTimer)) : normalized.castInterval;
  normalized.lastTargetCount = Math.max(0, Number(normalized.lastTargetCount) || 0);
  return normalized;
}

export function randomMonsterAbility(){
  if(!MONSTER_ABILITY_IDS.length){
    return 'green';
  }
  const index = Math.floor(Math.random() * MONSTER_ABILITY_IDS.length);
  return MONSTER_ABILITY_IDS[Math.max(0, Math.min(MONSTER_ABILITY_IDS.length - 1, index))];
}
