/*
 * Kali-style tools for the desktop (assets/js/desktop.js).
 *
 * Zenmap, Burp, Wireshark and the command-line tools are scripted demos with
 * canned data for a pretend lab box at 10.10.11.42. John the Ripper and
 * CyberChef do real work in the browser: John runs a dictionary attack over a
 * small rockyou excerpt (SHA-1/256 via WebCrypto, MD5 via a table generated
 * at build time), and CyberChef's operations are real transforms.
 */
(function () {
    "use strict";

    var term = window.JTerm;
    var D = term && term.desktop;
    if (!D) return;
    var ui = D.ui, icon = ui.icon, el = ui.el, esc = ui.esc, toast = ui.toast;
    var LAB = "10.10.11.42";

    // menu entries that run a command in the terminal
    [["gobuster", "gobuster", "dir", "01 - Information Gathering", "gobuster dir -u http://" + LAB + " -w /usr/share/wordlists/dirb/common.txt"],
        ["searchsploit", "searchsploit", "search", "08 - Exploitation Tools", "searchsploit samba"],
        ["msfconsole", "metasploit framework", "skull", "08 - Exploitation Tools", "msfconsole"],
        ["sqlmap", "sqlmap", "db", "03 - Web Application Analysis", "sqlmap -u \"http://" + LAB + "/api/user?id=1\" --batch --dump"],
        ["hydra", "hydra", "key", "05 - Password Attacks", "hydra -l jordan -P /usr/share/wordlists/rockyou.txt ssh://" + LAB]
    ].forEach(function (t) {
        D.app({ id: "cli-" + t[0], title: t[1], menu: t[1], icon: t[2], cat: t[3], run: t[4], kind: "terminal" });
    });

    function tabs(w, names) {
        var bar = el("div", "kt-tabs");
        var panes = {};
        names.forEach(function (n, i) {
            var b = el("button", i ? "" : "on", esc(n));
            b.type = "button";
            b.addEventListener("click", function () { show(n); });
            bar.appendChild(b);
            panes[n] = el("div", "kt-pane");
            panes[n].hidden = i > 0;
        });
        function show(n) {
            bar.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.textContent === n); });
            Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== n; });
        }
        w.body.appendChild(bar);
        names.forEach(function (n) { w.body.appendChild(panes[n]); });
        return { panes: panes, show: show };
    }

    // ------------------------------------------------------------------
    // Zenmap
    // ------------------------------------------------------------------
    var HOSTS = {
        "10.10.11.42": { name: "target.htb", os: "Linux 5.x", ports: [
            [22, "ssh", "OpenSSH 8.9p1 Ubuntu 3ubuntu0.6"], [80, "http", "nginx 1.18.0 (Ubuntu)"],
            [139, "netbios-ssn", "Samba smbd 4.6.2"], [445, "netbios-ssn", "Samba smbd 4.6.2"], [3306, "mysql", "MySQL 8.0.36"]] },
        "127.0.0.1": { name: "localhost", os: "Linux 6.11 (kali)", ports: [
            [22, "ssh", "OpenSSH 9.6p1 Debian"], [80, "http", "nginx (hackwithjordan.com)"], [1337, "waste", "a desk lamp, apparently"]] }
    };
    function resolve(t) {
        t = String(t || "").trim().toLowerCase();
        if (t === "target.htb") return LAB;
        if (t === "localhost") return "127.0.0.1";
        return t;
    }
    D.app({
        id: "zenmap", title: "Zenmap", menu: "nmap (Zenmap)", icon: "radar", cat: "01 - Information Gathering", wf: 0.7, hf: 0.74,
        open: function (w, target) {
            w.body.classList.add("kt", "kt-zenmap");
            w.body.innerHTML =
                '<form class="kt-row"><label>Target <input name="t" spellcheck="false" autocomplete="off"></label>' +
                '<label>Profile <select name="p"><option value="-T4 -F">Quick scan</option><option value="-sC -sV -T4">Default scripts + versions</option><option value="-sV -p-">All ports + versions</option><option value="-sn">Ping scan</option></select></label>' +
                '<button class="kt-go" type="submit">Scan</button></form>' +
                '<div class="kt-cmd"></div>';
            var form = w.body.querySelector("form"), cmd = w.body.querySelector(".kt-cmd");
            var t = tabs(w, ["Nmap Output", "Ports / Hosts", "Host Details"]);
            var out = el("pre", "kt-out");
            t.panes["Nmap Output"].appendChild(out);
            form.t.value = target || LAB;
            function upd() { cmd.textContent = "nmap " + form.p.value + " " + form.t.value; }
            form.t.addEventListener("input", upd);
            form.p.addEventListener("change", upd);
            upd();
            var timer = 0;
            form.addEventListener("submit", function (e) {
                e.preventDefault();
                clearTimeout(timer);
                var ip = resolve(form.t.value), host = HOSTS[ip], prof = form.p.value;
                var lines = ["Starting Nmap 7.95 ( https://nmap.org )"];
                if (!host) {
                    lines.push("Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn",
                        "Nmap done: 1 IP address (0 hosts up) scanned in 3.04 seconds", "", "(This box is airgapped. Try " + LAB + " / target.htb or localhost.)");
                } else {
                    lines.push("Nmap scan report for " + host.name + " (" + ip + ")", "Host is up (0.031s latency).");
                    if (prof !== "-sn") {
                        var ver = prof.indexOf("V") !== -1;
                        lines.push("Not shown: " + ((prof.indexOf("-p-") !== -1 ? 65535 : 100) - host.ports.length) + " closed tcp ports (reset)");
                        lines.push(ver ? "PORT      STATE SERVICE     VERSION" : "PORT      STATE SERVICE");
                        host.ports.forEach(function (p) {
                            var a = (p[0] + "/tcp").padEnd(10) + "open  " + p[1].padEnd(12);
                            lines.push(ver ? a + p[2] : a);
                            if (prof.indexOf("-sC") !== -1 && p[0] === 80) lines.push("|_http-title: Login — internal portal", "| http-git:", "|   " + ip + ":80/.git/", "|_    Git repository found!");
                            if (prof.indexOf("-sC") !== -1 && p[0] === 445) lines.push("| smb2-security-mode:", "|_  Message signing enabled but not required");
                        });
                        if (ver) lines.push("Service Info: OS: " + host.os);
                    }
                    lines.push("", "Nmap done: 1 IP address (1 host up) scanned in " + (prof.indexOf("-p-") !== -1 ? "41.87" : "7.12") + " seconds");
                }
                out.textContent = "";
                t.show("Nmap Output");
                var i = 0;
                (function next() {
                    if (i >= lines.length) { fill(ip, host, prof); return; }
                    out.textContent += lines[i++] + "\n";
                    out.scrollTop = out.scrollHeight;
                    timer = setTimeout(next, i < 3 ? 380 : 110);
                })();
            });
            function fill(ip, host, prof) {
                var pp = t.panes["Ports / Hosts"], hd = t.panes["Host Details"];
                if (!host) { pp.innerHTML = hd.innerHTML = '<p class="kt-empty">No hosts up.</p>'; return; }
                pp.innerHTML = '<table class="kt-table"><thead><tr><th>Port</th><th>Protocol</th><th>State</th><th>Service</th><th>Version</th></tr></thead><tbody>' +
                    (prof === "-sn" ? "" : host.ports.map(function (p) { return "<tr><td>" + p[0] + "</td><td>tcp</td><td class=\"ok\">open</td><td>" + esc(p[1]) + "</td><td>" + esc(p[2]) + "</td></tr>"; }).join("")) + "</tbody></table>";
                hd.innerHTML = '<dl class="kt-dl"><dt>Host</dt><dd>' + esc(host.name) + " (" + ip + ")</dd><dt>Status</dt><dd>up</dd><dt>Open ports</dt><dd>" + (prof === "-sn" ? "—" : host.ports.length) +
                    "</dd><dt>OS guess</dt><dd>" + esc(host.os) + "</dd><dt>Next steps</dt><dd>" + (ip === LAB ? "Web on 80 with an exposed .git → dump it. SMB signing not required. Try <code>gobuster</code> and <code>sqlmap</code> from the menu." : "It's this very box.") + "</dd></dl>";
            }
            setTimeout(function () { form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); }, 200);
        }
    });

    // ------------------------------------------------------------------
    // Burp-style proxy
    // ------------------------------------------------------------------
    var HTTP = [
        ["GET", "/", 200, "GET / HTTP/1.1\nHost: target.htb\nUser-Agent: Mozilla/5.0 (X11; Linux x86_64)\nAccept: text/html", "HTTP/1.1 200 OK\nServer: nginx/1.18.0\nContent-Type: text/html\n\n<h1>Internal portal</h1>\n<a href=\"/login\">Sign in</a>"],
        ["GET", "/login", 200, "GET /login HTTP/1.1\nHost: target.htb", "HTTP/1.1 200 OK\nContent-Type: text/html\n\n<form method=\"post\" action=\"/login\">\n  <input name=\"username\"> <input name=\"password\" type=\"password\">\n</form>"],
        ["POST", "/login", 401, "POST /login HTTP/1.1\nHost: target.htb\nContent-Type: application/x-www-form-urlencoded\nContent-Length: 33\n\nusername=admin&password=admin123", "HTTP/1.1 401 Unauthorized\nContent-Type: text/html\n\nInvalid username or password."],
        ["GET", "/api/user?id=2", 200, "GET /api/user?id=2 HTTP/1.1\nHost: target.htb\nCookie: session=eyJ1c2VyIjoiam9yZGFuIiwicm9sZSI6InVzZXIifQ", "HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\"id\":2,\"username\":\"jordan\",\"role\":\"user\"}"]
    ];
    function burpRespond(req) {
        var body = req.split(/\n\s*\n/)[1] || "";
        var first = req.split("\n")[0] || "";
        var m = /^(GET|POST)\s+(\S+)/.exec(first);
        if (!m) return "HTTP/1.1 400 Bad Request\n\nCould not parse the request line.";
        var path = m[2];
        if (m[1] === "POST" && /^\/login/.test(path)) {
            var u = decodeURIComponent(((/username=([^&]*)/.exec(body) || [])[1] || "").replace(/\+/g, " "));
            var p = decodeURIComponent(((/password=([^&]*)/.exec(body) || [])[1] || "").replace(/\+/g, " "));
            if (/'\s*(or|\|\|)\s*('?1'?\s*=\s*'?1|true)|'\s*--|'\s*#/i.test(u + " " + p))
                return "HTTP/1.1 302 Found\nLocation: /admin\nSet-Cookie: session=eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ\n\n<!-- SQL injection: the login query was\n     SELECT * FROM users WHERE username='" + u + "' AND password='" + p + "'\n     and the payload made it always true. Logged in as admin. -->";
            if (u === "jordan" && p === "letmein") return "HTTP/1.1 302 Found\nLocation: /dashboard\nSet-Cookie: session=eyJ1c2VyIjoiam9yZGFuIiwicm9sZSI6InVzZXIifQ\n\n(valid credentials)";
            return "HTTP/1.1 401 Unauthorized\nContent-Type: text/html\n\nInvalid username or password.\n\n<!-- hint: try a classic  ' OR 1=1--  in the username -->";
        }
        var id = /^\/api\/user\?id=(\d+)/.exec(path);
        if (id) {
            var users = { 1: "{\"id\":1,\"username\":\"admin\",\"role\":\"admin\",\"api_key\":\"HWJ{1d0r_15_57ill_4_7hing}\"}", 2: "{\"id\":2,\"username\":\"jordan\",\"role\":\"user\"}" };
            return users[id[1]] ? "HTTP/1.1 200 OK\nContent-Type: application/json\n\n" + users[id[1]] + (id[1] === "1" ? "\n\n(IDOR: nothing checks that your session owns id=1)" : "") : "HTTP/1.1 404 Not Found\nContent-Type: application/json\n\n{\"error\":\"no such user\"}";
        }
        var hit = HTTP.filter(function (h) { return h[0] === m[1] && h[1] === path; })[0];
        return hit ? hit[4] : "HTTP/1.1 404 Not Found\nServer: nginx/1.18.0\n\n<h1>404 Not Found</h1>";
    }
    D.app({
        id: "burp", title: "Burp Suite Community (demo)", menu: "Burp Suite", icon: "proxy", cat: "03 - Web Application Analysis", wf: 0.78, hf: 0.8,
        open: function (w) {
            w.body.classList.add("kt", "kt-burp");
            var t = tabs(w, ["Proxy › HTTP history", "Repeater"]);
            var hp = t.panes["Proxy › HTTP history"], rp = t.panes["Repeater"];
            hp.innerHTML = '<table class="kt-table kt-click"><thead><tr><th>#</th><th>Host</th><th>Method</th><th>URL</th><th>Status</th></tr></thead><tbody></tbody></table>' +
                '<div class="kt-split"><div><h4>Request</h4><pre class="kt-out req"></pre></div><div><h4>Response</h4><pre class="kt-out res"></pre></div></div>' +
                '<div class="kt-row"><button type="button" class="kt-go send">Send to Repeater</button></div>';
            var tb = hp.querySelector("tbody"), cur = 0;
            HTTP.forEach(function (h, i) {
                var tr = el("tr", "", "<td>" + (i + 1) + "</td><td>http://target.htb</td><td>" + h[0] + "</td><td>" + esc(h[1]) + "</td><td>" + h[2] + "</td>");
                tr.addEventListener("click", function () { sel(i); });
                tb.appendChild(tr);
            });
            function sel(i) {
                cur = i;
                tb.querySelectorAll("tr").forEach(function (r, k) { r.classList.toggle("sel", k === i); });
                hp.querySelector(".req").textContent = HTTP[i][3];
                hp.querySelector(".res").textContent = HTTP[i][4];
            }
            sel(2);
            rp.innerHTML = '<div class="kt-row"><button type="button" class="kt-go">Send</button><span class="kt-hint">Edit the request, then Send. Try SQL injection in the login, or another user id on /api/user.</span></div>' +
                '<div class="kt-split"><div><h4>Request</h4><textarea class="kt-out" spellcheck="false"></textarea></div><div><h4>Response</h4><pre class="kt-out res"></pre></div></div>';
            var ta = rp.querySelector("textarea");
            hp.querySelector(".send").addEventListener("click", function () { ta.value = HTTP[cur][3]; rp.querySelector(".res").textContent = ""; t.show("Repeater"); });
            rp.querySelector(".kt-go").addEventListener("click", function () {
                var res = rp.querySelector(".res");
                res.textContent = "…";
                setTimeout(function () { res.textContent = burpRespond(ta.value.replace(/\r/g, "")); }, 250);
            });
            ta.value = HTTP[2][3];
        }
    });

    // ------------------------------------------------------------------
    // Wireshark
    // ------------------------------------------------------------------
    var C = "10.10.14.7", S = LAB;
    var PK = [
        [0.000, "Kali_3f:21:aa", "Broadcast", "ARP", "Who has 10.10.14.1? Tell " + C],
        [0.004, "10.10.14.1", C, "ARP", "10.10.14.1 is at 00:50:56:b9:8e:01"],
        [0.120, C, "10.10.14.1", "DNS", "Standard query 0x4a1f A target.htb"],
        [0.151, "10.10.14.1", C, "DNS", "Standard query response 0x4a1f A target.htb A " + S],
        [0.203, C, S, "TCP", "51522 → 21 [SYN] Seq=0 Win=64240"],
        [0.234, S, C, "TCP", "21 → 51522 [SYN, ACK] Seq=0 Ack=1"],
        [0.235, C, S, "TCP", "51522 → 21 [ACK] Seq=1 Ack=1"],
        [0.270, S, C, "FTP", "Response: 220 (vsFTPd 3.0.5)", "ftp"],
        [1.902, C, S, "FTP", "Request: USER svc_backup", "ftp"],
        [1.933, S, C, "FTP", "Response: 331 Please specify the password.", "ftp"],
        [3.448, C, S, "FTP", "Request: PASS Summer2024!", "ftp"],
        [3.490, S, C, "FTP", "Response: 230 Login successful.", "ftp"],
        [5.010, C, S, "TCP", "51530 → 80 [SYN] Seq=0 Win=64240"],
        [5.041, S, C, "TCP", "80 → 51530 [SYN, ACK] Seq=0 Ack=1"],
        [5.042, C, S, "HTTP", "GET /admin HTTP/1.1  (Authorization: Basic)", "http"],
        [5.081, S, C, "HTTP", "HTTP/1.1 200 OK  (text/html)", "http"]
    ];
    var STREAMS = {
        ftp: "220 (vsFTPd 3.0.5)\nUSER svc_backup\n331 Please specify the password.\nPASS Summer2024!\n230 Login successful.\n\nFTP sends credentials in cleartext. That password's SHA-1 is in John's sample list.",
        http: "GET /admin HTTP/1.1\nHost: target.htb\nAuthorization: Basic am9yZGFuOmxldG1laW4=\n\nHTTP/1.1 200 OK\nContent-Type: text/html\n\n<h1>Admin</h1>\n\nBasic auth is just base64 — paste am9yZGFuOmxldG1laW4= into CyberChef → From Base64."
    };
    D.app({
        id: "wireshark", title: "Wireshark · capture.pcapng (demo)", menu: "Wireshark", icon: "fin", cat: "09 - Sniffing & Spoofing", wf: 0.8, hf: 0.82,
        open: function (w) {
            w.body.classList.add("kt", "kt-wire");
            w.body.innerHTML = '<form class="kt-row"><input class="flt" placeholder="Apply a display filter … (e.g. ftp, http, dns, tcp, ip.addr == ' + S + ')" spellcheck="false"><button class="kt-go" type="submit">Apply</button><button type="button" class="kt-go follow" disabled>Follow stream</button></form>' +
                '<div class="kt-scroll"><table class="kt-table kt-click"><thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Info</th></tr></thead><tbody></tbody></table></div>' +
                '<pre class="kt-out kt-detail">Select a packet. Tip: filter on "ftp" and look closely.</pre>';
            var tb = w.body.querySelector("tbody"), det = w.body.querySelector(".kt-detail"), fol = w.body.querySelector(".follow");
            var curStream = null;
            function match(p, f) {
                if (!f) return true;
                var ip = /ip\.addr\s*==\s*([\d.]+)/.exec(f);
                if (ip) return p[1] === ip[1] || p[2] === ip[1];
                var proto = f.toLowerCase();
                if (proto === "tcp") return ["TCP", "FTP", "HTTP"].indexOf(p[3]) !== -1;
                return p[3].toLowerCase() === proto;
            }
            function render(f) {
                tb.innerHTML = "";
                PK.forEach(function (p, i) {
                    if (!match(p, f)) return;
                    var tr = el("tr", "proto-" + p[3].toLowerCase(), "<td>" + (i + 1) + "</td><td>" + p[0].toFixed(6) + "</td><td>" + p[1] + "</td><td>" + p[2] + "</td><td>" + p[3] + "</td><td>" + esc(p[4]) + "</td>");
                    tr.addEventListener("click", function () {
                        tb.querySelectorAll(".sel").forEach(function (x) { x.classList.remove("sel"); });
                        tr.classList.add("sel");
                        curStream = p[5] || null;
                        fol.disabled = !curStream;
                        det.textContent = "Frame " + (i + 1) + ": 74 bytes on wire\nEthernet II\nInternet Protocol Version 4, Src: " + p[1] + ", Dst: " + p[2] +
                            (p[3] === "ARP" || p[3] === "DNS" ? "" : "\nTransmission Control Protocol") + "\n" + p[3] + ": " + p[4];
                    });
                    tb.appendChild(tr);
                });
                if (!tb.children.length) det.textContent = "No packets match the filter \"" + f + "\".";
            }
            w.body.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); render(w.body.querySelector(".flt").value.trim()); });
            fol.addEventListener("click", function () { if (curStream) det.textContent = "Follow TCP Stream\n\n" + STREAMS[curStream]; });
            render("");
        }
    });

    // ------------------------------------------------------------------
    // John the Ripper: a real dictionary attack, small wordlist
    // ------------------------------------------------------------------
    var WL = {"w": ["123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111", "1234567", "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein", "696969", "shadow", "master", "666666", "qwertyuiop", "123321", "mustang", "1234567890", "michael", "654321", "superman", "1qaz2wsx", "7777777", "121212", "000000", "qazwsx", "123qwe", "killer", "trustno1", "jordan", "jennifer", "zxcvbnm", "asdfgh", "hunter", "buster", "soccer", "harley", "batman", "andrew", "tigger", "sunshine", "iloveyou", "2000", "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars", "112233", "george", "computer", "michelle", "jessica", "pepper", "1111", "zxcvbn", "555555", "11111111", "131313", "freedom", "777777", "pass", "maggie", "159753", "aaaaaa", "ginger", "princess", "joshua", "cheese", "amanda", "summer", "love", "ashley", "nicole", "chelsea", "biteme", "matthew", "access", "yankees", "987654321", "dallas", "austin", "thunder", "taylor", "matrix", "P@ssw0rd!", "Summer2024!", "hackthebox"], "m": null};
    WL.m = ["e10adc3949ba", "5f4dcc3b5aa7", "25d55ad283aa", "d8578edf8458", "25f9e794323b", "827ccb0eea8a", "81dc9bdb52d0", "96e79218965e", "fcea920f7412", "8621ffdbc569", "4297f44b1395", "276f8db0b86e", "e99a18c428cb", "37b4e2d82900", "d0763edaa9d9", "0d107d09f5bb", "7d0710824ff1", "3bf1114a986b", "eb0a19179762", "f379eaf3c831", "6eea9b7ef191", "c8837b23ff8a", "bee783ee2974", "e807f1fcf82d", "0acf4539a14b", "c33367701511", "84d961568a65", "1c63129ae9db", "dc0fa7df3d07", "93279e3308bd", "670b14728ad9", "76419c58730d", "46f94c8de14f", "b36d331451a6", "5fcfd41e547a", "d16d377af76c", "1660fe5c81c4", "02c75fb22c75", "a152e8417839", "6b1b36cbb04b", "d9b23ebbf9b4", "da443a0ad979", "ef4cdd311779", "ec0e2603172c", "d914e3ecf6cc", "f78f2477e949", "0571749e2ac3", "f25a2fc72690", "08f90c1a4171", "bf779e0933a8", "684c851af599", "ef6e65efc188", "df0349ce110b", "ad9269492361", "aa47f8215c6f", "5badcaf789d3", "d09707147577", "9b306ab04ef5", "df53ca268240", "2345f10bb948", "aae039d6aa23", "b3f952d5d9ad", "b59c67bf196a", "b427ebd39c84", "5b1b68a9abf4", "1bbd88646082", "e04755387e5b", "d5aa1729c8c2", "f63f4fbc9f8c", "1a1dc91c9073", "1d3d37667a8d", "558341344316", "0b4e7a0e5fe8", "6f4ec514eee8", "8afa847f50a7", "d1133275ee21", "fea0f1f6fede", "620980495222", "6b1628b016df", "b5c0b187fe30", "adff44c5102f", "fc63f87c08d5", "91cb315a6405", "5ef64bad8f9d", "e6a5ba0842a5", "9df3b01c60df", "1d10ca7f8fe2", "6ebe76c9fb41", "09f8316e2964", "229979fce517", "5c7686c0284e", "7d8bc5f1a8d3", "21b72c0b7adc", "8a24367a1f46", "f065d609e559", "3af5fc3e07f3"];
    var SAMPLES = [
        ["jordan (webapp, from sqlmap)", "0d107d09f5bbe40cade3de5c71e9e9b7"],
        ["admin (webapp, from sqlmap)", "9cc2ae8a1ba7a93da39b46fc1019c481"],
        ["svc_backup (config file)", "7e8b0a3433f1210a9699d85420e363a1b162ecac"],
        ["api token salt (backup.sql)", "d7d4f76b36ef34da8ddecab8598a62fc3ef2fc55c534bfd7cf001032c438a3a9"]
    ];
    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
    function hashWord(algo, word) {
        if (algo === "Raw-MD5") return Promise.resolve(WL.m[WL.w.indexOf(word)]);
        return crypto.subtle.digest(algo === "Raw-SHA1" ? "SHA-1" : "SHA-256", new TextEncoder().encode(word)).then(hex);
    }
    D.app({
        id: "john", title: "John the Ripper", menu: "John the Ripper", icon: "key", cat: "05 - Password Attacks", wf: 0.66, hf: 0.7,
        open: function (w) {
            w.body.classList.add("kt", "kt-john");
            w.body.innerHTML = '<form class="kt-row"><label>Hash <input class="h" spellcheck="false" autocomplete="off" placeholder="paste an MD5, SHA-1 or SHA-256 hash"></label><button class="kt-go" type="submit">Crack</button></form>' +
                '<div class="kt-row kt-samples"><span class="kt-hint">Loot:</span></div>' +
                '<div class="kt-row"><span class="kt-hint">Wordlist: rockyou.txt (offline excerpt, ' + WL.w.length + ' words) · runs in your browser</span></div>' +
                '<div class="kt-bar"><i></i></div><pre class="kt-out"></pre>';
            var inp = w.body.querySelector(".h"), out = w.body.querySelector("pre"), bar = w.body.querySelector(".kt-bar i");
            var sm = w.body.querySelector(".kt-samples");
            SAMPLES.forEach(function (s) {
                var b = el("button", "kt-chip", esc(s[0]));
                b.type = "button";
                b.addEventListener("click", function () { inp.value = s[1]; });
                sm.appendChild(b);
            });
            var run = 0;
            w.body.querySelector("form").addEventListener("submit", function (e) {
                e.preventDefault();
                var h = inp.value.trim().toLowerCase(), id = ++run;
                var algo = /^[0-9a-f]{32}$/.test(h) ? "Raw-MD5" : /^[0-9a-f]{40}$/.test(h) ? "Raw-SHA1" : /^[0-9a-f]{64}$/.test(h) ? "Raw-SHA256" : null;
                if (/^\$[0-9a-z]+\$/.test(h)) { out.textContent = "That's a salted crypt hash (e.g. sha512crypt). Real John handles it, but it's far too slow for a browser demo."; return; }
                if (!algo) { out.textContent = "No password hashes loaded (see FAQ)\n\nPaste a hex MD5 (32), SHA-1 (40) or SHA-256 (64) hash, or pick one of the samples."; return; }
                if (algo !== "Raw-MD5" && !(window.crypto && crypto.subtle)) { out.textContent = "This browser can't hash here (WebCrypto needs https or localhost)."; return; }
                out.textContent = "$ john --format=" + algo + " --wordlist=rockyou.txt hash.txt\nUsing default input encoding: UTF-8\nLoaded 1 password hash (" + algo + " [" + algo.replace("Raw-", "") + " 256/256 AVX2])\nPress 'q' or Ctrl-C to abort, almost any other key for status\n";
                var i = 0, t0 = performance.now();
                (function step() {
                    if (id !== run) return;
                    if (i >= WL.w.length) {
                        bar.style.width = "100%";
                        out.textContent += "0g 0:00:00:0" + ((performance.now() - t0) / 1000).toFixed(0) + " DONE — Session completed, no password found.\n\nNot in this little wordlist. A real run would try all 14,344,391 rockyou entries, then rules.";
                        return;
                    }
                    var word = WL.w[i];
                    hashWord(algo, word).then(function (d) {
                        if (id !== run) return;
                        bar.style.width = Math.round(100 * (i + 1) / WL.w.length) + "%";
                        if (d && (algo === "Raw-MD5" ? h.indexOf(d) === 0 : d === h)) {
                            out.textContent += word + "             (?)\n1g 0:00:00:0" + ((performance.now() - t0) / 1000).toFixed(0) + " DONE (" + (i + 1) + "/" + WL.w.length + ") Session completed.\n\n$ john --show hash.txt\n?:" + word + "\n\n1 password hash cracked, 0 left";
                            return;
                        }
                        i++;
                        setTimeout(step, 12);
                    });
                })();
            });
        }
    });

    // ------------------------------------------------------------------
    // CyberChef-lite: real transforms
    // ------------------------------------------------------------------
    function b2s(bytes) { var s = ""; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return s; }
    function utf8(s) { return new TextEncoder().encode(s); }
    function fromUtf8(bytes) { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
    var OPS = {
        "To Base64": function (s) { return btoa(b2s(utf8(s))); },
        "From Base64": function (s) { var bin = atob(s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")); return fromUtf8(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); })); },
        "To Hex": function (s) { return Array.prototype.map.call(utf8(s), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(" "); },
        "From Hex": function (s) { var h = s.replace(/[^0-9a-f]/gi, ""); var a = []; for (var i = 0; i + 1 < h.length; i += 2) a.push(parseInt(h.substr(i, 2), 16)); return fromUtf8(new Uint8Array(a)); },
        "URL Encode": function (s) { return encodeURIComponent(s); },
        "URL Decode": function (s) { return decodeURIComponent(s.replace(/\+/g, " ")); },
        "ROT13": function (s) { return s.replace(/[a-z]/gi, function (c) { var b = c <= "Z" ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); }); },
        "Reverse": function (s) { return Array.from(s).reverse().join(""); },
        "XOR (key 'hwj')": function (s) { var k = utf8("hwj"), b = utf8(s); return Array.prototype.map.call(b, function (x, i) { return ("0" + (x ^ k[i % k.length]).toString(16)).slice(-2); }).join(""); },
        "JWT Decode": function (s) {
            var p = s.trim().split(".");
            if (p.length < 2) throw new Error("not a JWT");
            return p.slice(0, 2).map(function (x) { return JSON.stringify(JSON.parse(OPS["From Base64"](x)), null, 2); }).join("\n");
        },
        "SHA-256": "async"
    };
    D.app({
        id: "cyberchef", title: "CyberChef (lite)", menu: "CyberChef", icon: "chef", cat: "Utilities", wf: 0.72, hf: 0.72,
        open: function (w) {
            w.body.classList.add("kt", "kt-chef");
            w.body.innerHTML = '<div class="kt-chef-grid"><div class="ops"><h4>Operations</h4></div><div class="recipe"><h4>Recipe <button type="button" class="clr">clear</button></h4><ol></ol><p class="kt-hint">Click an operation to add it; click a step to remove it.</p></div>' +
                '<div class="io"><h4>Input</h4><textarea spellcheck="false">am9yZGFuOmxldG1laW4=</textarea><h4>Output</h4><pre class="kt-out"></pre></div></div>';
            var opsEl = w.body.querySelector(".ops"), ol = w.body.querySelector("ol"), ta = w.body.querySelector("textarea"), out = w.body.querySelector("pre");
            var recipe = ["From Base64"];
            Object.keys(OPS).forEach(function (n) {
                var b = el("button", "kt-chip", esc(n));
                b.type = "button";
                b.addEventListener("click", function () { recipe.push(n); draw(); });
                opsEl.appendChild(b);
            });
            w.body.querySelector(".clr").addEventListener("click", function () { recipe = []; draw(); });
            function draw() {
                ol.innerHTML = "";
                recipe.forEach(function (n, i) {
                    var li = el("li", "", esc(n));
                    li.addEventListener("click", function () { recipe.splice(i, 1); draw(); });
                    ol.appendChild(li);
                });
                bake();
            }
            var bakeId = 0;
            function bake() {
                var id = ++bakeId;
                var p = Promise.resolve(ta.value);
                recipe.forEach(function (n) {
                    p = p.then(function (s) {
                        if (OPS[n] === "async") {
                            if (!(window.crypto && crypto.subtle)) throw new Error("SHA-256 needs https or localhost");
                            return crypto.subtle.digest("SHA-256", utf8(s)).then(hex);
                        }
                        return OPS[n](s);
                    });
                });
                p.then(function (r) { if (id === bakeId) { out.textContent = r; out.classList.remove("err"); } },
                    function (e) { if (id === bakeId) { out.textContent = "Error: " + (e.message || e); out.classList.add("err"); } });
            }
            ta.addEventListener("input", bake);
            draw();
        }
    });

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------
    var store = {
        get: function (k, d) { try { var v = localStorage.getItem("hwj." + k); return v === null ? d : v; } catch (e) { return d; } },
        set: function (k, v) { try { localStorage.setItem("hwj." + k, v); } catch (e) { } }
    };
    var desk = document.getElementById("desktop");
    var tbox = document.getElementById("terminal-container");
    var WALLS = { grid: "Grid", aurora: "Aurora", plain: "Plain" };
    var SIZES = { small: 0.9, normal: 1, large: 1.15 };
    function applyWall(k) { Object.keys(WALLS).forEach(function (w) { desk.classList.toggle("wp-" + w, w === k); }); }
    function applySize(k) { tbox.style.fontSize = (SIZES[k] || 1) + "em"; }
    applyWall(store.get("wall", "grid"));
    applySize(store.get("tsize", "normal"));

    var SWATCH = { teal: "#5eead4", violet: "#7c8cf8", pink: "#ff5ca8", amber: "#ffb040", green: "#50fa7b", blue: "#4696ff", white: "#ebf0ff" };
    D.app({
        id: "settings", title: "Settings", menu: "Settings", icon: "gear", cat: "Accessories", single: true, wf: 0.5, hf: 0.66,
        open: function (w) {
            w.body.classList.add("kt", "kt-settings");
            var hasRoom = typeof term.lampOn === "function";
            w.body.innerHTML =
                '<section><h4>Accent colour</h4><div class="kt-row sw"></div>' +
                '<p class="kt-hint">Drives the LEDs, the neon sign and this desktop. Same as <code>rgb &lt;colour&gt;</code> in the terminal.</p></section>' +
                (hasRoom ? '<section><h4>Desk lamp</h4><div class="kt-row"><label class="tg"><input type="checkbox" class="lamp"> Lamp on</label></div></section>' : '') +
                '<section><h4>Wallpaper</h4><div class="kt-row wp"></div></section>' +
                '<section><h4>Terminal text size</h4><div class="kt-row ts"></div></section>' +
                '<section><h4>About this machine</h4><dl class="kt-dl">' +
                '<dt>Host</dt><dd>jordan@kali (a Kali-style desktop, not the real thing)</dd>' +
                '<dt>Runs</dt><dd>entirely in your browser — no network, nothing leaves this tab</dd>' +
                '<dt>Room</dt><dd>modelled and rendered in Blender, relit live in WebGL</dd>' +
                '<dt>Source</dt><dd>github.com/jordan01236/jordan01236.github.io</dd></dl></section>';
            var sw = w.body.querySelector(".sw");
            Object.keys(SWATCH).forEach(function (k) {
                var b = el("button", "kt-swatch");
                b.type = "button";
                b.title = k;
                b.setAttribute("aria-label", k);
                b.style.background = SWATCH[k];
                b.addEventListener("click", function () { setColour(k); });
                sw.appendChild(b);
            });
            var pick = el("input");
            pick.type = "color";
            pick.value = "#5eead4";
            pick.setAttribute("aria-label", "Custom colour");
            pick.addEventListener("input", function () { setColour(pick.value); });
            sw.appendChild(pick);
            function setColour(c) {
                if (term.isRoot()) { toast("root likes it red — type exit in the terminal first"); return; }
                if (!term.emit("rgb", { value: c, quiet: true })) {
                    // no room (flat layout): tint the desktop directly
                    desk.style.setProperty("--room-accent", SWATCH[c] || c);
                }
            }
            if (hasRoom) {
                var lamp = w.body.querySelector(".lamp");
                lamp.checked = term.lampOn();
                lamp.addEventListener("change", function () { term.emit("lamp", { value: lamp.checked ? "on" : "off", quiet: true }); });
                term.on("lamp", function () { setTimeout(function () { lamp.checked = term.lampOn(); }, 0); });
            }
            function choices(sel, map, key, apply) {
                var box = w.body.querySelector(sel), cur = store.get(key, Object.keys(map)[sel === ".ts" ? 1 : 0]);
                Object.keys(map).forEach(function (k) {
                    var b = el("button", "kt-chip" + (k === cur ? " on" : ""), esc(typeof map[k] === "string" ? map[k] : k[0].toUpperCase() + k.slice(1)));
                    b.type = "button";
                    b.addEventListener("click", function () {
                        box.querySelectorAll(".on").forEach(function (x) { x.classList.remove("on"); });
                        b.classList.add("on");
                        store.set(key, k);
                        apply(k);
                    });
                    box.appendChild(b);
                });
            }
            choices(".wp", WALLS, "wall", applyWall);
            choices(".ts", SIZES, "tsize", applySize);
        }
    });
})();
