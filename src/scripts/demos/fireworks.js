import './fireworks.css';
import { timeline, viewTrigger } from '@magic-spells/timeline-engine';

// ==========================================================================
// fireworks — a live @magic-spells/timeline-engine specimen, shown as the
// thing it actually is: a track panel.
//
// Three mortars climb, burst and rain down over a drifting sky. The panel
// underneath IS the timeline — one lane per target, one bar per clip,
// positioned and sized by each clip's real `at`, `duration` and `stagger` on a
// shared 0 → tl.duration axis, with a playhead that tracks the engine live.
//
// Three things it is built to prove, in order:
//
//   1. A TIMELINE IS DATA. `CLIPS` below is the single source of truth. The
//      same array builds the timeline AND the ruler, the markers and the
//      lanes, so a clip cannot exist in the motion without a bar in the panel
//      — and `DURATION`, the labels and the lane packing are all derived
//      from it.
//
//   2. A TIMELINE IS A PURE FUNCTION OF TIME. Anything can own the playhead:
//      the clock (`loop: true`), the scrub track, or your cursor. Sweep the
//      sky backwards and every burst implodes while its mortar falls back to
//      earth — the same frame always renders the same picture, however you
//      got there.
//
//   3. PURE DOESN'T MEAN IDENTICAL. Every keyframe here is a constant, yet no
//      two loops look alike: the launch point, the burst hue and the throw
//      radius are CSS custom properties the keyframes animate *relative to*
//      (`--r` travels along `--spread * --burst`, the spark colour reads the
//      shell's `--hue`). reseat() re-rolls them at the wrap, while every
//      element is still at opacity 0, so the timeline never rebuilds and the
//      change is invisible. The engine stays deterministic; the sky doesn't.
//
// Ported from the Puzzle component of the same name: the template became DOM
// building code, the Tailwind utilities became real rules in fireworks.css.
// ==========================================================================

// ---- seeded sky ---------------------------------------------------------
// A tiny LCG, not Math.random(): the sky's geometry is generated rather than
// authored, and a generated sky that changed shape between renders (or between
// two instances on one page) would be a different demo every time. Math.imul
// keeps the multiply exactly 32-bit, so every engine walks the same sequence.
let seed = 20260818;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
const between = (min, max) => min + rnd() * (max - min);

const STAR_COUNT = 22;
const CLOUD_COUNT = 3;
const SPARK_COUNT = 16;

// Where the three mortars sit by default, in % of the sky. reseat() jitters
// around these on every loop rather than picking anywhere at all — random
// enough to never repeat, bounded enough that shells never overlap or throw
// their sparks out through the frame edge.
const SHELL_SLOTS = [
	{ x: 24, y: 44 },
	{ x: 51, y: 30 },
	{ x: 77, y: 48 },
];
const JITTER_X = 18; // total spread, %
const JITTER_Y = 14;

// The neon triad — cyan, pink, gold. A loop picks one per shell and detunes
// it, so the sky stays on-palette while never firing the same colour pair
// twice in a row.
const HUES = [186, 296, 42];
const HUE_DETUNE = 26;

// ---- the choreography ---------------------------------------------------

const RISE = 620; // mortar climb, ms
const LIFE = 900; // spark life after the burst, ms
const AMBIENT = 3450;
const SHELL_STARTS = [0, 980, 1900];

// Lane identity: clip target → display label + the hue its bars are tinted
// with. Declaration order is lane order in the panel.
const TARGETS = {
	stars: { label: 'stars', color: 'hsl(186 74% 60%)' },
	clouds: { label: 'clouds', color: 'hsl(212 42% 58%)' },
	trail: { label: 'mortar', color: 'hsl(38 48% 60%)' },
	flash: { label: 'flash', color: 'hsl(0 0% 82%)' },
	sparkFly: { label: 'sparks', color: 'hsl(296 62% 66%)' },
	sparkFall: { label: 'gravity', color: 'hsl(186 74% 60%)' },
};

// One shell's four clips. `shell` selects which mortar's elements the clip
// binds to; `count` is how many elements that is, which is what makes the
// panel's stagger arithmetic exact without touching the DOM.
const shellClips = (at, i) => {
	const burst = at + RISE;
	const act = `shell ${i + 1}`;
	return [
		{
			target: 'trail',
			shell: i,
			act,
			name: 'climb',
			at,
			duration: RISE,
			easing: 'ease-out',
			count: 1,
			keyframes: {
				0: { opacity: '0', transform: 'translate(-50%, -50%) translateY(150px) scaleY(0.45)' },
				12: { opacity: '1', transform: 'translate(-50%, -50%) translateY(136px) scaleY(1)' },
				82: { opacity: '1', transform: 'translate(-50%, -50%) translateY(6px) scaleY(0.72)' },
				100: { opacity: '0', transform: 'translate(-50%, -50%) translateY(0px) scaleY(0.3)' },
			},
		},
		{
			target: 'flash',
			shell: i,
			act,
			name: 'burst',
			at: burst,
			duration: 260,
			easing: 'ease-out',
			count: 1,
			keyframes: {
				0: { opacity: '1', transform: 'translate(-50%, -50%) scale(0)' },
				100: { opacity: '0', transform: 'translate(-50%, -50%) scale(1.6)' },
			},
		},
		{
			// `--r` is the raw throw; the spark's own transform multiplies it by
			// `--spread` (fixed per spark) and `--burst` (re-rolled per loop), so
			// one constant keyframe yields 16 different distances that change every
			// time round without the clip knowing anything about it.
			target: 'sparkFly',
			shell: i,
			act,
			name: 'radial',
			at: burst,
			duration: LIFE,
			easing: 'ease-out',
			stagger: 7,
			count: SPARK_COUNT,
			keyframes: {
				0: { '--r': '0px', '--spark-scale': '1' },
				100: { '--r': '88px', '--spark-scale': '0.4' },
			},
		},
		{
			target: 'sparkFall',
			shell: i,
			act,
			name: 'gravity',
			at: burst,
			duration: LIFE,
			easing: 'ease-in',
			stagger: 7,
			count: SPARK_COUNT,
			keyframes: {
				// 0% must be fully transparent: fill 'both' holds this frame for all
				// time BEFORE the burst, so anything above 0 leaves the sparks parked
				// on the launch pad while the mortar is still climbing.
				0: { '--g': '0px', opacity: '0' },
				2: { opacity: '1' },
				72: { opacity: '0.82' },
				100: { '--g': '84px', opacity: '0' },
			},
		},
	];
};

// THE source of truth. The two ambient clips carry no `act` — they run the
// whole length rather than belonging to a moment, so they get no marker. Both
// end on their own first frame, which is what makes `loop: true` seamless:
// the wrap has nothing to snap back.
const CLIPS = [
	{
		target: 'stars',
		shell: null,
		act: null,
		name: 'twinkle',
		at: 0,
		duration: AMBIENT,
		easing: 'linear',
		stagger: 6,
		count: STAR_COUNT,
		keyframes: {
			0: { opacity: '0.18', transform: 'scale(0.82)' },
			45: { opacity: '0.5', transform: 'scale(1)' },
			100: { opacity: '0.18', transform: 'scale(0.82)' },
		},
	},
	{
		target: 'clouds',
		shell: null,
		act: null,
		name: 'drift',
		at: 0,
		duration: AMBIENT,
		easing: 'linear',
		stagger: 60,
		count: CLOUD_COUNT,
		keyframes: {
			0: { opacity: '0.10', transform: 'translateX(-46px) scale(0.95)' },
			50: { opacity: '0.20', transform: 'translateX(46px) scale(1.06)' },
			100: { opacity: '0.10', transform: 'translateX(-46px) scale(0.95)' },
		},
	},
	...SHELL_STARTS.flatMap(shellClips),
];

// A staggered clip's lane runs until its LAST element finishes, which is later
// than at + duration — the same sum tl.duration uses internally.
const endOf = (c) => c.at + c.duration + (c.stagger || 0) * ((c.count || 1) - 1);

// Derived, never typed twice.
const DURATION = CLIPS.reduce((max, c) => Math.max(max, endOf(c)), 0);

// Derived label set: each act is named at the earliest `at` of its clips.
// Fed to tl.label() AND drawn as the marker row.
const MARKS = (() => {
	const firstAt = new Map();
	for (const c of CLIPS) {
		if (!c.act) continue;
		if (!firstAt.has(c.act) || c.at < firstAt.get(c.act)) firstAt.set(c.act, c.at);
	}
	return [...firstAt.entries()]
		.map(([name, at]) => ({ name, at }))
		.sort((a, b) => a.at - b.at);
})();

// Lane packing. One lane per target normally; where a target's clips overlap
// in time — which the three shells' spark tails do, on purpose, so two bursts
// share the sky — the later clip drops to its own lane rather than being drawn
// underneath the first. Same thing a real editor does.
function buildLanes() {
	const lanes = [];
	for (const key of Object.keys(TARGETS)) {
		const mine = CLIPS.filter((c) => c.target === key).sort((a, b) => a.at - b.at);
		if (!mine.length) continue;
		const packed = [];
		for (const clip of mine) {
			let lane = packed.find((l) => endOf(l[l.length - 1]) <= clip.at);
			if (!lane) {
				lane = [];
				packed.push(lane);
			}
			lane.push(clip);
		}
		for (const [i, lane] of packed.entries()) {
			lanes.push({ target: key, index: i, clips: lane });
		}
	}
	return lanes;
}

const LANES = buildLanes();

// Ruler resolution: four even divisions of the whole timeline.
const TICK_DIVISIONS = 4;

// Keyboard seek increments, in ms.
const STEP = 50;
const BIG_STEP = 500;

// A frame worth freezing on for anyone who asked for reduced motion: shell two
// mid-burst, with shell one's sparks still falling.
const POSTER = SHELL_STARTS[1] + RISE + 240;

const pct = (ms) => `${((ms / DURATION) * 100).toFixed(3)}%`;

// Keeps the first and last ruler captions inside the lane box instead of
// bleeding past its edges.
const alignAt = (ms) => {
	const p = ms / DURATION;
	if (p <= 0.02) return 'translateX(0)';
	if (p >= 0.98) return 'translateX(-100%)';
	return 'translateX(-50%)';
};

const fmt = (ms) => `${Math.round(ms)} / ${DURATION} ms`;
const valueTextFor = (ms) => `${Math.round(ms)} of ${DURATION} milliseconds`;

// ---- tiny DOM helpers ---------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, style) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (style) node.setAttribute('style', style);
	return node;
}

function svgEl(tag, attrs) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const key of Object.keys(attrs || {})) node.setAttribute(key, attrs[key]);
	return node;
}

const matches = (query) =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia(query).matches;

/**
 * Build the whole demo inside `root` and wire it to a live timeline.
 *
 * @param {HTMLElement} root an empty element; every node below is created here
 * @returns {{ destroy: () => void, pause: () => void, resume: () => void }}
 */
export default function initFireworks(root) {
	if (!root || typeof document === 'undefined') return { destroy() {}, pause() {}, resume() {} };

	// A second init would build a second sky inside the same root and run a
	// second timeline over it — hand back the live one instead.
	if (root.__fireworksDemo) return root.__fireworksDemo;

	root.classList.add('fw-demo');

	// ---------------------------------------------------------------- state
	let dead = false;
	let dragging = false;
	let pointerId = null;
	let userPaused = false;
	let lastTime = 0;
	let hoverScrub = false;
	let trigger = null;
	let posterShown = false;
	// Set while the host has the demo suspended (panel off screen, or hidden
	// tab). `resumeOnReturn` remembers whether it was actually playing, so a
	// paused-by-choice or reduced-motion poster doesn't spring to life on the
	// way back.
	let hostPaused = false;
	let resumeOnReturn = false;

	const listeners = [];
	const on = (target, type, handler, opts) => {
		if (!target) return;
		target.addEventListener(type, handler, opts);
		listeners.push([target, type, handler, opts]);
	};

	// ------------------------------------------------------------- the sky
	// One walk of the seeded sequence, in a fixed order, for the whole sky.
	// Reset first, so a second instance on the same page builds the identical
	// sky rather than continuing this one's stream.
	seed = 20260818;

	const sky = el('div', 'fw-sky');
	sky.setAttribute('aria-hidden', 'true');

	const starEls = [];
	for (let i = 0; i < STAR_COUNT; i += 1) {
		const star = el(
			'i',
			'fw-star',
			[
				`left: ${between(0, 100).toFixed(2)}%`,
				`top: ${between(0, 68).toFixed(2)}%`,
				`--star-size: ${between(0.9, 2).toFixed(2)}px`,
				'opacity: 0.18',
				'transform: scale(0.82)',
			].join('; ')
		);
		starEls.push(star);
		sky.appendChild(star);
	}

	const cloudEls = [];
	for (let i = 0; i < CLOUD_COUNT; i += 1) {
		const cloud = el(
			'i',
			'fw-cloud',
			[
				`left: ${(-8 + i * 38 + between(0, 9)).toFixed(2)}%`,
				`top: ${between(18, 56).toFixed(2)}%`,
				`--cloud-w: ${Math.round(between(130, 230))}px`,
				'opacity: 0.10',
				'transform: translateX(-46px) scale(0.95)',
			].join('; ')
		);
		cloudEls.push(cloud);
		sky.appendChild(cloud);
	}

	// The timeline owns ONLY what should be scrubbed. WHERE a shell launches,
	// WHAT hue it bursts in and HOW WIDE it throws are CSS custom properties
	// the keyframes animate *relative to*, which is why they can be re-rolled
	// on every loop without rebuilding a single clip.
	const shellEls = [];
	const shellParts = [];
	for (let i = 0; i < SHELL_SLOTS.length; i += 1) {
		const slot = SHELL_SLOTS[i];
		const shell = el(
			'div',
			'fw-shell',
			[
				`left: ${slot.x}%`,
				`top: ${slot.y}%`,
				`--hue: ${HUES[i % HUES.length]}`,
				'--burst: 1',
			].join('; ')
		);

		const trail = el(
			'i',
			'fw-trail',
			'opacity: 0; transform: translate(-50%, -50%) translateY(150px) scaleY(0.45);'
		);
		const flash = el('i', 'fw-flash', 'opacity: 1; transform: translate(-50%, -50%) scale(0);');
		shell.appendChild(trail);
		shell.appendChild(flash);

		const sparkFall = [];
		const sparkFly = [];
		for (let s = 0; s < SPARK_COUNT; s += 1) {
			const spark = el(
				'span',
				'fw-spark',
				[
					// Even spokes, nudged off the grid so the burst reads as a firework
					// rather than a compass rose.
					`--angle: ${(s * (360 / SPARK_COUNT) + between(-4.5, 4.5)).toFixed(2)}deg`,
					`--spread: ${between(0.78, 1.22).toFixed(3)}`,
					`--spark-size: ${between(2.4, 5).toFixed(2)}px`,
					'--g: 0px',
					'opacity: 0',
					'transform: translate(-50%, -50%) translateY(var(--g)) rotate(var(--angle))',
				].join('; ')
			);
			const dot = el('i', null, '--r: 0px; --spark-scale: 1;');
			spark.appendChild(dot);
			shell.appendChild(spark);
			// The wrapper falls under gravity, the inner dot flies out along its
			// spoke — two clips on two elements, so `--g` stays in world space
			// while `--r` travels down the rotated axis.
			sparkFall.push(spark);
			sparkFly.push(dot);
		}

		shellEls.push(shell);
		shellParts.push({ trail, flash, sparkFly, sparkFall });
		sky.appendChild(shell);
	}

	// The hover affordance says its piece once and gets out of the way.
	const hint = el('p', 'fw-hint');
	hint.textContent = 'Hover to scrub';
	sky.appendChild(hint);
	root.appendChild(sky);

	// ---------------------------------------------------------- transport
	const transport = el('div', 'fw-transport');

	const toggle = el('button', 'fw-toggle');
	toggle.type = 'button';
	toggle.setAttribute('aria-pressed', 'false');

	const iconPlay = svgEl('svg', { class: 'fw-icon', viewBox: '0 0 12 12', 'aria-hidden': 'true' });
	iconPlay.appendChild(svgEl('polygon', { points: '2,1 11,6 2,11', fill: 'currentColor' }));

	const iconPause = svgEl('svg', {
		class: 'fw-icon is-hidden',
		viewBox: '0 0 12 12',
		'aria-hidden': 'true',
	});
	iconPause.appendChild(
		svgEl('rect', { x: '2', y: '1.5', width: '2.8', height: '9', fill: 'currentColor' })
	);
	iconPause.appendChild(
		svgEl('rect', { x: '7.2', y: '1.5', width: '2.8', height: '9', fill: 'currentColor' })
	);

	const toggleLabel = el('span');
	toggleLabel.textContent = 'Play';

	toggle.appendChild(iconPlay);
	toggle.appendChild(iconPause);
	toggle.appendChild(toggleLabel);

	const readout = el('p', 'fw-readout');
	readout.setAttribute('aria-hidden', 'true');
	readout.textContent = fmt(0);

	transport.appendChild(toggle);
	transport.appendChild(readout);
	root.appendChild(transport);

	// --------------------------------------------------------- the track
	// Every row, bar and tick below is derived from the same CLIPS array fed to
	// tl.tween(), so the panel cannot drift from the choreography: change a
	// clip's `at` and both the motion and its bar move together. This is the
	// actual pitch — a timeline is inspectable data, not an opaque animation.
	const panel = el('div', 'tl-panel');

	// ruler: major ticks + seconds
	const rulerRow = el('div', 'tl-head');
	const rulerGutter = el('div', 'tl-gutter tl-gutter-time');
	rulerGutter.setAttribute('aria-hidden', 'true');
	rulerGutter.textContent = 'time';
	const ruler = el('div', 'tl-ruler');
	ruler.setAttribute('aria-hidden', 'true');
	for (let i = 0; i <= TICK_DIVISIONS; i += 1) {
		const at = (DURATION * i) / TICK_DIVISIONS;
		const tick = el('span', 'tl-tick', `left: ${pct(at)}`);
		tick.appendChild(el('span', 'tl-tick-mark'));
		const label = el('span', 'tl-tick-label', `transform: ${alignAt(at)}`);
		label.textContent = i === 0 ? '0' : `${(at / 1000).toFixed(1)}s`;
		tick.appendChild(label);
		ruler.appendChild(tick);
	}
	rulerRow.appendChild(rulerGutter);
	rulerRow.appendChild(ruler);
	panel.appendChild(rulerRow);

	// markers: the timeline's own .label() names, derived from the acts
	const markRow = el('div', 'tl-marks-row');
	const markGutter = el('div', 'tl-gutter');
	markGutter.setAttribute('aria-hidden', 'true');
	const marks = el('div', 'tl-marks');
	marks.setAttribute('aria-hidden', 'true');
	for (const m of MARKS) {
		const mark = el('span', 'tl-mark', `left: ${pct(m.at)}`);
		mark.appendChild(el('span', 'tl-mark-tick'));
		const label = el('span', 'tl-mark-label', `transform: ${alignAt(m.at)}`);
		label.textContent = m.name;
		mark.appendChild(label);
		marks.appendChild(mark);
	}
	markRow.appendChild(markGutter);
	markRow.appendChild(marks);
	panel.appendChild(markRow);

	// one row per lane: a target's clips, packed so nothing overlaps
	const clipRefs = [];
	for (const lane of LANES) {
		const tint = TARGETS[lane.target].color;
		const row = el('div', 'tl-row');
		const gutter = el('div', 'tl-gutter tl-gutter-lane');
		gutter.textContent = TARGETS[lane.target].label;
		const track = el('div', 'tl-lane');
		const bg = el('span', 'tl-lane-bg');
		bg.setAttribute('aria-hidden', 'true');
		track.appendChild(bg);

		for (const c of lane.clips) {
			const end = endOf(c);
			const bar = el(
				'div',
				'tl-clip',
				[
					`left: ${pct(c.at)}`,
					`width: ${pct(end - c.at)}`,
					`background-color: color-mix(in srgb, ${tint} 26%, transparent)`,
					`border-color: color-mix(in srgb, ${tint} 58%, transparent)`,
					`color: color-mix(in srgb, ${tint} 45%, var(--cream))`,
				].join('; ')
			);
			bar.setAttribute('aria-hidden', 'true');
			bar.textContent = c.name;
			track.appendChild(bar);
			clipRefs.push({ el: bar, at: c.at, end, live: false });
		}

		row.appendChild(gutter);
		row.appendChild(track);
		panel.appendChild(row);
	}

	// playhead: spans the ruler and every row, written imperatively
	const playheadWrap = el('div', 'tl-playhead-wrap');
	playheadWrap.setAttribute('aria-hidden', 'true');
	const playhead = el('div', 'tl-playhead', 'left: 0%');
	playheadWrap.appendChild(playhead);
	panel.appendChild(playheadWrap);

	// and the scrub surface, exactly the same box, on top
	const scrub = el('div', 'tl-scrub');
	scrub.setAttribute('role', 'slider');
	scrub.setAttribute('tabindex', '0');
	scrub.setAttribute('aria-label', 'Timeline position');
	scrub.setAttribute('aria-valuemin', '0');
	scrub.setAttribute('aria-valuemax', String(DURATION));
	scrub.setAttribute('aria-valuenow', '0');
	scrub.setAttribute('aria-valuetext', valueTextFor(0));
	panel.appendChild(scrub);

	root.appendChild(panel);

	// A margin note in the same hand as the morph panel's: the track is a
	// slider, but nothing about a flat strip says "grab me", so the arrow
	// curves up off the words and lands on it. Retired for good on the first
	// drag.
	const dragHint = el('p', 'fw-drag-hint');
	dragHint.innerHTML =
		'<svg class="fw-drag-hint-arrow" viewBox="0 0 56 72" fill="none" aria-hidden="true" focusable="false">' +
		'<path d="M48 66 C 24 58, 8 38, 14 10 M14 10 L23 19 M14 10 L4 17" stroke="currentColor" ' +
		'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
		'<span class="fw-drag-hint-text">drag here to scrub</span>';
	root.appendChild(dragHint);

	// ------------------------------------------------------- the timeline
	// Elements are passed directly (never selector strings) — selectors are
	// resolved once at clip-add time and would collide across instances.
	const targets = {
		stars: starEls,
		clouds: cloudEls,
		shells: shellParts,
	};
	const targetFor = (clip) => {
		if (clip.shell === null) return targets[clip.target];
		const shell = targets.shells[clip.shell];
		return shell ? shell[clip.target] : null;
	};

	const tl = timeline({ loop: true, defaults: { duration: 800, easing: 'ease-out' } });
	MARKS.forEach((m) => tl.label(m.name, m.at));

	for (const c of CLIPS) {
		const target = targetFor(c);
		if (!target || (Array.isArray(target) && !target.length)) continue;
		tl.tween(target, c.keyframes, {
			at: c.at,
			duration: c.duration,
			easing: c.easing,
			stagger: c.stagger || 0,
		});
	}

	const duration = tl.duration || DURATION;

	// -------------------------------------------------- playhead ↔ the UI
	// Everything here is written straight to the DOM: re-rendering the panel 60
	// times a second would fight the pointer. The timeline owns the playhead,
	// the nodes just mirror it.

	function paint(time) {
		playhead.style.left = `${((time / duration) * 100).toFixed(3)}%`;
		readout.textContent = fmt(time);
		scrub.setAttribute('aria-valuenow', String(Math.round(time)));
		scrub.setAttribute('aria-valuetext', valueTextFor(time));

		// Light the clips whose window contains the playhead. Only touch the
		// classList on a transition, so a playing timeline writes almost nothing.
		for (let i = 0; i < clipRefs.length; i += 1) {
			const clip = clipRefs[i];
			const live = time >= clip.at && time <= clip.end;
			if (live !== clip.live) {
				clip.live = live;
				clip.el.classList.toggle('is-live', live);
			}
		}
	}

	function syncToggle() {
		const playing = !!tl.playing;
		toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
		toggleLabel.textContent = playing ? 'Pause' : 'Play';
		iconPlay.classList.toggle('is-hidden', playing);
		iconPause.classList.toggle('is-hidden', !playing);
	}

	/**
	 * Re-roll everything the keyframes are relative to. Called at the loop wrap,
	 * where the whole sky is at opacity 0 and nothing is mid-flight, so a shell
	 * can teleport without a single visible frame of the move.
	 */
	function reseat() {
		for (let i = 0; i < shellEls.length; i += 1) {
			const node = shellEls[i];
			const slot = SHELL_SLOTS[i];
			if (!node || !slot) continue;
			const hue =
				HUES[Math.floor(Math.random() * HUES.length)] +
				Math.round((Math.random() - 0.5) * HUE_DETUNE);
			node.style.left = `${(slot.x + (Math.random() - 0.5) * JITTER_X).toFixed(2)}%`;
			node.style.top = `${(slot.y + (Math.random() - 0.5) * JITTER_Y).toFixed(2)}%`;
			node.style.setProperty('--hue', String(hue));
			node.style.setProperty('--burst', (0.86 + Math.random() * 0.42).toFixed(3));
		}
	}

	function play() {
		if (dead || tl.playing) return;
		// The playhead may have been left anywhere by a scrub; resume from there
		// rather than restarting, and re-baseline the wrap detector so picking up
		// mid-timeline doesn't read as a loop.
		lastTime = tl.time();
		// play() resolves on pause — a looping timeline never completes on its own.
		tl.play().then(() => {
			if (!dead) syncToggle();
		});
		syncToggle();
	}

	// Scrubbing takes the playhead off the clock — scrubbing and playing at once
	// would mean two owners of one value.
	function pauseForSeek() {
		if (tl.playing) {
			tl.pause();
			syncToggle();
		}
	}

	// The host owns "is this panel worth animating right now" — the timeline
	// loops forever, so nothing else would ever stop it in a background tab, and
	// under reduced motion the viewTrigger below is gone entirely. Both calls
	// are idempotent because the host re-syncs on every scroll and visibility
	// change.
	function hostPause() {
		if (dead || hostPaused) return;
		hostPaused = true;
		resumeOnReturn = !!tl.playing;
		if (tl.playing) {
			tl.pause();
			syncToggle();
		}
	}

	function hostResume() {
		if (dead || !hostPaused) return;
		hostPaused = false;
		const wasPlaying = resumeOnReturn;
		resumeOnReturn = false;
		if (wasPlaying && !userPaused) play();
	}

	function seekTo(ms) {
		if (dead) return;
		tl.seek(Math.min(duration, Math.max(0, ms)), { silent: true });
	}

	function seekFromPointer(event, node) {
		const rect = node.getBoundingClientRect();
		if (!rect.width) return;
		seekTo(((event.clientX - rect.left) / rect.width) * duration);
	}

	function releasePointer() {
		if (pointerId !== null && pointerId !== undefined) {
			try {
				if (scrub.hasPointerCapture && scrub.hasPointerCapture(pointerId)) {
					scrub.releasePointerCapture(pointerId);
				}
			} catch (err) {
				/* the pointer is already gone — nothing to release */
			}
		}
		pointerId = null;
		dragging = false;
	}

	// Playback drives the playhead, the readout and the lit clip bars. Our own
	// seeks emit 'update' too, which is exactly what keeps everything live while
	// scrubbing — no rAF loop of our own is needed.
	//
	// It is also where the loop is detected. `loop: true` wraps without
	// announcing itself, but time inside an iteration is monotonic, so a step
	// BACKWARDS under the clock can only be the wrap. (A scrub goes backwards
	// too, hence the `playing && !dragging` guard — re-rolling the sky mid-sweep
	// would be a visible jump, and scrubbing is the one moment the viewer is
	// watching for exactly that.)
	const onUpdate = (time) => {
		if (dead) return;
		if (time < lastTime - 1 && tl.playing && !dragging) reseat();
		lastTime = time;
		paint(time);
	};
	tl.on('update', onUpdate);

	// ---------------------------------------------------------- listeners

	on(toggle, 'click', () => {
		if (tl.playing) {
			// A deliberate pause outlasts scrolling away and back.
			userPaused = true;
			tl.pause();
			syncToggle();
		} else {
			userPaused = false;
			play();
		}
	});

	// --- hover-scrub over the sky ---------------------------------------
	// No drag, no handle: cursor X across the sky IS the playhead, which is the
	// whole point being demonstrated. Sweep left and every burst implodes while
	// its mortar drops back to earth.
	on(sky, 'pointermove', (event) => {
		if (!hoverScrub || event.pointerType === 'touch') return;
		pauseForSeek();
		seekFromPointer(event, sky);
	});

	// Pull the cursor away and play() picks it up from exactly where it was
	// left — unless the viewer had deliberately paused before hovering.
	on(sky, 'pointerleave', (event) => {
		if (!hoverScrub || event.pointerType === 'touch') return;
		if (!userPaused) play();
	});

	// --- the track --------------------------------------------------------
	on(scrub, 'pointerdown', (event) => {
		dragHint.setAttribute('data-used', '');
		pauseForSeek();
		// Capture is what guarantees the matching pointerup — and with it
		// lostpointercapture / pointercancel — comes back to this element even
		// when the pointer ends up outside the panel. Without it a drag started
		// here could never be told it had finished, leaving `dragging` latched
		// on forever and the loop-wrap reseat() permanently suppressed. So a
		// failed capture means no drag state at all: this pointerdown is just
		// the one seek below.
		try {
			scrub.setPointerCapture(event.pointerId);
			pointerId = event.pointerId;
			dragging = true;
		} catch (err) {
			pointerId = null;
			dragging = false;
		}
		scrub.focus({ preventScroll: true });
		// Stops the drag turning into a text selection or an image drag.
		event.preventDefault();
		seekFromPointer(event, scrub);
	});

	on(scrub, 'pointermove', (event) => {
		if (dragging) seekFromPointer(event, scrub);
	});

	const trackUp = () => releasePointer();
	on(scrub, 'pointerup', trackUp);
	on(scrub, 'pointercancel', trackUp);
	on(scrub, 'lostpointercapture', trackUp);

	// Keyboard path for the role="slider": arrows nudge, page keys jump,
	// Home/End pin the ends. Shift multiplies an arrow into a page step.
	on(scrub, 'keydown', (event) => {
		dragHint.setAttribute('data-used', '');
		const step = event.shiftKey ? BIG_STEP : STEP;
		const now = tl.time();
		let next = null;

		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				next = now - step;
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				next = now + step;
				break;
			case 'PageDown':
				next = now - BIG_STEP;
				break;
			case 'PageUp':
				next = now + BIG_STEP;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = duration;
				break;
			default:
				return;
		}

		event.preventDefault();
		pauseForSeek();
		seekTo(next);
	});

	// ------------------------------------------------- motion preference
	// Reduced motion never autoplays and never hover-scrubs; it paints one
	// frame worth looking at and leaves Play and the track live for anyone who
	// opts in. Play stays honest because the host's off-screen / hidden-tab
	// pause applies whether or not the viewTrigger exists. The query is watched,
	// so flipping the OS setting takes effect without a reload.
	const reduceQuery =
		typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-reduced-motion: reduce)')
			: null;

	function applyMotionPreference(initial) {
		const reduce = !!(reduceQuery && reduceQuery.matches);

		// Hover-scrub is a mouse affordance. On touch there is no hover to leave,
		// so the loop just runs and the track below stays the way in.
		hoverScrub = !reduce && matches('(hover: hover) and (pointer: fine)');
		hint.classList.toggle('is-hidden', !hoverScrub);

		if (reduce) {
			if (trigger) {
				trigger.destroy();
				trigger = null;
			}
			if (tl.playing) {
				tl.pause();
				syncToggle();
			}
			if (!posterShown) {
				posterShown = true;
				lastTime = POSTER;
				tl.seek(POSTER, { silent: true });
			}
			return;
		}

		posterShown = false;
		// Nothing is written to the DOM until the first seek: paint the start
		// frame. Off-screen the loop pauses itself — an infinite timeline has no
		// natural end to stop at.
		if (initial) tl.seek(0, { silent: true });
		// viewTrigger throws outright without IntersectionObserver. On that path
		// the demo simply mounts paused on its first frame — Play and the track
		// still work, and the host's visibility pause still applies — rather
		// than the whole mount blowing up.
		if (!trigger && typeof IntersectionObserver === 'function') {
			trigger = viewTrigger(root, {
				enter: () => {
					if (!userPaused) play();
				},
				leave: () => {
					if (tl.playing) {
						tl.pause();
						syncToggle();
					}
				},
				threshold: 0.35,
			});
		}
	}

	const onReduceChange = () => {
		if (dead) return;
		applyMotionPreference(false);
	};
	if (reduceQuery) {
		if (typeof reduceQuery.addEventListener === 'function') {
			reduceQuery.addEventListener('change', onReduceChange);
		} else if (typeof reduceQuery.addListener === 'function') {
			reduceQuery.addListener(onReduceChange);
		}
	}

	applyMotionPreference(true);
	syncToggle();

	// ------------------------------------------------------------ teardown
	const handle = {
		pause: hostPause,
		resume: hostResume,
		destroy() {
			if (dead) return;
			dead = true;
			if (root.__fireworksDemo === handle) delete root.__fireworksDemo;
			releasePointer();

			if (trigger) trigger.destroy();
			trigger = null;

			tl.off('update', onUpdate);
			tl.destroy();

			for (const [target, type, handler, opts] of listeners) {
				target.removeEventListener(type, handler, opts);
			}
			listeners.length = 0;

			if (reduceQuery) {
				if (typeof reduceQuery.removeEventListener === 'function') {
					reduceQuery.removeEventListener('change', onReduceChange);
				} else if (typeof reduceQuery.removeListener === 'function') {
					reduceQuery.removeListener(onReduceChange);
				}
			}

			clipRefs.length = 0;
			root.classList.remove('fw-demo');
			while (root.firstChild) root.removeChild(root.firstChild);
		},
	};

	root.__fireworksDemo = handle;
	return handle;
}
