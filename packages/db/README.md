# @infra/db

Drizzle schema + **versioned migrations** for Postgres.

## Schema 变更流程

```bash
# 1. 改 schema
vim schema/<domain>.ts
# 2. 生成迁移文件（migrations/NNNN_*.sql + meta/ 快照）—— 必须随 PR 提交
pnpm --filter @infra/db generate
# 3. 应用到数据库
pnpm --filter @infra/db migrate
```

- 迁移状态记录在目标库的 `drizzle.__drizzle_migrations` 表。
- `pnpm --filter @infra/db push` 仅用于本地一次性实验:它绕过迁移历史,会让库偏离
  迁移轨道。正式改动一律走 generate → migrate。
- 全新环境直接 `migrate` 即可建出全部表(含 Better Auth 所需的表)。

## 存量库 baseline(仅历史遗留场景)

`0000_tense_bloodscream.sql` 之前的库是用 `push` 建的,没有迁移记录。对这种库先确认
schema 与 0000 一致,然后手工标记 0000 已应用(数据不动):

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
);
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('1202bb517a1555abdb7b1ff3b79a02bad7a43339a8570af4dd391d8a6b4244aa', 1783077976210);
```

(hash = 0000 SQL 文件内容的 sha256;created_at = `meta/_journal.json` 里该条目的 `when`。)
本地 docker dev 库已于 2026-07-03 完成 baseline。
