import { Pool, type PoolClient, type QueryConfig, type QueryResult, type QueryResultRow } from 'pg';

import type { AppConfig } from '../config/env.js';

export class Database {
  private readonly pool: Pool;

  public constructor(config: Pick<AppConfig, 'databaseUrl' | 'dbPoolMax' | 'dbConnectTimeoutMs'>) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      connectionTimeoutMillis: config.dbConnectTimeoutMs,
      idleTimeoutMillis: 30_000,
      application_name: 'scraping-platform-backend'
    });
  }

  public query<Row extends QueryResultRow = QueryResultRow>(
    textOrConfig: string | QueryConfig,
    values?: unknown[]
  ): Promise<QueryResult<Row>> {
    if (typeof textOrConfig === 'string') {
      return this.pool.query<Row>(textOrConfig, values);
    }

    return this.pool.query<Row>(textOrConfig);
  }

  public async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
