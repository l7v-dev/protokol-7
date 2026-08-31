import type { FastifyRequest } from 'fastify';
import { verifyJwt } from '../security/jwt.js';

export type ActorType = 'user' | 'service' | 'test';

export type AuthContext = {
  actorId: string;
  actorType: ActorType;
  tenantId: string;
  roles: string[];
  scopes: string[];
};

export interface AuthContextResolver {
  resolve(request: FastifyRequest): AuthContext | null;
}

function splitHeader(value: string | undefined): string[] {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

export class TestAuthResolver implements AuthContextResolver {
  public resolve(): AuthContext {
    return {
      actorId: 'actor_test',
      actorType: 'test',
      tenantId: 'tenant_test',
      roles: ['owner'],
      scopes: ['*']
    };
  }
}

export class HeaderAuthResolver implements AuthContextResolver {
  public resolve(request: FastifyRequest): AuthContext | null {
    const actorId = request.headers['x-actor-id']?.toString();
    const tenantId = request.headers['x-tenant-id']?.toString();

    if (!actorId || !tenantId) {
      return null;
    }

    return {
      actorId,
      actorType: request.headers['x-actor-type']?.toString() === 'service' ? 'service' : 'user',
      tenantId,
      roles: splitHeader(request.headers['x-roles']?.toString()),
      scopes: splitHeader(request.headers['x-scopes']?.toString())
    };
  }
}

export class ExternalAuthResolver implements AuthContextResolver {
  public resolve(): AuthContext | null {
    return null;
  }
}

export class JwtAuthResolver implements AuthContextResolver {
  public constructor(private readonly jwtSecret: string) {}

  public resolve(request: FastifyRequest): AuthContext | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyJwt(token, this.jwtSecret);
    if (!payload) {
      return null;
    }

    return {
      actorId: payload.sub,
      actorType: 'user',
      tenantId: payload.tenantId || 'tenant_default',
      roles: [payload.role || 'user'],
      scopes: ['*']
    };
  }
}

export class CompositeAuthResolver implements AuthContextResolver {
  public constructor(private readonly resolvers: AuthContextResolver[]) {}

  public resolve(request: FastifyRequest): AuthContext | null {
    for (const resolver of this.resolvers) {
      const context = resolver.resolve(request);
      if (context) {
        return context;
      }
    }
    return null;
  }
}

