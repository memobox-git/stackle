export interface WorkExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
  bullets: string[];
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa?: string | null;
}

export interface SkillGroup {
  category: string;
  skills: string[];
}

export interface Project {
  name: string;
  description: string;
  tech: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  date: string;
}

export interface Award {
  title: string;
  issuer: string | null;
  date: string | null;
}

export interface VolunteerRole {
  organization: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface Publication {
  title: string;
  publisher: string | null;
  date: string | null;
  url: string | null;
}

export interface ResumeExtraction {
  name: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  location: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  experience: WorkExperience[];
  education: Education[];
  skillGroups: SkillGroup[];
  projects: Project[];
  certifications: Certification[];
  awards: Award[];
  volunteer: VolunteerRole[];
  publications: Publication[];
  links: { label: string; url: string }[];
  languages: { language: string; proficiency: string | null }[];
}
