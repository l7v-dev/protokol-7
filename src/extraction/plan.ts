import { createHash } from 'node:crypto';

export type ExtractionSourceKind = 'HTML' | 'JSON' | 'TEXT';
export type ExtractionSelectorKind = 'CSS' | 'XPATH' | 'JSONPATH';

export type ExtractionTransformKind =
  | 'TRIM'
  | 'COLLAPSE_WHITESPACE'
  | 'LOWERCASE'
  | 'UPPERCASE'
  | 'REMOVE_CURRENCY_SYMBOL'
  | 'NORMALIZE_DECIMAL';

export type ExtractionTransform = {
  kind: ExtractionTransformKind;
};

export type ExtractionFieldPlan = {
  fieldId: string;
  outputKey: string;
  selectorKind: ExtractionSelectorKind;
  selector: string;
  required: boolean;
  multiple: boolean;
  transforms?: ReadonlyArray<ExtractionTransform>;
};

export type ExtractionPlanDraft = {
  tenantId: string;
  projectId: string;
  planId: string;
  sourceKind: ExtractionSourceKind;
  fields: ReadonlyArray<ExtractionFieldPlan>;
  createdBy: string;
  createdAt?: Date;
};

export type ExtractionPlan = Omit<ExtractionPlanDraft, 'createdAt' | 'fields'> & {
  version: number;
  fields: ReadonlyArray<ExtractionFieldPlan>;
  createdAt: string;
  fingerprintSha256: string;
};

export type ExtractionPlanAttemptBinding = {
  tenantId: string;
  projectId: string;
  planId: string;
  version: number;
  fingerprintSha256: string;
  jobId: string;
  taskId: string;
  attemptId: string;
  boundAt: string;
};

export type ExtractionPlanErrorCode =
  | 'EXTRACTION_PLAN_INVALID'
  | 'EXTRACTION_PLAN_NOT_FOUND'
  | 'EXTRACTION_PLAN_VERSION_CONFLICT'
  | 'EXTRACTION_PLAN_BINDING_CONFLICT';

export class ExtractionPlanError extends Error {
  public constructor(public readonly code: ExtractionPlanErrorCode, message: string) {
    super(message);
    this.name = 'ExtractionPlanError';
  }
}

/**
 * Process-local reference registry. It keeps a versioned plan immutable once
 * registered and binds an attempt to a single resolved plan fingerprint.
 */
export class ExtractionPlanRegistry {
  private readonly plans = new Map<string, ExtractionPlan[]>();
  private readonly attemptBindings = new Map<string, ExtractionPlanAttemptBinding>();

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public register(draft: ExtractionPlanDraft): ExtractionPlan {
    validateDraft(draft);
    const key = planKey(draft.tenantId, draft.planId);
    const versions = this.plans.get(key) ?? [];
    const version = versions.length + 1;
    const createdAt = (draft.createdAt ?? this.now()).toISOString();
    const planWithoutFingerprint = {
      tenantId: draft.tenantId,
      projectId: draft.projectId,
      planId: draft.planId,
      sourceKind: draft.sourceKind,
      fields: draft.fields.map((field) => ({ ...field })),
      createdBy: draft.createdBy,
      createdAt,
      version
    };
    const plan: ExtractionPlan = {
      ...planWithoutFingerprint,
      fingerprintSha256: fingerprint({ ...planWithoutFingerprint, fields: canonicalFields(draft.fields) })
    };
    this.plans.set(key, [...versions, clonePlan(plan)]);
    return clonePlan(plan);
  }

  public resolve(input: { tenantId: string; planId: string; version: number }): ExtractionPlan {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.planId, 'planId');
    if (!Number.isInteger(input.version) || input.version < 1) {
      throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Extraction plan version pozitif integer olmalıdır.');
    }
    const plan = this.plans.get(planKey(input.tenantId, input.planId))?.[input.version - 1];
    if (!plan) {
      throw new ExtractionPlanError('EXTRACTION_PLAN_NOT_FOUND', 'Extraction plan version bulunamadı.');
    }
    return clonePlan(plan);
  }

  public bindAttempt(input: {
    tenantId: string;
    planId: string;
    version: number;
    jobId: string;
    taskId: string;
    attemptId: string;
  }): ExtractionPlanAttemptBinding {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.jobId, 'jobId');
    assertIdentifier(input.taskId, 'taskId');
    assertIdentifier(input.attemptId, 'attemptId');
    const plan = this.resolve({ tenantId: input.tenantId, planId: input.planId, version: input.version });
    const key = attemptKey(input.tenantId, input.attemptId);
    const existing = this.attemptBindings.get(key);
    const candidate: ExtractionPlanAttemptBinding = {
      tenantId: input.tenantId,
      projectId: plan.projectId,
      planId: plan.planId,
      version: plan.version,
      fingerprintSha256: plan.fingerprintSha256,
      jobId: input.jobId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      boundAt: this.now().toISOString()
    };
    if (existing) {
      if (!sameBinding(existing, candidate)) {
        throw new ExtractionPlanError(
          'EXTRACTION_PLAN_BINDING_CONFLICT',
          'Attempt farklı bir extraction plan version ile yeniden bağlanamaz.'
        );
      }
      return { ...existing };
    }
    this.attemptBindings.set(key, { ...candidate });
    return candidate;
  }
}

function validateDraft(draft: ExtractionPlanDraft): void {
  assertIdentifier(draft.tenantId, 'tenantId');
  assertIdentifier(draft.projectId, 'projectId');
  assertIdentifier(draft.planId, 'planId');
  assertIdentifier(draft.createdBy, 'createdBy');
  if (draft.createdAt !== undefined && !Number.isFinite(draft.createdAt.getTime())) {
    throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Extraction plan createdAt geçerli bir tarih olmalıdır.');
  }
  if (!['HTML', 'JSON', 'TEXT'].includes(draft.sourceKind)) {
    throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Extraction source kind desteklenmiyor.');
  }
  if (draft.fields.length === 0 || draft.fields.length > 100) {
    throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Extraction plan 1 ila 100 field içermelidir.');
  }
  const fieldIds = new Set<string>();
  const outputKeys = new Set<string>();
  for (const field of draft.fields) {
    assertIdentifier(field.fieldId, 'fieldId');
    assertIdentifier(field.outputKey, 'outputKey');
    if (fieldIds.has(field.fieldId) || outputKeys.has(field.outputKey)) {
      throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Field ID ve output key benzersiz olmalıdır.');
    }
    fieldIds.add(field.fieldId);
    outputKeys.add(field.outputKey);
    if (!['CSS', 'XPATH', 'JSONPATH'].includes(field.selectorKind) || field.selector.length === 0 || field.selector.length > 1_024) {
      throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Selector kind veya selector sınırı geçersiz.');
    }
    if (field.transforms && (field.transforms.length > 10 || field.transforms.some((transform) => !isTransformKind(transform.kind)))) {
      throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Extraction transform tanımı geçersiz.');
    }
    if (/javascript:|<script|\beval\s*\(/i.test(field.selector)
      || /authorization|cookie|password|secret|token|session/i.test(field.outputKey)) {
      throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', 'Extraction plan güvenli selector/output key sınırını ihlal ediyor.');
    }
  }
}

function assertIdentifier(value: string, name: string): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new ExtractionPlanError('EXTRACTION_PLAN_INVALID', `${name} güvenli identifier biçiminde olmalıdır.`);
  }
}

function canonicalFields(fields: ReadonlyArray<ExtractionFieldPlan>): ExtractionFieldPlan[] {
  return fields
    .map(cloneField)
    .sort((left, right) => left.fieldId.localeCompare(right.fieldId));
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function planKey(tenantId: string, planId: string): string {
  return `${tenantId}:${planId}`;
}

function attemptKey(tenantId: string, attemptId: string): string {
  return `${tenantId}:${attemptId}`;
}

function clonePlan(plan: ExtractionPlan): ExtractionPlan {
  return {
    ...plan,
    fields: plan.fields.map(cloneField)
  };
}

function cloneField(field: ExtractionFieldPlan): ExtractionFieldPlan {
  return field.transforms
    ? { ...field, transforms: field.transforms.map((transform) => ({ ...transform })) }
    : { ...field };
}

function isTransformKind(value: string): value is ExtractionTransformKind {
  return ['TRIM', 'COLLAPSE_WHITESPACE', 'LOWERCASE', 'UPPERCASE', 'REMOVE_CURRENCY_SYMBOL', 'NORMALIZE_DECIMAL'].includes(value);
}

function sameBinding(left: ExtractionPlanAttemptBinding, right: ExtractionPlanAttemptBinding): boolean {
  return left.tenantId === right.tenantId
    && left.projectId === right.projectId
    && left.planId === right.planId
    && left.version === right.version
    && left.fingerprintSha256 === right.fingerprintSha256
    && left.jobId === right.jobId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId;
}
