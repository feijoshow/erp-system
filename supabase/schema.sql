-- Extensions
create extension if not exists pgcrypto;

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'sales', 'inventory');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'refund_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.refund_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'return_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.return_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'order_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.order_status AS ENUM ('draft', 'submitted', 'cancelled');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'invoice_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.invoice_status AS ENUM ('unpaid', 'paid', 'overdue');
  END IF;
END
$$;

-- Core tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'sales',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  price numeric(12,2) not null check (price >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status public.order_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status public.invoice_status not null default 'unpaid',
  issued_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- Phase 3 lifecycle tables
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.order_returns add column if not exists status public.return_status not null default 'pending';
alter table public.order_returns add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.order_returns add column if not exists approved_at timestamptz;
alter table public.order_returns add column if not exists processed_at timestamptz;
alter table public.order_returns add column if not exists decision_note text;

create table if not exists public.order_return_items (
  id uuid primary key default gen_random_uuid(),
  order_return_id uuid not null references public.order_returns(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  delta_qty integer not null,
  reason text,
  adjusted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_refunds (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  refunded_by uuid references public.profiles(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  status public.refund_status not null default 'approved',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  processed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.invoice_refunds add column if not exists refunded_by uuid references public.profiles(id) on delete set null;
alter table public.invoice_refunds add column if not exists requested_by uuid references public.profiles(id) on delete set null;
alter table public.invoice_refunds add column if not exists status public.refund_status not null default 'approved';
alter table public.invoice_refunds add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.invoice_refunds add column if not exists approved_at timestamptz;
alter table public.invoice_refunds add column if not exists processed_at timestamptz;
alter table public.invoice_refunds add column if not exists note text;

-- Trigger: create profile row on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'sales')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helper functions
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.invoice_paid_amount(p_invoice_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)::numeric(12,2)
  from public.invoice_payments
  where invoice_id = p_invoice_id;
$$;

create or replace function public.invoice_refunded_amount(p_invoice_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)::numeric(12,2)
  from public.invoice_refunds
  where invoice_id = p_invoice_id and status = 'approved';
$$;

create or replace function public.invoice_net_paid_amount(p_invoice_id uuid)
returns numeric
language sql
stable
as $$
  select (public.invoice_paid_amount(p_invoice_id) - public.invoice_refunded_amount(p_invoice_id))::numeric(12,2);
$$;

create or replace function public.create_order_with_invoice(
  p_user_id uuid,
  p_customer_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_invoice_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_line_total numeric(12,2);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found';
  end if;

  insert into public.orders (customer_id, created_by, total_amount, status)
  values (p_customer_id, p_user_id, 0, 'submitted')
  returning id into v_order_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;

    select id, name, price, stock_qty
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    if not found then
      raise exception 'Product not found';
    end if;

    if v_product.stock_qty < v_qty then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;

    v_line_total := round((v_product.price * v_qty)::numeric, 2);
    v_total := v_total + v_line_total;

    insert into public.order_items (order_id, product_id, quantity, unit_price, line_total)
    values (v_order_id, v_product.id, v_qty, v_product.price, v_line_total);

    update public.products
    set stock_qty = stock_qty - v_qty
    where id = v_product.id;
  end loop;

  update public.orders
  set total_amount = v_total
  where id = v_order_id;

  insert into public.invoices (order_id, amount, status)
  values (v_order_id, v_total, 'unpaid')
  returning id into v_invoice_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'invoice_id', v_invoice_id,
    'total_amount', v_total
  );
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_net_paid numeric(12,2);
  v_balance numeric(12,2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  v_net_paid := public.invoice_net_paid_amount(p_invoice_id);

  if v_net_paid + p_amount > v_invoice.amount then
    raise exception 'Payment exceeds outstanding invoice balance';
  end if;

  insert into public.invoice_payments (invoice_id, amount, paid_by, note)
  values (p_invoice_id, p_amount, p_user_id, p_note);

  v_net_paid := public.invoice_net_paid_amount(p_invoice_id);
  v_balance := v_invoice.amount - v_net_paid;

  update public.invoices
  set
    status = case when v_balance <= 0 then 'paid' else 'unpaid' end,
    paid_at = case when v_balance <= 0 then now() else null end
  where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'net_paid_amount', v_net_paid,
    'balance_amount', greatest(v_balance, 0)
  );
end;
$$;

create or replace function public.create_order_return(
  p_order_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_item record;
  v_total_returned integer;
  v_return_id uuid;
  v_line_total numeric(12,2);
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Return quantity must be greater than zero';
  end if;

  select oi.order_id, oi.product_id, oi.unit_price, sum(oi.quantity)::integer as ordered_qty
  into v_order_item
  from public.order_items oi
  where oi.order_id = p_order_id and oi.product_id = p_product_id
  group by oi.order_id, oi.product_id, oi.unit_price;

  if not found then
    raise exception 'Order item not found for product';
  end if;

  select coalesce(sum(ri.quantity), 0)::integer
  into v_total_returned
  from public.order_return_items ri
  where ri.order_id = p_order_id and ri.product_id = p_product_id;

  if (v_order_item.ordered_qty - v_total_returned) < p_quantity then
    raise exception 'Return quantity exceeds unreturned ordered quantity';
  end if;

  v_line_total := round((v_order_item.unit_price * p_quantity)::numeric, 2);

  insert into public.order_returns (order_id, created_by, reason)
  values (p_order_id, p_user_id, p_reason)
  returning id into v_return_id;

  insert into public.order_return_items (order_return_id, order_id, product_id, quantity, unit_price, line_total)
  values (v_return_id, p_order_id, p_product_id, p_quantity, v_order_item.unit_price, v_line_total);

  return jsonb_build_object(
    'order_return_id', v_return_id,
    'order_id', p_order_id,
    'product_id', p_product_id,
    'returned_qty', p_quantity,
    'return_total', v_line_total,
    'status', 'pending'
  );
end;
$$;

create or replace function public.approve_order_return(
  p_order_return_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return record;
  v_item record;
  v_invoice_id uuid;
  v_net_paid numeric(12,2);
  v_total_refund numeric(12,2) := 0;
begin
  select * into v_return
  from public.order_returns
  where id = p_order_return_id
  for update;

  if not found then
    raise exception 'Return request not found';
  end if;

  if v_return.status <> 'pending' then
    raise exception 'Return request is already processed';
  end if;

  for v_item in
    select *
    from public.order_return_items
    where order_return_id = p_order_return_id
  loop
    update public.products
    set stock_qty = stock_qty + v_item.quantity
    where id = v_item.product_id;

    update public.orders
    set total_amount = greatest(total_amount - v_item.line_total, 0)
    where id = v_item.order_id;

    v_total_refund := v_total_refund + v_item.line_total;
  end loop;

  select id into v_invoice_id
  from public.invoices
  where order_id = v_return.order_id
  for update;

  if found then
    update public.invoices
    set amount = greatest(amount - v_total_refund, 0)
    where id = v_invoice_id;

    v_net_paid := public.invoice_net_paid_amount(v_invoice_id);

    update public.invoices
    set
      status = case when v_net_paid >= amount then 'paid' else 'unpaid' end,
      paid_at = case when v_net_paid >= amount then coalesce(paid_at, now()) else null end
    where id = v_invoice_id;
  end if;

  update public.order_returns
  set
    status = 'approved',
    approved_by = p_user_id,
    approved_at = now(),
    processed_at = now()
  where id = p_order_return_id;

  return jsonb_build_object(
    'order_return_id', p_order_return_id,
    'status', 'approved',
    'return_total', v_total_refund
  );
end;
$$;

create or replace function public.reject_order_return(
  p_order_return_id uuid,
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return record;
begin
  select * into v_return
  from public.order_returns
  where id = p_order_return_id
  for update;

  if not found then
    raise exception 'Return request not found';
  end if;

  if v_return.status <> 'pending' then
    raise exception 'Return request is already processed';
  end if;

  update public.order_returns
  set
    status = 'rejected',
    approved_by = p_user_id,
    approved_at = now(),
    processed_at = now(),
    decision_note = p_reason
  where id = p_order_return_id;

  return jsonb_build_object(
    'order_return_id', p_order_return_id,
    'status', 'rejected',
    'decision_note', p_reason
  );
end;
$$;

create or replace function public.create_invoice_refund_request(
  p_invoice_id uuid,
  p_amount numeric,
  p_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_net_paid numeric(12,2);
  v_refund_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice not found';
  end if;

  v_net_paid := public.invoice_net_paid_amount(p_invoice_id);
  if p_amount > v_net_paid then
    raise exception 'Refund exceeds net paid amount';
  end if;

  insert into public.invoice_refunds (invoice_id, amount, requested_by, status, note)
  values (p_invoice_id, p_amount, p_user_id, 'pending', p_note)
  returning id into v_refund_id;

  return jsonb_build_object(
    'refund_id', v_refund_id,
    'invoice_id', p_invoice_id,
    'status', 'pending',
    'amount', p_amount
  );
end;
$$;

create or replace function public.approve_invoice_refund(
  p_refund_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund record;
  v_net_paid numeric(12,2);
  v_balance numeric(12,2);
begin
  select * into v_refund
  from public.invoice_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund request not found';
  end if;

  if v_refund.status <> 'pending' then
    raise exception 'Refund request is already processed';
  end if;

  update public.invoice_refunds
  set
    status = 'approved',
    approved_by = p_user_id,
    refunded_by = p_user_id,
    approved_at = now(),
    processed_at = now()
  where id = p_refund_id;

  v_net_paid := public.invoice_net_paid_amount(v_refund.invoice_id);

  update public.invoices
  set
    status = case when v_net_paid >= amount then 'paid' else 'unpaid' end,
    paid_at = case when v_net_paid >= amount then coalesce(paid_at, now()) else null end
  where id = v_refund.invoice_id
  returning amount - v_net_paid into v_balance;

  return jsonb_build_object(
    'refund_id', p_refund_id,
    'invoice_id', v_refund.invoice_id,
    'status', 'approved',
    'balance_amount', greatest(v_balance, 0)
  );
end;
$$;

create or replace function public.reject_invoice_refund(
  p_refund_id uuid,
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund record;
begin
  select * into v_refund
  from public.invoice_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund request not found';
  end if;

  if v_refund.status <> 'pending' then
    raise exception 'Refund request is already processed';
  end if;

  update public.invoice_refunds
  set
    status = 'rejected',
    approved_by = p_user_id,
    approved_at = now(),
    processed_at = now(),
    note = coalesce(v_refund.note, '') || case when p_reason is null or p_reason = '' then '' else (' | Rejection: ' || p_reason) end
  where id = p_refund_id;

  return jsonb_build_object(
    'refund_id', p_refund_id,
    'invoice_id', v_refund.invoice_id,
    'status', 'rejected'
  );
end;
$$;

create or replace function public.record_invoice_refund(
  p_invoice_id uuid,
  p_amount numeric,
  p_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_net_paid numeric(12,2);
  v_balance numeric(12,2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  v_net_paid := public.invoice_net_paid_amount(p_invoice_id);

  if p_amount > v_net_paid then
    raise exception 'Refund exceeds net paid amount';
  end if;

  insert into public.invoice_refunds (invoice_id, amount, refunded_by, note)
  values (p_invoice_id, p_amount, p_user_id, p_note);

  v_net_paid := public.invoice_net_paid_amount(p_invoice_id);
  v_balance := v_invoice.amount - v_net_paid;

  update public.invoices
  set
    status = case when v_balance <= 0 then 'paid' else 'unpaid' end,
    paid_at = case when v_balance <= 0 then now() else null end
  where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'net_paid_amount', v_net_paid,
    'balance_amount', greatest(v_balance, 0)
  );
end;
$$;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.invoices enable row level security;
alter table public.activity_logs enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.order_returns enable row level security;
alter table public.order_return_items enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.invoice_refunds enable row level security;

-- Profile policies
drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Product policies
drop policy if exists "authenticated can read products" on public.products;
create policy "authenticated can read products"
on public.products
for select
to authenticated
using (true);

drop policy if exists "inventory and admin can modify products" on public.products;
create policy "inventory and admin can modify products"
on public.products
for all
to authenticated
using (public.current_user_role() in ('inventory', 'admin'))
with check (public.current_user_role() in ('inventory', 'admin'));

-- Customer policies
drop policy if exists "authenticated can read customers" on public.customers;
create policy "authenticated can read customers"
on public.customers
for select
to authenticated
using (true);

drop policy if exists "sales and admin can modify customers" on public.customers;
create policy "sales and admin can modify customers"
on public.customers
for all
to authenticated
using (public.current_user_role() in ('sales', 'admin'))
with check (public.current_user_role() in ('sales', 'admin'));

-- Orders policies
drop policy if exists "authenticated can read orders" on public.orders;
create policy "authenticated can read orders"
on public.orders
for select
to authenticated
using (true);

drop policy if exists "sales and admin can create orders" on public.orders;
create policy "sales and admin can create orders"
on public.orders
for insert
to authenticated
with check (public.current_user_role() in ('sales', 'admin'));

-- Order items policies
drop policy if exists "authenticated can read order items" on public.order_items;
create policy "authenticated can read order items"
on public.order_items
for select
to authenticated
using (true);

drop policy if exists "sales and admin can manage order items" on public.order_items;
create policy "sales and admin can manage order items"
on public.order_items
for all
to authenticated
using (public.current_user_role() in ('sales', 'admin'))
with check (public.current_user_role() in ('sales', 'admin'));

-- Invoice policies
drop policy if exists "authenticated can read invoices" on public.invoices;
create policy "authenticated can read invoices"
on public.invoices
for select
to authenticated
using (true);

drop policy if exists "admin can manage invoices" on public.invoices;
create policy "admin can manage invoices"
on public.invoices
for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Activity log policies
drop policy if exists "admin can read logs" on public.activity_logs;
create policy "admin can read logs"
on public.activity_logs
for select
to authenticated
using (public.current_user_role() = 'admin');

-- Invoice payment policies
drop policy if exists "sales and admin can read invoice payments" on public.invoice_payments;
create policy "sales and admin can read invoice payments"
on public.invoice_payments
for select
to authenticated
using (public.current_user_role() in ('sales', 'admin'));

drop policy if exists "sales and admin can create invoice payments" on public.invoice_payments;
create policy "sales and admin can create invoice payments"
on public.invoice_payments
for insert
to authenticated
with check (public.current_user_role() in ('sales', 'admin'));

-- Return policies
drop policy if exists "sales and admin can read order returns" on public.order_returns;
create policy "sales and admin can read order returns"
on public.order_returns
for select
to authenticated
using (public.current_user_role() in ('sales', 'admin'));

drop policy if exists "sales and admin can create order returns" on public.order_returns;
create policy "sales and admin can create order returns"
on public.order_returns
for insert
to authenticated
with check (public.current_user_role() in ('sales', 'admin'));

drop policy if exists "admin can approve order returns" on public.order_returns;
create policy "admin can approve order returns"
on public.order_returns
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "sales and admin can read order return items" on public.order_return_items;
create policy "sales and admin can read order return items"
on public.order_return_items
for select
to authenticated
using (public.current_user_role() in ('sales', 'admin'));

drop policy if exists "sales and admin can create order return items" on public.order_return_items;
create policy "sales and admin can create order return items"
on public.order_return_items
for insert
to authenticated
with check (public.current_user_role() in ('sales', 'admin'));

-- Stock adjustment policies
drop policy if exists "inventory and admin can read stock adjustments" on public.inventory_adjustments;
create policy "inventory and admin can read stock adjustments"
on public.inventory_adjustments
for select
to authenticated
using (public.current_user_role() in ('inventory', 'admin'));

drop policy if exists "inventory and admin can create stock adjustments" on public.inventory_adjustments;
create policy "inventory and admin can create stock adjustments"
on public.inventory_adjustments
for insert
to authenticated
with check (public.current_user_role() in ('inventory', 'admin'));

-- Refund policies
drop policy if exists "sales and admin can read invoice refunds" on public.invoice_refunds;
create policy "sales and admin can read invoice refunds"
on public.invoice_refunds
for select
to authenticated
using (public.current_user_role() in ('sales', 'admin'));

drop policy if exists "admin can create invoice refunds" on public.invoice_refunds;
create policy "admin can create invoice refunds"
on public.invoice_refunds
for insert
to authenticated
with check (public.current_user_role() = 'admin');

drop policy if exists "sales and admin can create invoice refund requests" on public.invoice_refunds;
create policy "sales and admin can create invoice refund requests"
on public.invoice_refunds
for insert
to authenticated
with check (public.current_user_role() in ('sales', 'admin'));

drop policy if exists "admin can update invoice refunds" on public.invoice_refunds;
create policy "admin can update invoice refunds"
on public.invoice_refunds
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Indexes
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_activity_logs_entity on public.activity_logs(entity_type, entity_id);

-- Procurement extension
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'purchase_order_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.purchase_order_status AS ENUM ('pending', 'pending_approval', 'approved', 'partial_received', 'received', 'cancelled');
  END IF;
END
$$;

DO $$
BEGIN
  ALTER TYPE public.purchase_order_status ADD VALUE IF NOT EXISTS 'pending_approval';
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE public.purchase_order_status ADD VALUE IF NOT EXISTS 'partial_received';
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  phone text,
  lead_time_days integer not null default 7 check (lead_time_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  status public.purchase_order_status not null default 'pending',
  expected_date date,
  notes text,
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  received_at timestamptz
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  received_qty integer not null default 0 check (received_qty >= 0),
  unit_cost numeric(12,2) not null check (unit_cost > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index if not exists idx_suppliers_name on public.suppliers(name);
create index if not exists idx_purchase_orders_status on public.purchase_orders(status, created_at);
create index if not exists idx_purchase_order_items_po on public.purchase_order_items(purchase_order_id);

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "inventory and admin can read suppliers" on public.suppliers;
create policy "inventory and admin can read suppliers"
on public.suppliers
for select
to authenticated
using (public.current_user_role() in ('inventory', 'admin'));

drop policy if exists "inventory and admin can create suppliers" on public.suppliers;
create policy "inventory and admin can create suppliers"
on public.suppliers
for insert
to authenticated
with check (public.current_user_role() in ('inventory', 'admin'));

drop policy if exists "inventory and admin can read purchase orders" on public.purchase_orders;
create policy "inventory and admin can read purchase orders"
on public.purchase_orders
for select
to authenticated
using (public.current_user_role() in ('inventory', 'admin'));

drop policy if exists "inventory and admin can manage purchase orders" on public.purchase_orders;
create policy "inventory and admin can manage purchase orders"
on public.purchase_orders
for all
to authenticated
using (public.current_user_role() in ('inventory', 'admin'))
with check (public.current_user_role() in ('inventory', 'admin'));

drop policy if exists "inventory and admin can read purchase order items" on public.purchase_order_items;
create policy "inventory and admin can read purchase order items"
on public.purchase_order_items
for select
to authenticated
using (public.current_user_role() in ('inventory', 'admin'));

drop policy if exists "inventory and admin can manage purchase order items" on public.purchase_order_items;
create policy "inventory and admin can manage purchase order items"
on public.purchase_order_items
for all
to authenticated
using (public.current_user_role() in ('inventory', 'admin'))
with check (public.current_user_role() in ('inventory', 'admin'));
create index if not exists idx_invoice_payments_invoice_id on public.invoice_payments(invoice_id);
create index if not exists idx_order_return_items_order_id on public.order_return_items(order_id);
create index if not exists idx_inventory_adjustments_product_id on public.inventory_adjustments(product_id);
create index if not exists idx_order_returns_status on public.order_returns(status);
create index if not exists idx_invoice_refunds_invoice_id on public.invoice_refunds(invoice_id);

-- Function permissions
revoke all on function public.create_order_with_invoice(uuid, uuid, jsonb) from public;
revoke all on function public.create_order_with_invoice(uuid, uuid, jsonb) from anon;
revoke all on function public.create_order_with_invoice(uuid, uuid, jsonb) from authenticated;
grant execute on function public.create_order_with_invoice(uuid, uuid, jsonb) to service_role;

revoke all on function public.record_invoice_payment(uuid, numeric, uuid, text) from public;
revoke all on function public.record_invoice_payment(uuid, numeric, uuid, text) from anon;
revoke all on function public.record_invoice_payment(uuid, numeric, uuid, text) from authenticated;
grant execute on function public.record_invoice_payment(uuid, numeric, uuid, text) to service_role;

revoke all on function public.create_order_return(uuid, uuid, integer, uuid, text) from public;
revoke all on function public.create_order_return(uuid, uuid, integer, uuid, text) from anon;
revoke all on function public.create_order_return(uuid, uuid, integer, uuid, text) from authenticated;
grant execute on function public.create_order_return(uuid, uuid, integer, uuid, text) to service_role;

revoke all on function public.reject_order_return(uuid, uuid, text) from public;
revoke all on function public.reject_order_return(uuid, uuid, text) from anon;
revoke all on function public.reject_order_return(uuid, uuid, text) from authenticated;
grant execute on function public.reject_order_return(uuid, uuid, text) to service_role;

revoke all on function public.create_invoice_refund_request(uuid, numeric, uuid, text) from public;
revoke all on function public.create_invoice_refund_request(uuid, numeric, uuid, text) from anon;
revoke all on function public.create_invoice_refund_request(uuid, numeric, uuid, text) from authenticated;
grant execute on function public.create_invoice_refund_request(uuid, numeric, uuid, text) to service_role;

revoke all on function public.approve_invoice_refund(uuid, uuid) from public;
revoke all on function public.approve_invoice_refund(uuid, uuid) from anon;
revoke all on function public.approve_invoice_refund(uuid, uuid) from authenticated;
grant execute on function public.approve_invoice_refund(uuid, uuid) to service_role;

revoke all on function public.reject_invoice_refund(uuid, uuid, text) from public;
revoke all on function public.reject_invoice_refund(uuid, uuid, text) from anon;
revoke all on function public.reject_invoice_refund(uuid, uuid, text) from authenticated;
grant execute on function public.reject_invoice_refund(uuid, uuid, text) to service_role;

revoke all on function public.approve_order_return(uuid, uuid) from public;
revoke all on function public.approve_order_return(uuid, uuid) from anon;
revoke all on function public.approve_order_return(uuid, uuid) from authenticated;
grant execute on function public.approve_order_return(uuid, uuid) to service_role;

revoke all on function public.record_invoice_refund(uuid, numeric, uuid, text) from public;
revoke all on function public.record_invoice_refund(uuid, numeric, uuid, text) from anon;
revoke all on function public.record_invoice_refund(uuid, numeric, uuid, text) from authenticated;
grant execute on function public.record_invoice_refund(uuid, numeric, uuid, text) to service_role;

