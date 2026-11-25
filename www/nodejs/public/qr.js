// Tiny QR code generator for ShaLo. Byte mode, error correction M, versions 1-10 (up to 213 bytes).
// Works in the browser (window.QR) and in Node (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QR = factory();
})(this, function () {
  // Per version: [EC codewords per block, group 1 blocks, group 1 data, group 2 blocks, group 2 data]
  var T = [null, [10,1,16,0,0], [16,1,28,0,0], [26,1,44,0,0], [18,2,32,0,0], [24,2,43,0,0], [16,4,27,0,0], [18,4,31,0,0], [22,2,38,2,39], [22,3,36,2,37], [26,4,43,1,44]];
  var A = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];
  var EXP = [], LOG = [], i;
  for (var x0 = 1, n0 = 0; n0 < 255; n0++) { EXP[n0] = x0; LOG[x0] = n0; x0 <<= 1; if (x0 & 256) x0 ^= 0x11D; }
  for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  function rs(data, deg) {
    var g = [1], j, k;
    for (var d = 0; d < deg; d++) {
      var n = []; for (j = 0; j <= g.length; j++) n[j] = 0;
      for (j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= mul(g[j], EXP[d]); }
      g = n;
    }
    var r = []; for (k = 0; k < deg; k++) r[k] = 0;
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      for (var m = 0; m < deg; m++) r[m] ^= mul(g[m + 1], f);
    });
    return r;
  }

  function encode(text) {
    var bytes = Array.prototype.slice.call(new TextEncoder().encode(text)), v, t, cap;
    for (v = 1; v <= 10; v++) {
      t = T[v]; cap = t[1] * t[2] + t[3] * t[4];
      if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= cap * 8) break;
    }
    if (v > 10) throw new Error("Address is too long for a QR code");

    var bits = [];
    function put(val, n) { for (var q = n - 1; q >= 0; q--) bits.push((val >>> q) & 1); }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) { var by = 0; for (var k = 0; k < 8; k++) by = (by << 1) | bits[i + k]; data.push(by); }
    for (var pad = 0xEC; data.length < cap; pad ^= 0xEC ^ 0x11) data.push(pad);

    // Split into blocks, add error correction, interleave
    var blocks = [], ecs = [], pos = 0, ecn = t[0];
    [[t[1], t[2]], [t[3], t[4]]].forEach(function (g) {
      for (var b = 0; b < g[0]; b++) { var d = data.slice(pos, pos + g[1]); pos += g[1]; blocks.push(d); ecs.push(rs(d, ecn)); }
    });
    var out = [], maxLen = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
    for (var c = 0; c < maxLen; c++) blocks.forEach(function (b) { if (c < b.length) out.push(b[c]); });
    for (var e = 0; e < ecn; e++) ecs.forEach(function (b) { out.push(b[e]); });

    // Draw the fixed patterns
    var size = 17 + 4 * v, m = [], f = [], x, y;
    for (y = 0; y < size; y++) { m.push([]); f.push([]); for (x = 0; x < size; x++) { m[y].push(false); f[y].push(false); } }
    function set(x, y, d) { m[y][x] = d; f[y][x] = true; }
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = cx + dx, yy = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var ap = A[v], last = ap.length - 1;
    ap.forEach(function (cy, a) { ap.forEach(function (cx, b) {
      if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function fmt(mask) {
      var r = mask, j;
      for (j = 0; j < 10; j++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var b = ((mask << 10) | r) ^ 0x5412;
      function g(n) { return ((b >>> n) & 1) === 1; }
      for (j = 0; j <= 5; j++) set(8, j, g(j));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (j = 9; j < 15; j++) set(14 - j, 8, g(j));
      for (j = 0; j < 8; j++) set(size - 1 - j, 8, g(j));
      for (j = 8; j < 15; j++) set(8, size - 15 + j, g(j));
      set(8, size - 8, true);
    }
    if (v >= 7) {
      var vr = v;
      for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >>> 11) * 0x1F25);
      var vb = (v << 12) | vr;
      for (i = 0; i < 18; i++) { var bit = ((vb >>> i) & 1) === 1, a = size - 11 + (i % 3), c2 = Math.floor(i / 3); set(a, c2, bit); set(c2, a, bit); }
    }
    fmt(0);

    // Place the data bits in the zigzag order
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var xx = right - j, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!f[yy][xx] && bi < out.length * 8) { m[yy][xx] = ((out[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1; bi++; }
      }
    }

    function mask(n) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        if (f[y][x]) continue;
        var inv;
        switch (n) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
        }
        if (inv) m[y][x] = !m[y][x];
      }
    }
    function penalty() {
      var p = 0, a, b, dark = 0;
      for (var pass = 0; pass < 2; pass++) for (a = 0; a < size; a++) {
        var s = "", run = 1;
        for (b = 0; b < size; b++) {
          var cur = pass ? m[b][a] : m[a][b];
          s += cur ? "1" : "0";
          if (b > 0) {
            var prev = pass ? m[b - 1][a] : m[a][b - 1];
            if (cur === prev) run++; else { if (run >= 5) p += run - 2; run = 1; }
          }
        }
        if (run >= 5) p += run - 2;
        p += 40 * ((s.match(/(?=10111010000)/g) || []).length + (s.match(/(?=00001011101)/g) || []).length);
      }
      for (a = 0; a < size; a++) for (b = 0; b < size; b++) {
        if (m[a][b]) dark++;
        if (a < size - 1 && b < size - 1 && m[a][b] === m[a][b + 1] && m[a][b] === m[a + 1][b] && m[a][b] === m[a + 1][b + 1]) p += 3;
      }
      return p + 10 * Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5);
    }
    var best = 0, bp = Infinity;
    for (var n = 0; n < 8; n++) { mask(n); fmt(n); var pp = penalty(); if (pp < bp) { bp = pp; best = n; } mask(n); }
    mask(best); fmt(best);
    return { size: size, modules: m };
  }

  // SVG string with a 4-module quiet zone
  function svg(text, label) {
    var q = encode(text), b = 4, n = q.size + b * 2, d = "";
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) {
      if (q.modules[y][x]) {
        var s = x; while (x < q.size && q.modules[y][x]) x++;
        d += "M" + (s + b) + " " + (y + b) + "h" + (x - s) + "v1h-" + (x - s) + "z";
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" role="img" aria-label="' + (label || "QR code") + '"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#1B1240"/></svg>';
  }

  return { encode: encode, svg: svg };
});
