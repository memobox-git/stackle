# STACKLE RESUME FORMAT SPECIFICATION v1

This is the canonical format every resume Stackle generates or fixes must follow. Every category has specific rules. No improvisation.

---

## SECTION ORDER (top to bottom)

### For experienced candidates (1+ years)
1. Header (name, contact)
2. Professional Summary
3. Technical Skills
4. Work Experience
5. Projects (if relevant)
6. Education
7. Certifications (optional)
8. Awards/Publications (optional, only if strong)

### For new grads / career changers (0 years)
1. Header
2. Professional Summary
3. Technical Skills
4. Education
5. Projects
6. Work Experience (limited)
7. Certifications

### For senior candidates (8+ years)
1. Header
2. Professional Summary
3. Work Experience (front and center)
4. Technical Skills (more focused)
5. Education (compressed)
6. Notable Projects (only if exceptional)
7. Certifications (only if relevant)

---

## 1. HEADER

**Purpose:** Recruiter knows who you are and how to reach you.

**Format:**
- Line 1: NAME (large, bold, ~20pt)
- Line 2: phone | email | linkedin | github
- Line 3: city, state | work authorization

**Rules:**
- Name uses preferred professional name (not legal name unless they match)
- Phone format: `+1 XXX-XXX-XXXX`
- Email: professional address only (no nicknames, no numbers like xx69)
- LinkedIn: `linkedin.com/in/[handle]` (no `/pub/`, no `http://`, raw URL)
- GitHub: `github.com/[username]` only if clean profile with relevant repos
- Location: city, state (full state name or 2-letter abbreviation, consistent)
- Work auth: only if relevant
  - "US Citizen" or "Green Card Holder"
  - "No sponsorship required" if clean
  - "Requires H1B sponsorship" if needed
  - Skip entirely if not relevant

**Banned:**
- Photos
- Date of birth
- Marital status
- Full mailing address (street, zip)
- "Available upon request"
- Multiple phone numbers
- Personal website unless professional portfolio

**Example:**
```
Owais Jafer
+1 469-450-3315 | owaisjafer@icloud.com | linkedin.com/in/owaisjafer | github.com/owaisjafer7
Frisco, TX | Green Card Holder | No Sponsorship Required
```

---

## 2. PROFESSIONAL SUMMARY

**Purpose:** 6-second elevator pitch. Recruiter reads this to decide if they keep reading.

**Format:** 3 sentences total. 50-80 words. Third person.

**Structure:**
- **Sentence 1:** ROLE + YEARS + DOMAIN/STACK
  > "[Target Role] with [N]+ years of experience in [primary domain] using [top 3 technologies]."
- **Sentence 2:** KEY ACHIEVEMENTS WITH METRICS
  > "[Strongest accomplishment with metric] and [second strongest with metric]."
- **Sentence 3:** VALUE PROP + AVAILABILITY
  > "[Hiring relevance — what makes you valuable] + [work auth/availability if relevant]."

**Rules:**
- Third person only ("Data Engineer with..." not "I am a Data Engineer...")
- Lead with the role being targeted, not current title
- Include 2-3 quantified achievements
- Keywords from target JD woven in naturally
- One certification if standout (AWS, GCP, etc.)
- End with hire-ability signal if relevant

**Banned openers:**
- "I am a motivated..."
- "Passionate about..."
- "Results-driven..."
- "Dynamic professional..."
- "Seeking opportunities to..."
- "Hardworking individual..."
- "Team player with..."
- "Detail-oriented..."

**Banned phrases anywhere:**
- "Out-of-the-box thinker"
- "Synergy"
- "Go-getter"
- "Hit the ground running"
- "Wear many hats"
- "Self-starter"
- "Proven track record" (overused)

**Length validation:**
- 50-80 words → ACCEPT
- Below 50 → too thin, expand
- Above 80 → too long, compress

**Example (good):**
> "Data Engineer with 4+ years building production ETL pipelines and PL/SQL systems for federal aerospace clients at Infosys. Reduced migration errors by 30%, improved query performance by 18%, and mentored team leads to cut defects 25%. AWS-certified with M.Sc in Computer Science, authorized to work in US without sponsorship."

**Example (bad):**
> "I am a passionate and results-driven software engineer with strong skills in SQL and a desire to work on challenging projects in the data engineering space."

---

## 3. TECHNICAL SKILLS — 8-CATEGORY TAXONOMY

**Purpose:** ATS keyword harvest + recruiter quick-scan.

**Categories** (use only these 8, in this order):
1. Languages (programming languages only)
2. Data Processing & ETL
3. Cloud Platforms
4. Data Warehousing & Storage
5. Visualization & BI
6. CI/CD & DevOps
7. Data Quality & Observability
8. ML & Analytics

**Format:**
```
Languages: Python, SQL, PL/SQL, Scala
Data Processing & ETL: Apache Spark, PySpark, Airflow, dbt, Kafka
Cloud Platforms: AWS, GCP, Azure
[etc.]
```

**Rules:**
- 3-7 skills per category
- Most relevant to target role first
- No category if 0 skills (hide entirely)
- No "Soft Skills" category — never include
- No "Misc" or "Other" category
- Specific over generic ("Apache Spark" not "Big Data")
- Standard naming: "PostgreSQL" not "Postgres"
- Group versions: "Python 3.x" not "Python 3.7, Python 3.8, Python 3.9"

### Category definitions

**Languages (programming only):**
- ✓ Python, SQL, Java, JavaScript, Scala, R, Go
- ✗ Not: HTML, CSS (markup, not languages)
- ✗ Not: JSON, YAML (formats)

**Data Processing & ETL:**
- ✓ Apache Spark, PySpark, Apache Beam, Kafka, Airflow, dbt, SSIS, Informatica, Talend, ETL/ELT frameworks
- ✗ Not: Pandas (→ ML & Analytics)
- ✗ Not: Just "ETL" without tools

**Cloud Platforms:**
- ✓ AWS, GCP, Azure, Oracle Cloud, IBM Cloud
- ✓ Specific services: S3, Lambda, EMR, Glue, BigQuery, Vertex AI
- ✗ Not: SaaS tools (Salesforce, Workday)

**Data Warehousing & Storage:**
- ✓ Snowflake, BigQuery, Redshift, Databricks, Synapse, Teradata, PostgreSQL, MySQL, MongoDB
- ✗ Not: Concepts like "Distributed Systems"
- ✗ Not: Architecture patterns

**Visualization & BI:**
- ✓ Tableau, Power BI, Looker, Qlik, Metabase, Mode, Streamlit
- ✗ Not: General "data visualization"

**CI/CD & DevOps:**
- ✓ Git, GitHub Actions, Jenkins, Docker, Kubernetes, Terraform, Ansible, CircleCI
- ✗ Not: Just "DevOps" alone

**Data Quality & Observability:**
- ✓ Great Expectations, dbt tests, Monte Carlo, Soda, Datafold, pipeline monitoring tools
- ✗ Not: Generic "data quality" without tools

**ML & Analytics:**
- ✓ scikit-learn, TensorFlow, PyTorch, Pandas, NumPy, MLflow, XGBoost, Hugging Face
- ✗ Not: "Machine Learning" without specific libraries

**Keyword injection rule:**
- Pull missing keywords from analysis
- Add to appropriate category if user has any exposure (coursework, projects, certs)
- Never fabricate — if zero exposure, don't add

---

## 4. WORK EXPERIENCE — DETAILED RULES

### Role header format
- Line 1: `**Company Name**` (left)  ·  `Date Range` (right)
- Line 2: `*Job Title*` (left)  ·  `Location` (right)

### Header rules
- Company name **bolded**
- Job title *italicized*
- Dates right-aligned: "MMM YYYY – MMM YYYY"
- Current role: "MMM YYYY – Present"
- Location: City, State (or City, Country)
- If client/contract work: "Client: [Name]" on title line

### Bullet count by role age
- Most recent role: 4-6 bullets
- Previous role: 3-4 bullets
- Older roles (3+ years ago): 2-3 bullets
- Internships / very old: 1-2 bullets
- Roles older than 10 years: list only or omit

### Bullet structure — XYZ formula

> ACTION VERB + WHAT YOU DID + RESULT WITH METRIC

### Power verbs by category

**Leadership & Ownership:** Led, Owned, Drove, Spearheaded, Championed, Orchestrated, Directed, Founded, Established

**Building & Creating:** Built, Designed, Architected, Developed, Engineered, Implemented, Constructed, Launched, Deployed

**Improving & Optimizing:** Optimized, Reduced, Increased, Improved, Streamlined, Accelerated, Enhanced, Refactored, Automated, Eliminated

**Analysis & Strategy:** Analyzed, Identified, Evaluated, Assessed, Diagnosed, Researched, Investigated

**Collaboration:** Partnered, Collaborated, Coordinated, Mentored, Trained, Influenced

### Banned bullet starters
- "Responsible for..."
- "Helped with..."
- "Worked on..."
- "Assisted in..."
- "Tasks included..."
- "Duties involved..."
- "Was part of..."
- "Participated in..."
- "Contributed to..." (unless followed by measurable outcome)

### Bullet constraints
- 15-25 words ideal
- Single sentence
- Past tense (except current role: present tense)
- One metric where possible
- One technology mentioned where relevant
- Specific scope (numbers, percentages, time frames)

### The metric hierarchy (best → worst)
1. Revenue / cost impact ($, %)
2. Performance metrics (latency, throughput)
3. Volume metrics (records, users, requests)
4. Time saved (hours, days, weeks)
5. Quality metrics (defects reduced, accuracy)
6. Scope (team size, projects, geographies)
7. Generic improvement ("improved", "increased")

If no metric available, use scope or context:
- "across 5 geographies"
- "for 200+ daily users"
- "spanning 12 microservices"
- "in production environment"

### Bad examples (rewrite these)
- ✗ "Responsible for ETL pipeline development"
- ✗ "Worked on optimizing SQL queries"
- ✗ "Helped team migrate to cloud"
- ✗ "Assisted with data analysis projects"
- ✗ "Built reliable ingestion workflows using SQL*Loader"

### Good examples
- ✓ "Architected ETL pipeline processing 2M+ daily records using PySpark and Airflow, reducing load failures by 25% and enabling near-real-time reporting"
- ✓ "Optimized 12+ SQL queries across inventory module, cutting average runtime by 40% and freeing 15 GB of database storage"
- ✓ "Mentored 4 junior engineers through code reviews and pair programming, reducing onboarding time from 6 weeks to 3 weeks"

### Context-first approach
For roles with multiple bullets, sequence them:
1. First bullet: Highest-impact achievement (most quantified)
2. Second bullet: Technical depth showcase
3. Third bullet: Cross-functional / leadership signal
4. Fourth+: Supporting accomplishments

Don't bury your strongest work in bullet #6.

---

## 5. PROJECTS SECTION (when relevant)

### When to include
- Career changer (limited work experience)
- New grad (showcase what you've built)
- Mid-level wanting to demonstrate range
- Side projects relevant to target role

### When to omit
- Senior+ roles unless project is exceptional
- Resume already at 2 pages without projects
- Projects unrelated to target role

### Project header format
- Line 1: `**Project Name**` (left)  ·  `Date or Duration` (right)
- Line 2: `*Tech Stack*` (left)  ·  `Link` (right)

### Rules
- 2-4 bullets per project
- Each project has clear outcome / scope
- Link to GitHub/demo where possible
- Tech stack listed (helps ATS)
- Show architecture decisions, not just tech

### Bullet structure for projects

- **Bullet 1 — Problem + solution + scope:** "Built [what] to solve [problem], processing [volume] using [tech stack]"
- **Bullet 2 — Technical depth:** "Engineered [specific technical approach] to handle [complexity], achieving [result]"
- **Bullet 3 — Engineering best practices:** "Implemented [testing/monitoring/quality measures] to ensure [outcome]"
- **Bullet 4 (optional) — Outcome or learning:** "Reduced [metric] by [%] / Generated [outcome]"

### Example (good)

```
**End-to-End ETL Pipeline — Credit Card Fraud Detection**     2024
*Python, PySpark, Airflow, Snowflake, AWS S3*    github.com/owaisjafer7/cc-fraud

- Built end-to-end pipeline ingesting 500K+ daily credit card transactions from REST APIs, processing in PySpark, and loading to Snowflake for ML model consumption
- Engineered partition strategy and broadcast joins, reducing pipeline runtime from 45min to 12min for 6-month historical loads
- Implemented schema validation, null checks, and duplicate detection using Great Expectations, catching 100+ data quality issues pre-production
```

---

## 6. EDUCATION SECTION

### Position
- Below Work Experience for 1+ year experience
- Above Work Experience for new grads
- Compressed for 8+ years experienced

### Format
- Line 1: `**University Name**` (left)  ·  `Date Range` (right)
- Line 2: `*Degree, Major | GPA: X.XX*` (left)  ·  `Location` (right)

### Rules
- Most recent first
- Bold university, italic degree
- GPA only if 3.5+ (otherwise omit)
- Include relevant coursework only if new grad or career changer
- Honors only if standout (Summa Cum Laude, etc.)
- Don't include high school unless no other education

### What to include by experience level

**New grad:**
- Full coursework relevant to target role
- GPA if 3.5+
- Academic honors
- Relevant projects (can be sub-bullets)
- Study abroad if relevant
- Thesis / capstone

**Mid-level (2-7 years):**
- Just degree, university, year
- GPA if exceptional (3.7+)
- One line of coursework if clearly relevant
- Skip honors unless standout

**Senior (8+ years):**
- Just degree, university, year
- No GPA
- No coursework
- Compressed format

### Certifications within education
- Bootcamps go here (Per Scholas, etc.)
- Certificate programs go here
- Industry certifications go in Certifications section, not here

### Examples

**New grad:**
```
**University of North Texas**            Jan 2024 – Dec 2025
*M.Sc Computer Science | GPA: 3.82/4.0*  Denton, TX

- Graduate Certificates: Artificial Intelligence, Data Engineering
- Relevant Coursework: Big Data and Data Science, Database Systems, Machine Learning, Data Modeling
```

**Mid-level:**
```
**University of North Texas**         2025
*M.Sc Computer Science*               Denton, TX
```

**Senior:**
```
M.Sc Computer Science, University of North Texas (2025)
```

---

## 7. CERTIFICATIONS SECTION

### When to include
- AWS, GCP, Azure cloud certs (always)
- Industry-specific (PMP, CFA, CPA)
- Vendor certs relevant to role (Databricks, Snowflake, MongoDB)
- Recent and relevant only

### When to omit
- Generic LinkedIn Learning courses
- Unrelated certifications
- Expired certifications (older than 3 years)
- "Coursera Specialization in [generic topic]"

### Format
- `**Certification Name** — Issuer, Year (Status)`
- Bullet list, no commentary

### Rules
- Most relevant first, not chronological
- Include status if in progress: "AWS Cloud Practitioner — In Progress"
- Year of completion or "In Progress"
- Issuer if not obvious from cert name

### Example
```
**CERTIFICATIONS**
- AWS Certified Cloud Practitioner — 2024
- AWS Certified Solutions Architect Associate — In Progress (2025)
- Databricks Certified Data Engineer Professional — 2024
- Snowflake SnowPro Core — 2023
```

### Banned
- 10+ certifications (looks like padding)
- Outdated tech (old Java certs from 2010)
- "Certificates of completion" from random courses
- Self-study courses without exams

---

## 8. AWARDS & PUBLICATIONS (optional)

### When to include
- Conference presentations
- Industry awards
- Patents
- Published research
- Open source contributions to known projects

### Format
- `**Title** — Venue, Year`
- Brief one-line description if needed

### Rules
- Only if genuinely impressive
- Recent and relevant
- Specific venues (not "Internal Award")
- Skip if you're just padding

### Example
```
- **"Real-Time Pipeline Architecture at Scale"** — Data Engineering Summit 2024
- **AWS re:Invent 2023 Speaker** — Topic: Serverless ETL with Glue
- **Open Source Contributor** — Apache Airflow (3 PRs merged, 2024)
```

---

## FORMAT-LEVEL SPECIFICATIONS

### Fonts
- Body: Calibri, Arial, or Helvetica, 10-11pt
- Headers: Same font, 12-14pt, bold
- Name: Same font, 18-20pt, bold
- Never use: Times New Roman (dated), Comic Sans, fancy fonts

### Spacing
- 1.0 line spacing within bullets
- 1.15 line spacing between sections
- Single space after period
- Margins: 0.5"-0.75" all sides
- Section headers: 6pt space before, 3pt after

### Length
- New grad: 1 page
- 1-7 years experience: 1-2 pages
- 8+ years: 2 pages max
- Never 3+ pages

### Color
- Black text only (or very dark gray for body)
- One accent color allowed for name/headers (subtle navy or dark teal)
- No multiple colors
- No colored backgrounds

### Formatting elements
- Bullets: hyphens (`-`) or simple dots (`•`) only
- No tables (breaks ATS parsing)
- No columns (breaks ATS parsing)
- No graphics, images, icons
- No text boxes
- No headers / footers
- No page numbers

### ATS compatibility rules
- Standard section headers (no creative names)
  - ✓ "Work Experience"
  - ✗ "My Journey"
- Standard date formats (MMM YYYY)
- No graphics-based dividers
- No emojis (looks unprofessional + ATS issue)
- Save as .docx for ATS, export PDF for humans

---

## THE OUTCOME-FIRST PRINCIPLE

Every bullet must answer:

> "What did I do AND what was the result?"

Not just:

> "What was I responsible for?"

### Test for each bullet
1. Does it have an action verb?
2. Does it specify what was done?
3. Does it show a measurable result?
4. Could it be on anyone else's resume? (If yes, too generic — make it specific)

### Strong bullet test

> "If I removed the metric/scope, would it still sound impressive?"

- If yes: too generic, add specifics
- If no: good, specifics are doing the work

### Examples of outcome rewrites

**Weak:** "Built ETL pipelines"
**Decent:** "Built ETL pipelines for daily data ingestion"
**Strong:** "Built ETL pipeline processing 500K+ daily records, reducing manual data prep time by 8 hours per week"

**Weak:** "Worked on database optimization"
**Decent:** "Optimized database queries for performance"
**Strong:** "Optimized 15+ slow-running SQL queries, reducing average response time from 12s to 800ms and freeing 20% of CPU resources"

**Weak:** "Mentored team members"
**Decent:** "Mentored junior engineers on best practices"
**Strong:** "Mentored 4 junior engineers through weekly code reviews, reducing onboarding time from 8 weeks to 4 weeks"

---

## THE TRACEABILITY RULE (CRITICAL)

Every fact in the rewritten resume must be traceable to information in the original.

### Metrics
- If original says "improved performance" → rewrite cannot say "improved performance by 35%"
- If user provides a number, use it exactly
- If no number exists, use scope/scale instead

### Technologies
- If Airflow is in original skills → can mention in bullets
- If Airflow is NOT in original anywhere → cannot add to bullets
- Coursework counts but flag honestly

### Companies, dates, titles
- Immutable
- Never change unless user explicitly requests
- "Associate" stays "Associate" unless user says "rewrite my title to Senior Data Engineer"

### Accomplishments
- Don't combine wins from different times
- Don't merge two roles into one
- Don't expand single project into multiple

---

## END OF SPEC v1
