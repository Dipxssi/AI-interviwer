import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";

type Message = {
  id: string;
  type: string;
  message: string;
  metadata?: unknown;
  createdAt: string;
};

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

type Detail = {
  id: string;
  status: string;
  score: number;
  candidateName: string;
  linkedinUrl: string;
  conversation: Message[];
  competencies: Competency[];
};

function labelCompetency(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/v1/interviews/${id}`);
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setError("Could not load interview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto min-h-screen max-w-3xl p-8 text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto min-h-screen max-w-3xl space-y-4 p-8">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link to="/reviews" className="underline">
          Back to reviews
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-10 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {data.status} · score {data.score}/100
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {data.candidateName}
          </h1>
          {data.linkedinUrl && (
            <a
              href={data.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm underline"
            >
              LinkedIn
            </a>
          )}
        </div>
        <Link to="/reviews" className="text-sm underline">
          All reviews
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Competencies</h2>
        {data.competencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competency data yet.</p>
        ) : (
          <ul className="space-y-4">
            {data.competencies.map((c) => (
              <li key={c.key} className="space-y-1 border-b pb-3">
                <div className="flex justify-between gap-4">
                  <span className="font-medium">{labelCompetency(c.key)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(c.confidence * 100)}%
                    {c.followUpNeeded ? " · follow-up" : ""}
                  </span>
                </div>
                {c.evidence.length > 0 && (
                  <ul className="space-y-1 pl-1 text-sm text-muted-foreground">
                    {c.evidence.map((e, i) => (
                      <li key={i}>“{e.supportingQuote}”</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Transcript</h2>
        {data.conversation.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-4">
            {data.conversation.map((m) => (
              <li key={m.id} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {m.type === "USER" ? "Candidate" : "Interviewer"}
                </p>
                <p className="text-sm leading-relaxed">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
