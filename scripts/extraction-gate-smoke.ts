import { createHash } from 'node:crypto';

import { ControlledAiExtractionAdapter, LOCAL_AI_EXTRACTION_PROVIDER_EXECUTION_BOUNDARY, type AiExtractionProvider } from '../src/extraction/ai-extraction.js';
import { evaluateExtractionAcceptance } from '../src/extraction/acceptance-gate.js';
import { ExtractionDiagnosticsRegistry } from '../src/extraction/diagnostics.js';
import { HtmlDomCleaner, type ExtractionArtifactReference, type ExtractionScope } from '../src/extraction/html-cleaner.js';
import { HtmlSelectorEngine } from '../src/extraction/html-selector-engine.js';
import { JsonPathSelectorEngine } from '../src/extraction/jsonpath-engine.js';
import { ExtractionNormalizer } from '../src/extraction/normalize.js';
import { ExtractionPlanRegistry } from '../src/extraction/plan.js';

const scope: ExtractionScope = { tenantId: 'tenant_gate', jobId: 'job_gate', taskId: 'task_gate', attemptId: 'attempt_gate' };
const rawHtml = '<article><h1 class="product-title"> Trail Jacket </h1><span data-price="€ 1.234,50"></span><script>window.x = 1</script></article>';
const artifact: ExtractionArtifactReference = {
  artifactType: 'raw-http-response',
  contentType: 'text/html',
  sizeBytes: Buffer.byteLength(rawHtml, 'utf8'),
  checksumSha256: hash(rawHtml),
  storageKey: 'tenants/tenant_gate/jobs/job_gate/tasks/task_gate/attempts/attempt_gate/response.body'
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

class GateFakeAiProvider implements AiExtractionProvider {
  public readonly executionBoundary = LOCAL_AI_EXTRACTION_PROVIDER_EXECUTION_BOUNDARY;

  public async extract(request: { modelId: string }) {
    return { modelId: request.modelId, content: '{"name":"Trail Jacket","price":1234.5}', inputTokens: 64, outputTokens: 16 };
  }
}

async function main(): Promise<void> {
  const planRegistry = new ExtractionPlanRegistry(() => new Date('2026-08-27T00:00:00.000Z'));
  const htmlPlan = planRegistry.register({
    tenantId: scope.tenantId,
    projectId: 'project_gate',
    planId: 'product_html',
    sourceKind: 'HTML',
    createdBy: 'gate_runner',
    fields: [
      { fieldId: 'name', outputKey: 'name', selectorKind: 'CSS', selector: 'h1.product-title', required: true, multiple: false, transforms: [{ kind: 'COLLAPSE_WHITESPACE' }] },
      { fieldId: 'price', outputKey: 'price', selectorKind: 'CSS', selector: 'span[data-price]::attr(data-price)', required: true, multiple: false, transforms: [{ kind: 'REMOVE_CURRENCY_SYMBOL' }, { kind: 'NORMALIZE_DECIMAL' }] }
    ]
  });
  const cleaned = new HtmlDomCleaner().clean({ scope, rawArtifact: artifact, html: rawHtml });
  assert(!cleaned.cleanHtml.includes('<script'), 'Executable DOM cleaner tarafından kaldırılmalı.');
  const htmlFields = new HtmlSelectorEngine().extract(htmlPlan, cleaned.cleanHtml).fields;
  assert(htmlFields.every((field) => field.status === 'EXTRACTED'), 'HTML fixture tüm field değerlerini çıkarmalı.');

  const normalizer = new ExtractionNormalizer();
  const nameNormalization = normalizer.normalize(htmlFields[0]!.values, htmlPlan.fields[0]!.transforms);
  const priceNormalization = normalizer.normalize(htmlFields[1]!.values, htmlPlan.fields[1]!.transforms);
  assert(nameNormalization.values[0]!.normalizedValue === 'Trail Jacket', 'Name normalization drift olmamalı.');
  assert(priceNormalization.values[0]!.normalizedValue === '1234.50', 'Price normalization canonical olmalı.');

  const diagnostics = new ExtractionDiagnosticsRegistry().record({
    scope,
    artifact,
    sourceChecksumSha256: cleaned.sourceChecksumSha256,
    plan: htmlPlan,
    fields: [
      { output: htmlFields[0]!, normalization: nameNormalization },
      { output: htmlFields[1]!, normalization: priceNormalization }
    ]
  });
  assert(diagnostics.summary.extractedFields === 2 && diagnostics.summary.errorFields === 0, 'Diagnostics baseline fixture ile uyuşmalı.');
  assert(!JSON.stringify(diagnostics).includes('Trail Jacket'), 'Diagnostics raw/normalized value saklamamalı.');

  const jsonPlan = planRegistry.register({
    tenantId: scope.tenantId,
    projectId: 'project_gate',
    planId: 'product_json',
    sourceKind: 'JSON',
    createdBy: 'gate_runner',
    fields: [{ fieldId: 'ids', outputKey: 'ids', selectorKind: 'JSONPATH', selector: '$.products[*].id', required: true, multiple: true }]
  });
  const jsonFields = new JsonPathSelectorEngine().extract(jsonPlan, { products: [{ id: 'p_1' }, { id: 'p_2' }] }).fields;
  assert(jsonFields[0]!.values.length === 2, 'JSONPath wildcard fixture iki record çıkarmalı.');

  const driftHtml = '<article><h2 class="product-title">Trail Jacket</h2><span data-price="€ 1.234,50"></span></article>';
  const driftArtifact = { ...artifact, checksumSha256: hash(driftHtml), sizeBytes: Buffer.byteLength(driftHtml, 'utf8') };
  const driftClean = new HtmlDomCleaner().clean({ scope, rawArtifact: driftArtifact, html: driftHtml });
  const drift = new HtmlSelectorEngine().extract(htmlPlan, driftClean.cleanHtml);
  assert(drift.fields[0]!.errorCode === 'REQUIRED_FIELD_MISSING', 'Fixture drift required field diagnostic üretmeli.');

  const ai = await new ControlledAiExtractionAdapter(new GateFakeAiProvider()).extract({
    scope,
    plan: htmlPlan,
    artifact,
    cleanText: cleaned.text,
    schema: {
      schemaId: 'ProductOutput',
      version: 1,
      fields: [{ key: 'name', type: 'string', required: true }, { key: 'price', type: 'number', required: true }]
    },
    modelId: 'gpt-5-mini'
  });
  assert(ai.accepted, "Controlled AI fake provider output'u schema gate geçmeli.");
  assert(ai.output.name === 'Trail Jacket' && ai.output.price === 1234.5, 'AI output fixture beklenen structured value üretmeli.');

  const gate = evaluateExtractionAcceptance({
    gateId: 'm6_extraction_gate',
    evidence: {
      planFingerprintSha256: htmlPlan.fingerprintSha256,
      artifactChecksumSha256: artifact.checksumSha256,
      diagnosticsReportId: diagnostics.reportId
    },
    checks: [
      { id: 'IMMUTABLE_PLAN_VERSIONING', status: 'PASS' },
      { id: 'CSS_XPATH_EXTRACTION', status: 'PASS' },
      { id: 'JSONPATH_EXTRACTION', status: 'PASS' },
      { id: 'HTML_CLEANER_ARTIFACT_REFERENCE', status: 'PASS' },
      { id: 'IDEMPOTENT_NORMALIZATION', status: 'PASS' },
      { id: 'DIAGNOSTICS_MINIMIZATION', status: 'PASS' },
      { id: 'CONTROLLED_AI_SCHEMA_GATE', status: 'PASS' },
      { id: 'FIXTURE_DRIFT_DETECTED', status: 'PASS' }
    ]
  });
  assert(gate.status === 'LOCAL_REFERENCE_ACCEPTED', 'M6 local fixture/regression gate kabul edilmelidir.');

  console.log(JSON.stringify({
    result: 'LOCAL_REFERENCE_ACCEPTED',
    checks: gate.checks,
    failedCheckIds: gate.failedCheckIds,
    allowsTargetFetch: gate.allowsTargetFetch,
    allowsProviderCall: gate.allowsProviderCall,
    allowsModelInvocation: gate.allowsModelInvocation,
    allowsProductionRelease: gate.allowsProductionRelease,
    htmlPlanFingerprint: htmlPlan.fingerprintSha256,
    diagnosticsReportId: diagnostics.reportId
  }));
}

main().catch((error: unknown) => {
  console.error('EXTRACTION_GATE_SMOKE: FAIL', error instanceof Error ? error.message : 'Bilinmeyen hata');
  process.exitCode = 1;
});
