import { useProfile } from "../context/ProfileContext";
import { Navigate } from "react-router-dom";

export function Interview() {
  const { profile, interviewId } = useProfile();

  if (!profile) return <Navigate to="/" replace />;

  return (
    <div className="p-8">
      <h2>Interview — {profile.name}</h2>
      <p>Skills: {profile.skills.join(", ")}</p>
      <p className="text-sm text-gray-500">Session: {interviewId}</p>
    </div>
  );
}