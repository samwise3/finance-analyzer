-- Paycheck deductions taken out before pay is deposited (health insurance,
-- HSA, etc.). 401(k) contributions are derived from investment_accounts in
-- the app, so they are not stored here.
--
-- user_id is the Clerk user id, read from the "sub" claim of the Clerk JWT
-- that the app sends with every request.

create table if not exists public.paycheck_deductions (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null default (auth.jwt() ->> 'sub'),
  name           text not null,
  monthly_amount numeric(12, 2) not null default 0 check (monthly_amount >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists paycheck_deductions_user_id_idx
  on public.paycheck_deductions (user_id);

alter table public.paycheck_deductions enable row level security;

create policy "Users can read their own deductions"
  on public.paycheck_deductions for select
  using ((auth.jwt() ->> 'sub') = user_id);

create policy "Users can add their own deductions"
  on public.paycheck_deductions for insert
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "Users can update their own deductions"
  on public.paycheck_deductions for update
  using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "Users can delete their own deductions"
  on public.paycheck_deductions for delete
  using ((auth.jwt() ->> 'sub') = user_id);
