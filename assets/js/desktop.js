/*
 * A small Kali-style desktop that runs on the monitor in terminal.html.
 *
 * Started from the shell with `startx`. It lives inside #screen, so the room
 * (assets/js/room.js) keeps positioning and scaling it like the terminal.
 * The existing shell is reused as the Terminal app: its DOM nodes are moved
 * into a window and moved back on logout. See _plans/kali-desktop.md.
 */
(function () {
    "use strict";

    var term = window.JTerm;
    var screenEl = document.getElementById("screen");
    if (!term || !screenEl) return;

    var termBar = screenEl.querySelector(".terminal-bar");
    var termBox = document.getElementById("terminal-container");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ------------------------------------------------------------------
    // Icons (inline SVG, stroke = currentColor)
    // ------------------------------------------------------------------
    var ICON = {
        terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
        folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
        web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
        editor: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
        home: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/>',
        book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>',
        menu: '<path d="M5 17l5-5-5-5M12 18h7"/>',
        power: '<path d="M12 3v9"/><path d="M6.3 7.5a8 8 0 1 0 11.4 0"/>',
        full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        unfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
        wifi: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.5M12 20h.01"/>',
        min: '<path d="M6 12h12"/>',
        max: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
        close: '<path d="M7 7l10 10M17 7L7 17"/>',
        up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
        back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
        fwd: '<path d="M5 12h14M13 6l6 6-6 6"/>',
        reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
        ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'
    };
    function icon(name, cls) {
        return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.file) + "</svg>";
    }
    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    }

    // ------------------------------------------------------------------
    // Desktop chrome
    // ------------------------------------------------------------------
    var root = el("div", "dt");
    root.id = "desktop";
    root.hidden = true;
    root.setAttribute("aria-label", "Desktop");
    root.innerHTML =
        '<div class="dt-panel">' +
        '  <button class="dt-btn dt-menu-btn" type="button" aria-label="Applications" aria-haspopup="true">' + icon("menu") + '<span>Applications</span></button>' +
        '  <div class="dt-quick"></div>' +
        '  <div class="dt-tasks" role="toolbar" aria-label="Open windows"></div>' +
        '  <div class="dt-tray">' +
        '    <span class="dt-net" title="No network: this box is airgapped">' + icon("wifi") + '</span>' +
        '    <span class="dt-clock"></span>' +
        '    <button class="dt-btn dt-full" type="button" aria-label="Full screen">' + icon("full") + '</button>' +
        '    <button class="dt-btn dt-power" type="button" aria-label="Session menu" aria-haspopup="true">' + icon("power") + '</button>' +
        '  </div>' +
        '</div>' +
        '<div class="dt-area">' +
        '  <div class="dt-icons"></div>' +
        '  <div class="dt-wins"></div>' +
        '</div>' +
        '<div class="dt-menu" hidden role="menu"></div>' +
        '<div class="dt-power-menu dt-menu" hidden role="menu"></div>' +
        '<div class="dt-boot" hidden><span>~$</span> starting session</div>';
    screenEl.appendChild(root);

    var area = root.querySelector(".dt-area");
    var winsEl = root.querySelector(".dt-wins");
    var tasksEl = root.querySelector(".dt-tasks");
    var menuEl = root.querySelector(".dt-menu:not(.dt-power-menu)");
    var powerEl = root.querySelector(".dt-power-menu");
    var bootEl = root.querySelector(".dt-boot");
    var clockEl = root.querySelector(".dt-clock");
    var fullBtn = root.querySelector(".dt-full");
    var parking = el("div");          // where the shell waits while its window is closed
    parking.hidden = true;
    root.appendChild(parking);

    var isOpen = false;
    var isFull = false;

    function tick() {
        var d = new Date();
        clockEl.textContent = d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    // ------------------------------------------------------------------
    // Window manager
    // ------------------------------------------------------------------
    var wins = [];
    var zTop = 10;
    var cascade = 0;

    function scale() {
        // #screen is scaled by the room with a CSS transform; pointer deltas are in screen pixels
        var r = screenEl.getBoundingClientRect();
        return screenEl.offsetWidth ? r.width / screenEl.offsetWidth : 1;
    }
    function areaSize() { return { w: area.clientWidth, h: area.clientHeight }; }
    function compact() { return areaSize().w < 520; }

    function Win(opts) {
        var self = this;
        this.id = opts.id;
        this.app = opts.app;
        var a = areaSize();
        this.w = Math.min(a.w - 20, Math.max(280, Math.round(a.w * (opts.wf || 0.62))));
        this.h = Math.min(a.h - 20, Math.max(200, Math.round(a.h * (opts.hf || 0.66))));
        this.x = Math.round((a.w - this.w) / 2 - a.w * 0.08 + cascade * 26);
        this.y = Math.round((a.h - this.h) / 2 - a.h * 0.06 + cascade * 22);
        cascade = (cascade + 1) % 6;
        this.max = compact();
        this.min = false;

        var w = this.el = el("section", "win");
        w.setAttribute("role", "dialog");
        w.setAttribute("aria-label", opts.title);
        w.innerHTML =
            '<header class="win-bar">' + icon(opts.icon || "file", "win-ico") +
            '<span class="win-title"></span>' +
            '<span class="win-ctl">' +
            '<button type="button" data-a="min" aria-label="Minimise">' + icon("min") + '</button>' +
            '<button type="button" data-a="max" aria-label="Maximise">' + icon("max") + '</button>' +
            '<button type="button" data-a="close" aria-label="Close">' + icon("close") + '</button>' +
            '</span></header><div class="win-body"></div><span class="win-grip" aria-hidden="true"></span>';
        this.titleEl = w.querySelector(".win-title");
        this.body = w.querySelector(".win-body");
        this.setTitle(opts.title);

        this.task = el("button", "dt-task", icon(opts.icon || "file") + "<span></span>");
        this.task.type = "button";
        this.task.querySelector("span").textContent = opts.title;
        this.task.addEventListener("click", function () {
            if (self.min || topWin() !== self) self.show(); else self.minimise();
        });
        tasksEl.appendChild(this.task);

        w.addEventListener("pointerdown", function () { self.focus(); }, true);
        w.querySelector(".win-ctl").addEventListener("click", function (e) {
            var b = e.target.closest("button");
            if (!b) return;
            e.stopPropagation();
            if (b.dataset.a === "close") self.close();
            else if (b.dataset.a === "min") self.minimise();
            else self.toggleMax();
        });
        var bar = w.querySelector(".win-bar");
        bar.addEventListener("dblclick", function (e) { if (!e.target.closest("button")) self.toggleMax(); });
        drag(bar, function (dx, dy, start) {
            if (self.max) {
                if (compact()) return;
                // pull a maximised window down: restore it under the pointer
                self.max = false;
                start.x = self.x = Math.round(start.px - self.w / 2);
                start.y = self.y = 0;
            }
            var a = areaSize();
            self.x = Math.min(a.w - 60, Math.max(60 - self.w, start.x + dx));
            self.y = Math.min(a.h - 30, Math.max(0, start.y + dy));
            self.place();
        }, function () { return { x: self.x, y: self.y }; });
        drag(w.querySelector(".win-grip"), function (dx, dy, start) {
            var a = areaSize();
            self.w = Math.max(260, Math.min(a.w - self.x, start.w + dx));
            self.h = Math.max(160, Math.min(a.h - self.y, start.h + dy));
            self.place();
            if (self.onresize) self.onresize();
        }, function () { return { w: self.w, h: self.h }; });

        winsEl.appendChild(w);
        wins.push(this);
        this.place();
        this.focus();
        if (!reduced) {
            w.classList.add("opening");
            setTimeout(function () { w.classList.remove("opening"); }, 180);
        }
    }
    Win.prototype.setTitle = function (t) {
        this.titleEl.textContent = t;
        if (this.task) this.task.querySelector("span").textContent = t;
    };
    Win.prototype.place = function () {
        var s = this.el.style;
        this.el.classList.toggle("max", this.max);
        if (this.max) { s.transform = ""; s.width = ""; s.height = ""; return; }
        s.transform = "translate(" + this.x + "px," + this.y + "px)";
        s.width = this.w + "px";
        s.height = this.h + "px";
    };
    Win.prototype.focus = function () {
        if (topWin() === this && !this.min) return;
        this.el.style.zIndex = ++zTop;
        wins.forEach(function (w) { w.el.classList.remove("active"); w.task.classList.remove("active"); });
        this.el.classList.add("active");
        this.task.classList.add("active");
        if (this.onfocus) this.onfocus();
    };
    Win.prototype.show = function () {
        this.min = false;
        this.el.hidden = false;
        this.el.style.zIndex = ++zTop;
        wins.forEach(function (w) { w.el.classList.remove("active"); w.task.classList.remove("active"); });
        this.el.classList.add("active");
        this.task.classList.add("active");
        if (this.onfocus) this.onfocus();
    };
    Win.prototype.minimise = function () {
        this.min = true;
        this.el.hidden = true;
        this.task.classList.remove("active");
        var t = topWin();
        if (t) t.show();
    };
    Win.prototype.toggleMax = function () {
        if (compact()) return;
        this.max = !this.max;
        this.place();
        if (this.onresize) this.onresize();
    };
    Win.prototype.close = function () {
        if (this.onclose) this.onclose();
        this.el.remove();
        this.task.remove();
        wins = wins.filter(function (w) { return w !== this; }, this);
        var t = topWin();
        if (t) t.show();
    };

    function topWin() {
        var best = null;
        wins.forEach(function (w) { if (!w.min && (!best || (+w.el.style.zIndex) > (+best.el.style.zIndex))) best = w; });
        return best;
    }
    function findWin(id) { return wins.filter(function (w) { return w.id === id; })[0] || null; }

    function drag(handle, move, getStart) {
        handle.addEventListener("pointerdown", function (e) {
            if (e.button !== 0 || e.target.closest("button")) return;
            e.preventDefault();
            var k = scale();
            var r = area.getBoundingClientRect();
            var start = getStart();
            start.px = (e.clientX - r.left) / k;
            var sx = e.clientX, sy = e.clientY;
            handle.setPointerCapture(e.pointerId);
            root.classList.add("dragging");
            function mv(ev) { move((ev.clientX - sx) / k, (ev.clientY - sy) / k, start); }
            function up() {
                handle.removeEventListener("pointermove", mv);
                handle.removeEventListener("pointerup", up);
                handle.removeEventListener("pointercancel", up);
                root.classList.remove("dragging");
            }
            handle.addEventListener("pointermove", mv);
            handle.addEventListener("pointerup", up);
            handle.addEventListener("pointercancel", up);
        });
    }

    // ------------------------------------------------------------------
    // Apps
    // ------------------------------------------------------------------
    var APPS = {};
    var ORDER = [];
    function app(def) { APPS[def.id] = def; ORDER.push(def.id); }

    function open(id, arg) {
        var def = APPS[id];
        if (!def) return null;
        if (def.single) {
            var existing = findWin(id);
            if (existing) { existing.show(); if (def.reuse) def.reuse(existing, arg); return existing; }
        }
        var w = new Win({ id: id, app: def, title: def.title, icon: def.icon, wf: def.wf, hf: def.hf });
        def.open(w, arg);
        closeMenus();
        return w;
    }

    // --- Terminal: the real shell, moved in -------------------------------
    app({
        id: "terminal", title: "jordan@kali: ~", icon: "terminal", group: "Accessories", single: true, wf: 0.64, hf: 0.68,
        open: function (w) {
            w.el.classList.add("win-term");
            w.body.appendChild(termBox);
            w.onfocus = function () { setTimeout(function () { term.focus(); }, 0); };
            w.onclose = function () { parking.appendChild(termBox); };
            w.onfocus();
        }
    });

    // --- Files -------------------------------------------------------------
    var PLACES = [["Home", "/home/jordan", "home"], ["Writeups", "/home/jordan/writeups", "book"], ["File system", "/", "folder"], ["etc", "/etc", "folder"], ["root", "/root", "lock"]];
    app({
        id: "files", title: "Files", icon: "folder", group: "Accessories", wf: 0.6, hf: 0.62,
        open: function (w, path) {
            var hist = [], fwd = [];
            w.body.classList.add("app-files");
            w.body.innerHTML =
                '<div class="tb">' +
                '<button type="button" data-a="back" aria-label="Back">' + icon("back") + '</button>' +
                '<button type="button" data-a="fwd" aria-label="Forward">' + icon("fwd") + '</button>' +
                '<button type="button" data-a="up" aria-label="Up">' + icon("up") + '</button>' +
                '<div class="crumbs" aria-label="Location"></div></div>' +
                '<div class="fm"><nav class="side"></nav><div class="list" role="listbox" tabindex="0"></div></div>' +
                '<div class="status"></div>';
            var side = w.body.querySelector(".side"), list = w.body.querySelector(".list");
            var crumbs = w.body.querySelector(".crumbs"), status = w.body.querySelector(".status");
            PLACES.forEach(function (p) {
                var b = el("button", "", icon(p[2]) + "<span>" + p[0] + "</span>");
                b.type = "button";
                b.dataset.path = p[1];
                b.addEventListener("click", function () { go(p[1]); });
                side.appendChild(b);
            });
            var cur = null;
            function go(p, noHist) {
                var r = term.fs.list(p);
                if (r.error) {
                    if (r.locked) toast(p + ": Permission denied (try sudo su in the terminal)");
                    else toast(p + ": " + r.error);
                    return;
                }
                if (cur && !noHist) { hist.push(cur); fwd = []; }
                cur = r.path;
                w.setTitle(cur === "/home/jordan" ? "Home" : cur.split("/").pop() || "/");
                crumbs.innerHTML = "";
                var acc = "";
                ["/"].concat(cur.split("/").filter(Boolean)).forEach(function (part, i) {
                    acc = i === 0 ? "/" : (acc === "/" ? "" : acc) + "/" + part;
                    var b = el("button", "", esc(i === 0 ? "/" : part));
                    b.type = "button";
                    var target = acc;
                    b.addEventListener("click", function () { go(target); });
                    crumbs.appendChild(b);
                });
                side.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.path === cur); });
                list.innerHTML = "";
                var shown = r.entries.filter(function (e) { return e.name[0] !== "."; });
                shown.forEach(function (e) {
                    var ic = e.type === "dir" ? (e.locked ? "lock" : "folder") : (e.post ? "web" : "file");
                    var label = e.post ? e.post.title : e.name;
                    var it = el("button", "item" + (e.type === "dir" ? " dir" : ""), icon(ic) + '<span></span>');
                    it.type = "button";
                    it.title = e.name;
                    it.querySelector("span").textContent = label;
                    it.addEventListener("click", function () {
                        list.querySelectorAll(".sel").forEach(function (x) { x.classList.remove("sel"); });
                        it.classList.add("sel");
                        status.textContent = e.name + (e.post ? "  ·  " + e.post.date : "");
                        if (compact()) activate(e);
                    });
                    it.addEventListener("dblclick", function () { activate(e); });
                    it.addEventListener("keydown", function (k) { if (k.key === "Enter") activate(e); });
                    list.appendChild(it);
                });
                status.textContent = shown.length + " item" + (shown.length === 1 ? "" : "s");
            }
            function activate(e) {
                if (e.type === "dir") go(e.path);
                else if (e.post) open("browser", e.post.filename);
                else open("editor", e.path);
            }
            w.body.querySelector(".tb").addEventListener("click", function (e) {
                var b = e.target.closest("button[data-a]");
                if (!b) return;
                if (b.dataset.a === "up" && cur !== "/") go(cur.split("/").slice(0, -1).join("/") || "/");
                if (b.dataset.a === "back" && hist.length) { fwd.push(cur); go(hist.pop(), true); }
                if (b.dataset.a === "fwd" && fwd.length) { hist.push(cur); go(fwd.pop(), true); }
            });
            go(path || "/home/jordan", true);
            if (!cur) go("/home/jordan", true);
            w.refresh = function () { if (cur) go(cur, true); };
        }
    });

    // --- Text editor (read only) -----------------------------------------
    var README = "Welcome to jordan@kali.\n\n" +
        "This desktop runs entirely in your browser. There is no network, so\n" +
        "nothing you do here leaves this tab.\n\n" +
        "Things to try:\n" +
        "  - Terminal: the same shell as before. 'help' lists commands.\n" +
        "  - Files: poke around /home/jordan, /etc and (if you can) /root.\n" +
        "  - Writeups: every box write-up, readable right here.\n" +
        "  - sudo su in the terminal, then come back and look again.\n\n" +
        "More tools are on the way.";
    app({
        id: "editor", title: "Mousepad", icon: "editor", group: "Accessories", wf: 0.56, hf: 0.62,
        open: function (w, arg) {
            w.body.classList.add("app-editor");
            var name, text, err;
            if (arg && typeof arg === "object") { name = arg.name; text = arg.content; }
            else if (arg) {
                var r = term.fs.read(arg);
                name = arg.split("/").pop();
                if (r.error) err = r.error;
                else if (r.special === "rickroll") { term.open("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Decrypting credit_card_details …"); w.close(); return; }
                else if (r.post) { w.close(); open("browser", r.post.filename); return; }
                else text = r.content;
            } else { name = "Untitled"; text = ""; }
            w.setTitle(name + " — Mousepad");
            if (err) {
                w.body.innerHTML = '<div class="msg">' + icon("lock") + '<p></p></div>';
                w.body.querySelector("p").textContent = "Could not open “" + name + "”: " + err + ".";
                return;
            }
            var lines = text.split("\n");
            w.body.innerHTML = '<div class="tb"><span class="hint">Read-only file system</span></div><div class="ed"><pre class="gut" aria-hidden="true"></pre><pre class="txt" tabindex="0"></pre></div>';
            w.body.querySelector(".gut").textContent = lines.map(function (_, i) { return i + 1; }).join("\n");
            w.body.querySelector(".txt").textContent = text;
        }
    });

    // --- Browser (same-origin pages in an iframe) ----------------------------
    var HOME_URL = "blog.html";
    app({
        id: "browser", title: "Browser", icon: "web", group: "Internet", wf: 0.72, hf: 0.78,
        open: function (w, url) {
            w.body.classList.add("app-browser");
            w.body.innerHTML =
                '<div class="tb">' +
                '<button type="button" data-a="back" aria-label="Back">' + icon("back") + '</button>' +
                '<button type="button" data-a="fwd" aria-label="Forward">' + icon("fwd") + '</button>' +
                '<button type="button" data-a="reload" aria-label="Reload">' + icon("reload") + '</button>' +
                '<form class="url"><input type="text" spellcheck="false" autocomplete="off" aria-label="Address"></form>' +
                '<button type="button" data-a="ext" aria-label="Open in a new tab">' + icon("ext") + '</button>' +
                '</div><div class="view"><iframe title="Browser" referrerpolicy="same-origin"></iframe><div class="offline" hidden></div></div>';
            var frame = w.body.querySelector("iframe"), input = w.body.querySelector("input");
            var off = w.body.querySelector(".offline");
            var shown = "";
            function local(u) {
                // only pages on this site load inside the box
                try {
                    var abs = new URL(u, location.href);
                    if (location.protocol === "file:") return null;
                    return abs.origin === location.origin ? abs.pathname.replace(/^\//, "") + abs.search + abs.hash : null;
                } catch (e) { return null; }
            }
            function nav(u) {
                u = (u || HOME_URL).trim();
                if (/^(home|about)$/i.test(u)) u = "index.html";
                if (/^(blog|writeups)$/i.test(u)) u = "blog.html";
                var l = local(u);
                if (!l && !/^[a-z]+:/i.test(u) && !/^[\w-]+\.[a-z]{2,}(\/|$)/i.test(u)) l = u;   // relative path
                shown = u;
                input.value = l ? "https://hackwithjordan.com/" + l.replace(/^\.?\//, "") : u;
                if (l) {
                    off.hidden = true;
                    frame.hidden = false;
                    frame.src = l;
                } else {
                    frame.hidden = true;
                    off.hidden = false;
                    var full = /^[a-z]+:/i.test(u) ? u : "https://" + u;
                    off.innerHTML = "<h3>No internet</h3><p>This machine is airgapped. Nothing here can leave the tab.</p><p class=\"u\"></p><button type=\"button\">Open it in a real tab instead</button>";
                    off.querySelector(".u").textContent = full;
                    off.querySelector("button").addEventListener("click", function () { term.open(full, "Opening " + full + " …"); });
                }
                w.setTitle("Browser");
            }
            frame.addEventListener("load", function () {
                try {
                    var d = frame.contentDocument;
                    if (d && d.title) w.setTitle(d.title + " — Browser");
                    var p = frame.contentWindow.location.pathname.replace(/^\//, "");
                    if (p) input.value = "https://hackwithjordan.com/" + p;
                    // links that leave the site open a real tab
                    d.addEventListener("click", function (e) {
                        var a = e.target.closest && e.target.closest("a[href]");
                        if (!a) return;
                        if (!local(a.href)) { e.preventDefault(); term.open(a.href, "Opening " + a.href + " …"); }
                        else if (a.target === "_blank") { e.preventDefault(); nav(a.href); }
                    });
                } catch (e) { }
            });
            w.body.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); nav(input.value); });
            w.body.querySelector(".tb").addEventListener("click", function (e) {
                var b = e.target.closest("button[data-a]");
                if (!b) return;
                try {
                    if (b.dataset.a === "back") frame.contentWindow.history.back();
                    if (b.dataset.a === "fwd") frame.contentWindow.history.forward();
                    if (b.dataset.a === "reload") frame.contentWindow.location.reload();
                } catch (err) { }
                if (b.dataset.a === "ext") term.open(local(shown) ? local(shown) : input.value, "Opening in a new tab …");
            });
            w.nav = nav;
            nav(url);
        },
        single: true,
        reuse: function (w, url) { if (url) w.nav(url); }
    });

    // ------------------------------------------------------------------
    // Menus, icons, toasts
    // ------------------------------------------------------------------
    var MENU = [
        ["terminal", "Terminal"], ["files", "Files"], ["browser", "Writeups (browser)"], ["editor", "Text editor"]
    ];
    function buildMenus() {
        menuEl.innerHTML = '<div class="dt-menu-head">jordan@kali</div>';
        MENU.forEach(function (m) {
            var b = el("button", "", icon(APPS[m[0]].icon) + "<span>" + esc(m[1]) + "</span>");
            b.type = "button";
            b.setAttribute("role", "menuitem");
            b.addEventListener("click", function () { open(m[0]); });
            menuEl.appendChild(b);
        });
        powerEl.innerHTML = "";
        [["Log out", function () { close(); }], ["Reboot", function () { close(); term.run("reboot"); }], ["Stand up", function () { closeMenus(); term.emit("stand"); }]].forEach(function (m) {
            var b = el("button", "", "<span>" + m[0] + "</span>");
            b.type = "button";
            b.setAttribute("role", "menuitem");
            b.addEventListener("click", m[1]);
            powerEl.appendChild(b);
        });
        var quick = root.querySelector(".dt-quick");
        ["terminal", "files", "browser"].forEach(function (id) {
            var b = el("button", "dt-btn", icon(APPS[id].icon));
            b.type = "button";
            b.setAttribute("aria-label", APPS[id].title);
            b.title = APPS[id].title;
            b.addEventListener("click", function () { open(id); });
            quick.appendChild(b);
        });
        var icons = root.querySelector(".dt-icons");
        [["Home", "home", function () { open("files", "/home/jordan"); }],
            ["Writeups", "book", function () { open("browser", "blog.html"); }],
            ["README.txt", "file", function () { open("editor", { name: "README.txt", content: README }); }],
            ["Trash", "trash", function () { toast("Trash is empty. (rm -rf / is a terminal thing.)"); }]].forEach(function (d) {
                var b = el("button", "dt-icon", icon(d[1]) + "<span>" + d[0] + "</span>");
                b.type = "button";
                b.addEventListener("dblclick", d[2]);
                b.addEventListener("click", function () {
                    if (compact()) { d[2](); return; }
                    icons.querySelectorAll(".sel").forEach(function (x) { x.classList.remove("sel"); });
                    b.classList.add("sel");
                });
                b.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); d[2](); } });
                icons.appendChild(b);
            });
    }
    function toggleMenu(m, btn) {
        var show = m.hidden;
        closeMenus();
        if (!show) return;
        m.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        var first = m.querySelector("button");
        if (first) first.focus({ preventScroll: true });
    }
    function closeMenus() {
        var was = !menuEl.hidden || !powerEl.hidden;
        menuEl.hidden = true;
        powerEl.hidden = true;
        root.querySelectorAll("[aria-expanded]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
        return was;
    }
    root.querySelector(".dt-menu-btn").addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(menuEl, this); });
    root.querySelector(".dt-power").addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(powerEl, this); });
    root.addEventListener("pointerdown", function (e) { if (!e.target.closest(".dt-menu, .dt-menu-btn, .dt-power")) closeMenus(); });
    [menuEl, powerEl].forEach(function (m) {
        m.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            var items = Array.prototype.slice.call(m.querySelectorAll("button"));
            var i = items.indexOf(document.activeElement);
            items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
        });
    });

    var toastEl = el("div", "dt-toast");
    toastEl.setAttribute("role", "status");
    root.appendChild(toastEl);
    var toastT = 0;
    function toast(t) {
        toastEl.textContent = t;
        toastEl.classList.add("on");
        clearTimeout(toastT);
        toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 2600);
    }

    // ------------------------------------------------------------------
    // Full screen (the room stops placing #screen while this is on)
    // ------------------------------------------------------------------
    function setFull(on) {
        isFull = on;
        screenEl.classList.toggle("full", on);
        document.body.classList.toggle("desk-full", on);
        fullBtn.innerHTML = icon(on ? "unfull" : "full");
        fullBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
        term.emit("fullscreen", on);
        wins.forEach(function (w) { if (!w.max) clampWin(w); });
    }
    function clampWin(w) {
        var a = areaSize();
        w.w = Math.min(w.w, a.w);
        w.h = Math.min(w.h, a.h);
        w.x = Math.max(0, Math.min(w.x, a.w - w.w));
        w.y = Math.max(0, Math.min(w.y, a.h - w.h));
        w.place();
    }
    fullBtn.addEventListener("click", function () { setFull(!isFull); });

    // Esc: menus first, then full screen; anything else falls through to the room (stand up)
    document.addEventListener("keydown", function (e) {
        if (!isOpen || e.key !== "Escape") return;
        if (closeMenus()) { e.preventDefault(); return; }
        if (isFull) { e.preventDefault(); setFull(false); }
    }, true);

    // ------------------------------------------------------------------
    // Session
    // ------------------------------------------------------------------
    var clockT = 0;
    function start() {
        if (isOpen) return;
        isOpen = true;
        root.hidden = false;
        screenEl.classList.add("desk-on");
        tick();
        clockT = setInterval(tick, 15000);
        termBar.hidden = true;
        if (!reduced) {
            bootEl.hidden = false;
            setTimeout(function () { bootEl.hidden = true; }, 650);
        }
        // let layout settle so window sizes are measured against the real area
        requestAnimationFrame(function () {
            open("terminal");
            term.emit("desktop", true);
        });
    }
    function close() {
        if (!isOpen) return;
        closeMenus();
        if (isFull) setFull(false);
        wins.slice().forEach(function (w) { w.close(); });
        screenEl.insertBefore(termBar, root);
        screenEl.insertBefore(termBox, root);
        termBar.hidden = false;
        root.hidden = true;
        screenEl.classList.remove("desk-on");
        clearInterval(clockT);
        isOpen = false;
        term.emit("desktop", false);
        setTimeout(function () { term.focus(); }, 0);
    }

    term.on("root", function (on) {
        root.classList.toggle("is-root", on);
        wins.forEach(function (w) { if (w.refresh) w.refresh(); });
    });
    term.on("stand", function () { if (isFull) setFull(false); });

    buildMenus();
    term.desktop = {
        start: start,
        close: close,
        isOpen: function () { return isOpen; },
        open: function (id, arg) { if (!isOpen) start(); return open(id, arg); }
    };
})();
