# Sports Debate Arena

A Next.js prototype for three-round sports debates against an AI opponent.

## Included

- Opening argument, AI rebuttal, and user follow-up inside every round
- AI web research with 1-2 displayed source links
- Adaptive impossible mode with momentum and fatigue
- Inline weak-point highlighting
- UFC-style 10-point-must scoring
- Immediate “what would have beaten this” tips
- Persistent local history and sport-by-sport record
- Shareable text transcript and downloadable PNG scorecard
- Optional timer, sound, vibration, and mobile sticky submit controls
- Separate opponent and anonymized judge prompts

## Run it

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`.
3. Add your OpenAI API key.
4. Run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

History is stored in the browser with `localStorage`; it persists across sessions on the same browser/device. The project never exposes the API key to the browser because OpenAI calls happen in `/app/api/debate/route.ts`.


## Added in this version

- Back button with a leave-debate confirmation
- Current and best win streaks
- Win rate, total rounds, favorite sport, and records by sport
- Offline Practice mode with built-in rebuttals and local scoring
- Service-worker caching so the site can reopen after it has been visited once

Offline Practice does not use live web sources or the OpenAI API. The first visit still needs an internet connection so the browser can cache the website.


## Version 3 additions

- **Friend Challenge links:** Finish a debate and tap **Challenge a friend**. The link locks the topic, difficulty, side, and online/offline mode, and includes the score to beat. No account or database is required.
- **Daily Debate:** A deterministic UTC daily topic is selected from the built-in rotation. The user cannot choose the thesis or side, and there is no leaderboard.
