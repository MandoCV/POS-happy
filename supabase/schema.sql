create table if not exists public.pos_happy_state (
  id integer primary key check (id = 1),
  menu jsonb not null default '[]'::jsonb,
  orders jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pos_happy_state enable row level security;

revoke all on table public.pos_happy_state from anon, authenticated;
grant all on table public.pos_happy_state to service_role;
