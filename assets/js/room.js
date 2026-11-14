/*
 * The room behind terminal.html.
 *
 * The scene is a Blender/Cycles render split into four light passes (moonlight,
 * desk lamp, accent LEDs, monitor glow). A small WebGL shader adds them back
 * together, so the lamp can be switched and the LEDs recoloured live. A second,
 * higher-resolution set of passes covers the area around the monitor and is
 * blended in as the camera zooms ("sitting down"). The terminal itself is real
 * DOM, positioned over the monitor's screen every frame.
 */
(function () {
    "use strict";

    var root = document.getElementById("room");
    var canvas = document.getElementById("room-canvas");
    var screenEl = document.getElementById("screen");
    if (!root || !canvas || !screenEl) return;

    var term = window.JTerm;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var tip = document.getElementById("room-tip");
    var toast = document.getElementById("room-toast");
    var hint = document.getElementById("room-hint");
    var standBtn = document.getElementById("stand-btn");
    var markers = document.getElementById("room-markers");

    function flat(reason) {
        // No WebGL (or it died): fall back to a plain, fully usable terminal card.
        document.body.classList.remove("has-room");
        document.body.classList.add("flat");
        screenEl.style.transform = "";
        screenEl.style.width = "";
        screenEl.style.height = "";
        if (term) { term.autoFocus = true; term.focus(); }
        if (reason) console.warn("room: " + reason);
    }

    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    var isGL2 = !!gl;
    if (!gl) gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) { flat("WebGL unavailable"); return; }

    // ------------------------------------------------------------------
    // Shader
    // ------------------------------------------------------------------
    var VERT = "attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; v.y = 1.0 - v.y; gl_Position = vec4(p, 0.0, 1.0); }";
    var FRAG = [
        "precision highp float;",
        "varying vec2 v;",
        "uniform sampler2D wB, wL, wA, wS, cB, cL, cA, cS;",
        "uniform vec2 uCenter, uSpan, uRes;",
        "uniform vec4 uClose, uScreen, uRange;",
        "uniform float uCloseMix, uLamp, uAccentGain, uScreenGain, uExposure, uFade, uGlitch, uTime;",
        "uniform vec3 uAccent, uScreenBg;",
        "vec3 dec(vec3 c, float r){ return pow(c, vec3(2.2)) * r; }",
        "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
        "vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
        "void main(){",
        "  vec2 uv = uCenter + (v - 0.5) * uSpan;",
        "  if (uGlitch > 0.0) {",
        "    float band = floor(v.y * 34.0 + uTime * 13.0);",
        "    uv.x += (hash(vec2(band, floor(uTime * 24.0))) - 0.5) * 0.035 * uGlitch;",
        "  }",
        "  uv = clamp(uv, 0.0, 1.0);",
        "  vec3 b = dec(texture2D(wB, uv).rgb, uRange.x);",
        "  vec3 l = dec(texture2D(wL, uv).rgb, uRange.y);",
        "  vec3 a = dec(texture2D(wA, uv).rgb, uRange.z);",
        "  vec3 s = dec(texture2D(wS, uv).rgb, uRange.w);",
        "  if (uCloseMix > 0.0) {",
        "    vec2 cuv = (uv - uClose.xy) / (uClose.zw - uClose.xy);",
        "    vec2 e = min(cuv, 1.0 - cuv);",
        "    float m = uCloseMix * smoothstep(0.0, 0.06, min(e.x, e.y));",
        "    if (m > 0.0) {",
        "      b = mix(b, dec(texture2D(cB, cuv).rgb, uRange.x), m);",
        "      l = mix(l, dec(texture2D(cL, cuv).rgb, uRange.y), m);",
        "      a = mix(a, dec(texture2D(cA, cuv).rgb, uRange.z), m);",
        "      s = mix(s, dec(texture2D(cS, cuv).rgb, uRange.w), m);",
        "    }",
        "  }",
        "  vec3 col = b + l * uLamp + (a * uAccentGain + s * uScreenGain) * uAccent;",
        "  col = aces(col * uExposure);",
        "  col = pow(col, vec3(1.0 / 2.2));",
        // the terminal's own panel: flat, so the DOM overlay sits on a clean surface
        "  vec2 px = uSpan / uRes;",
        "  vec2 d = min(uv - uScreen.xy, uScreen.zw - uv) / px;",
        "  float inScreen = clamp(min(d.x, d.y) + 0.5, 0.0, 1.0);",
        "  col = mix(col, uScreenBg, inScreen);",
        "  float vig = smoothstep(1.25, 0.35, length((v - 0.5) * vec2(1.0, 0.82)));",
        "  col *= mix(0.72, 1.0, vig);",
        "  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.022;",
        "  gl_FragColor = vec4(col * uFade, 1.0);",
        "}"
    ].join("\n");

    function compile(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    }
    var prog, U = {};
    try {
        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { flat(e.message); return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ["wB", "wL", "wA", "wS", "cB", "cL", "cA", "cS", "uCenter", "uSpan", "uRes", "uClose", "uScreen", "uRange", "uCloseMix", "uLamp",
        "uAccentGain", "uScreenGain", "uExposure", "uFade", "uGlitch", "uTime", "uAccent", "uScreenBg"].forEach(function (n) {
            U[n] = gl.getUniformLocation(prog, n);
        });
    var SAMPLERS = ["wB", "wL", "wA", "wS", "cB", "cL", "cA", "cS"];
    var textures = SAMPLERS.map(function (n, i) {
        var t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        gl.uniform1i(U[n], i);
        return t;
    });

    // ------------------------------------------------------------------
    // Assets
    // ------------------------------------------------------------------
    var inline = window.__ROOM__ || null;
    var BASE = "assets/room/";
    var meta = null;
    var loaded = { wide: false, close: false };
    var small = Math.min(window.screen.width, window.screen.height) < 700;
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    function loadImage(name) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.decoding = "async";
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error("failed to load " + name)); };
            img.src = inline ? inline.images[name] : BASE + name + ".webp";
        });
    }

    function upload(unit, img) {
        var src = img;
        var limit = Math.min(maxTex, small ? 1600 : 4096);
        if (img.width > limit) {
            var c = document.createElement("canvas");
            c.width = limit;
            c.height = Math.round(img.height * limit / img.width);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            src = c;
        }
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (isGL2) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
    }

    function loadSet(tag, offset) {
        return Promise.all(["base", "lamp", "accent", "screen"].map(function (g) { return loadImage(tag + "_" + g); }))
            .then(function (imgs) {
                imgs.forEach(function (img, i) { upload(offset + i, img); });
                loaded[tag] = true;
                dirty = true;
            });
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    var COLORS = {
        teal: [94, 234, 212], violet: [124, 140, 248], amber: [255, 176, 64], pink: [255, 92, 168],
        green: [80, 250, 123], blue: [70, 150, 255], white: [235, 240, 255], red: [255, 60, 60], off: [0, 0, 0]
    };
    var CYCLE = ["teal", "violet", "pink", "amber", "green", "blue"];
    function lin(rgb) { return rgb.map(function (c) { return Math.pow(c / 255, 2.2); }); }

    var S = {
        seat: 0, seatTarget: 0, seatFrom: 0, seatStart: 0,     // 0 = standing, 1 = seated
        lamp: 1, lampTarget: 1,
        accent: lin(COLORS.teal), accentTarget: lin(COLORS.teal), accentName: "teal", userAccent: "teal",
        accentGain: 1, screenGain: 0.42, screenKick: 0,
        fade: 0, glitch: 0, power: 1,
        mx: 0, my: 0, px: 0, py: 0,
        vw: 1, vh: 1, dpr: 1
    };
    var dirty = true;
    var view = { cx: 0.5, cy: 0.5, sx: 1, sy: 1 };
    var screenSize = { w: 800, h: 500 };
    var A = 16 / 9;

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

    function seatedView() {
        var s = meta.screen;
        var sw = s[1][0] - s[0][0], sh = s[3][1] - s[0][1];
        var V = S.vw / S.vh;
        var narrow = S.vw < 720;
        var fx = narrow ? 0.965 : 0.74;
        var fy = narrow ? 0.6 : 0.69;
        var sx = Math.max(sw / fx, (sh / fy) * V / A);
        var sy = sx * A / V;
        // keep the frame inside the image
        if (sy > 1) { sy = 1; sx = V / A; }
        var cx = (s[0][0] + s[1][0]) / 2;
        var cy = (s[0][1] + s[3][1]) / 2 + sy * (narrow ? 0.02 : 0.035);
        return { cx: clamp(cx, sx / 2, 1 - sx / 2), cy: clamp(cy, sy / 2, 1 - sy / 2), sx: sx, sy: sy };
    }

    function wideView() {
        var V = S.vw / S.vh;
        var sx, sy;
        if (V >= A) { sx = 1; sy = A / V; } else { sy = 1; sx = V / A; }
        var k = 0.975;             // a little slack for the parallax
        sx *= k; sy *= k;
        var s = meta.screen;
        var fx = (s[0][0] + s[1][0]) / 2 - 0.035, fy = 0.5;
        return { cx: clamp(fx, sx / 2, 1 - sx / 2), cy: clamp(fy, sy / 2, 1 - sy / 2), sx: sx, sy: sy, wide: sx > 0.9 };
    }

    function computeView() {
        var w = wideView(), s = seatedView();
        var t = ease(S.seat);
        // zoom geometrically, pan along with it
        var sx = w.sx * Math.pow(s.sx / w.sx, t);
        var sy = w.sy * Math.pow(s.sy / w.sy, t);
        var cx, cy;
        if (Math.abs(w.sx - s.sx) < 1e-5) { cx = w.cx + (s.cx - w.cx) * t; cy = w.cy + (s.cy - w.cy) * t; }
        else {
            var k = (w.sx - sx) / (w.sx - s.sx);
            cx = w.cx + (s.cx - w.cx) * k;
            cy = w.cy + (s.cy - w.cy) * k;
        }
        // On wide screens the wide shot is centred on the image rather than the monitor
        if (w.wide) {
            var c0 = 0.5, k2 = (w.sx - sx) / (w.sx - s.sx);
            cx = c0 + (s.cx - c0) * k2;
        }
        var par = (1 - t) * 0.5 + 0.12;
        cx += S.px * sx * 0.012 * par;
        cy += S.py * sy * 0.012 * par;
        view.cx = clamp(cx, sx / 2, 1 - sx / 2);
        view.cy = clamp(cy, sy / 2, 1 - sy / 2);
        view.sx = sx; view.sy = sy;
    }

    function toPx(u, v) {
        return [((u - view.cx) / view.sx + 0.5) * S.vw, ((v - view.cy) / view.sy + 0.5) * S.vh];
    }
    function toUV(x, y) {
        return [view.cx + (x / S.vw - 0.5) * view.sx, view.cy + (y / S.vh - 0.5) * view.sy];
    }

    function resize() {
        var vv = window.visualViewport;
        S.vw = root.clientWidth || window.innerWidth;
        S.vh = root.clientHeight || window.innerHeight;
        if (vv && S.seat > 0.5 && vv.height < S.vh * 0.85) S.vh = vv.height;   // on-screen keyboard
        S.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(S.vw * S.dpr);
        canvas.height = Math.round(S.vh * S.dpr);
        canvas.style.height = S.vh + "px";
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (meta) {
            var sv = seatedView(), s = meta.screen;
            var w = Math.round((s[1][0] - s[0][0]) / sv.sx * S.vw);
            var h = Math.round((s[3][1] - s[0][1]) / sv.sy * S.vh);
            screenSize.w = w; screenSize.h = h;
            screenEl.style.width = w + "px";
            screenEl.style.height = h + "px";
            screenEl.style.fontSize = (w < 420 ? 10.5 : w < 640 ? 12 : w < 900 ? 13.5 : w < 1300 ? 15 : 17) + "px";
        }
        dirty = true;
    }

    // ------------------------------------------------------------------
    // Draw
    // ------------------------------------------------------------------
    var lastT = 0;
    function frame(now) {
        requestAnimationFrame(frame);
        if (!meta || document.hidden) return;
        var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
        lastT = now;
        var moving = false;

        if (S.seat !== S.seatTarget) {
            var dur = reduced ? 1 : 1500;
            var t = clamp((now - S.seatStart) / dur, 0, 1);
            S.seat = S.seatFrom + (S.seatTarget - S.seatFrom) * t;
            if (t >= 1) { S.seat = S.seatTarget; onSeatSettled(); }
            moving = true;
        }
        if (Math.abs(S.lamp - S.lampTarget) > 0.002) { S.lamp += (S.lampTarget - S.lamp) * Math.min(1, dt * 9); moving = true; } else S.lamp = S.lampTarget;
        for (var i = 0; i < 3; i++) {
            if (Math.abs(S.accent[i] - S.accentTarget[i]) > 0.002) { S.accent[i] += (S.accentTarget[i] - S.accent[i]) * Math.min(1, dt * 5); moving = true; }
            else S.accent[i] = S.accentTarget[i];
        }
        if (Math.abs(S.px - S.mx) > 0.001 || Math.abs(S.py - S.my) > 0.001) {
            S.px += (S.mx - S.px) * Math.min(1, dt * 4); S.py += (S.my - S.py) * Math.min(1, dt * 4); moving = true;
        }
        if (S.fade < 1 && loaded.wide) { S.fade = Math.min(1, S.fade + dt / 1.1); moving = true; }
        if (S.screenKick > 0.002) { S.screenKick *= Math.pow(0.02, dt); moving = true; } else S.screenKick = 0;
        if (S.glitch > 0) { S.glitch = Math.max(0, S.glitch - dt * 1.1); moving = true; }
        if (flicker) { moving = true; flicker(now); }

        if (!moving && !dirty) return;
        dirty = false;
        computeView();

        // how many source texels per device pixel does the wide set give us?
        var density = (meta.size[0] * view.sx) / (S.vw * S.dpr);
        var closeMix = loaded.close ? smooth(1.45, 0.95, density) : 0;

        gl.uniform2f(U.uCenter, view.cx, view.cy);
        gl.uniform2f(U.uSpan, view.sx, view.sy);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform4fv(U.uClose, meta.close);
        gl.uniform4f(U.uScreen, meta.screen[0][0], meta.screen[0][1], meta.screen[2][0], meta.screen[2][1]);
        gl.uniform4f(U.uRange, meta.range.base, meta.range.lamp, meta.range.accent, meta.range.screen);
        gl.uniform1f(U.uCloseMix, closeMix);
        gl.uniform1f(U.uLamp, S.lamp * 0.8 * S.power);
        gl.uniform1f(U.uAccentGain, S.accentGain * S.power);
        gl.uniform1f(U.uScreenGain, (S.screenGain + S.screenKick * 0.5) * S.power);
        gl.uniform1f(U.uExposure, 1.0);
        gl.uniform1f(U.uFade, S.fade * S.fade);
        gl.uniform1f(U.uGlitch, S.glitch);
        gl.uniform1f(U.uTime, (now / 1000) % 64);
        gl.uniform3fv(U.uAccent, S.accent);
        gl.uniform3f(U.uScreenBg, 0.016, 0.027, 0.035);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        placeScreen();
        placeMarkers();
    }

    function placeScreen() {
        var s = meta.screen;
        var tl = toPx(s[0][0], s[0][1]), br = toPx(s[2][0], s[2][1]);
        var kx = (br[0] - tl[0]) / screenSize.w, ky = (br[1] - tl[1]) / screenSize.h;
        screenEl.style.transform = "translate(" + tl[0].toFixed(2) + "px," + tl[1].toFixed(2) + "px) scale(" + kx.toFixed(5) + "," + ky.toFixed(5) + ")";
        screenEl.style.opacity = (S.fade * S.fade * (S.power > 0.5 ? 1 : 0)).toFixed(3);
    }

    // ------------------------------------------------------------------
    // Hotspots
    // ------------------------------------------------------------------
    var HOT = [
        { id: "monitor", label: function () { return S.seatTarget ? "" : "Sit down at the computer"; } },
        { id: "lamp", label: function () { return "Lamp: turn " + (S.lampTarget ? "off" : "on"); } },
        { id: "pc", label: function () { return "PC: change the RGB"; } },
        { id: "side", label: function () { return "Recon notes"; } },
        { id: "duck", label: function () { return "Rubber duck"; } },
        { id: "mug", label: function () { return "Coffee"; } },
        { id: "neon", label: function () { return "Neon sign"; } }
    ];
    var MARKED = ["monitor", "lamp", "pc", "duck"];
    var markerEls = {};

    function buildMarkers() {
        MARKED.forEach(function (id) {
            var m = document.createElement("span");
            m.className = "room-marker";
            markers.appendChild(m);
            markerEls[id] = m;
        });
    }

    function hotCenter(id) {
        var r = meta.hotspots[id];
        if (id === "lamp") return [r[2] - (r[2] - r[0]) * 0.22, r[1] + (r[3] - r[1]) * 0.22];   // the shade
        if (id === "monitor") return [(r[0] + r[2]) / 2, r[1] + (r[3] - r[1]) * 0.45];
        return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    }

    function placeMarkers() {
        var show = S.seat < 0.02 && S.fade >= 1;
        MARKED.forEach(function (id) {
            var c = hotCenter(id), p = toPx(c[0], c[1]);
            var el = markerEls[id];
            el.style.transform = "translate(" + p[0].toFixed(1) + "px," + p[1].toFixed(1) + "px)";
            el.classList.toggle("on", show && p[0] > 12 && p[0] < S.vw - 12 && p[1] > 70 && p[1] < S.vh - 12);
        });
    }

    function hit(x, y) {
        var uv = toUV(x, y);
        for (var i = 0; i < HOT.length; i++) {
            var r = meta.hotspots[HOT[i].id];
            if (!r) continue;
            if (HOT[i].id === "lamp") {
                // the lamp's bounding box is mostly air; use the shade and the base
                var w = r[2] - r[0], h = r[3] - r[1];
                var shade = uv[0] > r[0] + w * 0.5 && uv[1] < r[1] + h * 0.5 && uv[0] < r[2] && uv[1] > r[1];
                var base = uv[0] < r[0] + w * 0.45 && uv[1] > r[1] + h * 0.25 && uv[0] > r[0] && uv[1] < r[3];
                if (shade || base) return HOT[i];
                continue;
            }
            if (uv[0] >= r[0] && uv[0] <= r[2] && uv[1] >= r[1] && uv[1] <= r[3]) return HOT[i];
        }
        return null;
    }

    var toastTimer = 0;
    function say(text) {
        toast.textContent = text;
        toast.classList.add("on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove("on"); }, 2600);
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------
    function sit() {
        if (S.seatTarget === 1) return false;
        S.seatFrom = S.seat; S.seatTarget = 1; S.seatStart = performance.now();
        document.body.classList.add("seated");
        tip.classList.remove("on");
        if (term) { term.autoFocus = true; term.focus(); }
        return true;
    }
    function stand() {
        if (S.seatTarget === 0) return false;
        S.seatFrom = S.seat; S.seatTarget = 0; S.seatStart = performance.now();
        document.body.classList.remove("seated");
        if (term) { term.autoFocus = false; term.blur(); }
        resize();
        return true;
    }
    function onSeatSettled() { resize(); }

    var flicker = null;
    function setLamp(on) {
        S.lampTarget = on ? 1 : 0;
        if (on && !reduced) {
            // a tiny stutter as the bulb catches
            var t0 = performance.now();
            flicker = function (now) {
                var t = now - t0;
                if (t < 60) S.lamp = 0.7; else if (t < 120) S.lamp = 0.15; else if (t < 170) S.lamp = 0.9; else if (t < 210) S.lamp = 0.4; else flicker = null;
            };
        }
        dirty = true;
    }
    function toggleLamp() { setLamp(!S.lampTarget); return S.lampTarget; }

    function parseColor(name) {
        name = String(name).toLowerCase();
        if (COLORS[name]) return COLORS[name];
        if (name === "purple") return COLORS.violet;
        if (name === "orange" || name === "yellow") return COLORS.amber;
        if (name === "magenta") return COLORS.pink;
        if (name === "cyan" || name === "default") return COLORS.teal;
        var m = /^#?([0-9a-f]{6})$/.exec(name) || (/^#?([0-9a-f]{3})$/.exec(name));
        if (m) {
            var h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        }
        return null;
    }
    function setAccent(name, remember) {
        var c = parseColor(name);
        if (!c) return false;
        S.accentTarget = lin(c);
        S.accentName = name;
        if (remember !== false) S.userAccent = name;
        root.style.setProperty("--room-accent", "rgb(" + c.join(",") + ")");
        dirty = true;
        return true;
    }
    function cycleAccent() {
        var i = CYCLE.indexOf(S.userAccent);
        var next = CYCLE[(i + 1) % CYCLE.length];
        setAccent(next);
        return next;
    }

    function act(h) {
        switch (h.id) {
            case "monitor": sit(); break;
            case "lamp": toggleLamp(); break;
            case "pc":
                if (term && term.isRoot()) { say("root likes it red"); break; }
                say("RGB: " + cycleAccent()); break;
            case "duck": say("🦆 quack — have you tried explaining the bug out loud?"); break;
            case "mug": say("☕ +10 focus"); break;
            case "side": say("nmap, ffuf, notes — the usual"); break;
            case "neon": S.glitch = 0.7; say("~$ hack the planet"); break;
        }
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------
    var downAt = null;
    canvas.addEventListener("pointerdown", function (e) { downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointermove", function (e) {
        if (!meta) return;
        var r = canvas.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        if (e.pointerType === "mouse") { S.mx = (x / S.vw - 0.5) * 2; S.my = (y / S.vh - 0.5) * 2; }
        var h = hit(x, y);
        var label = h ? h.label() : "";
        canvas.style.cursor = label ? "pointer" : (S.seatTarget ? "zoom-out" : "default");
        if (label && e.pointerType === "mouse") {
            tip.textContent = label;
            tip.style.transform = "translate(" + Math.min(x + 16, S.vw - 220) + "px," + (y + 18) + "px)";
            tip.classList.add("on");
        } else tip.classList.remove("on");
    });
    canvas.addEventListener("pointerleave", function () { tip.classList.remove("on"); S.mx = 0; S.my = 0; });
    canvas.addEventListener("click", function (e) {
        if (!meta) return;
        if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
        var r = canvas.getBoundingClientRect();
        var h = hit(e.clientX - r.left, e.clientY - r.top);
        if (h && !(h.id === "monitor" && S.seatTarget)) { act(h); return; }
        if (S.seatTarget) stand();
    });
    // while standing, the screen itself is the click target for sitting down
    screenEl.addEventListener("click", function () { if (!S.seatTarget) sit(); });
    standBtn.addEventListener("click", function () { stand(); });
    document.addEventListener("keydown", function (e) {
        if (!meta) return;
        if (e.key === "Escape" && S.seatTarget) { e.preventDefault(); stand(); return; }
        if (!S.seatTarget && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "Enter" || e.key.length === 1)) {
            var tag = (document.activeElement && document.activeElement.tagName) || "";
            if (tag === "A" || tag === "BUTTON") return;
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
            sit();
        }
    });
    window.addEventListener("resize", resize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); meta = null; flat("context lost"); });

    // ------------------------------------------------------------------
    // Terminal hooks
    // ------------------------------------------------------------------
    if (term) {
        term.autoFocus = false;
        term.blur();
        term.on("sit", function () { if (!sit()) term.print("You're already sitting down."); });
        term.on("stand", function () { if (!stand()) term.print("You're already standing."); });
        term.on("lamp", function (arg) {
            if (arg === "on") setLamp(true); else if (arg === "off") setLamp(false); else toggleLamp();
            term.print("lamp: " + (S.lampTarget ? "on" : "off"));
        });
        term.on("rgb", function (arg) {
            if (setAccent(arg)) term.print("rgb: " + arg);
            else term.print("rgb: unknown colour '" + arg + "'. Try teal, violet, amber, pink, green, blue, white, off or #rrggbb.");
        });
        term.on("root", function (on) {
            if (on) { setAccent("red", false); S.glitch = 1; }
            else setAccent(S.userAccent);
        });
        term.on("output", function () { S.screenKick = 1; });
        term.on("glitch", function () { S.glitch = 1; });
        term.on("reboot", function () {
            S.power = 0; dirty = true;
            setTimeout(function () { S.power = 1; S.glitch = 0.6; setLamp(true); dirty = true; }, 1500);
        });
    }

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------
    document.body.classList.add("has-room");
    buildMarkers();
    (inline ? Promise.resolve(inline.meta) : fetch(BASE + "room.json").then(function (r) { return r.json(); }))
        .then(function (m) {
            meta = m;
            resize();
            return loadSet("wide", 0);
        })
        .then(function () {
            document.body.classList.add("room-ready");
            requestAnimationFrame(frame);
            return loadSet("close", 4);
        })
        .catch(function (e) { meta = null; flat(e.message); });
})();
