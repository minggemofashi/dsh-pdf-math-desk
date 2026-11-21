# Math workbench (dsh-pdf-math-desk)

A full-page DSH workbench organized by **book → chapter**. Open it from the
workbench icon in the left sidebar; the main column switches to the shelf.

## Installing this plugin

This folder is a DSH bundle (`dsh.bundle.patch` → `cordis.patch.yml`). On another
machine: unzip it anywhere, then **Plugins → Add plugin** and pick the folder (or
`plugin_manager` `install_bundle` with its absolute path), and restart DSH. A
prebuilt zip and the exact steps are in [`安装与分发.md`](./安装与分发.md).

## Network and privacy

- The plugin itself runs locally. It reads the library directory and writes only
  `~/.dsh/mathdesk/` (state, libraries, links, pending intents) plus `产物/` and
  `封面/` inside a library; PDFs and previews never leave the machine.
- The **only** outbound request is the explicit **Check for updates** button:
  it calls `https://api.github.com/repos/minggemofashi/dsh-pdf-math-desk/releases/latest`
  when clicked and shows the result. There is no automatic polling, no analytics,
  no telemetry, and no upload of library paths or session content.
- Conversation content is handled by DSH and the configured model, exactly as in
  any other DSH session; the plugin adds nothing to that path.
- If the machine cannot reach GitHub, the button reports a network failure and
  everything else keeps working, because no other feature uses the network.

## What it does

- **Libraries** (0.11.0): the workbench now keeps a list of libraries in
  `$DSH_HOME/mathdesk/libraries.json` (the profile's `libraryDir` is the first
  entry, so an existing install is unchanged). The **书库** page (breadcrumb, or
  the first screen when the active library has no books) lists them, adds a root
  directory (`分片/` is expected), **single-click** switches the active one,
  **double-click** opens that library's shelf, and removes entries without touching
  files. Double-clicking the page title or the **书架** crumb opens the 书库 page as
  well. Only the math layout is supported; the page says so.
- **Split toolkit** (0.11.0): the 书库 page offers **拆分工具：开一个会话** — it copies
  the bundled toolkit (`tools/`: `pdfkit.py`, `auto_chapters.py`,
  `rename_chapters.py`, `dsfile.mjs`, the 规范 rules, a README) into the active
  library's `工具/`, then opens a new conversation whose composer already holds the
  split instructions (lookup → split → verify, naming rules). The zip download
  option was removed on request; the installer is the only path.
- **Shelf**: one card per recognized book (title, author when derivable, chapter
  count) with a **cover**: a user image in `<libraryDir>/封面/<book id>.png`
  (`.jpg` / `.jpeg` / `.webp` also work) wins; otherwise the first page of the
  book's first split PDF is rendered to a small JPEG with pdf.js, one book at a
  time and cached for the session; if neither exists the card keeps its lettered
  placeholder. Covers render only after the user image is found missing, so a
  hand-made cover costs no PDF download.
- **Whole-book fallback** (0.13.0/0.13.1): a library may also carry unsplit books as
  `<libraryDir>\整本\<book id>.pdf`, or directly in the library root. The shelf shows a
  “Whole-book PDF” card; its book page has one **Open PDF** action, and the reader
  hides the chapter New buttons (single/continuous, zoom, jump still work). There are
  no chapters and no per-chapter sessions — this is the path for someone who cannot
  run the splitter; the split layout remains the full-featured one. A library with no
  `分片\` at all is valid as long as it has whole PDFs.
- **Book page**: the book's chapters in `cNN` order, with page range and a badge
  for front matter / appendix / bibliography. Click a chapter row to expand it in
  place; double-click it to open the chapter PDF in the reader.
- **Produced files under a chapter** (M2): the expanded chapter lists the files it
  owns — name, size, modified time — from `<artifactDir>/<book id>/<cNN>/`; a
  collapsed chapter's row still says how many files it holds (one scan per book,
  `GET /mathdesk/artifact-counts`).
- **PDF reader** (M3): double-clicking a chapter row, the chapter's **Open PDF**
  button, or a PDF produced file opens the page's own reader — two reading modes
  (**单页** / **连续**), previous/next, a page box (type a number, Enter), zoom out /
  fit width / zoom in, and ↑↓ scroll the page, ←→ and PageUp/PageDown turn pages,
  +/− zoom, Escape exits, Home returns to the first page. The reader's toolbar
  starts with **⌂ 书架** (back to the shelf) and **‹ 返回章节** (back to the chapter),
  so a PDF can be left for either the book list or the chapter. The column of
  continuous mode renders lazily: pages near the viewport are painted, far ones
  release their canvas. It is drawn by pdf.js
  vendored inside this package (`vendor/pdf.min.mjs` +
  `vendor/pdf.worker.min.mjs`, served by the Host under `/mathdesk/vendor/`), so
  nothing is imported from the Harness Client packages.
- **Chapter outline** (M3.7 / 0.9.0): the sessions block has an **整理提纲**
  button. It sends the chapter's conversation ids to the Host, which folds their
  transcripts (bounded to 120k characters), asks the **default model** for a fixed
  Markdown outline (范围 / 已解决 / 未解决 / 下一步), saves it as
  `产物/<book id>/<cNN>/提纲-all.md`, and shows it with a copy button; it then
  appears in the chapter's produced files after the automatic reload. One model
  call per digest; failures show the model's message. When a **continuation** is
  created (`（续 N）`) and that outline exists, it is placed into the new
  conversation's **composer** (via the same draft API the host uses for new
  sessions), so it is visible, editable, and sent by you — no hidden context. A
  short notice says it happened.
- **Every new conversation knows its PDF** (0.9.x): a session created from the
  workbench starts its composer with a context line the model cannot miss —
  `〔数学工作台〕本章：概率论 · c04 第四章 … · PDF：…pdf · 阅读位置：第 12 页（单页）`.
  A continuation adds the chapter outline below it. The line is plain text in the
  composer — visible, editable, never hidden context — so referring to another
  textbook is just editing that line or the message. (A “mention other chapters”
  picker was built and then removed on request: it made the toolbar bulky.)
- **Start a session while reading**: the reader's toolbar carries the chapter's
  three **＋ 提取 / 答疑 / 习题** buttons. Clicking one creates the session and leaves
  for it immediately, and the chapter PDF is opened in that conversation's right
  column (hideable; the column's own expand button makes it full screen).
  Returning to the workbench reopens the reader on the same page and mode, because
  the reading position is stored with the workbench position.
- **File preview** (M2): clicking a text-like produced file (`.md`, `.txt`, `.tex`,
  code, `.json`, `.csv`, …) opens the page's own preview on the right: text with
  line numbers, up to 512 KiB / 4000 lines, with truncation and encoding stated
  above the text. Escape, ×, or the backdrop closes it and puts focus back on the
  row. A PDF produced file opens the reader instead; other binaries open the same
  drawer with a note. **Reload** in the section header re-reads the chapter; the
  empty state prints the exact directory and a copy button, because files are not
  noticed automatically — and the Host never creates the folder: create
  `<artifactDir>/<book id>/<cNN>/` yourself (or let an agent write there) before
  the first Reload.
- **Sessions under a chapter** (M1): the expanded chapter shows three groups —
  提取 / 答疑 / 习题 — each with its own **＋ New** button. Sessions are read live
  from their titles; a new session is created in the Workspace that owns the
  library directory (the footer shows where) and appears in its group as
  **unsent**; clicking it opens the host conversation.
- **New continues instead of multiplying** (M3.6 / 0.8.0): a group's New reopens
  that chapter's existing conversation when it has room, so clicking it repeatedly
  no longer leaves a session behind every time. Once the conversation's context
  reaches `resumeRatio` (default 85%) of its window, New starts a numbered
  continuation instead — `[概率论 c04] 答疑（续 2）` — which still classifies into
  the same chapter. A small **另起** button next to New (and a toggle of the same
  name in the reader) skips continuing on purpose and numbers the new session after
  the existing chain. The title prefix is the conversation's **native chapter**;
  links added from another chapter never change it, so an imported conversation
  always shows where it came from. Context pressure is read live from `tokenMeter`
  and, for sessions that are no longer running, from the snapshot the Host records
  at the end of every turn (`$DSH_HOME/mathdesk/pressure.json`); a session never
  observed by this Host is treated as having room.
- **Import, rename, and share a conversation** (M2.5): each group also has an
  **Import** button that attaches an *existing* conversation to this chapter
  (`↪` marks it) without touching its title; **✎** on any row renames it inline
  (Enter saves, Escape cancels); **×** on an imported row detaches only that
  chapter. A conversation can sit under several chapters at once — its title
  still names its primary chapter, and the extra placements live in
  `$DSH_HOME/mathdesk/links.json` on the Host. Renaming a row to a title that no
  longer matches `[<book> cNN] <mode>` moves it out of its titled chapter (its
  imported placements stay).
- **Naming happens on the first message.** A workbench session stays an ordinary
  untitled blank until its first turn starts, then the Host renames it to
  `[<book> cNN] <mode>` and pins the title. A blank therefore cannot lend its
  name to another "New Session" (the workspace blank-reuse would otherwise show
  a stale workbench title).
- **Unused blanks are not kept.** The Host keeps their intent in
  `$DSH_HOME/mathdesk/pending.json`; the next workbench visit (and every New)
  archives sessions that are still blank and forgets them. Clicking New reuses
  the workspace's existing untitled blank instead of adding another one.
- **Empty leftovers are removed.** DSH has no "delete session" API — archive is
  its removal. For sessions the workbench itself left empty (archived, not live,
  in the library directory, never started a turn) the Host also deletes the
  header-only log file, so they stop appearing in the archived list; sessions
  that ever ran a turn are only archived, never deleted.
- **No jump when a selected blank is cleaned.** Archiving the session that is
  currently selected normally sends the main column back to the Conversation;
  the workbench re-selects its own panel in the same step, so returning to the
  workbench stays on the workbench.
- **Clean unused** in the header does the same cleanup on demand for leftovers
  that predate this version.
- **Navigation**: breadcrumb (`书库 / <book>`) and a Back button; no URL changes
  are involved, so the position — including the chapter you were working in — is
  kept on the Host instead.
- **Position persistence**: the open book, the active chapter and each book's
  expanded chapters are stored in `$DSH_HOME/mathdesk/state.json`, so switching
  to a conversation and back — or reloading the page — returns to the same place
  once the workbench is reopened.

## Session title convention

The title is the binding, not an index file:

```
[概率论 c04] 答疑
[Algebra_Lang c03] 提取
[高等代数学 c01] 习题
```

The book part is matched against the catalog book id (the file-name short name
for derived books) or an unambiguous display title, the code against the chapter
code, and the mode against 提取 / 答疑 / 习题 (English aliases and a suffix such as
`答疑（续）` are tolerated). The footer lists the id → title legend for derived
books, because the title prefix is the id (e.g. `卓里奇数分一`). A bracket-shaped
title that names no book/chapter, no known mode, or no mode at all is counted in
the footer rather than silently dropped; renaming a workbench session by hand
therefore moves or detaches it on the next render — that is the intended
workflow.

## Extra placements (`links.json`)

The title names a session's **primary** chapter. On top of that, a session may be
attached to any number of chapters from the Workbench's Import button; those
placements live on the Host in `$DSH_HOME/mathdesk/links.json`
(`{ sessionId: [{bookId, code, mode}] }`). A chapter lists the union of its
titled sessions and its linked ones, once each, so one conversation can appear
under two chapters (and the footer/section counts count it in both). Detaching
only removes the link; a session that has ever run a turn is never deleted. Links
whose session is gone are pruned when the workbench cleans up empty records.

## Where the catalog comes from

1. `<libraryDir>/索引.json` when it exists (the schema in
   `数学工作台插件-路线图.md` §5.1);
2. otherwise the chapter-split PDF file names under `<libraryDir>/分片/*/`,
   matching `<short>_cNN_<title>_p<from>-<to>.pdf`. Book titles and authors are
   derived from the directory names, with scanning-vendor parentheticals removed.

Unrecognized directories (PDFs not split by chapter) are skipped and listed in
the page footer.

## Where produced files come from

One directory per chapter: `<artifactDir>/<book id>/<cNN>/`, where `<book id>` is
the id the footer prints (`概率论`, `Algebra_Lang`, …) and `<cNN>` is the chapter
code. Files are listed sorted by name, dirs, dotfiles and Office lock files
(`~$…`) are ignored, and the listing caps at 300 rows (the page says when it was
cut). The empty state prints the directory to drop files into, and the footer
prints the root.

Previews are read by the Host and decoded as UTF-8, falling back to GB18030 when
the bytes are not valid UTF-8; NUL bytes mean "binary, not previewable", and a
cut inside a multi-byte character is trimmed before the encoding is chosen. The
route resolves `book` + `code` against the catalog first, then joins a plain file
name under that chapter's own directory, so a crafted name cannot read outside
it.

Why the preview is drawn by this plugin rather than the host's right sidebar:
the right sidebar is a **session-bound** column. Its service acts on the session
that is on screen (`layout.panelInfo.activePanelId === null`), and it is not
drawn while a global panel such as this one owns the main column — calling
`ctx.sidebarRight.openResource` from the workbench throws
`sidebarRight: no session surface is mounted`. See
`数学工作台插件-路线图.md` §4 constraint 18.

## Configuration

The bundle patch inserts one row:

```yaml
- id: mathdesk
  name: dsh-pdf-math-desk
  config:
    libraryDir: 'D:\数学书库'
```

Optional `config` fields: `libraryDir`, `fragmentDir` (default
`<libraryDir>/分片`), `artifactDir` (default `<libraryDir>/产物`), `coverDir`
(default `<libraryDir>/封面`), `indexPath` (default `<libraryDir>/索引.json`),
`dataDir` (default `$DSH_HOME/mathdesk`), `vendorDir` (default: this package's
`vendor/`), `toolsDir` (default: this package's `tools/`), `resumeRatio` (default
`0.85`: how full a conversation may get before New starts a continuation). The
plugin declares no `Config` schema, so the row accepts a free-form mapping; edit it
in the profile's `cordis.patch.yml`. The `libraryDir` here only seeds the first
library; after that the `libraries.json` list is authoritative.

## Limits of this version

- The reader shows one page or a continuous column of lazily painted pages; the
  continuous mode cannot select or search text yet, and it does not remember the
  scroll offset across a reload (the page number is remembered instead). Very
  large pages drop to device pixel ratio 1 so the canvas stays paintable. CMaps
  are not bundled: a PDF whose CJK fonts are not embedded may show garbled text —
  add `pdfjs-dist/cmaps` to `vendor/` and pass `cMapUrl` when that happens. The
  "PDF on the session's right" shortcut needs the chapter PDF to live inside the
  library directory (it is sent as a workspace-relative path); with a custom
  `fragmentDir` outside the library, the reader still works but that shortcut is
  skipped.
- Text previews show the file as plain text, without markdown rendering, search or
  line wrapping (long lines scroll horizontally with the line numbers pinned).
- Only sessions the workbench itself created (or that were renamed into the
  convention) are classified automatically; older ones are attached from the
  chapter's Import button (M2.5).
- Archived sessions that ever ran a turn are not deleted (DSH exposes no delete
  API); only the empty, never-started records are purged, and only those
  belonging to the library directory.
- The Host reads the library with its own filesystem access; the browser never
  receives file paths beyond chapter file names, one chapter's produced-file
  names, and the text of a file it is previewing.
- The `/mathdesk/*` routes accept loopback peers only, so the workbench is a
  local-Desktop surface: opening the same GUI from another machine shows a read
  error rather than the shelf.
- The vendored pdf.js (6.3.289) is Apache-2.0; its license is in
  `vendor/pdfjs-LICENSE.txt`.
- A render bug inside the page shows an error panel with the exception message
  (and logs the component stack) instead of a blank panel; Retry re-renders the
  page. Keep `useCallback` dependency arrays free of forward references —
  `.dsh-scratch/check-deps.mjs` statically checks that for this page.
- "New continues" trusts the recorded context pressure. A conversation this Host
  has never seen end a turn has no snapshot and is treated as having room; if it
  is in fact full, raising `resumeRatio` downward or renaming it by hand are the
  available escapes. Continuation numbers come from parsing `（续 N）`, so
  hand-editing a title out of that shape restarts the chain at the first number.
