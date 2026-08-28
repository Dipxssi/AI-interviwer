import { useProfile } from "../context/ProfileContext";
import { Navigate } from "react-router-dom";
import { useVoiceInterview } from "@/hooks/useVoiceInterview";
import { cn } from "@/lib/utils";

type VoiceAvatarProps = {
  label: string;
  initials: string;
  active: boolean;
  subtitle?: string;
};

function VoiceAvatar({ label, initials, active, subtitle }: VoiceAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full border-2 text-xl font-semibold transition-colors",
          active
            ? "voice-avatar-active border-primary bg-primary/10 text-primary"
            : "border-muted bg-muted/40 text-muted-foreground",
        )}
        aria-label={label}
      >
        {initials}
      </div>
      <p className="text-sm font-medium">{label}</p>
      {subtitle && (
        <p className="max-w-[200px] text-center text-xs text-muted-foreground line-clamp-3">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function Interview() {
  const { profile, interviewId } = useProfile();
  const voice = useVoiceInterview(interviewId);

  if (!profile || !interviewId) return <Navigate to="/" replace />;

  const interviewerSpeaking =
    voice.voiceState === "AI_SPEAKING" || voice.voiceState === "PROCESSING";
  const candidateSpeaking = voice.voiceState === "CANDIDATE_SPEAKING";

  const candidateInitials = profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (voice.voiceState === "ENDING") {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
        <h1 className="text-3xl font-semibold">Interview complete</h1>
        <p className="text-muted-foreground">
          Thanks, {profile.name}. Your responses have been saved.
        </p>
        <a href="/" className="text-sm underline">
          Back to home
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Voice Interview</h1>
        <p className="mt-2 text-muted-foreground">{voice.status}</p>
        {voice.error && (
          <p className="mt-2 text-sm text-red-600">{voice.error}</p>
        )}
      </div>

      <div className="flex items-start justify-center gap-12">
        <VoiceAvatar
          label="Interviewer"
          initials="AI"
          active={interviewerSpeaking}
          subtitle={voice.assistantText || undefined}
        />
        <VoiceAvatar
          label={profile.name.split(" ")[0] ?? "You"}
          initials={candidateInitials}
          active={candidateSpeaking}
          subtitle={voice.partial || voice.finalText || undefined}
        />
      </div>
    </div>
  );
}