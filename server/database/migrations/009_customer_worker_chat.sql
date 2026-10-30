-- Private customer-worker chat for assigned job pairs.
-- Existing users, jobs, assignments and agreements are preserved.
BEGIN;

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON chat_messages(job_id, worker_id, id);

CREATE INDEX IF NOT EXISTS chat_messages_unread_idx
  ON chat_messages(job_id, worker_id, sender_user_id, read_at)
  WHERE read_at IS NULL;

INSERT INTO schema_migrations (version, description)
VALUES ('009_customer_worker_chat', 'Add private customer and assigned-worker chat messages')
ON CONFLICT (version) DO NOTHING;

COMMIT;
