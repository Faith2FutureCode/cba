import { PRAYER_DEFS } from './constants.js';
import { formatAbilityKeyLabel } from '../utils/formatAbilityKeyLabel.js';

const prayerBindingLookup = new Map();

export function buildDefaultPrayerBindings(){
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

export function rebuildPrayerBindingLookup(state){
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

export function ensurePrayerState(gameState){
  const target = gameState && typeof gameState === 'object' ? gameState : {};
  let state = target.prayers;
  if(!state || typeof state !== 'object'){
    state = { active: null, bindings: buildDefaultPrayerBindings() };
    target.prayers = state;
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

export function getPrayerBindingLookup(){
  return prayerBindingLookup;
}
