import express from "express";
import axios from "axios";
import cors from "cors";
import multer from "multer";
import { extractResumeText } from "./services/resume-text";
import { parseResumeWithLLM } from "./services/resume-parse-llm";
import { CandidateProfile } from "./types";
import { prisma } from "./db";
import { createInitialState} from "./interview-engine/state"
import { generateTurn } from "./interview-engine/generate-turn"
import type { InterviewState } from "./interview-engine/type"
import { synthesizeSpeech } from "./services/tts-deepgram";
import { transcribeAudio } from "./services/asr-deepgram"
import e from "express";
import { attachVoiceGateway } from "./voice/gateway";


const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000",
}));

app.post("/api/v1/pre-interview", upload.single("resume"), async (req, res) => {
  try {
    const { github, linkedin } = req.body;
    const file = req.file;

    if (!github || !linkedin || !file) {
      res.status(400).json({ message: "Missing fields" });
      return;
    }

    
    const rawText = await extractResumeText(file.buffer, file.mimetype);

    
    const parsedResume = await parseResumeWithLLM(rawText);

   
    const githubUrl = github.endsWith("/") ? github.slice(0, -1) : github;
    const githubUsername = githubUrl.split("/").pop()!;

    
    const [userRes, reposRes] = await Promise.all([
      axios.get(`https://api.github.com/users/${githubUsername}`),
      axios.get(`https://api.github.com/users/${githubUsername}/repos`, {
        params: { sort: "updated", per_page: 30 },
      }),
    ]);

    const repos = reposRes.data.map((x: any) => ({
      name: x.name,
      description: x.description,
      starCount: x.stargazers_count,
      language: x.language,
      updatedAt: x.updated_at,
    }));

    
    const profile = CandidateProfile.parse({
      name: parsedResume.name,
      email: parsedResume.email,
      skills: parsedResume.skills,
      summary: parsedResume.summary,
      experience: parsedResume.experience,
      education: parsedResume.education,
      github: {
        username: githubUsername,
        bio: userRes.data.bio,
        topLanguages: [...new Set(repos.map(r => r.language).filter(Boolean))] as string[],
        notableRepos: [...repos]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 5)
          .map(r => ({
            name: r.name,
            description: r.description,
            stars: r.starCount,
          })),
      },
      linkedin: { url: linkedin },
    });

    const interview = await prisma.interview.create({
      data:{
        linkedinUrl: linkedin,
        profile: profile,
        status: "Pre",
      }
    })

    
    res.json({ profile, interviewId: interview.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed" });
  }
});

app.post("/api/v1/interview/:id/voice-turn",upload.single("audio"), async (req, res) => {
  try {
    const interviewId = req.params.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({message: "Missing text"});
      return;
    }

    const {transcript , confidence} = await transcribeAudio(
      file.buffer,
      file.mimetype || "audio/wav",
    );


    const interview = await prisma.interview.findUnique({
      where: {id: interviewId as string},
      include: {conversation: {orderBy: {createdAt: "asc"}}
    }
    })

    if (!interview){
      res.status(404).json({ message: "Interview not found" });
      return;
    }

    const profile = CandidateProfile.parse(interview.profile)

    

    const latestSnapshot = await prisma.interviewStateSnapshot.findFirst({
      where: { interviewId },
      orderBy: { version: "desc" },
    });
    const state = latestSnapshot
      ? (latestSnapshot.state as InterviewState)
      : createInitialState(profile);
    const recentMessages = interview.conversation.slice(-6).map((m) => ({
      role: (m.type === "USER" ? "user" : "assistant") as "user" | "assistant",
      text: m.message,
    }));

    const result = await generateTurn({
      profile,
      state,
      recentMessages,
      latestUserText: transcript,
    });
    await prisma.message.create({
      data: {
        interviewId,
        type: "USER",
        message: transcript,
        confidence: confidence ?? undefined,
      },
    });
    await prisma.message.create({
      data: {
        interviewId,
        type: "ASSISTANT",
        message: result.spoken_response,
        metadata: result.decision,
      },
    });
    await prisma.interviewStateSnapshot.create({
      data: {
        interviewId,
        version: result.nextState.turnCount,
        state: result.nextState,
      },
    });
    if (interview.status === "Pre") {
      await prisma.interview.update({
        where: { id: interviewId },
        data: { status: "Inprogress" },
      });
    }
    if (result.nextState.shouldEnd) {
      await prisma.interview.update({
        where: { id: interviewId },
        data: { status: "Done" },
      });
    }

    const audio = await synthesizeSpeech(result.spoken_response);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-Transcript", encodeURIComponent(transcript));
    res.setHeader("X-Spoken-Response", encodeURIComponent(result.spoken_response));
    res.send(audio);
    


  }catch(err){
    console.error(err);
    res.status(500).json({ message: "text-turn failed" });
  }
});

app.post("/api/v1/tts", async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ message: "Missing text" });
      return;
    }

    const audio = await synthesizeSpeech(text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "tts failed" });
  }
});

app.post("/api/v1/asr", upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "Missing audio file field: audio" });
      return;
    }

    const result = await transcribeAudio(
      file.buffer,
      file.mimetype || "audio/wav",
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "asr failed" });
  }
});




const server = app.listen(3001, () => {
  console.log("API on http://localhost:3001");
});
attachVoiceGateway(server);