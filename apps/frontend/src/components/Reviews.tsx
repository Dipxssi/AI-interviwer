import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";

type InterviewRow = {
  id: string;
  status: string;
  score: number;
  candidateName: string;
  linkedinUrl: string;
};

export function Reviews() {
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/v1/interviews`);
        if (!cancelled) setRows(res.data.interviews ?? []);
      } catch {
        if (!cancelled) setError("Could not load interviews");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-3xl p-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reviews</h1>
          <p className="mt-1 text-muted-foreground">
            Supervisor view of completed and in-progress interviews
          </p>
        </div>
        <Link to="/" className="text-sm underline">
          Home
        </Link>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-muted-foreground">No interviews yet.</p>
      )}

      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <Link
                to={`/reviews/${row.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {row.candidateName}
              </Link>
              <p className="text-sm text-muted-foreground">
                {row.status} · score {row.score}
              </p>
            </div>
            <Link to={`/reviews/${row.id}`} className="text-sm underline">
              Open
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
