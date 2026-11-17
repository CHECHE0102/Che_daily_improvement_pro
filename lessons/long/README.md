# BinBin 長影片製作說明（V001 起）

這份說明寫給「負責把腳本做成影片」的模型看。照著做，不需要再問人就能把一支 5–10 分鐘的英文教學影片做完並交給 CheChe。
第一支成品是 V001「咖啡店打工第一天」，腳本在 `lessons/long/V001-cafe-first-day.json`，拿它當範本。

## 0. 先知道這幾件事（CheChe 定的規則）

1. 長影片**只上傳 YouTube**，不放進 BinBin 遊戲或網站。編號從 **V001** 開始往上加（V002、V003…），不要用 L 開頭（L 是遊戲裡的短課）。
2. **全英文教學**：老師從頭到尾用同一個英文聲音，說很簡單的英文（A2–B1）。中文只出現在畫面上（字幕、黑板上的意思），**不要有中文配音**。CheChe 聽過中英文兩個聲音切換的版本，覺得很怪，不要再做。
3. 老師是 **Niamh**（唸作 Neev），28 歲、高挑、半寫實畫風。圖已經畫好，放在 `assets/art/lesson/niamh/`，不用重畫。需要新姿勢才請 CheChe 給 Codex 畫（見第 6 節）。
4. 風格要**生動活潑**：開場用短劇製造問題、老師自嘲、每句都讓觀眾跟著唸、段落之間有小笑點。
5. 文字規則：不提價格（不寫免費、限時、會員價）；不用真實品牌或真人名字；不要說「愛爾蘭新聞」，結尾固定說「打開 BinBin，每天用一則新聞練英文」的意思。
6. 畫面上的大字**絕對不能被切到**。程式會自動縮字，縮不下去會直接報錯，不要關掉這個檢查。
7. 做完先給 CheChe 看，CheChe 說 OK 才算完成。**不要自己合併到 main**，除非 CheChe 說「推上去」。
8. 回覆 CheChe 一律用繁體中文。

## 1. 檔案在哪裡

| 檔案 | 用途 |
|---|---|
| `lessons/long/V###-<英文短名>.json` | 一支影片一個腳本（你主要寫的就是這個） |
| `lessons/long/long-render.js` | 把腳本的每一句畫成 1920×1080 的畫面（HTML + CSS 動畫） |
| `tools/make_long_lesson.py` | 配音、排時間軸、算畫面、混音，輸出 mp4 |
| `tools/render_long_frames.js` | 逐格截圖並檢查文字有沒有跑出框 |
| `tools/make_long_thumb.js` | 做 YouTube 縮圖（1280×720） |
| `.github/workflows/long-lesson.yml` | GitHub 上的「Long lesson video」流程，真正配音和算影片的地方 |
| `assets/art/lesson/niamh/` | 老師的圖 `niamh-<姿勢>.webp` 和背景 `bg-cafe.webp`、`bg-studio.webp` |

成品（不在 main 上）：`lesson-videos` 分支的 `V###.mp4`、`V###-thumb.png`、`V###-chapters.txt`。

## 2. 製作流程（一步一步）

1. 從最新的 `main` 開一個分支（用你這次工作被指定的分支名）。
2. 寫 `lessons/long/V###-<短名>.json`（格式見第 3 節，寫作規則見第 4 節）。編號用目前最大的 V 編號加 1。
3. **本機檢查排版**（不需要網路，約 4 分鐘）：
   ```
   python3 tools/make_long_lesson.py lessons/long/V###-xxx.json --fake-tts --stills --shots /tmp/shots
   ```
   - 會印出預估總長度（`total 400s = 6.7 min`）。目標 **6–9 分鐘**。真實配音通常比預估**長 20–30%**，所以預估 5.5–7 分鐘最剛好。
   - `/tmp/shots/line-000.png …` 是每一句最後的畫面。**至少打開看 10 張**：每種場景各看幾張，確認字沒有太小、沒有被擋住、老師姿勢合理。
   - 如果報錯 `text leaves its box`，代表那一句的字塞不下：把那句寫短，或拆成兩句。
   - 跑完後 `tools/__pycache__/*.pyc` 會被改到，請執行 `git checkout -- tools/__pycache__`，不要把它 commit 進去。
4. commit 並 push 你的分支。push 之後 GitHub 會自動跑「Long lesson video」，只算這次有改到的腳本。大約 **25 分鐘**。
   - 為什麼一定要在 GitHub 上算：配音服務（edge-tts）在雲端工作環境被擋住，只有 GitHub 的機器連得到。
   - 等待時不要一直查。排一個 25 分鐘後的提醒再回來看。
5. 用 GitHub 工具查這次執行有沒有成功（列出 `long-lesson.yml` 的 workflow runs）。失敗就讀失敗那個 job 的 log 最後 80 行，照第 7 節處理。
6. 成功後取回成品：
   ```
   git fetch origin lesson-videos
   git show FETCH_HEAD:V###.mp4 > /tmp/V###.mp4
   git show FETCH_HEAD:V###-thumb.png > /tmp/V###-thumb.png
   git show FETCH_HEAD:V###-chapters.txt
   ```
7. **檢查成品**（第 5 節的清單）。
8. 交付給 CheChe（第 5 節）。

改台詞後重做：改 json、push，流程會重算，一樣約 25 分鐘（沒改到的句子配音有快取）。

## 3. 腳本格式

最上層欄位：

```json
{
 "id": "V002",
 "title": "中文標題（會顯示在畫面左上角，10 個字以內）",
 "subtitle": "一句話說明",
 "level": "A2–B1",
 "date": "2026-11-20",
 "teacher": "niamh",
 "thumb": {"pose": "barista-panic", "bg": "bg-cafe", "line1": "白色大字（7 字內）", "line2": "黃色大字（8 字內）", "tag": "白底小標（8 字內）", "sticker": "❓"},
 "voices": {"T": "en-IE-EmilyNeural", "TE": "en-IE-EmilyNeural", "E": "en-IE-EmilyNeural", "A": "en-IE-EmilyNeural", "B": "en-GB-SoniaNeural"},
 "prosody": {"E": ["-4%", "+0Hz"], "A": ["-12%", "+0Hz"], "B": ["-6%", "-2Hz"]},
 "chapters": ["Intro", "接單", "聽不懂", "出包了", "跟同事", "愛爾蘭限定", "總複習"],
 "scenes": [ ... ]
}
```

- `voices` 和 `prosody` **整段照抄**，不要換聲音。E = 老師講解，A = 老師示範句子（比較慢）和短劇裡的店員，B = 短劇裡的另一個人。
- `chapters`：畫面右上角的章節標籤，最多 7 個，每個 5 個字以內。也是 YouTube 章節的名字。
- `scenes`：依序播放的場景。每個場景有 `type`、`ch`（屬於第幾個章節，從 0 算）和 `lines`（一句一句的台詞）。

### 3.1 每一句台詞（line）的欄位

| 欄位 | 說明 |
|---|---|
| `v` | 誰在說：`"E"` 老師用英文講解；`"A"` 示範句子或短劇的店員；`"B"` 短劇的客人或對方 |
| `say` | 要唸出來的英文。**不要放中文** |
| `zh` | 這句的中文翻譯，顯示在英文字幕下面。**每一句 E、A、B 都要有**（黑板場景裡的 A 示範句可以不寫） |
| `cap` | 畫面上顯示的字和唸的不一樣時才用。唯一的固定用法：`say` 寫 `Neev`、`cap` 寫 `Niamh`（讓聲音唸對老師的名字） |
| `pose` | 老師這句的姿勢（第 3.3 節的名字）。不寫就是 `talk` |
| `step` | 讓黑板上的東西在這一句跳出來（見各場景說明） |
| `echo` | `true`：這句唸完後留時間給觀眾跟著唸，畫面出現「Your turn!」倒數條。只用在 `v: "A"` 的示範句 |
| `pause` | 沒有聲音的停頓秒數（要搭配 `"say": ""`，`v` 寫 `"T"`） |
| `sticker` | 這句跳出一個表情符號，搭配 `stickerX`、`stickerY`（黑板場景常用 640、140） |
| `L`、`R` | 只在短劇用：從這句開始換左邊（店員）或右邊（客人）的姿勢 |
| `end` | `true`：整支影片最後一句，會灑彩帶 |

長度限制：`say` 一句最多約 **18 個英文單字**，`zh` 最多約 **32 個中文字**。更長就拆成兩句。

### 3.2 場景種類

**`skit` 短劇**（咖啡店背景，左邊店員、右邊客人，都是 Niamh 扮的）
```json
{"type": "skit", "ch": 1, "L": "barista", "R": "customer", "lines": [
  {"v": "E", "say": "Let's watch a full order.", "zh": "來看一次完整的接單。"},
  {"v": "A", "say": "Hi there! What can I get you?", "zh": "嗨！想喝點什麼？"},
  {"v": "B", "say": "A cappuccino, please.", "zh": "一杯卡布奇諾，謝謝。", "R": "customer-happy"}
]}
```
`L` 只能用 `barista` 開頭的姿勢，`R` 只能用 `customer` 開頭的姿勢。目前只有咖啡店這一個短劇背景；別的地點要先請 CheChe 給 Codex 畫新背景。

**`chapter` 章節卡**（一個大數字加標題，每個章節開頭放一張）
```json
{"type": "chapter", "ch": 1, "num": "1", "title": "Taking an order", "sub": "接單：三句話接完一張單", "lines": [
  {"v": "E", "say": "Part one: taking an order.", "zh": "第一段：接單。", "pose": "point"}
]}
```
`title` 用英文（20 個字母以內），`sub` 用中文（14 字以內）。`num` 可以是數字或一個符號（☘、★）。

**`talk` 老師加黑板**（最通用）。`board` 可以放：
- `emoji`：一個大表情
- `kicker`：黃色小標題
- `big`：1–2 行大字。開頭加 `*` 的那行會變成黃色特大字。`bigStep`：每行在第幾步出現（0 = 一開始就在）
- `items`：條列，最多 3 條。`✗` 開頭變紅色劃掉，`✓` 開頭變黃色。第 n 條在 `step: n` 的那句跳出來
- `cta`：白底膠囊字，`ctaStep` 決定第幾步出現
```json
{"type": "talk", "ch": 2, "board": {"kicker": "Never say this", "items": ["✗ What?", "✗ Again!"]}, "lines": [
  {"v": "E", "say": "Please, never say: What?", "zh": "拜託，千萬不要說 What？", "pose": "no", "step": 1},
  {"v": "E", "say": "And never say: Again! It sounds rude.", "zh": "也不要說 Again！聽起來很沒禮貌。", "pose": "no", "step": 2}
]}
```

**`phrase` 教一個句子**（影片的主體）。固定用這個順序寫：
```json
{"type": "phrase", "ch": 1, "num": 2, "label": "No. 2",
 "phrase": "Is that to have here or take away?", "meaning": "內用還是外帶？", "note": "美國 to go ＝ 愛爾蘭 take away",
 "lines": [
  {"v": "E", "say": "After they order, ask this.", "zh": "客人點完之後，問這一句。"},
  {"v": "A", "say": "Is that to have here or take away?", "pose": "point"},
  {"v": "E", "say": "Have here means you drink it in the café.", "zh": "have here 是內用。", "step": 1},
  {"v": "E", "say": "Careful! Americans say to go.", "zh": "注意！美國人說 to go。", "pose": "secret", "step": 2},
  {"v": "E", "say": "Your turn!", "zh": "換你！", "pose": "cheer"},
  {"v": "A", "say": "Is that to have here or take away?", "pose": "point", "echo": true}
]}
```
句子一開始就在黑板上；`step: 1` 那句跳出 `meaning`（黃色膠囊，中文意思，14 字內）；`step: 2` 那句跳出 `note`（小字提示，18 字內）。`phrase` 最多 8 個英文單字，超過 24 個字母會自動排成兩行。

**`recap` 總複習表**：`board: {"kicker": "Today's 12 sentences", "items": [最多 12 句]}`，配 2 句老師台詞。

結尾固定用一個 `talk` 場景，最後一句加 `"end": true`。

### 3.3 Niamh 的姿勢

| 名字 | 樣子 | 適合用在 |
|---|---|---|
| `hi` | 揮手微笑 | 自我介紹、道別 |
| `talk` | 單手攤開講解 | 一般講解（預設） |
| `talk2` | 雙手比劃、很投入 | 講故事、強調 |
| `point` | 手指向旁邊的黑板 | 示範句子、指重點、章節卡 |
| `think` | 手指抵下巴往上看 | 提問、「課本怎麼教？」 |
| `secret` | 手擋嘴邊眨眼 | 小秘訣、吐槽、偷偷告訴你 |
| `no` | 雙手比 X、板著臉 | 「千萬不要這樣說」 |
| `cheer` | 雙手握拳、單腳跳起、大笑 | 「換你說！」、鼓勵、過關 |
| `thumb` | 比讚、手叉腰 | 稱讚、「這樣就很專業」 |
| `barista` | 穿圍裙、遞出外帶杯 | 短劇店員（正常） |
| `barista-panic` | 穿圍裙、嚇到當機 | 短劇店員出包、聽不懂 |
| `barista-sorry` | 穿圍裙、雙手合十道歉 | 道歉 |
| `barista-ask` | 穿圍裙、手放耳邊聽不清楚 | 請對方再說一次、請同事幫忙 |
| `barista-break` | 邊解圍裙邊揮手、很開心 | 下班、休息、影片結尾 |
| `customer` | 紅毛帽、風衣、舉手點餐 | 短劇客人（正常） |
| `customer-happy` | 雙手捧咖啡、很滿意 | 短劇客人滿意、道謝 |

連續兩句不要用同一個姿勢超過 3 次，畫面才會活。黑板場景也可以用 `barista-*`、`customer-*`（例如教道歉那句時用 `barista-sorry`）。

### 3.4 來賓角色、場景背景、角色名牌（V002 起）

V002 之後每支影片有一位各國的來賓角色，跟 Niamh 演短劇。腳本最上層多三個欄位：

```json
"bg": "bg-garda",
"guest": "conor",
"roles": {"A": "Niamh 報案的人", "B": "Conor 警察"},
```

- `bg`：短劇（`skit`）用的背景圖檔名，不含副檔名。沒寫就用 `bg-cafe`。黑板場景一律是教室背景，不受影響。
- `guest`：來賓的英文小寫名字，只是給人看的註記。
- `roles`：短劇字幕框上方的名牌。`A` 是左邊的人（Niamh），`B` 是右邊的人（來賓）。
- `voices.B`：來賓的聲音，每位來賓不同，照腳本寫的用，不要改。

短劇的 `L`（左）、`R`（右）填的是圖的名字。程式先找 `niamh-<名字>.webp`，找不到再找 `<名字>.webp`。所以：
- `"L": "customer"` 是 Niamh 的風衣造型（`niamh-customer.webp`）。
- `"R": "conor"` 是 Conor 原本的站姿（`conor.webp`），`"R": "conor-talk"` 是他說話的姿勢（`conor-talk.webp`）。
- 每位來賓有 5 張：`<名字>`（站姿，聽人說話時用）、`<名字>-talk`（說話）、`<名字>-think`（思考、猶豫）、`<名字>-happy`（開心、同意）、`<名字>-frown`（不滿、拒絕）。

來賓的圖和背景圖都放在 `assets/art/lesson/niamh/`。圖還沒放進去時，畫面上會出現虛線框寫著圖的名字，**這種狀態不可以交付**。把 Codex 畫的 PNG 轉進來的方法：

```
python3 tools/import_long_art.py person conor-talk  /path/to/conor-talk.png
python3 tools/import_long_art.py person conor       /path/to/ireland.png      # 原站姿
python3 tools/import_long_art.py bg     bg-garda    /path/to/bg-garda.png
```

圖的來源在 CheChe 電腦上：來賓的 4 個姿勢在 `D:\sidejob\picture\cast\`，原站姿在 `D:\sidejob\picture\female\` 和 `D:\sidejob\picture\male\`（哪個檔案是誰，看 `/mnt/project-files/binbin/lessons/codex/CODEX-TASK-cast.md` 的表），背景在 `D:\sidejob\picture\longbg\`。每支影片的 prompt 會列出那一支需要的圖。

### 3.5 寫好但還沒製作的腳本

寫好、還在等圖的腳本放在 `lessons/long/drafts/`。放在這裡不會觸發 GitHub 的影片流程。要製作某一支時，把它搬到 `lessons/long/`（`git mv lessons/long/drafts/V002-report-a-theft.json lessons/long/`），之後照第 2 節的流程做。**不要改台詞。**

## 4. 腳本怎麼寫才好看

固定骨架（V001 就是這樣，總共約 125 句、33 個場景、8 分鐘）：

1. **開場短劇**（3 句）：直接演出問題，不要先打招呼。
2. **老師吐槽加自我介紹**（4–6 句）：自嘲的小故事、`Hi everyone, I'm Niamh!`、今天要學什麼。
3. **3–4 個章節**，每個章節：章節卡（1–2 句）→ 一個「常見錯誤」或「重點」黑板（2–3 句）→ **3 個 phrase 場景**（每個 5–6 句）→ 可以加一段短劇把這 3 句演一次（4–8 句）。
4. **加碼段**（選用）：1–2 個愛爾蘭或當地特有的說法。
5. **總複習短劇**（6–8 句）：用今天的句子演完整的一場。
6. **recap 表**（2 句）加**結尾**（2 句，最後一句 `end: true`）。

寫作要點：
- 老師的英文要**短、慢、清楚**：用最常見的 2000 字，不用 idiom 解釋 idiom。解釋句型固定用 `It means: …`、`… means: …`。
- 每個 phrase 的說明至少有一句是「為什麼」或「什麼時候用」，另一句最好是笑點或提醒。
- 一整支影片教 **9–12 句**。句子要是當地真的會聽到的說法。
- 先查有沒有教過：`grep -il "<句子裡的關鍵字>" lessons/scripts/*.json lessons/long/*.json`。已經當主句教過的不要再教。
- 中文翻譯要口語（台灣用語），不要逐字翻。
- 老師名字：台詞裡要唸到名字時，`say` 寫 `Neev`，`cap` 寫同一句但用 `Niamh`。

## 5. 檢查和交付

成品檢查（都要做）：
1. `ffprobe -v error -show_entries format=duration,size -of compact /tmp/V###.mp4`：長度 5–10 分鐘，檔案小於 100 MB。
2. 聲音有沒有：`ffmpeg -v info -i /tmp/V###.mp4 -af volumedetect -vn -f null - 2>&1 | grep mean_volume`，大約 -22 dB 是正常；-60 dB 以下代表沒聲音。
3. 抽 10 個時間點截圖來看（要包含短劇、phrase、章節卡、recap、結尾）：
   `ffmpeg -v error -y -ss <秒> -i /tmp/V###.mp4 -frames:v 1 /tmp/f.png`
4. 你聽不到聲音，所以交付時要請 CheChe 幫忙聽語速和發音。

交付：
1. 把 `V###.mp4`、`V###-thumb.png` 複製到 `/mnt/project-files/binbin/lessons/long/`，檔名用 `V###-中文標題.mp4`、`V###-YouTube縮圖.png`。
2. 寫 `V###-YouTube文案.md`（照 `V001-YouTube文案.md` 的格式）：標題、說明、章節時間（直接用 `V###-chapters.txt` 的內容，章節名可以改得更清楚）、今天的句子清單、標籤。
3. 把縮圖和文案複製到 CheChe 電腦的 `D:\sidejob\BinBin小教室\長課\`。**影片超過 25 MB 沒辦法直接存到 CheChe 電腦**，改成在訊息裡附上影片檔，並給下載連結：
   `https://github.com/CHECHE0102/Che_daily_improvement_pro/raw/lesson-videos/V###.mp4`
4. 回覆 CheChe：第一句就給影片，接著說長度、你檢查了什麼、請 CheChe 聽什麼。

## 6. 需要新的圖的時候

現有的圖只有：Niamh 的 16 個姿勢、咖啡店背景、教室背景。腳本需要別的地點（超市、Pub、公車站、租屋）或別的造型時：
1. 寫 Codex 任務檔，照 `/mnt/project-files/binbin/lessons/codex/CODEX-TASK-teacher-3.md` 和 `teacher3-queue.json` 的格式（每張圖一段完整的英文 prompt，都要附 `D:\sidejob\picture\teacher3\niamh-sheet.png` 當參考，確保長相一致）。
2. 把任務檔放到 CheChe 電腦的 `D:\sidejob\picture\codex\`，再給 CheChe 一段可以直接貼給 Codex 的話。
3. Codex 畫完後取回 PNG，人物圖去背後貼到 900×1536 的透明畫布（腳貼齊底部、左右置中），存成 `assets/art/lesson/niamh/niamh-<姿勢>.webp`；背景縮成 1920×1280 存成 `bg-<名字>.webp`。轉檔用 `tools/import_long_art.py`（見 3.4）。新背景在腳本最上層寫 `"bg": "bg-<名字>"` 就會用在短劇場景。
4. 造型規則：合身俐落、得體，不走暴露路線。

## 7. 常見問題

| 狀況 | 怎麼辦 |
|---|---|
| 流程 log 出現 `No audio was received` 或 `tts failed` | 配音服務暫時拒絕。流程自己會重試 4 次；還是失敗就等 10 分鐘，用 GitHub 工具手動再跑一次（workflow_dispatch，`script` 填腳本路徑）。已配好的句子有快取，會接著做 |
| `text leaves its box` | 那一句（log 會寫第幾句）的字太多，寫短或拆句 |
| push 被拒絕，說檔案超過 100 MB | 流程已經會自動重新壓縮；如果還是發生，把腳本縮短 |
| push 後流程沒有跑 | 流程只在 `lessons/long/*.json` 有變動時才跑。只改了程式沒改腳本的話，用 workflow_dispatch 手動跑 |
| 本機跑 `make_long_lesson.py` 不加 `--fake-tts` | 會卡住或失敗，雲端環境連不到配音服務。本機一律加 `--fake-tts` |
| 畫面出現虛線框寫著姿勢名字 | 那個姿勢的圖不存在，檢查 `pose` 有沒有拼錯（只能用第 3.3 節的名字） |
| 想改版型（顏色、位置、字體大小） | 改 `long-render.js` 的 CSS。改完一定要重跑第 2 節第 3 步看截圖 |
