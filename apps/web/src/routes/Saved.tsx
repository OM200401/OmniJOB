import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ExternalLink } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, type JobMetadata } from "../lib/api";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";

type SavedJob = { id: string; meta: JobMetadata | null; missing?: boolean };

export function Saved() {
  const { session, patchProfile } = useAuth();
  const [items, setItems] = useState<SavedJob[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ids = session?.profile.savedJobIds ?? [];

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    Promise.all(
      ids.map((id) =>
        api
          .getJob(id)
          .then((r): SavedJob => ({ id, meta: r.payload }))
          .catch((): SavedJob => ({ id, meta: null, missing: true })),
      ),
    ).then((res) => {
      if (!cancelled) setItems(res);
    }).catch((e) => {
      if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [ids.join("|")]); // refire when set changes

  const remove = useCallback(
    (id: string) => {
      if (!session) return;
      void patchProfile({
        savedJobIds: session.profile.savedJobIds.filter((x) => x !== id),
      });
    },
    [session, patchProfile],
  );

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Saved jobs</h1>
          <p className="muted text-sm">
            Stored inside your encrypted profile blob - server only sees ciphertext.
          </p>
        </div>
      </div>

      {err && <Alert variant="error">{err}</Alert>}

      {items && items.length === 0 && (
        <EmptyState
          icon={<Bookmark size={20} />}
          title="Nothing saved yet"
          description="Hit the bookmark icon on any match to keep it here for later."
        />
      )}

      <div className="results">
        {items?.map((it) => (
          <div className="card card-hover job-card" key={it.id}>
            {it.meta ? (
              <Link to={`/jobs/${encodeURIComponent(it.id)}`} style={{ textDecoration: "none", color: "inherit", display: "contents" }}>
                <div>
                  <div className="title-row">
                    <span className="title">{it.meta.title}</span>
                  </div>
                  <div className="meta">
                    <span>{it.meta.company}</span>
                    {it.meta.location && (
                      <>
                        <span className="meta-dot" />
                        <span>{it.meta.location}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="right">
                  <a
                    href={it.meta.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Apply <ExternalLink size={13} />
                  </a>
                  <button
                    className="btn btn-danger-ghost btn-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      remove(it.id);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </Link>
            ) : (
              <>
                <div>
                  <div className="title-row">
                    <span className="title muted">Job no longer available</span>
                  </div>
                  <div className="meta"><span className="kv">{it.id}</span></div>
                </div>
                <div className="right">
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(it.id)}>Remove</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
