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
  user_id: string | null;
  status: string;
}

export interface KeyMetadata {
  key_prefix: string;
  label: string;
  connector_id: string;
  created_at: string;
  last_used: string | null;
  usage_count: number;
  user_id: string | null;
  status: string;
}

export interface UserRow {
  firebase_uid: string;
  email: string;
  display_name: string | null;
  stripe_customer_id: string | null;
  subscription_status: string;
  subscription_id: string | null;
  current_period_end: string | null;
  is_admin: number;
  created_at: string;
  updated_at: string;
}

export class KeyDB {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'keys.db');
    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initTables();
    this.migrate();
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

      CREATE TABLE IF NOT EXISTS users (
        firebase_uid TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        display_name TEXT,
        stripe_customer_id TEXT UNIQUE,
        subscription_status TEXT DEFAULT 'none',
        subscription_id TEXT,
        current_period_end TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // Safe migration: check column existence before ALTER TABLE
  private migrate(): void {
    const cols = this.db.pragma('table_info(keys)') as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));

    if (!colNames.has('user_id')) {
      this.db.exec("ALTER TABLE keys ADD COLUMN user_id TEXT REFERENCES users(firebase_uid)");
    }
    if (!colNames.has('status')) {
      this.db.exec("ALTER TABLE keys ADD COLUMN status TEXT DEFAULT 'active'");
    }

    // Ensure indices exist
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_keys_user_id ON keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);
    `);
  }

  // ─── Key Operations ─────────────────────────────────────────

  // Store a new key entry (legacy: no user_id)
  register(
    keyHash: string,
    keyPrefix: string,
    label: string,
    connectorId: string,
    encryptedData: { ciphertext: string; iv: string; tag: string }
  ): void {
    this.db.prepare(`
      INSERT INTO keys (key_hash, key_prefix, label, connector_id,
        credentials_encrypted, credentials_iv, credentials_tag, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      keyHash, keyPrefix, label, connectorId,
      encryptedData.ciphertext, encryptedData.iv, encryptedData.tag,
      new Date().toISOString()
    );
  }

  // Store a new key entry with user ownership
  registerWithUser(
    keyHash: string,
    keyPrefix: string,
    label: string,
    connectorId: string,
    encryptedData: { ciphertext: string; iv: string; tag: string },
    userId: string
  ): void {
    this.db.prepare(`
      INSERT INTO keys (key_hash, key_prefix, label, connector_id,
        credentials_encrypted, credentials_iv, credentials_tag, created_at, user_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      keyHash, keyPrefix, label, connectorId,
      encryptedData.ciphertext, encryptedData.iv, encryptedData.tag,
      new Date().toISOString(), userId
    );
  }

  // Look up a key by hash, check server access and status, update usage stats
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
      "SELECT * FROM keys WHERE key_hash = ? AND revoked = 0 AND (status = 'active' OR status IS NULL)"
    ).get(keyHash) as KeyRow | undefined;

    if (!row) return null;

    if (!isServerAllowed(row.connector_id, serverId)) {
      return null;
    }

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
      this.db.prepare(`
        INSERT INTO keys (key_hash, key_prefix, label, connector_id,
          credentials_encrypted, credentials_iv, credentials_tag, created_at, user_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newKeyHash, newKeyPrefix, row.label, row.connector_id,
        row.credentials_encrypted, row.credentials_iv, row.credentials_tag,
        new Date().toISOString(), row.user_id, row.status || 'active'
      );
      this.db.prepare('UPDATE keys SET revoked = 1 WHERE key_hash = ?').run(oldKeyHash);
    });

    txn();
    return true;
  }

  // Get a key's owner (for ownership verification)
  getKeyOwner(keyHash: string): string | null {
    const row = this.db.prepare(
      'SELECT user_id FROM keys WHERE key_hash = ? AND revoked = 0'
    ).get(keyHash) as { user_id: string | null } | undefined;
    return row?.user_id ?? null;
  }

  // List all active keys (metadata only, no credentials)
  listKeys(): KeyMetadata[] {
    return this.db.prepare(
      'SELECT key_prefix, label, connector_id, created_at, last_used, usage_count, user_id, status FROM keys WHERE revoked = 0 ORDER BY created_at DESC'
    ).all() as KeyMetadata[];
  }

  // List keys belonging to a specific user
  listKeysByUser(userId: string): KeyMetadata[] {
    return this.db.prepare(
      'SELECT key_prefix, label, connector_id, created_at, last_used, usage_count, user_id, status FROM keys WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC'
    ).all(userId) as KeyMetadata[];
  }

  // Revoke a key by exact prefix match
  revoke(prefix: string): boolean {
    const result = this.db.prepare(
      'UPDATE keys SET revoked = 1 WHERE key_prefix = ? AND revoked = 0'
    ).run(prefix);
    return result.changes > 0;
  }

  // Revoke a key by prefix, but only if owned by this user
  revokeByUser(prefix: string, userId: string): boolean {
    const result = this.db.prepare(
      'UPDATE keys SET revoked = 1 WHERE key_prefix = ? AND user_id = ? AND revoked = 0'
    ).run(prefix, userId);
    return result.changes > 0;
  }

  // Claim a legacy key (set user_id on a key that has no owner)
  claimKey(keyHash: string, userId: string): boolean {
    const result = this.db.prepare(
      'UPDATE keys SET user_id = ? WHERE key_hash = ? AND user_id IS NULL AND revoked = 0'
    ).run(userId, keyHash);
    return result.changes > 0;
  }

  // Suspend all keys for a user (subscription lapsed)
  suspendKeysByUser(userId: string): number {
    const result = this.db.prepare(
      "UPDATE keys SET status = 'suspended' WHERE user_id = ? AND revoked = 0 AND status = 'active'"
    ).run(userId);
    return result.changes;
  }

  // Reactivate all keys for a user (subscription restored)
  reactivateKeysByUser(userId: string): number {
    const result = this.db.prepare(
      "UPDATE keys SET status = 'active' WHERE user_id = ? AND revoked = 0 AND status = 'suspended'"
    ).run(userId);
    return result.changes;
  }

  // Service stats
  getStats(): {
    totalKeys: number;
    totalRevoked: number;
    totalValidations: number;
    totalUsers: number;
    byConnector: Record<string, number>;
  } {
    const totalKeys = (this.db.prepare('SELECT COUNT(*) as count FROM keys WHERE revoked = 0').get() as { count: number }).count;
    const totalRevoked = (this.db.prepare('SELECT COUNT(*) as count FROM keys WHERE revoked = 1').get() as { count: number }).count;
    const totalValidations = (this.db.prepare('SELECT COALESCE(SUM(usage_count), 0) as total FROM keys').get() as { total: number }).total;
    const totalUsers = (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

    const connectorRows = this.db.prepare(
      'SELECT connector_id, COUNT(*) as count FROM keys WHERE revoked = 0 GROUP BY connector_id'
    ).all() as { connector_id: string; count: number }[];

    const byConnector: Record<string, number> = {};
    for (const row of connectorRows) {
      byConnector[row.connector_id] = row.count;
    }

    return { totalKeys, totalRevoked, totalValidations, totalUsers, byConnector };
  }

  // ─── User Operations ────────────────────────────────────────

  createUser(uid: string, email: string, displayName: string | null): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (firebase_uid, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(firebase_uid) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).run(uid, email, displayName, now, now);
  }

  getUser(uid: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(uid) as UserRow) || null;
  }

  getUserByStripeCustomer(stripeCustomerId: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(stripeCustomerId) as UserRow) || null;
  }

  updateUserStripe(
    uid: string,
    stripeCustomerId: string,
    subscriptionStatus: string,
    subscriptionId: string | null,
    currentPeriodEnd: string | null
  ): void {
    this.db.prepare(`
      UPDATE users SET
        stripe_customer_id = ?,
        subscription_status = ?,
        subscription_id = ?,
        current_period_end = ?,
        updated_at = ?
      WHERE firebase_uid = ?
    `).run(stripeCustomerId, subscriptionStatus, subscriptionId, currentPeriodEnd, new Date().toISOString(), uid);
  }

  setUserAdmin(uid: string, isAdmin: boolean): void {
    this.db.prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE firebase_uid = ?')
      .run(isAdmin ? 1 : 0, new Date().toISOString(), uid);
  }

  listUsers(): UserRow[] {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
  }

  // ─── Audit ──────────────────────────────────────────────────

  logEvent(event: string, keyPrefix: string | null, serverId: string | null, ip: string | null): void {
    this.db.prepare(
      'INSERT INTO audit_log (event, key_prefix, server_id, ip, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(event, keyPrefix, serverId, ip, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}
