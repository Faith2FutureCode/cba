import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'https://unpkg.com/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js';
/* MakaMoba  Sidebar + Portal endpoints + non-overlap + Scoring (overlay) */
(function(){
  // Elements
  const app  = document.getElementById('app');
  const stage = document.getElementById('stage');
  const view = document.getElementById('view');
  const hitboxImg = document.getElementById('hitbox');
  const img   = document.getElementById('map');
  const canvas= document.getElementById('layer');
  const ctx   = canvas.getContext('2d');
  const fogCanvas = document.createElement('canvas');
  const fogCtx = fogCanvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const MINIMAP_BASE_SIZE = 220;
  const MINIMAP_MARGIN = 16;
  const settingsSearchOverlay = document.getElementById('settingsSearch');
  const settingsSearchInput = document.getElementById('settingsSearchInput');
  const settingsSearchResultsEl = document.getElementById('settingsSearchResults');
  const settingsSearchEmptyEl = document.getElementById('settingsSearchEmpty');
  const settingsSearchEmptyPrimary = document.getElementById('settingsSearchEmptyPrimary');
  const settingsSearchEmptySecondary = document.getElementById('settingsSearchEmptySecondary');
  const settingsSearchStatusEl = document.getElementById('settingsSearchStatus');
  const settingsSearchFacetsEl = document.getElementById('settingsSearchFacets');
  const settingsSearchRecentsEl = document.getElementById('settingsSearchRecents');
  const settingsSearchHelpBtn = document.getElementById('settingsSearchHelpBtn');
  const settingsSearchHelpEl = document.getElementById('settingsSearchHelp');
  const settingsSearchHelpClose = document.getElementById('settingsSearchHelpClose');
  const settingsSearchAskBtn = document.getElementById('settingsSearchAskBtn');

  const PLAYER_STATUS_DEFS = [
    { id: 'stunned', label: 'Stunned', timerKey: 'stunTimer', defaultEmoji: '', defaultColor: '#ffd966' },
    { id: 'slowed', label: 'Slowed', timerKey: 'slowTimer', defaultEmoji: '', defaultColor: '#9ad0ff' },
    { id: 'taunted', label: 'Taunted', timerKey: 'tauntTimer', defaultEmoji: '', defaultColor: '#ff8c8c' },
    { id: 'hasted', label: 'Hasted', timerKey: 'hasteTimer', defaultEmoji: '', defaultColor: '#ffd27f' },
    { id: 'recalling', label: 'Recalling', timerKey: 'recallTimer', defaultEmoji: '', defaultColor: '#7fe3ff' },
    { id: 'homeguard', label: 'Homeguard', timerKey: 'homeguardTimer', defaultEmoji: '', defaultColor: '#4ade80' },
    { id: 'invulnerable', label: 'Invulnerable', timerKey: 'baseInvulnTimer', defaultEmoji: '', defaultColor: '#facc15' }
  ];
  function buildDefaultPlayerStatusConfig(){
    const config = {};
    for(const def of PLAYER_STATUS_DEFS){
      config[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor };
    }
    return config;
  }

  const PRAYER_DEFS = [
    { id: 'green', label: 'Green Protection', defaultBinding: { key: '1', code: 'Digit1' } },
    { id: 'blue', label: 'Blue Protection', defaultBinding: { key: '2', code: 'Digit2' } },
    { id: 'red', label: 'Red Protection', defaultBinding: { key: '3', code: 'Digit3' } }
  ];
  const MONSTER_ABILITY_IDS = PRAYER_DEFS.map(def => def.id);
  const DEFAULT_MONSTER_ICONS = { green: '', blue: '', red: '' };
  const MONSTER_SLOT_MACHINE_COLUMNS = 1;
  const MONSTER_SLOT_MACHINE_DEFAULT_SPIN_DURATION = 1.2;
  const MONSTER_SLOT_MACHINE_DEFAULT_REVEAL_DURATION = 0.6;
  const MONSTER_SLOT_MACHINE_SPIN_REFRESH = 0.08;
  const MONSTER_SLOT_MACHINE_IDLE_REFRESH = 0.4;
  const prayerBindingLookup = new Map();

  function buildDefaultPrayerBindings(){
    const bindings = {};
    for(const def of PRAYER_DEFS){
      const key = def.defaultBinding && typeof def.defaultBinding.key === 'string' ? def.defaultBinding.key : '';
      const code = def.defaultBinding && typeof def.defaultBinding.code === 'string' ? def.defaultBinding.code : '';
      bindings[def.id] = {
        key,
        code,
        label: formatAbilityKeyLabel(key, code)
      };
    }
    return bindings;
  }

  function rebuildPrayerBindingLookup(state){
    prayerBindingLookup.clear();
    const bindings = state && state.bindings && typeof state.bindings === 'object' ? state.bindings : {};
    for(const def of PRAYER_DEFS){
      const binding = bindings[def.id];
      if(!binding || typeof binding !== 'object'){
        continue;
      }
      if(typeof binding.code === 'string' && binding.code){
        const codeKey = `code:${binding.code}`;
        if(!prayerBindingLookup.has(codeKey)){
          prayerBindingLookup.set(codeKey, def.id);
        }
      }
      if(typeof binding.key === 'string' && binding.key){
        const keyKey = `key:${binding.key.toLowerCase()}`;
        if(!prayerBindingLookup.has(keyKey)){
          prayerBindingLookup.set(keyKey, def.id);
        }
      }
    }
  }

  function ensurePrayerState(){
    let state = GameState.prayers;
    if(!state || typeof state !== 'object'){
      state = { active: null, bindings: buildDefaultPrayerBindings() };
      GameState.prayers = state;
    }
    if(!state.bindings || typeof state.bindings !== 'object'){
      state.bindings = buildDefaultPrayerBindings();
    }
    const validIds = new Set(PRAYER_DEFS.map(def => def.id));
    for(const def of PRAYER_DEFS){
      const existing = state.bindings[def.id];
      const key = existing && typeof existing.key === 'string' ? existing.key : '';
      const code = existing && typeof existing.code === 'string' ? existing.code : '';
      const label = existing && typeof existing.label === 'string' && existing.label.trim()
        ? existing.label.trim()
        : formatAbilityKeyLabel(key, code);
      state.bindings[def.id] = { key, code, label };
    }
    for(const bindingKey of Object.keys(state.bindings)){
      if(!validIds.has(bindingKey)){
        delete state.bindings[bindingKey];
      }
    }
    if(!validIds.has(state.active)){
      state.active = null;
    }
    return state;
  }

  function createDefaultMonsterState(overrides){
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

  function normalizeMonsterState(monster){
    let normalized = monster && typeof monster === 'object' ? monster : createDefaultMonsterState();
    if(normalized !== monster){
      GameState.monster = normalized;
    }
    normalized.active = normalized.active === false ? false : true;
    const clampCoordValue = (value, limit) => {
      const numeric = Number(value);
      if(!Number.isFinite(numeric)) return limit / 2;
      return Math.max(0, Math.min(limit, numeric));
    };
    const mapWidth = GameState.map && Number.isFinite(Number(GameState.map.width)) ? Number(GameState.map.width) : 5000;
    const mapHeight = GameState.map && Number.isFinite(Number(GameState.map.height)) ? Number(GameState.map.height) : 5000;
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
  function createDefaultPlayerFloatState(){
    return {
      width: 120,
      gap: 18,
      height: 18,
      attack: { width: 120, height: 6, offsetX: 0, offsetY: 0 },
      icons: { width: 24, height: 24, offsetX: 12, offsetY: 0 },
      statuses: buildDefaultPlayerStatusConfig()
    };
  }

  function createDefaultPracticeDummy(overrides){
    const dummy = {
      isPracticeDummy: true,
      active: false,
      x: 2500,
      y: 2500,
      size: 120,
      radius: 900,
      hp: 0,
      maxHp: 1000,
      side: 'red',
      slowPct: 0,
      slowTimer: 0,
      stunTimer: 0,
      knockupTimer: 0,
      silenceTimer: 0,
      disarmTimer: 0,
      polymorphTimer: 0,
      tauntTimer: 0,
      hasteTimer: 0,
      hastePct: 0,
      portalizing: 0,
      beingPulledBy: null,
      cd: 0,
      statuses: buildDefaultPlayerStatusConfig(),
      deathResponse: 'respawn',
      respawnTimer: 0,
      placing: false
    };
    if(overrides && typeof overrides === 'object'){
      Object.assign(dummy, overrides);
    }
    return dummy;
  }

  const practiceDummyDefaults = createDefaultPracticeDummy();

  const GameState = {
    meta: { version: '0.1.0' },
    map: {
      width: 5000,
      height: 5000,
      loaded: false,
      image: { src: '', hitboxSrc: '', displayName: '' },
      hitbox: { loaded: false, width: 0, height: 0, data: null, displayName: '' },
      stagePointer: { inside: false, x: 0, y: 0, width: 0, height: 0, worldX: 0, worldY: 0 },
      colliders: {
        list: [],
        nextId: 1,
        selectedId: null,
        editMode: false,
        placing: false,
        pointerId: null,
        draggingId: null,
        dragOffset: { x: 0, y: 0 },
        dragMoved: false,
        hidden: false,
        defaults: {
          type: 'circle',
          radius: 80,
          innerRadius: 40,
          offset: 110,
          length: 200,
          angleDeg: 0
        }
      }
    },
    practiceDummy: createDefaultPracticeDummy(),
    bases: { blue: null, red: null },
    player: {
      facingRadians: 0,
      vision: {
        radius: 900,
        sources: [],
        nextId: 1,
        selectedId: null,
        editMode: false,
        placing: false,
        pointerId: null,
        draggingId: null,
        dragOffset: { x: 0, y: 0 },
        dragMoved: false,
        hidden: false,
        dummy: createDefaultPracticeDummy(),
        dummyState: { placing: false, dragging: false, pointerId: null, dragOffset: { x: 0, y: 0 }, selected: false },
        defaults: {
          type: 'circle',
          radius: 240,
          innerRadius: 120,
          offset: 240,
          length: 400,
          angleDeg: 0,
          mode: 1
        }
      },
      mp: 400,
      maxMp: 400,
      combatLockTimer: 0,
      homeguardTimer: 0,
      recallTimer: 0,
      baseInvulnTimer: 0,
      baseRegenProgress: 0,
      isInBaseZone: false,
      isInFountain: false,
      recall: { state: 'idle', timer: 0, lastStateChange: 0 },
      shop: { stayTimer: 0, undoStack: [], transactionSeq: 1 },
      inventory: []
    },
    camera: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      baseWidth: 1920,
      baseHeight: 1080,
      scale: 1,
      manualOffsetX: 0,
      manualOffsetY: 0,
      followX: 0,
      followY: 0,
      mode: 'semi',
      viewportReady: false,
      followLagMs: 0,
      leadDistance: 0,
      horizontalOffsetPercent: 0,
      verticalOffsetPercent: 0,
      edgeScrollMargin: 0,
      edgeScrollSpeed: 0,
      recenterDelayMs: 0,
      manualLeash: 0,
      wheelSensitivity: 20,
      zoomInLocked: false,
      zoomInLimit: null,
      zoomOutLocked: false,
      zoomOutLimit: null,
      lockBinding: { key: ' ', code: 'Space', label: 'Space' },
      lockCapture: false,
      lastUnlockedMode: 'semi',
      lastManualMoveAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      drag: { active: false, pointerId: null, last: null },
      lastPlayerVelocity: { x: 0, y: 0 },
      lastTransform: { x: null, y: null, scale: null }
    },
    hud: {
      minimap: {
        autoScale: 1,
        userScale: 1,
        effectiveScale: 1,
        layoutVisible: true,
        clickToMoveEnabled: true,
        clickThroughEnabled: false,
        lastRender: 0,
        pointerActive: false,
        pointerId: null
      },
      playerFloat: createDefaultPlayerFloatState(),
      hudMessage: { timer: null },
      sidebar: { lastMeasuredWidth: null },
      abilityTunables: { spellSpeedScale: 1, spellSizeScale: 1 },
      abilityRuntime: { flameChomperSequence: 1, lastPointerWorld: null, stagePointerOrdering: false, activePointerId: null },
      cursor: { enabled: false, outlineEnabled: true, emoji: '', hoverColor: '#7fe3ff' },
      pings: { types: { onMyWay: '', enemyMissing: '', assistMe: '', target: '' }, active: [] },
      spellCasting: {
        defaultCastType: 'quick',
        normalModifier: { key: '', code: '', label: '' },
        quickModifier: { key: '', code: '', label: '' },
        quickIndicatorModifier: { key: '', code: '', label: '' }
      },
      keybinds: {
        attackMove: { key: 'a', code: 'KeyA', label: 'A' },
        pingWheel: { key: 'g', code: 'KeyG', label: 'G' }
      },
      abilityBar: {
        orientation: 'horizontal',
        count: 20,
        scale: 1,
        healthPlacement: { horizontal: 'bottom', vertical: 'right', textVertical: 'top' },
        statsPlacementVertical: 'top',
        assignments: [],
        activeSlotIndex: null,
        editingAbilityId: null,
        hotkeys: [],
        slotStates: [],
        hotkeyMode: false,
        hotkeyCaptureIndex: null
      },
      timer: { running: false, start: 0, elapsedMs: 0, nextWaveAtMs: 0, lastText: '' },
      waves: { waveCount: 7, waveIntervalMs: 30000, spawnSpacingMs: 250, waveNumber: 0 },
      gold: { player: 0, lastDisplayText: '', perSecond: 15, perKill: 0 },
      score: { blue: 0, red: 0, lastBlueText: '', lastRedText: '', pointsPer: 1, winTarget: 50, gameOver: false },
      portal: { spin: 0, baseMinionHP: 1000, baseMinionDMG: 40, scalePct: 10 }
    },
    prayers: { active: null, bindings: buildDefaultPrayerBindings() },
    monster: createDefaultMonsterState(),
    spawns: { blue: [], red: [], pending: [], placing: null },
    lanes: {
      count: 1,
      configs: [],
      layout: null,
      layoutDirty: true,
      version: 1,
      minion: { diameter: 15, radius: 7.5, fanSpacing: 20.25 }
    },
    minions: [],
    items: { abilityDefinitions: {} },
    effects: {
      activeBeams: [],
      beamCasts: [],
      laserConeCasts: [],
      grabCasts: [],
      piercingArrowCasts: [],
      plasmaFissionCasts: [],
      chargingGaleCasts: [],
      cullingBarrageChannels: [],
      cullingBarrageProjectiles: [],
      arcaneRiteModes: [],
      arcaneRiteExplosions: [],
      piercingArrowProjectiles: [],
      plasmaFissionProjectiles: [],
      flameChomperTraps: [],
      pulses: [],
      laserProjectiles: [],
      blinkingBoltProjectiles: [],
      chargingGaleProjectiles: [],
      hitsplats: []
    }
  };

  const mapState = GameState.map;
  const stagePointerState = mapState.stagePointer;
  const minimapState = GameState.hud.minimap;
  const minions = GameState.minions;
  const pendingSpawns = GameState.spawns.pending;
  const laneConfigs = GameState.lanes.configs;
  const cameraState = GameState.camera;
  const hudState = GameState.hud;
  hudState.playerFloat = normalizePlayerFloatState(hudState.playerFloat);
  hudState.cursor = normalizeCursorState(hudState.cursor);
  hudState.pings = normalizePingState(hudState.pings);
  hudState.keybinds = normalizeKeybindState(hudState.keybinds);
  hudState.spellCasting = hudState.spellCasting || {
    defaultCastType: 'quick',
    normalModifier: { key: '', code: '', label: '' },
    quickModifier: { key: '', code: '', label: '' },
    quickIndicatorModifier: { key: '', code: '', label: '' }
  };
  const spellCastingConfig = hudState.spellCasting;
  const abilityRuntime = hudState.abilityRuntime;
  const abilityTunables = hudState.abilityTunables;
  const cursorState = hudState.cursor;
  const pingState = hudState.pings;
  const keybindState = hudState.keybinds;
  const activePings = Array.isArray(pingState.active) ? pingState.active : (pingState.active = []);
  const PING_VISUALS = {
    onMyWay: '#7fe3ff',
    enemyMissing: '#ffd166',
    assistMe: '#ff7bb0',
    target: '#ff5577'
  };
  const abilityBarState = hudState.abilityBar;
  const timerState = hudState.timer;
  const waveState = hudState.waves;
  const goldState = hudState.gold;
  const scoreState = hudState.score;
  const portalState = hudState.portal;
  const playerFloatState = hudState.playerFloat;
  const prayerState = ensurePrayerState();
  rebuildPrayerBindingLookup(prayerState);
  const monsterState = normalizeMonsterState(GameState.monster);
  GameState.monster = monsterState;
  const monsterDragState = (GameState.monsterDrag && typeof GameState.monsterDrag === 'object')
    ? GameState.monsterDrag
    : (GameState.monsterDrag = {});
  const playerInventoryState = Array.isArray(GameState.player.inventory)
    ? GameState.player.inventory
    : (GameState.player.inventory = []);
  const playerShopState = (GameState.player.shop && typeof GameState.player.shop === 'object')
    ? GameState.player.shop
    : (GameState.player.shop = { stayTimer: 0, undoStack: [], transactionSeq: 1 });
  if(!Array.isArray(playerShopState.undoStack)){ playerShopState.undoStack = []; }
  playerShopState.stayTimer = Number.isFinite(playerShopState.stayTimer) ? Math.max(0, playerShopState.stayTimer) : 0;
  playerShopState.transactionSeq = Number.isFinite(playerShopState.transactionSeq)
    ? Math.max(1, Math.floor(playerShopState.transactionSeq))
    : 1;

  if(!GameState.bases || typeof GameState.bases !== 'object'){
    GameState.bases = { blue: null, red: null };
  }
  const baseState = GameState.bases;
  const clampBaseValue = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  function createDefaultBaseState(side){
    const width = clampBaseValue(mapState.width, 5000);
    const height = clampBaseValue(mapState.height, 5000);
    const margin = Math.max(420, Math.min(width, height) * 0.12);
    const baseRadius = Math.max(520, Math.min(width, height) * 0.18);
    const fountainRadius = Math.max(220, Math.min(width, height) * 0.085);
    const cx = side === 'red' ? width - margin : margin;
    const cy = side === 'red' ? margin : height - margin;
    return {
      side,
      baseZone: { x: cx, y: cy, radius: baseRadius },
      fountain: { x: cx, y: cy, radius: fountainRadius },
      regenPerSecond: { hp: 180, mp: 120 },
      regenInterval: 0.25,
      invulnerabilityDuration: 1.5,
      homeguardDuration: 4,
      lethalRadius: fountainRadius + 180,
      lethalDamagePerSecond: 6000
    };
  }
  if(!baseState.blue){ baseState.blue = createDefaultBaseState('blue'); }
  if(!baseState.red){ baseState.red = createDefaultBaseState('red'); }
  const cursorRuntime = { hoverTarget: null };
  monsterDragState.active = false;
  monsterDragState.dragging = false;
  monsterDragState.pointerId = null;
  monsterDragState.offsetX = 0;
  monsterDragState.offsetY = 0;
  monsterDragState.moved = false;
  monsterDragState.messageActive = false;
  const hudMessageState = hudState.hudMessage;
  const sidebarState = hudState.sidebar;
  const customColliders = mapState.colliders.list;
  const colliderDefaults = mapState.colliders.defaults;
  const customVisionSources = GameState.player.vision.sources;
  GameState.player.vision.dummy = GameState.practiceDummy;
  const visionDefaults = GameState.player.vision.defaults;
  const visionDummy = GameState.player.vision.dummy;
  const practiceDummy = GameState.practiceDummy;
  const practiceDummyState = GameState.player.vision.dummyState;
  let minionDiameter = GameState.lanes.minion.diameter;
  let minionRadius = GameState.lanes.minion.radius;
  let laneFanSpacing = GameState.lanes.minion.fanSpacing;
  let practiceDummyMoveButton;
  let practiceDummyResetButton;
  let practiceDummyRemoveButton;
  let practiceDummySizeInput;
  let practiceDummySizeDisplay;
  let practiceDummyDeathResponseSelect;
  Object.defineProperty(GameState.meta, 'lastUpdate', {
    value: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    writable: true,
    enumerable: false
  });
  function refreshPracticeDummyAnchors(){
    if(!practiceDummy){
      return;
    }
    const baseX = Number(practiceDummy.x) || 0;
    const baseY = Number(practiceDummy.y) || 0;
    practiceDummy.spawn = { x: baseX, y: baseY };
    practiceDummy.to = { x: baseX, y: baseY };
    practiceDummy.neutralPoint = { x: baseX, y: baseY };
    practiceDummy.neutralProj = 0;
    practiceDummy.laneDir = { x: 1, y: 0 };
    practiceDummy.laneFacing = 0;
    practiceDummy.laneNormal = { x: 0, y: -1 };
    practiceDummy.laneLength = 0;
    practiceDummy.offsideLimit = 0;
    practiceDummy.pathDistance = 0;
    practiceDummy.laneProjection = null;
    practiceDummy.laneProgress = 0;
    practiceDummy.offLaneDistance = 0;
    practiceDummy.facing = 0;
    practiceDummy.nav = null;
    practiceDummy.navGoal = null;
  }

  function attachPracticeDummy(){
    if(!practiceDummy || !Array.isArray(minions)){
      return;
    }
    refreshPracticeDummyAnchors();
    if(!minions.includes(practiceDummy)){
      minions.push(practiceDummy);
    }
  }

  attachPracticeDummy();
  normalizePracticeDummyState();
  updatePracticeDummyUiState();

  const PRACTICE_DUMMY_RESPAWN_SECONDS = 2.5;

  function resetPracticeDummyStatuses(target = practiceDummy){
    if(!target){
      return;
    }
    target.slowTimer = 0;
    target.slowPct = 0;
    target.stunTimer = 0;
    target.knockupTimer = 0;
    target.silenceTimer = 0;
    target.disarmTimer = 0;
    target.polymorphTimer = 0;
    target.tauntTimer = 0;
    target.hasteTimer = 0;
    target.hastePct = 0;
    target.portalizing = 0;
    target.beingPulledBy = null;
  }

  function removePracticeDummy(){
    if(!practiceDummy){
      return;
    }
    practiceDummy.hp = 0;
    practiceDummy.active = false;
    practiceDummy.respawnTimer = 0;
    practiceDummyState.placing = false;
    practiceDummyState.selected = false;
    stopVisionDummyDrag();
    resetPracticeDummyStatuses();
    updatePracticeDummyStatusIcons();
    updatePracticeDummyHud();
    updatePracticeDummyUiState();
    renderMinimap(true);
  }

  function beginPracticeDummyRespawn(){
    if(!practiceDummy){
      return;
    }
    if(practiceDummy.deathResponse === 'despawn'){
      removePracticeDummy();
      return;
    }
    practiceDummy.hp = 0;
    practiceDummy.active = false;
    practiceDummy.respawnTimer = PRACTICE_DUMMY_RESPAWN_SECONDS;
    resetPracticeDummyStatuses();
    practiceDummyState.placing = false;
    practiceDummyState.selected = false;
    stopVisionDummyDrag();
    updatePracticeDummyStatusIcons();
    updatePracticeDummyHud();
    updatePracticeDummyUiState();
    renderMinimap(true);
  }

  function respawnPracticeDummy(options = {}){
    if(!practiceDummy){
      return;
    }
    const { resetPosition = false, resetSize = false, resetStats = false } = options || {};
    if(resetPosition){
      practiceDummy.x = practiceDummyDefaults.x;
      practiceDummy.y = practiceDummyDefaults.y;
    }
    if(resetSize){
      practiceDummy.size = practiceDummyDefaults.size;
    } else {
      practiceDummy.size = clampPracticeDummySize(practiceDummy.size, practiceDummyDefaults.size);
    }
    if(resetStats){
      practiceDummy.maxHp = practiceDummyDefaults.maxHp;
      practiceDummy.radius = practiceDummyDefaults.radius;
    }
    practiceDummy.radius = Number.isFinite(practiceDummy.radius) ? Math.max(0, practiceDummy.radius) : practiceDummyDefaults.radius;
    practiceDummy.maxHp = Math.max(1, Number(practiceDummy.maxHp) || practiceDummyDefaults.maxHp);
    practiceDummy.hp = practiceDummy.maxHp;
    practiceDummy.side = practiceDummy.side === 'blue' ? 'blue' : practiceDummyDefaults.side;
    practiceDummy.active = true;
    practiceDummy.respawnTimer = 0;
    resetPracticeDummyStatuses();
    if(!practiceDummy.statuses || typeof practiceDummy.statuses !== 'object'){
      practiceDummy.statuses = buildDefaultPlayerStatusConfig();
    }
    practiceDummyState.placing = false;
    practiceDummyState.selected = false;
    refreshPracticeDummyAnchors();
    updatePracticeDummyUiState();
    updatePracticeDummyHud();
    updatePracticeDummyStatusIcons();
    positionPracticeDummyHud();
    renderMinimap(true);
  }

  function handlePracticeDummyDamage(target, prevHp){
    if(!target || !target.isPracticeDummy){
      return;
    }
    const before = Number(prevHp);
    const after = Math.max(0, Number(target.hp) || 0);
    if(after <= 0){
      if(!(practiceDummy.respawnTimer > 0)){
        beginPracticeDummyRespawn();
      }
      return;
    }
    if(!Number.isFinite(before) || before !== after){
      updatePracticeDummyHud();
    }
  }

  function tickPracticeDummy(dt){
    if(!practiceDummy){
      return;
    }
    if(practiceDummy.respawnTimer > 0){
      practiceDummy.respawnTimer = Math.max(0, practiceDummy.respawnTimer - dt);
      if(practiceDummy.respawnTimer <= 0){
        respawnPracticeDummy();
      }
    }
  }

  function practiceDummyDragThreshold(){
    const size = clampPracticeDummySize(practiceDummy && practiceDummy.size, 120);
    return Math.max(28, size * 0.6);
  }

  function isPointerInsidePracticeDummy(x, y){
    if(!practiceDummy || practiceDummy.active === false){
      return false;
    }
    const px = Number(practiceDummy.x) || 0;
    const py = Number(practiceDummy.y) || 0;
    const threshold = practiceDummyDragThreshold();
    const dx = x - px;
    const dy = y - py;
    return dx * dx + dy * dy <= threshold * threshold;
  }

  function placePracticeDummyAt(x, y){
    if(!practiceDummy){
      return;
    }
    const clampedX = Math.max(0, Math.min(mapState.width, Number(x) || 0));
    const clampedY = Math.max(0, Math.min(mapState.height, Number(y) || 0));
    const needsRevive = practiceDummy.active === false || (practiceDummy.respawnTimer > 0)
      || !(Number(practiceDummy.hp) > 0);
    practiceDummy.x = clampedX;
    practiceDummy.y = clampedY;
    practiceDummy.active = true;
    practiceDummy.respawnTimer = 0;
    if(needsRevive){
      practiceDummy.maxHp = Math.max(1, Number(practiceDummy.maxHp) || practiceDummyDefaults.maxHp);
      practiceDummy.hp = practiceDummy.maxHp;
      if(!practiceDummy.statuses || typeof practiceDummy.statuses !== 'object'){
        practiceDummy.statuses = buildDefaultPlayerStatusConfig();
      }
      resetPracticeDummyStatuses();
    }
    practiceDummyState.selected = false;
    refreshPracticeDummyAnchors();
    updatePracticeDummyHud();
    updatePracticeDummyStatusIcons();
    positionPracticeDummyHud();
    renderMinimap(true);
  }
  const playerRuntime = {
    animationController: null,
    lastAnimationState: 'idle',
    model: null,
    mixamoState: { baseFile: null },
    mixamoBusy: false
  };
  Object.defineProperty(GameState.player, 'runtime', {
    value: playerRuntime,
    writable: true,
    enumerable: false
  });

  const SETTINGS_RANGE_MIN = 0;
  const SETTINGS_RANGE_MAX = 10000;
  function clampSettingValue(value, fallback = SETTINGS_RANGE_MIN){
    let numeric = Number(value);
    if(!Number.isFinite(numeric)) numeric = fallback;
    return Math.max(SETTINGS_RANGE_MIN, Math.min(SETTINGS_RANGE_MAX, numeric));
  }

  function deepClone(value){
    if(typeof structuredClone === 'function'){
      try {
        return structuredClone(value);
      } catch {
        // fall through to JSON
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePlayerFloatState(state){
    const defaults = createDefaultPlayerFloatState();
    if(!state || typeof state !== 'object'){
      return defaults;
    }
    const normalized = state;
    const toNumber = (value, fallback)=>{
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };
    normalized.width = toNumber(normalized.width, defaults.width);
    normalized.gap = toNumber(normalized.gap, defaults.gap);
    normalized.height = toNumber(normalized.height, defaults.height);
    const attack = normalized.attack && typeof normalized.attack === 'object' ? normalized.attack : {};
    normalized.attack = attack;
    attack.width = toNumber(attack.width, defaults.attack.width);
    attack.height = toNumber(attack.height, defaults.attack.height);
    attack.offsetX = toNumber(attack.offsetX, defaults.attack.offsetX);
    attack.offsetY = toNumber(attack.offsetY, defaults.attack.offsetY);
    const icons = normalized.icons && typeof normalized.icons === 'object' ? normalized.icons : {};
    normalized.icons = icons;
    icons.width = toNumber(icons.width, defaults.icons.width);
    icons.height = toNumber(icons.height, defaults.icons.height);
    icons.offsetX = toNumber(icons.offsetX, defaults.icons.offsetX);
    icons.offsetY = toNumber(icons.offsetY, defaults.icons.offsetY);
    if(!normalized.statuses || typeof normalized.statuses !== 'object'){
      normalized.statuses = buildDefaultPlayerStatusConfig();
    }
    for(const def of PLAYER_STATUS_DEFS){
      const entry = normalized.statuses[def.id];
      if(!entry || typeof entry !== 'object'){
        normalized.statuses[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor };
        continue;
      }
      if(typeof entry.emoji !== 'string' || !entry.emoji.trim()){
        entry.emoji = def.defaultEmoji;
      }
      if(typeof entry.color !== 'string' || !entry.color.trim()){
        entry.color = def.defaultColor;
      } else {
        entry.color = sanitizeHexColor(entry.color, def.defaultColor);
      }
    }
    return normalized;
  }

  function normalizePlayerControlState(target){
    if(!target || typeof target !== 'object'){
      return;
    }
    const timers = ['slowTimer', 'stunTimer', 'knockupTimer', 'silenceTimer', 'disarmTimer', 'polymorphTimer', 'tauntTimer'];
    for(const key of timers){
      const numeric = Number(target[key]);
      target[key] = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    }
    const slowPct = Number(target.slowPct);
    target.slowPct = Number.isFinite(slowPct) ? Math.max(0, slowPct) : 0;
    const hasteTimer = Number(target.hasteTimer);
    target.hasteTimer = Number.isFinite(hasteTimer) ? Math.max(0, hasteTimer) : 0;
    const hastePct = Number(target.hastePct);
    target.hastePct = Number.isFinite(hastePct) ? Math.max(0, hastePct) : 0;
  }

  function clampPracticeDummySize(value, fallback){
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return Math.max(20, Math.min(400, numeric));
    }
    return Number.isFinite(fallback) ? fallback : 120;
  }

  function normalizePracticeDummyState(){
    if(!practiceDummy || typeof practiceDummy !== 'object'){
      return;
    }
    practiceDummy.size = clampPracticeDummySize(practiceDummy.size, 120);
    practiceDummy.maxHp = Math.max(1, Number(practiceDummy.maxHp) || 1);
    const hpValue = Number(practiceDummy.hp);
    practiceDummy.hp = Number.isFinite(hpValue) ? Math.max(0, Math.min(practiceDummy.maxHp, hpValue)) : practiceDummy.maxHp;
    practiceDummy.side = practiceDummy.side === 'blue' ? 'blue' : 'red';
    practiceDummy.radius = Number.isFinite(practiceDummy.radius) ? Math.max(0, practiceDummy.radius) : 900;
    practiceDummy.active = practiceDummy.active === false ? false : true;
    practiceDummy.respawnTimer = Math.max(0, Number(practiceDummy.respawnTimer) || 0);
    const response = practiceDummy.deathResponse === 'despawn' ? 'despawn' : 'respawn';
    practiceDummy.deathResponse = response;
    normalizePlayerControlState(practiceDummy);
    if(!practiceDummy.statuses || typeof practiceDummy.statuses !== 'object'){
      practiceDummy.statuses = buildDefaultPlayerStatusConfig();
    }
  }

  function sanitizeEmojiInput(value, fallback = ''){
    if(typeof value !== 'string'){
      return fallback;
    }
    const trimmed = value.trim();
    if(!trimmed){
      return fallback;
    }
    const glyphs = Array.from(trimmed);
    if(!glyphs.length){
      return fallback;
    }
    return glyphs.slice(0, 2).join('');
  }

  function normalizeCursorState(state){
    const defaults = { enabled: false, outlineEnabled: true, emoji: '', hoverColor: '#7fe3ff' };
    const normalized = {
      enabled: defaults.enabled,
      outlineEnabled: defaults.outlineEnabled,
      emoji: defaults.emoji,
      hoverColor: defaults.hoverColor
    };
    if(state && typeof state === 'object'){
      normalized.enabled = typeof state.enabled === 'boolean' ? state.enabled : defaults.enabled;
      normalized.outlineEnabled = typeof state.outlineEnabled === 'boolean' ? state.outlineEnabled : defaults.outlineEnabled;
      normalized.emoji = sanitizeEmojiInput(state.emoji, defaults.emoji);
      normalized.hoverColor = sanitizeHexColor(state.hoverColor, defaults.hoverColor);
    }
    return normalized;
  }

  function normalizePingState(state){
    const defaults = { onMyWay: '', enemyMissing: '', assistMe: '', target: '' };
    const types = {
      onMyWay: defaults.onMyWay,
      enemyMissing: defaults.enemyMissing,
      assistMe: defaults.assistMe,
      target: defaults.target
    };
    if(state && typeof state === 'object' && state.types && typeof state.types === 'object'){
      types.onMyWay = sanitizeEmojiInput(state.types.onMyWay, defaults.onMyWay);
      types.enemyMissing = sanitizeEmojiInput(state.types.enemyMissing, defaults.enemyMissing);
      types.assistMe = sanitizeEmojiInput(state.types.assistMe, defaults.assistMe);
      types.target = sanitizeEmojiInput(state.types.target, defaults.target);
    }
    const active = state && Array.isArray(state.active) ? state.active : [];
    return { types, active };
  }

  function normalizeKeybindState(state){
    const attackDefaults = { key: 'a', code: 'KeyA' };
    const pingDefaults = { key: 'g', code: 'KeyG' };
    const attackRaw = state && typeof state === 'object' ? state.attackMove : null;
    const pingRaw = state && typeof state === 'object' ? state.pingWheel : null;
    const attackKey = attackRaw && typeof attackRaw.key === 'string' ? attackRaw.key : attackDefaults.key;
    const attackCode = attackRaw && typeof attackRaw.code === 'string' ? attackRaw.code : attackDefaults.code;
    const pingKey = pingRaw && typeof pingRaw.key === 'string' ? pingRaw.key : pingDefaults.key;
    const pingCode = pingRaw && typeof pingRaw.code === 'string' ? pingRaw.code : pingDefaults.code;
    return {
      attackMove: {
        key: attackKey,
        code: attackCode,
        label: formatAbilityKeyLabel(attackKey, attackCode)
      },
      pingWheel: {
        key: pingKey,
        code: pingCode,
        label: formatAbilityKeyLabel(pingKey, pingCode)
      }
    };
  }

  function replaceRefs(original, clone, context){
    if(!original || !clone || typeof original !== 'object' || typeof clone !== 'object'){
      return;
    }
    if(Array.isArray(clone)){
      const originalArray = Array.isArray(original) ? original : [];
      clone.forEach((item, index)=>{
        replaceRefs(originalArray[index], item, context);
      });
      return;
    }
    for(const key of Object.keys(clone)){
      const originalValue = original[key];
      const clonedValue = clone[key];
      if(!originalValue || typeof originalValue !== 'object'){
        continue;
      }
      if(context.minionIndexMap.has(originalValue)){
        clone[key] = null;
        clone[`${key}Id`] = context.minionIndexMap.get(originalValue);
        continue;
      }
      if(originalValue === context.player){
        clone[key] = null;
        clone[`${key}RefType`] = 'player';
        continue;
      }
      replaceRefs(originalValue, clonedValue, context);
    }
  }

  function restoreRefs(target, context){
    if(!target || typeof target !== 'object'){
      return;
    }
    if(Array.isArray(target)){
      target.forEach(item => restoreRefs(item, context));
      return;
    }
    for(const key of Object.keys(target)){
      if(key.endsWith('Id')){
        const base = key.slice(0, -2);
        const id = target[key];
        if(Number.isInteger(id) && id >= 0 && id < context.minions.length){
          target[base] = context.minions[id];
        } else {
          target[base] = null;
        }
        delete target[key];
        continue;
      }
      if(key.endsWith('RefType')){
        const base = key.slice(0, -7);
        target[base] = target[key] === 'player' ? context.player : null;
        delete target[key];
        continue;
      }
      restoreRefs(target[key], context);
    }
  }

  function assignArray(target, source){
    if(!Array.isArray(target)){
      return;
    }
    target.length = 0;
    if(!Array.isArray(source)){
      return;
    }
    source.forEach(item => {
      target.push(deepClone(item));
    });
  }

  function assignDeep(target, source){
    if(!target || typeof target !== 'object' || !source || typeof source !== 'object'){
      return;
    }
    for(const [key, value] of Object.entries(source)){
      if(Array.isArray(value)){
        if(!Array.isArray(target[key])){
          target[key] = [];
        }
        assignArray(target[key], value);
        continue;
      }
      if(value && typeof value === 'object'){
        if(!target[key] || typeof target[key] !== 'object'){
          target[key] = {};
        }
        assignDeep(target[key], value);
        continue;
      }
      target[key] = value;
    }
  }

  function buildExportSnapshot(){
    const minionIndexMap = new Map();
    GameState.minions.forEach((minion, index) => {
      minionIndexMap.set(minion, index);
    });
    const context = { minionIndexMap, player };

    const metaClone = deepClone(GameState.meta);
    if(metaClone && Object.prototype.hasOwnProperty.call(metaClone, 'lastUpdate')){
      delete metaClone.lastUpdate;
    }

    const mapClone = deepClone(GameState.map);
    const cameraClone = deepClone(cameraState);
    if(cameraClone && cameraClone.drag){
      cameraClone.drag.last = null;
    }
    const hudClone = deepClone(hudState);
    if(hudClone && hudClone.hudMessage){
      hudClone.hudMessage.timer = null;
    }

    const spawnsClone = deepClone(GameState.spawns);
    const lanesClone = deepClone(GameState.lanes);
    const itemsClone = deepClone(GameState.items);
    const effectsClone = deepClone(GameState.effects);

    replaceRefs(GameState.spawns, spawnsClone, context);
    replaceRefs(GameState.lanes, lanesClone, context);
    replaceRefs(GameState.items, itemsClone, context);
    replaceRefs(GameState.effects, effectsClone, context);

    const minionSnapshots = GameState.minions.map((minion, index) => {
      const clone = deepClone(minion);
      clone.__id = index;
      replaceRefs(minion, clone, context);
      return clone;
    });

    const playerClone = deepClone(player);
    replaceRefs(player, playerClone, context);

    const prayersSnapshot = (()=>{
      const snapshot = { active: null, bindings: buildDefaultPrayerBindings() };
      if(prayerState && typeof prayerState === 'object'){
        const activeId = typeof prayerState.active === 'string' ? prayerState.active : null;
        snapshot.active = PRAYER_DEFS.some(def => def.id === activeId) ? activeId : null;
        if(prayerState.bindings && typeof prayerState.bindings === 'object'){
          snapshot.bindings = deepClone(prayerState.bindings);
        }
      }
      return snapshot;
    })();

    const monsterSnapshot = (()=>{
      const source = monsterState && typeof monsterState === 'object' ? monsterState : createDefaultMonsterState();
      const snapshot = deepClone(source);
      if(!Array.isArray(snapshot.abilityQueue)){
        snapshot.abilityQueue = [];
      }
      if(!snapshot.projectileIcons || typeof snapshot.projectileIcons !== 'object'){
        snapshot.projectileIcons = { ...DEFAULT_MONSTER_ICONS };
      }
      return snapshot;
    })();

    const practiceDummySnapshot = practiceDummy ? (()=>{
      const maxHpValue = Math.max(1, Number(practiceDummy.maxHp) || practiceDummyDefaults.maxHp);
      const hpValue = Math.max(0, Math.min(maxHpValue, Number(practiceDummy.hp) || 0));
      const snapshot = {
        active: practiceDummy.active !== false && !(practiceDummy.respawnTimer > 0),
        x: Number(practiceDummy.x) || 0,
        y: Number(practiceDummy.y) || 0,
        size: clampPracticeDummySize(practiceDummy.size, practiceDummyDefaults.size),
        maxHp: maxHpValue,
        hp: hpValue,
        side: practiceDummy.side === 'blue' ? 'blue' : 'red',
        deathResponse: practiceDummy.deathResponse === 'despawn' ? 'despawn' : 'respawn'
      };
      if(practiceDummy.statuses && typeof practiceDummy.statuses === 'object'){
        snapshot.statuses = deepClone(practiceDummy.statuses);
      }
      return snapshot;
    })() : null;

    return {
      meta: metaClone,
      map: mapClone,
      player: playerClone,
      camera: cameraClone,
      hud: hudClone,
      prayers: prayersSnapshot,
      monster: monsterSnapshot,
      practiceDummy: practiceDummySnapshot,
      spawns: spawnsClone,
      lanes: lanesClone,
      minions: minionSnapshots,
      items: itemsClone,
      effects: effectsClone
    };
  }

  function exportGameState(){
    try {
      const snapshot = buildExportSnapshot();
      return JSON.stringify(snapshot, null, 2);
    } catch (err){
      console.error('exportGameState failed', err);
      return '';
    }
  }

  function importGameState(json){
    const errors = [];
    let snapshot = null;
    if(typeof json === 'string'){
      if(json.trim().length === 0){
        errors.push('Snapshot JSON is empty.');
      } else {
        try {
          snapshot = JSON.parse(json);
        } catch (err){
          errors.push(`Invalid JSON: ${err && err.message ? err.message : err}`);
        }
      }
    } else if(json && typeof json === 'object'){
      snapshot = deepClone(json);
    } else {
      errors.push('Snapshot must be provided as a JSON string or plain object.');
    }

    if(!snapshot || typeof snapshot !== 'object'){
      errors.push('Snapshot root must be an object.');
    }

    if(errors.length){
      return { ok: false, errors };
    }

    const requiredSections = ['meta', 'map', 'player', 'camera', 'hud', 'spawns', 'lanes', 'minions', 'items', 'effects'];
    for(const key of requiredSections){
      if(!Object.prototype.hasOwnProperty.call(snapshot, key)){
        errors.push(`Snapshot missing required section "${key}".`);
      }
    }

    const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const isFiniteNumber = (value) => Number.isFinite(Number(value));

    if(!isObject(snapshot.map)) errors.push('Snapshot map section must be an object.');
    if(!isObject(snapshot.player)) errors.push('Snapshot player section must be an object.');
    if(!isObject(snapshot.camera)) errors.push('Snapshot camera section must be an object.');
    if(!isObject(snapshot.hud)) errors.push('Snapshot hud section must be an object.');
    if(!isObject(snapshot.spawns)) errors.push('Snapshot spawns section must be an object.');
    if(!isObject(snapshot.lanes)) errors.push('Snapshot lanes section must be an object.');
    if(!isObject(snapshot.items)) errors.push('Snapshot items section must be an object.');
    if(!isObject(snapshot.effects)) errors.push('Snapshot effects section must be an object.');
    if(!Array.isArray(snapshot.minions)) errors.push('Snapshot minions section must be an array.');

    if(isObject(snapshot.map)){
      if(!isFiniteNumber(snapshot.map.width)) errors.push('map.width must be a finite number.');
      if(!isFiniteNumber(snapshot.map.height)) errors.push('map.height must be a finite number.');
    }
    if(isObject(snapshot.camera)){
      if(!isFiniteNumber(snapshot.camera.width)) errors.push('camera.width must be a finite number.');
      if(!isFiniteNumber(snapshot.camera.height)) errors.push('camera.height must be a finite number.');
    }

    if(errors.length){
      return { ok: false, errors };
    }

    try {
      assignDeep(GameState.meta, snapshot.meta || {});
      if(typeof GameState.meta.version !== 'string'){
        GameState.meta.version = '0.1.0';
      }

      assignDeep(mapState, snapshot.map || {});
      const hitboxState = mapState.hitbox;
      if(hitboxState && hitboxState.data && !(hitboxState.data instanceof Uint8Array)){
        if(Array.isArray(hitboxState.data)){
          hitboxState.data = Uint8Array.from(hitboxState.data);
        } else if(typeof hitboxState.data === 'object' && hitboxState.data !== null && Number.isFinite(hitboxState.data.length)){
          try {
            hitboxState.data = Uint8Array.from(hitboxState.data);
          } catch (err){
            console.warn('Unable to normalize hitbox data during import.', err);
          }
        }
      }

      assignDeep(cameraState, snapshot.camera || {});
      assignDeep(hudState, snapshot.hud || {});
      if(snapshot.prayers && typeof snapshot.prayers === 'object'){
        const snapshotPrayers = snapshot.prayers;
        if(snapshotPrayers.bindings && typeof snapshotPrayers.bindings === 'object'){
          prayerState.bindings = deepClone(snapshotPrayers.bindings);
        } else {
          prayerState.bindings = buildDefaultPrayerBindings();
        }
        rebuildPrayerBindingLookup(prayerState);
        const candidateActive = typeof snapshotPrayers.active === 'string' ? snapshotPrayers.active : null;
        prayerState.active = PRAYER_DEFS.some(def => def.id === candidateActive) ? candidateActive : null;
      } else {
        prayerState.bindings = buildDefaultPrayerBindings();
        prayerState.active = null;
        rebuildPrayerBindingLookup(prayerState);
      }
      ensurePrayerState();
      rebuildPrayerBindingLookup(prayerState);

      if(snapshot.monster && typeof snapshot.monster === 'object'){
        Object.assign(monsterState, createDefaultMonsterState());
        Object.assign(monsterState, deepClone(snapshot.monster));
      } else {
        Object.assign(monsterState, createDefaultMonsterState());
      }
      normalizeMonsterState(monsterState);
      ensureMonsterQueue(monsterState);
      if(practiceDummy){
        const snapshotPracticeDummy = snapshot.practiceDummy;
        const clampDummyCoord = (value, max) => {
          const numeric = Number(value);
          if(!Number.isFinite(numeric)){
            return null;
          }
          if(!(max > 0)){
            return Math.max(0, numeric);
          }
          return Math.max(0, Math.min(max, numeric));
        };
        if(snapshotPracticeDummy && typeof snapshotPracticeDummy === 'object'){
          const nextX = clampDummyCoord(snapshotPracticeDummy.x, mapState.width);
          if(nextX !== null){
            practiceDummy.x = nextX;
          }
          const nextY = clampDummyCoord(snapshotPracticeDummy.y, mapState.height);
          if(nextY !== null){
            practiceDummy.y = nextY;
          }
          if(Number.isFinite(Number(snapshotPracticeDummy.size))){
            practiceDummy.size = clampPracticeDummySize(snapshotPracticeDummy.size, practiceDummyDefaults.size);
          }
          if(Number.isFinite(Number(snapshotPracticeDummy.maxHp))){
            practiceDummy.maxHp = Math.max(1, Number(snapshotPracticeDummy.maxHp));
          }
          if(Number.isFinite(Number(snapshotPracticeDummy.hp))){
            practiceDummy.hp = Math.max(0, Math.min(practiceDummy.maxHp, Number(snapshotPracticeDummy.hp)));
          }
          if(typeof snapshotPracticeDummy.deathResponse === 'string'){
            practiceDummy.deathResponse = snapshotPracticeDummy.deathResponse === 'despawn' ? 'despawn' : 'respawn';
          }
          practiceDummy.active = snapshotPracticeDummy.active === false ? false : true;
          practiceDummy.respawnTimer = 0;
          if(practiceDummy.active === false){
            practiceDummy.hp = 0;
          }
          if(snapshotPracticeDummy.statuses && typeof snapshotPracticeDummy.statuses === 'object'){
            practiceDummy.statuses = deepClone(snapshotPracticeDummy.statuses);
          }
        } else {
          Object.assign(practiceDummy, createDefaultPracticeDummy());
        }
        normalizePracticeDummyState();
        practiceDummyState.placing = false;
        practiceDummyState.selected = false;
        practiceDummyState.dragging = false;
        practiceDummyState.pointerId = null;
        if(practiceDummyState.dragOffset){
          practiceDummyState.dragOffset.x = 0;
          practiceDummyState.dragOffset.y = 0;
        } else {
          practiceDummyState.dragOffset = { x: 0, y: 0 };
        }
      }
      hudState.playerFloat = normalizePlayerFloatState(hudState.playerFloat);
      assignDeep(GameState.spawns, snapshot.spawns || {});
      assignDeep(GameState.lanes, snapshot.lanes || {});
      assignDeep(GameState.items, snapshot.items || {});
      assignDeep(GameState.effects, snapshot.effects || {});

      GameState.spawns.blue = Array.isArray(GameState.spawns.blue) ? GameState.spawns.blue : [];
      GameState.spawns.red = Array.isArray(GameState.spawns.red) ? GameState.spawns.red : [];
      GameState.spawns.pending = Array.isArray(GameState.spawns.pending) ? GameState.spawns.pending : [];
      GameState.lanes.configs = Array.isArray(GameState.lanes.configs) ? GameState.lanes.configs : [];
      GameState.items.abilityDefinitions = GameState.items.abilityDefinitions || {};
      const importedAbilityDefs = GameState.items.abilityDefinitions;
      if(importedAbilityDefs && typeof importedAbilityDefs === 'object'){
        Object.values(importedAbilityDefs).forEach(def => {
          if(!def || typeof def !== 'object') return;
          def.castType = normalizeAbilityCastType(def, def.castType);
        });
      }

      const runtime = player.runtime;
      assignDeep(player, snapshot.player || {});
      if(player.runtime !== runtime){
        Object.defineProperty(player, 'runtime', { value: runtime, writable: true, enumerable: false });
      }
      normalizePlayerControlState(player);
      setActivePrayer(prayerState.active);

      const minionSnapshots = Array.isArray(snapshot.minions) ? snapshot.minions : [];
      const minionClones = new Array(minionSnapshots.length);
      for(let i = 0; i < minionSnapshots.length; i++){
        const entry = minionSnapshots[i];
        if(!entry || typeof entry !== 'object'){
          errors.push(`Minion entry at index ${i} is not an object.`);
          continue;
        }
        const clone = deepClone(entry);
        const targetIndex = Number.isInteger(clone.__id) && clone.__id >= 0 ? clone.__id : i;
        delete clone.__id;
        minionClones[targetIndex] = clone;
      }
      minions.length = 0;
      for(let i = 0; i < minionClones.length; i++){
        if(minionClones[i]){
          minions.push(minionClones[i]);
        } else {
          minions.push({ side: 'neutral', x: 0, y: 0, hp: 0, maxHp: 0, dmg: 0 });
          errors.push(`Minion data missing for index ${i}.`);
        }
      }

      attachPracticeDummy();
      updatePracticeDummyHud();
      updatePracticeDummyStatusIcons();
      updatePracticeDummyUiState();
      positionPracticeDummyHud();

      syncMonsterInputs();
      updateMonsterAbilityQueueDisplay();
      updateMonsterHud();
      positionMonsterHud();

      updatePrayerButtons();
      updatePrayerHud();

      const restoreContext = { minions, player };
      minions.forEach((minion) => restoreRefs(minion, restoreContext));
      restoreRefs(GameState.spawns, restoreContext);
      restoreRefs(GameState.lanes, restoreContext);
      restoreRefs(GameState.items, restoreContext);
      restoreRefs(GameState.effects, restoreContext);
      restoreRefs(mapState, restoreContext);
      restoreRefs(hudState, restoreContext);
      restoreRefs(player, restoreContext);

      minionDiameter = Number(GameState.lanes.minion && GameState.lanes.minion.diameter) || 0;
      minionRadius = Number(GameState.lanes.minion && GameState.lanes.minion.radius) || (minionDiameter / 2);
      laneFanSpacing = Number(GameState.lanes.minion && GameState.lanes.minion.fanSpacing) || (minionDiameter > 0 ? minionDiameter * 1.35 : laneFanSpacing);

      cameraFollowLagMs = Number(camera.followLagMs) || 0;
      cameraLeadDistance = Number(camera.leadDistance) || 0;
      cameraHorizontalOffsetPercent = Number(camera.horizontalOffsetPercent) || 0;
      cameraVerticalOffsetPercent = Number(camera.verticalOffsetPercent) || 0;
      cameraEdgeScrollMargin = Number(camera.edgeScrollMargin) || 0;
      cameraEdgeScrollSpeed = Number(camera.edgeScrollSpeed) || 0;
      cameraRecenterDelayMs = Number(camera.recenterDelayMs) || 0;
      cameraManualLeash = Number(camera.manualLeash) || 0;
      cameraWheelSensitivity = Number(camera.wheelSensitivity) || 0;
      cameraZoomInLocked = !!camera.zoomInLocked;
      cameraZoomInLimit = camera.zoomInLimit != null && Number.isFinite(Number(camera.zoomInLimit)) ? Number(camera.zoomInLimit) : null;
      cameraZoomOutLocked = !!camera.zoomOutLocked;
      cameraZoomOutLimit = camera.zoomOutLimit != null && Number.isFinite(Number(camera.zoomOutLimit)) ? Number(camera.zoomOutLimit) : null;
      cameraLockBinding = camera.lockBinding ? { ...camera.lockBinding } : { key: ' ', code: 'Space', label: 'Space' };
      cameraLockCapture = !!camera.lockCapture;
      lastUnlockedCameraMode = typeof camera.lastUnlockedMode === 'string' ? camera.lastUnlockedMode : 'semi';
      cameraLastManualMoveAt = Number.isFinite(camera.lastManualMoveAt) ? camera.lastManualMoveAt : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      cameraDragActive = !!(camera.drag && camera.drag.active);
      cameraDragPointerId = camera.drag && Number.isFinite(camera.drag.pointerId) ? camera.drag.pointerId : null;
      cameraDragLast = camera.drag && camera.drag.last ? { ...camera.drag.last } : null;
      lastPlayerVelocityX = Number(camera.lastPlayerVelocity && camera.lastPlayerVelocity.x) || 0;
      lastPlayerVelocityY = Number(camera.lastPlayerVelocity && camera.lastPlayerVelocity.y) || 0;
      lastCameraTransformX = camera.lastTransform ? (camera.lastTransform.x ?? null) : null;
      lastCameraTransformY = camera.lastTransform ? (camera.lastTransform.y ?? null) : null;
      lastCameraTransformScale = camera.lastTransform ? (camera.lastTransform.scale ?? null) : null;
    } catch (err){
      console.error('importGameState failed', err);
      errors.push(err && err.message ? err.message : String(err));
    }

    if(img){
      const nextSrc = mapState.image && typeof mapState.image.src === 'string' ? mapState.image.src : '';
      if(nextSrc){
        if(img.src !== nextSrc){
          useArtImage(nextSrc, mapState.image.displayName);
        } else {
          setVars();
        }
      } else {
        img.removeAttribute('src');
        setVars();
      }
    } else {
      setVars();
    }

    if(fileName && mapState.image && typeof mapState.image.displayName === 'string' && mapState.image.displayName){
      fileName.textContent = mapState.image.displayName;
    }
    if(fileNameWrap){
      markFileLoaded(fileNameWrap, !!mapState.loaded);
    }
    if(hitboxImg){
      const nextHitboxSrc = mapState.image && typeof mapState.image.hitboxSrc === 'string' ? mapState.image.hitboxSrc : '';
      if(nextHitboxSrc){
        if(hitboxImg.src !== nextHitboxSrc){
          hitboxImg.src = nextHitboxSrc;
        }
      } else {
        hitboxImg.removeAttribute('src');
      }
    }
    if(hitboxName && mapState.hitbox){
      if(mapState.hitbox.displayName){
        hitboxName.textContent = mapState.hitbox.displayName;
      }
    }
    if(hitboxNameWrap){
      markFileLoaded(hitboxNameWrap, !!(mapState.hitbox && mapState.hitbox.loaded));
    }

    if(minionSizeInput){
      minionSizeInput.value = String(Math.round(minionDiameter));
    }

    setPlayerTeam(player.team);
    updateHudStats();
    updateHudHealth();
    positionPlayerFloatingHud();
    positionPracticeDummyHud();
    updateGoldUI();
    updateScoreUI();
    setAbilityBar(abilityBarState.count, abilityBarState.scale, true);
    setMinimapUserScale(minimapState.userScale, { syncInput: true });
    setMinimapClickToMove(minimapState.clickToMoveEnabled, { syncInput: true });
    setMinimapClickThrough(minimapState.clickThroughEnabled, { syncInput: true });
    setCameraMode(camera.mode, { syncInput: true, silent: true });
    setCameraFollowLag(cameraFollowLagMs, { syncInput: true });
    setCameraLead(cameraLeadDistance, { syncInput: true });
    setCameraHorizontalOffset(cameraHorizontalOffsetPercent, { syncInput: true });
    setCameraVerticalOffset(cameraVerticalOffsetPercent, { syncInput: true });
    setCameraEdgeMargin(cameraEdgeScrollMargin, { syncInput: true });
    setCameraEdgeSpeed(cameraEdgeScrollSpeed, { syncInput: true });
    setCameraRecenterDelay(cameraRecenterDelayMs, { syncInput: true });
    setCameraManualLeash(cameraManualLeash, { syncInput: true });
    setCameraWheelSensitivity(cameraWheelSensitivity, { syncInput: true });
    setCameraZoomInLock(cameraZoomInLocked, cameraZoomInLimit);
    setCameraZoomOutLock(cameraZoomOutLocked, cameraZoomOutLimit);
    updateCameraLockBindingDisplay();
    setDefaultSpellCastType(spellCastingConfig.defaultCastType, { syncInput: true });
    refreshSpellCastBindingDisplays();
    updateColliderUiState();
    updateVisionUiState();
    ensureDefaultSpawns(true);
    renderMinimap(true);
    scheduleHudFit();
    updateCamera(true, 0, { force: true });
    updateStagePointerState();

    return { ok: errors.length === 0, errors };
  }

  const sbHide = document.getElementById('sbHide');
  const sbFab = document.getElementById('sbFab');
  const sidebarEl = document.querySelector('.sidebar');
  const sbHeader = document.querySelector('.sidebar__header');
  const sbContent = document.querySelector('.sidebar__content');
  const sidebarSearchButton = document.getElementById('sidebarSearchButton');
  const sidebarSearchShortcut = document.querySelector('.sidebar__searchShortcut');

  const btnPlay = document.getElementById('btnPlay');
  const btnMap  = document.getElementById('btnMap');
  const btnHitbox = document.getElementById('btnHitbox');
  const btnGameState = document.getElementById('btnGameState');
  const fileInput = document.getElementById('file');
  const hitboxInput = document.getElementById('fileHitbox');
  const fileName  = document.getElementById('fileName');
  const fileNameWrap = document.getElementById('fileNameWrap');
  const hitboxName = document.getElementById('hitboxName');
  const hitboxNameWrap = document.getElementById('hitboxNameWrap');
  const gameStatePane = document.getElementById('gameStatePane');
  const gameStateImportButton = document.getElementById('gameStateImport');
  const gameStateExportButton = document.getElementById('gameStateExport');
  const gameStateImportInput = document.getElementById('gameStateImportFile');
  const btnColliders = document.getElementById('btnColliders');
  const colliderPane = document.getElementById('colliderPane');
  const colliderEditToggle = document.getElementById('colliderEditToggle');
  const colliderShapeSelect = document.getElementById('colliderShape');
  const colliderRadiusRange = document.getElementById('colliderRadius');
  const colliderRadiusDisplay = document.getElementById('colliderRadiusDisplay');
  const colliderInnerRadiusRow = document.getElementById('colliderInnerRadiusRow');
  const colliderInnerRadiusRange = document.getElementById('colliderInnerRadius');
  const colliderInnerRadiusDisplay = document.getElementById('colliderInnerRadiusDisplay');
  const colliderOffsetRow = document.getElementById('colliderOffsetRow');
  const colliderOffsetRange = document.getElementById('colliderOffset');
  const colliderOffsetDisplay = document.getElementById('colliderOffsetDisplay');
  const colliderLengthRow = document.getElementById('colliderLengthRow');
  const colliderLengthRange = document.getElementById('colliderLength');
  const colliderLengthDisplay = document.getElementById('colliderLengthDisplay');
  const colliderRotationRow = document.getElementById('colliderRotationRow');
  const colliderRotationRange = document.getElementById('colliderRotation');
  const colliderRotationDisplay = document.getElementById('colliderRotationDisplay');
  const colliderPlaceButton = document.getElementById('colliderPlace');
  const colliderToggleVisibilityButton = document.getElementById('colliderToggleVisibility');
  const colliderDeleteButton = document.getElementById('colliderDelete');
  const colliderLoadButton = document.getElementById('colliderLoad');
  const colliderSaveButton = document.getElementById('colliderSave');
  const colliderImportInput = document.getElementById('colliderImport');
  const colliderListEl = document.getElementById('colliderList');

  const btnVision = document.getElementById('btnVision');
  const visionPane = document.getElementById('visionPane');
  const visionEditToggle = document.getElementById('visionEditToggle');
  const visionShapeSelect = document.getElementById('visionShape');
  const visionRadiusRange = document.getElementById('visionRadius');
  const visionRadiusDisplay = document.getElementById('visionRadiusDisplay');
  const visionInnerRadiusRow = document.getElementById('visionInnerRadiusRow');
  const visionInnerRadiusRange = document.getElementById('visionInnerRadius');
  const visionInnerRadiusDisplay = document.getElementById('visionInnerRadiusDisplay');
  const visionOffsetRow = document.getElementById('visionOffsetRow');
  const visionOffsetRange = document.getElementById('visionOffset');
  const visionOffsetDisplay = document.getElementById('visionOffsetDisplay');
  const visionLengthRow = document.getElementById('visionLengthRow');
  const visionLengthRange = document.getElementById('visionLength');
  const visionLengthDisplay = document.getElementById('visionLengthDisplay');
  const visionRotationRow = document.getElementById('visionRotationRow');
  const visionRotationRange = document.getElementById('visionRotation');
  const visionRotationDisplay = document.getElementById('visionRotationDisplay');
  const visionModeInput = document.getElementById('visionMode');
  const visionPlaceButton = document.getElementById('visionPlace');
  const visionToggleVisibilityButton = document.getElementById('visionToggleVisibility');
  const visionDeleteButton = document.getElementById('visionDelete');
  const visionListEl = document.getElementById('visionList');
  const playerVisionRadiusInput = document.getElementById('GameState.player.vision.radius');
  const playerVisionRadiusDisplay = document.getElementById('playerVisionRadiusDisplay');
  const visionDummyPlaceButton = document.getElementById('visionDummyPlace');
  const visionDummyRadiusInput = document.getElementById('visionDummyRadius');
  practiceDummyMoveButton = document.getElementById('practiceDummyMove');
  practiceDummyResetButton = document.getElementById('practiceDummyReset');
  practiceDummyRemoveButton = document.getElementById('practiceDummyRemove');
  practiceDummySizeInput = document.getElementById('practiceDummySize');
  practiceDummySizeDisplay = document.getElementById('practiceDummySizeDisplay');
  practiceDummyDeathResponseSelect = document.getElementById('practiceDummyDeathResponse');
  const btnPracticeDummy = document.getElementById('btnPracticeDummy');
  const practiceDummyPane = document.getElementById('practiceDummyPane');
  const btnPrayers = document.getElementById('btnPrayers');
  const prayerPane = document.getElementById('prayerPane');
  const prayerListEl = document.getElementById('prayerList');
  const btnMonsters = document.getElementById('btnMonsters');
  const monsterPane = document.getElementById('monsterPane');
  const monsterMoveButton = document.getElementById('monsterMove');
  const monsterAggroRadiusInput = document.getElementById('monsterAggroRadius');
  const monsterSizeInput = document.getElementById('monsterSize');
  const monsterMaxHpInput = document.getElementById('monsterMaxHp');
  const monsterProjectileDamageInput = document.getElementById('monsterProjectileDamage');
  const monsterCastIntervalInput = document.getElementById('monsterCastInterval');
  const monsterQueueSizeInput = document.getElementById('monsterQueueSize');
  const monsterSlotSpinInput = document.getElementById('monsterSlotSpin');
  const monsterSlotRevealInput = document.getElementById('monsterSlotReveal');
  const monsterFreezeDurationInput = document.getElementById('monsterFreezeDuration');
  const monsterSpeedBoostPctInput = document.getElementById('monsterSpeedBoostPct');
  const monsterHealAmountInput = document.getElementById('monsterHealAmount');
  const monsterIconGreenInput = document.getElementById('monsterIconGreen');
  const monsterIconBlueInput = document.getElementById('monsterIconBlue');
  const monsterIconRedInput = document.getElementById('monsterIconRed');

  const btnMinions= document.getElementById('btnMinions');
  const minionsPane = document.getElementById('minionsPane');
  const btnSpawnBlue = document.getElementById('btnSpawnBlue');
  const btnSpawnRed  = document.getElementById('btnSpawnRed');
  const btnPlayer = document.getElementById('btnPlayer');
  const playerPane = document.getElementById('playerPane');
  const btnHealth = document.getElementById('btnHealth');
  const healthPane = document.getElementById('healthPane');
  const btnAnimation = document.getElementById('btnAnimation');
  const animationPane = document.getElementById('animationPane');
  const btnPlayerAnimation = document.getElementById('btnPlayerAnimation');
  const playerAnimationSection = document.getElementById('playerAnimationSection');
  const playerAnimationFileInput = document.getElementById('playerAnimationFile');
  const defaultPlayerAnimationAccept = playerAnimationFileInput ? (playerAnimationFileInput.getAttribute('accept') || '') : '';
  const btnPlayerAnimationLoad = document.getElementById('btnPlayerAnimationLoad');
  const btnPlayerAnimationLoadGlb = document.getElementById('btnPlayerAnimationLoadGlb');
  const btnPlayerAnimationMixamoCombine = document.getElementById('btnPlayerAnimationMixamoCombine');
  const btnPlayerAnimationLoadSetup = document.getElementById('btnPlayerAnimationLoadSetup');
  const btnPlayerAnimationSave = document.getElementById('btnPlayerAnimationSave');
  const btnPlayerAnimationClear = document.getElementById('btnPlayerAnimationClear');
  const playerAnimationStatus = document.getElementById('playerAnimationStatus');
  const playerAnimationCanvas = document.getElementById('playerAnimationCanvas');
  const playerAnimationStage = document.getElementById('playerAnimationStage');
  const playerAnimationDrop = document.getElementById('playerAnimationDrop');
  const playerAnimationMaterialsEl = document.getElementById('playerAnimationMaterials');
  const playerAnimationConfigInput = document.getElementById('playerAnimationConfigFile');
  const playerMixamoBaseInput = document.getElementById('playerMixamoBaseFile');
  const playerMixamoAnimationInput = document.getElementById('playerMixamoAnimationFiles');
  const playerAnimationScaleRange = document.getElementById('playerAnimationScaleRange');
  const playerAnimationScaleInput = document.getElementById('playerAnimationScaleInput');
  const playerAnimationLightAngleRange = document.getElementById('playerAnimationLightAngleRange');
  const playerAnimationLightAngleInput = document.getElementById('playerAnimationLightAngleInput');
  const playerAnimationOffsetHorizontalInput = document.getElementById('playerAnimationOffsetHorizontalInput');
  const playerAnimationOffsetVerticalInput = document.getElementById('playerAnimationOffsetVerticalInput');
  const playerModelAnchor = document.getElementById('playerModelAnchor');
  const playerModelCanvas = document.getElementById('playerModelCanvas');
  const playerAnimationActionSelects = {
    idle: document.getElementById('playerAnimationAction-idle'),
    move: document.getElementById('playerAnimationAction-move'),
    autoAttack: document.getElementById('playerAnimationAction-attack'),
    cast: document.getElementById('playerAnimationAction-cast'),
    death: document.getElementById('playerAnimationAction-death'),
    taunt: document.getElementById('playerAnimationAction-taunt')
  };
  const playerAnimationActionInputs = {
    idle: {
      speed: document.getElementById('playerAnimationAction-idle-speed'),
      startFrame: document.getElementById('playerAnimationAction-idle-start'),
      endFrame: document.getElementById('playerAnimationAction-idle-end')
    },
    move: {
      speed: document.getElementById('playerAnimationAction-move-speed'),
      startFrame: document.getElementById('playerAnimationAction-move-start'),
      endFrame: document.getElementById('playerAnimationAction-move-end')
    },
    autoAttack: {
      speed: document.getElementById('playerAnimationAction-attack-speed'),
      startFrame: document.getElementById('playerAnimationAction-attack-start'),
      endFrame: document.getElementById('playerAnimationAction-attack-end')
    },
    cast: {
      speed: document.getElementById('playerAnimationAction-cast-speed'),
      startFrame: document.getElementById('playerAnimationAction-cast-start'),
      endFrame: document.getElementById('playerAnimationAction-cast-end')
    },
    death: {
      speed: document.getElementById('playerAnimationAction-death-speed'),
      startFrame: document.getElementById('playerAnimationAction-death-start'),
      endFrame: document.getElementById('playerAnimationAction-death-end')
    },
    taunt: {
      speed: document.getElementById('playerAnimationAction-taunt-speed'),
      startFrame: document.getElementById('playerAnimationAction-taunt-start'),
      endFrame: document.getElementById('playerAnimationAction-taunt-end')
    }
  };

  const PLAYER_ANIMATION_ACTIONS = ['idle', 'move', 'autoAttack', 'cast', 'death', 'taunt'];
  const PLAYER_MODEL_OFFSET_MIN = -1000;
  const PLAYER_MODEL_OFFSET_MAX = 1000;
  const PLAYER_MODEL_DEFAULT_PX_PER_WORLD = 28;
  const PLAYER_ANIMATION_STORAGE_KEY = 'maka-player-animation-configs';
  const SECTION_STORAGE_PREFIX = 'maka-section-config:';

  function formatSectionConfigFilename(prefix = 'section'){
    const baseLabel = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'section';
    const sanitized = baseLabel.replace(/[^a-z0-9_\-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const safeBase = (sanitized || 'section').toLowerCase();
    const now = new Date();
    const pad = (value)=> String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${safeBase}-setup-${stamp}.json`;
  }

  function downloadJson(data, filename){
    try {
      const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || formatSectionConfigFilename();
      const parent = document.body || document.documentElement;
      if(parent){
        parent.appendChild(link);
        link.click();
        parent.removeChild(link);
      } else {
        link.click();
      }
      setTimeout(()=> URL.revokeObjectURL(url), 0);
      return true;
    } catch (err){
      console.error('Failed to export configuration', err);
      return false;
    }
  }

  function getStoredSectionConfig(storageKey){
    if(!storageKey || typeof localStorage === 'undefined'){ return null; }
    try {
      const raw = localStorage.getItem(storageKey);
      if(!raw){ return null; }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err){
      console.warn('Failed to read stored section configuration', err);
      return null;
    }
  }

  function setStoredSectionConfig(storageKey, snapshot){
    if(!storageKey || typeof localStorage === 'undefined'){ return false; }
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      return true;
    } catch (err){
      console.warn('Failed to persist section configuration', err);
      return false;
    }
  }

  function defaultBuildSectionSnapshot(pane){
    if(!pane){
      return null;
    }
    const controls = Array.from(pane.querySelectorAll('input, select, textarea')).filter(control => control && control.id && control.type !== 'file');
    if(!controls.length){
      return null;
    }
    const values = {};
    controls.forEach(control => {
      const type = (control.type || '').toLowerCase();
      if(type === 'radio'){ return; }
      if(type === 'checkbox'){
        values[control.id] = { kind: 'checked', value: !!control.checked };
      } else {
        values[control.id] = { kind: 'value', value: control.value };
      }
    });
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      values
    };
  }

  function defaultApplySectionSnapshot(pane, snapshot){
    if(!pane || !snapshot || typeof snapshot !== 'object'){ return false; }
    const values = snapshot.values;
    if(!values || typeof values !== 'object'){ return false; }
    let applied = false;
    for(const [id, entry] of Object.entries(values)){
      if(!entry || typeof entry !== 'object'){ continue; }
      const control = document.getElementById(id);
      if(!control){ continue; }
      const type = (control.type || '').toLowerCase();
      if(entry.kind === 'checked'){
        if(type === 'checkbox'){
          control.checked = !!entry.value;
          control.dispatchEvent(new Event('change', { bubbles: true }));
          applied = true;
        }
        continue;
      }
      if('value' in control){
        control.value = entry.value;
        if(control.tagName === 'SELECT'){
          control.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        }
        applied = true;
      }
    }
    return applied;
  }

  function triggerFileInputPicker(input){
    if(!input){
      return false;
    }
    try {
      if(typeof input.showPicker === 'function'){
        const maybePromise = input.showPicker();
        if(maybePromise && typeof maybePromise.catch === 'function'){
          maybePromise.catch(()=>{
            try {
              input.click();
            } catch (clickErr){
              console.error('File picker click() fallback failed', clickErr);
            }
          });
        }
        return true;
      }
    } catch (err){
      console.warn('File picker showPicker() failed, falling back to click()', err);
    }
    try {
      input.click();
      return true;
    } catch (err){
      console.error('File picker click() failed', err);
      return false;
    }
  }

  function setupSectionPersistence({
    paneId,
    saveButtonId,
    loadButtonId,
    fileInputId,
    storageKey,
    label = 'Section',
    filePrefix,
    buildSnapshot,
    applySnapshot
  }){
    const pane = paneId ? document.getElementById(paneId) : null;
    const saveButton = saveButtonId ? document.getElementById(saveButtonId) : null;
    const loadButton = loadButtonId ? document.getElementById(loadButtonId) : null;
    const fileInput = fileInputId ? document.getElementById(fileInputId) : null;
    if(!pane){
      return;
    }
    const sectionLabel = label;
    const build = typeof buildSnapshot === 'function'
      ? ()=> buildSnapshot({ pane })
      : ()=> defaultBuildSectionSnapshot(pane);
    const apply = typeof applySnapshot === 'function'
      ? (snapshot)=> applySnapshot(snapshot, { pane })
      : (snapshot)=> defaultApplySectionSnapshot(pane, snapshot);

    if(saveButton){
      saveButton.addEventListener('click', ()=>{
        const snapshot = build();
        if(!snapshot){
          if(typeof setHudMessage === 'function'){
            setHudMessage(`No ${sectionLabel.toLowerCase()} settings to save yet.`);
          }
          return;
        }
        if(storageKey){
          setStoredSectionConfig(storageKey, snapshot);
        }
        const filename = formatSectionConfigFilename(filePrefix || sectionLabel);
        const exported = downloadJson(snapshot, filename);
        if(exported && typeof setHudMessage === 'function'){
          setHudMessage(`${sectionLabel} setup saved.`);
        }
      });
    }

    if(loadButton){
      loadButton.addEventListener('click', ()=>{
        if(fileInput){
          fileInput.value = '';
          if(!triggerFileInputPicker(fileInput)){
            alert('Unable to open file picker.');
          }
          return;
        }
        if(!storageKey){
          return;
        }
        const stored = getStoredSectionConfig(storageKey);
        if(stored && apply(stored)){
          if(typeof setHudMessage === 'function'){
            setHudMessage(`${sectionLabel} setup loaded.`);
          }
        } else if(typeof setHudMessage === 'function'){
          setHudMessage(`No ${sectionLabel.toLowerCase()} setup found to load.`);
        }
      });
    }

    if(fileInput){
      fileInput.addEventListener('change', ()=>{
        const file = fileInput.files && fileInput.files[0];
        if(!file){
          return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', ()=>{
          try {
            const text = typeof reader.result === 'string' ? reader.result : '';
            const parsed = JSON.parse(text);
            if(apply(parsed)){
              if(storageKey){
                setStoredSectionConfig(storageKey, parsed);
              }
              if(typeof setHudMessage === 'function'){
                setHudMessage(`${sectionLabel} setup imported.`);
              }
            } else {
              alert(`Unable to apply ${sectionLabel.toLowerCase()} setup.`);
            }
          } catch (err){
            console.error(`Failed to parse ${sectionLabel} configuration`, err);
            alert(`Unable to parse ${sectionLabel.toLowerCase()} setup file.`);
          }
        });
        reader.addEventListener('error', ()=>{
          alert(`Unable to read ${sectionLabel.toLowerCase()} setup file.`);
        });
        reader.readAsText(file);
        fileInput.value = '';
      });
    }

    if(storageKey){
      try {
        const stored = getStoredSectionConfig(storageKey);
        if(stored){
          apply(stored);
        }
      } catch (err){
        console.warn(`Failed to restore ${sectionLabel} configuration`, err);
      }
    }
  }

  function normalizeVisionType(value){
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if(raw === 'capsule' || raw === 'crescent'){ return raw; }
    return 'circle';
  }

  function normalizeVisionMode(value){
    if(value === null || value === undefined){
      return 1;
    }
    if(typeof value === 'string'){
      const raw = value.trim().toLowerCase();
      if(raw === 'hiding' || raw === 'hide'){ return 2; }
      if(raw === 'vision'){ return 1; }
      const numeric = Number(raw);
      if(Number.isFinite(numeric) && numeric === 2){ return 2; }
      if(Number.isFinite(numeric) && numeric === 1){ return 1; }
      return 1;
    }
    const num = Number(value);
    if(Number.isFinite(num) && num === 2){ return 2; }
    return 1;
  }
  function visionModeToOption(mode){
    return mode === 2 ? 'hiding' : 'vision';
  }

  function buildVisionSnapshot(){
    const sources = customVisionSources.map(source => {
      const entry = {
        id: Number.isFinite(source && source.id) ? Number(source.id) : 0,
        type: normalizeVisionType(source && source.type),
        mode: normalizeVisionMode(source && source.mode),
        x: Number(source && source.x) || 0,
        y: Number(source && source.y) || 0,
        radius: Number(source && source.radius) || 0,
        innerRadius: Number(source && source.innerRadius) || 0,
        offset: Number(source && source.offset) || 0,
        length: Number(source && source.length) || 0,
        angle: Number(source && source.angle) || 0,
        angleDeg: Number.isFinite(source && source.angleDeg) ? Number(source.angleDeg) : radToDeg(Number(source && source.angle) || 0)
      };
      return entry;
    });
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      sequence: GameState.player.vision.nextId,
      visionRadius: Number(GameState.player.vision.radius) || 0,
      dummy: {
        active: practiceDummy && practiceDummy.active !== false,
        x: Number(practiceDummy && practiceDummy.x) || 0,
        y: Number(practiceDummy && practiceDummy.y) || 0,
        size: clampPracticeDummySize(practiceDummy && practiceDummy.size, practiceDummyDefaults.size),
        hp: Math.max(0, Number(practiceDummy && practiceDummy.hp) || 0),
        maxHp: Math.max(1, Number(practiceDummy && practiceDummy.maxHp) || practiceDummyDefaults.maxHp),
        radius: Number(practiceDummy && practiceDummy.radius) || 0,
        deathResponse: practiceDummy && practiceDummy.deathResponse === 'despawn' ? 'despawn' : 'respawn'
      },
      defaults: {
        type: normalizeVisionType(visionDefaults.type),
        mode: normalizeVisionMode(visionDefaults.mode),
        radius: Number(visionDefaults.radius) || 0,
        innerRadius: Number(visionDefaults.innerRadius) || 0,
        offset: Number(visionDefaults.offset) || 0,
        length: Number(visionDefaults.length) || 0,
        angleDeg: Number(visionDefaults.angleDeg) || 0
      },
      sources
    };
  }

  function applyVisionSnapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object'){ return false; }
    const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
    customVisionSources.length = 0;
    let maxId = 0;
    sources.forEach(item => {
      if(!item || typeof item !== 'object'){ return; }
      const entryId = Number.isFinite(item.id) ? Number(item.id) : null;
      const entry = {
        id: entryId !== null ? entryId : GameState.player.vision.nextId++,
        type: normalizeVisionType(item.type),
        mode: normalizeVisionMode(item.mode),
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        radius: Number(item.radius) || 0,
        innerRadius: Number(item.innerRadius),
        offset: Number(item.offset),
        length: Number(item.length),
        angle: Number(item.angle)
      };
      if(!Number.isFinite(entry.angle)){
        const fallbackDeg = Number.isFinite(item.angleDeg) ? Number(item.angleDeg) : 0;
        entry.angle = degToRad(fallbackDeg);
      }
      if(!Number.isFinite(entry.innerRadius)){
        delete entry.innerRadius;
      }
      if(!Number.isFinite(entry.offset)){
        delete entry.offset;
      }
      if(!Number.isFinite(entry.length)){
        delete entry.length;
      }
      ensureVisionConsistency(entry);
      customVisionSources.push(entry);
      if(Number.isFinite(entry.id) && entry.id > maxId){
        maxId = entry.id;
      }
    });
    const sequenceValue = Number(snapshot.sequence);
    if(Number.isFinite(sequenceValue) && sequenceValue >= 0){
      GameState.player.vision.nextId = Math.max(sequenceValue, maxId + 1);
    } else {
      GameState.player.vision.nextId = maxId + 1;
    }

    const radiusValue = Number(snapshot.visionRadius);
    if(Number.isFinite(radiusValue)){
      GameState.player.vision.radius = clampSettingValue(radiusValue, SETTINGS_RANGE_MIN);
    }

    const dummy = snapshot.dummy || {};
    if(practiceDummy){
      practiceDummy.active = dummy.active !== false;
      const clampCoord = (value, max) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
      if(Number.isFinite(Number(dummy.x))){
        practiceDummy.x = clampCoord(Number(dummy.x), mapState.width);
      }
      if(Number.isFinite(Number(dummy.y))){
        practiceDummy.y = clampCoord(Number(dummy.y), mapState.height);
      }
      const sizeValue = Number(dummy.size);
      if(Number.isFinite(sizeValue)){
        practiceDummy.size = clampPracticeDummySize(sizeValue, practiceDummyDefaults.size);
      } else {
        const legacyRadius = Number(dummy.radius);
        if(Number.isFinite(legacyRadius)){
          practiceDummy.size = clampPracticeDummySize(legacyRadius * 2, practiceDummyDefaults.size);
          practiceDummy.radius = clampSettingValue(legacyRadius, SETTINGS_RANGE_MIN);
        }
      }
      const maxHpValue = Number(dummy.maxHp);
      if(Number.isFinite(maxHpValue)){
        practiceDummy.maxHp = Math.max(1, maxHpValue);
      }
      const hpValue = Number(dummy.hp);
      if(Number.isFinite(hpValue)){
        practiceDummy.hp = Math.max(0, Math.min(practiceDummy.maxHp, hpValue));
      } else {
        practiceDummy.hp = Math.max(0, Math.min(practiceDummy.maxHp, Number(practiceDummy.hp) || practiceDummy.maxHp));
      }
      if(!Number.isFinite(sizeValue) && Number.isFinite(Number(dummy.radius))){
        practiceDummy.radius = clampSettingValue(Number(dummy.radius), SETTINGS_RANGE_MIN);
      }
      if(typeof dummy.deathResponse === 'string'){
        practiceDummy.deathResponse = dummy.deathResponse === 'despawn' ? 'despawn' : 'respawn';
      }
      practiceDummy.respawnTimer = 0;
      practiceDummyState.selected = false;
      normalizePracticeDummyState();
      refreshPracticeDummyAnchors();
      updatePracticeDummyUiState();
      updatePracticeDummyHud();
      updatePracticeDummyStatusIcons();
      positionPracticeDummyHud();
      renderMinimap(true);
    }

    const defaults = snapshot.defaults || {};
    visionDefaults.type = normalizeVisionType(defaults.type);
    visionDefaults.mode = normalizeVisionMode(defaults.mode);
    const defaultRadius = Number(defaults.radius);
    if(Number.isFinite(defaultRadius)){
      visionDefaults.radius = clampSettingValue(defaultRadius, SETTINGS_RANGE_MIN);
    }
    const defaultInnerRadius = Number(defaults.innerRadius);
    if(Number.isFinite(defaultInnerRadius)){
      visionDefaults.innerRadius = clampSettingValue(defaultInnerRadius, SETTINGS_RANGE_MIN);
    }
    const defaultOffset = Number(defaults.offset);
    if(Number.isFinite(defaultOffset)){
      visionDefaults.offset = clampSettingValue(defaultOffset, SETTINGS_RANGE_MIN);
    }
    const defaultLength = Number(defaults.length);
    if(Number.isFinite(defaultLength)){
      visionDefaults.length = clampSettingValue(defaultLength, SETTINGS_RANGE_MIN);
    }
    const defaultAngle = Number(defaults.angleDeg);
    if(Number.isFinite(defaultAngle)){
      visionDefaults.angleDeg = defaultAngle;
    }
    ensureVisionConsistency(visionDefaults);

    GameState.player.vision.selectedId = null;
    GameState.player.vision.placing = false;
    GameState.player.vision.editMode = false;
    GameState.player.vision.draggingId = null;
    GameState.player.vision.dummyState.placing = false;
    GameState.player.vision.dummyState.dragging = false;
    GameState.player.vision.dummyState.pointerId = null;

    updateVisionUiState();
    onVisionsChanged();
    renderMinimap(true);
    return true;
  }

  function normalizeLabel(value){
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function loadPlayerAnimationConfigurations(){
    if(typeof localStorage === 'undefined'){ return {}; }
    try {
      const raw = localStorage.getItem(PLAYER_ANIMATION_STORAGE_KEY);
      if(!raw){ return {}; }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err){
      console.warn('Failed to parse saved animation setup', err);
      return {};
    }
  }

  function savePlayerAnimationConfigurations(data){
    if(typeof localStorage === 'undefined'){ return false; }
    try {
      localStorage.setItem(PLAYER_ANIMATION_STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err){
      console.warn('Failed to persist animation setup', err);
      return false;
    }
  }

  function formatPlayerAnimationConfigFilename(modelLabel = ''){
    const baseLabel = typeof modelLabel === 'string' && modelLabel.trim()
      ? modelLabel.trim()
      : 'player-animation';
    const sanitized = baseLabel.replace(/[^a-z0-9_\-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const safeBase = (sanitized || 'player-animation').toLowerCase();
    const now = new Date();
    const pad = (value)=> String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${safeBase}-setup-${stamp}.json`;
  }

  function cloneSkinnedModel(source){
    if(!source){
      return null;
    }
    const clone = source.clone(true);
    const boneMap = new Map();
    const nodeMap = new Map();
    const skinnedPairs = [];

    const queue = [[source, clone]];
    while(queue.length){
      const [srcNode, cloneNode] = queue.shift();
      if(!srcNode || !cloneNode){
        continue;
      }
      nodeMap.set(srcNode, cloneNode);
      if(srcNode.isBone){
        boneMap.set(srcNode, cloneNode);
      }
      if(srcNode.isSkinnedMesh){
        skinnedPairs.push([srcNode, cloneNode]);
      }
      const srcChildren = srcNode.children || [];
      const cloneChildren = cloneNode.children || [];
      const childCount = Math.min(srcChildren.length, cloneChildren.length);
      for(let i = 0; i < childCount; i += 1){
        queue.push([srcChildren[i], cloneChildren[i]]);
      }
    }

    skinnedPairs.forEach(([sourceMesh, cloneMesh]) => {
      if(!cloneMesh || !sourceMesh.skeleton){
        return;
      }
      const sourceSkeleton = sourceMesh.skeleton;
      const orderedBones = sourceSkeleton.bones.map(bone => boneMap.get(bone) || null);
      const hasAllBones = orderedBones.every(Boolean);
      if(!hasAllBones){
        return;
      }
      const boneInverses = sourceSkeleton.boneInverses.map(inv => inv.clone());
      const skeleton = new THREE.Skeleton(orderedBones, boneInverses);
      const bindMatrix = sourceMesh.bindMatrix ? sourceMesh.bindMatrix.clone() : cloneMesh.matrixWorld.clone();
      cloneMesh.bind(skeleton, bindMatrix);
      if(sourceMesh.bindMatrixInverse){
        cloneMesh.bindMatrixInverse.copy(sourceMesh.bindMatrixInverse);
      }
    });

    clone.animations = source.animations ? source.animations.slice() : [];
    nodeMap.forEach((cloneNode, srcNode) => {
      if(srcNode !== source && srcNode.animations && srcNode.animations.length){
        cloneNode.animations = srcNode.animations.slice();
      }
    });
    return clone;
  }

  class PlayerAnimationController {
    constructor({ canvas, stage, dropEl, statusEl, materialsEl, selects, actionInputs, scaleRange, scaleInput, offsetHorizontalInput, offsetVerticalInput, lightAngleRange, lightAngleInput } = {}){
      this.canvas = canvas || null;
      this.stage = stage || null;
      this.dropEl = dropEl || null;
      this.statusEl = statusEl || null;
      this.materialsEl = materialsEl || null;
      this.selects = selects || {};
      this.actionInputs = actionInputs || {};
      this.scaleRange = scaleRange || null;
      this.scaleInput = scaleInput || null;
      this.offsetHorizontalInput = offsetHorizontalInput || null;
      this.offsetVerticalInput = offsetVerticalInput || null;
      this.lightAngleRange = lightAngleRange || null;
      this.lightAngleInput = lightAngleInput || null;
      this.assignments = {};
      PLAYER_ANIMATION_ACTIONS.forEach(action => {
        this.assignments[action] = this.createDefaultAssignment();
      });
      this.fbxLoader = new FBXLoader();
      this.gltfLoader = new GLTFLoader();
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
      this.dracoLoader.preload();
      this.gltfLoader.setDRACOLoader(this.dracoLoader);
      if(MeshoptDecoder){
        this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
      }
      this.clipLibrary = [];
      this.clipMap = new Map();
      this.assignmentClipCache = new Map();
      this.materialEntries = [];
      this.modelLabel = '';
      this.lastAppliedSignature = null;
      this.lastSavedSignature = null;
      this.currentRoot = null;
      this.mixer = null;
      this.currentAction = null;
      this.currentClipKey = null;
      this.currentState = 'idle';
      this.lastContext = {};
      this.modelScale = 1;
      this.modelRadius = 0;
      this.modelHeight = 0;
      this.modelBasePosition = { x: 0, y: 0, z: 0 };
      this.modelOffsetHorizontalPx = 0;
      this.modelOffsetVerticalPx = 0;
      this.lightAzimuthDegrees = 45;
      this.directionalLight = null;
      this.directionalLightTarget = null;
      this.directionalLightRadius = 3.6;
      this.directionalLightHeight = 4;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.controls = null;
      this.clock = null;
      this.resizeObserver = null;
      this.placeholder = null;
      this.trimSupportWarned = false;
      this.enabled = !!(this.canvas && this.canvas.getContext);
      this.onModelLoaded = null;
      this.onModelCleared = null;
      this.onAssignmentsChanged = null;
      this.onMaterialsUpdated = null;
      this.onModelScaleChanged = null;
      this.onModelOffsetChanged = null;
      this.init();
    }

    init(){
      if(!this.enabled){
        this.setStatus('Preview unavailable.');
        return;
      }
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.scene = new THREE.Scene();
      this.scene.background = null;
      if(this.renderer && typeof this.renderer.setClearColor === 'function'){
        this.renderer.setClearColor(0x000000, 0);
      }
      this.clock = new THREE.Clock();
      this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
      this.camera.position.set(0, 1.2, 3.2);
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.target.set(0, 1, 0);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
      this.scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 1.0);
      dir.castShadow = true;
      this.directionalLight = dir;
      this.directionalLightTarget = new THREE.Object3D();
      this.directionalLightTarget.position.set(0, 1, 0);
      this.scene.add(this.directionalLightTarget);
      dir.target = this.directionalLightTarget;
      this.scene.add(dir);
      this.placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
      );
      this.placeholder.position.y = 0.2;
      this.placeholder.castShadow = true;
      this.scene.add(this.placeholder);
      this.placeholderBasePosition = {
        x: this.placeholder.position.x,
        y: this.placeholder.position.y,
        z: this.placeholder.position.z
      };
      this.updateRendererSize();
      this.animate();
      this.bindSelects();
      this.bindActionInputs();
      this.syncAllActionInputs();
      this.bindScaleControls();
      this.bindOffsetControls();
      this.bindLightControls();
      this.setLightAzimuth(this.lightAzimuthDegrees, { force: true });
      if(this.stage){
        this.stage.addEventListener('dragenter', (ev)=> this.handleDragEnter(ev));
        this.stage.addEventListener('dragover', (ev)=> this.handleDragOver(ev));
        this.stage.addEventListener('dragleave', (ev)=> this.handleDragLeave(ev));
        this.stage.addEventListener('drop', (ev)=> this.handleDrop(ev));
        this.stage.dataset.drop = 'false';
        if('ResizeObserver' in window){
          this.resizeObserver = new ResizeObserver(()=> this.updateRendererSize());
          this.resizeObserver.observe(this.stage);
        }
      } else {
        window.addEventListener('resize', ()=> this.updateRendererSize());
      }
    }

    createDefaultAssignment(){
      return { clipId: '', speed: 1, startFrame: null, endFrame: null };
    }

    normalizeSpeed(value){
      if(value === undefined || value === null || value === ''){
        return 1;
      }
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return 1;
      }
      const clamped = Math.min(5, Math.max(0, numeric));
      return Math.round(clamped * 1000) / 1000;
    }

    normalizeFrame(value){
      if(value === undefined || value === null || value === ''){
        return null;
      }
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return null;
      }
      return Math.max(0, Math.round(numeric));
    }

    formatSpeed(value){
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return '1';
      }
      const rounded = Math.round(numeric * 100) / 100;
      if(Math.abs(rounded - Math.round(rounded)) < 1e-6){
        return `${Math.round(rounded)}`;
      }
      return rounded.toFixed(2).replace(/\.?0+$/, '');
    }

    getAssignment(action){
      if(!PLAYER_ANIMATION_ACTIONS.includes(action)){
        return this.createDefaultAssignment();
      }
      const stored = this.assignments[action];
      if(stored && typeof stored === 'object'){
        const normalized = {
          clipId: typeof stored.clipId === 'string' ? stored.clipId : '',
          speed: this.normalizeSpeed(stored.speed),
          startFrame: this.normalizeFrame(stored.startFrame),
          endFrame: this.normalizeFrame(stored.endFrame)
        };
        this.assignments[action] = normalized;
        return { ...normalized };
      }
      if(typeof stored === 'string'){
        const normalized = { clipId: stored, speed: 1, startFrame: null, endFrame: null };
        this.assignments[action] = normalized;
        return { ...normalized };
      }
      const fallback = this.createDefaultAssignment();
      this.assignments[action] = fallback;
      return { ...fallback };
    }

    setAssignment(action, updates = {}, { emit = true, reapply = true, syncInputs = true } = {}){
      if(!PLAYER_ANIMATION_ACTIONS.includes(action)){
        return false;
      }
      const previous = this.getAssignment(action);
      const next = { ...previous };
      let changed = false;
      let clipChanged = false;
      let framesChanged = false;

      if('clipId' in updates){
        const clipId = typeof updates.clipId === 'string' ? updates.clipId : '';
        if(clipId !== previous.clipId){
          next.clipId = clipId;
          changed = true;
          clipChanged = true;
          if(!('startFrame' in updates)){
            next.startFrame = null;
          }
          if(!('endFrame' in updates)){
            next.endFrame = null;
          }
          if(!('speed' in updates)){
            next.speed = 1;
          }
        }
      }
      if('speed' in updates){
        const speed = this.normalizeSpeed(updates.speed);
        if(Math.abs(speed - previous.speed) > 0.0001){
          next.speed = speed;
          changed = true;
        }
      }
      if('startFrame' in updates){
        const startFrame = this.normalizeFrame(updates.startFrame);
        if(startFrame !== previous.startFrame){
          next.startFrame = startFrame;
          changed = true;
          framesChanged = true;
        }
      }
      if('endFrame' in updates){
        const endFrame = this.normalizeFrame(updates.endFrame);
        if(endFrame !== previous.endFrame){
          next.endFrame = endFrame;
          changed = true;
          framesChanged = true;
        }
      }

      this.assignments[action] = next;

      if(syncInputs){
        this.syncActionInputs(action);
      }

      if(changed){
        if(clipChanged || framesChanged){
          this.assignmentClipCache.clear();
        }
        if(reapply && this.currentState === action){
          this.applyState(this.currentState, this.lastContext, { force: true });
        }
        if(emit){
          this.emitAssignmentsChanged();
        }
      }

      return changed;
    }

    syncActionInputs(action){
      const inputs = this.actionInputs[action];
      if(!inputs) return;
      const assignment = this.getAssignment(action);
      const hasClip = !!(assignment.clipId && this.clipMap.has(assignment.clipId));
      if(inputs.speed && document.activeElement !== inputs.speed){
        inputs.speed.value = this.formatSpeed(assignment.speed);
      }
      if(inputs.speed){
        inputs.speed.disabled = !hasClip;
      }
      if(inputs.startFrame && document.activeElement !== inputs.startFrame){
        inputs.startFrame.value = assignment.startFrame === null ? '' : `${assignment.startFrame}`;
      }
      if(inputs.startFrame){
        inputs.startFrame.disabled = !hasClip;
      }
      if(inputs.endFrame && document.activeElement !== inputs.endFrame){
        inputs.endFrame.value = assignment.endFrame === null ? '' : `${assignment.endFrame}`;
      }
      if(inputs.endFrame){
        inputs.endFrame.disabled = !hasClip;
      }
    }

    syncAllActionInputs(){
      for(const action of PLAYER_ANIMATION_ACTIONS){
        this.syncActionInputs(action);
      }
    }

    bindSelects(){
      for(const [action, select] of Object.entries(this.selects)){
        if(!select) continue;
        select.disabled = true;
        select.addEventListener('change', ()=>{
          this.setAssignment(action, { clipId: select.value || '' });
        });
      }
    }

    bindActionInputs(){
      for(const action of PLAYER_ANIMATION_ACTIONS){
        const inputs = this.actionInputs[action];
        if(!inputs) continue;
        if(inputs.speed){
          const commitSpeed = ()=>{
            const raw = inputs.speed.value;
            const parsed = raw === '' ? 1 : Number(raw);
            this.setAssignment(action, { speed: parsed }, { reapply: true });
            this.syncActionInputs(action);
          };
          inputs.speed.addEventListener('change', commitSpeed);
          inputs.speed.addEventListener('blur', commitSpeed);
        }
        if(inputs.startFrame){
          const commitStart = ()=>{
            const raw = inputs.startFrame.value;
            const parsed = raw === '' ? null : Number(raw);
            this.setAssignment(action, { startFrame: parsed }, { reapply: true });
            this.syncActionInputs(action);
          };
          inputs.startFrame.addEventListener('change', commitStart);
          inputs.startFrame.addEventListener('blur', commitStart);
        }
        if(inputs.endFrame){
          const commitEnd = ()=>{
            const raw = inputs.endFrame.value;
            const parsed = raw === '' ? null : Number(raw);
            this.setAssignment(action, { endFrame: parsed }, { reapply: true });
            this.syncActionInputs(action);
          };
          inputs.endFrame.addEventListener('change', commitEnd);
          inputs.endFrame.addEventListener('blur', commitEnd);
        }
      }
    }

    bindScaleControls(){
      if(this.scaleRange){
        this.scaleRange.value = `${this.modelScale}`;
        this.scaleRange.addEventListener('input', ()=>{
          const value = parseFloat(this.scaleRange.value);
          if(Number.isFinite(value)){
            this.setModelScale(value);
          }
        });
      }
      if(this.scaleInput){
        this.scaleInput.value = this.modelScale.toFixed(2);
        const commit = ()=>{
          if(this.scaleInput.value === ''){
            return;
          }
          const value = parseFloat(this.scaleInput.value);
          if(Number.isFinite(value)){
            this.setModelScale(value);
          }
        };
        this.scaleInput.addEventListener('change', commit);
        this.scaleInput.addEventListener('blur', commit);
      }
    }

    bindOffsetControls(){
      if(this.offsetHorizontalInput){
        this.offsetHorizontalInput.value = String(Math.round(this.modelOffsetHorizontalPx));
        const commitHorizontal = ()=>{
          if(this.offsetHorizontalInput.value === ''){
            this.setModelOffset({ horizontal: 0 });
            return;
          }
          const value = this.clampModelOffset(this.offsetHorizontalInput.value);
          this.setModelOffset({ horizontal: value });
        };
        this.offsetHorizontalInput.addEventListener('change', commitHorizontal);
        this.offsetHorizontalInput.addEventListener('blur', commitHorizontal);
      }
      if(this.offsetVerticalInput){
        this.offsetVerticalInput.value = String(Math.round(this.modelOffsetVerticalPx));
        const commitVertical = ()=>{
          if(this.offsetVerticalInput.value === ''){
            this.setModelOffset({ vertical: 0 });
            return;
          }
          const value = this.clampModelOffset(this.offsetVerticalInput.value);
          this.setModelOffset({ vertical: value });
        };
        this.offsetVerticalInput.addEventListener('change', commitVertical);
        this.offsetVerticalInput.addEventListener('blur', commitVertical);
      }
      this.syncOffsetInputs();
    }

    clampModelOffset(value){
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return 0;
      }
      return Math.max(PLAYER_MODEL_OFFSET_MIN, Math.min(PLAYER_MODEL_OFFSET_MAX, numeric));
    }

    syncOffsetInputs(axis = null){
      const sync = (inputEl, value)=>{
        if(inputEl && document.activeElement !== inputEl){
          const formatted = String(Math.round(value));
          if(inputEl.value !== formatted){
            inputEl.value = formatted;
          }
        }
      };
      if(axis === null || axis === 'horizontal'){
        const horizontal = this.clampModelOffset(this.modelOffsetHorizontalPx);
        sync(this.offsetHorizontalInput, horizontal);
      }
      if(axis === null || axis === 'vertical'){
        const vertical = this.clampModelOffset(this.modelOffsetVerticalPx);
        sync(this.offsetVerticalInput, vertical);
      }
    }

    setModelOffset({ horizontal = null, vertical = null } = {}, { syncInputs = true, force = false, emit = true } = {}){
      let changed = false;
      if(horizontal !== null){
        const clamped = this.clampModelOffset(horizontal);
        if(force || Math.abs(clamped - this.modelOffsetHorizontalPx) > 0.0001){
          this.modelOffsetHorizontalPx = clamped;
          changed = true;
        }
      }
      if(vertical !== null){
        const clamped = this.clampModelOffset(vertical);
        if(force || Math.abs(clamped - this.modelOffsetVerticalPx) > 0.0001){
          this.modelOffsetVerticalPx = clamped;
          changed = true;
        }
      }
      if(syncInputs){
        this.syncOffsetInputs();
      }
      if(changed || force){
        this.applyModelOffsetToScene();
        if(emit){
          this.emitModelOffsetChanged();
        }
      }
    }

    getModelOffset(){
      return {
        horizontal: this.modelOffsetHorizontalPx,
        vertical: this.modelOffsetVerticalPx
      };
    }

    estimatePixelsPerWorldUnit(){
      if(typeof playerRuntime.model !== 'undefined' && playerRuntime.model && Number.isFinite(playerRuntime.model.playerRadius) && Number.isFinite(playerRuntime.model.modelRadius) && playerRuntime.model.modelRadius > 0){
        const ratio = playerRuntime.model.playerRadius / playerRuntime.model.modelRadius;
        if(ratio > 0){
          return ratio;
        }
      }
      if(typeof player !== 'undefined' && player && Number.isFinite(player.r) && this.modelRadius > 0){
        const ratio = player.r / this.modelRadius;
        if(ratio > 0){
          return ratio;
        }
      }
      return PLAYER_MODEL_DEFAULT_PX_PER_WORLD;
    }

    applyModelOffsetToScene(){
      const pxPerWorld = this.estimatePixelsPerWorldUnit();
      if(!(pxPerWorld > 0)){
        return;
      }
      const offsetXWorld = this.modelOffsetHorizontalPx / pxPerWorld;
      const offsetYWorld = this.modelOffsetVerticalPx / pxPerWorld;
      if(this.currentRoot){
        if(!this.modelBasePosition){
          this.modelBasePosition = { x: this.currentRoot.position.x, y: this.currentRoot.position.y, z: this.currentRoot.position.z };
        }
        this.currentRoot.position.set(
          this.modelBasePosition.x + offsetXWorld,
          this.modelBasePosition.y + offsetYWorld,
          this.modelBasePosition.z
        );
        this.currentRoot.updateMatrixWorld(true);
      } else if(this.placeholder){
        if(!this.placeholderBasePosition){
          this.placeholderBasePosition = { x: this.placeholder.position.x, y: this.placeholder.position.y, z: this.placeholder.position.z };
        }
        this.placeholder.position.set(
          this.placeholderBasePosition.x + offsetXWorld,
          this.placeholderBasePosition.y + offsetYWorld,
          this.placeholderBasePosition.z
        );
        this.placeholder.updateMatrixWorld(true);
      }
    }

    bindLightControls(){
      if(this.lightAngleRange){
        this.lightAngleRange.value = `${Math.round(this.lightAzimuthDegrees)}`;
        this.lightAngleRange.addEventListener('input', ()=>{
          const raw = parseFloat(this.lightAngleRange.value);
          if(Number.isFinite(raw)){
            this.setLightAzimuth(raw, { syncInputs: false });
          }
        });
        this.lightAngleRange.addEventListener('change', ()=>{
          const raw = parseFloat(this.lightAngleRange.value);
          if(Number.isFinite(raw)){
            this.setLightAzimuth(raw);
          }
        });
      }
      if(this.lightAngleInput){
        this.lightAngleInput.value = `${Math.round(this.lightAzimuthDegrees)}`;
        const commit = ()=>{
          const raw = parseFloat(this.lightAngleInput.value);
          if(Number.isFinite(raw)){
            this.setLightAzimuth(raw);
          }
        };
        this.lightAngleInput.addEventListener('change', commit);
        this.lightAngleInput.addEventListener('blur', commit);
      }
      this.syncLightAngleInputs();
    }

    syncLightAngleInputs(){
      const normalized = ((this.lightAzimuthDegrees % 360) + 360) % 360;
      const rounded = Math.round(normalized);
      if(this.lightAngleRange && this.lightAngleRange.value !== `${rounded}`){
        this.lightAngleRange.value = `${rounded}`;
      }
      if(this.lightAngleInput && document.activeElement !== this.lightAngleInput){
        const formatted = `${rounded}`;
        if(this.lightAngleInput.value !== formatted){
          this.lightAngleInput.value = formatted;
        }
      }
    }

    setLightAzimuth(value, { syncInputs = true, force = false } = {}){
      let numeric = Number(value);
      if(!Number.isFinite(numeric)){
        numeric = 0;
      }
      numeric = ((numeric % 360) + 360) % 360;
      if(!force && Math.abs(numeric - this.lightAzimuthDegrees) < 0.0001){
        if(syncInputs){
          this.syncLightAngleInputs();
        }
        return;
      }
      this.lightAzimuthDegrees = numeric;
      this.updateDirectionalLightPosition();
      if(syncInputs){
        this.syncLightAngleInputs();
      }
    }

    updateDirectionalLightPosition(){
      if(!this.directionalLight){
        return;
      }
      const radius = Number.isFinite(this.directionalLightRadius) && this.directionalLightRadius > 0 ? this.directionalLightRadius : 3.6;
      const height = Number.isFinite(this.directionalLightHeight) ? this.directionalLightHeight : 4;
      const radians = THREE.MathUtils.degToRad(this.lightAzimuthDegrees);
      const x = Math.cos(radians) * radius;
      const z = Math.sin(radians) * radius;
      this.directionalLight.position.set(x, height, z);
      if(this.directionalLightTarget){
        this.directionalLightTarget.position.set(0, Math.max(0.5, height * 0.25), 0);
        this.directionalLightTarget.updateMatrixWorld(true);
      }
      this.directionalLight.updateMatrixWorld(true);
    }

    clampScale(value){
      const defaultMin = 0.001;
      const defaultMax = 1000;
      const numberMin = this.scaleInput ? Number(this.scaleInput.min) || defaultMin : defaultMin;
      const numberMax = this.scaleInput ? Number(this.scaleInput.max) || defaultMax : defaultMax;
      const sliderMin = this.scaleRange ? Number(this.scaleRange.min) || numberMin : numberMin;
      const sliderMax = this.scaleRange ? Number(this.scaleRange.max) || numberMax : numberMax;
      const numericValue = Number.isFinite(value) ? value : this.modelScale;
      const clampedNumber = Math.min(Math.max(numericValue, numberMin), numberMax);
      return { value: clampedNumber, sliderMin, sliderMax };
    }

    setModelScale(value, { force = false } = {}){
      const { value: numeric, sliderMin, sliderMax } = this.clampScale(value);
      const previous = this.modelScale;
      const changed = force || Math.abs(previous - numeric) > 0.0001;
      this.modelScale = numeric;
      if(this.scaleRange){
        const sliderValue = Math.min(Math.max(numeric, sliderMin), sliderMax);
        if(Math.abs(parseFloat(this.scaleRange.value) - sliderValue) > 0.0001){
          this.scaleRange.value = sliderValue.toFixed(2);
        }
      }
      if(this.scaleInput && document.activeElement !== this.scaleInput){
        const formatted = numeric.toFixed(2);
        if(this.scaleInput.value !== formatted){
          this.scaleInput.value = formatted;
        }
      }
      if(this.currentRoot && (changed || force)){
        this.applyModelScale({ emit: false });
      }
      if(changed && this.hasModel()){
        this.emitModelScaleChanged();
      }
    }

    getModelScale(){
      return this.modelScale;
    }

    applyModelScale({ refit = true, emit = false } = {}){
      if(!this.currentRoot){
        if(emit){
          this.emitModelScaleChanged();
        }
        return;
      }
      this.currentRoot.scale.setScalar(this.modelScale);
      this.currentRoot.updateMatrixWorld(true);
      if(refit){
        this.fitToObject(this.currentRoot);
      }
      this.applyModelOffsetToScene();
      if(emit){
        this.emitModelScaleChanged();
      }
    }

    updateRendererSize(){
      if(!this.renderer){
        return;
      }
      let width = 220;
      let height = 220;
      if(this.stage){
        const rect = this.stage.getBoundingClientRect();
        const fallbackWidth = rect && rect.width ? rect.width : (this.stage.clientWidth || width);
        const fallbackHeight = rect && rect.height ? rect.height : (this.stage.clientHeight || height);
        width = fallbackWidth;
        height = fallbackHeight;
      } else if(this.canvas){
        const fallbackWidth = this.canvas.clientWidth || width;
        const fallbackHeight = this.canvas.clientHeight || height;
        width = fallbackWidth;
        height = fallbackHeight;
      }
      width = Math.round(width);
      height = Math.round(height);
      width = Math.max(120, width);
      height = Math.max(140, height);
      this.renderer.setSize(width, height, false);
      if(this.camera){
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      }
    }

    refreshSize(){
      this.updateRendererSize();
    }

    animate(){
      if(!this.renderer) return;
      requestAnimationFrame(()=> this.animate());
      const delta = this.clock ? this.clock.getDelta() : 0;
      if(this.controls){
        this.controls.update();
      }
      if(this.mixer && delta){
        this.mixer.update(delta);
      }
      this.renderer.render(this.scene, this.camera);
    }

    handleDragEnter(ev){
      if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      if(this.stage){
        this.stage.dataset.drop = 'true';
      }
    }

    handleDragOver(ev){
      if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      if(ev && ev.dataTransfer){
        ev.dataTransfer.dropEffect = 'copy';
      }
      if(this.stage){
        this.stage.dataset.drop = 'true';
      }
    }

    handleDragLeave(ev){
      if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      if(this.stage){
        this.stage.dataset.drop = 'false';
      }
    }

    handleDrop(ev){
      if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      if(this.stage){
        this.stage.dataset.drop = 'false';
      }
      const file = ev && ev.dataTransfer && ev.dataTransfer.files ? ev.dataTransfer.files[0] : null;
      if(file){
        this.loadFile(file);
      }
    }

    async loadFile(file){
      if(!file) return;
      this.setStatus(`Loading ${file.name}`);
      try {
        const buffer = await file.arrayBuffer();
        await this.loadFromArrayBuffer(buffer, file.name);
      } catch(err){
        this.handleError(err);
      }
    }

    async loadFromArrayBuffer(buffer, name = 'model'){
      const label = typeof name === 'string' && name ? name : 'model';
      if(buffer && buffer.byteLength){
        try {
          const packResult = loadMixamoPack(buffer);
          if(packResult){
            this.onModel(packResult.object, packResult.fileName || label);
            const count = Number(packResult.animationCount) || 0;
            if(count > 0){
              this.setStatus(`Loaded Mixamo combination pack with ${count} animation${count === 1 ? '' : 's'}.`);
            }
            return;
          }
        } catch (packError){
          throw packError;
        }
      }
      const extension = label.includes('.') ? label.split('.').pop().toLowerCase() : '';
      if(extension === 'fbx'){
        const object = this.fbxLoader.parse(buffer, './');
        this.onModel(object, label);
        return;
      }
      if(extension === 'glb' || extension === 'gltf'){
        const data = extension === 'gltf'
          ? new TextDecoder().decode(buffer)
          : buffer;
        const gltf = await new Promise((resolve, reject) => {
          this.gltfLoader.parse(data, './', resolve, reject);
        });
        const root = gltf && (gltf.scene || (Array.isArray(gltf.scenes) ? gltf.scenes[0] : null));
        if(!root){
          throw new Error('Invalid GLTF scene.');
        }
        if(Array.isArray(gltf.animations) && gltf.animations.length){
          root.animations = gltf.animations.slice();
        }
        this.onModel(root, label);
        return;
      }
      throw new Error('Unsupported model format. Please load an .fbx, .glb, or .gltf file.');
    }

    onModel(object, name){
      if(!object){
        this.handleError(new Error('Invalid model.'));
        return;
      }
      this.clearModel();
      this.currentRoot = object;
      this.modelLabel = typeof name === 'string' && name ? name : 'Player model';
      object.traverse(node => {
        if(node.isMesh){
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.scene.add(object);
      if(this.placeholder){
        this.placeholder.visible = false;
      }
      this.applyModelScale({ refit: true, emit: false });
      this.setModelOffset({ horizontal: this.modelOffsetHorizontalPx, vertical: this.modelOffsetVerticalPx }, { syncInputs: true, force: true, emit: false });
      this.applyModelOffsetToScene();
      this.mixer = new THREE.AnimationMixer(object);
      this.collectClips(object);
      this.collectMaterials(object);
      const restored = this.tryRestoreConfiguration();
      const autoScaled = restored ? false : this.autoScaleModel({ silent: true });
      if(!restored){
        this.emitModelOffsetChanged();
      }
      const displayName = this.modelLabel || (typeof name === 'string' && name ? name : 'model');
      let statusMessage = `Loaded ${displayName}`;
      if(restored){
        statusMessage += ' and restored saved setup.';
      } else if(autoScaled){
        statusMessage += ' (auto-scaled to match player).';
      }
      this.setStatus(statusMessage);
      this.applyState(this.currentState, this.lastContext, { force: true });
      this.emitModelLoaded();
    }

    fitToObject(object){
      if(!object || !this.camera || !this.controls) return;
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      object.position.sub(center);
      this.modelBasePosition = { x: object.position.x, y: object.position.y, z: object.position.z };
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      if(sphere && Number.isFinite(sphere.radius)){
        this.modelRadius = sphere.radius;
      } else {
        this.modelRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
      }
      this.modelHeight = size.y || this.modelHeight;
      const radius = Math.max(size.x, size.y, size.z) || 1;
      const distance = radius * 1.6 / Math.tan((this.camera.fov * Math.PI / 180) / 2);
      this.camera.position.set(radius * 0.6, Math.max(radius * 0.6, 1.1), distance);
      this.controls.target.set(0, Math.max(0.5, size.y * 0.5), 0);
      this.controls.update();
    }

    collectClips(object){
      this.clipLibrary = [];
      this.clipMap = new Map();
      this.assignmentClipCache.clear();
      const clips = [];
      if(object.animations && object.animations.length){
        clips.push(...object.animations);
      }
      object.traverse(node => {
        if(node.animations && node.animations.length){
          clips.push(...node.animations);
        }
      });
      clips.forEach((clip, index) => {
        if(!clip) return;
        const label = clip.name && clip.name.trim() ? clip.name.trim() : `Clip ${index + 1}`;
        const id = `${index}-${clip.uuid || label}`;
        this.clipLibrary.push({ id, label, clip });
        this.clipMap.set(id, { clip, label });
      });
      for(const [action, select] of Object.entries(this.selects)){
        if(!select) continue;
        const previous = this.getAssignment(action);
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '';
        select.appendChild(placeholder);
        if(!this.clipLibrary.length){
          select.disabled = true;
          select.value = '';
          this.setAssignment(action, { clipId: '' }, { emit: false, reapply: false });
          this.syncActionInputs(action);
          continue;
        }
        select.disabled = false;
        this.clipLibrary.forEach(info => {
          const opt = document.createElement('option');
          opt.value = info.id;
          opt.textContent = info.label;
          select.appendChild(opt);
        });
        if(previous.clipId && this.clipMap.has(previous.clipId)){
          select.value = previous.clipId;
          this.setAssignment(action, { clipId: previous.clipId }, { emit: false, reapply: false, syncInputs: false });
        } else {
          select.value = '';
          this.setAssignment(action, { clipId: '' }, { emit: false, reapply: false, syncInputs: false });
        }
        this.syncActionInputs(action);
      }
      this.emitAssignmentsChanged();
    }

    buildClipCacheKey(clipId, startFrame, endFrame){
      const start = Number.isFinite(startFrame) ? Math.round(startFrame) : '';
      const end = Number.isFinite(endFrame) ? Math.round(endFrame) : '';
      return `${clipId || ''}|${start}|${end}`;
    }

    createTrimmedClip(baseClip, clipId, startFrame, endFrame, fps){
      const utils = THREE && THREE.AnimationUtils ? THREE.AnimationUtils : null;
      if(utils && typeof utils.subclip === 'function'){
        const trimmed = utils.subclip(baseClip, `${clipId}-trim-${startFrame}-${endFrame}`, startFrame, endFrame, fps);
        if(trimmed && typeof trimmed.resetDuration === 'function'){
          trimmed.resetDuration();
        }
        return trimmed;
      }
      if(!this.trimSupportWarned){
        console.warn('Animation trimming unavailable: THREE.AnimationUtils.subclip not found. Falling back to original clip.');
        this.trimSupportWarned = true;
      }
      if(baseClip && typeof baseClip.clone === 'function'){
        const clone = baseClip.clone();
        if(clone && typeof clone.resetDuration === 'function'){
          clone.resetDuration();
        }
        return clone;
      }
      return baseClip;
    }

    estimateClipFps(clip){
      if(!clip || !Array.isArray(clip.tracks) || !clip.tracks.length){
        return 30;
      }
      let minDelta = Infinity;
      let maxTime = Number.isFinite(clip.duration) ? clip.duration : 0;
      clip.tracks.forEach(track => {
        if(!track || !track.times || track.times.length < 2){
          if(track && track.times && track.times.length === 1){
            maxTime = Math.max(maxTime, track.times[0]);
          }
          return;
        }
        const times = track.times;
        maxTime = Math.max(maxTime, times[times.length - 1]);
        for(let i = 1; i < times.length; i += 1){
          const delta = times[i] - times[i - 1];
          if(delta > 0 && delta < minDelta){
            minDelta = delta;
          }
        }
      });
      if(Number.isFinite(minDelta) && minDelta > 0){
        const fps = Math.round(1 / minDelta);
        return Math.min(240, Math.max(1, fps));
      }
      if(Number.isFinite(maxTime) && maxTime > 0){
        const firstTrack = clip.tracks.find(track => track && track.times && track.times.length > 1);
        if(firstTrack){
          const approx = (firstTrack.times.length - 1) / maxTime;
          if(Number.isFinite(approx) && approx > 0){
            return Math.min(240, Math.max(1, Math.round(approx)));
          }
        }
      }
      return 30;
    }

    getProcessedClip(clipId, startFrame, endFrame){
      if(!clipId || !this.clipMap.has(clipId)){
        return null;
      }
      const info = this.clipMap.get(clipId);
      if(!info || !info.clip){
        return null;
      }
      const baseClip = info.clip;
      const hasStart = Number.isFinite(startFrame);
      const hasEnd = Number.isFinite(endFrame);
      if(!hasStart && !hasEnd){
        return baseClip;
      }
      const fps = this.estimateClipFps(baseClip);
      let maxTime = Number.isFinite(baseClip.duration) ? baseClip.duration : 0;
      baseClip.tracks.forEach(track => {
        if(track && track.times && track.times.length){
          maxTime = Math.max(maxTime, track.times[track.times.length - 1]);
        }
      });
      const maxFrame = Math.max(1, Math.round(maxTime * fps));
      let start = hasStart ? Math.max(0, Math.round(startFrame)) : 0;
      if(start >= maxFrame){
        start = Math.max(0, maxFrame - 1);
      }
      let end = hasEnd ? Math.max(0, Math.round(endFrame)) : maxFrame;
      if(end > maxFrame){
        end = maxFrame;
      }
      if(end <= start){
        end = Math.min(maxFrame, start + 1);
      }
      if(end <= start){
        end = start + 1;
      }
      const key = this.buildClipCacheKey(clipId, start, end);
      if(this.assignmentClipCache.has(key)){
        return this.assignmentClipCache.get(key);
      }
      const trimmed = this.createTrimmedClip(baseClip, clipId, start, end, fps);
      this.assignmentClipCache.set(key, trimmed);
      return trimmed;
    }

    getAssignmentDetails(action){
      const assignment = this.getAssignment(action);
      const clipId = assignment.clipId;
      if(!clipId || !this.clipMap.has(clipId)){
        return {
          clip: null,
          clipId: '',
          clipKey: '',
          speed: assignment.speed,
          startFrame: assignment.startFrame,
          endFrame: assignment.endFrame,
          label: ''
        };
      }
      const hasStart = Number.isFinite(assignment.startFrame);
      const hasEnd = Number.isFinite(assignment.endFrame);
      const clip = this.getProcessedClip(clipId, assignment.startFrame, assignment.endFrame);
      const clipKey = this.buildClipCacheKey(clipId, hasStart ? Math.round(assignment.startFrame) : null, hasEnd ? Math.round(assignment.endFrame) : null);
      const info = this.clipMap.get(clipId) || {};
      return {
        clip,
        clipId,
        clipKey,
        speed: assignment.speed,
        startFrame: assignment.startFrame,
        endFrame: assignment.endFrame,
        label: info.label || ''
      };
    }

    collectMaterials(object){
      const map = new Map();
      object.traverse(node => {
        if(!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(mat => {
          if(!mat || !mat.color || typeof mat.color.getHexString !== 'function') return;
          if(!map.has(mat.uuid)){
            map.set(mat.uuid, { material: mat, name: mat.name || node.name || 'Material', uses: 0 });
          }
          const entry = map.get(mat.uuid);
          entry.uses += 1;
        });
      });
      this.materialEntries = Array.from(map.values());
      this.renderMaterials();
    }

    renderMaterials(){
      if(!this.materialsEl) return;
      this.materialsEl.innerHTML = '';
      if(!this.materialEntries.length){
        const empty = document.createElement('div');
        empty.className = 'playerAnimationStatus';
        empty.textContent = 'No color-editable materials found.';
        this.materialsEl.appendChild(empty);
        return;
      }
      this.materialEntries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.materialEntries.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'playerAnimationMat';
        const label = document.createElement('label');
        label.textContent = `${entry.name} (${entry.uses})`;
        const picker = document.createElement('input');
        picker.type = 'color';
        try {
          picker.value = `#${entry.material.color.getHexString()}`;
        } catch {
          picker.value = '#000000';
        }
        picker.addEventListener('input', ()=>{
          try {
            entry.material.color.set(picker.value);
            entry.material.needsUpdate = true;
            this.setStatus(`Material "${entry.name}"  ${picker.value}`);
            this.emitMaterialsUpdated();
          } catch(err){
            console.warn('Failed to update material color', err);
          }
        });
        row.appendChild(label);
        row.appendChild(picker);
        this.materialsEl.appendChild(row);
      });
    }

    handleError(err){
      console.error(err);
      const detail = err && typeof err.message === 'string' && err.message
        ? `: ${err.message}`
        : '.';
      this.setStatus(`Failed to load model${detail}`);
    }

    clearModel(){
      if(this.currentRoot){
        this.scene.remove(this.currentRoot);
        this.currentRoot.traverse(node => {
          if(node.isMesh){
            if(node.geometry && typeof node.geometry.dispose === 'function'){
              node.geometry.dispose();
            }
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach(mat => {
              if(mat && typeof mat.dispose === 'function'){
                mat.dispose();
              }
            });
          }
        });
      }
      this.currentRoot = null;
      if(this.mixer){
        this.mixer.stopAllAction();
      }
      this.mixer = null;
      this.currentAction = null;
      this.currentClipKey = null;
      this.modelRadius = 0;
      this.modelHeight = 0;
      this.modelBasePosition = { x: 0, y: 0, z: 0 };
      this.clipLibrary = [];
      this.clipMap = new Map();
      this.assignmentClipCache.clear();
      this.materialEntries = [];
      if(this.materialsEl){
        this.materialsEl.innerHTML = '';
      }
      for(const [action, select] of Object.entries(this.selects)){
        if(!select) continue;
        select.innerHTML = '<option value=""></option>';
        select.disabled = true;
        this.assignments[action] = this.createDefaultAssignment();
        this.syncActionInputs(action);
      }
      this.setModelScale(1, { force: true });
      this.currentState = 'idle';
      this.lastContext = {};
      if(this.placeholder){
        this.placeholder.visible = true;
        if(this.placeholderBasePosition){
          this.placeholder.position.set(
            this.placeholderBasePosition.x,
            this.placeholderBasePosition.y,
            this.placeholderBasePosition.z
          );
        }
      }
      this.applyModelOffsetToScene();
      this.emitAssignmentsChanged();
      this.emitModelCleared();
      this.modelLabel = '';
      this.lastAppliedSignature = null;
    }

    setStatus(message){
      if(this.statusEl){
        this.statusEl.textContent = message;
      }
    }

    setState(state, context = {}){
      this.currentState = state;
      this.lastContext = context || {};
      if(!this.mixer){
        return;
      }
      const details = this.getAssignmentDetails(state);
      const clip = details && details.clip;
      if(!clip){
        if(this.currentAction){
          this.currentAction.stop();
          this.currentAction = null;
          this.currentClipKey = null;
        }
        return;
      }
      const clipKey = details && details.clipKey ? details.clipKey : (details && details.clipId ? details.clipId : '');
      if(this.currentClipKey !== clipKey){
        if(this.currentAction){
          this.currentAction.stop();
        }
        const action = this.mixer.clipAction(clip);
        if(state === 'death'){
          action.setLoop(THREE.LoopOnce, 0);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
        }
        action.reset();
        action.play();
        this.currentAction = action;
        this.currentClipKey = clipKey;
      }
      const assignmentSpeed = details && Number.isFinite(details.speed) ? details.speed : 1;
      const contextSpeed = typeof context.speedFactor === 'number' && Number.isFinite(context.speedFactor) ? context.speedFactor : 1;
      const speedFactor = Math.max(0, assignmentSpeed) * contextSpeed;
      if(this.currentAction){
        this.currentAction.setEffectiveTimeScale(Math.max(0.001, speedFactor));
      }
    }

    applyState(state, context = {}, { force = false } = {}){
      if(force && this.currentAction){
        this.currentAction.stop();
        this.currentAction = null;
        this.currentClipKey = null;
      }
      this.setState(state, context);
    }

    emitModelLoaded(){
      if(typeof this.onModelLoaded === 'function'){
        try { this.onModelLoaded(this); } catch (err) { console.error(err); }
      }
    }

    emitModelCleared(){
      if(typeof this.onModelCleared === 'function'){
        try { this.onModelCleared(this); } catch (err) { console.error(err); }
      }
    }

    emitAssignmentsChanged(){
      if(typeof this.onAssignmentsChanged === 'function'){
        try { this.onAssignmentsChanged(this); } catch (err) { console.error(err); }
      }
    }

    emitMaterialsUpdated(){
      if(typeof this.onMaterialsUpdated === 'function'){
        try { this.onMaterialsUpdated(this); } catch (err) { console.error(err); }
      }
    }

    emitModelScaleChanged(){
      if(typeof this.onModelScaleChanged === 'function'){
        try { this.onModelScaleChanged(this); } catch (err) { console.error(err); }
      }
    }

    emitModelOffsetChanged(){
      if(typeof this.onModelOffsetChanged === 'function'){
        try { this.onModelOffsetChanged(this); } catch (err) { console.error(err); }
      }
    }

    getTargetPlayerRadius(){
      if(typeof playerRuntime.model !== 'undefined' && playerRuntime.model && Number.isFinite(playerRuntime.model.playerRadius) && playerRuntime.model.playerRadius > 0){
        return playerRuntime.model.playerRadius;
      }
      if(typeof player !== 'undefined' && player && Number.isFinite(player.r) && player.r > 0){
        return player.r;
      }
      return 10;
    }

    getModelSignature(){
      const base = normalizeLabel(this.modelLabel);
      const clipSignature = this.clipLibrary
        .map(info => normalizeLabel(info && info.label))
        .filter(Boolean)
        .sort()
        .join('|');
      const materialSignature = this.materialEntries
        .map(entry => normalizeLabel(entry && entry.name))
        .filter(Boolean)
        .sort()
        .join('|');
      return `${base}::${clipSignature}::${materialSignature}`;
    }

    buildConfigurationSnapshot(){
      if(!this.hasModel()){
        return null;
      }
      const assignments = {};
      for(const action of PLAYER_ANIMATION_ACTIONS){
        const assignment = this.getAssignment(action);
        const id = assignment.clipId || '';
        if(!id){
          continue;
        }
        const info = this.clipMap.get(id);
        assignments[action] = {
          clipId: id,
          clipLabel: info && info.label ? info.label : '',
          speed: assignment.speed,
          startFrame: assignment.startFrame,
          endFrame: assignment.endFrame
        };
      }
      const materials = this.materialEntries.map(entry => {
        let color = null;
        if(entry && entry.material && entry.material.color && typeof entry.material.color.getHexString === 'function'){
          try {
            color = `#${entry.material.color.getHexString()}`;
          } catch (err){
            color = null;
          }
        }
        return {
          name: entry && entry.name ? entry.name : '',
          color
        };
      });
      const snapshot = {
        version: 1,
        savedAt: new Date().toISOString(),
        modelLabel: this.modelLabel || '',
        signature: this.getModelSignature(),
        scale: this.modelScale,
        offset: {
          horizontal: this.modelOffsetHorizontalPx,
          vertical: this.modelOffsetVerticalPx
        },
        lightAzimuthDegrees: this.lightAzimuthDegrees,
        assignments,
        clipLibrary: this.clipLibrary.map(info => ({
          id: info && info.id ? info.id : '',
          label: info && info.label ? info.label : ''
        })),
        materials
      };
      return snapshot;
    }

    downloadConfigurationSnapshot(snapshot){
      if(!snapshot){
        return false;
      }
      try {
        const json = JSON.stringify(snapshot, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = formatPlayerAnimationConfigFilename(this.modelLabel);
        const parent = document.body || document.documentElement;
        if(parent){
          parent.appendChild(link);
          link.click();
          parent.removeChild(link);
        } else {
          link.click();
        }
        setTimeout(()=> URL.revokeObjectURL(url), 0);
        return true;
      } catch (err){
        console.error('Failed to export animation setup', err);
        return false;
      }
    }

    persistConfigurationSnapshot(signature, snapshot){
      if(!signature || !snapshot){
        return false;
      }
      const stored = loadPlayerAnimationConfigurations();
      stored[signature] = snapshot;
      const success = savePlayerAnimationConfigurations(stored);
      if(success){
        this.lastSavedSignature = signature;
      }
      return success;
    }

    saveConfiguration({ download = true } = {}){
      if(!this.hasModel()){
        this.setStatus('Load a model before saving the animation setup.');
        return false;
      }
      const snapshot = this.buildConfigurationSnapshot();
      if(!snapshot){
        this.setStatus('Nothing to save yet.');
        return false;
      }
      const signature = snapshot.signature || this.getModelSignature();
      this.persistConfigurationSnapshot(signature, snapshot);
      if(download){
        this.downloadConfigurationSnapshot(snapshot);
      }
      this.setStatus('Saved player animation setup.');
      return true;
    }

    applyConfigurationSnapshot(snapshot, { silent = false } = {}){
      if(!snapshot || !this.hasModel()){
        return false;
      }
      let applied = false;
      const scale = Number(snapshot.scale);
      if(Number.isFinite(scale) && scale > 0){
        this.setModelScale(scale, { force: true });
        this.applyModelScale({ refit: true, emit: true });
        applied = true;
      }
      const offsetSource = snapshot.offset || snapshot.offsets || snapshot.modelOffset || {};
      const horizontal = Number(offsetSource.horizontal ?? offsetSource.x ?? snapshot.modelOffsetHorizontalPx);
      const vertical = Number(offsetSource.vertical ?? offsetSource.y ?? snapshot.modelOffsetVerticalPx);
      if(Number.isFinite(horizontal) || Number.isFinite(vertical)){
        this.setModelOffset({
          horizontal: Number.isFinite(horizontal) ? horizontal : this.modelOffsetHorizontalPx,
          vertical: Number.isFinite(vertical) ? vertical : this.modelOffsetVerticalPx
        }, { syncInputs: true, force: true, emit: true });
        applied = true;
      }
      const light = Number(snapshot.lightAzimuthDegrees);
      if(Number.isFinite(light)){
        this.setLightAzimuth(light, { syncInputs: true, force: true });
        applied = true;
      }
      if(snapshot.assignments && typeof snapshot.assignments === 'object'){
        const idMap = new Map();
        const labelMap = new Map();
        this.clipLibrary.forEach(info => {
          if(!info) return;
          if(info.id){
            idMap.set(info.id, info.id);
          }
          if(info.label){
            const key = normalizeLabel(info.label);
            if(key && !labelMap.has(key)){
              labelMap.set(key, info.id);
            }
          }
        });
        let assignmentChanged = false;
        for(const action of PLAYER_ANIMATION_ACTIONS){
          const entry = snapshot.assignments[action];
          let targetId = '';
          let desiredSpeed;
          let desiredStart;
          let desiredEnd;
          if(entry){
            if(typeof entry === 'string'){
              targetId = labelMap.get(normalizeLabel(entry)) || '';
            } else if(typeof entry === 'object'){
              if(entry.clipId && idMap.has(entry.clipId)){
                targetId = entry.clipId;
              } else if(entry.clipLabel){
                targetId = labelMap.get(normalizeLabel(entry.clipLabel)) || '';
              }
              if('speed' in entry){
                desiredSpeed = entry.speed;
              }
              if('startFrame' in entry){
                desiredStart = entry.startFrame;
              }
              if('endFrame' in entry){
                desiredEnd = entry.endFrame;
              }
            }
          }
          const updates = { clipId: targetId };
          if(desiredSpeed !== undefined){
            updates.speed = desiredSpeed;
          }
          if(desiredStart !== undefined){
            updates.startFrame = desiredStart;
          }
          if(desiredEnd !== undefined){
            updates.endFrame = desiredEnd;
          }
          const changed = this.setAssignment(action, updates, { emit: false, reapply: false });
          const select = this.selects[action];
          if(select){
            select.disabled = !this.clipLibrary.length;
            select.value = targetId || '';
          }
          this.syncActionInputs(action);
          if(changed){
            assignmentChanged = true;
          }
        }
        if(assignmentChanged){
          this.applyState(this.currentState, this.lastContext, { force: true });
        }
        this.emitAssignmentsChanged();
        applied = assignmentChanged || applied;
      }
      if(Array.isArray(snapshot.materials) && snapshot.materials.length){
        const materialMap = new Map();
        this.materialEntries.forEach(entry => {
          const key = normalizeLabel(entry && entry.name);
          if(key && !materialMap.has(key)){
            materialMap.set(key, entry);
          }
        });
        let materialsApplied = false;
        snapshot.materials.forEach(item => {
          if(!item) return;
          const nameKey = normalizeLabel(item.name || item.label);
          const colorValue = typeof item.color === 'string' ? item.color : (typeof item.hex === 'string' ? item.hex : null);
          if(!nameKey || !colorValue) return;
          const entry = materialMap.get(nameKey);
          if(entry && entry.material && entry.material.color){
            try {
              entry.material.color.set(colorValue);
              entry.material.needsUpdate = true;
              materialsApplied = true;
            } catch (err){
              console.warn('Failed to restore material color', err);
            }
          }
        });
        if(materialsApplied){
          this.renderMaterials();
          this.emitMaterialsUpdated();
          applied = true;
        }
      }
      if(!silent){
        this.setStatus('Restored saved animation setup.');
      }
      this.lastAppliedSignature = snapshot.signature || this.getModelSignature();
      return applied;
    }

    tryRestoreConfiguration(){
      const signature = this.getModelSignature();
      if(!signature){
        return false;
      }
      const stored = loadPlayerAnimationConfigurations();
      const snapshot = stored[signature];
      if(snapshot){
        return this.applyConfigurationSnapshot(snapshot, { silent: true });
      }
      return false;
    }

    autoScaleModel({ silent = false } = {}){
      if(!this.currentRoot){
        return false;
      }
      const targetRadius = this.getTargetPlayerRadius();
      const baseScale = Math.max(this.modelScale || 1, 0.0001);
      const baseRadius = this.modelRadius / baseScale;
      if(!(targetRadius > 0) || !(baseRadius > 0)){
        return false;
      }
      const recommended = targetRadius / baseRadius;
      if(!Number.isFinite(recommended) || recommended <= 0){
        return false;
      }
      this.setModelScale(recommended, { force: true });
      this.applyModelScale({ refit: true, emit: true });
      if(!silent){
        this.setStatus(`Auto-scaled model to ${recommended.toFixed(2)} to match player.`);
      }
      return true;
    }

    getAssignmentsSnapshot(){
      const snapshot = {};
      for(const action of PLAYER_ANIMATION_ACTIONS){
        snapshot[action] = this.getAssignment(action);
      }
      return snapshot;
    }

    getClipForAction(action){
      if(!action || !this.clipMap){
        return null;
      }
      const details = this.getAssignmentDetails(action);
      return details ? details.clip : null;
    }

    createRuntimeClone(){
      if(!this.currentRoot){
        return null;
      }
      const clone = cloneSkinnedModel(this.currentRoot);
      if(!clone){
        return null;
      }
      const scale = Math.max(0.01, this.modelScale || 1);
      clone.scale.setScalar(scale);
      clone.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(clone);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      clone.position.sub(center);
      box.setFromObject(clone);
      if(Number.isFinite(box.min.y)){
        clone.position.y -= box.min.y;
      }
      clone.traverse(node => {
        if(node.isMesh){
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      return clone;
    }

    hasModel(){
      return !!this.currentRoot;
    }
  }

  class PlayerModelRuntime {
    constructor({ anchor, canvas } = {}){
      this.anchor = anchor || null;
      this.canvas = canvas || null;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.clock = null;
      this.ground = null;
      this.mixer = null;
      this.modelRoot = null;
      this.currentAction = null;
      this.currentClip = null;
      this.currentState = 'idle';
      this.lastContext = {};
      this.controller = null;
      this.playerRadius = 10;
      this.lastSizePx = 0;
      this.visible = false;
      this.assignments = {};
      this.modelRadius = 0;
      this.modelHeight = 0;
      this.modelScale = 1;
      this.facingRadians = 0;
      this.modelBasePosition = { x: 0, y: 0, z: 0 };
      this.modelOffsetHorizontalPx = 0;
      this.modelOffsetVerticalPx = 0;
      this.init();
      this.applyAnchorOffset();
    }

    init(){
      if(!this.canvas){
        return;
      }
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.scene = new THREE.Scene();
      this.scene.background = null;
      this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
      this.camera.position.set(0, 1.35, 3.2);
      this.clock = new THREE.Clock();
      const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.85);
      this.scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 1.1);
      dir.position.set(2.6, 4.2, 2.4);
      dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024);
      this.scene.add(dir);
      const groundGeo = new THREE.CircleGeometry(3.2, 48);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x0f1a2a, transparent: true, opacity: 0.0 });
      this.ground = new THREE.Mesh(groundGeo, groundMat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.receiveShadow = true;
      this.scene.add(this.ground);
      this.updateRendererSize(true);
      if(this.anchor){
        this.anchor.dataset.active = 'false';
      }
      window.addEventListener('resize', ()=> this.updateRendererSize());
    }

    updateRendererSize(force = false){
      if(!this.renderer || !this.canvas){
        return;
      }
      const radius = Math.max(1, Number(this.playerRadius) || 1);
      const modelTarget = this.modelRadius > 0 ? this.modelRadius * 28 : 0;
      const target = Math.max(80, radius * 12, modelTarget);
      if(!force && Math.abs(target - this.lastSizePx) < 0.5){
        return;
      }
      this.lastSizePx = target;
      const size = Math.round(target);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(size, size, false);
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
      if(this.anchor){
        this.anchor.style.width = `${size}px`;
        this.anchor.style.height = `${size}px`;
      }
      if(this.camera){
        this.camera.aspect = 1;
        this.camera.updateProjectionMatrix();
      }
    }

    setPlayerRadius(radius){
      const numeric = Math.max(0, Number(radius) || 0);
      if(numeric === this.playerRadius){
        return;
      }
      this.playerRadius = numeric;
      this.updateRendererSize();
    }

    clampModelOffsetPx(value){
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return 0;
      }
      return Math.max(PLAYER_MODEL_OFFSET_MIN, Math.min(PLAYER_MODEL_OFFSET_MAX, numeric));
    }

    setModelOffsets(horizontal, vertical, { force = false } = {}){
      let changed = false;
      if(horizontal !== undefined && horizontal !== null){
        const clamped = this.clampModelOffsetPx(horizontal);
        if(force || Math.abs(clamped - this.modelOffsetHorizontalPx) > 0.0001){
          this.modelOffsetHorizontalPx = clamped;
          changed = true;
        }
      }
      if(vertical !== undefined && vertical !== null){
        const clamped = this.clampModelOffsetPx(vertical);
        if(force || Math.abs(clamped - this.modelOffsetVerticalPx) > 0.0001){
          this.modelOffsetVerticalPx = clamped;
          changed = true;
        }
      }
      if(changed || force){
        this.applyAnchorOffset();
      }
    }

    applyAnchorOffset(){
      if(!this.anchor){
        return;
      }
      const offsetX = Math.round(this.modelOffsetHorizontalPx);
      const offsetY = Math.round(this.modelOffsetVerticalPx);
      const baseTransform = 'translate(-50%, -100%)';
      this.anchor.style.transform = `${baseTransform} translate(${offsetX}px, ${offsetY}px)`;
      this.anchor.dataset.offsetX = `${offsetX}`;
      this.anchor.dataset.offsetY = `${offsetY}`;
    }

    updateOffsetFromController({ force = false } = {}){
      if(!this.controller || typeof this.controller.getModelOffset !== 'function'){
        return;
      }
      const offsets = this.controller.getModelOffset();
      if(!offsets){
        return;
      }
      this.setModelOffsets(offsets.horizontal, offsets.vertical, { force });
    }

    setPosition(x, y, radius = null){
      if(Number.isFinite(radius)){
        this.setPlayerRadius(radius);
      }
      if(!this.anchor){
        return;
      }
      const px = Number.isFinite(x) ? x : 0;
      const py = Number.isFinite(y) ? y : 0;
      this.anchor.style.left = `${px}px`;
      this.anchor.style.top = `${py}px`;
    }

    attachController(controller){
      this.controller = controller || null;
      this.refreshModel();
      this.updateAssignmentsFromController();
      this.updateOffsetFromController({ force: true });
    }

    refreshModel(){
      if(!this.controller || !this.controller.hasModel()){
        this.clearModel();
        return;
      }
      const scale = this.controller && typeof this.controller.getModelScale === 'function'
        ? this.controller.getModelScale()
        : 1;
      if(Number.isFinite(scale) && scale > 0){
        this.modelScale = scale;
      }
      const clone = this.controller.createRuntimeClone();
      if(!clone){
        this.clearModel();
        return;
      }
      this.setModel(clone);
      this.updateOffsetFromController({ force: true });
    }

    disposeModel(root){
      // Runtime clones share buffers with the editor preview; avoid disposing to keep materials intact.
      void root;
    }

    setModel(root){
      if(this.modelRoot){
        this.scene.remove(this.modelRoot);
        this.disposeModel(this.modelRoot);
      }
      this.modelRoot = root;
      if(!root){
        if(this.mixer){
          this.mixer.stopAllAction();
        }
        this.mixer = null;
        this.currentAction = null;
        this.currentClip = null;
        this.visible = false;
        this.modelRadius = 0;
        this.modelHeight = 0;
        if(this.anchor){
          this.anchor.dataset.active = 'false';
        }
        return;
      }
      if(root && Number.isFinite(this.modelScale)){
        root.scale.setScalar(this.modelScale);
        root.updateMatrixWorld(true);
      }
      this.scene.add(root);
      root.rotation.y = 0;
      this.frameModel();
      this.setFacingRadians(this.facingRadians);
      this.mixer = new THREE.AnimationMixer(root);
      this.currentAction = null;
      this.currentClip = null;
      this.visible = true;
      if(this.anchor){
        this.anchor.dataset.active = 'true';
      }
      this.updateRendererSize(true);
      this.applyState(this.currentState, this.lastContext, { force: true });
    }

    clearModel(){
      if(this.modelRoot){
        this.scene.remove(this.modelRoot);
        this.disposeModel(this.modelRoot);
        this.modelRoot = null;
      }
      if(this.mixer){
        this.mixer.stopAllAction();
      }
      this.mixer = null;
      this.currentAction = null;
      this.currentClip = null;
      this.visible = false;
      this.modelRadius = 0;
      this.modelHeight = 0;
      this.modelBasePosition = { x: 0, y: 0, z: 0 };
      if(this.anchor){
        this.anchor.dataset.active = 'false';
      }
    }

    updateAssignmentsFromController(){
      if(!this.controller){
        this.assignments = {};
        return;
      }
      this.assignments = this.controller.getAssignmentsSnapshot();
      this.updateScaleFromController();
      this.updateOffsetFromController({ force: true });
      this.applyState(this.currentState, this.lastContext, { force: true });
    }

    updateScaleFromController({ force = false } = {}){
      if(!this.controller){
        return;
      }
      const scale = typeof this.controller.getModelScale === 'function'
        ? this.controller.getModelScale()
        : 1;
      if(!Number.isFinite(scale) || scale <= 0){
        return;
      }
      const changed = force || Math.abs(scale - this.modelScale) > 0.0001;
      this.modelScale = scale;
      if(changed && this.modelRoot){
        this.modelRoot.scale.setScalar(this.modelScale);
        this.modelRoot.updateMatrixWorld(true);
        this.frameModel();
        this.updateRendererSize(true);
        this.updateOffsetFromController({ force: true });
      }
    }

    setState(state, context = {}){
      this.applyState(state, context);
    }

    applyState(state, context = {}, { force = false } = {}){
      this.currentState = state;
      this.lastContext = context || {};
      if(force && this.currentAction){
        this.currentAction.stop();
        this.currentAction = null;
        this.currentClip = null;
      }
      if(!this.mixer || !this.controller){
        return;
      }
      const details = typeof this.controller.getAssignmentDetails === 'function'
        ? this.controller.getAssignmentDetails(state)
        : null;
      const clip = details && details.clip ? details.clip : null;
      if(!clip){
        if(this.currentAction){
          this.currentAction.stop();
          this.currentAction = null;
          this.currentClip = null;
        }
        return;
      }
      if(force || this.currentClip !== clip){
        if(this.currentAction){
          this.currentAction.stop();
        }
        const action = this.mixer.clipAction(clip);
        if(state === 'death'){
          action.setLoop(THREE.LoopOnce, 0);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
        }
        action.reset();
        action.play();
        this.currentAction = action;
        this.currentClip = clip;
      }
      const assignmentSpeed = details && Number.isFinite(details.speed) ? details.speed : 1;
      const contextSpeed = typeof context.speedFactor === 'number' && Number.isFinite(context.speedFactor) ? context.speedFactor : 1;
      const speedFactor = Math.max(0, assignmentSpeed) * contextSpeed;
      if(this.currentAction){
        this.currentAction.setEffectiveTimeScale(Math.max(0.001, speedFactor));
      }
      const facing = Number.isFinite(context.facingRadians) ? context.facingRadians : this.facingRadians;
      if(Number.isFinite(facing)){
        this.setFacingRadians(facing);
      }
    }

    update(dt = 0){
      if(!this.visible || !this.renderer){
        return;
      }
      const delta = Number.isFinite(dt) && dt > 0 ? dt : (this.clock ? this.clock.getDelta() : 0);
      if(this.mixer && delta >= 0){
        this.mixer.update(delta);
      }
      this.renderer.render(this.scene, this.camera);
    }

    refreshMaterials(){
      this.refreshModel();
    }

    isActive(){
      return this.visible && !!this.modelRoot;
    }

    setFacingRadians(angle){
      if(!Number.isFinite(angle)){
        return;
      }
      this.facingRadians = angle;
      if(this.modelRoot){
        this.modelRoot.rotation.y = angle;
        this.modelRoot.updateMatrixWorld(true);
      }
    }

    frameModel(){
      if(!this.modelRoot || !this.camera){
        return;
      }
      const initialBox = new THREE.Box3().setFromObject(this.modelRoot);
      if(!Number.isFinite(initialBox.min.x) || !Number.isFinite(initialBox.max.x)){
        return;
      }
      const centerOffset = new THREE.Vector3(
        (initialBox.min.x + initialBox.max.x) * 0.5,
        0,
        (initialBox.min.z + initialBox.max.z) * 0.5
      );
      this.modelRoot.position.sub(centerOffset);
      this.modelRoot.updateMatrixWorld(true);

      const groundedBox = new THREE.Box3().setFromObject(this.modelRoot);
      if(Number.isFinite(groundedBox.min.y)){
        this.modelRoot.position.y -= groundedBox.min.y;
        this.modelRoot.updateMatrixWorld(true);
      }

      const finalBox = new THREE.Box3().setFromObject(this.modelRoot);
      const size = new THREE.Vector3();
      finalBox.getSize(size);
      const height = size.y || 1;
      const sphere = finalBox.getBoundingSphere(new THREE.Sphere());
      const radius = sphere && Number.isFinite(sphere.radius) && sphere.radius > 0
        ? sphere.radius
        : Math.max(size.length() / Math.sqrt(3), 1);

      this.modelRadius = radius;
      this.modelHeight = height;
      this.modelBasePosition = {
        x: this.modelRoot.position.x,
        y: this.modelRoot.position.y,
        z: this.modelRoot.position.z
      };
      this.applyAnchorOffset();

      const viewSize = Math.max(height, radius * 2);
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
      const distance = (viewSize * 0.5) / Math.tan(halfFov);
      const finalDistance = distance * 1.2;

      this.camera.position.set(0, height * 0.55 + radius * 0.1, finalDistance);
      this.camera.near = Math.max(0.05, finalDistance / 20);
      this.camera.far = Math.max(10, finalDistance * 4 + radius * 2);
      this.camera.lookAt(0, Math.max(0.4, height * 0.5), 0);
      this.camera.updateProjectionMatrix();

      if(this.ground){
        const groundScale = Math.max(1.5, radius * 1.4);
        this.ground.scale.set(groundScale, groundScale, 1);
        this.ground.position.set(0, 0, 0);
      }
    }
  }

  if(playerAnimationCanvas && playerAnimationStage){
    playerRuntime.animationController = new PlayerAnimationController({
      canvas: playerAnimationCanvas,
      stage: playerAnimationStage,
      dropEl: playerAnimationDrop,
      statusEl: playerAnimationStatus,
      materialsEl: playerAnimationMaterialsEl,
      selects: playerAnimationActionSelects,
      actionInputs: playerAnimationActionInputs,
      scaleRange: playerAnimationScaleRange,
      scaleInput: playerAnimationScaleInput,
      offsetHorizontalInput: playerAnimationOffsetHorizontalInput,
      offsetVerticalInput: playerAnimationOffsetVerticalInput,
      lightAngleRange: playerAnimationLightAngleRange,
      lightAngleInput: playerAnimationLightAngleInput
    });
    playerRuntime.animationController.setStatus('No player model loaded.');
  }

  if(playerModelAnchor && playerModelCanvas){
    playerRuntime.model = new PlayerModelRuntime({
      anchor: playerModelAnchor,
      canvas: playerModelCanvas
    });
  }

  function updatePlayerAnimationSaveState(){
    if(!btnPlayerAnimationSave && !btnPlayerAnimationLoadSetup){
      return;
    }
    const canSave = !!(playerRuntime.animationController && typeof playerRuntime.animationController.hasModel === 'function' && playerRuntime.animationController.hasModel());
    if(btnPlayerAnimationSave){
      btnPlayerAnimationSave.disabled = !canSave;
    }
    if(btnPlayerAnimationLoadSetup){
      btnPlayerAnimationLoadSetup.disabled = !canSave;
    }
  }

  function sanitizeFileStem(filename){
    if(typeof filename !== 'string' || !filename){
      return 'mixamo_character';
    }
    const stem = filename.replace(/\.[^/.]+$/, '');
    const normalized = typeof stem.normalize === 'function'
      ? stem.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      : stem;
    const sanitized = normalized.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return sanitized || 'mixamo_character';
  }

  function sanitizeClipLabel(label){
    if(typeof label !== 'string' || !label){
      return 'clip';
    }
    const normalized = typeof label.normalize === 'function'
      ? label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      : label;
    const sanitized = normalized.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return sanitized || 'clip';
  }

  function extractAnimationsFromObject(object){
    const clips = [];
    const seen = new Set();
    if(!object){
      return clips;
    }
    if(Array.isArray(object.animations)){
      object.animations.forEach(clip => {
        if(clip && !seen.has(clip)){
          clips.push(clip);
          seen.add(clip);
        }
      });
    }
    if(typeof object.traverse === 'function'){
      object.traverse(child => {
        if(child === object){
          return;
        }
        if(Array.isArray(child.animations)){
          child.animations.forEach(clip => {
            if(clip && !seen.has(clip)){
              clips.push(clip);
              seen.add(clip);
            }
          });
        }
      });
    }
    return clips;
  }

  function arrayBufferToBase64(buffer){
    if(!buffer || buffer.byteLength === 0){
      return '';
    }
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for(let i = 0; i < bytes.length; i += chunkSize){
      const chunk = bytes.subarray(i, i + chunkSize);
      let chunkString = '';
      for(let j = 0; j < chunk.length; j++){
        chunkString += String.fromCharCode(chunk[j]);
      }
      binary += chunkString;
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64){
    if(typeof base64 !== 'string' || !base64){
      return new ArrayBuffer(0);
    }
    const normalized = base64.replace(/[^A-Za-z0-9+/=]+/g, '');
    const binary = atob(normalized);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for(let i = 0; i < length; i++){
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function createUniqueClipName(fileName, variantIndex, variantCount, existingNames, preferredName){
    const stem = sanitizeFileStem(fileName);
    const preferred = typeof preferredName === 'string' && preferredName.trim() ? preferredName.trim() : null;
    const baseLabel = preferred ? preferred : (variantCount > 1 ? `${stem}_${variantIndex + 1}` : stem);
    const sanitized = sanitizeClipLabel(baseLabel);
    let candidate = sanitized;
    if(existingNames.has(candidate)){
      let suffix = 2;
      while(existingNames.has(`${candidate}_${suffix}`)){
        suffix += 1;
      }
      candidate = `${candidate}_${suffix}`;
    }
    existingNames.add(candidate);
    return candidate;
  }

  function combineMixamoBuffers(baseBuffer, baseName, animationSources){
    if(!baseBuffer){
      throw new Error('Select a Mixamo character in T-pose first.');
    }
    const baseLoader = new FBXLoader();
    const baseObject = baseLoader.parse(baseBuffer, './');
    if(!baseObject){
      throw new Error('Unable to parse Mixamo character .fbx file.');
    }
    const combinedClips = extractAnimationsFromObject(baseObject).map(clip => (clip && typeof clip.clone === 'function') ? clip.clone() : clip).filter(Boolean);
    const existingNames = new Set(combinedClips.map(clip => (clip && typeof clip.name === 'string') ? clip.name : '').filter(name => !!name));
    const animationLoader = new FBXLoader();
    let importedCount = 0;
    const metadata = [];
    for(const source of animationSources){
      const entry = {
        fileName: source && typeof source.fileName === 'string' ? source.fileName : 'animation.fbx',
        clipNames: []
      };
      metadata.push(entry);
      if(!source || !source.buffer){
        continue;
      }
      const animObject = animationLoader.parse(source.buffer, './');
      const clips = extractAnimationsFromObject(animObject);
      if(!clips.length){
        console.warn('No animation clips found in Mixamo file:', entry.fileName);
        continue;
      }
      clips.forEach((clip, index) => {
        if(!clip){
          return;
        }
        const renamed = typeof clip.clone === 'function' ? clip.clone() : clip;
        const preferred = source && Array.isArray(source.preferredNames) ? source.preferredNames[index] : null;
        renamed.name = createUniqueClipName(entry.fileName, index, clips.length, existingNames, preferred);
        entry.clipNames.push(renamed.name);
        combinedClips.push(renamed);
        importedCount += 1;
      });
    }
    if(importedCount === 0){
      throw new Error('No animations were imported from the selected files.');
    }
    baseObject.animations = combinedClips;
    const clipNames = combinedClips.map(clip => (clip && typeof clip.name === 'string') ? clip.name : '').filter(name => !!name);
    return {
      baseObject,
      animationCount: importedCount,
      clipNames,
      metadata,
      baseName: typeof baseName === 'string' && baseName ? baseName : 'mixamo_character'
    };
  }

  function isLikelyMixamoPack(buffer){
    if(!buffer || buffer.byteLength < 2){
      return false;
    }
    const view = new Uint8Array(buffer, 0, 1);
    const first = view[0];
    return first === 123 || first === 91; // '{' or '['
  }

  function parseMixamoPackBuffer(buffer){
    const text = new TextDecoder().decode(buffer);
    const data = JSON.parse(text);
    if(!data || data.format !== 'MakaMobaMixamoPack'){
      return null;
    }
    return data;
  }

  function loadMixamoPack(buffer){
    if(!isLikelyMixamoPack(buffer)){
      return null;
    }
    let pack;
    try {
      pack = parseMixamoPackBuffer(buffer);
    } catch (err){
      throw new Error('Invalid Mixamo combination pack.');
    }
    if(!pack){
      return null;
    }
    if(!pack.base || typeof pack.base.data !== 'string' || !pack.base.data){
      throw new Error('Mixamo combination pack is missing character data.');
    }
    const baseBuffer = base64ToArrayBuffer(pack.base.data);
    const animationEntries = Array.isArray(pack.animations) ? pack.animations : [];
    const animationSources = animationEntries.map(entry => ({
      fileName: entry && typeof entry.name === 'string' ? entry.name : 'animation.fbx',
      buffer: entry && typeof entry.data === 'string' ? base64ToArrayBuffer(entry.data) : null,
      preferredNames: entry && Array.isArray(entry.clipNames) ? entry.clipNames : []
    }));
    const baseLabel = pack.base && pack.base.name ? pack.base.name : 'mixamo_character';
    const combined = combineMixamoBuffers(baseBuffer, baseLabel, animationSources);
    const labelSource = (typeof pack.fileName === 'string' && pack.fileName) ? pack.fileName : baseLabel;
    const fileStem = sanitizeFileStem(labelSource);
    const fileName = (typeof pack.fileName === 'string' && pack.fileName) ? pack.fileName : `${fileStem}_mixamo_combined.fbx`;
    return {
      object: combined.baseObject,
      animationCount: combined.animationCount,
      clipNames: combined.clipNames,
      fileName
    };
  }

  async function combineMixamoAnimations(baseFile, animationFiles){
    if(!baseFile){
      throw new Error('Select a Mixamo character in T-pose first.');
    }
    if(!animationFiles || !animationFiles.length){
      throw new Error('Select one or more Mixamo animation files.');
    }
    const baseBuffer = await baseFile.arrayBuffer();
    const animationBuffers = [];
    const animationSources = [];
    for(const file of animationFiles){
      if(!file){
        continue;
      }
      const buffer = await file.arrayBuffer();
      animationBuffers.push(buffer);
      animationSources.push({ fileName: file.name, buffer });
    }
    const combined = combineMixamoBuffers(baseBuffer, baseFile.name, animationSources);
    const pack = {
      format: 'MakaMobaMixamoPack',
      version: 1,
      createdAt: new Date().toISOString(),
      fileName: `${sanitizeFileStem(baseFile.name)}_mixamo_combined.fbx`,
      base: {
        name: baseFile.name,
        size: baseBuffer.byteLength,
        data: arrayBufferToBase64(baseBuffer)
      },
      animations: animationSources.map((source, index) => ({
        name: source.fileName,
        size: animationBuffers[index] ? animationBuffers[index].byteLength : 0,
        clipNames: combined.metadata[index] ? combined.metadata[index].clipNames : [],
        data: animationBuffers[index] ? arrayBufferToBase64(animationBuffers[index]) : ''
      })),
      summary: {
        animationCount: combined.animationCount,
        clipNames: combined.clipNames
      }
    };
    const json = JSON.stringify(pack);
    const blob = new Blob([json], { type: 'application/json' });
    const arrayBuffer = await blob.arrayBuffer();
    return {
      blob,
      fileName: pack.fileName,
      animationCount: combined.animationCount,
      clipNames: combined.clipNames,
      arrayBuffer
    };
  }

  function downloadBlob(blob, filename){
    if(!blob){
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'combined.fbx';
    document.body.appendChild(link);
    link.click();
    requestAnimationFrame(()=>{
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  if(playerRuntime.animationController && playerRuntime.model){
    const controller = playerRuntime.animationController;
    controller.onModelLoaded = ()=>{
      playerRuntime.model.attachController(controller);
    };
    controller.onModelCleared = ()=>{
      playerRuntime.model.clearModel();
    };
    controller.onAssignmentsChanged = ()=>{
      playerRuntime.model.updateAssignmentsFromController();
    };
    controller.onMaterialsUpdated = ()=>{
      playerRuntime.model.refreshMaterials();
    };
    controller.onModelScaleChanged = ()=>{
      playerRuntime.model.updateScaleFromController({ force: true });
    };
    controller.onModelOffsetChanged = ()=>{
      playerRuntime.model.updateOffsetFromController({ force: true });
    };
    playerRuntime.model.attachController(controller);
    updatePlayerAnimationSaveState();
  }

  if(playerRuntime.animationController){
    const controller = playerRuntime.animationController;
    const previousOnModelLoaded = controller.onModelLoaded;
    controller.onModelLoaded = ()=>{
      if(typeof previousOnModelLoaded === 'function'){
        try { previousOnModelLoaded(); } catch (err) { console.error(err); }
      }
      updatePlayerAnimationSaveState();
    };
    const previousOnModelCleared = controller.onModelCleared;
    controller.onModelCleared = ()=>{
      if(typeof previousOnModelCleared === 'function'){
        try { previousOnModelCleared(); } catch (err) { console.error(err); }
      }
      updatePlayerAnimationSaveState();
    };
  }

  if(btnPlayerAnimation && playerAnimationSection){
    btnPlayerAnimation.setAttribute('aria-expanded', 'false');
    btnPlayerAnimation.addEventListener('click', ()=>{
      const hidden = playerAnimationSection.hasAttribute('hidden');
      if(hidden){
        playerAnimationSection.removeAttribute('hidden');
        btnPlayerAnimation.setAttribute('aria-expanded', 'true');
        if(playerRuntime.animationController){
          requestAnimationFrame(()=> playerRuntime.animationController.refreshSize());
        }
      } else {
        playerAnimationSection.setAttribute('hidden', '');
        btnPlayerAnimation.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if(btnPlayerAnimationLoad && playerAnimationFileInput){
    btnPlayerAnimationLoad.addEventListener('click', ()=>{
      if(playerAnimationFileInput){
        playerAnimationFileInput.accept = '.fbx';
        playerAnimationFileInput.click();
        if(defaultPlayerAnimationAccept){
          setTimeout(()=>{ playerAnimationFileInput.accept = defaultPlayerAnimationAccept; }, 0);
        }
      }
    });
  }

  if(btnPlayerAnimationLoadGlb && playerAnimationFileInput){
    btnPlayerAnimationLoadGlb.addEventListener('click', ()=>{
      if(playerAnimationFileInput){
        playerAnimationFileInput.accept = '.glb';
        playerAnimationFileInput.click();
        if(defaultPlayerAnimationAccept){
          setTimeout(()=>{ playerAnimationFileInput.accept = defaultPlayerAnimationAccept; }, 0);
        }
      }
    });
  }

  if(btnPlayerAnimationMixamoCombine && playerMixamoBaseInput && playerMixamoAnimationInput){
    btnPlayerAnimationMixamoCombine.addEventListener('click', ()=>{
      if(playerRuntime.mixamoBusy){
        return;
      }
      playerRuntime.mixamoState.baseFile = null;
      playerMixamoBaseInput.value = '';
      playerMixamoAnimationInput.value = '';
      playerMixamoBaseInput.click();
    });

    playerMixamoBaseInput.addEventListener('change', ()=>{
      if(playerRuntime.mixamoBusy){
        playerMixamoBaseInput.value = '';
        return;
      }
      const file = playerMixamoBaseInput.files && playerMixamoBaseInput.files[0];
      if(!file){
        playerRuntime.mixamoState.baseFile = null;
        if(playerRuntime.animationController){
          playerRuntime.animationController.setStatus('Mixamo character selection canceled.');
        }
        return;
      }
      playerRuntime.mixamoState.baseFile = file;
      playerMixamoAnimationInput.value = '';
      playerMixamoAnimationInput.click();
    });

    playerMixamoAnimationInput.addEventListener('change', async ()=>{
      if(playerRuntime.mixamoBusy){
        playerMixamoAnimationInput.value = '';
        playerRuntime.mixamoState.baseFile = null;
        return;
      }
      const baseFile = playerRuntime.mixamoState.baseFile;
      const files = playerMixamoAnimationInput.files ? Array.from(playerMixamoAnimationInput.files) : [];
      playerRuntime.mixamoState.baseFile = null;
      playerMixamoBaseInput.value = '';
      playerMixamoAnimationInput.value = '';
      if(!baseFile){
        if(playerRuntime.animationController){
          playerRuntime.animationController.setStatus('Select a Mixamo character in T-pose first.');
        }
        return;
      }
      if(!files.length){
        if(playerRuntime.animationController){
          playerRuntime.animationController.setStatus('No Mixamo animations selected.');
        }
        return;
      }
      try {
        playerRuntime.mixamoBusy = true;
        if(btnPlayerAnimationMixamoCombine){
          btnPlayerAnimationMixamoCombine.disabled = true;
        }
        if(playerRuntime.animationController){
          playerRuntime.animationController.setStatus('Combining Mixamo animations');
        }
        const result = await combineMixamoAnimations(baseFile, files);
        downloadBlob(result.blob, result.fileName);
        if(playerRuntime.animationController){
          try {
            await playerRuntime.animationController.loadFromArrayBuffer(result.arrayBuffer, result.fileName);
            playerRuntime.animationController.setStatus(`Combined ${result.animationCount} Mixamo animation${result.animationCount === 1 ? '' : 's'} and loaded result pack.`);
          } catch (err){
            console.warn('Unable to auto-load combined Mixamo FBX', err);
            playerRuntime.animationController.setStatus(`Combined ${result.animationCount} Mixamo animation${result.animationCount === 1 ? '' : 's'}. Pack download started.`);
          }
        }
      } catch (err){
        console.error('Mixamo combination error', err);
        const message = err && err.message ? err.message : 'Unable to combine Mixamo animations.';
        if(playerRuntime.animationController){
          playerRuntime.animationController.setStatus(message);
        } else {
          alert(message);
        }
      } finally {
        playerRuntime.mixamoBusy = false;
        if(btnPlayerAnimationMixamoCombine){
          btnPlayerAnimationMixamoCombine.disabled = false;
        }
      }
    });
  }

  if(btnPlayerAnimationLoadSetup){
    btnPlayerAnimationLoadSetup.addEventListener('click', ()=>{
      if(!playerRuntime.animationController){
        return;
      }
      if(typeof playerRuntime.animationController.hasModel === 'function' && !playerRuntime.animationController.hasModel()){
        playerRuntime.animationController.setStatus('Load a player model before applying a saved setup.');
        if(playerAnimationConfigInput){
          playerAnimationConfigInput.click();
        }
        return;
      }
      let storedSnapshot = null;
      try {
        const signature = typeof playerRuntime.animationController.getModelSignature === 'function'
          ? playerRuntime.animationController.getModelSignature()
          : null;
        if(signature){
          const stored = loadPlayerAnimationConfigurations();
          storedSnapshot = stored && stored[signature] ? stored[signature] : null;
        }
      } catch (err){
        console.warn('Unable to retrieve stored animation configuration', err);
      }
      if(playerAnimationConfigInput){
        playerAnimationConfigInput.value = '';
        playerAnimationConfigInput.click();
        return;
      }
      if(storedSnapshot){
        const applied = playerRuntime.animationController.applyConfigurationSnapshot(storedSnapshot);
        if(!applied){
          playerRuntime.animationController.setStatus('Unable to apply saved setup. Ensure the matching model is loaded.');
        }
      } else {
        playerRuntime.animationController.setStatus('No setup file input available.');
      }
    });
  }

  if(btnPlayerAnimationSave){
    btnPlayerAnimationSave.addEventListener('click', ()=>{
      if(playerRuntime.animationController){
        playerRuntime.animationController.saveConfiguration();
        updatePlayerAnimationSaveState();
      }
    });
    updatePlayerAnimationSaveState();
  }

  if(playerAnimationConfigInput){
    playerAnimationConfigInput.addEventListener('change', ()=>{
      const file = playerAnimationConfigInput.files && playerAnimationConfigInput.files[0];
      if(!file){
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', ()=>{
        const text = typeof reader.result === 'string' ? reader.result : '';
        try {
          const parsed = JSON.parse(text);
          if(!playerRuntime.animationController){
            alert('Load a player model before importing an animation setup.');
            return;
          }
          if(typeof playerRuntime.animationController.hasModel === 'function' && !playerRuntime.animationController.hasModel()){
            playerRuntime.animationController.setStatus('Load a player model before importing a setup.');
            return;
          }
          const applied = playerRuntime.animationController.applyConfigurationSnapshot(parsed);
          if(applied){
            const signature = typeof playerRuntime.animationController.getModelSignature === 'function'
              ? playerRuntime.animationController.getModelSignature()
              : null;
            if(signature && typeof playerRuntime.animationController.persistConfigurationSnapshot === 'function'){
              playerRuntime.animationController.persistConfigurationSnapshot(signature, parsed);
            }
            playerRuntime.animationController.setStatus('Imported animation setup.');
          } else {
            playerRuntime.animationController.setStatus('Unable to apply imported setup to this model.');
          }
        } catch (err){
          console.error('Failed to parse animation setup file', err);
          alert('Unable to parse animation setup file.');
        }
      });
      reader.addEventListener('error', ()=>{
        alert('Unable to read animation setup file.');
      });
      reader.readAsText(file);
      playerAnimationConfigInput.value = '';
    });
  }

  if(btnPlayerAnimationClear){
    btnPlayerAnimationClear.addEventListener('click', ()=>{
      if(playerRuntime.animationController){
        playerRuntime.animationController.clearModel();
        playerRuntime.animationController.setStatus('Model cleared.');
        setPlayerAnimationState('idle');
      }
    });
  }

  if(playerAnimationFileInput){
    playerAnimationFileInput.addEventListener('change', async (ev)=>{
      const file = ev.target && ev.target.files ? ev.target.files[0] : null;
      if(file && playerRuntime.animationController){
        if(playerAnimationSection && playerAnimationSection.hasAttribute('hidden')){
          playerAnimationSection.removeAttribute('hidden');
          if(btnPlayerAnimation){
            btnPlayerAnimation.setAttribute('aria-expanded', 'true');
          }
        }
        await playerRuntime.animationController.loadFile(file);
        playerRuntime.animationController.refreshSize();
      }
      if(playerAnimationFileInput){
        if(defaultPlayerAnimationAccept){
          playerAnimationFileInput.accept = defaultPlayerAnimationAccept;
        }
        playerAnimationFileInput.value = '';
      }
    });
  }

  function setPlayerAnimationState(state, context = {}){
    if(!PLAYER_ANIMATION_ACTIONS.includes(state)){
      return;
    }
    playerRuntime.lastAnimationState = state;
    const finalContext = { ...context };
    if(!Number.isFinite(finalContext.facingRadians)){
      finalContext.facingRadians = GameState.player.facingRadians;
    }
    if(playerRuntime.animationController){
      playerRuntime.animationController.setState(state, finalContext);
    }
    if(playerRuntime.model){
      playerRuntime.model.setState(state, finalContext);
    }
  }

  setPlayerAnimationState('idle');
  const playerSpeedInput = document.getElementById('playerSpeed');
  const playerSizeInput = document.getElementById('playerSize');
  const playerTeamSelect = document.getElementById('playerTeam');
  const playerHpInput = document.getElementById('playerHP');
  const playerAttackRangeInput = document.getElementById('playerAttackRange');
  const playerAttackRangeOpacityInput = document.getElementById('playerAttackRangeOpacity');
  const playerAttackRangeOpacityDisplay = document.getElementById('playerAttackRangeOpacityDisplay');
  const playerAttackSpeedInput = document.getElementById('playerAttackSpeed');
  const playerAttackWindupInput = document.getElementById('playerAttackWindup');
  const playerAttackDamageInput = document.getElementById('playerAttackDamage');
  const playerHitSplatSizeInput = document.getElementById('playerHitSplatSize');
  const playerMoveCircleStartInput = document.getElementById('playerMoveCircleStart');
  const playerMoveCircleEndInput = document.getElementById('playerMoveCircleEnd');
  const playerMoveCircleColorInput = document.getElementById('playerMoveCircleColor');
  const playerHitboxToggleButton = document.getElementById('playerHitboxToggle');
  const playerHitboxLengthInput = document.getElementById('playerHitboxLength');
  const playerHitboxLengthDisplay = document.getElementById('playerHitboxLengthDisplay');
  const playerHitboxWidthInput = document.getElementById('playerHitboxWidth');
  const playerHitboxWidthDisplay = document.getElementById('playerHitboxWidthDisplay');
  const playerHitboxShapeSelect = document.getElementById('playerHitboxShape');
  const playerSpellOriginLengthInput = document.getElementById('playerSpellOriginLength');
  const playerSpellOriginLengthDisplay = document.getElementById('playerSpellOriginLengthDisplay');
  const playerSpellOriginWidthInput = document.getElementById('playerSpellOriginWidth');
  const playerSpellOriginWidthDisplay = document.getElementById('playerSpellOriginWidthDisplay');

  const btnCamera = document.getElementById('btnCamera');
  const cameraPane = document.getElementById('cameraPane');
  const cameraModeSelect = document.getElementById('cameraMode');
  const cameraFollowLagInput = document.getElementById('cameraFollowLag');
  const cameraFollowLagDisplay = document.getElementById('cameraFollowLagDisplay');
  const cameraLeadInput = document.getElementById('cameraLead');
  const cameraLeadDisplay = document.getElementById('cameraLeadDisplay');
  const cameraHorizontalOffsetInput = document.getElementById('cameraHorizontalOffset');
  const cameraHorizontalOffsetDisplay = document.getElementById('cameraHorizontalOffsetDisplay');
  const cameraVerticalOffsetInput = document.getElementById('cameraVerticalOffset');
  const cameraVerticalOffsetDisplay = document.getElementById('cameraVerticalOffsetDisplay');
  const cameraEdgeMarginInput = document.getElementById('cameraEdgeMargin');
  const cameraEdgeMarginDisplay = document.getElementById('cameraEdgeMarginDisplay');
  const cameraEdgeSpeedInput = document.getElementById('cameraEdgeSpeed');
  const cameraEdgeSpeedDisplay = document.getElementById('cameraEdgeSpeedDisplay');
  const cameraRecenterDelayInput = document.getElementById('cameraRecenterDelay');
  const cameraRecenterDelayDisplay = document.getElementById('cameraRecenterDelayDisplay');
  const cameraZoomInput = document.getElementById('cameraZoom');
  const cameraZoomDisplay = document.getElementById('cameraZoomDisplay');
  const cameraZoomInLockBtn = document.getElementById('cameraZoomInLock');
  const cameraZoomOutLockBtn = document.getElementById('cameraZoomOutLock');
  const cameraManualLeashInput = document.getElementById('cameraManualLeash');
  const cameraManualLeashDisplay = document.getElementById('cameraManualLeashDisplay');
  const cameraWheelSensitivityInput = document.getElementById('cameraWheelSensitivity');
  const cameraWheelSensitivityDisplay = document.getElementById('cameraWheelSensitivityDisplay');
  const cameraLockBindBtn = document.getElementById('cameraLockBind');
  const cameraRecenterBtn = document.getElementById('cameraRecenterBtn');

  const settingHelpEl = document.getElementById('settingHelp');
  const settingHelpTitle = document.getElementById('settingHelpTitle');
  const settingHelpBody = document.getElementById('settingHelpBody');

  const btnCursor = document.getElementById('btnCursor');
  const cursorPane = document.getElementById('cursorPane');
  const cursorToggleBtn = document.getElementById('cursorToggle');
  const cursorEmojiInput = document.getElementById('cursorEmoji');
  const cursorOutlineToggle = document.getElementById('cursorOutlineToggle');
  const cursorHoverColorInput = document.getElementById('cursorHoverColor');
  const stageCursorEl = document.getElementById('stageCursor');
  const stageCursorIcon = document.getElementById('stageCursorIcon');
  const btnPings = document.getElementById('btnPings');
  const pingPane = document.getElementById('pingPane');
  const pingOnMyWayInput = document.getElementById('pingOnMyWay');
  const pingEnemyMissingInput = document.getElementById('pingEnemyMissing');
  const pingAssistMeInput = document.getElementById('pingAssistMe');
  const pingTargetInput = document.getElementById('pingTarget');
  const pingOnMyWayTrigger = document.getElementById('pingOnMyWayTrigger');
  const pingEnemyMissingTrigger = document.getElementById('pingEnemyMissingTrigger');
  const pingAssistMeTrigger = document.getElementById('pingAssistMeTrigger');
  const pingTargetTrigger = document.getElementById('pingTargetTrigger');
  const pingInputs = {
    onMyWay: pingOnMyWayInput,
    enemyMissing: pingEnemyMissingInput,
    assistMe: pingAssistMeInput,
    target: pingTargetInput
  };
  const pingButtons = {
    onMyWay: pingOnMyWayTrigger,
    enemyMissing: pingEnemyMissingTrigger,
    assistMe: pingAssistMeTrigger,
    target: pingTargetTrigger
  };

  const btnKeybinds = document.getElementById('btnKeybinds');
  const keybindPane = document.getElementById('keybindPane');
  const spellCastDefaultSelect = document.getElementById('spellCastDefault');
  const spellCastNormalBindBtn = document.getElementById('spellCastNormalBind');
  const spellCastQuickBindBtn = document.getElementById('spellCastQuickBind');
  const spellCastIndicatorBindBtn = document.getElementById('spellCastIndicatorBind');
  const attackMoveBindBtn = document.getElementById('attackMoveBind');
  const pingWheelBindBtn = document.getElementById('pingWheelBind');

  const btnAbilityBar = document.getElementById('btnAbilityBar');
  const abilityPane = document.getElementById('abilityPane');
  const abilityCountInput = document.getElementById('abilityBarState.count');
  const abilityScaleInput = document.getElementById('abilityBarState.scale');
  const abilityOrientationSelect = document.getElementById('abilityBarState.orientation');
  const abilityHealthHorizontalSelect = document.getElementById('abilityBarState.healthPlacement.horizontal');
  const abilityHealthVerticalSelect = document.getElementById('abilityBarState.healthPlacement.vertical');
  const abilityHealthVerticalTextSelect = document.getElementById('abilityBarState.healthPlacement.textVertical');
  const abilityStatsVerticalSelect = document.getElementById('abilityBarState.statsPlacementVertical');
  const spellSpeedScaleInput = document.getElementById('abilityTunables.spellSpeedScale');
  const spellSizeScaleInput = document.getElementById('abilityTunables.spellSizeScale');
  const btnSaveSpells = document.getElementById('btnSaveSpells');

  const btnMinimap = document.getElementById('btnMinimap');
  const minimapPane = document.getElementById('minimapPane');
  const minimapScaleInput = document.getElementById('minimapScale');
  const minimapClickToMoveSelect = document.getElementById('minimapClickToMove');
  const minimapClickThroughSelect = document.getElementById('minimapClickThrough');

  const btnGold = document.getElementById('btnGold');
  const goldPane = document.getElementById('goldPane');
  const goldPerSecondInput = document.getElementById('goldState.perSecond');
  const goldPerKillInput = document.getElementById('goldState.perKill');
  const goldDisplay = document.getElementById('goldValue');

  const laneCountInput = document.getElementById('GameState.lanes.count');
  const laneOffsetList = document.getElementById('laneOffsets');

  const waveCountInput = document.getElementById('waveState.waveCount');
  const waveIntervalInput = document.getElementById('waveInterval');
  const spawnSpacingInput = document.getElementById('spawnSpacing');
  const minionSizeInput = document.getElementById('minionSize');
  const minionHPInput = document.getElementById('minionHP');
  const minionDMGInput = document.getElementById('minionDMG');
  const scalePctInput = document.getElementById('portalState.scalePct');

  const btnScore   = document.getElementById('btnScore');
  const scorePane  = document.getElementById('scorePane');
  const scoreBlueEl= document.getElementById('scoreBlue');
  const scoreRedEl = document.getElementById('scoreRed');
  const pointsPerInput = document.getElementById('scoreState.pointsPer');
  const winTargetInput = document.getElementById('scoreState.winTarget');
  const resetScoreBtn  = document.getElementById('resetScore');

  const btnUiLayout = document.getElementById('btnUiLayout');
  const uiLayoutPane = document.getElementById('uiLayoutPane');
  const uiSlotGoldSelect = document.getElementById('uiSlotGold');
  const uiSlotScoreSelect = document.getElementById('uiSlotScore');
  const uiSlotTimerSelect = document.getElementById('uiSlotTimer');
  const uiSlotAbilitySelect = document.getElementById('uiSlotAbility');
  const uiSlotMinimapSelect = document.getElementById('uiSlotMinimap');
  const uiOffsetInputs = {
    'top-left': { x: document.getElementById('uiOffsetTopLeftX'), y: document.getElementById('uiOffsetTopLeftY') },
    'top-middle': { x: document.getElementById('uiOffsetTopMiddleX'), y: document.getElementById('uiOffsetTopMiddleY') },
    'top-right': { x: document.getElementById('uiOffsetTopRightX'), y: document.getElementById('uiOffsetTopRightY') },
    'center-left': { x: document.getElementById('uiOffsetCenterLeftX'), y: document.getElementById('uiOffsetCenterLeftY') },
    'center-middle': { x: document.getElementById('uiOffsetCenterMiddleX'), y: document.getElementById('uiOffsetCenterMiddleY') },
    'center-right': { x: document.getElementById('uiOffsetCenterRightX'), y: document.getElementById('uiOffsetCenterRightY') },
    'bottom-left': { x: document.getElementById('uiOffsetBottomLeftX'), y: document.getElementById('uiOffsetBottomLeftY') },
    'bottom-middle': { x: document.getElementById('uiOffsetBottomMiddleX'), y: document.getElementById('uiOffsetBottomMiddleY') },
    'bottom-right': { x: document.getElementById('uiOffsetBottomRightX'), y: document.getElementById('uiOffsetBottomRightY') }
  };

  const hudCornerGroup = document.getElementById('hudCornerGroup');
  const hudStatsAnchor = document.getElementById('hudStatsAnchor');
  const scoreOverlayEl = document.getElementById('scoreOverlay');
  const hudStatsDock = document.getElementById('hudStatsDock');
  const hudStatsToggle = document.getElementById('hudStatsToggle');
  const hudStatsToggleIcon = hudStatsToggle ? hudStatsToggle.querySelector('.hudStatsToggleIcon') : null;
  const hudStatsPanel = document.getElementById('hudStatsPanel');
  const hudStatsContent = document.getElementById('hudStatsContent');
  const hudHpText = document.getElementById('hudHpText');
  const hudHpTextDefaultParent = hudHpText ? hudHpText.parentElement : null;
  const hudHpTextDefaultNextSibling = hudHpText ? hudHpText.nextSibling : null;
  const hudHpFill = document.getElementById('hudHpFill');
  const hudVitals = document.getElementById('hudVitals');
  const hudVitalsBar = document.getElementById('hudVitalsBar');
  const hudAbilityStackEl = document.getElementById('hudAbilityStack');
  const hudAbilityBarWrapEl = document.getElementById('hudAbilityBarWrap');
  const hudAbilityVitalsWrap = document.getElementById('hudAbilityVitalsWrap');
  const hudStatAs = document.getElementById('hudAs');
  const hudStatAw = document.getElementById('hudAw');
  const hudStatAr = document.getElementById('hudAr');
  const hudStatDmg = document.getElementById('hudDmg');
  const hudStatMs = document.getElementById('hudMs');
  const playerFloatHud = document.getElementById('playerFloatHud');
  const practiceDummyHud = document.getElementById('practiceDummyHud');
  const practiceDummyFill = document.getElementById('practiceDummyFill');
  const practiceDummyText = document.getElementById('practiceDummyText');
  const practiceDummyIcons = document.getElementById('practiceDummyIcons');
  const playerFloatFill = document.getElementById('playerFloatFill');
  const playerFloatText = document.getElementById('playerFloatText');
  const playerAttackReadyBar = document.getElementById('playerAttackReadyBar');
  const playerAttackReadyFill = document.getElementById('playerAttackReadyFill');
  const playerStateIcons = document.getElementById('playerStateIcons');
  const playerPrayerIcons = document.getElementById('playerPrayerIcons');
  const monsterHud = document.getElementById('monsterHud');
  const monsterFill = document.getElementById('monsterFill');
  const monsterText = document.getElementById('monsterText');
  const monsterAbilityQueueEl = document.getElementById('monsterAbilityQueue');
  const playerFloatSizeInput = document.getElementById('playerFloatSize');
  const playerFloatSizeDisplay = document.getElementById('playerFloatSizeDisplay');
  const playerFloatHeightInput = document.getElementById('playerFloatHeight');
  const playerFloatHeightDisplay = document.getElementById('playerFloatHeightDisplay');
  const playerFloatOffsetInput = document.getElementById('playerFloatOffset');
  const playerFloatOffsetDisplay = document.getElementById('playerFloatOffsetDisplay');
  const playerAttackBarWidthInput = document.getElementById('playerAttackBarWidth');
  const playerAttackBarWidthDisplay = document.getElementById('playerAttackBarWidthDisplay');
  const playerAttackBarHeightInput = document.getElementById('playerAttackBarHeight');
  const playerAttackBarHeightDisplay = document.getElementById('playerAttackBarHeightDisplay');
  const playerAttackBarOffsetXInput = document.getElementById('playerAttackBarOffsetX');
  const playerAttackBarOffsetYInput = document.getElementById('playerAttackBarOffsetY');
  const playerIconWidthInput = document.getElementById('playerIconWidth');
  const playerIconWidthDisplay = document.getElementById('playerIconWidthDisplay');
  const playerIconHeightInput = document.getElementById('playerIconHeight');
  const playerIconHeightDisplay = document.getElementById('playerIconHeightDisplay');
  const playerIconOffsetXInput = document.getElementById('playerIconOffsetX');
  const playerIconOffsetYInput = document.getElementById('playerIconOffsetY');
  const playerStateConfigList = document.getElementById('playerStateConfig');
  const playerStatusEmojiInputs = new Map();
  const playerStatusColorInputs = new Map();
  const playerStatusNodes = new Map();
  const practiceDummyStatusNodes = new Map();
  const prayerBindingButtons = new Map();
  const prayerActivateButtons = new Map();
  const prayerEmojiDisplays = new Map();
  let prayerKeyCaptureId = null;
  const timerEl = document.getElementById('timer');
  const abilityBarEl = document.getElementById('abilityBar');
  const abilityRepoEl = document.getElementById('abilityRepo');
  const abilityRepoClose = document.getElementById('abilityRepoClose');
  const abilityRepoSubtitle = document.getElementById('abilityRepoSubtitle');
  const spellListEl = document.getElementById('spellList');
  const spellEditorPlaceholder = document.getElementById('spellEditorPlaceholder');
  const spellEditorForm = document.getElementById('spellEditorForm');
  const winBanner = document.getElementById('winBanner');

  const UI_LAYOUT_SLOTS = {
    'top-left': { label: 'Top Left', anchorX: 0, anchorY: 0, anchorTranslateX: '0%', anchorTranslateY: '0%' },
    'top-middle': { label: 'Top Middle', anchorX: 0.5, anchorY: 0, anchorTranslateX: '-50%', anchorTranslateY: '0%' },
    'top-right': { label: 'Top Right', anchorX: 1, anchorY: 0, anchorTranslateX: '-100%', anchorTranslateY: '0%' },
    'center-left': { label: 'Center Left', anchorX: 0, anchorY: 0.5, anchorTranslateX: '0%', anchorTranslateY: '-50%' },
    'center-middle': { label: 'Center Middle', anchorX: 0.5, anchorY: 0.5, anchorTranslateX: '-50%', anchorTranslateY: '-50%' },
    'center-right': { label: 'Center Right', anchorX: 1, anchorY: 0.5, anchorTranslateX: '-100%', anchorTranslateY: '-50%' },
    'bottom-left': { label: 'Bottom Left', anchorX: 0, anchorY: 1, anchorTranslateX: '0%', anchorTranslateY: '-100%' },
    'bottom-middle': { label: 'Bottom Middle', anchorX: 0.5, anchorY: 1, anchorTranslateX: '-50%', anchorTranslateY: '-100%' },
    'bottom-right': { label: 'Bottom Right', anchorX: 1, anchorY: 1, anchorTranslateX: '-100%', anchorTranslateY: '-100%' }
  };
  const UI_LAYOUT_COMPONENTS = {
    gold: { element: hudCornerGroup, label: 'Gold counter' },
    score: { element: scoreOverlayEl, label: 'Score display' },
    timer: { element: timerEl, label: 'Game timer' },
    ability: { element: hudStatsAnchor, label: 'Ability & stats dock' },
    minimap: { element: minimapCanvas, label: 'Minimap' }
  };
  const uiSlotSelects = {
    gold: uiSlotGoldSelect,
    score: uiSlotScoreSelect,
    timer: uiSlotTimerSelect,
    ability: uiSlotAbilitySelect,
    minimap: uiSlotMinimapSelect
  };
  const DEFAULT_UI_SLOT_OFFSETS = {
    'top-left': { x: 16, y: 16 },
    'top-middle': { x: 0, y: 16 },
    'top-right': { x: 16, y: 16 },
    'center-left': { x: 16, y: 0 },
    'center-middle': { x: 0, y: 0 },
    'center-right': { x: 16, y: 0 },
    'bottom-left': { x: 16, y: 16 },
    'bottom-middle': { x: 0, y: 16 },
    'bottom-right': { x: 16, y: 16 }
  };
  function clampUiOffsetValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 0;
    }
    return Math.max(-500, Math.min(500, numeric));
  }
  const uiSlotOffsets = {};
  for(const [slot, offsets] of Object.entries(DEFAULT_UI_SLOT_OFFSETS)){
    uiSlotOffsets[slot] = { x: offsets.x, y: offsets.y };
  }
  const uiLayoutAssignments = {
    gold: 'top-left',
    score: 'top-middle',
    timer: 'top-right',
    ability: 'bottom-middle',
    minimap: 'bottom-right'
  };

  function sanitizeSlotId(value){
    if(typeof value !== 'string'){
      return 'hidden';
    }
    const trimmed = value.trim().toLowerCase();
    if(trimmed === 'hidden' || trimmed === 'none'){
      return 'hidden';
    }
    return UI_LAYOUT_SLOTS[trimmed] ? trimmed : 'hidden';
  }

  function populateUiLayoutOptions(){
    const slotEntries = Object.entries(UI_LAYOUT_SLOTS);
    for(const select of Object.values(uiSlotSelects)){
      if(!select) continue;
      select.innerHTML = '';
      const hiddenOption = document.createElement('option');
      hiddenOption.value = 'hidden';
      hiddenOption.textContent = 'None';
      select.appendChild(hiddenOption);
      for(const [slotId, slotDef] of slotEntries){
        const option = document.createElement('option');
        option.value = slotId;
        option.textContent = slotDef.label;
        select.appendChild(option);
      }
    }
  }

  function syncUiLayoutSelects(){
    for(const [key, select] of Object.entries(uiSlotSelects)){
      if(!select) continue;
      const assigned = sanitizeSlotId(uiLayoutAssignments[key]);
      select.value = assigned;
    }
  }

  function syncUiOffsetInputs(){
    for(const [slot, inputs] of Object.entries(uiOffsetInputs)){
      if(!inputs) continue;
      const offsets = uiSlotOffsets[slot] || { x: 0, y: 0 };
      if(inputs.x){
        const safeX = Math.round(clampUiOffsetValue(offsets.x));
        inputs.x.value = String(safeX);
      }
      if(inputs.y){
        const safeY = Math.round(clampUiOffsetValue(offsets.y));
        inputs.y.value = String(safeY);
      }
    }
  }

  function setUiComponentSlot(key, slotId, { syncInput = true } = {}){
    if(!UI_LAYOUT_COMPONENTS[key]){
      return;
    }
    const sanitized = sanitizeSlotId(slotId);
    const current = sanitizeSlotId(uiLayoutAssignments[key]);
    if(current === sanitized && syncInput){
      const select = uiSlotSelects[key];
      if(select){ select.value = sanitized; }
      return;
    }
    if(sanitized !== 'hidden'){
      for(const [otherKey, otherSlot] of Object.entries(uiLayoutAssignments)){
        if(otherKey !== key && sanitizeSlotId(otherSlot) === sanitized){
          uiLayoutAssignments[otherKey] = 'hidden';
          const otherSelect = uiSlotSelects[otherKey];
          if(otherSelect){ otherSelect.value = 'hidden'; }
        }
      }
    }
    uiLayoutAssignments[key] = sanitized;
    if(syncInput){
      const select = uiSlotSelects[key];
      if(select){ select.value = sanitized; }
    }
    scheduleHudFit();
  }

  function setUiSlotOffset(slotId, axis, value, { syncInput = true } = {}){
    const slot = UI_LAYOUT_SLOTS[slotId];
    if(!slot){
      return;
    }
    const numeric = clampUiOffsetValue(value);
    const rounded = Math.round(numeric);
    if(!uiSlotOffsets[slotId]){
      uiSlotOffsets[slotId] = { x: 0, y: 0 };
    }
    uiSlotOffsets[slotId][axis] = rounded;
    if(syncInput){
      const inputs = uiOffsetInputs[slotId];
      if(inputs){
        const inputEl = axis === 'x' ? inputs.x : inputs.y;
        if(inputEl){ inputEl.value = String(rounded); }
      }
    }
    scheduleHudFit();
  }

  function initUiLayoutControls(){
    populateUiLayoutOptions();
    syncUiLayoutSelects();
    syncUiOffsetInputs();
    for(const [key, select] of Object.entries(uiSlotSelects)){
      if(!select) continue;
      select.addEventListener('change', () => {
        setUiComponentSlot(key, select.value, { syncInput: false });
      });
    }
    for(const [slot, inputs] of Object.entries(uiOffsetInputs)){
      if(!inputs) continue;
      if(inputs.x){
        const handleX = () => setUiSlotOffset(slot, 'x', inputs.x.value, { syncInput: false });
        inputs.x.addEventListener('input', handleX);
        inputs.x.addEventListener('change', handleX);
      }
      if(inputs.y){
        const handleY = () => setUiSlotOffset(slot, 'y', inputs.y.value, { syncInput: false });
        inputs.y.addEventListener('input', handleY);
        inputs.y.addEventListener('change', handleY);
      }
    }
  }

  hudMessageState.timer = null;

  function setHudMessage(message){
    if(hudMessageState.timer){
      clearTimeout(hudMessageState.timer);
      hudMessageState.timer = null;
    }
    if(!settingHelpEl){
      return;
    }
    if(!message){
      hideSettingHelp('hud-message');
      return;
    }
    activeSettingHelpSource = 'hud-message';
    showSettingHelp('Status', message);
    hudMessageState.timer = setTimeout(()=>{
      if(activeSettingHelpSource === 'hud-message'){
        hideSettingHelp('hud-message');
      }
      hudMessageState.timer = null;
    }, 4000);
  }
  function formatSeconds(ms){
    const raw = Number(ms);
    if(!Number.isFinite(raw) || raw <= 0){
      return '0s';
    }
    const seconds = raw / 1000;
    const precision = seconds >= 10 ? 1 : 2;
    return `${seconds.toFixed(precision)}s`;
  }
  function formatStatNumber(value){
    const raw = Number(value);
    if(!Number.isFinite(raw)){
      return '0';
    }
    return String(Math.max(0, Math.round(raw)));
  }
  const rootStyle = document.documentElement.style;
  const SIDEBAR_MIN_WIDTH = 280;
  const SIDEBAR_COLLAPSED_WIDTH = 60;

  function measureViewport(){
    let layoutMenuWidth = 0;
    let measuredWidth = sidebarState.lastMeasuredWidth === null ? SIDEBAR_MIN_WIDTH : sidebarState.lastMeasuredWidth;
    const hidden = !app || app.getAttribute('data-hidden') === 'true';
    const collapsed = app && app.getAttribute('data-collapsed') === 'true';
    if(app && sidebarEl && !hidden){
      if(collapsed){
        measuredWidth = SIDEBAR_COLLAPSED_WIDTH;
      } else {
        const headerWidth = sbHeader ? sbHeader.scrollWidth : 0;
        const contentWidth = sbContent ? sbContent.scrollWidth : 0;
        const rect = sidebarEl.getBoundingClientRect();
        const visibleWidth = rect && Number.isFinite(rect.width) ? rect.width : 0;
        const rawWidth = Math.max(headerWidth, contentWidth, sidebarEl.scrollWidth || 0, visibleWidth);
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rawWidth;
        const maxAllowed = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth);
        measuredWidth = Math.min(maxAllowed, Math.max(SIDEBAR_MIN_WIDTH, Math.ceil(rawWidth)));
      }
      layoutMenuWidth = measuredWidth;
    }
    if(!hidden && (sidebarState.lastMeasuredWidth === null || Math.abs(measuredWidth - sidebarState.lastMeasuredWidth) >= 0.5)){
      rootStyle.setProperty('--sidebar-w', `${measuredWidth}px`);
      sidebarState.lastMeasuredWidth = measuredWidth;
    }
    rootStyle.setProperty('--menu-width-px', `${layoutMenuWidth}px`);
    const viewportWidth = Math.max(0, (window.innerWidth || 0) - layoutMenuWidth);
    const viewportHeight = window.innerHeight || 0;
    return { menuWidth: layoutMenuWidth, width: viewportWidth, height: viewportHeight };
  }

  function applyUiLayout(viewport){
    const metrics = viewport || measureViewport();
    const menuWidth = Math.max(0, Number(metrics && metrics.menuWidth) || 0);
    const viewportWidth = Math.max(0, Number(metrics && metrics.width) || 0);
    const viewportHeight = Math.max(0, Number(metrics && metrics.height) || 0);

    const slotPositions = {};
    for(const [slotId, slotDef] of Object.entries(UI_LAYOUT_SLOTS)){
      let posX = menuWidth + viewportWidth * slotDef.anchorX;
      let posY = viewportHeight * slotDef.anchorY;
      const offsets = uiSlotOffsets[slotId] || { x: 0, y: 0 };
      const offsetX = clampUiOffsetValue(offsets.x);
      const offsetY = clampUiOffsetValue(offsets.y);
      if(slotDef.anchorX === 1){
        posX -= offsetX;
      } else {
        posX += offsetX;
      }
      if(slotDef.anchorY === 1){
        posY -= offsetY;
      } else {
        posY += offsetY;
      }
      slotPositions[slotId] = {
        x: posX,
        y: posY,
        anchorX: slotDef.anchorTranslateX,
        anchorY: slotDef.anchorTranslateY
      };
    }

    let layoutShowsMinimap = false;

    for(const [key, component] of Object.entries(UI_LAYOUT_COMPONENTS)){
      const element = component.element;
      if(!element) continue;
      const slotId = sanitizeSlotId(uiLayoutAssignments[key]);
      const hidden = !slotId || slotId === 'hidden';
      element.hidden = hidden;
      element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      if(hidden){
        continue;
      }
      const slotPosition = slotPositions[slotId];
      if(!slotPosition){
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
        continue;
      }
      element.style.setProperty('--ui-pos-x', `${slotPosition.x}px`);
      element.style.setProperty('--ui-pos-y', `${slotPosition.y}px`);
      element.style.setProperty('--ui-anchor-x', slotPosition.anchorX);
      element.style.setProperty('--ui-anchor-y', slotPosition.anchorY);
      if(key === 'minimap'){
        layoutShowsMinimap = true;
      }
    }

    minimapState.layoutVisible = layoutShowsMinimap;
    applyMinimapScale();
  }

  let hudFitScheduled = false;
  function scheduleHudFit(){
    if(hudFitScheduled){
      return;
    }
    hudFitScheduled = true;
    requestAnimationFrame(() => {
      hudFitScheduled = false;
      fitHudToViewport();
    });
  }
  function fitHudToViewport(){
    const viewport = measureViewport();
    applyUiLayout(viewport);
    fitTopOverlays(viewport);
  }

  function applyOverlayScale(element, varName, maxWidth, maxHeight, minScale = 0.55){
    if(!element || !element.isConnected){
      return;
    }
    rootStyle.setProperty(varName, '1');
    const rect = element.getBoundingClientRect();
    let scale = 1;
    if(Number.isFinite(maxWidth) && maxWidth > 0 && rect.width > maxWidth){
      scale = Math.min(scale, maxWidth / rect.width);
    }
    if(Number.isFinite(maxHeight) && maxHeight > 0 && rect.height > maxHeight){
      scale = Math.min(scale, maxHeight / rect.height);
    }
    scale = Math.max(minScale, scale);
    rootStyle.setProperty(varName, scale.toFixed(3));
  }

  function fitTopOverlays(viewport){
    const metrics = viewport || measureViewport();
    const margin = 24;
    if(scoreOverlayEl){
      const maxWidth = Math.max(140, metrics.width - margin * 2);
      const maxHeight = Math.max(40, metrics.height - margin * 2);
      applyOverlayScale(scoreOverlayEl, '--hud-score-scale', maxWidth, maxHeight);
    }
    if(hudCornerGroup){
      const maxWidth = Math.max(220, metrics.width - margin);
      const maxHeight = Math.max(200, metrics.height - margin);
      applyOverlayScale(hudCornerGroup, '--hud-corner-scale', maxWidth, maxHeight);
    }
    if(hudStatsAnchor){
      const maxWidth = Math.max(220, metrics.width - margin);
      const maxHeight = Math.max(240, metrics.height - margin);
      applyOverlayScale(hudStatsAnchor, '--hud-stats-scale', maxWidth, maxHeight);
    }
    if(timerEl){
      const maxWidth = Math.max(96, metrics.width - margin);
      const maxHeight = Math.max(40, metrics.height - margin);
      applyOverlayScale(timerEl, '--hud-timer-scale', maxWidth, maxHeight);
    }
  }

  if(hudStatsPanel){
    const initialCollapsed = hudStatsDock && hudStatsDock.getAttribute('data-collapsed') === 'true';
    if(hudStatsContent){
      hudStatsContent.setAttribute('aria-hidden', initialCollapsed ? 'true' : 'false');
      if(hudStatsToggle){
        hudStatsToggle.setAttribute('aria-controls', hudStatsContent.id);
      }
    }
    if(hudStatsToggle){
      hudStatsToggle.setAttribute('aria-expanded', String(!initialCollapsed));
      hudStatsToggle.setAttribute('aria-label', initialCollapsed ? 'Expand stats' : 'Collapse stats');
    }
    updateHudStatsToggleIcon(initialCollapsed);
  }
  if(hudStatsToggle && hudStatsDock){
    hudStatsToggle.addEventListener('click', () => {
      const collapsed = hudStatsDock.getAttribute('data-collapsed') === 'true';
      const next = !collapsed;
      hudStatsDock.setAttribute('data-collapsed', String(next));
      hudStatsToggle.setAttribute('aria-expanded', String(!next));
      hudStatsToggle.setAttribute('aria-label', next ? 'Expand stats' : 'Collapse stats');
      if(hudStatsContent){
        hudStatsContent.setAttribute('aria-hidden', next ? 'true' : 'false');
      }
      updateHudStatsToggleIcon(next);
      scheduleHudFit();
    });
  }
  function syncMenuMeasurements(){
    const viewport = measureViewport();
    fitCameraStageToViewport(viewport);
    scheduleHudFit();
    updateStagePointerState();
  }

  function handleViewportResize(){
    syncMenuMeasurements();
  }
  window.addEventListener('resize', handleViewportResize, { passive: true });

  if('ResizeObserver' in window && sidebarEl){
    const observer = new ResizeObserver(() => {
      syncMenuMeasurements();
    });
    observer.observe(sidebarEl);
    if(sbContent){
      observer.observe(sbContent);
    }
  }

  function updateHudStats(){
    if(hudStatAs){
      hudStatAs.textContent = formatSeconds(player.attackSpeedMs);
    }
    if(hudStatAw){
      hudStatAw.textContent = formatSeconds(player.attackWindupMs);
    }
    if(hudStatAr){
      hudStatAr.textContent = formatStatNumber(player.attackRange);
    }
    if(hudStatDmg){
      hudStatDmg.textContent = formatStatNumber(player.attackDamage);
    }
    if(hudStatMs){
      hudStatMs.textContent = formatStatNumber(player.speed);
    }
    scheduleHudFit();
  }
  let lastHudHealthText = '';
  function updateHudHealth(){
    const maxHpRaw = Number(player.maxHp) || 0;
    const maxHp = Math.max(0, maxHpRaw);
    const currentHpRaw = Number(player.hp) || 0;
    const currentHp = Math.max(0, Math.min(maxHp > 0 ? maxHp : currentHpRaw, currentHpRaw));
    const pct = maxHp > 0 ? currentHp / maxHp : 0;
    const clampedPct = Math.max(0, Math.min(1, pct));
    const hudOrientation = abilityBarState.orientation === 'vertical' ? 'vertical' : 'horizontal';
    if(hudHpFill){
      if(hudOrientation === 'vertical'){
        hudHpFill.style.height = `${clampedPct * 100}%`;
        hudHpFill.style.width = '100%';
        hudHpFill.style.bottom = '0';
        hudHpFill.style.top = '';
      } else {
        hudHpFill.style.width = `${clampedPct * 100}%`;
        hudHpFill.style.height = '100%';
        hudHpFill.style.top = '';
        hudHpFill.style.bottom = '';
      }
    }
    if(hudHpText){
      const nextText = `${currentHp|0} / ${maxHp|0}`;
      if(nextText !== lastHudHealthText){
        hudHpText.textContent = nextText;
        lastHudHealthText = nextText;
        scheduleHudFit();
      }
    }
    if(playerFloatFill){
      playerFloatFill.style.width = `${clampedPct * 100}%`;
    }
    if(playerFloatText){
      playerFloatText.textContent = `${currentHp|0}`;
    }
    if(playerFloatHud){
      const visible = maxHp > 0;
      playerFloatHud.style.opacity = visible ? '1' : '0';
      playerFloatHud.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    updatePracticeDummyHud();
  }

  function updatePracticeDummyHud(){
    if(!practiceDummyHud){
      return;
    }
    const active = practiceDummy && practiceDummy.active !== false && !(practiceDummy.respawnTimer > 0);
    const maxHpRaw = Number(practiceDummy && practiceDummy.maxHp);
    const maxHp = Math.max(0, Number.isFinite(maxHpRaw) ? maxHpRaw : 0);
    const hpRaw = Number(practiceDummy && practiceDummy.hp);
    const hpValue = Math.max(0, Number.isFinite(hpRaw) ? hpRaw : maxHp);
    const cappedHp = maxHp > 0 ? Math.min(maxHp, hpValue) : hpValue;
    const pct = maxHp > 0 ? Math.max(0, Math.min(1, cappedHp / maxHp)) : 0;
    const visible = active && maxHp > 0;
    practiceDummyHud.style.opacity = visible ? '1' : '0';
    practiceDummyHud.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if(practiceDummyFill){
      practiceDummyFill.style.width = `${pct * 100}%`;
    }
    if(practiceDummyText){
      practiceDummyText.textContent = `${Math.round(cappedHp)}`;
    }
  }

  function updatePracticeDummyUiState(){
    if(practiceDummySizeInput){
      const size = Math.round(clampPracticeDummySize(practiceDummy && practiceDummy.size, 120));
      practiceDummySizeInput.value = String(size);
      if(practiceDummySizeDisplay){
        practiceDummySizeDisplay.textContent = `${size}px`;
      }
    }
    if(practiceDummyMoveButton){
      const placing = !!(practiceDummyState && practiceDummyState.placing);
      const respawning = !!(practiceDummy && practiceDummy.respawnTimer > 0);
      const active = practiceDummy && practiceDummy.active !== false && !respawning;
      if(respawning){
        practiceDummyMoveButton.textContent = 'Respawning dummy';
      } else if(active){
        practiceDummyMoveButton.textContent = placing ? 'Cancel dummy move' : 'Move dummy';
      } else {
        practiceDummyMoveButton.textContent = placing ? 'Cancel dummy placement' : 'Add dummy';
      }
      practiceDummyMoveButton.disabled = !!respawning;
    }
    if(practiceDummyRemoveButton){
      const active = practiceDummy && practiceDummy.active !== false && !(practiceDummy && practiceDummy.respawnTimer > 0);
      const selected = !!(practiceDummyState && practiceDummyState.selected);
      practiceDummyRemoveButton.disabled = !(active && selected);
    }
    if(practiceDummyDeathResponseSelect){
      const value = practiceDummy && practiceDummy.deathResponse === 'despawn' ? 'despawn' : 'respawn';
      practiceDummyDeathResponseSelect.value = value;
    }
  }
  let lastPlayerAttackReadyProgress = 0;
  function setPlayerAttackReadyState(progress, ready, enabled){
    if(playerAttackReadyFill){
      const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
      const pctWidth = `${clamped * 100}%`;
      if(clamped <= 0 && lastPlayerAttackReadyProgress > 0){
        playerAttackReadyFill.style.transition = 'none';
        playerAttackReadyFill.style.width = pctWidth;
        void playerAttackReadyFill.offsetWidth;
        playerAttackReadyFill.style.transition = '';
      } else {
        playerAttackReadyFill.style.width = pctWidth;
      }
      playerAttackReadyFill.classList.toggle('is-ready', !!ready);
      lastPlayerAttackReadyProgress = clamped;
    }
    if(playerAttackReadyBar){
      playerAttackReadyBar.classList.toggle('is-ready', !!ready);
      playerAttackReadyBar.classList.toggle('is-disabled', !enabled);
      playerAttackReadyBar.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    }
  }
  function applyPlayerFloatHudSizing(){
    if(playerFloatHud){
      playerFloatHud.style.setProperty('--player-float-width', String(playerFloatState.width));
      playerFloatHud.style.setProperty('--player-float-height', String(playerFloatState.height));
      if(playerFloatState.attack){
        playerFloatHud.style.setProperty('--player-attack-width', String(playerFloatState.attack.width));
        playerFloatHud.style.setProperty('--player-attack-height', String(playerFloatState.attack.height));
        playerFloatHud.style.setProperty('--player-attack-offset-x', String(playerFloatState.attack.offsetX));
        playerFloatHud.style.setProperty('--player-attack-offset-y', String(playerFloatState.attack.offsetY));
      }
      if(playerFloatState.icons){
        playerFloatHud.style.setProperty('--player-icon-width', String(playerFloatState.icons.width));
        playerFloatHud.style.setProperty('--player-icon-height', String(playerFloatState.icons.height));
        playerFloatHud.style.setProperty('--player-icon-offset-x', String(playerFloatState.icons.offsetX));
        playerFloatHud.style.setProperty('--player-icon-offset-y', String(playerFloatState.icons.offsetY));
      }
    }
    if(practiceDummyHud){
      practiceDummyHud.style.setProperty('--player-float-width', String(playerFloatState.width));
      practiceDummyHud.style.setProperty('--player-float-height', String(playerFloatState.height));
      if(playerFloatState.attack){
        practiceDummyHud.style.setProperty('--player-attack-width', String(playerFloatState.attack.width));
        practiceDummyHud.style.setProperty('--player-attack-height', String(playerFloatState.attack.height));
        practiceDummyHud.style.setProperty('--player-attack-offset-x', String(playerFloatState.attack.offsetX));
        practiceDummyHud.style.setProperty('--player-attack-offset-y', String(playerFloatState.attack.offsetY));
      }
      if(playerFloatState.icons){
        practiceDummyHud.style.setProperty('--player-icon-width', String(playerFloatState.icons.width));
        practiceDummyHud.style.setProperty('--player-icon-height', String(playerFloatState.icons.height));
        practiceDummyHud.style.setProperty('--player-icon-offset-x', String(playerFloatState.icons.offsetX));
        practiceDummyHud.style.setProperty('--player-icon-offset-y', String(playerFloatState.icons.offsetY));
      }
    }
    if(playerFloatSizeDisplay){
      playerFloatSizeDisplay.textContent = `${Math.round(playerFloatState.width)}px`;
    }
    if(playerFloatHeightDisplay){
      playerFloatHeightDisplay.textContent = `${Math.round(playerFloatState.height)}px`;
    }
    if(playerFloatOffsetDisplay){
      playerFloatOffsetDisplay.textContent = `${Math.round(playerFloatState.gap)}px`;
    }
    if(playerAttackBarWidthDisplay && playerFloatState.attack){
      playerAttackBarWidthDisplay.textContent = `${Math.round(playerFloatState.attack.width)}px`;
    }
    if(playerAttackBarHeightDisplay && playerFloatState.attack){
      playerAttackBarHeightDisplay.textContent = `${Math.round(playerFloatState.attack.height)}px`;
    }
    if(playerIconWidthDisplay && playerFloatState.icons){
      playerIconWidthDisplay.textContent = `${Math.round(playerFloatState.icons.width)}px`;
    }
    if(playerIconHeightDisplay && playerFloatState.icons){
      playerIconHeightDisplay.textContent = `${Math.round(playerFloatState.icons.height)}px`;
    }
  }

  function buildPlayerStatusConfigRows(){
    if(!playerStateConfigList){
      return;
    }
    playerStateConfigList.innerHTML = '';
    playerStatusEmojiInputs.clear();
    playerStatusColorInputs.clear();
    for(const def of PLAYER_STATUS_DEFS){
      const row = document.createElement('div');
      row.className = 'playerStateConfigRow';
      row.dataset.state = def.id;

      const header = document.createElement('div');
      header.className = 'playerStateConfigHeader';
      header.textContent = def.label;
      row.appendChild(header);

      const controls = document.createElement('div');
      controls.className = 'playerStateConfigInputs';

      const emojiLabel = document.createElement('label');
      emojiLabel.innerHTML = '<span>Emoji</span>';
      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.id = `playerState.${def.id}.emoji`;
      emojiInput.maxLength = 6;
      emojiInput.inputMode = 'text';
      emojiInput.autocomplete = 'off';
      emojiLabel.appendChild(emojiInput);

      const colorLabel = document.createElement('label');
      colorLabel.innerHTML = '<span>Text color</span>';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.id = `playerState.${def.id}.color`;
      colorLabel.appendChild(colorInput);

      controls.appendChild(emojiLabel);
      controls.appendChild(colorLabel);
      row.appendChild(controls);
      playerStateConfigList.appendChild(row);

      playerStatusEmojiInputs.set(def.id, emojiInput);
      playerStatusColorInputs.set(def.id, colorInput);

      emojiInput.addEventListener('input', ()=>{
        if(!playerFloatState.statuses || typeof playerFloatState.statuses !== 'object'){
          playerFloatState.statuses = buildDefaultPlayerStatusConfig();
        }
        const entry = playerFloatState.statuses[def.id] || (playerFloatState.statuses[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor });
        const trimmed = emojiInput.value.trim();
        entry.emoji = trimmed || def.defaultEmoji;
        if(emojiInput.value !== entry.emoji){
          emojiInput.value = entry.emoji;
        }
        updatePlayerStatusIcons();
      });

      colorInput.addEventListener('input', ()=>{
        if(!playerFloatState.statuses || typeof playerFloatState.statuses !== 'object'){
          playerFloatState.statuses = buildDefaultPlayerStatusConfig();
        }
        const entry = playerFloatState.statuses[def.id] || (playerFloatState.statuses[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor });
        const sanitized = sanitizeHexColor(colorInput.value, def.defaultColor);
        entry.color = sanitized;
        if(colorInput.value !== sanitized){
          colorInput.value = sanitized;
        }
        updatePlayerStatusIcons();
      });
    }
    syncPlayerStatusConfigInputs();
  }

  function syncPlayerStatusConfigInputs(){
    if(!playerFloatState.statuses || typeof playerFloatState.statuses !== 'object'){
      playerFloatState.statuses = buildDefaultPlayerStatusConfig();
    }
    for(const def of PLAYER_STATUS_DEFS){
      const entry = playerFloatState.statuses[def.id] || (playerFloatState.statuses[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor });
      const emojiInput = playerStatusEmojiInputs.get(def.id);
      if(emojiInput){
        emojiInput.value = entry.emoji || def.defaultEmoji;
      }
      const colorInput = playerStatusColorInputs.get(def.id);
      if(colorInput){
        const sanitized = sanitizeHexColor(entry.color, def.defaultColor);
        colorInput.value = sanitized;
        entry.color = sanitized;
      }
    }
    updatePlayerStatusIcons();
  }

  function resolveMonsterAbilityEmoji(monster, abilityId){
    if(!abilityId){
      return '';
    }
    if(monster && monster.projectileIcons && typeof monster.projectileIcons === 'object'){
      const custom = monster.projectileIcons[abilityId];
      if(typeof custom === 'string' && custom.trim()){
        return custom.trim();
      }
    }
    if(typeof DEFAULT_MONSTER_ICONS[abilityId] === 'string'){
      return DEFAULT_MONSTER_ICONS[abilityId];
    }
    return '';
  }

  function getPrayerEmoji(prayerId){
    return resolveMonsterAbilityEmoji(monsterState, prayerId);
  }

  function setMonsterProjectileIcon(abilityId, emoji){
    if(!abilityId){
      return;
    }
    if(!monsterState.projectileIcons || typeof monsterState.projectileIcons !== 'object'){
      monsterState.projectileIcons = { ...DEFAULT_MONSTER_ICONS };
    }
    const sanitized = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : resolveMonsterAbilityEmoji(null, abilityId);
    monsterState.projectileIcons[abilityId] = sanitized;
  }

  function syncPrayerBindingButton(prayerId){
    const button = prayerBindingButtons.get(prayerId);
    const binding = prayerState.bindings[prayerId];
    if(button){
      if(prayerKeyCaptureId === prayerId){
        button.textContent = 'Press a key';
      } else {
        button.textContent = binding && binding.label ? binding.label : '';
      }
    }
  }

  function updatePrayerButtons(){
    for(const def of PRAYER_DEFS){
      syncPrayerBindingButton(def.id);
      const toggle = prayerActivateButtons.get(def.id);
      if(toggle){
        const active = prayerState.active === def.id;
        toggle.textContent = active ? 'Deactivate' : 'Activate';
        toggle.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      const emojiDisplay = prayerEmojiDisplays.get(def.id);
      if(emojiDisplay){
        emojiDisplay.textContent = `Emoji: ${getPrayerEmoji(def.id)}`;
      }
    }
  }

  function updatePrayerHud(){
    if(!playerPrayerIcons){
      return;
    }
    const active = prayerState.active;
    player.activePrayer = active || null;
    playerPrayerIcons.innerHTML = '';
    if(!active){
      playerPrayerIcons.setAttribute('aria-hidden', 'true');
      return;
    }
    const icon = document.createElement('div');
    icon.className = 'playerPrayerIcon';
    icon.textContent = getPrayerEmoji(active);
    playerPrayerIcons.appendChild(icon);
    playerPrayerIcons.setAttribute('aria-hidden', 'false');
  }

  function buildPrayerUi(){
    if(!prayerListEl){
      return;
    }
    prayerListEl.innerHTML = '';
    prayerBindingButtons.clear();
    prayerActivateButtons.clear();
    prayerEmojiDisplays.clear();
    for(const def of PRAYER_DEFS){
      const row = document.createElement('div');
      row.className = 'playerStateConfigRow';
      row.dataset.prayer = def.id;

      const header = document.createElement('div');
      header.className = 'playerStateConfigHeader';
      header.textContent = def.label;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'formButton';
      toggle.dataset.prayer = def.id;
      toggle.addEventListener('click', ()=>{
        togglePrayer(def.id);
      });
      header.appendChild(toggle);
      row.appendChild(header);

      const controls = document.createElement('div');
      controls.className = 'playerStateConfigInputs';

      const bindLabel = document.createElement('label');
      bindLabel.innerHTML = '<span>Key bind</span>';
      const bindButton = document.createElement('button');
      bindButton.type = 'button';
      bindButton.className = 'formButton';
      bindButton.dataset.prayer = def.id;
      bindButton.addEventListener('click', ()=> startPrayerKeyCapture(def.id));
      bindLabel.appendChild(bindButton);
      controls.appendChild(bindLabel);

      const emojiPreview = document.createElement('div');
      emojiPreview.className = 'hint';
      emojiPreview.dataset.prayer = def.id;
      controls.appendChild(emojiPreview);
      prayerEmojiDisplays.set(def.id, emojiPreview);

      row.appendChild(controls);
      prayerListEl.appendChild(row);

      prayerBindingButtons.set(def.id, bindButton);
      prayerActivateButtons.set(def.id, toggle);
    }
    updatePrayerButtons();
  }

  function stopPrayerKeyCapture(options = {}){
    if(prayerKeyCaptureId){
      const current = prayerKeyCaptureId;
      prayerKeyCaptureId = null;
      if(!options.silent){
        const binding = prayerState.bindings[current];
        const def = PRAYER_DEFS.find(d => d.id === current);
        if(def){
          const label = binding && binding.label ? binding.label : '';
          setHudMessage(`${def.label} set to ${label}.`);
        }
      }
      syncPrayerBindingButton(current);
    }
  }

  function startPrayerKeyCapture(prayerId){
    if(!PRAYER_DEFS.some(def => def.id === prayerId)){
      return;
    }
    if(prayerKeyCaptureId === prayerId){
      stopPrayerKeyCapture({ silent: true });
      return;
    }
    if(prayerKeyCaptureId){
      syncPrayerBindingButton(prayerKeyCaptureId);
    }
    prayerKeyCaptureId = prayerId;
    syncPrayerBindingButton(prayerId);
    setHudMessage('Press a key to bind this prayer.');
  }

  function setPrayerBinding(prayerId, key, code){
    if(!PRAYER_DEFS.some(def => def.id === prayerId)){
      return;
    }
    const normalizedKey = typeof key === 'string' ? key : '';
    const normalizedCode = typeof code === 'string' ? code : '';
    const label = formatAbilityKeyLabel(normalizedKey, normalizedCode);
    prayerState.bindings[prayerId] = { key: normalizedKey, code: normalizedCode, label };
    rebuildPrayerBindingLookup(prayerState);
    syncPrayerBindingButton(prayerId);
  }

  function setActivePrayer(prayerId){
    const valid = PRAYER_DEFS.some(def => def.id === prayerId);
    prayerState.active = valid ? prayerId : null;
    player.activePrayer = prayerState.active;
    updatePrayerButtons();
    updatePrayerHud();
  }

  function togglePrayer(prayerId){
    const def = PRAYER_DEFS.find(d => d.id === prayerId);
    if(!def){
      return;
    }
    const next = prayerState.active === prayerId ? null : prayerId;
    setActivePrayer(next);
    if(next){
      setHudMessage(`${def.label} activated.`);
    } else {
      setHudMessage('All protection prayers deactivated.');
    }
  }

  function findPrayerForEvent(ev){
    if(!ev){
      return null;
    }
    const code = typeof ev.code === 'string' ? ev.code : '';
    if(code){
      const byCode = prayerBindingLookup.get(`code:${code}`);
      if(byCode){
        return byCode;
      }
    }
    const key = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
    if(key){
      const byKey = prayerBindingLookup.get(`key:${key}`);
      if(byKey){
        return byKey;
      }
    }
    return null;
  }

  function sanitizeMonsterCoordinate(value, limit){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return Math.max(0, Math.min(limit, limit / 2));
    }
    return Math.max(0, Math.min(limit, numeric));
  }

  function moveMonsterTo(x, y){
    if(!monsterState){
      return;
    }
    const clampedX = sanitizeMonsterCoordinate(x, mapState.width);
    const clampedY = sanitizeMonsterCoordinate(y, mapState.height);
    monsterState.x = clampedX;
    monsterState.y = clampedY;
    positionMonsterHud();
    renderMinimap(true);
  }

  function updateMonsterUiState(){
    if(!monsterMoveButton){
      return;
    }
    const active = monsterDragState.active || monsterDragState.dragging;
    monsterMoveButton.textContent = active ? 'Click map to place' : 'Move monster';
    monsterMoveButton.classList.toggle('is-active', active);
    monsterMoveButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function updateMonsterDragPosition(x, y){
    if(!monsterDragState.dragging){
      return;
    }
    const nextX = x + monsterDragState.offsetX;
    const nextY = y + monsterDragState.offsetY;
    moveMonsterTo(nextX, nextY);
    monsterDragState.moved = true;
  }

  function beginMonsterDrag(pointerId, x, y){
    if(!monsterState){
      return false;
    }
    const bodyRadius = Math.max(10, Math.min(400, Number(monsterState.size) || 140)) * 0.5;
    const dx = monsterState.x - x;
    const dy = monsterState.y - y;
    const inside = dx * dx + dy * dy <= bodyRadius * bodyRadius;
    monsterDragState.pointerId = pointerId;
    monsterDragState.offsetX = inside ? monsterState.x - x : 0;
    monsterDragState.offsetY = inside ? monsterState.y - y : 0;
    monsterDragState.dragging = true;
    monsterDragState.moved = false;
    updateMonsterDragPosition(x, y);
    updateMonsterUiState();
    return true;
  }

  function endMonsterDrag({ commit = true } = {}){
    if(monsterDragState.pointerId !== null && stage){
      try { stage.releasePointerCapture(monsterDragState.pointerId); } catch (err) { /* ignore */ }
    }
    monsterDragState.pointerId = null;
    monsterDragState.dragging = false;
    monsterDragState.offsetX = 0;
    monsterDragState.offsetY = 0;
    monsterDragState.moved = false;
    if(commit){
      monsterDragState.active = false;
      if(monsterDragState.messageActive){
        setHudMessage();
        monsterDragState.messageActive = false;
      }
    }
    updateMonsterUiState();
  }

  function cancelMonsterDrag(){
    endMonsterDrag({ commit: false });
    monsterDragState.active = false;
    if(monsterDragState.messageActive){
      setHudMessage();
      monsterDragState.messageActive = false;
    }
    updateMonsterUiState();
  }

  function syncMonsterInputs(){
    if(!monsterState){
      return;
    }
    if(monsterAggroRadiusInput){
      monsterAggroRadiusInput.value = String(Math.round(monsterState.aggroRadius));
    }
    if(monsterSizeInput){
      monsterSizeInput.value = String(Math.round(monsterState.size));
    }
    if(monsterMaxHpInput){
      monsterMaxHpInput.value = String(Math.round(monsterState.maxHp));
    }
    if(monsterProjectileDamageInput){
      monsterProjectileDamageInput.value = String(Math.round(monsterState.projectileDamage));
    }
    if(monsterCastIntervalInput){
      monsterCastIntervalInput.value = String(Number(monsterState.castInterval).toFixed(2));
    }
    if(monsterQueueSizeInput){
      monsterQueueSizeInput.value = String(Math.round(monsterState.queueSize));
    }
    if(monsterSlotSpinInput){
      monsterSlotSpinInput.value = String(Number(monsterState.slotMachineSpinDuration).toFixed(2));
    }
    if(monsterSlotRevealInput){
      monsterSlotRevealInput.value = String(Number(monsterState.slotMachineRevealDuration).toFixed(2));
    }
    if(monsterFreezeDurationInput){
      monsterFreezeDurationInput.value = String(Number(monsterState.freezeDuration).toFixed(2));
    }
    if(monsterSpeedBoostPctInput){
      monsterSpeedBoostPctInput.value = String(Math.round(monsterState.speedBoostPct));
    }
    if(monsterHealAmountInput){
      monsterHealAmountInput.value = String(Math.round(monsterState.healAmount));
    }
    if(monsterIconGreenInput){
      monsterIconGreenInput.value = getPrayerEmoji('green');
    }
    if(monsterIconBlueInput){
      monsterIconBlueInput.value = getPrayerEmoji('blue');
    }
    if(monsterIconRedInput){
      monsterIconRedInput.value = getPrayerEmoji('red');
    }
    updateMonsterUiState();
  }

  function updateMonsterAbilityQueueDisplay(){
    if(!monsterAbilityQueueEl){
      return;
    }
    const monster = monsterState;
    monsterAbilityQueueEl.innerHTML = '';
    if(!monster || monster.active === false){
      monsterAbilityQueueEl.setAttribute('aria-hidden', 'true');
      return;
    }
    const engaged = monster.engaged === true;
    const faces = Array.isArray(monster.slotMachineFaces) ? monster.slotMachineFaces : [];
    const revealTimer = Math.max(0, Number(monster.slotMachineRevealTimer) || 0);
    const isSpinning = monster.slotMachineActive === true;
    const hasPending = !!monster.pendingAbility;
    if(!engaged && !isSpinning && !hasPending){
      monsterAbilityQueueEl.setAttribute('aria-hidden', 'true');
      return;
    }
    const hasCountdown = engaged && hasPending && !isSpinning && revealTimer > 0;
    const state = isSpinning ? 'spinning' : hasCountdown ? 'countdown' : 'idle';
    const machine = document.createElement('div');
    machine.className = 'monsterSlotMachine';
    machine.dataset.state = state;
    const windowWrap = document.createElement('div');
    windowWrap.className = 'monsterSlotWindow';
    for(let i = 0; i < MONSTER_SLOT_MACHINE_COLUMNS; i++){
      const abilityId = faces[i] && MONSTER_ABILITY_IDS.includes(faces[i]) ? faces[i] : randomMonsterAbility();
      const reel = document.createElement('div');
      reel.className = 'monsterSlotReel';
      if(i === 0){
        reel.dataset.focus = 'true';
      }
      if(isSpinning){
        reel.dataset.spinning = 'true';
      }
      const symbol = document.createElement('div');
      symbol.className = 'monsterSlotSymbol';
      symbol.textContent = getPrayerEmoji(abilityId);
      reel.appendChild(symbol);
      windowWrap.appendChild(reel);
    }
    machine.appendChild(windowWrap);
    const readoutText = isSpinning
      ? 'Spinning'
      : hasCountdown
        ? `${revealTimer.toFixed(1)}s`
        : '';
    if(readoutText){
      const readout = document.createElement('div');
      readout.className = 'monsterSlotReadout';
      readout.textContent = readoutText;
      machine.appendChild(readout);
    }
    monsterAbilityQueueEl.appendChild(machine);
    monsterAbilityQueueEl.setAttribute('aria-hidden', 'false');
  }

  function updateMonsterHud(){
    if(!monsterHud){
      return;
    }
    const monster = monsterState;
    if(!monster || monster.active === false){
      monsterHud.setAttribute('aria-hidden', 'true');
      return;
    }
    monsterHud.style.opacity = '1';
    monsterHud.setAttribute('aria-hidden', 'false');
    const width = Math.max(60, Number(monster.size) || 140);
    monsterHud.style.setProperty('--player-float-width', String(width));
    monsterHud.style.setProperty('--player-float-height', '18');
    const hp = Math.max(0, Number(monster.hp) || 0);
    const maxHp = Math.max(1, Number(monster.maxHp) || 1);
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    if(monsterFill){
      monsterFill.style.width = `${pct * 100}%`;
    }
    if(monsterText){
      monsterText.textContent = `${Math.round(hp)} / ${Math.round(maxHp)}`;
    }
    updateMonsterAbilityQueueDisplay();
  }

  function positionMonsterHud(){
    if(!monsterHud || !monsterState || monsterState.active === false){
      return;
    }
    const hudHalfWidth = monsterHud.offsetWidth / 2;
    const minEdge = Math.max(32, hudHalfWidth + 4);
    const width = Math.max(0, Number(mapState.width) || 0);
    const height = Math.max(0, Number(mapState.height) || 0);
    const left = Math.max(minEdge, Math.min(width - minEdge, monsterState.x));
    const offsetHeight = Math.max(20, Number(monsterState.size) || 140) * 0.6 + 28;
    const topBase = monsterState.y - offsetHeight;
    const top = Math.max(28, Math.min(height - 12, topBase));
    monsterHud.style.left = `${left}px`;
    monsterHud.style.top = `${top}px`;
  }

  function randomMonsterAbility(){
    if(!MONSTER_ABILITY_IDS.length){
      return 'green';
    }
    const index = Math.floor(Math.random() * MONSTER_ABILITY_IDS.length);
    return MONSTER_ABILITY_IDS[Math.max(0, Math.min(MONSTER_ABILITY_IDS.length - 1, index))];
  }

  function setMonsterSlotFaces(monster, abilityId){
    if(!monster){
      return;
    }
    if(!Array.isArray(monster.slotMachineFaces)){
      monster.slotMachineFaces = new Array(MONSTER_SLOT_MACHINE_COLUMNS).fill(null);
    }
    const resolvedAbility = MONSTER_ABILITY_IDS.includes(abilityId) ? abilityId : randomMonsterAbility();
    monster.slotMachineFaces.length = MONSTER_SLOT_MACHINE_COLUMNS;
    for(let i = 0; i < MONSTER_SLOT_MACHINE_COLUMNS; i++){
      monster.slotMachineFaces[i] = resolvedAbility;
    }
  }

  function ensureMonsterQueue(monster){
    if(!monster){
      return;
    }
    if(!Array.isArray(monster.abilityQueue)){
      monster.abilityQueue = [];
    }
    const desired = Math.max(1, Math.min(6, Number(monster.queueSize) || 1));
    while(monster.abilityQueue.length < desired){
      monster.abilityQueue.push(randomMonsterAbility());
    }
    if(monster.abilityQueue.length > desired){
      monster.abilityQueue.length = desired;
    }
  }

  function collectMonsterParticipants(monster){
    const participants = [];
    if(!monster){
      return participants;
    }
    const radius = Math.max(0, Number(monster.aggroRadius) || 0);
    const radiusSq = radius * radius;
    const consider = (entity)=>{
      if(!entity){
        return;
      }
      if(entity !== player && entity.isPracticeDummy !== true && entity.isPlayer !== true){
        return;
      }
      if(typeof entity.hp === 'number' && entity.hp <= 0){
        return;
      }
      const dx = entity.x - monster.x;
      const dy = entity.y - monster.y;
      if(radius <= 0 || (dx * dx + dy * dy) <= radiusSq){
        participants.push(entity);
      }
    };
    consider(player);
    if(practiceDummy && practiceDummy.active !== false && !(practiceDummy.respawnTimer > 0)){
      consider(practiceDummy);
    }
    return participants;
  }

  function spawnMonsterProjectile(monster, abilityId, target){
    if(!monster || !target){
      return;
    }
    const startX = monster.x;
    const startY = monster.y - Math.max(10, Number(monster.size) || 0) * 0.35;
    const targetX = target.x;
    const targetY = target.y;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = Math.max(60, Number(monster.projectileSpeed) || 520);
    const duration = Math.max(0.12, distance / speed);
    projectiles.push({
      startX,
      startY,
      targetRef: target,
      targetX,
      targetY,
      progress: 0,
      duration,
      monsterAbility: abilityId,
      monsterRef: monster,
      onImpact: () => resolveMonsterProjectileImpact(monster, target, abilityId)
    });
  }

  function healEntity(target, amount){
    const heal = Math.max(0, Number(amount) || 0);
    if(!(heal > 0) || !target){
      return;
    }
    if(target === player){
      const prev = Math.max(0, Number(player.hp) || 0);
      const maxHp = Math.max(1, Number(player.maxHp) || 1);
      const next = Math.min(maxHp, prev + heal);
      if(next !== prev){
        player.hp = next;
        updateHudHealth();
      }
      return;
    }
    if(target.isPracticeDummy){
      const prev = Math.max(0, Number(target.hp) || 0);
      const maxHp = Math.max(1, Number(target.maxHp) || 1);
      const next = Math.min(maxHp, prev + heal);
      if(next !== prev){
        target.hp = next;
        updatePracticeDummyHud();
      }
      return;
    }
    if(typeof target.hp === 'number'){
      const prev = Number(target.hp) || 0;
      const maxHp = Math.max(prev, Number(target.maxHp) || prev);
      target.hp = Math.min(maxHp, prev + heal);
    }
  }

  function resolveMonsterProjectileImpact(monster, target, abilityId){
    if(!target){
      return;
    }
    const damage = Math.max(0, Number(monster && monster.projectileDamage) || 0);
    const isPlayerTarget = target === player;
    const protectedHit = isPlayerTarget && prayerState.active === abilityId;
    if(!protectedHit && damage > 0){
      if(target === player){
        damagePlayer(damage);
      } else if(target.isPracticeDummy){
        const prevHp = Number(target.hp) || 0;
        const maxHp = Math.max(1, Number(target.maxHp) || prevHp);
        const nextHp = Math.max(0, Math.min(maxHp, prevHp - damage));
        target.hp = nextHp;
        spawnHitSplat(target.x, target.y - clampPracticeDummySize(target.size, 120) * 0.5, damage);
        handlePracticeDummyDamage(target, prevHp);
      } else if(typeof target.hp === 'number'){
        target.hp = Math.max(0, Number(target.hp) - damage);
      }
    }
    const freezeDuration = Math.max(0, Number(monster && monster.freezeDuration) || 0);
    if(abilityId === 'blue' && freezeDuration > 0){
      const existing = Number(target.stunTimer) || 0;
      target.stunTimer = Math.max(existing, freezeDuration);
      if(target === player){
        updatePlayerStatusIcons();
      } else if(target.isPracticeDummy){
        updatePracticeDummyStatusIcons();
      }
    }
    if(abilityId === 'red'){
      const hastePct = Math.max(0, Number(monster && monster.speedBoostPct) || 0);
      if(hastePct > 0){
        target.hasteTimer = Math.max(Number(target.hasteTimer) || 0, MONSTER_SPEED_BOOST_DURATION);
        target.hastePct = hastePct;
        if(target === player){
          updatePlayerStatusIcons();
        } else if(target.isPracticeDummy){
          updatePracticeDummyStatusIcons();
        }
      }
    }
    if(abilityId === 'green'){
      const healAmount = Math.max(0, Number(monster && monster.healAmount) || 0);
      if(healAmount > 0){
        healEntity(target, healAmount);
      }
    }
    updateMonsterHud();
  }

  function castMonsterAbility(monster, abilityId, participants){
    if(!monster || !participants || !participants.length){
      return;
    }
    for(const target of participants){
      const isPlayerEntity = target === player || target.isPracticeDummy || target.isPlayer === true;
      if(!isPlayerEntity){
        continue;
      }
      spawnMonsterProjectile(monster, abilityId, target);
    }
  }

  function finalizeMonsterPendingCast(monster){
    if(!monster || !monster.pendingAbility){
      return;
    }
    const targets = collectMonsterParticipants(monster);
    monster.lastTargetCount = targets.length;
    monster.engaged = targets.length > 0;
    if(targets.length){
      castMonsterAbility(monster, monster.pendingAbility, targets);
    }
    monster.pendingAbility = null;
    monster.castTimer = 0;
    monster.slotMachineRevealTimer = 0;
    monster.slotMachineActive = false;
    monster.slotMachineSpinTimer = 0;
    monster.slotMachineFaceTimer = 0;
    monster.slotMachineImpactReady = false;
  }

  function updateMonsterState(dt){
    if(!monsterState){
      return;
    }
    ensureMonsterQueue(monsterState);
    monsterState.x = sanitizeMonsterCoordinate(monsterState.x, mapState.width);
    monsterState.y = sanitizeMonsterCoordinate(monsterState.y, mapState.height);
    monsterState.hp = Math.max(0, Math.min(monsterState.maxHp, Number(monsterState.hp) || monsterState.maxHp));
    if(!Array.isArray(monsterState.slotMachineFaces)){
      monsterState.slotMachineFaces = [];
    }
    for(let i = 0; i < MONSTER_SLOT_MACHINE_COLUMNS; i++){
      if(!MONSTER_ABILITY_IDS.includes(monsterState.slotMachineFaces[i])){
        monsterState.slotMachineFaces[i] = randomMonsterAbility();
      }
    }
    const interval = Math.max(0.1, Number(monsterState.castInterval) || 1);
    const participants = collectMonsterParticipants(monsterState);
    monsterState.lastTargetCount = participants.length;
    const engaged = participants.length > 0;
    monsterState.engaged = engaged;
    if(!engaged){
      monsterState.castTimer = Math.max(interval, Number(monsterState.castTimer) || interval);
      monsterState.pendingAbility = null;
      monsterState.slotMachineActive = false;
      monsterState.slotMachineSpinTimer = 0;
      monsterState.slotMachineRevealTimer = 0;
      monsterState.slotMachineFaceTimer = 0;
      monsterState.slotMachineImpactReady = false;
      updateMonsterAbilityQueueDisplay();
      return;
    }

    const shouldSpinFaces = monsterState.slotMachineActive === true;
    const refreshInterval = monsterState.slotMachineActive ? MONSTER_SLOT_MACHINE_SPIN_REFRESH : MONSTER_SLOT_MACHINE_IDLE_REFRESH;
    if(shouldSpinFaces){
      monsterState.slotMachineFaceTimer = Math.max(0, (Number(monsterState.slotMachineFaceTimer) || 0) - dt);
      if(monsterState.slotMachineFaceTimer <= 0){
        monsterState.slotMachineFaceTimer += refreshInterval;
        for(let i = 0; i < MONSTER_SLOT_MACHINE_COLUMNS; i++){
          monsterState.slotMachineFaces[i] = randomMonsterAbility();
        }
      }
    }

    if(monsterState.pendingAbility && !monsterState.slotMachineActive){
      setMonsterSlotFaces(monsterState, monsterState.pendingAbility);
    }

    monsterState.castTimer = Math.max(0, (Number(monsterState.castTimer) || interval) - dt);

    if(monsterState.pendingAbility){
      if(monsterState.slotMachineActive){
        monsterState.slotMachineImpactReady = false;
        const configuredSpin = Math.max(0, Number(monsterState.slotMachineSpinDuration) || 0);
        const activeSpinTimer = Number(monsterState.slotMachineSpinTimer);
        const currentSpinTimer = Number.isFinite(activeSpinTimer) ? activeSpinTimer : configuredSpin;
        monsterState.slotMachineSpinTimer = Math.max(0, currentSpinTimer - dt);
        if(monsterState.slotMachineSpinTimer <= 0){
          monsterState.slotMachineActive = false;
          monsterState.slotMachineSpinTimer = 0;
          const revealDuration = Math.max(0, Number(monsterState.slotMachineRevealDuration) || 0);
          const pendingAbility = monsterState.pendingAbility;
          if(pendingAbility){
            setMonsterSlotFaces(monsterState, pendingAbility);
          }
          if(revealDuration <= 0){
            finalizeMonsterPendingCast(monsterState);
          } else {
            monsterState.slotMachineRevealTimer = revealDuration;
            monsterState.slotMachineImpactReady = false;
          }
        }
      } else {
        const previousReveal = Math.max(0, Number(monsterState.slotMachineRevealTimer) || 0);
        const nextReveal = Math.max(0, previousReveal - dt);
        const reachedImpact = previousReveal > 0 && nextReveal <= 0;
        monsterState.slotMachineRevealTimer = nextReveal;
        if(monsterState.pendingAbility){
          setMonsterSlotFaces(monsterState, monsterState.pendingAbility);
        }
        if(reachedImpact){
          monsterState.slotMachineImpactReady = true;
          finalizeMonsterPendingCast(monsterState);
        } else if(nextReveal > 0){
          monsterState.slotMachineImpactReady = false;
        }
      }
    }

    if(!monsterState.pendingAbility && monsterState.castTimer <= 0){
      const abilityId = monsterState.abilityQueue.shift() || randomMonsterAbility();
      monsterState.pendingAbility = abilityId;
      const configuredSpin = Math.max(0, Number(monsterState.slotMachineSpinDuration) || 0);
      monsterState.slotMachineActive = true;
      monsterState.slotMachineSpinTimer = configuredSpin;
      monsterState.slotMachineRevealTimer = 0;
      monsterState.slotMachineFaceTimer = 0;
      monsterState.slotMachineImpactReady = false;
      monsterState.castTimer += interval;
      ensureMonsterQueue(monsterState);
    }
    updateMonsterAbilityQueueDisplay();
  }

  function updatePlayerStatusIcons(){
    if(!playerStateIcons){
      return;
    }
    if(!playerFloatState.statuses || typeof playerFloatState.statuses !== 'object'){
      playerFloatState.statuses = buildDefaultPlayerStatusConfig();
    }
    const activeStates = new Set();
    for(const def of PLAYER_STATUS_DEFS){
      let timerValue = Math.max(0, Number(player[def.timerKey]) || 0);
      if(def.id === 'slowed' && !(Number(player.slowPct) > 0)){
        timerValue = 0;
      }
      if(!(timerValue > 0)){ continue; }
      const entry = playerFloatState.statuses[def.id] || (playerFloatState.statuses[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor });
      const emoji = entry.emoji && typeof entry.emoji === 'string' && entry.emoji.trim() ? entry.emoji.trim() : def.defaultEmoji;
      const color = sanitizeHexColor(entry.color, def.defaultColor);
      entry.emoji = emoji;
      entry.color = color;
      let node = playerStatusNodes.get(def.id);
      if(!node){
        node = document.createElement('div');
        node.className = 'playerStateIcon';
        node.dataset.state = def.id;
        node.title = def.label;
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'playerStateEmoji';
        const timerSpan = document.createElement('span');
        timerSpan.className = 'playerStateTimer';
        node.appendChild(emojiSpan);
        node.appendChild(timerSpan);
        playerStateIcons.appendChild(node);
        playerStatusNodes.set(def.id, node);
      } else {
        playerStateIcons.appendChild(node);
      }
      node.style.setProperty('--state-color', color);
      node.style.color = color;
      const emojiSpan = node.querySelector('.playerStateEmoji');
      if(emojiSpan && emojiSpan.textContent !== emoji){
        emojiSpan.textContent = emoji;
      }
      const timerSpan = node.querySelector('.playerStateTimer');
      if(timerSpan){
        const timerText = `${timerValue.toFixed(1)}s`;
        if(timerSpan.textContent !== timerText){
          timerSpan.textContent = timerText;
        }
      }
      activeStates.add(def.id);
    }
    for(const [stateId, node] of playerStatusNodes.entries()){
      if(!activeStates.has(stateId)){
        if(node && node.parentElement){
          node.parentElement.removeChild(node);
        }
        playerStatusNodes.delete(stateId);
      }
    }
    playerStateIcons.setAttribute('aria-hidden', activeStates.size ? 'false' : 'true');
  }

  function updatePracticeDummyStatusIcons(){
    if(!practiceDummyIcons){
      return;
    }
    if(!practiceDummy || practiceDummy.active === false || practiceDummy.respawnTimer > 0){
      for(const [, node] of practiceDummyStatusNodes.entries()){
        if(node && node.parentElement){
          node.parentElement.removeChild(node);
        }
      }
      practiceDummyStatusNodes.clear();
      practiceDummyIcons.setAttribute('aria-hidden', 'true');
      return;
    }
    if(!playerFloatState.statuses || typeof playerFloatState.statuses !== 'object'){
      playerFloatState.statuses = buildDefaultPlayerStatusConfig();
    }
    const activeStates = new Set();
    for(const def of PLAYER_STATUS_DEFS){
      let timerValue = Math.max(0, Number(practiceDummy && practiceDummy[def.timerKey]) || 0);
      if(def.id === 'slowed' && !(Number(practiceDummy && practiceDummy.slowPct) > 0)){
        timerValue = 0;
      }
      if(!(timerValue > 0)){ continue; }
      const entry = playerFloatState.statuses[def.id] || (playerFloatState.statuses[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor });
      const emoji = entry.emoji && typeof entry.emoji === 'string' && entry.emoji.trim() ? entry.emoji.trim() : def.defaultEmoji;
      const color = sanitizeHexColor(entry.color, def.defaultColor);
      entry.emoji = emoji;
      entry.color = color;
      let node = practiceDummyStatusNodes.get(def.id);
      if(!node){
        node = document.createElement('div');
        node.className = 'playerStateIcon';
        node.dataset.state = def.id;
        node.title = def.label;
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'playerStateEmoji';
        const timerSpan = document.createElement('span');
        timerSpan.className = 'playerStateTimer';
        node.appendChild(emojiSpan);
        node.appendChild(timerSpan);
        practiceDummyIcons.appendChild(node);
        practiceDummyStatusNodes.set(def.id, node);
      } else {
        practiceDummyIcons.appendChild(node);
      }
      node.style.setProperty('--state-color', color);
      node.style.color = color;
      const emojiSpan = node.querySelector('.playerStateEmoji');
      if(emojiSpan && emojiSpan.textContent !== emoji){
        emojiSpan.textContent = emoji;
      }
      const timerSpan = node.querySelector('.playerStateTimer');
      if(timerSpan){
        const timerText = `${timerValue.toFixed(1)}s`;
        if(timerSpan.textContent !== timerText){
          timerSpan.textContent = timerText;
        }
      }
      activeStates.add(def.id);
    }
    for(const [stateId, node] of practiceDummyStatusNodes.entries()){
      if(!activeStates.has(stateId)){
        if(node && node.parentElement){
          node.parentElement.removeChild(node);
        }
        practiceDummyStatusNodes.delete(stateId);
      }
    }
    practiceDummyIcons.setAttribute('aria-hidden', activeStates.size ? 'false' : 'true');
  }
  function positionPlayerFloatingHud(){
    if(!playerFloatHud) return;
    const hudHalfWidth = playerFloatHud.offsetWidth / 2;
    const minEdge = Math.max(32, hudHalfWidth + 4);
    const width = mapState.width;
    const height = mapState.height;
    const left = Math.max(minEdge, Math.min(width - minEdge, player.x));
    const baseTop = player.y - player.r - playerFloatState.gap;
    const top = Math.max(28, Math.min(height - 12, baseTop));
    playerFloatHud.style.left = `${left}px`;
    playerFloatHud.style.top = `${top}px`;
  }

  function positionPracticeDummyHud(){
    if(!practiceDummyHud || !practiceDummy || practiceDummy.active === false || practiceDummy.respawnTimer > 0){
      return;
    }
    const hudHalfWidth = practiceDummyHud.offsetWidth / 2;
    const minEdge = Math.max(32, hudHalfWidth + 4);
    const width = mapState.width;
    const height = mapState.height;
    const px = Number(practiceDummy.x) || 0;
    const py = Number(practiceDummy.y) || 0;
    const left = Math.max(minEdge, Math.min(width - minEdge, px));
    const size = clampPracticeDummySize(practiceDummy.size, 120);
    const radius = size * 0.5;
    const span = Math.max(size * 2.2, size + 20);
    const gap = Number(playerFloatState.gap) || 0;
    const topBase = py - radius - span * 0.5 - gap;
    const top = Math.max(28, Math.min(height - 12, topBase));
    practiceDummyHud.style.left = `${left}px`;
    practiceDummyHud.style.top = `${top}px`;
  }

  const abilityAssignments = abilityBarState.assignments;
  const abilityHotkeys = abilityBarState.hotkeys;
  const abilitySlotStates = abilityBarState.slotStates;
  const spellCastingRuntime = {
    captureMode: null,
    activeIndicator: null,
    modifiers: {
      normal: false,
      quick: false,
      quickIndicator: false
    }
  };
  const activeBeams = GameState.effects.activeBeams;
  const beamCasts = GameState.effects.beamCasts;
  const laserConeCasts = GameState.effects.laserConeCasts;
  const grabCasts = GameState.effects.grabCasts;
  const piercingArrowCasts = GameState.effects.piercingArrowCasts;
  const plasmaFissionCasts = GameState.effects.plasmaFissionCasts;
  const chargingGaleCasts = GameState.effects.chargingGaleCasts;
  const cullingBarrageChannels = GameState.effects.cullingBarrageChannels;
  const cullingBarrageProjectiles = GameState.effects.cullingBarrageProjectiles;
  const arcaneRiteModes = GameState.effects.arcaneRiteModes;
  const arcaneRiteExplosions = GameState.effects.arcaneRiteExplosions;
  const piercingArrowProjectiles = GameState.effects.piercingArrowProjectiles;
  const plasmaFissionProjectiles = GameState.effects.plasmaFissionProjectiles;
  const flameChomperTraps = GameState.effects.flameChomperTraps;
  const BEAM_SLOW_DURATION = 2.5;
  const DISALLOWED_HOTKEY_KEYS = new Set(['Shift','Control','Alt','Meta','CapsLock','Tab']);
  const SPELL_SCALE_MIN = 0;
  const SPELL_SCALE_MAX = 10;
  GameState.items.abilityDefinitions = GameState.items.abilityDefinitions || {};
  const abilityDefinitions = GameState.items.abilityDefinitions;
  Object.assign(abilityDefinitions, {
    beam: {
      id: 'beam',
      name: 'Aether Beam',
      shortName: 'Beam',
      description: 'Channel a beam of energy that damages and slows the target.',
      fields: [
        { key: 'beamWidth', label: 'Beam width', unit: 'px', min: 0, max: 1000, step: 1, value: 12 },
        { key: 'beamLength', label: 'Beam length', unit: 'px', min: 0, max: 1000, step: 10, value: 600 },
        { key: 'cooldownMs', label: 'Cooldown', unit: 'ms', min: 0, max: 20000, step: 50, value: 8000 },
        { key: 'castTimeMs', label: 'Cast time', unit: 'ms', min: 0, max: 5000, step: 50, value: 600 },
        { key: 'damage', label: 'Damage', unit: ' dmg', min: 0, max: 500, step: 5, value: 120 },
        { key: 'slowPct', label: 'Slow', unit: '%', min: 0, max: 100, step: 1, value: 35 }
      ]
    },
    grab: {
      id: 'grab',
      name: 'Grasp of Nol-Tar',
      shortName: 'Grab',
      description: 'Launch a spectral hand that seizes the first enemy hit, stunning and pulling them toward you.',
      fields: [
        { key: 'cooldownMs', label: 'Cooldown', unit: 'ms', min: 0, max: 60000, step: 50, value: 16000 },
        { key: 'castTimeMs', label: 'Cast time', unit: 'ms', min: 0, max: 2000, step: 25, value: 250 },
        { key: 'grabRange', label: 'Range', unit: 'px', min: 0, max: 1000, step: 5, value: 1000 },
        { key: 'grabWidthCenter', label: 'Width (center)', unit: 'px', min: 0, max: 1000, step: 5, value: 60 },
        { key: 'grabWidthEdge', label: 'Width (edge)', unit: 'px', min: 0, max: 1000, step: 5, value: 140 },
        { key: 'grabSpeed', label: 'Projectile speed', unit: 'px/s', min: 0, max: 1000, step: 10, value: 900 },
        { key: 'damage', label: 'Damage', unit: ' dmg', min: 0, max: 1000, step: 5, value: 350 },
        { key: 'stunDurationMs', label: 'Stun duration', unit: 'ms', min: 0, max: 2000, step: 10, value: 650 },
        { key: 'pullDistance', label: 'Pull distance', unit: 'px', min: 0, max: 1000, step: 5, value: 75 },
        { key: 'postHitLockoutMs', label: 'Post-hit lockout', unit: 'ms', min: 0, max: 2000, step: 10, value: 250 }
      ]
    },
    laserCone: {
      id: 'laserCone',
      name: 'Laser Cone',
      shortName: 'Laser Cone',
      description: 'Fire a cone of piercing lasers that slow the first enemy they strike.',
      fields: [
        { key: 'laserSpeed', label: 'Laser speed', unit: 'px/s', min: 0, max: 1000, step: 10, value: 900 },
        { key: 'laserWidth', label: 'Cone width', unit: 'px', min: 0, max: 1000, step: 10, value: 350 },
        { key: 'laserProjectileWidth', label: 'Laser width', unit: 'px', min: 0, max: 1000, step: 1, value: 15 },
        { key: 'baseDamage', label: 'Base damage', unit: ' dmg', min: 1, max: 1000, step: 5, value: 100 },
        { key: 'damageScalePct', label: 'Bonus from AD', unit: '%', min: 0, max: 1000, step: 5, value: 100 },
        { key: 'laserDistance', label: 'Laser distance', unit: 'px', min: 0, max: 1000, step: 25, value: 500 },
        { key: 'laserCount', label: 'Number of lasers', unit: '', min: 0, max: 10, step: 1, value: 5 },
        { key: 'cooldownMs', label: 'Cooldown', unit: 'ms', min: 0, max: 20000, step: 50, value: 10000 },
        { key: 'castTimeMs', label: 'Cast time', unit: 'ms', min: 0, max: 1000, step: 5, value: 25 },
        { key: 'slowPct', label: 'Slow amount', unit: '%', min: 0, max: 100, step: 1, value: 15 },
        { key: 'slowDurationMs', label: 'Slow duration', unit: 'ms', min: 0, max: 5000, step: 50, value: 2500 }
      ]
    },
    slam: {
      id: 'slam',
      name: 'Slam',
      shortName: 'Slam',
      description: 'Slam the ground to shatter foes with a shockwave and erupting fissure.',
      fields: [
        { key: 'cooldownMs', label: 'Cooldown', unit: 'ms', min: 0, max: 120000, step: 100, value: 80000 },
        { key: 'castTimeMs', label: 'Cast time', unit: 'ms', min: 300, max: 800, step: 10, value: 500 },
        { key: 'impactRadius', label: 'Impact radius', unit: 'px', min: 200, max: 380, step: 5, value: 300 },
        { key: 'impactDamage', label: 'Impact damage', unit: ' dmg', min: 120, max: 600, step: 10, value: 300 },
        { key: 'impactKnockupMs', label: 'Impact knock-up', unit: 'ms', min: 300, max: 1000, step: 10, value: 600 },
        { key: 'fissureLength', label: 'Fissure length', unit: 'px', min: 0, max: 1000, step: 10, value: 900 },
        { key: 'fissureWidth', label: 'Fissure width', unit: 'px', min: 0, max: 1000, step: 5, value: 200 },
        { key: 'fissureSpeed', label: 'Fissure speed', unit: 'px/s', min: 0, max: 1000, step: 10, value: 900 },
        { key: 'fissureDamage', label: 'Fissure damage', unit: ' dmg', min: 120, max: 600, step: 10, value: 300 },
        { key: 'fissureFirstNearMs', label: 'First target knock-up (near)', unit: 'ms', min: 400, max: 1000, step: 10, value: 600 },
        { key: 'fissureFirstFarMs', label: 'First target knock-up (far)', unit: 'ms', min: 1000, max: 2500, step: 10, value: 2000 },
        { key: 'fissureOtherKnockupMs', label: 'Other targets knock-up', unit: 'ms', min: 300, max: 1000, step: 10, value: 600 },
        { key: 'iceFieldDurationMs', label: 'Ice field duration', unit: 'ms', min: 2000, max: 6000, step: 50, value: 4000 },
        { key: 'iceFieldTickMs', label: 'Ice field tick interval', unit: 'ms', min: 100, max: 330, step: 10, value: 250 },
        { key: 'iceFieldSlowPct', label: 'Ice field slow', unit: '%', min: 20, max: 70, step: 1, value: 50 }
      ]
    },
    blinkingBolt: {
      id: 'blinkingBolt',
      name: 'Blinking Bolt',
      shortName: 'Blink Bolt',
      description: 'Blink toward your aim, then unleash a homing bolt at the nearest foe.',
      fields: [
        { key: 'blinkDistance', label: 'Blink distance', unit: 'px', min: 0, max: 1000, step: 10, value: 500 },
        { key: 'damage', label: 'Bolt damage', unit: ' dmg', min: 0, max: 250, step: 5, value: 100 },
        { key: 'cooldownMs', label: 'Cooldown', unit: 'ms', min: 0, max: 25000, step: 50, value: 12000 }
      ]
    },
    proximity_traps: {
      id: 'proximity_traps',
      name: 'Flame Chompers',
      shortName: 'Chompers',
      description: 'Drop proximity snares that arm after a delay, rooting the first foe to enter and exploding for area damage.',
      fields: [
        { key: 'dropCount', label: 'Trap count', unit: '', min: 0, max: 6, step: 1, value: 3 },
        { key: 'placementMode', label: 'Placement mode (0=inline,1=cluster,2=free)', unit: '', min: 0, max: 2, step: 1, value: 0 },
        { key: 'placementSpacingPx', label: 'Placement spacing', unit: 'px', min: 0, max: 1000, step: 5, value: 120 },
        { key: 'maxPlaceRangePx', label: 'Max drop range', unit: 'px', min: 0, max: 1000, step: 10, value: 900 },
        { key: 'minTrapSpacingPx', label: 'Minimum trap spacing', unit: 'px', min: 0, max: 1000, step: 5, value: 80 },
        { key: 'armDelayMs', label: 'Arm delay', unit: 'ms', min: 0, max: 5000, step: 25, value: 450 },
        { key: 'lifetimeMs', label: 'Lifetime after arming', unit: 'ms', min: 0, max: 15000, step: 50, value: 5000 },
        { key: 'triggerRadiusPx', label: 'Trigger radius', unit: 'px', min: 0, max: 400, step: 5, value: 70 },
        { key: 'aoeRadiusPx', label: 'Explosion radius', unit: 'px', min: 0, max: 800, step: 5, value: 220 },
        { key: 'immobilizeMs', label: 'Root duration', unit: 'ms', min: 0, max: 5000, step: 25, value: 1500 },
        { key: 'damage', label: 'Damage', unit: ' dmg', min: 0, max: 1000, step: 5, value: 90 },
        { key: 'rootPrimaryOnly', label: 'Root only primary', unit: '', min: 0, max: 1, step: 1, value: 1 },
        { key: 'maxActiveTraps', label: 'Max active traps', unit: '', min: 1, max: 8, step: 1, value: 3 },
        { key: 'cooldownMs', label: 'Cooldown', unit: 'ms', min: 0, max: 60000, step: 50, value: 16000 },
        { key: 'canTriggerByMinions', label: 'Trigger on minions', unit: '', min: 0, max: 1, step: 1, value: 1 },
        { key: 'showArmedRing', label: 'Show armed ring', unit: '', min: 0, max: 1, step: 1, value: 1 },
        { key: 'showTriggerRadius', label: 'Show trigger radius', unit: '', min: 0, max: 1, step: 1, value: 1 }
      ]
    },
    charging_gale: {
      id: 'charging_gale',
      name: 'Charging Gale',
      shortName: 'Gale',
      description: 'Start charging a gust at your position. Recast during the window or auto at the end to launch a line projectile toward your aim. Longer charge increases range, speed, damage, and knock-up.',
      fields: [
        { key: 'cooldownMs',        label: 'Cooldown',            unit: 'ms',   min: 0, max: 60000, step: 50,  value: 14000 },
        { key: 'castTimeMs',        label: 'Cast time',           unit: 'ms',   min: 0, max: 1000,  step: 25,  value: 0 },
        { key: 'chargeMaxMs',       label: 'Max charge time',     unit: 'ms',   min: 0, max: 5000,  step: 25,  value: 3000 },
        { key: 'allowManualRecast', label: 'Allow manual recast', unit: '',     min: 0, max: 1,     step: 1,   value: 1 },
        { key: 'widthPx',           label: 'Projectile width',    unit: 'px',   min: 0, max: 1000,  step: 5,   value: 240 },
        { key: 'minRangePx',        label: 'Min range',           unit: 'px',   min: 0, max: 1000,  step: 10,  value: 600 },
        { key: 'maxRangePx',        label: 'Max range',           unit: 'px',   min: 0, max: 1000,  step: 10,  value: 1000 },
        { key: 'minSpeedPxS',       label: 'Min speed',           unit: 'px/s', min: 0, max: 1000,  step: 10,  value: 880 },
        { key: 'maxSpeedPxS',       label: 'Max speed',           unit: 'px/s', min: 0, max: 1000,  step: 10,  value: 1000 },
        { key: 'stopAtTerrain',     label: 'Stop at terrain',     unit: '',     min: 0, max: 1,     step: 1,   value: 1 },
        { key: 'pierceUnits',       label: 'Pierce units',        unit: '',     min: 0, max: 1,     step: 1,   value: 1 },
        { key: 'minDamage',         label: 'Min damage',          unit: ' dmg', min: 0, max: 2000,  step: 10,  value: 160 },
        { key: 'bonusPerSecond',    label: 'Bonus per second',    unit: ' dmg', min: 0, max: 500,   step: 5,   value: 25 },
        { key: 'knockupMinMs',      label: 'Min knock-up',        unit: 'ms',   min: 0, max: 3000,  step: 25,  value: 500 },
        { key: 'knockupMaxMs',      label: 'Max knock-up',        unit: 'ms',   min: 0, max: 3000,  step: 25,  value: 1250 }
      ]
    },
    piercing_arrow: {
      id: 'piercing_arrow',
      name: 'Piercing Arrow',
      shortName: 'Piercing Arrow',
      description: 'Hold to charge an arrow that gains range and damage, then release to fire a piercing line shot.',
      castType: 'quick',
      fields: [
        { key: 'cooldownMs',             label: 'Cooldown',              unit: 'ms',    min: 0,    max: 60000, step: 50,  value: 18000 },
        { key: 'chargeMinMs',            label: 'Min charge time',       unit: 'ms',    min: 0,    max: 4000,  step: 25,  value: 250 },
        { key: 'chargeMaxMs',            label: 'Max charge time',       unit: 'ms',    min: 0,    max: 4000,  step: 25,  value: 2000 },
        { key: 'rangeMinPx',             label: 'Min range',             unit: 'px',    min: 0,    max: 1000,  step: 5,   value: 875 },
        { key: 'rangeMaxPx',             label: 'Max range',             unit: 'px',    min: 0,    max: 1000,  step: 5,   value: 1000 },
        { key: 'damageMin',              label: 'Min damage',            unit: ' dmg',  min: 0,    max: 2000,  step: 5,   value: 70 },
        { key: 'damageMax',              label: 'Max damage',            unit: ' dmg',  min: 0,    max: 2000,  step: 5,   value: 210 },
        { key: 'projectileSpeedPxPerMs', label: 'Projectile speed',      unit: 'px/s',  min: 0,    max: 1000,  step: 1,   value: 900, scale: 'speed' },
        { key: 'widthPx',                label: 'Projectile width',      unit: 'px',    min: 0,    max: 1000,  step: 1,   value: 90 },
        { key: 'movementSlowPct',        label: 'Slow while charging',   unit: '%',     min: 0,    max: 100,   step: 1,   value: 25 },
        { key: 'canCancelCharge',        label: 'Charge can be cancelled',unit: '',      min: 0,    max: 1,     step: 1,   value: 1 }
      ]
    },
    plasma_fission: {
      id: 'plasma_fission',
      name: 'Plasma Fission',
      shortName: 'Plasma Fission',
      description: 'Fire a slow that splits into twin bolts on command or when its trigger condition is met.',
      fields: [
        { key: 'cooldownMs',              label: 'Cooldown',                     unit: 'ms',    min: 0,    max: 60000, step: 50,   value: 7000 },
        { key: 'projectile_speed_px_per_ms', label: 'Projectile speed',          unit: 'px/s',  min: 0,    max: 1000,  step: 1,    value: 800, scale: 'speed' },
        { key: 'projectile_width_px',     label: 'Projectile width',              unit: 'px',    min: 0,    max: 1000,  step: 1,    value: 70 },
        { key: 'projectile_range_px',     label: 'Projectile range',              unit: 'px',    min: 0,    max: 1000,  step: 5,    value: 1000 },
        { key: 'split_angle_deg',         label: 'Split angle ',                unit: '',     min: 0,    max: 90,    step: 1,    value: 45 },
        { key: 'split_speed_px_per_ms',   label: 'Split bolt speed',              unit: 'px/s',  min: 0,    max: 1000,  step: 1,    value: 800, scale: 'speed' },
        { key: 'damage_flat',             label: 'Damage',                        unit: ' dmg',  min: 0,    max: 1000,  step: 5,    value: 80 },
        { key: 'slow_percent',            label: 'Slow amount',                   unit: '%',     min: 0,    max: 100,   step: 1,    value: 90 },
        { key: 'slow_duration_ms',        label: 'Slow duration',                 unit: 'ms',    min: 0,    max: 5000,  step: 25,   value: 1500 },
        { key: 'recast_window_ms',        label: 'Recast window',                 unit: 'ms',    min: 0,    max: 5000,  step: 25,   value: 1800 },
        { key: 'split_trigger',           label: 'Split trigger (0=recast,1=collision,2=end)', unit: '', min: 0, max: 2, step: 1, value: 1 }
      ]
    },
    culling_barrage: {
      id: 'culling_barrage',
      name: 'Sweeping Barrage',
      shortName: 'Barrage',
      description: 'Hold a channel that unleashes a sweeping stream of first-hit bullets toward your aim.',
      fields: [
        { key: 'cooldownMs',          label: 'Cooldown',              unit: 'ms',   min: 0,    max: 60000, step: 50, value: 22000 },
        { key: 'channelDurationMs',   label: 'Channel duration',      unit: 'ms',   min: 0,    max: 10000, step: 10, value: 3000 },
        { key: 'shotIntervalMs',      label: 'Shot interval',         unit: 'ms',   min: 10,   max: 1000,  step: 5,  value: 80 },
        { key: 'projectileSpeedPxS',  label: 'Projectile speed',      unit: 'px/s', min: 0,    max: 1000,  step: 10, value: 900 },
        { key: 'projectileWidthPx',   label: 'Projectile width',      unit: 'px',   min: 0,    max: 1000,  step: 1,  value: 28 },
        { key: 'projectileRangePx',   label: 'Projectile range',      unit: 'px',   min: 0,    max: 1000,  step: 5,  value: 900 },
        { key: 'damagePerShot',       label: 'Damage per shot',       unit: ' dmg', min: 0,    max: 500,   step: 1,  value: 22 },
        { key: 'turnRateDegPerSec',   label: 'Aim turn rate',         unit: 'deg/s',min: 0,    max: 1440,  step: 10, value: 540 },
        { key: 'aimPreviewRangePx',   label: 'Aim preview length',    unit: 'px',   min: 0,    max: 1000,  step: 5,  value: 900 },
        { key: 'moveSpeedMultPct',    label: 'Move speed %',          unit: '%',    min: 0,    max: 100,   step: 1,  value: 60 },
        { key: 'allowDashDuringCh',   label: 'Allow dash while ch.',  unit: '',     min: 0,    max: 1,     step: 1,  value: 1 },
        { key: 'lockFacing',          label: 'Lock facing',           unit: '',     min: 0,    max: 1,     step: 1,  value: 1 },
        { key: 'projectilesPierce',   label: 'Projectiles pierce',    unit: '',     min: 0,    max: 1,     step: 1,  value: 0 }
      ]
    },
    rite_arcane: {
      id: 'rite_arcane',
      name: 'Rite of the Arcane',
      shortName: 'Rite',
      description: 'Enter Artillery Mode to queue delayed explosions on ground clicks. Ends when charges or time expire.',
      fields: [
        { key: 'cooldownMs',      label: 'Cooldown',            unit: 'ms', min: 0, max: 60000, step: 50, value: 20000 },
        { key: 'modeDurationMs',  label: 'Artillery duration',  unit: 'ms', min: 0, max: 20000, step: 50, value: 8000 },
        { key: 'modeCharges',     label: 'Charges',             unit: '',   min: 0, max: 12,    step: 1,  value: 4 },
        { key: 'explosionDelayMs',label: 'Explosion delay',     unit: 'ms', min: 0, max: 6000,  step: 25, value: 900 },
        { key: 'damage',          label: 'Explosion damage',    unit: ' dmg', min: 0, max: 2000, step: 10, value: 280 },
        { key: 'aoeRadiusPx',     label: 'Explosion radius',    unit: 'px', min: 0, max: 2400, step: 5, value: 220 },
        { key: 'minRangePx',      label: 'Min targeting range', unit: 'px', min: 0, max: 1000, step: 5, value: 420 },
        { key: 'maxRangePx',      label: 'Max targeting range', unit: 'px', min: 0, max: 1000, step: 10, value: 900 },
        { key: 'cancelOnStun',    label: 'Cancelled by stun',   unit: '',   min: 0, max: 1, step: 1, value: 1 },
        { key: 'cancelOnSilence', label: 'Cancelled by silence',unit: '',   min: 0, max: 1, step: 1, value: 0 }
      ]
    }
  });

  const abilityIndicatorProfiles = {
    beam: { type: 'line', lengthKey: 'beamLength', widthKey: 'beamWidth', fixedLength: true },
    grab: { type: 'trapezoid', lengthKey: 'grabRange', startWidthKey: 'grabWidthCenter', endWidthKey: 'grabWidthEdge', fixedLength: true },
    laserCone: {
      type: 'cone',
      lengthKey: 'laserDistance',
      widthKey: 'laserWidth',
      projectileWidthKey: 'laserProjectileWidth',
      countKey: 'laserCount',
      fixedLength: true
    },
    slam: { type: 'slam', impactRadiusKey: 'impactRadius', fissureLengthKey: 'fissureLength', fissureWidthKey: 'fissureWidth', fixedLength: true },
    plasma_fission: {
      type: 'line',
      lengthKey: 'projectile_range_px',
      widthKey: 'projectile_width_px',
      splitAngleKey: 'split_angle_deg'
    },
    piercing_arrow: { type: 'chargeLine', minLengthKey: 'rangeMinPx', maxLengthKey: 'rangeMaxPx', widthKey: 'widthPx', chargeSpell: true },
    charging_gale: { type: 'chargeLine', minLengthKey: 'minRangePx', maxLengthKey: 'maxRangePx', widthKey: 'widthPx', chargeSpell: true },
    blinkingBolt: { type: 'blink', rangeKey: 'blinkDistance', aoeRadiusKey: 'blinkDistance' },
    culling_barrage: { type: 'line', lengthKey: 'aimPreviewRangePx', widthKey: 'projectileWidthPx', fixedLength: true },
    proximity_traps: {
      type: 'trapPlacement',
      rangeKey: 'maxPlaceRangePx',
      triggerRadiusKey: 'triggerRadiusPx',
      aoeRadiusKey: 'aoeRadiusPx',
      countKey: 'dropCount',
      spacingKey: 'placementSpacingPx',
      minSpacingKey: 'minTrapSpacingPx',
      modeKey: 'placementMode'
    },
    rite_arcane: { type: 'aoe', radiusKey: 'aoeRadiusPx', distanceKey: 'maxRangePx', showRangeRing: true }
  };

  Object.values(abilityDefinitions).forEach(ability => {
    if(!ability) return;
    ability.castType = normalizeAbilityCastType(ability, ability.castType);
  });

  function listAbilities(){ return Object.values(abilityDefinitions); }
  function getAbilityDefinition(id){ return abilityDefinitions[id] || null; }
  function abilityField(ability, key){
    if(!ability || !Array.isArray(ability.fields)) return null;
    return ability.fields.find(field => field.key === key) || null;
  }
  function isSpellSpeedField(field){
    if(!field) return false;
    if(field.scale === 'speed') return true;
    if(field.scale === 'size') return false;
    const key = String(field.key || '');
    if(/speed/i.test(key)) return true;
    const unit = String(field.unit || '');
    if(/px\s*\/\s*s/i.test(unit)) return true;
    return false;
  }
  function isSpellSizeField(field){
    if(!field) return false;
    if(field.scale === 'size') return true;
    if(field.scale === 'speed') return false;
    const key = String(field.key || '');
    if(/(width|length|distance|range|radius|diameter|size|height)/i.test(key)) return true;
    const unit = String(field.unit || '');
    if(/px/i.test(unit) && !/px\s*\/\s*s/i.test(unit)) return true;
    return false;
  }
  function abilityFieldValue(ability, key, options = {}){
    const field = abilityField(ability, key);
    if(!field) return undefined;
    let value = field.value;
    if(!options || !options.skipScaling){
      if(isSpellSpeedField(field)){
        value = value * abilityTunables.spellSpeedScale;
      } else if(isSpellSizeField(field)){
        value = value * abilityTunables.spellSizeScale;
      }
    }
    return value;
  }
  function clampFieldValue(field, raw){
    if(!field) return 0;
    let value = parseFloat(raw);
    if(!Number.isFinite(value)) value = field.min;
    value = Math.max(field.min, Math.min(field.max, value));
    const step = Number(field.step || 1);
    if(step > 0){
      value = Math.round(value / step) * step;
      const decimals = step >= 1 ? 0 : (String(step).split('.')[1] || '').length;
      if(decimals > 0) value = Number(value.toFixed(decimals));
      value = Math.max(field.min, Math.min(field.max, value));
    }
    return value;
  }
  function abilitySummary(ability){
    if(!ability) return '';
    const damage = abilityFieldValue(ability, 'damage');
    const baseDamage = abilityFieldValue(ability, 'baseDamage');
    const damageScalePct = abilityFieldValue(ability, 'damageScalePct');
    const slow = abilityFieldValue(ability, 'slowPct');
    const slowDuration = abilityFieldValue(ability, 'slowDurationMs');
    const length = abilityFieldValue(ability, 'beamLength');
    const coneDistance = abilityFieldValue(ability, 'laserDistance');
    const grabRange = abilityFieldValue(ability, 'grabRange');
    const blinkDistance = abilityFieldValue(ability, 'blinkDistance');
    const width = abilityFieldValue(ability, 'beamWidth');
    const coneWidth = abilityFieldValue(ability, 'laserWidth');
    const grabCenterWidth = abilityFieldValue(ability, 'grabWidthCenter');
    const grabEdgeWidth = abilityFieldValue(ability, 'grabWidthEdge');
    const projectileWidth = abilityFieldValue(ability, 'laserProjectileWidth');
    const speed = abilityFieldValue(ability, 'laserSpeed');
    const grabSpeed = abilityFieldValue(ability, 'grabSpeed');
    const count = abilityFieldValue(ability, 'laserCount');
    const barrageChannel = abilityFieldValue(ability, 'channelDurationMs');
    const barrageInterval = abilityFieldValue(ability, 'shotIntervalMs');
    const barrageRange = abilityFieldValue(ability, 'projectileRangePx');
    const barrageWidth = abilityFieldValue(ability, 'projectileWidthPx');
    const barrageSpeed = abilityFieldValue(ability, 'projectileSpeedPxS');
    const barrageDamage = abilityFieldValue(ability, 'damagePerShot');
    const plasmaDamageFlat = abilityFieldValue(ability, 'damage_flat');
    const plasmaRange = abilityFieldValue(ability, 'projectile_range_px');
    const plasmaWidth = abilityFieldValue(ability, 'projectile_width_px');
    const plasmaSpeed = abilityFieldValue(ability, 'projectile_speed_px_per_ms');
    const plasmaSlowPct = abilityFieldValue(ability, 'slow_percent');
    const plasmaSlowDuration = abilityFieldValue(ability, 'slow_duration_ms');
    const plasmaSplitAngle = abilityFieldValue(ability, 'split_angle_deg');
    const plasmaRecastWindow = abilityFieldValue(ability, 'recast_window_ms');
    const plasmaSplitTriggerRaw = abilityFieldValue(ability, 'split_trigger', { skipScaling: true });
    const chargeMinMs = abilityFieldValue(ability, 'chargeMinMs');
    const chargeMaxMs = abilityFieldValue(ability, 'chargeMaxMs');
    const chargeRangeMin = abilityFieldValue(ability, 'rangeMinPx');
    const chargeRangeMax = abilityFieldValue(ability, 'rangeMaxPx');
    const chargeDamageMin = abilityFieldValue(ability, 'damageMin');
    const chargeDamageMax = abilityFieldValue(ability, 'damageMax');
    const chargeWidth = abilityFieldValue(ability, 'widthPx');
    const chargeProjectileSpeed = abilityFieldValue(ability, 'projectileSpeedPxPerMs');
    const chargeMoveSlow = abilityFieldValue(ability, 'movementSlowPct');
    const cooldown = abilityFieldValue(ability, 'cooldownMs');
    const castTime = abilityFieldValue(ability, 'castTimeMs');
    const stunDuration = abilityFieldValue(ability, 'stunDurationMs');
    const pullDistance = abilityFieldValue(ability, 'pullDistance');
    const postHitLockout = abilityFieldValue(ability, 'postHitLockoutMs');
    const impactDamage = abilityFieldValue(ability, 'impactDamage');
    const fissureDamage = abilityFieldValue(ability, 'fissureDamage');
    const impactRadius = abilityFieldValue(ability, 'impactRadius');
    const fissureLength = abilityFieldValue(ability, 'fissureLength');
    const fissureWidth = abilityFieldValue(ability, 'fissureWidth');
    const fissureSpeed = abilityFieldValue(ability, 'fissureSpeed');
    const iceFieldDuration = abilityFieldValue(ability, 'iceFieldDurationMs');
    const iceFieldSlowPct = abilityFieldValue(ability, 'iceFieldSlowPct');
    const parts = [];
    if(Number.isFinite(damage)) parts.push(`Damage ${damage}`);
    if(Number.isFinite(chargeDamageMin) || Number.isFinite(chargeDamageMax)){
      const minDmg = Number.isFinite(chargeDamageMin) ? Math.round(chargeDamageMin) : null;
      const maxDmg = Number.isFinite(chargeDamageMax) ? Math.round(chargeDamageMax) : null;
      if(minDmg !== null && maxDmg !== null){
        if(minDmg === maxDmg){
          parts.push(`Damage ${minDmg}`);
        } else {
          parts.push(`Damage ${minDmg}-${maxDmg}`);
        }
      } else if(minDmg !== null){
        parts.push(`Damage ${minDmg}`);
      } else if(maxDmg !== null){
        parts.push(`Damage up to ${maxDmg}`);
      }
    }
    if(Number.isFinite(baseDamage)) parts.push(`Base ${baseDamage}`);
    const impactDamageFinite = Number.isFinite(impactDamage) ? Number(impactDamage) : null;
    const fissureDamageFinite = Number.isFinite(fissureDamage) ? Number(fissureDamage) : null;
    if(impactDamageFinite !== null || fissureDamageFinite !== null){
      if(impactDamageFinite !== null && fissureDamageFinite !== null && impactDamageFinite === fissureDamageFinite){
        parts.push(`Impact/Fissure ${impactDamageFinite}`);
      } else {
        if(impactDamageFinite !== null) parts.push(`Impact ${impactDamageFinite}`);
        if(fissureDamageFinite !== null) parts.push(`Fissure ${fissureDamageFinite}`);
      }
    }
    if(Number.isFinite(damageScalePct) && damageScalePct !== 0) parts.push(`+${damageScalePct}% AD`);
    if(Number.isFinite(slow)){
      if(Number.isFinite(slowDuration) && slowDuration > 0){
        parts.push(`Slow ${slow}%/${slowDuration}ms`);
      } else {
        parts.push(`Slow ${slow}%`);
      }
    }
    if(Number.isFinite(iceFieldSlowPct)) parts.push(`Field slow ${iceFieldSlowPct}%`);
    if(Number.isFinite(plasmaDamageFlat)) parts.push(`Damage ${Math.round(plasmaDamageFlat)}`);
    if(Number.isFinite(plasmaSlowPct)){
      if(Number.isFinite(plasmaSlowDuration) && plasmaSlowDuration > 0){
        parts.push(`Slow ${Math.round(plasmaSlowPct)}%/${Math.round(plasmaSlowDuration)}ms`);
      } else {
        parts.push(`Slow ${Math.round(plasmaSlowPct)}%`);
      }
    }
    const rangeValue = Number.isFinite(length)
      ? length
      : (Number.isFinite(coneDistance)
        ? coneDistance
        : (Number.isFinite(grabRange)
          ? grabRange
          : (Number.isFinite(plasmaRange) ? plasmaRange : null)));
    if(Number.isFinite(rangeValue)) parts.push(`${rangeValue}px range`);
    if(Number.isFinite(chargeRangeMin) || Number.isFinite(chargeRangeMax)){
      const minRange = Number.isFinite(chargeRangeMin) ? Math.round(chargeRangeMin) : null;
      const maxRange = Number.isFinite(chargeRangeMax) ? Math.round(chargeRangeMax) : null;
      if(minRange !== null && maxRange !== null){
        if(minRange === maxRange){
          parts.push(`${minRange}px range`);
        } else {
          parts.push(`Range ${minRange}-${maxRange}px`);
        }
      } else if(maxRange !== null){
        parts.push(`Range up to ${maxRange}px`);
      } else if(minRange !== null){
        parts.push(`${minRange}px range`);
      }
    }
    if(Number.isFinite(impactRadius)) parts.push(`${impactRadius}px impact radius`);
    if(Number.isFinite(fissureLength)) parts.push(`${fissureLength}px fissure`);
    if(Number.isFinite(fissureWidth)) parts.push(`${fissureWidth}px fissure width`);
    if(Number.isFinite(fissureSpeed)) parts.push(`${fissureSpeed}px/s fissure`);
    if(Number.isFinite(iceFieldDuration)){
      const seconds = Math.max(0, Number(iceFieldDuration) || 0) / 1000;
      const formatted = seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(1);
      parts.push(`${formatted}s ice field`);
    }
    const widthValue = Number.isFinite(width)
      ? width
      : (Number.isFinite(coneWidth)
        ? coneWidth
        : (Number.isFinite(grabCenterWidth)
          ? grabCenterWidth
          : (Number.isFinite(plasmaWidth) ? plasmaWidth : null)));
    if(Number.isFinite(widthValue)) parts.push(`${widthValue}px width`);
    if(Number.isFinite(chargeWidth) && chargeWidth !== widthValue) parts.push(`${Math.round(chargeWidth)}px width`);
    if(Number.isFinite(grabEdgeWidth) && grabEdgeWidth !== widthValue) parts.push(`${grabEdgeWidth}px edge width`);
    if(Number.isFinite(projectileWidth)) parts.push(`${projectileWidth}px laser width`);
    if(Number.isFinite(speed)) parts.push(`${speed}px/s`);
    if(Number.isFinite(plasmaSpeed)) parts.push(`${Math.round(plasmaSpeed)}px/s`);
    if(Number.isFinite(chargeProjectileSpeed)){
      parts.push(`${Math.round(chargeProjectileSpeed)}px/s`);
    }
    if(Number.isFinite(grabSpeed) && grabSpeed !== speed) parts.push(`${grabSpeed}px/s hand`);
    if(Number.isFinite(count)) parts.push(`Lasers ${count}`);
    if(Number.isFinite(blinkDistance)) parts.push(`${blinkDistance}px blink`);
    if(Number.isFinite(barrageRange)) parts.push(`${Math.round(barrageRange)}px range`);
    if(Number.isFinite(barrageWidth)) parts.push(`${Math.round(barrageWidth)}px width`);
    if(Number.isFinite(barrageSpeed)) parts.push(`${Math.round(barrageSpeed)}px/s`);
    if(Number.isFinite(barrageDamage)) parts.push(`${Math.round(barrageDamage)} dmg/shot`);
    if(Number.isFinite(plasmaSplitAngle) && plasmaSplitAngle > 0){
      parts.push(`Split ${Math.round(plasmaSplitAngle)}`);
    }
    if(Number.isFinite(plasmaRecastWindow) && plasmaRecastWindow > 0){
      parts.push(`Recast ${formatSeconds(plasmaRecastWindow)} window`);
    }
    if(Number.isFinite(plasmaSplitTriggerRaw)){
      const labels = ['Split on recast', 'Split on hit', 'Split at max range'];
      const idx = Math.max(0, Math.min(labels.length - 1, Math.round(plasmaSplitTriggerRaw)));
      parts.push(labels[idx]);
    }
    if(Number.isFinite(barrageChannel) && barrageChannel > 0){
      const channelSeconds = barrageChannel / 1000;
      const formatted = channelSeconds >= 10 ? Math.round(channelSeconds).toString() : channelSeconds.toFixed(1);
      parts.push(`${formatted}s channel`);
    }
    if(Number.isFinite(barrageInterval) && barrageInterval > 0){
      const shotsPerSec = Math.round((1000 / barrageInterval) * 10) / 10;
      const totalShots = Number.isFinite(barrageChannel) && barrageChannel > 0
        ? Math.max(1, Math.floor(barrageChannel / barrageInterval))
        : null;
      parts.push(`${shotsPerSec} shots/s`);
      if(Number.isFinite(totalShots)) parts.push(`${totalShots} shots`);
    }
    if(Number.isFinite(stunDuration) && stunDuration > 0) parts.push(`Stun ${stunDuration}ms`);
    if(Number.isFinite(pullDistance) && pullDistance > 0) parts.push(`Pull ${pullDistance}px`);
    if(Number.isFinite(castTime) && castTime > 0) parts.push(`${castTime}ms cast`);
    if(Number.isFinite(chargeMinMs) || Number.isFinite(chargeMaxMs)){
      const minChargeSec = Number.isFinite(chargeMinMs) ? (chargeMinMs / 1000) : null;
      const maxChargeSec = Number.isFinite(chargeMaxMs) ? (chargeMaxMs / 1000) : null;
      const formatSeconds = (seconds)=>{
        if(seconds === null) return '';
        return seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(seconds >= 1 ? 1 : 2);
      };
      if(minChargeSec !== null && maxChargeSec !== null){
        if(Math.abs(minChargeSec - maxChargeSec) < 0.0001){
          parts.push(`Charge ${formatSeconds(maxChargeSec)}s`);
        } else {
          parts.push(`Charge ${formatSeconds(minChargeSec)}-${formatSeconds(maxChargeSec)}s`);
        }
      } else if(maxChargeSec !== null){
        parts.push(`Charge up to ${formatSeconds(maxChargeSec)}s`);
      } else if(minChargeSec !== null){
        parts.push(`Charge ${formatSeconds(minChargeSec)}s`);
      }
    }
    if(Number.isFinite(cooldown)) parts.push(`${cooldown}ms CD`);
    if(Number.isFinite(chargeMoveSlow) && chargeMoveSlow > 0) parts.push(`${chargeMoveSlow}% slow while charging`);
    if(Number.isFinite(postHitLockout) && postHitLockout > 0) parts.push(`${postHitLockout}ms recovery`);
    const trapCount = abilityFieldValue(ability, 'dropCount');
    if(Number.isFinite(trapCount) && trapCount > 0) parts.push(`${trapCount} traps`);
    const trapArmDelay = abilityFieldValue(ability, 'armDelayMs');
    if(Number.isFinite(trapArmDelay) && trapArmDelay > 0) parts.push(`Arm ${trapArmDelay}ms`);
    const trapLifetime = abilityFieldValue(ability, 'lifetimeMs');
    if(Number.isFinite(trapLifetime) && trapLifetime > 0) parts.push(`Lifetime ${trapLifetime}ms`);
    const trapTrigger = abilityFieldValue(ability, 'triggerRadiusPx');
    if(Number.isFinite(trapTrigger) && trapTrigger > 0) parts.push(`Trigger r${trapTrigger}px`);
    const trapAoe = abilityFieldValue(ability, 'aoeRadiusPx');
    if(Number.isFinite(trapAoe) && trapAoe > 0) parts.push(`AoE r${trapAoe}px`);
    const trapRoot = abilityFieldValue(ability, 'immobilizeMs');
    if(Number.isFinite(trapRoot) && trapRoot > 0) parts.push(`Root ${trapRoot}ms`);
    const trapMaxActive = abilityFieldValue(ability, 'maxActiveTraps');
    if(Number.isFinite(trapMaxActive) && trapMaxActive > 0) parts.push(`Max ${trapMaxActive}`);
    const placementModeRaw = abilityFieldValue(ability, 'placementMode', { skipScaling: true });
    if(Number.isFinite(placementModeRaw)){
      const modes = ['Inline drop', 'Cluster drop', 'Free drop'];
      const idx = Math.max(0, Math.min(modes.length - 1, Math.round(placementModeRaw)));
      const label = modes[idx];
      if(label) parts.push(label);
    }
    const modeCharges = abilityFieldValue(ability, 'modeCharges');
    const modeDuration = abilityFieldValue(ability, 'modeDurationMs');
    const explosionDelay = abilityFieldValue(ability, 'explosionDelayMs');
    const explosionRadius = abilityFieldValue(ability, 'aoeRadiusPx');
    const artilleryMinRange = abilityFieldValue(ability, 'minRangePx');
    const artilleryMaxRange = abilityFieldValue(ability, 'maxRangePx');
    if(Number.isFinite(modeCharges) && modeCharges > 0) parts.push(`${modeCharges} charges`);
    if(Number.isFinite(modeDuration) && modeDuration > 0) parts.push(`Mode ${Math.round(modeDuration)}ms`);
    if(Number.isFinite(explosionDelay) && explosionDelay > 0) parts.push(`Delay ${Math.round(explosionDelay)}ms`);
    if(Number.isFinite(explosionRadius) && explosionRadius > 0) parts.push(`AoE r${Math.round(explosionRadius)}px`);
    if(Number.isFinite(artilleryMaxRange) && artilleryMaxRange > 0){
      if(Number.isFinite(artilleryMinRange) && artilleryMinRange > 0){
        parts.push(`Range ${Math.round(artilleryMinRange)}-${Math.round(artilleryMaxRange)}px`);
      } else {
        parts.push(`Range ${Math.round(artilleryMaxRange)}px`);
      }
    }
    return parts.join('  ');
  }
  function clampSpellScale(value){
    let numeric = parseFloat(value);
    if(!Number.isFinite(numeric)) numeric = 1;
    numeric = Math.max(SPELL_SCALE_MIN, Math.min(SPELL_SCALE_MAX, numeric));
    return Math.round(numeric * 100) / 100;
  }
  function refreshAbilitiesForSpellScaling(){
    renderAbilityBar();
    if(isAbilityRepoOpen()){
      updateAbilityRepoSubtitle();
      renderSpellList();
    }
  }
  function setSpellSpeedScale(value, { syncInput = true } = {}){
    const next = clampSpellScale(value);
    abilityTunables.spellSpeedScale = next;
    if(syncInput && spellSpeedScaleInput){
      spellSpeedScaleInput.value = String(next);
    }
    refreshAbilitiesForSpellScaling();
  }
  function setSpellSizeScale(value, { syncInput = true } = {}){
    const next = clampSpellScale(value);
    abilityTunables.spellSizeScale = next;
    if(syncInput && spellSizeScaleInput){
      spellSizeScaleInput.value = String(next);
    }
    refreshAbilitiesForSpellScaling();
  }
  function defaultAbilityBinding(index){
    const defaults = [
      { code: 'Digit1', key: '1', label: '1' },
      { code: 'Digit2', key: '2', label: '2' },
      { code: 'Digit3', key: '3', label: '3' },
      { code: 'Digit4', key: '4', label: '4' },
      { code: 'Digit5', key: '5', label: '5' },
      { code: 'KeyQ', key: 'q', label: 'Q' },
      { code: 'KeyW', key: 'w', label: 'W' },
      { code: 'KeyE', key: 'e', label: 'E' },
      { code: 'KeyR', key: 'r', label: 'R' },
      { code: 'KeyT', key: 't', label: 'T' },
      { code: 'KeyA', key: 'a', label: 'A' },
      { code: 'KeyS', key: 's', label: 'S' },
      { code: 'KeyD', key: 'd', label: 'D' },
      { code: 'KeyF', key: 'f', label: 'F' },
      { code: 'KeyG', key: 'g', label: 'G' },
      { code: 'KeyZ', key: 'z', label: 'Z' },
      { code: 'KeyX', key: 'x', label: 'X' },
      { code: 'KeyC', key: 'c', label: 'C' },
      { code: 'KeyV', key: 'v', label: 'V' },
      { code: 'KeyB', key: 'b', label: 'B' }
    ];
    if(index < 0 || index >= defaults.length) return null;
    const binding = defaults[index];
    return { code: binding.code, key: binding.key, label: binding.label };
  }
  function formatAbilityKeyLabel(key, code){
    if(typeof key === 'string' && key.length){
      if(key === ' ') return 'Space';
      if(key.length === 1) return key.toUpperCase();
      return key.charAt(0).toUpperCase() + key.slice(1);
    }
    if(typeof code === 'string' && code.length){
      if(code.startsWith('Digit')) return code.slice(5);
      if(code.startsWith('Key')) return code.slice(3);
      return code;
    }
    return '';
  }

  const SPELL_CAST_BINDING_KEYS = {
    normal: 'normalModifier',
    quick: 'quickModifier',
    quickIndicator: 'quickIndicatorModifier'
  };

  function getSpellCastBinding(kind){
    const key = SPELL_CAST_BINDING_KEYS[kind];
    if(!key) return null;
    let binding = spellCastingConfig[key];
    if(!binding || typeof binding !== 'object'){
      binding = { key: '', code: '', label: '' };
      spellCastingConfig[key] = binding;
    }
    if(typeof binding.label !== 'string'){
      binding.label = formatAbilityKeyLabel(binding.key, binding.code);
    }
    return binding;
  }

  function updateSpellCastBindingDisplay(kind){
    const button = kind === 'normal'
      ? spellCastNormalBindBtn
      : (kind === 'quick'
        ? spellCastQuickBindBtn
        : (kind === 'quickIndicator' ? spellCastIndicatorBindBtn : null));
    if(!button) return;
    if(spellCastingRuntime.captureMode === kind){
      button.textContent = 'Press a key...';
      return;
    }
    const binding = getSpellCastBinding(kind);
    button.textContent = binding && binding.label ? binding.label : '';
  }

  function refreshSpellCastBindingDisplays(){
    updateSpellCastBindingDisplay('normal');
    updateSpellCastBindingDisplay('quick');
    updateSpellCastBindingDisplay('quickIndicator');
  }

  function normalizeCastType(value){
    const raw = typeof value === 'string' ? value.trim() : '';
    const lower = raw.toLowerCase();
    if(lower === 'normal') return 'normal';
    if(lower === 'quickindicator' || raw === 'quickIndicator') return 'quickIndicator';
    if(lower === 'none') return 'none';
    return 'quick';
  }

  function abilityAllowedCastTypes(ability){
    if(ability && ability.id === 'piercing_arrow'){
      return ['normal', 'quick'];
    }
    return ['none', 'normal', 'quickIndicator', 'quick'];
  }

  function defaultAbilityCastType(ability){
    if(ability && ability.id === 'piercing_arrow'){
      return 'quick';
    }
    return 'none';
  }

  function normalizeAbilityCastType(ability, value){
    const allowed = abilityAllowedCastTypes(ability);
    if(!allowed || allowed.length === 0){
      return normalizeCastType(value);
    }
    if(value === undefined || value === null || value === ''){
      const fallback = defaultAbilityCastType(ability);
      if(allowed.includes(fallback)){
        return fallback;
      }
    }
    const normalized = normalizeCastType(value);
    if(allowed.includes(normalized)){
      return normalized;
    }
    const fallback = defaultAbilityCastType(ability);
    if(allowed.includes(fallback)){
      return fallback;
    }
    const preferenceOrder = ['quickIndicator', 'normal', 'quick', 'none'];
    for(const candidate of preferenceOrder){
      if(allowed.includes(candidate)){
        return candidate;
      }
    }
    return allowed[0];
  }

  function setDefaultSpellCastType(value, { syncInput = true } = {}){
    const normalized = normalizeCastType(value);
    spellCastingConfig.defaultCastType = normalized;
    if(spellCastDefaultSelect && syncInput){
      spellCastDefaultSelect.value = normalized;
    }
  }

  function setSpellCastModifierBinding(kind, key, code){
    const binding = getSpellCastBinding(kind);
    if(!binding) return;
    binding.key = typeof key === 'string' ? key : '';
    binding.code = typeof code === 'string' ? code : '';
    binding.label = formatAbilityKeyLabel(binding.key, binding.code);
    refreshSpellCastBindingDisplays();
  }

  function toggleSpellCastBindingCapture(kind){
    if(spellCastingRuntime.captureMode === kind){
      spellCastingRuntime.captureMode = null;
      refreshSpellCastBindingDisplays();
      return;
    }
    spellCastingRuntime.captureMode = kind;
    refreshSpellCastBindingDisplays();
    if(kind){
      const bindingName = kind === 'normal'
        ? 'normal cast'
        : (kind === 'quick' ? 'quick cast' : 'quick indicator');
      setHudMessage(`Press a key for the ${bindingName} modifier.`);
    }
  }

  function cancelSpellCastBindingCapture(){
    if(!spellCastingRuntime.captureMode) return false;
    spellCastingRuntime.captureMode = null;
    refreshSpellCastBindingDisplays();
    return true;
  }

  function bindingMatches(binding, ev){
    if(!binding || !ev) return false;
    const code = binding.code;
    if(code && ev.code === code){
      return true;
    }
    const key = binding.key ? binding.key.toLowerCase() : '';
    if(!code && key){
      const eventKey = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
      if(eventKey === key){
        return true;
      }
    }
    return false;
  }

  function activeModifierCastType(){
    const mods = spellCastingRuntime.modifiers;
    if(mods.quickIndicator) return 'quickIndicator';
    if(mods.normal) return 'normal';
    if(mods.quick) return 'quick';
    return null;
  }

  function resolveAbilityCastType(ability){
    const modifier = activeModifierCastType();
    if(modifier) return ability ? normalizeAbilityCastType(ability, modifier) : modifier;
    const override = ability ? normalizeAbilityCastType(ability, ability.castType) : 'none';
    let base = override;
    if(base === 'none'){
      base = normalizeCastType(spellCastingConfig.defaultCastType);
    }
    if(base === 'none'){
      base = 'quick';
    }
    return base;
  }

  function eventMatchesIndicatorTrigger(indicator, ev){
    if(!indicator || !ev) return false;
    if(indicator.triggerCode && ev.code === indicator.triggerCode){
      return true;
    }
    if(!indicator.triggerCode && indicator.triggerKey){
      const key = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
      if(key === indicator.triggerKey){
        return true;
      }
    }
    return false;
  }

  function beginSkillshotIndicator(slotIndex, ability, { mode = 'normal', triggerEvent = null, pendingCast = true } = {}){
    const triggerKey = triggerEvent && typeof triggerEvent.key === 'string'
      ? triggerEvent.key.toLowerCase()
      : '';
    const triggerCode = triggerEvent && typeof triggerEvent.code === 'string'
      ? triggerEvent.code
      : '';
    const indicator = {
      slotIndex,
      abilityId: ability ? ability.id : null,
      mode,
      triggerKey,
      triggerCode,
      pendingCast: pendingCast !== false,
      abilityName: ability && (ability.shortName || ability.name) ? (ability.shortName || ability.name) : 'Ability'
    };
    spellCastingRuntime.activeIndicator = indicator;
    cancelPlayerAttack(false);
    return indicator;
  }

  function clearSkillshotIndicator(){
    if(spellCastingRuntime.activeIndicator){
      spellCastingRuntime.activeIndicator = null;
    }
  }

  function cancelSkillshotIndicator({ reason = 'cancel' } = {}){
    if(!spellCastingRuntime.activeIndicator) return false;
    const indicator = spellCastingRuntime.activeIndicator;
    spellCastingRuntime.activeIndicator = null;
    if(reason === 'pointerCancel' || reason === 'escape'){
      setHudMessage(`${indicator.abilityName} cancelled.`);
    }
    return true;
  }

  function confirmSkillshotIndicator({ cause = 'key', event = null } = {}){
    const indicator = spellCastingRuntime.activeIndicator;
    if(!indicator) return false;
    if(indicator.mode === 'quickIndicator' && indicator.pendingCast === false){
      clearSkillshotIndicator();
      return false;
    }
    const success = activateAbilitySlot(indicator.slotIndex, { triggerEvent: event, castMode: indicator.mode, indicatorConfirm: cause });
    if(success){
      clearSkillshotIndicator();
      return true;
    }
    return false;
  }

  function skillshotAimPoint(){
    if(abilityRuntime.lastPointerWorld && Number.isFinite(abilityRuntime.lastPointerWorld.x) && Number.isFinite(abilityRuntime.lastPointerWorld.y)){
      return abilityRuntime.lastPointerWorld;
    }
    return beamAimPoint();
  }

  function getSkillshotIndicatorProfile(ability){
    if(!ability) return null;
    return abilityIndicatorProfiles[ability.id] || null;
  }

  function indicatorFieldNumber(ability, key, { min = 0, fallback = 0, raw = false } = {}){
    if(!ability || !key) return fallback;
    const value = abilityFieldValue(ability, key, raw ? { skipScaling: true } : undefined);
    if(!Number.isFinite(Number(value))) return fallback;
    const numeric = Number(value);
    if(min === null || min === undefined) return numeric;
    return Math.max(min, numeric);
  }

  function configuredIndicatorLength(ability, profile){
    if(!ability || !profile) return 0;
    const keys = [profile.lengthKey, profile.maxLengthKey, profile.rangeKey, profile.distanceKey];
    for(const key of keys){
      if(!key) continue;
      const val = indicatorFieldNumber(ability, key, { min: 0, fallback: 0 });
      if(val > 0) return val;
    }
    return 0;
  }

  function drawSkillshotIndicator(){
    const indicator = spellCastingRuntime.activeIndicator;
    if(!indicator) return;
    const ability = getAbilityDefinition(indicator.abilityId);
    if(!ability){
      clearSkillshotIndicator();
      return;
    }
    const profile = getSkillshotIndicatorProfile(ability);
    const origin = getSpellOrigin(player);
    const aim = skillshotAimPoint();
    let dx = aim.x - origin.x;
    let dy = aim.y - origin.y;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;
    const stroke = indicator.mode === 'quickIndicator' ? '#9fd1ff' : '#7fe3ff';
    const fill = indicator.mode === 'quickIndicator' ? 'rgba(159, 209, 255, 0.2)' : 'rgba(127, 227, 255, 0.28)';
    const accent = indicator.mode === 'quickIndicator' ? '#b8e0ff' : '#d6f4ff';
    const configuredLength = profile ? configuredIndicatorLength(ability, profile) : 0;
    const configuredRange = profile && profile.rangeKey ? indicatorFieldNumber(ability, profile.rangeKey, { min: 0, fallback: 0 }) : 0;
    const configuredRadius = profile && profile.radiusKey ? indicatorFieldNumber(ability, profile.radiusKey, { min: 0, fallback: 0 }) : 0;
    let maxDistance = distance;
    if(profile && profile.distanceKey){
      const configuredDistance = indicatorFieldNumber(ability, profile.distanceKey, { min: 0, fallback: 0 });
      if(configuredDistance > 0){
        maxDistance = configuredDistance;
      }
    }
    if(configuredRange > 0){
      maxDistance = Math.max(maxDistance, configuredRange);
    }
    let targetDistance = maxDistance > 0 ? Math.min(distance, maxDistance) : distance;
    if(profile && profile.fixedLength && configuredLength > 0){
      targetDistance = configuredLength;
    }
    let targetX = origin.x + dirX * targetDistance;
    let targetY = origin.y + dirY * targetDistance;
    const boundingRadius = Math.max(targetDistance, maxDistance, configuredLength, configuredRange, configuredRadius, 200);
    if(!circleInCamera(origin.x, origin.y, boundingRadius + 120)){
      return;
    }

    if(profile && profile.type === 'aoe'){
      const radius = indicatorFieldNumber(ability, profile.radiusKey, { min: 0, fallback: 0 });
      if(profile.showRangeRing && maxDistance > 0){
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([14, 8]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = accent;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, maxDistance, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if(radius > 0){
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(targetX, targetY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.restore();
    } else if(profile && profile.type === 'blink'){
      const range = configuredRange > 0 ? configuredRange : configuredLength;
      const aoeRadiusRaw = profile.aoeRadiusKey ? indicatorFieldNumber(ability, profile.aoeRadiusKey, { min: 0, fallback: 0 }) : 0;
      const clampedDistance = range > 0 ? Math.min(distance, range) : targetDistance;
      targetDistance = clampedDistance;
      targetX = origin.x + dirX * targetDistance;
      targetY = origin.y + dirY * targetDistance;
      if(range > 0){
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([12, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const aoeRadius = aoeRadiusRaw > 0 ? aoeRadiusRaw : Math.max(28, (player && Number(player.r)) ? player.r * 1.4 : 32);
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(targetX, targetY, aoeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.arc(targetX, targetY, aoeRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.restore();
    } else if(profile && profile.type === 'trapPlacement'){
      const range = configuredRange > 0 ? configuredRange : 0;
      const pointerDistance = range > 0 ? Math.min(distance, range) : distance;
      targetDistance = pointerDistance;
      targetX = origin.x + dirX * pointerDistance;
      targetY = origin.y + dirY * pointerDistance;
      const count = profile.countKey ? Math.max(0, Math.floor(indicatorFieldNumber(ability, profile.countKey, { min: 0, fallback: 0 }))) : 0;
      const spacing = profile.spacingKey ? indicatorFieldNumber(ability, profile.spacingKey, { min: 0, fallback: 0 }) : 0;
      const minSpacing = profile.minSpacingKey ? indicatorFieldNumber(ability, profile.minSpacingKey, { min: 0, fallback: 0 }) : 0;
      const triggerRadius = profile.triggerRadiusKey ? indicatorFieldNumber(ability, profile.triggerRadiusKey, { min: 0, fallback: 0 }) : 0;
      const aoeRadius = profile.aoeRadiusKey ? indicatorFieldNumber(ability, profile.aoeRadiusKey, { min: 0, fallback: 0 }) : 0;
      const placementMode = profile.modeKey ? indicatorFieldNumber(ability, profile.modeKey, { min: null, fallback: 0, raw: true }) : 0;
      const trapRadius = Math.max(16, triggerRadius * 0.6);
      const placements = count > 0
        ? computeTrapPlacements(origin.x, origin.y, dirX, dirY, pointerDistance, {
            count,
            spacing,
            minSpacing,
            maxRange: range,
            mode: placementMode
          })
        : [];
      const adjustedPlacements = placements.map(p => ({ x: p.x, y: p.y }));
      enforceTrapSpacing(adjustedPlacements, minSpacing, origin.x, origin.y, trapRadius, range);
      const resolvedPlacements = [];
      for(const candidate of adjustedPlacements){
        if(!candidate) continue;
        const resolved = resolveTrapPlacement(origin.x, origin.y, candidate.x, candidate.y, trapRadius, range);
        if(resolved) resolvedPlacements.push(resolved);
      }
      if(range > 0){
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([12, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const outerRadius = Math.max(triggerRadius, aoeRadius, trapRadius);
      for(const pos of resolvedPlacements){
        if(!circleInCamera(pos.x, pos.y, outerRadius + 60)) continue;
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, trapRadius, 0, Math.PI * 2);
        ctx.fill();
        if(triggerRadius > 0){
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 2;
          ctx.strokeStyle = stroke;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, triggerRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        if(aoeRadius > triggerRadius){
          ctx.globalAlpha = 0.6;
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = accent;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, aoeRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.restore();
    } else {
      let slamImpactRadius = 0;
      ctx.save();
      ctx.translate(origin.x, origin.y);
      const angle = Math.atan2(dirY, dirX);
      ctx.rotate(angle);
      if(profile && profile.type === 'trapezoid'){
        const length = indicatorFieldNumber(ability, profile.lengthKey, { min: 0, fallback: 0 });
        const startWidth = indicatorFieldNumber(ability, profile.startWidthKey, { min: 2, fallback: 2 });
        const endWidth = indicatorFieldNumber(ability, profile.endWidthKey, { min: 2, fallback: startWidth });
        const effectiveLength = length > 0 ? Math.min(length, targetDistance) : targetDistance;
        const halfStart = startWidth / 2;
        const halfEnd = endWidth / 2;
        ctx.beginPath();
        ctx.moveTo(0, -halfStart);
        ctx.lineTo(effectiveLength, -halfEnd);
        ctx.lineTo(effectiveLength, halfEnd);
        ctx.lineTo(0, halfStart);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      } else if(profile && profile.type === 'chargeLine'){
        const minLength = indicatorFieldNumber(ability, profile.minLengthKey, { min: 0, fallback: 0 });
        const maxLength = indicatorFieldNumber(ability, profile.maxLengthKey, { min: minLength, fallback: minLength });
        const width = indicatorFieldNumber(ability, profile.widthKey, { min: 2, fallback: 2 });
        const halfWidth = width / 2;
        const effectiveMax = maxLength > 0 ? maxLength : targetDistance;
        ctx.beginPath();
        ctx.moveTo(0, -halfWidth);
        ctx.lineTo(effectiveMax, -halfWidth);
        ctx.lineTo(effectiveMax, halfWidth);
        ctx.lineTo(0, halfWidth);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        if(minLength > 0){
          const effectiveMin = Math.min(minLength, effectiveMax);
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = accent;
          ctx.beginPath();
          ctx.moveTo(effectiveMin, -halfWidth);
          ctx.lineTo(effectiveMin, halfWidth);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if(profile && profile.type === 'cone'){
        const length = indicatorFieldNumber(ability, profile.lengthKey, { min: 0, fallback: 0 });
        const width = indicatorFieldNumber(ability, profile.widthKey, { min: 0, fallback: 0 });
        const effectiveLength = length > 0 ? Math.min(length, targetDistance) : targetDistance;
        const halfWidth = width / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(effectiveLength, -halfWidth);
        ctx.lineTo(effectiveLength, halfWidth);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        const count = profile.countKey ? Math.max(0, Math.floor(indicatorFieldNumber(ability, profile.countKey, { min: 0, fallback: 0 }))) : 0;
        if(count > 0){
          const projectileWidth = profile.projectileWidthKey
            ? indicatorFieldNumber(ability, profile.projectileWidthKey, { min: 1, fallback: 6 })
            : Math.max(4, width / Math.max(1, count));
          const lineWidth = Math.max(2, Math.min(projectileWidth, 48));
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.lineCap = 'round';
          ctx.strokeStyle = accent;
          ctx.lineWidth = lineWidth;
          for(let i = 0; i < count; i++){
            const fraction = count > 1 ? (i / (count - 1)) : 0.5;
            const offset = (fraction - 0.5) * width;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(effectiveLength, offset);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else if(profile && profile.type === 'slam'){
        const fissureLength = indicatorFieldNumber(ability, profile.fissureLengthKey, { min: 0, fallback: 0 });
        const fissureWidth = indicatorFieldNumber(ability, profile.fissureWidthKey, { min: 0, fallback: 0 });
        slamImpactRadius = indicatorFieldNumber(ability, profile.impactRadiusKey, { min: 0, fallback: 0 });
        const effectiveLength = fissureLength > 0 ? fissureLength : targetDistance;
        if(fissureWidth > 0 && effectiveLength > 0){
          ctx.beginPath();
          ctx.rect(0, -fissureWidth / 2, effectiveLength, fissureWidth);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = stroke;
          ctx.stroke();
        }
      } else {
        const width = profile && profile.widthKey ? indicatorFieldNumber(ability, profile.widthKey, { min: 2, fallback: 2 }) : 24;
        const dynamic = !profile || !profile.fixedLength && (!profile.lengthKey || configuredLength <= 0);
        const effectiveLength = dynamic ? targetDistance : Math.min(configuredLength, targetDistance);
        const halfWidth = width / 2;
        ctx.beginPath();
        ctx.moveTo(0, -halfWidth);
        ctx.lineTo(effectiveLength, -halfWidth);
        ctx.lineTo(effectiveLength, halfWidth);
        ctx.lineTo(0, halfWidth);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        if(profile && profile.splitAngleKey){
          const projectileRange = profile.lengthKey ? indicatorFieldNumber(ability, profile.lengthKey, { min: 0, fallback: effectiveLength }) : effectiveLength;
          const aimDistance = distance;
          const splitDistance = projectileRange > 0 ? Math.min(aimDistance, projectileRange) : effectiveLength;
          const remainingRange = projectileRange > 0 ? Math.max(0, projectileRange - splitDistance) : Math.max(0, effectiveLength - splitDistance);
          const projectileWidth = profile.widthKey ? indicatorFieldNumber(ability, profile.widthKey, { min: 1, fallback: 6 }) : width;
          const markerRadius = Math.max(6, Math.min(projectileWidth * 0.75, 28));
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(splitDistance, 0, markerRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          if(remainingRange > 0){
            const splitAngleDeg = indicatorFieldNumber(ability, profile.splitAngleKey, { min: 0, fallback: 0 });
            const splitAngle = splitAngleDeg * Math.PI / 180;
            const branchWidth = Math.max(2, Math.min(projectileWidth, 36));
            const drawBranch = (angle)=>{
              const endX = splitDistance + Math.cos(angle) * remainingRange;
              const endY = Math.sin(angle) * remainingRange;
              ctx.beginPath();
              ctx.moveTo(splitDistance, 0);
              ctx.lineTo(endX, endY);
              ctx.stroke();
            };
            ctx.save();
            ctx.globalAlpha = 0.75;
            ctx.lineCap = 'round';
            ctx.strokeStyle = accent;
            ctx.lineWidth = branchWidth;
            if(splitAngle > 0.001){
              drawBranch(splitAngle);
              drawBranch(-splitAngle);
            } else {
              drawBranch(0);
            }
            ctx.restore();
          }
        }
      }
      ctx.restore();
      if(profile && profile.type === 'slam' && slamImpactRadius > 0){
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, slamImpactRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, slamImpactRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function handleSpellCastModifierKeyDown(ev){
    if(ev.repeat) return false;
    let handled = false;
    if(bindingMatches(getSpellCastBinding('normal'), ev)){
      spellCastingRuntime.modifiers.normal = true;
      handled = true;
    }
    if(bindingMatches(getSpellCastBinding('quick'), ev)){
      spellCastingRuntime.modifiers.quick = true;
      handled = true;
    }
    if(bindingMatches(getSpellCastBinding('quickIndicator'), ev)){
      spellCastingRuntime.modifiers.quickIndicator = true;
      handled = true;
    }
    return handled;
  }

  function handleSpellCastModifierKeyUp(ev){
    if(bindingMatches(getSpellCastBinding('normal'), ev)){
      spellCastingRuntime.modifiers.normal = false;
    }
    if(bindingMatches(getSpellCastBinding('quick'), ev)){
      spellCastingRuntime.modifiers.quick = false;
    }
    if(bindingMatches(getSpellCastBinding('quickIndicator'), ev)){
      spellCastingRuntime.modifiers.quickIndicator = false;
    }
  }

  function handleAbilityActivationRequest(slotIndex, triggerEvent){
    const resolution = resolveAbilityCast(slotIndex, {});
    if(!resolution.success){
      if(resolution.message){
        setHudMessage(resolution.message);
      }
      return false;
    }

    const ability = resolution.ability;
    const castMode = resolution.castMode;
    const supportsIndicator = resolution.supportsIndicator;
    const active = spellCastingRuntime.activeIndicator;

    if(resolution.ability && resolution.ability.id === 'rite_arcane'){
      const artilleryMode = activeArcaneRiteModeForCaster(player);
      if(artilleryMode && artilleryMode.abilityId === resolution.ability.id){
        if(triggerEvent && typeof triggerEvent.preventDefault === 'function'){
          triggerEvent.preventDefault();
        }
        const aimPoint = beamAimPoint();
        if(!scheduleArcaneRiteExplosion(artilleryMode, aimPoint.x, aimPoint.y)){
          setHudMessage(`${artilleryMode.abilityName || 'Artillery'} cannot fire right now.`);
        }
        return true;
      }
    }

    if(active){
      if(active.slotIndex === slotIndex && supportsIndicator && (castMode === 'normal' || castMode === 'quickIndicator') && eventMatchesIndicatorTrigger(active, triggerEvent)){
        if(active.mode === 'quickIndicator'){
          active.pendingCast = true;
        }
        confirmSkillshotIndicator({ cause: 'key', event: triggerEvent });
        return true;
      }
      cancelSkillshotIndicator({ reason: 'cancel' });
    }

    if(castMode === 'normal' || castMode === 'quickIndicator'){
      if(!supportsIndicator){
        return activateAbilitySlot(slotIndex, { triggerEvent, castMode: 'quick' });
      }
      const pendingCast = castMode !== 'quickIndicator';
      beginSkillshotIndicator(slotIndex, ability, { mode: castMode, triggerEvent, pendingCast });
      if(castMode === 'quickIndicator'){
        const indicator = spellCastingRuntime.activeIndicator;
        if(indicator){
          indicator.pendingCast = false;
        }
      }
      return true;
    }

    return activateAbilitySlot(slotIndex, { triggerEvent, castMode });
  }
  function ensureAbilityHotkeys(){ abilityHotkeys.length = abilityBarState.count; }
  function ensureAbilitySlotStates(){
    abilitySlotStates.length = abilityBarState.count;
    for(let i=0;i<abilityBarState.count;i++){
      if(!abilitySlotStates[i]) abilitySlotStates[i] = { cooldown: 0 };
    }
  }
  function setAbilityOrientation(value, { syncInput = true } = {}){
    const normalized = value === 'vertical' ? 'vertical' : 'horizontal';
    abilityBarState.orientation = normalized;
    if(abilityOrientationSelect && syncInput){
      abilityOrientationSelect.value = normalized;
    }
    renderAbilityBar();
  }
  function setAbilityHealthPlacementHorizontal(value, { syncInput = true } = {}){
    const normalized = value === 'top' ? 'top' : 'bottom';
    abilityBarState.healthPlacement.horizontal = normalized;
    if(abilityHealthHorizontalSelect && syncInput){
      abilityHealthHorizontalSelect.value = normalized;
    }
    applyAbilityLayout();
  }
  function setAbilityHealthPlacementVertical(value, { syncInput = true } = {}){
    const normalized = value === 'left' ? 'left' : 'right';
    abilityBarState.healthPlacement.vertical = normalized;
    if(abilityHealthVerticalSelect && syncInput){
      abilityHealthVerticalSelect.value = normalized;
    }
    applyAbilityLayout();
  }
  function setAbilityHealthTextPlacementVertical(value, { syncInput = true } = {}){
    const normalized = value === 'top' ? 'top' : 'bottom';
    abilityBarState.healthPlacement.textVertical = normalized;
    if(abilityHealthVerticalTextSelect && syncInput){
      abilityHealthVerticalTextSelect.value = normalized;
    }
    applyAbilityLayout();
  }
  function setAbilityStatsPlacementVertical(value, { syncInput = true } = {}){
    const normalized = value === 'bottom' ? 'bottom' : 'top';
    abilityBarState.statsPlacementVertical = normalized;
    if(abilityStatsVerticalSelect && syncInput){
      abilityStatsVerticalSelect.value = normalized;
    }
    applyAbilityLayout();
  }
  function isHudStatsCollapsed(){
    return hudStatsDock && hudStatsDock.getAttribute('data-collapsed') === 'true';
  }
  function updateHudStatsToggleIcon(collapsed = isHudStatsCollapsed()){
    if(!hudStatsToggleIcon){
      return;
    }
    const orientation = abilityBarState.orientation === 'vertical' ? 'vertical' : 'horizontal';
    if(orientation === 'vertical'){
      hudStatsToggleIcon.textContent = collapsed ? '' : '';
    } else {
      hudStatsToggleIcon.textContent = collapsed ? '' : '';
    }
  }
  function applyAbilityLayout(){
    const orientation = abilityBarState.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const horizontalPlacement = abilityBarState.healthPlacement.horizontal === 'top' ? 'top' : 'bottom';
    const verticalPlacement = abilityBarState.healthPlacement.vertical === 'left' ? 'left' : 'right';
    const statsVerticalPlacement = abilityBarState.statsPlacementVertical === 'bottom' ? 'bottom' : 'top';
    const healthTextVerticalPlacement = abilityBarState.healthPlacement.textVertical === 'top' ? 'top' : 'bottom';
    if(abilityBarEl){
      abilityBarEl.dataset.orientation = orientation;
    }
    if(hudAbilityStackEl){
      hudAbilityStackEl.dataset.orientation = orientation;
      hudAbilityStackEl.dataset.horizontalPlacement = horizontalPlacement;
      hudAbilityStackEl.dataset.verticalPlacement = verticalPlacement;
      if(orientation === 'vertical'){
        hudAbilityStackEl.dataset.healthTextPlacement = healthTextVerticalPlacement;
      } else {
        delete hudAbilityStackEl.dataset.healthTextPlacement;
      }
    }
    if(hudAbilityBarWrapEl){
      hudAbilityBarWrapEl.dataset.orientation = orientation;
    }
    if(hudStatsAbilityGroup){
      hudStatsAbilityGroup.dataset.orientation = orientation;
      hudStatsAbilityGroup.dataset.verticalPlacement = statsVerticalPlacement;
    }
    if(hudStatsDock){
      hudStatsDock.dataset.orientation = orientation;
      hudStatsDock.dataset.verticalPlacement = statsVerticalPlacement;
    }
    if(hudStatsPanel){
      hudStatsPanel.dataset.orientation = orientation;
      hudStatsPanel.dataset.verticalPlacement = statsVerticalPlacement;
    }
    if(hudStatsToggle){
      hudStatsToggle.dataset.orientation = orientation;
      hudStatsToggle.dataset.verticalPlacement = statsVerticalPlacement;
    }
    if(hudAbilityVitalsWrap){
      hudAbilityVitalsWrap.dataset.orientation = orientation;
      hudAbilityVitalsWrap.dataset.horizontalPlacement = horizontalPlacement;
      hudAbilityVitalsWrap.dataset.verticalPlacement = verticalPlacement;
    }
    if(hudVitals){
      hudVitals.dataset.orientation = orientation;
      if(orientation === 'vertical'){
        const scale = Math.max(0, Number(abilityBarState.scale) || 0);
        const slotSize = 48 * scale;
        const gap = 8 * scale;
        const count = Math.max(abilityBarState.count, 1);
        const estimatedHeight = count * slotSize + Math.max(0, count - 1) * gap + 16;
        hudVitals.style.setProperty('--hud-health-vertical-height', `${Math.max(estimatedHeight, 48)}px`);
      } else {
        hudVitals.style.removeProperty('--hud-health-vertical-height');
      }
    }
    if(hudVitalsBar){
      hudVitalsBar.dataset.orientation = orientation;
      if(orientation === 'vertical'){
        hudVitalsBar.dataset.textPlacement = healthTextVerticalPlacement;
      } else {
        delete hudVitalsBar.dataset.textPlacement;
      }
    }
    if(hudHpFill){
      hudHpFill.dataset.orientation = orientation;
    }
    if(hudHpText){
      hudHpText.dataset.orientation = orientation;
      if(orientation === 'vertical'){
        if(hudAbilityStackEl){
          if(hudHpText.parentElement !== hudAbilityStackEl){
            hudAbilityStackEl.insertBefore(hudHpText, hudAbilityStackEl.firstChild || null);
          } else if(hudAbilityStackEl.firstChild !== hudHpText){
            hudAbilityStackEl.insertBefore(hudHpText, hudAbilityStackEl.firstChild);
          }
        }
      } else if(hudHpTextDefaultParent && hudHpText.parentElement !== hudHpTextDefaultParent){
        if(hudHpTextDefaultNextSibling && hudHpTextDefaultNextSibling.parentNode === hudHpTextDefaultParent){
          hudHpTextDefaultParent.insertBefore(hudHpText, hudHpTextDefaultNextSibling);
        } else {
          hudHpTextDefaultParent.appendChild(hudHpText);
        }
      }
    }
    updateHudHealth();
    updateHudStatsToggleIcon();
    scheduleHudFit();
  }
  function getAbilitySlotState(index){
    ensureAbilitySlotStates();
    return abilitySlotStates[index] || null;
  }
  function getAbilityBinding(index){
    ensureAbilityHotkeys();
    return abilityHotkeys[index] || defaultAbilityBinding(index);
  }
  function ensureAbilityAssignments(){
    abilityAssignments.length = abilityBarState.count;
    if(abilityBarState.count <= 0) return;
    const used = new Set();
    for(let i=0;i<abilityBarState.count;i++){
      const id = abilityAssignments[i];
      if(id && abilityDefinitions[id] && !used.has(id)){
        used.add(id);
      } else {
        abilityAssignments[i] = null;
      }
    }
    const pool = Object.keys(abilityDefinitions).filter(id => !used.has(id));
    for(let i=0;i<abilityBarState.count;i++){
      if(abilityAssignments[i]) continue;
      if(pool.length === 0) break;
      const pick = Math.floor(Math.random() * pool.length);
      const [id] = pool.splice(pick, 1);
      abilityAssignments[i] = id;
      used.add(id);
    }
  }
  function isAbilityRepoOpen(){ return !!(abilityRepoEl && abilityRepoEl.classList.contains('open')); }
  function resetAbilityEditor(){
    abilityBarState.editingAbilityId = null;
    if(spellEditorPlaceholder) spellEditorPlaceholder.hidden = false;
    if(spellEditorForm){
      spellEditorForm.innerHTML = '';
      spellEditorForm.hidden = true;
    }
  }
  function highlightActiveAbilitySlot(){
    if(!abilityBarEl) return;
    const slots = abilityBarEl.querySelectorAll('.abilitySlot');
    slots.forEach(slot => {
      const index = Number(slot.dataset.index);
      slot.classList.toggle('selected', Number.isFinite(index) && index === abilityBarState.activeSlotIndex);
    });
  }
  function updateAbilityRepoSubtitle(){
    if(!abilityRepoSubtitle) return;
    if(abilityBarState.activeSlotIndex === null){
      abilityRepoSubtitle.textContent = 'Select a spell to assign.';
      return;
    }
    const slotNumber = abilityBarState.activeSlotIndex + 1;
    const abilityId = abilityAssignments[abilityBarState.activeSlotIndex];
    const ability = abilityId ? getAbilityDefinition(abilityId) : null;
    const binding = getAbilityBinding(abilityBarState.activeSlotIndex);
    const hotkeyLabel = binding ? binding.label : '';
    const hotkeyText = hotkeyLabel && hotkeyLabel !== '' ? `Hotkey ${hotkeyLabel}` : 'No hotkey';
    if(ability){
      abilityRepoSubtitle.textContent = `Slot ${slotNumber} (${hotkeyText})  ${ability.name}`;
    } else {
      abilityRepoSubtitle.textContent = `Assign a spell to slot ${slotNumber} (${hotkeyText}).`;
    }
  }
  function renderSpellList(){
    if(!spellListEl) return;
    spellListEl.innerHTML = '';
    if(abilityBarState.activeSlotIndex === null){
      const msg = document.createElement('div');
      msg.className = 'spellEmpty';
      msg.textContent = 'Select an ability slot to view spells.';
      spellListEl.appendChild(msg);
      return;
    }
    const abilities = listAbilities();
    if(!abilities.length){
      const empty = document.createElement('div');
      empty.className = 'spellEmpty';
      empty.textContent = 'No spells available yet.';
      spellListEl.appendChild(empty);
      return;
    }
    const assignedId = abilityAssignments[abilityBarState.activeSlotIndex];
    const equippedSet = new Set(abilityAssignments.filter(Boolean));
    abilities.forEach(ability => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'spellCard';
      option.dataset.abilityId = ability.id;
      option.setAttribute('role', 'option');
      option.setAttribute('tabindex', '0');
      option.setAttribute('aria-selected', ability.id === assignedId ? 'true' : 'false');
      option.title = abilitySummary(ability);
      if(ability.id === assignedId) option.classList.add('selected');
      if(ability.id === abilityBarState.editingAbilityId) option.classList.add('editing');
      if(equippedSet.has(ability.id)) option.classList.add('equipped');
      const name = document.createElement('div');
      name.className = 'spellName';
      name.textContent = ability.name;
      option.appendChild(name);
      const desc = document.createElement('div');
      desc.className = 'spellDesc';
      desc.textContent = ability.description;
      option.appendChild(desc);
      const summary = document.createElement('div');
      summary.className = 'spellSummary';
      summary.textContent = abilitySummary(ability);
      option.appendChild(summary);
      option.addEventListener('click', ()=> selectAbilityForActiveSlot(ability.id));
      option.addEventListener('keydown', (ev)=>{
        if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); selectAbilityForActiveSlot(ability.id); }
      });
      option.addEventListener('contextmenu', (ev)=>{
        ev.preventDefault();
        showAbilityEditor(ability.id);
      });
      spellListEl.appendChild(option);
    });
  }
  function showAbilityEditor(abilityId){
    const ability = getAbilityDefinition(abilityId);
    if(!ability || !spellEditorForm){
      resetAbilityEditor();
      return;
    }
    abilityBarState.editingAbilityId = abilityId;
    if(spellEditorPlaceholder) spellEditorPlaceholder.hidden = true;
    spellEditorForm.hidden = false;
    spellEditorForm.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'editorTitle';
    title.textContent = `${ability.name} attributes`;
    spellEditorForm.appendChild(title);
    const subtitle = document.createElement('div');
    subtitle.className = 'editorSubtitle';
    subtitle.textContent = ability.description;
    spellEditorForm.appendChild(subtitle);
    const castRow = document.createElement('div');
    castRow.className = 'editorRow';
    const castLabel = document.createElement('label');
    const castSelectId = `spell-${ability.id}-castType`;
    castLabel.setAttribute('for', castSelectId);
    castLabel.textContent = 'Default cast behavior';
    const castSelect = document.createElement('select');
    castSelect.id = castSelectId;
    const castOptions = [
      { value: 'none', label: 'Use player default' },
      { value: 'normal', label: 'Normal cast' },
      { value: 'quickIndicator', label: 'Quick cast with indicator' },
      { value: 'quick', label: 'Quick cast' }
    ];
    const allowedCastTypes = new Set(abilityAllowedCastTypes(ability));
    castSelect.innerHTML = castOptions
      .filter(option => allowedCastTypes.has(option.value))
      .map(option => `<option value="${option.value}">${option.label}</option>`)
      .join('');
    const normalizedAbilityCastType = normalizeAbilityCastType(ability, ability.castType);
    castSelect.value = normalizedAbilityCastType;
    castSelect.addEventListener('change', ()=>{
      ability.castType = normalizeAbilityCastType(ability, castSelect.value);
      castSelect.value = ability.castType;
      if(isAbilityRepoOpen()) renderSpellList();
    });
    castRow.appendChild(castLabel);
    castRow.appendChild(castSelect);
    spellEditorForm.appendChild(castRow);
    ability.fields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'editorRow';
      const label = document.createElement('label');
      const inputId = `spell-${ability.id}-${field.key}`;
      label.setAttribute('for', inputId);
      const labelText = document.createElement('span');
      labelText.textContent = field.label;
      const range = document.createElement('span');
      range.className = 'editorRange';
      range.textContent = `${field.min}${field.max}${field.unit || ''}`;
      label.appendChild(labelText);
      label.appendChild(range);
      const input = document.createElement('input');
      input.type = 'number';
      input.id = inputId;
      input.min = String(field.min);
      input.max = String(field.max);
      if(field.step) input.step = String(field.step);
      input.value = String(field.value);
      input.addEventListener('input', ()=>{
        const clamped = clampFieldValue(field, input.value);
        field.value = clamped;
        input.value = String(clamped);
        renderAbilityBar();
        if(isAbilityRepoOpen()) renderSpellList();
      });
      row.appendChild(label);
      row.appendChild(input);
      spellEditorForm.appendChild(row);
    });
    if(isAbilityRepoOpen()) renderSpellList();
  }
  function selectAbilityForActiveSlot(abilityId){
    if(abilityBarState.activeSlotIndex === null) return;
    abilityAssignments[abilityBarState.activeSlotIndex] = abilityId;
    const state = getAbilitySlotState(abilityBarState.activeSlotIndex);
    if(state){ state.cooldown = 0; }
    renderAbilityBar();
    updateAbilityRepoSubtitle();
    refreshAbilityCooldownUI();
    if(isAbilityRepoOpen()) renderSpellList();
    closeAbilityRepository();
  }
  function serializeAbilityFields(ability){
    if(!ability || !Array.isArray(ability.fields)) return {};
    const fields = {};
    ability.fields.forEach(field => {
      if(!field || typeof field.key === 'undefined') return;
      const key = String(field.key);
      fields[key] = {
        value: field.value,
        min: field.min,
        max: field.max,
        step: field.step,
        unit: field.unit || ''
      };
      if(field.scale){
        fields[key].scale = field.scale;
      }
    });
    return fields;
  }
  function buildSpellConfigSnapshot(){
    const snapshot = {
      generatedAt: new Date().toISOString(),
      abilityTunables: {
        spellSpeedScale: abilityTunables.spellSpeedScale,
        spellSizeScale: abilityTunables.spellSizeScale
      },
      abilities: {}
    };
    listAbilities().forEach(ability => {
      if(!ability || !ability.id) return;
      snapshot.abilities[ability.id] = {
        id: ability.id,
        name: ability.name,
        shortName: ability.shortName,
        description: ability.description,
        castType: normalizeAbilityCastType(ability, ability.castType),
        fields: serializeAbilityFields(ability)
      };
    });
    return snapshot;
  }
  function formatSpellConfigFilename(){
    const now = new Date();
    const pad = (value)=> String(value).padStart(2, '0');
    const base = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `spell-configs-${base}.json`;
  }
  function saveSpellConfigurations(){
    const snapshot = buildSpellConfigSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = formatSpellConfigFilename();
    const parent = document.body || document.documentElement;
    if(parent){
      parent.appendChild(link);
      link.click();
      parent.removeChild(link);
    } else {
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function openAbilityRepository(slotIndex){
    if(slotIndex < 0 || slotIndex >= abilityBarState.count) return;
    abilityBarState.activeSlotIndex = slotIndex;
    resetAbilityEditor();
    if(abilityRepoEl){
      abilityRepoEl.classList.add('open');
      abilityRepoEl.setAttribute('aria-hidden', 'false');
    }
    updateAbilityRepoSubtitle();
    renderSpellList();
    highlightActiveAbilitySlot();
  }
  function closeAbilityRepository(){
    if(abilityRepoEl){
      abilityRepoEl.classList.remove('open');
      abilityRepoEl.setAttribute('aria-hidden', 'true');
    }
    abilityBarState.activeSlotIndex = null;
    resetAbilityEditor();
    updateAbilityRepoSubtitle();
    highlightActiveAbilitySlot();
  }
  function updateAbilityHotkeyHint(){
    /* Ability hotkey tooltip removed */
  }
  function enterAbilityHotkeyMode(){
    if(abilityBarState.count <= 0){
      setHudMessage('No ability slots to map. Increase the ability count first.');
      return;
    }
    abilityBarState.hotkeyMode = true;
    abilityBarState.hotkeyCaptureIndex = null;
    if(isAbilityRepoOpen()) closeAbilityRepository();
    updateAbilityHotkeyHint();
    renderAbilityBar();
    setHudMessage('Hotkey mapping active  click a slot, then press a key. Press Esc to exit.');
  }
  function exitAbilityHotkeyMode(){
    if(!abilityBarState.hotkeyMode) return;
    abilityBarState.hotkeyMode = false;
    abilityBarState.hotkeyCaptureIndex = null;
    updateAbilityHotkeyHint();
    renderAbilityBar();
    setHudMessage();
  }
  function startAbilityHotkeyCapture(index){
    if(!abilityBarState.hotkeyMode){
      enterAbilityHotkeyMode();
      if(!abilityBarState.hotkeyMode) return;
    }
    if(index < 0 || index >= abilityBarState.count) return;
    if(abilityBarState.hotkeyCaptureIndex === index){
      stopAbilityHotkeyCapture();
      return;
    }
    abilityBarState.hotkeyCaptureIndex = index;
    updateAbilityHotkeyHint();
    renderAbilityBar();
    setHudMessage(`Press a key to bind slot ${index + 1}. Press Esc to cancel.`);
  }
  function stopAbilityHotkeyCapture(options = {}){
    if(abilityBarState.hotkeyCaptureIndex === null) return;
    abilityBarState.hotkeyCaptureIndex = null;
    updateAbilityHotkeyHint();
    renderAbilityBar();
    if(!options.silent){
      setHudMessage('Hotkey mapping active  click a slot, then press a key. Press Esc to exit.');
    }
  }
  function sanitizeAbilityCount(value){
    const next = Number(value);
    if(!Number.isFinite(next)) return clamp(abilityBarState.count, 0, 20);
    return clamp(next, 0, 20);
  }
  function sanitizeAbilityScale(value){
    let next = parseFloat(value);
    if(!Number.isFinite(next)) next = abilityBarState.scale;
    next = Math.max(0, Math.min(4, next));
    return Math.round(next * 100) / 100;
  }
  function abilityKeyLabel(index){
    const binding = getAbilityBinding(index);
    return binding ? binding.label : '';
  }
  function renderAbilityBar(){
    if(!abilityBarEl) return;
    ensureAbilityAssignments();
    ensureAbilityHotkeys();
    ensureAbilitySlotStates();
    abilityBarEl.innerHTML = '';
    const orientation = abilityBarState.orientation === 'vertical' ? 'vertical' : 'horizontal';
    abilityBarEl.dataset.orientation = orientation;
    const abilityWrap = abilityBarEl.closest('.hudAbilityBarWrap');
    if(abilityWrap){
      abilityWrap.dataset.orientation = orientation;
    }
    const scale = abilityBarState.scale > 0 ? abilityBarState.scale : 1;
    abilityBarEl.style.setProperty('--ability-scale', String(scale));
    abilityBarEl.dataset.hotkeyMode = abilityBarState.hotkeyMode ? 'true' : 'false';
    abilityBarEl.dataset.hotkeyCapturing = abilityBarState.hotkeyCaptureIndex !== null ? 'true' : 'false';
    for(let i=0;i<abilityBarState.count;i++){
      const slot = document.createElement('div');
      slot.className = 'abilitySlot';
      if(abilityBarState.hotkeyMode) slot.classList.add('hotkey-mode');
      if(abilityBarState.hotkeyCaptureIndex === i) slot.classList.add('hotkey-capturing');
      slot.dataset.index = String(i);
      slot.setAttribute('role', 'button');
      slot.setAttribute('tabindex', '0');
      slot.setAttribute('aria-haspopup', 'dialog');
      const abilityId = abilityAssignments[i];
      const ability = abilityId ? getAbilityDefinition(abilityId) : null;
      const binding = getAbilityBinding(i);
      const hotkeyLabel = binding ? binding.label : '';
      const hotkeyTitle = hotkeyLabel && hotkeyLabel !== '' ? `Hotkey: ${hotkeyLabel}` : 'No hotkey assigned';
      if(ability){
        slot.dataset.hasAbility = 'true';
        const label = document.createElement('span');
        label.className = 'abilityName';
        label.textContent = ability.shortName || ability.name;
        slot.appendChild(label);
        slot.title = `${ability.name}  ${abilitySummary(ability)} (${hotkeyTitle})`;
        slot.setAttribute('aria-label', `${ability.name}. ${abilitySummary(ability)}. ${hotkeyTitle}.`);
      } else {
        slot.dataset.hasAbility = 'false';
        slot.title = `Empty ability slot (${hotkeyTitle})`;
        slot.setAttribute('aria-label', `Empty ability slot ${i+1}. ${hotkeyTitle}.`);
      }
      const key = document.createElement('span');
      key.className = 'abilityKey';
      key.textContent = abilityBarState.hotkeyCaptureIndex === i ? '??' : abilityKeyLabel(i);
      slot.appendChild(key);
      const state = getAbilitySlotState(i);
      slot.dataset.cooldown = state && state.cooldown > 0 ? 'true' : 'false';
      const activateSlot = (ev)=>{
        if(abilityBarState.hotkeyMode){
          ev.preventDefault();
          ev.stopPropagation();
          startAbilityHotkeyCapture(i);
          return;
        }
        openAbilityRepository(i);
      };
      slot.addEventListener('click', activateSlot);
      slot.addEventListener('keydown', (ev)=>{
        if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); activateSlot(ev); }
      });
      slot.addEventListener('contextmenu', (ev)=>{ ev.preventDefault(); activateSlot(ev); });
      abilityBarEl.appendChild(slot);
    }
    const visible = abilityBarState.count > 0 && abilityBarState.scale > 0;
    abilityBarEl.classList.toggle('visible', visible);
    abilityBarEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
    highlightActiveAbilitySlot();
    refreshAbilityCooldownUI();
    updateAbilityHotkeyHint();
    applyAbilityLayout();
  }
  function setAbilityBar(count = abilityBarState.count, scale = abilityBarState.scale, syncInputs = true){
    abilityBarState.count = sanitizeAbilityCount(count);
    abilityBarState.scale = sanitizeAbilityScale(scale);
    ensureAbilityAssignments();
    ensureAbilityHotkeys();
    ensureAbilitySlotStates();
    if(syncInputs){
      if(abilityCountInput){ abilityCountInput.value = String(abilityBarState.count); }
      if(abilityScaleInput){ abilityScaleInput.value = String(abilityBarState.scale); }
    }
    const repoOpen = isAbilityRepoOpen();
    if(abilityBarState.count === 0){
      abilityBarState.activeSlotIndex = null;
      if(abilityBarState.hotkeyMode) exitAbilityHotkeyMode();
      abilityBarState.hotkeyCaptureIndex = null;
      if(repoOpen) closeAbilityRepository();
    } else if(repoOpen){
      if(abilityBarState.activeSlotIndex === null || abilityBarState.activeSlotIndex >= abilityBarState.count){
        abilityBarState.activeSlotIndex = Math.max(0, Math.min(abilityBarState.count - 1, abilityBarState.activeSlotIndex ?? 0));
      }
      updateAbilityRepoSubtitle();
      renderSpellList();
    }
    if(abilityBarState.hotkeyCaptureIndex !== null && abilityBarState.hotkeyCaptureIndex >= abilityBarState.count){
      abilityBarState.hotkeyCaptureIndex = abilityBarState.count > 0 ? abilityBarState.count - 1 : null;
    }
    renderAbilityBar();
  }

  function refreshAbilityCooldownUI(){
    if(!abilityBarEl) return;
    const slots = abilityBarEl.querySelectorAll('.abilitySlot');
    slots.forEach(slot => {
      const index = Number(slot.dataset.index);
      if(!Number.isFinite(index)) return;
      const state = getAbilitySlotState(index);
      const remaining = state ? Math.max(0, Number(state.cooldown) || 0) : 0;
      let cooldownEl = slot.querySelector('.abilityCooldown');
      if(remaining > 0){
        const text = remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1);
        if(!cooldownEl){
          cooldownEl = document.createElement('span');
          cooldownEl.className = 'abilityCooldown';
          slot.appendChild(cooldownEl);
        }
        cooldownEl.textContent = text;
        slot.dataset.cooldown = 'true';
      } else {
        if(cooldownEl) cooldownEl.remove();
        slot.dataset.cooldown = 'false';
      }
    });
  }

  function setAbilitySlotCooldown(slotIndex, seconds){
    const state = getAbilitySlotState(slotIndex);
    if(!state) return;
    state.cooldown = Math.max(0, Number(seconds) || 0);
    refreshAbilityCooldownUI();
  }

  function abilityCooldownSeconds(ability){
    const cooldownMs = abilityFieldValue(ability, 'cooldownMs');
    return Math.max(0, Number(cooldownMs) || 0) / 1000;
  }

  function updateAbilityCooldowns(dt){
    ensureAbilitySlotStates();
    for(const state of abilitySlotStates){
      if(!state) continue;
      if(state.cooldown > 0){
        state.cooldown = Math.max(0, state.cooldown - dt);
      }
    }
    refreshAbilityCooldownUI();
  }

  function beamAimPoint(){
    if(abilityRuntime.lastPointerWorld && Number.isFinite(abilityRuntime.lastPointerWorld.x) && Number.isFinite(abilityRuntime.lastPointerWorld.y)){
      return { x: abilityRuntime.lastPointerWorld.x, y: abilityRuntime.lastPointerWorld.y };
    }
    if(player.selectedTarget){
      return { x: player.selectedTarget.x, y: player.selectedTarget.y };
    }
    if(player.chaseTarget){
      return { x: player.chaseTarget.x, y: player.chaseTarget.y };
    }
    if(player.target && Number.isFinite(player.target.x) && Number.isFinite(player.target.y)){
      return { x: player.target.x, y: player.target.y };
    }
    return { x: player.x + player.r, y: player.y };
  }

  const abilityHandlers = {
    beam: castBeamAbility,
    laserCone: castLaserConeAbility,
    slam: castSlamAbility,
    grab: castGrabAbility,
    blinkingBolt: castBlinkingBoltAbility,
    proximity_traps: castProximityTrapAbility,
    piercing_arrow: castPiercingArrowAbility,
    plasma_fission: castPlasmaFissionAbility,
    charging_gale: castChargingGaleAbility,
    culling_barrage: castCullingBarrageAbility,
    rite_arcane: castRiteArcaneAbility
  };

  function resolveBeamCastGeometry(cast){
    const caster = cast && cast.casterRef;
    const hasStartX = cast && Number.isFinite(cast.startX);
    const hasStartY = cast && Number.isFinite(cast.startY);
    const fallbackOrigin = getSpellOrigin(caster || player);
    let startX = hasStartX ? cast.startX : fallbackOrigin.x;
    let startY = hasStartY ? cast.startY : fallbackOrigin.y;
    if(caster){
      const casterOrigin = getSpellOrigin(caster);
      if(Number.isFinite(casterOrigin.x)) startX = casterOrigin.x;
      if(Number.isFinite(casterOrigin.y)) startY = casterOrigin.y;
    }
    const fallbackDirX = cast && Number.isFinite(cast.dirX) ? cast.dirX : 1;
    const fallbackDirY = cast && Number.isFinite(cast.dirY) ? cast.dirY : 0;
    const lockedDirX = cast && Number.isFinite(cast.lockedDirX) ? cast.lockedDirX : null;
    const lockedDirY = cast && Number.isFinite(cast.lockedDirY) ? cast.lockedDirY : null;
    let dirX = fallbackDirX;
    let dirY = fallbackDirY;
    if(Number.isFinite(lockedDirX) && Number.isFinite(lockedDirY)){
      const lockedLen = Math.hypot(lockedDirX, lockedDirY);
      if(lockedLen >= 0.0001){
        dirX = lockedDirX / lockedLen;
        dirY = lockedDirY / lockedLen;
      }
    }
    const lockedDistance = cast && Number.isFinite(cast.lockedDistance) ? Math.max(0, cast.lockedDistance) : null;
    let distanceToTarget = lockedDistance;
    if(!(distanceToTarget > 0)){
      const rawTargetX = cast && Number.isFinite(cast.targetX) ? cast.targetX : (startX + fallbackDirX);
      const rawTargetY = cast && Number.isFinite(cast.targetY) ? cast.targetY : (startY + fallbackDirY);
      let dx = rawTargetX - startX;
      let dy = rawTargetY - startY;
      distanceToTarget = Math.hypot(dx, dy);
      if(!(distanceToTarget > 0.0001)){
        dx = dirX;
        dy = dirY;
        distanceToTarget = Math.hypot(dx, dy);
      }
      if(!(distanceToTarget > 0.0001)){
        dx = 1;
        dy = 0;
        distanceToTarget = 1;
        dirX = dx;
        dirY = dy;
      }
      if(distanceToTarget > 0){
        dirX = dx / distanceToTarget;
        dirY = dy / distanceToTarget;
      }
    }
    if(!(distanceToTarget > 0)){ distanceToTarget = 1; }
    const targetX = startX + dirX * distanceToTarget;
    const targetY = startY + dirY * distanceToTarget;
    return {
      startX,
      startY,
      dirX,
      dirY,
      distanceToTarget,
      targetX: startX + dirX * distanceToTarget,
      targetY: startY + dirY * distanceToTarget
    };
  }

  function castChargingGaleAbility(slotIndex, ability){
    const abilityName = ability && (ability.shortName || ability.name)
      ? (ability.shortName || ability.name)
      : 'Charging Gale';
    const existing = chargingGaleCasts.find(cast => cast && cast.casterRef === player && cast.abilityId === ability.id);
    if(existing){
      if(existing.state === 'charging'){
        if(!existing.allowManualRecast){
          setHudMessage(`${abilityName} will release automatically.`);
          return false;
        }
        const released = releaseChargingGale(existing, { manual: true });
        return released ? true : false;
      }
      setHudMessage(`${abilityName} is still preparing.`);
      return false;
    }

    if(player.casting && player.casting !== existing && player.casting.abilityId && player.casting.abilityId !== ability.id){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const cooldownSeconds = abilityCooldownSeconds(ability);
    const castTime = Math.max(0, Number(abilityFieldValue(ability, 'castTimeMs')) || 0) / 1000;
    const chargeDuration = Math.max(0, Number(abilityFieldValue(ability, 'chargeMaxMs')) || 0) / 1000;
    const allowManualRecast = Number(abilityFieldValue(ability, 'allowManualRecast')) > 0;
    const width = Math.max(0, Number(abilityFieldValue(ability, 'widthPx')) || 0);
    const minRange = Math.max(0, Number(abilityFieldValue(ability, 'minRangePx')) || 0);
    const maxRange = Math.max(minRange, Number(abilityFieldValue(ability, 'maxRangePx')) || 0);
    const minSpeed = Math.max(0, Number(abilityFieldValue(ability, 'minSpeedPxS')) || 0);
    const maxSpeed = Math.max(minSpeed, Number(abilityFieldValue(ability, 'maxSpeedPxS')) || 0);
    const minDamage = Math.max(0, Number(abilityFieldValue(ability, 'minDamage')) || 0);
    const bonusPerSecond = Math.max(0, Number(abilityFieldValue(ability, 'bonusPerSecond')) || 0);
    const knockupMin = Math.max(0, Number(abilityFieldValue(ability, 'knockupMinMs')) || 0) / 1000;
    const knockupMax = Math.max(knockupMin, Number(abilityFieldValue(ability, 'knockupMaxMs')) || 0) / 1000;
    const pierceUnits = Number(abilityFieldValue(ability, 'pierceUnits')) > 0;
    const stopAtTerrain = Number(abilityFieldValue(ability, 'stopAtTerrain')) > 0;

    const { x: originX, y: originY } = getSpellOrigin(player);
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - originX;
    let dy = aimPoint.y - originY;
    let len = Math.hypot(dx, dy);
    if(!(len > 0.0001)){
      dx = player.target.x - originX;
      dy = player.target.y - originY;
      len = Math.hypot(dx, dy);
    }
    if(!(len > 0.0001)){
      dx = 1;
      dy = 0;
      len = 1;
    }
    const dirX = dx / len;
    const dirY = dy / len;

    const cast = {
      abilityId: ability.id,
      abilityName,
      slotIndex,
      casterRef: player,
      originX,
      originY,
      initialDirX: dirX,
      initialDirY: dirY,
      castTime,
      castElapsed: 0,
      state: castTime > 0 ? 'windup' : 'charging',
      chargeDuration,
      chargeElapsed: 0,
      allowManualRecast,
      width,
      minRange,
      maxRange,
      minSpeed,
      maxSpeed,
      minDamage,
      bonusPerSecond,
      knockupMin,
      knockupMax,
      pierce: pierceUnits,
      stopAtTerrain,
      cooldownSeconds,
      released: false
    };

    chargingGaleCasts.push(cast);
    player.casting = cast;
    cancelPlayerAttack(false);
    player.chaseTarget = null;
    player.target.x = player.x;
    player.target.y = player.y;
    player.navGoal = null;
    player.nav = null;

    if(cast.state === 'windup'){
      setHudMessage(`${abilityName} preparing...`);
      return { success: true, deferCooldown: true };
    }

    if(cast.chargeDuration <= 0){
      const released = releaseChargingGale(cast);
      return released ? true : false;
    }

    setHudMessage(`${abilityName} charging...`);
    return { success: true, deferCooldown: true };
  }

  function releaseChargingGale(cast, { manual = false } = {}){
    if(!cast || cast.released) return false;
    cast.released = true;
    const idx = chargingGaleCasts.indexOf(cast);
    if(idx >= 0){
      chargingGaleCasts.splice(idx, 1);
    }
    if(cast.casterRef === player && player.casting === cast){
      player.casting = null;
    }

    const abilityName = cast.abilityName || 'Charging Gale';

    let dirX = cast.initialDirX;
    let dirY = cast.initialDirY;
    if(manual && cast.allowManualRecast){
      const aimPoint = beamAimPoint();
      let recastDx = aimPoint.x - cast.originX;
      let recastDy = aimPoint.y - cast.originY;
      let recastLen = Math.hypot(recastDx, recastDy);
      if(!(recastLen > 0.0001)){
        recastDx = player.target.x - cast.originX;
        recastDy = player.target.y - cast.originY;
        recastLen = Math.hypot(recastDx, recastDy);
      }
      if(recastLen > 0.0001){
        dirX = recastDx / recastLen;
        dirY = recastDy / recastLen;
      }
    }

    const dirLen = Math.hypot(dirX, dirY);
    if(!(dirLen > 0.0001)){
      dirX = 1;
      dirY = 0;
    } else {
      dirX /= dirLen;
      dirY /= dirLen;
    }

    const chargeElapsed = Math.max(0, Number(cast.chargeElapsed) || 0);
    const maxCharge = Math.max(0, Number(cast.chargeDuration) || 0);
    const chargeSeconds = maxCharge > 0 ? Math.min(chargeElapsed, maxCharge) : chargeElapsed;
    const chargeT = maxCharge > 0 ? clamp01(chargeElapsed / Math.max(maxCharge, 0.0001)) : (chargeSeconds > 0 ? 1 : 0);
    const lerp = (a, b, t) => a + (b - a) * t;
    const range = lerp(cast.minRange, cast.maxRange, chargeT);
    const speed = lerp(cast.minSpeed, cast.maxSpeed, chargeT);
    const damage = Math.max(0, cast.minDamage + cast.bonusPerSecond * chargeSeconds);
    const knockup = lerp(cast.knockupMin, cast.knockupMax, chargeT);

    if(!(range > 0) || !(speed > 0)){
      setHudMessage(`${abilityName} fizzled.`);
      return false;
    }

    const projectile = spawnChargingGaleProjectile({
      abilityName,
      originX: cast.originX,
      originY: cast.originY,
      dirX,
      dirY,
      range,
      speed,
      width: cast.width,
      damage,
      knockup,
      pierce: cast.pierce,
      stopAtTerrain: cast.stopAtTerrain,
      casterRef: cast.casterRef || null
    });

    if(!projectile){
      setHudMessage(`${abilityName} fizzled.`);
      return false;
    }

    flash(cast.originX, cast.originY, { startRadius: 16, endRadius: 40, color: '#7fe3ff' });
    setHudMessage(manual ? `${abilityName} released!` : `${abilityName} unleashed!`);
    return true;
  }

  function spawnChargingGaleProjectile(opts){
    if(!opts) return null;
    const range = Math.max(0, Number(opts.range) || 0);
    const speed = Math.max(0, Number(opts.speed) || 0);
    if(!(range > 0) || !(speed > 0)) return null;
    let dirX = Number(opts.dirX) || 0;
    let dirY = Number(opts.dirY) || 0;
    const dirLen = Math.hypot(dirX, dirY);
    if(!(dirLen > 0.0001)){
      return null;
    }
    dirX /= dirLen;
    dirY /= dirLen;
    const projectile = {
      abilityName: opts.abilityName || 'Charging Gale',
      startX: Number(opts.originX) || 0,
      startY: Number(opts.originY) || 0,
      currentX: Number(opts.originX) || 0,
      currentY: Number(opts.originY) || 0,
      dirX,
      dirY,
      speed,
      range,
      width: Math.max(0, Number(opts.width) || 0),
      damage: Math.max(0, Number(opts.damage) || 0),
      knockup: Math.max(0, Number(opts.knockup) || 0),
      pierce: !!opts.pierce,
      stopAtTerrain: !!opts.stopAtTerrain,
      traveled: 0,
      casterRef: opts.casterRef || null,
      hitTargets: !!opts.pierce ? new Set() : null,
      announcedHit: false
    };
    chargingGaleProjectiles.push(projectile);
    return projectile;
  }

  function applyChargingGaleHit(projectile, target, hitAlong){
    if(!projectile || !target) return;
    const prevHp = Number(target.hp) || 0;
    if(Number(projectile.damage) > 0){
      target.hp = Math.max(0, prevHp - projectile.damage);
      spawnHitSplat(target.x, target.y - minionRadius, projectile.damage);
    }
    if(Number(projectile.knockup) > 0){
      const existing = typeof target.stunTimer === 'number' ? target.stunTimer : 0;
      target.stunTimer = Math.max(existing, projectile.knockup);
    }
    handlePracticeDummyDamage(target, prevHp);
    flash(target.x, target.y, { startRadius: 12, endRadius: 36, color: '#9ce7ff' });
    if(!projectile.announcedHit){
      if(projectile.damage > 0){
        setHudMessage(`${projectile.abilityName || 'Charging Gale'} hit for ${Math.round(projectile.damage)} damage!`);
      } else {
        setHudMessage(`${projectile.abilityName || 'Charging Gale'} hit!`);
      }
      projectile.announcedHit = true;
    }
    if(!projectile.pierce){
      projectile.traveled = Math.max(0, Number(hitAlong) || 0);
      projectile.currentX = projectile.startX + projectile.dirX * projectile.traveled;
      projectile.currentY = projectile.startY + projectile.dirY * projectile.traveled;
    }
  }

  function castBeamAbility(slotIndex, ability){
    if(player.casting){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }
    const startX = player.x;
    const startY = player.y;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - startX;
    let dy = aimPoint.y - startY;
    let distance = Math.hypot(dx, dy);
    if(distance < 1){
      const fallback = player.target && Number.isFinite(player.target.x) ? player.target : { x: player.x + player.r, y: player.y };
      dx = fallback.x - startX;
      dy = fallback.y - startY;
      distance = Math.hypot(dx, dy);
      if(distance < 1){
        dx = 1;
        dy = 0;
        distance = 1;
      }
    }
    distance = Math.max(distance, 1);
    const dirX = dx / distance;
    const dirY = dy / distance;
    const rawLength = abilityFieldValue(ability, 'beamLength');
    const configuredLength = Math.max(0, Number(rawLength) || 0);
    const rawWidth = abilityFieldValue(ability, 'beamWidth');
    const beamWidth = Math.max(0, Number(rawWidth) || 0);
    const rawDamage = abilityFieldValue(ability, 'damage');
    const damage = Math.max(0, Number(rawDamage) || 0);
    const rawSlow = abilityFieldValue(ability, 'slowPct');
    const slowFraction = Math.max(0, Math.min(1, (Number(rawSlow) || 0) / 100));
    const rawCast = abilityFieldValue(ability, 'castTimeMs');
    const castSeconds = Math.max(0, Number(rawCast) || 0) / 1000;

    const usesDynamicLength = configuredLength <= 0;
    const fireLength = usesDynamicLength ? distance : configuredLength;
    const previewLength = usesDynamicLength ? distance : fireLength;
    const cast = {
      slotIndex,
      abilityId: ability.id,
      abilityName: ability.shortName || ability.name,
      startX,
      startY,
      dirX,
      dirY,
      targetX: aimPoint.x,
      targetY: aimPoint.y,
      fireLength: Math.max(1, fireLength),
      previewLength: Math.max(1, previewLength),
      width: beamWidth,
      damage,
      slowFraction,
      castDuration: castSeconds,
      elapsed: 0,
      casterRef: player,
      dynamicLength: usesDynamicLength,
      lockedDirX: dirX,
      lockedDirY: dirY,
      lockedDistance: Math.max(1, previewLength)
    };

    if(cast.castDuration <= 0){
      fireBeamCast(cast);
    } else {
      beamCasts.push(cast);
      setHudMessage(`${cast.abilityName} charging...`);
      player.casting = cast;
      cancelPlayerAttack(false);
      player.chaseTarget = null;
      player.target.x = player.x;
      player.target.y = player.y;
      player.navGoal = null;
      player.nav = null;
    }
    return true;
  }

  function spawnBlinkingBoltProjectile(startX, startY, target, damage, abilityName, caster){
    const boltSpeed = 720;
    const bolt = {
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      dirX: 1,
      dirY: 0,
      speed: boltSpeed,
      damage: Math.max(0, Number(damage) || 0),
      abilityName: abilityName || 'Blink Bolt',
      casterRef: caster || null,
      targetRef: target || null,
      age: 0,
      maxLifetime: 2.75
    };
    if(target){
      const dx = target.x - startX;
      const dy = target.y - startY;
      const len = Math.hypot(dx, dy);
      if(len > 0.0001){
        bolt.dirX = dx / len;
        bolt.dirY = dy / len;
      }
    }
    blinkingBoltProjectiles.push(bolt);
    return bolt;
  }

  function castBlinkingBoltAbility(slotIndex, ability){
    if(player.casting){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const abilityName = ability && (ability.shortName || ability.name) ? (ability.shortName || ability.name) : 'Blink Bolt';
    const blinkDistanceRaw = abilityFieldValue(ability, 'blinkDistance');
    const blinkDistance = Math.max(0, Number(blinkDistanceRaw) || 0);
    const damageRaw = abilityFieldValue(ability, 'damage');
    const boltDamage = Math.max(0, Number(damageRaw) || 0);

    const startX = player.x;
    const startY = player.y;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - startX;
    let dy = aimPoint.y - startY;
    let distance = Math.hypot(dx, dy);
    let dirX = 1;
    let dirY = 0;
    const hasAim = distance > 0.0001;
    if(hasAim){
      dirX = dx / distance;
      dirY = dy / distance;
    }
    const desiredDistance = blinkDistance > 0 ? (hasAim ? Math.min(blinkDistance, distance) : 0) : 0;
    const moveX = dirX * desiredDistance;
    const moveY = dirY * desiredDistance;
    const moved = moveCircleWithCollision(startX, startY, moveX, moveY, player.r);
    let destX = moved.x;
    let destY = moved.y;
    destX = Math.max(player.r, Math.min(mapState.width - player.r, destX));
    destY = Math.max(player.r, Math.min(mapState.height - player.r, destY));

    if(destX !== player.x || destY !== player.y){
      flash(startX, startY, { startRadius: 12, endRadius: 44, color: '#7fe3ff' });
    }

    player.x = destX;
    player.y = destY;
    player.target.x = destX;
    player.target.y = destY;
    player.navGoal = null;
    player.nav = null;
    player.chaseTarget = null;
    cancelPlayerAttack(false);

    flash(destX, destY, { startRadius: 12, endRadius: 44, color: '#9ff5ff' });

    const target = findNearestEnemyMinionWithinRange(destX, destY, blinkDistance);
    if(target){
      spawnBlinkingBoltProjectile(destX, destY, target, boltDamage, abilityName, player);
      setHudMessage(`${abilityName} unleashed a bolt!`);
    } else {
      setHudMessage(`${abilityName} repositioned, but found no targets.`);
    }

    return true;
  }

  function clampTrapPosition(originX, originY, x, y, radius, maxRange){
    let targetX = Number.isFinite(x) ? x : originX;
    let targetY = Number.isFinite(y) ? y : originY;
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.hypot(dx, dy);
    if(maxRange > 0 && dist > maxRange){
      const scale = maxRange / dist;
      targetX = originX + dx * scale;
      targetY = originY + dy * scale;
    }
    const safeRadius = Math.max(0, radius || 0);
    targetX = Math.max(safeRadius, Math.min(mapState.width - safeRadius, targetX));
    targetY = Math.max(safeRadius, Math.min(mapState.height - safeRadius, targetY));
    return { x: targetX, y: targetY };
  }

  function resolveTrapPlacement(originX, originY, candidateX, candidateY, radius, maxRange){
    const base = clampTrapPosition(originX, originY, candidateX, candidateY, radius, maxRange);
    if(!circleCollides(base.x, base.y, radius)) return base;
    const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI, (3 * Math.PI) / 4, -(3 * Math.PI) / 4];
    const step = Math.max(6, Math.max(radius * 0.5, 6));
    const maxSteps = 10;
    for(let ring = 1; ring <= maxSteps; ring++){
      const dist = step * ring;
      for(const angle of angles){
        const offsetX = Math.cos(angle) * dist;
        const offsetY = Math.sin(angle) * dist;
        const candidate = clampTrapPosition(originX, originY, base.x + offsetX, base.y + offsetY, radius, maxRange);
        if(!circleCollides(candidate.x, candidate.y, radius)) return candidate;
      }
    }
    return circleCollides(base.x, base.y, radius) ? null : base;
  }

  function enforceTrapSpacing(points, minSpacing, originX, originY, radius, maxRange){
    if(!Array.isArray(points) || points.length <= 1) return points;
    const minSpacingValue = Math.max(0, Number(minSpacing) || 0);
    if(!(minSpacingValue > 0)) return points;
    const minSq = minSpacingValue * minSpacingValue;
    const iterations = 6;
    for(let iter = 0; iter < iterations; iter++){
      let adjusted = false;
      for(let i = 0; i < points.length; i++){
        const a = points[i];
        if(!a) continue;
        for(let j = i + 1; j < points.length; j++){
          const b = points[j];
          if(!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          if(distSq >= minSq || distSq <= 1e-6) continue;
          const dist = Math.sqrt(distSq);
          const push = (minSpacingValue - dist) * 0.5;
          if(!(push > 0)) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const adjA = clampTrapPosition(originX, originY, a.x, a.y, radius, maxRange);
          a.x = adjA.x;
          a.y = adjA.y;
          const adjB = clampTrapPosition(originX, originY, b.x, b.y, radius, maxRange);
          b.x = adjB.x;
          b.y = adjB.y;
          adjusted = true;
        }
      }
      if(!adjusted) break;
    }
    return points;
  }

  function computeTrapPlacements(originX, originY, dirX, dirY, pointerDist, {
    count,
    spacing,
    minSpacing,
    maxRange,
    mode
  }){
    const placements = [];
    const trapCount = Math.max(0, Math.floor(Number(count) || 0));
    if(trapCount <= 0) return placements;
    const effectiveSpacing = Math.max(Number(minSpacing) || 0, Number(spacing) || 0);
    const hasRange = maxRange > 0;
    const fallbackDistance = pointerDist > 0
      ? pointerDist
      : (hasRange ? maxRange * 0.6 : 0);
    const baseDistance = hasRange
      ? Math.min(maxRange, Math.max(32, fallbackDistance))
      : Math.max(0, fallbackDistance);
    const perpendicularX = -dirY;
    const perpendicularY = dirX;
    const modeIndex = Math.max(0, Math.min(2, Math.round(Number(mode) || 0)));
    if(modeIndex === 1){
      const center = baseDistance;
      const mid = (trapCount - 1) / 2;
      for(let i = 0; i < trapCount; i++){
        const lateral = (i - mid) * effectiveSpacing;
        let distance = center;
        if(hasRange) distance = Math.min(distance, maxRange);
        const baseX = originX + dirX * distance;
        const baseY = originY + dirY * distance;
        placements.push({
          x: baseX + perpendicularX * lateral,
          y: baseY + perpendicularY * lateral
        });
      }
    } else if(modeIndex === 2){
      const center = baseDistance;
      const centerPoint = {
        x: originX + dirX * center,
        y: originY + dirY * center
      };
      placements.push({ x: centerPoint.x, y: centerPoint.y });
      if(trapCount > 1){
        const angleStep = (Math.PI * 2) / trapCount;
        let ringRadius = effectiveSpacing;
        const denom = Math.sin(Math.PI / trapCount);
        if(denom > 1e-4){
          ringRadius = Math.max(ringRadius, minSpacing > 0 ? minSpacing / (2 * denom) : ringRadius);
        }
        for(let i = 1; i < trapCount; i++){
          const angle = angleStep * i;
          placements.push({
            x: centerPoint.x + Math.cos(angle) * ringRadius,
            y: centerPoint.y + Math.sin(angle) * ringRadius
          });
        }
      }
    } else {
      const start = baseDistance - effectiveSpacing * (trapCount - 1) * 0.5;
      for(let i = 0; i < trapCount; i++){
        let distance = start + effectiveSpacing * i;
        if(hasRange) distance = Math.min(distance, maxRange);
        distance = Math.max(24, distance);
        placements.push({
          x: originX + dirX * distance,
          y: originY + dirY * distance
        });
      }
    }
    return placements;
  }

  function castProximityTrapAbility(slotIndex, ability){
    const abilityName = ability && (ability.shortName || ability.name)
      ? (ability.shortName || ability.name)
      : 'Flame Chompers';
    const dropCountRaw = abilityFieldValue(ability, 'dropCount');
    const dropCount = Math.max(0, Math.floor(Number(dropCountRaw) || 0));
    if(dropCount <= 0){
      setHudMessage(`${abilityName} has no traps configured.`);
      return false;
    }
    const maxActiveRaw = abilityFieldValue(ability, 'maxActiveTraps');
    const maxActive = Math.max(1, Math.floor(Number(maxActiveRaw) || 0));
    const placementModeRaw = abilityFieldValue(ability, 'placementMode', { skipScaling: true });
    const spacingRaw = abilityFieldValue(ability, 'placementSpacingPx');
    const minSpacingRaw = abilityFieldValue(ability, 'minTrapSpacingPx');
    const maxRangeRaw = abilityFieldValue(ability, 'maxPlaceRangePx');
    const armDelayRaw = abilityFieldValue(ability, 'armDelayMs');
    const lifetimeRaw = abilityFieldValue(ability, 'lifetimeMs');
    const triggerRadiusRaw = abilityFieldValue(ability, 'triggerRadiusPx');
    const aoeRadiusRaw = abilityFieldValue(ability, 'aoeRadiusPx');
    const immobilizeRaw = abilityFieldValue(ability, 'immobilizeMs');
    const damageRaw = abilityFieldValue(ability, 'damage');
    const rootPrimaryOnly = Number(abilityFieldValue(ability, 'rootPrimaryOnly')) > 0;
    const canTriggerByMinions = Number(abilityFieldValue(ability, 'canTriggerByMinions')) > 0;
    const showArmedRing = Number(abilityFieldValue(ability, 'showArmedRing')) > 0;
    const showTriggerRadius = Number(abilityFieldValue(ability, 'showTriggerRadius')) > 0;

    const spacing = Math.max(0, Number(spacingRaw) || 0);
    const minSpacing = Math.max(0, Number(minSpacingRaw) || 0);
    const maxRange = Math.max(0, Number(maxRangeRaw) || 0);
    const armDelay = Math.max(0, Number(armDelayRaw) || 0) / 1000;
    const lifetime = Math.max(0, Number(lifetimeRaw) || 0) / 1000;
    const triggerRadius = Math.max(0, Number(triggerRadiusRaw) || 0);
    const aoeRadius = Math.max(triggerRadius, Number(aoeRadiusRaw) || 0);
    const immobilizeSeconds = Math.max(0, Number(immobilizeRaw) || 0) / 1000;
    const damage = Math.max(0, Number(damageRaw) || 0);

    const { x: originX, y: originY } = getSpellOrigin(player);
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - originX;
    let dy = aimPoint.y - originY;
    let pointerDist = Math.hypot(dx, dy);
    if(!(pointerDist > 0.0001)){
      dx = player.target.x - originX;
      dy = player.target.y - originY;
      pointerDist = Math.hypot(dx, dy);
    }
    if(!(pointerDist > 0.0001)){
      dx = 1;
      dy = 0;
      pointerDist = 1;
    }
    const dirX = dx / pointerDist;
    const dirY = dy / pointerDist;

    const placements = computeTrapPlacements(originX, originY, dirX, dirY, pointerDist, {
      count: dropCount,
      spacing,
      minSpacing,
      maxRange,
      mode: placementModeRaw
    });

    if(!placements.length){
      setHudMessage(`${abilityName} found no valid placement points.`);
      return false;
    }

    const trapRadius = Math.max(16, triggerRadius * 0.6);
    enforceTrapSpacing(placements, minSpacing, originX, originY, trapRadius, maxRange);

    const resolvedPositions = [];
    for(const candidate of placements){
      if(!candidate) continue;
      const resolved = resolveTrapPlacement(originX, originY, candidate.x, candidate.y, trapRadius, maxRange);
      if(resolved){
        resolvedPositions.push(resolved);
      }
    }

    if(!resolvedPositions.length){
      setHudMessage(`${abilityName} could not be placed on valid terrain.`);
      return false;
    }

    while(flameChomperTraps.length + resolvedPositions.length > maxActive){
      const removed = flameChomperTraps.shift();
      if(removed){
        const removedTrigger = Math.max(0, Number(removed.triggerRadius) || 0);
        const removedRadius = Math.max(0, Number(removed.radius) || 0);
        flash(removed.x, removed.y, { startRadius: Math.max(12, removedTrigger * 0.5), endRadius: Math.max(removedTrigger, removedRadius + 24), color: '#ffbfa1' });
      }
    }

    const nowPlaced = [];
    for(const pos of resolvedPositions){
      const trap = {
        id: abilityRuntime.flameChomperSequence++,
        abilityId: ability.id,
        abilityName,
        x: pos.x,
        y: pos.y,
        radius: trapRadius,
        triggerRadius,
        aoeRadius,
        damage,
        rootDuration: immobilizeSeconds,
        rootPrimaryOnly,
        canTriggerByMinions,
        showArmedRing,
        showTriggerRadius,
        armDelay,
        lifeAfterArm: lifetime,
        maxAge: armDelay + lifetime,
        age: 0,
        armed: armDelay <= 0,
        owner: player,
        spawnOrder: abilityRuntime.flameChomperSequence,
        justPlaced: true
      };
      flameChomperTraps.push(trap);
      nowPlaced.push(trap);
      flash(trap.x, trap.y, { startRadius: Math.max(8, trap.radius * 0.6), endRadius: Math.max(trap.triggerRadius, trap.radius + 28), color: '#ffcc7a' });
    }

    cancelPlayerAttack(false);

    const placedCount = nowPlaced.length;
    const plural = placedCount === 1 ? '' : 's';
    setHudMessage(`${abilityName} deployed ${placedCount} trap${plural}.`);
    return true;
  }

  function activeCullingBarrageChannelForCaster(caster){
    if(!caster) return null;
    for(const channel of cullingBarrageChannels){
      if(!channel || channel.ended) continue;
      if(channel.casterRef === caster) return channel;
    }
    return null;
  }

  function castCullingBarrageAbility(slotIndex, ability){
    const caster = player;
    const abilityName = ability && (ability.shortName || ability.name)
      ? (ability.shortName || ability.name)
      : 'Sweeping Barrage';
    const existing = activeCullingBarrageChannelForCaster(caster);
    if(existing && existing.abilityId === ability.id){
      endCullingBarrageChannel(existing, { reason: 'manual' });
      return false;
    }

    if(player.casting){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const channelDurationMs = Math.max(0, Number(abilityFieldValue(ability, 'channelDurationMs')) || 0);
    const shotIntervalMsRaw = Math.max(0, Number(abilityFieldValue(ability, 'shotIntervalMs')) || 0);
    const projectileSpeed = Math.max(0, Number(abilityFieldValue(ability, 'projectileSpeedPxS')) || 0);
    const projectileWidth = Math.max(0, Number(abilityFieldValue(ability, 'projectileWidthPx')) || 0);
    const projectileRange = Math.max(0, Number(abilityFieldValue(ability, 'projectileRangePx')) || 0);
    const damagePerShot = Math.max(0, Number(abilityFieldValue(ability, 'damagePerShot')) || 0);
    const aimPreviewRange = Math.max(0, Number(abilityFieldValue(ability, 'aimPreviewRangePx')) || projectileRange || 0);
    const moveSpeedPct = Math.max(0, Number(abilityFieldValue(ability, 'moveSpeedMultPct')) || 0);
    const allowDash = Number(abilityFieldValue(ability, 'allowDashDuringCh')) > 0;
    const lockFacing = Number(abilityFieldValue(ability, 'lockFacing')) > 0;
    const canPierce = Number(abilityFieldValue(ability, 'projectilesPierce')) > 0;
    const cooldownSeconds = abilityCooldownSeconds(ability);

    const safeIntervalMs = Math.max(1, shotIntervalMsRaw);
    const totalShots = Math.max(1, Math.floor(channelDurationMs / safeIntervalMs) || 0);
    const channelDuration = channelDurationMs / 1000;
    const shotInterval = safeIntervalMs / 1000;
    const { x: originX, y: originY } = getSpellOrigin(caster);
    const aimPoint = beamAimPoint();
    let dirX = aimPoint.x - originX;
    let dirY = aimPoint.y - originY;
    let len = Math.hypot(dirX, dirY);
    if(!(len > 0.0001)){
      dirX = 1;
      dirY = 0;
      len = 1;
    }
    dirX /= len;
    dirY /= len;

    const channel = {
      abilityId: ability.id,
      abilityName,
      slotIndex,
      casterRef: caster,
      duration: channelDuration,
      elapsed: 0,
      shotInterval,
      nextShotTime: 0,
      shotsFired: 0,
      totalShots,
      projectileSpeed,
      projectileWidth,
      projectileRange,
      damagePerShot,
      aimDirX: dirX,
      aimDirY: dirY,
      aimPreviewRange,
      moveSpeedMult: moveSpeedPct / 100,
      allowDash,
      lockFacing,
      canPierce,
      cooldownSeconds,
      cooldownApplied: false,
      ended: false,
      allowMovementWhileCasting: true
    };

    channel.originalSpeed = caster.speed;
    if(channel.moveSpeedMult > 0){
      caster.speed = channel.originalSpeed * channel.moveSpeedMult;
    } else {
      caster.speed = 0;
    }
    updateHudStats();

    cancelPlayerAttack(false);
    caster.chaseTarget = null;
    if(!channel.allowMovementWhileCasting){
      caster.target.x = caster.x;
      caster.target.y = caster.y;
      caster.navGoal = null;
      caster.nav = null;
      clearEntityNav(caster);
    }

    player.casting = channel;
    cullingBarrageChannels.push(channel);
    setHudMessage(`${abilityName} channeling...`);
    return { success: true, deferCooldown: true };
  }

  function endCullingBarrageChannel(channel, options = {}){
    if(!channel || channel.ended) return;
    channel.ended = true;
    const idx = cullingBarrageChannels.indexOf(channel);
    if(idx !== -1){
      cullingBarrageChannels.splice(idx, 1);
    }
    const caster = channel.casterRef;
    if(caster){
      if(Number.isFinite(channel.originalSpeed)){
        caster.speed = channel.originalSpeed;
        updateHudStats();
      }
      if(caster === player && player.casting === channel){
        player.casting = null;
      }
    }
    if(!channel.cooldownApplied && Number.isFinite(channel.slotIndex)){
      setAbilitySlotCooldown(channel.slotIndex, Math.max(0, Number(channel.cooldownSeconds) || 0));
      channel.cooldownApplied = true;
    }
    if(caster === player && !options.silent){
      const abilityName = channel.abilityName || 'Sweeping Barrage';
      let message;
      switch(options.reason){
        case 'manual':
          message = `${abilityName} cancelled.`;
          break;
        case 'control':
          message = `${abilityName} interrupted!`;
          break;
        case 'complete':
          message = `${abilityName} finished firing.`;
          break;
        default:
          message = `${abilityName} ended.`;
          break;
      }
      setHudMessage(message);
    }
  }

  function fireCullingBarrageShot(channel, originX, originY){
    if(!channel || channel.ended) return;
    const caster = channel.casterRef || player;
    const muzzleOffset = (caster && Number.isFinite(caster.r) ? caster.r : player.r || 10) + 6;
    const dirX = Number(channel.aimDirX) || 0;
    const dirY = Number(channel.aimDirY) || 0;
    const muzzleX = originX + dirX * muzzleOffset;
    const muzzleY = originY + dirY * muzzleOffset;
    const projectile = {
      channelRef: channel,
      abilityName: channel.abilityName,
      casterRef: caster,
      startX: muzzleX,
      startY: muzzleY,
      dirX,
      dirY,
      speed: channel.projectileSpeed,
      range: channel.projectileRange,
      width: channel.projectileWidth,
      damage: channel.damagePerShot,
      traveled: 0,
      canPierce: channel.canPierce,
      hitTargets: channel.canPierce ? new Set() : null,
      age: 0
    };
    projectile.x = muzzleX;
    projectile.y = muzzleY;
    cullingBarrageProjectiles.push(projectile);
    flash(muzzleX, muzzleY, { startRadius: 6, endRadius: 18, color: '#9ce7ff' });
  }

  function applyCullingBarrageHit(projectile, target){
    if(!projectile || !target) return;
    const damage = Math.max(0, Number(projectile.damage) || 0);
    const prevHp = Number(target.hp) || 0;
    if(damage > 0){
      target.hp = Math.max(0, prevHp - damage);
      spawnHitSplat(target.x, target.y - minionRadius, damage);
      if(prevHp > 0 && target.hp <= 0 && !target.isPracticeDummy){
        addGold(goldState.perKill);
      }
    }
    handlePracticeDummyDamage(target, prevHp);
    flash(target.x, target.y, { startRadius: 8, endRadius: 24, color: '#9ce7ff' });
  }

  function castSlamAbility(slotIndex, ability){
    if(player.casting){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const abilityName = ability && (ability.shortName || ability.name) ? (ability.shortName || ability.name) : 'Slam';
    const startX = player.x;
    const startY = player.y;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - startX;
    let dy = aimPoint.y - startY;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = player.target.x - startX;
      dy = player.target.y - startY;
      distance = Math.hypot(dx, dy);
    }
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;

    const castTimeRaw = abilityFieldValue(ability, 'castTimeMs');
    const castDuration = Math.max(0, Number(castTimeRaw) || 0) / 1000;

    const impactRadius = Math.max(0, Number(abilityFieldValue(ability, 'impactRadius')) || 0);
    const impactDamage = Math.max(0, Number(abilityFieldValue(ability, 'impactDamage')) || 0);
    const impactKnockup = Math.max(0, Number(abilityFieldValue(ability, 'impactKnockupMs')) || 0) / 1000;

    const fissureLength = Math.max(0, Number(abilityFieldValue(ability, 'fissureLength')) || 0);
    const fissureWidth = Math.max(0, Number(abilityFieldValue(ability, 'fissureWidth')) || 0);
    const fissureSpeed = Math.max(0, Number(abilityFieldValue(ability, 'fissureSpeed')) || 0);
    const fissureDamage = Math.max(0, Number(abilityFieldValue(ability, 'fissureDamage')) || 0);
    const firstNear = Math.max(0, Number(abilityFieldValue(ability, 'fissureFirstNearMs')) || 0) / 1000;
    const firstFar = Math.max(0, Number(abilityFieldValue(ability, 'fissureFirstFarMs')) || 0) / 1000;
    const otherKnock = Math.max(0, Number(abilityFieldValue(ability, 'fissureOtherKnockupMs')) || 0) / 1000;

    const iceFieldDuration = Math.max(0, Number(abilityFieldValue(ability, 'iceFieldDurationMs')) || 0) / 1000;
    const iceFieldTick = Math.max(0.05, (Number(abilityFieldValue(ability, 'iceFieldTickMs')) || 0) / 1000);
    const iceFieldSlowPct = Math.max(0, Number(abilityFieldValue(ability, 'iceFieldSlowPct')) || 0);
    const iceFieldSlowFraction = Math.max(0, Math.min(1, iceFieldSlowPct / 100));

    const cast = {
      slotIndex,
      abilityId: ability.id,
      abilityName,
      casterRef: player,
      startX,
      startY,
      dirX,
      dirY,
      impactRadius,
      impactDamage,
      impactKnockup,
      fissureLength,
      fissureWidth,
      fissureSpeed,
      fissureDamage,
      firstKnockNear: firstNear,
      firstKnockFar: Math.max(firstNear, firstFar),
      otherKnock,
      iceFieldDuration,
      iceFieldTick,
      iceFieldSlowFraction,
      castDuration,
      elapsed: 0
    };

    if(cast.castDuration <= 0){
      return fireSlamCast(cast);
    }

    slamCasts.push(cast);
    player.casting = cast;
    cancelPlayerAttack(false);
    player.chaseTarget = null;
    player.target.x = player.x;
    player.target.y = player.y;
    player.navGoal = null;
    player.nav = null;
    setHudMessage(`${abilityName} preparing to slam...`);
    return true;
  }

  function fireSlamCast(cast){
    if(!cast) return false;
    const caster = cast.casterRef;
    let { x: originX, y: originY } = resolveCastOrigin(cast);
    let dirX = Number(cast.dirX) || 0;
    let dirY = Number(cast.dirY) || 0;
    const len = Math.hypot(dirX, dirY);
    if(len > 0.0001){
      dirX /= len;
      dirY /= len;
    } else {
      dirX = 1;
      dirY = 0;
    }
    const abilityName = cast.abilityName || 'Slam';

    spawnSlamImpact(originX, originY, cast.impactRadius);
    const impactHits = applySlamImpact(cast, originX, originY);

    let fissureSpawned = false;
    const length = Math.max(0, Number(cast.fissureLength) || 0);
    const width = Math.max(0, Number(cast.fissureWidth) || 0);
    const speed = Math.max(0, Number(cast.fissureSpeed) || 0);
    if(length > 0 && width > 0 && speed > 0){
      const iceField = {
        startX: originX,
        startY: originY,
        dirX,
        dirY,
        width,
        maxLength: length,
        length: 0,
        slowFraction: Math.max(0, Math.min(1, Number(cast.iceFieldSlowFraction) || 0)),
        tickInterval: Math.max(0.05, Number(cast.iceFieldTick) || 0),
        duration: Math.max(0, Number(cast.iceFieldDuration) || 0),
        age: 0,
        tickTimer: Math.max(0.05, Number(cast.iceFieldTick) || 0),
        owner: null
      };
      slamIceFields.push(iceField);

      const fissure = {
        startX: originX,
        startY: originY,
        dirX,
        dirY,
        maxLength: length,
        width,
        speed,
        damage: Math.max(0, Number(cast.fissureDamage) || 0),
        firstNear: Math.max(0, Number(cast.firstKnockNear) || 0),
        firstFar: Math.max(0, Number(cast.firstKnockFar) || 0),
        otherKnock: Math.max(0, Number(cast.otherKnock) || 0),
        abilityName,
        casterRef: caster || null,
        distance: 0,
        headX: originX,
        headY: originY,
        state: 'travel',
        fadeDuration: 0.45,
        fadeRemaining: 0.45,
        hitTargets: new Set(),
        firstTargetHit: false,
        iceFieldRef: iceField
      };
      iceField.owner = fissure;
      slamFissures.push(fissure);
      fissureSpawned = true;
    }

    cancelPlayerAttack(false);
    if(cast.casterRef === player && player.casting === cast){
      player.casting = null;
    }

    if(impactHits > 0){
      setHudMessage(`${abilityName} crushed ${impactHits} target${impactHits === 1 ? '' : 's'}!`);
    } else if(fissureSpawned){
      setHudMessage(`${abilityName} split the ground!`);
    } else {
      setHudMessage(`${abilityName} slammed the ground.`);
    }

    return true;
  }

  function spawnSlamImpact(x, y, radius){
    const safeRadius = Math.max(0, Number(radius) || 0);
    slamImpacts.push({ x, y, radius: safeRadius, age: 0, lifetime: 0.5 });
    const startRadius = safeRadius > 0 ? Math.max(12, safeRadius * 0.4) : 18;
    const endRadius = safeRadius > 0 ? Math.max(safeRadius, startRadius + 28) : 48;
    flash(x, y, { startRadius, endRadius, color: '#8fe3ff' });
  }

  function applySlamImpact(cast, originX, originY){
    const radius = Math.max(0, Number(cast.impactRadius) || 0);
    const damage = Math.max(0, Number(cast.impactDamage) || 0);
    const knockup = Math.max(0, Number(cast.impactKnockup) || 0);
    if(!(radius > 0) && damage <= 0 && knockup <= 0) return 0;
    const effectiveRadius = radius + minionRadius;
    const effectiveSq = effectiveRadius * effectiveRadius;
    let hits = 0;
    for(const m of minions){
      if(!m || !isEnemyMinionForPlayer(m)) continue;
      if(m.hp <= 0 || m.portalizing > 0) continue;
      const dx = m.x - originX;
      const dy = m.y - originY;
      if(dx * dx + dy * dy > effectiveSq) continue;
      const prevHp = Number(m.hp) || 0;
      if(damage > 0){
        m.hp = Math.max(0, prevHp - damage);
        spawnHitSplat(m.x, m.y - minionRadius, damage);
      }
      if(knockup > 0){
        const existing = typeof m.stunTimer === 'number' ? m.stunTimer : 0;
        m.stunTimer = Math.max(existing, knockup);
      }
      handlePracticeDummyDamage(m, prevHp);
      hits++;
    }
    return hits;
  }

  function slamFissureKnockupForDistance(fissure, along){
    if(!fissure) return 0;
    const near = Math.max(0, Number(fissure.firstNear) || 0);
    const far = Math.max(near, Number(fissure.firstFar) || 0);
    const maxLength = Math.max(1, Number(fissure.maxLength) || 1);
    const t = clamp01(along / maxLength);
    return near + (far - near) * (far - near === 0 ? 0 : t);
  }

  function processSlamFissureSegment(fissure, startDist, endDist){
    if(!fissure) return;
    const actualStart = Math.max(0, Math.min(startDist, endDist));
    const actualEnd = Math.max(actualStart, endDist);
    if(!(actualEnd > actualStart)) return;
    const dirX = Number(fissure.dirX) || 0;
    const dirY = Number(fissure.dirY) || 0;
    const startX = Number(fissure.startX) || 0;
    const startY = Number(fissure.startY) || 0;
    const maxLength = Math.max(0, Number(fissure.maxLength) || 0);
    const effectiveHalfWidth = Math.max(0, Number(fissure.width) || 0) * 0.5;
    const effectiveRadius = effectiveHalfWidth + minionRadius;
    const effectiveSq = effectiveRadius * effectiveRadius;
    if(!fissure.hitTargets) fissure.hitTargets = new Set();

    for(const m of minions){
      if(!m || !isEnemyMinionForPlayer(m)) continue;
      if(m.hp <= 0 || m.portalizing > 0) continue;
      if(fissure.hitTargets.has(m)) continue;
      const relX = m.x - startX;
      const relY = m.y - startY;
      const along = relX * dirX + relY * dirY;
      if(along < actualStart - minionRadius) continue;
      if(along > actualEnd + minionRadius) continue;
      if(along < -minionRadius || along > maxLength + minionRadius) continue;
      const clamped = Math.max(actualStart, Math.min(actualEnd, along));
      const closestX = startX + dirX * clamped;
      const closestY = startY + dirY * clamped;
      const offX = m.x - closestX;
      const offY = m.y - closestY;
      if(offX * offX + offY * offY > effectiveSq) continue;
      const prevHp = Number(m.hp) || 0;
      if(fissure.damage > 0){
        m.hp = Math.max(0, prevHp - fissure.damage);
        spawnHitSplat(m.x, m.y - minionRadius, fissure.damage);
      }
      let knock = fissure.otherKnock || 0;
      if(!fissure.firstTargetHit){
        knock = slamFissureKnockupForDistance(fissure, Math.max(0, Math.min(along, fissure.maxLength)));
        fissure.firstTargetHit = true;
      }
      if(knock > 0){
        const existing = typeof m.stunTimer === 'number' ? m.stunTimer : 0;
        m.stunTimer = Math.max(existing, knock);
      }
      handlePracticeDummyDamage(m, prevHp);
      fissure.hitTargets.add(m);
    }
  }

  function applySlamIceFieldTick(field){
    if(!field) return;
    const length = Math.max(0, Math.min(Number(field.maxLength) || 0, Number(field.length) || 0));
    const width = Math.max(0, Number(field.width) || 0);
    if(!(length > 0) || !(width > 0)) return;
    const dirX = Number(field.dirX) || 0;
    const dirY = Number(field.dirY) || 0;
    const startX = Number(field.startX) || 0;
    const startY = Number(field.startY) || 0;
    const slowFraction = Math.max(0, Math.min(1, Number(field.slowFraction) || 0));
    if(slowFraction <= 0) return;
    const halfWidth = width * 0.5;
    const effectiveRadius = halfWidth + minionRadius;
    const effectiveSq = effectiveRadius * effectiveRadius;
    const slowDuration = Math.max(0.1, (Number(field.tickInterval) || 0) * 2);

    for(const m of minions){
      if(!m || !isEnemyMinionForPlayer(m)) continue;
      if(m.hp <= 0 || m.portalizing > 0) continue;
      const relX = m.x - startX;
      const relY = m.y - startY;
      const along = relX * dirX + relY * dirY;
      if(along < -minionRadius || along > length + minionRadius) continue;
      const clamped = Math.max(0, Math.min(length, along));
      const closestX = startX + dirX * clamped;
      const closestY = startY + dirY * clamped;
      const offX = m.x - closestX;
      const offY = m.y - closestY;
      if(offX * offX + offY * offY > effectiveSq) continue;
      const existing = typeof m.slowPct === 'number' ? m.slowPct : 0;
      m.slowPct = Math.max(existing, slowFraction);
      m.slowTimer = Math.max(m.slowTimer || 0, slowDuration);
    }
  }

  function castLaserConeAbility(slotIndex, ability){
    if(player.casting){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }
    const rawCount = abilityFieldValue(ability, 'laserCount');
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if(count <= 0){
      setHudMessage('Laser Cone has no lasers configured.');
      return false;
    }
    const startX = player.x;
    const startY = player.y;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - startX;
    let dy = aimPoint.y - startY;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = player.target.x - startX;
      dy = player.target.y - startY;
      distance = Math.hypot(dx, dy);
    }
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    const baseDirX = dx / distance;
    const baseDirY = dy / distance;
    const configuredDistanceRaw = abilityFieldValue(ability, 'laserDistance');
    const configuredDistance = Math.max(0, Number(configuredDistanceRaw) || 0);
    const centralDistance = configuredDistance > 0 ? configuredDistance : distance;
    const safeDistance = Math.max(1, centralDistance);
    const widthRaw = abilityFieldValue(ability, 'laserWidth');
    const coneWidth = Math.max(0, Number(widthRaw) || 0);
    const projectileWidthRaw = abilityFieldValue(ability, 'laserProjectileWidth');
    const projectileWidth = Math.max(0, Number(projectileWidthRaw) || 0);
    const speedRaw = abilityFieldValue(ability, 'laserSpeed');
    const speed = Math.max(1, Number(speedRaw) || 0);
    const baseDamageRaw = abilityFieldValue(ability, 'baseDamage');
    const baseDamage = Math.max(0, Number(baseDamageRaw) || 0);
    const scaleRaw = abilityFieldValue(ability, 'damageScalePct');
    portalState.scalePct = Math.max(0, Number(scaleRaw) || 0);
    const bonusDamage = player.attackDamage * (portalState.scalePct / 100);
    const totalDamage = Math.max(0, baseDamage + bonusDamage);
    const slowRaw = abilityFieldValue(ability, 'slowPct');
    const slowFraction = Math.max(0, Math.min(1, (Number(slowRaw) || 0) / 100));
    const slowDurationRaw = abilityFieldValue(ability, 'slowDurationMs');
    const slowDurationSeconds = Math.max(0, Number(slowDurationRaw) || 0) / 1000;
    const castTimeRaw = abilityFieldValue(ability, 'castTimeMs');
    const castDuration = Math.max(0, Number(castTimeRaw) || 0) / 1000;
    const abilityName = ability && (ability.shortName || ability.name) ? (ability.shortName || ability.name) : 'Laser Cone';
    const cast = {
      slotIndex,
      abilityId: ability.id,
      abilityName,
      casterRef: player,
      count,
      coneWidth,
      distance: safeDistance,
      speed,
      damage: totalDamage,
      slowFraction,
      slowDuration: slowDurationSeconds,
      projectileWidth,
      castDuration,
      elapsed: 0,
      startX,
      startY,
      targetX: aimPoint.x,
      targetY: aimPoint.y,
      lockedDirX: baseDirX,
      lockedDirY: baseDirY
    };

    if(cast.castDuration <= 0){
      return fireLaserConeCast(cast);
    }

    laserConeCasts.push(cast);
    player.casting = cast;
    cancelPlayerAttack(false);
    player.chaseTarget = null;
    player.target.x = player.x;
    player.target.y = player.y;
    player.navGoal = null;
    player.nav = null;
    setHudMessage(`${abilityName} charging...`);
    return true;
  }

  function castGrabAbility(slotIndex, ability){
    if(player.casting){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const abilityName = ability && (ability.shortName || ability.name) ? (ability.shortName || ability.name) : 'Grab';
    const startX = player.x;
    const startY = player.y;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - startX;
    let dy = aimPoint.y - startY;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = player.target.x - startX;
      dy = player.target.y - startY;
      distance = Math.hypot(dx, dy);
    }
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;

    const rangeRaw = abilityFieldValue(ability, 'grabRange');
    const range = Math.max(0, Number(rangeRaw) || 0);
    if(!(range > 0)){
      setHudMessage(`${abilityName} has no range configured.`);
      return false;
    }
    const speedRaw = abilityFieldValue(ability, 'grabSpeed');
    const speed = Math.max(1, Number(speedRaw) || 0);
    const centerWidthRaw = abilityFieldValue(ability, 'grabWidthCenter');
    const edgeWidthRaw = abilityFieldValue(ability, 'grabWidthEdge');
    const widthStart = Math.max(0, Number(centerWidthRaw) || 0);
    const widthEnd = Math.max(0, Number(edgeWidthRaw) || widthStart);
    const damageRaw = abilityFieldValue(ability, 'damage');
    const damage = Math.max(0, Number(damageRaw) || 0);
    const stunRaw = abilityFieldValue(ability, 'stunDurationMs');
    const stunDuration = Math.max(0, Number(stunRaw) || 0) / 1000;
    const pullRaw = abilityFieldValue(ability, 'pullDistance');
    const pullDistance = Math.max(0, Number(pullRaw) || 0);
    const lockoutRaw = abilityFieldValue(ability, 'postHitLockoutMs');
    const postHitLockout = Math.max(0, Number(lockoutRaw) || 0) / 1000;
    const castRaw = abilityFieldValue(ability, 'castTimeMs');
    const castDuration = Math.max(0, Number(castRaw) || 0) / 1000;

    const cast = {
      slotIndex,
      abilityId: ability.id,
      abilityName,
      casterRef: player,
      dirX,
      dirY,
      range,
      speed,
      widthStart,
      widthEnd,
      damage,
      stunDuration,
      pullDistance,
      postHitLockout,
      channelDuration: castDuration,
      elapsed: 0,
      state: castDuration > 0 ? 'channel' : 'flying',
      distanceTraveled: 0,
      startX,
      startY,
      casterOriginX: player.x,
      casterOriginY: player.y,
      hitPointX: startX,
      hitPointY: startY,
      targetRef: null,
      lockoutRemaining: 0,
      launchAnnounced: castDuration <= 0
    };

    grabCasts.push(cast);
    player.casting = cast;
    cancelPlayerAttack(false);
    player.chaseTarget = null;
    player.target.x = player.x;
    player.target.y = player.y;
    player.navGoal = null;
    player.nav = null;
    const message = cast.state === 'channel' ? `${abilityName} preparing...` : `${abilityName} launched!`;
    setHudMessage(message);
    return true;
  }

  function parsePlasmaFissionSplitTrigger(ability){
    const raw = abilityFieldValue(ability, 'split_trigger', { skipScaling: true });
    const numeric = Number.isFinite(raw) ? Math.round(raw) : 1;
    if(numeric === 0) return 'player_recast';
    if(numeric === 2) return 'end_range';
    return 'collision';
  }

  function castPlasmaFissionAbility(slotIndex, ability, context = {}){
    const abilityName = ability && (ability.shortName || ability.name)
      ? (ability.shortName || ability.name)
      : 'Plasma Fission';
    const existing = plasmaFissionCasts.find(cast => cast && !cast.completed && cast.casterRef === player && cast.abilityId === ability.id);
    if(existing){
      if(existing.splitTriggered){
        setHudMessage(`${abilityName} already split.`);
        return false;
      }
      if(!(existing.recastWindow > 0)){
        setHudMessage(`${abilityName} cannot be recast right now.`);
        return false;
      }
      if(existing.recastRemaining !== undefined && existing.recastRemaining <= 0){
        setHudMessage(`${abilityName} recast window expired.`);
        return false;
      }
      if(!existing.projectile){
        setHudMessage(`${abilityName} is no longer in flight.`);
        return false;
      }
      const triggered = triggerPlasmaFissionSplit(existing, existing.projectile, 'player_recast', { announce: true });
      if(triggered){
        return { success: true, deferCooldown: true };
      }
      setHudMessage(`${abilityName} could not split.`);
      return false;
    }

    if(player.casting && player.casting.abilityId && player.casting.abilityId !== ability.id){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const cooldownSeconds = abilityCooldownSeconds(ability);
    const projectileSpeedConfig = abilityFieldValue(ability, 'projectile_speed_px_per_ms');
    const projectileSpeed = Math.max(0, Number(projectileSpeedConfig) || 0);
    const projectileWidthRaw = abilityFieldValue(ability, 'projectile_width_px');
    const projectileWidth = Math.max(0, Number(projectileWidthRaw) || 0);
    const projectileRangeRaw = abilityFieldValue(ability, 'projectile_range_px');
    const projectileRange = Math.max(0, Number(projectileRangeRaw) || 0);
    if(!(projectileSpeed > 0) || !(projectileRange > 0)){
      setHudMessage(`${abilityName} needs range and speed configured.`);
      return false;
    }
    const splitAngleRaw = abilityFieldValue(ability, 'split_angle_deg');
    const splitAngle = Number.isFinite(splitAngleRaw) ? (splitAngleRaw * Math.PI / 180) : 0;
    const splitSpeedConfig = abilityFieldValue(ability, 'split_speed_px_per_ms');
    let splitSpeed = Math.max(0, Number(splitSpeedConfig) || 0);
    if(!(splitSpeed > 0)) splitSpeed = projectileSpeed;
    const damageRaw = abilityFieldValue(ability, 'damage_flat');
    const damage = Math.max(0, Number(damageRaw) || 0);
    const slowPctRaw = abilityFieldValue(ability, 'slow_percent');
    const slowFraction = Math.max(0, Math.min(1, (Number(slowPctRaw) || 0) / 100));
    const slowDurationRaw = abilityFieldValue(ability, 'slow_duration_ms');
    const slowDuration = Math.max(0, Number(slowDurationRaw) || 0) / 1000;
    const recastWindowRaw = abilityFieldValue(ability, 'recast_window_ms');
    const recastWindow = Math.max(0, Number(recastWindowRaw) || 0) / 1000;
    const splitTrigger = parsePlasmaFissionSplitTrigger(ability);

    const startX = player.x;
    const startY = player.y;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - startX;
    let dy = aimPoint.y - startY;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = player.target.x - startX;
      dy = player.target.y - startY;
      distance = Math.hypot(dx, dy);
    }
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;

    const autoSplitDistance = projectileRange > 0 ? Math.min(distance, projectileRange) : distance;

    const cast = {
      abilityId: ability.id,
      abilityName,
      slotIndex,
      casterRef: player,
      cooldownSeconds,
      recastWindow,
      recastRemaining: recastWindow,
      splitTriggered: false,
      splitTrigger,
      splitAngle,
      splitSpeed,
      projectileWidth,
      projectileRange,
      projectileSpeed,
      damage,
      slowFraction,
      slowDuration,
      targetX: aimPoint.x,
      targetY: aimPoint.y,
      autoSplitDistance,
      startedAt: performance.now(),
      completed: false,
      projectile: null
    };

    const projectile = spawnPlasmaFissionProjectile({
      type: 'primary',
      castRef: cast,
      abilityName,
      originX: startX,
      originY: startY,
      dirX,
      dirY,
      speed: projectileSpeed,
      range: projectileRange,
      width: projectileWidth,
      damage,
      slowFraction,
      slowDuration,
      casterRef: player
    });

    if(!projectile){
      setHudMessage(`${abilityName} fizzled.`);
      return false;
    }

    projectile.autoSplitDistance = autoSplitDistance;

    cast.projectile = projectile;
    plasmaFissionCasts.push(cast);
    cancelPlayerAttack(false);
    player.chaseTarget = null;
    const recastText = recastWindow > 0 ? formatSeconds(recastWindow * 1000) : null;
    if(recastText){
      setHudMessage(`${abilityName} launched  will auto-split near your cursor (recast within ${recastText} for manual control).`);
    } else {
      setHudMessage(`${abilityName} launched  will auto-split near your cursor.`);
    }
    flash(startX, startY, { startRadius: 10, endRadius: 32, color: '#b9f0ff' });
    return { success: true, deferCooldown: true };
  }

  function spawnPlasmaFissionProjectile(opts){
    if(!opts) return null;
    const range = Math.max(0, Number(opts.range) || 0);
    const speed = Math.max(0, Number(opts.speed) || 0);
    if(!(range > 0) || !(speed > 0)) return null;
    let dirX = Number(opts.dirX) || 0;
    let dirY = Number(opts.dirY) || 0;
    const dirLen = Math.hypot(dirX, dirY);
    if(!(dirLen > 0.0001)) return null;
    dirX /= dirLen;
    dirY /= dirLen;
    const projectile = {
      type: opts.type === 'split' ? 'split' : 'primary',
      abilityName: opts.abilityName || 'Plasma Fission',
      startX: Number(opts.originX) || 0,
      startY: Number(opts.originY) || 0,
      currentX: Number(opts.originX) || 0,
      currentY: Number(opts.originY) || 0,
      dirX,
      dirY,
      speed,
      range,
      width: Math.max(0, Number(opts.width) || 0),
      damage: Math.max(0, Number(opts.damage) || 0),
      slowFraction: Math.max(0, Math.min(1, Number(opts.slowFraction) || 0)),
      slowDuration: Math.max(0, Number(opts.slowDuration) || 0),
      traveled: 0,
      castRef: opts.castRef || null,
      casterRef: opts.casterRef || (opts.castRef ? opts.castRef.casterRef : null),
      removed: false
    };
    plasmaFissionProjectiles.push(projectile);
    return projectile;
  }

  function completePlasmaFissionCast(cast, { cause = 'complete', message = null } = {}){
    if(!cast || cast.completed) return;
    cast.completed = true;
    cast.projectile = null;
    const cooldown = Math.max(0, Number(cast.cooldownSeconds) || 0);
    setAbilitySlotCooldown(cast.slotIndex, cooldown);
    const idx = plasmaFissionCasts.indexOf(cast);
    if(idx >= 0){
      plasmaFissionCasts.splice(idx, 1);
    }
    if(message && cast.casterRef === player){
      setHudMessage(message);
    }
  }

  function triggerPlasmaFissionSplit(cast, projectile, cause = 'collision', { x, y, traveled, announce = false } = {}){
    if(!cast || cast.completed || cast.splitTriggered) return false;
    if(!projectile || projectile.type !== 'primary') return false;
    if(cause === 'player_recast' && (!(cast.recastWindow > 0) || (cast.recastRemaining !== undefined && cast.recastRemaining <= 0))){
      return false;
    }
    const currentTraveled = Number.isFinite(traveled) ? traveled : Math.max(0, Number(projectile.traveled) || 0);
    const remainingRange = Math.max(0, Number(projectile.range) || 0) - currentTraveled;
    const splitRange = Math.max(0, remainingRange);
    if(!(splitRange > 0) || !(cast.splitSpeed > 0)){
      completePlasmaFissionCast(cast, { cause, message: announce && cast.casterRef === player ? `${cast.abilityName || 'Plasma Fission'} ended.` : null });
      projectile.removed = true;
      return false;
    }
    const baseX = Number.isFinite(x) ? x : (Number.isFinite(projectile.currentX) ? projectile.currentX : projectile.startX);
    const baseY = Number.isFinite(y) ? y : (Number.isFinite(projectile.currentY) ? projectile.currentY : projectile.startY);
    const dirX = Number(projectile.dirX) || 0;
    const dirY = Number(projectile.dirY) || 0;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const normX = dirX / dirLen;
    const normY = dirY / dirLen;
    const angle = Number.isFinite(cast.splitAngle) ? cast.splitAngle : 0;
    const rotate = (angleRad) => {
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      return {
        x: normX * cos - normY * sin,
        y: normX * sin + normY * cos
      };
    };
    const leftDir = rotate(angle);
    const rightDir = rotate(-angle);

    spawnPlasmaFissionProjectile({
      type: 'split',
      abilityName: cast.abilityName,
      originX: baseX,
      originY: baseY,
      dirX: leftDir.x,
      dirY: leftDir.y,
      speed: cast.splitSpeed,
      range: splitRange,
      width: cast.projectileWidth,
      damage: cast.damage,
      slowFraction: cast.slowFraction,
      slowDuration: cast.slowDuration,
      casterRef: cast.casterRef
    });
    spawnPlasmaFissionProjectile({
      type: 'split',
      abilityName: cast.abilityName,
      originX: baseX,
      originY: baseY,
      dirX: rightDir.x,
      dirY: rightDir.y,
      speed: cast.splitSpeed,
      range: splitRange,
      width: cast.projectileWidth,
      damage: cast.damage,
      slowFraction: cast.slowFraction,
      slowDuration: cast.slowDuration,
      casterRef: cast.casterRef
    });

    cast.splitTriggered = true;
    cast.splitCause = cause;
    cast.projectile = null;
    projectile.removed = true;
    flash(baseX, baseY, { startRadius: 12, endRadius: 38, color: '#b9f0ff' });
    const message = cast.casterRef === player ? `${cast.abilityName || 'Plasma Fission'} split!` : null;
    completePlasmaFissionCast(cast, { cause, message: announce ? message : null });
    return true;
  }

  function updatePlasmaFissionCasts(dt){
    for(let i = plasmaFissionCasts.length - 1; i >= 0; i--){
      const cast = plasmaFissionCasts[i];
      if(!cast){
        plasmaFissionCasts.splice(i, 1);
        continue;
      }
      if(cast.completed){
        plasmaFissionCasts.splice(i, 1);
        continue;
      }
      cast.elapsed = (cast.elapsed || 0) + dt;
      if(Number.isFinite(cast.recastRemaining)){
        cast.recastRemaining = Math.max(0, cast.recastRemaining - dt);
      }
      if(!cast.projectile){
        completePlasmaFissionCast(cast, { cause: 'expired' });
      }
    }
  }

  function updatePlasmaFissionProjectiles(dt){
    for(let i = plasmaFissionProjectiles.length - 1; i >= 0; i--){
      const proj = plasmaFissionProjectiles[i];
      if(!proj || proj.removed){
        plasmaFissionProjectiles.splice(i, 1);
        continue;
      }
      const speed = Math.max(0, Number(proj.speed) || 0);
      const range = Math.max(0, Number(proj.range) || 0);
      if(!(speed > 0) || !(range > 0)){
        plasmaFissionProjectiles.splice(i, 1);
        continue;
      }
      const prevTraveled = Math.max(0, Number(proj.traveled) || 0);
      const nextTraveled = Math.min(range, prevTraveled + speed * dt);
      const halfWidth = Math.max(0, Number(proj.width) || 0) * 0.5;
      const effectiveRadius = halfWidth + minionRadius;
      const effectiveSq = effectiveRadius * effectiveRadius;
      let hitTarget = null;
      let hitAlong = Infinity;
      for(const m of minions){
        if(!m || !isEnemyMinionForPlayer(m)) continue;
        if(m.hp <= 0 || m.portalizing > 0) continue;
        const relX = m.x - proj.startX;
        const relY = m.y - proj.startY;
        const along = relX * proj.dirX + relY * proj.dirY;
        if(along < prevTraveled - minionRadius) continue;
        if(along > nextTraveled + minionRadius) continue;
        if(along < -minionRadius || along > range + minionRadius) continue;
        const closestX = proj.startX + proj.dirX * along;
        const closestY = proj.startY + proj.dirY * along;
        const offX = m.x - closestX;
        const offY = m.y - closestY;
        if(offX * offX + offY * offY <= effectiveSq && along < hitAlong){
          hitAlong = along;
          hitTarget = m;
        }
      }

      if(hitTarget){
        const hitX = proj.startX + proj.dirX * hitAlong;
        const hitY = proj.startY + proj.dirY * hitAlong;
        const prevHp = Number(hitTarget.hp) || 0;
        if(proj.damage > 0){
          hitTarget.hp = Math.max(0, prevHp - proj.damage);
          spawnHitSplat(hitTarget.x, hitTarget.y - minionRadius, proj.damage);
        }
        if(proj.slowFraction > 0){
          const existingSlow = typeof hitTarget.slowPct === 'number' ? hitTarget.slowPct : 0;
          hitTarget.slowPct = Math.max(existingSlow, proj.slowFraction);
          if(proj.slowDuration > 0){
            hitTarget.slowTimer = Math.max(hitTarget.slowTimer || 0, proj.slowDuration);
          }
        }
        handlePracticeDummyDamage(hitTarget, prevHp);
        flash(hitX, hitY, { startRadius: 10, endRadius: 30, color: '#b9f0ff' });
        const owner = proj.castRef ? proj.castRef.casterRef : proj.casterRef;
        if(owner === player){
          const dmgText = proj.damage > 0 ? ` for ${Math.round(proj.damage)} damage` : '';
          setHudMessage(`${proj.abilityName || 'Plasma Fission'} hit${dmgText}!`);
        }
        if(proj.castRef && proj.type === 'primary'){
          const cast = proj.castRef;
          if(!cast.splitTriggered && cast.splitTrigger === 'collision'){
            triggerPlasmaFissionSplit(cast, proj, 'collision', { x: hitX, y: hitY, traveled: hitAlong });
          } else {
            cast.projectile = null;
            completePlasmaFissionCast(cast, { cause: 'impact' });
          }
        }
        plasmaFissionProjectiles.splice(i, 1);
        continue;
      }

      if(proj.castRef && proj.type === 'primary'){
        const cast = proj.castRef;
        if(cast && !cast.splitTriggered){
          const autoDistanceRaw = Number(cast.autoSplitDistance);
          const autoDistance = Math.max(0, Number.isFinite(autoDistanceRaw) ? autoDistanceRaw : Number(proj.autoSplitDistance) || 0);
          if(autoDistance > 0){
            const triggerDistance = Math.min(range, autoDistance);
            if(nextTraveled >= triggerDistance - 0.0001){
              const autoX = proj.startX + proj.dirX * triggerDistance;
              const autoY = proj.startY + proj.dirY * triggerDistance;
              const triggered = triggerPlasmaFissionSplit(cast, proj, 'auto', {
                x: autoX,
                y: autoY,
                traveled: triggerDistance,
                announce: true
              });
              if(triggered){
                plasmaFissionProjectiles.splice(i, 1);
                continue;
              }
            }
          }
        }
      }

      proj.traveled = nextTraveled;
      proj.currentX = proj.startX + proj.dirX * nextTraveled;
      proj.currentY = proj.startY + proj.dirY * nextTraveled;

      if(nextTraveled >= range - 0.0001){
        if(proj.castRef && proj.type === 'primary'){
          const cast = proj.castRef;
          if(!cast.splitTriggered && cast.splitTrigger === 'end_range'){
            triggerPlasmaFissionSplit(cast, proj, 'end_range', { x: proj.currentX, y: proj.currentY, traveled: range });
          } else {
            cast.projectile = null;
            completePlasmaFissionCast(cast, { cause: 'expire', message: cast.casterRef === player ? `${cast.abilityName || 'Plasma Fission'} dissipated.` : null });
          }
        }
        plasmaFissionProjectiles.splice(i, 1);
      }
    }
  }

  function drawPlasmaFissionProjectiles(){
    for(const proj of plasmaFissionProjectiles){
      if(!proj) continue;
      const headX = Number.isFinite(proj.currentX) ? proj.currentX : proj.startX;
      const headY = Number.isFinite(proj.currentY) ? proj.currentY : proj.startY;
      const tailLength = Math.min(Math.max(0, Number(proj.traveled) || 0), 220);
      const tailX = headX - proj.dirX * tailLength;
      const tailY = headY - proj.dirY * tailLength;
      const width = Math.max(2, (Number(proj.width) || 0) * 0.4 + 2);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = proj.type === 'primary' ? 0.9 : 0.8;
      ctx.shadowColor = '#b9f0ff';
      ctx.shadowBlur = proj.type === 'primary' ? 20 : 14;
      ctx.strokeStyle = '#b9f0ffcc';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1, width * 0.45);
      ctx.strokeStyle = '#f2fbff';
      ctx.beginPath();
      ctx.moveTo(headX - proj.dirX * Math.max(6, width * 0.6), headY - proj.dirY * Math.max(6, width * 0.6));
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function castPiercingArrowAbility(slotIndex, ability, context = {}){
    const abilityName = ability && (ability.shortName || ability.name)
      ? (ability.shortName || ability.name)
      : 'Piercing Arrow';
    const existing = piercingArrowCasts.find(cast => cast && cast.casterRef === player && cast.abilityId === ability.id);
    if(existing){
      setHudMessage(`${abilityName} is already charging.`);
      return false;
    }
    if(player.casting && player.casting.abilityId && player.casting.abilityId !== ability.id){
      setHudMessage(`${player.casting.abilityName || 'Spell'} is already casting.`);
      return false;
    }

    const cooldownSeconds = abilityCooldownSeconds(ability);
    const chargeMinMs = Math.max(0, Number(abilityFieldValue(ability, 'chargeMinMs')) || 0);
    const chargeMaxMsRaw = Number(abilityFieldValue(ability, 'chargeMaxMs'));
    const chargeMaxMs = Math.max(chargeMinMs, Number.isFinite(chargeMaxMsRaw) ? Math.max(0, chargeMaxMsRaw) : chargeMinMs);
    const rangeMin = Math.max(0, Number(abilityFieldValue(ability, 'rangeMinPx')) || 0);
    const rangeMax = Math.max(rangeMin, Number(abilityFieldValue(ability, 'rangeMaxPx')) || rangeMin);
    const damageMin = Math.max(0, Number(abilityFieldValue(ability, 'damageMin')) || 0);
    const damageMax = Math.max(damageMin, Number(abilityFieldValue(ability, 'damageMax')) || damageMin);
    const projectileSpeedConfig = Math.max(0, Number(abilityFieldValue(ability, 'projectileSpeedPxPerMs')) || 0);
    const width = Math.max(0, Number(abilityFieldValue(ability, 'widthPx')) || 0);
    const movementSlowPct = Math.max(0, Math.min(100, Number(abilityFieldValue(ability, 'movementSlowPct')) || 0));
    const canCancel = Number(abilityFieldValue(ability, 'canCancelCharge')) > 0;

    const caster = player;
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - caster.x;
    let dy = aimPoint.y - caster.y;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = player.target.x - caster.x;
      dy = player.target.y - caster.y;
      distance = Math.hypot(dx, dy);
    }
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    const dirX = dx / distance;
    const dirY = dy / distance;

    const cast = {
      abilityId: ability.id,
      abilityName,
      slotIndex,
      casterRef: caster,
      state: 'charging',
      chargeElapsed: 0,
      chargeMin: chargeMinMs / 1000,
      chargeMax: chargeMaxMs / 1000,
      rangeMin,
      rangeMax,
      damageMin,
      damageMax,
      projectileSpeed: projectileSpeedConfig,
      width,
      cooldownSeconds,
      allowMovementWhileCasting: true,
      movementSpeedMultiplier: movementSlowPct >= 100 ? 0 : Math.max(0, 1 - movementSlowPct / 100),
      movementSlowPct,
      activatorKeyCode: context && context.triggerEvent && context.triggerEvent.code ? context.triggerEvent.code : null,
      activatorKey: context && context.triggerEvent && context.triggerEvent.key ? String(context.triggerEvent.key).toLowerCase() : null,
      cancelCooldownFraction: 0.5,
      canCancel,
      dirX,
      dirY,
      initialDirX: dirX,
      initialDirY: dirY,
      startedAt: performance.now(),
      released: false
    };

    cast.chargeState = computePiercingArrowChargeState(cast);
    piercingArrowCasts.push(cast);
    player.casting = cast;
    cancelPlayerAttack(false);
    player.chaseTarget = null;
    player.target.x = player.x;
    player.target.y = player.y;
    player.navGoal = null;
    player.nav = null;

    if(cast.chargeMax <= 0 && cast.chargeMin <= 0){
      releasePiercingArrow(cast, { cause: 'auto' });
      return true;
    }

    setHudMessage(`${abilityName} charging...`);
    return { success: true, deferCooldown: true };
  }

  function computePiercingArrowChargeState(cast){
    if(!cast){
      return {
        elapsed: 0,
        minCharge: 0,
        maxCharge: 0,
        effectiveElapsed: 0,
        normalized: 0,
        rangeMin: 0,
        rangeMax: 0,
        range: 0,
        damageMin: 0,
        damageMax: 0,
        damage: 0
      };
    }

    const elapsed = Math.max(0, Number(cast.chargeElapsed) || 0);
    const minCharge = Math.max(0, Number(cast.chargeMin) || 0);
    const maxChargeRaw = Number(cast.chargeMax);
    const maxCharge = Math.max(minCharge, Number.isFinite(maxChargeRaw) ? Math.max(0, maxChargeRaw) : 0);
    const rangeMin = Math.max(0, Number(cast.rangeMin) || 0);
    const rangeMaxRaw = Number(cast.rangeMax);
    const rangeMax = Math.max(rangeMin, Number.isFinite(rangeMaxRaw) ? Math.max(0, rangeMaxRaw) : rangeMin);
    const damageMin = Math.max(0, Number(cast.damageMin) || 0);
    const damageMaxRaw = Number(cast.damageMax);
    const damageMax = Math.max(damageMin, Number.isFinite(damageMaxRaw) ? Math.max(0, damageMaxRaw) : damageMin);

    const effectiveElapsed = maxCharge > 0
      ? Math.min(Math.max(elapsed, minCharge), maxCharge)
      : Math.max(elapsed, minCharge);

    let normalized;
    if(maxCharge > minCharge){
      const denom = Math.max(maxCharge - minCharge, 0.000001);
      normalized = (effectiveElapsed - minCharge) / denom;
    } else {
      normalized = effectiveElapsed > 0 ? 1 : 0;
    }
    normalized = Math.max(0, Math.min(1, normalized));

    const range = rangeMin + (rangeMax - rangeMin) * normalized;
    const damage = damageMin + (damageMax - damageMin) * normalized;

    return {
      elapsed,
      minCharge,
      maxCharge,
      effectiveElapsed,
      normalized,
      rangeMin,
      rangeMax,
      range,
      damageMin,
      damageMax,
      damage
    };
  }

  function clearPiercingArrowCast(cast){
    if(!cast) return;
    const idx = piercingArrowCasts.indexOf(cast);
    if(idx >= 0){
      piercingArrowCasts.splice(idx, 1);
    }
    if(cast.casterRef === player && player.casting === cast){
      player.casting = null;
    }
  }

  function releasePiercingArrow(cast, { cause = 'release' } = {}){
    if(!cast || cast.released) return false;
    cast.released = true;
    clearPiercingArrowCast(cast);

    const abilityName = cast.abilityName || 'Piercing Arrow';
    const cooldownSeconds = Number.isFinite(cast.cooldownSeconds) ? Math.max(0, Number(cast.cooldownSeconds) || 0) : 0;

    if(Number.isFinite(cast.startedAt)){
      const elapsedSeconds = Math.max(0, (performance.now() - cast.startedAt) / 1000);
      cast.chargeElapsed = Math.max(Number(cast.chargeElapsed) || 0, elapsedSeconds);
    }

    const state = computePiercingArrowChargeState(cast);
    cast.chargeState = state;
    const range = state.range;
    const damage = state.damage;
    const projectileSpeed = Math.max(0, Number(cast.projectileSpeed) || 0);
    const width = Math.max(0, Number(cast.width) || 0);

    const caster = cast.casterRef || player;
    const { x: originX, y: originY } = getSpellOrigin(caster);

    let dirX = Number.isFinite(cast.dirX) ? cast.dirX : (Number.isFinite(cast.initialDirX) ? cast.initialDirX : 1);
    let dirY = Number.isFinite(cast.dirY) ? cast.dirY : (Number.isFinite(cast.initialDirY) ? cast.initialDirY : 0);
    const aimPoint = beamAimPoint();
    let dx = aimPoint.x - originX;
    let dy = aimPoint.y - originY;
    let len = Math.hypot(dx, dy);
    if(!(len > 0.0001)){
      dx = player.target.x - originX;
      dy = player.target.y - originY;
      len = Math.hypot(dx, dy);
    }
    if(len > 0.0001){
      dirX = dx / len;
      dirY = dy / len;
    } else {
      const dirLen = Math.hypot(dirX, dirY);
      if(dirLen > 0.0001){
        dirX /= dirLen;
        dirY /= dirLen;
      } else {
        dirX = 1;
        dirY = 0;
      }
    }

    if(!(range > 0) || !(projectileSpeed > 0)){
      setAbilitySlotCooldown(cast.slotIndex, cooldownSeconds);
      if(caster === player){
        setHudMessage(`${abilityName} fizzled.`);
      }
      return false;
    }

    const projectile = spawnPiercingArrowProjectile({
      abilityName,
      originX,
      originY,
      dirX,
      dirY,
      range,
      speed: projectileSpeed,
      width,
      damage,
      casterRef: caster
    });

    if(!projectile){
      setAbilitySlotCooldown(cast.slotIndex, cooldownSeconds);
      if(caster === player){
        setHudMessage(`${abilityName} fizzled.`);
      }
      return false;
    }

    flash(originX, originY, { startRadius: 12, endRadius: 36, color: '#9de0ff' });
    if(caster === player){
      const damageText = Math.round(damage);
      const rangeText = Math.round(range);
      if(cause === 'auto' && state.maxCharge > 0){
        setHudMessage(`${abilityName} auto-fired at max charge  ${damageText} dmg, ${rangeText}px range.`);
      } else {
        setHudMessage(`${abilityName} fired  ${damageText} dmg, ${rangeText}px range.`);
      }
    }
    setAbilitySlotCooldown(cast.slotIndex, cooldownSeconds);
    return true;
  }

  function cancelPiercingArrowCast(cast){
    if(!cast || cast.released) return false;
    cast.released = true;
    clearPiercingArrowCast(cast);
    const abilityName = cast.abilityName || 'Piercing Arrow';
    const cooldownSeconds = Number.isFinite(cast.cooldownSeconds) ? Math.max(0, Number(cast.cooldownSeconds) || 0) : 0;
    const fractionRaw = Number.isFinite(cast.cancelCooldownFraction) ? cast.cancelCooldownFraction : 0.5;
    const fraction = Math.max(0, Math.min(1, Number(fractionRaw) || 0));
    const cooldown = cooldownSeconds * fraction;
    setAbilitySlotCooldown(cast.slotIndex, cooldown);
    if(cast.casterRef === player){
      const refundPct = Math.round((1 - fraction) * 100);
      if(refundPct > 0){
        setHudMessage(`${abilityName} cancelled  ${refundPct}% cooldown refunded.`);
      } else {
        setHudMessage(`${abilityName} cancelled.`);
      }
    }
    return true;
  }

  function spawnPiercingArrowProjectile(opts){
    if(!opts) return null;
    const range = Math.max(0, Number(opts.range) || 0);
    const speed = Math.max(0, Number(opts.speed) || 0);
    if(!(range > 0) || !(speed > 0)) return null;
    let dirX = Number(opts.dirX) || 0;
    let dirY = Number(opts.dirY) || 0;
    const dirLen = Math.hypot(dirX, dirY);
    if(!(dirLen > 0.0001)) return null;
    dirX /= dirLen;
    dirY /= dirLen;
    const projectile = {
      abilityName: opts.abilityName || 'Piercing Arrow',
      startX: Number(opts.originX) || 0,
      startY: Number(opts.originY) || 0,
      currentX: Number(opts.originX) || 0,
      currentY: Number(opts.originY) || 0,
      dirX,
      dirY,
      speed,
      range,
      width: Math.max(0, Number(opts.width) || 0),
      damage: Math.max(0, Number(opts.damage) || 0),
      traveled: 0,
      casterRef: opts.casterRef || null,
      hitTargets: new Set(),
      announcedHit: false
    };
    piercingArrowProjectiles.push(projectile);
    return projectile;
  }

  function applyPiercingArrowHit(projectile, target){
    if(!projectile || !target) return;
    const prevHp = Number(target.hp) || 0;
    if(Number(projectile.damage) > 0){
      target.hp = Math.max(0, prevHp - projectile.damage);
      spawnHitSplat(target.x, target.y - minionRadius, projectile.damage);
    }
    flash(target.x, target.y, { startRadius: 10, endRadius: 32, color: '#cbe9ff' });
    if(!projectile.announcedHit && projectile.casterRef === player){
      const dmgValue = Math.round(Number(projectile.damage) || 0);
      if(dmgValue > 0){
        setHudMessage(`${projectile.abilityName || 'Piercing Arrow'} hit for ${dmgValue} damage!`);
      } else {
        setHudMessage(`${projectile.abilityName || 'Piercing Arrow'} hit!`);
      }
      projectile.announcedHit = true;
    }
    handlePracticeDummyDamage(target, prevHp);
  }

  function cancelActivePiercingArrowCharge(){
    for(let i = piercingArrowCasts.length - 1; i >= 0; i--){
      const cast = piercingArrowCasts[i];
      if(!cast || cast.released) continue;
      if(cast.casterRef !== player) continue;
      if(!cast.canCancel) continue;
      cancelPiercingArrowCast(cast);
      return true;
    }
    return false;
  }

  function resolveLaserConeCastGeometry(cast){
    if(!cast) return null;
    const caster = cast.casterRef;
    let { x: startX, y: startY } = resolveCastOrigin(cast);
    let dirX = Number(cast.lockedDirX);
    let dirY = Number(cast.lockedDirY);
    let dirLen = Math.hypot(dirX, dirY);
    if(!(dirLen > 0.0001)){
      const targetX = Number.isFinite(cast.targetX) ? cast.targetX : (startX + 1);
      const targetY = Number.isFinite(cast.targetY) ? cast.targetY : startY;
      dirX = targetX - startX;
      dirY = targetY - startY;
      dirLen = Math.hypot(dirX, dirY);
    }
    if(!(dirLen > 0.0001)){
      dirX = 1;
      dirY = 0;
      dirLen = 1;
    }
    const normX = dirX / dirLen;
    const normY = dirY / dirLen;
    const distance = Math.max(1, Number(cast.distance) || 0);
    const coneWidth = Math.max(0, Number(cast.coneWidth) || 0);
    const count = Math.max(0, Math.floor(Number(cast.count) || 0));
    const projectileWidth = Math.max(0, Number(cast.projectileWidth) || 0);
    const spacing = count > 1 ? coneWidth / (count - 1) : 0;
    const fallbackThickness = coneWidth > 0 ? spacing * 0.6 : distance * 0.04;
    const thicknessBase = projectileWidth > 0 ? projectileWidth : (fallbackThickness || 16);
    const thickness = Math.max(1, Math.min(1000, thicknessBase));

    cast.startX = startX;
    cast.startY = startY;

    return {
      startX,
      startY,
      dirX: normX,
      dirY: normY,
      distance,
      coneWidth,
      count,
      spacing,
      thickness
    };
  }

  function fireLaserConeCast(cast){
    const geom = resolveLaserConeCastGeometry(cast);
    if(!geom || geom.count <= 0){
      setHudMessage('Laser Cone has no lasers configured.');
      if(cast && cast.casterRef === player && player.casting === cast){
        player.casting = null;
      }
      return false;
    }
    const speed = Math.max(1, Number(cast.speed) || 0);
    const totalDamage = Math.max(0, Number(cast.damage) || 0);
    const slowFraction = Math.max(0, Math.min(1, Number(cast.slowFraction) || 0));
    const slowDurationSeconds = Math.max(0, Number(cast.slowDuration) || 0);
    const abilityName = cast && cast.abilityName ? cast.abilityName : 'Laser Cone';
    const perpX = -geom.dirY;
    const perpY = geom.dirX;
    let lasersSpawned = 0;
    for(let i=0;i<geom.count;i++){
      const fraction = geom.count > 1 ? (i / (geom.count - 1)) : 0.5;
      const offsetFromCenter = (fraction - 0.5) * geom.coneWidth;
      const targetX = geom.startX + geom.dirX * geom.distance + perpX * offsetFromCenter;
      const targetY = geom.startY + geom.dirY * geom.distance + perpY * offsetFromCenter;
      let tx = targetX - geom.startX;
      let ty = targetY - geom.startY;
      let len = Math.hypot(tx, ty);
      if(!(len > 0.0001)){
        tx = geom.dirX;
        ty = geom.dirY;
        len = 1;
      }
      const dirX = tx / len;
      const dirY = ty / len;
      const maxDistance = Math.max(1, len);
      laserProjectiles.push({
        startX: geom.startX,
        startY: geom.startY,
        dirX,
        dirY,
        speed,
        maxDistance,
        traveled: 0,
        width: geom.thickness,
        damage: totalDamage,
        slowFraction,
        slowDuration: slowDurationSeconds,
        casterRef: cast ? cast.casterRef : null,
        abilityName,
        currentX: geom.startX,
        currentY: geom.startY
      });
      lasersSpawned++;
    }
    if(lasersSpawned <= 0){
      setHudMessage('Laser Cone fizzled.');
      if(cast && cast.casterRef === player && player.casting === cast){
        player.casting = null;
      }
      return false;
    }
    cancelPlayerAttack(false);
    flash(geom.startX, geom.startY, { startRadius: 10, endRadius: 42, color: '#7fe3ff' });
    setHudMessage(`${abilityName} fired!`);
    if(cast && cast.casterRef === player && player.casting === cast){
      player.casting = null;
    }
    return true;
  }

  function grabWidthAt(cast, distance){
    if(!cast) return 0;
    const start = Number(cast.widthStart) || 0;
    const rawEnd = Number(cast.widthEnd);
    const end = Number.isFinite(rawEnd) ? rawEnd : start;
    if(!(cast.range > 0)) return Math.max(0, start);
    const t = Math.max(0, Math.min(1, distance / cast.range));
    return Math.max(0, start + (end - start) * t);
  }

  function findGrabHitCandidate(cast, prevDistance, nextDistance){
    if(!cast) return null;
    const dirX = Number(cast.dirX) || 0;
    const dirY = Number(cast.dirY) || 0;
    const maxDistance = Math.max(0, Number(cast.range) || 0);
    let best = null;
    let bestAlong = Infinity;
    for(const m of minions){
      if(!m || !isEnemyMinionForPlayer(m)) continue;
      if(m.portalizing > 0 || m.hp <= 0) continue;
      const relX = m.x - cast.startX;
      const relY = m.y - cast.startY;
      const along = relX * dirX + relY * dirY;
      if(!(along >= 0)) continue;
      if(along > maxDistance) continue;
      if(along < prevDistance - minionRadius) continue;
      if(along > nextDistance + minionRadius) continue;
      const closestX = cast.startX + dirX * along;
      const closestY = cast.startY + dirY * along;
      const offX = m.x - closestX;
      const offY = m.y - closestY;
      const width = grabWidthAt(cast, along);
      const effectiveRadius = width * 0.5 + minionRadius;
      if(offX * offX + offY * offY <= effectiveRadius * effectiveRadius){
        if(along < bestAlong){
          bestAlong = along;
          best = { target: m, along, hitX: closestX, hitY: closestY };
        }
      }
    }
    return best;
  }

  function releaseGrabbedTarget(cast){
    if(!cast) return;
    const target = cast.targetRef;
    if(target && target.beingPulledBy === cast){
      target.beingPulledBy = null;
    }
    cast.targetRef = null;
  }

  function concludeGrabCast(cast, index){
    releaseGrabbedTarget(cast);
    if(cast && cast.casterRef === player && player.casting === cast){
      player.casting = null;
    }
    if(Number.isFinite(index)){
      grabCasts.splice(index, 1);
    }
  }

  function updateGrabCasts(dt){
    for(let i = grabCasts.length - 1; i >= 0; i--){
      const cast = grabCasts[i];
      if(!cast){
        grabCasts.splice(i, 1);
        continue;
      }
      const caster = cast.casterRef;
      const state = cast.state || 'flying';
      if(state === 'channel'){
        const duration = Math.max(0, Number(cast.channelDuration) || 0);
        cast.elapsed = Math.max(0, (cast.elapsed || 0) + dt);
        if(cast.elapsed >= duration){
          cast.elapsed = 0;
          if(caster){
            const casterOrigin = getSpellOrigin(caster);
            if(Number.isFinite(casterOrigin.x)) cast.startX = casterOrigin.x;
            if(Number.isFinite(casterOrigin.y)) cast.startY = casterOrigin.y;
          } else {
            const fallback = getSpellOrigin(player);
            cast.startX = fallback.x;
            cast.startY = fallback.y;
          }
          cast.casterOriginX = cast.startX;
          cast.casterOriginY = cast.startY;
          cast.hitPointX = cast.startX;
          cast.hitPointY = cast.startY;
          cast.distanceTraveled = 0;
          cast.state = 'flying';
          if(!cast.launchAnnounced && caster === player){
            setHudMessage(`${cast.abilityName || 'Grab'} launched!`);
          }
          cast.launchAnnounced = true;
        }
        continue;
      }

      if(state === 'flying'){
        const prevDistance = Number(cast.distanceTraveled) || 0;
        const speed = Math.max(0, Number(cast.speed) || 0);
        const maxDistance = Math.max(0, Number(cast.range) || 0);
        const nextDistance = Math.min(maxDistance, prevDistance + speed * dt);
        cast.distanceTraveled = nextDistance;
        cast.hitPointX = cast.startX + cast.dirX * nextDistance;
        cast.hitPointY = cast.startY + cast.dirY * nextDistance;
        const hit = findGrabHitCandidate(cast, prevDistance, nextDistance);
        if(hit){
          cast.distanceTraveled = Math.min(hit.along, maxDistance);
          cast.hitPointX = hit.hitX;
          cast.hitPointY = hit.hitY;
          const target = hit.target;
          let targetAlive = !!target;
          if(target){
            const preHp = Number(target.hp) || 0;
            if(cast.damage > 0){
              target.hp = Math.max(0, preHp - cast.damage);
              spawnHitSplat(target.x, target.y - minionRadius, cast.damage);
            }
            targetAlive = target.hp > 0;
            if(preHp > 0 && target.hp <= 0){
              flash(target.x, target.y, { color: '#ff8a8a' });
            }
            handlePracticeDummyDamage(target, preHp);
          }
          flash(cast.hitPointX, cast.hitPointY, { color: '#9ce7ff' });
          if(target && targetAlive){
            cast.targetRef = target;
            target.beingPulledBy = cast;
            cast.casterOriginX = Number.isFinite(cast.casterOriginX) ? cast.casterOriginX : cast.startX;
            cast.casterOriginY = Number.isFinite(cast.casterOriginY) ? cast.casterOriginY : cast.startY;
            const pullDistance = Math.max(0, Number(cast.pullDistance) || 0);
            cast.pullStartX = target.x;
            cast.pullStartY = target.y;
            cast.pullDestX = cast.casterOriginX + cast.dirX * pullDistance;
            cast.pullDestY = cast.casterOriginY + cast.dirY * pullDistance;
            const distanceToDest = Math.hypot(cast.pullDestX - target.x, cast.pullDestY - target.y);
            const pullSpeed = Math.max(240, speed * 0.6);
            cast.pullDuration = pullSpeed > 0 ? Math.min(0.9, Math.max(0.12, distanceToDest / pullSpeed)) : 0.2;
            cast.pullElapsed = 0;
            cast.pullStuckTime = 0;
            const totalStun = Math.max(cast.stunDuration || 0, cast.pullDuration || 0);
            if(totalStun > 0){
              target.stunTimer = Math.max(target.stunTimer || 0, totalStun);
            }
            cast.state = 'pulling';
            cast.lockoutRemaining = cast.postHitLockout;
            if(caster === player){
              player.selectedTarget = target;
              setHudMessage(`${cast.abilityName || 'Grab'} connected!`);
            }
          } else {
            cast.state = 'recover';
            cast.lockoutRemaining = cast.postHitLockout;
            if(caster === player){
              const text = target
                ? `${cast.abilityName || 'Grab'} executed the target.`
                : `${cast.abilityName || 'Grab'} missed.`;
              setHudMessage(text);
            }
          }
          continue;
        }
        if(nextDistance >= maxDistance){
          cast.state = 'recover';
          cast.lockoutRemaining = cast.postHitLockout;
          if(caster === player){
            setHudMessage(`${cast.abilityName || 'Grab'} missed.`);
          }
        }
        continue;
      }

      if(state === 'pulling'){
        const target = cast.targetRef;
        if(!target || target.hp <= 0){
          if(target && target.beingPulledBy === cast){
            target.beingPulledBy = null;
          }
          cast.targetRef = null;
          cast.state = 'recover';
          cast.lockoutRemaining = cast.postHitLockout;
          if(caster === player){
            setHudMessage(`${cast.abilityName || 'Grab'} released its target.`);
          }
          continue;
        }
        cast.pullElapsed = Math.max(0, (cast.pullElapsed || 0) + dt);
        const duration = Math.max(0.0001, Number(cast.pullDuration) || 0.0001);
        const rawProgress = Math.max(0, Math.min(1, cast.pullElapsed / duration));
        const eased = rawProgress * rawProgress * (3 - 2 * rawProgress);
        const desiredX = cast.pullStartX + (cast.pullDestX - cast.pullStartX) * eased;
        const desiredY = cast.pullStartY + (cast.pullDestY - cast.pullStartY) * eased;
        const moveX = desiredX - target.x;
        const moveY = desiredY - target.y;
        const moved = moveCircleWithCollision(target.x, target.y, moveX, moveY, minionRadius);
        const actualMove = Math.hypot(moved.x - target.x, moved.y - target.y);
        target.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, moved.x));
        target.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, moved.y));
        cast.hitPointX = target.x;
        cast.hitPointY = target.y;
        if(actualMove < 0.05){
          cast.pullStuckTime = (cast.pullStuckTime || 0) + dt;
        } else {
          cast.pullStuckTime = 0;
        }
        if(rawProgress >= 1 || (cast.pullStuckTime || 0) > 0.2){
          if(target.beingPulledBy === cast){
            target.beingPulledBy = null;
          }
          if(caster === player && target.hp > 0 && player.attackDamage > 0){
            applyPlayerAttackDamage(target);
            const attackPeriod = Math.max(0, Number(player.attackSpeedMs) || 0) / 1000;
            if(attackPeriod > 0){
              player.attackCooldown = attackPeriod;
            } else {
              player.attackCooldown = 0;
            }
            player.attackTarget = null;
            player.attackWindup = 0;
          }
          cast.targetRef = null;
          cast.state = 'recover';
          cast.lockoutRemaining = cast.postHitLockout;
          if(caster === player){
            setHudMessage(`${cast.abilityName || 'Grab'} pull complete.`);
          }
        }
        continue;
      }

      if(state === 'recover'){
        cast.lockoutRemaining = Math.max(0, (cast.lockoutRemaining || 0) - dt);
        if(cast.lockoutRemaining <= 0){
          concludeGrabCast(cast, i);
        }
        continue;
      }

      concludeGrabCast(cast, i);
    }
  }

  function updatePiercingArrowCasts(dt){
    for(let i = piercingArrowCasts.length - 1; i >= 0; i--){
      const cast = piercingArrowCasts[i];
      if(!cast){
        piercingArrowCasts.splice(i, 1);
        continue;
      }
      if(Number.isFinite(cast.startedAt)){
        cast.chargeElapsed = Math.max(0, (performance.now() - cast.startedAt) / 1000);
      } else {
        cast.chargeElapsed = Math.max(0, (Number(cast.chargeElapsed) || 0) + dt);
      }
      const caster = cast.casterRef || player;
      const { x: originX, y: originY } = getSpellOrigin(caster);
      const aimPoint = beamAimPoint();
      let dx = aimPoint.x - originX;
      let dy = aimPoint.y - originY;
      let len = Math.hypot(dx, dy);
      if(!(len > 0.0001)){
        dx = player.target.x - originX;
        dy = player.target.y - originY;
        len = Math.hypot(dx, dy);
      }
      if(len > 0.0001){
        cast.dirX = dx / len;
        cast.dirY = dy / len;
      }
      const state = computePiercingArrowChargeState(cast);
      cast.chargeState = state;
      if(!(state.maxCharge > 0)){
        releasePiercingArrow(cast, { cause: 'auto' });
        continue;
      }
      if(cast.chargeElapsed >= state.maxCharge - 0.0001){
        releasePiercingArrow(cast, { cause: 'auto' });
      }
    }
  }

  function fireBeamCast(cast){
    if(!cast) return;
    const geom = resolveBeamCastGeometry(cast);
    const lengthBase = Math.max(1, Number(cast.fireLength) || 0);
    const length = cast.dynamicLength ? Math.max(1, geom.distanceToTarget) : lengthBase;
    const abilityName = cast.abilityName || 'Beam';
    const startX = geom.startX;
    const startY = geom.startY;
    const dirX = geom.dirX;
    const dirY = geom.dirY;
    const endX = startX + dirX * length;
    const endY = startY + dirY * length;
    const beamHalfWidth = Math.max((Number(cast.width) || 0) / 2, 0);
    const effectiveRadius = beamHalfWidth + minionRadius;
    const effectiveRadiusSq = effectiveRadius * effectiveRadius;
    const victims = [];
    let hitPointX = endX;
    let hitPointY = endY;
    let farthestAlong = -Infinity;
    for(const m of minions){
      if(!isEnemyMinionForPlayer(m)) continue;
      const relX = m.x - startX;
      const relY = m.y - startY;
      const along = relX * dirX + relY * dirY;
      if(along < 0 || along > length) continue;
      const closestX = startX + dirX * along;
      const closestY = startY + dirY * along;
      const offX = m.x - closestX;
      const offY = m.y - closestY;
      const distSq = offX * offX + offY * offY;
      if(distSq <= effectiveRadiusSq){
        victims.push({ target: m, along, hitX: closestX, hitY: closestY });
        if(along > farthestAlong){
          farthestAlong = along;
          hitPointX = closestX;
          hitPointY = closestY;
        }
      }
    }

    if(victims.length){
      for(const { target } of victims){
        const prevHp = Number(target.hp) || 0;
        if(cast.damage > 0){
          target.hp = Math.max(0, prevHp - cast.damage);
          spawnHitSplat(target.x, target.y - minionRadius, cast.damage);
        }
        if(cast.slowFraction > 0){
          const existing = typeof target.slowPct === 'number' ? target.slowPct : 0;
          target.slowPct = Math.max(existing, cast.slowFraction);
          target.slowTimer = Math.max(target.slowTimer || 0, BEAM_SLOW_DURATION);
        }
        handlePracticeDummyDamage(target, prevHp);
      }
    }

    const primaryTarget = victims.length === 1 ? victims[0].target : null;
    const visualEndX = victims.length ? hitPointX : endX;
    const visualEndY = victims.length ? hitPointY : endY;
    spawnBeamVisual(startX, startY, primaryTarget, length, Math.max(1, cast.width), {
      endX: visualEndX,
      endY: visualEndY,
      dirX,
      dirY
    });
    flash(visualEndX, visualEndY);

    if(victims.length){
      if(victims.length === 1){
        const damageText = cast.damage > 0 ? ` for ${Math.round(cast.damage)} damage` : '';
        setHudMessage(`${abilityName} hit${damageText}!`);
      } else {
        setHudMessage(`${abilityName} hit ${victims.length} targets!`);
      }
    } else {
      setHudMessage(`${abilityName} fired.`);
    }

    if(cast.casterRef === player && player.casting === cast){
      player.casting = null;
    }
  }

  function updateSlamCasts(dt){
    for(let i = slamCasts.length - 1; i >= 0; i--){
      const cast = slamCasts[i];
      if(!cast){
        slamCasts.splice(i, 1);
        continue;
      }
      const caster = cast.casterRef;
      if(caster){
        const casterOrigin = getSpellOrigin(caster);
        if(Number.isFinite(casterOrigin.x)) cast.startX = casterOrigin.x;
        if(Number.isFinite(casterOrigin.y)) cast.startY = casterOrigin.y;
      } else {
        const fallback = getSpellOrigin(player);
        cast.startX = fallback.x;
        cast.startY = fallback.y;
      }
      cast.elapsed = Math.max(0, (cast.elapsed || 0) + dt);
      const duration = Math.max(0, Number(cast.castDuration) || 0);
      if(duration <= 0 || cast.elapsed >= duration){
        slamCasts.splice(i, 1);
        fireSlamCast(cast);
      }
    }
  }

  function updateSlamFissures(dt){
    for(let i = slamFissures.length - 1; i >= 0; i--){
      const fissure = slamFissures[i];
      if(!fissure){
        slamFissures.splice(i, 1);
        continue;
      }
      if(fissure.state === 'travel'){
        const maxLength = Math.max(0, Number(fissure.maxLength) || 0);
        const speed = Math.max(0, Number(fissure.speed) || 0);
        const prevDistance = Math.max(0, Number(fissure.distance) || 0);
        if(!(speed > 0) || !(maxLength > 0)){
          fissure.state = 'done';
          fissure.distance = Math.min(prevDistance, maxLength);
          fissure.fadeRemaining = fissure.fadeDuration || 0.45;
        } else {
          const targetDistance = Math.min(maxLength, prevDistance + speed * dt);
          const halfWidth = Math.max(0, Number(fissure.width) || 0) * 0.5;
          let newDistance = prevDistance;
          let blocked = false;
          let segmentStart = prevDistance;
          const stepSize = Math.max(8, halfWidth * 0.75 + 6);
          const steps = Math.max(1, Math.ceil(Math.abs(targetDistance - prevDistance) / stepSize));
          for(let s = 1; s <= steps; s++){
            const fraction = s / steps;
            const candidate = prevDistance + (targetDistance - prevDistance) * fraction;
            const cx = fissure.startX + fissure.dirX * candidate;
            const cy = fissure.startY + fissure.dirY * candidate;
            if(circleCollides(cx, cy, halfWidth)){
              blocked = true;
              break;
            }
            processSlamFissureSegment(fissure, segmentStart, candidate);
            segmentStart = candidate;
            newDistance = candidate;
          }
          fissure.distance = newDistance;
          fissure.headX = fissure.startX + fissure.dirX * newDistance;
          fissure.headY = fissure.startY + fissure.dirY * newDistance;
          if(fissure.iceFieldRef){
            fissure.iceFieldRef.length = Math.min(fissure.iceFieldRef.maxLength, newDistance);
          }
          if(blocked || newDistance >= maxLength - 0.0001){
            fissure.state = 'done';
            fissure.fadeRemaining = fissure.fadeDuration || 0.45;
          }
        }
      } else {
        fissure.fadeRemaining = Math.max(0, (Number(fissure.fadeRemaining) || 0) - dt);
        if(fissure.fadeRemaining <= 0){
          if(fissure.iceFieldRef && fissure.iceFieldRef.owner === fissure){
            fissure.iceFieldRef.owner = null;
          }
          slamFissures.splice(i, 1);
        }
      }
    }
  }

  function updateSlamIceFields(dt){
    for(let i = slamIceFields.length - 1; i >= 0; i--){
      const field = slamIceFields[i];
      if(!field){
        slamIceFields.splice(i, 1);
        continue;
      }
      field.age = Math.max(0, (Number(field.age) || 0) + dt);
      if(field.owner){
        const ownerLength = Math.max(0, Number(field.owner.distance) || 0);
        field.length = Math.max(field.length || 0, Math.min(field.maxLength, ownerLength));
      }
      if(!(field.tickInterval > 0)) field.tickInterval = 0.1;
      field.tickTimer = (Number(field.tickTimer) || field.tickInterval) - dt;
      while(field.tickTimer <= 0){
        field.tickTimer += field.tickInterval;
        applySlamIceFieldTick(field);
        if(field.tickTimer <= 0) field.tickTimer += field.tickInterval;
      }
      if(field.duration > 0 && field.age >= field.duration){
        slamIceFields.splice(i, 1);
      }
    }
  }

  function updateSlamImpacts(dt){
    for(let i = slamImpacts.length - 1; i >= 0; i--){
      const impact = slamImpacts[i];
      if(!impact){
        slamImpacts.splice(i, 1);
        continue;
      }
      const lifetime = Math.max(0.05, Number(impact.lifetime) || 0.5);
      impact.age = (Number(impact.age) || 0) + dt;
      if(impact.age >= lifetime){
        slamImpacts.splice(i, 1);
      }
    }
  }

  function updateBeamCasts(dt){
    for(let i = beamCasts.length - 1; i >= 0; i--){
      const cast = beamCasts[i];
      cast.elapsed = Math.max(0, (cast.elapsed || 0) + dt);
      if(cast.castDuration > 0 && cast.elapsed >= cast.castDuration){
        fireBeamCast(cast);
        beamCasts.splice(i, 1);
        if(player.casting === cast){
          player.casting = null;
        }
      }
    }
  }

  function updateLaserConeCasts(dt){
    for(let i = laserConeCasts.length - 1; i >= 0; i--){
      const cast = laserConeCasts[i];
      const duration = Math.max(0, Number(cast.castDuration) || 0);
      cast.elapsed = Math.max(0, (cast.elapsed || 0) + dt);
      if(duration <= 0 || cast.elapsed >= duration){
        fireLaserConeCast(cast);
        laserConeCasts.splice(i, 1);
      }
    }
  }

  function updateFlameChomperTraps(dt){
    if(!flameChomperTraps.length) return;
    const rootClaims = new Map();
    for(let i = 0; i < flameChomperTraps.length; ){
      const trap = flameChomperTraps[i];
      if(!trap){
        flameChomperTraps.splice(i, 1);
        continue;
      }
      trap.age = Math.max(0, (Number(trap.age) || 0) + dt);
      if(trap.justPlaced && trap.age > 0.05){
        trap.justPlaced = false;
      }
      const armDelay = Math.max(0, Number(trap.armDelay) || 0);
      if(!trap.armed && trap.age >= armDelay){
        trap.armed = true;
      }
      const lifetime = Math.max(0, Number(trap.lifeAfterArm) || 0);
      const maxAge = Number.isFinite(trap.maxAge) ? Math.max(0, Number(trap.maxAge) || 0) : (armDelay + lifetime);
      const triggerRadiusValue = Math.max(0, Number(trap.triggerRadius) || 0);
      const aoeRadiusValue = Math.max(triggerRadiusValue, Number(trap.aoeRadius) || 0);
      let removed = false;
      if(trap.armed){
        if(maxAge > 0 && trap.age >= maxAge){
          flash(trap.x, trap.y, { startRadius: Math.max(8, triggerRadiusValue * 0.5), endRadius: Math.max(triggerRadiusValue, (Number(trap.radius) || 0) + 24), color: '#ffbfa1' });
          removed = true;
        } else if(trap.canTriggerByMinions){
          const triggerSq = triggerRadiusValue * triggerRadiusValue;
          const aoeSq = aoeRadiusValue * aoeRadiusValue;
          let primary = null;
          let primaryDistSq = Infinity;
          const victims = [];
          for(const m of minions){
            if(!isEnemyMinionForPlayer(m)) continue;
            if(m.hp <= 0 || m.portalizing > 0) continue;
            const dx = m.x - trap.x;
            const dy = m.y - trap.y;
            const distSq = dx * dx + dy * dy;
            if(distSq <= aoeSq){
              victims.push({ target: m, distSq });
            }
            if(distSq <= triggerSq && distSq < primaryDistSq){
              primaryDistSq = distSq;
              primary = m;
            }
          }
          if(primary){
            const damage = Math.max(0, Number(trap.damage) || 0);
            if(damage > 0){
              for(const { target } of victims){
                const prevHp = Number(target.hp) || 0;
                target.hp = Math.max(0, prevHp - damage);
                spawnHitSplat(target.x, target.y - minionRadius, damage);
                handlePracticeDummyDamage(target, prevHp);
              }
            }
            const rootDuration = Math.max(0, Number(trap.rootDuration) || 0);
            if(trap.rootPrimaryOnly){
              if(!rootClaims.has(primary) && rootDuration > 0){
                const existing = typeof primary.stunTimer === 'number' ? primary.stunTimer : 0;
                primary.stunTimer = Math.max(existing, rootDuration);
              }
              if(!rootClaims.has(primary)){
                rootClaims.set(primary, trap);
              }
            } else if(rootDuration > 0){
              for(const { target } of victims){
                const existing = typeof target.stunTimer === 'number' ? target.stunTimer : 0;
                target.stunTimer = Math.max(existing, rootDuration);
              }
            }
            const effectColor = damage > 0 ? '#ff915a' : '#ffb37a';
            flash(trap.x, trap.y, { startRadius: Math.max(12, triggerRadiusValue * 0.8), endRadius: Math.max(aoeRadiusValue, triggerRadiusValue + 48), color: effectColor });
            if(damage > 0){
              setHudMessage(`${trap.abilityName || 'Trap'} detonated for ${Math.round(damage)} damage!`);
            } else {
              setHudMessage(`${trap.abilityName || 'Trap'} detonated!`);
            }
            removed = true;
          }
        }
      } else if(maxAge > 0 && trap.age >= maxAge){
        removed = true;
      }

      if(removed){
        flameChomperTraps.splice(i, 1);
        continue;
      }

      i++;
    }
  }

  function updateChargingGaleCasts(dt){
    for(let i = chargingGaleCasts.length - 1; i >= 0; i--){
      const cast = chargingGaleCasts[i];
      if(!cast){
        chargingGaleCasts.splice(i, 1);
        continue;
      }
      const cooldownSeconds = Number.isFinite(cast.cooldownSeconds)
        ? Math.max(0, Number(cast.cooldownSeconds) || 0)
        : 0;
      let justStartedCharging = false;
      if(cast.state === 'windup'){
        const duration = Math.max(0, Number(cast.castTime) || 0);
        cast.castElapsed = Math.max(0, (Number(cast.castElapsed) || 0) + dt);
        if(duration <= 0 || cast.castElapsed >= duration){
          const overflow = Math.max(0, cast.castElapsed - duration);
          cast.state = 'charging';
          cast.chargeElapsed = overflow;
          justStartedCharging = true;
          if(cast.casterRef === player){
            setHudMessage(`${cast.abilityName || 'Charging Gale'} charging...`);
          }
        } else {
          continue;
        }
      }
      if(!justStartedCharging){
        cast.chargeElapsed = Math.max(0, (Number(cast.chargeElapsed) || 0) + dt);
      }
      const maxCharge = Math.max(0, Number(cast.chargeDuration) || 0);
      if(!(maxCharge > 0)){
        if(releaseChargingGale(cast)){
          setAbilitySlotCooldown(cast.slotIndex, cooldownSeconds);
        }
        continue;
      }
      if(cast.chargeElapsed >= maxCharge){
        if(releaseChargingGale(cast)){
          setAbilitySlotCooldown(cast.slotIndex, cooldownSeconds);
        }
      }
    }
  }

  function activeArcaneRiteModeForCaster(caster){
    if(!caster) return null;
    for(const mode of arcaneRiteModes){
      if(!mode || mode.ended) continue;
      if(mode.casterRef === caster) return mode;
    }
    return null;
  }

  function castRiteArcaneAbility(slotIndex, ability){
    const abilityName = ability && (ability.shortName || ability.name)
      ? (ability.shortName || ability.name)
      : 'Rite of the Arcane';
    const caster = player;
    const existing = activeArcaneRiteModeForCaster(caster);
    if(existing && existing.abilityId === ability.id){
      setHudMessage(`${abilityName} is already active.`);
      return false;
    }

    const charges = Math.max(0, Math.round(Number(abilityFieldValue(ability, 'modeCharges')) || 0));
    if(!(charges > 0)){
      setHudMessage(`${abilityName} requires charges to activate.`);
      return false;
    }

    const durationMs = Math.max(0, Number(abilityFieldValue(ability, 'modeDurationMs')) || 0);
    const duration = durationMs / 1000;
    if(!(duration > 0)){
      setHudMessage(`${abilityName} fizzled  duration is zero.`);
      return false;
    }

    const minRange = Math.max(0, Number(abilityFieldValue(ability, 'minRangePx')) || 0);
    const maxRange = Math.max(minRange, Number(abilityFieldValue(ability, 'maxRangePx')) || 0);
    const radius = Math.max(0, Number(abilityFieldValue(ability, 'aoeRadiusPx')) || 0);
    const damage = Math.max(0, Number(abilityFieldValue(ability, 'damage')) || 0);
    const explosionDelayMs = Math.max(0, Number(abilityFieldValue(ability, 'explosionDelayMs')) || 0);
    const cancelOnStun = Number(abilityFieldValue(ability, 'cancelOnStun')) > 0;
    const cancelOnSilence = Number(abilityFieldValue(ability, 'cancelOnSilence')) > 0;
    const cooldownSeconds = abilityCooldownSeconds(ability);

    const mode = {
      abilityId: ability.id,
      abilityName,
      slotIndex,
      casterRef: caster,
      duration,
      elapsed: 0,
      chargesRemaining: charges,
      explosionDelay: explosionDelayMs / 1000,
      minRange,
      maxRange,
      radius,
      damage,
      cooldownSeconds,
      cancelOnStun,
      cancelOnSilence,
      ended: false,
      cooldownApplied: false
    };
    arcaneRiteModes.push(mode);
    cancelPlayerAttack(false);
    const plural = charges === 1 ? '' : 's';
    setHudMessage(`${abilityName} ready  ${charges} charge${plural}.`);
    return { success: true, deferCooldown: true };
  }

  function scheduleArcaneRiteExplosion(mode, targetX, targetY){
    if(!mode || mode.ended) return false;
    if(!(mode.chargesRemaining > 0)) return false;
    const caster = mode.casterRef || player;
    const { x: originX, y: originY } = getSpellOrigin(caster);
    let dx = targetX - originX;
    let dy = targetY - originY;
    let distance = Math.hypot(dx, dy);
    if(!(distance > 0.0001)){
      dx = 1;
      dy = 0;
      distance = 1;
    }
    let desiredDistance = distance;
    if(Number.isFinite(mode.maxRange) && mode.maxRange > 0){
      desiredDistance = Math.min(desiredDistance, mode.maxRange);
    }
    if(Number.isFinite(mode.minRange) && mode.minRange > 0){
      desiredDistance = Math.max(desiredDistance, mode.minRange);
    }
    const normX = dx / distance;
    const normY = dy / distance;
    const finalX = originX + normX * desiredDistance;
    const finalY = originY + normY * desiredDistance;
    const explosion = {
      modeRef: mode,
      abilityName: mode.abilityName,
      casterRef: caster,
      x: finalX,
      y: finalY,
      radius: Math.max(0, Number(mode.radius) || 0),
      damage: Math.max(0, Number(mode.damage) || 0),
      delay: Math.max(0, Number(mode.explosionDelay) || 0),
      elapsed: 0
    };
    arcaneRiteExplosions.push(explosion);
    mode.chargesRemaining = Math.max(0, Number(mode.chargesRemaining) - 1);
    if(caster === player){
      const chargesLeft = mode.chargesRemaining;
      const plural = chargesLeft === 1 ? '' : 's';
      const message = chargesLeft > 0
        ? `${mode.abilityName || 'Artillery'} queued  ${chargesLeft} charge${plural} left.`
        : `${mode.abilityName || 'Artillery'} last charge fired!`;
      setHudMessage(message);
    }
    if(mode.chargesRemaining <= 0){
      endArcaneRiteMode(mode, { reason: 'charges', silent: true });
    }
    return true;
  }

  function endArcaneRiteMode(mode, options = {}){
    if(!mode || mode.ended) return;
    mode.ended = true;
    const idx = arcaneRiteModes.indexOf(mode);
    if(idx !== -1){
      arcaneRiteModes.splice(idx, 1);
    }
    if(!mode.cooldownApplied && Number.isFinite(mode.slotIndex)){
      setAbilitySlotCooldown(mode.slotIndex, Math.max(0, Number(mode.cooldownSeconds) || 0));
      mode.cooldownApplied = true;
    }
    const caster = mode.casterRef;
    if(caster === player && !options.silent){
      const abilityName = mode.abilityName || 'Rite of the Arcane';
      let message;
      switch(options.reason){
        case 'duration':
          message = `${abilityName} ended.`;
          break;
        case 'stun':
          message = `${abilityName} cancelled by control!`;
          break;
        case 'silence':
          message = `${abilityName} interrupted.`;
          break;
        case 'charges':
          message = `${abilityName} expended all charges.`;
          break;
        default:
          message = `${abilityName} ended.`;
          break;
      }
      setHudMessage(message);
    }
  }

  function updateArcaneRiteModes(dt){
    for(let i = arcaneRiteModes.length - 1; i >= 0; i--){
      const mode = arcaneRiteModes[i];
      if(!mode || mode.ended){
        arcaneRiteModes.splice(i, 1);
        continue;
      }
      mode.elapsed = Math.max(0, (Number(mode.elapsed) || 0) + dt);
      const caster = mode.casterRef;
      if(mode.cancelOnStun && caster && Number(caster.stunTimer) > 0){
        endArcaneRiteMode(mode, { reason: 'stun' });
        continue;
      }
      if(mode.cancelOnSilence && caster && Number(caster.silenceTimer) > 0){
        endArcaneRiteMode(mode, { reason: 'silence' });
        continue;
      }
      if(mode.duration > 0 && mode.elapsed >= mode.duration){
        endArcaneRiteMode(mode, { reason: 'duration' });
      }
    }
  }

  function updateArcaneRiteExplosions(dt){
    for(let i = arcaneRiteExplosions.length - 1; i >= 0; i--){
      const blast = arcaneRiteExplosions[i];
      if(!blast){
        arcaneRiteExplosions.splice(i, 1);
        continue;
      }
      blast.elapsed = Math.max(0, (Number(blast.elapsed) || 0) + dt);
      const delay = Math.max(0, Number(blast.delay) || 0);
      if(delay <= 0 || blast.elapsed >= delay){
        triggerArcaneRiteExplosion(blast);
        arcaneRiteExplosions.splice(i, 1);
      }
    }
  }

  function triggerArcaneRiteExplosion(blast){
    if(!blast) return;
    const radius = Math.max(0, Number(blast.radius) || 0);
    const abilityName = blast.abilityName || (blast.modeRef && blast.modeRef.abilityName) || 'Rite of the Arcane';
    const startRadius = radius > 0 ? Math.max(18, radius * 0.35) : 18;
    const endRadius = radius > 0 ? Math.max(radius, radius + 60) : 48;
    flash(blast.x, blast.y, { startRadius, endRadius, color: '#c99bff' });
    const hits = applyArcaneRiteExplosionDamage(blast);
    if(blast.casterRef === player){
      if(hits > 0){
        setHudMessage(`${abilityName} struck ${hits} target${hits === 1 ? '' : 's'}!`);
      } else {
        setHudMessage(`${abilityName} detonated.`);
      }
    }
  }

  function applyArcaneRiteExplosionDamage(blast){
    const radius = Math.max(0, Number(blast.radius) || 0);
    const damage = Math.max(0, Number(blast.damage) || 0);
    if(!(radius > 0) && damage <= 0) return 0;
    const effectiveRadius = radius + minionRadius;
    const effectiveSq = effectiveRadius * effectiveRadius;
    let hits = 0;
    for(const m of minions){
      if(!isEnemyMinionForPlayer(m)) continue;
      const dx = m.x - blast.x;
      const dy = m.y - blast.y;
      if(dx * dx + dy * dy > effectiveSq) continue;
      const prevHp = Number(m.hp) || 0;
      if(damage > 0){
        m.hp = Math.max(0, prevHp - damage);
        spawnHitSplat(m.x, m.y - minionRadius, damage);
      }
      handlePracticeDummyDamage(m, prevHp);
      hits++;
    }
    return hits;
  }

  function drawArcaneRiteModeIndicators(){
    const mode = activeArcaneRiteModeForCaster(player);
    if(!mode || mode.ended) return;
    const caster = mode.casterRef || player;
    const duration = Math.max(0.0001, Number(mode.duration) || 0.0001);
    const elapsed = Math.max(0, Number(mode.elapsed) || 0);
    const remaining = Math.max(0, Math.min(1, 1 - (elapsed / duration)));
    const baseRadius = (caster && Number.isFinite(caster.r) ? caster.r : player.r) + 18;
    const maxRange = Math.max(0, Number(mode.maxRange) || 0);
    const minRange = Math.max(0, Number(mode.minRange) || 0);
    const maxRadius = Math.max(baseRadius, maxRange, minRange);
    if(!circleInCamera(caster.x, caster.y, maxRadius + 16)) return;
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#c99bff';
    ctx.beginPath();
    ctx.arc(caster.x, caster.y, baseRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(caster.x, caster.y, baseRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - remaining));
    ctx.stroke();
    ctx.restore();
    if(maxRange > 0){
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c99bff';
      ctx.beginPath();
      ctx.arc(caster.x, caster.y, maxRange, 0, Math.PI * 2);
      ctx.stroke();
      if(minRange > 0){
        ctx.strokeStyle = '#c99bff88';
        ctx.beginPath();
        ctx.arc(caster.x, caster.y, minRange, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawArcaneRiteTelegraphs(){
    for(const blast of arcaneRiteExplosions){
      if(!blast) continue;
      const delay = Math.max(0.0001, Number(blast.delay) || 0.0001);
      const elapsed = Math.max(0, Number(blast.elapsed) || 0);
      const progress = Math.max(0, Math.min(1, elapsed / delay));
      const radius = Math.max(12, Number(blast.radius) || 0);
      if(!circleInCamera(blast.x, blast.y, radius + 12)) continue;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * progress;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#c99bff';
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.28 + 0.4 * progress;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, radius * (0.55 + 0.35 * (1 - progress)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFlameChomperTraps(){
    if(!flameChomperTraps.length) return;
    for(const trap of flameChomperTraps){
      if(!trap) continue;
      const radius = Math.max(6, Number(trap.radius) || 0);
      const armed = !!trap.armed;
      const armDelay = Math.max(0, Number(trap.armDelay) || 0);
      const triggerRadius = Math.max(0, Number(trap.triggerRadius) || 0);
      const maxRadius = Math.max(radius + 10, triggerRadius + 6);
      if(!circleInCamera(trap.x, trap.y, maxRadius)) continue;
      const progress = armed ? 1 : (armDelay > 0 ? Math.max(0, Math.min(1, (Number(trap.age) || 0) / armDelay)) : 1);
      ctx.save();
      ctx.beginPath();
      ctx.globalAlpha = armed ? 0.9 : 0.8;
      ctx.fillStyle = armed ? '#ff7c43' : '#f5c971';
      ctx.arc(trap.x, trap.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = armed ? '#ffd1a6' : '#ffe4b8';
      ctx.globalAlpha = 1;
      ctx.stroke();
      if(!armed && armDelay > 0){
        ctx.beginPath();
        ctx.strokeStyle = '#ffb66a';
        ctx.lineWidth = 3;
        ctx.arc(trap.x, trap.y, radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }
      if(trap.showArmedRing){
        const ringRadius = Math.max(radius + 6, Math.max(0, Number(trap.triggerRadius) || 0) * 0.9);
        ctx.beginPath();
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 2;
        ctx.globalAlpha = armed ? 0.6 : 0.35;
        ctx.strokeStyle = armed ? '#ff9f6f' : '#f4cfa0';
        ctx.arc(trap.x, trap.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if(trap.showTriggerRadius && triggerRadius > 0){
        ctx.beginPath();
        ctx.globalAlpha = armed ? 0.18 : 0.12;
        ctx.fillStyle = armed ? '#ff996622' : '#ffd9a022';
        ctx.arc(trap.x, trap.y, triggerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.globalAlpha = armed ? 0.45 : 0.3;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = armed ? '#ff9966' : '#ffbb88';
        ctx.arc(trap.x, trap.y, triggerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  function drawSlamIceFields(){
    for(const field of slamIceFields){
      if(!field) continue;
      const length = Math.max(0, Math.min(Number(field.maxLength) || 0, Number(field.length) || 0));
      const width = Math.max(0, Number(field.width) || 0);
      if(!(length > 0) || !(width > 0)) continue;
      const dirX = Number(field.dirX) || 0;
      const dirY = Number(field.dirY) || 0;
      const endX = field.startX + dirX * length;
      const endY = field.startY + dirY * length;
      if(!rectIntersectsCamera(field.startX, field.startY, endX, endY, width)) continue;
      const angle = Math.atan2(field.dirY, field.dirX);
      const duration = Math.max(0.0001, Number(field.duration) || 0.0001);
      const age = Math.max(0, Number(field.age) || 0);
      const fade = duration > 0 ? Math.max(0, Math.min(1, 1 - age / duration)) : 1;
      ctx.save();
      ctx.translate(field.startX, field.startY);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.18 + 0.25 * fade;
      ctx.fillStyle = '#43c6ff33';
      ctx.fillRect(0, -width / 2, length, width);
      ctx.restore();
    }
  }

  function drawSlamFissures(){
    for(const fissure of slamFissures){
      if(!fissure) continue;
      const distance = Math.max(0, Number(fissure.distance) || 0);
      const width = Math.max(0, Number(fissure.width) || 0);
      if(!(distance > 0) || !(width > 0)) continue;
      const dirX = Number(fissure.dirX) || 0;
      const dirY = Number(fissure.dirY) || 0;
      const endX = fissure.startX + dirX * distance;
      const endY = fissure.startY + dirY * distance;
      if(!rectIntersectsCamera(fissure.startX, fissure.startY, endX, endY, width)) continue;
      const angle = Math.atan2(fissure.dirY, fissure.dirX);
      let alpha = 0.6;
      if(fissure.state === 'done'){
        const fadeDuration = Math.max(0.0001, Number(fissure.fadeDuration) || 0.0001);
        const remaining = Math.max(0, Number(fissure.fadeRemaining) || 0);
        alpha = 0.2 + 0.45 * Math.max(0, Math.min(1, remaining / fadeDuration));
      }
      ctx.save();
      ctx.translate(fissure.startX, fissure.startY);
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#8fe3ff55';
      ctx.fillRect(0, -width / 2, distance, width);
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#d4f6ff';
      ctx.lineWidth = Math.max(2, width * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, -width / 2);
      ctx.lineTo(distance, -width / 2);
      ctx.moveTo(0, width / 2);
      ctx.lineTo(distance, width / 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSlamImpacts(){
    for(const impact of slamImpacts){
      if(!impact) continue;
      const lifetime = Math.max(0.0001, Number(impact.lifetime) || 0.5);
      const age = Math.max(0, Number(impact.age) || 0);
      const progress = Math.max(0, Math.min(1, age / lifetime));
      const alpha = 1 - progress;
      if(alpha <= 0) continue;
      const baseRadius = Math.max(24, Number(impact.radius) || 0);
      if(!circleInCamera(impact.x, impact.y, baseRadius * 1.5)) continue;
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = '#9fe7ff';
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#d9f7ff';
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, baseRadius * (0.7 + 0.4 * progress), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSlamCasts(){
    for(const cast of slamCasts){
      if(!cast) continue;
      const { x: originX, y: originY } = resolveCastOrigin(cast);
      const duration = Math.max(0.0001, Number(cast.castDuration) || 0.0001);
      const elapsed = Math.max(0, Number(cast.elapsed) || 0);
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const eased = progress * progress * (3 - 2 * progress);
      const radius = Math.max(0, Number(cast.impactRadius) || 0);
      const length = Math.max(0, Number(cast.fissureLength) || 0);
      const width = Math.max(0, Number(cast.fissureWidth) || 0);
      const maxExtent = Math.max(radius, length) + width;
      if(maxExtent > 0 && !circleInCamera(originX, originY, maxExtent)) continue;
      if(radius > 0){
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.35 * eased;
        ctx.lineWidth = 2 + 3 * eased;
        ctx.strokeStyle = '#8fe3ff';
        ctx.beginPath();
        ctx.arc(originX, originY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if(length > 0 && width > 0){
        const angle = Math.atan2(cast.dirY, cast.dirX);
        ctx.save();
        ctx.translate(originX, originY);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.12 + 0.2 * eased;
        ctx.fillStyle = '#55cfff33';
        ctx.fillRect(0, -width / 2, length, width);
        ctx.restore();
      }
    }
  }

  function drawBeamCasts(){
    for(const cast of beamCasts){
      const duration = Math.max(0.0001, cast.castDuration || 0.0001);
      const progressRaw = Math.max(0, Math.min(1, (cast.elapsed || 0) / duration));
      const eased = progressRaw * progressRaw * (3 - 2 * progressRaw);
      const geom = resolveBeamCastGeometry(cast);
      const previewLengthBase = Math.max(1, cast.previewLength || cast.fireLength || 1);
      const length = cast.dynamicLength ? Math.max(1, geom.distanceToTarget) : previewLengthBase;
      const endX = geom.startX + geom.dirX * length;
      const endY = geom.startY + geom.dirY * length;
      const drawWidth = Math.max(1.5, Math.max(cast.width || 0, 2) * (0.5 + eased * 0.6));
      if(!rectIntersectsCamera(geom.startX, geom.startY, endX, endY, drawWidth * 2)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35 + 0.55 * eased;
      ctx.shadowBlur = 16 + 24 * eased;
      ctx.shadowColor = '#2aa9ff';
      ctx.lineWidth = drawWidth;
      ctx.strokeStyle = '#59c6ff';
      ctx.beginPath();
      ctx.moveTo(geom.startX, geom.startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55 + 0.35 * eased;
      ctx.lineWidth = Math.max(1, drawWidth * 0.55);
      ctx.strokeStyle = '#d3f3ff';
      ctx.beginPath();
      ctx.moveTo(geom.startX, geom.startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * eased;
      ctx.fillStyle = '#59c6ff';
      ctx.beginPath();
      ctx.arc(geom.startX, geom.startY, 6 + eased * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnBeamVisual(startX, startY, target, length, width, options = {}){
    const safeLength = Math.max(0, Number(length) || 0);
    const safeWidth = Math.max(1, Number(width) || 1);
    const dirX = Number.isFinite(options.dirX) ? options.dirX : 1;
    const dirY = Number.isFinite(options.dirY) ? options.dirY : 0;
    const defaultEndX = startX + dirX * (safeLength || 1);
    const defaultEndY = startY + dirY * (safeLength || 1);
    const endX = Number.isFinite(options.endX) ? options.endX : (target ? target.x : defaultEndX);
    const endY = Number.isFinite(options.endY) ? options.endY : (target ? target.y : defaultEndY);
    const lifetime = Number.isFinite(options.lifetime) ? options.lifetime : 0.35;
    activeBeams.push({
      startX,
      startY,
      targetRef: target || null,
      targetX: endX,
      targetY: endY,
      length: safeLength,
      width: safeWidth,
      age: 0,
      lifetime,
      staticEnd: !target && Number.isFinite(options.endX) && Number.isFinite(options.endY)
    });
  }

  function updateBeams(dt){
    for(let i = activeBeams.length - 1; i >= 0; i--){
      const beam = activeBeams[i];
      beam.age += dt;
      if(beam.targetRef && beam.targetRef.hp > 0){
        beam.targetX = beam.targetRef.x;
        beam.targetY = beam.targetRef.y;
      }
      if(beam.age >= beam.lifetime || (beam.targetRef && beam.targetRef.hp <= 0)){
        activeBeams.splice(i, 1);
      }
    }
  }

  function drawBeams(){
    for(const beam of activeBeams){
      const lifetime = Math.max(0.001, beam.lifetime);
      const alpha = Math.max(0, 1 - beam.age / lifetime);
      if(alpha <= 0) continue;
      const tx = beam.targetX;
      const ty = beam.targetY;
      const dx = tx - beam.startX;
      const dy = ty - beam.startY;
      const distance = Math.hypot(dx, dy) || 1;
      const maxLength = beam.length > 0 ? Math.min(distance, beam.length) : distance;
      const nx = dx / distance;
      const ny = dy / distance;
      const endX = beam.startX + nx * maxLength;
      const endY = beam.startY + ny * maxLength;
      if(!rectIntersectsCamera(beam.startX, beam.startY, endX, endY, Math.max(beam.width, 8))) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#2aa9ff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = Math.max(1, beam.width);
      ctx.strokeStyle = '#7fe3ff';
      ctx.beginPath();
      ctx.moveTo(beam.startX, beam.startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, beam.width * 0.55);
      ctx.strokeStyle = '#d8f6ff';
      ctx.beginPath();
      ctx.moveTo(beam.startX, beam.startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function setAbilityHotkeyBinding(slotIndex, key, code){
    ensureAbilityHotkeys();
    if(slotIndex < 0 || slotIndex >= abilityHotkeys.length) return null;
    const label = formatAbilityKeyLabel(key, code);
    const normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
    const normalizedCode = typeof code === 'string' ? code : '';
    for(let i=0;i<abilityBarState.count;i++){
      if(i === slotIndex) continue;
      const other = abilityHotkeys[i] || defaultAbilityBinding(i);
      if(!other) continue;
      const otherCode = other.code || '';
      const otherKey = other.key ? other.key.toLowerCase() : '';
      if(normalizedCode && otherCode === normalizedCode){
        abilityHotkeys[i] = { key: '', code: '', label: '' };
        continue;
      }
      if(!normalizedCode && normalizedKey && otherKey && otherKey === normalizedKey){
        abilityHotkeys[i] = { key: '', code: '', label: '' };
      }
    }
    abilityHotkeys[slotIndex] = {
      key: typeof key === 'string' ? key : '',
      code: normalizedCode,
      label
    };
    return abilityHotkeys[slotIndex];
  }

  function findAbilitySlotForEvent(ev){
    if(abilityBarState.count <= 0) return -1;
    const code = ev.code;
    if(code){
      for(let i=0;i<abilityBarState.count;i++){
        const binding = getAbilityBinding(i);
        if(binding && binding.code && binding.code === code) return i;
      }
    }
    const key = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
    if(!key) return -1;
    for(let i=0;i<abilityBarState.count;i++){
      const binding = getAbilityBinding(i);
      if(!binding) continue;
      if(binding.code && code && binding.code === code) continue;
      if(binding.key && binding.key.toLowerCase() === key) return i;
    }
    return -1;
  }

  function isTypingTarget(target){
    if(!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable === true;
  }

  function resolveAbilityCast(slotIndex, options = {}){
    const requestedModeRaw = options && typeof options.castMode === 'string' ? options.castMode : null;
    const requestedMode = requestedModeRaw ? normalizeCastType(requestedModeRaw) : null;
    const resolution = { success: false, slotIndex, castMode: requestedMode || 'quick', supportsIndicator: false };
    if(slotIndex < 0 || slotIndex >= abilityBarState.count){
      resolution.reason = 'invalidSlot';
      resolution.message = 'Invalid ability slot.';
      return resolution;
    }
    const abilityId = abilityAssignments[slotIndex];
    if(!abilityId){
      resolution.reason = 'unassigned';
      resolution.message = `No spell assigned to slot ${slotIndex + 1}.`;
      return resolution;
    }
    const ability = getAbilityDefinition(abilityId);
    if(!ability){
      resolution.reason = 'missingAbility';
      resolution.message = 'Ability definition not found.';
      return resolution;
    }
    const state = getAbilitySlotState(slotIndex);
    if(state && state.cooldown > 0){
      resolution.reason = 'cooldown';
      resolution.message = `${ability.shortName || ability.name} is on cooldown.`;
      return resolution;
    }
    const handler = abilityHandlers[ability.id];
    if(typeof handler !== 'function'){
      resolution.reason = 'noHandler';
      resolution.message = `${ability.name} is not yet usable.`;
      return resolution;
    }
    const profile = getSkillshotIndicatorProfile(ability);
    const supportsIndicator = !!profile;
    let castMode = requestedMode || resolveAbilityCastType(ability);
    if((castMode === 'normal' || castMode === 'quickIndicator') && !supportsIndicator){
      castMode = 'quick';
    }
    resolution.success = true;
    resolution.reason = null;
    resolution.message = null;
    resolution.ability = ability;
    resolution.abilityId = abilityId;
    resolution.state = state;
    resolution.handler = handler;
    resolution.castMode = castMode;
    resolution.supportsIndicator = supportsIndicator;
    resolution.indicatorProfile = profile;
    return resolution;
  }

  function activateAbilitySlot(slotIndex, options = {}){
    const { preview = false, silent = false } = options || {};
    const resolution = resolveAbilityCast(slotIndex, options);
    if(!resolution.success){
      if(!silent && resolution.message){
        setHudMessage(resolution.message);
      }
      return false;
    }
    if(preview){
      return true;
    }
    const ability = resolution.ability;
    const handler = resolution.handler;
    const result = handler(slotIndex, ability, options);
    const success = result === true || (result && typeof result === 'object' && result.success === true);
    if(success){
      const defer = result && typeof result === 'object' && result.deferCooldown;
      let cooldownSeconds = abilityCooldownSeconds(ability);
      if(result && typeof result === 'object' && Number.isFinite(result.cooldownSeconds)){
        cooldownSeconds = Math.max(0, Number(result.cooldownSeconds) || 0);
      }
      if(!defer){
        setAbilitySlotCooldown(slotIndex, cooldownSeconds);
      }
    }
    return success;
  }

  if(abilityRepoClose){
    abilityRepoClose.addEventListener('click', ()=> closeAbilityRepository());
  }
  if(btnSaveSpells){
    btnSaveSpells.addEventListener('click', ()=> saveSpellConfigurations());
  }

  function handleAbilityKeyUp(ev){
    const indicator = spellCastingRuntime.activeIndicator;
    if(indicator && indicator.mode === 'quickIndicator' && eventMatchesIndicatorTrigger(indicator, ev)){
      indicator.pendingCast = true;
      confirmSkillshotIndicator({ cause: 'key', event: ev });
    }
    const code = typeof ev.code === 'string' ? ev.code : '';
    const key = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
    if(!code && !key) return;
    for(let i = piercingArrowCasts.length - 1; i >= 0; i--){
      const cast = piercingArrowCasts[i];
      if(!cast || cast.released) continue;
      let shouldRelease = false;
      if(cast.activatorKeyCode && code){
        shouldRelease = cast.activatorKeyCode === code;
      } else if(!cast.activatorKeyCode && cast.activatorKey && key){
        shouldRelease = cast.activatorKey === key;
      }
      if(shouldRelease){
        releasePiercingArrow(cast, { cause: 'keyRelease' });
      }
    }
  }

  document.addEventListener('keydown', (ev)=>{
    const typing = isTypingTarget(ev.target);
    if(!spellCastingRuntime.captureMode && !abilityBarState.hotkeyMode){
      handleSpellCastModifierKeyDown(ev);
    }
    if(ev.key === 'Escape'){
      if(cancelSpellCastBindingCapture()){
        ev.preventDefault();
        return;
      }
      if(cancelSkillshotIndicator({ reason: 'escape' })){
        ev.preventDefault();
        return;
      }
      if(pingWheelCapture){
        ev.preventDefault();
        pingWheelCapture = false;
        updatePingWheelBindingDisplay();
        return;
      }
      if(pingWheelRuntime.active){
        ev.preventDefault();
        cancelPingWheel();
        return;
      }
      if(cameraLockCapture){
        ev.preventDefault();
        cameraLockCapture = false;
        camera.lockCapture = cameraLockCapture;
        updateCameraLockBindingDisplay();
        return;
      }
      if(attackMoveCapture){
        ev.preventDefault();
        attackMoveCapture = false;
        updateAttackMoveBindingDisplay();
        return;
      }
      if(cancelActivePiercingArrowCharge()){
        ev.preventDefault();
        return;
      }
      if(abilityBarState.hotkeyMode){
        ev.preventDefault();
        if(abilityBarState.hotkeyCaptureIndex !== null){
          stopAbilityHotkeyCapture();
        } else {
          exitAbilityHotkeyMode();
        }
        return;
      }
      if(isAbilityRepoOpen()){
        ev.preventDefault();
        closeAbilityRepository();
        return;
      }
      if(!typing){
        ev.preventDefault();
        enterAbilityHotkeyMode();
      }
      return;
    }

    if(prayerKeyCaptureId){
      if(DISALLOWED_HOTKEY_KEYS.has(ev.key)){
        ev.preventDefault();
        setHudMessage('Choose a different key (modifier keys cannot be used).');
        return;
      }
      ev.preventDefault();
      setPrayerBinding(prayerKeyCaptureId, ev.key, ev.code);
      stopPrayerKeyCapture({ silent: false });
      updatePrayerButtons();
      return;
    }

    if(abilityBarState.hotkeyMode){
      if(abilityBarState.hotkeyCaptureIndex !== null && !typing){
        if(DISALLOWED_HOTKEY_KEYS.has(ev.key)){
          ev.preventDefault();
          setHudMessage('Choose a different key (modifier keys cannot be used).');
          return;
        }
        if(ev.key){
          ev.preventDefault();
          const slotIndex = abilityBarState.hotkeyCaptureIndex;
          const binding = setAbilityHotkeyBinding(slotIndex, ev.key, ev.code);
          stopAbilityHotkeyCapture({silent: true});
          if(binding){
            setHudMessage(`Slot ${slotIndex + 1} bound to ${binding.label}.`);
          }
        }
      }
      return;
    }

    if(spellCastingRuntime.captureMode){
      if(DISALLOWED_HOTKEY_KEYS.has(ev.key)){
        ev.preventDefault();
        setHudMessage('Choose a different key (modifier keys cannot be used).');
        return;
      }
      ev.preventDefault();
      const kind = spellCastingRuntime.captureMode;
      setSpellCastModifierBinding(kind, ev.key, ev.code);
      spellCastingRuntime.captureMode = null;
      const binding = getSpellCastBinding(kind);
      if(binding && binding.label){
        const label = kind === 'normal' ? 'Normal cast' : (kind === 'quick' ? 'Quick cast' : 'Quick indicator');
        setHudMessage(`${label} modifier bound to ${binding.label}.`);
      }
      return;
    }

    if(pingWheelCapture){
      if(typing){
        return;
      }
      if(DISALLOWED_HOTKEY_KEYS.has(ev.key)){
        ev.preventDefault();
        setHudMessage('Choose a different key for the ping wheel (modifier keys are ignored).');
        return;
      }
      ev.preventDefault();
      setPingWheelBinding(ev.key, ev.code);
      pingWheelCapture = false;
      updatePingWheelBindingDisplay();
      if(pingWheelBinding && pingWheelBinding.label){
        setHudMessage(`Ping wheel bound to ${pingWheelBinding.label}.`);
      }
      return;
    }

    if(attackMoveCapture){
      if(typing){
        return;
      }
      if(DISALLOWED_HOTKEY_KEYS.has(ev.key)){
        ev.preventDefault();
        setHudMessage('Choose a different key for attack move (modifier keys are ignored).');
        return;
      }
      ev.preventDefault();
      setAttackMoveBinding(ev.key, ev.code);
      attackMoveCapture = false;
      updateAttackMoveBindingDisplay();
      if(attackMoveBinding && attackMoveBinding.label){
        setHudMessage(`Attack move bound to ${attackMoveBinding.label}.`);
      }
      return;
    }

    if(cameraLockCapture){
      if(typing){
        return;
      }
      if(DISALLOWED_HOTKEY_KEYS.has(ev.key)){
        ev.preventDefault();
        setHudMessage('Choose a different key for the camera lock (modifier keys are ignored).');
        return;
      }
      ev.preventDefault();
      setCameraLockBinding(ev.key, ev.code);
      cameraLockCapture = false;
      camera.lockCapture = cameraLockCapture;
      updateCameraLockBindingDisplay();
      if(cameraLockBinding && cameraLockBinding.label){
        setHudMessage(`Camera lock toggled with ${cameraLockBinding.label}.`);
      }
      return;
    }

    if(typing) return;
    if(ev.repeat) return;
    if(ev.altKey || ev.ctrlKey || ev.metaKey) return;

    const prayerId = findPrayerForEvent(ev);
    if(prayerId){
      ev.preventDefault();
      togglePrayer(prayerId);
      return;
    }

    if(matchesCameraLockKey(ev)){
      ev.preventDefault();
      toggleCameraLock();
      return;
    }

    if(matchesPingWheelKey(ev)){
      ev.preventDefault();
      if(!pingWheelRuntime.active){
        openPingWheel();
      }
      return;
    }

    if(matchesAttackMoveKey(ev)){
      ev.preventDefault();
      executeAttackMove();
      return;
    }

    if(ev.code === 'KeyB'){
      ev.preventDefault();
      toggleRecall();
      return;
    }

    const slotIndex = findAbilitySlotForEvent(ev);
    if(slotIndex >= 0){
      ev.preventDefault();
      handleAbilityActivationRequest(slotIndex, ev);
      return;
    }

    if(ev.code === 'KeyT'){
      ev.preventDefault();
      triggerPlayerTaunt();
      return;
    }
  });
  document.addEventListener('keyup', (ev)=>{
    if(pingWheelRuntime.keyHeld && matchesPingWheelKey(ev)){
      ev.preventDefault();
      closePingWheel({ trigger: true });
      return;
    }
    if(ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if(ev.repeat) return;
    handleSpellCastModifierKeyUp(ev);
    handleAbilityKeyUp(ev);
  });
  document.addEventListener('click', (ev)=>{
    if(!isAbilityRepoOpen()) return;
    const target = ev.target instanceof Element ? ev.target : null;
    if(target && abilityRepoEl && abilityRepoEl.contains(target)) return;
    if(target && target.closest('.abilitySlot')) return;
    closeAbilityRepository();
  });

  // Sidebar collapse/expand/hide
  const MENU_STATES = ['expanded', 'collapsed', 'hidden'];
  function getMenuState(){
    if(app.getAttribute('data-hidden') === 'true') return 'hidden';
    return app.getAttribute('data-collapsed') === 'true' ? 'collapsed' : 'expanded';
  }
  function setMenuState(state){
    if(!MENU_STATES.includes(state)) return;
    const collapsed = state !== 'expanded';
    const hidden = state === 'hidden';
    app.setAttribute('data-collapsed', String(collapsed));
    app.setAttribute('data-hidden', String(hidden));
    if(sbHide){ sbHide.setAttribute('aria-expanded', hidden ? 'false' : 'true'); }
    syncMenuMeasurements();
    requestAnimationFrame(syncMenuMeasurements);
  }
  sbHide.addEventListener('click', ()=> setMenuState('hidden'));
  sbFab.addEventListener('click', ()=> setMenuState('expanded'));
  setMenuState(getMenuState());

  if(app){
    app.addEventListener('transitionend', (ev) => {
      if(ev.propertyName === 'grid-template-columns'){
        requestAnimationFrame(syncMenuMeasurements);
      }
    });
  }

  // Open/close submenus
  function toggleSubmenu(pane){
    if(!pane) return;
    pane.classList.toggle('open');
    syncMenuMeasurements();
    requestAnimationFrame(syncMenuMeasurements);
  }
  btnMinions.addEventListener('click', ()=> toggleSubmenu(minionsPane));
  btnPlayer .addEventListener('click', ()=> toggleSubmenu(playerPane));
  if(btnPracticeDummy && practiceDummyPane){ btnPracticeDummy.addEventListener('click', ()=> toggleSubmenu(practiceDummyPane)); }
  if(btnPrayers && prayerPane){ btnPrayers.addEventListener('click', ()=> toggleSubmenu(prayerPane)); }
  if(btnMonsters && monsterPane){ btnMonsters.addEventListener('click', ()=> toggleSubmenu(monsterPane)); }
  if(btnHealth && healthPane){ btnHealth.addEventListener('click', ()=> toggleSubmenu(healthPane)); }
  if(btnAnimation && animationPane){ btnAnimation.addEventListener('click', ()=> { toggleSubmenu(animationPane); requestAnimationFrame(()=>{ if(playerRuntime.animationController){ playerRuntime.animationController.updateRendererSize(); } }); }); }
  if(btnColliders && colliderPane){ btnColliders.addEventListener('click', ()=> toggleSubmenu(colliderPane)); }
  if(btnGameState && gameStatePane){ btnGameState.addEventListener('click', ()=> toggleSubmenu(gameStatePane)); }
  if(btnVision && visionPane){ btnVision.addEventListener('click', ()=> toggleSubmenu(visionPane)); }
  if(btnCamera && cameraPane){ btnCamera.addEventListener('click', ()=> toggleSubmenu(cameraPane)); }
  if(btnCursor && cursorPane){ btnCursor.addEventListener('click', ()=> toggleSubmenu(cursorPane)); }
  if(btnPings && pingPane){ btnPings.addEventListener('click', ()=> toggleSubmenu(pingPane)); }
  if(btnKeybinds && keybindPane){ btnKeybinds.addEventListener('click', ()=> toggleSubmenu(keybindPane)); }
  btnAbilityBar.addEventListener('click', ()=> toggleSubmenu(abilityPane));
  if(btnMinimap && minimapPane){ btnMinimap.addEventListener('click', ()=> toggleSubmenu(minimapPane)); }
  if(btnGold && goldPane){ btnGold.addEventListener('click', ()=> toggleSubmenu(goldPane)); }
  btnScore  .addEventListener('click', ()=> toggleSubmenu(scorePane));
  if(btnUiLayout && uiLayoutPane){ btnUiLayout.addEventListener('click', ()=> toggleSubmenu(uiLayoutPane)); }

  // State
  const CAMERA_WIDTH = 1920;
  const CAMERA_HEIGHT = 1080;
  const BASE_CAMERA_WIDTH = CAMERA_WIDTH;
  const BASE_CAMERA_HEIGHT = CAMERA_HEIGHT;
  const hitboxCanvas = document.createElement('canvas');
  const hitboxCtx = hitboxCanvas.getContext('2d');
  const blueSpawns = GameState.spawns.blue; // keep single; new placement replaces
  const redSpawns  = GameState.spawns.red;

  function defaultSpawnPosition(side){
    const baseMargin = Math.max(PORTAL_R + 20, minionRadius + 10);
    const width = mapState.width;
    const height = mapState.height;
    const marginX = Math.min(baseMargin, width / 2 || 0);
    const marginY = Math.min(baseMargin, height / 2 || 0);
    const clampCoord = (value, max) => {
      if(!(max > 0)) return 0;
      return Math.max(0, Math.min(max, value));
    };
    const x = side === 'blue' ? marginX : width - marginX;
    const y = side === 'blue' ? height - marginY : marginY;
    return {
      x: clampCoord(x, width),
      y: clampCoord(y, height),
      userPlaced: false
    };
  }
  function ensureDefaultSpawns(force = false){
    if(force || !blueSpawns[0]){
      if(!force || !blueSpawns[0] || !blueSpawns[0].userPlaced){
        blueSpawns[0] = defaultSpawnPosition('blue');
        blueSpawns.length = 1;
      }
    }
    if(force || !redSpawns[0]){
      if(!force || !redSpawns[0] || !redSpawns[0].userPlaced){
        redSpawns[0] = defaultSpawnPosition('red');
        redSpawns.length = 1;
      }
    }
    invalidateLaneLayout({ resetMinions: true });
  }

  const camera = cameraState;
  let cameraFollowLagMs = camera.followLagMs;
  let cameraLeadDistance = camera.leadDistance;
  let cameraHorizontalOffsetPercent = camera.horizontalOffsetPercent;
  let cameraVerticalOffsetPercent = camera.verticalOffsetPercent;
  let cameraEdgeScrollMargin = camera.edgeScrollMargin;
  let cameraEdgeScrollSpeed = camera.edgeScrollSpeed;
  let cameraRecenterDelayMs = camera.recenterDelayMs;
  let cameraManualLeash = camera.manualLeash;
  let cameraWheelSensitivity = camera.wheelSensitivity;
  let cameraZoomInLocked = camera.zoomInLocked;
  let cameraZoomInLimit = camera.zoomInLimit;
  let cameraZoomOutLocked = camera.zoomOutLocked;
  let cameraZoomOutLimit = camera.zoomOutLimit;
  const CAMERA_RETURN_RATE = 3.8;
  const CAMERA_ZOOM_MIN = 0;
  const CAMERA_ZOOM_MAX = 5;
  let cameraLockBinding = camera.lockBinding ? { ...camera.lockBinding } : { key: ' ', code: 'Space', label: 'Space' };
  let cameraLockCapture = camera.lockCapture;
  let attackMoveBinding = keybindState && keybindState.attackMove ? { ...keybindState.attackMove } : { key: 'a', code: 'KeyA', label: 'A' };
  keybindState.attackMove = { ...attackMoveBinding };
  let attackMoveCapture = false;
  let pingWheelBinding = keybindState && keybindState.pingWheel ? { ...keybindState.pingWheel } : { key: 'g', code: 'KeyG', label: 'G' };
  keybindState.pingWheel = { ...pingWheelBinding };
  let pingWheelCapture = false;
  const pingWheelRuntime = {
    active: false,
    keyHeld: false,
    anchorX: 0,
    anchorY: 0,
    pointerX: 0,
    pointerY: 0,
    pointerDistance: 0,
    selection: null
  };
  let lastUnlockedCameraMode = camera.lastUnlockedMode;
  let cameraLastManualMoveAt = camera.lastManualMoveAt;
  let cameraDragActive = camera.drag.active;
  let cameraDragPointerId = camera.drag.pointerId;
  let cameraDragLast = camera.drag.last;
  let lastPlayerVelocityX = camera.lastPlayerVelocity.x;
  let lastPlayerVelocityY = camera.lastPlayerVelocity.y;
  let lastCameraTransformX = camera.lastTransform.x;
  let lastCameraTransformY = camera.lastTransform.y;
  let lastCameraTransformScale = camera.lastTransform.scale;
  function cameraRight(){ return camera.x + camera.width; }
  function cameraBottom(){ return camera.y + camera.height; }
  function circleInCamera(x, y, radius = 0){
    if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = Math.max(0, radius);
    const left = x - r;
    const right = x + r;
    const top = y - r;
    const bottom = y + r;
    return right >= camera.x && left <= cameraRight() && bottom >= camera.y && top <= cameraBottom();
  }
  function rectIntersectsCamera(minX, minY, maxX, maxY, padding = 0){
    if(!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)){
      return false;
    }
    const pad = Math.max(0, padding);
    const left = Math.min(minX, maxX) - pad;
    const right = Math.max(minX, maxX) + pad;
    const top = Math.min(minY, maxY) - pad;
    const bottom = Math.max(minY, maxY) + pad;
    return right >= camera.x && left <= cameraRight() && bottom >= camera.y && top <= cameraBottom();
  }
  function clampCameraToBounds(){
    const maxX = Math.max(0, mapState.width - camera.width);
    const maxY = Math.max(0, mapState.height - camera.height);
    if(!Number.isFinite(camera.x)) camera.x = 0;
    if(!Number.isFinite(camera.y)) camera.y = 0;
    camera.x = Math.max(0, Math.min(maxX, camera.x));
    camera.y = Math.max(0, Math.min(maxY, camera.y));
  }
  function applyCameraTransform(force = false){
    if(!view){
      return;
    }
    const scale = Math.max(0.001, Number(camera.scale) || 1);
    const tx = -camera.x * scale;
    const ty = -camera.y * scale;
    if(!force && tx === lastCameraTransformX && ty === lastCameraTransformY && scale === lastCameraTransformScale){
      return;
    }
    lastCameraTransformX = tx;
    lastCameraTransformY = ty;
    lastCameraTransformScale = scale;
    camera.lastTransform.x = lastCameraTransformX;
    camera.lastTransform.y = lastCameraTransformY;
    camera.lastTransform.scale = lastCameraTransformScale;
    const matrix = `matrix(${scale}, 0, 0, ${scale}, ${tx}, ${ty})`;
    view.style.transformOrigin = 'top left';
    view.style.transform = matrix;
    if(canvas){
      const inverseScale = 1 / scale;
      const canvasTx = camera.x;
      const canvasTy = camera.y;
      const canvasMatrix = `matrix(${inverseScale}, 0, 0, ${inverseScale}, ${canvasTx}, ${canvasTy})`;
      canvas.style.transformOrigin = 'top left';
      canvas.style.transform = canvasMatrix;
    }
  }
  function cameraLeadVector(){
    const leadDistance = Math.max(0, Number(cameraLeadDistance) || 0);
    if(leadDistance <= 0){
      return { x: 0, y: 0 };
    }
    const speed = Math.hypot(lastPlayerVelocityX, lastPlayerVelocityY);
    if(speed < 0.01){
      return { x: 0, y: 0 };
    }
    const cappedLead = Math.min(leadDistance, camera.width * 0.45);
    const nx = lastPlayerVelocityX / speed;
    const ny = lastPlayerVelocityY / speed;
    return { x: nx * cappedLead, y: ny * cappedLead };
  }

  function clampManualOffset(){
    if(camera.mode === 'locked'){
      camera.manualOffsetX = 0;
      camera.manualOffsetY = 0;
      return;
    }
    if(camera.mode !== 'semi'){
      return;
    }
    const leash = Math.max(0, Number(cameraManualLeash) || 0);
    if(!(leash > 0)){
      return;
    }
    const dist = Math.hypot(camera.manualOffsetX, camera.manualOffsetY);
    if(dist <= leash){
      return;
    }
    const scale = leash / dist;
    camera.manualOffsetX *= scale;
    camera.manualOffsetY *= scale;
  }
  function updateCamera(centerOnPlayer = true, dt = 0, options = {}){
    if(typeof centerOnPlayer === 'object' && centerOnPlayer !== null){
      options = centerOnPlayer;
      centerOnPlayer = options.centerOnPlayer !== undefined ? !!options.centerOnPlayer : true;
      dt = Number(options.dt) || 0;
    } else if(typeof dt === 'object' && dt !== null){
      options = dt;
      dt = Number(options.dt) || 0;
    }
    let playerRef = null;
    try {
      playerRef = player;
    } catch (err) {
      playerRef = null;
    }
    if(centerOnPlayer && playerRef){
      camera.followX = playerRef.x;
      camera.followY = playerRef.y;
    }
    const lead = cameraLeadVector();
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    let anchorX = camera.followX + lead.x;
    let anchorY = camera.followY + lead.y;
    const horizontalBias = Math.max(-100, Math.min(100, Number(cameraHorizontalOffsetPercent) || 0));
    const verticalBias = Math.max(-100, Math.min(100, Number(cameraVerticalOffsetPercent) || 0));
    if(horizontalBias !== 0){
      anchorX += camera.width * (horizontalBias / 100);
    }
    if(verticalBias !== 0){
      anchorY += camera.height * (verticalBias / 100);
    }
    if(camera.mode === 'locked'){
      camera.manualOffsetX = 0;
      camera.manualOffsetY = 0;
    } else {
      if(camera.mode === 'semi' && dt > 0){
        if(now - cameraLastManualMoveAt > cameraRecenterDelayMs){
          const decay = Math.exp(-CAMERA_RETURN_RATE * dt);
          camera.manualOffsetX *= decay;
          camera.manualOffsetY *= decay;
          if(Math.abs(camera.manualOffsetX) < 0.01) camera.manualOffsetX = 0;
          if(Math.abs(camera.manualOffsetY) < 0.01) camera.manualOffsetY = 0;
        }
      }
      clampManualOffset();
      anchorX += camera.manualOffsetX;
      anchorY += camera.manualOffsetY;
    }
    let targetX = anchorX - camera.width / 2;
    let targetY = anchorY - camera.height / 2;
    const maxX = Math.max(0, mapState.width - camera.width);
    const maxY = Math.max(0, mapState.height - camera.height);
    targetX = Math.max(0, Math.min(maxX, targetX));
    targetY = Math.max(0, Math.min(maxY, targetY));
    if(camera.mode !== 'locked'){
      const clampedCenterX = targetX + camera.width / 2;
      const clampedCenterY = targetY + camera.height / 2;
      const adjustX = clampedCenterX - anchorX;
      const adjustY = clampedCenterY - anchorY;
      if(adjustX !== 0 || adjustY !== 0){
        camera.manualOffsetX += adjustX;
        camera.manualOffsetY += adjustY;
        clampManualOffset();
      }
    }
    const force = options && options.force;
    if(force){
      camera.x = targetX;
      camera.y = targetY;
    } else {
      const lagSeconds = Math.max(0, Number(cameraFollowLagMs) || 0) / 1000;
      let blend = 1;
      if(lagSeconds > 0 && dt > 0){
        blend = Math.min(1, dt / (lagSeconds + dt));
      }
      camera.x += (targetX - camera.x) * blend;
      camera.y += (targetY - camera.y) * blend;
    }
    clampCameraToBounds();
    applyCameraTransform(force);
  }

  function setCameraMode(mode, { syncInput = true, silent = false } = {}){
    const normalized = typeof mode === 'string' ? mode.toLowerCase() : '';
    let target = 'semi';
    if(normalized === 'locked'){
      target = 'locked';
    } else if(normalized === 'free' || normalized === 'unlocked'){
      target = 'free';
    } else if(normalized === 'semi' || normalized === 'semi-locked'){
      target = 'semi';
    }
    if(camera.mode === target){
      if(syncInput && cameraModeSelect && cameraModeSelect.value !== target){
        cameraModeSelect.value = target;
      }
      return;
    }
    if(target !== 'locked'){
      lastUnlockedCameraMode = target;
      camera.lastUnlockedMode = lastUnlockedCameraMode;
    }
    camera.mode = target;
    if(cameraModeSelect && syncInput && cameraModeSelect.value !== target){
      cameraModeSelect.value = target;
    }
    if(target === 'locked'){
      camera.manualOffsetX = 0;
      camera.manualOffsetY = 0;
    }
    if(!silent){
      updateCamera(true, 0, { force: true });
    }
  }

  function toggleCameraLock(){
    if(camera.mode === 'locked'){
      const next = lastUnlockedCameraMode === 'free' ? 'free' : 'semi';
      setCameraMode(next, { syncInput: true });
      cameraLastManualMoveAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      camera.lastManualMoveAt = cameraLastManualMoveAt;
    } else {
      lastUnlockedCameraMode = camera.mode;
      camera.lastUnlockedMode = lastUnlockedCameraMode;
      setCameraMode('locked', { syncInput: true });
      recenterCamera({ force: true });
    }
  }

  function applyManualCameraOffset(offsetX, offsetY, { immediate = false } = {}){
    if(camera.mode === 'locked'){
      return;
    }
    const dx = Number(offsetX) || 0;
    const dy = Number(offsetY) || 0;
    if(dx === 0 && dy === 0){
      return;
    }
    camera.manualOffsetX += dx;
    camera.manualOffsetY += dy;
    clampManualOffset();
    cameraLastManualMoveAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    camera.lastManualMoveAt = cameraLastManualMoveAt;
    if(immediate){
      updateCamera(false, 0, { force: true });
    }
  }

  function recenterCamera({ force = true } = {}){
    camera.manualOffsetX = 0;
    camera.manualOffsetY = 0;
    cameraLastManualMoveAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    camera.lastManualMoveAt = cameraLastManualMoveAt;
    updateCamera(true, 0, { force });
  }

  function setCameraFollowLag(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Math.min(3000, Number(value) || 0));
    cameraFollowLagMs = numeric;
    camera.followLagMs = numeric;
    if(cameraFollowLagInput && syncInput){
      cameraFollowLagInput.value = String(Math.round(numeric));
    }
    if(cameraFollowLagDisplay){
      cameraFollowLagDisplay.textContent = numeric <= 0 ? 'Instant' : `${Math.round(numeric)}ms`;
    }
  }

  function setCameraLead(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Math.min(3000, Number(value) || 0));
    cameraLeadDistance = numeric;
    camera.leadDistance = numeric;
    if(cameraLeadInput && syncInput){
      cameraLeadInput.value = String(Math.round(numeric));
    }
    if(cameraLeadDisplay){
      cameraLeadDisplay.textContent = `${Math.round(numeric)}px`;
    }
    updateCamera(true, 0, { force: true });
  }

  function setCameraHorizontalOffset(value, { syncInput = true } = {}){
    let numeric = Number(value);
    if(!Number.isFinite(numeric)){
      numeric = 0;
    }
    numeric = Math.max(-100, Math.min(100, numeric));
    cameraHorizontalOffsetPercent = numeric;
    camera.horizontalOffsetPercent = numeric;
    if(cameraHorizontalOffsetInput){
      const rounded = String(Math.round(numeric));
      if(syncInput || cameraHorizontalOffsetInput.value !== rounded){
        cameraHorizontalOffsetInput.value = rounded;
      }
    }
    if(cameraHorizontalOffsetDisplay){
      const rounded = Math.round(numeric);
      if(Math.abs(rounded) < 1){
        cameraHorizontalOffsetDisplay.textContent = 'Centered';
      } else if(rounded > 0){
        cameraHorizontalOffsetDisplay.textContent = `Right ${rounded}%`;
      } else {
        cameraHorizontalOffsetDisplay.textContent = `Left ${Math.abs(rounded)}%`;
      }
    }
    updateCamera(true, 0, { force: true });
  }

  function setCameraVerticalOffset(value, { syncInput = true } = {}){
    let numeric = Number(value);
    if(!Number.isFinite(numeric)){
      numeric = 0;
    }
    numeric = Math.max(-100, Math.min(100, numeric));
    cameraVerticalOffsetPercent = numeric;
    camera.verticalOffsetPercent = numeric;
    if(cameraVerticalOffsetInput){
      const rounded = String(Math.round(numeric));
      if(syncInput || cameraVerticalOffsetInput.value !== rounded){
        cameraVerticalOffsetInput.value = rounded;
      }
    }
    if(cameraVerticalOffsetDisplay){
      const rounded = Math.round(numeric);
      if(Math.abs(rounded) < 1){
        cameraVerticalOffsetDisplay.textContent = 'Centered';
      } else if(rounded > 0){
        cameraVerticalOffsetDisplay.textContent = `Down ${rounded}%`;
      } else {
        cameraVerticalOffsetDisplay.textContent = `Up ${Math.abs(rounded)}%`;
      }
    }
    updateCamera(true, 0, { force: true });
  }

  function setCameraEdgeMargin(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Math.min(3000, Number(value) || 0));
    cameraEdgeScrollMargin = numeric;
    camera.edgeScrollMargin = numeric;
    if(cameraEdgeMarginInput && syncInput){
      cameraEdgeMarginInput.value = String(Math.round(numeric));
    }
    if(cameraEdgeMarginDisplay){
      cameraEdgeMarginDisplay.textContent = `${Math.round(numeric)}px`;
    }
  }

  function setCameraEdgeSpeed(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Math.min(3000, Number(value) || 0));
    cameraEdgeScrollSpeed = numeric;
    camera.edgeScrollSpeed = numeric;
    if(cameraEdgeSpeedInput && syncInput){
      cameraEdgeSpeedInput.value = String(Math.round(numeric));
    }
    if(cameraEdgeSpeedDisplay){
      cameraEdgeSpeedDisplay.textContent = numeric <= 0 ? 'Off' : `${Math.round(numeric)}px/s`;
    }
  }

  function setCameraRecenterDelay(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Math.min(3000, Number(value) || 0));
    cameraRecenterDelayMs = numeric;
    camera.recenterDelayMs = numeric;
    if(cameraRecenterDelayInput && syncInput){
      cameraRecenterDelayInput.value = String(Math.round(numeric));
    }
    if(cameraRecenterDelayDisplay){
      const seconds = numeric / 1000;
      if(seconds <= 0){
        cameraRecenterDelayDisplay.textContent = '0s';
      } else if(seconds >= 1){
        cameraRecenterDelayDisplay.textContent = `${seconds.toFixed(2)}s`;
      } else {
        cameraRecenterDelayDisplay.textContent = `${seconds.toFixed(2)}s`;
      }
    }
  }

  function setCameraManualLeash(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Math.min(3000, Number(value) || 0));
    cameraManualLeash = numeric;
    camera.manualLeash = numeric;
    if(cameraManualLeashInput && syncInput){
      cameraManualLeashInput.value = String(Math.round(numeric));
    }
    if(cameraManualLeashDisplay){
      cameraManualLeashDisplay.textContent = numeric <= 0 ? 'Unlimited' : `${Math.round(numeric)}px`;
    }
    clampManualOffset();
    updateCamera(true, 0, { force: true });
  }

  function applyZoomLockLimits(percent){
    let clamped = Number(percent);
    if(!Number.isFinite(clamped)){
      clamped = camera.scale * 100;
    }
    clamped = Math.max(CAMERA_ZOOM_MIN * 100, Math.min(CAMERA_ZOOM_MAX * 100, clamped));
    if(cameraZoomInLocked && Number.isFinite(cameraZoomInLimit)){
      clamped = Math.min(clamped, cameraZoomInLimit);
    }
    if(cameraZoomOutLocked && Number.isFinite(cameraZoomOutLimit)){
      clamped = Math.max(clamped, cameraZoomOutLimit);
    }
    return clamped;
  }

  function updateZoomLockButton(btn, locked){
    if(!btn){
      return;
    }
    btn.textContent = locked ? 'Locked' : 'Unlocked';
    btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
  }

  function setCameraZoomInLock(value, limitOverride = null){
    const locked = !!value;
    cameraZoomInLocked = locked;
    camera.zoomInLocked = locked;
    if(locked){
      if(limitOverride != null && Number.isFinite(Number(limitOverride))){
        cameraZoomInLimit = Number(limitOverride);
      } else {
        cameraZoomInLimit = applyZoomLockLimits(Math.round(camera.scale * 100));
      }
    } else {
      cameraZoomInLimit = null;
    }
    camera.zoomInLimit = cameraZoomInLimit;
    updateZoomLockButton(cameraZoomInLockBtn, locked);
    if(locked){
      setCameraZoom(camera.scale * 100, { syncInput: true, instant: true });
    }
  }

  function setCameraZoomOutLock(value, limitOverride = null){
    const locked = !!value;
    cameraZoomOutLocked = locked;
    camera.zoomOutLocked = locked;
    if(locked){
      if(limitOverride != null && Number.isFinite(Number(limitOverride))){
        cameraZoomOutLimit = Number(limitOverride);
      } else {
        cameraZoomOutLimit = applyZoomLockLimits(Math.round(camera.scale * 100));
      }
    } else {
      cameraZoomOutLimit = null;
    }
    camera.zoomOutLimit = cameraZoomOutLimit;
    updateZoomLockButton(cameraZoomOutLockBtn, locked);
    if(locked){
      setCameraZoom(camera.scale * 100, { syncInput: true, instant: true });
    }
  }

  function setCameraZoom(value, { syncInput = true, instant = false } = {}){
    let numeric = Number(value);
    if(!Number.isFinite(numeric)){
      numeric = camera.scale * 100;
    }
    if(Math.abs(numeric) <= 2){
      numeric = numeric * 100;
    }
    const percent = applyZoomLockLimits(numeric);
    const nextScale = Math.max(0.001, percent / 100);
    const previousScale = camera.scale;
    camera.scale = nextScale;
    syncCameraDimensions();
    if(cameraZoomInput){
      const rounded = String(Math.round(percent));
      if(syncInput || cameraZoomInput.value !== rounded){
        cameraZoomInput.value = rounded;
      }
    }
    if(cameraZoomDisplay){
      cameraZoomDisplay.textContent = `${Math.round(percent)}%`;
    }
    clampCameraToBounds();
    updateCamera(true, 0, { force: instant });
    renderMinimap(true);
    return Math.abs(camera.scale - previousScale) > 1e-6;
  }

  function setCameraWheelSensitivity(value, { syncInput = true } = {}){
    const numeric = Math.max(0, Number(value) || 0);
    cameraWheelSensitivity = numeric;
    camera.wheelSensitivity = numeric;
    if(cameraWheelSensitivityInput && syncInput){
      cameraWheelSensitivityInput.value = String(Math.round(numeric));
    }
    if(cameraWheelSensitivityDisplay){
      cameraWheelSensitivityDisplay.textContent = numeric <= 0 ? 'Off' : `${Math.round(numeric)}%/step`;
    }
  }

  function updateCameraLockBindingDisplay(){
    if(!cameraLockBindBtn){
      return;
    }
    if(cameraLockCapture){
      cameraLockBindBtn.textContent = 'Press a key...';
    } else {
      cameraLockBindBtn.textContent = cameraLockBinding && cameraLockBinding.label ? cameraLockBinding.label : '';
    }
  }

  function setCameraLockBinding(key, code){
    const label = formatAbilityKeyLabel(key, code);
    cameraLockBinding = {
      key: typeof key === 'string' ? key : '',
      code: typeof code === 'string' ? code : '',
      label
    };
    camera.lockBinding = { ...cameraLockBinding };
    updateCameraLockBindingDisplay();
  }

  function matchesCameraLockKey(ev){
    if(!cameraLockBinding){
      return false;
    }
    const bindingCode = cameraLockBinding.code;
    if(bindingCode && ev.code === bindingCode){
      return true;
    }
    const bindingKey = cameraLockBinding.key ? cameraLockBinding.key.toLowerCase() : '';
    if(bindingCode){
      return false;
    }
    if(!bindingKey){
      return false;
    }
    const eventKey = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
    return eventKey === bindingKey;
  }

  function refreshCursorToggleButtons(){
    if(cursorToggleBtn){
      cursorToggleBtn.textContent = cursorState.enabled ? 'Enabled' : 'Disabled';
      cursorToggleBtn.classList.toggle('is-active', cursorState.enabled);
    }
    if(cursorOutlineToggle){
      cursorOutlineToggle.textContent = cursorState.outlineEnabled ? 'Enabled' : 'Disabled';
      cursorOutlineToggle.classList.toggle('is-active', cursorState.outlineEnabled);
    }
  }

  function refreshStageCursor(){
    if(stage){
      stage.setAttribute('data-cursor-enabled', String(cursorState.enabled));
    }
    if(!stageCursorEl){
      return;
    }
    const visible = cursorState.enabled && stagePointerState.inside;
    stageCursorEl.dataset.visible = visible ? 'true' : 'false';
    if(visible){
      const x = Number(stagePointerState.x) || 0;
      const y = Number(stagePointerState.y) || 0;
      stageCursorEl.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  function setCursorEnabled(value, { syncInput = true } = {}){
    cursorState.enabled = !!value;
    if(syncInput){
      refreshCursorToggleButtons();
    }
    if(!cursorState.enabled){
      clearHoverTarget();
    }
    refreshStageCursor();
  }

  function setCursorOutlineEnabled(value, { syncInput = true } = {}){
    cursorState.outlineEnabled = !!value;
    if(syncInput){
      refreshCursorToggleButtons();
    }
    if(!cursorState.outlineEnabled){
      clearHoverTarget();
    }
  }

  function setCursorEmoji(value, { syncInput = true } = {}){
    const sanitized = sanitizeEmojiInput(value, cursorState.emoji || '');
    cursorState.emoji = sanitized;
    if(cursorEmojiInput && syncInput){
      cursorEmojiInput.value = sanitized;
    }
    if(stageCursorIcon){
      stageCursorIcon.textContent = sanitized;
    }
  }

  function setCursorHoverColor(value, { syncInput = true } = {}){
    const sanitized = sanitizeHexColor(value, cursorState.hoverColor || '#7fe3ff');
    cursorState.hoverColor = sanitized;
    if(cursorHoverColorInput && syncInput){
      cursorHoverColorInput.value = sanitized;
    }
    if(typeof rootStyle !== 'undefined' && rootStyle){
      rootStyle.setProperty('--cursor-hover-color', sanitized);
    }
  }

  function setHoverTarget(target, type){
    if(target && type){
      cursorRuntime.hoverTarget = { ref: target, type };
    } else {
      cursorRuntime.hoverTarget = null;
    }
  }

  function clearHoverTarget(){
    cursorRuntime.hoverTarget = null;
  }

  function updateHoverTargetFromPosition(x, y){
    if(!cursorState.outlineEnabled){
      clearHoverTarget();
      return;
    }
    const dummyActive = practiceDummy && practiceDummy.active !== false && !(practiceDummy.respawnTimer > 0);
    if(dummyActive && isPointerInsidePracticeDummy(x, y)){
      setHoverTarget(practiceDummy, 'dummy');
      return;
    }
    const target = findAutoAttackTargetAt(x, y);
    if(target){
      if(target === monsterState){
        setHoverTarget(monsterState, 'monster');
      } else if(target.isPracticeDummy){
        setHoverTarget(target, 'dummy');
      } else {
        setHoverTarget(target, 'minion');
      }
      return;
    }
    clearHoverTarget();
  }

  function updateAttackMoveBindingDisplay(){
    if(!attackMoveBindBtn){
      return;
    }
    if(attackMoveCapture){
      attackMoveBindBtn.textContent = 'Press a key...';
    } else {
      attackMoveBindBtn.textContent = attackMoveBinding && attackMoveBinding.label ? attackMoveBinding.label : '';
    }
    attackMoveBindBtn.classList.toggle('is-active', attackMoveCapture);
  }

  function setAttackMoveBinding(key, code){
    const bindingKey = typeof key === 'string' ? key : '';
    const bindingCode = typeof code === 'string' ? code : '';
    const label = formatAbilityKeyLabel(bindingKey, bindingCode);
    attackMoveBinding = { key: bindingKey, code: bindingCode, label };
    keybindState.attackMove = { ...attackMoveBinding };
    updateAttackMoveBindingDisplay();
  }

  function matchesAttackMoveKey(ev){
    if(!attackMoveBinding){
      return false;
    }
    const bindingCode = attackMoveBinding.code;
    if(bindingCode && ev.code === bindingCode){
      return true;
    }
    const bindingKey = attackMoveBinding.key ? attackMoveBinding.key.toLowerCase() : '';
    if(bindingCode){
      return false;
    }
    if(!bindingKey){
      return false;
    }
    const eventKey = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
    return eventKey === bindingKey;
  }

  function findClosestAttackMoveTarget(x, y){
    let bestTarget = null;
    let bestType = null;
    let bestDistSq = Infinity;
    for(const m of minions){
      if(!isEnemyMinionForPlayer(m)) continue;
      const dx = m.x - x;
      const dy = m.y - y;
      const distSq = dx * dx + dy * dy;
      if(distSq < bestDistSq){
        bestDistSq = distSq;
        bestTarget = m;
        bestType = 'minion';
      }
    }
    if(isMonsterAttackable(monsterState)){
      const dx = monsterState.x - x;
      const dy = monsterState.y - y;
      const distSq = dx * dx + dy * dy;
      if(distSq < bestDistSq){
        bestDistSq = distSq;
        bestTarget = monsterState;
        bestType = 'monster';
      }
    }
    return bestTarget ? { ref: bestTarget, type: bestType } : null;
  }

  function executeAttackMove(){
    if(isPlayerRecalling()){
      cancelRecall('move');
    }
    const coords = abilityRuntime.lastPointerWorld
      ? { x: abilityRuntime.lastPointerWorld.x, y: abilityRuntime.lastPointerWorld.y }
      : { x: player.x, y: player.y };
    const targetInfo = findClosestAttackMoveTarget(coords.x, coords.y);
    let message = 'Moving to cursor.';
    if(targetInfo){
      commandPlayerAttack(targetInfo.ref);
      message = targetInfo.type === 'monster' ? 'Engaging the monster.' : 'Engaging the nearest enemy.';
    } else {
      cancelPlayerAttack();
    }
    issuePlayerMoveOrder(coords.x, coords.y, { flashPulse: true, updateHud: false });
    setHudMessage(`Attack move: ${message}`);
    updateHoverTargetFromPosition(coords.x, coords.y);
  }

  function updatePingWheelBindingDisplay(){
    if(!pingWheelBindBtn){
      return;
    }
    if(pingWheelCapture){
      pingWheelBindBtn.textContent = 'Press a key...';
    } else {
      pingWheelBindBtn.textContent = pingWheelBinding && pingWheelBinding.label ? pingWheelBinding.label : '';
    }
    pingWheelBindBtn.classList.toggle('is-active', pingWheelCapture);
  }

  function setPingWheelBinding(key, code){
    const bindingKey = typeof key === 'string' ? key : '';
    const bindingCode = typeof code === 'string' ? code : '';
    const label = formatAbilityKeyLabel(bindingKey, bindingCode);
    pingWheelBinding = { key: bindingKey, code: bindingCode, label };
    keybindState.pingWheel = { ...pingWheelBinding };
    updatePingWheelBindingDisplay();
  }

  function matchesPingWheelKey(ev){
    if(!pingWheelBinding){
      return false;
    }
    const bindingCode = pingWheelBinding.code;
    if(bindingCode && ev.code === bindingCode){
      return true;
    }
    const bindingKey = pingWheelBinding.key ? pingWheelBinding.key.toLowerCase() : '';
    if(bindingCode){
      return false;
    }
    if(!bindingKey){
      return false;
    }
    const eventKey = typeof ev.key === 'string' ? ev.key.toLowerCase() : '';
    return eventKey === bindingKey;
  }

  function cancelPingWheel(){
    pingWheelRuntime.active = false;
    pingWheelRuntime.keyHeld = false;
    pingWheelRuntime.selection = null;
    pingWheelRuntime.pointerDistance = 0;
  }

  function setPingWheelPointer(x, y){
    if(!pingWheelRuntime.active){
      return;
    }
    pingWheelRuntime.pointerX = x;
    pingWheelRuntime.pointerY = y;
  }

  function resolvePingWheelSelection(){
    if(!pingWheelRuntime.active){
      pingWheelRuntime.selection = null;
      pingWheelRuntime.pointerDistance = 0;
      return null;
    }
    const dx = pingWheelRuntime.pointerX - pingWheelRuntime.anchorX;
    const dy = pingWheelRuntime.pointerY - pingWheelRuntime.anchorY;
    const cameraScale = Math.max(0.001, Number(camera.scale) || 1);
    const distance = Math.hypot(dx, dy);
    pingWheelRuntime.pointerDistance = distance;
    const minDistance = 48 / cameraScale;
    if(distance < minDistance){
      pingWheelRuntime.selection = null;
      return null;
    }
    const angle = Math.atan2(dy, dx);
    let type;
    if(angle > -Math.PI / 4 && angle <= Math.PI / 4){
      type = 'target';
    } else if(angle > Math.PI / 4 && angle <= 3 * Math.PI / 4){
      type = 'assistMe';
    } else if(angle > -3 * Math.PI / 4 && angle <= -Math.PI / 4){
      type = 'onMyWay';
    } else {
      type = 'enemyMissing';
    }
    pingWheelRuntime.selection = type;
    return type;
  }

  function openPingWheel(){
    const source = stagePointerState.inside && Number.isFinite(stagePointerState.worldX) && Number.isFinite(stagePointerState.worldY)
      ? { x: stagePointerState.worldX, y: stagePointerState.worldY }
      : (abilityRuntime.lastPointerWorld && Number.isFinite(abilityRuntime.lastPointerWorld.x) && Number.isFinite(abilityRuntime.lastPointerWorld.y)
        ? { x: abilityRuntime.lastPointerWorld.x, y: abilityRuntime.lastPointerWorld.y }
        : { x: player.x, y: player.y });
    pingWheelRuntime.active = true;
    pingWheelRuntime.keyHeld = true;
    pingWheelRuntime.anchorX = source.x;
    pingWheelRuntime.anchorY = source.y;
    pingWheelRuntime.pointerX = source.x;
    pingWheelRuntime.pointerY = source.y;
    pingWheelRuntime.selection = null;
    pingWheelRuntime.pointerDistance = 0;
    abilityRuntime.lastPointerWorld = { x: source.x, y: source.y };
  }

  function closePingWheel({ trigger = false } = {}){
    const wasActive = pingWheelRuntime.active;
    const selection = resolvePingWheelSelection();
    const choice = selection || 'target';
    const coords = { x: pingWheelRuntime.pointerX, y: pingWheelRuntime.pointerY };
    cancelPingWheel();
    if(trigger && wasActive){
      triggerPing(choice, { coords, viaWheel: true });
    }
  }

  function setPingEmoji(type, value, { syncInput = true } = {}){
    if(!pingState || !pingState.types || !Object.prototype.hasOwnProperty.call(pingState.types, type)){
      return;
    }
    const sanitized = sanitizeEmojiInput(value, pingState.types[type]);
    pingState.types[type] = sanitized;
    if(syncInput && pingInputs[type]){
      pingInputs[type].value = sanitized;
    }
  }

  function triggerPing(type, options = {}){
    if(!pingState || !pingState.types){
      return;
    }
    const emoji = pingState.types[type] || '';
    let coords;
    if(options && options.coords && Number.isFinite(options.coords.x) && Number.isFinite(options.coords.y)){
      coords = { x: options.coords.x, y: options.coords.y };
    } else if(abilityRuntime.lastPointerWorld && Number.isFinite(abilityRuntime.lastPointerWorld.x) && Number.isFinite(abilityRuntime.lastPointerWorld.y)){
      coords = { x: abilityRuntime.lastPointerWorld.x, y: abilityRuntime.lastPointerWorld.y };
    } else {
      coords = { x: player.x, y: player.y };
    }
    const clampedX = Math.max(0, Math.min(mapState.width, coords.x));
    const clampedY = Math.max(0, Math.min(mapState.height, coords.y));
    abilityRuntime.lastPointerWorld = { x: clampedX, y: clampedY };
    activePings.push({ type, emoji, x: clampedX, y: clampedY, age: 0, lifetime: 1.8 });
    const color = PING_VISUALS[type] || '#7fe3ff';
    flash(clampedX, clampedY, { startRadius: 24, endRadius: 72, color });
    setHudMessage(`Ping dropped: ${emoji}`);
  }

  function updatePings(dt){
    for(let i = activePings.length - 1; i >= 0; i--){
      const ping = activePings[i];
      ping.age += dt;
      const lifetime = Math.max(0.5, Number(ping.lifetime) || 1.8);
      if(ping.age >= lifetime){
        activePings.splice(i, 1);
      }
    }
  }

  function drawPings(){
    if(!activePings.length){
      return;
    }
    for(const ping of activePings){
      const color = PING_VISUALS[ping.type] || '#7fe3ff';
      const lifetime = Math.max(0.5, Number(ping.lifetime) || 1.8);
      const progress = Math.max(0, Math.min(1, ping.age / lifetime));
      const alpha = 1 - progress;
      const pulse = Math.sin(progress * Math.PI);
      const radius = 24 + pulse * 12;
      if(!circleInCamera(ping.x, ping.y, radius + 24)){
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0.2, alpha);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#05121a';
      ctx.strokeText(ping.emoji, ping.x, ping.y + 1);
      ctx.fillStyle = color;
      ctx.fillText(ping.emoji, ping.x, ping.y + 1);
      ctx.restore();
    }
  }

  function drawPingWheel(){
    if(!pingWheelRuntime.active){
      return;
    }
    const selection = resolvePingWheelSelection();
    const activeType = selection || 'target';
    const dx = pingWheelRuntime.pointerX - pingWheelRuntime.anchorX;
    const dy = pingWheelRuntime.pointerY - pingWheelRuntime.anchorY;
    const cameraScale = Math.max(0.001, Number(camera.scale) || 1);
    const radius = 140 / cameraScale;
    const innerRadius = 46 / cameraScale;
    const haloRadius = radius + 18 / cameraScale;
    const strokeWidth = 2.2 / cameraScale;
    const pointerDistance = pingWheelRuntime.pointerDistance;
    const segments = [
      { type: 'onMyWay', start: -3 * Math.PI / 4, end: -Math.PI / 4, label: 'On my way' },
      { type: 'target', start: -Math.PI / 4, end: Math.PI / 4, label: 'Target' },
      { type: 'assistMe', start: Math.PI / 4, end: 3 * Math.PI / 4, label: 'Assist me' },
      { type: 'enemyMissing', start: 3 * Math.PI / 4, end: 5 * Math.PI / 4, label: 'Enemy missing' }
    ];
    const centerX = pingWheelRuntime.anchorX;
    const centerY = pingWheelRuntime.anchorY;
    ctx.save();
    ctx.translate(centerX, centerY);

    ctx.beginPath();
    ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7, 12, 22, 0.78)';
    ctx.fill();

    for(const segment of segments){
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, segment.start, segment.end);
      ctx.closePath();
      const baseColor = PING_VISUALS[segment.type] || '#7fe3ff';
      const fillSuffix = segment.type === activeType ? 'cc' : '33';
      const strokeSuffix = segment.type === activeType ? 'ff' : '77';
      const fillColor = baseColor.length === 7 ? `${baseColor}${fillSuffix}` : baseColor;
      const strokeColor = baseColor.length === 7 ? `${baseColor}${strokeSuffix}` : baseColor;
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();

      const midAngle = (segment.start + segment.end) / 2;
      const emojiRadius = (radius + innerRadius) / 2;
      const labelRadius = radius + 28 / cameraScale;
      const emoji = pingState.types && pingState.types[segment.type] ? pingState.types[segment.type] : '';
      ctx.fillStyle = '#f6fbff';
      ctx.font = `bold ${Math.max(22, Math.round(34 / cameraScale))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, Math.cos(midAngle) * emojiRadius, Math.sin(midAngle) * emojiRadius);
      ctx.fillStyle = '#b9c7dd';
      ctx.font = `500 ${Math.max(11, Math.round(13 / cameraScale))}px system-ui`;
      ctx.fillText(segment.label, Math.cos(midAngle) * labelRadius, Math.sin(midAngle) * labelRadius);
    }

    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(11, 18, 30, 0.92)';
    ctx.fill();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = '#23324a';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-innerRadius * 0.55, 0);
    ctx.lineTo(innerRadius * 0.55, 0);
    ctx.moveTo(0, -innerRadius * 0.55);
    ctx.lineTo(0, innerRadius * 0.55);
    ctx.strokeStyle = '#314968';
    ctx.lineWidth = 1.6 / cameraScale;
    ctx.stroke();

    if(pointerDistance > 0){
      const cappedDistance = Math.min(radius, pointerDistance);
      const norm = pointerDistance > 0 ? cappedDistance / pointerDistance : 0;
      const lineX = dx * norm;
      const lineY = dy * norm;
      const pointerColor = PING_VISUALS[activeType] || '#7fe3ff';
      ctx.strokeStyle = pointerColor;
      ctx.lineWidth = 2.6 / cameraScale;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(lineX, lineY);
      ctx.stroke();
      ctx.fillStyle = pointerColor;
      ctx.beginPath();
      ctx.arc(lineX, lineY, 5 / cameraScale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function updateStagePointerState(ev){
    if(!stage){
      return;
    }
    const rect = stage.getBoundingClientRect();
    stagePointerState.width = rect && Number.isFinite(rect.width) ? rect.width : 0;
    stagePointerState.height = rect && Number.isFinite(rect.height) ? rect.height : 0;
    if(ev){
      const localX = ev.clientX - rect.left;
      const localY = ev.clientY - rect.top;
      stagePointerState.x = localX;
      stagePointerState.y = localY;
      stagePointerState.inside = localX >= 0 && localX <= stagePointerState.width && localY >= 0 && localY <= stagePointerState.height;
      const coords = stagePointerPosition(ev);
      stagePointerState.worldX = coords.x;
      stagePointerState.worldY = coords.y;
      if(pingWheelRuntime.active){
        setPingWheelPointer(coords.x, coords.y);
      }
    }
    refreshStageCursor();
  }

  function applyEdgeScroll(dt){
    if(cameraDragActive){
      return;
    }
    if(camera.mode === 'locked'){
      return;
    }
    if(!(cameraEdgeScrollMargin > 0) || !(cameraEdgeScrollSpeed > 0)){
      return;
    }
    if(!stagePointerState.inside){
      return;
    }
    const width = stagePointerState.width;
    const height = stagePointerState.height;
    if(!(width > 0) || !(height > 0)){
      return;
    }
    const margin = Math.min(cameraEdgeScrollMargin, Math.min(width, height) / 2);
    if(margin <= 0){
      return;
    }
    const x = stagePointerState.x;
    const y = stagePointerState.y;
    let vx = 0;
    let vy = 0;
    if(x < margin){
      vx = -(1 - Math.max(0, x) / margin);
    } else if(x > width - margin){
      vx = (1 - Math.max(0, width - x) / margin);
    }
    if(y < margin){
      vy = -(1 - Math.max(0, y) / margin);
    } else if(y > height - margin){
      vy = (1 - Math.max(0, height - y) / margin);
    }
    if(vx === 0 && vy === 0){
      return;
    }
    const distance = Math.max(0, cameraEdgeScrollSpeed) * Math.max(0, dt);
    if(distance <= 0){
      return;
    }
    const magnitude = Math.hypot(vx, vy) || 1;
    applyManualCameraOffset((vx / magnitude) * distance, (vy / magnitude) * distance);
  }

  function startCameraDrag(ev){
    if(camera.mode === 'locked'){
      setCameraMode(lastUnlockedCameraMode === 'free' ? 'free' : 'semi', { syncInput: true });
    }
    cameraDragActive = true;
    camera.drag.active = true;
    cameraDragPointerId = Number.isFinite(ev.pointerId) ? ev.pointerId : null;
    camera.drag.pointerId = cameraDragPointerId;
    cameraDragLast = { clientX: ev.clientX, clientY: ev.clientY };
    camera.drag.last = cameraDragLast ? { ...cameraDragLast } : null;
    cameraLastManualMoveAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    camera.lastManualMoveAt = cameraLastManualMoveAt;
    if(stage && cameraDragPointerId !== null){
      try {
        stage.setPointerCapture(cameraDragPointerId);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function stopCameraDrag(){
    if(!cameraDragActive){
      return;
    }
    if(stage && cameraDragPointerId !== null){
      try {
        stage.releasePointerCapture(cameraDragPointerId);
      } catch (err) {
        /* ignore */
      }
    }
    cameraDragActive = false;
    camera.drag.active = false;
    cameraDragPointerId = null;
    camera.drag.pointerId = null;
    cameraDragLast = null;
    camera.drag.last = null;
  }

  const DEFAULT_SETTING_HELP = {
    title: 'Settings',
    text: 'Hover a control to learn what it does.'
  };
  let activeSettingHelpSource = null;

  function showSettingHelp(title, text){
    if(!settingHelpEl){
      return;
    }
    const finalTitle = title && title.trim() ? title : DEFAULT_SETTING_HELP.title;
    const finalText = text && text.trim() ? text : DEFAULT_SETTING_HELP.text;
    if(settingHelpTitle){
      settingHelpTitle.textContent = finalTitle;
    }
    if(settingHelpBody){
      settingHelpBody.textContent = finalText;
    }
    settingHelpEl.classList.add('show');
  }

  function hideSettingHelp(source){
    if(source && activeSettingHelpSource && source !== activeSettingHelpSource){
      return;
    }
    activeSettingHelpSource = null;
    if(!settingHelpEl){
      return;
    }
    settingHelpEl.classList.remove('show');
    if(settingHelpTitle){
      settingHelpTitle.textContent = DEFAULT_SETTING_HELP.title;
    }
    if(settingHelpBody){
      settingHelpBody.textContent = DEFAULT_SETTING_HELP.text;
    }
  }

  function deriveSettingHelp(el){
    if(!el || el === settingHelpEl){
      return null;
    }
    let title = el.getAttribute('data-help-title');
    let text = el.getAttribute('data-help-text');
    if(!title){
      if(el.classList.contains('btn') || el.classList.contains('subbtn')){
        const hint = el.querySelector('.hint');
        const raw = el.textContent || '';
        title = raw && hint ? raw.replace(hint.textContent || '', '') : raw;
      } else if(el.classList.contains('formrow')){
        const labelEl = el.querySelector('label');
        if(labelEl){
          title = labelEl.textContent || '';
        }
      } else if(el.classList.contains('subhint')){
        title = el.getAttribute('data-help-title') || 'Tip';
      }
    }
    if(!text){
      if(el.classList.contains('btn') || el.classList.contains('subbtn')){
        const hint = el.querySelector('.hint');
        if(hint && hint.textContent && hint.textContent.trim()){
          text = hint.textContent;
        } else if(el.getAttribute('title')){
          text = el.getAttribute('title');
        }
      } else if(el.classList.contains('formrow')){
        const labelEl = el.querySelector('label');
        if(labelEl && labelEl.getAttribute('data-help-text')){
          text = labelEl.getAttribute('data-help-text');
        } else if(labelEl && labelEl.textContent){
          text = `Adjust ${labelEl.textContent.trim().toLowerCase()}.`;
        }
      } else if(el.classList.contains('subhint')){
        text = el.textContent || '';
      }
    }
    title = title ? title.replace(/\s+/g, ' ').trim() : '';
    text = text ? text.replace(/\s+/g, ' ').trim() : '';
    if(!title && !text){
      return null;
    }
    if(!text){
      text = title;
    }
    return { title, text };
  }

  function attachSettingHelp(el){
    const data = deriveSettingHelp(el);
    if(!data){
      return;
    }
    const show = () => {
      activeSettingHelpSource = el;
      showSettingHelp(data.title, data.text);
    };
    const hide = () => hideSettingHelp(el);
    el.addEventListener('mouseenter', show);
    el.addEventListener('focusin', show);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focusout', hide);
  }

  function initializeSettingHelp(){
    if(!settingHelpEl){
      return;
    }
    if(settingHelpTitle){
      settingHelpTitle.textContent = DEFAULT_SETTING_HELP.title;
    }
    if(settingHelpBody){
      settingHelpBody.textContent = DEFAULT_SETTING_HELP.text;
    }
    if(sidebarEl){
      const targets = sidebarEl.querySelectorAll('.btn, .subbtn, .formrow, .subhint');
      targets.forEach((el) => attachSettingHelp(el));
      sidebarEl.addEventListener('mouseleave', () => hideSettingHelp());
    }
  }

  const SETTINGS_SEARCH_FIELD_WEIGHTS = { title: 5, aliases: 4, tags: 3, path: 2, desc: 1 };
  const SETTINGS_SEARCH_DEBOUNCE_MS = 120;
  const SETTINGS_SEARCH_RECENT_LIMIT = 20;
  const SETTINGS_SEARCH_CACHE_LIMIT = 20;
  const SETTINGS_SEARCH_RESULT_LIMIT = 50;

  const settingsSearchState = {
    docs: [],
    docById: new Map(),
    invertedIndex: new Map(),
    tokenCatalog: new Set(),
    trigramIndex: new Map(),
    queryCache: new Map(),
    cacheOrder: [],
    resultElements: new Map(),
    controlSubscriptions: [],
    open: false,
    activeIndex: -1,
    requestId: 0,
    recentQueries: [],
    lastRenderQuery: '',
    results: [],
    tokens: []
  };

  function normalizeSearchString(str){
    if(typeof str !== 'string'){
      return '';
    }
    return str.normalize('NFKD').toLowerCase();
  }

  function tokenizeSearchText(text){
    const normalized = normalizeSearchString(text);
    if(!normalized){
      return [];
    }
    return normalized.split(/[^a-z0-9]+/).filter(Boolean);
  }

  function parseList(value){
    if(typeof value !== 'string'){
      return [];
    }
    return value.split(/[,;]/).map(part => part.trim()).filter(Boolean);
  }

  function escapeHtml(value){
    if(typeof value !== 'string'){
      return '';
    }
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function findAllOccurrences(haystack, needle){
    const ranges = [];
    if(!haystack || !needle){
      return ranges;
    }
    let index = haystack.indexOf(needle);
    while(index !== -1){
      ranges.push({ start: index, end: index + needle.length });
      index = haystack.indexOf(needle, index + needle.length);
    }
    return ranges;
  }

  function mergeRanges(ranges){
    if(!Array.isArray(ranges) || !ranges.length){
      return [];
    }
    const sorted = ranges.slice().sort((a, b)=> a.start - b.start || a.end - b.end);
    const merged = [];
    for(const range of sorted){
      if(!merged.length){
        merged.push({ start: range.start, end: range.end });
        continue;
      }
      const prev = merged[merged.length - 1];
      if(range.start <= prev.end){
        prev.end = Math.max(prev.end, range.end);
      } else {
        merged.push({ start: range.start, end: range.end });
      }
    }
    return merged;
  }

  function highlightText(text, ranges){
    if(!text){
      return '';
    }
    const merged = mergeRanges(ranges);
    if(!merged.length){
      return escapeHtml(text);
    }
    let cursor = 0;
    let output = '';
    for(const range of merged){
      const start = Math.max(0, range.start);
      const end = Math.min(text.length, range.end);
      if(start > cursor){
        output += escapeHtml(text.slice(cursor, start));
      }
      const slice = text.slice(start, end);
      output += `<span class="settingsSearchHighlight">${escapeHtml(slice)}</span>`;
      cursor = end;
    }
    if(cursor < text.length){
      output += escapeHtml(text.slice(cursor));
    }
    return output;
  }

  function clampNumericForControl(control, value){
    if(!control){
      return value;
    }
    let numeric = Number(value);
    if(!Number.isFinite(numeric)){
      numeric = Number(control.value);
    }
    const minAttr = control.getAttribute('min');
    const maxAttr = control.getAttribute('max');
    if(minAttr !== null){
      const min = Number(minAttr);
      if(Number.isFinite(min)){
        numeric = Math.max(min, numeric);
      }
    }
    if(maxAttr !== null){
      const max = Number(maxAttr);
      if(Number.isFinite(max)){
        numeric = Math.min(max, numeric);
      }
    }
    return numeric;
  }

  function formatSettingValue(doc, value){
    if(value === null || value === undefined){
      return '';
    }
    if(doc.valueTypeNormalized === 'number'){
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return String(value);
      }
      const step = doc.step;
      if(Number.isFinite(step) && step > 0 && step < 1){
        return numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
      }
      if(Math.abs(numeric) >= 1000){
        return Math.round(numeric).toLocaleString();
      }
      return String(Math.round(numeric * 1000) / 1000);
    }
    return String(value);
  }

  function getControlValue(control, valueType){
    if(!control){
      return null;
    }
    const tag = control.tagName;
    if(valueType === 'boolean'){
      const ariaPressed = control.getAttribute('aria-pressed');
      if(ariaPressed === 'true'){ return true; }
      if(ariaPressed === 'false'){ return false; }
      if(control.dataset && typeof control.dataset.active === 'string'){
        return control.dataset.active === 'true';
      }
      return !!control.classList.contains('is-active');
    }
    if(tag === 'SELECT' || tag === 'TEXTAREA'){
      return control.value;
    }
    if(tag === 'INPUT'){
      const type = control.getAttribute('type') || 'text';
      if(type === 'number' || type === 'range'){
        const numeric = Number(control.value);
        return Number.isFinite(numeric) ? numeric : null;
      }
      if(type === 'text' || type === 'color'){
        return control.value;
      }
    }
    if(tag === 'BUTTON'){
      return control.textContent || '';
    }
    return control.value;
  }

  function setControlValue(control, value, valueType, { commit = false } = {}){
    if(!control){
      return;
    }
    if(valueType === 'number'){
      const clamped = clampNumericForControl(control, value);
      control.value = String(clamped);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      if(commit){
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    if(valueType === 'boolean'){
      control.click();
      return;
    }
    control.value = String(value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
    if(commit){
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function deriveGroupTitle(pane){
    if(!pane){
      return 'Settings';
    }
    const category = pane.closest('.sidebar-category');
    const categoryHeading = category ? category.querySelector('.sidebar-category__title') : null;
    const categoryTitle = categoryHeading && categoryHeading.textContent
      ? categoryHeading.textContent.replace(/\s+/g, ' ').trim()
      : '';
    if(pane.dataset && pane.dataset.settingGroup){
      const base = pane.dataset.settingGroup.trim();
      if(categoryTitle && base && base !== categoryTitle){
        return `${categoryTitle} › ${base}`;
      }
      return base || categoryTitle || 'Settings';
    }
    let sibling = pane.previousElementSibling;
    let groupTitle = '';
    while(sibling){
      if(sibling.classList && sibling.classList.contains('btn')){
        const help = deriveSettingHelp(sibling);
        if(help && help.title){
          groupTitle = help.title;
          break;
        }
        const raw = sibling.textContent || '';
        if(raw.trim()){
          groupTitle = raw.replace(/\s+/g, ' ').trim();
          break;
        }
      }
      sibling = sibling.previousElementSibling;
    }
    if(!groupTitle){
      groupTitle = categoryTitle || 'Settings';
    }
    if(categoryTitle && groupTitle && groupTitle !== categoryTitle && !groupTitle.startsWith(`${categoryTitle} ›`)){
      return `${categoryTitle} › ${groupTitle}`;
    }
    return groupTitle || 'Settings';
  }

  function sanitizeSettingId(id, fallbackIndex){
    if(id && typeof id === 'string'){
      const trimmed = id.trim();
      if(trimmed){
        return trimmed;
      }
    }
    return `setting.${fallbackIndex}`;
  }

  function registerDocToken(doc, token, field){
    if(!token){
      return;
    }
    if(!doc.tokenFieldMap){
      doc.tokenFieldMap = new Map();
    }
    if(!doc.tokenFieldMap.has(token)){
      doc.tokenFieldMap.set(token, new Set());
    }
    doc.tokenFieldMap.get(token).add(field);
    if(!doc.allTokens){
      doc.allTokens = new Set();
    }
    doc.allTokens.add(token);
  }

  function collectSettingsDocuments(){
    const documents = [];
    const panes = document.querySelectorAll('.submenu');
    panes.forEach((pane)=>{
      const groupTitle = deriveGroupTitle(pane);
      const scope = pane.dataset && pane.dataset.settingScope ? pane.dataset.settingScope : 'global';
      const rows = pane.querySelectorAll('.formrow');
      rows.forEach((row)=>{
        if(row.dataset && row.dataset.settingIgnore === 'true'){
          return;
        }
        const controlSelector = row.dataset && row.dataset.settingControl
          ? `#${CSS.escape(row.dataset.settingControl)}`
          : 'input:not([type="file"]):not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]), select, textarea';
        let control = null;
        if(row.dataset && row.dataset.settingControl){
          control = row.querySelector(controlSelector);
        }
        if(!control){
          const candidates = row.querySelectorAll(controlSelector);
          for(const candidate of candidates){
            if(candidate && candidate.id){
              control = candidate;
              break;
            }
            control = candidate;
          }
        }
        if(!control){
          return;
        }
        if(control.tagName === 'INPUT'){
          const type = control.getAttribute('type');
          if(type === 'file' || type === 'hidden' || type === 'radio' || type === 'checkbox' || type === 'button'){
            return;
          }
        }
        const rowId = row.dataset && row.dataset.settingId ? row.dataset.settingId : null;
        const controlId = control.dataset && control.dataset.settingId ? control.dataset.settingId : null;
        const rawId = rowId || controlId || control.id || row.id;
        const docId = sanitizeSettingId(rawId, documents.length);
        if(settingsSearchState.docById.has(docId)){
          return;
        }
        const help = deriveSettingHelp(row) || deriveSettingHelp(control) || deriveSettingHelp(pane);
        const title = (row.dataset && row.dataset.settingTitle) || (help && help.title) || (row.querySelector('label') ? (row.querySelector('label').textContent || '').trim() : docId);
        const desc = (row.dataset && row.dataset.settingDesc) || (help && help.text) || '';
        const section = row.dataset && row.dataset.settingSection ? row.dataset.settingSection : '';
        const basePath = pane.dataset && pane.dataset.settingPath ? pane.dataset.settingPath : groupTitle;
        const path = section ? `${basePath}  ${section}` : basePath;
        let valueType = (row.dataset && row.dataset.settingType) || (control.dataset && control.dataset.settingType) || '';
        valueType = valueType ? valueType.toLowerCase() : '';
        if(!valueType){
          const tagName = control.tagName;
          if(tagName === 'SELECT'){
            valueType = 'enum';
          } else if(tagName === 'TEXTAREA'){
            valueType = 'string';
          } else if(tagName === 'INPUT'){
            const typeAttr = control.getAttribute('type');
            if(typeAttr === 'number' || typeAttr === 'range'){
              valueType = 'number';
            } else if(typeAttr === 'color'){
              valueType = 'color';
            } else {
              valueType = 'string';
            }
          } else if(tagName === 'BUTTON'){
            valueType = 'action';
          } else {
            valueType = 'string';
          }
        }
        const tags = parseList((row.dataset && row.dataset.settingTags) || '');
        const aliases = parseList((row.dataset && row.dataset.settingAliases) || '');
        const defaultValueAttr = row.dataset && row.dataset.settingDefault ? row.dataset.settingDefault : control.getAttribute('data-default');
        let defaultValue = null;
        if(defaultValueAttr !== null && defaultValueAttr !== undefined){
          if(valueType === 'number'){
            const numeric = Number(defaultValueAttr);
            defaultValue = Number.isFinite(numeric) ? numeric : null;
          } else if(valueType === 'boolean'){
            defaultValue = defaultValueAttr === 'true' || defaultValueAttr === '1';
          } else {
            defaultValue = defaultValueAttr;
          }
        } else {
          defaultValue = getControlValue(control, valueType);
        }
        const doc = {
          id: docId,
          title: title && title.trim() ? title.trim() : docId,
          desc: desc && desc.trim() ? desc.trim() : '',
          path,
          valueType,
          tags: tags.map(tag => tag.toLowerCase()),
          aliases,
          default: defaultValue,
          scope: (row.dataset && row.dataset.settingScope) || scope,
          isExperimental: row.dataset && row.dataset.settingExperimental === 'true',
          element: row,
          control,
          min: control.getAttribute('min') !== null ? Number(control.getAttribute('min')) : null,
          max: control.getAttribute('max') !== null ? Number(control.getAttribute('max')) : null,
          step: control.getAttribute('step') !== null && control.getAttribute('step') !== 'any' ? Number(control.getAttribute('step')) : null,
          currentValue: getControlValue(control, valueType)
        };
        documents.push(doc);
      });
    });
    return documents;
  }

  function decorateSettingDoc(doc, index){
    doc.index = index;
    doc.valueTypeNormalized = doc.valueType ? doc.valueType.toLowerCase() : 'string';
    doc.scopeNormalized = doc.scope ? doc.scope.toLowerCase() : 'global';
    doc.titleNormalized = normalizeSearchString(doc.title);
    doc.descNormalized = normalizeSearchString(doc.desc);
    doc.pathNormalized = normalizeSearchString(doc.path);
    doc.aliasTokens = doc.aliases.flatMap(tokenizeSearchText);
    doc.tagTokens = doc.tags.map(tag => normalizeSearchString(tag));
    doc.idTokens = tokenizeSearchText(doc.id.replace(/\./g, ' '));
    doc.pathDepth = doc.path && doc.path.includes('') ? doc.path.split('').length : (doc.path ? 1 : 0);
    doc.tokenFieldMap = new Map();
    doc.allTokens = new Set();
    tokenizeSearchText(doc.title).forEach(token => registerDocToken(doc, token, 'title'));
    tokenizeSearchText(doc.desc).forEach(token => registerDocToken(doc, token, 'desc'));
    tokenizeSearchText(doc.path).forEach(token => registerDocToken(doc, token, 'path'));
    doc.aliasTokens.forEach(token => registerDocToken(doc, token, 'aliases'));
    doc.tagTokens.forEach(token => registerDocToken(doc, token, 'tags'));
    doc.idTokens.forEach(token => registerDocToken(doc, token, 'aliases'));
    doc.usageCount = doc.usageCount || 0;
    doc.lastUsedAt = doc.lastUsedAt || 0;
  }

  function registerTrigrams(token){
    if(!token){
      return;
    }
    const normalized = token.toLowerCase();
    if(normalized.length < 3){
      if(!settingsSearchState.trigramIndex.has(normalized)){
        settingsSearchState.trigramIndex.set(normalized, new Set());
      }
      settingsSearchState.trigramIndex.get(normalized).add(normalized);
      return;
    }
    for(let i = 0; i <= normalized.length - 3; i++){
      const tri = normalized.slice(i, i + 3);
      if(!settingsSearchState.trigramIndex.has(tri)){
        settingsSearchState.trigramIndex.set(tri, new Set());
      }
      settingsSearchState.trigramIndex.get(tri).add(normalized);
    }
  }

  function buildSettingsSearchIndex(){
    settingsSearchState.invertedIndex.clear();
    settingsSearchState.tokenCatalog.clear();
    settingsSearchState.trigramIndex.clear();
    settingsSearchState.docs.forEach((doc, index)=>{
      decorateSettingDoc(doc, index);
      doc.allTokens.forEach((token)=>{
        settingsSearchState.tokenCatalog.add(token);
        registerTrigrams(token);
        if(!settingsSearchState.invertedIndex.has(token)){
          settingsSearchState.invertedIndex.set(token, new Set());
        }
        settingsSearchState.invertedIndex.get(token).add(index);
      });
    });
  }

  function buildTrigramsForQuery(token){
    const normalized = token.toLowerCase();
    if(normalized.length < 3){
      return [normalized];
    }
    const trigrams = [];
    for(let i = 0; i <= normalized.length - 3; i++){
      trigrams.push(normalized.slice(i, i + 3));
    }
    return trigrams;
  }

  function findFuzzyTokens(token){
    const normalized = token.toLowerCase();
    if(normalized.length < 5){
      return [];
    }
    const candidates = new Set();
    const trigrams = buildTrigramsForQuery(normalized);
    trigrams.forEach((tri)=>{
      const bucket = settingsSearchState.trigramIndex.get(tri);
      if(bucket){
        bucket.forEach((candidate)=> candidates.add(candidate));
      }
    });
    if(!candidates.size || candidates.size > settingsSearchState.tokenCatalog.size){
      settingsSearchState.tokenCatalog.forEach(tokenValue => candidates.add(tokenValue));
    }
    const matches = [];
    candidates.forEach((candidate)=>{
      if(Math.abs(candidate.length - normalized.length) > 2){
        return;
      }
      let distance = 0;
      const dp = Array(normalized.length + 1);
      for(let i = 0; i <= normalized.length; i++){
        dp[i] = i;
      }
      for(let j = 1; j <= candidate.length; j++){
        let prev = dp[0];
        dp[0] = j;
        for(let i = 1; i <= normalized.length; i++){
          const temp = dp[i];
          if(normalized[i - 1] === candidate[j - 1]){
            dp[i] = prev;
          } else {
            dp[i] = Math.min(prev + 1, dp[i] + 1, dp[i - 1] + 1);
          }
          prev = temp;
        }
      }
      distance = dp[normalized.length];
      if(distance <= 1){
        matches.push({ token: candidate, distance });
      }
    });
    return matches;
  }

  function parseSearchQuery(query){
    const raw = typeof query === 'string' ? query : '';
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    const filters = { type: '', scope: '', tags: [], experimental: null };
    const tokens = [];
    parts.forEach((part)=>{
      const idx = part.indexOf(':');
      if(idx > 0){
        const key = part.slice(0, idx).toLowerCase();
        const value = part.slice(idx + 1).toLowerCase();
        if(key === 'type' || key === 'value' || key === 'kind'){
          filters.type = value;
          return;
        }
        if(key === 'scope'){ filters.scope = value; return; }
        if(key === 'tag' || key === 'tags'){ filters.tags.push(value); return; }
        if(key === 'experimental'){
          filters.experimental = value === 'true' || value === '1';
          return;
        }
      }
      tokens.push(part);
    });
    const normalizedTokens = tokens.flatMap(tokenizeSearchText);
    return { raw, tokens: normalizedTokens, filters };
  }

  function gatherCandidateDocs(tokens){
    const indices = new Set();
    const fuzzyMatches = new Map();
    tokens.forEach((token)=>{
      const bucket = settingsSearchState.invertedIndex.get(token);
      if(bucket && bucket.size){
        bucket.forEach((index)=> indices.add(index));
        return;
      }
      const fuzzy = findFuzzyTokens(token);
      if(fuzzy.length){
        fuzzyMatches.set(token, fuzzy);
        fuzzy.forEach((entry)=>{
          const fuzzyBucket = settingsSearchState.invertedIndex.get(entry.token);
          if(fuzzyBucket){
            fuzzyBucket.forEach((index)=> indices.add(index));
          }
        });
      }
    });
    if(!indices.size){
      settingsSearchState.docs.forEach((_, index)=> indices.add(index));
    }
    return { indices: Array.from(indices), fuzzyMatches };
  }

  function passesFilters(doc, filters){
    if(!filters){
      return true;
    }
    if(filters.type){
      const type = filters.type.toLowerCase();
      if(doc.valueTypeNormalized !== type){
        if(type === 'boolean' && doc.valueTypeNormalized !== 'boolean'){ return false; }
        else if(type === 'number' && doc.valueTypeNormalized !== 'number'){ return false; }
        else if(type === 'string' && doc.valueTypeNormalized !== 'string'){ return false; }
        else if(type === 'enum' && doc.valueTypeNormalized !== 'enum'){ return false; }
      }
    }
    if(filters.scope){
      const scope = filters.scope.toLowerCase();
      if(doc.scopeNormalized !== scope){
        return false;
      }
    }
    if(filters.tags && filters.tags.length){
      for(const tag of filters.tags){
        if(!doc.tagTokens.includes(tag.toLowerCase())){
          return false;
        }
      }
    }
    if(filters.experimental !== null){
      if(Boolean(doc.isExperimental) !== Boolean(filters.experimental)){
        return false;
      }
    }
    return true;
  }

  function weightForFields(fieldSet){
    if(!fieldSet || !fieldSet.size){
      return 0;
    }
    let weight = 0;
    fieldSet.forEach((field)=>{
      const fieldWeight = SETTINGS_SEARCH_FIELD_WEIGHTS[field] || 0;
      if(fieldWeight > weight){
        weight = fieldWeight;
      }
    });
    return weight;
  }

  function computeUsageBoost(doc){
    if(!doc || !doc.usageCount){
      return 0;
    }
    return Math.min(6, Math.log2(doc.usageCount + 1) * 1.5);
  }

  function computeRecencyBoost(doc){
    if(!doc || !doc.lastUsedAt){
      return 0;
    }
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const seconds = Math.max(0, (now - doc.lastUsedAt) / 1000);
    if(seconds < 5){ return 6; }
    if(seconds < 30){ return 4; }
    if(seconds < 120){ return 2; }
    if(seconds < 600){ return 1; }
    return 0;
  }

  function scoreDoc(doc, tokens, fuzzyMatches){
    let score = 0;
    const titleRanges = [];
    const descRanges = [];
    let exactMatchCount = 0;
    const consideredTokens = tokens.length ? tokens : Array.from(doc.allTokens || []);
    for(const token of consideredTokens){
      const hasToken = doc.allTokens && doc.allTokens.has(token);
      if(hasToken){
        const fields = doc.tokenFieldMap.get(token) || new Set();
        const weight = weightForFields(fields);
        if(weight){
          score += weight;
        }
        if(fields.has('title')){
          titleRanges.push(...findAllOccurrences(doc.titleNormalized, token));
        }
        if(fields.has('desc')){
          descRanges.push(...findAllOccurrences(doc.descNormalized, token));
        }
        exactMatchCount += 1;
        continue;
      }
      const fuzzyForToken = fuzzyMatches.get(token);
      if(fuzzyForToken){
        for(const match of fuzzyForToken){
          if(doc.allTokens && doc.allTokens.has(match.token)){
            const fields = doc.tokenFieldMap.get(match.token) || new Set();
            const weight = weightForFields(fields);
            if(weight){
              score += weight * 0.65;
            }
            if(fields.has('title')){
              titleRanges.push(...findAllOccurrences(doc.titleNormalized, match.token));
            }
            if(fields.has('desc')){
              descRanges.push(...findAllOccurrences(doc.descNormalized, match.token));
            }
            break;
          }
        }
      }
    }
    score += computeUsageBoost(doc);
    score += computeRecencyBoost(doc);
    if(exactMatchCount){
      score += exactMatchCount * 0.5;
    }
    return { score, titleRanges: mergeRanges(titleRanges), descRanges: mergeRanges(descRanges) };
  }

  function buildFacetsFromDocs(documents){
    const facets = { tags: new Map(), types: new Map(), scopes: new Map() };
    documents.forEach((doc)=>{
      doc.tags.forEach((tag)=>{
        const key = tag.toLowerCase();
        facets.tags.set(key, (facets.tags.get(key) || 0) + 1);
      });
      const type = doc.valueTypeNormalized || 'string';
      facets.types.set(type, (facets.types.get(type) || 0) + 1);
      const scope = doc.scopeNormalized || 'global';
      facets.scopes.set(scope, (facets.scopes.get(scope) || 0) + 1);
    });
    const toArray = (map, labelTransform = (value)=> value) => Array.from(map.entries())
      .sort((a, b)=> b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([value, count])=> ({ value, label: labelTransform(value), count }));
    return {
      tags: toArray(facets.tags, (value)=> value.replace(/\b\w/g, (m)=> m.toUpperCase())),
      types: toArray(facets.types, (value)=> value.charAt(0).toUpperCase() + value.slice(1)),
      scopes: toArray(facets.scopes, (value)=> value.charAt(0).toUpperCase() + value.slice(1))
    };
  }

  function computeDidYouMean(parsed, fuzzyMatches){
    if(!parsed || !parsed.tokens.length){
      return null;
    }
    const suggestions = [];
    let changed = false;
    parsed.tokens.forEach((token)=>{
      const fuzzies = fuzzyMatches.get(token);
      if(fuzzies && fuzzies.length){
        const best = fuzzies.reduce((winner, entry)=>{
          if(!winner || entry.distance < winner.distance){
            return entry;
          }
          return winner;
        }, null);
        if(best && best.token){
          suggestions.push(best.token);
          if(best.token !== token){
            changed = true;
          }
          return;
        }
      }
      suggestions.push(token);
    });
    if(!changed){
      return null;
    }
    return suggestions.join(' ');
  }

  function searchSettings(query, opts = {}){
    const limit = Number.isFinite(opts.limit) ? opts.limit : SETTINGS_SEARCH_RESULT_LIMIT;
    const cacheKey = normalizeSearchString(query);
    let parsed = settingsSearchState.queryCache.get(cacheKey);
    if(!parsed){
      parsed = parseSearchQuery(query || '');
      settingsSearchState.queryCache.set(cacheKey, parsed);
      settingsSearchState.cacheOrder.unshift(cacheKey);
      if(settingsSearchState.cacheOrder.length > SETTINGS_SEARCH_CACHE_LIMIT){
        const staleKey = settingsSearchState.cacheOrder.pop();
        settingsSearchState.queryCache.delete(staleKey);
      }
    } else {
      const index = settingsSearchState.cacheOrder.indexOf(cacheKey);
      if(index >= 0){
        settingsSearchState.cacheOrder.splice(index, 1);
      }
      settingsSearchState.cacheOrder.unshift(cacheKey);
    }

    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const { indices, fuzzyMatches } = gatherCandidateDocs(parsed.tokens);
    const hits = [];
    indices.forEach((index)=>{
      const doc = settingsSearchState.docs[index];
      if(!doc){
        return;
      }
      if(!passesFilters(doc, parsed.filters)){
        return;
      }
      const { score, titleRanges, descRanges } = scoreDoc(doc, parsed.tokens, fuzzyMatches);
      if(parsed.tokens.length && score <= 0){
        return;
      }
      hits.push({
        doc,
        score,
        titleRanges,
        descRanges
      });
    });
    hits.sort((a, b)=>{
      if(b.score !== a.score){
        return b.score - a.score;
      }
      if(a.doc.pathDepth !== b.doc.pathDepth){
        return a.doc.pathDepth - b.doc.pathDepth;
      }
      return a.doc.title.localeCompare(b.doc.title);
    });
    const total = hits.length;
    const limited = hits.slice(0, Math.max(1, limit)).map((entry, rank)=> ({
      id: entry.doc.id,
      title: entry.doc.title,
      desc: entry.doc.desc,
      path: entry.doc.path,
      valueType: entry.doc.valueType,
      scope: entry.doc.scope,
      tags: entry.doc.tags.slice(),
      isExperimental: entry.doc.isExperimental,
      score: entry.score,
      highlight: { title: entry.titleRanges, desc: entry.descRanges },
      deepLink: `/settings#${encodeURIComponent(entry.doc.id)}`,
      rank: rank + 1,
      doc: entry.doc
    }));
    const facets = buildFacetsFromDocs(hits.map(hit => hit.doc));
    const elapsedMs = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0;
    const didYouMean = total === 0 ? computeDidYouMean(parsed, fuzzyMatches) : null;
    return { results: limited, total, facets, didYouMean, elapsedMs, tokens: parsed.tokens, filters: parsed.filters, raw: parsed.raw };
  }

  window.searchSettings = searchSettings;

  function disposeSettingsControlSubscriptions(){
    settingsSearchState.controlSubscriptions.forEach((sub)=>{
      if(sub.control){
        if(sub.input){ sub.control.removeEventListener('input', sub.input); }
        if(sub.change){ sub.control.removeEventListener('change', sub.change); }
      }
    });
    settingsSearchState.controlSubscriptions.length = 0;
  }

  function markSettingUsed(doc, { trackUsage = true } = {}){
    if(!doc){
      return;
    }
    if(trackUsage){
      doc.usageCount = (doc.usageCount || 0) + 1;
    }
    doc.lastUsedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function attachSettingsControlSubscriptions(){
    disposeSettingsControlSubscriptions();
    settingsSearchState.docs.forEach((doc)=>{
      const control = doc.control;
      if(!control){
        return;
      }
      const handleInput = ()=>{
        doc.currentValue = getControlValue(control, doc.valueTypeNormalized);
        updateSearchResultValue(doc);
      };
      const handleChange = ()=>{
        doc.currentValue = getControlValue(control, doc.valueTypeNormalized);
        markSettingUsed(doc);
        updateSearchResultValue(doc);
      };
      control.addEventListener('input', handleInput);
      control.addEventListener('change', handleChange);
      settingsSearchState.controlSubscriptions.push({ control, input: handleInput, change: handleChange });
    });
  }

  function rebuildSettingsSearchIndex(){
    settingsSearchState.docs = collectSettingsDocuments();
    settingsSearchState.docById.clear();
    settingsSearchState.docs.forEach((doc)=>{
      settingsSearchState.docById.set(doc.id, doc);
    });
    buildSettingsSearchIndex();
    attachSettingsControlSubscriptions();
  }

  function ensureRecentQueriesContains(query){
    const trimmed = (query || '').trim();
    if(!trimmed){
      return;
    }
    const lower = trimmed.toLowerCase();
    const index = settingsSearchState.recentQueries.findIndex((entry)=> entry.toLowerCase() === lower);
    if(index >= 0){
      settingsSearchState.recentQueries.splice(index, 1);
    }
    settingsSearchState.recentQueries.unshift(trimmed);
    if(settingsSearchState.recentQueries.length > SETTINGS_SEARCH_RECENT_LIMIT){
      settingsSearchState.recentQueries.length = SETTINGS_SEARCH_RECENT_LIMIT;
    }
  }

  function updateSearchResultValue(doc){
    const entry = settingsSearchState.resultElements.get(doc.id);
    if(!entry){
      return;
    }
    if(entry.slider){
      const value = doc.currentValue;
      if(value !== null && value !== undefined){
        entry.slider.value = String(value);
      }
    }
    if(entry.number){
      const value = doc.currentValue;
      if(value !== null && value !== undefined){
        entry.number.value = String(value);
      }
    }
    if(entry.valueLabel){
      entry.valueLabel.textContent = formatSettingValue(doc, doc.currentValue);
    }
  }

  let settingsSearchDebounceHandle = null;
  let settingsSearchPreviousFocus = null;

  function renderSettingsFacets(facets){
    if(!settingsSearchFacetsEl){
      return;
    }
    settingsSearchFacetsEl.innerHTML = '';
    if(!facets){
      return;
    }
    const createChip = (label, kind, value, count)=>{
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'settingsSearchFacet';
      chip.dataset.kind = kind;
      chip.dataset.value = value;
      chip.innerHTML = `${escapeHtml(label)}<span aria-hidden="true">  ${count}</span>`;
      chip.addEventListener('click', ()=> applyFacetFilter(kind, value));
      return chip;
    };
    const fragment = document.createDocumentFragment();
    (facets.tags || []).forEach(entry => fragment.appendChild(createChip(entry.label, 'tag', entry.value, entry.count)));
    (facets.types || []).forEach(entry => fragment.appendChild(createChip(entry.label, 'type', entry.value, entry.count)));
    (facets.scopes || []).forEach(entry => fragment.appendChild(createChip(entry.label, 'scope', entry.value, entry.count)));
    settingsSearchFacetsEl.appendChild(fragment);
  }

  function renderSettingsRecents(){
    if(!settingsSearchRecentsEl){
      return;
    }
    settingsSearchRecentsEl.innerHTML = '';
    if(!settingsSearchState.recentQueries.length){
      return;
    }
    const fragment = document.createDocumentFragment();
    settingsSearchState.recentQueries.slice(0, 6).forEach((query)=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settingsSearchRecentQuery';
      btn.textContent = query;
      btn.addEventListener('click', ()=>{
        if(settingsSearchInput){
          settingsSearchInput.value = query;
          scheduleSettingsSearch(query);
          settingsSearchInput.focus();
        }
      });
      fragment.appendChild(btn);
    });
    settingsSearchRecentsEl.appendChild(fragment);
  }

  function renderSettingsSearchResults(payload){
    if(!settingsSearchResultsEl || !settingsSearchEmptyEl || !settingsSearchStatusEl){
      return;
    }
    settingsSearchState.results = payload.results || [];
    settingsSearchState.tokens = payload.tokens || [];
    settingsSearchState.resultElements.clear();
    settingsSearchResultsEl.innerHTML = '';
    const listFragment = document.createDocumentFragment();
    if(settingsSearchInput){
      settingsSearchInput.setAttribute('aria-expanded', settingsSearchState.results.length ? 'true' : 'false');
    }
    if(settingsSearchState.results.length){
      settingsSearchEmptyEl.hidden = true;
      settingsSearchResultsEl.removeAttribute('hidden');
      settingsSearchState.results.forEach((hit)=>{
        const doc = hit.doc;
        const option = document.createElement('div');
        option.className = 'settingsSearchResult';
        const optionId = `settingsSearchOption-${doc.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
        option.id = optionId;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.dataset.docId = doc.id;
        const main = document.createElement('div');
        main.className = 'settingsSearchResultMain';
        const title = document.createElement('div');
        title.className = 'settingsSearchResultTitle';
        title.innerHTML = highlightText(doc.title, hit.highlight && hit.highlight.title || []);
        const path = document.createElement('div');
        path.className = 'settingsSearchResultPath';
        path.textContent = doc.path;
        const desc = document.createElement('div');
        desc.className = 'settingsSearchResultDesc';
        const descText = doc.desc || '';
        desc.innerHTML = highlightText(descText.length > 240 ? `${descText.slice(0, 237)}` : descText, hit.highlight && hit.highlight.desc || []);
        main.appendChild(title);
        main.appendChild(path);
        if(descText){
          main.appendChild(desc);
        }
        const action = document.createElement('div');
        action.className = 'settingsSearchResultAction';
        const valueLabel = document.createElement('span');
        valueLabel.className = 'settingsSearchResultValue';
        valueLabel.textContent = formatSettingValue(doc, doc.currentValue);
        action.appendChild(valueLabel);
        let slider = null;
        let number = null;
        if(doc.valueTypeNormalized === 'number' && doc.min !== null && doc.max !== null){
          slider = document.createElement('input');
          slider.type = 'range';
          slider.className = 'settingsSearchResultSlider';
          slider.min = Number.isFinite(doc.min) ? String(doc.min) : '0';
          slider.max = Number.isFinite(doc.max) ? String(doc.max) : '100';
          if(Number.isFinite(doc.step) && doc.step > 0){
            slider.step = String(doc.step);
          }
          if(doc.currentValue !== null && doc.currentValue !== undefined){
            slider.value = String(doc.currentValue);
          }
          number = document.createElement('input');
          number.type = 'number';
          number.className = 'settingsSearchResultNumber';
          if(Number.isFinite(doc.min)) number.min = String(doc.min);
          if(Number.isFinite(doc.max)) number.max = String(doc.max);
          if(Number.isFinite(doc.step) && doc.step > 0) number.step = String(doc.step);
          if(doc.currentValue !== null && doc.currentValue !== undefined){
            number.value = String(doc.currentValue);
          }
          slider.addEventListener('input', ()=>{
            number.value = slider.value;
            setControlValue(doc.control, slider.value, 'number');
            doc.currentValue = getControlValue(doc.control, 'number');
            valueLabel.textContent = formatSettingValue(doc, doc.currentValue);
          });
          slider.addEventListener('change', ()=>{
            setControlValue(doc.control, slider.value, 'number', { commit: true });
            doc.currentValue = getControlValue(doc.control, 'number');
            markSettingUsed(doc);
            valueLabel.textContent = formatSettingValue(doc, doc.currentValue);
          });
          number.addEventListener('change', ()=>{
            const numeric = clampNumericForControl(doc.control, number.value);
            slider.value = String(numeric);
            number.value = String(numeric);
            setControlValue(doc.control, numeric, 'number', { commit: true });
            doc.currentValue = getControlValue(doc.control, 'number');
            markSettingUsed(doc);
            valueLabel.textContent = formatSettingValue(doc, doc.currentValue);
          });
          action.appendChild(slider);
          action.appendChild(number);
        } else if(doc.valueTypeNormalized === 'boolean'){
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'settingsSearchResultToggle';
          const setLabel = ()=>{
            const current = getControlValue(doc.control, 'boolean');
            toggleBtn.textContent = current ? 'Turn off' : 'Turn on';
          };
          setLabel();
          toggleBtn.addEventListener('click', ()=>{
            setControlValue(doc.control, null, 'boolean', { commit: true });
            doc.currentValue = getControlValue(doc.control, 'boolean');
            markSettingUsed(doc);
            setLabel();
            valueLabel.textContent = formatSettingValue(doc, doc.currentValue);
          });
          action.appendChild(toggleBtn);
        } else {
          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'settingsSearchResultToggle';
          openBtn.textContent = 'Open';
          openBtn.addEventListener('click', ()=>{
            activateSettingsSearchResultByDocId(doc.id, { toggle: false });
          });
          action.appendChild(openBtn);
        }
        option.appendChild(main);
        option.appendChild(action);
        option.addEventListener('mouseenter', ()=>{
          const idx = settingsSearchState.results.findIndex(entry => entry.doc.id === doc.id);
          if(idx >= 0){
            setSettingsSearchActive(idx);
          }
        });
        option.addEventListener('click', (ev)=>{
          ev.preventDefault();
          const idx = settingsSearchState.results.findIndex(entry => entry.doc.id === doc.id);
          if(idx >= 0){
            activateSettingsSearchResult(idx, { toggle: ev.altKey });
          }
        });
        settingsSearchState.resultElements.set(doc.id, { element: option, slider, number, valueLabel });
        listFragment.appendChild(option);
      });
      settingsSearchResultsEl.appendChild(listFragment);
      setSettingsSearchActive(0);
    } else {
      settingsSearchResultsEl.setAttribute('hidden', 'true');
      settingsSearchEmptyEl.hidden = false;
      settingsSearchEmptyPrimary.textContent = 'No settings found.';
      settingsSearchEmptySecondary.innerHTML = '';
      if(payload.didYouMean){
        const span = document.createElement('span');
        span.textContent = 'Did you mean';
        const suggestion = document.createElement('button');
        suggestion.type = 'button';
        suggestion.className = 'settingsSearchResultToggle';
        suggestion.textContent = payload.didYouMean;
        suggestion.addEventListener('click', ()=>{
          if(settingsSearchInput){
            settingsSearchInput.value = payload.didYouMean;
            scheduleSettingsSearch(payload.didYouMean);
            settingsSearchInput.focus();
          }
        });
        settingsSearchEmptySecondary.appendChild(span);
        settingsSearchEmptySecondary.appendChild(document.createTextNode(' '));
        settingsSearchEmptySecondary.appendChild(suggestion);
        settingsSearchEmptySecondary.appendChild(document.createTextNode('?'));
      } else {
        settingsSearchEmptySecondary.textContent = 'Try a different keyword or add a filter such as tag:camera.';
      }
    }
    const summary = payload.total ? `${Math.min(payload.results.length, payload.total)} of ${payload.total} results` : '0 results';
    const timing = Number.isFinite(payload.elapsedMs) ? `  ${Math.max(0, Math.round(payload.elapsedMs)).toLocaleString()}ms` : '';
    settingsSearchStatusEl.textContent = `${summary}${timing}`;
    settingsSearchState.lastRenderQuery = payload.raw || (settingsSearchInput ? settingsSearchInput.value : '');
    renderSettingsFacets(payload.facets);
    renderSettingsRecents();
  }

  function applyFacetFilter(kind, value){
    if(!settingsSearchInput){
      return;
    }
    let filter = '';
    if(kind === 'tag'){ filter = `tag:${value}`; }
    else if(kind === 'type'){ filter = `type:${value}`; }
    else if(kind === 'scope'){ filter = `scope:${value}`; }
    if(!filter){
      return;
    }
    const base = settingsSearchInput.value.trim();
    const next = base ? `${base} ${filter}` : filter;
    settingsSearchInput.value = next;
    scheduleSettingsSearch(next);
    settingsSearchInput.focus();
  }

  function setSettingsSearchActive(index){
    if(!settingsSearchState.results.length){
      settingsSearchState.activeIndex = -1;
      if(settingsSearchInput){
        settingsSearchInput.setAttribute('aria-activedescendant', '');
      }
      return;
    }
    const clamped = Math.max(0, Math.min(settingsSearchState.results.length - 1, index));
    settingsSearchState.activeIndex = clamped;
    settingsSearchState.results.forEach((hit, idx)=>{
      const entry = settingsSearchState.resultElements.get(hit.doc.id);
      if(entry && entry.element){
        if(idx === clamped){
          entry.element.setAttribute('aria-selected', 'true');
          if(settingsSearchInput){
            settingsSearchInput.setAttribute('aria-activedescendant', entry.element.id);
          }
          entry.element.scrollIntoView({ block: 'nearest' });
        } else {
          entry.element.setAttribute('aria-selected', 'false');
        }
      }
    });
  }

  function moveSettingsSearchActive(delta){
    if(!settingsSearchState.results.length){
      return;
    }
    const nextIndex = settingsSearchState.activeIndex + delta;
    if(nextIndex < 0){
      setSettingsSearchActive(settingsSearchState.results.length - 1);
    } else if(nextIndex >= settingsSearchState.results.length){
      setSettingsSearchActive(0);
    } else {
      setSettingsSearchActive(nextIndex);
    }
  }

  function activateSettingsSearchResultByDocId(docId, { toggle = false } = {}){
    const index = settingsSearchState.results.findIndex(hit => hit.doc.id === docId);
    if(index >= 0){
      activateSettingsSearchResult(index, { toggle });
    }
  }

  function activateSettingsSearchResult(index, { toggle = false } = {}){
    if(index < 0 || index >= settingsSearchState.results.length){
      return;
    }
    const hit = settingsSearchState.results[index];
    ensureRecentQueriesContains(settingsSearchInput ? settingsSearchInput.value : '');
    renderSettingsRecents();
    openSettingFromSearch(hit, { toggle });
  }

  function openSettingFromSearch(hit, { toggle = false } = {}){
    if(!hit || !hit.doc){
      return;
    }
    const doc = hit.doc;
    if(toggle && doc.valueTypeNormalized === 'boolean'){
      setControlValue(doc.control, null, 'boolean', { commit: true });
      doc.currentValue = getControlValue(doc.control, 'boolean');
      markSettingUsed(doc);
      updateSearchResultValue(doc);
      return;
    }
    setMenuState('expanded');
    const pane = doc.element ? doc.element.closest('.submenu') : null;
    if(pane){
      pane.classList.add('open');
      const trigger = pane.previousElementSibling;
      if(trigger && trigger.classList && trigger.classList.contains('btn')){
        trigger.setAttribute('aria-expanded', 'true');
      }
    }
    if(doc.element && typeof doc.element.scrollIntoView === 'function'){
      doc.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if(doc.control && typeof doc.control.focus === 'function'){
      doc.control.focus({ preventScroll: true });
    }
    markSettingUsed(doc);
    const help = deriveSettingHelp(doc.element) || deriveSettingHelp(doc.control);
    if(help){
      showSettingHelp(help.title, help.text);
    }
    closeSettingsSearch({ restoreFocus: false });
  }

  function closeSettingsSearch({ restoreFocus = true } = {}){
    if(!settingsSearchOverlay){
      return;
    }
    if(settingsSearchDebounceHandle){
      clearTimeout(settingsSearchDebounceHandle);
      settingsSearchDebounceHandle = null;
    }
    settingsSearchOverlay.setAttribute('data-open', 'false');
    settingsSearchOverlay.setAttribute('aria-hidden', 'true');
    settingsSearchState.open = false;
    settingsSearchState.activeIndex = -1;
    settingsSearchState.resultElements.clear();
    if(settingsSearchInput){
      settingsSearchInput.setAttribute('aria-expanded', 'false');
      settingsSearchInput.setAttribute('aria-activedescendant', '');
    }
    toggleSettingsSearchHelp(false);
    if(restoreFocus && settingsSearchPreviousFocus && typeof settingsSearchPreviousFocus.focus === 'function'){
      settingsSearchPreviousFocus.focus();
    }
    settingsSearchPreviousFocus = null;
  }

  function openSettingsSearch({ query = '', focus = true } = {}){
    if(!settingsSearchOverlay || !settingsSearchInput){
      return;
    }
    rebuildSettingsSearchIndex();
    settingsSearchPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    settingsSearchOverlay.setAttribute('data-open', 'true');
    settingsSearchOverlay.setAttribute('aria-hidden', 'false');
    settingsSearchState.open = true;
    if(query !== undefined && query !== null){
      settingsSearchInput.value = query;
    }
    if(focus){
      settingsSearchInput.focus();
      settingsSearchInput.select();
    }
    scheduleSettingsSearch(settingsSearchInput.value);
  }

  function toggleSettingsSearchHelp(force){
    if(!settingsSearchHelpEl || !settingsSearchHelpBtn){
      return;
    }
    const shouldShow = typeof force === 'boolean' ? force : settingsSearchHelpEl.hasAttribute('hidden');
    if(shouldShow){
      settingsSearchHelpEl.removeAttribute('hidden');
      settingsSearchHelpBtn.setAttribute('aria-expanded', 'true');
    } else {
      settingsSearchHelpEl.setAttribute('hidden', 'true');
      settingsSearchHelpBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function scheduleSettingsSearch(query){
    if(settingsSearchDebounceHandle){
      clearTimeout(settingsSearchDebounceHandle);
    }
    const requestId = ++settingsSearchState.requestId;
    settingsSearchDebounceHandle = setTimeout(()=>{
      const payload = searchSettings(query || '', { limit: SETTINGS_SEARCH_RESULT_LIMIT });
      if(requestId === settingsSearchState.requestId){
        renderSettingsSearchResults(payload);
      }
    }, SETTINGS_SEARCH_DEBOUNCE_MS);
  }

  function handleSettingsSearchInput(){
    if(!settingsSearchInput){
      return;
    }
    scheduleSettingsSearch(settingsSearchInput.value);
  }

  function handleSettingsSearchInputKeydown(ev){
    if(ev.key === 'ArrowDown'){
      ev.preventDefault();
      moveSettingsSearchActive(1);
      return;
    }
    if(ev.key === 'ArrowUp'){
      ev.preventDefault();
      moveSettingsSearchActive(-1);
      return;
    }
    if(ev.key === 'Enter'){
      ev.preventDefault();
      if(settingsSearchState.activeIndex >= 0){
        activateSettingsSearchResult(settingsSearchState.activeIndex, { toggle: ev.altKey });
      } else if(settingsSearchState.results.length){
        activateSettingsSearchResult(0, { toggle: ev.altKey });
      }
      return;
    }
    if(ev.key === 'Escape'){
      ev.preventDefault();
      closeSettingsSearch();
      return;
    }
    if(ev.key === '?' && ev.shiftKey){
      ev.preventDefault();
      toggleSettingsSearchHelp();
      return;
    }
  }

  function handleGlobalSettingsSearchKeydown(ev){
    const key = ev.key ? ev.key.toLowerCase() : '';
    const meta = ev.metaKey || ev.ctrlKey;
    const target = ev.target;
    const isEditable = target && target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if(meta && key === 'k'){
      ev.preventDefault();
      if(settingsSearchState.open){
        closeSettingsSearch();
      } else {
        openSettingsSearch({ query: settingsSearchInput ? settingsSearchInput.value : '', focus: true });
      }
      return;
    }
    if(settingsSearchState.open && key === 'escape'){
      ev.preventDefault();
      closeSettingsSearch();
      return;
    }
    if(!settingsSearchState.open && !meta && !isEditable && ev.key === '?' && ev.shiftKey){
      ev.preventDefault();
      openSettingsSearch({ query: '', focus: true });
      toggleSettingsSearchHelp(true);
    }
  }

  function initializeSettingsSearch(){
    if(!settingsSearchOverlay || !settingsSearchInput){
      return;
    }
    rebuildSettingsSearchIndex();
    document.addEventListener('keydown', handleGlobalSettingsSearchKeydown);
    settingsSearchOverlay.addEventListener('click', (ev)=>{
      if(ev.target === settingsSearchOverlay){
        closeSettingsSearch();
      }
    });
    settingsSearchInput.addEventListener('input', handleSettingsSearchInput);
    settingsSearchInput.addEventListener('keydown', handleSettingsSearchInputKeydown);
    if(sidebarSearchButton){
      sidebarSearchButton.addEventListener('click', ()=>{
        openSettingsSearch({ query: '', focus: true });
      });
    }
    if(sidebarSearchShortcut){
      const isMac = typeof navigator !== 'undefined' && navigator && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
      sidebarSearchShortcut.textContent = isMac ? '⌘K' : 'Ctrl+K';
    }
    if(settingsSearchHelpBtn){
      settingsSearchHelpBtn.addEventListener('click', ()=> toggleSettingsSearchHelp());
    }
    if(settingsSearchHelpClose){
      settingsSearchHelpClose.addEventListener('click', ()=> toggleSettingsSearchHelp(false));
    }
    if(settingsSearchAskBtn){
      settingsSearchAskBtn.addEventListener('click', ()=> toggleSettingsSearchHelp(true));
    }
  }


  function initializeCameraControls(){
    setCameraMode(camera.mode, { syncInput: true, silent: true });
    setCameraFollowLag(cameraFollowLagMs);
    setCameraLead(cameraLeadDistance);
    setCameraHorizontalOffset(cameraHorizontalOffsetPercent);
    setCameraVerticalOffset(cameraVerticalOffsetPercent);
    setCameraEdgeMargin(cameraEdgeScrollMargin);
    setCameraEdgeSpeed(cameraEdgeScrollSpeed);
    setCameraRecenterDelay(cameraRecenterDelayMs);
    setCameraManualLeash(cameraManualLeash);
    setCameraZoom(camera.scale * 100, { syncInput: true, instant: true });
    setCameraWheelSensitivity(cameraWheelSensitivity);
    setCameraZoomInLock(cameraZoomInLocked);
    setCameraZoomOutLock(cameraZoomOutLocked);
    updateCameraLockBindingDisplay();

    if(cameraModeSelect){
      cameraModeSelect.addEventListener('change', (ev)=> setCameraMode(ev.target.value));
    }
    if(cameraFollowLagInput){
      cameraFollowLagInput.addEventListener('input', (ev)=> setCameraFollowLag(ev.target.value, { syncInput: false }));
    }
    if(cameraLeadInput){
      cameraLeadInput.addEventListener('input', (ev)=> setCameraLead(ev.target.value, { syncInput: false }));
    }
    if(cameraHorizontalOffsetInput){
      cameraHorizontalOffsetInput.addEventListener('input', (ev)=> setCameraHorizontalOffset(ev.target.value, { syncInput: false }));
    }
    if(cameraVerticalOffsetInput){
      cameraVerticalOffsetInput.addEventListener('input', (ev)=> setCameraVerticalOffset(ev.target.value, { syncInput: false }));
    }
    if(cameraEdgeMarginInput){
      cameraEdgeMarginInput.addEventListener('input', (ev)=> setCameraEdgeMargin(ev.target.value, { syncInput: false }));
    }
    if(cameraEdgeSpeedInput){
      cameraEdgeSpeedInput.addEventListener('input', (ev)=> setCameraEdgeSpeed(ev.target.value, { syncInput: false }));
    }
    if(cameraRecenterDelayInput){
      cameraRecenterDelayInput.addEventListener('input', (ev)=> setCameraRecenterDelay(ev.target.value, { syncInput: false }));
    }
    if(cameraZoomInput){
      cameraZoomInput.addEventListener('input', (ev)=> setCameraZoom(ev.target.value, { syncInput: false }));
    }
    if(cameraManualLeashInput){
      cameraManualLeashInput.addEventListener('input', (ev)=> setCameraManualLeash(ev.target.value, { syncInput: false }));
    }
    if(cameraWheelSensitivityInput){
      cameraWheelSensitivityInput.addEventListener('input', (ev)=> setCameraWheelSensitivity(ev.target.value, { syncInput: false }));
    }
    if(cameraZoomInLockBtn){
      cameraZoomInLockBtn.addEventListener('click', () => setCameraZoomInLock(!cameraZoomInLocked));
    }
    if(cameraZoomOutLockBtn){
      cameraZoomOutLockBtn.addEventListener('click', () => setCameraZoomOutLock(!cameraZoomOutLocked));
    }
    if(cameraLockBindBtn){
      cameraLockBindBtn.addEventListener('click', () => {
        cameraLockCapture = !cameraLockCapture;
        camera.lockCapture = cameraLockCapture;
        updateCameraLockBindingDisplay();
        if(cameraLockCapture){
          setHudMessage('Press a key to toggle the camera lock.');
        }
      });
    }
    if(cameraRecenterBtn){
      cameraRecenterBtn.addEventListener('click', () => recenterCamera({ force: true }));
    }
  }
  const pulses = [];
  const laserProjectiles = [];
  const blinkingBoltProjectiles = [];
  const chargingGaleProjectiles = [];
  const projectiles = [];
  const hitsplats = [];
  const slamCasts = [];
  const slamFissures = [];
  const slamIceFields = [];
  const slamImpacts = [];
  const SPELL_ORIGIN_SLIDER_CENTER = 1000;
  const PLAYER_PROJECTILE_SPEED = 700; // px per second
  const MONSTER_SPEED_BOOST_DURATION = 3; // seconds
  function flash(x, y, opts){
    const start = opts && Number.isFinite(opts.startRadius) ? Math.max(0, opts.startRadius) : 12;
    const endCandidate = opts && Number.isFinite(opts.endRadius) ? Math.max(0, opts.endRadius) : (start + 40);
    const end = Math.max(start, endCandidate);
    const color = opts && typeof opts.color === 'string' && opts.color.trim() ? opts.color : '#7fe3ff';
    pulses.push({ x, y, t: 0, startRadius: start, endRadius: end, color });
  }

  function getSpellOrigin(entity){
    const subject = entity || player;
    const baseX = Number(subject && subject.x);
    const baseY = Number(subject && subject.y);
    const hasBaseX = Number.isFinite(baseX);
    const hasBaseY = Number.isFinite(baseY);
    let x = hasBaseX ? baseX : 0;
    let y = hasBaseY ? baseY : 0;
    if(subject && Object.prototype.hasOwnProperty.call(subject, 'spellOriginLengthOffset')){
      const offsetLength = Number(subject.spellOriginLengthOffset);
      if(Number.isFinite(offsetLength)){
        y -= offsetLength;
      }
    }
    if(subject && Object.prototype.hasOwnProperty.call(subject, 'spellOriginWidthOffset')){
      const offsetWidth = Number(subject.spellOriginWidthOffset);
      if(Number.isFinite(offsetWidth)){
        x += offsetWidth;
      }
    }
    return { x, y };
  }

  function resolveCastOrigin(cast){
    const fallback = getSpellOrigin(player);
    let x = fallback.x;
    let y = fallback.y;
    if(cast){
      if(Number.isFinite(Number(cast.startX))){
        x = Number(cast.startX);
      }
      if(Number.isFinite(Number(cast.startY))){
        y = Number(cast.startY);
      }
      if(cast.casterRef){
        const casterOrigin = getSpellOrigin(cast.casterRef);
        if(Number.isFinite(casterOrigin.x)) x = casterOrigin.x;
        if(Number.isFinite(casterOrigin.y)) y = casterOrigin.y;
      }
    }
    return { x, y };
  }

  // Player
  const player = Object.assign(GameState.player, {
    x: mapState.width / 2,
    y: mapState.height / 2,
    r:10,
    color:'#2aa9ff',
    team:'blue',
    hitboxVisible:true,
    hitboxShape:'capsule',
    hitboxLength:32,
    hitboxWidth:20,
    spellOriginLengthOffset:0,
    spellOriginWidthOffset:0,
    speed:240,
    hp:1000,
    maxHp:1000,
    mp: Math.max(0, Number(GameState.player.mp) || 400),
    maxMp: Math.max(1, Number(GameState.player.maxMp) || 400),
    attackRange:200,
    attackRangeOpacity:0.14,
    attackSpeedMs:1000,
    attackWindupMs:250,
    attackDamage:10,
    attackCooldown:0,
    attackWindup:0,
    attackTarget:null,
    selectedTarget:null,
    chaseTarget:null,
    hitSplatSize:28,
    moveCircleStart:12,
    moveCircleEnd:52,
    moveCircleColor:'#7fe3ff',
    slowPct:0,
    slowTimer:0,
    stunTimer:0,
    knockupTimer:0,
    silenceTimer:0,
    disarmTimer:0,
    polymorphTimer:0,
    combatLockTimer: Math.max(0, Number(GameState.player.combatLockTimer) || 0),
    homeguardTimer: Math.max(0, Number(GameState.player.homeguardTimer) || 0),
    recallTimer: Math.max(0, Number(GameState.player.recallTimer) || 0),
    baseInvulnTimer: Math.max(0, Number(GameState.player.baseInvulnTimer) || 0),
    baseRegenProgress: Math.max(0, Number(GameState.player.baseRegenProgress) || 0),
    isInBaseZone: GameState.player.isInBaseZone === true,
    isInFountain: GameState.player.isInFountain === true,
    recall: (GameState.player.recall && typeof GameState.player.recall === 'object')
      ? GameState.player.recall
      : (GameState.player.recall = { state: 'idle', timer: 0, lastStateChange: 0 }),
    inventory: playerInventoryState,
    shop: playerShopState,
    casting:null,
    tauntTimer:0,
    hasteTimer: GameState.player.hasteTimer || 0,
    hastePct: GameState.player.hastePct || 0,
    activePrayer: GameState.prayers.active || null,
    target:{x: mapState.width / 2, y: mapState.height / 2},
    nav:null,
    navGoal:null
  });
  player.maxMp = Math.max(1, Number(player.maxMp) || 400);
  player.mp = Math.max(0, Math.min(player.maxMp, Number(player.mp) || player.maxMp));
  if(!player.recall || typeof player.recall !== 'object'){
    player.recall = { state: 'idle', timer: 0, lastStateChange: 0 };
  }
  if(typeof player.recall.state !== 'string'){ player.recall.state = 'idle'; }
  player.recall.timer = Math.max(0, Number(player.recall.timer) || 0);
  player.recall.lastStateChange = Number.isFinite(player.recall.lastStateChange)
    ? player.recall.lastStateChange
    : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  player.recall.anchorX = Number.isFinite(player.recall.anchorX) ? player.recall.anchorX : null;
  player.recall.anchorY = Number.isFinite(player.recall.anchorY) ? player.recall.anchorY : null;
  player.recall.duration = Math.max(0, Number(player.recall.duration) || 8);
  player.recall.interruptReason = typeof player.recall.interruptReason === 'string'
    ? player.recall.interruptReason
    : null;
  normalizePlayerControlState(player);
  normalizePracticeDummyState();
  camera.followX = player.x;
  camera.followY = player.y;
  function updatePlayerFacingFromVector(dx, dy){
    if(!Number.isFinite(dx) || !Number.isFinite(dy)){
      return false;
    }
    const length = Math.hypot(dx, dy);
    if(!(length > 0.001)){
      return false;
    }
    const angle = Math.atan2(dx, dy);
    if(!Number.isFinite(angle)){
      return false;
    }
    GameState.player.facingRadians = angle;
    return true;
  }
  function updatePlayerFacingTowards(target, { originX, originY } = {}){
    if(!target){
      return false;
    }
    const tx = Number(target.x);
    const ty = Number(target.y);
    if(!Number.isFinite(tx) || !Number.isFinite(ty)){
      return false;
    }
    if(!Number.isFinite(originX) || !Number.isFinite(originY)){
      const origin = getSpellOrigin(player);
      originX = origin.x;
      originY = origin.y;
    }
    return updatePlayerFacingFromVector(tx - originX, ty - originY);
  }
  function updatePlayerFacingFromCast(cast){
    if(!cast){
      return false;
    }
    if(cast.targetRef && updatePlayerFacingTowards(cast.targetRef)){
      return true;
    }
    const pairs = [
      ['targetX', 'targetY'],
      ['destX', 'destY'],
      ['endX', 'endY'],
      ['aimX', 'aimY']
    ];
    for(const [keyX, keyY] of pairs){
      const x = Number(cast[keyX]);
      const y = Number(cast[keyY]);
      if(Number.isFinite(x) && Number.isFinite(y) && updatePlayerFacingFromVector(x - player.x, y - player.y)){
        return true;
      }
    }
    const dirCandidates = [
      [cast.dirX, cast.dirY],
      [cast.initialDirX, cast.initialDirY],
      [cast.aimDirX, cast.aimDirY]
    ];
    for(const [rawDx, rawDy] of dirCandidates){
      const dx = Number(rawDx);
      const dy = Number(rawDy);
      if(Number.isFinite(dx) || Number.isFinite(dy)){
        const safeDx = Number.isFinite(dx) ? dx : 0;
        const safeDy = Number.isFinite(dy) ? dy : 0;
        if(updatePlayerFacingFromVector(safeDx, safeDy)){
          return true;
        }
      }
    }
    return false;
  }
  function colorForTeam(team){ return team === 'red' ? '#ff5577' : '#2aa9ff'; }
  function setPlayerTeam(team){
    const normalized = team === 'red' ? 'red' : 'blue';
    player.team = normalized;
    player.color = colorForTeam(normalized);
    if(hudVitals){
      hudVitals.dataset.team = normalized;
    }
    if(playerFloatHud){
      playerFloatHud.dataset.team = normalized;
    }
    if(playerTeamSelect && playerTeamSelect.value !== normalized){
      playerTeamSelect.value = normalized;
    }
    if((player.selectedTarget && player.selectedTarget.side === player.team) ||
       (player.attackTarget && player.attackTarget.side === player.team)){
      cancelPlayerAttack();
    }
    recenterCamera({ force: true });
  }
  function cancelPlayerAttack(clearSelection = true){
    player.attackTarget = null;
    player.attackWindup = 0;
    if(clearSelection){
      player.selectedTarget = null;
      player.chaseTarget = null;
    }
  }

  const RECALL_CHANNEL_SECONDS = 8;
  const PLAYER_COMBAT_LOCK_DURATION = 3.5;
  const SHOP_REFUND_RATE = 0.7;
  const SHOP_UNDO_LIMIT = 20;
  const SHOP_CATALOG = new Map([
    ['boots', { id: 'boots', name: 'Scout Boots', cost: 300, uniqueTag: 'boots', tags: ['boots'] }],
    ['longsword', { id: 'longsword', name: 'Longsword', cost: 350, tags: ['weapon'] }],
    ['dagger', { id: 'dagger', name: 'Dagger', cost: 300, tags: ['attack-speed'] }],
    ['pickaxe', { id: 'pickaxe', name: 'Pickaxe', cost: 875, components: ['longsword', 'dagger'], tags: ['weapon'] }],
    ['bf-sword', { id: 'bf-sword', name: 'B.F. Sword', cost: 1300, components: ['longsword', 'longsword'], tags: ['weapon'] }],
    ['mythic-core', {
      id: 'mythic-core',
      name: 'Mythic Core',
      cost: 3200,
      components: ['pickaxe', 'boots'],
      uniqueTag: 'mythic',
      tags: ['mythic'],
      excludesTags: ['mythic']
    }]
  ]);

  function getShopItem(itemId){
    if(typeof itemId !== 'string'){ return null; }
    const key = itemId.trim().toLowerCase();
    if(!key){ return null; }
    return SHOP_CATALOG.get(key) || null;
  }

  function distanceSq(ax, ay, bx, by){
    const dx = (Number(ax) || 0) - (Number(bx) || 0);
    const dy = (Number(ay) || 0) - (Number(by) || 0);
    return dx * dx + dy * dy;
  }

  function circleContains(px, py, circle){
    if(!circle){
      return false;
    }
    const radius = Math.max(0, Number(circle.radius) || 0);
    if(!(radius > 0)){
      return false;
    }
    const cx = Number(circle.x) || 0;
    const cy = Number(circle.y) || 0;
    return distanceSq(px, py, cx, cy) <= radius * radius;
  }

  function getBaseConfig(side){
    if(!GameState.bases || typeof GameState.bases !== 'object'){
      return null;
    }
    return GameState.bases[side === 'red' ? 'red' : 'blue'] || null;
  }

  function onEnterBaseZone(base){
    player.shop.stayTimer = 0;
    setHudMessage(`${base.side === player.team ? 'Allied' : 'Enemy'} base zone entered.`);
  }

  function onExitBaseZone(base){
    player.shop.stayTimer = 0;
    if(player.shop.undoStack && player.shop.undoStack.length){
      player.shop.undoStack.length = 0;
    }
    setHudMessage(`${base.side === player.team ? 'Allied' : 'Enemy'} base zone exited.`);
  }

  function applyBaseRegen(base, interval){
    if(!base){
      return;
    }
    const regen = base.regenPerSecond || {};
    const hpRegen = Math.max(0, Number(regen.hp) || 0);
    const mpRegen = Math.max(0, Number(regen.mp) || 0);
    if(hpRegen > 0){
      const nextHp = Math.min(player.maxHp, Number(player.hp) + hpRegen * interval);
      if(nextHp !== player.hp){
        player.hp = nextHp;
        updateHudHealth();
      }
    }
    if(mpRegen > 0){
      const nextMp = Math.min(player.maxMp, Number(player.mp) + mpRegen * interval);
      player.mp = nextMp;
    }
  }

  function applyBaseDefense(base, dt){
    if(!base || !base.fountain){
      return;
    }
    const lethalRadius = Math.max(0, Number(base.lethalRadius) || 0);
    if(!(lethalRadius > 0)){
      return;
    }
    const radiusSq = lethalRadius * lethalRadius;
    const cx = Number(base.fountain.x) || 0;
    const cy = Number(base.fountain.y) || 0;
    if(player.team !== base.side && player.hp > 0){
      const playerDist = distanceSq(player.x, player.y, cx, cy);
      if(playerDist <= radiusSq){
        const damage = Math.max(0, Number(base.lethalDamagePerSecond) || 0) * dt;
        if(damage > 0){
          damagePlayer(damage);
        }
      }
    }
    for(const m of minions){
      if(!m || m.hp <= 0 || m.side === base.side){
        continue;
      }
      const dist = distanceSq(m.x, m.y, cx, cy);
      if(dist <= radiusSq){
        m.hp = 0;
        m.portalizing = 0;
      }
    }
  }

  function teleportPlayerToFountain(side, { reason = 'teleport' } = {}){
    const base = getBaseConfig(side);
    if(!base || !base.fountain){
      return;
    }
    const destX = Number(base.fountain.x) || player.x;
    const destY = Number(base.fountain.y) || player.y;
    player.x = destX;
    player.y = destY;
    player.target.x = destX;
    player.target.y = destY;
    player.nav = null;
    player.navGoal = null;
    cancelPlayerAttack();
    flash(destX, destY, { startRadius: player.r + 12, endRadius: player.r + 60, color: '#7fe3ff' });
    const invuln = Math.max(0, Number(base.invulnerabilityDuration) || 0);
    if(invuln > 0){
      player.baseInvulnTimer = Math.max(player.baseInvulnTimer, invuln);
    }
    const homeguardDuration = Math.max(0, Number(base.homeguardDuration) || 0);
    if(homeguardDuration > 0){
      player.homeguardTimer = Math.max(player.homeguardTimer, homeguardDuration);
    }
    camera.followX = player.x;
    camera.followY = player.y;
    recenterCamera({ force: true });
    setHudMessage(reason === 'recall' ? 'Recall complete.' : 'Returned to base.');
  }

  function enterPlayerCombat(reason = 'combat'){
    player.combatLockTimer = PLAYER_COMBAT_LOCK_DURATION;
    if(player.shop && Array.isArray(player.shop.undoStack) && player.shop.undoStack.length){
      player.shop.undoStack.length = 0;
    }
    if(isPlayerRecalling()){
      cancelRecall(reason);
    }
  }

  function canPlayerShop(){
    if(player.hp <= 0){
      return false;
    }
    if(!player.isInBaseZone){
      return false;
    }
    return !(player.combatLockTimer > 0);
  }

  function ensureShopUndoStack(){
    if(!player.shop.undoStack){
      player.shop.undoStack = [];
    }
    return player.shop.undoStack;
  }

  function trimShopUndoStack(){
    const stack = ensureShopUndoStack();
    if(stack.length > SHOP_UNDO_LIMIT){
      stack.splice(0, stack.length - SHOP_UNDO_LIMIT);
    }
  }

  function shopBuy(itemId){
    const item = getShopItem(itemId);
    if(!item){
      setHudMessage('Unknown item.');
      return false;
    }
    if(!canPlayerShop()){
      setHudMessage('Shop unavailable (must be in base and out of combat).');
      return false;
    }
    const inventory = player.inventory;
    if(item.uniqueTag && inventory.some(entry => entry && entry.uniqueTag === item.uniqueTag)){
      setHudMessage('Unique item already owned.');
      return false;
    }
    if(Array.isArray(item.excludesTags)){
      for(const entry of inventory){
        if(!entry || !Array.isArray(entry.tags)) continue;
        if(entry.tags.some(tag => item.excludesTags.includes(tag))){
          setHudMessage('Item conflicts with current loadout.');
          return false;
        }
      }
    }
    const components = Array.isArray(item.components) ? item.components.slice() : [];
    const consumed = [];
    const consumedIndices = [];
    let goldCost = Math.max(0, Number(item.cost) || 0);
    for(const componentId of components){
      const idx = inventory.findIndex((entry, index) => entry && entry.id === componentId && !consumedIndices.includes(index));
      if(idx >= 0){
        const entry = inventory[idx];
        consumedIndices.push(idx);
        consumed.push(entry);
        const paid = Number(entry.goldCost);
        if(Number.isFinite(paid) && paid > 0){
          goldCost = Math.max(0, goldCost - paid);
        }
      }
    }
    goldCost = Math.round(goldCost);
    if(goldCost > goldState.player){
      setHudMessage('Not enough gold.');
      return false;
    }
    consumedIndices.sort((a, b) => b - a).forEach(index => { inventory.splice(index, 1); });
    if(goldCost > 0){ addGold(-goldCost); }
    const record = {
      id: item.id,
      name: item.name || item.id,
      uniqueTag: item.uniqueTag || null,
      tags: Array.isArray(item.tags) ? [...item.tags] : [],
      goldCost,
      components: components.slice()
    };
    inventory.push(record);
    const stack = ensureShopUndoStack();
    stack.push({
      type: 'buy',
      item: record,
      consumed: consumed.slice(),
      cost: goldCost,
      transactionId: player.shop.transactionSeq++
    });
    trimShopUndoStack();
    setHudMessage(`Purchased ${record.name} for ${goldCost} gold.`);
    return true;
  }

  function shopSell(target){
    if(!canPlayerShop()){
      setHudMessage('Shop unavailable (must be in base and out of combat).');
      return false;
    }
    const inventory = player.inventory;
    if(!inventory.length){
      setHudMessage('Inventory is empty.');
      return false;
    }
    let index = -1;
    if(typeof target === 'number' && Number.isFinite(target)){
      index = Math.floor(target);
    } else if(typeof target === 'string'){
      const key = target.trim().toLowerCase();
      index = inventory.findIndex(entry => entry && entry.id === key);
    }
    if(index < 0 || index >= inventory.length){
      index = inventory.length - 1;
    }
    const [removed] = inventory.splice(index, 1);
    if(!removed){
      setHudMessage('Unable to sell item.');
      return false;
    }
    const refund = Math.max(0, Math.round((Number(removed.goldCost) || 0) * SHOP_REFUND_RATE));
    if(refund > 0){ addGold(refund); }
    const stack = ensureShopUndoStack();
    stack.push({
      type: 'sell',
      item: removed,
      refund,
      index,
      transactionId: player.shop.transactionSeq++
    });
    trimShopUndoStack();
    setHudMessage(`Sold ${removed.name || removed.id} for ${refund} gold.`);
    return true;
  }

  function shopUndo(){
    if(!canPlayerShop()){
      setHudMessage('Undo unavailable outside base/combat.');
      return false;
    }
    const stack = ensureShopUndoStack();
    const entry = stack.pop();
    if(!entry){
      setHudMessage('Nothing to undo.');
      return false;
    }
    if(entry.type === 'buy'){
      const idx = player.inventory.findIndex(item => item === entry.item);
      if(idx >= 0){
        player.inventory.splice(idx, 1);
      }
      if(entry.cost > 0){ addGold(entry.cost); }
      for(const consumed of entry.consumed || []){
        player.inventory.push(consumed);
      }
      setHudMessage('Purchase undone.');
      return true;
    }
    if(entry.type === 'sell'){
      const refund = Number(entry.refund) || 0;
      if(refund > 0){ addGold(-refund); }
      const insertAt = Math.max(0, Math.min(player.inventory.length, Number(entry.index) || 0));
      player.inventory.splice(insertAt, 0, entry.item);
      setHudMessage('Sale undone.');
      return true;
    }
    setHudMessage('Nothing to undo.');
    return false;
  }

  function updateShopState(dt){
    const stack = ensureShopUndoStack();
    if(canPlayerShop()){
      player.shop.stayTimer = (player.shop.stayTimer || 0) + dt;
    } else {
      player.shop.stayTimer = 0;
      if(stack.length){
        stack.length = 0;
      }
    }
  }

  function isPlayerRecalling(){
    return !!(player.recall && player.recall.state === 'channeling');
  }

  function cancelRecall(reason = 'cancelled'){
    if(!isPlayerRecalling()){
      return false;
    }
    player.recall.state = 'idle';
    player.recall.timer = 0;
    player.recall.interruptReason = reason;
    player.recall.anchorX = null;
    player.recall.anchorY = null;
    player.recall.lastHp = null;
    player.recallTimer = 0;
    setHudMessage(reason === 'cancelled' ? 'Recall cancelled.' : 'Recall interrupted.');
    return true;
  }

  function canPlayerRecall(){
    if(player.hp <= 0){
      return false;
    }
    if(isPlayerRecalling()){
      return false;
    }
    if(player.stunTimer > 0 || player.knockupTimer > 0 || player.polymorphTimer > 0){
      return false;
    }
    if(player.combatLockTimer > 0){
      return false;
    }
    return true;
  }

  function startRecall(){
    if(!canPlayerRecall()){
      setHudMessage('Cannot recall right now.');
      return false;
    }
    player.recall.state = 'channeling';
    player.recall.timer = 0;
    player.recall.duration = RECALL_CHANNEL_SECONDS;
    player.recall.anchorX = player.x;
    player.recall.anchorY = player.y;
    player.recall.lastHp = player.hp;
    player.recall.interruptReason = null;
    player.recall.lastStateChange = typeof performance !== 'undefined' ? performance.now() : Date.now();
    player.recallTimer = RECALL_CHANNEL_SECONDS;
    player.target.x = player.x;
    player.target.y = player.y;
    player.nav = null;
    player.navGoal = null;
    cancelPlayerAttack();
    setHudMessage('Recalling...');
    return true;
  }

  function toggleRecall(){
    if(isPlayerRecalling()){
      cancelRecall('cancelled');
    } else {
      startRecall();
    }
  }

  function completeRecall(){
    if(!isPlayerRecalling()){
      return;
    }
    player.recall.state = 'idle';
    player.recall.timer = 0;
    player.recallTimer = 0;
    player.recall.anchorX = null;
    player.recall.anchorY = null;
    teleportPlayerToFountain(player.team, { reason: 'recall' });
  }

  function updatePlayerRecall(dt){
    if(!player.recall || player.recall.state !== 'channeling'){
      player.recallTimer = 0;
      return;
    }
    const duration = Math.max(0.1, Number(player.recall.duration) || RECALL_CHANNEL_SECONDS);
    player.recall.timer += dt;
    const remaining = Math.max(0, duration - player.recall.timer);
    player.recallTimer = remaining;
    if(player.hp <= 0 || player.stunTimer > 0 || player.knockupTimer > 0 || player.polymorphTimer > 0){
      cancelRecall('crowdControl');
      return;
    }
    if(player.recall.anchorX !== null && player.recall.anchorY !== null){
      const moved = distanceSq(player.x, player.y, player.recall.anchorX, player.recall.anchorY);
      if(moved > 16){
        cancelRecall('moved');
        return;
      }
    }
    if(Number.isFinite(player.recall.lastHp) && player.hp < player.recall.lastHp - 0.5){
      cancelRecall('damage');
      return;
    }
    player.recall.lastHp = player.hp;
    if(player.recall.timer >= duration){
      completeRecall();
    }
  }

  function updatePlayerBaseState(dt){
    const allyBase = getBaseConfig(player.team);
    let inBase = false;
    let inFountain = false;
    if(allyBase){
      inBase = circleContains(player.x, player.y, allyBase.baseZone);
      inFountain = circleContains(player.x, player.y, allyBase.fountain);
      if(inBase){
        if(!player.isInBaseZone){
          onEnterBaseZone(allyBase);
        }
        const interval = Math.max(0.05, Number(allyBase.regenInterval) || 0.25);
        player.baseRegenProgress = (player.baseRegenProgress || 0) + dt;
        while(player.baseRegenProgress >= interval){
          player.baseRegenProgress -= interval;
          applyBaseRegen(allyBase, interval);
        }
        const invuln = Math.max(0, Number(allyBase.invulnerabilityDuration) || 0);
        if(invuln > 0){
          player.baseInvulnTimer = Math.max(player.baseInvulnTimer, invuln);
        }
        if(inFountain){
          const homeguardDuration = Math.max(0, Number(allyBase.homeguardDuration) || 0);
          if(homeguardDuration > 0){
            player.homeguardTimer = Math.max(player.homeguardTimer, homeguardDuration);
          }
        }
      } else {
        if(player.isInBaseZone){
          onExitBaseZone(allyBase);
        }
        player.baseRegenProgress = 0;
      }
    }
    player.isInBaseZone = inBase;
    player.isInFountain = inFountain;
    if(playerFloatHud){
      playerFloatHud.dataset.inBase = inBase ? 'true' : 'false';
      playerFloatHud.dataset.inFountain = inFountain ? 'true' : 'false';
    }
    if(!inBase){
      player.baseInvulnTimer = Math.max(0, player.baseInvulnTimer - dt);
    }
    if(player.homeguardTimer > 0){
      player.homeguardTimer = Math.max(0, player.homeguardTimer - dt);
    }
    const bases = GameState.bases;
    if(bases && typeof bases === 'object'){
      for(const base of Object.values(bases)){
        applyBaseDefense(base, dt);
      }
    }
  }

  function drawBaseZones(){
    if(!ctx || !GameState.bases || typeof GameState.bases !== 'object'){
      return;
    }
    for(const base of Object.values(GameState.bases)){
      if(!base){ continue; }
      const zone = base.baseZone;
      const fountain = base.fountain;
      const baseColor = base.side === 'red' ? '#f43f5e' : '#38bdf8';
      if(zone && circleInCamera(zone.x, zone.y, Math.max(0, Number(zone.radius) || 0) + 24)){
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, Math.max(0, Number(zone.radius) || 0), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        ctx.strokeStyle = baseColor;
        ctx.stroke();
        ctx.restore();
      }
      if(fountain && circleInCamera(fountain.x, fountain.y, Math.max(0, Number(fountain.radius) || 0) + 24)){
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(fountain.x, fountain.y, Math.max(0, Number(fountain.radius) || 0), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        ctx.strokeStyle = baseColor;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function triggerPlayerTaunt(duration = 1.5){
    if(player.hp <= 0){
      return;
    }
    const tauntDuration = Math.max(0, Number(duration) || 0);
    if(tauntDuration <= 0){
      return;
    }
    player.tauntTimer = tauntDuration;
    setPlayerAnimationState('taunt');
  }

  function updatePlayerAnimationFromGameplay(dt){
    if(!playerRuntime.animationController){
      return;
    }
    if(player.tauntTimer > 0){
      player.tauntTimer = Math.max(0, player.tauntTimer - dt);
    }
    if(player.hp <= 0){
      setPlayerAnimationState('death', { facingRadians: GameState.player.facingRadians });
      return;
    }
    if(player.tauntTimer > 0){
      setPlayerAnimationState('taunt', { facingRadians: GameState.player.facingRadians });
      return;
    }
    if(player.casting){
      updatePlayerFacingFromCast(player.casting);
      setPlayerAnimationState('cast', { facingRadians: GameState.player.facingRadians });
      return;
    }
    if(player.attackWindup > 0){
      if(player.attackTarget){
        updatePlayerFacingTowards(player.attackTarget);
      }
      setPlayerAnimationState('autoAttack', { facingRadians: GameState.player.facingRadians });
      return;
    }
    const speed = Math.hypot(lastPlayerVelocityX, lastPlayerVelocityY);
    if(speed > 5){
      const baseSpeed = Math.max(1, Number(player.speed) || 1);
      const speedFactor = Math.min(3, Math.max(0.2, speed / baseSpeed));
      updatePlayerFacingFromVector(lastPlayerVelocityX, lastPlayerVelocityY);
      setPlayerAnimationState('move', { speedFactor, facingRadians: GameState.player.facingRadians });
    } else {
      if(player.attackTarget){
        updatePlayerFacingTowards(player.attackTarget);
      } else if(player.selectedTarget){
        updatePlayerFacingTowards(player.selectedTarget);
      }
      setPlayerAnimationState('idle', { facingRadians: GameState.player.facingRadians });
    }
  }
  setPlayerTeam(player.team);
  if(playerSizeInput){ playerSizeInput.value = String(player.r); }
  if(playerTeamSelect){ playerTeamSelect.value = player.team; }
  if(playerHpInput){ playerHpInput.value = String(player.maxHp|0); }
  if(playerAttackRangeInput){ playerAttackRangeInput.value = String(player.attackRange|0); }
  if(playerAttackRangeOpacityInput){
    const pct = Math.max(0, Math.min(100, Math.round((Number(player.attackRangeOpacity) || 0) * 100)));
    playerAttackRangeOpacityInput.value = String(pct);
    if(playerAttackRangeOpacityDisplay){
      playerAttackRangeOpacityDisplay.textContent = `${pct}%`;
    }
  }
  if(playerAttackSpeedInput){ playerAttackSpeedInput.value = String(player.attackSpeedMs|0); }
  if(playerAttackWindupInput){ playerAttackWindupInput.value = String(player.attackWindupMs|0); }
  if(playerAttackDamageInput){ playerAttackDamageInput.value = String(player.attackDamage|0); }
  if(playerHitSplatSizeInput){ playerHitSplatSizeInput.value = String(player.hitSplatSize|0); }
  if(playerMoveCircleStartInput){ playerMoveCircleStartInput.value = String(player.moveCircleStart); }
  if(playerMoveCircleEndInput){ playerMoveCircleEndInput.value = String(player.moveCircleEnd); }
  if(playerMoveCircleColorInput){ playerMoveCircleColorInput.value = player.moveCircleColor; }
  if(playerFloatSizeInput){ playerFloatSizeInput.value = String(playerFloatState.width); }
  if(playerFloatHeightInput){
    playerFloatHeightInput.value = String(playerFloatState.height);
    if(playerFloatHeightDisplay){
      playerFloatHeightDisplay.textContent = `${Math.round(playerFloatState.height)}px`;
    }
  }
  if(playerFloatOffsetInput){
    playerFloatOffsetInput.value = String(playerFloatState.gap);
    if(playerFloatOffsetDisplay){
      playerFloatOffsetDisplay.textContent = `${Math.round(playerFloatState.gap)}px`;
    }
  }
  if(playerAttackBarWidthInput && playerFloatState.attack){
    playerAttackBarWidthInput.value = String(playerFloatState.attack.width);
    if(playerAttackBarWidthDisplay){
      playerAttackBarWidthDisplay.textContent = `${Math.round(playerFloatState.attack.width)}px`;
    }
  }
  if(playerAttackBarHeightInput && playerFloatState.attack){
    playerAttackBarHeightInput.value = String(playerFloatState.attack.height);
    if(playerAttackBarHeightDisplay){
      playerAttackBarHeightDisplay.textContent = `${Math.round(playerFloatState.attack.height)}px`;
    }
  }
  if(playerAttackBarOffsetXInput && playerFloatState.attack){
    playerAttackBarOffsetXInput.value = String(Math.round(playerFloatState.attack.offsetX));
  }
  if(playerAttackBarOffsetYInput && playerFloatState.attack){
    playerAttackBarOffsetYInput.value = String(Math.round(playerFloatState.attack.offsetY));
  }
  if(playerIconWidthInput && playerFloatState.icons){
    playerIconWidthInput.value = String(playerFloatState.icons.width);
    if(playerIconWidthDisplay){
      playerIconWidthDisplay.textContent = `${Math.round(playerFloatState.icons.width)}px`;
    }
  }
  if(playerIconHeightInput && playerFloatState.icons){
    playerIconHeightInput.value = String(playerFloatState.icons.height);
    if(playerIconHeightDisplay){
      playerIconHeightDisplay.textContent = `${Math.round(playerFloatState.icons.height)}px`;
    }
  }
  if(playerIconOffsetXInput && playerFloatState.icons){
    playerIconOffsetXInput.value = String(Math.round(playerFloatState.icons.offsetX));
  }
  if(playerIconOffsetYInput && playerFloatState.icons){
    playerIconOffsetYInput.value = String(Math.round(playerFloatState.icons.offsetY));
  }
  buildPlayerStatusConfigRows();
  buildPrayerUi();
  updatePrayerHud();
  syncMonsterInputs();
  updateMonsterHud();
  positionMonsterHud();
  if(playerHitboxShapeSelect){
    playerHitboxShapeSelect.value = player.hitboxShape || 'capsule';
  }
  if(playerHitboxLengthInput){
    const min = Number(playerHitboxLengthInput.min);
    const max = Number(playerHitboxLengthInput.max);
    const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
    const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
    let length = Number(player.hitboxLength);
    if(!Number.isFinite(length)){
      length = clampMin;
    }
    length = Math.max(clampMin, Math.min(clampMax, length));
    playerHitboxLengthInput.value = String(length);
    if(playerHitboxLengthDisplay){
      playerHitboxLengthDisplay.textContent = `${Math.round(length)}px`;
    }
  }
  if(playerHitboxWidthInput){
    const min = Number(playerHitboxWidthInput.min);
    const max = Number(playerHitboxWidthInput.max);
    const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
    const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
    let width = Number(player.hitboxWidth);
    if(!Number.isFinite(width)){
      width = clampMin;
    }
    width = Math.max(clampMin, Math.min(clampMax, width));
    playerHitboxWidthInput.value = String(width);
    if(playerHitboxWidthDisplay){
      playerHitboxWidthDisplay.textContent = `${Math.round(width)}px`;
    }
  }
  if(playerSpellOriginLengthInput){
    const raw = SPELL_ORIGIN_SLIDER_CENTER + (Number.isFinite(player.spellOriginLengthOffset) ? player.spellOriginLengthOffset : 0);
    const min = Number(playerSpellOriginLengthInput.min);
    const max = Number(playerSpellOriginLengthInput.max);
    const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
    const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
    const clamped = Math.max(clampMin, Math.min(clampMax, raw));
    playerSpellOriginLengthInput.value = String(clamped);
    if(playerSpellOriginLengthDisplay){
      const offset = clamped - SPELL_ORIGIN_SLIDER_CENTER;
      const rounded = Math.round(offset);
      const sign = rounded >= 0 ? '+' : '';
      playerSpellOriginLengthDisplay.textContent = `${sign}${rounded}px`;
    }
  }
  if(playerSpellOriginWidthInput){
    const raw = SPELL_ORIGIN_SLIDER_CENTER + (Number.isFinite(player.spellOriginWidthOffset) ? player.spellOriginWidthOffset : 0);
    const min = Number(playerSpellOriginWidthInput.min);
    const max = Number(playerSpellOriginWidthInput.max);
    const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
    const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
    const clamped = Math.max(clampMin, Math.min(clampMax, raw));
    playerSpellOriginWidthInput.value = String(clamped);
    if(playerSpellOriginWidthDisplay){
      const offset = clamped - SPELL_ORIGIN_SLIDER_CENTER;
      const rounded = Math.round(offset);
      const sign = rounded >= 0 ? '+' : '';
      playerSpellOriginWidthDisplay.textContent = `${sign}${rounded}px`;
    }
  }
  updateHudStats();
  updateHudHealth();
  applyPlayerFloatHudSizing();
  positionPlayerFloatingHud();
  positionPracticeDummyHud();
  updatePracticeDummyUiState();
  setHudMessage();
  setAbilityBar();
  initializeCameraControls();
  cameraState.viewportReady = true;
  syncMenuMeasurements();
  initializeSettingHelp();
  initializeSettingsSearch();
  scheduleHudFit();

  // Timer
  function fmt(ms){ const s=Math.floor(ms/1000); const m=String(Math.floor(s/60)).padStart(2,'0'); return m+':'+String(s%60).padStart(2,'0'); }
  function playGame(){
    if(scoreState.gameOver){
      resetScores();
      timerState.elapsedMs = 0;
    }
    timerState.running = true;
    timerState.start = performance.now() - timerState.elapsedMs;
    pendingSpawns.length = 0;
    timerState.nextWaveAtMs = 0;
    waveState.waveNumber = 0;
    if(btnPlay){
      btnPlay.innerHTML=' Stop <span class="hint">Stop &amp; reset</span>';
    }
  }
  function stopGame({ resetTimer = true, resetMinions = true, resetPlayer = true } = {}){
    if(timerState.running){
      timerState.elapsedMs = performance.now() - timerState.start;
    }
    timerState.running = false;
    if(resetTimer){
      timerState.elapsedMs = 0;
      timerState.start = performance.now();
      timerState.nextWaveAtMs = 0;
      waveState.waveNumber = 0;
      timerState.lastText = '';
    }
    if(resetMinions){
      pendingSpawns.length = 0;
      minions.length = 0;
      attachPracticeDummy();
    }
    if(resetPlayer){
      const restoredHp = Math.max(0, Number(player.maxHp) || 0);
      player.hp = restoredHp;
      player.tauntTimer = 0;
      cancelPlayerAttack();
      updateHudHealth();
      setPlayerAnimationState('idle');
    }
    if(btnPlay){
      btnPlay.innerHTML=' Start <span class="hint">Begin waves</span>';
    }
  }

  // Waves / Minions

  // Tuning
  const MINION_SPEED = 60;
  const MINION_RANGE = 18;
  const MINION_PLAYER_AGGRO_RANGE = 160;
  const MINION_ATTACK_COOLDOWN = 0.8;
  const OFFSIDE_FRACTION = 0.5;

  function setMinionSizePx(size){
    const numericSize = Number(size);
    const safeSize = Number.isFinite(numericSize) ? Math.max(0, numericSize) : 0;
    minionDiameter = safeSize;
    minionRadius = safeSize / 2;
    laneFanSpacing = Math.max(minionDiameter, 1) * 1.35;
    GameState.lanes.minion.diameter = minionDiameter;
    GameState.lanes.minion.radius = minionRadius;
    GameState.lanes.minion.fanSpacing = laneFanSpacing;
    clearAllNavigation();
    ensureDefaultSpawns(true);
  }

  function fanSlotOffset(index){
    if(!Number.isFinite(index) || index <= 0) return 0;
    const layer = Math.floor((index + 1) / 2);
    const sign = index % 2 === 1 ? 1 : -1;
    return layer * sign;
  }

  function ensureLaneConfigCount(count){
    const target = Math.max(1, Math.round(Number(count) || 1));
    while(laneConfigs.length < target){
      laneConfigs.push({ offset: 0 });
    }
    if(laneConfigs.length > target){
      laneConfigs.length = target;
    }
    return laneConfigs;
  }

  function formatLaneOffsetDisplay(value){
    const pct = Math.round((Number(value) || 0) * 100);
    if(pct === 0) return '0%';
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  }

  function setLaneCount(value, { syncInput = true, notify = true } = {}){
    let numeric = Number(value);
    if(!Number.isFinite(numeric)){
      numeric = GameState.lanes.count;
    }
    numeric = Math.max(1, Math.round(numeric));
    GameState.lanes.count = numeric;
    ensureLaneConfigCount(GameState.lanes.count);
    if(syncInput && laneCountInput && laneCountInput.value !== String(GameState.lanes.count)){
      laneCountInput.value = String(GameState.lanes.count);
    }
    updateLaneOffsetControls();
    if(notify){
      invalidateLaneLayout({ resetMinions: true });
    } else {
      GameState.lanes.layoutDirty = true;
      GameState.lanes.layout = null;
    }
    return GameState.lanes.count;
  }

  function updateLaneOffsetControls(){
    if(!laneOffsetList){
      return;
    }
    ensureLaneConfigCount(GameState.lanes.count);
    laneOffsetList.innerHTML = '';
    for(let i=0; i<GameState.lanes.count; i++){
      const row = document.createElement('div');
      row.className = 'formrow rangeRow laneOffsetRow';
      const label = document.createElement('label');
      const inputId = `laneOffset${i + 1}`;
      label.setAttribute('for', inputId);
      label.textContent = `Lane ${i + 1} diagonal offset`;
      const wrap = document.createElement('div');
      wrap.className = 'rangeWrap';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '1';
      input.id = inputId;
      input.min = '-100';
      input.max = '100';
      input.value = String(Math.round((laneConfigs[i].offset || 0) * 100));
      input.dataset.laneIndex = String(i);
      const display = document.createElement('span');
      display.className = 'rangeValue';
      display.id = `laneOffsetDisplay${i + 1}`;
      display.textContent = formatLaneOffsetDisplay(laneConfigs[i].offset || 0);
      input.addEventListener('input', ()=>{
        const normalized = (Number(input.value) || 0) / 100;
        setLaneOffsetNormalized(i, normalized, { syncInput: false, notify: true });
        display.textContent = formatLaneOffsetDisplay(laneConfigs[i].offset || 0);
      });
      wrap.appendChild(input);
      wrap.appendChild(display);
      row.appendChild(label);
      row.appendChild(wrap);
      laneOffsetList.appendChild(row);
    }
  }

  function setLaneOffsetNormalized(index, value, { syncInput = true, notify = true } = {}){
    ensureLaneConfigCount(GameState.lanes.count);
    if(index < 0 || index >= laneConfigs.length){
      return;
    }
    let normalized = Number(value);
    if(!Number.isFinite(normalized)){
      normalized = 0;
    }
    normalized = Math.max(-1, Math.min(1, normalized));
    laneConfigs[index].offset = normalized;
    if(syncInput){
      const input = document.getElementById(`laneOffset${index + 1}`);
      if(input){
        const nextValue = String(Math.round(normalized * 100));
        if(input.value !== nextValue){
          input.value = nextValue;
        }
      }
      const display = document.getElementById(`laneOffsetDisplay${index + 1}`);
      if(display){
        display.textContent = formatLaneOffsetDisplay(normalized);
      }
    }
    if(notify){
      invalidateLaneLayout({ resetMinions: true });
    } else {
      GameState.lanes.layoutDirty = true;
      GameState.lanes.layout = null;
    }
  }

  function invalidateLaneLayout({ resetMinions = true } = {}){
    GameState.lanes.layoutDirty = true;
    GameState.lanes.layout = null;
    if(resetMinions){
      pendingSpawns.length = 0;
      minions.length = 0;
      attachPracticeDummy();
    }
    if(typeof renderMinimap === 'function'){
      try {
        renderMinimap(true);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function ensureLaneLayout(){
    if(!GameState.lanes.layoutDirty && GameState.lanes.layout){
      return GameState.lanes.layout;
    }
    GameState.lanes.layout = buildLaneLayout();
    GameState.lanes.layoutDirty = false;
    return GameState.lanes.layout;
  }

  function buildLaneLayout(){
    ensureLaneConfigCount(GameState.lanes.count);
    const version = GameState.lanes.version++;
    const startBlue = blueSpawns[0];
    const startRed = redSpawns[0];
    if(!startBlue || !startRed){
      return { version, lanes: [], bluePaths: [], redPaths: [] };
    }
    const start = { x: startBlue.x, y: startBlue.y };
    const end = { x: startRed.x, y: startRed.y };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const laneLen = Math.hypot(dx, dy) || 1;
    const dirX = dx / laneLen;
    const dirY = dy / laneLen;
    const diagX = dirY;
    const diagY = -dirX;
    const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const maxOffset = Math.min(laneLen * 0.35, Math.max(mapState.width, mapState.height) * 0.4);
    const clampCoord = (value, max) => Math.max(0, Math.min(max, value));
    const lanes = [];
    for(let i=0; i<GameState.lanes.count; i++){
      const baseNorm = GameState.lanes.count > 1 ? (-1 + (2 * i) / (GameState.lanes.count - 1)) : 0;
      const cfg = laneConfigs[i] || { offset: 0 };
      const userNorm = Math.max(-1, Math.min(1, Number(cfg.offset) || 0));
      const finalNorm = Math.max(-1, Math.min(1, baseNorm + userNorm));
      const offset = finalNorm * maxOffset;
      const middle = {
        x: clampCoord(center.x + diagX * offset, mapState.width),
        y: clampCoord(center.y + diagY * offset, mapState.height)
      };
      const label = String(i + 1);
      const bluePath = buildLanePath(start, middle, end, i, label, version);
      const redPath = buildLanePath(end, middle, start, i, label, version);
      lanes.push({ index: i, label, middle, control: bluePath.control, bluePath, redPath });
    }
    return {
      version,
      lanes,
      bluePaths: lanes.map(l => l.bluePath),
      redPaths: lanes.map(l => l.redPath),
      maxOffset
    };
  }

  function buildLanePath(start, middle, end, laneIndex, label, version){
    const startPoint = { x: start.x, y: start.y };
    const endPoint = { x: end.x, y: end.y };
    const middlePoint = { x: middle.x, y: middle.y };
    const control = {
      x: 2 * middlePoint.x - (startPoint.x + endPoint.x) / 2,
      y: 2 * middlePoint.y - (startPoint.y + endPoint.y) / 2
    };
    const SAMPLES = 60;
    const points = [];
    for(let i=0; i<=SAMPLES; i++){
      const t = i / SAMPLES;
      const omt = 1 - t;
      const x = omt * omt * startPoint.x + 2 * omt * t * control.x + t * t * endPoint.x;
      const y = omt * omt * startPoint.y + 2 * omt * t * control.y + t * t * endPoint.y;
      points.push({ x, y });
    }
    const segments = [];
    let totalLength = 0;
    for(let i=0; i<points.length - 1; i++){
      const a = points[i];
      const b = points[i + 1];
      const segDx = b.x - a.x;
      const segDy = b.y - a.y;
      const length = Math.hypot(segDx, segDy);
      if(!(length > 0)){
        continue;
      }
      const dirX = segDx / length;
      const dirY = segDy / length;
      segments.push({
        from: a,
        to: b,
        length,
        dirX,
        dirY,
        normalX: -dirY,
        normalY: dirX,
        startDistance: totalLength,
        endDistance: totalLength + length
      });
      totalLength += length;
    }
    return {
      from: startPoint,
      to: endPoint,
      middle: middlePoint,
      control,
      segments,
      totalLength,
      label,
      laneIndex,
      version
    };
  }

  function lanePointAtDistance(path, distance){
    if(!path){
      return null;
    }
    const segments = path.segments || [];
    if(!segments.length){
      return {
        point: { x: path.from ? path.from.x : 0, y: path.from ? path.from.y : 0 },
        dirX: 1,
        dirY: 0,
        normalX: 0,
        normalY: 1,
        distance: 0
      };
    }
    const target = Math.max(0, Math.min(path.totalLength, Number(distance) || 0));
    for(const segment of segments){
      if(target <= segment.endDistance){
        const span = segment.endDistance - segment.startDistance;
        const ratio = span > 0 ? (target - segment.startDistance) / span : 0;
        const x = segment.from.x + (segment.to.x - segment.from.x) * ratio;
        const y = segment.from.y + (segment.to.y - segment.from.y) * ratio;
        return {
          point: { x, y },
          dirX: segment.dirX,
          dirY: segment.dirY,
          normalX: segment.normalX,
          normalY: segment.normalY,
          distance: target
        };
      }
    }
    const last = segments[segments.length - 1];
    return {
      point: { x: last.to.x, y: last.to.y },
      dirX: last.dirX,
      dirY: last.dirY,
      normalX: last.normalX,
      normalY: last.normalY,
      distance: path.totalLength
    };
  }

  function projectPointOntoLane(path, x, y){
    if(!path || !path.segments || !path.segments.length){
      return null;
    }
    if(!Number.isFinite(x) || !Number.isFinite(y)){
      return null;
    }
    let best = null;
    for(const segment of path.segments){
      const segDx = segment.to.x - segment.from.x;
      const segDy = segment.to.y - segment.from.y;
      const segLenSq = segDx * segDx + segDy * segDy;
      let t = 0;
      if(segLenSq > 0){
        t = ((x - segment.from.x) * segDx + (y - segment.from.y) * segDy) / segLenSq;
      }
      t = Math.max(0, Math.min(1, t));
      const projX = segment.from.x + segDx * t;
      const projY = segment.from.y + segDy * t;
      const dx = x - projX;
      const dy = y - projY;
      const distSq = dx * dx + dy * dy;
      if(!best || distSq < best.distSq){
        best = {
          distSq,
          distance: segment.startDistance + segment.length * t,
          pointX: projX,
          pointY: projY,
          dirX: segment.dirX,
          dirY: segment.dirY,
          normalX: segment.normalX,
          normalY: segment.normalY
        };
      }
    }
    if(!best){
      return null;
    }
    return {
      distance: best.distance,
      point: { x: best.pointX, y: best.pointY },
      dirX: best.dirX,
      dirY: best.dirY,
      normalX: best.normalX,
      normalY: best.normalY,
      dist: Math.sqrt(best.distSq)
    };
  }

  function getLanePathsForSide(side){
    const layout = ensureLaneLayout();
    if(!layout){
      return [];
    }
    return side === 'red' ? layout.redPaths : layout.bluePaths;
  }

  function updateMinionLaneFrame(minion){
    if(!minion || !minion.lanePath){
      minion.laneProjection = null;
      if(minion){
        minion.offLaneDistance = 0;
        if(!Number.isFinite(minion.laneProgress)){
          minion.laneProgress = 0;
        }
      }
      return null;
    }
    const projection = projectPointOntoLane(minion.lanePath, minion.x, minion.y);
    if(!projection){
      minion.laneProjection = null;
      minion.offLaneDistance = 0;
      return null;
    }
    minion.laneProjection = projection;
    minion.laneDir = { x: projection.dirX, y: projection.dirY };
    minion.laneNormal = { x: projection.normalX, y: projection.normalY };
    minion.laneFacing = Math.atan2(projection.dirY, projection.dirX);
    minion.pathDistance = projection.distance;
    const laneLength = Number.isFinite(minion.laneLength) ? minion.laneLength
      : (minion.lanePath && Number.isFinite(minion.lanePath.totalLength) ? minion.lanePath.totalLength : undefined);
    if(!Number.isFinite(minion.laneProgress)){
      minion.laneProgress = projection.distance;
    } else {
      const capped = Number.isFinite(laneLength) ? Math.min(laneLength, projection.distance) : projection.distance;
      minion.laneProgress = Math.max(minion.laneProgress, capped);
    }
    minion.offLaneDistance = Number.isFinite(projection.dist) ? projection.dist : 0;
    return projection;
  }

  // Portal behavior
  const PORTAL_R = 14;
  const PORTAL_INTAKE_R = PORTAL_R * 1.6;
  const PORTAL_SUCTION = 1.6;

  ensureDefaultSpawns();

  // Customizable base stats + per-wave scaling
  // Scoring

  function updateGoldUI(){
    if(!goldDisplay) return;
    const safeGold = Math.max(0, goldState.player);
    let displayText;
    if(safeGold < 100){
      const formatted = safeGold.toFixed(1);
      displayText = formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
    } else {
      displayText = String(Math.round(safeGold));
    }
    if(displayText === goldState.lastDisplayText){
      return;
    }
    goldState.lastDisplayText = displayText;
    goldDisplay.textContent = displayText;
    scheduleHudFit();
  }
  function addGold(amount){
    if(!Number.isFinite(amount) || amount <= 0) return;
    goldState.player = Math.max(0, goldState.player + amount);
    updateGoldUI();
  }
  function resetGold(){
    goldState.player = 0;
    updateGoldUI();
  }
  updateGoldUI();

  function updateScoreUI(){
    let changed = false;
    if(scoreBlueEl){
      const blueText = String(scoreState.blue);
      if(blueText !== scoreState.lastBlueText){
        scoreBlueEl.textContent = blueText;
        scoreState.lastBlueText = blueText;
        changed = true;
      }
    }
    if(scoreRedEl){
      const redText = String(scoreState.red);
      if(redText !== scoreState.lastRedText){
        scoreRedEl.textContent = redText;
        scoreState.lastRedText = redText;
        changed = true;
      }
    }
    if(changed){
      scheduleHudFit();
    }
  }
  function setWinner(side){
    scoreState.gameOver = true;
    stopGame({ resetTimer: false, resetMinions: false, resetPlayer: false });
    const msg = side === 'blue' ? 'Blue wins!' : 'Red wins!';
    winBanner.textContent = msg;
    winBanner.classList.add('show');
  }
  function addScore(side, amount){
    if(scoreState.gameOver) return;
    if(side==='blue'){ scoreState.blue += amount; }
    else { scoreState.red += amount; }
    updateScoreUI();
    if(scoreState.blue>=scoreState.winTarget) setWinner('blue');
    else if(scoreState.red>=scoreState.winTarget) setWinner('red');
  }
  function resetScores(){
    scoreState.blue=0; scoreState.red=0; scoreState.gameOver=false;
    updateScoreUI();
    winBanner.classList.remove('show');
    resetGold();
  }
  resetScoreBtn.addEventListener('click', resetScores);

  // Image loading
  function syncCameraDimensions(){
    const safeScale = Math.max(0.001, Number(camera.scale) || 1);
    camera.width = camera.baseWidth / safeScale;
    camera.height = camera.baseHeight / safeScale;
  }
  syncCameraDimensions();

  function applyMinimapPointerState(){
    if(!minimapCanvas){
      return;
    }
    const visible = minimapState.layoutVisible && minimapState.effectiveScale > 0;
    const pointerEnabled = visible && !minimapState.clickThroughEnabled;
    minimapCanvas.dataset.clickthrough = minimapState.clickThroughEnabled ? 'true' : 'false';
    minimapCanvas.dataset.clickToMove = minimapState.clickToMoveEnabled ? 'true' : 'false';
    minimapCanvas.style.pointerEvents = pointerEnabled ? 'auto' : 'none';
    minimapCanvas.style.cursor = pointerEnabled && minimapState.clickToMoveEnabled ? 'pointer' : 'default';
  }

  function setMinimapClickToMove(value, { syncInput = true } = {}){
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
    const enabled = normalized === true || normalized === 'enabled' || normalized === 'true' || normalized === 'on';
    minimapState.clickToMoveEnabled = !!enabled;
    if(minimapClickToMoveSelect && syncInput){
      minimapClickToMoveSelect.value = minimapState.clickToMoveEnabled ? 'enabled' : 'disabled';
    }
    applyMinimapPointerState();
  }

  function setMinimapClickThrough(value, { syncInput = true } = {}){
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
    const enabled = normalized === true || normalized === 'allow' || normalized === 'enabled' || normalized === 'true' || normalized === 'on';
    minimapState.clickThroughEnabled = !!enabled;
    if(minimapClickThroughSelect && syncInput){
      minimapClickThroughSelect.value = minimapState.clickThroughEnabled ? 'allow' : 'blocked';
    }
    applyMinimapPointerState();
  }

  function setMinimapUserScale(value, { syncInput = true } = {}){
    let numeric = Number(value);
    if(!Number.isFinite(numeric)){
      numeric = minimapState.userScale;
    }
    numeric = Math.max(0, Math.min(5, numeric));
    minimapState.userScale = numeric;
    if(minimapScaleInput && syncInput){
      minimapScaleInput.value = String(numeric);
    }
    applyMinimapScale();
  }

  function applyMinimapScale(){
    const combined = Math.max(0, Math.min(5, minimapState.autoScale * minimapState.userScale));
    minimapState.effectiveScale = combined;
    if(rootStyle){
      rootStyle.setProperty('--minimap-scale', combined.toFixed(3));
    }
    if(minimapCanvas){
      const px = Math.max(0, MINIMAP_BASE_SIZE * combined);
      minimapCanvas.style.width = `${px}px`;
      minimapCanvas.style.height = `${px}px`;
      const visible = combined > 0 && minimapState.layoutVisible;
      minimapCanvas.style.visibility = visible ? 'visible' : 'hidden';
      minimapCanvas.setAttribute('aria-hidden', visible ? 'false' : 'true');
      const targetSize = Math.max(1, Math.round(Math.max(px, 1)));
      if(minimapCanvas.width !== targetSize){ minimapCanvas.width = targetSize; }
      if(minimapCanvas.height !== targetSize){ minimapCanvas.height = targetSize; }
    }
    applyMinimapPointerState();
    if(minimapCtx){
      renderMinimap(true);
    }
  }

  function updateMinimapScale(baseWidth, baseHeight){
    if(!rootStyle){
      return;
    }
    const safeWidth = Math.max(0, Number(baseWidth) || 0);
    const safeHeight = Math.max(0, Number(baseHeight) || 0);
    const widthRatio = (safeWidth - MINIMAP_MARGIN) > 0 ? (safeWidth - MINIMAP_MARGIN) / MINIMAP_BASE_SIZE : 0;
    const heightRatio = (safeHeight - MINIMAP_MARGIN) > 0 ? (safeHeight - MINIMAP_MARGIN) / MINIMAP_BASE_SIZE : 0;
    const candidates = [1, Math.max(0, widthRatio), Math.max(0, heightRatio)].filter((value) => Number.isFinite(value));
    let scale = candidates.length ? Math.min(...candidates) : 1;
    if(!(scale > 0)){
      const fallbackWidth = safeWidth > 0 ? safeWidth / MINIMAP_BASE_SIZE : 0;
      const fallbackHeight = safeHeight > 0 ? safeHeight / MINIMAP_BASE_SIZE : 0;
      const fallback = Math.max(fallbackWidth, fallbackHeight);
      scale = fallback > 0 ? Math.min(1, fallback) : 0;
    }
    const readabilityMin = 0.2;
    if(scale < readabilityMin && widthRatio >= readabilityMin && heightRatio >= readabilityMin){
      scale = readabilityMin;
    }
    scale = Math.max(0, Math.min(1, scale));
    minimapState.autoScale = scale;
    applyMinimapScale();
  }

  function fitCameraStageToViewport(viewport){
    if(!cameraState.viewportReady){
      return;
    }
    const metrics = viewport || measureViewport();
    const width = Math.max(0, Number(metrics && metrics.width) || 0);
    const height = Math.max(0, Number(metrics && metrics.height) || 0);
    if(!(width > 0) || !(height > 0)){
      return;
    }
    const widthLimit = Math.min(3000, width);
    const heightLimit = Math.min(3000, height);
    let scale = Math.min(widthLimit / BASE_CAMERA_WIDTH, heightLimit / BASE_CAMERA_HEIGHT);
    if(!Number.isFinite(scale) || scale <= 0){
      scale = 1;
    }
    const maxScale = Math.min(3000 / BASE_CAMERA_WIDTH, 3000 / BASE_CAMERA_HEIGHT);
    scale = Math.min(scale, maxScale);
    const nextBaseWidth = Math.max(1, Math.round(BASE_CAMERA_WIDTH * scale));
    const nextBaseHeight = Math.max(1, Math.round(BASE_CAMERA_HEIGHT * scale));
    updateMinimapScale(nextBaseWidth, nextBaseHeight);
    if(nextBaseWidth === camera.baseWidth && nextBaseHeight === camera.baseHeight){
      return;
    }
    camera.baseWidth = nextBaseWidth;
    camera.baseHeight = nextBaseHeight;
    syncCameraDimensions();
    rootStyle.setProperty('--camera-w', String(nextBaseWidth));
    rootStyle.setProperty('--camera-h', String(nextBaseHeight));
    if(canvas){
      if(canvas.width !== nextBaseWidth){ canvas.width = nextBaseWidth; }
      if(canvas.height !== nextBaseHeight){ canvas.height = nextBaseHeight; }
    }
    clampCameraToBounds();
    updateCamera(true, 0, { force: true });
    renderMinimap(true);
    updateStagePointerState();
  }

  function setVars(){
    syncCameraDimensions();
    document.documentElement.style.setProperty('--map-w', String(mapState.width));
    document.documentElement.style.setProperty('--map-h', String(mapState.height));
    document.documentElement.style.setProperty('--camera-w', camera.baseWidth);
    document.documentElement.style.setProperty('--camera-h', camera.baseHeight);
    updateMinimapScale(camera.baseWidth, camera.baseHeight);
    if(view){
      view.style.width = `${mapState.width}px`;
      view.style.height = `${mapState.height}px`;
    }
    if(canvas){
      if(canvas.width !== camera.baseWidth){ canvas.width = camera.baseWidth; }
      if(canvas.height !== camera.baseHeight){ canvas.height = camera.baseHeight; }
    }
    let playerRef = null;
    try {
      playerRef = player;
    } catch (err) {
      playerRef = null;
    }
    if(playerRef){
      const minX = playerRef.r;
      const minY = playerRef.r;
      const maxX = Math.max(minX, mapState.width - playerRef.r);
      const maxY = Math.max(minY, mapState.height - playerRef.r);
      playerRef.x = Math.max(minX, Math.min(maxX, playerRef.x));
      playerRef.y = Math.max(minY, Math.min(maxY, playerRef.y));
      playerRef.target.x = Math.max(minX, Math.min(maxX, playerRef.target.x));
      playerRef.target.y = Math.max(minY, Math.min(maxY, playerRef.target.y));
    }
    const clampVisionCoord = (value, max) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
    for(const source of customVisionSources){
      if(!source) continue;
      source.x = clampVisionCoord(source.x, mapState.width);
      source.y = clampVisionCoord(source.y, mapState.height);
    }
    if(visionDummy){
      visionDummy.x = clampVisionCoord(visionDummy.x, mapState.width);
      visionDummy.y = clampVisionCoord(visionDummy.y, mapState.height);
    }
    positionPlayerFloatingHud();
    positionPracticeDummyHud();
    camera.manualOffsetX = 0;
    camera.manualOffsetY = 0;
    lastCameraTransformX = null;
    lastCameraTransformY = null;
    lastCameraTransformScale = null;
    camera.lastTransform.x = null;
    camera.lastTransform.y = null;
    camera.lastTransform.scale = null;
    updateCamera(true, 0, { force: true });
    renderMinimap(true);
  }
  function markFileLoaded(el, loaded){ if(el) el.classList.toggle('loaded', !!loaded); }
  function invalidateHitbox(message){
    GameState.map.hitbox.loaded = false;
    GameState.map.hitbox.width = 0;
    GameState.map.hitbox.height = 0;
    GameState.map.hitbox.data = null;
    GameState.map.hitbox.displayName = '';
    if(hitboxImg) hitboxImg.removeAttribute('src');
    if(hitboxName) hitboxName.textContent = message || 'No hitbox map loaded';
    markFileLoaded(hitboxNameWrap, false);
    clearAllNavigation(true);
  }
  function rebuildHitboxData(){
    if(!hitboxImg) return;
    const width = hitboxImg.naturalWidth || 0;
    const height = hitboxImg.naturalHeight || 0;
    if(!width || !height){
      invalidateHitbox('Hitbox map failed to load');
      return;
    }
    if(mapState.loaded && (width !== mapState.width || height !== mapState.height)){
      invalidateHitbox('Hitbox size must match art map. Please upload again.');
      return;
    }
    if(!hitboxCtx){
      GameState.map.hitbox.data = null;
      GameState.map.hitbox.loaded = false;
      return;
    }
    GameState.map.hitbox.width = width;
    GameState.map.hitbox.height = height;
    hitboxCanvas.width = width;
    hitboxCanvas.height = height;
    hitboxCtx.clearRect(0,0,width,height);
    hitboxCtx.drawImage(hitboxImg, 0, 0, width, height);
    const raw = hitboxCtx.getImageData(0,0,width,height).data;
    const total = width * height;
    const arr = new Uint8Array(total);
    for(let i=0;i<total;i++){
      const idx = i*4;
      const r = raw[idx];
      const g = raw[idx+1];
      const b = raw[idx+2];
      const a = raw[idx+3];
      arr[i] = (a>0 && r===0 && g===0 && b===0) ? 1 : 0;
    }
    GameState.map.hitbox.data = arr;
    GameState.map.hitbox.loaded = true;
    clearAllNavigation();
    if(hitboxName){ hitboxName.textContent = GameState.map.hitbox.displayName || hitboxName.textContent || 'Hitbox map loaded'; }
    markFileLoaded(hitboxNameWrap, true);
  }
  function ensureHitboxMatchesArt(){
    if(mapState.hitbox.loaded && (mapState.hitbox.width !== mapState.width || mapState.hitbox.height !== mapState.height)){
      invalidateHitbox('Hitbox cleared  size mismatch. Please upload matching hitbox map.');
    }
  }
  function useArtImage(src, name){ img.src = src; if (name) fileName.textContent = name; }
  img.addEventListener('load', ()=>{
    const nextWidth = img.naturalWidth || mapState.width;
    const nextHeight = img.naturalHeight || mapState.height;
    mapState.width = nextWidth;
    mapState.height = nextHeight;
    setVars();
    mapState.loaded = !!img.src;
    markFileLoaded(fileNameWrap, mapState.loaded);
    clearAllNavigation(true);
    ensureHitboxMatchesArt();
    ensureDefaultSpawns(true);
  });
  img.addEventListener('error', ()=>{
    mapState.loaded = false;
    markFileLoaded(fileNameWrap, false);
    if(fileName) fileName.textContent = 'Map failed to load';
  });
  btnMap.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', (e)=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>useArtImage(r.result,f.name);
    r.readAsDataURL(f);
    e.target.value = '';
  });
  btnHitbox.addEventListener('click', ()=> hitboxInput.click());
  hitboxInput.addEventListener('change', (e)=>{
    const f=e.target.files && e.target.files[0]; if(!f) return;
    const r=new FileReader();
    GameState.map.hitbox.loaded = false;
    markFileLoaded(hitboxNameWrap, false);
    GameState.map.hitbox.displayName = f.name || '';
    if(hitboxName) hitboxName.textContent = GameState.map.hitbox.displayName || 'Loading hitbox map';
    r.onload=()=>{ hitboxImg.src = r.result; };
    r.readAsDataURL(f);
    e.target.value = '';
  });
  hitboxImg.addEventListener('load', rebuildHitboxData);
  hitboxImg.addEventListener('error', ()=>{
    invalidateHitbox('Hitbox map failed to load');
  });
  stage.addEventListener('dragover', e=>{ e.preventDefault(); });
  stage.addEventListener('drop', e=>{
    e.preventDefault();
    const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>useArtImage(r.result,f.name); r.readAsDataURL(f);
  });

  function hitboxPixelsReady(){ return !!(GameState.map.hitbox.loaded && GameState.map.hitbox.data && GameState.map.hitbox.data.length); }
  function hitboxActive(){ return hitboxPixelsReady() || customColliders.length > 0; }
  function circleCollides(x, y, radius){
    if(customColliders.length && collidersBlockCircle(x, y, radius)){
      return true;
    }
    if(!hitboxPixelsReady()) return false;
    if(radius <= 0){
      const px = Math.floor(x);
      const py = Math.floor(y);
      if(px < 0 || py < 0 || px >= GameState.map.hitbox.width || py >= GameState.map.hitbox.height) return true;
      return !!GameState.map.hitbox.data[py * GameState.map.hitbox.width + px];
    }
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(GameState.map.hitbox.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(GameState.map.hitbox.height - 1, Math.ceil(y + radius));
    const rSq = radius * radius;
    for(let py=minY; py<=maxY; py++){
      const rowIndex = py * GameState.map.hitbox.width;
      for(let px=minX; px<=maxX; px++){
        if(GameState.map.hitbox.data[rowIndex + px]){
          const dx = (px + 0.5) - x;
          const dy = (py + 0.5) - y;
          if(dx*dx + dy*dy <= rSq) return true;
        }
      }
    }
    return false;
  }
  function collidersBlockCircle(x, y, radius){
    const r = Math.max(0, Number(radius) || 0);
    for(let i=0;i<customColliders.length;i++){
      const collider = customColliders[i];
      if(!collider) continue;
      if(colliderBlocksCircle(collider, x, y, r)){
        return true;
      }
    }
    return false;
  }
  function colliderBlocksCircle(collider, x, y, radius){
    if(!collider) return false;
    const type = collider.type === 'capsule' ? 'capsule'
      : (collider.type === 'crescent' ? 'crescent' : 'circle');
    const cx = Number(collider.x) || 0;
    const cy = Number(collider.y) || 0;
    if(type === 'circle'){
      const rad = Math.max(0, Number(collider.radius) || 0);
      const dx = x - cx;
      const dy = y - cy;
      return Math.hypot(dx, dy) <= rad + radius;
    }
    if(type === 'crescent'){
      const metrics = ensureCrescentMetrics(collider);
      const distOuter = Math.hypot(x - metrics.cx, y - metrics.cy);
      if(distOuter > metrics.radius + radius) return false;
      if(metrics.innerRadius <= 0) return true;
      const distInner = Math.hypot(x - metrics.innerCx, y - metrics.innerCy);
      return distInner + radius > metrics.innerRadius;
    }
    return circleIntersectsCapsule(x, y, radius, collider);
  }
  function ensureCapsuleMetrics(collider){
    const radius = clampSettingValue(Number(collider && collider.radius), SETTINGS_RANGE_MIN);
    const rawLength = Number(collider && collider.length);
    const fallbackLength = radius * 2;
    const totalLength = Number.isFinite(rawLength)
      ? clampSettingValue(rawLength, fallbackLength)
      : clampSettingValue(fallbackLength);
    const span = Math.max(0, totalLength - radius * 2);
    const halfSpan = span / 2;
    const angle = Number.isFinite(collider.angle) ? collider.angle : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ax = collider.x - cos * halfSpan;
    const ay = collider.y - sin * halfSpan;
    const bx = collider.x + cos * halfSpan;
    const by = collider.y + sin * halfSpan;
    const reach = halfSpan + radius;
    return { radius, totalLength, span, halfSpan, angle, ax, ay, bx, by, reach };
  }
  function ensureCrescentMetrics(collider){
    const cx = Number(collider && collider.x) || 0;
    const cy = Number(collider && collider.y) || 0;
    const radius = clampSettingValue(Number(collider && collider.radius), SETTINGS_RANGE_MIN);
    const rawInner = collider ? Number(collider.innerRadius) : NaN;
    let innerRadius = Number.isFinite(rawInner)
      ? clampSettingValue(rawInner, radius * 0.6)
      : clampSettingValue(radius * 0.6);
    innerRadius = Math.min(radius, innerRadius);
    const rawOffset = collider ? Number(collider.offset) : NaN;
    const fallbackOffset = radius > 0 ? (radius + innerRadius) / 2 : SETTINGS_RANGE_MIN;
    let offset = Number.isFinite(rawOffset)
      ? clampSettingValue(rawOffset, fallbackOffset)
      : clampSettingValue(fallbackOffset);
    const maxOffset = radius + innerRadius;
    offset = Math.min(maxOffset, Math.max(SETTINGS_RANGE_MIN, offset));
    const angle = Number.isFinite(collider && collider.angle) ? collider.angle : 0;
    if(collider){
      collider.radius = radius;
      collider.innerRadius = innerRadius;
      collider.offset = offset;
      collider.angle = angle;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const innerCx = cx + cos * offset;
    const innerCy = cy + sin * offset;
    return { cx, cy, radius, innerRadius, offset, angle, innerCx, innerCy };
  }
  function distancePointToSegment(px, py, ax, ay, bx, by){
    const vx = bx - ax;
    const vy = by - ay;
    const lenSq = vx*vx + vy*vy;
    if(lenSq <= 1e-9){
      return Math.hypot(px - ax, py - ay);
    }
    const t = ((px - ax) * vx + (py - ay) * vy) / lenSq;
    const clamped = Math.max(0, Math.min(1, t));
    const closestX = ax + vx * clamped;
    const closestY = ay + vy * clamped;
    return Math.hypot(px - closestX, py - closestY);
  }
  function circleIntersectsCapsule(x, y, radius, collider){
    const metrics = ensureCapsuleMetrics(collider);
    if(metrics.span <= 0){
      return Math.hypot(x - collider.x, y - collider.y) <= metrics.radius + radius;
    }
    const dist = distancePointToSegment(x, y, metrics.ax, metrics.ay, metrics.bx, metrics.by);
    return dist <= metrics.radius + radius;
  }
  function stepAlongAxis(start, delta, fixedCoord, radius, isX){
    let lo = 0;
    let hi = 1;
    let best = 0;
    for(let i=0;i<5;i++){
      const mid = (lo + hi) / 2;
      const candidate = start + delta * mid;
      const cx = isX ? candidate : fixedCoord;
      const cy = isX ? fixedCoord : candidate;
      if(circleCollides(cx, cy, radius)) hi = mid;
      else { best = mid; lo = mid; }
    }
    return start + delta * best;
  }
  function moveCircleWithCollision(x, y, moveX, moveY, radius){
    const targetX = x + moveX;
    const targetY = y + moveY;
    if(!hitboxActive()) return {x: targetX, y: targetY};
    if(!circleCollides(targetX, targetY, radius)) return {x: targetX, y: targetY};
    let newX = x;
    let newY = y;
    if(moveX !== 0){
      const candidateX = x + moveX;
      if(!circleCollides(candidateX, y, radius)) newX = candidateX;
      else newX = stepAlongAxis(x, moveX, y, radius, true);
    }
    if(moveY !== 0){
      const candidateY = y + moveY;
      if(!circleCollides(newX, candidateY, radius)) newY = candidateY;
      else newY = stepAlongAxis(y, moveY, newX, radius, false);
    }
    if(circleCollides(newX, newY, radius)) return {x, y};
    return {x: newX, y: newY};
  }

  // === Navigation helpers (grid-based A*) ===
  const NAV_CELL_SIZE = 14;
  const NAV_LINE_STEP = NAV_CELL_SIZE * 0.5;

  function navGoalKey(goal, radius){
    return goal ? `${goal.x.toFixed(1)}|${goal.y.toFixed(1)}|${radius.toFixed(1)}` : '';
  }

  function clearEntityNav(entity){ if(entity && entity.nav){ entity.nav = null; } }

  function clearAllNavigation(resetPlayerGoal = false){
    player.nav = null;
    if(resetPlayerGoal){ player.navGoal = null; }
    for(const m of minions){ if(m.nav) m.nav = null; }
  }

  function pointToCell(x, y){
    const cx = Math.max(0, Math.min(Math.floor(x / NAV_CELL_SIZE), Math.ceil(mapState.width / NAV_CELL_SIZE) - 1));
    const cy = Math.max(0, Math.min(Math.floor(y / NAV_CELL_SIZE), Math.ceil(mapState.height / NAV_CELL_SIZE) - 1));
    return {cx, cy};
  }

  function cellCenter(cx, cy){
    const x = Math.max(0, Math.min(mapState.width - 1, (cx + 0.5) * NAV_CELL_SIZE));
    const y = Math.max(0, Math.min(mapState.height - 1, (cy + 0.5) * NAV_CELL_SIZE));
    return {x, y};
  }

  function isCellWalkable(cx, cy, cols, rows, radius){
    if(cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    const {x, y} = cellCenter(cx, cy);
    return !circleCollides(x, y, radius);
  }

  function findNearestWalkableCell(cx, cy, cols, rows, radius){
    const startCx = Math.max(0, Math.min(cols - 1, cx));
    const startCy = Math.max(0, Math.min(rows - 1, cy));
    if(isCellWalkable(startCx, startCy, cols, rows, radius)){
      return {cx: startCx, cy: startCy, adjusted: false};
    }
    const visited = new Uint8Array(cols * rows);
    const queue = [{cx: startCx, cy: startCy, dist: 0}];
    const neighborSteps = [
      [-1,  0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1]
    ];
    let head = 0;
    visited[startCy * cols + startCx] = 1;
    const MAX_SEARCH = 42;
    while(head < queue.length){
      const {cx: qx, cy: qy, dist} = queue[head++];
      if(dist >= MAX_SEARCH) continue;
      for(const [dx, dy] of neighborSteps){
        const nx = qx + dx;
        const ny = qy + dy;
        if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const idx = ny * cols + nx;
        if(visited[idx]) continue;
        visited[idx] = 1;
        if(isCellWalkable(nx, ny, cols, rows, radius)){
          return {cx: nx, cy: ny, adjusted: true};
        }
        queue.push({cx: nx, cy: ny, dist: dist + 1});
      }
    }
    return null;
  }

  function lineOfSight(ax, ay, bx, by, radius){
    const dist = Math.hypot(bx - ax, by - ay);
    if(dist === 0) return !circleCollides(ax, ay, radius);
    const steps = Math.max(1, Math.ceil(dist / Math.max(4, NAV_LINE_STEP)));
    for(let i=1;i<steps;i++){
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if(circleCollides(x, y, radius)) return false;
    }
    return !circleCollides(bx, by, radius);
  }

  function simplifyPath(points, radius){
    if(points.length <= 2) return points.slice();
    const result = [points[0]];
    for(let i=2;i<points.length;i++){
      const anchor = result[result.length - 1];
      const candidate = points[i];
      if(!lineOfSight(anchor.x, anchor.y, candidate.x, candidate.y, radius)){
        result.push(points[i-1]);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  function findPath(start, goal, radius){
    if(!hitboxActive()) return null;
    const cols = Math.ceil(mapState.width / NAV_CELL_SIZE);
    const rows = Math.ceil(mapState.height / NAV_CELL_SIZE);
    let startCell = pointToCell(start.x, start.y);
    let goalCell = pointToCell(goal.x, goal.y);
    const startInfo = findNearestWalkableCell(startCell.cx, startCell.cy, cols, rows, radius);
    if(!startInfo) return null;
    startCell = {cx: startInfo.cx, cy: startInfo.cy};
    const goalInfo = findNearestWalkableCell(goalCell.cx, goalCell.cy, cols, rows, radius);
    if(!goalInfo) return null;
    goalCell = {cx: goalInfo.cx, cy: goalInfo.cy};
    const goalPoint = goalInfo.adjusted ? cellCenter(goalCell.cx, goalCell.cy) : {x: goal.x, y: goal.y};

    const total = cols * rows;
    const gScore = new Array(total).fill(Infinity);
    const fScore = new Array(total).fill(Infinity);
    const came = new Int32Array(total);
    came.fill(-1);
    const closed = new Uint8Array(total);

    function indexOf(cx, cy){ return cy * cols + cx; }
    function coordsOf(index){ return { cx: index % cols, cy: Math.floor(index / cols) }; }

    const startIdx = indexOf(startCell.cx, startCell.cy);
    const goalIdx = indexOf(goalCell.cx, goalCell.cy);
    const open = [startIdx];
    gScore[startIdx] = 0;
    fScore[startIdx] = Math.hypot(goalCell.cx - startCell.cx, goalCell.cy - startCell.cy);

    const neighborOffsets = [
      [-1,  0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
      [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]
    ];

    while(open.length){
      let bestIndex = 0;
      for(let i=1;i<open.length;i++){
        if(fScore[open[i]] < fScore[open[bestIndex]]) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      if(current === goalIdx) break;
      if(closed[current]) continue;
      closed[current] = 1;
      const {cx, cy} = coordsOf(current);

      for(const [dx, dy, cost] of neighborOffsets){
        const nx = cx + dx;
        const ny = cy + dy;
        if(!isCellWalkable(nx, ny, cols, rows, radius)) continue;
        if(dx !== 0 && dy !== 0){
          if(!isCellWalkable(cx + dx, cy, cols, rows, radius)) continue;
          if(!isCellWalkable(cx, cy + dy, cols, rows, radius)) continue;
        }
        const neighborIdx = indexOf(nx, ny);
        if(closed[neighborIdx]) continue;
        const tentative = gScore[current] + cost;
        if(tentative < gScore[neighborIdx]){
          gScore[neighborIdx] = tentative;
          const heuristic = Math.hypot(goalCell.cx - nx, goalCell.cy - ny);
          fScore[neighborIdx] = tentative + heuristic;
          came[neighborIdx] = current;
          if(!open.includes(neighborIdx)) open.push(neighborIdx);
        }
      }
    }

    if(came[goalIdx] === -1 && goalIdx !== startIdx) return null;
    const cells = [];
    let cur = goalIdx;
    while(cur !== -1 && cur !== startIdx){
      cells.push(cur);
      cur = came[cur];
    }
    cells.reverse();

    const rawPoints = [{x: start.x, y: start.y}];
    if(startInfo.adjusted){
      rawPoints.push(cellCenter(startCell.cx, startCell.cy));
    }
    for(const idx of cells){
      const {cx, cy} = coordsOf(idx);
      rawPoints.push(cellCenter(cx, cy));
    }
    rawPoints.push(goalPoint);

    const simplified = simplifyPath(rawPoints, radius);
    if(simplified.length <= 1) return [goalPoint];
    simplified.shift();
    return simplified;
  }

  function ensureNavForEntity(entity, goal, radius){
    if(!hitboxActive() || !goal) return null;
    const distanceToGoal = Math.hypot(goal.x - entity.x, goal.y - entity.y);
    if(distanceToGoal <= Math.max(radius * 0.8, NAV_CELL_SIZE * 0.5)){
      clearEntityNav(entity);
      return null;
    }
    const key = navGoalKey(goal, radius);
    if(!entity.nav || entity.nav.key !== key){
      const path = findPath({x: entity.x, y: entity.y}, goal, radius);
      if(!path || !path.length){
        entity.nav = null;
        return null;
      }
      entity.nav = { key, points: path, index: 0 };
    }
    const tol = Math.max(radius * 0.6, NAV_CELL_SIZE * 0.4);
    while(entity.nav && entity.nav.index < entity.nav.points.length){
      const waypoint = entity.nav.points[entity.nav.index];
      const d = Math.hypot(waypoint.x - entity.x, waypoint.y - entity.y);
      if(d <= tol){
        entity.nav.index++;
        continue;
      }
      return waypoint;
    }
    entity.nav = null;
    return null;
  }

  function setPlayerDestination(x, y){
    player.target.x = x;
    player.target.y = y;
    player.navGoal = {x, y};
    player.nav = null;
    if(hitboxActive()){
      ensureNavForEntity(player, player.navGoal, player.r);
    }
  }

  // Spawn placement
  function prepareSpawnPlacement(side){
    const mapReady = GameState.map.loaded;
    if(!mapReady){
      if(fileName){
        fileName.textContent = 'No map loaded  using default arena bounds for spawn placement.';
      }
      flash(mapState.width / 2, mapState.height / 2);
    }
    const list = side === 'blue' ? blueSpawns : redSpawns;
    const defaults = defaultSpawnPosition(side);
    list.length = 0;
    list.push({ ...defaults, userPlaced: false });
    clearAllNavigation();
    GameState.spawns.placing = side;
    const label = side === 'blue' ? 'BLUE' : 'RED';
    if(mapReady){
      setHudMessage(`${label} spawn reset. Click to place a new location on the map.`);
    } else {
      setHudMessage(`${label} spawn reset. Click anywhere on the stage to choose a position.`);
    }
  }
  btnSpawnBlue.addEventListener('click', ()=> prepareSpawnPlacement('blue'));
  btnSpawnRed.addEventListener('click', ()=> prepareSpawnPlacement('red'));

  // Collision editor
  function degToRad(deg){ return (Number(deg) || 0) * Math.PI / 180; }
  function radToDeg(rad){ return (Number(rad) || 0) * 180 / Math.PI; }
  function getColliderByIdValue(id){
    if(!Number.isFinite(id)) return null;
    for(const collider of customColliders){
      if(collider && collider.id === id){
        return collider;
      }
    }
    return null;
  }
  function getSelectedCollider(){
    return getColliderByIdValue(GameState.map.colliders.selectedId);
  }
  function refreshColliderList(){
    if(!colliderListEl) return;
    colliderListEl.innerHTML = '';
    if(!customColliders.length){
      const empty = document.createElement('div');
      empty.className = 'colliderListEmpty';
      empty.textContent = 'No collision shapes.';
      colliderListEl.appendChild(empty);
      return;
    }
    let index = 0;
    for(const collider of customColliders){
      if(!collider) continue;
      index += 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = String(collider.id);
      button.className = 'colliderEntry' + (collider.id === GameState.map.colliders.selectedId ? ' is-active' : '');
      const label = collider.type === 'capsule' ? 'Pill'
        : (collider.type === 'crescent' ? 'Crescent' : 'Circle');
      button.textContent = `${label} #${index}`;
      colliderListEl.appendChild(button);
    }
  }
  function ensureColliderConsistency(collider){
    if(!collider) return;
    const type = collider.type === 'capsule' ? 'capsule'
      : (collider.type === 'crescent' ? 'crescent' : 'circle');
    collider.type = type;
    const sanitizedRadius = clampSettingValue(Number(collider.radius), SETTINGS_RANGE_MIN);
    collider.radius = sanitizedRadius;
    if(type === 'capsule'){
      const rawLength = Number(collider.length);
      const fallbackLength = sanitizedRadius * 2;
      collider.length = Number.isFinite(rawLength)
        ? clampSettingValue(rawLength, fallbackLength)
        : clampSettingValue(fallbackLength);
      if(!Number.isFinite(collider.angle)) collider.angle = 0;
    } else if(type === 'crescent'){
      const metrics = ensureCrescentMetrics(collider);
      collider.innerRadius = metrics.innerRadius;
      collider.offset = metrics.offset;
      const rawLength = Number(collider.length);
      const fallbackLength = sanitizedRadius * 2;
      collider.length = Number.isFinite(rawLength)
        ? clampSettingValue(rawLength, fallbackLength)
        : clampSettingValue(fallbackLength);
    } else {
      const rawLength = Number(collider.length);
      const fallbackLength = sanitizedRadius * 2;
      collider.length = Number.isFinite(rawLength)
        ? clampSettingValue(rawLength, fallbackLength)
        : clampSettingValue(fallbackLength);
      collider.angle = 0;
    }
  }
  function updateColliderUiState(){
    if(!colliderShapeSelect) return;
    const selected = getSelectedCollider();
    if(selected){
      ensureColliderConsistency(selected);
    } else {
      ensureColliderConsistency(colliderDefaults);
    }
    const resolveType = (type)=> type === 'capsule' ? 'capsule'
      : (type === 'crescent' ? 'crescent' : 'circle');
    const activeType = resolveType(selected ? selected.type : colliderDefaults.type);
    colliderShapeSelect.value = activeType;
    const radiusValue = clampSettingValue(selected ? selected.radius : colliderDefaults.radius, SETTINGS_RANGE_MIN);
    if(selected){
      selected.radius = radiusValue;
    } else {
      colliderDefaults.radius = radiusValue;
    }
    if(colliderRadiusRange){
      colliderRadiusRange.min = String(SETTINGS_RANGE_MIN);
      colliderRadiusRange.max = String(SETTINGS_RANGE_MAX);
      const radiusRounded = Math.round(radiusValue);
      colliderRadiusRange.value = String(radiusRounded);
      if(colliderRadiusDisplay){
        colliderRadiusDisplay.textContent = `${radiusRounded}px`;
      }
    }
    const typeIsCapsule = activeType === 'capsule';
    const typeIsCrescent = activeType === 'crescent';
    if(colliderLengthRow){ colliderLengthRow.hidden = !typeIsCapsule; }
    if(colliderInnerRadiusRow){ colliderInnerRadiusRow.hidden = !typeIsCrescent; }
    if(colliderOffsetRow){ colliderOffsetRow.hidden = !typeIsCrescent; }
    if(colliderRotationRow){ colliderRotationRow.hidden = !(typeIsCapsule || typeIsCrescent); }

    if(typeIsCapsule && colliderLengthRange){
      const lengthValue = clampSettingValue(selected ? selected.length : colliderDefaults.length, SETTINGS_RANGE_MIN);
      if(selected){
        selected.length = lengthValue;
      } else {
        colliderDefaults.length = lengthValue;
      }
      colliderLengthRange.min = String(SETTINGS_RANGE_MIN);
      colliderLengthRange.max = String(SETTINGS_RANGE_MAX);
      const lengthRounded = Math.round(lengthValue);
      colliderLengthRange.value = String(lengthRounded);
      if(colliderLengthDisplay){
        colliderLengthDisplay.textContent = `${lengthRounded}px`;
      }
      const angleDeg = selected ? radToDeg(selected.angle) : colliderDefaults.angleDeg;
      const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
      if(colliderRotationRange){
        colliderRotationRange.value = String(normalized);
      }
      if(colliderRotationDisplay){
        colliderRotationDisplay.textContent = `${normalized}`;
      }
    } else if(typeIsCrescent){
      const metrics = selected ? ensureCrescentMetrics(selected)
        : ensureCrescentMetrics({
            x: 0,
            y: 0,
            radius: colliderDefaults.radius,
            innerRadius: colliderDefaults.innerRadius,
            offset: colliderDefaults.offset,
            angle: degToRad(colliderDefaults.angleDeg)
          });
      if(!selected){
        colliderDefaults.innerRadius = metrics.innerRadius;
        colliderDefaults.offset = metrics.offset;
      }
      if(colliderInnerRadiusRange){
        const innerValue = clampSettingValue(metrics.innerRadius, SETTINGS_RANGE_MIN);
        colliderInnerRadiusRange.min = String(SETTINGS_RANGE_MIN);
        colliderInnerRadiusRange.max = String(SETTINGS_RANGE_MAX);
        colliderInnerRadiusRange.value = String(Math.round(innerValue));
        if(colliderInnerRadiusDisplay){
          colliderInnerRadiusDisplay.textContent = `${Math.round(innerValue)}px`;
        }
      }
      if(colliderOffsetRange){
        const offsetValue = clampSettingValue(metrics.offset, SETTINGS_RANGE_MIN);
        colliderOffsetRange.min = String(SETTINGS_RANGE_MIN);
        colliderOffsetRange.max = String(SETTINGS_RANGE_MAX);
        colliderOffsetRange.value = String(Math.round(offsetValue));
        if(colliderOffsetDisplay){
          colliderOffsetDisplay.textContent = `${Math.round(offsetValue)}px`;
        }
      }
      const angleDeg = selected ? radToDeg(selected.angle) : colliderDefaults.angleDeg;
      const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
      if(colliderRotationRange){
        colliderRotationRange.value = String(normalized);
      }
      if(colliderRotationDisplay){
        colliderRotationDisplay.textContent = `${normalized}`;
      }
    } else if(colliderRotationDisplay && colliderRotationRange){
      colliderRotationRange.value = '0';
      colliderRotationDisplay.textContent = '0';
    }
    if(colliderDeleteButton){
      colliderDeleteButton.disabled = !selected;
    }
    if(colliderEditToggle){
      colliderEditToggle.textContent = GameState.map.colliders.editMode ? 'Exit collision edit mode' : 'Enter collision edit mode';
    }
    if(colliderPlaceButton){
      colliderPlaceButton.textContent = GameState.map.colliders.placing ? 'Cancel placement' : 'Place new shape';
    }
    if(colliderToggleVisibilityButton){
      colliderToggleVisibilityButton.textContent = GameState.map.colliders.hidden ? 'Show shapes' : 'Hide shapes';
    }
    if(colliderSaveButton){
      colliderSaveButton.disabled = customColliders.length === 0;
    }
    refreshColliderList();
  }
  function selectCollider(id){
    if(Number.isFinite(id)){
      const found = getColliderByIdValue(id);
      GameState.map.colliders.selectedId = found ? found.id : null;
    } else {
      GameState.map.colliders.selectedId = null;
    }
    updateColliderUiState();
  }
  function setColliderEditMode(enabled){
    const next = !!enabled;
    if(GameState.map.colliders.editMode === next) return;
    if(next && GameState.player.vision.editMode){
      setVisionEditMode(false);
    }
    GameState.map.colliders.editMode = next;
    if(!next){
      GameState.map.colliders.placing = false;
      stopColliderDrag();
    }
    updateColliderUiState();
  }
  function stopColliderDrag(){
    if(stage && GameState.map.colliders.pointerId !== null){
      try {
        stage.releasePointerCapture(GameState.map.colliders.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    GameState.map.colliders.draggingId = null;
    GameState.map.colliders.pointerId = null;
    GameState.map.colliders.dragMoved = false;
  }
  function toggleColliderPlacement(){
    if(!GameState.map.colliders.editMode){
      setColliderEditMode(true);
    }
    GameState.map.colliders.placing = !GameState.map.colliders.placing;
    if(GameState.map.colliders.placing){
      stopColliderDrag();
    }
    updateColliderUiState();
  }
  function onCollidersChanged({ navigation = true } = {}){
    if(navigation){
      clearAllNavigation();
    }
    renderMinimap(true);
  }
  function buildCollisionMapSnapshot(){
    const snapshot = {
      version: 1,
      generatedAt: new Date().toISOString(),
      colliders: []
    };
    for(const collider of customColliders){
      if(!collider) continue;
      ensureColliderConsistency(collider);
      const type = collider.type === 'capsule' ? 'capsule'
        : (collider.type === 'crescent' ? 'crescent' : 'circle');
      const entry = {
        type,
        x: Number.isFinite(collider.x) ? collider.x : 0,
        y: Number.isFinite(collider.y) ? collider.y : 0,
        radius: Number.isFinite(collider.radius) ? collider.radius : 0,
        length: Number.isFinite(collider.length) ? collider.length : Math.max(0, Number(collider.radius) || 0) * 2,
        angle: Number.isFinite(collider.angle) ? collider.angle : 0
      };
      if(type === 'crescent'){
        entry.innerRadius = Number.isFinite(collider.innerRadius) ? collider.innerRadius : Math.max(0, entry.radius * 0.6);
        entry.offset = Number.isFinite(collider.offset) ? collider.offset : Math.max(0, entry.radius * 0.6);
      }
      snapshot.colliders.push(entry);
    }
    return snapshot;
  }
  function formatCollisionMapFilename(){
    const now = new Date();
    const pad = (value)=> String(value).padStart(2, '0');
    const base = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `collision-map-${base}.json`;
  }
  function saveCollisionMap(){
    const snapshot = buildCollisionMapSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = formatCollisionMapFilename();
    const parent = document.body || document.documentElement;
    if(parent){
      parent.appendChild(link);
      link.click();
      parent.removeChild(link);
    } else {
      link.click();
    }
    setTimeout(()=> URL.revokeObjectURL(url), 0);
  }
  function parseCollisionMapText(text){
    if(typeof text !== 'string' || !text.trim()){
      throw new Error('No collision map data');
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('Invalid JSON');
    }
    const list = Array.isArray(data && data.colliders) ? data.colliders
      : (Array.isArray(data) ? data : null);
    if(!list){
      throw new Error('Missing collider list');
    }
    const result = [];
    let nextId = 1;
    for(const item of list){
      if(!item) continue;
      const typeRaw = typeof item.type === 'string' ? item.type.toLowerCase() : 'circle';
      const type = typeRaw === 'capsule' ? 'capsule'
        : (typeRaw === 'crescent' ? 'crescent' : 'circle');
      const xValue = Number(item.x);
      const yValue = Number(item.y);
      const radiusValue = Number(item.radius);
      const collider = {
        id: nextId++,
        type,
        x: Number.isFinite(xValue) ? xValue : 0,
        y: Number.isFinite(yValue) ? yValue : 0,
        radius: clampSettingValue(Number.isFinite(radiusValue) ? radiusValue : SETTINGS_RANGE_MIN, SETTINGS_RANGE_MIN)
      };
      if(type === 'capsule'){
        const lengthValue = Number(item.length);
        const angleValue = Number(item.angle);
        collider.length = Number.isFinite(lengthValue) ? clampSettingValue(lengthValue, collider.radius * 2) : clampSettingValue(collider.radius * 2);
        if(Number.isFinite(angleValue)){
          collider.angle = angleValue;
        } else if(Number.isFinite(Number(item.angleDeg))){
          collider.angle = degToRad(Number(item.angleDeg));
        } else {
          collider.angle = 0;
        }
      } else if(type === 'crescent'){
        const innerValue = Number(item.innerRadius);
        const offsetValue = Number(item.offset);
        const lengthValue = Number(item.length);
        const angleValue = Number(item.angle);
        collider.innerRadius = Number.isFinite(innerValue) ? clampSettingValue(innerValue, collider.radius * 0.6) : clampSettingValue(collider.radius * 0.6);
        collider.offset = Number.isFinite(offsetValue) ? clampSettingValue(offsetValue, collider.radius * 0.6) : clampSettingValue(collider.radius * 0.6);
        collider.length = Number.isFinite(lengthValue) ? clampSettingValue(lengthValue, collider.radius * 2) : clampSettingValue(collider.radius * 2);
        if(Number.isFinite(angleValue)){
          collider.angle = angleValue;
        } else if(Number.isFinite(Number(item.angleDeg))){
          collider.angle = degToRad(Number(item.angleDeg));
        } else {
          collider.angle = 0;
        }
      } else {
        const lengthValue = Number(item.length);
        collider.length = Number.isFinite(lengthValue) ? clampSettingValue(lengthValue, collider.radius * 2) : clampSettingValue(collider.radius * 2);
        collider.angle = 0;
      }
      ensureColliderConsistency(collider);
      result.push(collider);
    }
    return { colliders: result, nextId };
  }
  function applyCollisionMapSnapshot(snapshot){
    if(!snapshot){
      return;
    }
    const { colliders: parsedColliders, nextId } = snapshot;
    customColliders.length = 0;
    if(Array.isArray(parsedColliders) && parsedColliders.length){
      customColliders.push(...parsedColliders);
    }
    GameState.map.colliders.nextId = Math.max(1, Number(nextId) || (customColliders.length + 1));
    GameState.map.colliders.selectedId = null;
    GameState.map.colliders.placing = false;
    updateColliderUiState();
    onCollidersChanged();
    const count = customColliders.length;
    const plural = count === 1 ? '' : 's';
    setHudMessage(count ? `Loaded ${count} collision shape${plural}.` : 'Cleared collision map.');
  }
  function loadCollisionMapFromText(text){
    try {
      const snapshot = parseCollisionMapText(text);
      applyCollisionMapSnapshot(snapshot);
    } catch (err) {
      console.error('Failed to load collision map', err);
      setHudMessage('Unable to load collision map.');
    }
  }
  function colliderBoundingRadius(collider){
    if(!collider) return 0;
    if(collider.type === 'capsule'){
      const metrics = ensureCapsuleMetrics(collider);
      return Math.hypot(metrics.reach, metrics.radius);
    }
    if(collider.type === 'crescent'){
      const metrics = ensureCrescentMetrics(collider);
      return metrics.radius;
    }
    return Math.max(0, Number(collider.radius) || 0);
  }
  function colliderContainsPoint(collider, x, y, tolerance = 0){
    if(!collider) return false;
    const extra = Math.max(0, tolerance);
    if(collider.type === 'capsule'){
      const metrics = ensureCapsuleMetrics(collider);
      if(metrics.span <= 0){
        return Math.hypot(x - collider.x, y - collider.y) <= metrics.radius + extra;
      }
      return distancePointToSegment(x, y, metrics.ax, metrics.ay, metrics.bx, metrics.by) <= metrics.radius + extra;
    }
    if(collider.type === 'crescent'){
      const metrics = ensureCrescentMetrics(collider);
      const distOuter = Math.hypot(x - metrics.cx, y - metrics.cy);
      if(distOuter > metrics.radius + extra) return false;
      if(metrics.innerRadius <= 0){
        return true;
      }
      const innerThreshold = Math.max(0, metrics.innerRadius - extra);
      const distInner = Math.hypot(x - metrics.innerCx, y - metrics.innerCy);
      return distInner >= innerThreshold;
    }
    const dx = x - collider.x;
    const dy = y - collider.y;
    const rad = Math.max(0, Number(collider.radius) || 0);
    return Math.hypot(dx, dy) <= rad + extra;
  }
  function findColliderAt(x, y, tolerance = 0){
    for(let i = customColliders.length - 1; i >= 0; i--){
      const collider = customColliders[i];
      if(!collider) continue;
      if(colliderContainsPoint(collider, x, y, tolerance)){
        return collider;
      }
    }
    return null;
  }
  function visionContainsPoint(source, x, y, tolerance = 0){
    return colliderContainsPoint(source, x, y, tolerance);
  }
  function pointInVision(x, y, tolerance = 0){
    const buffer = Math.max(0, tolerance);
    for(const source of customVisionSources){
      if(!source) continue;
      ensureVisionConsistency(source);
      if(source.mode === 2 && visionContainsPoint(source, x, y, buffer)){
        return false;
      }
    }
    let revealed = false;
    for(const source of customVisionSources){
      if(!source) continue;
      ensureVisionConsistency(source);
      if(source.mode === 2) continue;
      if(visionContainsPoint(source, x, y, buffer)){
        revealed = true;
        break;
      }
    }
    if(revealed){
      return true;
    }
    const playerRadiusValue = clampSettingValue(GameState.player.vision.radius, SETTINGS_RANGE_MIN);
    if(playerRadiusValue > 0){
      const playerDx = x - player.x;
      const playerDy = y - player.y;
      if(Math.hypot(playerDx, playerDy) <= playerRadiusValue + buffer){
        return true;
      }
    }
    if(visionDummy && visionDummy.active !== false){
      const dummySize = clampPracticeDummySize(visionDummy.size, practiceDummyDefaults.size);
      const bodyRadius = Math.max(10, dummySize * 0.5);
      const span = Math.max(bodyRadius * 2, dummySize * 2.2);
      const coverageRadius = Math.max(bodyRadius, span / 2);
      if(coverageRadius > 0){
        const clampCoord = (value, max) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
        const dummyX = clampCoord(visionDummy.x, mapState.width);
        const dummyY = clampCoord(visionDummy.y, mapState.height);
        const dummyDx = x - dummyX;
        const dummyDy = y - dummyY;
        if(Math.hypot(dummyDx, dummyDy) <= coverageRadius + buffer){
          return true;
        }
      }
    }
    return false;
  }
  function findVisionAt(x, y, tolerance = 0){
    for(let i = customVisionSources.length - 1; i >= 0; i--){
      const source = customVisionSources[i];
      if(!source) continue;
      if(visionContainsPoint(source, x, y, tolerance)){
        return source;
      }
    }
    return null;
  }
  function addColliderAt(x, y){
    const type = colliderDefaults.type === 'capsule' ? 'capsule'
      : (colliderDefaults.type === 'crescent' ? 'crescent' : 'circle');
    const radius = clampSettingValue(colliderDefaults.radius, SETTINGS_RANGE_MIN);
    const angle = degToRad(colliderDefaults.angleDeg);
    let collider;
    if(type === 'capsule'){
      const baseLength = Number(colliderDefaults.length);
      const fallbackLength = radius * 2;
      const length = Number.isFinite(baseLength)
        ? clampSettingValue(baseLength, fallbackLength)
        : clampSettingValue(fallbackLength);
      collider = { id: GameState.map.colliders.nextId++, type, x, y, radius, length, angle };
    } else if(type === 'crescent'){
      const innerRadius = Number.isFinite(Number(colliderDefaults.innerRadius))
        ? clampSettingValue(colliderDefaults.innerRadius, radius * 0.6)
        : clampSettingValue(radius * 0.6);
      const offset = Number.isFinite(Number(colliderDefaults.offset))
        ? clampSettingValue(colliderDefaults.offset, radius * 0.6)
        : clampSettingValue(radius * 0.6);
      const fallbackLength = radius * 2;
      collider = {
        id: GameState.map.colliders.nextId++,
        type,
        x,
        y,
        radius,
        innerRadius,
        offset,
        angle,
        length: clampSettingValue(fallbackLength)
      };
    } else {
      collider = {
        id: GameState.map.colliders.nextId++,
        type: 'circle',
        x,
        y,
        radius,
        length: clampSettingValue(radius * 2),
        angle: 0
      };
    }
    ensureColliderConsistency(collider);
    customColliders.push(collider);
    GameState.map.colliders.selectedId = collider.id;
    updateColliderUiState();
    onCollidersChanged();
    return collider;
  }
  function removeSelectedCollider(){
    if(!Number.isFinite(GameState.map.colliders.selectedId)) return;
    for(let i = customColliders.length - 1; i >= 0; i--){
      const collider = customColliders[i];
      if(collider && collider.id === GameState.map.colliders.selectedId){
        customColliders.splice(i, 1);
        break;
      }
    }
    GameState.map.colliders.selectedId = null;
    updateColliderUiState();
    onCollidersChanged();
  }
  if(colliderEditToggle){
    colliderEditToggle.addEventListener('click', ()=>{
      setColliderEditMode(!GameState.map.colliders.editMode);
    });
  }
  if(colliderPlaceButton){
    colliderPlaceButton.addEventListener('click', ()=>{
      toggleColliderPlacement();
    });
  }
  if(colliderToggleVisibilityButton){
    colliderToggleVisibilityButton.addEventListener('click', ()=>{
      GameState.map.colliders.hidden = !GameState.map.colliders.hidden;
      updateColliderUiState();
      renderMinimap(true);
    });
  }
  if(colliderDeleteButton){
    colliderDeleteButton.addEventListener('click', ()=>{
      removeSelectedCollider();
    });
  }
  if(colliderSaveButton){
    colliderSaveButton.addEventListener('click', ()=>{
      saveCollisionMap();
    });
  }
  if(colliderLoadButton && colliderImportInput){
    colliderLoadButton.addEventListener('click', ()=>{
      colliderImportInput.click();
    });
    colliderImportInput.addEventListener('change', ()=>{
      const file = colliderImportInput.files && colliderImportInput.files[0];
      if(!file){
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', ()=>{
        const text = typeof reader.result === 'string' ? reader.result : '';
        loadCollisionMapFromText(text);
      });
      reader.addEventListener('error', ()=>{
        setHudMessage('Unable to read collision map file.');
      });
      reader.readAsText(file);
      colliderImportInput.value = '';
    });
  }
  if(colliderShapeSelect){
    colliderShapeSelect.addEventListener('change', ()=>{
      const rawValue = colliderShapeSelect.value;
      const value = rawValue === 'capsule' ? 'capsule'
        : (rawValue === 'crescent' ? 'crescent' : 'circle');
      const selected = getSelectedCollider();
      if(selected){
        selected.type = value;
        ensureColliderConsistency(selected);
        onCollidersChanged();
      }
      colliderDefaults.type = value;
      if(value === 'circle'){
        colliderDefaults.angleDeg = 0;
      } else if(value === 'capsule'){
        const baseRadius = clampSettingValue(selected ? selected.radius : colliderDefaults.radius, SETTINGS_RANGE_MIN);
        const fallbackLength = baseRadius * 2;
        if(!Number.isFinite(colliderDefaults.length)){
          colliderDefaults.length = clampSettingValue(fallbackLength);
        } else {
          colliderDefaults.length = clampSettingValue(colliderDefaults.length, fallbackLength);
        }
      } else if(value === 'crescent'){
        if(!Number.isFinite(colliderDefaults.innerRadius)){
          colliderDefaults.innerRadius = clampSettingValue(colliderDefaults.radius * 0.6, SETTINGS_RANGE_MIN);
        }
        if(!Number.isFinite(colliderDefaults.offset)){
          colliderDefaults.offset = clampSettingValue(colliderDefaults.radius * 0.6, SETTINGS_RANGE_MIN);
        }
      }
      updateColliderUiState();
      renderMinimap(true);
    });
  }
  if(colliderRadiusRange){
    colliderRadiusRange.addEventListener('input', ()=>{
      const value = clampSettingValue(colliderRadiusRange.value, SETTINGS_RANGE_MIN);
      colliderRadiusRange.value = String(value);
      const selected = getSelectedCollider();
      if(selected){
        selected.radius = value;
        ensureColliderConsistency(selected);
      } else {
        colliderDefaults.radius = value;
        ensureColliderConsistency(colliderDefaults);
      }
      updateColliderUiState();
    });
    colliderRadiusRange.addEventListener('change', ()=>{
      if(getSelectedCollider()){
        onCollidersChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(colliderInnerRadiusRange){
    colliderInnerRadiusRange.addEventListener('input', ()=>{
      const value = clampSettingValue(colliderInnerRadiusRange.value, SETTINGS_RANGE_MIN);
      colliderInnerRadiusRange.value = String(value);
      const selected = getSelectedCollider();
      if(selected){
        selected.innerRadius = value;
        ensureColliderConsistency(selected);
      } else {
        colliderDefaults.innerRadius = value;
        ensureColliderConsistency(colliderDefaults);
      }
      updateColliderUiState();
    });
    colliderInnerRadiusRange.addEventListener('change', ()=>{
      if(getSelectedCollider()){
        onCollidersChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(colliderOffsetRange){
    colliderOffsetRange.addEventListener('input', ()=>{
      const value = clampSettingValue(colliderOffsetRange.value, SETTINGS_RANGE_MIN);
      colliderOffsetRange.value = String(value);
      const selected = getSelectedCollider();
      if(selected){
        selected.offset = value;
        ensureColliderConsistency(selected);
      } else {
        colliderDefaults.offset = value;
        ensureColliderConsistency(colliderDefaults);
      }
      updateColliderUiState();
    });
    colliderOffsetRange.addEventListener('change', ()=>{
      if(getSelectedCollider()){
        onCollidersChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(colliderLengthRange){
    colliderLengthRange.addEventListener('input', ()=>{
      const value = clampSettingValue(colliderLengthRange.value, SETTINGS_RANGE_MIN);
      colliderLengthRange.value = String(value);
      const selected = getSelectedCollider();
      if(selected){
        selected.length = value;
        ensureColliderConsistency(selected);
      } else {
        colliderDefaults.length = value;
      }
      updateColliderUiState();
    });
    colliderLengthRange.addEventListener('change', ()=>{
      if(getSelectedCollider()){
        onCollidersChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(colliderRotationRange){
    colliderRotationRange.addEventListener('input', ()=>{
      const value = Number(colliderRotationRange.value) || 0;
      const selected = getSelectedCollider();
      if(selected){
        selected.angle = degToRad(value);
      } else {
        colliderDefaults.angleDeg = value;
      }
      updateColliderUiState();
    });
    colliderRotationRange.addEventListener('change', ()=>{
      if(getSelectedCollider()){
        onCollidersChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(colliderListEl){
    colliderListEl.addEventListener('click', (event)=>{
      const target = event.target instanceof Element ? event.target.closest('.colliderEntry') : null;
      if(!target) return;
      const id = Number(target.dataset.id);
      if(Number.isFinite(id)){
        selectCollider(id);
      }
    });
  }
  updateColliderUiState();

  // Vision editor
  function getVisionByIdValue(id){
    if(!Number.isFinite(id)) return null;
    for(const source of customVisionSources){
      if(source && source.id === id){
        return source;
      }
    }
    return null;
  }
  function getSelectedVision(){
    return getVisionByIdValue(GameState.player.vision.selectedId);
  }
  function refreshVisionList(){
    if(!visionListEl) return;
    visionListEl.innerHTML = '';
    if(!customVisionSources.length){
      const empty = document.createElement('div');
      empty.className = 'colliderListEmpty';
      empty.textContent = 'No vision shapes.';
      visionListEl.appendChild(empty);
      return;
    }
    let index = 0;
    for(const source of customVisionSources){
      if(!source) continue;
      index += 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = String(source.id);
      button.className = 'colliderEntry' + (source.id === GameState.player.vision.selectedId ? ' is-active' : '');
      const label = source.type === 'capsule' ? 'Pill'
        : (source.type === 'crescent' ? 'Crescent' : 'Circle');
      const modeLabel = source.mode === 2 ? 'Hiding' : 'Vision';
      button.textContent = `${modeLabel} ${label} #${index}`;
      visionListEl.appendChild(button);
    }
  }
  function ensureVisionConsistency(source){
    if(!source) return;
    const type = source.type === 'capsule' ? 'capsule'
      : (source.type === 'crescent' ? 'crescent' : 'circle');
    source.type = type;
    source.mode = normalizeVisionMode(source.mode);
    const sanitizedRadius = clampSettingValue(Number(source.radius), SETTINGS_RANGE_MIN);
    source.radius = sanitizedRadius;
    if(type === 'capsule'){
      const rawLength = Number(source.length);
      const fallbackLength = sanitizedRadius * 2;
      source.length = Number.isFinite(rawLength)
        ? clampSettingValue(rawLength, fallbackLength)
        : clampSettingValue(fallbackLength);
      if(!Number.isFinite(source.angle)) source.angle = 0;
    } else if(type === 'crescent'){
      const metrics = ensureCrescentMetrics(source);
      source.innerRadius = metrics.innerRadius;
      source.offset = metrics.offset;
      const rawLength = Number(source.length);
      const fallbackLength = sanitizedRadius * 2;
      source.length = Number.isFinite(rawLength)
        ? clampSettingValue(rawLength, fallbackLength)
        : clampSettingValue(fallbackLength);
    } else {
      const rawLength = Number(source.length);
      const fallbackLength = sanitizedRadius * 2;
      source.length = Number.isFinite(rawLength)
        ? clampSettingValue(rawLength, fallbackLength)
        : clampSettingValue(fallbackLength);
      source.angle = 0;
    }
  }
  function updateVisionUiState(){
    const selected = getSelectedVision();
    if(selected){
      ensureVisionConsistency(selected);
    } else {
      ensureVisionConsistency(visionDefaults);
    }
    const resolveType = (type)=> type === 'capsule' ? 'capsule'
      : (type === 'crescent' ? 'crescent' : 'circle');
    const activeType = resolveType(selected ? selected.type : visionDefaults.type);
    const activeMode = normalizeVisionMode(selected ? selected.mode : visionDefaults.mode);
    if(visionShapeSelect){
      visionShapeSelect.value = activeType;
    }
    if(visionModeInput){
      visionModeInput.value = visionModeToOption(activeMode);
    }
    const radiusValue = clampSettingValue(selected ? selected.radius : visionDefaults.radius, SETTINGS_RANGE_MIN);
    if(selected){
      selected.radius = radiusValue;
    } else {
      visionDefaults.radius = radiusValue;
    }
    if(visionRadiusRange){
      visionRadiusRange.min = String(SETTINGS_RANGE_MIN);
      visionRadiusRange.max = String(SETTINGS_RANGE_MAX);
      const radiusRounded = Math.round(radiusValue);
      visionRadiusRange.value = String(radiusRounded);
      if(visionRadiusDisplay){
        visionRadiusDisplay.textContent = `${radiusRounded}px`;
      }
    }
    const typeIsCapsule = activeType === 'capsule';
    const typeIsCrescent = activeType === 'crescent';
    if(visionLengthRow){ visionLengthRow.hidden = !typeIsCapsule; }
    if(visionInnerRadiusRow){ visionInnerRadiusRow.hidden = !typeIsCrescent; }
    if(visionOffsetRow){ visionOffsetRow.hidden = !typeIsCrescent; }
    if(visionRotationRow){ visionRotationRow.hidden = !(typeIsCapsule || typeIsCrescent); }

    if(typeIsCapsule && visionLengthRange){
      const lengthValue = clampSettingValue(selected ? selected.length : visionDefaults.length, SETTINGS_RANGE_MIN);
      if(selected){
        selected.length = lengthValue;
      } else {
        visionDefaults.length = lengthValue;
      }
      visionLengthRange.min = String(SETTINGS_RANGE_MIN);
      visionLengthRange.max = String(SETTINGS_RANGE_MAX);
      const lengthRounded = Math.round(lengthValue);
      visionLengthRange.value = String(lengthRounded);
      if(visionLengthDisplay){
        visionLengthDisplay.textContent = `${lengthRounded}px`;
      }
      const angleDeg = selected ? radToDeg(selected.angle) : visionDefaults.angleDeg;
      const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
      if(visionRotationRange){
        visionRotationRange.value = String(normalized);
      }
      if(visionRotationDisplay){
        visionRotationDisplay.textContent = `${normalized}`;
      }
    } else if(typeIsCrescent){
      const metrics = selected ? ensureCrescentMetrics(selected)
        : ensureCrescentMetrics({
            x: 0,
            y: 0,
            radius: visionDefaults.radius,
            innerRadius: visionDefaults.innerRadius,
            offset: visionDefaults.offset,
            angle: degToRad(visionDefaults.angleDeg)
          });
      if(!selected){
        visionDefaults.innerRadius = metrics.innerRadius;
        visionDefaults.offset = metrics.offset;
      }
      if(visionInnerRadiusRange){
        const innerValue = clampSettingValue(metrics.innerRadius, SETTINGS_RANGE_MIN);
        visionInnerRadiusRange.min = String(SETTINGS_RANGE_MIN);
        visionInnerRadiusRange.max = String(SETTINGS_RANGE_MAX);
        visionInnerRadiusRange.value = String(Math.round(innerValue));
        if(visionInnerRadiusDisplay){
          visionInnerRadiusDisplay.textContent = `${Math.round(innerValue)}px`;
        }
      }
      if(visionOffsetRange){
        const offsetValue = clampSettingValue(metrics.offset, SETTINGS_RANGE_MIN);
        visionOffsetRange.min = String(SETTINGS_RANGE_MIN);
        visionOffsetRange.max = String(SETTINGS_RANGE_MAX);
        visionOffsetRange.value = String(Math.round(offsetValue));
        if(visionOffsetDisplay){
          visionOffsetDisplay.textContent = `${Math.round(offsetValue)}px`;
        }
      }
      const angleDeg = selected ? radToDeg(selected.angle) : visionDefaults.angleDeg;
      const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
      if(visionRotationRange){
        visionRotationRange.value = String(normalized);
      }
      if(visionRotationDisplay){
        visionRotationDisplay.textContent = `${normalized}`;
      }
    } else {
      if(visionRotationDisplay){
        visionRotationDisplay.textContent = '0';
      }
      if(visionRotationRange){
        visionRotationRange.value = '0';
      }
    }

    if(playerVisionRadiusDisplay){
      const rounded = Math.round(clampSettingValue(GameState.player.vision.radius, SETTINGS_RANGE_MIN));
      playerVisionRadiusDisplay.textContent = `${rounded}px`;
      if(playerVisionRadiusInput){
        playerVisionRadiusInput.value = String(rounded);
      }
    }
    if(visionEditToggle){
      visionEditToggle.textContent = GameState.player.vision.editMode ? 'Exit vision edit mode' : 'Enter vision edit mode';
    }
    if(visionPlaceButton){
      visionPlaceButton.textContent = GameState.player.vision.placing ? 'Cancel placement' : 'Place new vision';
    }
    if(visionToggleVisibilityButton){
      visionToggleVisibilityButton.textContent = GameState.player.vision.hidden ? 'Show vision' : 'Hide vision';
    }
    if(visionDeleteButton){
      visionDeleteButton.disabled = !selected;
    }
    refreshVisionList();
  }
  function selectVision(id){
    if(Number.isFinite(id)){
      const found = getVisionByIdValue(id);
      GameState.player.vision.selectedId = found ? found.id : null;
    } else {
      GameState.player.vision.selectedId = null;
    }
    updateVisionUiState();
  }
  function setVisionEditMode(enabled){
    const next = !!enabled;
    if(GameState.player.vision.editMode === next) return;
    if(next){
      setColliderEditMode(false);
    }
    GameState.player.vision.editMode = next;
    if(!next){
      GameState.player.vision.placing = false;
      GameState.player.vision.dummyState.placing = false;
      stopVisionDrag();
      stopVisionDummyDrag();
    }
    updateVisionUiState();
  }
  function stopVisionDrag(){
    if(stage && GameState.player.vision.pointerId !== null){
      try {
        stage.releasePointerCapture(GameState.player.vision.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    GameState.player.vision.draggingId = null;
    GameState.player.vision.pointerId = null;
    GameState.player.vision.dragMoved = false;
  }
  function stopVisionDummyDrag(){
    if(stage && GameState.player.vision.dummyState.pointerId !== null){
      try {
        stage.releasePointerCapture(GameState.player.vision.dummyState.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    GameState.player.vision.dummyState.dragging = false;
    GameState.player.vision.dummyState.pointerId = null;
    GameState.player.vision.dummyState.dragOffset.x = 0;
    GameState.player.vision.dummyState.dragOffset.y = 0;
  }
  function toggleVisionPlacement(){
    if(!GameState.player.vision.editMode){
      setVisionEditMode(true);
    }
    GameState.player.vision.placing = !GameState.player.vision.placing;
    if(GameState.player.vision.placing){
      stopVisionDrag();
      GameState.player.vision.dummyState.placing = false;
    }
    updateVisionUiState();
  }
  function addVisionAt(x, y){
    const type = visionDefaults.type === 'capsule' ? 'capsule'
      : (visionDefaults.type === 'crescent' ? 'crescent' : 'circle');
    const radius = clampSettingValue(visionDefaults.radius, SETTINGS_RANGE_MIN);
    const angle = degToRad(visionDefaults.angleDeg);
    let entry;
    const mode = normalizeVisionMode(visionDefaults.mode);
    if(type === 'capsule'){
      const baseLength = Number(visionDefaults.length);
      const fallbackLength = radius * 2;
      const length = Number.isFinite(baseLength)
        ? clampSettingValue(baseLength, fallbackLength)
        : clampSettingValue(fallbackLength);
      entry = { id: GameState.player.vision.nextId++, type, mode, x, y, radius, length, angle };
    } else if(type === 'crescent'){
      const innerRadius = Number.isFinite(Number(visionDefaults.innerRadius))
        ? clampSettingValue(visionDefaults.innerRadius, radius * 0.6)
        : clampSettingValue(radius * 0.6);
      const offset = Number.isFinite(Number(visionDefaults.offset))
        ? clampSettingValue(visionDefaults.offset, radius * 0.6)
        : clampSettingValue(radius * 0.6);
      entry = {
        id: GameState.player.vision.nextId++,
        type,
        mode,
        x,
        y,
        radius,
        innerRadius,
        offset,
        angle,
        length: clampSettingValue(radius * 2)
      };
    } else {
      entry = {
        id: GameState.player.vision.nextId++,
        type: 'circle',
        mode,
        x,
        y,
        radius,
        length: clampSettingValue(radius * 2),
        angle: 0
      };
    }
    ensureVisionConsistency(entry);
    customVisionSources.push(entry);
    GameState.player.vision.selectedId = entry.id;
    updateVisionUiState();
    onVisionsChanged();
    return entry;
  }
  function onVisionsChanged(){
    renderMinimap(true);
  }
  function removeSelectedVision(){
    if(!Number.isFinite(GameState.player.vision.selectedId)) return;
    for(let i = customVisionSources.length - 1; i >= 0; i--){
      const source = customVisionSources[i];
      if(source && source.id === GameState.player.vision.selectedId){
        customVisionSources.splice(i, 1);
        break;
      }
    }
    GameState.player.vision.selectedId = null;
    updateVisionUiState();
    onVisionsChanged();
  }
  if(visionEditToggle){
    visionEditToggle.addEventListener('click', ()=>{
      setVisionEditMode(!GameState.player.vision.editMode);
    });
  }
  if(visionPlaceButton){
    visionPlaceButton.addEventListener('click', ()=>{
      toggleVisionPlacement();
    });
  }
  if(visionToggleVisibilityButton){
    visionToggleVisibilityButton.addEventListener('click', ()=>{
      GameState.player.vision.hidden = !GameState.player.vision.hidden;
      updateVisionUiState();
      renderMinimap(true);
    });
  }
  if(visionDeleteButton){
    visionDeleteButton.addEventListener('click', ()=>{
      removeSelectedVision();
    });
  }
  if(visionShapeSelect){
    visionShapeSelect.addEventListener('change', ()=>{
      const rawValue = visionShapeSelect.value;
      const value = rawValue === 'capsule' ? 'capsule'
        : (rawValue === 'crescent' ? 'crescent' : 'circle');
      const selected = getSelectedVision();
      if(selected){
        selected.type = value;
        ensureVisionConsistency(selected);
        onVisionsChanged();
      }
      visionDefaults.type = value;
      if(value === 'circle'){
        visionDefaults.angleDeg = 0;
      } else if(value === 'capsule'){
        const baseRadius = clampSettingValue(selected ? selected.radius : visionDefaults.radius, SETTINGS_RANGE_MIN);
        const fallbackLength = baseRadius * 2;
        if(!Number.isFinite(visionDefaults.length)){
          visionDefaults.length = clampSettingValue(fallbackLength);
        } else {
          visionDefaults.length = clampSettingValue(visionDefaults.length, fallbackLength);
        }
      } else if(value === 'crescent'){
        if(!Number.isFinite(visionDefaults.innerRadius)){
          visionDefaults.innerRadius = clampSettingValue(visionDefaults.radius * 0.6, SETTINGS_RANGE_MIN);
        }
        if(!Number.isFinite(visionDefaults.offset)){
          visionDefaults.offset = clampSettingValue(visionDefaults.radius * 0.6, SETTINGS_RANGE_MIN);
        }
      }
      updateVisionUiState();
      renderMinimap(true);
    });
  }
  if(visionModeInput){
    const handleVisionModeChange = ()=>{
      const mode = normalizeVisionMode(visionModeInput.value);
      const selected = getSelectedVision();
      if(selected){
        if(selected.mode !== mode){
          selected.mode = mode;
          ensureVisionConsistency(selected);
          onVisionsChanged();
        }
      } else if(visionDefaults.mode !== mode){
        visionDefaults.mode = mode;
        ensureVisionConsistency(visionDefaults);
        renderMinimap(true);
      }
      visionModeInput.value = visionModeToOption(mode);
      updateVisionUiState();
    };
    visionModeInput.addEventListener('change', handleVisionModeChange);
    visionModeInput.addEventListener('input', handleVisionModeChange);
  }
  if(visionRadiusRange){
    visionRadiusRange.addEventListener('input', ()=>{
      const value = clampSettingValue(visionRadiusRange.value, SETTINGS_RANGE_MIN);
      visionRadiusRange.value = String(value);
      const selected = getSelectedVision();
      if(selected){
        selected.radius = value;
        ensureVisionConsistency(selected);
      } else {
        visionDefaults.radius = value;
        ensureVisionConsistency(visionDefaults);
      }
      updateVisionUiState();
    });
    visionRadiusRange.addEventListener('change', ()=>{
      if(getSelectedVision()){
        onVisionsChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(visionInnerRadiusRange){
    visionInnerRadiusRange.addEventListener('input', ()=>{
      const value = clampSettingValue(visionInnerRadiusRange.value, SETTINGS_RANGE_MIN);
      visionInnerRadiusRange.value = String(value);
      const selected = getSelectedVision();
      if(selected){
        selected.innerRadius = value;
        ensureVisionConsistency(selected);
      } else {
        visionDefaults.innerRadius = value;
        ensureVisionConsistency(visionDefaults);
      }
      updateVisionUiState();
    });
    visionInnerRadiusRange.addEventListener('change', ()=>{
      if(getSelectedVision()){
        onVisionsChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(visionOffsetRange){
    visionOffsetRange.addEventListener('input', ()=>{
      const value = clampSettingValue(visionOffsetRange.value, SETTINGS_RANGE_MIN);
      visionOffsetRange.value = String(value);
      const selected = getSelectedVision();
      if(selected){
        selected.offset = value;
        ensureVisionConsistency(selected);
      } else {
        visionDefaults.offset = value;
        ensureVisionConsistency(visionDefaults);
      }
      updateVisionUiState();
    });
    visionOffsetRange.addEventListener('change', ()=>{
      if(getSelectedVision()){
        onVisionsChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(visionLengthRange){
    visionLengthRange.addEventListener('input', ()=>{
      const value = clampSettingValue(visionLengthRange.value, SETTINGS_RANGE_MIN);
      visionLengthRange.value = String(value);
      const selected = getSelectedVision();
      if(selected){
        selected.length = value;
        ensureVisionConsistency(selected);
      } else {
        visionDefaults.length = value;
        ensureVisionConsistency(visionDefaults);
      }
      updateVisionUiState();
    });
    visionLengthRange.addEventListener('change', ()=>{
      if(getSelectedVision()){
        onVisionsChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(visionRotationRange){
    visionRotationRange.addEventListener('input', ()=>{
      const value = Number(visionRotationRange.value) || 0;
      const selected = getSelectedVision();
      if(selected){
        selected.angle = degToRad(value);
      } else {
        visionDefaults.angleDeg = value;
      }
      updateVisionUiState();
    });
    visionRotationRange.addEventListener('change', ()=>{
      if(getSelectedVision()){
        onVisionsChanged();
      } else {
        renderMinimap(true);
      }
    });
  }
  if(visionListEl){
    visionListEl.addEventListener('click', (event)=>{
      const target = event.target instanceof Element ? event.target.closest('.colliderEntry') : null;
      if(!target) return;
      const id = Number(target.dataset.id);
      if(Number.isFinite(id)){
        selectVision(id);
      }
    });
  }
  if(playerVisionRadiusInput){
    playerVisionRadiusInput.addEventListener('input', ()=>{
      const value = clampSettingValue(playerVisionRadiusInput.value, SETTINGS_RANGE_MIN);
      playerVisionRadiusInput.value = String(value);
      GameState.player.vision.radius = value;
      updateVisionUiState();
    });
    playerVisionRadiusInput.addEventListener('change', ()=>{
      renderMinimap(true);
    });
  }
  if(visionDummyRadiusInput){
    visionDummyRadiusInput.addEventListener('input', ()=>{
      const value = clampSettingValue(visionDummyRadiusInput.value, SETTINGS_RANGE_MIN);
      visionDummyRadiusInput.value = String(value);
      visionDummy.radius = value;
      updateVisionUiState();
    });
    visionDummyRadiusInput.addEventListener('change', ()=>{
      renderMinimap(true);
    });
  }
  if(visionDummyPlaceButton){
    visionDummyPlaceButton.addEventListener('click', ()=>{
      if(!GameState.player.vision.editMode){
        setVisionEditMode(true);
      }
      GameState.player.vision.dummyState.placing = !GameState.player.vision.dummyState.placing;
      if(GameState.player.vision.dummyState.placing){
        GameState.player.vision.placing = false;
        stopVisionDrag();
      }
      updateVisionUiState();
    });
  }
  updateVisionUiState();

  function buildPracticeDummySnapshot(){
    const base = defaultBuildSectionSnapshot(practiceDummyPane);
    if(!base){
      return null;
    }
    const dummySnapshot = {
      active: practiceDummy && practiceDummy.active !== false && !(practiceDummy && practiceDummy.respawnTimer > 0),
      x: Number(practiceDummy && practiceDummy.x) || 0,
      y: Number(practiceDummy && practiceDummy.y) || 0,
      size: clampPracticeDummySize(practiceDummy && practiceDummy.size, practiceDummyDefaults.size),
      hp: Math.max(0, Number(practiceDummy && practiceDummy.hp) || 0),
      maxHp: Math.max(1, Number(practiceDummy && practiceDummy.maxHp) || practiceDummyDefaults.maxHp),
      deathResponse: practiceDummy && practiceDummy.deathResponse === 'despawn' ? 'despawn' : 'respawn'
    };
    if(practiceDummy && practiceDummy.statuses && typeof practiceDummy.statuses === 'object'){
      dummySnapshot.statuses = deepClone(practiceDummy.statuses);
    }
    base.dummy = dummySnapshot;
    return base;
  }

  function applyPracticeDummySnapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object'){
      return false;
    }
    const baseApplied = defaultApplySectionSnapshot(practiceDummyPane, snapshot);
    let dummyApplied = false;
    if(practiceDummy && snapshot.dummy && typeof snapshot.dummy === 'object'){
      const dummy = snapshot.dummy;
      const clampCoord = (value, max) => {
        const numeric = Number(value);
        if(!Number.isFinite(numeric)){
          return null;
        }
        if(!(max > 0)){
          return Math.max(0, numeric);
        }
        return Math.max(0, Math.min(max, numeric));
      };
      const clampedX = clampCoord(dummy.x, mapState.width);
      if(clampedX !== null){
        practiceDummy.x = clampedX;
        dummyApplied = true;
      }
      const clampedY = clampCoord(dummy.y, mapState.height);
      if(clampedY !== null){
        practiceDummy.y = clampedY;
        dummyApplied = true;
      }
      if(Number.isFinite(Number(dummy.size))){
        practiceDummy.size = clampPracticeDummySize(dummy.size, practiceDummyDefaults.size);
        dummyApplied = true;
      }
      if(Number.isFinite(Number(dummy.maxHp))){
        practiceDummy.maxHp = Math.max(1, Number(dummy.maxHp));
        dummyApplied = true;
      }
      if(Number.isFinite(Number(dummy.hp))){
        practiceDummy.hp = Math.max(0, Math.min(practiceDummy.maxHp, Number(dummy.hp)));
        dummyApplied = true;
      } else if(practiceDummy.hp > practiceDummy.maxHp){
        practiceDummy.hp = practiceDummy.maxHp;
      }
      if(dummy.statuses && typeof dummy.statuses === 'object'){
        practiceDummy.statuses = deepClone(dummy.statuses);
        dummyApplied = true;
      }
      if(typeof dummy.deathResponse === 'string'){
        practiceDummy.deathResponse = dummy.deathResponse === 'despawn' ? 'despawn' : 'respawn';
        dummyApplied = true;
      }
      const active = dummy.active === false ? false : true;
      practiceDummy.active = active;
      practiceDummy.respawnTimer = 0;
      if(!active){
        practiceDummy.hp = 0;
        resetPracticeDummyStatuses();
      } else if(!practiceDummy.statuses || typeof practiceDummy.statuses !== 'object'){
        practiceDummy.statuses = buildDefaultPlayerStatusConfig();
      }
      practiceDummyState.placing = false;
      practiceDummyState.selected = false;
      practiceDummyState.dragging = false;
      practiceDummyState.pointerId = null;
      if(practiceDummyState.dragOffset){
        practiceDummyState.dragOffset.x = 0;
        practiceDummyState.dragOffset.y = 0;
      } else {
        practiceDummyState.dragOffset = { x: 0, y: 0 };
      }
      normalizePracticeDummyState();
      refreshPracticeDummyAnchors();
      updatePracticeDummyUiState();
      updatePracticeDummyHud();
      updatePracticeDummyStatusIcons();
      positionPracticeDummyHud();
      renderMinimap(true);
      dummyApplied = true;
    }
    return baseApplied || dummyApplied;
  }

  setupSectionPersistence({
    paneId: 'visionPane',
    saveButtonId: 'visionConfigSave',
    loadButtonId: 'visionConfigLoad',
    fileInputId: 'visionConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'vision',
    label: 'Vision',
    filePrefix: 'vision',
    buildSnapshot: ()=> buildVisionSnapshot(),
    applySnapshot: (snapshot)=> applyVisionSnapshot(snapshot)
  });

  function buildMinionSnapshot(){
    const base = defaultBuildSectionSnapshot(minionsPane);
    if(!base){
      return null;
    }
    base.lane = {
      count: GameState.lanes.count,
      offsets: laneConfigs.map(cfg => cfg && Number.isFinite(cfg.offset) ? cfg.offset : 0)
    };
    return base;
  }

  function applyMinionSnapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object'){
      return false;
    }
    let applied = false;
    if(snapshot.lane && Number.isFinite(snapshot.lane.count)){
      setLaneCount(snapshot.lane.count, { syncInput: true, notify: false });
      applied = true;
    }
    updateLaneOffsetControls();
    if(snapshot.lane && Array.isArray(snapshot.lane.offsets)){
      snapshot.lane.offsets.forEach((value, index) => {
        if(Number.isFinite(value)){
          setLaneOffsetNormalized(index, value, { syncInput: true, notify: false });
        }
      });
      applied = true;
    }
    const baseApplied = defaultApplySectionSnapshot(minionsPane, snapshot);
    invalidateLaneLayout({ resetMinions: true });
    return applied || baseApplied;
  }

  setupSectionPersistence({
    paneId: 'minionsPane',
    saveButtonId: 'minionConfigSave',
    loadButtonId: 'minionConfigLoad',
    fileInputId: 'minionConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'minions',
    label: 'Minion waves',
    filePrefix: 'minions',
    buildSnapshot: ()=> buildMinionSnapshot(),
    applySnapshot: (snapshot)=> applyMinionSnapshot(snapshot)
  });

  setupSectionPersistence({
    paneId: 'playerPane',
    saveButtonId: 'playerConfigSave',
    loadButtonId: 'playerConfigLoad',
    fileInputId: 'playerConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'player',
    label: 'Player',
    filePrefix: 'player'
  });

  setupSectionPersistence({
    paneId: 'healthPane',
    saveButtonId: 'healthConfigSave',
    loadButtonId: 'healthConfigLoad',
    fileInputId: 'healthConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'health',
    label: 'Health bar',
    filePrefix: 'health'
  });

  setupSectionPersistence({
    paneId: 'practiceDummyPane',
    storageKey: SECTION_STORAGE_PREFIX + 'practice-dummy',
    label: 'Practice dummy',
    filePrefix: 'practice-dummy',
    buildSnapshot: ()=> buildPracticeDummySnapshot(),
    applySnapshot: (snapshot)=> applyPracticeDummySnapshot(snapshot)
  });

  setupSectionPersistence({
    paneId: 'cameraPane',
    saveButtonId: 'cameraConfigSave',
    loadButtonId: 'cameraConfigLoad',
    fileInputId: 'cameraConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'camera',
    label: 'Camera',
    filePrefix: 'camera'
  });

  setupSectionPersistence({
    paneId: 'abilityPane',
    saveButtonId: 'abilityConfigSave',
    loadButtonId: 'abilityConfigLoad',
    fileInputId: 'abilityConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'ability',
    label: 'Ability bar',
    filePrefix: 'ability'
  });

  setupSectionPersistence({
    paneId: 'minimapPane',
    saveButtonId: 'minimapConfigSave',
    loadButtonId: 'minimapConfigLoad',
    fileInputId: 'minimapConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'minimap',
    label: 'Minimap',
    filePrefix: 'minimap'
  });

  setupSectionPersistence({
    paneId: 'goldPane',
    saveButtonId: 'goldConfigSave',
    loadButtonId: 'goldConfigLoad',
    fileInputId: 'goldConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'gold',
    label: 'Gold',
    filePrefix: 'gold'
  });

  setupSectionPersistence({
    paneId: 'scorePane',
    saveButtonId: 'scoreConfigSave',
    loadButtonId: 'scoreConfigLoad',
    fileInputId: 'scoreConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'score',
    label: 'Score rules',
    filePrefix: 'score'
  });

  setupSectionPersistence({
    paneId: 'uiLayoutPane',
    saveButtonId: 'uiLayoutConfigSave',
    loadButtonId: 'uiLayoutConfigLoad',
    fileInputId: 'uiLayoutConfigFile',
    storageKey: SECTION_STORAGE_PREFIX + 'ui-layout',
    label: 'UI layout',
    filePrefix: 'ui-layout'
  });

  if(gameStateExportButton){
    gameStateExportButton.addEventListener('click', ()=>{
      const json = exportGameState();
      if(!json){
        alert('Unable to export game setup.');
        return;
      }
      const exported = downloadJson(json, formatSectionConfigFilename('game-state'));
      if(exported){
        if(typeof setHudMessage === 'function'){
          setHudMessage('Full game setup exported.');
        }
      } else {
        alert('Unable to download game setup.');
      }
    });
  }

  if(gameStateImportButton){
    gameStateImportButton.addEventListener('click', ()=>{
      if(!gameStateImportInput){
        return;
      }
      gameStateImportInput.value = '';
      if(!triggerFileInputPicker(gameStateImportInput)){
        alert('Unable to open file picker.');
      }
    });
  }

  if(gameStateImportInput){
    gameStateImportInput.addEventListener('change', ()=>{
      const file = gameStateImportInput.files && gameStateImportInput.files[0];
      if(!file){
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', ()=>{
        const text = typeof reader.result === 'string' ? reader.result : '';
        let result;
        try {
          result = importGameState(text);
        } catch (err){
          console.error('importGameState invocation failed', err);
          alert('Import failed: Unexpected error while applying game setup.');
          return;
        }
        if(result && result.ok){
          if(typeof setHudMessage === 'function'){
            setHudMessage('Full game setup imported.');
          }
          if(result.errors && result.errors.length){
            alert(`Imported with warnings:\n\n${result.errors.join('\n')}`);
          }
        } else if(result && Array.isArray(result.errors) && result.errors.length){
          alert(`Import failed:\n\n${result.errors.join('\n')}`);
        } else {
          alert('Import failed: Unable to apply game setup.');
        }
      });
      reader.addEventListener('error', ()=>{
        alert('Unable to read game setup file.');
      });
      reader.readAsText(file);
      gameStateImportInput.value = '';
    });
  }

  // Config inputs
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v|0)); }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function smoothstep01(t){ t = clamp01(t); return t * t * (3 - 2 * t); }
  function clampFloat(v,min,max){
    let n = parseFloat(v);
    if(!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }
  function sanitizeHexColor(value, fallback = '#7fe3ff'){
    if(typeof value !== 'string') return fallback;
    const hex = value.trim();
    if(/^#([0-9a-fA-F]{6})$/.test(hex)){
      return `#${hex.slice(1).toLowerCase()}`;
    }
    if(/^#([0-9a-fA-F]{3})$/.test(hex)){
      const digits = hex.slice(1).toLowerCase();
      return `#${digits.split('').map((c)=> c + c).join('')}`;
    }
    return fallback;
  }
  setCursorEmoji(cursorState.emoji, { syncInput: true });
  setCursorHoverColor(cursorState.hoverColor, { syncInput: true });
  setCursorEnabled(cursorState.enabled, { syncInput: false });
  setCursorOutlineEnabled(cursorState.outlineEnabled, { syncInput: false });
  refreshCursorToggleButtons();
  refreshStageCursor();

  if(cursorToggleBtn){
    cursorToggleBtn.addEventListener('click', () => {
      const next = !cursorState.enabled;
      setCursorEnabled(next, { syncInput: true });
      setHudMessage(`Custom cursor ${next ? 'enabled' : 'disabled'}.`);
    });
  }
  if(cursorOutlineToggle){
    cursorOutlineToggle.addEventListener('click', () => {
      const next = !cursorState.outlineEnabled;
      setCursorOutlineEnabled(next, { syncInput: true });
      setHudMessage(`Hover outline ${next ? 'enabled' : 'disabled'}.`);
    });
  }
  if(cursorEmojiInput){
    const handleCursorEmoji = () => setCursorEmoji(cursorEmojiInput.value, { syncInput: true });
    cursorEmojiInput.addEventListener('input', handleCursorEmoji);
    cursorEmojiInput.addEventListener('change', handleCursorEmoji);
  }
  if(cursorHoverColorInput){
    const handleCursorColor = () => setCursorHoverColor(cursorHoverColorInput.value, { syncInput: false });
    cursorHoverColorInput.addEventListener('input', handleCursorColor);
    cursorHoverColorInput.addEventListener('change', handleCursorColor);
  }

  for(const [type, input] of Object.entries(pingInputs)){
    if(!input) continue;
    input.value = pingState.types[type] || input.value;
    const handlePingEmoji = () => setPingEmoji(type, input.value, { syncInput: true });
    input.addEventListener('input', handlePingEmoji);
    input.addEventListener('change', handlePingEmoji);
  }
  for(const [type, button] of Object.entries(pingButtons)){
    if(!button) continue;
    button.addEventListener('click', () => triggerPing(type));
  }

  updateAttackMoveBindingDisplay();
  updatePingWheelBindingDisplay();
  if(attackMoveBindBtn){
    attackMoveBindBtn.addEventListener('click', () => {
      attackMoveCapture = !attackMoveCapture;
      updateAttackMoveBindingDisplay();
      if(attackMoveCapture){
        setHudMessage('Press a key for attack move.');
      }
    });
  }

  if(pingWheelBindBtn){
    pingWheelBindBtn.addEventListener('click', () => {
      pingWheelCapture = !pingWheelCapture;
      updatePingWheelBindingDisplay();
      if(pingWheelCapture){
        setHudMessage('Press a key for the ping wheel.');
      }
    });
  }

  if(spellCastDefaultSelect){
    spellCastDefaultSelect.addEventListener('change', ()=>{
      setDefaultSpellCastType(spellCastDefaultSelect.value, { syncInput: true });
    });
  }
  if(spellCastNormalBindBtn){
    spellCastNormalBindBtn.addEventListener('click', ()=> toggleSpellCastBindingCapture('normal'));
  }
  if(spellCastQuickBindBtn){
    spellCastQuickBindBtn.addEventListener('click', ()=> toggleSpellCastBindingCapture('quick'));
  }
  if(spellCastIndicatorBindBtn){
    spellCastIndicatorBindBtn.addEventListener('click', ()=> toggleSpellCastBindingCapture('quickIndicator'));
  }
  if(abilityCountInput){
    abilityCountInput.addEventListener('input', ()=>{
      const count = sanitizeAbilityCount(abilityCountInput.value);
      abilityCountInput.value = String(count);
      setAbilityBar(count, abilityBarState.scale);
    });
  }
  if(abilityScaleInput){
    abilityScaleInput.addEventListener('input', ()=>{
      const raw = abilityScaleInput.value;
      if(raw === ''){
        setAbilityBar(abilityBarState.count, 0, false);
        return;
      }
      const scale = sanitizeAbilityScale(raw);
      setAbilityBar(abilityBarState.count, scale, false);
    });
    abilityScaleInput.addEventListener('change', ()=>{
      const raw = abilityScaleInput.value;
      if(raw === ''){
        setAbilityBar(abilityBarState.count, 0, true);
        return;
      }
      const scale = sanitizeAbilityScale(raw);
      setAbilityBar(abilityBarState.count, scale, true);
    });
  }
  if(abilityOrientationSelect){
    abilityOrientationSelect.addEventListener('change', ()=>{
      setAbilityOrientation(abilityOrientationSelect.value, { syncInput: false });
    });
    setAbilityOrientation(abilityOrientationSelect.value, { syncInput: true });
  } else {
    setAbilityOrientation(abilityBarState.orientation, { syncInput: false });
  }
  if(abilityHealthHorizontalSelect){
    abilityHealthHorizontalSelect.addEventListener('change', ()=>{
      setAbilityHealthPlacementHorizontal(abilityHealthHorizontalSelect.value, { syncInput: false });
    });
    setAbilityHealthPlacementHorizontal(abilityHealthHorizontalSelect.value, { syncInput: true });
  } else {
    setAbilityHealthPlacementHorizontal(abilityBarState.healthPlacement.horizontal, { syncInput: false });
  }
  if(abilityHealthVerticalSelect){
    abilityHealthVerticalSelect.addEventListener('change', ()=>{
      setAbilityHealthPlacementVertical(abilityHealthVerticalSelect.value, { syncInput: false });
    });
    setAbilityHealthPlacementVertical(abilityHealthVerticalSelect.value, { syncInput: true });
  } else {
    setAbilityHealthPlacementVertical(abilityBarState.healthPlacement.vertical, { syncInput: false });
  }
  if(abilityHealthVerticalTextSelect){
    abilityHealthVerticalTextSelect.addEventListener('change', ()=>{
      setAbilityHealthTextPlacementVertical(abilityHealthVerticalTextSelect.value, { syncInput: false });
    });
    setAbilityHealthTextPlacementVertical(abilityHealthVerticalTextSelect.value, { syncInput: true });
  } else {
    setAbilityHealthTextPlacementVertical(abilityBarState.healthPlacement.textVertical, { syncInput: false });
  }
  if(abilityStatsVerticalSelect){
    abilityStatsVerticalSelect.addEventListener('change', ()=>{
      setAbilityStatsPlacementVertical(abilityStatsVerticalSelect.value, { syncInput: false });
    });
    setAbilityStatsPlacementVertical(abilityStatsVerticalSelect.value, { syncInput: true });
  } else {
    setAbilityStatsPlacementVertical(abilityBarState.statsPlacementVertical, { syncInput: false });
  }
  if(minimapScaleInput){
    const handleMinimapScale = ()=> setMinimapUserScale(minimapScaleInput.value, { syncInput: false });
    minimapScaleInput.addEventListener('input', handleMinimapScale);
    minimapScaleInput.addEventListener('change', handleMinimapScale);
    setMinimapUserScale(minimapScaleInput.value, { syncInput: true });
  } else {
    setMinimapUserScale(minimapState.userScale, { syncInput: false });
  }
  if(minimapClickToMoveSelect){
    const handleMinimapOrders = ()=> setMinimapClickToMove(minimapClickToMoveSelect.value, { syncInput: false });
    minimapClickToMoveSelect.addEventListener('change', handleMinimapOrders);
    setMinimapClickToMove(minimapClickToMoveSelect.value, { syncInput: true });
  } else {
    setMinimapClickToMove(minimapState.clickToMoveEnabled, { syncInput: false });
  }
  if(minimapClickThroughSelect){
    const handleMinimapThrough = ()=> setMinimapClickThrough(minimapClickThroughSelect.value, { syncInput: false });
    minimapClickThroughSelect.addEventListener('change', handleMinimapThrough);
    setMinimapClickThrough(minimapClickThroughSelect.value, { syncInput: true });
  } else {
    setMinimapClickThrough(minimapState.clickThroughEnabled, { syncInput: false });
  }
  if(spellSpeedScaleInput){
    spellSpeedScaleInput.addEventListener('input', ()=>{
      setSpellSpeedScale(spellSpeedScaleInput.value, { syncInput: true });
    });
    setSpellSpeedScale(abilityTunables.spellSpeedScale, { syncInput: true });
  }
  if(spellSizeScaleInput){
    spellSizeScaleInput.addEventListener('input', ()=>{
      setSpellSizeScale(spellSizeScaleInput.value, { syncInput: true });
    });
    setSpellSizeScale(abilityTunables.spellSizeScale, { syncInput: true });
  }
  initUiLayoutControls();
  if(goldPerSecondInput){
    goldPerSecondInput.addEventListener('input', ()=>{
      const value = clampFloat(goldPerSecondInput.value, 0, 100);
      goldState.perSecond = value;
      goldPerSecondInput.value = String(value);
    });
    goldPerSecondInput.dispatchEvent(new Event('input'));
  }
  if(goldPerKillInput){
    goldPerKillInput.addEventListener('input', ()=>{
      const value = clampFloat(goldPerKillInput.value, 0, 100);
      goldState.perKill = value;
      goldPerKillInput.value = String(value);
    });
    goldPerKillInput.dispatchEvent(new Event('input'));
  }
  waveCountInput.addEventListener('input', ()=>{
    waveState.waveCount = clamp(waveCountInput.value,0,1000);
    waveCountInput.value = String(waveState.waveCount);
  });
  waveIntervalInput.addEventListener('input', ()=>{
    const sec = clamp(waveIntervalInput.value,5,60);
    waveIntervalInput.value = String(sec);
    waveState.waveIntervalMs = sec*1000;
    if(timerState.running){
      const cur=performance.now()-timerState.start;
      timerState.nextWaveAtMs = cur + waveState.waveIntervalMs;
    }
  });
  spawnSpacingInput.addEventListener('input', ()=>{
    const sec = clampFloat(spawnSpacingInput.value,0,1);
    spawnSpacingInput.value = sec.toFixed(2);
    waveState.spawnSpacingMs = sec * 1000;
  });
  spawnSpacingInput.dispatchEvent(new Event('input'));
  if(laneCountInput){
    laneCountInput.addEventListener('input', ()=>{
      setLaneCount(laneCountInput.value, { syncInput: false, notify: true });
    });
    setLaneCount(laneCountInput.value, { syncInput: false, notify: false });
  } else {
    setLaneCount(GameState.lanes.count, { syncInput: false, notify: false });
  }
  minionSizeInput.addEventListener('input', ()=>{
    const size = clamp(minionSizeInput.value,0,1000);
    minionSizeInput.value = String(size);
    setMinionSizePx(size);
  });
  minionSizeInput.dispatchEvent(new Event('input'));
  minionHPInput.addEventListener('input', ()=>{
    portalState.baseMinionHP = clamp(minionHPInput.value,1,1000);
    minionHPInput.value = String(portalState.baseMinionHP);
  });
  minionDMGInput.addEventListener('input', ()=>{
    portalState.baseMinionDMG = clamp(minionDMGInput.value,1,100);
    minionDMGInput.value = String(portalState.baseMinionDMG);
  });
  scalePctInput.addEventListener('input', ()=>{
    const next = Math.max(0, Math.min(50, Number(scalePctInput.value) || 0));
    portalState.scalePct = next;
    scalePctInput.value = String(next);
  });
  playerSpeedInput.addEventListener('input', ()=>{
    const speed = clamp(playerSpeedInput.value,1,1000);
    playerSpeedInput.value = String(speed);
    player.speed = speed;
    updateHudStats();
  });
  playerSizeInput.addEventListener('input', ()=>{
    const size = clamp(playerSizeInput.value,0,1000);
    playerSizeInput.value = String(size);
    player.r = size;
    player.x = Math.max(player.r, Math.min(mapState.width - player.r, player.x));
    player.y = Math.max(player.r, Math.min(mapState.height - player.r, player.y));
    positionPlayerFloatingHud();
    positionPracticeDummyHud();
    clearEntityNav(player);
    if(playerRuntime.model){
      playerRuntime.model.setPlayerRadius(size);
    }
  });
  if(playerTeamSelect){
    playerTeamSelect.addEventListener('change', ()=>{
      setPlayerTeam(playerTeamSelect.value);
    });
  }
  if(playerHpInput){
    playerHpInput.addEventListener('input', ()=>{
      const maxHp = clamp(playerHpInput.value,0,10000);
      playerHpInput.value = String(maxHp);
      const prevMax = Math.max(0, Number(player.maxHp) || 0);
      const prevHp = Math.max(0, Number(player.hp) || 0);
      player.maxHp = maxHp;
      if(maxHp <= 0){
        player.hp = 0;
      } else if(prevMax <= 0){
        player.hp = maxHp;
      } else {
        const ratio = prevMax > 0 ? prevHp / prevMax : 1;
        const nextHp = Number.isFinite(ratio) ? ratio * maxHp : maxHp;
        player.hp = Math.max(0, Math.min(maxHp, Math.round(nextHp)));
      }
      updateHudHealth();
    });
  }
  if(playerFloatSizeInput){
    const handleFloatSizeChange = ()=>{
      const width = clampSettingValue(playerFloatSizeInput.value, SETTINGS_RANGE_MIN);
      playerFloatState.width = width;
      playerFloatSizeInput.value = String(width);
      applyPlayerFloatHudSizing();
      positionPlayerFloatingHud();
      positionPracticeDummyHud();
    };
    playerFloatSizeInput.addEventListener('input', handleFloatSizeChange);
    handleFloatSizeChange();
  }
  if(playerFloatOffsetInput){
    const handleFloatOffsetChange = ()=>{
      const offset = clampSettingValue(playerFloatOffsetInput.value, SETTINGS_RANGE_MIN);
      playerFloatState.gap = offset;
      playerFloatOffsetInput.value = String(offset);
      if(playerFloatOffsetDisplay){
        playerFloatOffsetDisplay.textContent = `${Math.round(playerFloatState.gap)}px`;
      }
      applyPlayerFloatHudSizing();
      positionPlayerFloatingHud();
      positionPracticeDummyHud();
    };
    playerFloatOffsetInput.addEventListener('input', handleFloatOffsetChange);
    handleFloatOffsetChange();
  }
  if(playerFloatHeightInput){
    const handleFloatHeightChange = ()=>{
      const height = clampFloat(playerFloatHeightInput.value, 0, 500);
      playerFloatState.height = height;
      playerFloatHeightInput.value = String(height);
      if(playerFloatHeightDisplay){
        playerFloatHeightDisplay.textContent = `${Math.round(height)}px`;
      }
      applyPlayerFloatHudSizing();
    };
    playerFloatHeightInput.addEventListener('input', handleFloatHeightChange);
    handleFloatHeightChange();
  }
  if(practiceDummySizeInput){
    const handlePracticeSizeChange = ()=>{
      const size = clampPracticeDummySize(practiceDummySizeInput.value, practiceDummy.size);
      practiceDummy.size = size;
      practiceDummySizeInput.value = String(Math.round(size));
      if(practiceDummySizeDisplay){
        practiceDummySizeDisplay.textContent = `${Math.round(size)}px`;
      }
      updatePracticeDummyHud();
      positionPracticeDummyHud();
      renderMinimap(true);
    };
    practiceDummySizeInput.addEventListener('input', handlePracticeSizeChange);
    handlePracticeSizeChange();
  }
  if(practiceDummyMoveButton){
    practiceDummyMoveButton.addEventListener('click', ()=>{
      if(practiceDummy && practiceDummy.respawnTimer > 0){
        return;
      }
      const nextPlacing = !practiceDummyState.placing;
      practiceDummyState.placing = nextPlacing;
      practiceDummyState.selected = false;
      if(!nextPlacing){
        stopVisionDummyDrag();
      }
      updatePracticeDummyUiState();
    });
  }
  if(practiceDummyResetButton){
    practiceDummyResetButton.addEventListener('click', ()=>{
      respawnPracticeDummy({ resetPosition: true, resetSize: true, resetStats: true });
      practiceDummyState.selected = false;
      updatePracticeDummyUiState();
    });
  }
  if(practiceDummyRemoveButton){
    practiceDummyRemoveButton.addEventListener('click', ()=>{
      const active = practiceDummy && practiceDummy.active !== false && !(practiceDummy && practiceDummy.respawnTimer > 0);
      if(!active || !(practiceDummyState && practiceDummyState.selected)){
        return;
      }
      removePracticeDummy();
    });
  }
  if(monsterMoveButton){
    monsterMoveButton.addEventListener('click', ()=>{
      if(monsterDragState.dragging){
        cancelMonsterDrag();
        return;
      }
      if(monsterDragState.active){
        cancelMonsterDrag();
      } else {
        monsterDragState.active = true;
        monsterDragState.messageActive = true;
        setHudMessage('Click and drag on the map to move the monster.');
        updateMonsterUiState();
      }
    });
  }
  if(monsterAggroRadiusInput){
    const handleMonsterAggroChange = ()=>{
      const radius = Math.max(0, Number(monsterAggroRadiusInput.value) || 0);
      monsterState.aggroRadius = radius;
      monsterAggroRadiusInput.value = String(Math.round(radius));
    };
    monsterAggroRadiusInput.addEventListener('input', handleMonsterAggroChange);
    monsterAggroRadiusInput.addEventListener('change', handleMonsterAggroChange);
  }
  if(monsterSizeInput){
    const handleMonsterSizeChange = ()=>{
      const size = Math.max(40, Math.min(400, Number(monsterSizeInput.value) || monsterState.size));
      monsterState.size = size;
      monsterSizeInput.value = String(Math.round(size));
      updateMonsterHud();
      positionMonsterHud();
    };
    monsterSizeInput.addEventListener('input', handleMonsterSizeChange);
    monsterSizeInput.addEventListener('change', handleMonsterSizeChange);
  }
  if(monsterMaxHpInput){
    const handleMonsterMaxHpChange = ()=>{
      const maxHp = Math.max(1, Number(monsterMaxHpInput.value) || monsterState.maxHp || 1);
      monsterState.maxHp = maxHp;
      monsterState.hp = Math.max(0, Math.min(maxHp, Number(monsterState.hp) || maxHp));
      monsterMaxHpInput.value = String(Math.round(maxHp));
      updateMonsterHud();
    };
    monsterMaxHpInput.addEventListener('input', handleMonsterMaxHpChange);
    monsterMaxHpInput.addEventListener('change', handleMonsterMaxHpChange);
  }
  if(monsterProjectileDamageInput){
    const handleMonsterDamageChange = ()=>{
      const damage = Math.max(0, Number(monsterProjectileDamageInput.value) || 0);
      monsterState.projectileDamage = damage;
      monsterProjectileDamageInput.value = String(Math.round(damage));
    };
    monsterProjectileDamageInput.addEventListener('input', handleMonsterDamageChange);
    monsterProjectileDamageInput.addEventListener('change', handleMonsterDamageChange);
  }
  if(monsterCastIntervalInput){
    const handleMonsterIntervalChange = ()=>{
      const interval = Math.max(0.5, Number(monsterCastIntervalInput.value) || monsterState.castInterval || 1);
      monsterState.castInterval = interval;
      monsterState.castTimer = Math.min(Math.max(0, Number(monsterState.castTimer) || interval), interval);
      monsterCastIntervalInput.value = interval.toFixed(2);
      updateMonsterAbilityQueueDisplay();
    };
    monsterCastIntervalInput.addEventListener('input', handleMonsterIntervalChange);
    monsterCastIntervalInput.addEventListener('change', handleMonsterIntervalChange);
  }
  if(monsterQueueSizeInput){
    const handleMonsterQueueChange = ()=>{
      const queueSize = Math.max(1, Math.min(6, Number(monsterQueueSizeInput.value) || monsterState.queueSize || 1));
      monsterState.queueSize = queueSize;
      monsterQueueSizeInput.value = String(Math.round(queueSize));
      ensureMonsterQueue(monsterState);
      updateMonsterAbilityQueueDisplay();
    };
    monsterQueueSizeInput.addEventListener('input', handleMonsterQueueChange);
    monsterQueueSizeInput.addEventListener('change', handleMonsterQueueChange);
  }
  if(monsterSlotSpinInput){
    const handleMonsterSlotSpinChange = ()=>{
      const duration = Math.max(0, Number(monsterSlotSpinInput.value) || 0);
      monsterState.slotMachineSpinDuration = duration;
      monsterSlotSpinInput.value = duration.toFixed(2);
    };
    monsterSlotSpinInput.addEventListener('input', handleMonsterSlotSpinChange);
    monsterSlotSpinInput.addEventListener('change', handleMonsterSlotSpinChange);
  }
  if(monsterSlotRevealInput){
    const handleMonsterSlotRevealChange = ()=>{
      const duration = Math.max(0, Number(monsterSlotRevealInput.value) || 0);
      monsterState.slotMachineRevealDuration = duration;
      monsterSlotRevealInput.value = duration.toFixed(2);
    };
    monsterSlotRevealInput.addEventListener('input', handleMonsterSlotRevealChange);
    monsterSlotRevealInput.addEventListener('change', handleMonsterSlotRevealChange);
  }
  if(monsterFreezeDurationInput){
    const handleMonsterFreezeChange = ()=>{
      const freezeDuration = Math.max(0, Number(monsterFreezeDurationInput.value) || 0);
      monsterState.freezeDuration = freezeDuration;
      monsterFreezeDurationInput.value = freezeDuration.toFixed(2);
    };
    monsterFreezeDurationInput.addEventListener('input', handleMonsterFreezeChange);
    monsterFreezeDurationInput.addEventListener('change', handleMonsterFreezeChange);
  }
  if(monsterSpeedBoostPctInput){
    const handleMonsterSpeedChange = ()=>{
      const boost = Math.max(0, Number(monsterSpeedBoostPctInput.value) || 0);
      monsterState.speedBoostPct = boost;
      monsterSpeedBoostPctInput.value = String(Math.round(boost));
    };
    monsterSpeedBoostPctInput.addEventListener('input', handleMonsterSpeedChange);
    monsterSpeedBoostPctInput.addEventListener('change', handleMonsterSpeedChange);
  }
  if(monsterHealAmountInput){
    const handleMonsterHealChange = ()=>{
      const heal = Math.max(0, Number(monsterHealAmountInput.value) || 0);
      monsterState.healAmount = heal;
      monsterHealAmountInput.value = String(Math.round(heal));
    };
    monsterHealAmountInput.addEventListener('input', handleMonsterHealChange);
    monsterHealAmountInput.addEventListener('change', handleMonsterHealChange);
  }
  const handleMonsterIconChange = (abilityId, input)=>{
    if(!input){
      return;
    }
    const handler = ()=>{
      setMonsterProjectileIcon(abilityId, input.value);
      syncMonsterInputs();
      updatePrayerButtons();
      updatePrayerHud();
      updateMonsterAbilityQueueDisplay();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  };
  handleMonsterIconChange('green', monsterIconGreenInput);
  handleMonsterIconChange('blue', monsterIconBlueInput);
  handleMonsterIconChange('red', monsterIconRedInput);
  if(practiceDummyDeathResponseSelect){
    practiceDummyDeathResponseSelect.addEventListener('change', ()=>{
      if(!practiceDummy){
        return;
      }
      const value = practiceDummyDeathResponseSelect.value === 'despawn' ? 'despawn' : 'respawn';
      practiceDummy.deathResponse = value;
      if(value === 'despawn' && practiceDummy.respawnTimer > 0){
        removePracticeDummy();
      }
      updatePracticeDummyUiState();
    });
    updatePracticeDummyUiState();
  }
  if(playerAttackBarWidthInput && playerFloatState.attack){
    const handleAttackWidthChange = ()=>{
      const width = clampSettingValue(playerAttackBarWidthInput.value, SETTINGS_RANGE_MIN);
      playerFloatState.attack.width = width;
      playerAttackBarWidthInput.value = String(width);
      if(playerAttackBarWidthDisplay){
        playerAttackBarWidthDisplay.textContent = `${Math.round(width)}px`;
      }
      applyPlayerFloatHudSizing();
    };
    playerAttackBarWidthInput.addEventListener('input', handleAttackWidthChange);
    handleAttackWidthChange();
  }
  if(playerAttackBarHeightInput && playerFloatState.attack){
    const handleAttackHeightChange = ()=>{
      const height = clampFloat(playerAttackBarHeightInput.value, 0, 500);
      playerFloatState.attack.height = height;
      playerAttackBarHeightInput.value = String(height);
      if(playerAttackBarHeightDisplay){
        playerAttackBarHeightDisplay.textContent = `${Math.round(height)}px`;
      }
      applyPlayerFloatHudSizing();
    };
    playerAttackBarHeightInput.addEventListener('input', handleAttackHeightChange);
    handleAttackHeightChange();
  }
  if(playerAttackBarOffsetXInput && playerFloatState.attack){
    const handleAttackOffsetXChange = ()=>{
      const offset = clampUiOffsetValue(playerAttackBarOffsetXInput.value);
      playerFloatState.attack.offsetX = offset;
      playerAttackBarOffsetXInput.value = String(Math.round(offset));
      applyPlayerFloatHudSizing();
    };
    playerAttackBarOffsetXInput.addEventListener('input', handleAttackOffsetXChange);
    handleAttackOffsetXChange();
  }
  if(playerAttackBarOffsetYInput && playerFloatState.attack){
    const handleAttackOffsetYChange = ()=>{
      const offset = clampUiOffsetValue(playerAttackBarOffsetYInput.value);
      playerFloatState.attack.offsetY = offset;
      playerAttackBarOffsetYInput.value = String(Math.round(offset));
      applyPlayerFloatHudSizing();
    };
    playerAttackBarOffsetYInput.addEventListener('input', handleAttackOffsetYChange);
    handleAttackOffsetYChange();
  }
  if(playerIconWidthInput && playerFloatState.icons){
    const handleIconWidthChange = ()=>{
      const width = clampFloat(playerIconWidthInput.value, 0, 400);
      playerFloatState.icons.width = width;
      playerIconWidthInput.value = String(width);
      if(playerIconWidthDisplay){
        playerIconWidthDisplay.textContent = `${Math.round(width)}px`;
      }
      applyPlayerFloatHudSizing();
    };
    playerIconWidthInput.addEventListener('input', handleIconWidthChange);
    handleIconWidthChange();
  }
  if(playerIconHeightInput && playerFloatState.icons){
    const handleIconHeightChange = ()=>{
      const height = clampFloat(playerIconHeightInput.value, 0, 400);
      playerFloatState.icons.height = height;
      playerIconHeightInput.value = String(height);
      if(playerIconHeightDisplay){
        playerIconHeightDisplay.textContent = `${Math.round(height)}px`;
      }
      applyPlayerFloatHudSizing();
    };
    playerIconHeightInput.addEventListener('input', handleIconHeightChange);
    handleIconHeightChange();
  }
  if(playerIconOffsetXInput && playerFloatState.icons){
    const handleIconOffsetXChange = ()=>{
      const offset = clampUiOffsetValue(playerIconOffsetXInput.value);
      playerFloatState.icons.offsetX = offset;
      playerIconOffsetXInput.value = String(Math.round(offset));
      applyPlayerFloatHudSizing();
    };
    playerIconOffsetXInput.addEventListener('input', handleIconOffsetXChange);
    handleIconOffsetXChange();
  }
  if(playerIconOffsetYInput && playerFloatState.icons){
    const handleIconOffsetYChange = ()=>{
      const offset = clampUiOffsetValue(playerIconOffsetYInput.value);
      playerFloatState.icons.offsetY = offset;
      playerIconOffsetYInput.value = String(Math.round(offset));
      applyPlayerFloatHudSizing();
    };
    playerIconOffsetYInput.addEventListener('input', handleIconOffsetYChange);
    handleIconOffsetYChange();
  }
  if(playerAttackRangeOpacityInput){
    const initialOpacityPct = clampSettingValue(Math.round((Number(player.attackRangeOpacity) || 0) * 100), SETTINGS_RANGE_MIN);
    playerAttackRangeOpacityInput.value = String(initialOpacityPct);
    const handleRangeOpacityChange = ()=>{
      const pct = clampSettingValue(playerAttackRangeOpacityInput.value, SETTINGS_RANGE_MIN);
      playerAttackRangeOpacityInput.value = String(pct);
      player.attackRangeOpacity = Math.min(1, pct / 100);
      if(playerAttackRangeOpacityDisplay){
        playerAttackRangeOpacityDisplay.textContent = `${Math.round(pct)}%`;
      }
    };
    playerAttackRangeOpacityInput.addEventListener('input', handleRangeOpacityChange);
    handleRangeOpacityChange();
  }
  if(playerHitboxToggleButton){
    const syncHitboxToggleLabel = ()=>{
      const visible = player.hitboxVisible !== false;
      playerHitboxToggleButton.textContent = visible ? 'Hide hitbox' : 'Show hitbox';
      playerHitboxToggleButton.setAttribute('aria-pressed', visible ? 'true' : 'false');
    };
    playerHitboxToggleButton.addEventListener('click', ()=>{
      const visible = player.hitboxVisible !== false;
      player.hitboxVisible = !visible;
      syncHitboxToggleLabel();
    });
    syncHitboxToggleLabel();
  }
  if(playerHitboxShapeSelect){
    const syncHitboxShape = ()=>{
      const value = (playerHitboxShapeSelect.value || '').toLowerCase();
      if(value === 'circle' || value === 'rectangle' || value === 'capsule'){
        player.hitboxShape = value;
      } else {
        player.hitboxShape = 'capsule';
        playerHitboxShapeSelect.value = 'capsule';
      }
    };
    playerHitboxShapeSelect.addEventListener('change', syncHitboxShape);
    if(player.hitboxShape){
      playerHitboxShapeSelect.value = player.hitboxShape;
    }
    syncHitboxShape();
  }
  if(playerHitboxLengthInput){
    const syncHitboxLength = ()=>{
      const min = Number(playerHitboxLengthInput.min);
      const max = Number(playerHitboxLengthInput.max);
      const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
      const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
      let length = clampSettingValue(playerHitboxLengthInput.value, clampMin);
      length = Math.min(clampMax, Math.max(clampMin, length));
      if(!Number.isFinite(length)){
        length = Number.isFinite(player.hitboxLength) ? player.hitboxLength : clampMin;
      }
      player.hitboxLength = length;
      playerHitboxLengthInput.value = String(length);
      if(playerHitboxLengthDisplay){
        playerHitboxLengthDisplay.textContent = `${Math.round(length)}px`;
      }
    };
    playerHitboxLengthInput.addEventListener('input', syncHitboxLength);
    syncHitboxLength();
  }
  if(playerHitboxWidthInput){
    const syncHitboxWidth = ()=>{
      const min = Number(playerHitboxWidthInput.min);
      const max = Number(playerHitboxWidthInput.max);
      const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
      const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
      let width = clampSettingValue(playerHitboxWidthInput.value, clampMin);
      width = Math.min(clampMax, Math.max(clampMin, width));
      if(!Number.isFinite(width)){
        width = Number.isFinite(player.hitboxWidth) ? player.hitboxWidth : clampMin;
      }
      player.hitboxWidth = width;
      playerHitboxWidthInput.value = String(width);
      if(playerHitboxWidthDisplay){
        playerHitboxWidthDisplay.textContent = `${Math.round(width)}px`;
      }
    };
    playerHitboxWidthInput.addEventListener('input', syncHitboxWidth);
    syncHitboxWidth();
  }
  if(playerSpellOriginLengthInput){
    const syncOriginLength = ()=>{
      const min = Number(playerSpellOriginLengthInput.min);
      const max = Number(playerSpellOriginLengthInput.max);
      const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
      const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
      let raw = clampSettingValue(playerSpellOriginLengthInput.value, clampMin);
      if(!Number.isFinite(raw)){
        raw = SPELL_ORIGIN_SLIDER_CENTER + (Number.isFinite(player.spellOriginLengthOffset) ? player.spellOriginLengthOffset : 0);
      }
      raw = Math.max(clampMin, Math.min(clampMax, raw));
      playerSpellOriginLengthInput.value = String(raw);
      const offset = raw - SPELL_ORIGIN_SLIDER_CENTER;
      player.spellOriginLengthOffset = offset;
      if(playerSpellOriginLengthDisplay){
        const rounded = Math.round(offset);
        const sign = rounded >= 0 ? '+' : '';
        playerSpellOriginLengthDisplay.textContent = `${sign}${rounded}px`;
      }
    };
    playerSpellOriginLengthInput.addEventListener('input', syncOriginLength);
    syncOriginLength();
  }
  if(playerSpellOriginWidthInput){
    const syncOriginWidth = ()=>{
      const min = Number(playerSpellOriginWidthInput.min);
      const max = Number(playerSpellOriginWidthInput.max);
      const clampMin = Number.isFinite(min) ? min : SETTINGS_RANGE_MIN;
      const clampMax = Number.isFinite(max) ? max : SETTINGS_RANGE_MAX;
      let raw = clampSettingValue(playerSpellOriginWidthInput.value, clampMin);
      if(!Number.isFinite(raw)){
        raw = SPELL_ORIGIN_SLIDER_CENTER + (Number.isFinite(player.spellOriginWidthOffset) ? player.spellOriginWidthOffset : 0);
      }
      raw = Math.max(clampMin, Math.min(clampMax, raw));
      playerSpellOriginWidthInput.value = String(raw);
      const offset = raw - SPELL_ORIGIN_SLIDER_CENTER;
      player.spellOriginWidthOffset = offset;
      if(playerSpellOriginWidthDisplay){
        const rounded = Math.round(offset);
        const sign = rounded >= 0 ? '+' : '';
        playerSpellOriginWidthDisplay.textContent = `${sign}${rounded}px`;
      }
    };
    playerSpellOriginWidthInput.addEventListener('input', syncOriginWidth);
    syncOriginWidth();
  }
  if(playerAttackRangeInput){
    playerAttackRangeInput.addEventListener('input', ()=>{
      const range = clamp(playerAttackRangeInput.value,0,1000);
      playerAttackRangeInput.value = String(range);
      player.attackRange = range;
      updateHudStats();
      if(player.attackTarget){
        const dx = player.attackTarget.x - player.x;
        const dy = player.attackTarget.y - player.y;
        if(dx*dx + dy*dy > range*range){
          cancelPlayerAttack();
        }
      }
    });
  }
  if(playerAttackSpeedInput){
    playerAttackSpeedInput.addEventListener('input', ()=>{
      const speed = clamp(playerAttackSpeedInput.value,0,5000);
      playerAttackSpeedInput.value = String(speed);
      player.attackSpeedMs = speed;
      updateHudStats();
      const speedSeconds = speed / 1000;
      if(speed === 0){
        player.attackCooldown = 0;
      } else if(player.attackCooldown > speedSeconds){
        player.attackCooldown = speedSeconds;
      }
    });
  }
  if(playerAttackWindupInput){
    playerAttackWindupInput.addEventListener('input', ()=>{
      const windup = clamp(playerAttackWindupInput.value,0,5000);
      playerAttackWindupInput.value = String(windup);
      player.attackWindupMs = windup;
      updateHudStats();
      const windupSeconds = windup / 1000;
      if(player.attackWindup > windupSeconds){
        player.attackWindup = windupSeconds;
      }
    });
  }
  if(playerAttackDamageInput){
    playerAttackDamageInput.addEventListener('input', ()=>{
      const dmg = clamp(playerAttackDamageInput.value,0,1000);
      playerAttackDamageInput.value = String(dmg);
      player.attackDamage = dmg;
      updateHudStats();
      if(player.attackDamage <= 0){
        cancelPlayerAttack();
      }
    });
  }
  if(playerHitSplatSizeInput){
    playerHitSplatSizeInput.addEventListener('input', ()=>{
      const size = clamp(playerHitSplatSizeInput.value,0,100);
      playerHitSplatSizeInput.value = String(size);
      player.hitSplatSize = size;
    });
  }
  if(playerMoveCircleStartInput){
    const handleMoveCircleStartChange = ()=>{
      const start = clampFloat(playerMoveCircleStartInput.value,0,1000);
      player.moveCircleStart = start;
      playerMoveCircleStartInput.value = String(start);
      if(player.moveCircleEnd < start){
        player.moveCircleEnd = start;
        if(playerMoveCircleEndInput){
          playerMoveCircleEndInput.value = String(start);
        }
      }
    };
    playerMoveCircleStartInput.addEventListener('input', handleMoveCircleStartChange);
    handleMoveCircleStartChange();
  }
  if(playerMoveCircleEndInput){
    const handleMoveCircleEndChange = ()=>{
      const endRaw = clampFloat(playerMoveCircleEndInput.value,0,1000);
      const start = Math.max(0, Number(player.moveCircleStart) || 0);
      const end = Math.max(start, endRaw);
      player.moveCircleEnd = end;
      playerMoveCircleEndInput.value = String(end);
    };
    playerMoveCircleEndInput.addEventListener('input', handleMoveCircleEndChange);
    handleMoveCircleEndChange();
  }
  if(playerMoveCircleColorInput){
    const handleMoveCircleColorChange = ()=>{
      const color = sanitizeHexColor(playerMoveCircleColorInput.value, player.moveCircleColor);
      player.moveCircleColor = color;
      playerMoveCircleColorInput.value = color;
    };
    playerMoveCircleColorInput.addEventListener('input', handleMoveCircleColorChange);
    handleMoveCircleColorChange();
  }
  pointsPerInput.addEventListener('input', ()=>{
    scoreState.pointsPer = clamp(pointsPerInput.value,1,10);
    pointsPerInput.value = String(scoreState.pointsPer);
  });
  winTargetInput.addEventListener('input', ()=>{
    scoreState.winTarget = clamp(winTargetInput.value,1,1000);
    winTargetInput.value = String(scoreState.winTarget);
  });

  // Start/stop
  btnPlay.addEventListener('click', ()=>{
    if(timerState.running){
      stopGame();
    } else {
      playGame();
    }
  });

  // Paths
  function getPath(side){
    const s = side==='blue' ? blueSpawns : redSpawns;
    const e = side==='blue' ? redSpawns : blueSpawns; // opponent spawn acts as endpoint (portal)
    if(s.length && e.length) return {from:s[0], to:e[0]};
    return null;
  }

  function statsForWave(w){
    // Linear scaling: base  (1 + portalState.scalePct%  (w-1))
    const mult = 1 + (portalState.scalePct/100) * Math.max(0, w-1);
    const hp = Math.max(1, Math.round(portalState.baseMinionHP * mult));
    const dmg = Math.max(1, Math.round(portalState.baseMinionDMG * mult));
    return {hp, dmg};
  }

  function enqueueMinionSpawn(side, path, hp, dmg, spawnAt, slotIndex = 0, laneIndex = 0){
    const job = {
      side,
      at: spawnAt,
      from: { x: path && path.from ? path.from.x : 0, y: path && path.from ? path.from.y : 0 },
      to: { x: path && path.to ? path.to.x : 0, y: path && path.to ? path.to.y : 0 },
      hp,
      dmg,
      slotIndex,
      laneIndex,
      laneLabel: path && path.label ? path.label : String((laneIndex || 0) + 1),
      path: path || null
    };

    const insertAt = pendingSpawns.findIndex(existing => job.at < existing.at);
    if(insertAt === -1){ pendingSpawns.push(job); }
    else { pendingSpawns.splice(insertAt, 0, job); }
  }

  function blendAngles(from, to, weight){
    const t = Math.max(0, Math.min(1, weight));
    const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + diff * t;
  }

  function spawnFromQueue(job){
    const lanePath = job.path || null;
    const slotIndex = job.slotIndex || 0;
    const fanOffset = fanSlotOffset(slotIndex) * laneFanSpacing;

    if(lanePath){
      const laneLen = lanePath.totalLength || Math.hypot(job.to.x - job.from.x, job.to.y - job.from.y) || 1;
      const midSample = lanePointAtDistance(lanePath, laneLen * 0.5);
      const firstSegment = lanePath.segments && lanePath.segments[0] ? lanePath.segments[0] : null;
      const laneDir = firstSegment ? { x: firstSegment.dirX, y: firstSegment.dirY }
        : (()=>{
            const dx = job.to.x - job.from.x;
            const dy = job.to.y - job.from.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: dx / len, y: dy / len };
          })();
      const laneNormal = firstSegment ? { x: firstSegment.normalX, y: firstSegment.normalY }
        : { x: -laneDir.y, y: laneDir.x };
      const laneFacing = Math.atan2(laneDir.y, laneDir.x);
      const neutralProj = midSample ? midSample.distance : laneLen * 0.5;
      const neutralPoint = midSample ? { x: midSample.point.x, y: midSample.point.y }
        : {
            x: job.from.x + laneDir.x * neutralProj,
            y: job.from.y + laneDir.y * neutralProj
          };
      const offsideLimit = Math.min(laneLen, neutralProj);
      const minion = {
        side: job.side,
        x: job.from.x,
        y: job.from.y,
        to: { x: job.to.x, y: job.to.y },
        spawn: { x: job.from.x, y: job.from.y },
        neutralPoint,
        neutralProj,
        laneDir,
        laneFacing,
        laneNormal,
        fanOffset,
        laneLength: laneLen,
        offsideLimit,
        hp: job.hp,
        maxHp: job.hp,
        dmg: job.dmg,
        cd: 0,
        slowPct: 0,
        slowTimer: 0,
        stunTimer: 0,
        beingPulledBy: null,
        portalizing: 0,
        inPortalZone: false,
        scored: false,
        facing: laneFacing,
        nav: null,
        lanePath,
        laneIndex: Number.isFinite(job.laneIndex) ? job.laneIndex : 0,
        laneLabel: job.laneLabel || String((job.laneIndex || 0) + 1),
        pathDistance: 0,
        laneProjection: null,
        laneProgress: 0,
        offLaneDistance: 0
      };
      minions.push(minion);
      updateMinionLaneFrame(minion);
      return;
    }

    const laneDx = job.to.x - job.from.x;
    const laneDy = job.to.y - job.from.y;
    const laneLen = Math.hypot(laneDx, laneDy) || 1;
    const laneDir = { x: laneDx / laneLen, y: laneDy / laneLen };
    const neutralDistance = laneLen * 0.5;
    const neutralPoint = {
      x: job.from.x + laneDir.x * neutralDistance,
      y: job.from.y + laneDir.y * neutralDistance
    };
    const laneFacing = Math.atan2(laneDir.y, laneDir.x);
    const laneNormal = { x: -laneDir.y, y: laneDir.x };
    const offsideLimit = Math.min(laneLen, neutralDistance);
    minions.push({
      side: job.side,
      x: job.from.x,
      y: job.from.y,
      to: {x: job.to.x, y: job.to.y},
      spawn: {x: job.from.x, y: job.from.y},
      neutralPoint,
      neutralProj: neutralDistance,
      laneDir,
      laneFacing,
      laneNormal,
      fanOffset,
      laneLength: laneLen,
      offsideLimit,
      hp: job.hp,
      maxHp: job.hp,
      dmg: job.dmg,
      cd: 0,
      slowPct: 0,
      slowTimer: 0,
      stunTimer: 0,
      beingPulledBy: null,
      portalizing: 0,
      inPortalZone: false,
      scored: false,
      facing: laneFacing,
      nav: null,
      lanePath: null,
      laneIndex: Number.isFinite(job.laneIndex) ? job.laneIndex : 0,
      laneLabel: job.laneLabel || String((job.laneIndex || 0) + 1),
      pathDistance: 0,
      laneProjection: null,
      laneProgress: 0,
      offLaneDistance: 0
    });
  }

  function distributeMinions(total, lanes){
    const safeLanes = Math.max(1, Math.floor(Number(lanes) || 0));
    const counts = new Array(safeLanes).fill(0);
    const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
    if(safeTotal === 0){
      return counts;
    }
    const base = Math.floor(safeTotal / safeLanes);
    const remainder = safeTotal % safeLanes;
    for(let i=0; i<safeLanes; i++){
      counts[i] = base + (i < remainder ? 1 : 0);
    }
    return counts;
  }

  function spawnWave(side, waveTime, lanePaths){
    const paths = Array.isArray(lanePaths) ? lanePaths.filter(Boolean) : [];
    const {hp, dmg} = statsForWave(waveState.waveNumber);
    if(paths.length){
      const counts = distributeMinions(waveState.waveCount, paths.length);
      const lanes = paths.map((path, laneIndex) => ({
        path,
        laneIndex,
        count: counts[laneIndex] || 0,
        emitted: 0
      }));
      const total = lanes.reduce((sum, lane) => sum + lane.count, 0);
      let spawnNumber = 0;
      let remaining = total;
      while(remaining > 0){
        let progressed = false;
        for(const lane of lanes){
          if(lane.emitted >= lane.count){
            continue;
          }
          const spawnAt = waveTime + spawnNumber * waveState.spawnSpacingMs;
          enqueueMinionSpawn(side, lane.path, hp, dmg, spawnAt, lane.emitted, lane.laneIndex);
          lane.emitted += 1;
          spawnNumber += 1;
          remaining -= 1;
          progressed = true;
          if(remaining <= 0){
            break;
          }
        }
        if(!progressed){
          break;
        }
      }
      return;
    }
    const fallback = getPath(side);
    if(!fallback){
      return;
    }
    for(let i=0;i<waveState.waveCount;i++){
      const spawnAt = waveTime + i * waveState.spawnSpacingMs;
      enqueueMinionSpawn(side, fallback, hp, dmg, spawnAt, i, 0);
    }
  }

  // Separation to prevent overlap (relaxed near portal)
  function resolveOverlaps(iterations=2){
    const n = minions.length;
    if(n<=1) return;
    for(let it=0; it<iterations; it++){
      for(let i=0;i<n;i++){
        const a = minions[i];
        for(let j=i+1;j<n;j++){
          const b = minions[j];

          // Relax same-side separation if either is in intake zone (lets them stack toward portal)
          if(a.side===b.side && (a.inPortalZone || b.inPortalZone)) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let d = Math.hypot(dx,dy);
          const minD = minionDiameter;

          if(d < minD){
            let nx, ny;
            if(d === 0){
              const angle = Math.random()*Math.PI*2;
              nx = Math.cos(angle); ny = Math.sin(angle);
              d = 0.0001;
            } else {
              nx = dx / d; ny = dy / d;
            }
            const push = (minD - d) * 0.5;
            const nextAx = a.x - nx * push;
            const nextAy = a.y - ny * push;
            if(!circleCollides(nextAx, nextAy, minionRadius)){
              a.x = nextAx;
              a.y = nextAy;
            }
            const nextBx = b.x + nx * push;
            const nextBy = b.y + ny * push;
            if(!circleCollides(nextBx, nextBy, minionRadius)){
              b.x = nextBx;
              b.y = nextBy;
            }

            a.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, a.x));
            a.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, a.y));
            b.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, b.x));
            b.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, b.y));
          }
        }
      }
    }
  }

  function resolvePlayerMinionSeparation(iterations = 2){
    if(!minions.length || player.r <= 0) return;
    const minDistBase = minionRadius + player.r;
    if(minDistBase <= 0) return;
    for(let it=0; it<iterations; it++){
      let adjusted = false;
      for(const m of minions){
        if(!m || m.hp <= 0) continue;
        const dx = m.x - player.x;
        const dy = m.y - player.y;
        let d = Math.hypot(dx, dy);
        const minDist = minionRadius + player.r;
        if(d < minDist){
          let nx, ny;
          if(d === 0){
            const angle = Math.random() * Math.PI * 2;
            nx = Math.cos(angle);
            ny = Math.sin(angle);
            d = 0.0001;
          } else {
            nx = dx / d;
            ny = dy / d;
          }
          let overlap = minDist - d;
          if(overlap <= 0) continue;
          let playerShare = overlap * 0.5;
          if(playerShare < 0) playerShare = 0;
          const px0 = player.x;
          const py0 = player.y;
          let playerMove = 0;
          if(playerShare > 0){
            const playerResult = moveCircleWithCollision(px0, py0, -nx * playerShare, -ny * playerShare, player.r);
            player.x = playerResult.x;
            player.y = playerResult.y;
            const movedX = player.x - px0;
            const movedY = player.y - py0;
            playerMove = -(movedX * nx + movedY * ny);
            if(playerMove < 0) playerMove = 0;
          }
          let remaining = overlap - playerMove;
          if(remaining > 0){
            const mx0 = m.x;
            const my0 = m.y;
            const minionResult = moveCircleWithCollision(mx0, my0, nx * remaining, ny * remaining, minionRadius);
            m.x = minionResult.x;
            m.y = minionResult.y;
            const movedX = m.x - mx0;
            const movedY = m.y - my0;
            const minionMove = movedX * nx + movedY * ny;
            remaining -= minionMove;
            if(remaining > 0){
              const px1 = player.x;
              const py1 = player.y;
              const retry = moveCircleWithCollision(px1, py1, -nx * remaining, -ny * remaining, player.r);
              player.x = retry.x;
              player.y = retry.y;
            }
          }
          player.x = Math.max(player.r, Math.min(mapState.width - player.r, player.x));
          player.y = Math.max(player.r, Math.min(mapState.height - player.r, player.y));
          m.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, m.x));
          m.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, m.y));
          adjusted = true;
        }
      }
      if(!adjusted) break;
    }
  }

  function isEnemyMinionForPlayer(minion){
    return !!(minion && minion.hp > 0 && minion.portalizing <= 0 && minion.side !== player.team);
  }

  function monsterAttackRadius(monster = monsterState){
    if(!monster){
      return 0;
    }
    const size = Math.max(0, Number(monster.size) || 0);
    return size > 0 ? size / 2 : 0;
  }

  function isMonsterAttackable(target){
    if(!target || target !== monsterState){
      return false;
    }
    if(target.active === false){
      return false;
    }
    return Number(target.hp) > 0;
  }

  function isAutoAttackTarget(target){
    return isEnemyMinionForPlayer(target) || isMonsterAttackable(target);
  }

  function playerTargetInRange(target, rangeSq){
    if(!isAutoAttackTarget(target)) return false;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    return dx*dx + dy*dy <= rangeSq;
  }

  function findEnemyMinionAt(x, y){
    let best = null;
    let bestDistSq = Infinity;
    const hitRadius = Math.max(minionRadius, 16);
    const hitRadiusSq = hitRadius * hitRadius;
    for(const m of minions){
      if(!isEnemyMinionForPlayer(m)) continue;
      const dx = m.x - x;
      const dy = m.y - y;
      const distSq = dx*dx + dy*dy;
      if(distSq <= hitRadiusSq && distSq < bestDistSq){
        bestDistSq = distSq;
        best = m;
      }
    }
    return best;
  }

  function findAutoAttackTargetAt(x, y){
    const enemy = findEnemyMinionAt(x, y);
    if(enemy){
      return enemy;
    }
    if(isMonsterAttackable(monsterState)){
      const radius = Math.max(12, monsterAttackRadius());
      const dx = monsterState.x - x;
      const dy = monsterState.y - y;
      if(dx * dx + dy * dy <= radius * radius){
        return monsterState;
      }
    }
    return null;
  }

  function findNearestEnemyMinion(x, y){
    let best = null;
    let bestDistSq = Infinity;
    for(const m of minions){
      if(!isEnemyMinionForPlayer(m)) continue;
      const dx = m.x - x;
      const dy = m.y - y;
      const distSq = dx * dx + dy * dy;
      if(distSq < bestDistSq){
        best = m;
        bestDistSq = distSq;
      }
    }
    return best;
  }

  function findNearestEnemyMinionWithinRange(x, y, maxRange){
    const maxRangeValue = Number(maxRange);
    if(!(maxRangeValue > 0)) return null;
    const maxRangeSq = maxRangeValue * maxRangeValue;
    let best = null;
    let bestDistSq = Infinity;
    for(const m of minions){
      if(!isEnemyMinionForPlayer(m)) continue;
      const dx = m.x - x;
      const dy = m.y - y;
      const distSq = dx * dx + dy * dy;
      if(distSq <= maxRangeSq && distSq < bestDistSq){
        best = m;
        bestDistSq = distSq;
      }
    }
    return best;
  }

  function commandPlayerAttack(target){
    if(isPlayerRecalling()){
      cancelRecall('attack');
    }
    if(!isAutoAttackTarget(target)) return false;
    player.selectedTarget = target;
    player.attackTarget = null;
    player.attackWindup = 0;
    const range = Math.max(0, player.attackRange);
    const rangeSq = range * range;
    const inRange = range > 0 && playerTargetInRange(target, rangeSq);
    if(inRange){
      player.chaseTarget = null;
      player.target.x = player.x;
      player.target.y = player.y;
      player.navGoal = null;
      player.nav = null;
    } else {
      player.chaseTarget = target;
      player.target.x = target.x;
      player.target.y = target.y;
      player.navGoal = {x: target.x, y: target.y};
      if(hitboxActive()){
        ensureNavForEntity(player, player.navGoal, player.r);
      } else {
        player.nav = null;
      }
    }
    return true;
  }

  function spawnPlayerProjectile(fromX, fromY, target){
    const startX = Number.isFinite(fromX) ? fromX : player.x;
    const startY = Number.isFinite(fromY) ? fromY : player.y;
    if(!target){
      projectiles.push({
        startX,
        startY,
        targetRef: null,
        targetX: startX,
        targetY: startY,
        progress: 0,
        duration: 0.15
      });
      return;
    }
    const destX = target.x;
    const destY = target.y;
    const dx = destX - startX;
    const dy = destY - startY;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = Math.max(120, PLAYER_PROJECTILE_SPEED);
    const duration = Math.max(0.1, distance / speed);
    projectiles.push({
      startX,
      startY,
      targetRef: target,
      targetX: destX,
      targetY: destY,
      progress: 0,
      duration
    });
  }

  function spawnHitSplat(x, y, amount){
    const dmg = Number(amount);
    const size = Math.max(0, Number(player.hitSplatSize) || 0);
    if(!Number.isFinite(dmg) || dmg <= 0 || size <= 0) return;
    hitsplats.push({
      x,
      y,
      amount: Math.round(dmg),
      size,
      age: 0,
      lifetime: 0.9,
      rise: Math.max(16, size * 0.9)
    });
  }

  function separateMinionsAfterAttack(attacker, target, distance){
    if(!attacker || !target || target.portalizing > 0 || target.hp <= 0){
      return;
    }
    const currentDistance = Number.isFinite(distance) ? distance : Math.hypot(target.x - attacker.x, target.y - attacker.y);
    const desiredGap = Math.max(minionDiameter * 0.85, MINION_RANGE);
    const overlap = desiredGap - currentDistance;
    if(!(overlap > 0)){
      return;
    }
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const len = Math.hypot(dx, dy) || 1;
    const push = Math.min(overlap * 0.5, minionRadius * 0.75);
    if(!(push > 0)){
      return;
    }
    const ax = -dx / len * push;
    const ay = -dy / len * push;
    const bx = dx / len * push;
    const by = dy / len * push;
    const movedA = moveCircleWithCollision(attacker.x, attacker.y, ax, ay, minionRadius);
    const movedB = moveCircleWithCollision(target.x, target.y, bx, by, minionRadius);
    attacker.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, movedA.x));
    attacker.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, movedA.y));
    target.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, movedB.x));
    target.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, movedB.y));
  }

  function separateMinionFromPlayer(minion, distanceToPlayer, playerRadius){
    if(!minion){
      return;
    }
    const dist = Number.isFinite(distanceToPlayer) ? distanceToPlayer : Math.hypot(player.x - minion.x, player.y - minion.y);
    const desired = Math.max(playerRadius + minionRadius * 0.8, MINION_RANGE);
    const overlap = desired - dist;
    if(!(overlap > 0)){
      return;
    }
    const dx = player.x - minion.x;
    const dy = player.y - minion.y;
    const len = Math.hypot(dx, dy) || 1;
    const push = Math.min(overlap, minionRadius * 0.75);
    if(!(push > 0)){
      return;
    }
    const moved = moveCircleWithCollision(minion.x, minion.y, -dx / len * push, -dy / len * push, minionRadius);
    minion.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, moved.x));
    minion.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, moved.y));
  }

  function damagePlayer(amount){
    const dmg = Number(amount);
    if(!Number.isFinite(dmg) || dmg <= 0){
      return;
    }
    if(player.baseInvulnTimer > 0){
      return;
    }
    const prevHp = Math.max(0, Number(player.hp) || 0);
    if(prevHp <= 0){
      return;
    }
    const nextHp = Math.max(0, prevHp - dmg);
    if(nextHp === prevHp){
      return;
    }
    player.hp = nextHp;
    const offset = Math.max(player.r + 8, 24);
    spawnHitSplat(player.x, player.y - offset, dmg);
    updateHudHealth();
    enterPlayerCombat('damage');
    if(player.attackTarget && typeof player.attackTarget.hp === 'number' && player.attackTarget.hp <= 0){
      cancelPlayerAttack(false);
    }
    if(player.hp <= 0){
      player.tauntTimer = 0;
      setPlayerAnimationState('death');
    }
  }

  function applyPlayerAttackDamage(target){
    if(!target) return;
    enterPlayerCombat('attack');
    const damage = Math.max(0, Number(player.attackDamage) || 0);
    const monsterTarget = target === monsterState;
    const preHP = Math.max(0, Number(target.hp) || 0);
    const nextHp = damage > 0 ? Math.max(0, preHP - damage) : preHP;
    target.hp = nextHp;
    flash(target.x, target.y);
    spawnPlayerProjectile(player.x, player.y, target);
    if(damage > 0){
      const offset = monsterTarget ? Math.max(24, monsterAttackRadius()) : minionRadius;
      spawnHitSplat(target.x, target.y - offset, damage);
    }
    if(preHP > 0 && nextHp <= 0 && !monsterTarget && !target.isPracticeDummy){
      addGold(goldState.perKill);
    }
    if(monsterTarget){
      updateMonsterHud();
    }
    handlePracticeDummyDamage(target, preHP);
  }

  function updatePlayerAutoAttack(dt){
    const attackPeriod = Math.max(0, Number(player.attackSpeedMs) || 0) / 1000;
    const updateAttackReady = () => {
      const cooldown = Math.max(0, Number(player.attackCooldown) || 0);
      const enabled = player.attackDamage > 0;
      let progress = 0;
      if(enabled){
        if(attackPeriod > 0){
          const pct = attackPeriod > 0 ? 1 - Math.min(1, cooldown / attackPeriod) : 1;
          progress = Math.max(0, Math.min(1, pct));
        } else {
          progress = player.attackWindup > 0 ? 0 : 1;
        }
      }
      const ready = enabled && player.attackWindup <= 0 && cooldown <= 0;
      setPlayerAttackReadyState(progress, ready, enabled);
    };

    if(player.casting){
      updateAttackReady();
      return;
    }
    if(player.attackDamage <= 0){
      cancelPlayerAttack();
      player.attackCooldown = 0;
      updateAttackReady();
      return;
    }

    const range = Math.max(0, player.attackRange);
    const rangeSq = range * range;
    const windupSeconds = Math.max(0, Number(player.attackWindupMs) || 0) / 1000;

    if(player.attackCooldown > 0){
      player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    }
    updateAttackReady();

    const selection = player.selectedTarget;
    if(!selection){
      if(player.attackWindup > 0 || player.attackTarget){
        cancelPlayerAttack();
        updateAttackReady();
      }
      return;
    }

    if(!isAutoAttackTarget(selection)){
      cancelPlayerAttack();
      updateAttackReady();
      return;
    }

    if(range <= 0){
      cancelPlayerAttack();
      updateAttackReady();
      return;
    }

    const selectionInRange = playerTargetInRange(selection, rangeSq);
    if(selectionInRange){
      if(player.chaseTarget){
        player.chaseTarget = null;
        player.target.x = player.x;
        player.target.y = player.y;
        player.navGoal = null;
        player.nav = null;
      }
    } else {
      player.chaseTarget = selection;
      player.target.x = selection.x;
      player.target.y = selection.y;
      player.navGoal = {x: selection.x, y: selection.y};
      if(hitboxActive()){
        ensureNavForEntity(player, player.navGoal, player.r);
      } else {
        player.nav = null;
      }
    }

    if(player.attackWindup > 0){
      if(!player.attackTarget || !isAutoAttackTarget(player.attackTarget)){
        cancelPlayerAttack();
        updateAttackReady();
        return;
      }
      if(!playerTargetInRange(player.attackTarget, rangeSq)){
        cancelPlayerAttack(false);
        updateAttackReady();
        return;
      }
      updatePlayerFacingTowards(player.attackTarget);
      player.attackWindup = Math.max(0, player.attackWindup - dt);
      updateAttackReady();
      if(player.attackWindup <= 0){
        applyPlayerAttackDamage(player.attackTarget);
        player.attackTarget = null;
        player.attackCooldown = attackPeriod;
        updateAttackReady();
      }
      return;
    }

    if(player.attackCooldown > 0){
      updateAttackReady();
      return;
    }

    if(!selectionInRange){
      return;
    }

    if(windupSeconds > 0){
      player.attackTarget = selection;
      player.attackWindup = windupSeconds;
      updateAttackReady();
      updatePlayerFacingTowards(selection);
      setPlayerAnimationState('autoAttack', { facingRadians: GameState.player.facingRadians });
    } else {
      applyPlayerAttackDamage(selection);
      player.attackCooldown = attackPeriod;
      updateAttackReady();
      updatePlayerFacingTowards(selection);
      setPlayerAnimationState('autoAttack', { facingRadians: GameState.player.facingRadians });
    }
  }

  function updateLaserProjectiles(dt){
    for(let i = laserProjectiles.length - 1; i >= 0; i--){
      const laser = laserProjectiles[i];
      const prevTraveled = Number(laser.traveled) || 0;
      const speed = Math.max(0, Number(laser.speed) || 0);
      const maxDistance = Math.max(0, Number(laser.maxDistance) || 0);
      let nextTraveled = prevTraveled + speed * dt;
      if(speed <= 0){
        nextTraveled = maxDistance;
      }
      const clampedNext = maxDistance > 0 ? Math.min(nextTraveled, maxDistance) : nextTraveled;
      const effectiveHalfWidth = Math.max(0, (Number(laser.width) || 0) / 2);
      const effectiveRadius = effectiveHalfWidth + minionRadius;
      const effectiveRadiusSq = effectiveRadius * effectiveRadius;
      let hitTarget = null;
      let hitAlong = Infinity;
      for(const m of minions){
        if(!isEnemyMinionForPlayer(m)) continue;
        const relX = m.x - laser.startX;
        const relY = m.y - laser.startY;
        const along = relX * laser.dirX + relY * laser.dirY;
        if(along < prevTraveled || along > clampedNext) continue;
        const closestX = laser.startX + laser.dirX * along;
        const closestY = laser.startY + laser.dirY * along;
        const offX = m.x - closestX;
        const offY = m.y - closestY;
        const distSq = offX * offX + offY * offY;
        if(distSq <= effectiveRadiusSq && along < hitAlong){
          hitAlong = along;
          hitTarget = m;
        }
      }
      if(hitTarget){
        const hitPointX = laser.startX + laser.dirX * hitAlong;
        const hitPointY = laser.startY + laser.dirY * hitAlong;
        const prevHp = Number(hitTarget.hp) || 0;
        if(Number(laser.damage) > 0){
          hitTarget.hp = Math.max(0, prevHp - laser.damage);
          spawnHitSplat(hitTarget.x, hitTarget.y - minionRadius, laser.damage);
        }
        if(laser.slowFraction > 0){
          const existing = typeof hitTarget.slowPct === 'number' ? hitTarget.slowPct : 0;
          hitTarget.slowPct = Math.max(existing, laser.slowFraction);
          const slowDuration = Number(laser.slowDuration) || 0;
          if(slowDuration > 0){
            hitTarget.slowTimer = Math.max(hitTarget.slowTimer || 0, slowDuration);
          }
        }
        handlePracticeDummyDamage(hitTarget, prevHp);
        flash(hitPointX, hitPointY, { startRadius: 10, endRadius: 34, color: '#b9f0ff' });
        const dmgValue = Number(laser.damage) || 0;
        if(dmgValue > 0){
          setHudMessage(`${laser.abilityName || 'Laser'} hit for ${Math.round(dmgValue)} damage!`);
        } else {
          setHudMessage(`${laser.abilityName || 'Laser'} hit!`);
        }
        laserProjectiles.splice(i, 1);
        continue;
      }
      laser.traveled = clampedNext;
      laser.currentX = laser.startX + laser.dirX * clampedNext;
      laser.currentY = laser.startY + laser.dirY * clampedNext;
      if(maxDistance > 0 && clampedNext >= maxDistance - 0.001){
        laserProjectiles.splice(i, 1);
      }
    }
  }

  function updateBlinkingBoltProjectiles(dt){
    for(let i = blinkingBoltProjectiles.length - 1; i >= 0; i--){
      const bolt = blinkingBoltProjectiles[i];
      const maxLifetime = Number(bolt.maxLifetime) || 0;
      bolt.age = Math.max(0, (bolt.age || 0) + dt);
      if(maxLifetime > 0 && bolt.age >= maxLifetime){
        blinkingBoltProjectiles.splice(i, 1);
        continue;
      }

      const speed = Math.max(0, Number(bolt.speed) || 0);
      let target = bolt.targetRef;
      if(target && target.hp <= 0){
        target = null;
        bolt.targetRef = null;
      }
      if(!target){
        const reacquired = findNearestEnemyMinion(bolt.x, bolt.y);
        if(reacquired){
          bolt.targetRef = reacquired;
          target = reacquired;
        }
      }

      const hitRadius = minionRadius + 6;
      bolt.prevX = bolt.x;
      bolt.prevY = bolt.y;

      if(target){
        const dx = target.x - bolt.x;
        const dy = target.y - bolt.y;
        const dist = Math.hypot(dx, dy);
        if(dist > 0.0001){
          bolt.dirX = dx / dist;
          bolt.dirY = dy / dist;
        }
        const travel = Math.min(dist, speed * dt);
        bolt.x += bolt.dirX * travel;
        bolt.y += bolt.dirY * travel;
        const remaining = Math.hypot(target.x - bolt.x, target.y - bolt.y);
        if(dist <= hitRadius || remaining <= hitRadius){
          const prevHp = Number(target.hp) || 0;
          if(Number(bolt.damage) > 0){
            target.hp = Math.max(0, prevHp - bolt.damage);
            spawnHitSplat(target.x, target.y - minionRadius, bolt.damage);
          }
          handlePracticeDummyDamage(target, prevHp);
          flash(target.x, target.y, { startRadius: 10, endRadius: 36, color: '#7fe3ff' });
          const dmgValue = Number(bolt.damage) || 0;
          if(dmgValue > 0){
            setHudMessage(`${bolt.abilityName || 'Blink Bolt'} hit for ${Math.round(dmgValue)} damage!`);
          } else {
            setHudMessage(`${bolt.abilityName || 'Blink Bolt'} hit!`);
          }
          blinkingBoltProjectiles.splice(i, 1);
          continue;
        }
      } else {
        bolt.x += bolt.dirX * speed * dt;
        bolt.y += bolt.dirY * speed * dt;
      }

      if(bolt.x < -64 || bolt.y < -64 || bolt.x > mapState.width + 64 || bolt.y > mapState.height + 64){
        blinkingBoltProjectiles.splice(i, 1);
      }
    }
  }

  function updatePiercingArrowProjectiles(dt){
    for(let i = piercingArrowProjectiles.length - 1; i >= 0; i--){
      const proj = piercingArrowProjectiles[i];
      if(!proj){
        piercingArrowProjectiles.splice(i, 1);
        continue;
      }
      const range = Math.max(0, Number(proj.range) || 0);
      const speed = Math.max(0, Number(proj.speed) || 0);
      if(!(range > 0) || !(speed > 0)){
        piercingArrowProjectiles.splice(i, 1);
        continue;
      }
      const prevTraveled = Math.max(0, Number(proj.traveled) || 0);
      const nextTraveled = Math.min(range, prevTraveled + speed * dt);
      const halfWidth = Math.max(0, (Number(proj.width) || 0) / 2);
      const effectiveRadius = halfWidth + minionRadius;
      const effectiveSq = effectiveRadius * effectiveRadius;
      const hits = [];
      for(const m of minions){
        if(!m || !isEnemyMinionForPlayer(m)) continue;
        if(m.hp <= 0 || m.portalizing > 0) continue;
        if(proj.hitTargets && proj.hitTargets.has(m)) continue;
        const relX = m.x - proj.startX;
        const relY = m.y - proj.startY;
        const along = relX * proj.dirX + relY * proj.dirY;
        if(along < prevTraveled - minionRadius) continue;
        if(along > nextTraveled + minionRadius) continue;
        if(along < -minionRadius || along > range + minionRadius) continue;
        const closestX = proj.startX + proj.dirX * along;
        const closestY = proj.startY + proj.dirY * along;
        const offX = m.x - closestX;
        const offY = m.y - closestY;
        if(offX * offX + offY * offY <= effectiveSq){
          hits.push({ target: m, along });
        }
      }
      if(hits.length){
        hits.sort((a, b) => a.along - b.along);
        for(const hit of hits){
          if(proj.hitTargets && proj.hitTargets.has(hit.target)) continue;
          applyPiercingArrowHit(proj, hit.target);
          if(proj.hitTargets) proj.hitTargets.add(hit.target);
        }
      }
      proj.traveled = nextTraveled;
      proj.currentX = proj.startX + proj.dirX * nextTraveled;
      proj.currentY = proj.startY + proj.dirY * nextTraveled;
      if(nextTraveled >= range - 0.0001){
        if(proj.casterRef === player && !proj.announcedHit){
          setHudMessage(`${proj.abilityName || 'Piercing Arrow'} dissipated.`);
        }
        piercingArrowProjectiles.splice(i, 1);
        continue;
      }
      if(proj.currentX < -64 || proj.currentY < -64 || proj.currentX > mapState.width + 64 || proj.currentY > mapState.height + 64){
        piercingArrowProjectiles.splice(i, 1);
      }
    }
  }

  function updateChargingGaleProjectiles(dt){
    for(let i = chargingGaleProjectiles.length - 1; i >= 0; i--){
      const proj = chargingGaleProjectiles[i];
      if(!proj){
        chargingGaleProjectiles.splice(i, 1);
        continue;
      }
      const range = Math.max(0, Number(proj.range) || 0);
      const speed = Math.max(0, Number(proj.speed) || 0);
      if(!(range > 0)){
        chargingGaleProjectiles.splice(i, 1);
        continue;
      }
      const prevTraveled = Math.max(0, Number(proj.traveled) || 0);
      let nextTraveled = prevTraveled + speed * dt;
      if(speed <= 0){
        nextTraveled = range;
      }
      const clampedNext = Math.min(nextTraveled, range);
      const halfWidth = Math.max(0, (Number(proj.width) || 0) / 2);
      const effectiveRadius = halfWidth + minionRadius;
      const effectiveSq = effectiveRadius * effectiveRadius;
      let removed = false;

      if(proj.pierce){
        const hits = [];
        for(const m of minions){
          if(!m || !isEnemyMinionForPlayer(m)) continue;
          if(m.hp <= 0 || m.portalizing > 0) continue;
          if(proj.hitTargets && proj.hitTargets.has(m)) continue;
          const relX = m.x - proj.startX;
          const relY = m.y - proj.startY;
          const along = relX * proj.dirX + relY * proj.dirY;
          if(along < prevTraveled - minionRadius) continue;
          if(along > clampedNext + minionRadius) continue;
          if(along < -minionRadius || along > range + minionRadius) continue;
          const closestX = proj.startX + proj.dirX * along;
          const closestY = proj.startY + proj.dirY * along;
          const offX = m.x - closestX;
          const offY = m.y - closestY;
          if(offX * offX + offY * offY <= effectiveSq){
            hits.push({ target: m, along });
          }
        }
        if(hits.length){
          hits.sort((a, b) => a.along - b.along);
          for(const hit of hits){
            if(proj.hitTargets && proj.hitTargets.has(hit.target)) continue;
            applyChargingGaleHit(proj, hit.target, hit.along);
            if(proj.hitTargets) proj.hitTargets.add(hit.target);
          }
        }
      } else {
        let hitTarget = null;
        let hitAlong = Infinity;
        for(const m of minions){
          if(!m || !isEnemyMinionForPlayer(m)) continue;
          if(m.hp <= 0 || m.portalizing > 0) continue;
          const relX = m.x - proj.startX;
          const relY = m.y - proj.startY;
          const along = relX * proj.dirX + relY * proj.dirY;
          if(along < prevTraveled - minionRadius) continue;
          if(along > clampedNext + minionRadius) continue;
          if(along < -minionRadius || along > range + minionRadius) continue;
          const closestX = proj.startX + proj.dirX * along;
          const closestY = proj.startY + proj.dirY * along;
          const offX = m.x - closestX;
          const offY = m.y - closestY;
          if(offX * offX + offY * offY <= effectiveSq && along < hitAlong){
            hitAlong = along;
            hitTarget = m;
          }
        }
        if(hitTarget){
          applyChargingGaleHit(proj, hitTarget, hitAlong);
          chargingGaleProjectiles.splice(i, 1);
          removed = true;
        }
      }

      if(removed) continue;

      proj.traveled = clampedNext;
      proj.currentX = proj.startX + proj.dirX * clampedNext;
      proj.currentY = proj.startY + proj.dirY * clampedNext;

      if(clampedNext >= range - 0.001){
        if(!proj.announcedHit){
          setHudMessage(`${proj.abilityName || 'Charging Gale'} dissipated.`);
        }
        chargingGaleProjectiles.splice(i, 1);
      }
    }
  }

  function updateCullingBarrageChannels(dt){
    for(let i = cullingBarrageChannels.length - 1; i >= 0; i--){
      const channel = cullingBarrageChannels[i];
      if(!channel || channel.ended){
        cullingBarrageChannels.splice(i, 1);
        continue;
      }
      const caster = channel.casterRef || player;
      const { x: originX, y: originY } = getSpellOrigin(caster);
      channel.elapsed = Math.max(0, Number(channel.elapsed) || 0) + dt;

      const interval = Math.max(0, Number(channel.shotInterval) || 0);
      const totalShots = Math.max(1, Number(channel.totalShots) || 1);
      while(channel.shotsFired < totalShots && channel.elapsed + 1e-6 >= channel.nextShotTime){
        fireCullingBarrageShot(channel, originX, originY);
        channel.shotsFired++;
        channel.nextShotTime += interval;
        if(interval <= 0){
          channel.nextShotTime = channel.elapsed + 0.0001;
        }
      }

      const controlTimers = [caster && caster.stunTimer, caster && caster.knockupTimer, caster && caster.silenceTimer, caster && caster.disarmTimer, caster && caster.polymorphTimer];
      const interrupted = controlTimers.some(value => Number(value) > 0);
      if(interrupted){
        endCullingBarrageChannel(channel, { reason: 'control' });
        continue;
      }

      const duration = Math.max(0, Number(channel.duration) || 0);
      if((duration > 0 && channel.elapsed >= duration) || channel.shotsFired >= totalShots){
        endCullingBarrageChannel(channel, { reason: 'complete' });
      }
    }
  }

  function updateCullingBarrageProjectiles(dt){
    for(let i = cullingBarrageProjectiles.length - 1; i >= 0; i--){
      const proj = cullingBarrageProjectiles[i];
      if(!proj){
        cullingBarrageProjectiles.splice(i, 1);
        continue;
      }
      const range = Math.max(0, Number(proj.range) || 0);
      const speed = Math.max(0, Number(proj.speed) || 0);
      if(range <= 0 && speed <= 0){
        cullingBarrageProjectiles.splice(i, 1);
        continue;
      }
      const prevTraveled = Math.max(0, Number(proj.traveled) || 0);
      const nextTraveled = speed > 0 ? prevTraveled + speed * dt : range;
      const clampedTravel = range > 0 ? Math.min(nextTraveled, range) : nextTraveled;
      const halfWidth = Math.max(0, (Number(proj.width) || 0) / 2);
      const effectiveRadius = halfWidth + minionRadius;
      const effectiveSq = effectiveRadius * effectiveRadius;
      let removed = false;

      if(proj.canPierce){
        const hits = [];
        for(const m of minions){
          if(!m || !isEnemyMinionForPlayer(m)) continue;
          if(m.hp <= 0 || m.portalizing > 0) continue;
          if(proj.hitTargets && proj.hitTargets.has(m)) continue;
          const relX = m.x - proj.startX;
          const relY = m.y - proj.startY;
          const along = relX * proj.dirX + relY * proj.dirY;
          if(along < prevTraveled - minionRadius) continue;
          if(along > clampedTravel + minionRadius) continue;
          if(range > 0 && (along < -minionRadius || along > range + minionRadius)) continue;
          const closestX = proj.startX + proj.dirX * along;
          const closestY = proj.startY + proj.dirY * along;
          const offX = m.x - closestX;
          const offY = m.y - closestY;
          if(offX * offX + offY * offY <= effectiveSq){
            hits.push({ target: m, along });
          }
        }
        if(hits.length){
          hits.sort((a, b) => a.along - b.along);
          if(!proj.hitTargets) proj.hitTargets = new Set();
          for(const hit of hits){
            if(proj.hitTargets.has(hit.target)) continue;
            applyCullingBarrageHit(proj, hit.target);
            proj.hitTargets.add(hit.target);
          }
        }
      } else {
        let hitTarget = null;
        let hitAlong = Infinity;
        for(const m of minions){
          if(!m || !isEnemyMinionForPlayer(m)) continue;
          if(m.hp <= 0 || m.portalizing > 0) continue;
          const relX = m.x - proj.startX;
          const relY = m.y - proj.startY;
          const along = relX * proj.dirX + relY * proj.dirY;
          if(along < prevTraveled - minionRadius) continue;
          if(along > clampedTravel + minionRadius) continue;
          if(range > 0 && (along < -minionRadius || along > range + minionRadius)) continue;
          const closestX = proj.startX + proj.dirX * along;
          const closestY = proj.startY + proj.dirY * along;
          const offX = m.x - closestX;
          const offY = m.y - closestY;
          if(offX * offX + offY * offY <= effectiveSq && along < hitAlong){
            hitAlong = along;
            hitTarget = m;
          }
        }
        if(hitTarget){
          applyCullingBarrageHit(proj, hitTarget);
          cullingBarrageProjectiles.splice(i, 1);
          removed = true;
        }
      }

      if(removed) continue;

      proj.traveled = clampedTravel;
      proj.x = proj.startX + proj.dirX * clampedTravel;
      proj.y = proj.startY + proj.dirY * clampedTravel;
      proj.age = (Number(proj.age) || 0) + dt;

      if(range > 0 && clampedTravel >= range - 0.001){
        cullingBarrageProjectiles.splice(i, 1);
        continue;
      }

      if(range <= 0 && proj.age >= 0.6){
        cullingBarrageProjectiles.splice(i, 1);
      }
    }
  }

  function updateProjectiles(dt){
    for(let i = projectiles.length - 1; i >= 0; i--){
      const p = projectiles[i];
      if(p.targetRef){
        const target = p.targetRef;
        const targetAlive = target === player
          || target.isPracticeDummy
          || (typeof target.hp === 'number' && target.hp > 0);
        if(targetAlive){
          p.targetX = target.x;
          p.targetY = target.y;
        }
      }
      const duration = Math.max(0.001, p.duration);
      p.progress += dt / duration;
      if(p.progress >= 1){
        const impact = typeof p.onImpact === 'function' ? p.onImpact : null;
        projectiles.splice(i, 1);
        if(impact){
          try {
            impact();
          } catch (err){
            console.error('Monster projectile impact failed', err);
          }
        }
      }
    }
  }

  function updateHitSplats(dt){
    for(let i = hitsplats.length - 1; i >= 0; i--){
      const h = hitsplats[i];
      h.age += dt;
      if(h.age >= (h.lifetime || 0.001)){
        hitsplats.splice(i, 1);
      }
    }
  }

  function stagePointerPosition(e){
    if(!stage){
      return { x: 0, y: 0 };
    }
    const rect = stage.getBoundingClientRect();
    const width = rect && Number.isFinite(rect.width) ? rect.width : 0;
    const height = rect && Number.isFinite(rect.height) ? rect.height : 0;
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    if(width > 0){
      x = Math.max(0, Math.min(width, x));
    }
    if(height > 0){
      y = Math.max(0, Math.min(height, y));
    }
    const scaleX = width > 0 ? camera.width / width : 1;
    const scaleY = height > 0 ? camera.height / height : 1;
    const worldX = camera.x + x * scaleX;
    const worldY = camera.y + y * scaleY;
    const clampedX = Math.max(0, Math.min(mapState.width, worldX));
    const clampedY = Math.max(0, Math.min(mapState.height, worldY));
    return { x: clampedX, y: clampedY };
  }

  function renderMinimap(force = false){
    if(!minimapCtx || !minimapCanvas){
      return;
    }
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if(!force && now - minimapState.lastRender < 120){
      return;
    }
    const width = minimapCanvas.width;
    const height = minimapCanvas.height;
    if(!(width > 0) || !(height > 0) || !(mapState.width > 0) || !(mapState.height > 0) || !minimapState.layoutVisible || !(minimapState.effectiveScale > 0)){
      minimapCtx.clearRect(0, 0, width, height);
      minimapState.lastRender = now;
      return;
    }
    minimapState.lastRender = now;
    minimapCtx.clearRect(0, 0, width, height);
    minimapCtx.fillStyle = 'rgba(4, 12, 24, 0.85)';
    minimapCtx.fillRect(0, 0, width, height);
    if(mapState.loaded && img && img.naturalWidth && img.naturalHeight){
      minimapCtx.save();
      minimapCtx.globalAlpha = 0.9;
      minimapCtx.drawImage(img, 0, 0, mapState.width, mapState.height, 0, 0, width, height);
      minimapCtx.restore();
    }
    const scaleX = width / mapState.width;
    const scaleY = height / mapState.height;
    const scale = Math.min(scaleX, scaleY);
    const drawPoint = (x, y, color, radius = 2.5) => {
      if(!Number.isFinite(x) || !Number.isFinite(y)) return;
      const px = x * scaleX;
      const py = y * scaleY;
      const r = Math.max(radius, radius * scale);
      minimapCtx.beginPath();
      minimapCtx.arc(px, py, Math.max(1.5, r), 0, Math.PI * 2);
      minimapCtx.fillStyle = color;
      minimapCtx.fill();
    };
    const drawDiamond = (x, y, color) => {
      if(!Number.isFinite(x) || !Number.isFinite(y)) return;
      const px = x * scaleX;
      const py = y * scaleY;
      const size = Math.max(4, 9 * scale);
      minimapCtx.beginPath();
      minimapCtx.moveTo(px, py - size);
      minimapCtx.lineTo(px + size, py);
      minimapCtx.lineTo(px, py + size);
      minimapCtx.lineTo(px - size, py);
      minimapCtx.closePath();
      minimapCtx.fillStyle = color;
      minimapCtx.fill();
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeStyle = '#041019';
      minimapCtx.stroke();
    };

    if(customColliders.length){
      minimapCtx.save();
      minimapCtx.globalAlpha = GameState.map.colliders.hidden ? 0 : 0.6;
      for(const collider of customColliders){
        if(!collider) continue;
        const highlight = collider.id === GameState.map.colliders.selectedId;
        const fill = highlight ? '#ff7b7b55' : '#f4a34144';
        const stroke = highlight ? '#ff7b7bcc' : '#f4a341bb';
        const px = collider.x * scaleX;
        const py = collider.y * scaleY;
        if(collider.type === 'capsule'){
          const metrics = ensureCapsuleMetrics(collider);
          const radius = Math.max(1.5, metrics.radius * scale);
          const halfSpan = Math.max(0, metrics.span * scale / 2);
          minimapCtx.save();
          minimapCtx.translate(px, py);
          minimapCtx.rotate(metrics.angle);
          minimapCtx.beginPath();
          if(halfSpan <= 0.5){
            minimapCtx.arc(0, 0, radius, 0, Math.PI * 2);
          } else {
            minimapCtx.moveTo(-halfSpan, -radius);
            minimapCtx.lineTo(halfSpan, -radius);
            minimapCtx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
            minimapCtx.lineTo(-halfSpan, radius);
            minimapCtx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
          }
          minimapCtx.closePath();
          minimapCtx.fillStyle = fill;
          minimapCtx.strokeStyle = stroke;
          minimapCtx.lineWidth = highlight ? 2 : 1.4;
          minimapCtx.fill();
          minimapCtx.stroke();
          minimapCtx.restore();
        } else if(collider.type === 'crescent'){
          const metrics = ensureCrescentMetrics(collider);
          const outerRadius = Math.max(2, metrics.radius * scale);
          const innerRadius = Math.max(0, metrics.innerRadius * scale);
          const innerX = metrics.innerCx * scaleX;
          const innerY = metrics.innerCy * scaleY;
          minimapCtx.beginPath();
          minimapCtx.arc(px, py, outerRadius, 0, Math.PI * 2);
          if(innerRadius > 0.5){
            minimapCtx.moveTo(innerX + innerRadius, innerY);
            minimapCtx.arc(innerX, innerY, innerRadius, 0, Math.PI * 2, true);
          }
          minimapCtx.fillStyle = fill;
          minimapCtx.strokeStyle = stroke;
          minimapCtx.lineWidth = highlight ? 2 : 1.4;
          minimapCtx.fill('evenodd');
          minimapCtx.stroke();
        } else {
          const radius = Math.max(2, (Number(collider.radius) || 0) * scale);
          minimapCtx.beginPath();
          minimapCtx.arc(px, py, radius, 0, Math.PI * 2);
          minimapCtx.fillStyle = fill;
          minimapCtx.strokeStyle = stroke;
          minimapCtx.lineWidth = highlight ? 2 : 1.4;
          minimapCtx.fill();
          minimapCtx.stroke();
        }
      }
      minimapCtx.restore();
    }

    const visionDummyActive = visionDummy && visionDummy.active !== false;
    const practiceDummySize = visionDummyActive ? clampPracticeDummySize(visionDummy.size, practiceDummyDefaults.size) : 0;
    if(customVisionSources.length || (GameState.player.vision.radius > 0) || (visionDummyActive && practiceDummySize > 0)){
      minimapCtx.save();
      minimapCtx.globalAlpha = GameState.player.vision.hidden ? 0 : 0.55;
      for(const source of customVisionSources){
        if(!source) continue;
        ensureVisionConsistency(source);
        const highlight = source.id === GameState.player.vision.selectedId;
        const isHiding = source.mode === 2;
        const fill = highlight
          ? (isHiding ? '#39ff1444' : '#63d7ff44')
          : (isHiding ? '#39ff142e' : '#2f8cff30');
        const stroke = highlight
          ? (isHiding ? '#39ff14cc' : '#63d7ffcc')
          : (isHiding ? '#39ff1499' : '#2f8cffbb');
        const px = source.x * scaleX;
        const py = source.y * scaleY;
        if(source.type === 'capsule'){
          const metrics = ensureCapsuleMetrics(source);
          const radius = Math.max(1.5, metrics.radius * scale);
          const halfSpan = Math.max(0, metrics.span * scale / 2);
          minimapCtx.save();
          minimapCtx.translate(px, py);
          minimapCtx.rotate(metrics.angle);
          minimapCtx.beginPath();
          if(halfSpan <= 0.5){
            minimapCtx.arc(0, 0, radius, 0, Math.PI * 2);
          } else {
            minimapCtx.moveTo(-halfSpan, -radius);
            minimapCtx.lineTo(halfSpan, -radius);
            minimapCtx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
            minimapCtx.lineTo(-halfSpan, radius);
            minimapCtx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
          }
          minimapCtx.closePath();
          minimapCtx.fillStyle = fill;
          minimapCtx.strokeStyle = stroke;
          minimapCtx.lineWidth = highlight ? 2 : 1.4;
          minimapCtx.fill();
          minimapCtx.stroke();
          minimapCtx.restore();
        } else if(source.type === 'crescent'){
          const metrics = ensureCrescentMetrics(source);
          const outerRadius = Math.max(2, metrics.radius * scale);
          const innerRadius = Math.max(0, metrics.innerRadius * scale);
          const innerX = metrics.innerCx * scaleX;
          const innerY = metrics.innerCy * scaleY;
          minimapCtx.beginPath();
          minimapCtx.arc(px, py, outerRadius, 0, Math.PI * 2);
          if(innerRadius > 0.5){
            minimapCtx.moveTo(innerX + innerRadius, innerY);
            minimapCtx.arc(innerX, innerY, innerRadius, 0, Math.PI * 2, true);
          }
          minimapCtx.fillStyle = fill;
          minimapCtx.strokeStyle = stroke;
          minimapCtx.lineWidth = highlight ? 2 : 1.4;
          minimapCtx.fill('evenodd');
          minimapCtx.stroke();
        } else {
          const radius = Math.max(2, (Number(source.radius) || 0) * scale);
          minimapCtx.beginPath();
          minimapCtx.arc(px, py, radius, 0, Math.PI * 2);
          minimapCtx.fillStyle = fill;
          minimapCtx.strokeStyle = stroke;
          minimapCtx.lineWidth = highlight ? 2 : 1.4;
          minimapCtx.fill();
          minimapCtx.stroke();
        }
      }
      if(GameState.player.vision.radius > 0){
        const radius = Math.max(2, GameState.player.vision.radius * scale);
        minimapCtx.beginPath();
        minimapCtx.arc(player.x * scaleX, player.y * scaleY, radius, 0, Math.PI * 2);
        minimapCtx.lineWidth = 1.6;
        minimapCtx.strokeStyle = '#63d7ffb0';
        minimapCtx.setLineDash([6, 5]);
        minimapCtx.stroke();
        minimapCtx.setLineDash([]);
      }
      if(visionDummy && visionDummy.active !== false){
        const dummySize = clampPracticeDummySize(visionDummy.size, practiceDummyDefaults.size);
        const bodyRadius = Math.max(10, dummySize * 0.5);
        const span = Math.max(bodyRadius * 2, dummySize * 2.2);
        const radiusPx = Math.max(2, bodyRadius * scale);
        const halfSpanPx = Math.max(radiusPx, (span * scale) / 2);
        minimapCtx.save();
        minimapCtx.translate(visionDummy.x * scaleX, visionDummy.y * scaleY);
        minimapCtx.beginPath();
        if(halfSpanPx <= radiusPx + 0.5){
          minimapCtx.arc(0, 0, radiusPx, 0, Math.PI * 2);
        } else {
          minimapCtx.moveTo(-halfSpanPx, -radiusPx);
          minimapCtx.lineTo(halfSpanPx, -radiusPx);
          minimapCtx.arc(halfSpanPx, 0, radiusPx, -Math.PI / 2, Math.PI / 2);
          minimapCtx.lineTo(-halfSpanPx, radiusPx);
          minimapCtx.arc(-halfSpanPx, 0, radiusPx, Math.PI / 2, -Math.PI / 2);
        }
        minimapCtx.closePath();
        minimapCtx.lineWidth = 1.4;
        minimapCtx.strokeStyle = '#ff5577b0';
        minimapCtx.setLineDash([6, 5]);
        minimapCtx.stroke();
        minimapCtx.setLineDash([]);
        minimapCtx.restore();
      }
      minimapCtx.restore();
    }

    if(visionDummyActive){
      drawPoint(visionDummy.x, visionDummy.y, '#ff5577', Math.max(2.5, 6 * scale));
    }

    const lanePlanMinimap = ensureLaneLayout();
    if(lanePlanMinimap && lanePlanMinimap.lanes.length){
      minimapCtx.save();
      minimapCtx.lineWidth = Math.max(2, 5 * scale);
      minimapCtx.strokeStyle = '#32d97c';
      minimapCtx.lineCap = 'round';
      for(const lane of lanePlanMinimap.lanes){
        const start = lane.bluePath.from;
        const end = lane.bluePath.to;
        minimapCtx.beginPath();
        minimapCtx.moveTo(start.x * scaleX, start.y * scaleY);
        minimapCtx.quadraticCurveTo(lane.control.x * scaleX, lane.control.y * scaleY, end.x * scaleX, end.y * scaleY);
        minimapCtx.stroke();

        const midX = lane.middle.x * scaleX;
        const midY = lane.middle.y * scaleY;
        const radius = Math.max(6, 14 * scale);
        minimapCtx.beginPath();
        minimapCtx.arc(midX, midY, radius, 0, Math.PI * 2);
        minimapCtx.fillStyle = '#164d2c';
        minimapCtx.fill();
        minimapCtx.lineWidth = Math.max(1.6, 3 * scale);
        minimapCtx.strokeStyle = '#32d97c';
        minimapCtx.stroke();
        minimapCtx.fillStyle = '#d7ffde';
        minimapCtx.font = `bold ${Math.max(8, Math.round((radius + 2) * 0.9))}px system-ui`;
        minimapCtx.textAlign = 'center';
        minimapCtx.textBaseline = 'middle';
        minimapCtx.fillText(lane.label, midX, midY + Math.max(0.5, scale * 0.8));
      }
      minimapCtx.restore();
    }

    if(blueSpawns[0]){
      drawDiamond(blueSpawns[0].x, blueSpawns[0].y, '#2aa9ff');
    }
    if(redSpawns[0]){
      drawDiamond(redSpawns[0].x, redSpawns[0].y, '#ff5577');
    }

    for(const m of minions){
      if(!m) continue;
      if(m.isPracticeDummy && (m.active === false || (m.respawnTimer > 0) || !(Number(m.hp) > 0))){
        continue;
      }
      if(!pointInVision(m.x, m.y, minionRadius)) continue;
      const color = m.side === 'red' ? '#ff5577' : '#2aa9ff';
      drawPoint(m.x, m.y, color, Math.max(2, minionRadius * scale));
    }

    let playerRef = null;
    try {
      playerRef = player;
    } catch (err) {
      playerRef = null;
    }
    if(playerRef){
      drawPoint(playerRef.x, playerRef.y, '#f7ff7a', Math.max(3, playerRef.r * scale));
    }

    const viewX = camera.x * scaleX;
    const viewY = camera.y * scaleY;
    const viewW = camera.width * scaleX;
    const viewH = camera.height * scaleY;
    const clampedViewX = Math.max(0, Math.min(width, viewX));
    const clampedViewY = Math.max(0, Math.min(height, viewY));
    const clampedViewW = Math.max(0, Math.min(width - clampedViewX, viewW));
    const clampedViewH = Math.max(0, Math.min(height - clampedViewY, viewH));
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    minimapCtx.fillRect(clampedViewX, clampedViewY, clampedViewW, clampedViewH);
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeStyle = '#ffffffcc';
    minimapCtx.strokeRect(clampedViewX, clampedViewY, clampedViewW, clampedViewH);

    minimapCtx.lineWidth = 2;
    minimapCtx.strokeStyle = 'rgba(58, 84, 122, 0.9)';
    minimapCtx.strokeRect(1, 1, width - 2, height - 2);
  }

  function minimapEventToWorld(event){
    if(!minimapCanvas || !minimapState.layoutVisible || !(minimapState.effectiveScale > 0)){
      return null;
    }
    const rect = minimapCanvas.getBoundingClientRect();
    const width = rect && Number.isFinite(rect.width) ? rect.width : 0;
    const height = rect && Number.isFinite(rect.height) ? rect.height : 0;
    if(!(width > 0) || !(height > 0) || !(mapState.width > 0) || !(mapState.height > 0)){
      return null;
    }
    const relX = (event.clientX - rect.left) / width;
    const relY = (event.clientY - rect.top) / height;
    const worldX = Math.max(0, Math.min(mapState.width, relX * mapState.width));
    const worldY = Math.max(0, Math.min(mapState.height, relY * mapState.height));
    return { x: worldX, y: worldY };
  }

  function handleMinimapPointer(event, { flash = false } = {}){
    if(!minimapState.clickToMoveEnabled){
      return;
    }
    const coords = minimapEventToWorld(event);
    if(!coords){
      return;
    }
    issuePlayerMoveOrder(coords.x, coords.y, { flashPulse: flash, updateHud: true });
  }

  if(minimapCanvas){
    const endMinimapPointer = (event) => {
      if(event && minimapState.pointerId !== null && Number.isFinite(event.pointerId) && event.pointerId !== minimapState.pointerId){
        return;
      }
      minimapState.pointerActive = false;
      minimapState.pointerId = null;
    };
    minimapCanvas.addEventListener('pointerdown', (event) => {
      if(event.button !== 0){
        return;
      }
      if(!minimapState.layoutVisible || !(minimapState.effectiveScale > 0)){
        return;
      }
      if(minimapState.clickThroughEnabled){
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if(!minimapState.clickToMoveEnabled){
        return;
      }
      minimapState.pointerActive = true;
      minimapState.pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
      try {
        minimapCanvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      handleMinimapPointer(event, { flash: true });
    });
    minimapCanvas.addEventListener('pointermove', (event) => {
      if(!minimapState.pointerActive){
        return;
      }
      if(minimapState.pointerId !== null && event.pointerId !== minimapState.pointerId){
        return;
      }
      if(!minimapState.layoutVisible || !(minimapState.effectiveScale > 0)){
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if(!minimapState.clickToMoveEnabled){
        return;
      }
      handleMinimapPointer(event);
    });
    minimapCanvas.addEventListener('pointerup', (event) => {
      if(minimapState.pointerId !== null && event.pointerId !== minimapState.pointerId){
        return;
      }
      if(minimapState.pointerActive || minimapState.pointerId !== null){
        event.preventDefault();
        event.stopPropagation();
      }
      try {
        minimapCanvas.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      endMinimapPointer(event);
    });
    minimapCanvas.addEventListener('pointercancel', (event) => {
      if(minimapState.pointerId !== null && event.pointerId !== minimapState.pointerId){
        return;
      }
      try {
        minimapCanvas.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      endMinimapPointer(event);
    });
    minimapCanvas.addEventListener('lostpointercapture', () => {
      minimapState.pointerActive = false;
      minimapState.pointerId = null;
    });
  }

  function issuePlayerMoveOrder(x, y, { flashPulse = false, updateHud = false } = {}){
    if(isPlayerRecalling()){
      cancelRecall('move');
    }
    if(!flashPulse){
      const currentGoal = player.navGoal;
      if(currentGoal && Math.abs(currentGoal.x - x) < 0.5 && Math.abs(currentGoal.y - y) < 0.5){
        return;
      }
    }
    cancelPlayerAttack();
    setPlayerDestination(x, y);
    if(flashPulse){
      flash(x, y, {
        startRadius: player.moveCircleStart,
        endRadius: player.moveCircleEnd,
        color: player.moveCircleColor
      });
    }
    if(updateHud){
      setHudMessage();
    }
  }

  function stopStagePointerOrdering(){
    if(abilityRuntime.stagePointerOrdering && stage && abilityRuntime.activePointerId !== null){
      try {
        stage.releasePointerCapture(abilityRuntime.activePointerId);
      } catch (err) {
        /* ignore */
      }
    }
    abilityRuntime.stagePointerOrdering = false;
    abilityRuntime.activePointerId = null;
  }

  // Clicks
  stage.addEventListener('pointerdown', (e)=>{
    updateStagePointerState(e);
    if(e.button === 1){
      e.preventDefault();
      startCameraDrag(e);
      stopStagePointerOrdering();
      return;
    }
    if(e.button === 2){
      if(cancelSkillshotIndicator({ reason: 'pointerCancel' })){
        e.preventDefault();
      }
      stopStagePointerOrdering();
      return;
    }
    if(e.button !== 0){
      return;
    }
    const targetEl = e.target instanceof Element ? e.target : null;
    if(targetEl && targetEl.closest('[data-stage-ignore-click="true"], button, input, select, textarea, [role="button"], [contenteditable="true"]')){
      return;
    }
    const { x, y } = stagePointerPosition(e);
    abilityRuntime.lastPointerWorld = { x, y };
    const pointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
    if(monsterDragState.dragging && (monsterDragState.pointerId === null || monsterDragState.pointerId === pointerId)){
      e.preventDefault();
      return;
    }
    if(monsterDragState.active){
      e.preventDefault();
      stopStagePointerOrdering();
      beginMonsterDrag(pointerId, x, y);
      if(stage && monsterDragState.pointerId !== null){
        try { stage.setPointerCapture(monsterDragState.pointerId); } catch (err) { /* ignore */ }
      }
      return;
    }

    if(practiceDummyState.placing){
      e.preventDefault();
      placePracticeDummyAt(x, y);
      practiceDummyState.placing = false;
      updatePracticeDummyUiState();
      return;
    }
    const dummyRespawning = practiceDummy && practiceDummy.respawnTimer > 0;
    const dummyActive = practiceDummy && practiceDummy.active !== false && !dummyRespawning;
    const insideDummy = dummyActive && isPointerInsidePracticeDummy(x, y);
    if(insideDummy){
      e.preventDefault();
      if(practiceDummyState.selected !== true){
        practiceDummyState.selected = true;
        updatePracticeDummyUiState();
      }
      practiceDummyState.dragging = true;
      practiceDummyState.pointerId = pointerId;
      practiceDummyState.dragOffset.x = practiceDummy.x - x;
      practiceDummyState.dragOffset.y = practiceDummy.y - y;
      if(stage && practiceDummyState.pointerId !== null){
        try { stage.setPointerCapture(practiceDummyState.pointerId); } catch (err) { /* ignore */ }
      }
      return;
    }
    if(practiceDummyState.selected){
      practiceDummyState.selected = false;
      updatePracticeDummyUiState();
    }

    if(GameState.player.vision.editMode){
      e.preventDefault();
      stopStagePointerOrdering();
      const clampCoord = (value, max) => Math.max(0, Math.min(max, value));
      if(GameState.player.vision.dummyState.placing){
        visionDummy.active = true;
        visionDummy.x = clampCoord(x, mapState.width);
        visionDummy.y = clampCoord(y, mapState.height);
        GameState.player.vision.dummyState.placing = false;
        updateVisionUiState();
        renderMinimap(true);
        return;
      }
      if(GameState.player.vision.placing){
        const created = addVisionAt(clampCoord(x, mapState.width), clampCoord(y, mapState.height));
        GameState.player.vision.placing = false;
        updateVisionUiState();
        GameState.player.vision.draggingId = created ? created.id : null;
        GameState.player.vision.dragOffset.x = 0;
        GameState.player.vision.dragOffset.y = 0;
        GameState.player.vision.dragMoved = false;
        GameState.player.vision.pointerId = pointerId;
        if(stage && GameState.player.vision.pointerId !== null){
          try { stage.setPointerCapture(GameState.player.vision.pointerId); } catch (err) { /* ignore */ }
        }
        return;
      }
      const dummyActive = visionDummy && visionDummy.active !== false;
      if(dummyActive){
        const threshold = practiceDummyDragThreshold();
        const dist = Math.hypot(x - visionDummy.x, y - visionDummy.y);
        if(dist <= threshold){
          selectVision(null);
          GameState.player.vision.dummyState.dragging = true;
          GameState.player.vision.dummyState.pointerId = pointerId;
          GameState.player.vision.dummyState.dragOffset.x = visionDummy.x - x;
          GameState.player.vision.dummyState.dragOffset.y = visionDummy.y - y;
          if(stage && GameState.player.vision.dummyState.pointerId !== null){
            try { stage.setPointerCapture(GameState.player.vision.dummyState.pointerId); } catch (err) { /* ignore */ }
          }
          return;
        }
      }
      const hitVision = findVisionAt(x, y, 6);
      if(hitVision){
        selectVision(hitVision.id);
        GameState.player.vision.draggingId = hitVision.id;
        GameState.player.vision.dragOffset.x = hitVision.x - x;
        GameState.player.vision.dragOffset.y = hitVision.y - y;
        GameState.player.vision.dragMoved = false;
        GameState.player.vision.pointerId = pointerId;
        if(stage && GameState.player.vision.pointerId !== null){
          try { stage.setPointerCapture(GameState.player.vision.pointerId); } catch (err) { /* ignore */ }
        }
      } else {
        selectVision(null);
        GameState.player.vision.draggingId = null;
        GameState.player.vision.pointerId = pointerId;
      }
      return;
    }

    if(GameState.map.colliders.editMode){
      e.preventDefault();
      stopStagePointerOrdering();
      const pointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
      if(GameState.map.colliders.placing){
        const created = addColliderAt(x, y);
        GameState.map.colliders.placing = false;
        updateColliderUiState();
        GameState.map.colliders.draggingId = created ? created.id : null;
        GameState.map.colliders.dragOffset.x = 0;
        GameState.map.colliders.dragOffset.y = 0;
        GameState.map.colliders.dragMoved = false;
        GameState.map.colliders.pointerId = pointerId;
        if(stage && GameState.map.colliders.pointerId !== null){
          try { stage.setPointerCapture(GameState.map.colliders.pointerId); } catch (err) { /* ignore */ }
        }
        return;
      }
      const hit = findColliderAt(x, y, 6);
      if(hit){
        selectCollider(hit.id);
        GameState.map.colliders.draggingId = hit.id;
        GameState.map.colliders.dragOffset.x = hit.x - x;
        GameState.map.colliders.dragOffset.y = hit.y - y;
        GameState.map.colliders.dragMoved = false;
        GameState.map.colliders.pointerId = pointerId;
        if(stage && GameState.map.colliders.pointerId !== null){
          try { stage.setPointerCapture(GameState.map.colliders.pointerId); } catch (err) { /* ignore */ }
        }
      } else {
        selectCollider(null);
        GameState.map.colliders.draggingId = null;
        GameState.map.colliders.pointerId = pointerId;
      }
      return;
    }

    if (GameState.spawns.placing){
      const list = GameState.spawns.placing==='blue'?blueSpawns:redSpawns;
      list.length = 0; // keep single
      list.push({x, y, userPlaced: true});
      setHudMessage((GameState.spawns.placing.toUpperCase())+` spawn set at (${x|0}, ${y|0})`);
      invalidateLaneLayout({ resetMinions: true });
      clearAllNavigation();
      GameState.spawns.placing = null;
      stopStagePointerOrdering();
      return;
    }
    const artilleryMode = activeArcaneRiteModeForCaster(player);
    if(artilleryMode){
      e.preventDefault();
      stopStagePointerOrdering();
      scheduleArcaneRiteExplosion(artilleryMode, x, y);
      return;
    }
    const target = findAutoAttackTargetAt(x, y);
    if(target){
      cancelPlayerAttack();
      if(commandPlayerAttack(target)){
        flash(target.x, target.y);
      }
      setHudMessage();
      stopStagePointerOrdering();
      return;
    }
    abilityRuntime.stagePointerOrdering = true;
    abilityRuntime.activePointerId = Number.isFinite(e.pointerId) ? e.pointerId : null;
    if(stage && abilityRuntime.activePointerId !== null){
      try {
        stage.setPointerCapture(abilityRuntime.activePointerId);
      } catch (err) {
        /* ignore */
      }
    }
    issuePlayerMoveOrder(x, y, { flashPulse: true, updateHud: true });
  });

  stage.addEventListener('pointermove', (e)=>{
    updateStagePointerState(e);
    if(cameraDragActive && (cameraDragPointerId === null || cameraDragPointerId === e.pointerId)){
      clearHoverTarget();
      e.preventDefault();
      if(cameraDragLast){
        const rect = stage.getBoundingClientRect();
        const dx = e.clientX - cameraDragLast.clientX;
        const dy = e.clientY - cameraDragLast.clientY;
        cameraDragLast = { clientX: e.clientX, clientY: e.clientY };
        camera.drag.last = cameraDragLast ? { ...cameraDragLast } : null;
        const width = rect && Number.isFinite(rect.width) ? rect.width : 0;
        const height = rect && Number.isFinite(rect.height) ? rect.height : 0;
        if(width > 0 && height > 0){
          const worldPerPixelX = camera.width / width;
          const worldPerPixelY = camera.height / height;
          applyManualCameraOffset(dx * worldPerPixelX, dy * worldPerPixelY);
        }
      } else {
        cameraDragLast = { clientX: e.clientX, clientY: e.clientY };
        camera.drag.last = cameraDragLast ? { ...cameraDragLast } : null;
      }
      return;
    }
    const { x, y } = stagePointerPosition(e);
    abilityRuntime.lastPointerWorld = { x, y };
    if(monsterDragState.dragging && (monsterDragState.pointerId === null || monsterDragState.pointerId === e.pointerId)){
      clearHoverTarget();
      e.preventDefault();
      updateMonsterDragPosition(x, y);
      return;
    }
    if(practiceDummyState.dragging && (practiceDummyState.pointerId === null || practiceDummyState.pointerId === e.pointerId)){
      clearHoverTarget();
      e.preventDefault();
      placePracticeDummyAt(x + practiceDummyState.dragOffset.x, y + practiceDummyState.dragOffset.y);
      return;
    }
    if(GameState.player.vision.editMode){
      if(GameState.player.vision.dummyState.dragging && (GameState.player.vision.dummyState.pointerId === null || GameState.player.vision.dummyState.pointerId === e.pointerId)){
        clearHoverTarget();
        e.preventDefault();
        const clampCoord = (value, max) => Math.max(0, Math.min(max, value));
        visionDummy.x = clampCoord(x + GameState.player.vision.dummyState.dragOffset.x, mapState.width);
        visionDummy.y = clampCoord(y + GameState.player.vision.dummyState.dragOffset.y, mapState.height);
        renderMinimap(true);
      } else if(GameState.player.vision.draggingId !== null && (GameState.player.vision.pointerId === null || GameState.player.vision.pointerId === e.pointerId)){
        clearHoverTarget();
        e.preventDefault();
        const source = getVisionByIdValue(GameState.player.vision.draggingId);
        if(source){
          const clampCoord = (value, max) => Math.max(0, Math.min(max, value));
          source.x = clampCoord(x + GameState.player.vision.dragOffset.x, mapState.width);
          source.y = clampCoord(y + GameState.player.vision.dragOffset.y, mapState.height);
          GameState.player.vision.dragMoved = true;
          renderMinimap(true);
        }
      }
      return;
    }
    if(GameState.map.colliders.editMode){
      if(GameState.map.colliders.draggingId !== null && (GameState.map.colliders.pointerId === null || GameState.map.colliders.pointerId === e.pointerId)){
        clearHoverTarget();
        e.preventDefault();
        const collider = getColliderByIdValue(GameState.map.colliders.draggingId);
        if(collider){
          collider.x = Math.max(0, Math.min(mapState.width, x + GameState.map.colliders.dragOffset.x));
          collider.y = Math.max(0, Math.min(mapState.height, y + GameState.map.colliders.dragOffset.y));
          GameState.map.colliders.dragMoved = true;
          renderMinimap(true);
        }
      }
      return;
    }
    if(activeArcaneRiteModeForCaster(player)){
      if(abilityRuntime.stagePointerOrdering){
        stopStagePointerOrdering();
      }
      clearHoverTarget();
      return;
    }
    if(abilityRuntime.stagePointerOrdering){
      issuePlayerMoveOrder(x, y);
      updateHoverTargetFromPosition(x, y);
      return;
    }
    updateHoverTargetFromPosition(x, y);
  });
  stage.addEventListener('pointerup', (e) => {
    updateStagePointerState(e);
    if(monsterDragState.dragging && (monsterDragState.pointerId === null || monsterDragState.pointerId === e.pointerId)){
      endMonsterDrag({ commit: true });
      return;
    }
    if(monsterDragState.active){
      cancelMonsterDrag();
    }
    if(practiceDummyState.dragging && (practiceDummyState.pointerId === null || practiceDummyState.pointerId === e.pointerId)){
      stopVisionDummyDrag();
      updatePracticeDummyUiState();
      return;
    }
    if(practiceDummyState.placing){
      practiceDummyState.placing = false;
      updatePracticeDummyUiState();
    }
    if(GameState.player.vision.editMode){
      if(GameState.player.vision.dummyState.dragging && (GameState.player.vision.dummyState.pointerId === null || GameState.player.vision.dummyState.pointerId === e.pointerId)){
        stopVisionDummyDrag();
        updateVisionUiState();
        return;
      }
      if(GameState.player.vision.pointerId === null || GameState.player.vision.pointerId === e.pointerId){
        if(GameState.player.vision.dragMoved){
          onVisionsChanged();
        }
        stopVisionDrag();
        GameState.player.vision.placing = false;
        updateVisionUiState();
        if(stage && Number.isFinite(e.pointerId)){
          try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
      }
      return;
    }
    if(GameState.map.colliders.editMode){
      if(GameState.map.colliders.pointerId === null || GameState.map.colliders.pointerId === e.pointerId){
        if(GameState.map.colliders.dragMoved){
          onCollidersChanged();
        }
        stopColliderDrag();
        GameState.map.colliders.placing = false;
        updateColliderUiState();
        if(stage && Number.isFinite(e.pointerId)){
          try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
      }
      return;
    }
    stopCameraDrag();
    stopStagePointerOrdering();
  });
  stage.addEventListener('pointercancel', (e) => {
    updateStagePointerState(e);
    if(monsterDragState.dragging && (monsterDragState.pointerId === null || monsterDragState.pointerId === e.pointerId)){
      cancelMonsterDrag();
      return;
    }
    if(monsterDragState.active){
      cancelMonsterDrag();
    }
    if(practiceDummyState.dragging && (practiceDummyState.pointerId === null || practiceDummyState.pointerId === e.pointerId)){
      stopVisionDummyDrag();
      updatePracticeDummyUiState();
      return;
    }
    if(practiceDummyState.placing){
      practiceDummyState.placing = false;
      updatePracticeDummyUiState();
    }
    if(GameState.player.vision.editMode){
      if(GameState.player.vision.dummyState.dragging && (GameState.player.vision.dummyState.pointerId === null || GameState.player.vision.dummyState.pointerId === e.pointerId)){
        stopVisionDummyDrag();
      }
      if(GameState.player.vision.pointerId === null || GameState.player.vision.pointerId === e.pointerId){
        stopVisionDrag();
        GameState.player.vision.placing = false;
      }
      updateVisionUiState();
      return;
    }
    if(GameState.map.colliders.editMode){
      stopColliderDrag();
      GameState.map.colliders.placing = false;
      updateColliderUiState();
      return;
    }
    stopCameraDrag();
    stopStagePointerOrdering();
  });
  stage.addEventListener('contextmenu', (e) => {
    if(cancelSkillshotIndicator({ reason: 'pointerCancel' })){
      e.preventDefault();
    }
  });
  stage.addEventListener('lostpointercapture', (e) => {
    updateStagePointerState(e);
    if(monsterDragState.dragging && (monsterDragState.pointerId === null || monsterDragState.pointerId === e.pointerId)){
      cancelMonsterDrag();
      return;
    }
    if(monsterDragState.active){
      cancelMonsterDrag();
    }
    if(practiceDummyState.dragging && (practiceDummyState.pointerId === null || practiceDummyState.pointerId === e.pointerId)){
      stopVisionDummyDrag();
      updatePracticeDummyUiState();
      return;
    }
    if(GameState.player.vision.editMode){
      if(GameState.player.vision.dummyState.dragging && (GameState.player.vision.dummyState.pointerId === null || GameState.player.vision.dummyState.pointerId === e.pointerId)){
        stopVisionDummyDrag();
        updateVisionUiState();
        return;
      }
      if(GameState.player.vision.pointerId === null || GameState.player.vision.pointerId === e.pointerId){
        stopVisionDrag();
        GameState.player.vision.placing = false;
        updateVisionUiState();
      }
      return;
    }
    if(GameState.map.colliders.editMode){
      if(GameState.map.colliders.pointerId === null || GameState.map.colliders.pointerId === e.pointerId){
        stopColliderDrag();
        GameState.map.colliders.placing = false;
        updateColliderUiState();
      }
      return;
    }
    stopCameraDrag();
    stopStagePointerOrdering();
  });
  stage.addEventListener('wheel', (e) => {
    if(e.ctrlKey){
      return;
    }
    if(!(cameraWheelSensitivity > 0)){
      return;
    }
    updateStagePointerState(e);
    const deltaY = e.deltaY;
    if(!Number.isFinite(deltaY) || deltaY === 0){
      return;
    }
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const width = rect && Number.isFinite(rect.width) ? rect.width : 0;
    const height = rect && Number.isFinite(rect.height) ? rect.height : 0;
    const pointerNx = width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / width)) : 0.5;
    const pointerNy = height > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top) / height)) : 0.5;
    const anchor = stagePointerPosition(e);
    const basePercent = camera.scale * 100;
    const baseStep = Math.max(0, Number(cameraWheelSensitivity) || 0);
    if(!(baseStep > 0)){
      return;
    }
    const magnitude = Math.min(3, Math.abs(deltaY) / 100) || 1;
    const change = baseStep * magnitude;
    const direction = deltaY > 0 ? 1 : -1;
    const nextPercent = basePercent - change * direction;
    const zoomChanged = setCameraZoom(nextPercent, { syncInput: true, instant: false });
    if(!zoomChanged){
      return;
    }
    if(camera.mode !== 'locked'){
      const desiredX = anchor.x - pointerNx * camera.width;
      const desiredY = anchor.y - pointerNy * camera.height;
      const deltaX = desiredX - camera.x;
      const deltaYCam = desiredY - camera.y;
      if(Math.abs(deltaX) > 0.01 || Math.abs(deltaYCam) > 0.01){
        applyManualCameraOffset(deltaX, deltaYCam, { immediate: true });
      }
    } else {
      recenterCamera({ force: true });
    }
  }, { passive: false });
  stage.addEventListener('pointerenter', (e) => updateStagePointerState(e));
  stage.addEventListener('pointerleave', () => {
    stagePointerState.inside = false;
    clearHoverTarget();
    refreshStageCursor();
    if(GameState.map.colliders.editMode){
      stopColliderDrag();
      GameState.map.colliders.placing = false;
      updateColliderUiState();
      return;
    }
    stopCameraDrag();
  });
  window.addEventListener('pointerup', (e) => {
    stagePointerState.inside = false;
    clearHoverTarget();
    refreshStageCursor();
    if(GameState.map.colliders.editMode){
      if(GameState.map.colliders.pointerId === null || GameState.map.colliders.pointerId === e.pointerId){
        if(GameState.map.colliders.dragMoved){
          onCollidersChanged();
        }
        stopColliderDrag();
        GameState.map.colliders.placing = false;
        updateColliderUiState();
      }
      return;
    }
    stopCameraDrag();
    stopStagePointerOrdering();
  }, { passive: true });
  window.addEventListener('pointercancel', (e) => {
    stagePointerState.inside = false;
    clearHoverTarget();
    refreshStageCursor();
    if(GameState.map.colliders.editMode){
      stopColliderDrag();
      GameState.map.colliders.placing = false;
      updateColliderUiState();
      return;
    }
    stopCameraDrag();
    stopStagePointerOrdering();
  }, { passive: true });

  // === Drawing helpers ===
  function drawHoverHighlight(){
    if(!cursorState.outlineEnabled){
      return;
    }
    const targetInfo = cursorRuntime.hoverTarget;
    if(!targetInfo || !targetInfo.ref){
      return;
    }
    const target = targetInfo.ref;
    let radius = 0;
    let centerX = target.x;
    let centerY = target.y;
    if(targetInfo.type === 'minion'){
      if(!minions.includes(target) || !(target.hp > 0)){
        return;
      }
      radius = minionRadius + 14;
    } else if(targetInfo.type === 'monster'){
      if(!isMonsterAttackable(target)){
        return;
      }
      const monsterRadius = Math.max(20, monsterAttackRadius(target));
      radius = monsterRadius + 20;
    } else if(targetInfo.type === 'dummy'){
      if(target.active === false || target.hp <= 0){
        return;
      }
      const size = Math.max(40, Number(target.size) || 120);
      radius = size / 2 + 12;
    } else {
      return;
    }
    if(!circleInCamera(centerX, centerY, radius + 12)){
      return;
    }
    const color = cursorState.hoverColor || '#7fe3ff';
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawVisionShapes(){
    if(GameState.player.vision.hidden){
      return;
    }
    ctx.save();
    for(const source of customVisionSources){
      if(!source) continue;
      ensureVisionConsistency(source);
      const highlight = source.id === GameState.player.vision.selectedId;
      const alpha = highlight ? 0.6 : 0.4;
      const isHiding = source.mode === 2;
      const fillColor = highlight
        ? (isHiding ? '#39ff1444' : '#63d7ff2a')
        : (isHiding ? '#39ff1424' : '#2f8cff24');
      const strokeColor = highlight
        ? (isHiding ? '#39ff14' : '#63d7ff')
        : (isHiding ? '#39ff14cc' : '#2f8cffcc');
      if(source.type === 'capsule'){
        const metrics = ensureCapsuleMetrics(source);
        const bounds = colliderBoundingRadius(source) + 8;
        if(!circleInCamera(source.x, source.y, bounds)){
          continue;
        }
        ctx.save();
        ctx.translate(source.x, source.y);
        ctx.rotate(metrics.angle);
        ctx.globalAlpha = alpha;
        const radius = metrics.radius;
        const halfSpan = metrics.span / 2;
        ctx.beginPath();
        if(metrics.span <= 0){
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
        } else {
          ctx.moveTo(-halfSpan, -radius);
          ctx.lineTo(halfSpan, -radius);
          ctx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(-halfSpan, radius);
          ctx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = highlight ? 4 : 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if(source.type === 'crescent'){
        const metrics = ensureCrescentMetrics(source);
        const radius = Math.max(0, metrics.radius);
        if(!circleInCamera(source.x, source.y, radius + 8)){
          continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(source.x, source.y, radius, 0, Math.PI * 2);
        if(metrics.innerRadius > 0){
          ctx.moveTo(metrics.innerCx + metrics.innerRadius, metrics.innerCy);
          ctx.arc(metrics.innerCx, metrics.innerCy, metrics.innerRadius, 0, Math.PI * 2, true);
        }
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = highlight ? 4 : 3;
        ctx.fill('evenodd');
        ctx.stroke();
        ctx.restore();
      } else {
        const radius = Math.max(0, Number(source.radius) || 0);
        if(!circleInCamera(source.x, source.y, radius + 8)){
          continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(source.x, source.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = highlight ? 4 : 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    const playerRadiusValue = Math.max(0, Number(GameState.player.vision.radius) || 0);
    if(playerRadiusValue > 0 && circleInCamera(player.x, player.y, playerRadiusValue + 4)){
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#63d7ffb0';
      ctx.beginPath();
      ctx.arc(player.x, player.y, playerRadiusValue, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if(visionDummy && visionDummy.active !== false){
      const dummySize = clampPracticeDummySize(visionDummy.size, practiceDummyDefaults.size);
      const bodyRadius = Math.max(10, dummySize * 0.5);
      const span = Math.max(bodyRadius * 2, dummySize * 2.2);
      const boundRadius = Math.max(bodyRadius, span / 2);
      if(boundRadius > 0 && circleInCamera(visionDummy.x, visionDummy.y, boundRadius + 4)){
        ctx.save();
        ctx.translate(visionDummy.x, visionDummy.y);
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([10, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff5577b0';
        ctx.beginPath();
        const radius = bodyRadius;
        const halfSpan = span / 2;
        if(halfSpan <= radius){
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
        } else {
          ctx.moveTo(-halfSpan, -radius);
          ctx.lineTo(halfSpan, -radius);
          ctx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(-halfSpan, radius);
          ctx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawColliders(){
    if(!customColliders.length) return;
    for(const collider of customColliders){
      if(!collider) continue;
      const highlight = collider.id === GameState.map.colliders.selectedId;
      const alpha = GameState.map.colliders.hidden ? 0 : (highlight ? 0.55 : 0.38);
      if(collider.type === 'capsule'){
        const metrics = ensureCapsuleMetrics(collider);
        const bounds = colliderBoundingRadius(collider) + 8;
        if(!circleInCamera(collider.x, collider.y, bounds)){
          continue;
        }
        ctx.save();
        ctx.translate(collider.x, collider.y);
        ctx.rotate(metrics.angle);
        ctx.globalAlpha = alpha;
        const radius = metrics.radius;
        const halfSpan = metrics.span / 2;
        ctx.beginPath();
        if(metrics.span <= 0){
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
        } else {
          ctx.moveTo(-halfSpan, -radius);
          ctx.lineTo(halfSpan, -radius);
          ctx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(-halfSpan, radius);
          ctx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
        }
        ctx.closePath();
        ctx.fillStyle = highlight ? '#ff7b7b33' : '#f89b3330';
        ctx.strokeStyle = highlight ? '#ff7b7b' : '#f89b33cc';
        ctx.lineWidth = highlight ? 4 : 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if(collider.type === 'crescent'){
        const metrics = ensureCrescentMetrics(collider);
        const radius = Math.max(0, metrics.radius);
        if(!circleInCamera(collider.x, collider.y, radius + 8)){
          continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(collider.x, collider.y, radius, 0, Math.PI * 2);
        if(metrics.innerRadius > 0){
          ctx.moveTo(metrics.innerCx + metrics.innerRadius, metrics.innerCy);
          ctx.arc(metrics.innerCx, metrics.innerCy, metrics.innerRadius, 0, Math.PI * 2, true);
        }
        ctx.fillStyle = highlight ? '#ff7b7b33' : '#f89b3330';
        ctx.strokeStyle = highlight ? '#ff7b7b' : '#f89b33cc';
        ctx.lineWidth = highlight ? 4 : 3;
        ctx.fill('evenodd');
        ctx.stroke();
        ctx.restore();
      } else {
        const radius = Math.max(0, Number(collider.radius) || 0);
        if(!circleInCamera(collider.x, collider.y, radius + 8)){
          continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(collider.x, collider.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = highlight ? '#ff7b7b33' : '#f89b3330';
        ctx.strokeStyle = highlight ? '#ff7b7b' : '#f89b33cc';
        ctx.lineWidth = highlight ? 4 : 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawVisionDummy(){
    if(!visionDummy || visionDummy.active === false) return;
    const markerRadius = 16;
    if(!circleInCamera(visionDummy.x, visionDummy.y, markerRadius + 6)){
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(visionDummy.x, visionDummy.y, markerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5577';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#32050c';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', visionDummy.x, visionDummy.y + 1);
    ctx.restore();
  }
  function drawFogOfWar(){
    const overlayColor = 'rgba(6, 12, 20, 0.82)';
    const areas = [];
    for(const source of customVisionSources){
      if(!source) continue;
      ensureVisionConsistency(source);
      const type = source.type === 'capsule' ? 'capsule'
        : (source.type === 'crescent' ? 'crescent' : 'circle');
      if(type === 'capsule'){
        const metrics = ensureCapsuleMetrics(source);
        const bounds = colliderBoundingRadius(source) + 12;
        if(!circleInCamera(source.x, source.y, bounds)){
          continue;
        }
        areas.push({ type: 'capsule', x: source.x, y: source.y, metrics });
      } else if(type === 'crescent'){
        const metrics = ensureCrescentMetrics(source);
        const radius = Math.max(0, metrics.radius);
        if(radius <= 0 || !circleInCamera(source.x, source.y, radius + 12)){
          continue;
        }
        areas.push({ type: 'crescent', metrics });
      } else {
        const radius = Math.max(0, Number(source.radius) || 0);
        if(radius <= 0 || !circleInCamera(source.x, source.y, radius + 8)){
          continue;
        }
        areas.push({ type: 'circle', x: source.x, y: source.y, radius });
      }
    }
    const playerRadiusValue = Math.max(0, Number(GameState.player.vision.radius) || 0);
    if(playerRadiusValue > 0 && circleInCamera(player.x, player.y, playerRadiusValue + 8)){
      areas.push({ type: 'circle', x: player.x, y: player.y, radius: playerRadiusValue });
    }
    if(visionDummy && visionDummy.active !== false){
      const dummyRadius = Math.max(0, Number(visionDummy.radius) || 0);
      if(dummyRadius > 0){
        const clampCoord = (value, max) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
        const dummyX = clampCoord(visionDummy.x, mapState.width);
        const dummyY = clampCoord(visionDummy.y, mapState.height);
        if(circleInCamera(dummyX, dummyY, dummyRadius + 8)){
          areas.push({ type: 'circle', x: dummyX, y: dummyY, radius: dummyRadius });
        }
      }
    }

    const viewWidth = Math.max(1, Math.round(camera.baseWidth));
    const viewHeight = Math.max(1, Math.round(camera.baseHeight));
    if(fogCanvas.width !== viewWidth || fogCanvas.height !== viewHeight){
      fogCanvas.width = viewWidth;
      fogCanvas.height = viewHeight;
    }

    fogCtx.setTransform(1, 0, 0, 1, 0, 0);
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);

    const cameraScale = Math.max(0.001, Number(camera.scale) || 1);
    fogCtx.setTransform(cameraScale, 0, 0, cameraScale, -camera.x * cameraScale, -camera.y * cameraScale);
    fogCtx.globalCompositeOperation = 'source-over';
    fogCtx.globalAlpha = 1;
    fogCtx.fillStyle = overlayColor;
    fogCtx.fillRect(camera.x, camera.y, camera.width, camera.height);
    if(areas.length){
      fogCtx.globalCompositeOperation = 'destination-out';
      fogCtx.fillStyle = '#000';
      for(const area of areas){
        if(area.type === 'capsule'){
          const { metrics } = area;
          fogCtx.save();
          fogCtx.beginPath();
          fogCtx.translate(area.x, area.y);
          fogCtx.rotate(metrics.angle);
          const radius = metrics.radius;
          if(metrics.span <= 0){
            fogCtx.arc(0, 0, radius, 0, Math.PI * 2);
          } else {
            const halfSpan = metrics.span / 2;
            fogCtx.moveTo(-halfSpan, -radius);
            fogCtx.lineTo(halfSpan, -radius);
            fogCtx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
            fogCtx.lineTo(-halfSpan, radius);
            fogCtx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
            fogCtx.closePath();
          }
          fogCtx.fill();
          fogCtx.restore();
          continue;
        }
        fogCtx.beginPath();
        if(area.type === 'crescent'){
          const { metrics } = area;
          fogCtx.moveTo(metrics.cx + metrics.radius, metrics.cy);
          fogCtx.arc(metrics.cx, metrics.cy, metrics.radius, 0, Math.PI * 2);
          if(metrics.innerRadius > 0){
            fogCtx.moveTo(metrics.innerCx + metrics.innerRadius, metrics.innerCy);
            fogCtx.arc(metrics.innerCx, metrics.innerCy, metrics.innerRadius, 0, Math.PI * 2, true);
            fogCtx.fill('evenodd');
          } else {
            fogCtx.fill();
          }
          continue;
        }
        fogCtx.arc(area.x, area.y, area.radius, 0, Math.PI * 2);
        fogCtx.fill();
      }
      fogCtx.globalCompositeOperation = 'source-over';
    }

    fogCtx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.restore();
  }
  function drawPracticeDummyCapsule(m){
    const size = clampPracticeDummySize(m && m.size, 120);
    const radius = Math.max(10, size * 0.5);
    const span = Math.max(radius * 2, size * 2.2);
    const halfSpan = span / 2;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.beginPath();
    ctx.moveTo(-halfSpan, -radius);
    ctx.lineTo(halfSpan, -radius);
    ctx.arc(halfSpan, 0, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-halfSpan, radius);
    ctx.arc(-halfSpan, 0, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = '#ff5577';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#32050c';
    ctx.stroke();
    ctx.restore();
  }

  function drawMonster(){
    if(!monsterState || monsterState.active === false){
      return;
    }
    const x = Number(monsterState.x) || 0;
    const y = Number(monsterState.y) || 0;
    const size = Math.max(40, Number(monsterState.size) || 140);
    const radius = size / 2;
    const aggroRadius = Math.max(0, Number(monsterState.aggroRadius) || 0);
    if(aggroRadius > 0 && circleInCamera(x, y, aggroRadius + 24)){
      ctx.save();
      const engaged = !!monsterState.engaged;
      ctx.globalAlpha = engaged ? 0.18 : 0.12;
      ctx.fillStyle = engaged ? '#c593ff' : '#7b56ff';
      ctx.beginPath();
      ctx.arc(x, y, aggroRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = engaged ? 0.75 : 0.45;
      ctx.lineWidth = engaged ? 3 : 2;
      ctx.strokeStyle = engaged ? '#f1c6ff' : '#c3b2ff';
      ctx.beginPath();
      ctx.arc(x, y, aggroRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if(!circleInCamera(x, y, radius + 20)){
      return;
    }
    if(!pointInVision(x, y, radius)){
      return;
    }
    ctx.save();
    const engaged = !!monsterState.engaged;
    const bodyGradient = ctx.createRadialGradient(x, y - radius * 0.4, radius * 0.2, x, y, radius);
    bodyGradient.addColorStop(0, engaged ? '#ffcef8' : '#f3ddff');
    bodyGradient.addColorStop(0.5, engaged ? '#bd6eff' : '#8650d6');
    bodyGradient.addColorStop(1, engaged ? '#5e1a86' : '#35105c');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = engaged ? '#f8cfff' : '#7b4cff';
    ctx.stroke();
    ctx.restore();
  }

  function drawMinion(m){
    if(m && m.isPracticeDummy){
      drawPracticeDummyCapsule(m);
      return;
    }
    const fill = m.side==='blue' ? '#2aa9ff' : '#ff5577';
    const stroke = '#05121a';

    // Body
    ctx.beginPath();
    ctx.arc(m.x, m.y, minionRadius, 0, Math.PI*2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // Facing indicator (tiny notch toward destination)
    const ang = (typeof m.facing === 'number') ? m.facing : Math.atan2(m.to.y - m.y, m.to.x - m.x);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + Math.cos(ang)*minionRadius, m.y + Math.sin(ang)*minionRadius);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffffaa';
    ctx.stroke();

    // HP bar
    const w = 16, h = 3, pad = 10;
    const pct = Math.max(0, Math.min(1, m.hp / m.maxHp));
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(m.x - w/2, m.y - minionRadius - pad, w, h);
    ctx.fillStyle = '#6cff8b';
    ctx.fillRect(m.x - w/2, m.y - minionRadius - pad, w*pct, h);
    ctx.strokeStyle = '#0b1b28';
    ctx.lineWidth = 1;
    ctx.strokeRect(m.x - w/2, m.y - minionRadius - pad, w, h);
  }

  function drawLaserProjectiles(){
    for(const laser of laserProjectiles){
      const endX = Number.isFinite(laser.currentX) ? laser.currentX : laser.startX;
      const endY = Number.isFinite(laser.currentY) ? laser.currentY : laser.startY;
      const width = Math.max(2, Number(laser.width) || 0);
      if(!rectIntersectsCamera(laser.startX, laser.startY, endX, endY, Math.max(width, 12))) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = width;
      ctx.strokeStyle = '#7fe3ffaa';
      ctx.beginPath();
      ctx.moveTo(laser.startX, laser.startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = Math.max(1, width * 0.55);
      ctx.strokeStyle = '#d8f6ff';
      ctx.beginPath();
      ctx.moveTo(laser.startX, laser.startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(endX, endY, Math.max(4, Math.min(12, width * 0.4)), 0, Math.PI * 2);
      ctx.fillStyle = '#f4fdff';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBlinkingBoltProjectiles(){
    for(const bolt of blinkingBoltProjectiles){
      const tailX = Number.isFinite(bolt.prevX) ? bolt.prevX : bolt.x;
      const tailY = Number.isFinite(bolt.prevY) ? bolt.prevY : bolt.y;
      const headX = Number.isFinite(bolt.x) ? bolt.x : tailX;
      const headY = Number.isFinite(bolt.y) ? bolt.y : tailY;
      if(!rectIntersectsCamera(tailX, tailY, headX, headY, 10)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#8feaff';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8faff';
      ctx.beginPath();
      ctx.arc(headX, headY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#1e2b3a';
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPiercingArrowProjectiles(){
    for(const proj of piercingArrowProjectiles){
      const startX = Number.isFinite(proj.startX) ? proj.startX : 0;
      const startY = Number.isFinite(proj.startY) ? proj.startY : 0;
      const headX = Number.isFinite(proj.currentX) ? proj.currentX : startX;
      const headY = Number.isFinite(proj.currentY) ? proj.currentY : startY;
      const width = Math.max(2, Number(proj.width) || 0);
      if(!rectIntersectsCamera(startX, startY, headX, headY, Math.max(width, 10))) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = '#9de0ff';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#9de0ff';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#eaf6ff';
      ctx.lineWidth = Math.max(1.2, width * 0.45);
      const tailOffset = Math.min(width * 0.6, 14);
      const tailX = headX - (Number(proj.dirX) || 0) * tailOffset;
      const tailY = headY - (Number(proj.dirY) || 0) * tailOffset;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawChargingGaleChargePreviews(){
    for(const cast of chargingGaleCasts){
      if(!cast || cast.released) continue;
      if(cast.casterRef && cast.casterRef !== player) continue;
      const caster = cast.casterRef || player;
      const originFallback = getSpellOrigin(caster);
      const originX = Number.isFinite(cast.originX) ? cast.originX : originFallback.x;
      const originY = Number.isFinite(cast.originY) ? cast.originY : originFallback.y;
      let dirX = Number(cast.initialDirX) || 0;
      let dirY = Number(cast.initialDirY) || 0;
      const dirLen = Math.hypot(dirX, dirY);
      if(dirLen > 0.0001){
        dirX /= dirLen;
        dirY /= dirLen;
      } else {
        dirX = 1;
        dirY = 0;
      }
      const minRange = Math.max(0, Number(cast.minRange) || 0);
      const maxRange = Math.max(minRange, Number(cast.maxRange) || minRange);
      const width = Math.max(12, Number(cast.width) || 0);
      const chargeDuration = Math.max(0, Number(cast.chargeDuration) || 0);
      const chargeElapsed = Math.max(0, Number(cast.chargeElapsed) || 0);
      const t = chargeDuration > 0 ? clamp01(chargeElapsed / Math.max(chargeDuration, 0.0001)) : 1;
      const currentRange = maxRange > minRange ? (minRange + (maxRange - minRange) * t) : maxRange;
      const previewRadius = Math.max(maxRange, currentRange, minRange) + Math.max(width, 60);
      if(!circleInCamera(originX, originY, previewRadius)) continue;
      const angle = Math.atan2(dirY, dirX);
      ctx.save();
      ctx.translate(originX, originY);
      ctx.rotate(angle);
      const halfWidth = width / 2;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#7fe3ff33';
      ctx.fillRect(0, -halfWidth, currentRange, width);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#7fe3ff';
      ctx.strokeRect(0, -halfWidth, currentRange, width);
      if(minRange > 0){
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = '#b8e0ff';
        ctx.beginPath();
        ctx.moveTo(minRange, -halfWidth);
        ctx.lineTo(minRange, halfWidth);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if(maxRange > currentRange){
        ctx.setLineDash([10, 6]);
        ctx.strokeStyle = '#d6f4ff';
        ctx.beginPath();
        ctx.moveTo(maxRange, -halfWidth);
        ctx.lineTo(maxRange, halfWidth);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#9fd1ff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(currentRange, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawChargingGaleProjectiles(){
    for(const proj of chargingGaleProjectiles){
      const startX = Number.isFinite(proj.startX) ? proj.startX : 0;
      const startY = Number.isFinite(proj.startY) ? proj.startY : 0;
      const headX = Number.isFinite(proj.currentX) ? proj.currentX : startX;
      const headY = Number.isFinite(proj.currentY) ? proj.currentY : startY;
      const width = Math.max(2.5, Number(proj.width) || 0);
      if(!rectIntersectsCamera(startX, startY, headX, headY, width * 2)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.82;
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = '#7fe3ffaa';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#e4f8ff';
      ctx.lineWidth = Math.max(1.5, width * 0.55);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawLaserConeCasts(){
    for(const cast of laserConeCasts){
      const geom = resolveLaserConeCastGeometry(cast);
      if(!geom || geom.count <= 0) continue;
      const duration = Math.max(0.0001, Number(cast.castDuration) || 0.0001);
      const progressRaw = Math.max(0, Math.min(1, (cast.elapsed || 0) / duration));
      const eased = progressRaw * progressRaw * (3 - 2 * progressRaw);
      const previewLength = Math.max(1, geom.distance);
      const perpX = -geom.dirY;
      const perpY = geom.dirX;
      for(let i=0;i<geom.count;i++){
        const fraction = geom.count > 1 ? (i / (geom.count - 1)) : 0.5;
        const offset = (fraction - 0.5) * geom.coneWidth;
        const endX = geom.startX + geom.dirX * previewLength + perpX * offset;
        const endY = geom.startY + geom.dirY * previewLength + perpY * offset;
        const width = Math.max(1.5, geom.thickness * (0.35 + 0.45 * eased));
        if(!rectIntersectsCamera(geom.startX, geom.startY, endX, endY, width * 2)) continue;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.25 + 0.55 * eased;
        ctx.shadowBlur = 12 + 26 * eased;
        ctx.shadowColor = '#2aa9ff';
        ctx.lineWidth = width;
        ctx.strokeStyle = '#59c6ff';
        ctx.beginPath();
        ctx.moveTo(geom.startX, geom.startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.4 + 0.45 * eased;
        ctx.lineWidth = Math.max(1, width * 0.55);
        ctx.strokeStyle = '#d3f3ff';
        ctx.beginPath();
        ctx.moveTo(geom.startX, geom.startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * eased;
      ctx.fillStyle = '#59c6ff';
      ctx.beginPath();
      ctx.arc(geom.startX, geom.startY, 6 + 10 * eased, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPiercingArrowCasts(){
    for(const cast of piercingArrowCasts){
      if(!cast) continue;
      const caster = cast.casterRef || player;
      const { x: originX, y: originY } = getSpellOrigin(caster);
      const state = cast.chargeState || computePiercingArrowChargeState(cast);
      const maxRange = Math.max(0, Number(state.rangeMax) || 0);
      if(!(maxRange > 0)) continue;
      let dirX = Number.isFinite(cast.dirX) ? cast.dirX : (Number.isFinite(cast.initialDirX) ? cast.initialDirX : 1);
      let dirY = Number.isFinite(cast.dirY) ? cast.dirY : (Number.isFinite(cast.initialDirY) ? cast.initialDirY : 0);
      const dirLen = Math.hypot(dirX, dirY) || 1;
      dirX /= dirLen;
      dirY /= dirLen;
      const previewRange = state.range;
      const previewEndX = originX + dirX * previewRange;
      const previewEndY = originY + dirY * previewRange;
      const maxEndX = originX + dirX * maxRange;
      const maxEndY = originY + dirY * maxRange;
      const width = Math.max(2, Number(cast.width) || 0);
      if(!rectIntersectsCamera(originX, originY, maxEndX, maxEndY, width * 2)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.32;
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = Math.max(1.5, width * 0.4);
      ctx.strokeStyle = '#3d6eff';
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(maxEndX, maxEndY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.88;
      ctx.shadowColor = '#9de0ff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = Math.max(2.5, width * 0.65);
      ctx.strokeStyle = '#bde8ff';
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(previewEndX, previewEndY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#d6f3ff';
      ctx.beginPath();
      ctx.arc(originX, originY, Math.max(6, width * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawGrabCasts(){
    for(const cast of grabCasts){
      if(!cast) continue;
      const state = cast.state || 'flying';
      const caster = cast.casterRef;
      const baseOrigin = resolveCastOrigin(cast);
      const originX = Number.isFinite(cast.casterOriginX) ? Number(cast.casterOriginX) : baseOrigin.x;
      const originY = Number.isFinite(cast.casterOriginY) ? Number(cast.casterOriginY) : baseOrigin.y;

      if(state === 'channel'){
        const elapsed = Math.max(0, Number(cast.elapsed) || 0);
        const duration = Math.max(0.0001, Number(cast.channelDuration) || 0.0001);
        const progress = Math.max(0, Math.min(1, elapsed / duration));
        const pulse = progress * progress * (3 - 2 * progress);
        const baseRadius = (player && player.r ? player.r : 10) + 8;
        if(!circleInCamera(originX, originY, baseRadius + 12)) continue;
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.4 * pulse;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#9ce7ff';
        ctx.beginPath();
        ctx.arc(originX, originY, baseRadius + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const traveled = Math.max(0, Number(cast.distanceTraveled) || 0);
      const tipX = state === 'pulling' && cast.targetRef
        ? cast.targetRef.x
        : (Number.isFinite(cast.hitPointX) ? cast.hitPointX : originX + (Number(cast.dirX) || 0) * traveled);
      const tipY = state === 'pulling' && cast.targetRef
        ? cast.targetRef.y
        : (Number.isFinite(cast.hitPointY) ? cast.hitPointY : originY + (Number(cast.dirY) || 0) * traveled);

      const width = Math.max(6, grabWidthAt(cast, traveled) * 0.5 + 4);
      if(!rectIntersectsCamera(originX, originY, tipX, tipY, width * 1.5)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.82;
      ctx.shadowColor = '#5ad7ff';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#5ad7ff';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e3faff';
      ctx.beginPath();
      ctx.arc(tipX, tipY, Math.max(6, width * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0b1b28';
      ctx.stroke();
      ctx.restore();

      if(state === 'pulling'){
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#9ce7ffaa';
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCullingBarrageChannels(){
    for(const channel of cullingBarrageChannels){
      if(!channel || channel.ended) continue;
      const caster = channel.casterRef || player;
      const { x: originX, y: originY } = getSpellOrigin(caster);
      const dirX = Number(channel.aimDirX) || 0;
      const dirY = Number(channel.aimDirY) || 0;
      const previewLength = Math.max(0, Number(channel.aimPreviewRange) || Number(channel.projectileRange) || 0);
      const lineLength = previewLength > 0 ? previewLength : 160;
      const muzzleOffset = (caster && Number.isFinite(caster.r) ? caster.r : player.r || 10) + 6;
      const startX = originX + dirX * muzzleOffset;
      const startY = originY + dirY * muzzleOffset;
      const endX = startX + dirX * lineLength;
      const endY = startY + dirY * lineLength;
      const baseWidth = Math.max(2, (Number(channel.projectileWidth) || 0) * 0.35 + 2);
      if(!rectIntersectsCamera(startX, startY, endX, endY, baseWidth * 2)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = baseWidth;
      ctx.strokeStyle = '#9ce7ff';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = Math.max(1, baseWidth * 0.4);
      ctx.strokeStyle = '#e4f6ff';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCullingBarrageProjectiles(){
    for(const proj of cullingBarrageProjectiles){
      if(!proj) continue;
      const traveled = Math.max(0, Number(proj.traveled) || 0);
      const dirX = Number(proj.dirX) || 0;
      const dirY = Number(proj.dirY) || 0;
      const headX = proj.startX + dirX * traveled;
      const headY = proj.startY + dirY * traveled;
      const tailLength = Math.min(traveled, 200);
      const tailX = headX - dirX * tailLength;
      const tailY = headY - dirY * tailLength;
      const width = Math.max(2, (Number(proj.width) || 0) * 0.4 + 1.5);
      if(!rectIntersectsCamera(tailX, tailY, headX, headY, Math.max(width, 12))) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = width;
      ctx.strokeStyle = '#9ce7ffcc';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1, width * 0.45);
      ctx.strokeStyle = '#f1fbff';
      ctx.beginPath();
      ctx.moveTo(headX - dirX * Math.max(6, width * 0.6), headY - dirY * Math.max(6, width * 0.6));
      ctx.lineTo(headX, headY);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMonsterProjectileVisual(p, progress, cx, cy){
    const abilityId = p.monsterAbility;
    if(!abilityId){
      return false;
    }
    const startX = p.startX;
    const startY = p.startY;
    const targetX = p.targetX;
    const targetY = p.targetY;
    const dirX = targetX - startX;
    const dirY = targetY - startY;
    const length = Math.hypot(dirX, dirY) || 1;
    const normX = dirX / length;
    const normY = dirY / length;
    const perpX = -normY;
    const perpY = normX;
    const travel = Math.max(18, Math.min(length * progress, 220));
    const tailX = cx - normX * travel;
    const tailY = cy - normY * travel;
    ctx.save();
    if(abilityId === 'blue'){
      const waveCount = 3;
      for(let i = 0; i < waveCount; i++){
        const radius = 10 + i * 6;
        const alpha = 0.55 - i * 0.15;
        ctx.globalAlpha = Math.max(0.2, alpha);
        ctx.lineWidth = 2.5 - i * 0.6;
        ctx.strokeStyle = '#7fc7ff';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2a8cff66';
      ctx.beginPath();
      ctx.moveTo(tailX + perpX * 8, tailY + perpY * 8);
      ctx.quadraticCurveTo((tailX + cx) / 2, (tailY + cy) / 2, cx, cy);
      ctx.stroke();
    } else if(abilityId === 'red'){
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ff8255dd';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tailX + perpX * 10, tailY + perpY * 10);
      ctx.lineTo(tailX - perpX * 10, tailY - perpY * 10);
      ctx.closePath();
      ctx.fill();
      const flameRadius = 11;
      const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, flameRadius);
      gradient.addColorStop(0, '#ffd1a8');
      gradient.addColorStop(0.5, '#ff874d');
      gradient.addColorStop(1, '#b32718');
      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(cx, cy, flameRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#320d04';
      ctx.stroke();
    } else if(abilityId === 'green'){
      const rockRadius = 12;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#6f7f52';
      ctx.beginPath();
      ctx.arc(cx, cy, rockRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#2f381c';
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#a9c47a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + perpX * 6, cy + perpY * 6);
      ctx.lineTo(cx - perpX * 4, cy - perpY * 6);
      ctx.lineTo(cx - normX * 6, cy - normY * 6);
      ctx.stroke();
    } else {
      ctx.restore();
      return false;
    }
    const emoji = resolveMonsterAbilityEmoji(p.monsterRef || monsterState, abilityId);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
    ctx.restore();
    return true;
  }

  function drawProjectiles(){
    for(const p of projectiles){
      const clamped = Math.min(1, Math.max(0, p.progress));
      const tx = p.targetX;
      const ty = p.targetY;
      const cx = p.startX + (tx - p.startX) * clamped;
      const cy = p.startY + (ty - p.startY) * clamped;
      if(!rectIntersectsCamera(p.startX, p.startY, cx, cy, 18)) continue;
      if(p.monsterAbility && drawMonsterProjectileVisual(p, clamped, cx, cy)){
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(p.startX, p.startY);
      ctx.lineTo(cx, cy);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#a5e8ff55';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#d9f6ff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0b1b28';
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHitSplats(){
    for(const h of hitsplats){
      const life = Math.max(0.001, h.lifetime || 0.001);
      const progress = Math.max(0, Math.min(1, h.age / life));
      const alpha = Math.max(0, 1 - progress);
      if(alpha <= 0) continue;
      const rise = Math.max(0, h.rise || 0);
      const size = Math.max(8, h.size || 0);
      const text = String(h.amount);
      const drawY = h.y - rise * progress;
      if(!circleInCamera(h.x, drawY, size * 0.75)) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${size}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const outline = Math.max(2, size * 0.15);
      ctx.lineWidth = outline;
      ctx.strokeStyle = '#05121a';
      ctx.strokeText(text, h.x, drawY);
      ctx.fillStyle = '#ffe27a';
      ctx.fillText(text, h.x, drawY);
      ctx.restore();
    }
  }

  function drawPlayer(){
    const range = Math.max(0, Number(player.attackRange) || 0);
    const rangeOpacityRaw = Number(player.attackRangeOpacity);
    const rangeOpacity = Math.max(0, Math.min(1, Number.isFinite(rangeOpacityRaw) ? rangeOpacityRaw : 0));
    if(range > 0){
      ctx.save();
      const isRed = player.team === 'red';
      if(rangeOpacity > 0){
        const fillColor = isRed
          ? `rgba(255, 85, 119, ${rangeOpacity})`
          : `rgba(42, 169, 255, ${rangeOpacity})`;
        ctx.beginPath();
        ctx.arc(player.x, player.y, range, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.setLineDash([10, 6]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isRed ? '#ff5577aa' : '#2aa9ffaa';
      ctx.beginPath();
      ctx.arc(player.x, player.y, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const windupRemaining = Math.max(0, Number(player.attackWindup) || 0);
    if(windupRemaining > 0 && range > 0){
      const windupTotal = Math.max(0, Number(player.attackWindupMs) || 0) / 1000;
      if(windupTotal > 0){
        const normalized = Math.max(0, Math.min(1, 1 - (windupRemaining / windupTotal)));
        const innerRadius = Math.max(0, range - 18);
        const outerRadius = Math.max(innerRadius + 12, range + 32);
        const gradient = ctx.createRadialGradient(player.x, player.y, innerRadius, player.x, player.y, outerRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 190, 0)');
        gradient.addColorStop(0.35, 'rgba(221, 255, 102, 0.72)');
        gradient.addColorStop(0.7, 'rgba(168, 255, 0, 0.36)');
        gradient.addColorStop(1, 'rgba(132, 255, 0, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const baseAlpha = 0.95 - normalized * 0.28;
        ctx.globalAlpha = Math.min(1, baseAlpha * 1.25);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(player.x, player.y, outerRadius, 0, Math.PI * 2);
        if(innerRadius > 0){
          ctx.arc(player.x, player.y, innerRadius, 0, Math.PI * 2, true);
          ctx.fill('evenodd');
        } else {
          ctx.fill();
        }
        ctx.restore();
      }
    }

    const showHitbox = player.hitboxVisible !== false;
    const hasRuntimeModel = playerRuntime.model && playerRuntime.model.isActive();
    const hitboxLengthRaw = Number(player.hitboxLength);
    const hitboxWidthRaw = Number(player.hitboxWidth);
    const hitboxLength = Number.isFinite(hitboxLengthRaw) ? Math.max(0, hitboxLengthRaw) : 0;
    const hitboxWidth = Number.isFinite(hitboxWidthRaw) ? Math.max(0, hitboxWidthRaw) : 0;
    const hitboxShape = typeof player.hitboxShape === 'string' ? player.hitboxShape : 'capsule';
    const playerRadius = Math.max(0, Number(player.r) || 0);
    if(showHitbox && (hitboxLength > 0 || hitboxWidth > 0)){
      ctx.save();
      ctx.beginPath();
      if(hitboxShape === 'rectangle'){
        const halfLength = hitboxLength > 0 ? hitboxLength / 2 : 0;
        const halfWidth = hitboxWidth > 0 ? hitboxWidth / 2 : 0;
        ctx.rect(player.x - halfWidth, player.y - halfLength, halfWidth * 2, halfLength * 2);
      } else if(hitboxShape === 'circle'){
        const diameter = hitboxWidth > 0 ? hitboxWidth : (hitboxLength > 0 ? hitboxLength : playerRadius * 2);
        const radius = Math.max(0, diameter / 2);
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      } else {
        const halfWidth = hitboxWidth > 0 ? hitboxWidth / 2 : Math.max(playerRadius, hitboxLength / 2);
        const radius = Math.max(0, halfWidth);
        const halfLength = hitboxLength > 0 ? hitboxLength / 2 : Math.max(radius, playerRadius * 2);
        const bodyHalf = Math.max(0, halfLength - radius);
        if(bodyHalf <= 0){
          ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
        } else {
          ctx.arc(player.x, player.y - bodyHalf, radius, Math.PI, 0);
          ctx.arc(player.x, player.y + bodyHalf, radius, 0, Math.PI);
          ctx.closePath();
        }
      }
      if(hasRuntimeModel){
        ctx.lineWidth = 3;
        ctx.strokeStyle = player.color;
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#05121a';
        ctx.stroke();
      } else {
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#05121a';
        ctx.stroke();
      }
      ctx.restore();
    }

    if(isPlayerRecalling()){
      const duration = Math.max(0.1, Number(player.recall.duration) || RECALL_CHANNEL_SECONDS);
      const progress = Math.min(1, Math.max(0, player.recall.timer / duration));
      const recallRadius = Math.max(playerRadius + 36, 28);
      if(circleInCamera(player.x, player.y, recallRadius + 12)){
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#7fe3ff';
        ctx.beginPath();
        ctx.arc(player.x, player.y, recallRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(player.x, player.y, recallRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = '#7fe3ff';
        ctx.stroke();
        ctx.restore();
      }
    }

    if(showHitbox){
      const origin = getSpellOrigin(player);
      ctx.save();
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe27a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#05121a';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(origin.x - 10, origin.y);
      ctx.lineTo(origin.x + 10, origin.y);
      ctx.moveTo(origin.x, origin.y - 10);
      ctx.lineTo(origin.x, origin.y + 10);
      ctx.strokeStyle = '#ffe27a88';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Update & draw
  let last = performance.now();
  function tick(now){
    // timer
    const gameTime = timerState.running ? performance.now() - timerState.start : timerState.elapsedMs;
    if(timerEl){
      const nextTimerText = fmt(gameTime);
      if(nextTimerText !== timerState.lastText){
        timerEl.textContent = nextTimerText;
        timerState.lastText = nextTimerText;
        scheduleHudFit();
      }
    }
    const dt = Math.min(0.05, (now - last)/1000); last = now;
    tickPracticeDummy(dt);
    updateMonsterState(dt);
    if(player.combatLockTimer > 0){
      player.combatLockTimer = Math.max(0, player.combatLockTimer - dt);
    }
    updatePlayerBaseState(dt);
    updatePlayerRecall(dt);
    updateShopState(dt);
    const prevPlayerX = player.x;
    const prevPlayerY = player.y;
    const activeCast = player.casting;
    const isPlayerCasting = !!(activeCast && !activeCast.allowMovementWhileCasting);
    const isPlayerMovementLocked = Number(player.stunTimer) > 0 || Number(player.knockupTimer) > 0 || Number(player.polymorphTimer) > 0;
    const baseMovementMultiplier = activeCast && Number.isFinite(activeCast.movementSpeedMultiplier)
      ? Math.max(0, activeCast.movementSpeedMultiplier)
      : 1;
    const movementMultiplier = isPlayerMovementLocked ? 0 : baseMovementMultiplier;
    updateHudHealth();
    updatePracticeDummyHud();
    updateMonsterHud();

    if(timerState.running && !scoreState.gameOver && goldState.perSecond > 0){
      addGold(goldState.perSecond * dt);
    }

    // waves
    if (timerState.running && !scoreState.gameOver){
      const lanePlan = ensureLaneLayout();
      const bluePaths = lanePlan ? lanePlan.bluePaths : [];
      const redPaths = lanePlan ? lanePlan.redPaths : [];
      let canSpawn = bluePaths.length > 0 && redPaths.length > 0;
      if(!canSpawn){
        const fallbackBlue = getPath('blue');
        const fallbackRed = getPath('red');
        canSpawn = !!(fallbackBlue && fallbackRed);
      }
      if (canSpawn && gameTime >= timerState.nextWaveAtMs){
        waveState.waveNumber = (waveState.waveNumber|0) + 1;
        spawnWave('blue', gameTime, bluePaths);
        spawnWave('red', gameTime, redPaths);
        timerState.nextWaveAtMs = gameTime + waveState.waveIntervalMs;
      }
    }

    if (timerState.running && pendingSpawns.length){
      while (pendingSpawns.length && gameTime >= pendingSpawns[0].at){
        const job = pendingSpawns.shift();
        spawnFromQueue(job);
      }
    }

    // minion logic (move or attack)
    for(const m of minions){
      m.cd = Math.max(0, m.cd - dt);
      if(m && m.slowTimer > 0){
        m.slowTimer = Math.max(0, m.slowTimer - dt);
        if(m.slowTimer <= 0){
          m.slowPct = 0;
        }
      }
      if(m && m.stunTimer > 0){
        m.stunTimer = Math.max(0, m.stunTimer - dt);
        if(m.stunTimer <= 0 && !m.beingPulledBy){
          m.stunTimer = 0;
        }
      }
    }

    if(player){
      if(Number(player.slowTimer) > 0){
        player.slowTimer = Math.max(0, player.slowTimer - dt);
        if(player.slowTimer <= 0){
          player.slowTimer = 0;
          player.slowPct = 0;
        }
      }
      if(Number(player.stunTimer) > 0){
        player.stunTimer = Math.max(0, player.stunTimer - dt);
        if(player.stunTimer <= 0){
          player.stunTimer = 0;
        }
      }
      if(Number(player.knockupTimer) > 0){
        player.knockupTimer = Math.max(0, player.knockupTimer - dt);
        if(player.knockupTimer <= 0){
          player.knockupTimer = 0;
        }
      }
      const miscTimers = ['silenceTimer', 'disarmTimer', 'polymorphTimer'];
      for(const key of miscTimers){
        if(Number(player[key]) > 0){
          player[key] = Math.max(0, Number(player[key]) - dt);
        }
      }
    }
    updatePlayerStatusIcons();
    updatePracticeDummyStatusIcons();

    for(const m of minions){
      const laneProjection = updateMinionLaneFrame(m);
      if(m && m.isPracticeDummy){
        continue;
      }
      if(m.portalizing > 0){
        const portalAngle = Math.atan2(m.to.y - m.y, m.to.x - m.x);
        const laneFacing = typeof m.laneFacing === 'number' ? m.laneFacing : portalAngle;
        m.facing = blendAngles(portalAngle, laneFacing, 0.75);
        m.portalizing += dt;
        // on complete portalization: score + remove (via hp 0)
        if(m.portalizing >= 0.25 && !m.scored){
          const scoringSide = m.side; // owner scores at enemy portal
          addScore(scoringSide, scoreState.pointsPer);
          m.scored = true;
          m.hp = 0;
        }
        continue;
      }

      // nearest enemy
      let targetMinion = null;
      let best = Infinity;
      for(const n of minions){
        if(n.side===m.side || n.portalizing>0 || n.hp <= 0) continue;
        const d = Math.hypot(n.x - m.x, n.y - m.y);
        if(d < best){
          best = d;
          targetMinion = n;
        }
      }

      const canConsiderPlayer = player && player.team !== m.side && Number.isFinite(player.hp) && player.hp > 0;
      const playerRadius = Math.max(0, Number(player.r) || 0);
      let playerDistance = Infinity;
      if(canConsiderPlayer){
        playerDistance = Math.hypot(player.x - m.x, player.y - m.y);
      }
      const attackRange = MINION_RANGE + minionRadius;
      const engagedWithMinion = targetMinion && best <= attackRange;
      const hasNearbyEnemyMinions = targetMinion && best <= MINION_PLAYER_AGGRO_RANGE;
      const shouldChasePlayer = canConsiderPlayer && !engagedWithMinion && playerDistance <= MINION_PLAYER_AGGRO_RANGE;
      const canAttackPlayer = shouldChasePlayer && playerDistance <= (attackRange + playerRadius);
      const enemyPresence = hasNearbyEnemyMinions || shouldChasePlayer;
      const laneFree = !enemyPresence;

      // portal zone detection
      const dToPortal = Math.hypot(m.to.x - m.x, m.to.y - m.y);
      m.inPortalZone = laneFree && dToPortal <= PORTAL_INTAKE_R;
      const angleToPortal = Math.atan2(m.to.y - m.y, m.to.x - m.x);
      const laneFacing = typeof m.laneFacing === 'number' ? m.laneFacing : angleToPortal;

      if(laneFree && dToPortal <= PORTAL_R){
        m.facing = blendAngles(angleToPortal, laneFacing, 0.65);
        m.portalizing = 0.0001;
        continue;
      }
      const angleToTarget = targetMinion ? Math.atan2(targetMinion.y - m.y, targetMinion.x - m.x) : null;
      const angleToPlayer = shouldChasePlayer ? Math.atan2(player.y - m.y, player.x - m.x) : null;
      let primaryAngle = angleToTarget;
      if(shouldChasePlayer && angleToPlayer !== null){
        primaryAngle = angleToPlayer;
      } else if(primaryAngle === null){
        primaryAngle = angleToPortal;
      }
      let facing = blendAngles(primaryAngle, laneFacing, (shouldChasePlayer || targetMinion) ? 0.35 : 0.6);

      if(m.stunTimer > 0 || m.beingPulledBy){
        if(m.beingPulledBy && typeof m.beingPulledBy.dirX === 'number' && typeof m.beingPulledBy.dirY === 'number'){
          facing = Math.atan2(m.beingPulledBy.dirY, m.beingPulledBy.dirX);
        }
        m.facing = facing;
        continue;
      }

      if(targetMinion && best <= attackRange){
        if(m.cd <= 0){
          const damage = Math.max(0, Number(m.dmg) || 0);
          if(damage > 0){
            const prevHp = Number(targetMinion.hp) || 0;
            targetMinion.hp = Math.max(0, prevHp - damage);
            spawnHitSplat(targetMinion.x, targetMinion.y - minionRadius, damage);
            separateMinionsAfterAttack(m, targetMinion, best);
            handlePracticeDummyDamage(targetMinion, prevHp);
          }
          m.cd = MINION_ATTACK_COOLDOWN;
        }
        if(angleToTarget !== null){
          facing = blendAngles(angleToTarget, laneFacing, 0.35);
        }
      } else if(shouldChasePlayer && canAttackPlayer){
        if(m.cd <= 0){
          const damage = Math.max(0, Number(m.dmg) || 0);
          if(damage > 0){
            damagePlayer(damage);
            separateMinionFromPlayer(m, playerDistance, playerRadius);
          }
          m.cd = MINION_ATTACK_COOLDOWN;
        }
        if(angleToPlayer !== null){
          facing = blendAngles(angleToPlayer, laneFacing, 0.35);
        }
      } else {
        const chasingPlayer = shouldChasePlayer;
        let dest;
        let navGoal = null;
        const lanePoint = laneProjection || null;
        const lanePath = lanePoint && m.lanePath ? m.lanePath : null;
        const laneLength = lanePath
          ? (Number.isFinite(m.laneLength) ? m.laneLength : (Number.isFinite(lanePath.totalLength) ? lanePath.totalLength : undefined))
          : undefined;
        const offLaneDistance = lanePoint ? (Number.isFinite(m.offLaneDistance) ? m.offLaneDistance : (Number.isFinite(lanePoint.dist) ? lanePoint.dist : 0)) : 0;
        const onLaneTolerance = Math.max(minionRadius * 0.5, laneFanSpacing * 0.3);
        let followLane = false;
        let laneDestX = null;
        let laneDestY = null;

        if(laneFree){
          dest = m.to;
          navGoal = m.to;
          if(lanePath && lanePoint && lanePoint.point){
            const priorProgress = Number.isFinite(m.laneProgress) ? m.laneProgress : lanePoint.distance;
            const baseProgress = Math.max(priorProgress, lanePoint.distance);
            let lookAhead = Math.max(minionDiameter, (Number.isFinite(laneLength) ? Math.min(laneLength * 0.08, 80) : 40));
            if(offLaneDistance > onLaneTolerance){
              lookAhead = Math.max(minionDiameter * 0.75, laneFanSpacing);
            }
            let targetDistance = baseProgress + lookAhead;
            if(Number.isFinite(laneLength)){
              targetDistance = Math.min(laneLength, targetDistance);
            }
            const aheadPoint = offLaneDistance > onLaneTolerance
              ? lanePoint
              : (lanePointAtDistance(lanePath, targetDistance) || lanePoint);
            laneDestX = aheadPoint.point.x;
            laneDestY = aheadPoint.point.y;
            m.laneProgress = Math.max(baseProgress, aheadPoint.distance ?? baseProgress);
            followLane = true;
            navGoal = null;
            dest = { x: laneDestX, y: laneDestY };
          }
        } else if(chasingPlayer){
          dest = player;
          navGoal = { x: player.x, y: player.y };
        } else if(targetMinion){
          dest = targetMinion;
        } else if(m.neutralPoint){
          dest = m.neutralPoint;
          navGoal = m.neutralPoint;
        } else {
          dest = m.to;
        }
        let navWaypoint = null;
        let usingNav = false;
        if(navGoal){
          navWaypoint = ensureNavForEntity(m, navGoal, minionRadius);
          usingNav = !!navWaypoint;
        } else if(m.nav){
          clearEntityNav(m);
        }
        let destX = dest ? dest.x : m.to.x;
        let destY = dest ? dest.y : m.to.y;
        if(followLane && laneDestX !== null && laneDestY !== null){
          destX = laneDestX;
          destY = laneDestY;
          if(usingNav){
            clearEntityNav(m);
            navWaypoint = null;
            usingNav = false;
          }
        }
        const rawDx = destX - m.x;
        const rawDy = destY - m.y;
        let moveX = usingNav && navWaypoint ? (navWaypoint.x - m.x) : rawDx;
        let moveY = usingNav && navWaypoint ? (navWaypoint.y - m.y) : rawDy;
        let speed = MINION_SPEED;
        if(m.slowTimer > 0 && m.slowPct > 0){
          const slowFactor = Math.max(0, 1 - Math.min(1, m.slowPct));
          speed *= slowFactor;
        }
        if(laneFree && m.inPortalZone){
          const t = Math.max(0, Math.min(1, 1 - (dToPortal/PORTAL_INTAKE_R)));
          speed *= (1 + PORTAL_SUCTION * t);
        }
        if(!usingNav){
          if(lanePoint){
            const shouldFan = !laneFree && (!!targetMinion || chasingPlayer);
            const neutralProj = typeof m.neutralProj === 'number' ? m.neutralProj : (m.laneLength || 0) * 0.5;
            const distFromNeutral = Math.abs(lanePoint.distance - neutralProj);
            const neutralBlend = smoothstep01(distFromNeutral / (laneFanSpacing * 1.75));
            const livelyOffset = shouldFan ? m.fanOffset : 0;
            const desiredOffset = livelyOffset * neutralBlend;
            if(lanePoint.point && Number.isFinite(lanePoint.normalX) && Number.isFinite(lanePoint.normalY)){
              const desiredX = lanePoint.point.x + lanePoint.normalX * desiredOffset;
              const desiredY = lanePoint.point.y + lanePoint.normalY * desiredOffset;
              const lateralX = m.x - desiredX;
              const lateralY = m.y - desiredY;
              const neutralPull = (1 - neutralBlend) * 0.45;
              const pull = (shouldFan ? 0.4 : 0.22) + neutralPull;
              moveX -= lateralX * pull;
              moveY -= lateralY * pull;
            }
            const forwardBias = shouldFan ? 0.06 : 0.16;
            const rawLen = Math.hypot(rawDx, rawDy) || 1;
            moveX += lanePoint.dirX * rawLen * forwardBias;
            moveY += lanePoint.dirY * rawLen * forwardBias;
          } else if(m.spawn && m.laneDir){
            const relX = m.x - m.spawn.x;
            const relY = m.y - m.spawn.y;
            const proj = relX * m.laneDir.x + relY * m.laneDir.y;
            const baseLaneX = m.spawn.x + m.laneDir.x * proj;
            const baseLaneY = m.spawn.y + m.laneDir.y * proj;
            const shouldFan = !laneFree && (!!targetMinion || chasingPlayer);
            const neutralProj = typeof m.neutralProj === 'number' ? m.neutralProj : (m.laneLength || 0) * 0.5;
            const distFromNeutral = Math.abs(proj - neutralProj);
            const neutralBlend = smoothstep01(distFromNeutral / (laneFanSpacing * 1.75));
            const livelyOffset = shouldFan && m.laneNormal ? m.fanOffset : 0;
            const desiredOffset = livelyOffset * neutralBlend;
            if(m.laneNormal){
              const desiredX = baseLaneX + m.laneNormal.x * desiredOffset;
              const desiredY = baseLaneY + m.laneNormal.y * desiredOffset;
              const lateralX = m.x - desiredX;
              const lateralY = m.y - desiredY;
              const neutralPull = (1 - neutralBlend) * 0.45;
              const pull = (shouldFan ? 0.4 : 0.22) + neutralPull;
              moveX -= lateralX * pull;
              moveY -= lateralY * pull;
            }
            const forwardBias = shouldFan ? 0.06 : 0.16;
            const rawLen = Math.hypot(rawDx, rawDy) || 1;
            moveX += m.laneDir.x * rawLen * forwardBias;
            moveY += m.laneDir.y * rawLen * forwardBias;
          }
        }
        let step = speed * dt;
        let moveLen = Math.hypot(moveX, moveY);
        if(moveLen === 0){ moveLen = 1; }
        const nx = moveX / moveLen;
        const ny = moveY / moveLen;

        if(targetMinion && angleToTarget !== null){
          const tx = targetMinion.x - m.x;
          const ty = targetMinion.y - m.y;
          const distToEnemy = best;
          const dot = distToEnemy ? (tx*nx + ty*ny) / distToEnemy : 0;
          if(dot > 0.5){
            const buffer = minionDiameter;
            const maxAdvance = distToEnemy - buffer;
            if(maxAdvance <= 0){
              step = 0;
            } else {
              step = Math.min(step, maxAdvance);
            }
            facing = blendAngles(angleToTarget, laneFacing, 0.35);
          }
        } else if(chasingPlayer && angleToPlayer !== null){
          const tx = player.x - m.x;
          const ty = player.y - m.y;
          const distToPlayer = playerDistance;
          const dot = distToPlayer ? (tx*nx + ty*ny) / distToPlayer : 0;
          if(dot > 0.5){
            const buffer = minionRadius + playerRadius;
            const maxAdvance = distToPlayer - buffer;
            if(maxAdvance <= 0){
              step = 0;
            } else {
              step = Math.min(step, maxAdvance);
            }
            facing = blendAngles(angleToPlayer, laneFacing, 0.35);
          }
        }

        if(step>0){
          let moveVecX = nx * step;
          let moveVecY = ny * step;
          if(laneProjection){
            const lanePath = m.lanePath || null;
            const forwardUnit = nx * laneProjection.dirX + ny * laneProjection.dirY;
            const latX = nx - forwardUnit * laneProjection.dirX;
            const latY = ny - forwardUnit * laneProjection.dirY;
            const latLen = Math.hypot(latX, latY);
            let forwardStep = step * forwardUnit;
            if(enemyPresence && forwardStep > 0){
              const proj = laneProjection.distance;
              const laneLength = m.laneLength || (lanePath ? lanePath.totalLength : Math.hypot(m.to.x - m.spawn.x, m.to.y - m.spawn.y) || 1);
              const baseLimit = Math.min(laneLength, m.offsideLimit ?? laneLength * OFFSIDE_FRACTION);
              let maxProj = baseLimit;
              if(targetMinion && lanePath){
                const targetProj = projectPointOntoLane(lanePath, targetMinion.x, targetMinion.y);
                if(targetProj && targetProj.distance >= proj){
                  const chaseLimit = Math.min(laneLength, targetProj.distance - minionDiameter);
                  maxProj = Math.max(proj, chaseLimit);
                }
              } else if(chasingPlayer && lanePath){
                const playerProj = projectPointOntoLane(lanePath, player.x, player.y);
                if(playerProj && playerProj.distance >= proj){
                  const chaseLimit = Math.min(laneLength, playerProj.distance - (minionDiameter + playerRadius));
                  maxProj = Math.max(proj, chaseLimit);
                }
              }
              const nextProj = proj + forwardStep;
              if(nextProj > maxProj){
                forwardStep = Math.max(0, maxProj - proj);
              }
            }
            moveVecX = laneProjection.dirX * forwardStep;
            moveVecY = laneProjection.dirY * forwardStep;
            if(latLen > 1e-6){
              const latStep = step * latLen;
              const normLatX = latX / latLen;
              const normLatY = latY / latLen;
              moveVecX += normLatX * latStep;
              moveVecY += normLatY * latStep;
            }
          } else if(m.spawn && m.laneDir){
            const forwardUnit = nx * m.laneDir.x + ny * m.laneDir.y;
            const latX = nx - forwardUnit * m.laneDir.x;
            const latY = ny - forwardUnit * m.laneDir.y;
            const latLen = Math.hypot(latX, latY);
            let forwardStep = step * forwardUnit;
            if(enemyPresence && forwardStep > 0){
              const relX = m.x - m.spawn.x;
              const relY = m.y - m.spawn.y;
              const proj = relX * m.laneDir.x + relY * m.laneDir.y;
              const laneLength = m.laneLength || Math.hypot(m.to.x - m.spawn.x, m.to.y - m.spawn.y) || 1;
              const baseLimit = Math.min(laneLength, m.offsideLimit ?? laneLength * OFFSIDE_FRACTION);
              let maxProj = baseLimit;
              if(targetMinion){
                const tx = targetMinion.x - m.spawn.x;
                const ty = targetMinion.y - m.spawn.y;
                const targetProj = tx * m.laneDir.x + ty * m.laneDir.y;
                if(Number.isFinite(targetProj) && targetProj >= proj){
                  const chaseLimit = Math.min(laneLength, targetProj - minionDiameter);
                  maxProj = Math.max(proj, chaseLimit);
                }
              } else if(chasingPlayer){
                const px = player.x - m.spawn.x;
                const py = player.y - m.spawn.y;
                const playerProj = px * m.laneDir.x + py * m.laneDir.y;
                if(Number.isFinite(playerProj) && playerProj >= proj){
                  const chaseLimit = Math.min(laneLength, playerProj - (minionDiameter + playerRadius));
                  maxProj = Math.max(proj, chaseLimit);
                }
              }
              const nextProj = proj + forwardStep;
              if(nextProj > maxProj){
                forwardStep = Math.max(0, maxProj - proj);
              }
            }
            moveVecX = m.laneDir.x * forwardStep;
            moveVecY = m.laneDir.y * forwardStep;
            if(latLen > 1e-6){
              const latStep = step * latLen;
              const normLatX = latX / latLen;
              const normLatY = latY / latLen;
              moveVecX += normLatX * latStep;
              moveVecY += normLatY * latStep;
            }
          }
          const baseMoveMag = Math.hypot(moveVecX, moveVecY);
          if(baseMoveMag > 0){
            let desiredMoveX = moveVecX;
            let desiredMoveY = moveVecY;
            if(laneFree || (!targetMinion && !chasingPlayer)){
              if(dToPortal <= baseMoveMag){
                desiredMoveX = m.to.x - m.x;
                desiredMoveY = m.to.y - m.y;
              }
            }
            const prevX = m.x;
            const prevY = m.y;
            const moved = moveCircleWithCollision(m.x, m.y, desiredMoveX, desiredMoveY, minionRadius);
            m.x = moved.x;
            m.y = moved.y;
            const actualMoveX = m.x - prevX;
            const actualMoveY = m.y - prevY;
            const actualMag = Math.hypot(actualMoveX, actualMoveY);
            if(actualMag > 0){
              const moveAngle = Math.atan2(actualMoveY, actualMoveX);
              const moveBlend = enemyPresence ? 0.3 : 0.65;
              facing = blendAngles(moveAngle, laneFacing, moveBlend);
            } else if(usingNav){
              clearEntityNav(m);
            }
          }
        }
      }

      m.x = Math.max(minionRadius, Math.min(mapState.width - minionRadius, m.x));
      m.y = Math.max(minionRadius, Math.min(mapState.height - minionRadius, m.y));
      m.facing = facing;
    }

    // spacing (relaxed near portal)
    resolveOverlaps(3);
    resolvePlayerMinionSeparation(2);

    // player move
    let playerWaypoint = null;
    if(!isPlayerCasting && !isPlayerMovementLocked && player.navGoal && hitboxActive()){
      playerWaypoint = ensureNavForEntity(player, player.navGoal, player.r);
    } else if(!hitboxActive()){
      clearEntityNav(player);
    }
    let moveTargetX = player.target.x;
    let moveTargetY = player.target.y;
    if(playerWaypoint){
      moveTargetX = playerWaypoint.x;
      moveTargetY = playerWaypoint.y;
    }
    const dx = moveTargetX - player.x;
    const dy = moveTargetY - player.y;
    const dist = Math.hypot(dx,dy);
    if(!isPlayerCasting && !isPlayerMovementLocked && dist>0.5){
      const step = Math.min(dist, player.speed * movementMultiplier * dt);
      const moveX = dx/dist * step;
      const moveY = dy/dist * step;
      const moved = moveCircleWithCollision(player.x, player.y, moveX, moveY, player.r);
      const actualMoveX = moved.x - player.x;
      const actualMoveY = moved.y - player.y;
      const actualDist = Math.hypot(actualMoveX, actualMoveY);
      player.x = moved.x;
      player.y = moved.y;
      if(actualDist < 0.1 && playerWaypoint){
        clearEntityNav(player);
      }
    }
    if(!isPlayerCasting){
      const remainingToGoal = Math.hypot(player.target.x - player.x, player.target.y - player.y);
      if(remainingToGoal <= Math.max(0.5, player.r * 0.6)){
        player.navGoal = null;
        player.nav = null;
      }
    }
    player.x = Math.max(player.r, Math.min(mapState.width - player.r, player.x));
    player.y = Math.max(player.r, Math.min(mapState.height - player.r, player.y));
    resolvePlayerMinionSeparation(1);
    positionPlayerFloatingHud();
    positionPracticeDummyHud();
    positionMonsterHud();
    if(dt > 0){
      lastPlayerVelocityX = (player.x - prevPlayerX) / dt;
      lastPlayerVelocityY = (player.y - prevPlayerY) / dt;
      camera.lastPlayerVelocity.x = lastPlayerVelocityX;
      camera.lastPlayerVelocity.y = lastPlayerVelocityY;
    } else {
      lastPlayerVelocityX = 0;
      lastPlayerVelocityY = 0;
      camera.lastPlayerVelocity.x = lastPlayerVelocityX;
      camera.lastPlayerVelocity.y = lastPlayerVelocityY;
    }
    applyEdgeScroll(dt);
    updateCamera(true, dt);
    const playerMoveDuringFrame = Math.hypot(player.x - prevPlayerX, player.y - prevPlayerY);
    if(player.attackWindup > 0 && playerMoveDuringFrame > 0.5){
      cancelPlayerAttack();
    }
    updatePlayerAutoAttack(dt);
    updatePlayerAnimationFromGameplay(dt);
    updateAbilityCooldowns(dt);
    updateArcaneRiteModes(dt);
    updateArcaneRiteExplosions(dt);
    updateSlamCasts(dt);
    updateSlamFissures(dt);
    updateSlamIceFields(dt);
    updateSlamImpacts(dt);
    updateBeamCasts(dt);
    updateLaserConeCasts(dt);
    updateGrabCasts(dt);
    updatePiercingArrowCasts(dt);
    updatePlasmaFissionCasts(dt);
    updateChargingGaleCasts(dt);
    updateCullingBarrageChannels(dt);
    updateFlameChomperTraps(dt);
    updateLaserProjectiles(dt);
    updateBlinkingBoltProjectiles(dt);
    updatePiercingArrowProjectiles(dt);
    updatePlasmaFissionProjectiles(dt);
    updateChargingGaleProjectiles(dt);
    updateCullingBarrageProjectiles(dt);
    updateProjectiles(dt);
    updateBeams(dt);
    updateHitSplats(dt);
    updatePings(dt);
    for(let i=minions.length-1;i>=0;i--){ if(minions[i].hp<=0) minions.splice(i,1); }

    // draw
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, camera.baseWidth, camera.baseHeight);
    const cameraScale = Math.max(0.001, Number(camera.scale) || 1);
    ctx.setTransform(cameraScale, 0, 0, cameraScale, -camera.x * cameraScale, -camera.y * cameraScale);

    drawBaseZones();
    drawColliders();
    drawSlamIceFields();
    drawSlamFissures();
    drawSlamImpacts();
    drawCullingBarrageChannels();
    drawArcaneRiteTelegraphs();
    drawArcaneRiteModeIndicators();
    drawFlameChomperTraps();

    // pulses
    for(let i=pulses.length-1;i>=0;i--){
      const p=pulses[i];
      p.t+=dt;
      const progress = Math.max(0, Math.min(1, p.t));
      const startRadius = Number.isFinite(p.startRadius) ? Math.max(0, p.startRadius) : 12;
      const endRadiusCandidate = Number.isFinite(p.endRadius) ? Math.max(0, p.endRadius) : (startRadius + 40);
      const endRadius = Math.max(startRadius, endRadiusCandidate);
      if(!circleInCamera(p.x, p.y, endRadius + 8)){
        if(p.t>=1) pulses.splice(i,1);
        continue;
      }
      const radius = startRadius + (endRadius - startRadius) * progress;
      const alpha = 1 - progress;
      const color = (typeof p.color === 'string' && p.color.trim()) ? p.color : '#7fe3ff';
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if(p.t>=1) pulses.splice(i,1);
    }

    // spawns + portals
    portalState.spin += dt*2.5;
    function drawSpawnAndPortal(s,color,label){
      if(!circleInCamera(s.x, s.y, PORTAL_R + 32)) return;
      ctx.save(); ctx.translate(s.x,s.y);
      // diamond marker
      ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(12,0); ctx.lineTo(0,12); ctx.lineTo(-12,0); ctx.closePath();
      ctx.fillStyle=color; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#05121a'; ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='bold 11px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,0,0);
      // portal ring
      ctx.rotate(portalState.spin);
      for(let k=0;k<2;k++){
        ctx.beginPath();
        ctx.lineWidth = 3-k;
        ctx.strokeStyle = k ? '#7fe3ff66' : '#7fe3ff';
        ctx.arc(0,0,PORTAL_R + k*3, k?Math.PI*0.2:0, k?Math.PI*1.6:Math.PI*1.2);
        ctx.stroke();
      }
      ctx.restore();
    }
    const lanePlanForDraw = ensureLaneLayout();
    if(lanePlanForDraw && lanePlanForDraw.lanes.length){
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#32d97c';
      ctx.lineCap = 'round';
      const laneTotal = lanePlanForDraw.lanes.length;
      const baseRadius = Math.max(12, 20 - Math.max(0, laneTotal - 1));
      for(const lane of lanePlanForDraw.lanes){
        const start = lane.bluePath.from;
        const end = lane.bluePath.to;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(lane.control.x, lane.control.y, end.x, end.y);
        ctx.stroke();

        const radius = baseRadius;
        ctx.beginPath();
        ctx.arc(lane.middle.x, lane.middle.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#164d2c';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#32d97c';
        ctx.stroke();
        ctx.fillStyle = '#d7ffde';
        ctx.font = `bold ${Math.max(12, radius + 2)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lane.label, lane.middle.x, lane.middle.y + 1);
      }
      ctx.restore();
    } else if(blueSpawns[0] && redSpawns[0]){
      const b = blueSpawns[0];
      const r = redSpawns[0];
      const midX = (b.x + r.x) / 2;
      const midY = (b.y + r.y) / 2;
      const dx = r.x - b.x;
      const dy = r.y - b.y;
      const laneLen = Math.hypot(dx, dy) || 1;
      const dirX = dx / laneLen;
      const dirY = dy / laneLen;
      const normX = -dirY;
      const normY = dirX;
      const mainHalf = laneLen / 2;
      const barHalf = Math.max(28, Math.min(laneLen * 0.3, 88));
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#32d97c';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(midX - dirX * mainHalf, midY - dirY * mainHalf);
      ctx.lineTo(midX + dirX * mainHalf, midY + dirY * mainHalf);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX - normX * barHalf, midY - normY * barHalf);
      ctx.lineTo(midX + normX * barHalf, midY + normY * barHalf);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(midX, midY, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#164d2c';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#32d97c';
      ctx.stroke();
      ctx.fillStyle = '#d7ffde';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('M', midX, midY + 1);
      ctx.restore();
    }
    if(blueSpawns[0]) drawSpawnAndPortal(blueSpawns[0],'#2aa9ff','B');
    if(redSpawns[0])  drawSpawnAndPortal(redSpawns[0],'#ff5577','R');

    drawMonster();

    // MINIONS (finally rendered)
    for(const m of minions){
      if(!m) continue;
      if(m.isPracticeDummy && (m.active === false || (m.respawnTimer > 0) || !(Number(m.hp) > 0))){
        continue;
      }
      if(!circleInCamera(m.x, m.y, minionRadius + 32)) continue;
      if(!pointInVision(m.x, m.y, minionRadius)) continue;
      drawMinion(m);
    }

    drawSlamCasts();
    drawBeamCasts();
    drawLaserConeCasts();
    drawPiercingArrowCasts();
    drawGrabCasts();
    drawBeams();

    // LASER ABILITIES
    drawLaserProjectiles();
    drawBlinkingBoltProjectiles();
    drawPiercingArrowProjectiles();
    drawPlasmaFissionProjectiles();
    drawChargingGaleProjectiles();
    drawCullingBarrageProjectiles();

    drawChargingGaleChargePreviews();
    drawSkillshotIndicator();

    // PROJECTILES
    drawProjectiles();
    drawPings();
    drawPingWheel();
    drawHoverHighlight();

    drawVisionDummy();
    // PLAYER
    if(playerRuntime.model){
      playerRuntime.model.setPosition(player.x, player.y + player.r, player.r);
      playerRuntime.model.update(dt);
    }
    drawPlayer();

    // DAMAGE NUMBERS
    drawHitSplats();

    drawFogOfWar();
    drawVisionShapes();

    renderMinimap();

    requestAnimationFrame(tick);
  }

  if(typeof window !== 'undefined'){
    window.exportGameState = exportGameState;
    window.importGameState = importGameState;
    window.playerShopBuy = shopBuy;
    window.playerShopSell = shopSell;
    window.playerShopUndo = shopUndo;
    window.toggleRecall = toggleRecall;
    window.canPlayerShop = canPlayerShop;
  }

  // CSS vars init + UI initialize
  setVars();
  ensureDefaultSpawns(true);
  updateScoreUI();
  playGame();
  requestAnimationFrame(tick);
})();