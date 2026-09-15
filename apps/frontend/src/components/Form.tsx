import "../../styles/globals.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { BACKEND_URL } from "../lib/config";
import axios from "axios";
import type { CandidateProfile } from "@/types/profile";
import { useProfile } from "@/context/ProfileContext";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";




export function Form() {

    const navigate = useNavigate();
    const {setProfileData} = useProfile();
    const [github, setGithub] = useState("");
    const [linkedin, setLinkedin] = useState("");
    const [resume, setResume] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function onSubmit() {
        setIsLoading(true);
        if (!github || !linkedin || !resume){
            toast.error("Please fill all the fields");
            return;
        }

        const formData = new FormData()
        formData.append("github", github);
        formData.append("linkedin", linkedin);
        formData.append("resume", resume);

         try{
        const res = await axios.post(
            `${BACKEND_URL}/api/v1/pre-interview`,
             formData
        );
        setProfileData(res.data.profile, res.data.interviewId);
        navigate("/interview");  
        } catch (error) {
            toast.error("Error submitting form");
        } finally {
            setIsLoading(false);
        }
    }


    return <div className="h-screen w-screen flex justify-center items-center">
        <div>
            <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0">
                AI Interview Assistant
            </h2>
            <div className="p-4">
                <Input placeholder="Linkedin Url" className="p-4" onChange={e => setLinkedin(e.target.value)}/>
            </div>
            <div className="p-4">
                <Input placeholder="Github url" className="p-4" onChange={e => setGithub(e.target.value)}/>
            </div>
            <div className="p-4">
                <Input type="file" onChange={e => setResume(e.target.files?.[0] ?? null)}/>
            </div>
            <div className="flex justify-center">
                <Button onClick={onSubmit} disabled={isLoading}>{isLoading ? "Submitting..." : "Start Interview"}   {isLoading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}</Button>
            </div>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <a href="/reviews" className="underline">
                Supervisor reviews
              </a>
            </p>
        </div >
    </div >
}