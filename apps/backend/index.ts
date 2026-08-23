import express from "express";
import axios from "axios";
import cors from "cors";
import multer from "multer";
import { extractResumeText } from "./services/resume-text";
import { parseResumeWithLLM } from "./services/resume-parse-llm";
import { CandidateProfile } from "./types";

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

    
    res.json({ profile });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed" });
  }
});

app.listen(3001);