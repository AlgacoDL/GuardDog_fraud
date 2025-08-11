-- idempo_ledger + raw_events (exact names/types)

create table if not exists idempo_ledger (
  shop_domain  text        not null,
  topic        text        not null,
  webhook_id   text        not null,
  ts           timestamptz not null default now(),
  primary key (shop_domain, topic, webhook_id)
);

create table if not exists raw_events (
  shop_domain   text,
  order_id      text,
  ts            timestamptz,
  ip_trunc      cidr,
  email_hash    text,
  device_hash   text,
  issuer_cc     text,
  billing_cc    text,
  shipping_cc   text,
  avs_result    text,
  cvv_result    text,
  amount_cents  int
);

create index if not exists idx_raw_events_shop_ts
  on raw_events (shop_domain, ts);

create index if not exists idx_raw_events_shop_order
  on raw_events (shop_domain, order_id);
