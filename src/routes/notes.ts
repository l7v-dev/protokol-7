import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { NoteService } from '../services/note-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const noteCreateSchema = z.object({
  title: z.string().min(1, 'Not başlığı zorunludur.'),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  access_grants: z.array(z.record(z.string(), z.unknown())).optional()
});

const noteUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  access_grants: z.array(z.record(z.string(), z.unknown())).optional()
});

export function registerNoteRoutes(app: FastifyInstance, noteService: NoteService): void {
  // GET /notes/ or /notes
  const listNotesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const notes = await noteService.listNotes(userId, tenantId);
    return reply.code(200).send(notes);
  };

  // POST /notes/create
  const createNoteHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = noteCreateSchema.safeParse(request.body || {});
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

    const createDto: {
      title: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    } = {
      title: parseResult.data.title
    };
    if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.access_grants !== undefined) createDto.access_grants = parseResult.data.access_grants;

    const created = await noteService.createNote(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /notes/search
  const searchNotesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';
    const query = (request.query as { query?: string }) || {};

    const notes = await noteService.listNotes(userId, tenantId);
    const q = query.query?.toLowerCase();
    const filtered = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes;

    return reply.code(200).send({ items: filtered, total: filtered.length });
  };

  // GET /notes/:id
  const getNoteByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const note = await noteService.getNoteById(tenantId, params.id);
    if (!note) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'NOTE_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Not bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(note);
  };

  // POST /notes/:id/update
  const updateNoteHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = noteUpdateSchema.safeParse(request.body || {});
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

    const updateDto: {
      title?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    } = {};
    if (parseResult.data.title !== undefined) updateDto.title = parseResult.data.title;
    if (parseResult.data.data !== undefined) updateDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.access_grants !== undefined) updateDto.access_grants = parseResult.data.access_grants;

    const updated = await noteService.updateNote(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'NOTE_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Not bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // DELETE /notes/:id
  const deleteNoteHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await noteService.deleteNote(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Not silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/notes', listNotesHandler);
  app.get('/notes/', listNotesHandler);
  app.post('/notes/create', createNoteHandler);
  app.get('/notes/search', searchNotesHandler);
  app.get('/notes/:id', getNoteByIdHandler);
  app.post('/notes/:id/update', updateNoteHandler);
  app.delete('/notes/:id', deleteNoteHandler);
}
