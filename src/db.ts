import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { isServerAllowed } from './connectors.js';

export interface KeyRow {
  key_hash: string;
  key_prefix: string;
  label: string;
  connector_id: string;
  credentials_encrypted: string;
  credentials_iv: string;
  credentials_tag: string;
  created_at: string;
  last_used: string | null;
  usage_count: number;
  revoked: number;
}

export interface KeyMetadata {
  key_prefix: string;
  label: string;
  connector_id: string;
  created_at: string;
  last_used: string | null;
  usage_count: number;
}

export class KeyDB {
  private db: Database.Database;

  constructor(dataDir: string) {
    // Ensure data directory exists
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'keys.db');
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        key_hash TEXT PRIMARY KEY,
        key_prefix TEXT NOT NULL,
        label TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        credentials_encrypted TEXT NOT NULL,
        credentials_iv TEXT NOT NULL,
        credentials_tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used TEXT,
        usage_count INTEGER DEFAULT 0,
        revoked INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        key_prefix TEXT,
        server_id TEXT,
        ip TEXT,
        timestamp TEXT NOT NULL
      );
    `);
  }

  // Store a new key entry
  register(
    keyHash: string,
    keyPrefix: string,
    label: string,
    connectorId: string,
    encryptedData: { ciphertext: string; iv: string; tag: string }
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO keys (key_hash, key_prefix, label, connector_id,
        credentials_encrypted, credentials_iv, credentials_tag, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      keyHash,
      keyPrefix,
      label,
      connectorId,
      encryptedData.ciphertext,
      encryptedData.iv,
      encryptedData.tag,
      new Date().toISOString()
    );
  }

  // Look up a key by hash, check server access, update usage stats
  // Returns the encrypted credential data or null if invalid
  resolve(
    keyHash: string,
    serverId: string
  ): {
    credentials_encrypted: string;
    credentials_iv: string;
    credentials_tag: string;
    connector_id: string;
    label: string;
  } | null {
    const row = this.db.prepare(
      'SELECT * FROM keys WHERE key_hash = ? AND revoked = 0'
    ).get(keyHash) as KeyRow | undefined;

    if (!row) return null;

    // Check if this server is allowed to access this connector's credentials
    if (!isServerAllowed(row.connector_id, serverId)) {
      return null;
    }

    // Update usage stats
    this.db.prepare(
      'UPDATE keys SET last_used = ?, usage_count = usage_count + 1 WHERE key_hash = ?'
    ).run(new Date().toISOString(), keyHash);

    return {
      credentials_encrypted: row.credentials_encrypted,
      credentials_iv: row.credentials_iv,
      credentials_tag: row.credentials_tag,
      connector_id: row.connector_id,
      label: row.label,
    };
  }

  // Rotate: create new key entry with same credentials, revoke old
  rotate(
    oldKeyHash: string,
    newKeyHash: string,
    newKeyPrefix: string
  ): boolean {
    const row = this.db.prepare(
      'SELECT * FROM keys WHERE key_hash = ? AND revoked = 0'
    ).get(oldKeyHash) as KeyRow | undefined;

    if (!row) return false;

    const txn = this.db.transaction(() => {
      // Insert new key with the same encrypted credentials
      this.db.prepare(`
        INSERT INTO keys (key_hash, key_prefix, label, connector_id,
          credentials_encrypted, credentials_iv, credentials_tag, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newKeyHash,
        newKeyPrefix,
        row.label,
        row.connector_id,
        row.credentials_encrypted,
        row.credentials_iv,
        row.credentials_tag,
        new Date().toISOString()
      );

      // Revoke old key
      this.db.prepare('UPDATE keys SET revoked = 1 WHERE key_hash = ?').run(oldKeyHash);
    });

    txn();
    return true;
  }

  // List all active keys (metadata only, no credentials)
  listKeys(): KeyMetadata[] {
    const rows = this.db.prepare(
      'SELECT key_prefix, label, connector_id, created_at, last_used, usage_count FROM keys WHERE revoked = 0 ORDER BY created_at DESC'
    ).all() as KeyMetadata[];
    return rows;
  }

  // Revoke a key by prefix match
  revoke(prefix: string): boolean {
    const result = this.db.prepare(
      'UPDATE keys SET revoked = 1 WHERE key_prefix = ? AND revoked = 0'
    ).run(prefix);
    return result.changes > 0;
  }

  // Service stats
  getStats(): {
    totalKeys: number;
    totalRevoked: number;
    totalValidations: number;
    byConnector: Record<string, number>;
  } {
    const totalKeys = (this.db.prepare('SELECT COUNT(*) as count FROM keys WHERE revoked = 0').get() as { count: number }).count;
    const totalRevoked = (this.db.prepare('SELECT COUNT(*) as count FROM keys WHERE revoked = 1').get() as { count: number }).count;
    const totalValidations = (this.db.prepare('SELECT COALESCE(SUM(usage_count), 0) as total FROM keys').get() as { total: number }).total;

    const connectorRows = this.db.prepare(
      'SELECT connector_id, COUNT(*) as count FROM keys WHERE revoked = 0 GROUP BY connector_id'
    ).all() as { connector_id: string; count: number }[];

    const byConnector: Record<string, number> = {};
    for (const row of connectorRows) {
      byConnector[row.connector_id] = row.count;
    }

    return { totalKeys, totalRevoked, totalValidations, byConnector };
  }

  // Log an audit event
  logEvent(event: string, keyPrefix: string | null, serverId: string | null, ip: string | null): void {
    this.db.prepare(
      'INSERT INTO audit_log (event, key_prefix, server_id, ip, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(event, keyPrefix, serverId, ip, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}
