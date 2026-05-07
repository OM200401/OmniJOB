import { Database } from "bun:sqlite";
import { config } from "../config";

export const db = new Database(config.sqlite.path, { create: true });
db.exec("PRAGMA journal_mode = WAL;");

export function isReachable(): boolean {
  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

export type UserRow = {
  uid: string;
  salt: Uint8Array;
  encrypted_dek: Uint8Array;
  encrypted_dek_recovery: Uint8Array;
  encrypted_profile_blob: Uint8Array | null;
  skill_point_id: string | null;
  created_at: number;
};

export const stmt = {
  insertUser: db.prepare<
    void,
    [string, Uint8Array, Uint8Array, Uint8Array, number]
  >(
    `INSERT INTO users (uid, salt, encrypted_dek, encrypted_dek_recovery, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  getUserCreds: db.prepare<
    Pick<UserRow, "salt" | "encrypted_dek">,
    [string]
  >(`SELECT salt, encrypted_dek FROM users WHERE uid = ?`),
  getUserRecovery: db.prepare<
    Pick<UserRow, "salt" | "encrypted_dek_recovery">,
    [string]
  >(`SELECT salt, encrypted_dek_recovery FROM users WHERE uid = ?`),
  getProfileBlob: db.prepare<
    { encrypted_profile_blob: Uint8Array | null },
    [string]
  >(`SELECT encrypted_profile_blob FROM users WHERE uid = ?`),
  updateProfile: db.prepare<
    void,
    [Uint8Array, string, string]
  >(
    `UPDATE users SET encrypted_profile_blob = ?, skill_point_id = ? WHERE uid = ?`,
  ),
  updateProfileBlob: db.prepare<
    void,
    [Uint8Array, string]
  >(
    `UPDATE users SET encrypted_profile_blob = ? WHERE uid = ?`,
  ),
  resetPassword: db.prepare<
    void,
    [Uint8Array, Uint8Array, string]
  >(
    `UPDATE users SET salt = ?, encrypted_dek = ? WHERE uid = ?`,
  ),
};
