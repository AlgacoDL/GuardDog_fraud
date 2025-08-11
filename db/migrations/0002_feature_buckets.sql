create table if not exists feat_velocity_hour (
  shop_domain   text        not null,
  key_type      text        not null,
  key_hash      text        not null,
  bucket_start  timestamptz not null,
  attempts      int         not null default 0,
  primary key (shop_domain, key_type, key_hash, bucket_start)
);

create index if not exists idx_feat_velocity_shop_key
  on feat_velocity_hour (shop_domain, key_type, key_hash);

-- Standardized helper name
create or replace function inc_velocity_hour(
  p_shop_domain  text,
  p_key_type     text,
  p_key_hash     text,
  p_bucket_start timestamptz,
  p_inc          int default 1
) returns void
language sql
as $fn$
  insert into feat_velocity_hour (shop_domain, key_type, key_hash, bucket_start, attempts)
  values (p_shop_domain, p_key_type, p_key_hash, date_trunc('hour', p_bucket_start), p_inc)
  on conflict (shop_domain, key_type, key_hash, bucket_start)
  do update set attempts = feat_velocity_hour.attempts + excluded.attempts;
$fn$;
