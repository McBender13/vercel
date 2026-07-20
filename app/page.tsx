"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TAKES, TAKE_COUNTS, TOTAL_TAKES } from "./takes";

type Difficulty = "easy" | "medium" | "hard" | "impossible";
type Stage = "setup" | "userOpening" | "aiRebuttal" | "userFollowup" | "scoring" | "finished";
type Side = "defend" | "counter";
type DebateMode = "online" | "offline";
type DebateKind = "custom" | "daily" | "challenge";
type Theme = "dark" | "light";
type Source = { title: string; url: string };
type TrendingDebate = { sport:string; take:string; context?:string; sources?:Source[] };
type Exchange = { round:number; userOpening:string; aiRebuttal:string; userFollowup:string; sources:Source[]; weakQuote?:string; weakReason?:string; userScore?:number; aiScore?:number; winner?:"user"|"ai"|"draw"; tip?:string; judgeReason?:string };
type SavedDebate = { id:string; createdAt:string; sport:string; take:string; difficulty:Difficulty; side:Side; mode?:DebateMode; kind?:DebateKind; result:"win"|"loss"|"draw"; userTotal:number; aiTotal:number; exchanges:Exchange[] };

const STORAGE_KEY="sports-debate-arena-history-v1";
const TRENDING_CACHE_KEY="sports-debate-trending-cache-v1";
const SEARCH_CACHE_KEY="sports-debate-search-cache-v1";
function dailyDebate(date=new Date()){
  const day=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/86400000);
  const sports=Object.keys(TAKES);
  const sport=sports[Math.abs(day)%sports.length];
  const list=TAKES[sport];
  const topicIndex=Math.abs((day*1103515245+12345)>>>0)%list.length;
  return {sport,take:list[topicIndex]};
}
const FEATURED_TRENDING: TrendingDebate[] = [
  {sport:"Basketball",take:"Teams should prioritize roster depth over adding a third superstar.",context:"A rotating featured debate inspired by the biggest roster-building arguments in sports."},
  {sport:"Hockey",take:"Teams should be more willing to trade first-round picks at the deadline.",context:"A rotating featured debate about balancing championship windows and future assets."},
  {sport:"Soccer",take:"Clubs should value tactical fit more than star power in the transfer market.",context:"A rotating featured debate about modern squad building."},
  {sport:"Football",take:"Paying an elite quarterback top-market money makes it harder to build a champion.",context:"A rotating featured debate about salary-cap team building."},
  {sport:"Baseball",take:"Contending teams should be aggressive buyers even when the prospect cost is high.",context:"A rotating featured debate about the trade deadline and championship windows."}
];
function featuredTrending(date=new Date()){const key=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/86400000;return FEATURED_TRENDING[Math.abs(key)%FEATURED_TRENDING.length]}


const OFFLINE_POINTS:Record<string,string[]>={
  Soccer:["Trophies alone do not measure individual performance; compare chance creation, scoring rate, role, and strength of opposition.","Peak reputation can hide consistency. A stronger case needs comparable per-90 production and major-match impact.","Era and team context matter. Teammates, tactical freedom, league strength, and availability can change raw totals."],
  Basketball:["One headline statistic cannot settle the argument. Efficiency, playoff translation, defense, and role all matter.","Team success is useful evidence, but it does not isolate one player's value from coaching and supporting talent.","Peak dominance should be judged against the league environment, not only by highlights or awards."],
  Football:["The claim needs position-adjusted evidence and should separate individual performance from team wins.","Small samples and playoff narratives can exaggerate differences that season-long efficiency does not support.","Value depends on replacement level, durability, and how much the player changes the opponent's game plan."],
  Hockey:["A fair comparison should include era-adjusted scoring, two-way impact, playoff results, and positional responsibility.","Team trophies do not belong to one player, especially when goaltending and special teams swing short series.","Raw totals across eras can mislead because scoring environments, schedules, and equipment changed."],
  Baseball:["Traditional totals need context from rate stats, park effects, era, defense, and baserunning.","A great peak is not automatically the greatest career; durability and sustained value still count.","One statistic rarely captures a hitter or pitcher's full contribution, so compare several independent measures."],
  UFC:["A résumé argument should weigh opponent quality, title defenses, dominance, longevity, and rule-set context.","Styles make fights, so one matchup result cannot automatically rank entire careers.","Finishes are exciting, but control, damage, consistency, and quality of competition all affect the case."],
  Tennis:["Grand Slam totals need context from surfaces, era strength, head-to-head results, and longevity.","A player’s peak level can be separated from career résumé, and both need evidence.","Serve, return, movement, and mental toughness should all be considered rather than relying on one trophy count."],
  "Formula 1":["Driver comparisons must separate car advantage from qualifying pace, race craft, consistency, and teammate performance.","Championship totals need context from reliability, season length, team strength, and points systems.","One famous race cannot settle a career debate; performance across different cars and regulations matters."],
  Golf:["Major totals are important but should be balanced with peak dominance, field strength, consistency, and total wins.","Course setup and era affect scoring, so raw numbers alone cannot settle cross-generation comparisons.","Driving, approach play, short game, putting, and mental pressure all contribute to a complete case."],
  "College Sports":["Program debates should separate historic tradition from recent results, recruiting, development, and postseason success.","Conference strength and schedule difficulty can change how records and championships should be judged.","Rules such as NIL and the transfer portal should be evaluated through athlete freedom, competitive balance, and long-term stability."]
};


type PracticeFeedback = { overall:number; evidence:number; logic:number; clarity:number; persuasiveness:number; grammar:number; strengths:string[]; improvements:string[]; example:string };
function buildPracticeFeedback(opening:string,followup:string,take:string,side:Side):PracticeFeedback{
  const full=`${opening} ${followup}`.trim();
  const words=full.split(/\s+/).filter(Boolean);
  const lower=full.toLowerCase();
  const sentences=full.split(/[.!?]+/).filter(x=>x.trim().length>4);
  const hasEvidence=/\b(because|for example|for instance|stat|percent|record|season|game|match|championship|according to)\b/.test(lower);
  const hasCounter=/\b(however|although|while|but|counter|opponent|even if|some may argue)\b/.test(lower);
  const hasConclusion=/\b(therefore|overall|ultimately|this shows|that is why|for these reasons)\b/.test(lower);
  const evidence=Math.min(100,45+(hasEvidence?30:0)+(words.length>90?15:words.length>45?8:0));
  const logic=Math.min(100,48+(hasCounter?25:0)+(sentences.length>=3?15:5));
  const clarity=Math.max(45,Math.min(100,92-Math.floor(Math.max(0,words.length-180)/6)+(sentences.length>=2?5:0)));
  const persuasiveness=Math.min(100,48+(hasConclusion?22:0)+(hasEvidence?15:0)+(hasCounter?10:0));
  const grammar=Math.max(55,Math.min(100,88-(full.match(/\s{2,}|[.!?]{2,}/g)||[]).length*5));
  const overall=Math.round((evidence+logic+clarity+persuasiveness+grammar)/5);
  const strengths=[] as string[];
  if(hasEvidence)strengths.push('You supported your claim with a reason or example.');
  if(hasCounter)strengths.push('You addressed an opposing point instead of ignoring it.');
  if(hasConclusion)strengths.push('You finished with a clear conclusion.');
  if(words.length>=60)strengths.push('You developed the argument beyond a one-line opinion.');
  if(!strengths.length)strengths.push('Your position is easy to identify.');
  const improvements=[] as string[];
  if(!hasEvidence)improvements.push('Add one specific statistic, game, season, player, or matchup as evidence.');
  if(!hasCounter)improvements.push('Name the strongest counterargument and explain why your side still wins.');
  if(!hasConclusion)improvements.push('End with a sentence that clearly connects your evidence back to the take.');
  if(words.length<45)improvements.push('Develop the reasoning with at least two separate supporting points.');
  if(words.length>220)improvements.push('Cut repeated ideas so the strongest evidence stands out.');
  if(!improvements.length)improvements.push('Replace one general statement with a more precise comparison.');
  const stance=side==='defend'?take:`The opposite of “${take}” is more convincing`;
  const example=`${stance} because the strongest case should combine a clear standard, a specific example, and an answer to the best opposing point. For example, compare the players, teams, or eras using the same measurement instead of relying only on reputation. Some people may disagree because team success and context matter, but that does not erase the individual evidence. Overall, the side with the clearer comparison and stronger proof should win this debate.`;
  return {overall,evidence,logic,clarity,persuasiveness,grammar,strengths:strengths.slice(0,3),improvements:improvements.slice(0,3),example};
}


type SearchEntity = { name:string; sport:string; kind:"team"|"player"|"league"|"draft"; aliases?:string[]; prompts?:string[] };
type ProspectSystem = { team:string; league:"MLB"|"NHL"; sport:"Baseball"|"Hockey"; aliases:string[] };
type ProspectResult = { rank:number; name:string; position?:string; currentLevel?:string; team:string; league:"MLB"|"NHL"; sport:"Baseball"|"Hockey"; take:string };
type SearchTopic = { sport:string; take:string; keywords:string[]; category?:string };

const TEAM_TEMPLATES:Record<string,string[]>= {
  Soccer:[
    "{name} should prioritize winning now over developing young players.",
    "{name}'s current manager is the right person to lead the club long term.",
    "{name} should spend aggressively in the next transfer window.",
    "{name}'s greatest-ever team would beat its current squad.",
    "{name} should value tactical fit more than star power when signing players."
  ],
  Football:[
    "{name} should prioritize building around the quarterback over strengthening the defense.",
    "{name} should trade future draft picks to maximize its current championship window.",
    "{name}'s head coach is the right person to lead the franchise long term.",
    "{name} should pay elite players top-market contracts even if depth suffers.",
    "{name}'s best team in franchise history would succeed in today's NFL."
  ],
  Basketball:[
    "{name} should prioritize roster depth over adding another superstar.",
    "{name} should trade future first-round picks to maximize its current title window.",
    "{name}'s current core is good enough to win a championship.",
    "{name}'s greatest team would dominate in today's NBA.",
    "{name} should make defense its top roster-building priority."
  ],
  Hockey:[
    "{name} should trade a first-round pick to improve its current playoff chances.",
    "{name}'s current core is capable of winning the Stanley Cup.",
    "{name} should prioritize goaltending over adding more scoring.",
    "{name}'s greatest team would thrive in today's NHL.",
    "{name} should be more patient with young players instead of chasing veterans."
  ],
  Baseball:[
    "{name} should trade top prospects to maximize its current championship window.",
    "{name} should spend more aggressively in free agency.",
    "{name}'s current core is capable of winning the World Series.",
    "{name}'s greatest team would succeed in today's MLB.",
    "{name} should prioritize pitching over adding another star hitter."
  ],
  "College Sports":[
    "{name} should prioritize recruiting high-school players over transfer-portal additions.",
    "{name}'s current coach is the right person to lead the program long term.",
    "{name} should value conference championships as much as national-title contention.",
    "{name}'s tradition gives it an advantage in the modern NIL era.",
    "{name} should be more aggressive in the transfer portal."
  ]
};

const PLAYER_TEMPLATES:Record<string,string[]>= {
  Soccer:[
    "{name} is one of the greatest players of this generation.",
    "{name}'s peak matters more than career longevity when judging the player's legacy.",
    "{name} would be just as dominant in a different tactical era.",
    "{name}'s international career should carry major weight in all-time rankings.",
    "{name} is more valuable for overall impact than raw goals and assists suggest."
  ],
  Basketball:[
    "{name} belongs in the all-time top ten.",
    "{name}'s peak is more impressive than the player's career longevity.",
    "{name} would be even more dominant in today's NBA.",
    "{name}'s playoff résumé is the strongest part of the player's legacy.",
    "{name} impacts winning more than traditional box-score statistics show."
  ],
  Football:[
    "{name} belongs among the greatest players ever at the position.",
    "{name}'s peak matters more than career longevity when judging the player's legacy.",
    "{name} would be just as dominant in today's NFL.",
    "{name}'s playoff performance should carry more weight than regular-season statistics.",
    "{name} changes winning more than traditional statistics show."
  ],
  Hockey:[
    "{name} belongs among the greatest players ever at the position.",
    "{name}'s peak matters more than career longevity when judging the player's legacy.",
    "{name} would be just as dominant in today's NHL.",
    "{name}'s playoff résumé should carry major weight in all-time rankings.",
    "{name}'s two-way impact is underrated."
  ],
  Baseball:[
    "{name} belongs among the greatest players ever at the position.",
    "{name}'s peak matters more than career longevity when judging the player's legacy.",
    "{name} would be just as dominant in today's MLB.",
    "{name}'s postseason résumé should carry more weight in all-time rankings.",
    "{name}'s overall value is better measured by advanced statistics than traditional totals."
  ],
  UFC:[
    "{name} belongs in the UFC's all-time top ten.",
    "{name}'s peak matters more than longevity when judging the fighter's legacy.",
    "{name} would succeed against champions from any era.",
    "{name}'s quality of competition is the strongest part of the fighter's résumé.",
    "{name}'s style is more difficult to solve than the record alone suggests."
  ],
  Tennis:[
    "{name} belongs in tennis's all-time top five.",
    "{name}'s peak matters more than career longevity when judging the player's legacy.",
    "{name} would be just as dominant across different court surfaces and eras.",
    "{name}'s major-title total is the strongest measure of the player's greatness.",
    "{name}'s mental strength is the most important part of the player's game."
  ],
  "Formula 1":[
    "{name} belongs among Formula 1's greatest drivers ever.",
    "{name}'s peak pace matters more than championship totals.",
    "{name} would succeed in any era of Formula 1.",
    "{name}'s teammate record is the strongest evidence of the driver's ability.",
    "{name}'s success is driven more by talent than machinery."
  ],
  Golf:[
    "{name} belongs among golf's greatest players ever.",
    "{name}'s peak matters more than career longevity when judging the player's legacy.",
    "{name} would be just as dominant against modern fields.",
    "{name}'s major record is the strongest measure of the player's greatness.",
    "{name}'s mental game is the biggest reason for the player's success."
  ]
};



const COLLEGE_TEAM_ENTITIES: SearchEntity[] = [
  ...[
    "Alabama","Arizona","Arizona State","Arkansas","Auburn","Baylor","Boston College","BYU","California","Cincinnati","Clemson","Colorado","Duke","Florida","Florida State","Georgia","Georgia Tech","Houston","Illinois","Indiana","Iowa","Iowa State","Kansas","Kansas State","Kentucky","Louisville","LSU","Miami","Michigan","Michigan State","Minnesota","Mississippi State","Missouri","Nebraska","North Carolina","NC State","Northwestern","Notre Dame","Ohio State","Oklahoma","Oklahoma State","Ole Miss","Oregon","Oregon State","Penn State","Pittsburgh","Purdue","Rutgers","South Carolina","Stanford","Syracuse","TCU","Tennessee","Texas","Texas A&M","Texas Tech","UCF","UCLA","USC","Utah","Vanderbilt","Virginia","Virginia Tech","Wake Forest","Washington","West Virginia","Wisconsin"
  ].map(school=>({name:`${school} football`,sport:"College Sports",kind:"team" as const,aliases:[school,`${school} college football`,`${school} football team`],prompts:[`${school} football should be considered a national championship contender.`,`${school} football has one of the strongest long-term programs in the country.`,`${school} football develops professional talent better than most college programs.`,`${school} football's current recruiting and transfer strategy is sustainable.`,`${school} football belongs among the most influential programs in college sports.`]})),
  ...[
    "Alabama","Arizona","Arkansas","Auburn","Baylor","BYU","Cincinnati","Clemson","Connecticut","Creighton","Dayton","Duke","Florida","Florida State","Georgetown","Gonzaga","Houston","Illinois","Indiana","Iowa","Iowa State","Kansas","Kentucky","Louisville","Marquette","Maryland","Memphis","Miami","Michigan","Michigan State","North Carolina","NC State","Ohio State","Oklahoma","Oregon","Purdue","Rutgers","Saint John's","San Diego State","Seton Hall","Tennessee","Texas","Texas Tech","UCLA","USC","Villanova","Virginia","West Virginia","Wisconsin","Xavier"
  ].map(school=>({name:`${school} basketball`,sport:"College Sports",kind:"team" as const,aliases:[school,`${school} college basketball`,`${school} basketball team`],prompts:[`${school} basketball should be considered a national championship contender.`,`${school} basketball has one of the best programs in the country.`,`${school} basketball develops NBA talent better than most college programs.`,`${school} basketball's roster-building approach is built for March Madness.`,`${school} basketball belongs among the most influential programs in college sports.`]})),
  ...[
    "Arizona State","Bemidji State","Boston College","Boston University","Bowling Green","Clarkson","Colgate","Colorado College","Connecticut","Cornell","Dartmouth","Denver","Harvard","Holy Cross","Maine","Massachusetts","Massachusetts Lowell","Mercyhurst","Merrimack","Miami (Ohio)","Michigan","Michigan State","Minnesota","Minnesota Duluth","Minnesota State","New Hampshire","Niagara","North Dakota","Northeastern","Northern Michigan","Notre Dame","Ohio State","Omaha","Penn State","Princeton","Providence","Quinnipiac","RIT","Robert Morris","Sacred Heart","St. Cloud State","St. Lawrence","Stonehill","Union","Vermont","Western Michigan","Wisconsin","Yale"
  ].map(school=>({name:`${school} hockey`,sport:"College Sports",kind:"team" as const,aliases:[school,`${school} college hockey`,`${school} hockey team`],prompts:[`${school} hockey should be considered a national championship contender.`,`${school} hockey has one of the strongest programs in college hockey.`,`${school} hockey develops NHL talent better than most NCAA programs.`,`${school} hockey's recruiting strategy gives it a long-term advantage.`,`${school} hockey belongs among the most influential programs in college hockey.`]}))
];

const COLLEGE_PLAYER_ENTITIES: SearchEntity[] = [
  // College football — major current players and draft prospects
  ...[
    ["Arch Manning","Texas"],["Jeremiah Smith","Ohio State"],["Ryan Williams","Alabama"],["DJ Lagway","Florida"],["LaNorris Sellers","South Carolina"],["Dante Moore","Oregon"],["Julian Sayin","Ohio State"],["Kewan Lacy","Ole Miss"],["Ahmad Hardy","Missouri"],["Justice Haynes","Michigan"],["Nate Frazier","Georgia"],["Cam Coleman","Auburn"],["Carnell Tate","Ohio State"],["Eric Singleton Jr.","Auburn"],["Ryan Wingo","Texas"],["Duce Robinson","Florida State"],["Sam Leavitt","Arizona State"],["Bryce Underwood","Michigan"],["Keelon Russell","Alabama"],["Trinidad Chambliss","Ole Miss"],["Peter Woods","Clemson"],["Rueben Bain Jr.","Miami"],["Keldric Faulk","Auburn"],["Anthony Hill Jr.","Texas"],["Caleb Downs","Ohio State"],["Koi Perich","Minnesota"],["Leonard Moore","Notre Dame"],["Mansoor Delane","LSU"],["Dillon Thieneman","Oregon"],["Francis Mauigoa","Miami"]
  ].map(([name,school])=>({name,sport:"College Sports",kind:"player" as const,aliases:[school,`${name} ${school}`],prompts:[`${name} is the most valuable player on ${school}'s roster.`,`${name} should be considered a top professional draft prospect.`,`${school} should build its system around ${name}.`]})),
  // College basketball — returning stars, freshmen and NBA prospects
  ...[
    ["Thomas Haugh","Florida"],["Jeremy Fears Jr.","Michigan State"],["David Mirkovic","Illinois"],["Tyler Tanner","Vanderbilt"],["Boogie Fland","Florida"],["Alex Condon","Florida"],["Rueben Chinyelu","Florida"],["Cameron Boozer","Duke"],["Darryn Peterson","Kansas"],["AJ Dybantsa","BYU"],["Nate Ament","Tennessee"],["Mikel Brown Jr.","Louisville"],["Caleb Wilson","North Carolina"],["Brayden Burries","Arizona"],["Darius Acuff Jr.","Arkansas"],["Tounde Yessoufou","Baylor"],["Koa Peat","Arizona"],["Meleek Thomas","Arkansas"],["Chris Cenac Jr.","Houston"],["Yaxel Lendeborg","Michigan"],["Braden Smith","Purdue"],["JT Toppin","Texas Tech"],["Zuby Ejiofor","St. John's"],["Labaron Philon","Alabama"],["Tahaad Pettiford","Auburn"],["Otega Oweh","Kentucky"],["Alex Karaban","UConn"],["Donovan Dent","UCLA"],["Bennett Stirtz","Iowa"],["Milan Momcilovic","Iowa State"]
  ].map(([name,school])=>({name,sport:"College Sports",kind:"player" as const,aliases:[school,`${name} ${school}`],prompts:[`${name} is one of the best players in college basketball.`,`${name} should be a first-round NBA Draft pick.`,`${school} should run more of its offense through ${name}.`]})),
  // College hockey — NHL prospects and major NCAA names
  ...[
    ["Gavin McKenna","Penn State"],["James Hagens","Boston College"],["Michael Hage","Michigan"],["Ryan Leonard","Boston College"],["Gabe Perreault","Boston College"],["Zeev Buium","Denver"],["Cole Eiserman","Boston University"],["Artyom Levshunov","Michigan State"],["Rutger McGroarty","Michigan"],["Oliver Moore","Minnesota"],["Jimmy Snuggerud","Minnesota"],["Frank Nazar","Michigan"],["Isaac Howard","Michigan State"],["Trey Augustine","Michigan State"],["Jacob Fowler","Boston College"],["Keaton Verhoeff","North Dakota"],["Will Horcoff","Michigan"],["Logan Hensler","Wisconsin"],["Sascha Boumedienne","Boston University"],["Cole Hutson","Boston University"],["Dean Letourneau","Boston College"],["Teddy Stiga","Boston College"],["James Reeder","Denver"],["Aidan Park","Michigan"],["Cullen Potter","Arizona State"],["Malcolm Spence","Michigan"],["William Moore","Boston College"],["Jack Murtagh","Boston University"],["Dakoda Rheaume-Mullen","Michigan"],["LJ Mooney","Minnesota"]
  ].map(([name,school])=>({name,sport:"College Sports",kind:"player" as const,aliases:[school,`${name} ${school}`],prompts:[`${name} is one of the best players in college hockey.`,`${name} should be considered an elite NHL prospect.`,`${school} should give ${name} a larger role.`]}))
];

const PROSPECT_SYSTEMS: ProspectSystem[] = [
  ...["Arizona Diamondbacks","Athletics","Atlanta Braves","Baltimore Orioles","Boston Red Sox","Chicago Cubs","Chicago White Sox","Cincinnati Reds","Cleveland Guardians","Colorado Rockies","Detroit Tigers","Houston Astros","Kansas City Royals","Los Angeles Angels","Los Angeles Dodgers","Miami Marlins","Milwaukee Brewers","Minnesota Twins","New York Mets","New York Yankees","Philadelphia Phillies","Pittsburgh Pirates","San Diego Padres","Seattle Mariners","San Francisco Giants","St. Louis Cardinals","Tampa Bay Rays","Texas Rangers","Toronto Blue Jays","Washington Nationals"].map(team=>({team,league:"MLB" as const,sport:"Baseball" as const,aliases:[team.toLowerCase(),team.split(" ").slice(-1)[0].toLowerCase(),`${team.toLowerCase()} prospects`,`${team.toLowerCase()} farm`,`${team.toLowerCase()} farm system`]})),
  ...["Anaheim Ducks","Boston Bruins","Buffalo Sabres","Calgary Flames","Carolina Hurricanes","Chicago Blackhawks","Colorado Avalanche","Columbus Blue Jackets","Dallas Stars","Detroit Red Wings","Edmonton Oilers","Florida Panthers","Los Angeles Kings","Minnesota Wild","Montreal Canadiens","Nashville Predators","New Jersey Devils","New York Islanders","New York Rangers","Ottawa Senators","Philadelphia Flyers","Pittsburgh Penguins","San Jose Sharks","Seattle Kraken","St. Louis Blues","Tampa Bay Lightning","Toronto Maple Leafs","Utah Mammoth","Vancouver Canucks","Vegas Golden Knights","Washington Capitals","Winnipeg Jets"].map(team=>({team,league:"NHL" as const,sport:"Hockey" as const,aliases:[team.toLowerCase(),team.split(" ").slice(-1)[0].toLowerCase(),`${team.toLowerCase()} prospects`,`${team.toLowerCase()} prospect pool`,`${team.toLowerCase()} farm system`]}))
];

function matchingProspectSystem(query:string){
  const q=query.trim().toLowerCase();
  if(q.length<2)return null;
  return PROSPECT_SYSTEMS.find(system=>system.aliases.some(alias=>alias===q || alias.includes(q) || q.includes(alias))) || null;
}

const SEARCH_ENTITIES:SearchEntity[] = [
  ...COLLEGE_TEAM_ENTITIES,
  ...COLLEGE_PLAYER_ENTITIES,
  // Soccer clubs
  ...["Arsenal","Liverpool","Manchester United","Manchester City","Chelsea","Tottenham Hotspur","Newcastle United","Aston Villa","West Ham United","Everton","Brighton","Brentford","Crystal Palace","Fulham","Nottingham Forest","Real Madrid","Barcelona","Atlético Madrid","Sevilla","Valencia","Villarreal","Athletic Club","Bayern Munich","Borussia Dortmund","Bayer Leverkusen","RB Leipzig","Juventus","Inter Milan","AC Milan","Napoli","Roma","Lazio","Paris Saint-Germain","Marseille","Lyon","Monaco","Benfica","Porto","Sporting CP","Ajax","PSV","Feyenoord","Celtic","Rangers"].map(name=>({name,sport:"Soccer",kind:"team" as const,aliases:name==="Manchester United"?["man united","man utd","united"]:name==="Manchester City"?["man city","city"]:name==="Tottenham Hotspur"?["tottenham","spurs"]:name==="Paris Saint-Germain"?["psg"]:name==="Inter Milan"?["inter"]:name==="AC Milan"?["milan"]:undefined})),
  // NFL teams
  ...["Arizona Cardinals","Atlanta Falcons","Baltimore Ravens","Buffalo Bills","Carolina Panthers","Chicago Bears","Cincinnati Bengals","Cleveland Browns","Dallas Cowboys","Denver Broncos","Detroit Lions","Green Bay Packers","Houston Texans","Indianapolis Colts","Jacksonville Jaguars","Kansas City Chiefs","Las Vegas Raiders","Los Angeles Chargers","Los Angeles Rams","Miami Dolphins","Minnesota Vikings","New England Patriots","New Orleans Saints","New York Giants","New York Jets","Philadelphia Eagles","Pittsburgh Steelers","San Francisco 49ers","Seattle Seahawks","Tampa Bay Buccaneers","Tennessee Titans","Washington Commanders"].map(name=>({name,sport:"Football",kind:"team" as const,aliases:[name.split(" ").slice(-1)[0].toLowerCase()]})),
  // NBA teams
  ...["Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls","Cleveland Cavaliers","Dallas Mavericks","Denver Nuggets","Detroit Pistons","Golden State Warriors","Houston Rockets","Indiana Pacers","Los Angeles Clippers","Los Angeles Lakers","Memphis Grizzlies","Miami Heat","Milwaukee Bucks","Minnesota Timberwolves","New Orleans Pelicans","New York Knicks","Oklahoma City Thunder","Orlando Magic","Philadelphia 76ers","Phoenix Suns","Portland Trail Blazers","Sacramento Kings","San Antonio Spurs","Toronto Raptors","Utah Jazz","Washington Wizards"].map(name=>({name,sport:"Basketball",kind:"team" as const,aliases:[name.split(" ").slice(-1)[0].toLowerCase()]})),
  // NHL teams
  ...["Anaheim Ducks","Boston Bruins","Buffalo Sabres","Calgary Flames","Carolina Hurricanes","Chicago Blackhawks","Colorado Avalanche","Columbus Blue Jackets","Dallas Stars","Detroit Red Wings","Edmonton Oilers","Florida Panthers","Los Angeles Kings","Minnesota Wild","Montreal Canadiens","Nashville Predators","New Jersey Devils","New York Islanders","New York Rangers","Ottawa Senators","Philadelphia Flyers","Pittsburgh Penguins","San Jose Sharks","Seattle Kraken","St. Louis Blues","Tampa Bay Lightning","Toronto Maple Leafs","Utah Mammoth","Vancouver Canucks","Vegas Golden Knights","Washington Capitals","Winnipeg Jets"].map(name=>({name,sport:"Hockey",kind:"team" as const,aliases:[name.split(" ").slice(-1)[0].toLowerCase()]})),
  // MLB teams
  ...["Arizona Diamondbacks","Athletics","Atlanta Braves","Baltimore Orioles","Boston Red Sox","Chicago Cubs","Chicago White Sox","Cincinnati Reds","Cleveland Guardians","Colorado Rockies","Detroit Tigers","Houston Astros","Kansas City Royals","Los Angeles Angels","Los Angeles Dodgers","Miami Marlins","Milwaukee Brewers","Minnesota Twins","New York Mets","New York Yankees","Philadelphia Phillies","Pittsburgh Pirates","San Diego Padres","San Francisco Giants","Seattle Mariners","St. Louis Cardinals","Tampa Bay Rays","Texas Rangers","Toronto Blue Jays","Washington Nationals"].map(name=>({name,sport:"Baseball",kind:"team" as const,aliases:[name.split(" ").slice(-1)[0].toLowerCase()]})),
  // College programs
  ...["Alabama","Georgia","Ohio State","Michigan","Notre Dame","Texas","Oklahoma","USC","LSU","Clemson","Penn State","Florida State","Oregon","Tennessee","Auburn","Miami","Florida","Duke","North Carolina","Kentucky","Kansas","UConn","Villanova","Gonzaga","UCLA"].map(name=>({name,sport:"College Sports",kind:"team" as const})),
  // Major players and individual athletes
  ...["Lionel Messi","Cristiano Ronaldo","Neymar","Kylian Mbappé","Erling Haaland","Mohamed Salah","Kevin De Bruyne","Jude Bellingham","Vinícius Júnior","Lamine Yamal","Harry Kane","Robert Lewandowski","Bukayo Saka","Cole Palmer","Rodri","Diego Maradona","Pelé","Zinedine Zidane","Ronaldinho","Thierry Henry"].map(name=>({name,sport:"Soccer",kind:"player" as const})),
  ...["LeBron James","Michael Jordan","Stephen Curry","Kevin Durant","Nikola Jokić","Giannis Antetokounmpo","Luka Dončić","Jayson Tatum","Shai Gilgeous-Alexander","Kobe Bryant","Shaquille O'Neal","Larry Bird","Magic Johnson","Tim Duncan","Wilt Chamberlain","Bill Russell"].map(name=>({name,sport:"Basketball",kind:"player" as const})),
  ...["Patrick Mahomes","Tom Brady","Josh Allen","Lamar Jackson","Joe Burrow","Jalen Hurts","Justin Jefferson","Travis Kelce","Aaron Rodgers","Peyton Manning","Jerry Rice","Lawrence Taylor","Barry Sanders"].map(name=>({name,sport:"Football",kind:"player" as const})),
  ...["Connor McDavid","Nathan MacKinnon","Auston Matthews","Sidney Crosby","Alexander Ovechkin","Cale Makar","David Pastrňák","Leon Draisaitl","Wayne Gretzky","Mario Lemieux","Bobby Orr","Gordie Howe"].map(name=>({name,sport:"Hockey",kind:"player" as const})),
  ...["Shohei Ohtani","Aaron Judge","Juan Soto","Mookie Betts","Bobby Witt Jr.","Paul Skenes","Mike Trout","Bryce Harper","Clayton Kershaw","Barry Bonds","Babe Ruth","Willie Mays","Ted Williams"].map(name=>({name,sport:"Baseball",kind:"player" as const})),
  ...["Jon Jones","Islam Makhachev","Ilia Topuria","Alex Pereira","Max Holloway","Conor McGregor","Khabib Nurmagomedov","Georges St-Pierre","Anderson Silva","Demetrious Johnson","Amanda Nunes","Valentina Shevchenko"].map(name=>({name,sport:"UFC",kind:"player" as const})),
  ...["Novak Djokovic","Rafael Nadal","Roger Federer","Carlos Alcaraz","Jannik Sinner","Serena Williams","Iga Świątek","Coco Gauff","Aryna Sabalenka"].map(name=>({name,sport:"Tennis",kind:"player" as const})),
  ...["Lewis Hamilton","Max Verstappen","Charles Leclerc","Lando Norris","Oscar Piastri","Fernando Alonso","Ayrton Senna","Michael Schumacher"].map(name=>({name,sport:"Formula 1",kind:"player" as const})),
  ...["Tiger Woods","Scottie Scheffler","Rory McIlroy","Jon Rahm","Bryson DeChambeau","Jack Nicklaus","Arnold Palmer"].map(name=>({name,sport:"Golf",kind:"player" as const})),
  // Leagues and draft subjects
  {name:"Premier League",sport:"Soccer",kind:"league",prompts:["The Premier League is the strongest soccer league in the world.","Premier League clubs rely too heavily on transfer spending.","The Premier League should introduce a salary cap."]},
  {name:"Champions League",sport:"Soccer",kind:"league",aliases:["ucl"],prompts:["The Champions League is harder to win than a domestic league title.","The expanded Champions League format improves the competition.","Clubs should prioritize the Champions League over domestic cups."]},
  {name:"NFL Draft",sport:"Football",kind:"draft",aliases:["football draft"],prompts:["Teams should draft the best player available instead of filling the biggest need.","Quarterbacks with elite physical traits are worth the risk of an early draft pick.","NFL teams trade up too often in the first round.","The NFL Draft should use a lottery for the earliest selections.","A player's college production matters more than combine testing."]},
  {name:"NBA Draft",sport:"Basketball",kind:"draft",aliases:["basketball draft"],prompts:["NBA teams should value proven production over long-term upside in the draft.","One-and-done prospects are harder to evaluate than experienced college players.","Teams should draft for fit instead of choosing the best player available.","The NBA Draft lottery does not do enough to discourage tanking.","International prospects are still undervalued in the NBA Draft."]},
  {name:"NHL Draft",sport:"Hockey",kind:"draft",aliases:["hockey draft"],prompts:["NHL teams should draft for upside instead of positional need.","Recent production should matter more than long-term projection in the NHL Draft.","Teams should be more willing to trade first-round picks on draft night.","Junior-league scoring is an unreliable way to compare NHL Draft prospects.","Defensemen are riskier first-round picks than forwards."]},
  {name:"MLB Draft",sport:"Baseball",kind:"draft",aliases:["baseball draft"],prompts:["MLB teams should prefer college players over high-school prospects early in the draft.","Pitchers are too risky to select first overall.","Tools and projection matter more than current production in the MLB Draft.","Teams should prioritize player development over draft position when rebuilding.","The MLB Draft should allow teams to trade draft picks more freely."]},
  {name:"College Football Recruiting",sport:"College Sports",kind:"draft",aliases:["recruiting","college recruiting"],prompts:["Recruiting rankings are a reliable predictor of future NFL Draft success.","Transfer-portal success matters more than high-school recruiting rankings.","NIL has improved college football recruiting.","Players should be allowed to enter the draft and return to college if they are not selected."]}
];

function entityTopics(entity:SearchEntity):SearchTopic[]{
  const prompts=entity.prompts || (entity.kind==="team"?TEAM_TEMPLATES[entity.sport]:PLAYER_TEMPLATES[entity.sport]) || [];
  const keywords=[entity.name.toLowerCase(),...(entity.aliases||[]).map(x=>x.toLowerCase())];
  return prompts.map(take=>({sport:entity.sport,take:take.replaceAll("{name}",entity.name),keywords,category:entity.kind==="team"?"Team":entity.kind==="player"?"Player":entity.kind==="draft"?"Draft":"League"}));
}

const SEARCH_TOPICS:SearchTopic[] = SEARCH_ENTITIES.flatMap(entityTopics);

function buzz(frequency=520,duration=90){try{const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;const ctx=new AudioCtx();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=frequency;gain.gain.setValueAtTime(.05,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration/1000);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration/1000)}catch{}navigator.vibrate?.(35)}
function clock(seconds:number){return `${Math.floor(seconds/60)}:${(seconds%60).toString().padStart(2,"0")}`}
function Highlight({text,quote}:{text:string;quote?:string}){if(!quote)return <>{text}</>;const i=text.toLowerCase().indexOf(quote.toLowerCase());if(i<0)return <>{text}</>;return <>{text.slice(0,i)}<mark className="weak-highlight">{text.slice(i,i+quote.length)}</mark>{text.slice(i+quote.length)}</>}

export default function Home(){
  const [sport,setSport]=useState("Soccer"),[take,setTake]=useState(TAKES.Soccer[0]);
  const [difficulty,setDifficulty]=useState<Difficulty>("medium"),[side,setSide]=useState<Side>("defend"),[mode,setMode]=useState<DebateMode>("online");
  const [kind,setKind]=useState<DebateKind>("custom"),[challengeTarget,setChallengeTarget]=useState<number|null>(null),[challengeReady,setChallengeReady]=useState(false);
  const [timerEnabled,setTimerEnabled]=useState(true),[timerLength,setTimerLength]=useState(120),[timeLeft,setTimeLeft]=useState(120);
  const [sound,setSound]=useState(true),[stage,setStage]=useState<Stage>("setup"),[round,setRound]=useState(1),[draft,setDraft]=useState("");
  const [coinFlipping,setCoinFlipping]=useState(false),[coinResult,setCoinResult]=useState<Side|null>(null),[friendLinkStatus,setFriendLinkStatus]=useState("");
  const [exchanges,setExchanges]=useState<Exchange[]>([]),[loading,setLoading]=useState(false),[history,setHistory]=useState<SavedDebate[]>([]),[tab,setTab]=useState<"arena"|"history">("arena"),[isOnline,setIsOnline]=useState(true);
  const [searchQuery,setSearchQuery]=useState(""),[searchFilter,setSearchFilter]=useState<"all"|"teams"|"players"|"prospects"|"topics">("all"),[takeFilter,setTakeFilter]=useState<"all"|"teams"|"players"|"prospects"|"topics">("all"),[trending,setTrending]=useState<TrendingDebate>(featuredTrending()),[trendingLoading,setTrendingLoading]=useState(false),[searchGenerating,setSearchGenerating]=useState(false);
  const [prospectResults,setProspectResults]=useState<ProspectResult[]>([]),[prospectLoading,setProspectLoading]=useState(false),[prospectError,setProspectError]=useState("");
  const [prospectResultsKey,setProspectResultsKey]=useState("");
  const prospectRequestRef=useRef("");
  const trendingQueueRef=useRef<TrendingDebate[]>(FEATURED_TRENDING.filter(item=>item.take!==featuredTrending().take));
  const [theme,setTheme]=useState<Theme>("dark");
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const play=(f?:number,d?:number)=>{if(sound)buzz(f,d)};

  useEffect(()=>{const savedTheme=localStorage.getItem("debate-sports-theme") as Theme|null;const initial=savedTheme||(window.matchMedia?.("(prefers-color-scheme: light)").matches?"light":"dark");setTheme(initial);document.documentElement.dataset.theme=initial;if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});const raw=localStorage.getItem(STORAGE_KEY);if(raw)try{setHistory(JSON.parse(raw))}catch{};const cachedTrending=localStorage.getItem(TRENDING_CACHE_KEY);if(cachedTrending)try{const parsed=JSON.parse(cachedTrending) as TrendingDebate[];if(Array.isArray(parsed)&&parsed.length)trendingQueueRef.current=[...parsed,...trendingQueueRef.current]}catch{}setIsOnline(navigator.onLine);const params=new URLSearchParams(window.location.search);if(params.get("challenge")==="1"){const s=params.get("sport"),t=params.get("take"),d=params.get("difficulty") as Difficulty|null,sd=params.get("side") as Side|null,m=params.get("mode") as DebateMode|null,target=Number(params.get("target"));if(s&&t){setSport(s);setTake(t);if(d)setDifficulty(d);if(sd)setSide(sd);if(m)setMode(m);setChallengeTarget(Number.isFinite(target)&&target>0?target:null);setKind("challenge");setChallengeReady(true)}}const on=()=>setIsOnline(true),off=()=>setIsOnline(false);window.addEventListener("online",on);window.addEventListener("offline",off);return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off)}},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("debate-sports-theme",theme)},[theme]);
  useEffect(()=>{if(!timerEnabled||!["userOpening","userFollowup"].includes(stage)||timeLeft<=0)return;const id=window.setInterval(()=>setTimeLeft(v=>v-1),1000);return()=>clearInterval(id)},[stage,timerEnabled,timeLeft]);
  useEffect(()=>{if(timeLeft===10)play(350,120);if(timeLeft===0&&["userOpening","userFollowup"].includes(stage))play(220,240)},[timeLeft]);
  useEffect(()=>{if(["userOpening","userFollowup"].includes(stage))setTimeout(()=>textareaRef.current?.focus(),100)},[stage]);

  const current=exchanges.find(e=>e.round===round);
  const totals=useMemo(()=>exchanges.reduce((a,e)=>({user:a.user+(e.userScore||0),ai:a.ai+(e.aiScore||0)}),{user:0,ai:0}),[exchanges]);
  const stats=useMemo(()=>{const wins=history.filter(h=>h.result==="win").length,losses=history.filter(h=>h.result==="loss").length,draws=history.filter(h=>h.result==="draw").length,total=history.length;let currentStreak=0,bestStreak=0,run=0;for(const h of [...history].reverse()){if(h.result==="win"){run++;bestStreak=Math.max(bestStreak,run)}else run=0}for(const h of history){if(h.result==="win")currentStreak++;else break}const rounds=history.reduce((n,h)=>n+h.exchanges.length,0);const favorite=Object.keys(TAKES).sort((a,b)=>history.filter(h=>h.sport===b).length-history.filter(h=>h.sport===a).length)[0]||"—";let rating=1000;for(const h of [...history].reverse()){const multiplier={easy:0,medium:5,hard:10,impossible:18}[h.difficulty]||0;const margin=Math.max(-3,Math.min(3,h.userTotal-h.aiTotal));rating+=h.result==="win"?20+multiplier+margin:h.result==="loss"?-(16+Math.round(multiplier/2)-margin):3}const userRoundPoints=history.reduce((n,h)=>n+h.exchanges.reduce((a,e)=>a+(e.userScore||0),0),0);const persuasiveness=rounds?Math.round(userRoundPoints/(rounds*10)*100):0;const levels:Difficulty[]=["easy","medium","hard","impossible"];const hardest=[...levels].reverse().find(level=>history.some(h=>h.result==="win"&&h.difficulty===level))||"—";return {wins,losses,draws,total,currentStreak,bestStreak,rounds,favorite,winRate:total?Math.round(wins/total*100):0,rating:Math.max(100,Math.round(rating)),persuasiveness,hardest}},[history]);
  const searchResults=useMemo(()=>{
    const q=searchQuery.trim().toLowerCase();
    if(q.length<2)return [];
    const tokens=q.split(/\s+/).filter(Boolean);
    const ranked=SEARCH_TOPICS.map(topic=>{
      const haystack=[topic.take,topic.sport,...topic.keywords].join(" ").toLowerCase();
      const exactKeyword=topic.keywords.some(keyword=>keyword.toLowerCase()===q);
      const startsKeyword=topic.keywords.some(keyword=>keyword.toLowerCase().startsWith(q));
      const allTokens=tokens.every(token=>haystack.includes(token));
      const score=exactKeyword?100:startsKeyword?80:allTokens?60:haystack.includes(q)?40:0;
      return {...topic,score};
    }).filter(topic=>topic.score>0).sort((a,b)=>b.score-a.score||a.take.localeCompare(b.take));
    const filtered=ranked.filter(topic=>{
      if(searchFilter==="teams")return topic.category==="Team";
      if(searchFilter==="players")return topic.category==="Player";
      if(searchFilter==="topics")return topic.category==="Draft"||topic.category==="League";
      if(searchFilter==="prospects")return false;
      return true;
    });
    const unique=new Map<string,(typeof filtered)[number]>();
    for(const topic of filtered){if(!unique.has(topic.take))unique.set(topic.take,topic)}
    return [...unique.values()].slice(0,12);
  },[searchQuery,searchFilter]);
  const prospectSystem=useMemo(()=>matchingProspectSystem(searchQuery),[searchQuery]);
  useEffect(()=>{
    if(!prospectSystem||!isOnline||!(searchFilter==="all"||searchFilter==="prospects"))return;
    const id=window.setTimeout(()=>{void loadProspectSystem({background:true})},350);
    return()=>window.clearTimeout(id);
  // loadProspectSystem intentionally runs only when the matched system changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[prospectSystem?.team,prospectSystem?.league,searchFilter,isOnline]);
  const sportStats=useMemo(()=>Object.keys(TAKES).map(s=>{const list=history.filter(h=>h.sport===s);return {sport:s,w:list.filter(h=>h.result==="win").length,l:list.filter(h=>h.result==="loss").length,d:list.filter(h=>h.result==="draw").length}}).filter(x=>x.w+x.l+x.d>0),[history]);
  function persist(next:SavedDebate[]){setHistory(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}
  function randomTake(){const sports=Object.keys(TAKES),s=sports[Math.floor(Math.random()*sports.length)],list=TAKES[s];setKind("custom");setChallengeReady(false);setCoinResult(null);setSport(s);setTake(list[Math.floor(Math.random()*list.length)])}
  function randomTakeForSport(){
    if(kind!=="custom")return;
    let list:string[]=[];
    if(takeFilter==="prospects"){
      list=prospectResults.filter(item=>item.sport===sport||sport==="College Sports").map(item=>item.take);
    }else if(takeFilter!=="all"){
      list=SEARCH_TOPICS.filter(topic=>{
        const sportMatch=topic.sport===sport||(sport==="College Sports"&&topic.sport==="College Sports");
        if(!sportMatch)return false;
        if(takeFilter==="teams")return topic.category==="Team";
        if(takeFilter==="players")return topic.category==="Player";
        if(takeFilter==="topics")return topic.category==="Draft"||topic.category==="League";
        return false;
      }).map(topic=>topic.take);
    }
    if(!list.length)list=TAKES[sport]||[];
    if(!list.length)return;
    const alternatives=[...new Set(list)].filter(item=>item!==take);
    const pool=alternatives.length?alternatives:[...new Set(list)];
    setTake(pool[Math.floor(Math.random()*pool.length)]);setCoinResult(null);play(620,90)
  }
  function resetTakeFilter(){setTakeFilter("all");setCoinResult(null);play(500,70)}
  function chooseTake(nextSport:string,nextTake:string){setKind("custom");setChallengeReady(false);setSport(nextSport);setTake(nextTake);setSearchQuery("");setCoinResult(null);play(660,90)}
  async function refreshTrending(){
    // Change the card immediately from a local queue, then fetch a new live topic in the background.
    const queue=trendingQueueRef.current.filter(item=>item.take!==trending.take);
    const instant=queue[0]||FEATURED_TRENDING.find(item=>item.take!==trending.take)||featuredTrending();
    setTrending(instant);
    trendingQueueRef.current=[...queue.slice(1),trending];
    play(620,70);
    if(trendingLoading||!isOnline)return;
    setTrendingLoading(true);
    try{
      const data=await api({action:"trending"});
      const live={sport:data.sport||"Sports",take:data.take,context:data.context,sources:data.sources||[]} as TrendingDebate;
      if(live.take){
        trendingQueueRef.current=[live,...trendingQueueRef.current.filter(item=>item.take!==live.take)].slice(0,12);
        localStorage.setItem(TRENDING_CACHE_KEY,JSON.stringify(trendingQueueRef.current.slice(0,8)));
      }
    }catch{}finally{setTrendingLoading(false)}
  }
  function prospectDebateTake(name:string,team:string,rank:number){
    const angles=[
      `${name} should be considered ${team}'s most important prospect.`,
      `${team} should avoid trading ${name} unless the return is a proven star.`,
      `${name} is ready for a larger role in ${team}'s organization.`,
      `${name}'s long-term upside is more valuable than immediate roster help.`
    ];
    return angles[(Math.max(1,rank)-1)%angles.length];
  }
  async function loadProspectSystem(options:{background?:boolean;force?:boolean}={}){
    if(!prospectSystem)return;
    const systemKey=`${prospectSystem.league}-${prospectSystem.team}`;
    if(prospectRequestRef.current===systemKey)return;
    const cacheKey=`sports-debate-prospects-${systemKey}`;
    const maxCacheAge=30*86400000;
    const refreshAfter=24*3600000;
    let cachedAge=Infinity;
    try{
      const cached=localStorage.getItem(cacheKey);
      if(cached){
        const parsed=JSON.parse(cached);
        cachedAge=parsed?.savedAt?Date.now()-parsed.savedAt:Infinity;
        if(cachedAge<maxCacheAge&&Array.isArray(parsed.prospects)&&parsed.prospects.length){
          setProspectResults(parsed.prospects);setProspectResultsKey(systemKey);setProspectError("");
          // Cached rankings appear immediately. Only refresh quietly when they are older than one day.
          if(!options.force&&cachedAge<refreshAfter)return;
        }
      }
    }catch{}
    if(!isOnline)return;
    prospectRequestRef.current=systemKey;
    if(!options.background||prospectResultsKey!==systemKey)setProspectLoading(true);
    setProspectError("");
    try{
      const data=await api({action:"prospectSystem",team:prospectSystem.team,league:prospectSystem.league});
      const prospects=(data.prospects||[]).slice(0,15).map((p:any,i:number)=>{const rank=Number(p.rank)||i+1;const name=String(p.name||"").trim();return {rank,name,position:p.position||"",currentLevel:p.currentLevel||"",team:prospectSystem.team,league:prospectSystem.league,sport:prospectSystem.sport,take:prospectDebateTake(name,prospectSystem.team,rank)}}).filter((p:any)=>p.name);
      if(prospects.length){setProspectResults(prospects);setProspectResultsKey(systemKey);localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),prospects}))}
      else throw new Error("No prospects returned");
    }catch(e){if(prospectResultsKey!==systemKey)setProspectError("Could not load the current rankings. Try again in a moment.")}finally{prospectRequestRef.current="";setProspectLoading(false)}
  }

  async function generateSearchDebate(){
    const query=searchQuery.trim();if(query.length<2||searchGenerating)return;
    const key=query.toLowerCase();
    try{
      const cache=JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY)||"{}") as Record<string,{sport:string;take:string}>;
      const cached=cache[key];
      if(cached?.take){chooseTake(cached.sport&&TAKES[cached.sport]?cached.sport:"Soccer",cached.take);return}
    }catch{}
    setSearchGenerating(true);
    try{
      const data=await api({action:"searchTopic",query});
      const result={sport:data.sport&&TAKES[data.sport]?data.sport:"Soccer",take:data.take};
      try{const cache=JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY)||"{}") as Record<string,{sport:string;take:string}>;cache[key]=result;localStorage.setItem(SEARCH_CACHE_KEY,JSON.stringify(Object.fromEntries(Object.entries(cache).slice(-60))))}catch{}
      chooseTake(result.sport,result.take)
    }catch{chooseTake(searchResults[0]?.sport||"Soccer",searchResults[0]?.take||`Is ${query} overrated in sports discussions?`)}finally{setSearchGenerating(false)}
  }
  function debateTrending(){
    // Apply the featured topic, switch to online AI, and immediately open round one.
    // Previously this only changed the form values, which could look like the button did nothing.
    setKind("custom");
    setChallengeReady(false);
    setSport(trending.sport);
    setTake(trending.take);
    setMode("online");
    setSearchQuery("");
    setCoinResult(null);
    setRound(1);
    setExchanges([]);
    setDraft("");
    setTimeLeft(timerLength);
    setTab("arena");
    setStage("userOpening");
    play(660,90);
  }
  function flipSide(){
    if(coinFlipping||kind!=="custom")return;
    setCoinFlipping(true);setCoinResult(null);play(520,90);
    window.setTimeout(()=>{const result:Side=Math.random()>.5?"defend":"counter";setSide(result);setCoinResult(result);setCoinFlipping(false);play(result==="defend"?820:360,170)},850)
  }
  function start(){setRound(1);setExchanges([]);setDraft("");setTimeLeft(timerLength);setStage("userOpening");setTab("arena")}
  function startDaily(){const daily=dailyDebate();setSport(daily.sport);setTake(daily.take);setSide(Math.random()>.5?"defend":"counter");setKind("daily");setChallengeReady(false);setTimeout(start,0)}
  function exitDaily(){setKind("custom");setSport("Soccer");setTake(TAKES.Soccer[0]);setSide("defend");setCoinResult(null);setStage("setup");setRound(1);setExchanges([]);setDraft("")}
  function clearChallenge(){setKind("custom");setChallengeReady(false);setChallengeTarget(null);window.history.replaceState({},"",window.location.pathname)}
  async function api(payload:object){const r=await fetch("/api/debate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!r.ok)throw new Error(await r.text());return r.json()}

  function offlineOpponent(opening:string){const bank=OFFLINE_POINTS[sport]||OFFLINE_POINTS.Soccer;const words=opening.trim().split(/\s+/);const weakQuote=words.slice(0,Math.min(7,words.length)).join(" ");const pressure=difficulty==="impossible"?(totals.user>totals.ai?" The opponent is behind and presses your weakest assumption harder.":" The opponent protects its lead by narrowing the debate to measurable comparisons."):"";return {argument:`Offline opponent: ${bank[(round-1)%bank.length]}${pressure} Your claim around “${weakQuote}” needs a concrete example or statistic before it can carry the round.`,sources:[],weakQuote,weakReason:"Offline practice flagged this as the least-supported part of your argument."}}
  function offlineJudge(done:Exchange){const userStrength=done.userOpening.length+done.userFollowup.length+(done.userFollowup.toLowerCase().includes("because")?80:0);const aiStrength=done.aiRebuttal.length+(difficulty==="hard"?80:difficulty==="impossible"?130:0);const userWon=userStrength>=aiStrength;return {userScore:userWon?10:9,aiScore:userWon?9:10,winner:userWon?"user":"ai",tip:"Add one specific stat, example, or matchup comparison and directly answer the opponent’s main objection.",reason:"Offline practice scoring considered direct rebuttal, specificity, structure, and support. It is a practice estimate, not live AI judging."}}
  function goBack(){if(tab==="history"){setTab("arena");return}if(stage==="setup")return;if(confirm("Leave this debate and return to setup? Completed debates remain saved.")){setStage("setup");setDraft("")}}

  async function submitOpening(){if(!draft.trim())return;const opening=draft.trim(),next:Exchange={round,userOpening:opening,aiRebuttal:"",userFollowup:"",sources:[]};setExchanges(p=>[...p.filter(e=>e.round!==round),next]);setDraft("");setLoading(true);setStage("aiRebuttal");try{const momentum=totals.user>totals.ai?"aiLosing":totals.ai>totals.user?"aiWinning":"even";const data=mode==="offline"?offlineOpponent(opening):await api({action:"opponent",sport,take,difficulty,side,round,userOpening:opening,previousRounds:exchanges,momentum});setExchanges(p=>p.map(e=>e.round===round?{...e,aiRebuttal:data.argument,sources:data.sources||[],weakQuote:data.weakQuote,weakReason:data.weakReason}:e));play(610,100)}catch{setExchanges(p=>p.map(e=>e.round===round?{...e,aiRebuttal:"The AI request failed. Check the API key and server log. You can still submit a follow-up and receive demo scoring.",weakQuote:opening.split(" ").slice(0,8).join(" "),weakReason:"This point needs a more specific statistic or comparison."}:e))}finally{setTimeLeft(timerLength);setStage("userFollowup");setLoading(false)}}
  async function submitFollowup(){if(!draft.trim()||!current)return;const done={...current,userFollowup:draft.trim()};setExchanges(p=>p.map(e=>e.round===round?done:e));setDraft("");setStage("scoring");setLoading(true);try{const data=mode==="offline"?offlineJudge(done):await api({action:"judge",sport,take,difficulty,side,round,exchange:done});setExchanges(p=>p.map(e=>e.round===round?{...done,userScore:data.userScore,aiScore:data.aiScore,winner:data.winner,tip:data.tip,judgeReason:data.reason}:e));play(data.winner==="user"?820:280,180)}catch{const userWon=done.userOpening.length+done.userFollowup.length>=done.aiRebuttal.length*.7;setExchanges(p=>p.map(e=>e.round===round?{...done,userScore:userWon?10:9,aiScore:userWon?9:10,winner:userWon?"user":"ai",tip:"Use one verified statistic and answer the opponent's strongest point directly.",judgeReason:"Demo scoring was used because the AI judge was unavailable."}:e));play(userWon?820:280,180)}finally{setLoading(false)}}
  function advance(){if(round<3){setRound(r=>r+1);setTimeLeft(timerLength);setDraft("");setStage("userOpening")}else finish()}
  function finish(){const final=exchanges.reduce((a,e)=>({user:a.user+(e.userScore||0),ai:a.ai+(e.aiScore||0)}),{user:0,ai:0}),result:SavedDebate["result"]=final.user>final.ai?"win":final.user<final.ai?"loss":"draw";const saved:SavedDebate={id:crypto.randomUUID(),createdAt:new Date().toISOString(),sport,take,difficulty,side,mode,kind,result,userTotal:final.user,aiTotal:final.ai,exchanges};persist([saved,...history].slice(0,100));setStage("finished");play(result==="win"?900:result==="loss"?240:500,260)}
  function transcript(){const lines=["SPORTS DEBATE ARENA",`${sport} — ${take}`,`Side: ${side.toUpperCase()} | Difficulty: ${difficulty.toUpperCase()} | Mode: ${mode.toUpperCase()}`,""];exchanges.forEach(e=>lines.push(`ROUND ${e.round}`,`USER OPENING:\n${e.userOpening}`,`AI REBUTTAL:\n${e.aiRebuttal}`,`USER FOLLOW-UP:\n${e.userFollowup}`,`SCORE: User ${e.userScore??"-"} — AI ${e.aiScore??"-"}`,`JUDGE: ${e.judgeReason||""}`,`TIP: ${e.tip||""}`,""));lines.push(`TOTAL: User ${totals.user} — AI ${totals.ai}`);return lines.join("\n")}
  async function shareText(){const text=transcript();if(navigator.share)await navigator.share({title:"Sports Debate Arena",text});else{await navigator.clipboard.writeText(text);alert("Transcript copied.")}}
  function challengeUrl(target?:number){const url=new URL(window.location.origin+window.location.pathname);url.searchParams.set("challenge","1");url.searchParams.set("sport",sport);url.searchParams.set("take",take);url.searchParams.set("difficulty",difficulty);url.searchParams.set("side",side);url.searchParams.set("mode",mode);if(target&&target>0)url.searchParams.set("target",String(target));return url.toString()}
  async function shareFriendLink(){const url=challengeUrl();const text=`Debate me on this sports take: ${take}`;try{if(navigator.share)await navigator.share({title:"Debate Sports Friend Challenge",text,url});else{await navigator.clipboard.writeText(url);setFriendLinkStatus("Friend link copied!");window.setTimeout(()=>setFriendLinkStatus(""),2500)}}catch{}}
  async function shareChallenge(){const url=challengeUrl(totals.user);const text=`Can you beat my ${totals.user}-point score in Debate Sports?`;if(navigator.share)await navigator.share({title:"Debate Sports Challenge",text,url});else{await navigator.clipboard.writeText(url);alert("Friend challenge link copied.")}}
  function downloadText(){const u=URL.createObjectURL(new Blob([transcript()],{type:"text/plain"})),a=document.createElement("a");a.href=u;a.download=`debate-${sport.toLowerCase()}-${Date.now()}.txt`;a.click();URL.revokeObjectURL(u)}
  function downloadImage(){const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=630;const c=canvas.getContext("2d");if(!c)return;c.fillStyle="#07090d";c.fillRect(0,0,1200,630);c.fillStyle="#f59e0b";c.font="bold 24px sans-serif";c.fillText("SPORTS DEBATE ARENA",60,70);c.fillStyle="#ffffff";c.font="bold 46px sans-serif";const title=take.length>58?take.slice(0,58)+"…":take;c.fillText(title,60,145);c.fillStyle="#9ba8ba";c.font="26px sans-serif";c.fillText(`${sport} • ${difficulty.toUpperCase()} • ${side.toUpperCase()}`,60,195);c.fillStyle="#ffffff";c.font="bold 92px sans-serif";c.fillText(`${totals.user}  -  ${totals.ai}`,60,340);c.font="bold 34px sans-serif";c.fillStyle=totals.user>totals.ai?"#22c55e":totals.user<totals.ai?"#fb7185":"#f59e0b";c.fillText(totals.user>totals.ai?"USER WINS":totals.user<totals.ai?"AI WINS":"DRAW",60,400);c.fillStyle="#9ba8ba";c.font="23px sans-serif";c.fillText("3 rounds • sourced rebuttals • UFC-style scoring",60,535);const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download=`debate-scorecard-${Date.now()}.png`;a.click()}
  function reset(){setStage("setup");setRound(1);setExchanges([]);setDraft("");setCoinResult(null);if(kind!=="challenge")setKind("custom")}

  return <main className="container">
    <header className="hero"><div className="eyebrow">DEBATE SPORTS</div><h1>Prove your sports take.</h1><p className="sub">Choose a side, go three rounds against an AI opponent, and earn a transparent UFC-style scorecard. Play today’s locked debate or challenge a friend with the same matchup.</p><div className="hero-pills"><span>3-round debates</span><span>Daily debate</span><span>Friend challenges</span><span>Offline practice</span></div></header>
    <div className="tabs row between"><div className="row">{(tab==="history"||stage!=="setup")&&<button className="btn ghost" onClick={goBack}>← Back</button>}<button className={`btn ${tab==="arena"?"":"secondary"}`} onClick={()=>setTab("arena")}>Arena</button><button className={`btn ${tab==="history"?"":"secondary"}`} onClick={()=>setTab("history")}>History ({history.length})</button></div><div className="row"><button className="btn ghost theme-toggle" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?"☀️ Light mode":"🌙 Dark mode"}</button><span className={`badge ${isOnline?"":"offline-badge"}`}>{isOnline?"Online":"No connection"}</span></div></div>

    {tab==="history"?<section className="grid"><div className="grid stats-grid"><div className="card stat"><strong>{stats.wins}</strong><span className="small">Wins</span></div><div className="card stat"><strong>{stats.losses}</strong><span className="small">Losses</span></div><div className="card stat"><strong>{stats.currentStreak}</strong><span className="small">Current streak</span></div><div className="card stat"><strong>{stats.bestStreak}</strong><span className="small">Best streak</span></div><div className="card stat"><strong>{stats.winRate}%</strong><span className="small">Win rate</span></div><div className="card stat"><strong>{stats.rounds}</strong><span className="small">Rounds debated</span></div><div className="card stat rating-stat"><strong>{stats.rating}</strong><span className="small">Debate rating</span></div><div className="card stat"><strong>{stats.persuasiveness}%</strong><span className="small">Persuasiveness</span></div><div className="card stat"><strong>{stats.hardest}</strong><span className="small">Hardest AI beaten</span></div></div><div className="card row between"><div><div className="small">Favorite sport</div><strong>{stats.favorite}</strong></div><div><div className="small">Total debates</div><strong>{stats.total}</strong></div><div><div className="small">Draws</div><strong>{stats.draws}</strong></div></div>{sportStats.length>0&&<div className="card"><h2>Record by sport</h2>{sportStats.map(s=><div className="history-item row between" key={s.sport}><strong>{s.sport}</strong><span className="badge">{s.w}-{s.l}-{s.d}</span></div>)}</div>}<div className="card"><div className="row between"><h2>Past debates</h2><button className="btn ghost" onClick={()=>{if(confirm("Delete all history?"))persist([])}}>Clear</button></div>{history.length===0&&<p className="small">Completed debates are saved on this browser.</p>}{history.map(h=><div className="history-item" key={h.id}><div className="row between"><div><strong>{h.sport}: {h.take}</strong><div className="small">{new Date(h.createdAt).toLocaleString()} · {h.difficulty} · {(h.mode||"online")}</div></div><span className="badge">{h.result.toUpperCase()} · {h.userTotal}-{h.aiTotal}</span></div></div>)}</div></section>
    :stage==="setup"?<section className="grid">{kind==="daily"&&<div className="card daily-card"><div className="eyebrow">DAILY DEBATE</div><h2 style={{marginTop:8}}>Today’s thesis is locked.</h2><p className="small">You do not choose the topic. A new debate appears each UTC day. There is no leaderboard.</p></div>}{challengeReady&&<div className="card challenge-card"><div className="eyebrow">FRIEND CHALLENGE</div><h2 style={{marginTop:8}}>You were challenged to the same debate.</h2><p className="small">Topic, difficulty, side, and mode are locked to keep the challenge fair.{challengeTarget?` Beat the original score of ${challengeTarget} points.`:""}</p></div>}{kind==="custom"&&<><div className="card trending-card"><div className="row between"><div><div className="eyebrow">🔥 TRENDING DEBATE</div><h2 style={{marginTop:8}}>{trending.take}</h2><p className="small" style={{marginBottom:0}}>{trending.sport} · {trending.context||"A debate based on a major topic in sports right now."}</p></div><span className="badge">Featured</span></div>{trending.sources&&trending.sources.length>0&&<div className="source-list">{trending.sources.slice(0,2).map((source,i)=><a className="source" key={i} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}<div className="row" style={{marginTop:14}}><button className="btn" onClick={debateTrending}>Debate this</button><button className="btn secondary" disabled={trendingLoading||!isOnline} onClick={refreshTrending}>{trendingLoading?"Refresh live · updating…":"Refresh live"}</button></div></div><div className="card search-card"><label>Search players, teams, leagues, draft topics, or other subjects<input value={searchQuery} placeholder="Try Arsenal, Messi, Bruins, NFL Draft, NBA Draft…" onChange={e=>setSearchQuery(e.target.value)}/></label><div className="search-filter-row" role="tablist" aria-label="Search categories">{([['all','All'],['teams','Teams'],['players','Players'],['prospects','Prospects'],['topics','Draft & leagues']] as const).map(([value,label])=><button type="button" role="tab" aria-selected={searchFilter===value} className={`search-filter ${searchFilter===value?"active":""}`} key={value} onClick={()=>setSearchFilter(value)}>{label}</button>)}</div>{searchQuery.trim().length>=2&&<><div className="search-section-title">{searchFilter==="teams"?"Team debates":searchFilter==="players"?"Player debates":searchFilter==="prospects"?"Prospect systems":searchFilter==="topics"?"Draft and league debates":"Existing debates"}</div><div className="search-results">{searchResults.length?searchResults.map((result,i)=><button type="button" className="search-result" key={`${result.sport}-${i}`} onClick={()=>chooseTake(result.sport,result.take)}><span>{result.take}</span><small>{result.category||result.sport} · {result.sport}</small></button>):<div className="small">{searchFilter==="prospects"?"Search an NHL or MLB team to load its top 15 prospects.":"No curated debates matched that search yet."}</div>}</div>{prospectSystem&&(searchFilter==="all"||searchFilter==="prospects")&&<div className="prospect-box"><div className="row between"><div><strong>{prospectSystem.team} top prospects</strong><div className="small">Load the current top 15 {prospectSystem.league} prospects and debate topics.</div></div><button type="button" className="btn secondary" disabled={!isOnline||prospectLoading} onClick={()=>loadProspectSystem({force:prospectResultsKey===`${prospectSystem.league}-${prospectSystem.team}`})}>{prospectLoading?"Loading…":prospectResultsKey===`${prospectSystem.league}-${prospectSystem.team}`?"Refresh rankings":"Load top 15"}</button></div>{prospectError&&<div className="small error-text">{prospectError}</div>}{prospectResultsKey===`${prospectSystem.league}-${prospectSystem.team}`&&prospectResults.length>0&&<div className="prospect-results">{prospectResults.map(player=><button type="button" className="search-result prospect-result" key={`${player.team}-${player.rank}-${player.name}`} onClick={()=>chooseTake(player.sport,player.take)}><span><b>#{player.rank}</b> {player.name}</span><small>{[player.position,player.currentLevel,player.team].filter(Boolean).join(" · ")}</small></button>)}</div>}</div>}<div className="search-ai-box"><div><strong>Can’t find the right topic?</strong><div className="small">Generate a new debate specifically about “{searchQuery.trim()}”.</div></div><button type="button" className="btn secondary search-generate" disabled={!isOnline||searchGenerating} onClick={generateSearchDebate}>{searchGenerating?"Creating topic…":`Generate new debate`}</button></div></>}</div></>}<div className="mode-picker grid two"><button type="button" className={`card mode-choice ${mode==="online"?"selected":""}`} onClick={()=>setMode("online")}><span className="mode-icon">🤖</span><span><strong>AI Debate (online)</strong><small>Live AI opponent, sources, rating, and competitive scoring.</small></span></button><button type="button" className={`card mode-choice practice-choice ${mode==="offline"?"selected":""}`} onClick={()=>setMode("offline")}><span className="mode-icon">📚</span><span><strong>Practice Mode (offline)</strong><small>Works without OpenAI. Get coaching on evidence, logic, clarity, grammar, and persuasiveness.</small></span></button></div><div className="card grid two"><label>Sport<select value={sport} disabled={kind!=="custom"} onChange={e=>{const s=e.target.value;setSport(s);setTake(TAKES[s][0])}}>{Object.keys(TAKES).map(s=><option key={s}>{s}</option>)}</select></label><label>Difficulty<select value={difficulty} disabled={kind==="challenge"} onChange={e=>setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="impossible">Impossible — adaptive</option></select></label><label>Mode<select value={mode} disabled={kind==="challenge"} onChange={e=>setMode(e.target.value as DebateMode)}><option value="online">Online AI — live research</option><option value="offline">Practice Mode (offline)</option></select></label><div style={{gridColumn:"1 / -1"}}><div className="row between take-heading" style={{marginBottom:7}}><span className="small">Debate take{kind==="custom"?` · ${TAKE_COUNTS[sport]} available`:""}</span>{kind==="custom"&&<div className="row take-actions"><div className="take-filter-row" role="group" aria-label="New take category">{([['all','All'],['teams','Teams'],['players','Players'],['prospects','Prospects'],['topics','Draft']] as const).map(([value,label])=><button type="button" className={`take-filter ${takeFilter===value?"active":""}`} aria-pressed={takeFilter===value} key={value} onClick={()=>setTakeFilter(value)}>{label}</button>)}</div><button type="button" className="btn ghost take-reset" disabled={takeFilter==="all"} onClick={resetTakeFilter}>Reset to all</button><button type="button" className="btn ghost take-generator" onClick={randomTakeForSport}>🎲 New take</button></div>}</div><input aria-label="Debate take" value={take} disabled={kind!=="custom"} onChange={e=>setTake(e.target.value)}/></div><div><div className="small">Your side</div><div className="row" style={{marginTop:8}}><button className={`btn ${side==="defend"?"":"secondary"}`} disabled={kind!=="custom"} onClick={()=>setSide("defend")}>Defend</button><button className={`btn ${side==="counter"?"":"secondary"}`} disabled={kind!=="custom"} onClick={()=>setSide("counter")}>Counter</button><button className={`btn ghost coin-button ${coinFlipping?"flipping":""}`} disabled={kind!=="custom"||coinFlipping} onClick={flipSide}>{coinFlipping?"🪙 Flipping…":"🪙 Coin flip"}</button>{coinResult&&<span className="coin-result">You will <strong>{coinResult}</strong></span>}</div></div><div><div className="small">Timer and effects</div><div className="row" style={{marginTop:8}}><button className={`btn ${timerEnabled?"":"secondary"}`} onClick={()=>setTimerEnabled(v=>!v)}>Timer {timerEnabled?"on":"off"}</button><select style={{width:130}} value={timerLength} onChange={e=>{const v=Number(e.target.value);setTimerLength(v);setTimeLeft(v)}}><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={180}>3 minutes</option></select><button className={`btn ${sound?"":"secondary"}`} onClick={()=>setSound(v=>!v)}>Sound {sound?"on":"off"}</button></div></div></div><div className="row"><button className="btn" onClick={start}>{kind==="challenge"?"Accept friend challenge":mode==="offline"?"Start Practice Mode":"Enter the arena"}</button><button className="btn secondary" onClick={startDaily}>Daily debate</button>{kind==="custom"&&<button className="btn secondary" onClick={randomTake}>Random sport & take</button>}{kind==="custom"&&<button className="btn secondary" onClick={shareFriendLink}>🔗 Friend link</button>}{friendLinkStatus&&<span className="friend-link-status">{friendLinkStatus}</span>}{kind==="daily"&&<button className="btn ghost" onClick={exitDaily}>Exit daily debate</button>}{kind==="challenge"&&<button className="btn ghost" onClick={clearChallenge}>Exit challenge</button>}</div><div className="card small"><strong>{mode==="offline"?"Practice Mode (offline)":"Online AI mode"}</strong>{kind==="custom"&&<div className="small" style={{marginTop:4}}>{TOTAL_TAKES.toLocaleString()} curated takes across {Object.keys(TAKES).length} sports.</div>}<div style={{marginTop:6}}>{mode==="offline"?"Works without OpenAI. After every round, it gives coaching scores and specific ways to improve your evidence, logic, clarity, grammar, and persuasiveness.":"Uses AI research, adaptive rebuttals, and visible sources."}</div></div><div className="card small">Easy, Medium, and Hard are designed to be beatable, with simpler arguments and clearer openings. Impossible remains the full adaptive challenge. UFC-style 10-point-must scorecards appear after every round.</div></section>
    :<section className="grid"><div className="card"><div className="row between"><div><div className="eyebrow">{sport} · {difficulty.toUpperCase()} · {mode.toUpperCase()} · {kind.toUpperCase()}</div><h2 style={{marginTop:7}}>{take}</h2><div className="small" style={{marginTop:8}}>You must {side} the take.</div></div>{timerEnabled&&["userOpening","userFollowup"].includes(stage)&&<div className={`timer ${timeLeft<=10?"danger":""}`}>{clock(timeLeft)}</div>}</div><div className="row" style={{marginTop:16}}>{[1,2,3].map(r=><span key={r} className={`round-dot ${r===round?"active":r<round?"done":""}`}/>)}<span className="badge">Round {round}/3</span><span className="badge">Score {totals.user}-{totals.ai}</span></div></div>

    {exchanges.some(e=>e.userScore!=null&&e.round<round)&&<div className="round-score-history" aria-label="Completed round scorecards">{exchanges.filter(e=>e.userScore!=null&&e.round<round).sort((a,b)=>a.round-b.round).map(e=><div className="mini-scorecard" key={`score-${e.round}`}><div><span className="eyebrow">ROUND {e.round}</span><strong>You {e.userScore} — {e.aiScore} AI</strong></div><span className={`badge ${e.winner==="user"?"winner-badge":e.winner==="ai"?"loser-badge":""}`}>{e.winner==="user"?"YOU WON":e.winner==="ai"?"AI WON":"DRAW"}</span></div>)}</div>}

    {stage==="userOpening"&&<div className="card"><h3>Your opening argument</h3><p className="small">{mode==="offline"?"Make your case. Practice Mode will test your reasoning and coach you after the round.":"Make your case. The AI will research it and attack a specific weak phrase."}</p><textarea ref={textareaRef} value={draft} maxLength={1800} placeholder="State your argument, explain why it matters, and support it with evidence…" onChange={e=>setDraft(e.target.value)}/><div className="row between small"><span>{draft.length}/1800</span><span>{timeLeft===0?"Time expired—submit when ready.":""}</span></div><div className="sticky-submit"><button className="btn" disabled={!draft.trim()} onClick={submitOpening}>Submit opening</button></div></div>}

    {current&&["aiRebuttal","userFollowup","scoring","finished"].includes(stage)&&<><div className="card"><div className="row between"><h3>Your opening</h3><span className="badge">User</span></div><div className="argument" style={{marginTop:12}}><Highlight text={current.userOpening} quote={current.weakQuote}/></div>{current.weakQuote&&<div className="weak-box" style={{marginTop:12}}><strong>Weak point tagged:</strong> “{current.weakQuote}”<div className="small" style={{marginTop:5}}>{current.weakReason}</div></div>}</div><div className="card"><div className="row between"><h3>AI rebuttal</h3><span className="badge">{loading&&stage==="aiRebuttal"?(mode==="offline"?"Preparing…":"Researching…"):"Opponent"}</span></div>{current.aiRebuttal?<div className="argument" style={{marginTop:12}}>{current.aiRebuttal}</div>:<p className="small">{mode==="offline"?"Building an offline practice response…":"Searching and building a sourced response…"}</p>}{current.sources.length>0&&<details className="sources-dropdown"><summary>Sources ({current.sources.length})</summary><div className="source-list compact-source-list">{current.sources.map((s,i)=><a className="source compact-source" key={i} href={s.url} target="_blank" rel="noreferrer"><span>{s.title}</span><span aria-hidden="true">↗</span></a>)}</div></details>}</div></>}

    {stage==="userFollowup"&&current&&<div className="card"><h3>Your follow-up rebuttal</h3><p className="small">Answer the AI’s strongest point before the judge scores the round.</p><textarea ref={textareaRef} value={draft} maxLength={1800} placeholder="Directly answer the rebuttal, repair your weak point, and finish the round…" onChange={e=>setDraft(e.target.value)}/><div className="row between small"><span>{draft.length}/1800</span><span>{timeLeft===0?"Time expired—submit when ready.":""}</span></div><div className="sticky-submit"><button className="btn" disabled={!draft.trim()} onClick={submitFollowup}>Send to judge</button></div></div>}
    {stage==="scoring"&&current&&<div className="card">{loading?<p className="small">The anonymized judge is scoring Debater A vs. Debater B…</p>:<><div className="row between"><div><div className="eyebrow">ROUND {round} SCORECARD</div><div className="scoreline">You {current.userScore} — {current.aiScore} AI</div></div><span className="badge">{current.winner?.toUpperCase()}</span></div><p>{current.judgeReason}</p>{mode==="offline"?(()=>{const feedback=buildPracticeFeedback(current.userOpening,current.userFollowup,take,side);return <div className="practice-report"><div className="row between"><h3>How to improve</h3><span className="practice-score">{feedback.overall}/100</span></div><div className="practice-metrics"><div><span>Evidence</span><strong>{feedback.evidence}</strong></div><div><span>Logic</span><strong>{feedback.logic}</strong></div><div><span>Clarity</span><strong>{feedback.clarity}</strong></div><div><span>Persuasiveness</span><strong>{feedback.persuasiveness}</strong></div><div><span>Grammar</span><strong>{feedback.grammar}</strong></div></div><div className="practice-columns"><div><strong>What you did well</strong>{feedback.strengths.map((item,i)=><p className="small" key={i}>✓ {item}</p>)}</div><div><strong>Work on next</strong>{feedback.improvements.map((item,i)=><p className="small" key={i}>→ {item}</p>)}</div></div><details className="rewrite-box"><summary>See a stronger example</summary><p>{feedback.example}</p></details></div>})():<div className="tip"><strong>What would have beaten this:</strong><div style={{marginTop:5}}>{current.tip}</div></div>}<div className="row" style={{marginTop:15}}><button className="btn" onClick={advance}>{round<3?"Start next round":"Reveal final result"}</button></div></>}</div>}
    {stage==="finished"&&<div className="card"><div className="eyebrow">FINAL DECISION</div><div className="scoreline">You {totals.user} — {totals.ai} AI</div><h2>{totals.user>totals.ai?"You win":totals.user<totals.ai?"AI wins":"Draw"}</h2>{kind==="challenge"&&challengeTarget&&<div className="tip" style={{marginTop:14}}><strong>{totals.user>challengeTarget?"You beat your friend’s score!":totals.user===challengeTarget?"You tied your friend’s score.":"Your friend keeps the higher score."}</strong><div className="small" style={{marginTop:5}}>Friend target: {challengeTarget} · Your score: {totals.user}</div></div>}<div className="row" style={{marginTop:16}}><button className="btn" onClick={shareChallenge}>Challenge a friend</button><button className="btn secondary" onClick={shareText}>Share transcript</button><button className="btn secondary" onClick={downloadText}>Download text</button><button className="btn secondary" onClick={downloadImage}>Download scorecard image</button><button className="btn ghost" onClick={reset}>New debate</button></div></div>}
    </section>}
  </main>
}
