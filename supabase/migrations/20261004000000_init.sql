-- Aviator AI Lab — initial schema
-- Experimental statistical analysis. Results are uncertain and do not
-- guarantee future outcomes or profits.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- data_sources: where rounds come from (manual, csv, authorised api/live feed, demo)
-- ---------------------------------------------------------------------------
create table if not exists public.data_sources (
  id           uuid primary key default gen_random_uuid(),
  source_name  text not null unique check (char_length(source_name) between 1 and 64),
  source_type  text not null check (source_type in ('manual', 'csv', 'api', 'live_feed', 'demo')),
  enabled      boolean not null default true,
  last_update  timestamptz,
  notes        text check (char_length(notes) <= 2000),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- aviator_rounds: one row per finished round
-- is_demo separates synthetic development data from real imported data; the
-- two are never mixed in any analysis.
-- ---------------------------------------------------------------------------
create table if not exists public.aviator_rounds (
  id          bigint generated always as identity primary key,
  multiplier  numeric(14, 2) not null check (multiplier >= 1),
  round_time  timestamptz not null,
  source      text not null default 'manual' check (char_length(source) between 1 and 64),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint aviator_rounds_unique_round unique (is_demo, round_time)
);

create index if not exists aviator_rounds_dataset_time_idx on public.aviator_rounds (is_demo, round_time desc);
create index if not exists aviator_rounds_source_idx on public.aviator_rounds (source);
create index if not exists aviator_rounds_multiplier_idx on public.aviator_rounds (is_demo, multiplier);

-- ---------------------------------------------------------------------------
-- model_runs: one row per training + chronological backtest experiment
-- Flat metric columns describe the primary >=2x target; `report` holds the
-- full per-threshold evaluation, model selection and splits.
-- ---------------------------------------------------------------------------
create table if not exists public.model_runs (
  id                  uuid primary key default gen_random_uuid(),
  model_version       text not null unique,
  is_demo             boolean not null default false,
  training_samples    integer not null check (training_samples >= 0),
  validation_samples  integer not null default 0 check (validation_samples >= 0),
  test_samples        integer not null check (test_samples >= 0),
  accuracy            double precision,
  precision           double precision,
  recall              double precision,
  roc_auc             double precision,
  brier_score         double precision,
  baseline_accuracy   double precision,
  verdict             text not null check (verdict in ('edge_detected', 'no_edge', 'insufficient_data')),
  confidence          text not null check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  report              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists model_runs_dataset_created_idx on public.model_runs (is_demo, created_at desc);

-- ---------------------------------------------------------------------------
-- predictions: probability estimates, both chronological backtest rows and
-- live next-round estimates. `result` refers to the >=2x call (p >= 0.5).
-- ---------------------------------------------------------------------------
create table if not exists public.predictions (
  id                   uuid primary key default gen_random_uuid(),
  prediction_time      timestamptz not null,
  model_version        text not null,
  model_run_id         uuid references public.model_runs (id) on delete cascade,
  kind                 text not null check (kind in ('backtest', 'live')),
  is_demo              boolean not null default false,
  based_on_round_time  timestamptz,
  probability_1_5x     double precision not null check (probability_1_5x between 0 and 1),
  probability_2x       double precision not null check (probability_2x between 0 and 1),
  probability_3x       double precision not null check (probability_3x between 0 and 1),
  probability_5x       double precision not null check (probability_5x between 0 and 1),
  probability_10x      double precision not null check (probability_10x between 0 and 1),
  baseline             jsonb,
  confidence           text not null check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  predicted_class      text not null,
  actual_multiplier    numeric(14, 2) check (actual_multiplier is null or actual_multiplier >= 1),
  result               text not null default 'pending' check (result in ('pending', 'correct', 'incorrect')),
  created_at           timestamptz not null default now()
);

create index if not exists predictions_run_idx on public.predictions (model_run_id, prediction_time);
create index if not exists predictions_dataset_kind_time_idx on public.predictions (is_demo, kind, prediction_time desc);
create index if not exists predictions_pending_idx on public.predictions (is_demo, kind) where result = 'pending';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- All writes go through the Next.js server using the service-role key (which
-- bypasses RLS). Browsers only get read access — needed for Realtime
-- subscriptions. To make the lab private, replace `anon, authenticated` with
-- `authenticated` below and add Supabase Auth to the frontend.
-- ---------------------------------------------------------------------------
alter table public.aviator_rounds enable row level security;
alter table public.predictions    enable row level security;
alter table public.model_runs     enable row level security;
alter table public.data_sources   enable row level security;

drop policy if exists "read rounds" on public.aviator_rounds;
create policy "read rounds" on public.aviator_rounds for select to anon, authenticated using (true);

drop policy if exists "read predictions" on public.predictions;
create policy "read predictions" on public.predictions for select to anon, authenticated using (true);

drop policy if exists "read model runs" on public.model_runs;
create policy "read model runs" on public.model_runs for select to anon, authenticated using (true);

-- data_sources notes may contain operational details: no public read policy.

-- No insert/update/delete policies: anon and authenticated users cannot write.
revoke insert, update, delete on public.aviator_rounds, public.predictions, public.model_runs, public.data_sources from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.aviator_rounds;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.predictions;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Default data sources
-- ---------------------------------------------------------------------------
insert into public.data_sources (source_name, source_type, enabled, notes) values
  ('manual', 'manual', true, 'Rounds entered by hand in the Data page.'),
  ('csv_import', 'csv', true, 'Historical rounds imported from CSV files.'),
  ('demo', 'demo', true, 'DEMO DATA — NOT REAL GAME RESULTS. Synthetic i.i.d. rounds for development and testing.')
on conflict (source_name) do nothing;
