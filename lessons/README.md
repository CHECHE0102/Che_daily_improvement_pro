# BinBin 小教室 (mini lessons)

One script per lesson: `lessons/scripts/L###-<slug>.json`. From it, the **Lesson audio and video** workflow makes
- the in-app lesson (`lessons/audio/<id>/` one mp3 per line + `lessons/index.json`), shown in the exam page's 小教室 tab
- a vertical 1080×1920 mp4 for YouTube Shorts / Instagram Reels, stored on the `lesson-videos` branch (never on main)

Both are drawn by `lessons/lesson-render.js`, so they look the same.

## Writing a lesson

Audience: Chinese speakers (Traditional Chinese) in Ireland on working holiday or studying abroad, A2–B1.
Goal: 60–120 seconds, one small idea (2–3 phrases or one grammar point) people really hear in Ireland.

Topic areas (rotate; check existing ids/titles first and never repeat a phrase already taught):
1. Irish slang & everyday phrases (grand, craic, sound, giving out, your man, the jacks…)
2. Work: interview, rota, calling in sick, asking for a day off, tips, small talk with coworkers
3. Housing: viewing a room, deposit, landlord, bills, complaining politely
4. Health & services: GP, pharmacy, PPS, bank, Leap card, bus
5. Social: pub, ordering, invitations, saying no politely
6. Grammar that confuses learners: used to / be used to, present perfect, would vs will, phrasal verbs

Rules
- Teacher lines (`"v": "T"`) are spoken Chinese; keep English inside them short (a word or phrase). English is voiced separately by a native voice.
- Dialogue lines: `"v": "A"` (Emily) / `"v": "B"` (Connor), natural Irish English, each with `"zh"` translation.
- Big words (phrase, hook word, grammar head) shrink automatically to fit the screen; render_frames.js refuses a frame where text runs off the edge.
- Long caption / dialogue lines get a smaller font automatically so they stay inside the speech bubble (capFit in lesson-render.js); render_frames.js also refuses a frame whose caption spills out of the bubble. Still, keep dialogue lines short (about 45 characters max) so the text stays big.
- Max ~45 Chinese characters per teacher line, ~12 words per English line (it must fit the caption box).
- `cap` replaces the on-screen caption when the spoken line would be too long to show; otherwise leave it out (karaoke needs cap == say).
- No price wording at all (no 免費 / 限時 / 會員價). Don't say 愛爾蘭新聞 — news follows the player's region: say 每天一則新聞.
- No real brand names or real people.
- Never edit `lessons/audio/`, `lessons/index.json` or any other file: the workflow makes them.

Slide types (see `L001-irish-phrases.json` for a full example)
- `hook` `{big:[line1, BIG WORD, line3], emoji?}`: the opening question, 1–2 teacher lines
- `phrase` `{num, phrase, pron?, meaning, img, scene?}`: teacher intro, A/B dialogue, teacher note
- `grammar` `{kicker, head, points:[…], img}`
- `quiz` `{q, ask, opts:[3], ans}`: lines = teacher intro, A says q, teacher asks, then
  `{"v":"T","say":"","cap":"倒數⋯⋯","pause":3,"countdown":true}`, then the answer line with `"reveal": true`
- `recap` `{items:[[phrase, meaning]×3], img}`: last line has `"end": true` and ends with 「打開 BinBin，每天用一則新聞練英文。我們下次見！」

`img` / `scene` are names in `assets/art/` without `.webp` (e.g. `scene-party`, `scene-study`, `scene-rest`, `scene-win`, `scene-welcome`, `scene-read`, `scene-quiz`, `scene-bell`).
Top-level fields: `id`, `title`, `subtitle`, `level`, `kind` (`phrase` or `grammar`: which 小教室 tab it goes in), `date` (YYYY-MM-DD), `voices` (copy from L001), optional `youtube` (added later by hand).

## Teachers (one teacher per 10 lessons)

Set `"teacher"` and copy that teacher's `voices` and `prosody` into the script. Each teacher sounds different.

| Lessons | `teacher` | Who | `voices.T` / `voices.TE` | `prosody` |
|---|---|---|---|---|
| L001–L010 | `cian` (default) | Cian 老師, early 30s man | `zh-TW-YunJheNeural` / `en-IE-ConnorNeural` | leave out (built-in) |
| L011–L020 | `aoife` | Aoife 老師, late 20s woman | `zh-TW-HsiaoChenNeural` / `en-IE-EmilyNeural` | `{"T": ["+4%", "+0Hz"], "TE": ["-6%", "+2Hz"]}` |
| L021–L030 | `declan` | Declan 老師, mid 40s man | `zh-TW-YunJheNeural` / `en-GB-RyanNeural` | `{"T": ["-4%", "-14Hz"], "TE": ["-8%", "-4Hz"]}` |

Art lives in `assets/art/lesson/<prefix>-{talk,yay,hi,bye,think,wow,point}.webp` (Cian's prefix is `teacher`). A new teacher needs all 7 poses before its first lesson; register it in `TEACHERS` in `lessons/lesson-render.js`.
