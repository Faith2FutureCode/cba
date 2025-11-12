export function formatAbilityKeyLabel(key, code){
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
