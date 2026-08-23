import OpenAI from "openai";
import { ParsedResume } from "../types";

const groq = new OpenAI({

    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
})

export async function parseResumeWithLLM(resumeText: string): Promise<ParsedResume> {
    const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        response_format: { type: "json_object" },
        messages: [
            {
                 role: "system",
                 content: `Extract candidate information from this resume. 
                 Return Return JSON with exactly these keys:
                 name (string),
                 email (string or null),
                 phone (string or null),
                 summary (string or null),
                 skills (array of strings),
          experience (array of { company, title, startDate, endDate, description }),
          education (array of { institution, degree, year }).
          Use null for missing fields. Do not invent data.
          For current jobs, use null for endDate.
                 `
            },
            {
                role: "user",
                content: resumeText,
            },
        ],
        })

        const content = response.choices[0]?.message.content;
        if (!content) throw new Error("Empty response from Groq");

        const parsed = JSON.parse(content);
        return ParsedResume.parse(parsed);
    }