import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";

type Competency = {
  key: string;
  importance: number;
  confidence: number;
  followUpNeeded: boolean;
  evidence: Array<{
    claim: string;
    supportingQuote: string;
    confidence: number;
  }>;
};

type InterviewDetail = {
  id: string;
  status: string;
  score: number;
  candidateName: string;
  competencies: Competency[];
};

function labelCompetency(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Result() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const res = await axios.get(`${BACKEND_URL}/api/v1/interviews/${id}`);
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setError("Could not load results");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
        <p>Missing interview id.</p>
        <Link to="/" className="underline">
          Home
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-8 text-muted-foreground">
        Loading results…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link to="/" className="underline">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 p-8">
      <div>
        <p className="text-sm text-muted-foreground">Interview complete</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {data.candidateName}
        </h1>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">Overall score</p>
        <p className="text-6xl font-semibold tabular-nums tracking-tight">
          {data.score}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">out of 100</p>
      </div>

      {data.competencies.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Competencies</h2>
          <ul className="space-y-3">
            {data.competencies.map((c) => (
              <li key={c.key} className="flex items-baseline justify-between gap-4">
                <span>{labelCompetency(c.key)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(c.confidence * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-4 text-sm">
        <Link to="/" className="underline">
          New interview
        </Link>
        <Link to={`/reviews/${data.id}`} className="underline">
          Full review
        </Link>
      </div>
    </div>
  );
}
