import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../src/security/password.js';
import { signJwt, verifyJwt } from '../../src/security/jwt.js';
import { AuthService } from '../../src/services/auth-service.js';
import type { UserRepository, UserRecord } from '../../src/database/repositories/user-repository.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('enterprise password security', () => {
  it('hashes passwords with secure scrypt salt and verifies correctly', async () => {
    const raw = 'P@ssword123!';
    const hash = await hashPassword(raw);

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword(raw, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('enforces password length and policy requirements', () => {
    expect(validatePasswordStrength('short').valid).toBe(false);
    expect(validatePasswordStrength('validpassword123').valid).toBe(true);
  });
});

describe('enterprise JWT token management', () => {
  const secret = 'test-secret-key-that-is-at-least-32-chars-long';

  it('signs and verifies JWT tokens with claims and expiration', () => {
    const token = signJwt(
      {
        sub: 'user_123',
        email: 'admin@protokol7.internal',
        name: 'Admin User',
        role: 'admin',
        tenantId: 'tenant_default'
      },
      secret,
      3600
    );

    const verified = verifyJwt(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe('user_123');
    expect(verified?.email).toBe('admin@protokol7.internal');
    expect(verified?.role).toBe('admin');
  });

  it('rejects tampered or expired tokens', () => {
    const token = signJwt(
      {
        sub: 'user_123',
        email: 'admin@protokol7.internal',
        name: 'Admin User',
        role: 'admin',
        tenantId: 'tenant_default'
      },
      secret,
      -10 // Expired
    );

    expect(verifyJwt(token, secret)).toBeNull();
    expect(verifyJwt('invalid.token.structure', secret)).toBeNull();
    expect(verifyJwt(`${token}tampered`, secret)).toBeNull();
  });
});

describe('enterprise auth service business logic', () => {
  const secret = 'test-secret-key-that-is-at-least-32-chars-long';

  function createMockUserRepository() {
    const users: UserRecord[] = [];

    return {
      users,
      async ensureTenantExists() {},
      async countUsers() {
        return users.length;
      },
      async create(input) {
        const user: UserRecord = {
          id: input.id || `user_${users.length + 1}`,
          tenantId: input.tenantId || 'tenant_default',
          email: input.email.toLowerCase(),
          emailVerified: false,
          passwordHash: input.passwordHash,
          name: input.name,
          role: input.role || (users.length === 0 ? 'admin' : 'user'),
          profileImageUrl: input.profileImageUrl || null,
          status: 'ACTIVE',
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          lastLoginIp: null,
          passwordChangedAt: new Date(),
          preferencesJson: {},
          metadataJson: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        };
        users.push(user);
        return user;
      },
      async findByEmail(email) {
        return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
      },
      async findById(id) {
        return users.find((u) => u.id === id) || null;
      },
      async recordLoginSuccess(id) {
        const user = users.find((u) => u.id === id);
        if (user) {
          user.failedLoginAttempts = 0;
          user.lastLoginAt = new Date();
        }
      },
      async recordLoginFailure(id) {
        const user = users.find((u) => u.id === id);
        if (user) {
          user.failedLoginAttempts += 1;
        }
      },
      async updatePassword(id, passwordHash) {
        const user = users.find((u) => u.id === id);
        if (user) {
          user.passwordHash = passwordHash;
          user.passwordChangedAt = new Date();
        }
      },
      async updateProfile(id, patch) {
        const user = users.find((u) => u.id === id);
        if (!user) return null;
        if (patch.name) user.name = patch.name;
        if (patch.profileImageUrl !== undefined) user.profileImageUrl = patch.profileImageUrl;
        return user;
      }
    } as unknown as UserRepository;
  }

  it('assigns admin role to first registered user and user role to subsequent users', async () => {
    const repo = createMockUserRepository();
    const service = new AuthService(repo, secret);

    const first = await service.signUp({
      name: 'Super Admin',
      email: 'admin@protokol7.internal',
      password: 'StrongPassword123!'
    });

    expect(first.role).toBe('admin');
    expect(first.token).toBeDefined();

    const second = await service.signUp({
      name: 'Standard User',
      email: 'user@protokol7.internal',
      password: 'StrongPassword123!'
    });

    expect(second.role).toBe('user');
  });

  it('authenticates user and returns session user info', async () => {
    const repo = createMockUserRepository();
    const service = new AuthService(repo, secret);

    const signup = await service.signUp({
      name: 'Test Operator',
      email: 'op@protokol7.internal',
      password: 'OperatorPassword123!'
    });

    const login = await service.signIn({
      email: 'op@protokol7.internal',
      password: 'OperatorPassword123!'
    });

    expect(login.id).toBe(signup.id);
    expect(login.token).toBeDefined();

    const session = await service.getSessionUser(login.token);
    expect(session.id).toBe(signup.id);
    expect(session.email).toBe('op@protokol7.internal');
    expect(session.permissions.workspace.models).toBe(true);
  });
});

describe('config and public auth routes', () => {
  it('returns bootstrap config for frontend', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/config'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Protokol-7');
    expect(body.features.enable_signup).toBe(true);
    expect(body.features.enable_login_form).toBe(true);

    await app.close();
  });

  it('rejects invalid signup payload with validation error on both /auth and /auths routes', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auths/signup',
      payload: {
        email: 'invalid-email',
        password: '123'
      }
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        email: 'invalid-email',
        password: '123'
      }
    });
    expect(res2.statusCode).toBe(400);

    await app.close();
  });
});
