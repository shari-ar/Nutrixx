import type { CanonicalRecordV1 } from '@nutrixx/canonical-schema';
import {
  PersistenceError,
  classifyCanonicalWrite,
  validateCanonicalRecord,
  type CanonicalRecordRepository,
  type CanonicalRecordVerifier,
  type CanonicalWriteResult,
} from '@nutrixx/persistence';
import { Pool, type PoolClient } from 'pg';

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export interface PostgreSqlRepositoryOptions {
  readonly connectionString: string;
  readonly schema: string;
  readonly verifyRecord: CanonicalRecordVerifier;
  readonly dropSchemaOnClose?: boolean;
}

interface StoredRow {
  readonly document: CanonicalRecordV1;
}

export class PostgreSqlCanonicalRecordRepository
  implements CanonicalRecordRepository
{
  readonly #pool: Pool;
  readonly #options: PostgreSqlRepositoryOptions;
  readonly #qualifiedTable: string;
  #closed = false;

  private constructor(pool: Pool, options: PostgreSqlRepositoryOptions) {
    this.#pool = pool;
    this.#options = options;
    this.#qualifiedTable = `"${options.schema}"."canonical_records"`;
  }

  public static async create(
    options: PostgreSqlRepositoryOptions,
  ): Promise<PostgreSqlCanonicalRecordRepository> {
    if (!SAFE_IDENTIFIER.test(options.schema)) {
      throw new TypeError(
        'PostgreSQL schema must be a safe lowercase identifier.',
      );
    }
    const pool = new Pool({
      connectionString: options.connectionString,
      max: 8,
    });
    const repository = new PostgreSqlCanonicalRecordRepository(pool, options);
    try {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${options.schema}"`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${repository.#qualifiedTable} (
          record_id uuid PRIMARY KEY,
          subject_id uuid NOT NULL,
          record_type text NOT NULL,
          logical_version integer NOT NULL CHECK (logical_version > 0),
          document jsonb NOT NULL,
          content_hash char(64) NOT NULL,
          updated_at timestamptz NOT NULL
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS "canonical_records_subject_record_idx"
        ON ${repository.#qualifiedTable} (subject_id, record_id)
      `);
      return repository;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new PersistenceError('closed', 'The repository is closed.');
    }
  }

  async #withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.#pool.connect();
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

  public async put(input: CanonicalRecordV1): Promise<CanonicalWriteResult> {
    this.#assertOpen();
    const record = await validateCanonicalRecord(
      input,
      this.#options.verifyRecord,
    );
    return this.#withTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [record.recordId],
      );
      const existingResult = await client.query<StoredRow>(
        `SELECT document FROM ${this.#qualifiedTable} WHERE record_id = $1 FOR UPDATE`,
        [record.recordId],
      );
      const existing = existingResult.rows[0]?.document ?? null;
      const result = classifyCanonicalWrite(existing, record);
      if (result !== 'unchanged') {
        await client.query(
          `
            INSERT INTO ${this.#qualifiedTable}
              (record_id, subject_id, record_type, logical_version, document, content_hash, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
            ON CONFLICT (record_id) DO UPDATE SET
              subject_id = EXCLUDED.subject_id,
              record_type = EXCLUDED.record_type,
              logical_version = EXCLUDED.logical_version,
              document = EXCLUDED.document,
              content_hash = EXCLUDED.content_hash,
              updated_at = EXCLUDED.updated_at
          `,
          [
            record.recordId,
            record.subjectId,
            record.recordType,
            record.logicalVersion,
            JSON.stringify(record),
            record.integrity.value,
            record.updatedAt,
          ],
        );
      }
      return result;
    });
  }

  public async getById(recordId: string): Promise<CanonicalRecordV1 | null> {
    this.#assertOpen();
    const result = await this.#pool.query<StoredRow>(
      `SELECT document FROM ${this.#qualifiedTable} WHERE record_id = $1`,
      [recordId],
    );
    return result.rows[0]?.document ?? null;
  }

  public async listBySubject(
    subjectId: string,
  ): Promise<readonly CanonicalRecordV1[]> {
    this.#assertOpen();
    const result = await this.#pool.query<StoredRow>(
      `SELECT document FROM ${this.#qualifiedTable} WHERE subject_id = $1 ORDER BY record_id`,
      [subjectId],
    );
    return result.rows.map(({ document }) => document);
  }

  public async deleteById(recordId: string): Promise<boolean> {
    this.#assertOpen();
    const result = await this.#pool.query(
      `DELETE FROM ${this.#qualifiedTable} WHERE record_id = $1`,
      [recordId],
    );
    return result.rowCount === 1;
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#options.dropSchemaOnClose === true) {
      await this.#pool.query(`DROP SCHEMA "${this.#options.schema}" CASCADE`);
    }
    await this.#pool.end();
  }
}
