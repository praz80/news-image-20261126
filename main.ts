// main.ts — draws the 26 November 2026 world-news poster as a PNG.
// Node 22, standard library only. No network, no images: every pixel is
// drawn here by an own PNG encoder and an own 5x7 pixel font.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette (newsprint: cream paper, dark ink) ----------
const PAPER: RGB = [246, 241, 229];
const INK: RGB = [25, 23, 19];
const RED: RGB = [163, 29, 33];
const BLUE: RGB = [29, 78, 121];
const GOLD: RGB = [176, 132, 30];
const GREY: RGB = [112, 104, 90];
const LIGHT: RGB = [232, 224, 205];
const WHITE: RGB = [250, 248, 242];

type RGB = [number, number, number];

// ---------- CRC32 (PNG chunk checksums) ----------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(w: number, h: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- canvas ----------
class Canvas {
  w: number;
  h: number;
  px: Buffer;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 3] = bg[0];
      this.px[i * 3 + 1] = bg[1];
      this.px[i * 3 + 2] = bg[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  hline(x: number, y: number, w: number, c: RGB): void {
    this.rect(x, y, w, 1, c);
  }
  vline(x: number, y: number, h: number, c: RGB): void {
    this.rect(x, y, 1, h, c);
  }
  // filled ellipse, scanline fill
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let dy = -ry; dy <= ry; dy++) {
      const t = 1 - (dy * dy) / (ry * ry);
      if (t < 0) continue;
      const dx = Math.floor(rx * Math.sqrt(t));
      this.rect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
    }
  }
  // filled circle
  disc(cx: number, cy: number, r: number, c: RGB): void {
    this.ellipse(cx, cy, r, r, c);
  }
}

// ---------- 5x7 pixel font (uppercase + digits + punctuation) ----------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "00000", "00000", "00000", "01100", "00000"],
  ";": ["00000", "01100", "00000", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "—": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "•": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB, bold = false): void {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = FONT[up[i]] ?? FONT["?"];
    const gx = x + i * 6 * scale;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          cv.rect(gx + col * scale, y + r * scale, scale, scale, c);
          if (bold) cv.rect(gx + col * scale + 1, y + r * scale, scale, scale, c);
        }
      }
    }
  }
}

function drawCentred(cv: Canvas, cx: number, y: number, s: string, scale: number, c: RGB, bold = false): void {
  drawText(cv, cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c, bold);
}

// Greedy word wrap; returns lines that fit maxW pixels at the given scale.
function wrap(s: string, maxW: number, scale: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxW / (6 * scale)));
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars) : w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------- deterministic PRNG (newsprint speckle, no Math.random) ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the day's news: 40 stories, 9 regions ----------
// Every story was first reported on Thursday 26 November 2026 (any time zone).
type Story = { region: string; head: string; detail: string };
const STORIES: Story[] = [
  // SOUTH ASIA
  { region: "SOUTH ASIA", head: "MUMBAI REMEMBERS 26/11", detail: "18th anniversary of the 2008 attacks; tributes nationwide." },
  { region: "SOUTH ASIA", head: "CONSTITUTION DAY AT 77", detail: "India marks Samvidhan Divas, 77 years since 1949." },
  { region: "SOUTH ASIA", head: "RS 15,000 CRORE FOR NEPAL", detail: "Modi meets PM Balendra Shah; aid and links package." },
  { region: "SOUTH ASIA", head: "IITS ADD 6,000 TECH SEATS", detail: "Robotics, AI and space places open from 2027." },
  { region: "SOUTH ASIA", head: "BANGLADESH WAGE UP 36%", detail: "Garment workers win a big minimum-wage rise." },
  { region: "SOUTH ASIA", head: "SOORYAVANSHI, 15, HITS 204", detail: "Fastest List A double ton: 53 balls vs the UAE." },
  { region: "SOUTH ASIA", head: "IPL 2027: 1,220 REGISTER", detail: "Record entries flood in for the mega auction." },
  { region: "SOUTH ASIA", head: "PORT AND AIRPORT CLEARED", detail: "Rs 4,288 cr Kamarajar terminal; Rs 2,014 cr Silchar airport." },
  // EAST ASIA
  { region: "EAST ASIA", head: "PAKISTAN'S FIRST ASTRONAUT", detail: "Zeeshan Ali picked for China's Shenzhou-24 mission." },
  { region: "EAST ASIA", head: "XI PROBE SHAKES SHANGHAI", detail: "Graft inquiry into a rising star upends the ladder." },
  { region: "EAST ASIA", head: "N KOREA SHUTS SWISS OFFICE", detail: "Pyongyang orders Switzerland to close its mission." },
  { region: "EAST ASIA", head: "NEPAL QUAKE 5.6", detail: "Tremor hits Koshi Province near the China border." },
  { region: "EAST ASIA", head: "GUKESH V SINDAROV, GAME 3", detail: "World Chess Championship continues in Geneva." },
  // MIDDLE EAST
  { region: "MIDDLE EAST", head: "HOUTHIS HIT RAS TANURA", detail: "Strike on Saudi Arabia's top refinery sets fires." },
  { region: "MIDDLE EAST", head: "MINES HIT TWO TANKERS", detail: "Oil tankers struck by naval mines in Hormuz Strait." },
  { region: "MIDDLE EAST", head: "ISRAEL KILLS HAMAS COLONEL", detail: "Mohammad Abuelouf killed in Gaza; truce strained." },
  { region: "MIDDLE EAST", head: "IRAN WEAPONS WARNING", detail: "Israel: Tehran building chemical arms; strike plans set." },
  { region: "MIDDLE EAST", head: "RIYADH TOWER ATTACK", detail: "Two Indians hurt; New Delhi condemns the strike." },
  // EUROPE
  { region: "EUROPE", head: "UKRAINE HITS TWO REFINERIES", detail: "Overnight strikes set Syzran and Kuibyshev ablaze." },
  { region: "EUROPE", head: "US SHELVES RUSSIA DEALS", detail: "Trade incentives dropped after Moscow's cool reply." },
  { region: "EUROPE", head: "EU JOINS NEXT RUSSIA TALKS", detail: "22nd sanctions package; 45bn euro Ukraine loan." },
  { region: "EUROPE", head: "RUSSIA'S OWN TOLL: 500,000", detail: "Moscow figures show near half a million war dead." },
  { region: "EUROPE", head: "REAL MADRID 5-1 PSV", detail: "Mbappe brace; only side left with a perfect record." },
  { region: "EUROPE", head: "PSG HELD 2-2 BY ROMA", detail: "Holders lose perfect run; Liverpool 3-0, Barca 4-1." },
  // NORTH AMERICA
  { region: "NORTH AMERICA", head: "THANKSGIVING NOR'EASTER", detail: "Storm lashes US East Coast; Macy's 100th parade at risk." },
  { region: "NORTH AMERICA", head: "KING TIDES FLOOD CALIFORNIA", detail: "Record November high tide; towns evacuated." },
  { region: "NORTH AMERICA", head: "SIX MISSING AFTER GULF CRASH", detail: "Crews search after a small plane hits the Gulf." },
  { region: "NORTH AMERICA", head: "FORT HOOD APPEAL FAILS", detail: "Survivors lose final bid over Nidal Hasan execution." },
  { region: "NORTH AMERICA", head: "US EYES NEW GLOBAL TARIFFS", detail: "Trump team readies duties on trading partners." },
  { region: "NORTH AMERICA", head: "NVIDIA PROBE DODGED", detail: "US attorney general sidesteps Nvidia questions." },
  // SOUTH AMERICA
  { region: "SOUTH AMERICA", head: "20 FREED IN COLOMBIA RAID", detail: "Police storm supermarket after 17-hour siege." },
  { region: "SOUTH AMERICA", head: "MOSQUITOES CUT VIRUS 68%", detail: "Wolbachia release slashes infections in Brazil." },
  // OCEANIA & PACIFIC
  { region: "OCEANIA & PACIFIC", head: "SOLOMONS SIGN SECURITY PACT", detail: "Historic treaty with Australia sealed." },
  { region: "OCEANIA & PACIFIC", head: "TUITION PAID IN COCONUTS", detail: "Pacific school lets families pay fees in coconuts." },
  // SPACE & SCIENCE
  { region: "SPACE & SCIENCE", head: "ASTEROID CLOSE-UPS COMING", detail: "First close images of the rock hit to test defences." },
  { region: "SPACE & SCIENCE", head: "INDIA'S SPACE ECONOMY TO $45BN", detail: "Minister: private sector to drive growth from $9bn." },
  // BUSINESS & MARKETS
  { region: "BUSINESS & MARKETS", head: "SENSEX SLIDES 1,484 PTS", detail: "Nifty below 25,400; banks and metals lead the fall." },
  { region: "BUSINESS & MARKETS", head: "FLIPKART CEO TO STEP DOWN", detail: "Kalyan Krishnamurthy exits in December." },
  { region: "BUSINESS & MARKETS", head: "TATA SONS BOARD DELAYED", detail: "Meeting pushed back to 30 November." },
  { region: "BUSINESS & MARKETS", head: "BANKS WRITE OFF RS 1.44 LAKH CR", detail: "Bad loans written off in FY26, data shows." },
];

const REGIONS = [
  "SOUTH ASIA",
  "EAST ASIA",
  "MIDDLE EAST",
  "EUROPE",
  "NORTH AMERICA",
  "SOUTH AMERICA",
  "OCEANIA & PACIFIC",
  "SPACE & SCIENCE",
  "BUSINESS & MARKETS",
];

// Column assignment: balance story counts across 3 columns.
const COLUMNS: string[][] = [
  ["SOUTH ASIA", "EAST ASIA"],
  ["MIDDLE EAST", "EUROPE", "OCEANIA & PACIFIC", "SPACE & SCIENCE"],
  ["NORTH AMERICA", "SOUTH AMERICA", "BUSINESS & MARKETS"],
];

// ---------- world dot-map (stylised continents, drawn from ellipses) ----------
// Continent blobs in normalised map coordinates (0..1 across, 0..1 down).
// The map strip is wide and short, so the blobs are vertically stretched
// to read as continents in that strip.
const CONTINENTS: Array<[number, number, number, number]> = [
  [0.16, 0.32, 0.13, 0.4], // North America
  [0.3, 0.12, 0.025, 0.12], // Greenland
  [0.27, 0.72, 0.05, 0.3], // South America
  [0.485, 0.25, 0.04, 0.18], // Europe
  [0.52, 0.6, 0.07, 0.32], // Africa
  [0.7, 0.28, 0.17, 0.32], // Asia
  [0.79, 0.6, 0.045, 0.12], // SE Asia islands
  [0.85, 0.75, 0.055, 0.16], // Australia
];
// Red markers: the two lead stories (Ras Tanura, Mumbai) in map coords.
const MAP_MARKERS: Array<[number, number]> = [
  [0.6, 0.42], // Ras Tanura, Saudi Arabia
  [0.68, 0.45], // Mumbai, India
];

function drawMap(cv: Canvas, x: number, y: number, w: number, h: number): void {
  const step = 8;
  for (let gy = y + 2; gy < y + h - 2; gy += step) {
    for (let gx = x + 2; gx < x + w - 2; gx += step) {
      const nx = (gx - x) / w;
      const ny = (gy - y) / h;
      for (const [cx, cy, rx, ry] of CONTINENTS) {
        const dx = (nx - cx) / rx;
        const dy = (ny - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          cv.rect(gx, gy, 4, 4, BLUE);
          break;
        }
      }
    }
  }
  for (const [nx, ny] of MAP_MARKERS) {
    const px = x + Math.floor(nx * w);
    const py = y + Math.floor(ny * h);
    cv.disc(px, py, 5, RED);
    cv.disc(px, py, 2, WHITE);
  }
}

// ---------- UTC timeline of the day ----------
// Times are UTC; each event was first reported on 26 November 2026.
const TIMELINE: Array<[string, string]> = [
  ["03:30", "UCL: REAL 5-1"],
  ["05:00", "MUMBAI TRIBUTES"],
  ["08:00", "RAS TANURA"],
  ["10:00", "SENSEX -1,484"],
  ["11:00", "GUKESH GAME 3"],
  ["14:00", "MACY'S PARADE"],
  ["17:00", "NOR'EASTER"],
];

function drawTimeline(cv: Canvas, x: number, y: number, w: number): void {
  drawText(cv, x, y, "THE DAY IN UTC — ALL TIMES UTC", 1, RED, true);
  const lineY = y + 22;
  cv.hline(x, lineY, w, INK);
  for (let h = 0; h <= 24; h += 3) {
    const tx = x + Math.floor((h / 24) * w);
    cv.vline(tx, lineY - 3, 7, INK);
  }
  for (let i = 0; i < TIMELINE.length; i++) {
    const [hhmm, label] = TIMELINE[i];
    const [hh, mm] = hhmm.split(":").map(Number);
    const tx = x + Math.floor(((hh + mm / 60) / 24) * w);
    cv.disc(tx, lineY, 4, RED);
    const text = `${hhmm} ${label}`;
    const lx = Math.max(x, Math.min(tx - Math.floor(textWidth(text, 1) / 2), x + w - textWidth(text, 1)));
    drawText(cv, lx, lineY + 8 + (i % 3) * 12, text, 1, INK, true);
  }
}

// ---------- layout ----------
function drawPoster(): Canvas {
  const cv = new Canvas(W, H, PAPER);
  const M = 26; // margin
  const CW = W - 2 * M; // content width

  // double outer frame
  cv.rect(10, 10, W - 20, H - 20, INK);
  cv.rect(13, 13, W - 26, H - 26, PAPER);
  cv.rect(16, 16, W - 32, H - 32, INK);
  cv.rect(17, 17, W - 34, H - 34, PAPER);

  // ----- masthead -----
  // small globe (left) and calendar badge (right) flanking the title
  const gx = 46;
  const gy = 58;
  cv.disc(gx, gy, 26, BLUE);
  cv.ellipse(gx, gy, 26, 10, PAPER);
  cv.ellipse(gx, gy, 10, 26, PAPER);
  cv.rect(gx - 26, gy - 2, 52, 3, PAPER);
  cv.rect(gx - 2, gy - 26, 3, 52, PAPER);
  const calX = W - 92;
  const calY = 32;
  cv.rect(calX, calY, 46, 52, RED);
  cv.rect(calX + 3, calY + 3, 40, 46, WHITE);
  drawText(cv, calX + 11, calY + 8, "26", 2, RED, true);
  drawText(cv, calX + 10, calY + 30, "NOV", 1, INK, true);

  let y = 30;
  drawCentred(cv, W / 2, y, "THE WORLD IN ONE DAY", 4, INK, true);
  y += 34;
  cv.hline(M, y, CW, INK);
  cv.hline(M, y + 2, CW, INK);
  y += 10;
  drawCentred(cv, W / 2, y, "THURSDAY 26 NOVEMBER 2026", 3, RED, true);
  y += 26;
  drawCentred(
    cv,
    W / 2,
    y,
    "40 STORIES  •  9 REGIONS  •  EVERY STORY FIRST REPORTED TODAY",
    1,
    BLUE,
    true,
  );
  y += 14;
  cv.hline(M, y, CW, INK);
  cv.hline(M, y + 2, CW, INK);

  // ----- lead stories -----
  y += 10;
  const leadY = y;
  const leadH = 78;
  const leadW = Math.floor((CW - 14) / 2);
  const leads = [
    { tag: "LEAD — MIDDLE EAST", head: "HOUTHIS HIT RAS TANURA", detail: "Yemen's Houthis say they struck Saudi Arabia's biggest oil refinery; fires reported at the plant." },
    { tag: "LEAD — SOUTH ASIA", head: "MUMBAI REMEMBERS 26/11", detail: "India marks 18 years since the 2008 attacks — and 77 years of its Constitution — on the same day." },
  ];
  for (let i = 0; i < 2; i++) {
    const x = M + i * (leadW + 14);
    cv.rect(x, leadY, leadW, leadH, LIGHT);
    cv.rect(x, leadY, leadW, 3, RED);
    drawText(cv, x + 10, leadY + 9, leads[i].tag, 1, RED, true);
    drawText(cv, x + 10, leadY + 24, leads[i].head, 2, INK, true);
    const dl = wrap(leads[i].detail, leadW - 20, 1);
    for (let li = 0; li < dl.length; li++) drawText(cv, x + 10, leadY + 48 + li * 10, dl[li], 1, INK);
  }
  y = leadY + leadH + 10;
  cv.hline(M, y, CW, INK);
  y += 8;

  // ----- story grid: 3 columns -----
  const gap = 16;
  const colW = Math.floor((CW - 2 * gap) / 3);
  const gridTop = y;
  const gridBottom = 852;
  for (let ci = 0; ci < 3; ci++) {
    const x = M + ci * (colW + gap);
    let cy = gridTop;
    for (const region of COLUMNS[ci]) {
      const list = STORIES.filter((s) => s.region === region);
      // region header bar
      cv.rect(x, cy, colW, 20, INK);
      drawText(cv, x + 8, cy + 6, region, 1, WHITE, true);
      const count = `${list.length} STORIES`;
      drawText(cv, x + colW - 8 - textWidth(count, 1), cy + 6, count, 1, GOLD, true);
      cy += 26;
      for (const st of list) {
        // red tick
        cv.rect(x, cy + 1, 4, 12, RED);
        const hl = wrap(st.head, colW - 12, 1);
        for (let li = 0; li < hl.length; li++)
          drawText(cv, x + 10, cy + li * 10, hl[li], 1, INK, true);
        cy += hl.length * 10;
        const dl = wrap(st.detail, colW - 12, 1);
        for (let li = 0; li < dl.length; li++)
          drawText(cv, x + 10, cy + li * 10, dl[li], 1, GREY);
        cy += dl.length * 10 + 7;
      }
      cy += 2;
    }
    void gridBottom;
  }

  // ----- world map band: dot map left, by-the-numbers right -----
  const my = 796;
  cv.hline(M, my, CW, INK);
  drawText(cv, M, my + 8, "THE WORLD AT A GLANCE", 1, RED, true);
  drawText(
    cv,
    M + textWidth("THE WORLD AT A GLANCE", 1) + 12,
    my + 8,
    "— 9 REGIONS, 40 STORIES  •  RED DOTS: THE TWO LEAD STORIES",
    1,
    GREY,
  );
  const mapW = 500;
  const mapH = 86;
  drawMap(cv, M, my + 22, mapW, mapH);
  // stats panel
  const px = M + mapW + 16;
  const pw = CW - mapW - 16;
  cv.rect(px, my + 22, pw, mapH, LIGHT);
  drawText(cv, px + 10, my + 28, "BY THE NUMBERS", 1, RED, true);
  const stats: Array<[string, string]> = [
    ["40", "STORIES"],
    ["9", "REGIONS"],
    ["7", "TIMELINE EVENTS"],
    ["2", "LEAD STORIES"],
  ];
  for (let i = 0; i < 4; i++) {
    const sx = px + 10 + (i % 2) * Math.floor(pw / 2);
    const sy = my + 44 + Math.floor(i / 2) * 26;
    drawText(cv, sx, sy, stats[i][0], 3, INK, true);
    drawText(cv, sx + textWidth(stats[i][0], 3) + 8, sy + 6, stats[i][1], 1, BLUE, true);
  }

  // ----- UTC timeline -----
  const ty = 906;
  cv.hline(M, ty, CW, INK);
  drawTimeline(cv, M, ty + 4, CW);

  // ----- footer -----
  const fy = 972;
  cv.hline(M, fy, CW, INK);
  cv.hline(M, fy + 2, CW, INK);
  drawCentred(
    cv,
    W / 2,
    fy + 10,
    "40 STORIES DRAWN  •  9 REGIONS  •  MAP + TIMELINE INSIDE",
    1,
    BLUE,
    true,
  );
  drawCentred(
    cv,
    W / 2,
    fy + 24,
    "SOURCES: LIVE NEWS REPORTS OF 26 NOVEMBER 2026  •  DRAWN ENTIRELY BY CODE — NO PHOTOS  •  MAKE.FUN NEWS-IMAGE-20261126",
    1,
    GREY,
  );

  return cv;
}

function main(): void {
  const cv = drawPoster();
  // Newsprint speckle: deterministic light dots over the whole sheet.
  const rand = mulberry32(26112026);
  const speck: RGB = [224, 216, 192];
  for (let i = 0; i < W * H; i++) {
    if (rand() < 0.08) cv.set(i % W, Math.floor(i / W), speck);
  }
  const png = encodePNG(W, H, cv.px);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "entry.png");
  writeFileSync(out, png);
  console.log(`wrote ${out} ${png.length} bytes (${W}x${H}), ${STORIES.length} stories, ${REGIONS.length} regions`);
}

main();
