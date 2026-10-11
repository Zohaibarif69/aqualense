# 💧 AquaLens

**Citizen-powered freshwater monitoring, screened by AI and verified by experts.**

Built for **CodeRED: Orion** · Tracks: Best Environment Hack · Best Use of Gemini API

---

## The Problem

Rivers, lakes and streams face litter, pollution and algal blooms, but official monitoring covers only a few sites. People who live beside the water notice problems first, yet have no simple way to report them. Reports that are made are often blurry, lack a location, or never reach someone who can act.

## The Solution

AquaLens connects citizens, AI, expert reviewers and real monitoring data:

1. **Report** - a citizen photographs a problem, pins the location and describes it.
2. **Screen** - Google Gemini checks the photo quality and flags *possible* issues (litter, discoloration, foam, vegetation, oil-like surface, aquatic-life concern) with outlines on the image. The citizen confirms or disagrees with each finding.
3. **Review** - an expert sees the report, AI findings, citizen feedback and nearby site data, then approves, rejects or requests more information.
4. **Understand** - reports appear beside hydrology, weather and ecological indicators for 106 monitoring sites, on a map and in analytics.

The AI screens. A human decides.

## Features

- Multi-step citizen report form with photo, location and draft saving
- Gemini photo quality check and visual screening with bounding boxes
- Expert review queue with notes, duplicate linking and audit log
- Interactive map of monitoring sites and reports
- Per-site environment cards and 14-day discharge charts (7 recent days plus 7-day forecast)
- Live sensor registry with server-side alerts
- Analytics and citizen notifications
- Role-based access: citizen, reviewer, researcher, admin

## Tech Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Google Gemini API · Supabase · TanStack Query · Leaflet · Recharts · Vercel

## Data

Monitoring data is a snapshot of the AquaConnect / OneAquaHealth dashboard: 106 sites across Benevento, Coimbra, Ghent, Oslo and Toulouse (28 Sep - 4 Oct 2026). Citizen reports, photos and reviews are demo data.

## Run Locally

```bash
git clone <your-repo-url>
cd aqualens-next
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs on built-in demo data by default, so no keys are required. Add a `GEMINI_API_KEY` to enable the real AI photo check.

## Responsible AI

AI findings are always worded as *possible*, explained to the user, open to dispute, and never final. If the AI is unavailable, reporting still works.

## Limitations

- Sign-in is a demo role switch, not real authentication.
- Default database policies are open and should be tightened before handling real personal data.
- Environment cards are a snapshot and are marked **Stale** after the data window ends.

## Team

- **Zohaib Arif** - 

## Acknowledgements

AquaConnect / OneAquaHealth, Google Gemini API, Supabase, Vercel, and the CodeRED: Orion organizers.
