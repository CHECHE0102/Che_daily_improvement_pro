// BinBin timer: starts the GitHub posting workflows on time (GitHub's own schedule runs hours late).
// Needs one secret: GH_TOKEN (fine-grained GitHub token, this repo only, Actions: Read and write).
const REPO = "CHECHE0102/Che_daily_improvement_pro";
const JOBS = {
  "3,33 * * * *": ["social-post.yml"],         // FB/IG posts + reels, every 30 min (posts only what is due)
  "7 9,12 * * *": ["daily-news-story.yml"],    // daily news Stories 09:07 UTC, retry 12:07 (skips if done)
};
async function dispatch(env, wf) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${wf}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json",
               "User-Agent": "binbin-timer", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main" }),
  });
  return `${wf}: ${r.status}`;
}
export default {
  async scheduled(event, env, ctx) {
    for (const wf of JOBS[event.cron] || []) console.log(await dispatch(env, wf));
  },
  async fetch() {
    return new Response("BinBin timer is running.");
  },
};
