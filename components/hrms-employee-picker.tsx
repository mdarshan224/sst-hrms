"use client";
import { useEffect, useState } from "react";
type Employee = { id: string; full_name: string; employee_code: string };
export default function EmployeePicker({
  tenant,
  defaultId,
  name,
}: {
  tenant: string;
  defaultId: string;
  name: string;
}) {
  const [selected, setSelected] = useState(defaultId),
    [label, setLabel] = useState(
      defaultId ? "Current reporting manager" : "No manager assigned",
    ),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Employee[]>([]),
    [pages, setPages] = useState(1),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        view: "employee_picker",
        tenant,
        q,
        page: String(page),
        pageSize: "10",
        status: "active",
        sort: "name",
      });
      fetch("/api/hrms?" + params)
        .then(async (r) => {
          const d = (await r.json()) as {
            rows: Employee[];
            totalPages: number;
            error?: string;
          };
          if (!r.ok) throw new Error(d.error ?? "Could not search employees.");
          if (active) {
            setRows(d.rows);
            setPages(d.totalPages);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tenant, q, page, retry]);
  return (
    <div className="employee-picker">
      <input type="hidden" name={name} value={selected} />
      <input
        aria-label="Search reporting manager"
        value={q}
        placeholder="Search name or employee ID"
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <small>Selected: {label}</small>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setSelected("");
          setLabel("No manager assigned");
        }}
      >
        Remove manager
      </button>
      {loading ? (
        <p role="status">Searching…</p>
      ) : error ? (
        <p role="alert">
          {error}
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Retry
          </button>
        </p>
      ) : (
        <div className="picker-results">
          {rows.map((e) => (
            <button
              type="button"
              key={e.id}
              className={selected === e.id ? "selected" : ""}
              onClick={() => {
                setSelected(e.id);
                setLabel(`${e.full_name} · ${e.employee_code}`);
              }}
            >
              {e.full_name}
              <small>{e.employee_code}</small>
            </button>
          ))}
          {!rows.length && <small>No active employees match.</small>}
        </div>
      )}
      <div className="pagination">
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <small>
          Page {page} of {pages}
        </small>
        <button
          type="button"
          disabled={loading || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
