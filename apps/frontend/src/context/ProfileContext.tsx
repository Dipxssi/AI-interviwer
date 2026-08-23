import { createContext, useContext, useState, type ReactNode } from "react";
import type { CandidateProfile } from "@/types/profile";

type ProfileContextType = {
  profile: CandidateProfile | null;
  interviewId: string | null;
  setProfileData: (profile: CandidateProfile, interviewId: string) => void;
  clearProfile: () => void;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);

  function setProfileData(p: CandidateProfile, id: string) {
    setProfile(p);
    setInterviewId(id);
  }

  function clearProfile() {
    setProfile(null);
    setInterviewId(null);
  }

  return (
    <ProfileContext.Provider value={{ profile, interviewId, setProfileData, clearProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}