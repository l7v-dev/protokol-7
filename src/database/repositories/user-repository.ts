import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type UserRole = 'superadmin' | 'admin' | 'user' | 'service_account' | 'pending';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_APPROVAL' | 'DELETED';

export type UserRecord = {
  id: string;
  tenantId: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  name: string;
  role: UserRole;
  profileImageUrl: string | null;
  status: UserStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  passwordChangedAt: Date;
  preferencesJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateUserInput = {
  id?: string;
  tenantId?: string;
  email: string;
  passwordHash: string;
  name: string;
  role?: UserRole;
  profileImageUrl?: string | null;
  status?: UserStatus;
  preferencesJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
};

type DbUserRow = {
  id: string;
  tenant_id: string;
  email: string;
  email_verified: boolean;
  password_hash: string;
  name: string;
  role: UserRole;
  profile_image_url: string | null;
  status: UserStatus;
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  last_login_ip: string | null;
  password_changed_at: Date;
  preferences_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapRow(row: DbUserRow): UserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    emailVerified: row.email_verified,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    profileImageUrl: row.profile_image_url,
    status: row.status,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    lastLoginIp: row.last_login_ip,
    passwordChangedAt: row.password_changed_at,
    preferencesJson: row.preferences_json || {},
    metadataJson: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export class UserRepository {
  public constructor(private readonly db: Database) {}

  public async ensureTenantExists(tenantId: string = 'tenant_default', name: string = 'Default Organization'): Promise<void> {
    await this.db.query(
      `INSERT INTO tenants (id, name, status)
       VALUES ($1, $2, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [tenantId, name]
    );
  }

  public async countUsers(tenantId?: string): Promise<number> {
    if (tenantId) {
      const res = await this.db.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND status != $2',
        [tenantId, 'DELETED']
      );
      return Number.parseInt(res.rows[0]?.count ?? '0', 10);
    }

    const res = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE status != $1',
      ['DELETED']
    );
    return Number.parseInt(res.rows[0]?.count ?? '0', 10);
  }

  public async create(input: CreateUserInput): Promise<UserRecord> {
    const id = input.id ?? randomUUID();
    const tenantId = input.tenantId ?? 'tenant_default';
    const email = input.email.trim().toLowerCase();
    const role = input.role ?? 'user';
    const status = input.status ?? 'ACTIVE';
    const profileImageUrl = input.profileImageUrl ?? null;
    const preferencesJson = input.preferencesJson ?? {};
    const metadataJson = input.metadataJson ?? {};

    await this.ensureTenantExists(tenantId);

    const query = `
      INSERT INTO users (
        id, tenant_id, email, password_hash, name, role,
        profile_image_url, status, preferences_json, metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const res = await this.db.query<DbUserRow>(query, [
      id,
      tenantId,
      email,
      input.passwordHash,
      input.name.trim(),
      role,
      profileImageUrl,
      status,
      JSON.stringify(preferencesJson),
      JSON.stringify(metadataJson)
    ]);

    const row = res.rows[0];
    if (!row) {
      throw new Error('User creation failed to return row');
    }

    return mapRow(row);
  }

  public async findByEmail(email: string, tenantId?: string): Promise<UserRecord | null> {
    const normalizedEmail = email.trim().toLowerCase();

    if (tenantId) {
      const res = await this.db.query<DbUserRow>(
        'SELECT * FROM users WHERE tenant_id = $1 AND LOWER(email) = $2 AND status != $3 LIMIT 1',
        [tenantId, normalizedEmail, 'DELETED']
      );
      const row = res.rows[0];
      return row ? mapRow(row) : null;
    }

    const res = await this.db.query<DbUserRow>(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND status != $2 LIMIT 1',
      [normalizedEmail, 'DELETED']
    );
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  public async findById(id: string, tenantId?: string): Promise<UserRecord | null> {
    if (tenantId) {
      const res = await this.db.query<DbUserRow>(
        'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND status != $3 LIMIT 1',
        [id, tenantId, 'DELETED']
      );
      const row = res.rows[0];
      return row ? mapRow(row) : null;
    }

    const res = await this.db.query<DbUserRow>(
      'SELECT * FROM users WHERE id = $1 AND status != $2 LIMIT 1',
      [id, 'DELETED']
    );
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  public async recordLoginSuccess(id: string, ip?: string): Promise<void> {
    await this.db.query(
      `UPDATE users
       SET last_login_at = NOW(),
           last_login_ip = $2,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, ip ?? null]
    );
  }

  public async recordLoginFailure(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts >= 5 THEN NOW() + INTERVAL '15 minutes'
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  public async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db.query(
      `UPDATE users
       SET password_hash = $2,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id, passwordHash]
    );
  }

  public async updateProfile(
    id: string,
    patch: { name?: string; profileImageUrl?: string | null; preferencesJson?: Record<string, unknown> }
  ): Promise<UserRecord | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id];
    let idx = 2;

    if (patch.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(patch.name.trim());
    }

    if (patch.profileImageUrl !== undefined) {
      updates.push(`profile_image_url = $${idx++}`);
      values.push(patch.profileImageUrl);
    }

    if (patch.preferencesJson !== undefined) {
      updates.push(`preferences_json = $${idx++}`);
      values.push(JSON.stringify(patch.preferencesJson));
    }

    const res = await this.db.query<DbUserRow>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $1 AND status != 'DELETED' RETURNING *`,
      values
    );

    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }
}
