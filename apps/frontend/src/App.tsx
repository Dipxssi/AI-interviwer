import "../styles/globals.css";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { useState } from "react";
import { Toaster } from "sonner";
import type { CandidateProfile } from "@/types/profile";
import {BrowserRouter, Routes , Route} from "react-router-dom";
import { ProfileProvider } from "./context/ProfileContext";

export function App() {
  

  return (
    <ProfileProvider>
      <BrowserRouter>
      <Routes>
      <Route path="/" element={<Form />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/result" element={<Result />} />
        </Routes></BrowserRouter>
    </ProfileProvider>
   
  );
}

export default App;