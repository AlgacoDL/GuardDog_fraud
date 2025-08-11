create table if not exists labels_feedback (
  shop_domain text,
  order_id    text,
  label       text check (label in ('TP','FP')),
  confidence  int check (confidence between 0 and 100),
  ts          timestamptz
);

create index if not exists idx_labels_feedback_shop_order
  on labels_feedback (shop_domain, order_id);
