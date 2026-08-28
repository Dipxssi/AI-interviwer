import { useProfile } from "../context/ProfileContext";
import { Navigate } from "react-router-dom";
import { useVoiceInterview } from "@/hooks/useVoiceInterview";

export function Interview() {
  const { profile, interviewId } = useProfile();
  const voice = useVoiceInterview(interviewId);

  if (!profile || !interviewId) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.name}
        </h1>
        <p className="mt-2 text-muted-foreground">{voice.status}</p>
        {voice.error && (
          <p className="mt-2 text-sm text-red-600">{voice.error}</p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Interviewer
          </p>
          <p className="text-lg">{voice.assistantText || "…"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            You
          </p>
          <p className="text-lg">
            {voice.partial || voice.finalText || "…"}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        State: {voice.voiceState} · Mic: {voice.micActive ? "on" : "off"}
      </p>
    </div>
  );
}