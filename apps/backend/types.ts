import z from "zod";

export const Experience = z.object({
    company: z.string(),
    title: z.string(),
    startDate: z.string().nullable(),  
    endDate: z.string().nullable(),    
    description: z.string(),
  });
  
  export const Education = z.object({
    institution: z.string(),
    degree: z.string().nullable(),     
    year: z.string().nullable(),
  });
  
  export const ParsedResume = z.object({
    name: z.string(),
    email: z.string().email().nullable(),  
    phone: z.string().nullable(),
    summary: z.string().nullable(),
    skills: z.array(z.string()),
    experience: z.array(Experience),
    education: z.array(Education),
  });

export type ParsedResume = z.infer<typeof ParsedResume>;


export const GitHubRepo = z.object({
    name: z.string(),
    description: z.string().nullable(),
    stars: z.number(),
  });
  export const GitHubProfile = z.object({
    username: z.string(),
    bio: z.string().nullable(),
    topLanguages: z.array(z.string()),
    notableRepos: z.array(GitHubRepo),
  });


  export type GitHubProfile = z.infer<typeof GitHubProfile>;
  

  export const CandidateProfile = z.object({
    name: z.string(),
    email: z.string().nullable(),
    skills: z.array(z.string()),
    summary: z.string().nullable(),
    experience: z.array(Experience),
    education: z.array(Education),
    github: GitHubProfile,
    linkedin: z.object({
      url: z.string().url(),
    }),
  });

  export type CandidateProfile = z.infer<typeof CandidateProfile>; //gives ts type from schema