import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../src/config";

mkdirSync(dirname(config.sqlite.path), { recursive: true });

const db = new Database(config.sqlite.path, { create: true });
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid                     TEXT PRIMARY KEY,
    salt                    BLOB NOT NULL,
    encrypted_dek           BLOB NOT NULL,        -- DEK encrypted with password-derived master key
    encrypted_dek_recovery  BLOB NOT NULL,        -- DEK encrypted with the recovery key
    encrypted_profile_blob  BLOB,
    skill_point_id          TEXT,
    created_at              INTEGER NOT NULL
  );
`);

console.log(`✓ users table ready at ${config.sqlite.path}`);
db.close();
