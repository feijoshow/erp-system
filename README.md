# Mini ERP (React + Express + Supabase)

Scalable starter architecture for a mini ERP with:
- React + Vite frontend
- Node.js + Express backend for business logic
- Supabase Postgres + Auth + Storage + RLS

## Architecture

Frontend:
- Supabase Auth session handling
- Role-aware UI permissions from `profiles.role`
- Protected routes
- ERP pages: dashboard, products, customers, orders, invoices

Backend:
- Verifies Supabase JWT from frontend
- Uses Supabase service role key for business workflows
- Handles order flow through transactional RPC: validate stock -> create order -> create order items -> reduce stock -> generate invoice -> audit log
- Handles invoice payment flow with admin-only endpoint and audit logs
- Enforces role-based API guards using profiles role
- Supports paginated list endpoints
- Supports partial invoice payments, order returns with restocking, and manual stock adjustments
- Supports return approval workflow, partial refunds, and printable payment/return receipts
- Supports return rejection workflow, refund request approvals, downloadable PDF receipts, and admin pending-refund queue

Database:
- SQL schema in `supabase/schema.sql`
- Profiles table linked to `auth.users`
- RLS policies by role (`admin`, `sales`, `inventory`)

## Project structure

- `client/` React app
- `server/` Express API
- `supabase/` SQL schema and policies

## Setup

1. Install dependencies

```bash
npm install
npm install --workspace client
npm install --workspace server
```

2. Configure environment files

- Copy `client/.env.example` to `client/.env`
- Copy `server/.env.example` to `server/.env`
- Fill in Supabase values:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

3. Apply database schema

- Open Supabase SQL Editor
- Run `supabase/schema.sql`

4. Run dev servers

```bash
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:4000

## API endpoints

All endpoints except `/api/health` require `Authorization: Bearer <supabase_access_token>`.

- `GET /api/dashboard`
- `GET /api/me`
- `GET /api/products`
- `POST /api/products`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/orders/:orderId/items`
- `POST /api/orders/:orderId/returns`
- `GET /api/orders/returns/list`
- `POST /api/orders/returns/:returnId/approve`
- `POST /api/orders/returns/:returnId/reject`
- `GET /api/invoices`
- `GET /api/invoices/:invoiceId/payments`
- `POST /api/invoices/:invoiceId/payments`
- `GET /api/invoices/:invoiceId/refunds`
- `GET /api/invoices/refunds/pending`
- `POST /api/invoices/:invoiceId/refunds`
- `POST /api/invoices/refunds/:refundId/approve`
- `POST /api/invoices/refunds/:refundId/reject`
- `POST /api/invoices/:invoiceId/pay`
- `POST /api/products/:productId/adjust-stock`

## Security Notes

- PDF receipt generation now uses lazy-loaded `pdf-lib` in the client (`client/src/lib/pdfReceipts.js`).
- `jspdf` was removed to eliminate the known `dompurify` transitive audit finding.
- Verify with: `npm audit --workspaces --include-workspace-root`.

List endpoints support query params:
- `page` (default 1)
- `pageSize` (default 20, max 100)

Error contract:
- All errors return `{ "error": { "code", "message", "details" } }`

## Role Matrix

- `admin`: full access, including marking invoices as paid
- `sales`: create customers, create orders, view invoices
- `inventory`: create products, manage stock-facing product data

UI restrictions:
- Invoice page route is only visible to `sales` and `admin`
- Create actions are hidden unless the current role is allowed

## Production Deployment

Option 1: Render (both services)
- Use `render.yaml` in the project root
- Create Blueprint deploy in Render
- Set env vars for both services:
  - API: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIENT_ORIGIN`
  - Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`
- Set `VITE_API_BASE_URL` to the API service origin, for example `https://mini-erp-api.onrender.com/api`
- Do not point `VITE_API_BASE_URL` at the static client origin, or requests will 404 on the frontend host

Option 2: Vercel + Render
- Deploy `client` to Vercel (SPA rewrite is configured in `client/vercel.json`)
- Deploy `server` to Render using `server` root directory
- Set `CLIENT_ORIGIN` in API to your Vercel URL

Container option:
- `server/Dockerfile` is included for container-based hosting

## Supabase SQL + RLS Review

Review findings addressed:
- Added transactional SQL function for order + invoice to avoid partial writes.
- Restricted execute permission on security definer function `create_order_with_invoice` to `service_role` only.
- Enforced role checks in API middleware and routes.

Remaining recommendations:
- For repeated SQL runs, convert policy/type creation into idempotent migrations (`drop ... if exists` before recreate).
- Keep service role key server-only and rotate if exposed.

## Phase 3 Setup Step

Re-run `supabase/schema.sql` in Supabase SQL Editor to create new tables/functions:
- `invoice_payments`
- `invoice_refunds`
- `order_returns`
- `order_return_items`
- `inventory_adjustments`
- `record_invoice_payment(...)`
- `record_invoice_refund(...)`
- `create_order_return(...)`
- `approve_order_return(...)`
- `reject_order_return(...)`
- `create_invoice_refund_request(...)`
- `approve_invoice_refund(...)`
- `reject_invoice_refund(...)`

## Scalability notes

- Keep business logic centralized in backend modules.
- Add a service layer as workflows grow (returns, partial payments, procurement).
- Move order creation to Postgres RPC/transaction function for strict atomicity.
- Add background jobs for async workflows (email invoices, monthly reports).
- Add caching and pagination to list endpoints.

## Upgrade roadmap

- Detailed execution guide: `docs/upgrade-roadmap.md`
