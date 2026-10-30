-- Tâches récompensées du MVP (M-41, contrat v1.5) : clés fixes, montants et cibles paramétrables en back-office (B-08).
INSERT INTO "reward_tasks" ("key", "coins", "target", "period", "position", "is_active", "updated_at") VALUES
  ('watch_3_episodes', 5, 3, 'DAY', 1, true, now()),
  ('watch_10_episodes', 20, 10, 'WEEK', 2, true, now()),
  ('enable_notifications', 10, 1, 'ONCE', 3, true, now()),
  ('share_series', 5, 1, 'ONCE', 4, true, now()),
  ('complete_profile', 10, 1, 'ONCE', 5, true, now()),
  ('add_favorite', 5, 1, 'ONCE', 6, true, now())
ON CONFLICT ("key") DO NOTHING;
