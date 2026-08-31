import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { AuthService } from '../services/auth-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const signUpSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  profile_image_url: z.string().nullable().optional()
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const updatePasswordSchema = z.object({
  password: z.string().min(1),
  new_password: z.string().min(8)
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  profile_image_url: z.string().nullable().optional()
});

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  const handleSignUp = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = signUpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
          retryable: false
        })
      );
    }

    try {
      const signUpPayload: { name: string; email: string; password: string; profile_image_url?: string | null } = {
        name: parseResult.data.name,
        email: parseResult.data.email,
        password: parseResult.data.password
      };
      if (parseResult.data.profile_image_url !== undefined) {
        signUpPayload.profile_image_url = parseResult.data.profile_image_url;
      }

      const result = await authService.signUp(signUpPayload);
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  const handleSignIn = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = signInSchema.safeParse(request.body);
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'Geçersiz e-posta veya parola formatı.',
          retryable: false
        })
      );
    }

    try {
      const result = await authService.signIn({
        email: parseResult.data.email,
        password: parseResult.data.password,
        ip: request.ip
      });
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  const handleSignOut = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ status: true, message: 'Başarıyla çıkış yapıldı.' });
  };

  const handleSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          category: 'AUTH',
          message: 'Oturum açmanız gerekmektedir.',
          retryable: false
        })
      );
    }

    const token = authHeader.slice(7).trim();
    try {
      const user = await authService.getSessionUser(token);
      return reply.code(200).send(user);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  const handleUpdatePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    if (!context) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          category: 'AUTH',
          message: 'Oturum açmanız gerekmektedir.',
          retryable: false
        })
      );
    }

    const parseResult = updatePasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'Geçersiz parola verisi.',
          retryable: false
        })
      );
    }

    try {
      await authService.updatePassword(
        context.actorId,
        context.tenantId,
        parseResult.data.password,
        parseResult.data.new_password
      );
      return reply.code(200).send({ status: true, message: 'Parola başarıyla güncellendi.' });
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  const handleUpdateProfile = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    if (!context) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          category: 'AUTH',
          message: 'Oturum açmanız gerekmektedir.',
          retryable: false
        })
      );
    }

    const parseResult = updateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'Geçersiz profil verisi.',
          retryable: false
        })
      );
    }

    try {
      const profileUpdate: { name?: string; profile_image_url?: string | null } = {};
      if (parseResult.data.name !== undefined) {
        profileUpdate.name = parseResult.data.name;
      }
      if (parseResult.data.profile_image_url !== undefined) {
        profileUpdate.profile_image_url = parseResult.data.profile_image_url;
      }

      const updated = await authService.updateProfile(context.actorId, context.tenantId, profileUpdate);
      return reply.code(200).send({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        profile_image_url: updated.profileImageUrl
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  const handleUpdateTimezone = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ status: true });
  };

  // Register technical routes and compatibility aliases
  for (const prefix of ['/auth', '/auths']) {
    app.post(`${prefix}/signup`, handleSignUp);
    app.post(`${prefix}/signin`, handleSignIn);
    app.post(`${prefix}/signout`, handleSignOut);
    app.get(`${prefix}`, handleSession);
    app.get(`${prefix}/`, handleSession);
    app.get(`${prefix}/session`, handleSession);
    app.get(`${prefix}/me`, handleSession);
    app.post(`${prefix}/update/password`, handleUpdatePassword);
    app.post(`${prefix}/password`, handleUpdatePassword);
    app.post(`${prefix}/update/profile`, handleUpdateProfile);
    app.post(`${prefix}/profile`, handleUpdateProfile);
    app.post(`${prefix}/update/timezone`, handleUpdateTimezone);
    app.post(`${prefix}/timezone`, handleUpdateTimezone);
  }
}
