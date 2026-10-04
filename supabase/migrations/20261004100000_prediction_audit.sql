-- Prediction audit trail: every prediction stores the exact model inputs and
-- the end of the training window of the model that produced it, so any
-- estimate can be inspected and replayed.

alter table public.predictions
  add column if not exists features jsonb,
  add column if not exists train_end_round_time timestamptz,
  add column if not exists target_round_time timestamptz;

comment on column public.predictions.features is 'Feature snapshot fed to the model (computed only from rounds before the target round).';
comment on column public.predictions.train_end_round_time is 'round_time of the last round whose outcome the producing model was trained on.';
comment on column public.predictions.target_round_time is 'round_time of the round being predicted (null for live estimates until resolved).';

-- A prediction must never be produced by a model trained on its own target or later rounds.
alter table public.predictions drop constraint if exists predictions_no_training_leak;
alter table public.predictions add constraint predictions_no_training_leak
  check (target_round_time is null or train_end_round_time is null or train_end_round_time < target_round_time);
