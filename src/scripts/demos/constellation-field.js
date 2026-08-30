/**
 * Constellation field — drifting points of knowledge that link up into a graph
 * and periodically assemble into named constellations.
 *
 * Ported from the magicspells.io Puzzle component
 * (app/components/landings/ConstellationField.pzl) into a dependency-free ESM
 * module. Pure canvas 2D, no globals, safe to instantiate more than once.
 *
 *   import initConstellationField from '@/scripts/demos/constellation-field.js';
 *   const field = initConstellationField(canvasEl);
 *   // later
 *   field.destroy();
 *
 * `canvas` must already fill its parent via CSS (width/height 100%); this
 * module owns the backing store (DPR-scaled) and re-measures on resize. The
 * canvas also needs `pointer-events` left enabled for the hover/press response.
 *
 * ---------------------------------------------------------------------------
 * ADAPTED FOR A SMALL PANEL (see the SIZE ADAPTATION block below)
 * The original was sized to a full-bleed hero (~1440x760) sitting behind hero
 * copy and a floating header. This target is a ~600x290 (desktop) / ~330x290
 * (mobile) panel with no copy to avoid. Everything in the constants block is
 * the original, kept as the reference tuning; the derived values in
 * `measure()` scale those references to the measured stage. At hero size every
 * derived value collapses back to the original constant.
 * ---------------------------------------------------------------------------
 */

// The field commits to the night ground in both themes, so these are literal
// colors on purpose — no theme tokens.
const STAR = '214 36% 91%'; // cool starlight on the blue ground
const GOLD = '38 48% 62%';
const LINK = '222 60% 72%'; // ambient links go slate-blue; gold is for patterns

const NODES = 170;
const NODES_SM = 90; // < 768px
const BREAKPOINT = 768;
const R_MIN = 1;
const R_MAX = 2.6;
const GOLD_RATIO = 1 / 6; // gold nodes are also drawn slightly larger + glowed
const ALPHA_MIN = 0.5;
const ALPHA_MAX = 0.95;
const TWINKLE_AMP = 0.15;

const DRIFT_MIN = 8; // px/s
const DRIFT_MAX = 18;
const WANDER = 14; // random accel, px/s²
const EDGE_FADE = 44; // px of fade at the stage edge — hides the soft wrap

const LINK_DIST = 110;
const LINK_ALPHA = 0.28;

// Legibility: soft outward steering, never a hard exclusion — lines may still
// cross the copy faintly, nodes just thin out there.
const EXCL_W = 0.62; // fraction of stage width
const EXCL_H = 0.46;
const EXCL_CY = 0.46; // centered slightly above middle
const EXCL_PUSH = 26; // px/s²
const HEADER_BAND = 130; // the floating agency header sits above this
const HEADER_PUSH = 30;

const FIRST_EVENT_MS = 1200; // let the reveal land first
const MAX_EVENTS = 2; // concurrent constellations
const EVENT_GAP_PX = 320; // min anchor distance between live events
const EVENT_MIN_MS = 2500; // spawn cadence (measured from spawn, so events overlap)
const EVENT_MAX_MS = 4500;
const GATHER_MS = 1400;
const HOLD_MS = 2200;
const RELEASE_MS = 900;
const PATTERN_SCALE_MIN = 70; // half-span → ~140–200px patterns
const PATTERN_SCALE_MAX = 100;
const EDGE_ALPHA = 0.55;
const EDGE_WIDTH = 1.2;

const POINTER_R = 130;
const POINTER_PULL = 30; // px/s²
const RIPPLE_MS = 900;
const RIPPLE_R = 190;
const RIPPLE_BAND = 60; // px either side of the ring that brightens links
// Every live ripple costs one hypot per link candidate inside the O(n²) link
// loop, so rapid clicking must not be allowed to stack them up. Three reads as
// "the field is responding" and is cheap; the oldest is dropped past that.
const MAX_RIPPLES = 3;

// --- SIZE ADAPTATION -------------------------------------------------------
// Reference stage the constants above were tuned against.
const REF_SHORT = 420; // short side at which lengths hit their full value
const REF_AREA = 1440 * 760; // hero area behind NODES = 170
const DENSITY_EXP = 0.6; // sublinear: small stages keep more nodes than a
//                          straight area scale would leave them
const MIN_NODES = 34; // enough free nodes for two concurrent patterns
const HERO_H_MIN = 360; // below this there is no hero copy to steer around
const HERO_H_FULL = 620; // at/above this the exclusion zone is at full strength
const PATTERN_FIT = 0.34; // a pattern's half-span never exceeds this * short side

// Normalized point sets (roughly -1..1) + explicit edge lists.
const PATTERNS = [
	{
		// Cassiopeia-style W — 5 points, chained
		points: [
			[-1, 0.2],
			[-0.5, -0.35],
			[0, 0.25],
			[0.5, -0.4],
			[1, 0.1],
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
		],
	},
	{
		// Big-Dipper-style: 4-point bowl + 3-point handle off the top-right corner
		points: [
			[-1, -0.15],
			[-1.05, 0.35],
			[-0.5, 0.5],
			[-0.45, 0],
			[0.05, -0.15],
			[0.55, -0.15],
			[1.05, -0.45],
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[3, 4],
			[4, 5],
			[5, 6],
		],
	},
	{
		// ✦ — echoes the product wordmark glyph: center + 4 tips
		points: [
			[0, 0],
			[0, -1],
			[1, 0],
			[0, 1],
			[-1, 0],
		],
		edges: [
			[0, 1],
			[0, 2],
			[0, 3],
			[0, 4],
		],
	},
	{
		// Northern Cross (Cygnus): a long spine crossed off-center
		points: [
			[0, -0.15],
			[0.08, -1.05],
			[-0.1, 1.05],
			[-0.95, -0.3],
			[0.95, 0.02],
		],
		edges: [
			[1, 0],
			[0, 2],
			[3, 0],
			[0, 4],
		],
	},
	{
		// Winter-hexagon ring — a closed loop of six stars
		points: [
			[1, 0.05],
			[0.48, 0.9],
			[-0.55, 0.85],
			[-1, -0.08],
			[-0.45, -0.88],
			[0.52, -0.82],
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 0],
		],
	},
	{
		// Card graph — a hub with five connections, two reaching a second hop.
		points: [
			[0, 0],
			[0.75, -0.28],
			[0.05, -0.8],
			[-0.75, -0.3],
			[-0.45, 0.68],
			[0.5, 0.72],
			[1.1, -0.78],
			[-1.05, 1.02],
		],
		edges: [
			[0, 1],
			[0, 2],
			[0, 3],
			[0, 4],
			[0, 5],
			[1, 6],
			[4, 7],
		],
	},
	{
		// Orion figure — shoulders, a three-star belt, and knees
		points: [
			[-0.55, -0.92],
			[0.55, -0.85],
			[-0.22, -0.1],
			[0, 0],
			[0.22, 0.1],
			[-0.6, 0.92],
			[0.5, 0.98],
		],
		edges: [
			[0, 2],
			[1, 4],
			[2, 3],
			[3, 4],
			[2, 5],
			[4, 6],
		],
	},
	{
		// Sagitta arrow — forked tail, straight shaft, a tip
		points: [
			[-1.05, -0.4],
			[-1.05, 0.4],
			[-0.35, 0],
			[0.5, -0.05],
			[1.05, -0.12],
		],
		edges: [
			[0, 2],
			[1, 2],
			[2, 3],
			[3, 4],
		],
	},
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ destroy: () => void, pause: () => void, resume: () => void }}
 */
export default function initConstellationField(canvas) {
	const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
	if (!ctx) return { destroy() {}, pause() {}, resume() {} };

	// A second init on the same canvas would leave two rAF loops painting the
	// same context — hand back the live one instead.
	if (canvas.__constellationField) return canvas.__constellationField;

	const stage = canvas.parentElement || canvas;
	const motionQuery =
		typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-reduced-motion: reduce)')
			: null;
	let reduceMotion = motionQuery ? motionQuery.matches : false;

	let W = 0;
	let H = 0;
	let nodes = [];
	let ripples = [];
	let events = []; // up to MAX_EVENTS constellation events at once
	let nextEventAt = 0;
	let clock = 0; // seconds since mount, drives twinkle
	let last = performance.now();
	let rafId = 0;
	let resizeTimeout = 0;
	let destroyed = false;
	const pointer = { x: 0, y: 0, age: 99, on: false };

	// Derived from the measured stage — see the SIZE ADAPTATION note above.
	// `sizeK` is the length scale: 1 at/above REF_SHORT, floored at 0.5 so a
	// short panel never collapses the field into a knot.
	let sizeK = 1;
	let heroK = 1; // 0 = no hero copy to avoid, 1 = full-bleed hero behavior
	let linkDist = LINK_DIST;
	let edgeFade = EDGE_FADE;
	let pointerR = POINTER_R;
	let rippleR = RIPPLE_R;
	let rippleBand = RIPPLE_BAND;
	let eventGap = EVENT_GAP_PX;
	let patScaleMin = PATTERN_SCALE_MIN;
	let patScaleMax = PATTERN_SCALE_MAX;
	let headerBand = HEADER_BAND;

	const measure = () => {
		sizeK = clamp(Math.min(W, H) / REF_SHORT, 0.5, 1);
		heroK = clamp((H - HERO_H_MIN) / (HERO_H_FULL - HERO_H_MIN), 0, 1);

		// Absolute lengths track the stage so a small panel keeps the hero's
		// links-per-node and pattern-to-field proportions rather than turning
		// into a solid mesh.
		linkDist = LINK_DIST * sizeK;
		edgeFade = EDGE_FADE * sizeK;
		pointerR = POINTER_R * sizeK;
		rippleR = RIPPLE_R * sizeK;
		rippleBand = RIPPLE_BAND * sizeK;

		// Two live constellations must still be able to sit apart on a stage
		// whose diagonal is shorter than the original 320px gap.
		eventGap = Math.min(EVENT_GAP_PX, Math.hypot(W, H) * 0.42);

		patScaleMin = PATTERN_SCALE_MIN * sizeK;
		patScaleMax = PATTERN_SCALE_MAX * sizeK;
		// Hard fit guard: a pattern's half-span can never outgrow the stage.
		const fit = Math.max(20, Math.min(W, H) * PATTERN_FIT);
		patScaleMax = Math.min(patScaleMax, fit);
		patScaleMin = Math.min(patScaleMin, patScaleMax);

		// No hero copy and no floating header in a small panel — both legibility
		// forces ramp to a no-op. `ellipseN()` returns 2 when heroK is 0, which
		// switches off the seed rejection, the drift steering and the anchor
		// veto in one place.
		headerBand = HEADER_BAND * heroK;
	};

	// ---- field ---------------------------------------------------------
	const ellipseN = (x, y) => {
		if (heroK === 0) return 2; // exclusion zone disabled on a small stage
		const rx = (W * EXCL_W) / 2;
		const ry = (H * EXCL_H) / 2;
		const dx = (x - W / 2) / rx;
		const dy = (y - H * EXCL_CY) / ry;
		return Math.sqrt(dx * dx + dy * dy);
	};

	// Node count scales with the measured area rather than only on the 768px
	// breakpoint, but sublinearly (area^0.6) with a floor — a 600x290 panel
	// wants ~56 nodes, not the ~26 a straight area scale would give it, and it
	// needs enough free nodes to feed two concurrent patterns. NODES /
	// NODES_SM stay the ceiling, hit exactly at the reference hero size.
	// BREAKPOINT is read against the viewport, not the canvas: in the original
	// the field was full-bleed so the two were the same, but a 600px-wide panel
	// on a desktop is not a phone and should not take the phone ceiling.
	const nodeCount = () => {
		const vw = window.innerWidth || W;
		const ceiling = vw < BREAKPOINT ? NODES_SM : NODES;
		const scaled = Math.round(ceiling * Math.pow((W * H) / REF_AREA, DENSITY_EXP));
		return Math.max(MIN_NODES, Math.min(ceiling, scaled));
	};

	const seed = () => {
		const count = nodeCount();
		nodes = [];
		for (let i = 0; i < count; i++) {
			let x = Math.random() * W;
			let y = Math.random() * H;
			// a few rejections is enough to thin the copy zone without a hard hole
			for (let t = 0; t < 8 && (ellipseN(x, y) < 1 || y < headerBand); t++) {
				x = Math.random() * W;
				y = Math.random() * H;
			}
			const gold = Math.random() < GOLD_RATIO;
			const a = Math.random() * (DRIFT_MAX - DRIFT_MIN) + DRIFT_MIN;
			const dir = Math.random() * Math.PI * 2;
			nodes.push({
				x,
				y,
				vx: Math.cos(dir) * a,
				vy: Math.sin(dir) * a,
				r: Math.random() * (R_MAX - R_MIN) + R_MIN + (gold ? 0.5 : 0),
				gold,
				base: Math.random() * (ALPHA_MAX - ALPHA_MIN) + ALPHA_MIN,
				twPhase: Math.random() * Math.PI * 2,
				twRate: (Math.PI * 2) / (2 + Math.random() * 3), // 2–5s period
				member: false,
				boost: 0,
				sx: 0,
				sy: 0,
				tx: 0,
				ty: 0,
			});
		}
	};

	const fadeAt = (n) => {
		const d = Math.min(n.x, W - n.x, n.y, H - n.y);
		return d >= edgeFade ? 1 : Math.max(0, d / edgeFade);
	};

	// ---- patterns ------------------------------------------------------
	// Snaps the nearest free nodes onto a placed pattern. Returns the member
	// list (index-aligned with pattern.points) or null if the field is busy.
	const assign = (pat, cx, cy, scale, rot) => {
		const cos = Math.cos(rot);
		const sin = Math.sin(rot);
		const free = nodes.filter((n) => !n.member);
		if (free.length < pat.points.length) return null;
		const members = [];
		for (const [px, py] of pat.points) {
			const tx = cx + (px * cos - py * sin) * scale;
			const ty = cy + (px * sin + py * cos) * scale;
			let best = null;
			let bestD = Infinity;
			for (const n of free) {
				if (n.member) continue;
				const d = (n.x - tx) * (n.x - tx) + (n.y - ty) * (n.y - ty);
				if (d < bestD) {
					bestD = d;
					best = n;
				}
			}
			best.member = true;
			best.sx = best.x;
			best.sy = best.y;
			best.tx = tx;
			best.ty = ty;
			members.push(best);
		}
		return members;
	};

	const pickAnchor = (scale) => {
		const m = scale * 1.25;
		if (W < m * 2 || H < m * 2) return null;
		for (let i = 0; i < 24; i++) {
			const x = m + Math.random() * (W - m * 2);
			const y = m + Math.random() * (H - m * 2);
			if (y - m < headerBand) continue;
			if (ellipseN(x, y) < 1.25) continue; // clear of the hero copy
			if (events.some((ev) => Math.hypot(ev.anchor.x - x, ev.anchor.y - y) < eventGap)) continue;
			return { x, y };
		}
		return null;
	};

	const startEvent = () => {
		const pat = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
		const scale = patScaleMin + Math.random() * (patScaleMax - patScaleMin);
		const anchor = pickAnchor(scale);
		if (!anchor) return false;
		const members = assign(pat, anchor.x, anchor.y, scale, (Math.random() - 0.5) * 0.7);
		if (!members) return false;
		events.push({ phase: 'gather', t: 0, members, edges: pat.edges, alpha: 0, anchor });
		return true;
	};

	const stepEvent = (ev, dt) => {
		ev.t += dt * 1000;
		if (ev.phase === 'gather') {
			const t = Math.min(1, ev.t / GATHER_MS);
			const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			for (const n of ev.members) {
				n.x = n.sx + (n.tx - n.sx) * e;
				n.y = n.sy + (n.ty - n.sy) * e;
				n.boost = e * 0.3;
			}
			ev.alpha = EDGE_ALPHA * t * t;
			if (t >= 1) {
				ev.phase = 'hold';
				ev.t = 0;
			}
		} else if (ev.phase === 'hold') {
			const pulse = 0.06 * Math.sin((ev.t / 1000) * 3);
			for (const n of ev.members) {
				n.x = n.tx;
				n.y = n.ty;
				n.boost = 0.3 + pulse;
			}
			ev.alpha = EDGE_ALPHA;
			if (ev.t >= HOLD_MS) {
				ev.phase = 'release';
				ev.t = 0;
				for (const n of ev.members) {
					n.member = false;
					const dir = Math.random() * Math.PI * 2;
					const s = DRIFT_MIN + Math.random() * (DRIFT_MAX - DRIFT_MIN);
					n.vx = Math.cos(dir) * s;
					n.vy = Math.sin(dir) * s;
				}
			}
		} else {
			const t = Math.min(1, ev.t / RELEASE_MS);
			ev.alpha = EDGE_ALPHA * (1 - t);
			for (const n of ev.members) n.boost = 0.3 * (1 - t);
			if (t >= 1) {
				for (const n of ev.members) n.boost = 0;
				ev.done = true;
			}
		}
	};

	// ---- motion --------------------------------------------------------
	const drift = (dt, influence) => {
		const rx = (W * EXCL_W) / 2;
		const ry = (H * EXCL_H) / 2;
		for (const n of nodes) {
			if (n.member) continue;

			n.vx += (Math.random() - 0.5) * WANDER * dt;
			n.vy += (Math.random() - 0.5) * WANDER * dt;

			const en = ellipseN(n.x, n.y);
			if (en < 1) {
				// gradient of the ellipse field — steers straight back out
				const gx = (n.x - W / 2) / (rx * rx);
				const gy = (n.y - H * EXCL_CY) / (ry * ry);
				const gl = Math.hypot(gx, gy) || 1;
				const f = EXCL_PUSH * (1 - en) * heroK * dt;
				n.vx += (gx / gl) * f;
				n.vy += (gy / gl) * f;
			}
			if (headerBand > 0 && n.y < headerBand) {
				n.vy += HEADER_PUSH * (1 - n.y / headerBand) * heroK * dt;
			}

			if (influence > 0) {
				const dx = pointer.x - n.x;
				const dy = pointer.y - n.y;
				const d = Math.hypot(dx, dy);
				if (d < pointerR && d > 1) {
					const f = (POINTER_PULL * (1 - d / pointerR) * influence * dt) / d;
					n.vx += dx * f;
					n.vy += dy * f;
				}
			}

			const sp = Math.hypot(n.vx, n.vy) || 1;
			const clamped = Math.min(DRIFT_MAX, Math.max(DRIFT_MIN, sp));
			n.vx = (n.vx / sp) * clamped;
			n.vy = (n.vy / sp) * clamped;

			n.x += n.vx * dt;
			n.y += n.vy * dt;

			// soft wrap — fadeAt() has already dimmed the node to 0 at the edge
			const pad = R_MAX + 1;
			if (n.x < -pad) n.x = W + pad;
			else if (n.x > W + pad) n.x = -pad;
			if (n.y < -pad) n.y = H + pad;
			else if (n.y > H + pad) n.y = -pad;
		}
	};

	// ---- drawing -------------------------------------------------------
	// globalAlpha carries per-item opacity so the hot loops allocate no
	// color strings.
	const drawLinks = () => {
		ctx.strokeStyle = `hsl(${LINK})`;
		ctx.lineWidth = 1;
		for (let i = 0; i < nodes.length; i++) {
			const a = nodes[i];
			const fa = fadeAt(a);
			if (fa === 0) continue;
			for (let j = i + 1; j < nodes.length; j++) {
				const b = nodes[j];
				if (a.member && b.member) continue; // pattern edges own these
				const dx = a.x - b.x;
				if (dx > linkDist || dx < -linkDist) continue;
				const dy = a.y - b.y;
				if (dy > linkDist || dy < -linkDist) continue;
				const d = Math.hypot(dx, dy);
				if (d >= linkDist) continue;
				let al = (1 - d / linkDist) * LINK_ALPHA * fa * fadeAt(b);
				if (ripples.length) {
					const mx = (a.x + b.x) / 2;
					const my = (a.y + b.y) / 2;
					for (const rp of ripples) {
						if (Math.abs(Math.hypot(mx - rp.x, my - rp.y) - rp.r) < rippleBand) {
							al += (1 - rp.t) * 0.35;
						}
					}
				}
				if (al <= 0.004) continue;
				ctx.globalAlpha = Math.min(1, al);
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;
	};

	const drawPointerLinks = (influence) => {
		if (influence <= 0) return;
		ctx.strokeStyle = `hsl(${STAR})`;
		ctx.lineWidth = 1;
		for (const n of nodes) {
			const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
			if (d >= pointerR) continue;
			ctx.globalAlpha = (1 - d / pointerR) * 0.22 * influence * fadeAt(n);
			ctx.beginPath();
			ctx.moveTo(pointer.x, pointer.y);
			ctx.lineTo(n.x, n.y);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	};

	const drawPatterns = () => {
		for (const ev of events) {
			if (ev.alpha <= 0.01) continue;
			ctx.strokeStyle = `hsl(${GOLD})`;
			ctx.lineWidth = EDGE_WIDTH;
			ctx.globalAlpha = ev.alpha;
			ctx.beginPath();
			for (const [a, b] of ev.edges) {
				const na = ev.members[a];
				const nb = ev.members[b];
				ctx.moveTo(na.x, na.y);
				ctx.lineTo(nb.x, nb.y);
			}
			ctx.stroke();

			if (ev.phase === 'hold') {
				// a light travelling the edge list, one dot per edge
				const p = (((ev.t / 1100) % 1) + 1) % 1;
				ctx.fillStyle = `hsl(${STAR})`;
				ctx.globalAlpha = ev.alpha * 0.9;
				ctx.beginPath();
				for (const [a, b] of ev.edges) {
					const na = ev.members[a];
					const nb = ev.members[b];
					const x = na.x + (nb.x - na.x) * p;
					const y = na.y + (nb.y - na.y) * p;
					ctx.moveTo(x + 1.6, y);
					ctx.arc(x, y, 1.6, 0, Math.PI * 2);
				}
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
	};

	const drawNodes = () => {
		// two passes so fillStyle/shadow flip twice per frame, not per node
		for (const gold of [false, true]) {
			ctx.fillStyle = gold ? `hsl(${GOLD})` : `hsl(${STAR})`;
			if (gold) {
				ctx.shadowColor = `hsl(${GOLD})`;
				ctx.shadowBlur = 8;
			}
			for (const n of nodes) {
				if (n.gold !== gold) continue;
				const tw = Math.sin(clock * n.twRate + n.twPhase) * TWINKLE_AMP;
				const a = Math.min(1, Math.max(0, n.base + tw + n.boost)) * fadeAt(n);
				if (a <= 0.01) continue;
				ctx.globalAlpha = a;
				ctx.beginPath();
				ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
				ctx.fill();
			}
			if (gold) ctx.shadowBlur = 0;
		}
		ctx.globalAlpha = 1;
	};

	const drawRipples = () => {
		if (!ripples.length) return;
		ctx.strokeStyle = `hsl(${GOLD})`;
		ctx.lineWidth = 1.5;
		for (const rp of ripples) {
			ctx.globalAlpha = (1 - rp.t) * 0.5;
			ctx.beginPath();
			ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	};

	// ---- loop ----------------------------------------------------------
	const frame = (now) => {
		const dt = Math.min(50, now - last) / 1000;
		last = now;
		clock += dt;
		ctx.clearRect(0, 0, W, H);

		pointer.age += dt;
		const influence = pointer.on ? Math.max(0, 1 - Math.max(0, pointer.age - 0.5) / 0.7) : 0;

		for (let i = ripples.length - 1; i >= 0; i--) {
			const rp = ripples[i];
			rp.t += (dt * 1000) / RIPPLE_MS;
			if (rp.t >= 1) ripples.splice(i, 1);
			else rp.r = rippleR * (1 - (1 - rp.t) * (1 - rp.t));
		}

		if (events.length < MAX_EVENTS && clock * 1000 >= nextEventAt) {
			if (startEvent()) {
				nextEventAt = clock * 1000 + EVENT_MIN_MS + Math.random() * (EVENT_MAX_MS - EVENT_MIN_MS);
			} else {
				nextEventAt = clock * 1000 + 1200; // field busy — retry soon
			}
		}
		for (const ev of events) stepEvent(ev, dt);
		events = events.filter((ev) => !ev.done);
		drift(dt, influence);

		drawLinks();
		drawPointerLinks(influence);
		drawPatterns();
		drawRipples();
		drawNodes();

		rafId = requestAnimationFrame(frame);
	};

	// ---- static fallback (reduced motion) ------------------------------
	const drawStatic = () => {
		ctx.clearRect(0, 0, W, H);
		// Original floored this at 60; the floor now follows the stage so the
		// two placed patterns stay proportionate in a short panel.
		const scale = Math.min(patScaleMax, Math.max(patScaleMin, Math.min(W, H) * 0.16));
		const placed = [
			assign(PATTERNS[0], W * 0.2, H * 0.24, scale, -0.12),
			assign(PATTERNS[2], W * 0.8, H * 0.74, scale * 0.9, 0.2),
		];
		for (const members of placed) {
			if (!members) continue;
			for (const n of members) {
				n.x = n.tx;
				n.y = n.ty;
				n.boost = 0.3;
			}
		}
		drawLinks();
		ctx.strokeStyle = `hsl(${GOLD})`;
		ctx.lineWidth = EDGE_WIDTH;
		ctx.globalAlpha = EDGE_ALPHA;
		ctx.beginPath();
		placed.forEach((members, i) => {
			if (!members) return;
			for (const [a, b] of PATTERNS[i === 0 ? 0 : 2].edges) {
				ctx.moveTo(members[a].x, members[a].y);
				ctx.lineTo(members[b].x, members[b].y);
			}
		});
		ctx.stroke();
		ctx.globalAlpha = 1;
		drawNodes();
	};

	// ---- input ---------------------------------------------------------
	// The canvas rarely starts at the viewport origin — always offset by its rect.
	const toLocal = (e) => {
		const r = canvas.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};
	const onMove = (e) => {
		if (reduceMotion) return;
		const p = toLocal(e);
		pointer.x = p.x;
		pointer.y = p.y;
		pointer.age = 0;
		pointer.on = true;
	};
	const onPress = (e) => {
		if (reduceMotion) return;
		const p = toLocal(e);
		pointer.x = p.x;
		pointer.y = p.y;
		pointer.age = 0;
		pointer.on = true;
		if (ripples.length >= MAX_RIPPLES) ripples.shift(); // drop the oldest
		ripples.push({ x: p.x, y: p.y, t: 0, r: 0 });
	};
	canvas.addEventListener('pointermove', onMove);
	canvas.addEventListener('pointerdown', onPress);

	// ---- resize --------------------------------------------------------
	const resize = () => {
		if (destroyed) return;
		const r = stage.getBoundingClientRect();
		if (!r.width || !r.height) return; // not laid out yet — observer will refire
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		W = r.width;
		H = r.height;
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		measure();
		events = [];
		ripples = [];
		seed();
		if (reduceMotion) drawStatic();
	};

	// ResizeObserver (not a window listener): the wrapper can measure 0×0 at
	// mount, and RO refires once real layout lands as well as on any later
	// resize.
	const observer =
		typeof ResizeObserver === 'function'
			? new ResizeObserver(() => {
					clearTimeout(resizeTimeout);
					resizeTimeout = setTimeout(resize, 150);
				})
			: null;
	if (observer) observer.observe(stage);
	resize();

	const start = () => {
		if (destroyed || rafId || reduceMotion) return;
		last = performance.now();
		nextEventAt = clock * 1000 + FIRST_EVENT_MS;
		rafId = requestAnimationFrame(frame);
	};
	const stop = () => {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
	};

	const onMotionChange = (e) => {
		reduceMotion = e.matches;
		if (reduceMotion) {
			stop();
			events = [];
			ripples = [];
			for (const n of nodes) {
				n.member = false;
				n.boost = 0;
			}
			drawStatic();
		} else {
			seed();
			start();
		}
	};
	if (motionQuery) {
		if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
		else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
	}

	start();

	const handle = {
		// The host pauses the loop whenever this panel is off screen or the tab
		// is in the background — rAF alone reschedules itself forever.
		pause() {
			stop();
		},
		resume() {
			if (destroyed || reduceMotion || rafId) return;
			// Pick the clock back up here rather than through start(): the
			// twinkle clock and the next-event countdown carry on where they
			// were, so returning to the panel doesn't reset the show.
			last = performance.now();
			rafId = requestAnimationFrame(frame);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			if (canvas.__constellationField === handle) delete canvas.__constellationField;
			if (observer) observer.disconnect();
			stop();
			clearTimeout(resizeTimeout);
			resizeTimeout = 0;
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerdown', onPress);
			if (motionQuery) {
				if (motionQuery.removeEventListener)
					motionQuery.removeEventListener('change', onMotionChange);
				else if (motionQuery.removeListener) motionQuery.removeListener(onMotionChange);
			}
			nodes = [];
			events = [];
			ripples = [];
		},
	};

	canvas.__constellationField = handle;
	return handle;
}
