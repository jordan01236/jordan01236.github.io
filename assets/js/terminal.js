/*
 * jordan@kali — a small fake shell.
 *
 * The original commands (whoami, help, clear, blog, about, sudo su,
 * cat credit_card_details) behave as they always have; everything else here
 * is new. The room (assets/js/room.js) hooks in through window.JTerm.
 */
(function () {
    "use strict";

    var container = document.getElementById("terminal-container");
    if (!container) return;

    var USER_COLOR = "#5eead4";
    var ROOT_COLOR = "#ff4444";
    var HOME = "/home/jordan";

    var state = {
        isRoot: false,
        cwd: HOME,
        history: [],
        histIndex: -1,
        busy: false,
        posts: []
    };
    var listeners = {};
    var bootTime = Date.now();

    function emit(name, detail) {
        (listeners[name] || []).forEach(function (fn) {
            try { fn(detail); } catch (e) { console.error(e); }
        });
        return (listeners[name] || []).length > 0;
    }

    // ------------------------------------------------------------------
    // Filesystem
    // ------------------------------------------------------------------
    function dir(children, opts) { return Object.assign({ type: "dir", children: children || {} }, opts || {}); }
    function file(content, opts) { return Object.assign({ type: "file", content: content }, opts || {}); }

    var WHOAMI = "Hello! I'm Jordan, a cybersecurity enthusiast focused on hacking/cybersecurity. " +
        "I have been learning pentesting for just about 4 years now. Visit my home page to learn more!";

    var fs = dir({
        home: dir({
            jordan: dir({
                "about.txt": file(WHOAMI + "\n\nTry: blog, about, writeups, neofetch — or look around with ls."),
                "user.txt": file("HWJ{y0u_s4t_d0wn_4nd_l00k3d_4r0und}"),
                "notes.md": file(
                    "# todo\n" +
                    "- [x] new desk setup\n" +
                    "- [x] fix the lamp (try: lamp off)\n" +
                    "- [ ] stop leaving sudo wide open on this box\n" +
                    "- [ ] pick an RGB colour and stick with it (rgb violet)\n" +
                    "- [ ] root.txt is still in /root, go get it"),
                ".bash_history": file("nmap -sC -sV 10.10.11.42\nsudo -l\nsudo su\ncat /root/root.txt\ncat credit_card_details\nexit"),
                "credit_card_details": file("", { rootOnly: true, special: "rickroll" }),
                writeups: dir({})
            })
        }),
        root: dir({
            "root.txt": file("HWJ{r00t_0n_th3_f1rst_try_n1c3}\n\nNice work. The real boxes are over in the writeups — type 'blog'.")
        }, { rootOnly: true }),
        etc: dir({
            hostname: file("kali"),
            passwd: file(
                "root:x:0:0:root:/root:/usr/bin/zsh\n" +
                "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n" +
                "jordan:x:1000:1000:Jordan,,,:/home/jordan:/usr/bin/zsh"),
            shadow: file("root:$y$j9T$nice.try$but.this.is.a.static.site:19800:0:99999:7:::", { rootOnly: true }),
            sudoers: file("# oops\njordan ALL=(ALL:ALL) NOPASSWD: ALL", { rootOnly: true }),
            "os-release": file('PRETTY_NAME="Kali GNU/Linux Rolling"\nNAME="Kali GNU/Linux"\nID=kali\nHOME_URL="https://hackwithjordan.com/"')
        }),
        tmp: dir({}),
        var: dir({ www: dir({ html: dir({ "index.html": file("<h1>It works!</h1>") }) }) })
    });

    function slugify(post) {
        var base = post.filename.split("/").pop().replace(/\.html$/, "");
        base = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
        return base.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() + ".html";
    }

    function setPosts(data) {
        var posts = (data && data.posts ? data.posts : []).slice().sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });
        state.posts = posts;
        var d = fs.children.home.children.jordan.children.writeups.children;
        posts.forEach(function (p) {
            var name = slugify(p);
            if (d[name]) return;
            d[name] = file("", { post: p });
        });
    }

    function loadPosts() {
        if (window.__POSTS__) { setPosts(window.__POSTS__); return; }
        fetch("posts.json").then(function (r) { return r.ok ? r.json() : null; }).then(setPosts).catch(function () { });
    }

    function normalize(path) {
        if (!path) return state.cwd;
        if (path === "~" || path.indexOf("~/") === 0) path = (state.isRoot ? "/root" : HOME) + path.slice(1);
        if (path[0] !== "/") path = state.cwd + "/" + path;
        var out = [];
        path.split("/").forEach(function (seg) {
            if (!seg || seg === ".") return;
            if (seg === "..") out.pop(); else out.push(seg);
        });
        return "/" + out.join("/");
    }

    // returns { node } or { error: "ENOENT" | "EACCES" | "ENOTDIR" }
    function lookup(path) {
        var abs = normalize(path);
        var node = fs;
        var parts = abs.split("/").filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
            if (node.type !== "dir") return { error: "ENOTDIR" };
            if (node.rootOnly && !state.isRoot) return { error: "EACCES" };
            node = node.children[parts[i]];
            if (!node) return { error: "ENOENT" };
        }
        return { node: node, path: abs };
    }

    function prettyPath(p) {
        var home = state.isRoot ? "/root" : HOME;
        if (p === home) return "~";
        if (p.indexOf(home + "/") === 0) return "~" + p.slice(home.length);
        return p;
    }

    var ERR = { ENOENT: "No such file or directory", EACCES: "Permission denied", ENOTDIR: "Not a directory" };

    // ------------------------------------------------------------------
    // Output
    // ------------------------------------------------------------------
    function color() { return state.isRoot ? ROOT_COLOR : USER_COLOR; }
    function promptText() {
        return state.isRoot ? "root@kali:" + prettyPath(state.cwd) + "# " : "jordan@kali:" + prettyPath(state.cwd) + "$ ";
    }

    function scrollDown() { container.scrollTop = container.scrollHeight; }

    function print(text, cls) {
        var div = document.createElement("div");
        div.className = "output" + (cls ? " " + cls : "");
        if (state.isRoot) div.style.color = ROOT_COLOR;
        div.textContent = text;
        var promptLine = container.querySelector(".prompt-line");
        if (promptLine) container.insertBefore(div, promptLine); else container.appendChild(div);
        scrollDown();
        emit("output");
        return div;
    }

    // print lines one by one, like a slow tool would
    function printSlow(lines, delay, done) {
        state.busy = true;
        var i = 0;
        (function next() {
            if (i >= lines.length) { state.busy = false; if (done) done(); createPrompt(); return; }
            var l = lines[i++];
            print(typeof l === "string" ? l : l[0], typeof l === "string" ? "" : l[1]);
            setTimeout(next, typeof delay === "function" ? delay(i) : delay);
        })();
    }

    var ORIGINAL = ["whoami", "help", "clear", "blog", "about", "sudo su"];

    function commandListText() {
        var text = "Available commands:\n- " + ORIGINAL.join("\n- ");
        if (state.isRoot) text += "\n- cat credit_card_details";
        return text;
    }

    function displayCommands() {
        var old = container.querySelector(".command-list");
        if (old) old.remove();
        var div = document.createElement("div");
        div.className = "command-list";
        div.textContent = commandListText() + "\n\n…or anything else you'd type on a Linux box. Try ls, cat notes.md, neofetch, nmap, lamp, rgb.";
        var promptLine = container.querySelector(".prompt-line");
        if (promptLine) container.insertBefore(div, promptLine); else container.appendChild(div);
    }

    function becomeRoot() {
        if (state.isRoot) return;
        state.isRoot = true;
        container.style.color = ROOT_COLOR;
        container.classList.add("root-mode");
        print("Congratulations on hacking the terminal :)");
        displayCommands();
        container.querySelectorAll(".prompt").forEach(function (p) { p.style.color = ROOT_COLOR; });
        emit("root", true);
    }

    function dropRoot() {
        state.isRoot = false;
        container.style.color = "";
        container.classList.remove("root-mode");
        if (state.cwd.indexOf("/root") === 0) state.cwd = HOME;
        displayCommands();
        emit("root", false);
    }

    function go(url, label) {
        print(label || ("Opening " + url + " …"));
        setTimeout(function () { window.location.href = url; }, 350);
    }

    // ------------------------------------------------------------------
    // Commands
    // ------------------------------------------------------------------
    var commands = {};
    function def(names, help, fn) {
        names.split(" ").forEach(function (n) { commands[n] = { fn: fn, help: help, primary: names.split(" ")[0] }; });
    }

    def("whoami", "who you are", function () {
        print(state.isRoot ? "root" : WHOAMI);
    });

    def("help ?", "this list", function () {
        var more = [];
        var seen = {};
        Object.keys(commands).forEach(function (k) {
            var c = commands[k];
            if (seen[c.primary] || ORIGINAL.indexOf(c.primary) !== -1 || !c.help) return;
            seen[c.primary] = true;
            more.push(c.primary);
        });
        print(commandListText());
        print("\nAlso works:\n" + more.sort().join("  ") +
            "\n\nTab completes, ↑/↓ walks history, Esc stands up from the desk.", "dim");
    });

    def("clear cls", "clear the screen", function () {
        container.innerHTML = "";
        displayCommands();
    });

    def("blog", "go to the writeups", function () { go("blog.html", "Opening writeups …"); return "navigate"; });
    def("about", "go to the home page", function () { go("index.html", "Opening home page …"); return "navigate"; });
    def("home", "", function () { go("index.html", "Opening home page …"); return "navigate"; });

    def("sudo", "run something as root", function (args, raw) {
        var rest = args.join(" ");
        if (!rest) { print("usage: sudo <command>"); return; }
        if (rest === "su" || rest === "su -" || rest === "-i" || rest === "-s" || rest === "bash" || rest === "zsh" || rest === "su root") {
            becomeRoot();
            return;
        }
        if (rest === "-l") {
            print("User jordan may run the following commands on kali:\n    (ALL : ALL) NOPASSWD: ALL");
            return;
        }
        if (/^make me a sandwich/.test(rest)) { print("Okay."); return; }
        // one-off elevation
        var was = state.isRoot;
        state.isRoot = true;
        var r = execute(rest, true);
        if (!was && state.isRoot && r !== "root") state.isRoot = false;
        return r;
    });

    def("su", "become root (if you can)", function (args) {
        if (state.isRoot) return;
        print("Password: ");
        print("su: Authentication failure\n(hint: sudo is a lot more forgiving on this box)");
    });

    def("exit logout", "leave the root shell / stand up", function () {
        if (state.isRoot) { dropRoot(); print("logout"); return; }
        if (!emit("stand")) print("There's nowhere to go. Try 'about' or 'blog'.");
    });

    def("ls ll la dir", "list files", function (args, raw, name) {
        var flags = args.filter(function (a) { return a[0] === "-"; }).join("");
        var targets = args.filter(function (a) { return a[0] !== "-"; });
        var long = /l/.test(flags) || name === "ll";
        var all = /a/.test(flags) || name === "la";
        if (!targets.length) targets = ["."];
        targets.forEach(function (t) {
            var r = lookup(t);
            if (r.error) { print("ls: cannot access '" + t + "': " + ERR[r.error]); return; }
            if (r.node.type === "dir" && r.node.rootOnly && !state.isRoot) {
                print("ls: cannot open directory '" + t + "': Permission denied"); return;
            }
            var entries = r.node.type === "dir"
                ? Object.keys(r.node.children).sort().map(function (k) { return [k, r.node.children[k]]; })
                : [[t, r.node]];
            if (!all) entries = entries.filter(function (e) { return e[0][0] !== "."; });
            if (!entries.length) return;
            if (long) {
                print(entries.map(function (e) {
                    var n = e[1];
                    var isDir = n.type === "dir";
                    var owner = n.rootOnly ? "root  root  " : "jordan jordan";
                    var perms = isDir ? (n.rootOnly ? "drwx------" : "drwxr-xr-x") : (n.rootOnly ? "-rw-------" : "-rw-r--r--");
                    var size = isDir ? 4096 : (n.post ? 8192 : (n.special ? 1337 : n.content.length));
                    return perms + " 1 " + owner + " " + ("     " + size).slice(-5) + " " + e[0] + (isDir ? "/" : "");
                }).join("\n"));
            } else {
                print(entries.map(function (e) { return e[0] + (e[1].type === "dir" ? "/" : ""); }).join(entries.length > 8 ? "\n" : "  "));
            }
        });
    });

    def("cd", "change directory", function (args) {
        var t = args[0] || "~";
        if (t === "-") t = "~";
        var r = lookup(t);
        if (r.error) { print("cd: " + ERR[r.error].toLowerCase() + ": " + t); return; }
        if (r.node.type !== "dir") { print("cd: not a directory: " + t); return; }
        if (r.node.rootOnly && !state.isRoot) { print("cd: permission denied: " + t); return; }
        state.cwd = r.path;
    });

    def("pwd", "where am I", function () { print(state.cwd); });

    def("cat less more head tail bat", "read a file", function (args, raw, name) {
        var targets = args.filter(function (a) { return a[0] !== "-"; });
        if (!targets.length) { print(name + ": missing file operand"); return; }
        var result;
        targets.forEach(function (t) {
            // The original easter egg: works from anywhere, root only.
            if (t.split("/").pop() === "credit_card_details") {
                if (state.isRoot) {
                    print("Decrypting credit_card_details …");
                    setTimeout(function () { window.location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; }, 500);
                    result = "navigate";
                } else {
                    print("cat: credit_card_details: Permission denied");
                }
                return;
            }
            var r = lookup(t);
            if (r.error) { print(name + ": " + t + ": " + ERR[r.error]); return; }
            if (r.node.type === "dir") { print(name + ": " + t + ": Is a directory"); return; }
            if (r.node.rootOnly && !state.isRoot) { print(name + ": " + t + ": Permission denied"); return; }
            if (r.node.post) {
                var p = r.node.post;
                print(p.title + "  (" + p.date + ")" + (p.excerpt ? "\n" + p.excerpt : "") + "\n\n→ 'open " + t.split("/").pop() + "' to read the full writeup.");
                return;
            }
            print(r.node.content);
        });
        return result;
    });

    function findPost(q) {
        if (!q) return null;
        var n = parseInt(q, 10);
        if (String(n) === q && state.posts[n - 1]) return state.posts[n - 1];
        var r = lookup(q);
        if (r.node && r.node.post) return r.node.post;
        r = lookup(HOME + "/writeups/" + q);
        if (r.node && r.node.post) return r.node.post;
        var lower = q.toLowerCase();
        return state.posts.filter(function (p) {
            return p.title.toLowerCase().indexOf(lower) !== -1 || slugify(p).indexOf(lower) !== -1;
        })[0] || null;
    }

    def("writeups posts", "list recent writeups", function (args) {
        if (!state.posts.length) { print("No writeups loaded — try 'blog' instead."); return; }
        var n = args[0] === "-a" || args[0] === "--all" ? state.posts.length : 10;
        var lines = state.posts.slice(0, n).map(function (p, i) {
            return ("  " + (i + 1)).slice(-3) + "  " + p.date + "  " + p.title;
        });
        print("Latest writeups (" + state.posts.length + " total):\n" + lines.join("\n") +
            "\n\nopen <number|name> to read one" + (n < state.posts.length ? ", 'writeups -a' for all of them." : "."), "");
    });

    def("open xdg-open firefox", "open a writeup or page", function (args) {
        var q = args.join(" ");
        if (!q) { print("usage: open <writeup number|name>  (see 'writeups')"); return; }
        if (/^(blog|writeups)$/.test(q)) return commands.blog.fn();
        if (/^(home|about|index)$/.test(q)) return commands.about.fn();
        if (/^github$/.test(q)) return commands.github.fn();
        if (/^linkedin$/.test(q)) return commands.linkedin.fn();
        var p = findPost(q);
        if (!p) { print("open: nothing matches '" + q + "'. Try 'writeups'."); return; }
        go(p.filename.split("/").map(encodeURIComponent).join("/"), "Opening " + p.title + " …");
        return "navigate";
    });

    function ext(url, label) {
        print(label);
        setTimeout(function () { window.open(url, "_blank", "noopener"); }, 250);
    }
    def("github", "my GitHub", function () { ext("https://github.com/jordan01236", "Opening github.com/jordan01236 …"); });
    def("linkedin", "my LinkedIn", function () { ext("https://www.linkedin.com/in/jordan01236", "Opening LinkedIn …"); });
    def("htb hackthebox", "my Hack The Box profile", function () { ext("https://app.hackthebox.com/profile/1283370", "Opening Hack The Box profile …"); });
    def("socials contact", "where to find me", function () {
        print("github    https://github.com/jordan01236\nlinkedin  https://www.linkedin.com/in/jordan01236\nhtb       https://app.hackthebox.com/profile/1283370\n\nType github, linkedin or htb to open one.");
    });

    def("echo", "print something", function (args, raw) {
        var s = raw.replace(/^\s*echo\s?/, "");
        s = s.replace(/^(["'])(.*)\1$/, "$2");
        s = s.replace(/\$USER/g, state.isRoot ? "root" : "jordan").replace(/\$HOME/g, state.isRoot ? "/root" : HOME)
            .replace(/\$SHELL/g, "/usr/bin/zsh").replace(/\$PWD/g, state.cwd);
        print(s);
    });

    def("date", "the time", function () { print(new Date().toString()); });
    def("hostname", "", function () { print("kali"); });
    def("id", "who you really are", function () {
        print(state.isRoot ? "uid=0(root) gid=0(root) groups=0(root)" : "uid=1000(jordan) gid=1000(jordan) groups=1000(jordan),27(sudo)");
    });
    def("uname", "kernel info", function (args) {
        print(args.join("").indexOf("a") !== -1 ? "Linux kali 6.11.2-kali-amd64 #1 SMP PREEMPT_DYNAMIC Kali x86_64 GNU/Linux" : "Linux");
    });
    def("uptime", "", function () {
        var s = Math.floor((Date.now() - bootTime) / 1000);
        print(" up " + Math.floor(s / 60) + " min " + (s % 60) + " sec,  1 user,  load average: 0.13, 0.37, 0.42");
    });
    def("history", "what you've typed", function () {
        print(state.history.map(function (h, i) { return ("    " + (i + 1)).slice(-4) + "  " + h; }).join("\n"));
    });
    def("which", "", function (args) {
        args.forEach(function (a) { print(commands[a] ? "/usr/bin/" + a : a + " not found"); });
    });
    def("man", "manual pages", function (args) {
        if (!args[0]) { print("What manual page do you want?\nFor example, try 'man sudo'."); return; }
        var c = commands[args[0]];
        print(c ? args[0].toUpperCase() + "(1)\n\nNAME\n    " + args[0] + " — " + (c.help || "does what it says") + "\n\nSEE ALSO\n    help(1)" : "No manual entry for " + args[0]);
    });
    def("touch mkdir", "", function (args, raw, name) {
        if (!args[0]) { print(name + ": missing operand"); return; }
        print(name + ": cannot create '" + args[0] + "': Read-only file system");
    });
    def("rm", "remove things (don't)", function (args) {
        var joined = args.join(" ");
        if (/-\w*r\w*f|-\w*f\w*r/.test(joined) && /(\s|^)(\/|\/\*|~|\*)(\s|$)/.test(joined)) {
            if (!state.isRoot) { print("rm: it is dangerous to operate recursively on '/'\nrm: also, you're not root."); return; }
            emit("glitch");
            printSlow(["rm: removing /bin …", "rm: removing /etc …", "rm: removing /home …", "rm: removing /usr …",
                "rm: removing the floor you're standing on …", "", "Just kidding. It's a static site. Everything is fine."], 320);
            return "async";
        }
        print(args.length ? "rm: cannot remove '" + args[args.length - 1] + "': Read-only file system" : "rm: missing operand");
    });
    def("vim vi nano emacs", "", function (args, raw, name) {
        print(name + ": no. You'd never get back out, and I'd have to reboot the room.");
    });
    def("python python3 node bash zsh sh", "", function (args, raw, name) {
        print(name + ": this shell is 100% artisanal JavaScript; no interpreters were harmed.");
    });
    def("apt apt-get", "", function () {
        print(state.isRoot ? "Reading package lists... Done\n0 upgraded, 0 newly installed, 0 to remove and 1337 not upgraded." : "E: Could not open lock file — are you root?");
    });
    def("ps", "", function () {
        print("    PID TTY          TIME CMD\n   1337 pts/0    00:00:00 zsh\n   1338 pts/0    00:00:00 room.js\n   1420 pts/0    00:00:00 ps");
    });
    def("top htop", "", function () {
        print("Tasks: 3 total, 1 running\n%Cpu(s):  4.2 us   MiB Mem: 31964 total\n\n    PID USER      %CPU  COMMAND\n   1338 jordan     3.9  room.js\n   1337 jordan     0.2  zsh\n      1 root       0.0  systemd\n\n(the side monitor has the fancy version)");
    });
    def("ifconfig ip", "network interfaces", function () {
        print("eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 10.10.14.7  netmask 255.255.254.0\ntun0: flags=4305<UP,POINTOPOINT,RUNNING>  mtu 1500\n        inet 10.10.14.7  (HTB VPN)");
    });
    def("ping", "ping a host", function (args) {
        var host = args.filter(function (a) { return a[0] !== "-"; })[0];
        if (!host) { print("ping: usage error: Destination address required"); return; }
        var lines = ["PING " + host + " 56(84) bytes of data."];
        var times = [];
        for (var i = 1; i <= 4; i++) {
            var t = (18 + Math.random() * 14).toFixed(1);
            times.push(parseFloat(t));
            lines.push("64 bytes from " + host + ": icmp_seq=" + i + " ttl=63 time=" + t + " ms");
        }
        lines.push("", "--- " + host + " ping statistics ---", "4 packets transmitted, 4 received, 0% packet loss",
            "rtt min/avg/max = " + Math.min.apply(null, times).toFixed(1) + "/" +
            (times.reduce(function (a, b) { return a + b; }) / 4).toFixed(1) + "/" + Math.max.apply(null, times).toFixed(1) + " ms");
        printSlow(lines, function (i) { return i <= 5 ? 420 : 30; });
        return "async";
    });
    def("nmap", "scan a host", function (args) {
        var host = args.filter(function (a) { return a[0] !== "-"; })[0] || "localhost";
        printSlow([
            "Starting Nmap 7.95 ( https://nmap.org )",
            "Nmap scan report for " + host,
            "Host is up (0.031s latency).",
            "Not shown: 996 closed tcp ports (reset)",
            "PORT     STATE SERVICE  VERSION",
            "22/tcp   open  ssh      OpenSSH 9.6p1",
            "80/tcp   open  http     nginx (hackwithjordan.com)",
            "443/tcp  open  https    GitHub Pages",
            "1337/tcp open  waste    a desk lamp, apparently  (try: lamp)",
            "",
            "Nmap done: 1 IP address (1 host up) scanned in 2.42 seconds"
        ], function (i) { return i < 4 ? 380 : 140; });
        return "async";
    });
    def("ssh", "", function (args) {
        var host = args[0] || "target";
        printSlow(["ssh: connecting to " + host + " …", "ssh: connect to host " + host.split("@").pop() + " port 22: Connection refused", "(it's a static site — there's nobody home)"], 600);
        return "async";
    });
    def("curl wget", "", function (args, raw, name) {
        print(args[0] ? name + ": (6) Could not resolve host: " + args[args.length - 1].replace(/^https?:\/\//, "").split("/")[0] : name + ": try '" + name + " --help'");
    });
    def("hack", "hack the planet", function () {
        emit("glitch");
        printSlow(["[*] enumerating …", "[*] found something juicy on port 1337", "[+] exploit sent", "[+] shell popped", "", "HACK THE PLANET"], 300);
        return "async";
    });
    def("fortune", "wisdom", function () {
        var f = [
            "Enumerate harder.",
            "It's always DNS. Unless it's a password in a config file.",
            "Try harder — but take a break first.",
            "The quieter you become, the more you are able to hear.",
            "If in doubt: sudo -l.",
            "There is no patch for human curiosity.",
            "Have you explained it to the rubber duck yet?"
        ];
        print(f[Math.floor(Math.random() * f.length)]);
    });
    def("cowsay", "", function (args) {
        var s = args.join(" ") || "moo";
        var bar = new Array(s.length + 3).join("-");
        print(" " + bar + "\n< " + s + " >\n " + bar + "\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||");
    });
    def("neofetch fastfetch", "system info", function () {
        var s = Math.floor((Date.now() - bootTime) / 1000);
        var info = [
            (state.isRoot ? "root" : "jordan") + "@kali",
            "-----------",
            "OS: Kali GNU/Linux Rolling x86_64",
            "Host: hackwithjordan.com",
            "Kernel: 6.11.2-kali-amd64",
            "Uptime: " + Math.floor(s / 60) + " min " + (s % 60) + " sec",
            "Shell: zsh (well, JavaScript)",
            "Terminal: a monitor rendered in Blender",
            "GPU: yours, actually",
            "Writeups: " + (state.posts.length || "plenty"),
            "Focus: pentesting, AD, HTB"
        ];
        var art = [
            "      ,.....        ",
            "   .,;;;;;;;;;,.    ",
            "  ;;;'      `;;;;.  ",
            " ;;'   ~$     `;;;  ",
            " ;;            ;;;  ",
            " `;;.        .;;;'  ",
            "   `;;;;,,,;;;;'    ",
            "      `'''''`       ",
            "                    ",
            "                    ",
            "                    "
        ];
        print(info.map(function (l, i) { return (art[i] || art[8]) + l; }).join("\n"));
    });

    // --- the room -------------------------------------------------------
    def("lamp light", "desk lamp: lamp [on|off]", function (args) {
        if (!emit("lamp", args[0] || "toggle")) print("lamp: there's no lamp in here (the 3D room didn't load).");
    });
    def("rgb theme", "LED colour: rgb <teal|violet|amber|pink|green|blue|#hex>", function (args) {
        if (!args[0]) { print("usage: rgb <teal|violet|amber|pink|green|blue|white|off|#rrggbb>"); return; }
        if (state.isRoot && args[0] !== "red") { print("rgb: root likes it red. 'exit' first."); return; }
        if (!emit("rgb", args[0])) print("rgb: no LEDs found (the 3D room didn't load).");
    });
    def("sit", "sit down at the desk", function () { if (!emit("sit")) print("You're already as seated as it gets."); });
    def("stand leave", "stand up from the desk", function () { if (!emit("stand")) print("You're already standing."); });
    def("reboot shutdown poweroff", "turn it off and on again", function () {
        if (!emit("reboot")) { print("reboot: nice try."); return; }
        container.innerHTML = "";
        printSlow(["[  OK  ] Stopped target Graphical Interface.", "[  OK  ] Reached target Reboot.", "", "", "kali login: jordan (automatic login)", ""], 420, function () {
            state.isRoot && dropRoot();
            displayCommands();
        });
        return "async";
    });
    def("duck quack", "", function () { print("🦆  quack. (Have you tried explaining the bug out loud?)"); });
    def("coffee", "", function () { print("☕  +10 focus, -1 hour of sleep."); });

    // ------------------------------------------------------------------
    // Execution
    // ------------------------------------------------------------------
    function execute(raw, nested) {
        var line = raw.trim();
        if (!line) return;
        // exact-match originals first so they can never be shadowed
        if (line === "sudo su") { becomeRoot(); return "root"; }
        var parts = line.split(/\s+/);
        var name = parts[0];
        var args = parts.slice(1);
        if (name.indexOf("./") === 0 || name[0] === "/") {
            var r = lookup(name);
            print(r.error ? "zsh: no such file or directory: " + name : "zsh: permission denied: " + name);
            return;
        }
        var cmd = commands[name.toLowerCase()];
        if (!cmd) {
            print("Command not found: " + line + "\nType 'help' for available commands.");
            return;
        }
        return cmd.fn(args, line, name.toLowerCase());
    }

    // ------------------------------------------------------------------
    // Completion
    // ------------------------------------------------------------------
    function complete(value) {
        var parts = value.split(/\s+/);
        var last = parts[parts.length - 1];
        var options;
        if (parts.length === 1) {
            options = Object.keys(commands).filter(function (c) { return c.indexOf(last) === 0 && c.length > 1; });
        } else {
            var slash = last.lastIndexOf("/");
            var base = slash === -1 ? "" : last.slice(0, slash + 1);
            var frag = slash === -1 ? last : last.slice(slash + 1);
            var r = lookup(base || ".");
            if (r.error || r.node.type !== "dir" || (r.node.rootOnly && !state.isRoot)) return value;
            options = Object.keys(r.node.children).filter(function (k) { return k.indexOf(frag) === 0; })
                .map(function (k) { return base + k + (r.node.children[k].type === "dir" ? "/" : ""); });
        }
        if (!options.length) return value;
        if (options.length === 1) {
            parts[parts.length - 1] = options[0];
            return parts.join(" ") + (options[0].slice(-1) === "/" ? "" : " ");
        }
        // longest common prefix, and show the candidates
        var prefix = options[0];
        options.forEach(function (o) { while (o.indexOf(prefix) !== 0) prefix = prefix.slice(0, -1); });
        print(options.slice(0, 40).join("  "), "dim");
        parts[parts.length - 1] = prefix || last;
        return parts.join(" ");
    }

    // ------------------------------------------------------------------
    // Prompt
    // ------------------------------------------------------------------
    function createPrompt() {
        var old = container.querySelector(".prompt-line");
        if (old) old.remove();

        var promptLine = document.createElement("div");
        promptLine.className = "prompt-line";

        var promptSpan = document.createElement("span");
        promptSpan.className = "prompt";
        promptSpan.textContent = promptText();
        promptSpan.style.color = color();
        promptLine.appendChild(promptSpan);

        var input = document.createElement("input");
        input.type = "text";
        input.className = "command-input";
        input.style.color = color();
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
        input.setAttribute("aria-label", "Terminal command");
        promptLine.appendChild(input);

        container.appendChild(promptLine);
        if (api.autoFocus) input.focus({ preventScroll: true });
        scrollDown();

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                var command = input.value.trim();
                var display = document.createElement("div");
                display.className = "command-display";
                display.textContent = promptText() + input.value;
                display.style.color = color();
                container.insertBefore(display, promptLine);
                promptLine.remove();

                var result;
                if (command) {
                    if (state.history[state.history.length - 1] !== command) state.history.push(command);
                    state.histIndex = -1;
                    result = execute(command);
                }
                if (result !== "navigate" && result !== "async") createPrompt();
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                if (!state.history.length) return;
                state.histIndex = state.histIndex === -1 ? state.history.length - 1 : Math.max(0, state.histIndex - 1);
                input.value = state.history[state.histIndex];
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                if (state.histIndex === -1) return;
                state.histIndex++;
                if (state.histIndex >= state.history.length) { state.histIndex = -1; input.value = ""; }
                else input.value = state.history[state.histIndex];
            } else if (event.key === "Tab") {
                event.preventDefault();
                input.value = complete(input.value);
            } else if (event.key === "l" && event.ctrlKey) {
                event.preventDefault();
                var keep = input.value;
                container.innerHTML = "";
                displayCommands();
                createPrompt();
                container.querySelector(".command-input").value = keep;
            } else if (event.key === "c" && event.ctrlKey && !window.getSelection().toString()) {
                event.preventDefault();
                var d = document.createElement("div");
                d.className = "command-display";
                d.textContent = promptText() + input.value + "^C";
                d.style.color = color();
                container.insertBefore(d, promptLine);
                input.value = "";
                scrollDown();
            }
        });
    }

    container.addEventListener("click", function () {
        if (window.getSelection().toString()) return;
        var input = container.querySelector(".command-input");
        if (input) input.focus({ preventScroll: true });
    });

    // ------------------------------------------------------------------
    // Public hooks for the room
    // ------------------------------------------------------------------
    var api = window.JTerm = {
        autoFocus: true,
        on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
        print: print,
        run: function (cmd) {
            var r = execute(cmd);
            if (r !== "navigate" && r !== "async") createPrompt();
        },
        focus: function () {
            var input = container.querySelector(".command-input");
            if (input) input.focus({ preventScroll: true });
        },
        blur: function () {
            var input = container.querySelector(".command-input");
            if (input) input.blur();
        },
        isRoot: function () { return state.isRoot; }
    };

    function start() {
        loadPosts();
        displayCommands();
        createPrompt();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
