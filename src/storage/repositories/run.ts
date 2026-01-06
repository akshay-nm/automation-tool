import type pg from 'pg';
import type {
  Run,
  RunStatus,
  StepExecution,
  StepExecutionStatus,
  TriggerData,
  ExecutionContext,
  RunError,
  StepError,
} from '../../domain/entities/run.js';

interface RunRow {
  id: string;
  workflow_id: string;
  status: string;
  trigger_data: TriggerData;
  context: ExecutionContext;
  current_step_index: number;
  started_at: Date;
  completed_at: Date | null;
  error: RunError | null;
}

interface StepExecutionRow {
  id: string;
  run_id: string;
  step_id: string;
  step_name: string;
  status: string;
  attempt: number;
  input: unknown;
  output: unknown;
  error: StepError | null;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status as RunStatus,
    triggerData: row.trigger_data,
    context: row.context,
    currentStepIndex: row.current_step_index,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

function rowToStepExecution(row: StepExecutionRow): StepExecution {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    stepName: row.step_name,
    status: row.status as StepExecutionStatus,
    attempt: row.attempt,
    input: row.input,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

// Repository interface for type safety and DI
export interface RunRepository {
  create(workflowId: string, triggerData: TriggerData): Promise<Run>;
  findById(id: string): Promise<Run | null>;
  list(options?: {
    workflowId?: string;
    status?: RunStatus;
    limit?: number;
    offset?: number;
  }): Promise<Run[]>;
  updateStatus(
    id: string,
    status: RunStatus,
    updates?: {
      currentStepIndex?: number;
      context?: ExecutionContext;
      completedAt?: Date;
      error?: RunError;
    }
  ): Promise<Run | null>;
  findByIdempotencyKey(key: string): Promise<Run | null>;
  setIdempotencyKey(key: string, runId: string): Promise<void>;
  createStepExecution(
    runId: string,
    stepId: string,
    stepName: string,
    attempt: number,
    input: unknown
  ): Promise<StepExecution>;
  updateStepExecution(
    id: string,
    updates: {
      status?: StepExecutionStatus;
      output?: unknown;
      error?: StepError;
      completedAt?: Date;
      durationMs?: number;
    }
  ): Promise<StepExecution | null>;
  getStepExecutions(runId: string): Promise<StepExecution[]>;
  getLatestAttempt(runId: string, stepId: string): Promise<number>;
}

// Dependencies interface for DI
interface RunRepositoryDeps {
  query: <T extends pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<pg.QueryResult<T>>;
}

// Factory function for dependency injection
export function createRunRepository(deps: RunRepositoryDeps): RunRepository {
  const { query } = deps;

  const repository: RunRepository = {
    async create(workflowId: string, triggerData: TriggerData): Promise<Run> {
      const context: ExecutionContext = {
        trigger: triggerData,
        steps: {},
        variables: {},
      };

      const result = await query<RunRow>(
        `INSERT INTO runs (workflow_id, trigger_data, context)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [workflowId, JSON.stringify(triggerData), JSON.stringify(context)]
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to create run');
      return rowToRun(row);
    },

    async findById(id: string): Promise<Run | null> {
      const result = await query<RunRow>('SELECT * FROM runs WHERE id = $1', [id]);
      const row = result.rows[0];
      return row ? rowToRun(row) : null;
    },

    async list(options?: {
      workflowId?: string;
      status?: RunStatus;
      limit?: number;
      offset?: number;
    }): Promise<Run[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (options?.workflowId) {
        conditions.push(`workflow_id = $${paramIndex++}`);
        values.push(options.workflowId);
      }
      if (options?.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(options.status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;

      const result = await query<RunRow>(
        `SELECT * FROM runs ${where} ORDER BY started_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      return result.rows.map(rowToRun);
    },

    async updateStatus(
      id: string,
      status: RunStatus,
      updates?: {
        currentStepIndex?: number;
        context?: ExecutionContext;
        completedAt?: Date;
        error?: RunError;
      }
    ): Promise<Run | null> {
      const sets = ['status = $1'];
      const values: unknown[] = [status];
      let paramIndex = 2;

      if (updates?.currentStepIndex !== undefined) {
        sets.push(`current_step_index = $${paramIndex++}`);
        values.push(updates.currentStepIndex);
      }
      if (updates?.context !== undefined) {
        sets.push(`context = $${paramIndex++}`);
        values.push(JSON.stringify(updates.context));
      }
      if (updates?.completedAt !== undefined) {
        sets.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completedAt);
      }
      if (updates?.error !== undefined) {
        sets.push(`error = $${paramIndex++}`);
        values.push(JSON.stringify(updates.error));
      }

      values.push(id);
      const result = await query<RunRow>(
        `UPDATE runs SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const row = result.rows[0];
      return row ? rowToRun(row) : null;
    },

    async findByIdempotencyKey(key: string): Promise<Run | null> {
      const result = await query<{ run_id: string }>(
        'SELECT run_id FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
        [key]
      );
      const row = result.rows[0];
      if (!row) return null;
      return repository.findById(row.run_id);
    },

    async setIdempotencyKey(key: string, runId: string): Promise<void> {
      await query(
        `INSERT INTO idempotency_keys (key, run_id)
         VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, runId]
      );
    },

    async createStepExecution(
      runId: string,
      stepId: string,
      stepName: string,
      attempt: number,
      input: unknown
    ): Promise<StepExecution> {
      const result = await query<StepExecutionRow>(
        `INSERT INTO step_executions (run_id, step_id, step_name, attempt, input)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [runId, stepId, stepName, attempt, JSON.stringify(input)]
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to create step execution');
      return rowToStepExecution(row);
    },

    async updateStepExecution(
      id: string,
      updates: {
        status?: StepExecutionStatus;
        output?: unknown;
        error?: StepError;
        completedAt?: Date;
        durationMs?: number;
      }
    ): Promise<StepExecution | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        sets.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.output !== undefined) {
        sets.push(`output = $${paramIndex++}`);
        values.push(JSON.stringify(updates.output));
      }
      if (updates.error !== undefined) {
        sets.push(`error = $${paramIndex++}`);
        values.push(JSON.stringify(updates.error));
      }
      if (updates.completedAt !== undefined) {
        sets.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completedAt);
      }
      if (updates.durationMs !== undefined) {
        sets.push(`duration_ms = $${paramIndex++}`);
        values.push(updates.durationMs);
      }

      if (sets.length === 0) {
        const result = await query<StepExecutionRow>(
          'SELECT * FROM step_executions WHERE id = $1',
          [id]
        );
        const row = result.rows[0];
        return row ? rowToStepExecution(row) : null;
      }

      values.push(id);
      const result = await query<StepExecutionRow>(
        `UPDATE step_executions SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const row = result.rows[0];
      return row ? rowToStepExecution(row) : null;
    },

    async getStepExecutions(runId: string): Promise<StepExecution[]> {
      const result = await query<StepExecutionRow>(
        'SELECT * FROM step_executions WHERE run_id = $1 ORDER BY started_at',
        [runId]
      );
      return result.rows.map(rowToStepExecution);
    },

    async getLatestAttempt(runId: string, stepId: string): Promise<number> {
      const result = await query<{ max_attempt: number | null }>(
        'SELECT MAX(attempt) as max_attempt FROM step_executions WHERE run_id = $1 AND step_id = $2',
        [runId, stepId]
      );
      return result.rows[0]?.max_attempt ?? 0;
    },
  };

  return repository;
}

// Legacy export for backward compatibility during migration
import { query } from '../db.js';
export const runRepository = createRunRepository({ query });
