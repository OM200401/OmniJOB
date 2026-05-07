import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import * as vault from "./crypto/vault";
import {
  b64decode,
  b64encode,
  formatRecoveryKey,
  uidFromEmail,
} from "./crypto/util";

export type Session = {
  uid: string;
  email: string;
  masterKey: Uint8Array;
  dek: Uint8Array;
  profile: vault.ProfileBlob;
};

export type SignUpResult = {
  uid: string;
  recoveryKey: string; // formatted display string, shown once
};

type AuthCtx = {
  session: Session | null;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  saveProfile: (next: vault.ProfileBlob) => Promise<void>;
  patchProfile: (patch: Partial<vault.ProfileBlob>) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const uid = await uidFromEmail(email);
    const r = await vault.register(password);
    try {
      await api.registerUser(
        uid,
        b64encode(r.salt),
        b64encode(r.encryptedDek),
        b64encode(r.encryptedDekRecovery),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        throw new Error("An account already exists for that email. Try signing in instead.");
      }
      throw e;
    }
    setSession({
      uid,
      email,
      masterKey: r.masterKey,
      dek: r.dek,
      profile: vault.emptyProfile(email),
    });
    return { uid, recoveryKey: formatRecoveryKey(r.recoveryKey) };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const uid = await uidFromEmail(email);
    let creds: Awaited<ReturnType<typeof api.loginUser>>;
    try {
      creds = await api.loginUser(uid);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        throw new Error("No account found for that email.");
      }
      throw e;
    }
    let unlocked: Awaited<ReturnType<typeof vault.unlock>>;
    try {
      unlocked = await vault.unlock(
        password,
        b64decode(creds.salt),
        b64decode(creds.encrypted_dek),
      );
    } catch {
      throw new Error("Incorrect password.");
    }
    let profile = vault.emptyProfile(email);
    try {
      const blobRes = await api.getProfileBlob(uid);
      if (blobRes.encrypted_profile_blob) {
        profile = await vault.decryptProfile(
          unlocked.dek,
          b64decode(blobRes.encrypted_profile_blob),
          email,
        );
      }
    } catch {
      // missing profile is fine — user hasn't onboarded yet
    }
    setSession({
      uid,
      email,
      masterKey: unlocked.masterKey,
      dek: unlocked.dek,
      profile,
    });
  }, []);

  const signOut = useCallback(() => setSession(null), []);

  const saveProfile = useCallback(async (next: vault.ProfileBlob) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated = { ...next, updatedAt: Date.now() };
      void persistProfile(prev, updated);
      return { ...prev, profile: updated };
    });
  }, []);

  const patchProfile = useCallback(async (patch: Partial<vault.ProfileBlob>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated: vault.ProfileBlob = { ...prev.profile, ...patch, updatedAt: Date.now() };
      void persistProfile(prev, updated, /* blobOnly */ !patch.skillVector);
      return { ...prev, profile: updated };
    });
  }, []);

  const value = useMemo(
    () => ({ session, signUp, signIn, signOut, saveProfile, patchProfile }),
    [session, signUp, signIn, signOut, saveProfile, patchProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

async function persistProfile(
  s: Session,
  next: vault.ProfileBlob,
  blobOnly = false,
): Promise<void> {
  const encrypted = await vault.encryptProfile(s.dek, next);
  const b64 = b64encode(encrypted);
  if (blobOnly || !next.skillVector.length) {
    await api.saveProfileBlob(s.uid, b64);
  } else {
    await api.saveProfile(s.uid, b64, next.skillVector);
  }
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
