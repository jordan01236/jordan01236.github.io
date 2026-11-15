# Plan: a working "Kali-style" computer on the terminal page

Status: **planned, stage 1 started** (see "Progress" at the bottom; update it as you go).
Repo: `jordan01236/jordan01236.github.io` (GitHub Pages, Jekyll on, custom domain hackwithjordan.com)
Working branch: `claude/admiring-brahmagupta-ep59ts`. Push to `main` only when the user says so.

This file lives in `_plans/`, which Jekyll does not publish. Keep it there.

---

## 1. Goal

When a visitor sits down at the monitor in the 3D room (`terminal.html`), they can do more than type
into the fake shell: they can start a desktop that looks and behaves like a small Kali Linux box,
with windows, apps and some security tools, and (in a later stage) a real Linux VM with a target
they can actually hack. Everything runs in the browser tab with no network access out.

### Decision taken (user can still redirect)

The user asked "how difficult would it be" and was offered three options. The recommendation, which
this plan follows, is a **hybrid built in stages**:

1. **Stage 1 – simulated desktop.** HTML/JS desktop: panel, window manager, file manager, terminal,
   browser for the writeups, text editor, and scripted look-alike tools. Loads instantly.
2. **Stage 2 – one real VM window.** "Real terminal" app that boots a small i386 Linux in v86
   (x86 emulator in WebAssembly), downloaded only when opened.
3. **Stage 3 – a target inside the VM.** A deliberately vulnerable local service so visitors can
   run real nmap against localhost, get a foothold and escalate: a mini HTB box on the site.

Stage 1 must be shippable on its own. Stages 2 and 3 are additive.

### Non-goals / hard limits

- No real Kali XFCE GUI apps (Burp, Wireshark, Metasploit, Firefox) running for real. Too heavy to
  emulate; mock them or leave them out.
- No outbound network from anything. No relays, no proxies.
- No official Kali logo/dragon artwork or wallpapers (trademarked). "Kali-style": dark theme,
  similar layout, own artwork. Hostname can stay `kali` (already used by the existing shell).
- Must not break the existing page: room, original commands (`whoami`, `help`, `clear`, `blog`,
  `about`, `sudo su`, `cat credit_card_details`), the no-WebGL fallback, mobile.

---

## 2. What exists today (read these first)

| File | What it does |
|---|---|
| `terminal.html` | Page shell. `#room` holds `#room-canvas` (WebGL) and `#screen` (the DOM monitor content: `.terminal-bar` + `#terminal-container`). CSS for room mode is under `body.has-room`. Flat fallback when no WebGL (`body.flat`). Scripts are loaded with `?v=N` cache-busting; **bump N** when JS changes. |
| `assets/js/terminal.js` | The fake shell. IIFE, exposes `window.JTerm` = `{ autoFocus, on(event, fn), print, run, focus, blur, isRoot }`. Emits events: `sit`, `stand`, `lamp`, `rgb`, `root`, `output`, `glitch`, `reboot`. Commands are registered with `def("name alias", "help text", fn)`; returning `"async"` means the command will call `createPrompt()` itself. Has an in-memory filesystem (`fs`, `lookup(path)`, `normalize`) with `/home/jordan`, `/root` (root only), `/etc`, and `writeups/` filled from `posts.json`. Links open in a new tab via `go(url, label)`. |
| `assets/js/room.js` | WebGL compositor for the Blender light passes, camera zoom ("sit down"), hotspots, toasts. Positions `#screen` over the monitor every frame with a CSS `transform` (translate + scale). `resize()` sets `#screen` width/height in CSS px (the seated on-screen size, roughly 800–1300 px wide on desktop, ~360 px on phones) and its `font-size`. Listens to JTerm events. `VERSION` constant for texture cache-busting. |
| `assets/room/*` | Rendered textures (`wide_*` 3840×2160, `close_*` 2400×1350), `room.json` (screen corners, hotspots, ranges), `poster.jpg` (home page teaser). |
| `tools/room/*.py` | Blender scene (`build_room.py`), textures (`make_textures.py`), EXR→WebP (`encode_passes.py`), single-file preview bundler (`build_preview.py`). Not needed for this plan unless the monitor itself changes. |
| `index.html` | Home page; has a "Sit down at my desk" teaser linking to `terminal.html`. |

Important behaviours to preserve:
- `#screen` gets `pointer-events: auto` only when seated (`body.seated`). While standing, clicking it sits you down.
- Esc stands up. `room.js` also turns any keypress while standing into "sit down" (skips when focus is on a link/button). The desktop must not fight this: when seated and the desktop is open, Esc should first close menus/exit fullscreen, and only stand up if nothing else consumed it (see 4.6).
- `#screen` is scaled with a transform; **mouse coordinates inside it are in scaled space**. Drag
  maths must divide `clientX/Y` deltas by the current scale (read it from `getBoundingClientRect().width / offsetWidth`).
- The page is served statically from GitHub Pages: no server code, no custom headers (so no COOP/COEP,
  so no `SharedArrayBuffer`), 100 MB max per file in git, ~1 GB soft limit for the site.

---

## 3. Architecture

```
terminal.js  ── window.JTerm (shell, fs, events) ──┐
                                                    ├── desktop.js  (window manager + apps)
room.js      ── positions #screen, sit/stand ───────┘        │
                                                             ├── apps/files, apps/browser, apps/editor ...
                                                             └── apps/vm.js  (stage 2, lazy-loads v86)
```

- New file `assets/js/desktop.js` (stage 1). Plain JS IIFE like the others, no build step, no
  framework. Load after `terminal.js`, before `room.js` (or after; it only needs `JTerm`).
- New CSS in `assets/css/desktop.css` (linked from `terminal.html`), scoped under `#desktop`.
- Desktop DOM lives inside `#screen` as `<div id="desktop" hidden>`. Units in `em` so it scales
  with the `font-size` room.js already sets on `#screen`.
- Apps are plain objects registered with `Desktop.app({ id, title, icon, open(win, args) })`. Keep
  each app in desktop.js for stage 1 unless it grows past ~300 lines; then split into
  `assets/js/apps/<name>.js`.
- **Share the filesystem**: export it from terminal.js instead of duplicating it. Add to `JTerm`:
  `fs: { lookup, normalize, list(path), read(path) }` plus `cwd()` and an `on("fs", ...)` event if
  anything writes. Read-only is fine for stage 1 (the shell already says "Read-only file system").
- **Reuse the existing terminal** as the Terminal app: move the existing `.terminal-bar` +
  `#terminal-container` nodes into a desktop window on `startx` and back on logout. terminal.js keeps
  its element reference, so it keeps working. Do not create a second shell instance in stage 1.
  (Multiple terminal windows can come later by making terminal.js instantiable.)

### Entry/exit

- Shell command `startx` (aliases: `desktop`, `gui`, `xfce`, `startxfce4`) emits `"startx"`; desktop.js
  shows `#desktop`, moves the terminal into a window, plays a short boot/login animation.
- Desktop menu "Log out" (and shell `logout` while in the desktop, and `exit` at user level) returns
  to the plain full-screen terminal.
- Add a small hint to the intro line: `Type 'help' for available commands, or 'startx' for the desktop.`
  (keep the user's wording "Type 'help' for available commands." as the first sentence).
- In the flat/no-WebGL layout the desktop still works inside the card (give the card a fixed
  16:10 aspect when the desktop is open).
- On phones (`#screen` narrower than ~520 px) windows open maximised, no drag, the panel shows an
  app switcher. Keep it usable, not pretty.

---

## 4. Stage 1 – simulated desktop

### 4.1 Shell (desktop chrome)
- Top panel (Kali-style): app menu button, quick-launch icons (Terminal, Files, Browser), window list,
  right side: network icon (shows "disconnected – this box is airgapped"), volume, clock (reuse the
  `#term-clock` logic), user menu (Log out, Reboot → calls existing `reboot` event).
- Wallpaper: CSS gradient + subtle grid/noise in the room's teal; the user's `rgb` accent should tint
  it (listen to JTerm `rgb`; red when `root`).
- Desktop icons (double click / tap): Home, Writeups, Trash, `README.txt`.

### 4.2 Window manager
- Windows: titlebar (title, minimise, maximise, close), drag by titlebar, resize from bottom-right
  corner, focus/raise on mousedown, z-order stack, maximise fills the desktop area below the panel,
  double-click titlebar toggles maximise, keep at least 40 px of titlebar on screen.
- Use Pointer Events with `setPointerCapture`. Divide deltas by the `#screen` scale (section 2).
- Keyboard: Alt+Tab-like cycling is optional; Esc closes the app menu.
- Fullscreen button in the panel: toggles a class that lifts `#screen` out of the transform and makes
  it fill the viewport (add a hook in room.js: `JTerm.on("fullscreen", on => ...)` that stops writing
  the transform and sets `position: fixed; inset: 0; transform: none`). Esc exits fullscreen first.

### 4.3 Apps (stage 1)
1. **Terminal** – the existing shell (see architecture).
2. **Files** (Thunar-like) – sidebar (Home, Writeups, /, /etc, /root), list/grid view, breadcrumbs,
   double-click dir to enter, file to open in Editor; `writeups/*.html` open in Browser. `/root`
   shows a padlock and "Permission denied" unless `JTerm.isRoot()`.
3. **Browser** – fake address bar + an `<iframe>` of same-origin pages (`index.html`, `blog.html`,
   `posts/*.html`). Home page = writeups list. External URLs: show a "No network – this machine is
   offline" page with a button that opens the real URL in a new tab (matches the user's earlier
   request that leaving the site opens a new tab). Check that the posts render acceptably at
   ~700 px wide inside the iframe.
4. **Text editor** (Mousepad-like) – read-only viewer with line numbers for `notes.md`,
   `.bash_history`, `/etc/passwd`, `user.txt`, etc. Save shows "Read-only file system".
5. **Tool look-alikes**, each a small scripted app with canned but plausible output and a
   short "what this tool is for" blurb linking to a writeup where Jordan used it (find matches by
   grepping `posts/*.html` for the tool name):
   - **Zenmap/nmap GUI** – target field (only `localhost`, `10.10.11.42`, or `target.htb` "respond"),
     profile dropdown, animated scan output, ports table, topology mini-graph.
   - **Burp-style proxy** – HTTP history table of a canned login flow; Repeater tab where editing
     the password param to a SQLi payload returns a "logged in as admin" response.
   - **Wireshark-style** – packet list from a canned capture (DNS, HTTP basic auth, FTP login);
     clicking a packet shows decoded fields; "Follow TCP stream" reveals the creds.
   - **John/Hashcat** – paste or pick a hash from `/etc/shadow`-like file, pick wordlist
     (`rockyou.txt` – a 200-word excerpt), progress bar, cracks it.
   - **CyberChef-lite** – real, local transforms (base64, hex, URL, ROT13, XOR with key, JWT decode).
     This one should actually work on any input.
   Keep each tool honest: label the scripted ones as a demo in their About box.
6. **Settings** – accent colour (drives `rgb`), lamp on/off (drives `lamp`), wallpaper choice.

### 4.4 Shell additions
- `startx` (and aliases), `xdg-open <file|url>` opens in the matching desktop app when the desktop is
  up, `firefox <url>` → Browser, `thunar [path]` → Files, `mousepad <file>` → Editor,
  `zenmap`, `burpsuite`, `wireshark`, `john`, `cyberchef` launch the tools.
- When the desktop is not up, those commands print `cannot open display: run 'startx' first`.

### 4.5 Accessibility / quality bar
- All controls are buttons with `aria-label`; windows have `role="dialog"` and a label.
- Works with keyboard only: Tab into panel, Enter opens menu, arrow keys move in menu.
- `prefers-reduced-motion`: no window animations.
- No console errors. No layout shift of the room. 60 fps drag on a mid laptop (avoid layout
  thrash: move windows with `transform`, not `left/top`).
- Total added JS+CSS for stage 1 under ~120 KB unminified, no external libraries.

### 4.6 Event/keyboard contract with room.js (avoid regressions)
- room.js currently stands up on Esc whenever seated. Change it to:
  `if (e.key === "Escape" && S.seatTarget && !e.defaultPrevented) stand();` and have desktop.js
  `preventDefault()` Esc when it closes a menu/dialog or exits fullscreen. Register desktop.js's
  keydown listener on `document` in the capture phase so it runs first.
- room.js's "any key while standing sits you down" must ignore keys when `document.activeElement`
  is inside `#desktop` (shouldn't happen while standing, but guard anyway).

### 4.7 Stage 1 acceptance checklist
- [ ] Original commands behave exactly as before (run the command sweep in section 7).
- [ ] `startx` opens the desktop; Terminal window contains the live shell with history intact.
- [ ] Windows drag/resize correctly while the room's transform is applied (test at 1440×810 and
      2560×1300) and in fullscreen.
- [ ] Files ↔ Editor ↔ Browser all open each other's content correctly; writeups load in the iframe.
- [ ] `sudo su` turns the desktop accent red; `/root` becomes browsable; `exit` reverts.
- [ ] Log out returns to the plain terminal; Esc then stands up as before.
- [ ] Phone (iPhone 13 emulation): desktop usable, windows maximised, keyboard input works.
- [ ] No-WebGL flat layout: desktop works inside the card.
- [ ] `tools/room/build_preview.py` still produces a working single-file preview (it inlines
      `terminal.js` and `room.js` by matching `<script src="...?v=N">`; add `desktop.js` and
      `desktop.css` to it, and keep the `?v=` handling).

---

## 5. Stage 2 – a real Linux VM window

**Verify before building** (things that change; don't trust this plan's memory):
- v86 current release, license (was BSD-2-Clause), and whether it still only emulates 32-bit x86.
- Whether Kali still publishes any i386 images (it announced dropping i386 images in 2024). If not,
  use Alpine Linux x86 (32-bit) or a Buildroot image and install the tools (nmap, netcat-openbsd,
  socat, python3, gdb, john, hydra, curl, sqlite, vim, tmux) from Alpine's x86 repos.
- v86 state save/restore API (`save_state` / `restore_state`) so the VM can start from a snapshot
  instead of booting (target: interactive in under 5 s after download on a fast laptop).

Plan:
1. Build the disk image with a script committed to `tools/vm/` (Dockerfile or shell script using
   Alpine minirootfs + `apk --root` for x86). Kernel: Alpine `linux-virt` x86 if it boots in v86,
   else v86's suggested Buildroot config. Output: `bzImage`, `initrd` or a disk image, plus a saved
   state file, all split into ≤ 10 MB chunks (v86 can fetch disk images in parts; check the
   current option name) so no file is near GitHub's 100 MB limit.
2. Host under `assets/vm/` (or a separate repo/GitHub release if the total exceeds ~150 MB; ask
   the user). Gzip/zstd as v86 supports. Target total download under 60 MB.
3. `apps/vm.js`: "Real Terminal" desktop app. On open: explain size ("downloads ~40 MB, runs
   entirely in your browser, no network"), progress bar, then attach v86's serial console to an
   xterm.js instance (vendor xterm.js into `assets/vendor/`, pin version, check license) or use
   v86's built-in screen. Serial console + xterm.js is lighter and copy/paste friendly.
4. Network: do not configure any v86 network adapter/relay. `ip a` should only show `lo`.
5. Lifecycle: closing the window pauses/destroys the emulator and frees memory. One VM at a time.
   Mobile: show the window but warn it is heavy; allow it, don't block it.
6. Shell bridge (optional): `vm` command in the fake shell opens the Real Terminal app.

Acceptance: boots or restores in the browser from GitHub Pages; `nmap -sV localhost` works;
closing and reopening works; no requests leave the origin after the image is downloaded (check
the Network panel / Playwright request log).

## 6. Stage 3 – a hackable target inside the VM

- Run 1–2 small services on localhost inside the image, started at boot, e.g.:
  - a tiny Python HTTP app on :8080 with a path traversal or command injection bug that leaks an
    SSH key or credentials,
  - local privesc via a misconfigured `sudo` rule (GTFOBins-style) or a writable root cron script.
- Flags: `/home/<user>/user.txt`, `/root/root.txt` with `HWJ{...}` strings (match the existing
  flags' style in terminal.js).
- A `README` / desktop note with the brief: "There's a box on localhost. Get user, then root."
- Optional: hint system in the desktop (three escalating hints).
- Write it up like one of Jordan's writeups as a hidden post later (ask the user).
- Make sure the snapshot in stage 2 is taken after services are up.

## 7. Testing approach (what was used for the room, reuse it)

- Serve locally: `python3 -m http.server 8765` from the repo root.
- Headless Chromium with Playwright (pre-installed; `require('playwright')`), WebGL via
  `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- Flows to script (put scripts in the session scratchpad, not the repo):
  1. Desktop 1440×810: load, wait ~5 s, click the monitor (≈ centre), wait 2.6 s for the zoom,
     type commands, screenshot.
  2. Large 2560×1300 for sharpness/drag maths.
  3. iPhone 13 device emulation: tap `#screen` centre to sit, type.
  4. No WebGL: launch with `--disable-gpu --disable-webgl --disable-webgl2 --disable-3d-apis`; body
     gets class `flat`.
  5. Command sweep (no-WebGL is fastest): help, whoami, ls, ls -la, cd writeups, cat, sudo su,
     cat credit_card_details (must open a new tab, not navigate), exit, clear, tab completion,
     history, ping (async). Assert no `pageerror`.
  6. New-tab check: `context.on('page')` collects opened URLs; the terminal page URL must not change.
- `ERR_TUNNEL_CONNECTION_FAILED` in console during tests is the Google Analytics tag being blocked
  by the sandbox proxy; ignore it.

## 8. Conventions

- Plain JS (ES5-ish style like the existing files is fine; ES2017 is OK too), no bundler, no npm
  deps in the shipped page. Vendored libraries go in `assets/vendor/<name>-<version>/` with their
  license file.
- Bump `?v=N` on every changed script/CSS in `terminal.html`, and `VERSION` in room.js only when
  textures change.
- Commit to `claude/admiring-brahmagupta-ep59ts`, push it, and **ask the user before pushing to
  `main`** (main is the live site). Fast-forward main from the branch when approved
  (`git push origin HEAD:main` after checking `git merge-base --is-ancestor origin/main HEAD`).
- A stop hook requires a clean tree at the end of each turn: commit and push the branch before
  ending a turn.
- Commit message trailer (from the session): see the attribution lines the harness provides.

## 9. Risks / open questions for the user

- Stage 2 download size and where to host it if it is large.
- Whether "Kali" naming is fine for the user (it's their personal site; we avoid the logo anyway).
- How much of the scripted tools should be "real" (CyberChef-lite is real; others are demos).
- Mobile experience for the VM is likely poor; acceptable?

---

## Progress

- [x] Plan written (this file).
- [x] Stage 1: JTerm fs export + `startx` hook (`JTerm.fs.list/read`, `JTerm.desktop`, `JTerm.open`, `JTerm.emit`)
- [x] Stage 1: desktop shell (panel, wallpaper, icons) + window manager (`assets/js/desktop.js`, `assets/css/desktop.css`)
- [x] Stage 1: Terminal / Files / Editor / Browser apps
- [x] Stage 1: fullscreen + Esc contract with room.js (room only stands up when Esc wasn't `defaultPrevented`)
- [ ] Stage 1: tool look-alikes (Zenmap, Burp, Wireshark, John, CyberChef-lite), Settings app
- [x] Stage 1: tests run for what exists (desktop 1440×810, iPhone 13, no-WebGL, command sweep, new-tab check); bundler updated
- [ ] Stage 2 research + image build script
- [ ] Stage 2 VM app
- [ ] Stage 3 target

### Notes from the first build session
- The intro line was kept exactly as the user asked ("Type 'help' for available commands."); the
  `startx` hint lives in `help` output instead of the intro (deviation from section 3).
- Shell commands added: `startx` (+ `startxfce4 desktop gui xfce`), `thunar|files|nautilus [path]`,
  `mousepad|gedit|editor [file]`, `browser|chromium [url]`. `open <writeup>` uses the desktop
  browser when the desktop is up; `blog`/`about` still open real new tabs (original commands unchanged).
  `exit`/`logout` at user level close the desktop before standing up.
- On narrow screens (<520 px desktop area) windows open maximised; minimise via the panel task button.
- Browser app iframes same-origin pages only; external links show an "airgapped" page with a
  button that opens a real tab. In the file:// preview the iframe can't load site pages (shows offline page).
- Not pushed to `main` yet: waiting for the user.
