import type pg from 'pg';
import type {
  Workflow,
  Step,
  CreateWorkflowInput,
  CreateStepInput,
  StepConfig,
} from '../../domain/entities/workflow.js';
import type { RetryPolicy } from '../../domain/entities/workflow.js';

interface WorkflowRow {
  id: string;
  name: string;
  slug: string;
  webhook_secret: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

interface StepRow {
  id: string;
  workflow_id: string;
  order: number;
  name: string;
  type: string;
  config: StepConfig;
  retry_policy: RetryPolicy | null;
  timeout_ms: number | null;
  enabled: boolean;
}

function rowToWorkflow(row: WorkflowRow, steps: Step[] = []): Workflow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    webhookSecret: row.webhook_secret ?? undefined,
    enabled: row.enabled,
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStep(row: StepRow): Step {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    order: row.order,
    name: row.name,
    type: row.type as Step['type'],
    config: row.config,
    retryPolicy: row.retry_policy ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
    enabled: row.enabled,
  };
}

// Repository interface for type safety and DI
export interface WorkflowRepository {
  create(input: CreateWorkflowInput): Promise<Workflow>;
  findById(id: string): Promise<Workflow | null>;
  findBySlug(slug: string): Promise<Workflow | null>;
  list(options?: { enabled?: boolean; limit?: number; offset?: number }): Promise<Workflow[]>;
  update(
    id: string,
    updates: Partial<Pick<Workflow, 'name' | 'webhookSecret' | 'enabled'>>
  ): Promise<Workflow | null>;
  delete(id: string): Promise<boolean>;
  addStep(workflowId: string, input: CreateStepInput): Promise<Step>;
  updateStep(stepId: string, updates: Partial<Omit<CreateStepInput, 'type'>>): Promise<Step | null>;
  deleteStep(stepId: string): Promise<boolean>;
  reorderSteps(workflowId: string, stepIds: string[]): Promise<void>;
}

// Dependencies interface for DI
interface WorkflowRepositoryDeps {
  query: <T extends pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<pg.QueryResult<T>>;
  withTransaction: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>;
}

// Factory function for dependency injection
export function createWorkflowRepository(deps: WorkflowRepositoryDeps): WorkflowRepository {
  const { query, withTransaction } = deps;

  const repository: WorkflowRepository = {
    async create(input: CreateWorkflowInput): Promise<Workflow> {
      const result = await query<WorkflowRow>(
        `INSERT INTO workflows (name, slug, webhook_secret, enabled)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.name, input.slug, input.webhookSecret ?? null, input.enabled]
      );
      const row = result.rows[0];
      if (!row) throw new Error('Failed to create workflow');
      return rowToWorkflow(row);
    },

    async findById(id: string): Promise<Workflow | null> {
      const workflowResult = await query<WorkflowRow>(
        'SELECT * FROM workflows WHERE id = $1',
        [id]
      );
      const row = workflowResult.rows[0];
      if (!row) return null;

      const stepsResult = await query<StepRow>(
        'SELECT * FROM steps WHERE workflow_id = $1 ORDER BY "order"',
        [id]
      );
      const steps = stepsResult.rows.map(rowToStep);

      return rowToWorkflow(row, steps);
    },

    async findBySlug(slug: string): Promise<Workflow | null> {
      const workflowResult = await query<WorkflowRow>(
        'SELECT * FROM workflows WHERE slug = $1',
        [slug]
      );
      const row = workflowResult.rows[0];
      if (!row) return null;

      const stepsResult = await query<StepRow>(
        'SELECT * FROM steps WHERE workflow_id = $1 ORDER BY "order"',
        [row.id]
      );
      const steps = stepsResult.rows.map(rowToStep);

      return rowToWorkflow(row, steps);
    },

    async list(options?: { enabled?: boolean; limit?: number; offset?: number }): Promise<Workflow[]> {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (options?.enabled !== undefined) {
        conditions.push(`enabled = $${paramIndex++}`);
        values.push(options.enabled);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;

      const result = await query<WorkflowRow>(
        `SELECT * FROM workflows ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      return result.rows.map(row => rowToWorkflow(row));
    },

    async update(
      id: string,
      updates: Partial<Pick<Workflow, 'name' | 'webhookSecret' | 'enabled'>>
    ): Promise<Workflow | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        sets.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.webhookSecret !== undefined) {
        sets.push(`webhook_secret = $${paramIndex++}`);
        values.push(updates.webhookSecret);
      }
      if (updates.enabled !== undefined) {
        sets.push(`enabled = $${paramIndex++}`);
        values.push(updates.enabled);
      }

      if (sets.length === 0) {
        return repository.findById(id);
      }

      values.push(id);
      const result = await query<WorkflowRow>(
        `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const row = result.rows[0];
      if (!row) return null;

      const stepsResult = await query<StepRow>(
        'SELECT * FROM steps WHERE workflow_id = $1 ORDER BY "order"',
        [id]
      );
      return rowToWorkflow(row, stepsResult.rows.map(rowToStep));
    },

    async delete(id: string): Promise<boolean> {
      const result = await query('DELETE FROM workflows WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    },

    async addStep(workflowId: string, input: CreateStepInput): Promise<Step> {
      return withTransaction(async (client) => {
        const orderResult = await client.query<{ max_order: number | null }>(
          'SELECT MAX("order") as max_order FROM steps WHERE workflow_id = $1',
          [workflowId]
        );
        const nextOrder = (orderResult.rows[0]?.max_order ?? -1) + 1;

        const result = await client.query<StepRow>(
          `INSERT INTO steps (workflow_id, "order", name, type, config, retry_policy, timeout_ms, enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            workflowId,
            nextOrder,
            input.name,
            input.type,
            JSON.stringify(input.config),
            input.retryPolicy ? JSON.stringify(input.retryPolicy) : null,
            input.timeoutMs ?? null,
            input.enabled,
          ]
        );

        const row = result.rows[0];
        if (!row) throw new Error('Failed to create step');
        return rowToStep(row);
      });
    },

    async updateStep(
      stepId: string,
      updates: Partial<Omit<CreateStepInput, 'type'>>
    ): Promise<Step | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        sets.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.config !== undefined) {
        sets.push(`config = $${paramIndex++}`);
        values.push(JSON.stringify(updates.config));
      }
      if (updates.retryPolicy !== undefined) {
        sets.push(`retry_policy = $${paramIndex++}`);
        values.push(JSON.stringify(updates.retryPolicy));
      }
      if (updates.timeoutMs !== undefined) {
        sets.push(`timeout_ms = $${paramIndex++}`);
        values.push(updates.timeoutMs);
      }
      if (updates.enabled !== undefined) {
        sets.push(`enabled = $${paramIndex++}`);
        values.push(updates.enabled);
      }

      if (sets.length === 0) {
        const result = await query<StepRow>('SELECT * FROM steps WHERE id = $1', [stepId]);
        const row = result.rows[0];
        return row ? rowToStep(row) : null;
      }

      values.push(stepId);
      const result = await query<StepRow>(
        `UPDATE steps SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const row = result.rows[0];
      return row ? rowToStep(row) : null;
    },

    async deleteStep(stepId: string): Promise<boolean> {
      return withTransaction(async (client) => {
        const stepResult = await client.query<StepRow>(
          'SELECT * FROM steps WHERE id = $1',
          [stepId]
        );
        const step = stepResult.rows[0];
        if (!step) return false;

        await client.query('DELETE FROM steps WHERE id = $1', [stepId]);

        await client.query(
          `UPDATE steps SET "order" = "order" - 1
           WHERE workflow_id = $1 AND "order" > $2`,
          [step.workflow_id, step.order]
        );

        return true;
      });
    },

    async reorderSteps(workflowId: string, stepIds: string[]): Promise<void> {
      await withTransaction(async (client) => {
        for (let i = 0; i < stepIds.length; i++) {
          await client.query(
            'UPDATE steps SET "order" = $1 WHERE id = $2 AND workflow_id = $3',
            [i, stepIds[i], workflowId]
          );
        }
      });
    },
  };

  return repository;
}

// Legacy export for backward compatibility during migration
import { query, withTransaction } from '../db.js';
export const workflowRepository = createWorkflowRepository({ query, withTransaction });
