# Session Tablosu Hatası Çözümü

## 🔴 Hata: "relation 'session' does not exist"

Bu hata, PostgreSQL session store için gerekli `session` tablosunun oluşturulmadığı anlamına gelir.

## ✅ Çözüm: Session Tablosunu Oluşturun

### Yöntem 1: SQL Dosyası ile (Önerilen)

1. **PostgreSQL'e bağlanın:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d task_manager
```

Şifrenizi girin.

2. **SQL dosyasını çalıştırın:**

```sql
\i create_session_table.sql
```

**Veya manuel olarak:**

```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

3. **Çıkış:**

```sql
\q
```

---

### Yöntem 2: pgAdmin 4 ile (GUI)

1. **pgAdmin 4**'ü açın
2. **Servers** → **PostgreSQL 18** → **Databases** → **task_manager** → **Schemas** → **public** → **Tables**
3. Sağ tık → **Query Tool**
4. Şu SQL'i çalıştırın:

```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

5. **Execute** (F5) tıklayın

---

## ✅ Tablo Oluşturulduktan Sonra

1. **Uygulamayı yeniden başlatın:**

```bash
npm start
```

2. **Tarayıcıda test edin:**

```
http://localhost:3000
```

---

## 🔍 Tablo Kontrolü

Tablonun oluşturulduğunu kontrol etmek için:

```sql
\dt
```

Veya:

```sql
SELECT * FROM session;
```

---

## 📝 Not

Bu tablo `connect-pg-simple` paketi tarafından otomatik oluşturulmaz. İlk kurulumda manuel olarak oluşturmanız gerekir.








