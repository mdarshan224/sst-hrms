"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Session = {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};
export default function AccountSecurity() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]),
    [current, setCurrent] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/auth?view=sessions");
    const data = (await response.json()) as {
      sessions: Session[];
      currentSessionId: string;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "Could not load sessions.");
    return data;
  }, []);
  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active) {
          setSessions(data.sessions);
          setCurrent(data.currentSessionId);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  async function revoke(id?: string) {
    if (
      !window.confirm(
        id
          ? "Revoke this sign-in session and its support access?"
          : "Sign out every session, including this device?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          id ? { action: "session.revoke", id } : { action: "logout_all" },
        ),
      });
      const data = (await response.json()) as {
        signedOut?: boolean;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not revoke session.");
      if (data.signedOut) {
        router.replace("/login");
        router.refresh();
        return;
      }
      const dataAfter = await load();
      setSessions(dataAfter.sessions);
      setCurrent(dataAfter.currentSessionId);
      setNotice("Session revoked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Account security</h2>
          <p>
            Review up to 50 recent sessions. Revocation takes effect on the next
            request.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => revoke()}
        >
          Sign out all devices
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
          <button
            onClick={() =>
              load()
                .then((data) => {
                  setSessions(data.sessions);
                  setCurrent(data.currentSessionId);
                  setError("");
                })
                .catch((e) => setError(e.message))
            }
          >
            Retry
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <div className="loading" role="status">
          Loading sessions…
        </div>
      ) : (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Records table, scroll for all columns"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Created</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const active =
                  !s.revoked_at && new Date(s.expires_at) > new Date();
                return (
                  <tr key={s.id}>
                    <td>
                      {s.id === current ? "This device" : "Other session"}
                      <small>{s.id.slice(0, 8)}</small>
                    </td>
                    <td>{new Date(s.created_at).toLocaleString("en-IN")}</td>
                    <td>{new Date(s.expires_at).toLocaleString("en-IN")}</td>
                    <td>
                      {s.revoked_at ? "Revoked" : active ? "Active" : "Expired"}
                    </td>
                    <td>
                      {active && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => revoke(s.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!sessions.length && <p>No sessions to display.</p>}
        </div>
      )}
      <div className="panel-head">
        <div>
          <h3>Verify again for privileged access</h3>
          <p>
            Opening company support access requires a mobile verification from
            the last ten minutes.
          </p>
        </div>
        <Link className="secondary" href="/login?reauth=1&next=/super-admin">
          Verify mobile again
        </Link>
      </div>
    </section>
  );
}
