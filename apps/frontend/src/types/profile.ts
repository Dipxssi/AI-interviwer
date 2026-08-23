export type Experience = {
    company: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    description: string;
  };
  
  export type Education = {
    institution: string;
    degree: string | null;
    year: string | null;
  };
  
  export type GitHubRepo = {
    name: string;
    description: string | null;
    stars: number;
  };
  
  export type GitHubProfile = {
    username: string;
    bio: string | null;
    topLanguages: string[];
    notableRepos: GitHubRepo[];
  };
  
  export type CandidateProfile = {
    name: string;
    email: string | null;
    skills: string[];
    summary: string | null;
    experience: Experience[];
    education: Education[];
    github: GitHubProfile;
    linkedin: { url: string };
  };