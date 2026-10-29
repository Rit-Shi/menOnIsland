import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrateGame } from './migrations.js';

export class GameStore {
  constructor(directory) { this.directory = directory; this.cache = new Map(); this.queues = new Map(); this.loads = new Map(); }
  filename(id) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('invalid_game_id');
    return join(this.directory, `${id}.json`);
  }
  async load(id) {
    if (!this.cache.has(id)) {
      if (!this.loads.has(id)) {
        const loading = this.loadFromDisk(id).finally(() => { this.loads.delete(id); });
        this.loads.set(id, loading);
      }
      await this.loads.get(id);
    }
    return this.cache.has(id) ? structuredClone(this.cache.get(id)) : null;
  }
  async loadFromDisk(id) {
    let raw;
    try { raw = await readFile(this.filename(id), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const game = JSON.parse(raw);
    if (migrateGame(game)) {
      const backupDirectory = join(this.directory, 'backups', 'integer-gold');
      await mkdir(backupDirectory, { recursive: true });
      try { await writeFile(join(backupDirectory, `${id}.json`), raw, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      await this.save(game);
    } else {
      this.cache.set(id, game);
    }
  }
  async save(game) {
    await mkdir(this.directory, { recursive: true });
    const destination = this.filename(game.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(game), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, destination);
    this.cache.set(game.id, structuredClone(game));
  }
  async transact(id, operation) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const game = await this.load(id);
      if (!game) return null;
      const result = await operation(game);
      await this.save(game);
      return result ?? structuredClone(game);
    });
    this.queues.set(id, next);
    try { return await next; }
    finally { if (this.queues.get(id) === next) this.queues.delete(id); }
  }
}
