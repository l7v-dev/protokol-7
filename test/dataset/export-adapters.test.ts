import { describe, expect, it } from 'vitest';

import { DatasetExportError, streamDatasetExport } from '../../src/dataset/export-adapters.js';

const request = { exportId: 'export_1', scope: { tenantId: 'tenant_1', projectId: 'project_1' }, datasetVersionId: 'dataset_version_1', format: 'JSON' as const, columns: ['name', 'price', 'active'], maxRecords: 3 };

async function collect(requestInput: typeof request | { exportId: string; scope: { tenantId: string; projectId: string }; datasetVersionId: string; format: 'JSONL' | 'CSV'; columns: string[]; maxRecords: number }, records: ReadonlyArray<Record<string, string | number | boolean | null>>): Promise<string> {
  async function* source() { for (const record of records) yield record; }
  let output = '';
  for await (const chunk of streamDatasetExport(requestInput, source())) output += chunk;
  return output;
}

describe('streaming JSON, JSONL and CSV dataset export adapters', () => {
  it('emits incrementally formatted JSON, JSONL and RFC-escaped CSV output from the same bounded record source', async () => {
    const records = [{ name: 'first', price: 10, active: true }, { name: 'second, "quoted"', price: 20, active: false }];
    const json = await collect(request, records);
    const jsonl = await collect({ ...request, format: 'JSONL' }, records);
    const csv = await collect({ ...request, format: 'CSV' }, records);

    expect(JSON.parse(json)).toEqual(records);
    expect(jsonl).toBe('{"name":"first","price":10,"active":true}\n{"name":"second, \\"quoted\\"","price":20,"active":false}\n');
    expect(csv).toBe('name,price,active\r\nfirst,10,true\r\n"second, ""quoted""",20,false\r\n');
  });

  it('streams records lazily and redacts secret-shaped textual values without retaining delivery state', async () => {
    let yielded = 0;
    async function* source() {
      yielded += 1;
      yield { name: 'authorization: Bearer secret-value', price: 10, active: true };
      yielded += 1;
      yield { name: 'second', price: 20, active: false };
    }
    const iterator = streamDatasetExport({ ...request, format: 'JSONL' }, source());
    const first = await iterator.next();
    expect(yielded).toBe(1);
    expect(first.value).toContain('[REDACTED]');
    expect(first.value).not.toContain('secret-value');
    await iterator.return(undefined);
  });

  it('rejects sensitive columns, schema drift, oversized/over-limit records and malformed scope fail-closed', async () => {
    await expect(collect({ ...request, columns: ['name', 'apiKey'] }, [])).rejects.toThrow(DatasetExportError);
    await expect(collect(request, [{ name: 'first', price: 10, active: true, extra: 'reject' }])).rejects.toMatchObject({ code: 'DATASET_EXPORT_RECORD_INVALID' });
    await expect(collect({ ...request, maxRecords: 1 }, [{ name: 'first', price: 10, active: true }, { name: 'second', price: 20, active: false }])).rejects.toMatchObject({ code: 'DATASET_EXPORT_RECORD_LIMIT_EXCEEDED' });
    await expect(collect({ ...request, scope: { tenantId: 'bad id', projectId: 'project_1' } }, [])).rejects.toMatchObject({ code: 'DATASET_EXPORT_INVALID' });
  });
});
