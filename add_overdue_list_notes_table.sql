-- Geciken görevler raporu: görev açıklamasından bağımsız notlar (opsiyonel; uygulama açılışında da oluşturulur)
CREATE TABLE IF NOT EXISTS task_overdue_list_notes (
  task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
