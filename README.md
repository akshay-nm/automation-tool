# Automation Engine

A developer-first automation engine with webhook triggers and linear step execution.

```
Webhook → API → Queue (BullMQ) → Workers → PostgreSQL/Redis
```

## Features

- **Webhook triggers** with optional HMAC signature verification
- **Linear step execution**: http, transform (JSONata), ai (LM Studio), delay
- **Step-level retries** with configurable backoff (fixed, linear, exponential)
- **Idempotency** support via `X-Idempotency-Key` header
- **Dependency injection** with Awilix

## Quick Start

```bash
# Start dependencies
docker compose up -d

# Install and migrate
npm install
npm run migrate
npm run seed

# Run (3 terminals)
npm run dev           # API server
npm run dev:worker    # Execute worker
npm run dev:ai-worker # AI worker (optional)
```

## Configuration

Copy `.env.example` to `.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/automation
REDIS_URL=redis://localhost:6379
PORT=3000
LM_STUDIO_URL=http://localhost:1234/v1
```

## API Endpoints

### Webhooks
```bash
POST /webhooks/:slug              # Trigger workflow
```

### Workflows
```bash
POST   /api/v1/workflows          # Create workflow
GET    /api/v1/workflows          # List workflows
GET    /api/v1/workflows/:id      # Get workflow
PATCH  /api/v1/workflows/:id      # Update workflow
DELETE /api/v1/workflows/:id      # Delete workflow
POST   /api/v1/workflows/:id/steps         # Add step
PATCH  /api/v1/workflows/:id/steps/:stepId # Update step
DELETE /api/v1/workflows/:id/steps/:stepId # Delete step
```

### Runs
```bash
GET  /api/v1/runs                 # List runs
GET  /api/v1/runs/:id             # Get run
GET  /api/v1/runs/:id/executions  # Get step executions
POST /api/v1/runs/:id/cancel      # Cancel run
POST /api/v1/runs/:id/retry       # Retry failed run
```

## Step Types

### HTTP
```json
{
  "type": "http",
  "config": {
    "method": "POST",
    "url": "https://api.example.com/data",
    "headers": { "Authorization": "Bearer {{trigger.body.token}}" },
    "body": { "id": "{{trigger.body.id}}" }
  }
}
```

### Transform (JSONata)
```json
{
  "type": "transform",
  "config": {
    "expression": "$.steps.fetchData.body.{ \"name\": name, \"email\": email }",
    "outputKey": "user"
  }
}
```

### AI (LM Studio)
```json
{
  "type": "ai",
  "config": {
    "model": "local-model",
    "systemPrompt": "You are a helpful assistant.",
    "prompt": "Summarize: {{steps.fetchData.body.content}}",
    "outputKey": "summary"
  }
}
```

### Delay
```json
{
  "type": "delay",
  "config": {
    "durationMs": 5000
  }
}
```

## Expression Syntax

Access data via template expressions:

```
{{trigger.body.orderId}}          # Webhook payload
{{trigger.headers.authorization}} # Headers
{{steps.validate.output}}         # Previous step output
{{$now()}}                        # Current timestamp
{{$uuid()}}                       # Generate UUID
```

## Testing

```bash
npm test              # Run tests
npm run test:coverage # With coverage
npm run typecheck     # Type check
```

## Architecture

```
src/
├── api/              # Fastify routes + middleware
├── domain/           # Entities, errors, expression service
├── workers/          # Step handlers + processor
├── queue/            # BullMQ setup
├── storage/          # PostgreSQL repositories
└── container.ts      # Awilix DI container
```
