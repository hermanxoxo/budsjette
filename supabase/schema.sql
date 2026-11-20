-- Budsjette: tabell for synkronisering mellom enheter.
-- Kjøres én gang i Supabase: SQL Editor → New query → lim inn → Run.
--
-- Hele appens data ligger som ett JSON-dokument per bruker.
-- `revision` økes ved hver skriving, slik at appen oppdager når en annen
-- enhet har skrevet i mellomtiden og kan slå sammen endringene.

create table if not exists public.budsjette_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null,
  revision   bigint      not null default 1,
  updated_at timestamptz not null default now()
);

-- Row Level Security: hver bruker ser og endrer bare sin egen rad.
alter table public.budsjette_state enable row level security;

drop policy if exists "Egen rad – les"      on public.budsjette_state;
drop policy if exists "Egen rad – opprett"  on public.budsjette_state;
drop policy if exists "Egen rad – oppdater" on public.budsjette_state;

create policy "Egen rad – les" on public.budsjette_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Egen rad – opprett" on public.budsjette_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Egen rad – oppdater" on public.budsjette_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Ingen anonym tilgang i det hele tatt.
revoke all on public.budsjette_state from anon;
grant select, insert, update on public.budsjette_state to authenticated;
