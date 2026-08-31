import type { AuthContext } from './auth.js';
import { ApiError } from './http.js';

export function hasScope(context: AuthContext, requiredScope: string): boolean {
  return context.scopes.includes('*') || context.scopes.includes(requiredScope) || context.roles.includes('owner');
}

export function requireScope(context: AuthContext | null, requiredScope: string): AuthContext {
  if (!context) {
    throw new ApiError({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      category: 'AUTH',
      message: 'Kimlik doğrulama gerekli.',
      retryable: false
    });
  }

  if (!hasScope(context, requiredScope)) {
    throw new ApiError({
      statusCode: 403,
      code: 'FORBIDDEN',
      category: 'AUTH',
      message: 'Bu işlem için yetkiniz yok.',
      retryable: false
    });
  }

  return context;
}
