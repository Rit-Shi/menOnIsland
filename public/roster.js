export function rosterNames(game) {
  return { P0: '玩家', P1: 'P1', P2: 'P2', P3: 'P3', ...Object.fromEntries((game?.players || []).map(p => [p.id, p.name])), SYSTEM: '岛屿广播' };
}

export function personaLabel(player) {
  return player?.code_name || '独立Agent';
}
