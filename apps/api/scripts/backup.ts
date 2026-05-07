/**
 * Daily backup pass.
 *
 * Snapshots Qdrant collections + copies the SQLite blob store, then
 * (optionally) uploads the result to Azure Blob Storage when running on
 * the deploy host. Designed to be cron'd from deploy/azure/backup.cron.
 *
 * Run:
 *   bun run apps/api/scripts/backup.ts                  # local-disk only
 *   AZURE_STORAGE_ACCOUNT=... bun run apps/api/scripts/backup.ts
 *
 * Env:
 *   QDRANT_URL              (default http://localhost:6333)
 *   QDRANT_API_KEY          (optional)
 *   JOBS_COLLECTION         (default jobs)
 *   USERS_COLLECTION        (default users)
 *   SQLITE_PATH             (default ./data/omnijob.sqlite)
 *   BACKUP_DIR              (default /var/lib/omnijob/backups)
 *   BACKUP_KEEP_LOCAL_DAYS  (default 7 — older local copies pruned)
 *   AZURE_STORAGE_ACCOUNT   (optional — when set, az storage blob upload-batch fires)
 *   AZURE_STORAGE_CONTAINER (default backups)
 */

import { mkdirSync, existsSync, copyFileSync, readdirSync, statSync, rmSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTIONS = [
  process.env.JOBS_COLLECTION ?? "jobs",
  process.env.USERS_COLLECTION ?? "users",
];
const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/omnijob.sqlite";
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/var/lib/omnijob/backups";
const KEEP_LOCAL_DAYS = Number(process.env.BACKUP_KEEP_LOCAL_DAYS ?? "7");
const AZURE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT;
const AZURE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER ?? "backups";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = join(BACKUP_DIR, stamp);

function qheaders(): Record<string, string> {
  return QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {};
}

async function snapshotCollection(name: string, outPath: string) {
  // Step 1: ask Qdrant to materialize a snapshot file. The response includes
  // a name like "jobs-1234-...-2026-05-06-22-58-00.snapshot".
  const res = await fetch(`${QDRANT_URL}/collections/${name}/snapshots`, {
    method: "POST",
    headers: qheaders(),
  });
  if (!res.ok) {
    throw new Error(`snapshot create ${name}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { result: { name: string } };
  const snapName = body.result.name;
  // Step 2: download it.
  const dl = await fetch(`${QDRANT_URL}/collections/${name}/snapshots/${snapName}`, {
    headers: qheaders(),
  });
  if (!dl.ok || !dl.body) {
    throw new Error(`snapshot fetch ${name}: ${dl.status}`);
  }
  await new Response(dl.body).arrayBuffer().then((buf) => {
    Bun.write(outPath, buf);
  });
  // Step 3: clean up the server-side snapshot. (Best-effort; ignore failure.)
  await fetch(`${QDRANT_URL}/collections/${name}/snapshots/${snapName}`, {
    method: "DELETE",
    headers: qheaders(),
  }).catch(() => undefined);
  return snapName;
}

function copyIfExists(src: string, dst: string): boolean {
  if (!existsSync(src)) return false;
  copyFileSync(src, dst);
  return true;
}

function pruneOldLocal() {
  if (!existsSync(BACKUP_DIR)) return;
  const cutoff = Date.now() - KEEP_LOCAL_DAYS * 86_400_000;
  for (const entry of readdirSync(BACKUP_DIR)) {
    const p = join(BACKUP_DIR, entry);
    const st = statSync(p);
    if (st.isDirectory() && st.mtimeMs < cutoff) {
      rmSync(p, { recursive: true, force: true });
      console.log(`pruned old backup ${p}`);
    }
  }
}

function uploadToAzure(localDir: string, prefix: string) {
  if (!AZURE_ACCOUNT) return;
  console.log(`uploading ${localDir} → az://${AZURE_ACCOUNT}/${AZURE_CONTAINER}/${prefix}/`);
  // az CLI authentication assumed (managed identity on the VM, or
  // `az login` for local one-offs). Container must exist in advance —
  // azure.sh creates it during provisioning.
  const r = spawnSync(
    "az",
    [
      "storage", "blob", "upload-batch",
      "--account-name", AZURE_ACCOUNT,
      "--destination", AZURE_CONTAINER,
      "--destination-path", prefix,
      "--source", localDir,
      "--auth-mode", "login",
      "--overwrite", "true",
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) {
    throw new Error(`az storage blob upload-batch exited ${r.status}`);
  }
}

async function main() {
  console.log(`omnijob backup → ${runDir}`);
  mkdirSync(runDir, { recursive: true });

  for (const c of COLLECTIONS) {
    const out = join(runDir, `${c}.snapshot`);
    const snap = await snapshotCollection(c, out);
    console.log(`  snapshot ${c}: ${snap}`);
  }

  const sqliteOut = join(runDir, "users.db");
  const copied = copyIfExists(SQLITE_PATH, sqliteOut);
  console.log(copied ? `  sqlite: ${SQLITE_PATH} → ${sqliteOut}` : `  sqlite skipped (no file at ${SQLITE_PATH})`);

  if (AZURE_ACCOUNT) {
    uploadToAzure(runDir, stamp);
  }

  pruneOldLocal();
  console.log("backup ok");
}

main().catch((err) => {
  console.error("backup failed:", err);
  process.exit(1);
});
