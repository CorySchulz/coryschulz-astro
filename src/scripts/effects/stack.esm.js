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
 * StackEffect creates a card stack visualization where slides appear stacked on top of each other.
 *
 * The effect shows 3 slides visible:
 * - Top slide: 100% scale, center position, highest z-index (fully visible)
 * - Second slide: 95% scale, offset position, medium z-index (peek behind top)
 * - Third slide: 90% scale, further offset, lowest z-index (peek behind second)
 * - Fourth slide: Transitions from invisible to third position (R4→R3 range)
 *
 * Stack can be oriented in 4 directions (top, right, bottom, left) with slides peeking out
 * in the specified direction. As the carousel moves, slides smoothly transition through
 * the stack positions using TarotEffect range helpers.
 *
 * The stack uses "centered stacking" where the visual center remains stable as slides
 * scale and offset, creating a polished card deck effect.
 */
class StackEffect extends TarotEffect {
	static effectName = 'stack';

	/**
	 * Effect configuration rules that define carousel behavior constraints
	 */
	static rules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: 1,
		loopBuffer: { left: 0, right: 3 }, // Stack shows preview cards on the right
	};

	/**
	 * Creates a new stack effect instance
	 * @param {Object} ctx - The shared context object
	 */
	constructor(ctx) {
		super(ctx);
		const _ = this;

		// Stack visual configuration
		_.stackDirection = 'right'; // Direction slides peek: 'top', 'right', 'bottom', 'left'
		_.stackOffset = 28; // Pixels to offset each stack level
		_.topSlideBaseScale = 1; // Base scale for top slide (80% to leave animation room)
		_.secondSlideRelativeScale = 0.92; // Second slide scale relative to top (95%)
		_.thirdSlideRelativeScale = 0.83; // Third slide scale relative to top (90%)
		_.fourthSlideRelativeScale = 0.83; // Fourth slide scale relative to top (85%)

		_.init();
	}

	init() {
		super.init();
		this.applyStackSpacing();
	}

	reInit() {
		super.reInit();
		this.applyStackSpacing();
	}

	// Calculate total space needed for stack previews (3 stack levels × offset)
	applyStackSpacing() {
		const reserveSpace = this.stackOffset * 2 + 10;
		this.ctx.viewport.style.setProperty('--stack-peek-reserve', `${reserveSpace}px`);
	}

	/**
	 * Main render function called every animation frame to position slides in the stack
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

		// Stack effect uses calculated slide width, track position is virtual only
		_.renderSlideWidth(widths.slide);
		// Note: renderTrackPosition() not called - track DOM position irrelevant for stack

		// Process each slide to determine its stack position
		for (let slideIndex = 0, totalSlides = slides.length; slideIndex < totalSlides; slideIndex++) {
			const slide = slides[slideIndex];

			// Frame engine has already set trackPosition and centerPoint properties

			// Determine which stack position this slide is currently in using frame utils
			const exitingCard = utils.isSlideInRange(slide, 'CL1', 'L1');
			if (exitingCard.isInRange) {
				// L1 → CL1: Exiting card (grows, fades out, z-index 0 - on top during exit)
				_.applyExitingCardPosition(slide, exitingCard.percent);
				continue;
			}

			const topCard = utils.isSlideInRange(slide, 'R1', 'CL1');
			if (topCard.isInRange) {
				// CL1 → R1: Top card (center, main card, z-index -1)
				_.applyTopCardPosition(slide, topCard.percent);
				continue;
			}

			const secondCard = utils.isSlideInRange(slide, 'R2', 'R1');
			if (secondCard.isInRange) {
				// R1 → R2: Second card (slightly smaller, slight offset, z-index -2)
				_.applySecondCardPosition(slide, secondCard.percent);
				continue;
			}

			const thirdCard = utils.isSlideInRange(slide, 'R3', 'R2');
			if (thirdCard.isInRange) {
				// R3 → R2: Third card (appearing from behind, sliding to third position)
				_.applyThirdCardPosition(slide, thirdCard.percent);
				continue;
			}

			// Outside visible stack range (beyond R3 or L1)
			_.applyHiddenState(slide);
		}
	}

	/**
	 * Apply positioning for exiting cards (L1 → CL1)
	 * Cards rotate 90° upward and disappear, like lifting a card off the deck
	 *
	 * @param {HTMLElement} slide - The slide element to transform
	 * @param {number} transitionPercent - Progress through transition (0 = at L1, 1 = at CL1)
	 */
	applyExitingCardPosition(slide, transitionPercent) {
		const _ = this;

		// account for subpixel rounding
		if (transitionPercent > 0.995) transitionPercent = 1;
		if (transitionPercent < 0.005) transitionPercent = 0;

		// Keep constant scale - no growing
		const finalScale = _.topSlideBaseScale;

		// Exiting card stays centered (no stack offset)
		const offsetX = 0;
		const offsetY = 0;

		// Rotate 90 degrees upward as it exits (0° → 90°)
		const maxRotation = -90; // degrees
		const rotateAmount = (1 - transitionPercent) * maxRotation; // Reverse: 90° → 0°

		// Safari fix: Force stacking context with transform3d and explicit z-index positioning
		// Use constant minimal translateZ value for exiting cards (highest layer)
		const translateZ = 0.004;

		slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale}) rotateY(${rotateAmount}deg)`;
		slide.style.transformOrigin = 'left center'; // Rotate from left edge like butterfly effect
		slide.style.zIndex = 10; // Highest z-index (on top during exit)
		slide.style.opacity = 1;
		slide.style.display = 'block';

		// Safari fix: Ensure proper stacking context by setting transform-style
		slide.style.transformStyle = 'preserve-3d';
	}

	/**
	 * Apply positioning for the top card (CL1 → R1)
	 * Transitions from center position to second card position
	 *
	 * @param {HTMLElement} slide - The slide element to transform
	 * @param {number} transitionPercent - Progress through transition (0 = at CL1, 1 = at R1)
	 */
	applyTopCardPosition(slide, transitionPercent) {
		const _ = this;

		// account for subpixel rounding
		if (transitionPercent > 0.995) transitionPercent = 1;
		if (transitionPercent < 0.005) transitionPercent = 0;

		// Interpolate scale: CL1 scale → R1 scale
		const startScale = _.topSlideBaseScale; // CL1 scale (full size)
		const endScale = _.topSlideBaseScale * _.secondSlideRelativeScale; // R1 scale (second card size)
		const finalScale = startScale + (endScale - startScale) * transitionPercent;

		// Interpolate offset: CL1 offset → R1 offset
		const startOffsetMultiplier = 0; // CL1 offset (centered)
		const endOffsetMultiplier = 1; // R1 offset (second card position)
		const offsetMultiplier =
			startOffsetMultiplier + (endOffsetMultiplier - startOffsetMultiplier) * transitionPercent;
		const { offsetX, offsetY } = _.calculateStackOffset(offsetMultiplier, 1); // Use full transition for direction calc

		// Apply transforms with Safari-compatible 3D context
		// Use constant minimal translateZ value for top cards
		const translateZ = 0.003;

		slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale})`;
		slide.style.transformOrigin = _.getTransformOrigin();
		slide.style.transformStyle = 'preserve-3d'; // Safari fix
		slide.style.zIndex = 3; // Main card z-index (highest of visible cards)
		slide.style.opacity = 1;
		slide.style.display = 'block';
	}

	/**
	 * Apply positioning for the second card (R1 → R2)
	 * Transitions from second position to third position
	 *
	 * @param {HTMLElement} slide - The slide element to transform
	 * @param {number} transitionPercent - Progress through transition (0 = at R1, 1 = at R2)
	 */
	applySecondCardPosition(slide, transitionPercent) {
		const _ = this;

		// account for subpixel rounding
		if (transitionPercent > 0.995) transitionPercent = 1;
		if (transitionPercent < 0.005) transitionPercent = 0;

		// Interpolate scale: R1 scale → R2 scale
		const startScale = _.topSlideBaseScale * _.secondSlideRelativeScale; // R1 scale (second card)
		const endScale = _.topSlideBaseScale * _.thirdSlideRelativeScale; // R2 scale (third card)
		const finalScale = startScale + (endScale - startScale) * transitionPercent;

		// Interpolate offset: R1 offset → R2 offset (30px → 50px)
		const startOffsetX = _.stackOffset * 1; // R1 offset (second card position = 30px)
		const endOffsetX = 50; // R2 offset (third card position = 50px instead of 60px)
		const offsetX = startOffsetX + (endOffsetX - startOffsetX) * transitionPercent;
		const offsetY = 0; // No Y offset for horizontal stacking

		// Apply transforms with Safari-compatible 3D context
		// Use constant minimal translateZ value for second cards
		const translateZ = 0.002;

		slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale})`;
		slide.style.transformOrigin = _.getTransformOrigin();
		slide.style.transformStyle = 'preserve-3d'; // Safari fix
		slide.style.zIndex = 2; // Behind top card
		slide.style.opacity = 1;
		slide.style.display = 'block';
	}

	/**
	 * Apply positioning for the third card (R3 → R2)
	 * Card slides out from behind the center deck to third position (no fade, just slides)
	 *
	 * @param {HTMLElement} slide - The slide element to transform
	 * @param {number} transitionPercent - Progress through transition (0 = at R3/behind center, 1 = at R2/third position)
	 */
	applyThirdCardPosition(slide, transitionPercent) {
		const _ = this;

		// account for subpixel rounding
		if (transitionPercent > 0.995) transitionPercent = 1;
		if (transitionPercent < 0.005) transitionPercent = 0;

		// Use constant third card scale throughout the animation
		const finalScale = _.topSlideBaseScale * _.thirdSlideRelativeScale; // Same as third card

		// Slide from center (0px) to final third card position
		// Since range is R3→R2, we want: transitionPercent=0 at 0px, transitionPercent=1 at 50px
		const startOffsetX = 0; // Start behind center card (no offset)
		const endOffsetX = 50; // End at third card position (50px instead of 60px)
		const offsetX = startOffsetX + (endOffsetX - startOffsetX) * (1 - transitionPercent);
		const offsetY = 0; // No Y offset for horizontal stacking

		// Apply transforms with Safari-compatible 3D context
		// Use constant minimal translateZ value for third cards
		const translateZ = 0.001;

		slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale})`;
		slide.style.transformOrigin = _.getTransformOrigin();
		slide.style.transformStyle = 'preserve-3d'; // Safari fix
		slide.style.zIndex = 0; // Lowest z-index (behind all other cards)
		slide.style.opacity = 1;
		slide.style.display = 'block';
	}

	/**
	 * Get the appropriate transform origin based on stack direction
	 * This ensures cards scale naturally from the correct edge
	 *
	 * @returns {string} CSS transform-origin value
	 */
	getTransformOrigin() {
		const _ = this;
		switch (_.stackDirection) {
			case 'right':
				return 'center right'; // Scale from right edge when stacking right
			case 'left':
				return 'center left'; // Scale from left edge when stacking left
			case 'top':
				return 'center top'; // Scale from top edge when stacking up
			case 'bottom':
				return 'center bottom'; // Scale from bottom edge when stacking down
			default:
				return 'center center'; // Fallback to center
		}
	}

	/**
	 * Calculate stack offset coordinates based on direction and stack level
	 * Implements "centered stacking" where the visual center remains stable
	 *
	 * @param {number} offsetMultiplier - Stack level multiplier (0 = center, 1 = second, 2 = third)
	 * @param {number} transitionPercent - Transition progress for smooth animations
	 * @returns {{offsetX: number, offsetY: number}} - Calculated offset coordinates
	 */
	calculateStackOffset(offsetMultiplier, transitionPercent) {
		const _ = this;
		const baseOffset = _.stackOffset * offsetMultiplier;

		// Interpolate offset during transitions for smooth movement
		const animatedOffset = baseOffset * transitionPercent;

		// Calculate direction-based offsets with centered stacking
		switch (_.stackDirection) {
			case 'right':
				return {
					offsetX: animatedOffset,
					offsetY: 0, // No vertical offset for horizontal stacking
				};
			case 'left':
				return {
					offsetX: -animatedOffset,
					offsetY: 0, // No vertical offset for horizontal stacking
				};
			case 'top':
				return {
					offsetX: animatedOffset * 0.5, // Offset right to keep visually centered
					offsetY: -animatedOffset,
				};
			case 'bottom':
				return {
					offsetX: animatedOffset * 0.5, // Offset right to keep visually centered
					offsetY: animatedOffset,
				};
			default:
				return { offsetX: 0, offsetY: 0 };
		}
	}

	/**
	 * Hide slides that are outside the visible stack positions
	 * This applies to slides beyond the 3-slide stack range
	 *
	 * @param {HTMLElement} slide - The slide element to hide
	 */
	applyHiddenState(slide) {
		slide.style.opacity = 0;
		slide.style.display = 'none';
		slide.style.zIndex = 0;
		slide.style.transform = 'translate3d(0, 0, 0) scale(1)'; // Reset transform
		slide.style.transformOrigin = 'center center';
		slide.style.transformStyle = ''; // Reset Safari fix
	}

	/**
	 * Clean up the effect when it's being destroyed or replaced
	 * Removes CSS custom properties and resets all slide transforms
	 */
	destroy() {
		super.destroy();
		const _ = this;

		// Remove CSS custom properties
		if (_.ctx.carousel && _.ctx.carousel.style) {
			_.ctx.carousel.style.removeProperty('--stack-peek-reserve');
		}

		// Reset all slides to default state
		// slides are now DOM elements directly, not wrapper objects
		const slides = _.ctx.store.getSlides();
		for (let i = 0; i < slides.length; i++) {
			const slide = slides[i];
			slide.style.transform = '';
			slide.style.transformOrigin = '';
			slide.style.transformStyle = ''; // Reset Safari fix
			slide.style.opacity = '';
			slide.style.zIndex = '';
			slide.style.display = '';
		}
	}
}


// Smart auto-registration - works with ESM bundlers and CDN/UMD
if (typeof Tarot !== 'undefined') {
  Tarot.registerEffect(StackEffect);
}

export { StackEffect as default };
