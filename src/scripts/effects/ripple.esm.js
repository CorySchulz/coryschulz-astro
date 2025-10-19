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

class RippleWindow {
	#value = 0;
	#maxValue = 0;

	constructor(ctx, effect) {
		const _ = this;
		_.ctx = ctx;
		_.effect = effect;
	}

	init() {
		this.reInit();
	}

	reInit() {
		const _ = this;
		_.options = _.ctx.store.getOptions();
		const widths = _.ctx.store.getWidths();

		// locally cache some values
		_.viewportWidth = widths.viewport;
		_.gapWidth = widths.gap;
		_.slideWidth = widths.slide;
		_.slideAndGapWidth = widths.slideAndGap;

		// calculate track start position
		_.trackStartPos = widths.paddingLeft;

		// we stop tracking after end position
		_.trackEndPos = widths.viewport - widths.track + widths.gap - widths.paddingRight;
	}

	setMaxValue(maxValue) {
		this.#maxValue = maxValue;
	}

	addAmount(trackDelta, trackPos = 0) {
		const _ = this;

		// if we aren't looping
		if (!_.options.loop) {
			// track start of track reached
			if (trackPos > _.trackStartPos) return;
			// end of track reached
			if (trackPos < _.trackEndPos) return;
		}

		// not looping & transitiong back to first slide
		if (!_.options.loop && trackDelta > 0 && trackPos > -1 * _.slideWidth) {
			// subtract trackDelta to value
			_.#value -= trackDelta;

			// not looping & transitioning to last slide
		} else if (!_.options.loop && trackDelta < 0 && trackPos < _.trackEndPos + _.slideAndGapWidth) {
			_.#value -= trackDelta;

			// default - add trackDelta to value
		} else {
			_.#value += trackDelta;
		}

		// make sure we stay within bounds
		if (_.#value < 0) {
			_.#value = 0;
		} else if (_.#value > _.#maxValue) {
			_.#value = _.#maxValue;
		}
		return _.#value;
	}

	getPercent() {
		return this.#maxValue > 0 ? this.#value / this.#maxValue : 0;
	}

	snapToValue(trackDelta, trackPos) {
		const _ = this;

		// exit if already at 0 or max values
		if (_.#value === 0 || _.#value === _.#maxValue) return;

		const addSettleAmount = Math.abs(trackDelta) * 1.25;

		if (_.#value > _.#maxValue / 2) {
			_.addAmount(addSettleAmount, trackPos);
		} else {
			_.addAmount(-addSettleAmount, trackPos);
		}
	}

	destroy() {
		const _ = this;

		// clear all references for garbage collection
		_.ctx = null;
		_.effect = null;
		_.handlers = null;
	}
}

class TransformRegion {
	constructor(options) {
		const _ = this;
		const { name, color, property } = options;

		_.enabled = true;

		// primarily used this to debug
		_.name = name;

		_.property = property;
	}

	updateOptions({ startPos, endPos, startValue, endValue, enabled = true }) {
		Object.assign(this, {
			enabled,
			startPos,
			endPos,
			startValue,
			endValue,
		});
	}

	applyTransform(slide, percent, trackPos) {
		const _ = this;

		// exit if marker isn't active
		if (!_.enabled || percent === 0) return;

		// Round to nearest half-pixel to eliminate floating-point precision issues
		function roundToHalfPixel(value) {
			return Math.round(value * 2) / 2;
		}

		// normalize positions with track Pos
		trackPos *= -1;
		const startPos = roundToHalfPixel(trackPos + _.startPos);
		const endPos = roundToHalfPixel(trackPos + _.endPos);
		// Use centerPoint property which is set by frame engine
		const centerPos = roundToHalfPixel(slide.centerPoint || 0);

		let percentInRange = 0;

		// if start pos is higher than end pos (descending range)
		if (startPos > endPos) {
			// if we are in range - rounded values should eliminate precision issues
			if (centerPos >= endPos && centerPos <= startPos) {
				const range = startPos - endPos;
				const posInRange = centerPos - endPos;
				percentInRange = posInRange / range;
			}
		} else {
			// if we are in range - rounded values should eliminate precision issues
			if (centerPos >= startPos && centerPos < endPos) {
				const range = endPos - startPos;
				const posInRange = centerPos - startPos;
				percentInRange = 1 - posInRange / range;
			}
		}

		// exit if we aren't in the range
		if (percentInRange <= 0) return;

		const valueRange = _.startValue - _.endValue;
		const valueChange = percentInRange * valueRange;

		const finalValueApplied = percent * (_.endValue + valueChange);
		slide[_.property] += finalValueApplied;
	}

	destroy() {
		const _ = this;

		// clear references
		_.enabled = false;
		_.name = null;
		_.property = null;
		_.startPos = null;
		_.endPos = null;
		_.startValue = null;
		_.endValue = null;
	}
}

class RippleTransforms {
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;

		// Cache values to be updated in reInit
		_.paddingLeftWidth = 0;
		_.slideMinWidth = 0;

		// set up handler functions to bind and unbind later
		_.handlers = {
			windowResize: () => _.reInit(),
			optionsChanged: () => _.reInit(),
		};

		// left ranges
		_.leftEndToMin = new TransformRegion({
			// name: 'left end to min',
			property: 'leftWidthTrimmed',
		});

		_.leftMinToSquished = new TransformRegion({
			// name: 'left min to squished',
			property: 'leftWidthTrimmed',
		});

		_.leftSquishedToFull = new TransformRegion({
			// name: 'left squished to full',
			property: 'leftWidthTrimmed',
		});

		// Left Masked on exit
		_.leftFullToMin = new TransformRegion({
			// name: 'left full to min',
			property: 'leftWidthTrimmed',
		});

		_.leftFullToMinEnd = new TransformRegion({
			// name: 'left full to min end',
			property: 'leftWidthTrimmed',
		});

		// right transform ranges
		_.rightEndToMin = new TransformRegion({
			name: 'right width end',
			property: 'rightWidthTrimmed',
		});

		_.rightMinToSquished = new TransformRegion({
			// name: 'right min to squished',
			property: 'rightWidthTrimmed',
		});

		_.rightSquishedToFull = new TransformRegion({
			// name: 'right squished to full',
			property: 'rightWidthTrimmed',
		});

		// Right Masked on exit
		_.rightFullToMin = new TransformRegion({
			// name: 'right full to min',
			property: 'rightWidthTrimmed',
		});

		_.rightFullToMinEnd = new TransformRegion({
			// name: 'right full to min end',
			property: 'rightWidthTrimmed',
		});
	}

	init() {
		this.bindEvents();
		this.reInit();
	}

	reInit() {
		const _ = this;
		const widths = _.ctx.store.getWidths();
		
		_.viewportWidth = widths.viewport;
		_.paddingLeftWidth = widths.paddingLeft;
		_.paddingRightWidth = widths.paddingRight;
		_.slideWidth = widths.slide;
		_.gapWidth = widths.gap;
		_.slideMinWidth = widths.slideMin;
		_.trackWidth = widths.track;
		_.shiftAmount = widths.slideMin + widths.gap;

		_.calculateTransformPoints();
	}

	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.windowResize);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
	}

	calculateTransformPoints() {
		const _ = this;

		const halfSlideWidth = _.slideWidth / 2;
		const slideWidth = _.slideWidth;
		const slideAndGapWidth = _.slideWidth + _.gapWidth;
		const slideMinWidth = _.slideMinWidth;

		const minSize = (slideWidth - slideMinWidth) * -1;
		const removedAmount = (_.gapWidth + slideMinWidth) * -1;

		// calculate points for left side
		const pointL2 = halfSlideWidth + _.paddingLeftWidth;
		const pointL1 = pointL2 - slideAndGapWidth;
		const pointLMaskOut = pointL2 - slideWidth + slideMinWidth;
		const pointL3 = pointL2 + slideAndGapWidth;

		// Left transition in
		_.leftEndToMin.updateOptions({
			startPos: pointL1 - _.trackWidth,
			endPos: pointL1,
			startValue: minSize,
			endValue: minSize,
		});

		_.leftMinToSquished.updateOptions({
			startPos: pointL1,
			endPos: pointL2,
			startValue: minSize,
			endValue: removedAmount,
		});

		_.leftSquishedToFull.updateOptions({
			startPos: pointL2,
			endPos: pointL3,
			startValue: removedAmount,
			endValue: 0,
		});

		// Left masked
		_.leftFullToMin.updateOptions({
			startPos: pointLMaskOut,
			endPos: pointL2,
			startValue: minSize,
			endValue: 0,
		});

		_.leftFullToMinEnd.updateOptions({
			startPos: pointLMaskOut - _.trackWidth,
			endPos: pointLMaskOut,
			startValue: minSize,
			endValue: minSize,
		});

		// calculate points for right side
		const pointR2 = _.viewportWidth - halfSlideWidth - _.paddingRightWidth;
		const pointR1 = pointR2 - slideAndGapWidth;
		const pointR3 = pointR2 + slideAndGapWidth;
		const pointR4 = pointR3 + _.trackWidth;

		const pointRMaskOut = pointR2 + slideWidth - slideMinWidth;

		_.shiftAmount * -1;

		_.rightSquishedToFull.updateOptions({
			startPos: pointR2,
			endPos: pointR1,
			startValue: removedAmount,
			endValue: 0,
		});

		_.rightMinToSquished.updateOptions({
			startPos: pointR3,
			endPos: pointR2,
			startValue: minSize,
			endValue: removedAmount,
		});

		_.rightEndToMin.updateOptions({
			startPos: pointR4,
			endPos: pointR3,
			startValue: minSize,
			endValue: minSize,
		});

		_.rightFullToMin.updateOptions({
			startPos: pointRMaskOut,
			endPos: pointR2,
			startValue: minSize,
			endValue: 0,
		});

		_.rightFullToMinEnd.updateOptions({
			startPos: pointRMaskOut + _.trackWidth,
			endPos: pointRMaskOut,
			startValue: minSize,
			endValue: minSize,
		});
	}

	// Apply transforms to calculate width adjustments for ripple effect
	applyTransforms(slide, trackPos, percent, frame) {
		const _ = this;

		// apply left transforms
		_.leftEndToMin.applyTransform(slide, percent, trackPos);
		_.leftMinToSquished.applyTransform(slide, percent, trackPos);
		_.leftSquishedToFull.applyTransform(slide, percent, trackPos);

		_.leftFullToMin.applyTransform(slide, 1 - percent, trackPos);
		_.leftFullToMinEnd.applyTransform(slide, 1 - percent, trackPos);

		// apply right transforms
		_.rightEndToMin.applyTransform(slide, 1 - percent, trackPos);
		_.rightMinToSquished.applyTransform(slide, 1 - percent, trackPos);
		_.rightSquishedToFull.applyTransform(slide, 1 - percent, trackPos);

		_.rightFullToMin.applyTransform(slide, percent, trackPos);
		_.rightFullToMinEnd.applyTransform(slide, percent, trackPos);
		
		// Convert negative trim values to positive (width reduction)
		if (slide.leftWidthTrimmed < 0) slide.leftWidthTrimmed = Math.abs(slide.leftWidthTrimmed);
		if (slide.rightWidthTrimmed < 0) slide.rightWidthTrimmed = Math.abs(slide.rightWidthTrimmed);
	}

	// clean up our mess
	destroy() {
		const _ = this;

		// unbind events
		_.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.windowResize);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);

		// if transform regions require cleanup, call their destroy methods if available
		_.leftEndToMin?.destroy();
		_.leftMinToSquished?.destroy();
		_.leftSquishedToFull?.destroy();
		_.leftFullToMin?.destroy();
		_.leftFullToMinEnd?.destroy();
		_.rightEndToMin?.destroy();
		_.rightMinToSquished?.destroy();
		_.rightSquishedToFull?.destroy();
		_.rightFullToMin?.destroy();
		_.rightFullToMinEnd?.destroy();

		// clear references
		_.ctx = null;
		_.handlers = null;
	}
}

class RippleEffect extends TarotEffect {
	static effectName = 'ripple';

	static rules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: Infinity,
		loopBuffer: {
			left: 2,
			right: 2,
		},
	};

	constructor(ctx) {
		super(ctx);
		const _ = this;
		_.ctx = ctx;

		_.rippleWindow = new RippleWindow(ctx, _);
		_.rippleTransforms = new RippleTransforms(ctx, _);

		_.init();
	}

	init() {
		// init ripple effects
		this.rippleWindow.init();
		this.rippleTransforms.init();
	}

	reInit() {
		this.rippleWindow.reInit();
		this.rippleTransforms.reInit();
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
	 */
	render(frame, utils) {
		const _ = this;
		const { slides, widths, animation } = frame;

		// Set the max value for the ripple window based on slide widths
		_.rippleWindow.setMaxValue(widths.slide - widths.slideMin);

		// render some stuff
		_.renderTrackWidth(widths.track);
		_.renderTrackPosition(animation);
		_.renderSlideWidth(widths.slide);

		// Extract animation details from frame
		const trackPosition = animation.trackPosition;
		const trackDelta = animation.trackDelta || 0;
		const animationType = animation.type || 'jump';
		const progress = animation.progress || 1;

		// Add amount to sliding window but only with 'animate' or 'drag' movements
		if ((animationType === 'animate' || animationType === 'drag') && progress <= 1) {
			_.rippleWindow.addAmount(trackDelta, trackPosition);
		}

		// Trigger settling animation when needed
		if (animationType === 'settle' || (animationType === 'animate' && progress > 0.75)) {
			_.rippleWindow.snapToValue(trackDelta, trackPosition);
		}

		// Get transform percentage from ripple window
		const transformPercent = _.rippleWindow.getPercent();

		// Slides are already sorted by renderIndex from frame engine
		let totalRemovedRight = 0;
		let slide;

		// First pass: calculate width adjustments and positions
		for (let i = 0, n = slides.length; i < n; ++i) {
			slide = slides[i];

			// clear left and right trimmed values
			slide.rightWidthTrimmed = 0;
			slide.leftWidthTrimmed = 0;

			// Apply ripple transforms ~~~~~~~~~~~~~~~~~~~~~~~~~~~
			// there's a whole bunch of magic happening here 🪄
			//  ╰( ͡◕ ͜ʖ ͡◕ )つ──~~⚝⚝⚝★★★🌟✨✨✨⚡⚡⚡💥💥💥🔥🔥🔥⚝:・ﾟ*~~~~~
			_.rippleTransforms.applyTransforms(slide, trackPosition, transformPercent, frame);

			// Calculate final display width
			const displayWidth = widths.slide - slide.rightWidthTrimmed - slide.leftWidthTrimmed;
			slide.style.transition = 'none';
			slide.style.width = `${displayWidth}px`;

			// Calculate position with accumulated right trim
			// subtract the totalRemovedRight from track postion to pull
			// the right slides towards the center
			slide.renderPosition = slide.trackPosition - totalRemovedRight;

			// Add to cumulative shift
			totalRemovedRight += slide.rightWidthTrimmed;
		}

		// Second pass: handle left offset and apply transforms
		let totalRemovedLeft = 0;
		for (let k = slides.length - 1; k >= 0; --k) {
			slide = slides[k];
			// Add left width removed to total removed left
			totalRemovedLeft += slide.leftWidthTrimmed;
			// add the totalRemovedLeft from track postion to pull
			// the left slides towards the center
			slide.renderPosition += totalRemovedLeft;
			// Update position on track for all slides
			slide.style.transform = `translateX(${slide.renderPosition}px)`;
		}
	}

	destroy() {
		super.destroy();
		const _ = this;

		// call destroy on subcomponents
		_.rippleWindow?.destroy();
		_.rippleTransforms?.destroy();

		// Clean up slide styles
		const slides = _.ctx.store.getSlides() || [];
		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i];
			if (!slide || !slide.style) continue;
			slide.removeAttribute('aria-hidden');
			slide.style.width = '';
			slide.style.transform = '';
			slide.style.transition = '';
		}

		// clear references for garbage collection
		_.rippleWindow = null;
		_.rippleTransforms = null;
	}
}


// Smart auto-registration - works with ESM bundlers and CDN/UMD
if (typeof Tarot !== 'undefined') {
  Tarot.registerEffect(RippleEffect);
}

export { RippleEffect as default };
