/**
 * Spotlights — the two beams standing in the page's bottom corners sweep
 * slowly past the contact form, premiere-searchlight style.
 *
 * The wedges themselves are styles/components/spotlights.css; this file only
 * owns the motion. One looping timeline drives both beams, with different
 * out/back leg lengths so the pair drifts in and out of phase instead of
 * mirroring, and viewTrigger keeps the ticker asleep until the footer is
 * actually on screen.
 */
import { timeline, viewTrigger } from '@magic-spells/timeline-engine';

const layer = document.querySelector('.spotlights');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// Reduced motion keeps the static angles the stylesheet paints: no timeline is
// built, so no inline transform ever lands on the beams.
if (layer && !reduced.matches) {
	// Both beams share one 10.4s wrap so the loop is seamless, but split it
	// unevenly — left leans out slow and returns quick, right does the reverse.
	const tl = timeline({ loop: true });

	tl.tween(
		'.spotlight-left',
		{
			0: { transform: 'rotate(16deg)', opacity: '0.85' },
			100: { transform: 'rotate(43deg)', opacity: '1' },
		},
		{ at: 0, duration: 5600, easing: 'ease-in-out' }
	)
		.tween(
			'.spotlight-left',
			{
				0: { transform: 'rotate(43deg)', opacity: '1' },
				100: { transform: 'rotate(16deg)', opacity: '0.85' },
			},
			{ at: 5600, duration: 4800, easing: 'ease-in-out' }
		)
		.tween(
			'.spotlight-right',
			{
				0: { transform: 'rotate(-41deg)', opacity: '1' },
				100: { transform: 'rotate(-14deg)', opacity: '0.82' },
			},
			{ at: 0, duration: 6200, easing: 'ease-in-out' }
		)
		.tween(
			'.spotlight-right',
			{
				0: { transform: 'rotate(-14deg)', opacity: '0.82' },
				100: { transform: 'rotate(-41deg)', opacity: '1' },
			},
			{ at: 6200, duration: 4200, easing: 'ease-in-out' }
		);

	// Nothing is written to the DOM until the first seek: paint frame zero so
	// the beams arrive at their start angles rather than the CSS ones.
	tl.seek(0, { silent: true });

	// An infinite timeline has no natural end to stop at, so the loop is only
	// ever running while the corner it lives in is visible.
	if (typeof IntersectionObserver === 'function') {
		viewTrigger(layer, {
			enter: () => tl.play(),
			leave: () => tl.pause(),
			threshold: 0.05,
		});
	}
}
