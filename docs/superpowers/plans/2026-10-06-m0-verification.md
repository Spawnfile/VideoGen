# M0 — Doğrulama Spike'ları ve Disk Hazırlığı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec'in dayandığı doğrulanmamış varsayımları kanıtla kapatmak, M3 testleri için gerçek Claude stream fixture'larını kaydetmek ve onaylı disk temizliğini yapmak.

**Architecture:** Atılabilir spike script'leri `spikes/m0/` altında düz ESM JavaScript olarak yazılır (TS araç zinciri henüz yok). Tek kalıcı çıktılar: `tests/fixtures/claude-streams/*.ndjson`, `claude-plugin/` iskeleti ve `docs/m0/report.md`. Spike kodu hiçbir zaman üretim koduna kopyalanmaz.

**Tech Stack:** Node 24.18, `@anthropic-ai/claude-agent-sdk@0.3.290` (gömülü CLI 2.1.290), `three@0.186.1`, Blender 5.2.2 (`blender-gpu`), bash.

**Spec:** `docs/superpowers/specs/2026-10-06-videogen-design.md` (§6, §7.3, §17 M0, §18)

## Global Constraints

- Ücretli API yok. `ANTHROPIC_API_KEY` hiçbir script'e geçirilmez; env temizleyici onu ve `CLAUDECODE` / `CLAUDE_CODE_*` değişkenlerini çıkarır.
- Probe'larda model `haiku`, `maxTurns ≤ 6`. Abonelik kullanımını en aza indir.
- Kullanıcının gerçek Claude girişine dokunma. Giriş akışı spike'ı **izole bir `CLAUDE_CONFIG_DIR`** ile çalışır ve girişi tamamlamaz.
- Silme işlemleri yalnızca kullanıcının onayladığı dört madde için yapılır, her biri öncesinde son durum kaydedilir.
- Commit yazarı env ile verilir: `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com"` (+ aynı committer); mesaj sonunda `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fixture formatı (M3'ün `FakeClaudeDriver` sözleşmesi): her satır `{"t": <başlangıçtan ms>, "m": <SDKMessage>}`.

## Review Focus

1. **Gerçek girişin bozulması:** Giriş spike'ı yanlışlıkla gerçek `~/.claude` girişini değiştirirse kullanıcının tüm Claude Code oturumları düşer. Task 6, izole config dizinini script düzeyinde zorunlu kılar ve sonunda `claude auth status` ile gerçek girişin sağlam olduğunu doğrular.
2. **Commit edilmemiş iş kaybı:** `minillm-lab` içinde commit edilmemiş ya da push edilmemiş iş varsa silme geri alınamaz. Task 1 önce `git status` ve `git log @{u}..` kontrolü yapar; bulgu varsa durur ve kullanıcıya sorar.
3. **Fixture'larda sızıntı:** Kayıtlı stream'ler e-posta, org id ve yerel yollar içerir. Task 3, fixture'lar repoya girmeden önce bunları maskeler.
4. **Plugin skill'lerinin yüklenmemesi:** Symlink'li skill klasörleri plugin yükleyicisi tarafından takip edilmeyebilir. Task 3 bunu init olayındaki `skills` listesiyle doğrular.
5. **Yol korumasının delinmesi:** `PreToolUse` hook'u, `dontAsk` modunda run klasörü dışına yazmayı gerçekten engelliyor mu? Task 4 bunu bilinçli bir kaçış denemesiyle test eder.

---

### Task 1: Onaylı disk temizliği

**Files:**
- Create: `docs/m0/disk-cleanup.md`

**Interfaces:**
- Consumes: —
- Produces: ≥ 30 GB boş disk (sonraki görevlerin önkoşulu)

- [ ] **Step 1: Ön durumu kaydet**

```bash
mkdir -p docs/m0
{
  echo "# M0 Disk temizliği"; echo; echo "## Önce ($(date -Iseconds))"; echo '```'
  df -h / | tail -1
  ollama list
  du -sh ~/.npm ~/.cache/go-build ~/.cache/google-chrome ~/.cache/uv \
         ~/gpu-server/jet-engine/node_modules ~/gpu-server/remotion-test/node_modules \
         ~/gpu-server/minillm-lab 2>/dev/null
  echo '```'
} > docs/m0/disk-cleanup.md
cat docs/m0/disk-cleanup.md
```

- [ ] **Step 2: minillm-lab'da kaybolacak iş var mı kontrol et**

```bash
cd ~/gpu-server/minillm-lab
git status --short 2>&1 | head -20
git log --oneline @{u}.. 2>&1 | head -20
git stash list 2>&1 | head
cd -
```

Beklenen: üç çıktı da boş, ya da "not a git repository" / "no upstream" mesajı. Commit edilmemiş değişiklik, push edilmemiş commit veya stash varsa **DUR**: listeyi kullanıcıya göster, silme için yeniden onay iste ve bu adımı onaya kadar atla.

- [ ] **Step 3: Onaylı maddeleri sil**

```bash
ollama rm gemma4:e4b gemma4:e2b
npm cache clean --force
if command -v go >/dev/null; then go clean -cache; else rm -rf ~/.cache/go-build; fi
if pgrep -x chrome >/dev/null || pgrep -f '/opt/google/chrome/chrome' >/dev/null; then
  echo "Chrome açık: ~/.cache/google-chrome atlandı"
else
  rm -rf ~/.cache/google-chrome
fi
uv cache clean
rm -rf ~/gpu-server/jet-engine/node_modules ~/gpu-server/remotion-test/node_modules
rm -rf ~/gpu-server/minillm-lab   # yalnızca Step 2 temizse
```

- [ ] **Step 4: Sonrasını kaydet ve doğrula**

```bash
{ echo; echo "## Sonra ($(date -Iseconds))"; echo '```'; df -h / | tail -1; ollama list; echo '```'; } >> docs/m0/disk-cleanup.md
df -BG / | awk 'NR==2 {gsub("G","",$4); exit ($4 >= 30 ? 0 : 1)}' && echo "OK: >= 30 GB boş" || echo "UYARI: < 30 GB boş"
```

Beklenen: `OK: >= 30 GB boş`. Chrome açık olduğu için atlandıysa bunu rapora not et; eşik yine de büyük olasılıkla tutar.

- [ ] **Step 5: Commit**

```bash
git add docs/m0/disk-cleanup.md
git commit -m "chore(m0): record approved disk cleanup"
```

---

### Task 2: Spike çalışma alanı ve platform plugin iskeleti

**Files:**
- Create: `spikes/m0/package.json`
- Create: `spikes/m0/lib.mjs`
- Create: `claude-plugin/.claude-plugin/plugin.json`
- Create: `claude-plugin/skills/` (symlink'ler)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `spikes/m0/lib.mjs` → `cleanEnv(): Record<string,string>`, `baseOptions(cwd: string): Options`, `record(name: string, prompt: string | AsyncIterable, extra?: {cwd?: string, options?: object}): Promise<SDKMessage[]>`, `ROOT`, `FIXTURES`

- [ ] **Step 1: Spike paketi**

`spikes/m0/package.json`:

```json
{
  "name": "videogen-m0-spikes",
  "private": true,
  "type": "module",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.3.290",
    "three": "0.186.1",
    "zod": "4.6.5"
  }
}
```

```bash
cd spikes/m0 && npm install && cd -
ls spikes/m0/node_modules/@anthropic-ai/
```

Beklenen: hem `claude-agent-sdk` hem `claude-agent-sdk-linux-x64` kurulu. Linux paketi yoksa `npm install --include=optional` ile tekrar dene.

- [ ] **Step 2: Gömülü binary'yi bul ve sürümünü kaydet**

```bash
BIN=$(find spikes/m0/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64 -maxdepth 2 -type f -perm -u+x | head -1)
echo "$BIN"; "$BIN" --version
```

Beklenen: `2.1.290 (Claude Code)`. Yolu ve sürümü `docs/m0/report.md` taslağına not et (Task 8'de birleştirilecek).

- [ ] **Step 3: Platform plugin iskeleti**

`claude-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "videogen",
  "version": "0.1.0",
  "description": "VideoGen platform plugin: video skills and role guides for isolated pipeline agents"
}
```

```bash
mkdir -p claude-plugin/skills
for s in remotion-best-practices remotion-render remotion-captions remotion-markup remotion-multimedia ffmpeg video-use manim-video; do
  ln -sfn "$(readlink -f ~/.claude/skills/$s)" "claude-plugin/skills/$s"
done
ls -la claude-plugin/skills
```

Beklenen: 8 symlink, hepsi var olan klasörleri gösteriyor.

- [ ] **Step 4: Ortak spike kütüphanesi**

`spikes/m0/lib.mjs`:

```js
import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const FIXTURES = resolve(ROOT, 'tests/fixtures/claude-streams');
export const WORK = resolve(import.meta.dirname, 'work');
mkdirSync(FIXTURES, { recursive: true });
mkdirSync(WORK, { recursive: true });

const DROP = /^(CLAUDECODE$|CLAUDE_CODE_|ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$)/;

export function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!DROP.test(k) && v !== undefined) env[k] = v;
  env.ENABLE_TOOL_SEARCH = 'false';
  return env;
}

export function baseOptions(cwd = WORK) {
  return {
    model: 'haiku',
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    plugins: [{ type: 'local', path: resolve(ROOT, 'claude-plugin') }],
    env: cleanEnv(),
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    includePartialMessages: true,
    includeHookEvents: true,
    forwardSubagentText: true,
    agentProgressSummaries: true,
    thinking: { type: 'adaptive', display: 'summarized' },
    maxTurns: 6,
    cwd,
    stderr: (d) => process.stderr.write(`[cli] ${d}`),
  };
}

export async function record(name, prompt, extra = {}) {
  const t0 = Date.now();
  const lines = [];
  const q = query({ prompt, options: { ...baseOptions(extra.cwd), ...(extra.options ?? {}) } });
  if (extra.onQuery) extra.onQuery(q);
  for await (const m of q) lines.push({ t: Date.now() - t0, m });
  writeFileSync(resolve(FIXTURES, `${name}.ndjson`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return lines.map((l) => l.m);
}

export function fail(errors) {
  if (errors.length) {
    console.error('FAIL\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('PASS');
}
```

- [ ] **Step 5: `.gitignore` ve commit**

```bash
printf 'spikes/m0/node_modules/\nspikes/m0/work/\n' >> .gitignore
git add .gitignore spikes/m0/package.json spikes/m0/package-lock.json spikes/m0/lib.mjs claude-plugin/
git commit -m "chore(m0): spike workspace and platform plugin skeleton"
```

---

### Task 3: Spike (a) — abonelik girişi, izolasyon ve temel fixture

**Files:**
- Create: `spikes/m0/a-auth-isolation.mjs`
- Create: `spikes/m0/redact.mjs`
- Create: `tests/fixtures/claude-streams/basic.ndjson` (script üretir)

**Interfaces:**
- Consumes: `lib.mjs` → `record`, `fail`
- Produces: `redact.mjs` → `redactFile(path: string): void`; `basic.ndjson` fixture'ı

- [ ] **Step 1: Maskeleyiciyi yaz**

`spikes/m0/redact.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const RULES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'user@example.com'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => (redactUuid.get(m) ?? setUuid(m))],
  [new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '/home/user'],
];
const redactUuid = new Map();
function setUuid(m) {
  const v = `00000000-0000-4000-8000-${String(redactUuid.size + 1).padStart(12, '0')}`;
  redactUuid.set(m, v);
  return v;
}

export function redactFile(path) {
  let s = readFileSync(path, 'utf8');
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  writeFileSync(path, s);
}

if (import.meta.main) for (const p of process.argv.slice(2)) redactFile(p);
```

- [ ] **Step 2: Spike script'ini yaz**

`spikes/m0/a-auth-isolation.mjs`:

```js
import { record, fail, FIXTURES } from './lib.mjs';
import { redactFile } from './redact.mjs';
import { resolve } from 'node:path';

const msgs = await record('basic', 'Reply with exactly: OK');
const init = msgs.find((m) => m.type === 'system' && m.subtype === 'init');
const result = msgs.find((m) => m.type === 'result');
const hookEvents = msgs.filter((m) => m.type === 'system' && String(m.subtype).startsWith('hook'));
const rate = msgs.filter((m) => m.type === 'rate_limit_event');

console.log(JSON.stringify({
  claude_code_version: init?.claude_code_version,
  apiKeySource: init?.apiKeySource,
  model: init?.model,
  skills: init?.skills,
  plugins: init?.plugins?.map((p) => p.name),
  mcp_servers: init?.mcp_servers,
  agents: init?.agents,
  hookEvents: hookEvents.map((h) => h.hook_name),
  rateLimitEvents: rate.map((r) => r.rate_limit_info),
  result: { subtype: result?.subtype, is_error: result?.is_error, usage: result?.usage, total_cost_usd: result?.total_cost_usd },
}, null, 2));

redactFile(resolve(FIXTURES, 'basic.ndjson'));

const errors = [];
if (!init) errors.push('no system/init message');
if (init?.apiKeySource !== 'none') errors.push(`apiKeySource is ${init?.apiKeySource}, expected none (subscription OAuth)`);
if (init?.claude_code_version !== '2.1.290') errors.push(`bundled CLI version ${init?.claude_code_version} != 2.1.290`);
if (hookEvents.length) errors.push(`user hooks leaked into session: ${hookEvents.map((h) => h.hook_name).join(', ')}`);
if (!init?.skills?.some((s) => s.includes('remotion-render'))) errors.push('plugin skills (symlinked) not loaded');
if (init?.mcp_servers?.length) errors.push(`unexpected MCP servers: ${JSON.stringify(init.mcp_servers)}`);
if (result?.is_error) errors.push(`result is_error: ${result.subtype}`);
fail(errors);
```

- [ ] **Step 3: Çalıştır**

Run: `node spikes/m0/a-auth-isolation.mjs`
Beklenen: JSON özet + `PASS`.
Olası sapmalar ve yapılacaklar:
- `apiKeySource` none değilse: **DUR**, raporla (abonelik yolu çalışmıyor demektir; spec §18 yedek planına geçilir).
- Skill'ler yüklenmediyse: symlink yerine `cp -r` ile gerçek kopya dene ve sonucu rapora yaz.
- Hook olayları varsa: `settingSources: []` yetmiyor demektir; hangi hook'un geldiğini rapora yaz.

- [ ] **Step 4: Fixture maskelemesini doğrula**

Run: `grep -cE 'alper|@gmail|4cf73c28' tests/fixtures/claude-streams/basic.ndjson`
Beklenen: `0`

- [ ] **Step 5: Commit**

```bash
git add spikes/m0/a-auth-isolation.mjs spikes/m0/redact.mjs tests/fixtures/claude-streams/basic.ndjson
git commit -m "test(m0): subscription auth + isolation spike, basic stream fixture"
```

---

### Task 4: Spike (a2) — alt ajan, yapılandırılmış çıktı, web araması, kodlama, yol koruması ve kesme fixture'ları

**Files:**
- Create: `spikes/m0/a2-fixtures.mjs`
- Create: `tests/fixtures/claude-streams/{subagent,websearch,coding,guard,interrupt}.ndjson`

**Interfaces:**
- Consumes: `lib.mjs` → `record`, `fail`, `WORK`; `redact.mjs` → `redactFile`
- Produces: M3'ün ThinkingState eşleyicisi ve FakeClaudeDriver için beş fixture

- [ ] **Step 1: Script'i yaz**

`spikes/m0/a2-fixtures.mjs`:

```js
import { record, fail, FIXTURES, WORK } from './lib.mjs';
import { redactFile } from './redact.mjs';
import { resolve, relative, isAbsolute } from 'node:path';
import { existsSync, rmSync, mkdirSync } from 'node:fs';

const errors = [];
const types = (msgs) => msgs.map((m) => `${m.type}${m.subtype ? '/' + m.subtype : ''}`);

// 1) Custom role agent + structured output
const storyboardSchema = {
  type: 'object',
  properties: { product: { type: 'string' }, scenes: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, seconds: { type: 'number' }, onscreen_text: { type: 'string' } }, required: ['n', 'seconds', 'onscreen_text'] } } },
  required: ['product', 'scenes'],
};
const sub = await record('subagent',
  "Delegate to the storyboarder agent: a 2-scene storyboard for 'tükenmez kalem' (parts: gövde, yay, mürekkep haznesi, bilye uç). Return its result in the required structure.",
  { options: {
    agents: { storyboarder: { description: "Writes scene-by-scene storyboards for 'what's inside' videos", prompt: 'You are a storyboard designer. Reply only with the storyboard.', tools: ['Read'], model: 'haiku' } },
    outputFormat: { type: 'json_schema', schema: storyboardSchema },
  } });
const started = sub.find((m) => m.type === 'system' && m.subtype === 'task_started');
const subResult = sub.find((m) => m.type === 'result');
if (started?.subagent_type !== 'storyboarder') errors.push('subagent: no task_started with subagent_type=storyboarder');
if (!sub.some((m) => m.parent_tool_use_id)) errors.push('subagent: no message carries parent_tool_use_id');
if (!subResult?.structured_output?.scenes?.length) errors.push('subagent: result.structured_output missing');

// 2) One WebSearch
const web = await record('websearch', "Search the web once for 'ballpoint pen parts diagram' and list the domains of the first 3 results.",
  { options: { allowedTools: ['WebSearch'] } });
const wsUse = web.flatMap((m) => (m.type === 'assistant' ? m.message.content : [])).find((b) => b.type === 'tool_use' && b.name === 'WebSearch');
if (!wsUse?.input?.query) errors.push('websearch: no WebSearch tool_use with input.query');
const wsResult = web.find((m) => m.type === 'user' && m.tool_use_result);
console.log('websearch tool_use_result keys:', wsResult ? Object.keys(wsResult.tool_use_result) : null);

// 3) Write + Edit inside cwd (structuredPatch for +/- counts)
const codeDir = resolve(WORK, 'coding');
rmSync(codeDir, { recursive: true, force: true }); mkdirSync(codeDir, { recursive: true });
const code = await record('coding', 'Create notes.txt with three lines: alpha, beta, gamma. Then edit it so the second line says yay.',
  { cwd: codeDir, options: { allowedTools: ['Read', 'Write', 'Edit'] } });
const patch = code.find((m) => m.type === 'user' && m.tool_use_result?.structuredPatch);
if (!patch) errors.push('coding: no tool_use_result.structuredPatch on Edit');

// 4) PreToolUse path guard under dontAsk: escape attempt must be denied
const guardDir = resolve(WORK, 'guard');
rmSync(guardDir, { recursive: true, force: true }); mkdirSync(guardDir, { recursive: true });
const outside = resolve(WORK, 'OUTSIDE.txt');
rmSync(outside, { force: true });
const denied = [];
const pathGuard = async (input) => {
  const p = input.tool_input?.file_path;
  if (typeof p === 'string') {
    const rel = relative(guardDir, resolve(guardDir, p));
    if (rel.startsWith('..') || isAbsolute(rel)) {
      denied.push(p);
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Writes are confined to the run directory ${guardDir}.` } };
    }
  }
  return {};
};
await record('guard', `Write the word hi into the file ${outside}. If that is refused, write it into ./inside.txt instead.`,
  { cwd: guardDir, options: { allowedTools: ['Write'], hooks: { PreToolUse: [{ matcher: 'Write|Edit', hooks: [pathGuard] }] } } });
if (existsSync(outside)) errors.push('guard: file outside run dir was written');
if (!denied.length) errors.push('guard: PreToolUse hook never denied the escape attempt');
if (!existsSync(resolve(guardDir, 'inside.txt'))) errors.push('guard: agent did not fall back to the allowed path');

// 5) interrupt() mid-turn
let q;
const intr = await record('interrupt', 'Count slowly from 1 to 200, one number per line, explaining each number.', {
  onQuery: (qq) => { q = qq; setTimeout(() => q.interrupt().catch(() => {}), 4000); },
});
const intrResult = intr.find((m) => m.type === 'result');
console.log('interrupt result:', intrResult?.subtype, intrResult?.terminal_reason);

for (const n of ['subagent', 'websearch', 'coding', 'guard', 'interrupt']) redactFile(resolve(FIXTURES, `${n}.ndjson`));
console.log({ subagentTypes: types(sub).filter((t) => t.startsWith('system/')), denied });
fail(errors);
```

- [ ] **Step 2: Çalıştır**

Run: `node spikes/m0/a2-fixtures.mjs`
Beklenen: `PASS`. Her başarısızlık mesajı spec'teki bir varsayımı çürütür. Her birini aynen `docs/m0/report.md` taslağına not et. Özellikle `guard` başarısızsa spec §6.1 ve §15 güncellenmeden M3'e geçilmez.

- [ ] **Step 3: Maskelemeyi doğrula**

Run: `grep -lE 'alper|@gmail' tests/fixtures/claude-streams/*.ndjson | wc -l`
Beklenen: `0`

- [ ] **Step 4: Commit**

```bash
git add spikes/m0/a2-fixtures.mjs tests/fixtures/claude-streams/
git commit -m "test(m0): subagent, websearch, coding, guard and interrupt stream fixtures"
```

---

### Task 5: Spike (b) — sıfır token kullanım okuma

**Files:**
- Create: `spikes/m0/b-usage.mjs`
- Create: `tests/fixtures/claude-streams/usage-response.json`

**Interfaces:**
- Consumes: `lib.mjs` → `baseOptions`, `fail`, `FIXTURES`
- Produces: `usage-response.json`; M2'nin `UsageSource` adaptörünün şekli

- [ ] **Step 1: Script'i yaz**

`spikes/m0/b-usage.mjs`:

```js
import { query } from '@anthropic-ai/claude-agent-sdk';
import { baseOptions, fail, FIXTURES } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let release;
const gate = new Promise((r) => (release = r));
async function* noMessages() { await gate; }

const q = query({ prompt: noMessages(), options: baseOptions() });
const seen = [];
const drain = (async () => { for await (const m of q) seen.push(m); })();

const t0 = Date.now();
const usage = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
const account = await q.accountInfo();
const ms = Date.now() - t0;
release();
await drain;

writeFileSync(resolve(FIXTURES, 'usage-response.json'), JSON.stringify({ usage, ms }, null, 2));
console.log(JSON.stringify({ ms, subscription_type: usage.subscription_type, rate_limits_available: usage.rate_limits_available, rate_limits: usage.rate_limits, accountKeys: Object.keys(account ?? {}) }, null, 2));

const errors = [];
if (!usage.rate_limits_available) errors.push('rate_limits_available is false');
if (seen.some((m) => m.type === 'assistant' || m.type === 'result')) errors.push('a model turn happened — not zero-token');
fail(errors);
```

- [ ] **Step 2: Çalıştır ve maskele**

Run: `node spikes/m0/b-usage.mjs && node spikes/m0/redact.mjs tests/fixtures/claude-streams/usage-response.json`
Beklenen: `rate_limits` içinde 5 saatlik ve 7 günlük pencere oranları ve sıfırlanma zamanları + `PASS`. Çalışmazsa M2'nin kullanım footer'ı yalnızca `rate_limit_event`'ten beslenir (spec §18 yedek planı). Bunu rapora yaz.

- [ ] **Step 3: Commit**

```bash
git add spikes/m0/b-usage.mjs tests/fixtures/claude-streams/usage-response.json
git commit -m "test(m0): zero-token usage read spike"
```

---

### Task 6: Spike (c) — TTY olmadan giriş akışı (izole config)

**Files:**
- Create: `spikes/m0/c-auth-login.mjs`

**Interfaces:**
- Consumes: gömülü binary yolu (Task 2 Step 2)
- Produces: M2 Claude bağlantı ekranının giriş akışı kararı (rapor)

- [ ] **Step 1: Script'i yaz**

`spikes/m0/c-auth-login.mjs`:

```js
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

const pkg = resolve(import.meta.dirname, 'node_modules/@anthropic-ai/claude-agent-sdk-linux-x64');
const bin = readdirSync(pkg, { recursive: true }).map((f) => join(pkg, f)).find((f) => statSync(f).isFile() && (statSync(f).mode & 0o100));

const isolated = mkdtempSync(join(tmpdir(), 'vg-auth-'));
if (isolated.startsWith(join(homedir(), '.claude'))) throw new Error('refusing: config dir must be isolated');
const env = { ...process.env, CLAUDE_CONFIG_DIR: isolated };
delete env.CLAUDECODE;

console.log('status (isolated):', execFileSync(bin, ['auth', 'status'], { env, encoding: 'utf8' }).trim());

const child = spawn(bin, ['auth', 'login', '--claudeai'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));
await new Promise((r) => setTimeout(r, 15000));
child.kill('SIGTERM');

const url = out.match(/https:\/\/\S+/)?.[0];
console.log(JSON.stringify({ printedUrl: Boolean(url), urlHost: url ? new URL(url).host : null, asksForCode: /code|paste|kod/i.test(out), exitedEarly: child.exitCode !== null, rawHead: out.slice(0, 600) }, null, 2));

console.log('REAL login still intact:', execFileSync('claude', ['auth', 'status'], { encoding: 'utf8', env: { ...process.env, CLAUDECODE: '' } }).includes('"loggedIn": true'));
```

- [ ] **Step 2: Çalıştır**

Run: `node spikes/m0/c-auth-login.mjs`
Beklenen:
- İzole status `loggedIn: false` gösterir.
- `printedUrl` true olur; `asksForCode` ile kod yapıştırma mı yoksa localhost callback mi beklendiği öğrenilir.
- Son satır `REAL login still intact: true` olur.

Sonuca göre M2 kararı:
- (i) URL yazdırıyor ve stdin'den kod alıyorsa → ekranda link + kod giriş kutusu.
- (ii) TTY istiyorsa → ekranda talimat: terminalde `! claude auth login`; ekran durumu 5 sn'de bir yoklar.

Kararı rapora yaz.

- [ ] **Step 3: Commit**

```bash
git add spikes/m0/c-auth-login.mjs
git commit -m "test(m0): non-TTY login flow spike with isolated config dir"
```

---

### Task 7: Spike (d) — Blender GLB → Three.js anchor eşdeğerliği

**Files:**
- Create: `spikes/m0/d-scene.py`
- Create: `spikes/m0/d-equivalence.mjs`

**Interfaces:**
- Produces: spec §7.3 eşdeğerlik testinin referans uygulaması: dikey 1080×1920, 85 mm lens, 5 kare, eşik 8 px

- [ ] **Step 1: Blender sahnesi**

`spikes/m0/d-scene.py`:

```python
import bpy, json, sys
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view

out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.fps = 1080, 1920, 30
sc.frame_start, sc.frame_end = 0, 60

bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=12, location=(0, 0, 0))
bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 7))
anchors = {}
for name, loc in {"tip": (0, 0, -6), "cap": (0, 0, 7.75), "side": (0.5, 0, 2)}.items():
    e = bpy.data.objects.new(f"anchor_{name}", None)
    e.location = loc
    sc.collection.objects.link(e)
    anchors[name] = e

target = bpy.data.objects.new("target", None)
sc.collection.objects.link(target)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens, cam_data.sensor_width, cam_data.sensor_fit = 85, 36, "AUTO"
cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
c = cam.constraints.new("TRACK_TO")
c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
for f, loc in [(0, (40, -40, 10)), (30, (0, -60, 20)), (60, (-40, -40, 5))]:
    cam.location = loc
    cam.keyframe_insert("location", frame=f)

frames = [0, 15, 30, 45, 60]
data = {"width": 1080, "height": 1920, "frames": {}}
for f in frames:
    sc.frame_set(f)
    row = {}
    for name, e in anchors.items():
        v = world_to_camera_view(sc, cam, e.matrix_world.translation)
        row[name] = [v.x * 1080, (1 - v.y) * 1920]
    data["frames"][str(f)] = row
(out / "anchors.json").write_text(json.dumps(data, indent=1))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.nla.bake(frame_start=0, frame_end=60, only_selected=True, visual_keying=True, clear_constraints=True, bake_types={"OBJECT"})
bpy.ops.export_scene.gltf(filepath=str(out / "scene.glb"), export_format="GLB", export_cameras=True, export_animations=True, export_extras=True)
print("WROTE", out)
```

- [ ] **Step 2: Three.js tarafı**

`spikes/m0/d-equivalence.mjs`:

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const dir = resolve(process.argv[2]);
const ref = JSON.parse(readFileSync(resolve(dir, 'anchors.json'), 'utf8'));
const buf = readFileSync(resolve(dir, 'scene.glb'));
const gltf = await new Promise((ok, ko) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, ko));

const scene = gltf.scene;
const camera = gltf.cameras[0];
camera.aspect = ref.width / ref.height;
camera.updateProjectionMatrix();
const mixer = new THREE.AnimationMixer(scene);
for (const clip of gltf.animations) mixer.clipAction(clip).play();

let worst = 0;
for (const [frame, row] of Object.entries(ref.frames)) {
  mixer.setTime(Number(frame) / 30);
  scene.updateMatrixWorld(true);
  for (const [name, [bx, by]] of Object.entries(row)) {
    const node = scene.getObjectByName(`anchor_${name}`);
    const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).project(camera);
    const tx = (p.x + 1) / 2 * ref.width;
    const ty = (1 - p.y) / 2 * ref.height;
    const d = Math.hypot(tx - bx, ty - by);
    worst = Math.max(worst, d);
    console.log(`frame ${frame} ${name}: blender(${bx.toFixed(1)}, ${by.toFixed(1)}) three(${tx.toFixed(1)}, ${ty.toFixed(1)}) Δ=${d.toFixed(2)}px`);
  }
}
console.log(`worst Δ = ${worst.toFixed(2)} px (threshold 8)`);
process.exit(worst <= 8 ? 0 : 1);
```

- [ ] **Step 3: Çalıştır**

```bash
OUT=spikes/m0/work/glb
blender-gpu -b --factory-startup -P spikes/m0/d-scene.py -- "$OUT" 2>&1 | tail -3
node spikes/m0/d-equivalence.mjs "$OUT"
```

Beklenen: her satırda Δ < 1 px, `worst Δ ≤ 8`, çıkış kodu 0.

Sapma > 8 px ise sırayla şunları dene ve hangisinin düzelttiğini rapora yaz:
1. glTF'nin `yfov` değeri, Blender'ın portre sensör uyumundan farklı mı? `camera.fov` değerini `2*atan(18/85)` derece ile karşılaştır.
2. Animasyon zaman kayması: `gltf.animations[0].tracks[0].times[0]` 0 mı?

- [ ] **Step 4: Commit**

```bash
git add spikes/m0/d-scene.py spikes/m0/d-equivalence.mjs
git commit -m "test(m0): Blender GLB to three.js anchor equivalence spike"
```

---

### Task 8: M0 raporu ve spec güncellemesi

**Files:**
- Create: `docs/m0/report.md`
- Modify: `docs/superpowers/specs/2026-10-06-videogen-design.md` (§18 tablosu; çürütülen varsayımlara göre §6.1, §7.3 ve §13.1)

- [ ] **Step 1: Raporu yaz**

`docs/m0/report.md` şu bölümleri içerir: her spike için **Varsayım · Sonuç (geçti / kaldı / kısmen) · Kanıt** (komut çıktısından alıntı) · **Spec'e etkisi**. Ayrıca şunlar:
- disk öncesi/sonrası (Task 1)
- gömülü binary yolu ve sürümü
- `basic` oturumunun token kullanımı (taban maliyet)
- giriş akışı kararı (i) veya (ii)
- M2 için footer veri kaynağı kararı

- [ ] **Step 2: Spec §18'i güncelle**

Doğrulanan her satırın "Doğrulama" sütununa `M0: doğrulandı (docs/m0/report.md)` yaz. Çürütülen her varsayım için ilgili bölümü yedek plana göre düzelt ve satırı `M0: çürütüldü → <yeni karar>` yap.

- [ ] **Step 3: Commit ve kullanıcıya rapor**

```bash
git add docs/m0/report.md docs/superpowers/specs/2026-10-06-videogen-design.md
git commit -m "docs(m0): verification report; spec assumptions updated"
```

Kullanıcıya Türkçe özet ver: **Maddeler / Doğrulama / Bilmen gerekenler**.
