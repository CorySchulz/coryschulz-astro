/*!
 ████████╗ █████╗ ██████╗  ██████╗ ████████╗
 ╚══██╔══╝██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
    ██║   ███████║██████╔╝██║   ██║   ██║   
    ██║   ██╔══██║██╔══██╗██║   ██║   ██║   
    ██║   ██║  ██║██║  ██║╚██████╔╝   ██║   
    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝    ╚═╝   

   Tarot Carousel v0.1.0 - beta
   A highly customizable carousel with beautiful, physics-driven animations
   Copyright 2025 Magic Spells LLC

   This software is source-available but not open source.
   See LICENSES for usage tiers and commercial terms.

   Licensed under:
      - Magic Spells Non-Commercial License (free for personal use and non-revenue projects)
      - Magic Spells Commercial License (for commercial use by entities under $1M revenue)
      - Magic Spells Enterprise License (for all use by entities with $1M+ revenue)

     Author: Cory Schulz
    Website: https://www.magicspells.io/tarot
       Repo: https://github.com/magic-spells/tarot
     Issues: https://github.com/magic-spells/tarot/issues
   Licenses: https://www.magicspells.io/licenses
*/

import { Tarot, TarotEffect } from '@magic-spells/tarot';

/**
 * spotlight2 effect - range-based implementation using the tarot-effect parent class
 *
 * creates a spotlight effect where the center slides are full scale/opacity (1.0),
 * and side slides use a single configured side scale and side opacity.
 *
 * ranges and behavior:
 * - L+→L1: far left zone (fixed side values)
 * - L1→CL1: near left transition (side → center)
 * - CL1→CR1: center spotlight zone (fixed center values)
 * - CR1→R1: near right transition (center → side)
 * - R1→R+: far right zone (fixed side values)
 */
class SpotlightEffect extends TarotEffect {
	static effectName = 'spotlight';

	static rules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: Infinity,
		loopBuffer: { left: 1, right: 1 },
	};

	constructor(ctx) {
		super(ctx);
		const _ = this;

		// visual parameters
		// center slides are always scale = 1.0 and opacity = 1.0
		// side slides use these single values
		_.sideScale = 0.9; // scale used on the sides
		_.sideOpacity = 0.5; // opacity used on the sides
		_.blurValue = 7; // blur amount in pixels for side slides

		_.init();
	}

	/**
	 * L+→L1: far left zone (fixed side values)
	 * @param {HTMLElement} slide - the slide element to transform
	 * @param {number} _percent - ignored for far ranges
	 */
	applyFarLeft(slide, _percent, frameWidths) {
		const _ = this;
		// calculate left trim based on scale reduction
		const slideWidth = frameWidths.slide;
		slide.leftWidthTrimmed = slideWidth - slideWidth * _.sideScale;
		slide.style.transformOrigin = 'center left';
		slide._scaleTransform = `scale(${_.sideScale})`;
		slide.style.opacity = _.sideOpacity;
		slide.style.filter = `blur(${_.blurValue}px)`;
	}

	/**
	 * L1→CL1: near left transition (side → center)
	 * smoothstep interpolation for nicer easing as slides approach the center
	 * @param {HTMLElement} slide - the slide element to transform
	 * @param {number} percent - 0 at L1, 1 at CL1
	 */
	applyNearLeft(slide, percent, frameWidths) {
		const _ = this;

		// account for subpixel rounding
		if (percent > 0.999) percent = 1;
		if (percent < 0.005) percent = 0;

		// smoothstep easing
		const smoothPercent = percent * percent * (3 - 2 * percent);
		// const smoothPercent = percent;

		// interpolate scale from side → 1.0
		const scale = _.sideScale + (1 - _.sideScale) * smoothPercent;

		// fast transition for blur and opacity (complete by 50% of transition)
		const fastPercent = Math.min(smoothPercent * 2, 1); // double speed, clamp at 1

		// interpolate opacity from side → 1.0 using fast transition
		const opacity = _.sideOpacity + (1 - _.sideOpacity) * fastPercent;

		// interpolate blur from blurValue → 0px using fast transition
		const blur = _.blurValue * (1 - fastPercent);

		// calculate left trim based on scale reduction
		const slideWidth = frameWidths.slide;
		slide.leftWidthTrimmed = slideWidth - slideWidth * scale;
		slide.style.transformOrigin = 'center left';
		slide._scaleTransform = `scale(${scale})`;
		slide.style.opacity = opacity;
		slide.style.filter = `blur(${blur}px)`;
	}

	/**
	 * CL1→CR1: center spotlight zone (fixed center values)
	 * @param {HTMLElement} slide - the slide element to transform
	 * @param {number} _percent - unused; all slides in zone use center values
	 */
	applyCenterSpotlight(slide, _percent) {
		// center slides use full values - no trim needed
		slide.style.transformOrigin = 'center';
		slide._scaleTransform = `scale(1)`;
		slide.style.opacity = 1;
		slide.style.filter = 'blur(0px)';
	}

	/**
	 * CR1→R1: near right transition (center → side)
	 * smoothstep interpolation to mirror the left-side approach feel
	 * @param {HTMLElement} slide - the slide element to transform
	 * @param {number} percent - 0 at CR1, 1 at R1
	 */
	applyNearRight(slide, percent, frameWidths) {
		const _ = this;

		// account for subpixel rounding
		if (percent > 0.999) percent = 1;
		if (percent < 0.005) percent = 0;

		// smoothstep easing
		const smoothPercent = percent * percent * (3 - 2 * percent);
		// const smoothPercent = percent;

		// interpolate scale from 1.0 → side
		const scale = 1 + (_.sideScale - 1) * smoothPercent;

		// fast transition for blur and opacity (start at 50% of transition)
		const fastPercent = smoothPercent < 0.5 ? 0 : (smoothPercent - 0.5) * 2;

		// interpolate opacity from 1.0 → side using fast transition
		const opacity = 1 + (_.sideOpacity - 1) * fastPercent;

		// interpolate blur from 0px → blurValue using fast transition
		const blur = _.blurValue * fastPercent;

		// calculate right trim based on scale reduction
		const slideWidth = frameWidths.slide;
		slide.rightWidthTrimmed = slideWidth - slideWidth * scale;
		slide.style.transformOrigin = 'center right';
		slide._scaleTransform = `scale(${scale})`;
		slide.style.opacity = opacity;
		slide.style.filter = `blur(${blur}px)`;
	}

	/**
	 * R1→R+: far right zone (fixed side values)
	 * @param {HTMLElement} slide - the slide element to transform
	 * @param {number} _percent - ignored for far ranges
	 */
	applyFarRight(slide, _percent, frameWidths) {
		const _ = this;
		// calculate right trim based on scale reduction
		const slideWidth = frameWidths.slide;
		slide.rightWidthTrimmed = slideWidth - slideWidth * _.sideScale;
		slide.style.transformOrigin = 'center right';
		slide._scaleTransform = `scale(${_.sideScale})`;
		slide.style.opacity = _.sideOpacity;
		slide.style.filter = `blur(${_.blurValue}px)`;
	}

	/**
	 * fallback for slides outside defined ranges
	 * (should not normally run with infinity ranges)
	 * @param {HTMLElement} slide - the slide element to transform
	 */
	applyHidden(slide, frameWidths) {
		const _ = this;

		// default to side values as a safe fallback
		const slideWidth = frameWidths.slide;
		slide.rightWidthTrimmed = slideWidth - slideWidth * _.sideScale;
		slide.style.transformOrigin = 'center right';
		slide._scaleTransform = `scale(${_.sideScale})`;
		slide.style.opacity = _.sideOpacity;
		slide.style.filter = `blur(${_.blurValue}px)`;
	}

	/**
	 * Main render function called every animation frame
	 * Uses the frame-based architecture with dependency injection for utilities
	 *
	 * @param {Object} frame - Complete frame object with all carousel data
	 * @param {Array} frame.slides - Sorted slides array with calculated positions
	 * @param {Object} frame.widths - Layout measurements
	 * @param {Object} frame.state - Carousel state
	 * @param {Object} frame.animation - Animation data including trackPosition
	 * @param {Object} frame.transformPoints - Named position points
	 * @param {Object} utils - Frame utilities for position calculations
	 * @param {Function} utils.isSlideInRange - Check if slide is in range with progress
	 */
	render(frame, utils) {
		const _ = this;
		const { slides, widths, animation } = frame;

		// Spotlight effect controls both slide width and track position in DOM
		_.renderSlideWidth(widths.slide);
		_.renderTrackPosition(animation);

		// pass 1: classify each slide, compute trims and transforms
		for (let i = 0, n = slides.length; i < n; i++) {
			const slide = slides[i];

			// frame engine has already set trackPosition and centerPoint properties
			// reset derived props
			slide.leftWidthTrimmed = 0;
			slide.rightWidthTrimmed = 0;
			slide._scaleTransform = '';

			// place at its track position before trimming
			slide.renderPosition = slide.trackPosition;

			// disable transitions for smooth performance
			slide.style.transition = 'none';

			// left to right: test ranges and apply transforms using frame utils
			// Note: frame utils already handle track position conversion internally
			const farLeft = utils.isSlideInRange(slide, 'L+', 'L1');
			if (farLeft.isInRange) {
				_.applyFarLeft(slide, farLeft.percent, widths); // percent ignored
				continue;
			}

			const nearLeft = utils.isSlideInRange(slide, 'L1', 'CL1');
			if (nearLeft.isInRange) {
				_.applyNearLeft(slide, nearLeft.percent, widths);
				continue;
			}

			const centerSpotlight = utils.isSlideInRange(slide, 'CL1', 'CR1');
			if (centerSpotlight.isInRange) {
				_.applyCenterSpotlight(slide, centerSpotlight.percent);
				continue;
			}

			const nearRight = utils.isSlideInRange(slide, 'CR1', 'R1');
			if (nearRight.isInRange) {
				_.applyNearRight(slide, nearRight.percent, widths);
				continue;
			}

			const farRight = utils.isSlideInRange(slide, 'R1', 'R+');
			if (farRight.isInRange) {
				_.applyFarRight(slide, farRight.percent, widths); // percent ignored
				continue;
			}

			// fallback (should not hit with infinity ranges)
			_.applyHidden(slide, widths);
		}

		// pass 2: accumulate right trims and shift slides left
		let totalRightTrim = 0;
		for (let i = 0, n = slides.length; i < n; i++) {
			const slide = slides[i];
			totalRightTrim += slide.rightWidthTrimmed || 0;
			slide.renderPosition -= totalRightTrim;
		}

		// pass 3: accumulate left trims and apply transforms to DOM
		let totalLeftTrim = 0;
		for (let i = slides.length - 1; i >= 0; i--) {
			const slide = slides[i];
			totalLeftTrim += slide.leftWidthTrimmed || 0;
			slide.renderPosition += totalLeftTrim;

			// commit transforms
			slide.style.transform =
				`translateX(${slide.renderPosition}px) ` + `${slide._scaleTransform || ''}`;
		}
	}

	/**
	 * Cleanup method called when the effect is destroyed.
	 */
	destroy() {
		super.destroy();
		const _ = this;

		// slides are now DOM elements directly, not wrapper objects
		const slides = _.ctx.store.getSlides() || [];
		for (let i = 0; i < slides.length; i++) {
			const slide = slides[i];
			if (slide && slide.style) {
				slide.style.transform = '';
				slide.style.opacity = '';
				slide.style.transition = '';
				slide.style.transformOrigin = '';
				slide.style.filter = '';
			}
		}
	}
}

// Smart auto-registration - works with ESM bundlers and CDN/UMD
if (typeof Tarot !== 'undefined') {
	Tarot.registerEffect(SpotlightEffect);
}

export { SpotlightEffect as default };
