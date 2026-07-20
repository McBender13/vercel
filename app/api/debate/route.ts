import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Source = { title: string; url: string };

function safeJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
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
      const prompt = `Create one balanced sports debate topic about this search: ${query}. Choose the closest sport from Soccer, Basketball, Football, Hockey, Baseball, UFC, Tennis, Formula 1, Golf, or College Sports. Do not assume rumors are facts. Phrase it as a clear claim that can be defended or opposed. Return ONLY valid JSON:
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
      const prompt = `Find the current top 15 prospects in the ${team} ${league} organization as of today. Use recent, reputable prospect rankings and official team/league information where possible. A prospect must still have rookie/prospect eligibility and belong to the organization. Return exactly 15 unique players in ranked order. For MLB include position and current minor-league level when available. For NHL include position and current league/team level when available. Create one concise, balanced debate claim for each player. Do not invent players or affiliations. Return ONLY valid JSON:
{
  "team": "${team}",
  "league": "${league}",
  "prospects": [
    {"rank":1,"name":"Player name","position":"position","currentLevel":"level or league","take":"clear debatable claim about this player's development, trade value, call-up timing, or future role"}
  ]
}`;
      const response = await client.responses.create({ model, tools: [{ type: "web_search" as any }], input: prompt, max_output_tokens: 2200 });
      const data = safeJson(response.output_text);
      return NextResponse.json({ ...data, sources: collectSources(response) });
    }

    if (body.action === "opponent") {
      const pressure = body.difficulty === "impossible"
        ? body.momentum === "aiLosing"
          ? "You are behind. Increase pressure: challenge assumptions, use sharper comparisons, and directly exploit the weakest sentence. Do not invent facts."
          : body.momentum === "aiWinning"
            ? "You are ahead. Stay disciplined, avoid overreaching, and force the user to answer your strongest evidence."
            : "The fight is even. Test the user's central assumption and use the strongest verified comparison available."
        : "Match the requested difficulty without becoming unfair.";

      const fatigue = Math.min(2, Math.max(0, Number(body.round || 1) - 1));
      const prompt = `You are the opponent in a sports debate game.\n\nSport: ${body.sport}\nTake: ${body.take}\nUser side: ${body.side}\nDifficulty: ${body.difficulty}\nRound: ${body.round}\nMomentum: ${body.momentum}\nFatigue level: ${fatigue}/2\nUser opening: ${body.userOpening}\nPrevious rounds: ${JSON.stringify(body.previousRounds || [])}\n\n${pressure}\n\nUse web search for current or historical sports facts. Give a concise rebuttal of 120-190 words. As fatigue rises, remain intelligent but slightly less verbose; do not intentionally make factual mistakes. Identify an exact quote from the user's opening that is weak, overstated, unsupported, or logically flawed. The quote must be copied exactly and be 4-18 words long.\n\nReturn ONLY valid JSON in this shape:\n{\n  "argument": "...",\n  "weakQuote": "exact quote from user",\n  "weakReason": "one-sentence explanation"\n}`;

      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search" as any }],
        input: prompt
      });
      const data = safeJson(response.output_text);
      return NextResponse.json({ ...data, sources: collectSources(response) });
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
