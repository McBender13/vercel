import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const prospectCache = new Map<string, { savedAt: number; data: any }>();
const PROSPECT_CACHE_MS = 24 * 60 * 60 * 1000;

type Source = { title: string; url: string };

function safeJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}


function stripLinks(text: string) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function collectSources(response: any): Source[] {
  const found = new Map<string, string>();
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        const citation = annotation.url_citation || annotation;
        if (citation?.url) found.set(citation.url, citation.title || new URL(citation.url).hostname);
      }
    }
  }
  return [...found.entries()].slice(0, 2).map(([url, title]) => ({ title, url }));
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing." }, { status: 500 });
    }
    const body = await request.json();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";

    if (body.action === "trending") {
      const prompt = `Find one major, current sports discussion from the past few days that would make a balanced debate. Choose one sport from Soccer, Basketball, Football, Hockey, Baseball, UFC, Tennis, Formula 1, Golf, or College Sports. Avoid injuries, tragedies, rumors stated as facts, and topics requiring graphic detail. Phrase the topic as one clear debatable claim. Return ONLY valid JSON:
{
  "sport": "one supported sport name",
  "take": "one concise debatable claim",
  "context": "one sentence explaining why the topic is timely"
}`;
      const response = await client.responses.create({ model, tools: [{ type: "web_search" as any }], input: prompt });
      const data = safeJson(response.output_text);
      return NextResponse.json({ ...data, sources: collectSources(response) });
    }

    if (body.action === "searchTopic") {
      const query = String(body.query || "").trim().slice(0, 120);
      if (!query) return NextResponse.json({ error: "Search query is required." }, { status: 400 });
      const prompt = `Create one balanced sports debate topic about this search: ${query}. Choose the closest sport from Soccer, Basketball, Football, Hockey, Baseball, UFC, Tennis, Formula 1, Golf, or College Sports. Do not assume rumors are facts. Phrase it as a clear claim that can be defended or opposed. First identify whether the subject is a team, player, prospect, coach, league, or draft topic. Never compare different entity types: teams only with teams, players only with players, prospects only with prospects, and coaches only with coaches. Avoid the repetitive wording “should rank higher than” and use a specific decision, prediction, roster question, tactical question, legacy question, or development question instead. Return ONLY valid JSON:
{
  "sport": "one supported sport name",
  "take": "one concise debatable claim"
}`;
      // Search-generated topics do not need live web research. Skipping web search makes this request much faster.
      const response = await client.responses.create({ model, input: prompt, max_output_tokens: 180 });
      return NextResponse.json(safeJson(response.output_text));
    }

    if (body.action === "prospectSystem") {
      const team = String(body.team || "").trim().slice(0, 80);
      const league = body.league === "NHL" ? "NHL" : "MLB";
      if (!team) return NextResponse.json({ error: "Team is required." }, { status: 400 });
      const cacheKey = `${league}:${team.toLowerCase()}`;
      const cached = prospectCache.get(cacheKey);
      if (cached && Date.now() - cached.savedAt < PROSPECT_CACHE_MS) {
        return NextResponse.json(cached.data, { headers: { "X-Prospect-Cache": "HIT" } });
      }
      const prompt = `Using one recent reputable team prospect ranking as the main order, list the current top 15 prospects in the ${team} ${league} organization. Verify that each player still belongs to the organization and has prospect/rookie eligibility. Keep fields extremely short. For MLB, currentLevel means AAA, AA, High-A, Single-A, Rookie, or MLB. For NHL, use AHL, NCAA, CHL, Europe, or NHL. Return exactly 15 unique players and ONLY valid JSON:
{"team":"${team}","league":"${league}","prospects":[{"rank":1,"name":"Player","position":"Pos","currentLevel":"Level"}]}`;
      // Debate claims are created instantly in the browser, cutting the response size by more than half.
      const response = await client.responses.create({ model, tools: [{ type: "web_search" as any }], input: prompt, max_output_tokens: 1050 });
      const data = { ...safeJson(response.output_text), sources: collectSources(response) };
      prospectCache.set(cacheKey, { savedAt: Date.now(), data });
      return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", "X-Prospect-Cache": "MISS" } });
    }

    if (body.action === "opponent") {
      const difficultyGuide = body.difficulty === "impossible"
        ? body.momentum === "aiLosing"
          ? "Elite opponent: you are behind, so challenge assumptions, use sharp verified comparisons, and exploit the weakest sentence without inventing facts."
          : body.momentum === "aiWinning"
            ? "Elite opponent: you are ahead, so stay disciplined, defend your strongest evidence, and force a direct answer."
            : "Elite opponent: test the central assumption and use the strongest verified comparison available."
        : body.difficulty === "hard"
          ? "Challenging but beatable opponent: make one strong point and one counterpoint, leave at least one realistic opening for the user, and do not overwhelm them with statistics."
          : body.difficulty === "medium"
            ? "Moderate opponent: use clear reasoning and at most one simple statistic or example. Make a noticeable but answerable weakness in your case."
            : "Beginner opponent: use simple language, one basic objection, no advanced statistics, and leave a clear path for the user to win the round.";

      const fatigue = Math.min(2, Math.max(0, Number(body.round || 1) - 1));
      const prompt = `You are the opponent in a sports debate game.\n\nSport: ${body.sport}\nTake: ${body.take}\nUser side: ${body.side}\nDifficulty: ${body.difficulty}\nRound: ${body.round}\nMomentum: ${body.momentum}\nFatigue level: ${fatigue}/2\nUser opening: ${body.userOpening}\nPrevious rounds: ${JSON.stringify(body.previousRounds || [])}\n\n${difficultyGuide}\n\nUse web search for current or historical sports facts. Give a concise rebuttal. Easy: 70-100 words. Medium: 85-120 words. Hard: 100-145 words. Impossible: 125-185 words. As fatigue rises, remain intelligent but slightly less verbose; do not intentionally make factual mistakes. Identify an exact quote from the user's opening that is weak, overstated, unsupported, or logically flawed. The quote must be copied exactly and be 4-18 words long.\n\nDo not put URLs, markdown links, citation markers, source names, or a sources section inside the argument. Sources are displayed separately by the app. Return ONLY valid JSON in this shape:\n{\n  "argument": "...",\n  "weakQuote": "exact quote from user",\n  "weakReason": "one-sentence explanation"\n}`;

      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search" as any }],
        input: prompt
      });
      const data = safeJson(response.output_text);
      return NextResponse.json({ ...data, argument: stripLinks(data.argument), sources: collectSources(response) });
    }

    if (body.action === "judge") {
      const exchange = body.exchange;
      const swap = Math.random() > 0.5;
      const userText = `Opening: ${exchange.userOpening}\nFollow-up: ${exchange.userFollowup}`;
      const aiText = exchange.aiRebuttal;
      const debaterA = swap ? aiText : userText;
      const debaterB = swap ? userText : aiText;

      const prompt = `You are an unbiased sports debate judge using a UFC-style 10-point-must system. Judge only what was argued in this round, not which opinion is popular. Do not reward length by itself. Consider factual accuracy, evidence, logic, direct rebuttal, responsiveness, and persuasion. A close round is 10-9. Use 10-8 only for overwhelming dominance. Never favor the AI.\n\nSport: ${body.sport}\nTake: ${body.take}\nRound: ${body.round}\nDebater A:\n${debaterA}\n\nDebater B:\n${debaterB}\n\nReturn ONLY valid JSON:\n{\n  "winner": "A" or "B" or "draw",\n  "loserScore": 9 or 8,\n  "reason": "2 concise sentences explaining the score",\n  "tipForUser": "one specific statistic, framing, comparison, or rebuttal angle that would have improved the user's round"\n}`;

      const response = await client.responses.create({ model, input: prompt });
      const result = safeJson(response.output_text);
      const userLabel = swap ? "B" : "A";
      const isDraw = result.winner === "draw";
      const userWon = result.winner === userLabel;
      const loserScore = result.loserScore === 8 ? 8 : 9;
      return NextResponse.json({
        winner: isDraw ? "draw" : userWon ? "user" : "ai",
        userScore: isDraw ? 10 : userWon ? 10 : loserScore,
        aiScore: isDraw ? 10 : userWon ? loserScore : 10,
        reason: result.reason,
        tip: result.tipForUser
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
