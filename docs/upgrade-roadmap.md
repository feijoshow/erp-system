# Mini ERP Upgrade Roadmap (Execution Guide)

This guide translates the roadmap into implementation tasks tied to the current codebase.

## Phase 1: Maintainability and Architecture

Target: 2-3 weeks

### 1. Service Layer Refactor

Status:
- Completed for products module.

Completed files:
- `server/src/services/productService.js`
- `server/src/modules/products/products.routes.js`

Pattern:
- Route handlers do request parsing + auth checks.
- Service functions own business logic, DB writes, and audit calls.

Next domains:
- `orders`
- `invoices`
- `customers`
- `dashboard`

### 2. Zod Contract Modules

Status:
- Completed for products module.

Completed files:
- `server/src/schemas/products.schemas.js`

Pattern:
- One schema file per domain in `server/src/schemas/`.
- Request validation remains at route boundary.

### 3. Typed Error Hierarchy

Status:
- Completed baseline classes.

Completed files:
- `server/src/utils/appError.js`

Available classes:
- `ValidationError`
- `NotFoundError`
- `ForbiddenError`
- `ConflictError`
- `StockError`

Usage rule:
- Services throw typed errors.
- Error middleware serializes to `{ error: { code, message, details } }`.

### 4. Shared Types Package

Status:
- Scaffolded and added to workspaces.

Completed files:
- `packages/types/package.json`
- `packages/types/tsconfig.json`
- `packages/types/src/index.ts`
- `package.json` workspace registration

Adoption path:
1. Add TypeScript to server/client incrementally.
2. Replace duplicated response shape declarations with imports from `@mini-erp/types`.
3. Add a build script that emits declaration files from `packages/types`.

### 5. Testing Baseline

Status:
- Pending.

Recommended first tasks:
- Add Vitest to `server` and create service unit tests with mocked Supabase client.
- Add contract tests for product service and route validation paths.

## Phase 2: Analytics Dashboard

Target: 1-2 weeks

Backend:
- Add `/api/analytics` (admin only).
- Back by SQL views/materialized views:
  - `revenue_by_month`
  - `top_products`
  - `order_status_breakdown`
  - `stock_health`

Frontend:
- Add analytics page using Recharts.

## Phase 3: Email Notifications

Target: 1-2 weeks

- Add `NotificationService` in `server/src/services/`.
- Use provider API key from environment (`RESEND_API_KEY`).
- Add templates in `server/src/emails/`.
- Trigger sends from existing business workflow completion points.

## Phase 4: Procurement / Purchase Orders

Target: 2-3 weeks

- Add supplier and purchase order tables and routes.
- Add receive flow that updates stock through RPC.
- Add inventory/admin role checks.

## Phase 5: Multi-Warehouse

Target: 3-4 weeks

- Add `warehouses` and `product_stock` tables.
- Migrate `products.stock_qty` into per-warehouse stock records.
- Update order/stock adjustment flows to require `warehouse_id`.
