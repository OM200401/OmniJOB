import { Elysia, t } from "elysia";
import { randomUUIDv7 } from "bun";
import {
  ResetPasswordSchema,
  UserLoginSchema,
  UserProfileBlobOnlySchema,
  UserProfileSchema,
  UserRegisterSchema,
} from "../schemas/user";
import { stmt } from "../db/sqlite";
import { qdrant } from "../qdrant/client";
import { config } from "../config";
import { audit, ipFrom } from "../lib/audit";

const b64decode = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));
const b64encode = (b: Uint8Array) => Buffer.from(b).toString("base64");

export const users = new Elysia({ prefix: "/users" })
  .post(
    "/register",
    ({ body, status, request }) => {
      const ip = ipFrom(request.headers);
      try {
        stmt.insertUser.run(
          body.uid,
          b64decode(body.salt),
          b64decode(body.encrypted_dek),
          b64decode(body.encrypted_dek_recovery),
          Date.now(),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE")) {
          audit("register_conflict", { uid: body.uid, ip });
          return status(409, { error: "account already exists" });
        }
        throw e;
      }
      audit("register", { uid: body.uid, ip });
      return { uid: body.uid, status: "registered" };
    },
    { body: UserRegisterSchema },
  )
  .post(
    "/login",
    ({ body, status, request }) => {
      const ip = ipFrom(request.headers);
      const row = stmt.getUserCreds.get(body.uid);
      if (!row) {
        audit("login_miss", { uid: body.uid, ip });
        return status(404, { error: "no account for that email" });
      }
      audit("login", { uid: body.uid, ip });
      return {
        uid: body.uid,
        salt: b64encode(row.salt),
        encrypted_dek: b64encode(row.encrypted_dek),
      };
    },
    { body: UserLoginSchema },
  )
  .get(
    "/:uid/profile",
    ({ params, status }) => {
      const row = stmt.getProfileBlob.get(params.uid);
      if (!row) return status(404, { error: "user not found" });
      return {
        uid: params.uid,
        encrypted_profile_blob: row.encrypted_profile_blob
          ? b64encode(row.encrypted_profile_blob)
          : null,
      };
    },
    { params: t.Object({ uid: t.String({ pattern: "^[a-f0-9]{64}$" }) }) },
  )
  .get(
    "/:uid/recovery",
    ({ params, status, request }) => {
      const ip = ipFrom(request.headers);
      const row = stmt.getUserRecovery.get(params.uid);
      if (!row) {
        audit("recovery_miss", { uid: params.uid, ip });
        return status(404, { error: "no account for that email" });
      }
      audit("recovery_lookup", { uid: params.uid, ip });
      return {
        uid: params.uid,
        salt: b64encode(row.salt),
        encrypted_dek_recovery: b64encode(row.encrypted_dek_recovery),
      };
    },
    { params: t.Object({ uid: t.String({ pattern: "^[a-f0-9]{64}$" }) }) },
  )
  .post(
    "/reset-password",
    ({ body, status, request }) => {
      const ip = ipFrom(request.headers);
      // The client has decrypted the DEK using the recovery key, picked a new
      // password, derived a new master key, and re-encrypted the DEK + chosen
      // a new salt. We simply persist the new (salt, encrypted_dek). The
      // encrypted_dek_recovery and the encrypted profile blob are unchanged.
      const existing = stmt.getUserCreds.get(body.uid);
      if (!existing) {
        audit("password_reset_miss", { uid: body.uid, ip });
        return status(404, { error: "no account for that email" });
      }
      stmt.resetPassword.run(
        b64decode(body.salt),
        b64decode(body.encrypted_dek),
        body.uid,
      );
      audit("password_reset", { uid: body.uid, ip });
      return { uid: body.uid, status: "password_reset" };
    },
    { body: ResetPasswordSchema },
  )
  .post(
    "/profile",
    async ({ body, request }) => {
      const ip = ipFrom(request.headers);
      // Skill vector is stored under a random Qdrant point id, unlinked from
      // the uid. Mapping from uid → point id lives ONLY inside the encrypted
      // blob the client sends back. PROJECT.md §6.
      const skillPointId = randomUUIDv7();
      await qdrant.upsert(config.qdrant.usersCollection, {
        wait: true,
        points: [{ id: skillPointId, vector: body.skill_vector, payload: {} }],
      });

      stmt.updateProfile.run(
        b64decode(body.encrypted_profile_blob),
        skillPointId,
        body.uid,
      );
      audit("profile_save", { uid: body.uid, ip });
      return { uid: body.uid, status: "profile_saved" };
    },
    { body: UserProfileSchema },
  )
  .post(
    "/profile/blob",
    ({ body, status, request }) => {
      const ip = ipFrom(request.headers);
      const row = stmt.getProfileBlob.get(body.uid);
      if (!row) return status(404, { error: "user not found" });
      stmt.updateProfileBlob.run(b64decode(body.encrypted_profile_blob), body.uid);
      audit("profile_blob_save", { uid: body.uid, ip });
      return { uid: body.uid, status: "blob_saved" };
    },
    { body: UserProfileBlobOnlySchema },
  );
