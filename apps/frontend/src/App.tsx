import "../styles/globals.css";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { useState } from "react";
import { Toaster } from "sonner";
import type { CandidateProfile } from "@/types/profile";

export function App() {
  const [page , setPage] = useState<"form" | "interview" | "result">("form"); 
  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  return (
    <div>
    {page === "form" && (
        <Form onSuccess={(p) => { setProfile(p); setPage("interview"); }} />
      )}
      {page === "interview" && <Interview profile={profile} />}
      {page === "result" && <Result />}
    
    <Toaster position="top-center" />
    </div>
  );
}

export default App;