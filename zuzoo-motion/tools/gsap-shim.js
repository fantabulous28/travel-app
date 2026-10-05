// Minimal, seek-only GSAP stand-in used for offline preview renders (tools/render.mjs).
// Covers only the subset index.html uses: timeline().to/fromTo/set + seek, stagger, repeat/yoyo,
// attr, filter blur, transforms, px sizes, discrete props and onUpdate. The real page loads GSAP itself.
(function () {
  const PI2 = Math.PI * 2;
  const powerOut = (n) => (p) => 1 - Math.pow(1 - p, n + 1);
  const powerIn = (n) => (p) => Math.pow(p, n + 1);
  const powerInOut = (n) => (p) => (p < 0.5 ? Math.pow(2 * p, n + 1) / 2 : 1 - Math.pow(2 * (1 - p), n + 1) / 2);
  const backOut = (s = 1.70158) => (p) => { p -= 1; return 1 + p * p * ((s + 1) * p + s); };
  const backIn = (s = 1.70158) => (p) => p * p * ((s + 1) * p - s);
  const backInOut = (s = 1.70158) => (p) => (p < 0.5 ? backIn(s)(p * 2) / 2 : 1 - backIn(s)((1 - p) * 2) / 2);
  const elasticOut = (a = 1, per = 0.3) => {
    const p1 = a >= 1 ? a : 1, p3 = per / (a < 1 ? a : 1), p2 = (p3 / PI2) * (Math.asin(1 / p1) || 0);
    return (p) => (p === 0 || p === 1 ? p : p1 * Math.pow(2, -10 * p) * Math.sin((p - p2) * (PI2 / p3)) + 1);
  };
  const expoOut = (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p));
  const expoIn = (p) => (p === 0 ? 0 : Math.pow(2, 10 * (p - 1)));
  const expoInOut = (p) => (p === 0 || p === 1 ? p : p < 0.5 ? expoIn(p * 2) / 2 : 1 - expoIn((1 - p) * 2) / 2);
  const sineInOut = (p) => -(Math.cos(Math.PI * p) - 1) / 2;
  const parseEase = (e) => {
    if (typeof e === "function") return e;
    if (!e || e === "none" || e === "linear") return (p) => p;
    const m = /^(\w+)\.?(in|out|inOut)?(?:\(([^)]*)\))?$/.exec(e);
    const [, name, kind = "out", args] = m;
    const a = args ? args.split(",").map(Number) : [];
    const pw = { power1: 1, power2: 2, power3: 3, power4: 4, quad: 1, cubic: 2, quart: 3 }[name];
    if (pw) return kind === "in" ? powerIn(pw) : kind === "inOut" ? powerInOut(pw) : powerOut(pw);
    if (name === "back") return kind === "in" ? backIn(a[0]) : kind === "inOut" ? backInOut(a[0]) : backOut(a[0]);
    if (name === "expo") return kind === "in" ? expoIn : kind === "inOut" ? expoInOut : expoOut;
    if (name === "sine") return kind === "inOut" ? sineInOut : kind === "in" ? (p) => 1 - Math.cos((p * Math.PI) / 2) : (p) => Math.sin((p * Math.PI) / 2);
    if (name === "elastic") return elasticOut(a[0], a[1]);
    return (p) => p;
  };

  const TF = ["x", "y", "xPercent", "yPercent", "rotation", "scaleX", "scaleY"];
  const RESERVED = new Set(["duration", "ease", "stagger", "repeat", "yoyo", "immediateRender", "onUpdate", "transformOrigin", "delay"]);
  const DISCRETE = new Set(["visibility", "textContent", "display"]);
  const PX = new Set(["width", "height", "borderRadius", "left", "top"]);
  const resolve = (t) => (Array.isArray(t) ? t.flatMap(resolve) : typeof t === "string" ? [...document.querySelectorAll(t)] : [t]);
  const isEl = (o) => o && o.nodeType === 1;
  const num = (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(/^blur\(/, "")));

  function initial(el, key) {
    if (!isEl(el)) return el[key.slice(1)];
    if (key.startsWith("@")) return num(el.getAttribute(key.slice(1)) || 0);
    if (TF.includes(key)) return key.startsWith("scale") ? 1 : 0;
    if (key === "filter") return 0;
    if (DISCRETE.has(key)) return key === "textContent" ? el.textContent : getComputedStyle(el)[key];
    const cs = getComputedStyle(el)[key];
    return key === "opacity" ? num(cs) : num(cs) || 0;
  }

  function Timeline(opts) {
    this.defaults = (opts && opts.defaults) || {};
    this.tweens = [];
    this.tracks = new Map(); // el -> Map(key -> [tween entries])
    this.order = 0;
    this.end = 0;
  }
  const P = Timeline.prototype;
  P._add = function (targets, fromV, toV, pos, kind) {
    const els = resolve(targets);
    const v = Object.assign({}, kind === "set" ? {} : this.defaults, toV);
    const dur = kind === "set" ? 0 : v.duration != null ? v.duration : 0.5;
    const ease = parseEase(v.ease);
    const rep = v.repeat || 0, yoyo = !!v.yoyo;
    const imm = kind === "fromTo" ? v.immediateRender !== false : kind === "set" ? true : false;
    els.forEach((el, i) => {
      const start = (pos || 0) + i * (v.stagger || 0);
      const tw = { el, start, dur, ease, rep, yoyo, imm, kind, order: this.order++, props: [], onUpdate: v.onUpdate };
      if (v.transformOrigin && isEl(el)) el.style.transformOrigin = v.transformOrigin;
      const addProp = (k, to, from) => {
        const ev = (x) => (typeof x === "function" ? x(i, el) : x);
        const keys = k === "scale" ? ["scaleX", "scaleY"] : [k];
        keys.forEach((key) => {
          const ent = { tw, key, to: ev(to), from: from === undefined ? undefined : ev(from), discrete: DISCRETE.has(key) };
          if (!ent.discrete) { ent.to = num(ent.to); if (ent.from !== undefined) ent.from = num(ent.from); }
          tw.props.push(ent);
          if (!this.tracks.has(el)) this.tracks.set(el, new Map());
          const m = this.tracks.get(el);
          if (!m.has(key)) m.set(key, { init: initial(el, key), list: [] });
          m.get(key).list.push(ent);
        });
      };
      Object.keys(v).forEach((k) => {
        if (RESERVED.has(k)) return;
        if (k === "attr") Object.keys(v.attr).forEach((a) => addProp("@" + a, v.attr[a], fromV && fromV.attr ? fromV.attr[a] : undefined));
        else addProp(isEl(el) ? k : "." + k, v[k], fromV ? fromV[k] : undefined);
      });
      this.tweens.push(tw);
      this.end = Math.max(this.end, start + dur * (rep + 1));
    });
    return this;
  };
  P.to = function (t, v, pos) { return this._add(t, null, v, pos, "to"); };
  P.fromTo = function (t, f, v, pos) { return this._add(t, f, v, pos, "fromTo"); };
  P.set = function (t, v, pos) { return this._add(t, null, v, pos, "set"); };
  P.duration = function () { return this.end; };
  P.totalDuration = P.duration;
  P.pause = P.play = function () { return this; };

  const prog = (tw, t) => {
    if (tw.dur === 0) return 1;
    const total = tw.dur * (tw.rep + 1), lt = Math.min(Math.max(t - tw.start, 0), total);
    let cyc = Math.floor(lt / tw.dur), p = (lt - cyc * tw.dur) / tw.dur;
    if (lt >= total) { cyc = tw.rep; p = 1; }
    if (tw.yoyo && cyc % 2 === 1) p = 1 - p;
    return tw.ease(p);
  };
  // value of track at time t, considering only entries in `list` (sorted by start, order)
  function valueAt(track, list, t) {
    let cur = null;
    for (const e of list) if (e.tw.start <= t) cur = e;
    if (!cur) {
      const first = list.find((e) => e.tw.imm && e.tw.kind === "fromTo" && e.from !== undefined);
      return first ? first.from : track.init;
    }
    const from = cur.from !== undefined ? cur.from : startValue(track, list, cur);
    if (cur.discrete) return cur.to;
    return from + (cur.to - from) * prog(cur.tw, t);
  }
  function startValue(track, list, ent) {
    if (ent._sv !== undefined) return ent._sv;
    const before = list.filter((e) => e !== ent && (e.tw.start < ent.tw.start || (e.tw.start === ent.tw.start && e.tw.order < ent.tw.order)));
    return (ent._sv = valueAt(track, before, ent.tw.start));
  }

  P.seek = function (t) {
    const updates = new Set();
    this.tracks.forEach((m, el) => {
      const tf = {};
      m.forEach((track, key) => {
        if (!track.sorted) { track.list.sort((a, b) => a.tw.start - b.tw.start || a.tw.order - b.tw.order); track.sorted = true; }
        const val = valueAt(track, track.list, t);
        const active = [...track.list].reverse().find((e) => e.tw.start <= t);
        if (active && active.tw.onUpdate) updates.add(active.tw);
        if (!isEl(el)) { el[key.slice(1)] = val; return; }
        if (key.startsWith("@")) el.setAttribute(key.slice(1), val);
        else if (TF.includes(key)) tf[key] = val;
        else if (key === "filter") el.style.filter = "blur(" + val + "px)";
        else if (key === "textContent") el.textContent = val;
        else if (PX.has(key)) el.style[key] = val + "px";
        else el.style[key] = val;
      });
      if (Object.keys(tf).length) {
        const g = (k, d) => (tf[k] !== undefined ? tf[k] : d);
        el.style.transform = "translate(" + g("xPercent", 0) + "%," + g("yPercent", 0) + "%) translate(" + g("x", 0) + "px," + g("y", 0) + "px) rotate(" + g("rotation", 0) + "deg) scale(" + g("scaleX", 1) + "," + g("scaleY", 1) + ")";
      }
    });
    updates.forEach((tw) => tw.onUpdate());
    return this;
  };
  window.gsap = { timeline: (o) => new Timeline(o) };
})();
