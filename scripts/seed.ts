import { pool, query } from '../src/storage/db.js';

async function seed() {
  console.log('Seeding test data...\n');

  // Create a test workflow
  const workflowResult = await query<{ id: string }>(`
    INSERT INTO workflows (name, slug, enabled)
    VALUES ('Test Workflow', 'test', true)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `);
  const workflowId = workflowResult.rows[0].id;
  console.log(`Created workflow: ${workflowId}`);

  // Clear existing steps for this workflow
  await query('DELETE FROM steps WHERE workflow_id = $1', [workflowId]);

  // Add steps
  const steps = [
    {
      name: 'fetch-data',
      type: 'http',
      config: {
        method: 'GET',
        url: 'https://httpbin.org/json',
      },
    },
    {
      name: 'transform-response',
      type: 'transform',
      config: {
        expression: '$.steps."fetch-data".body.slideshow.{ "title": title, "author": author }',
        outputKey: 'summary',
      },
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await query(
      `INSERT INTO steps (workflow_id, "order", name, type, config)
       VALUES ($1, $2, $3, $4, $5)`,
      [workflowId, i, step.name, step.type, JSON.stringify(step.config)]
    );
    console.log(`  Added step: ${step.name} (${step.type})`);
  }

  console.log('\nSeed complete!');
  console.log('\nTest with:');
  console.log('  curl -X POST http://localhost:3000/webhooks/test -H "Content-Type: application/json" -d \'{"test": true}\'');

  await pool.end();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
