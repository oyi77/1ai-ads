-- Feature flag: when 1, autonomous mutations (auto-optimizer pause/scale, ai-agent
-- autoApply) must go through the approval workflow instead of executing live.
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('approval_required', '0', datetime('now'));
