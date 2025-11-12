export const PLAYER_STATUS_DEFS = [
  { id: 'stunned', label: 'Stunned', timerKey: 'stunTimer', defaultEmoji: '', defaultColor: '#ffd966' },
  { id: 'slowed', label: 'Slowed', timerKey: 'slowTimer', defaultEmoji: '', defaultColor: '#9ad0ff' },
  { id: 'taunted', label: 'Taunted', timerKey: 'tauntTimer', defaultEmoji: '', defaultColor: '#ff8c8c' },
  { id: 'hasted', label: 'Hasted', timerKey: 'hasteTimer', defaultEmoji: '', defaultColor: '#ffd27f' },
  { id: 'recalling', label: 'Recalling', timerKey: 'recallTimer', defaultEmoji: '', defaultColor: '#7fe3ff' },
  { id: 'homeguard', label: 'Homeguard', timerKey: 'homeguardTimer', defaultEmoji: '', defaultColor: '#4ade80' },
  { id: 'invulnerable', label: 'Invulnerable', timerKey: 'baseInvulnTimer', defaultEmoji: '', defaultColor: '#facc15' }
];

export function buildDefaultPlayerStatusConfig(){
  const config = {};
  for(const def of PLAYER_STATUS_DEFS){
    config[def.id] = { emoji: def.defaultEmoji, color: def.defaultColor };
  }
  return config;
}

export const PRAYER_DEFS = [
  { id: 'green', label: 'Green Protection', defaultBinding: { key: '1', code: 'Digit1' } },
  { id: 'blue', label: 'Blue Protection', defaultBinding: { key: '2', code: 'Digit2' } },
  { id: 'red', label: 'Red Protection', defaultBinding: { key: '3', code: 'Digit3' } }
];

export const MONSTER_ABILITY_IDS = PRAYER_DEFS.map(def => def.id);

export const DEFAULT_MONSTER_ICONS = { green: '', blue: '', red: '' };

export const MONSTER_SLOT_MACHINE_COLUMNS = 1;
export const MONSTER_SLOT_MACHINE_DEFAULT_SPIN_DURATION = 1.2;
export const MONSTER_SLOT_MACHINE_DEFAULT_REVEAL_DURATION = 0.6;
export const MONSTER_SLOT_MACHINE_SPIN_REFRESH = 0.08;
export const MONSTER_SLOT_MACHINE_IDLE_REFRESH = 0.4;
