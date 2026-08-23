import type { CandidateProfile } from "@/types/profile";

export function Interview({ profile }: { profile: CandidateProfile | null }) {
  if (!profile) return <div>No profile loaded</div>;

  return (
    <div className="p-8">
      <h2>Interview — {profile.name}</h2>
      <p>Skills: {profile.skills.join(", ")}</p>
      {/* later: AI asks questions using this data */}
    </div>
  );
}