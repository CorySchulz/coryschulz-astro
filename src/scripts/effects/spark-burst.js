/**
 * Spark burst — a brief shower of gold and cream dots off the left and right
 * edges of the hero pills, fired once when the pointer enters and re-armed
 * when it leaves (pointerenter gives that for free).
 *
 * Hosts must be positioned: the two hero pills carry `relative` in the markup,
 * since the dots are absolutely placed against the button's box.
 */
import { scene, rand, pick } from '@magic-spells/animation-engine';

const SELECTOR = '.hero-actions .pill';
const PER_SIDE = 7;
const COLORS = ['var(--gold)', 'var(--gold)', 'var(--gold-bright)', 'var(--cream)'];

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// `side` is -1 for the left edge, 1 for the right.
const burst = (host, side) => {
	for (let i = 0; i < PER_SIDE; i++) {
		const dot = document.createElement('span');
		const size = rand(2, 4.5)();

		Object.assign(dot.style, {
			position: 'absolute',
			top: '50%',
			marginTop: `${-size / 2}px`,
			[side < 0 ? 'left' : 'right']: '2px',
			width: `${size}px`,
			height: `${size}px`,
			borderRadius: '50%',
			background: pick(COLORS)(),
			pointerEvents: 'none',
			willChange: 'transform, opacity',
		});
		host.appendChild(dot);

		// A cone off the edge rather than a straight line: mostly horizontal,
		// with enough spread that the handful of dots reads as a shower.
		const angle = rand(-50, 50)() * (Math.PI / 180);
		const dist = rand(20, 52)();
		const x = side * Math.cos(angle) * dist;
		const y = Math.sin(angle) * dist;

		scene()
			.frames(
				dot,
				{
					0: { opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
					60: { opacity: 0.85 },
					100: { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.3)` },
				},
				{ duration: rand(420, 680), easing: 'ease-out' }
			)
			.play()
			.then(() => dot.remove());
	}
};

document.querySelectorAll(SELECTOR).forEach((pill) => {
	pill.addEventListener('pointerenter', (e) => {
		// Touch has no hover to leave, so a burst there would only ever fire once.
		if (e.pointerType === 'touch' || reduced.matches) return;
		burst(pill, -1);
		burst(pill, 1);
	});
});
