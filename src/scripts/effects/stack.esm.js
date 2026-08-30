/*!
████████╗ █████╗ ██████╗  ██████╗ ████████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
██║   ███████║██████╔╝██║   ██║   ██║   
██║   ██╔══██║██╔══██╗██║   ██║   ██║   
██║   ██║  ██║██║  ██║╚██████╔╝   ██║   
╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝    ╚═╝   

Tarot Carousel v0.1.0 - beta
A highly customizable carousel with beautiful, physics-driven animations
Copyright 2026 Magic Spells LLC

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
//#region src/effects/stack.js
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
function createStackEffect(TarotEffect) {
	return class StackEffect extends TarotEffect {
		static effectName = "stack";
		/**
		* Effect configuration rules that define carousel behavior constraints
		*/
		static defaultOptions = { stack: {
			direction: "right",
			offset: 28,
			scale: 1,
			secondScale: .92,
			thirdScale: .83,
			fourthScale: .83
		} };
		static rules = {
			minSlidesPerView: 1,
			maxSlidesPerView: 1,
			loopBuffer: {
				left: 0,
				right: 3
			}
		};
		/**
		* Creates a new stack effect instance
		* @param {Object} ctx - The shared context object
		*/
		constructor(ctx) {
			super(ctx);
			this.#loadStackOptions();
			this.init();
		}
		#loadStackOptions() {
			const _ = this;
			const stackOpts = _.ctx.store.getOptions().stack || {};
			_.stackDirection = stackOpts.direction;
			_.stackOffset = stackOpts.offset;
			_.topSlideBaseScale = stackOpts.scale;
			_.secondSlideRelativeScale = stackOpts.secondScale;
			_.thirdSlideRelativeScale = stackOpts.thirdScale;
			_.fourthSlideRelativeScale = stackOpts.fourthScale;
		}
		init() {
			super.init();
			this.applyStackSpacing();
		}
		reInit() {
			super.reInit();
			this.#loadStackOptions();
			this.applyStackSpacing();
		}
		applyStackSpacing() {
			const reserveSpace = this.stackOffset * 2 + 10;
			this.ctx.viewport.style.setProperty("--stack-peek-reserve", `${reserveSpace}px`);
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
			const { slides, widths } = frame;
			_.renderSlideWidth(widths.slide);
			for (let slideIndex = 0, totalSlides = slides.length; slideIndex < totalSlides; slideIndex++) {
				const slide = slides[slideIndex];
				const exitingCard = utils.isSlideInRange(slide, "CL1", "L1");
				if (exitingCard.isInRange) {
					_.applyExitingCardPosition(slide, exitingCard.percent);
					continue;
				}
				const topCard = utils.isSlideInRange(slide, "R1", "CL1");
				if (topCard.isInRange) {
					_.applyTopCardPosition(slide, topCard.percent);
					continue;
				}
				const secondCard = utils.isSlideInRange(slide, "R2", "R1");
				if (secondCard.isInRange) {
					_.applySecondCardPosition(slide, secondCard.percent);
					continue;
				}
				const thirdCard = utils.isSlideInRange(slide, "R3", "R2");
				if (thirdCard.isInRange) {
					_.applyThirdCardPosition(slide, thirdCard.percent);
					continue;
				}
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
			if (transitionPercent > .995) transitionPercent = 1;
			if (transitionPercent < .005) transitionPercent = 0;
			const finalScale = _.topSlideBaseScale;
			const offsetX = 0;
			const offsetY = 0;
			const rotateAmount = (1 - transitionPercent) * -90;
			const translateZ = .004;
			slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale}) rotateY(${rotateAmount}deg)`;
			slide.style.transformOrigin = "left center";
			slide.style.zIndex = 4;
			slide.style.opacity = 1;
			slide.show();
			slide.style.transformStyle = "preserve-3d";
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
			if (transitionPercent > .995) transitionPercent = 1;
			if (transitionPercent < .005) transitionPercent = 0;
			const startScale = _.topSlideBaseScale;
			const finalScale = startScale + (_.topSlideBaseScale * _.secondSlideRelativeScale - startScale) * transitionPercent;
			const startOffsetMultiplier = 0;
			const offsetMultiplier = startOffsetMultiplier + (1 - startOffsetMultiplier) * transitionPercent;
			const { offsetX, offsetY } = _.calculateStackOffset(offsetMultiplier, 1);
			const translateZ = .003;
			slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale})`;
			slide.style.transformOrigin = _.getTransformOrigin();
			slide.style.transformStyle = "preserve-3d";
			slide.style.zIndex = 3;
			slide.style.opacity = 1;
			slide.show();
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
			if (transitionPercent > .995) transitionPercent = 1;
			if (transitionPercent < .005) transitionPercent = 0;
			const startScale = _.topSlideBaseScale * _.secondSlideRelativeScale;
			const finalScale = startScale + (_.topSlideBaseScale * _.thirdSlideRelativeScale - startScale) * transitionPercent;
			const startOffsetX = _.stackOffset * 1;
			const offsetX = startOffsetX + (_.stackOffset * 1.8 - startOffsetX) * transitionPercent;
			const offsetY = 0;
			const translateZ = .002;
			slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale})`;
			slide.style.transformOrigin = _.getTransformOrigin();
			slide.style.transformStyle = "preserve-3d";
			slide.style.zIndex = 2;
			slide.style.opacity = 1;
			slide.show();
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
			if (transitionPercent > .995) transitionPercent = 1;
			if (transitionPercent < .005) transitionPercent = 0;
			const finalScale = _.topSlideBaseScale * _.thirdSlideRelativeScale;
			const startOffsetX = 0;
			const offsetX = startOffsetX + (_.stackOffset * 1.8 - startOffsetX) * (1 - transitionPercent);
			const offsetY = 0;
			const translateZ = .001;
			slide.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${translateZ}px) scale(${finalScale})`;
			slide.style.transformOrigin = _.getTransformOrigin();
			slide.style.transformStyle = "preserve-3d";
			slide.style.zIndex = 1;
			slide.style.opacity = 1;
			slide.show();
		}
		/**
		* Get the appropriate transform origin based on stack direction
		* This ensures cards scale naturally from the correct edge
		*
		* @returns {string} CSS transform-origin value
		*/
		getTransformOrigin() {
			switch (this.stackDirection) {
				case "right": return "center right";
				case "left": return "center left";
				case "top": return "center top";
				case "bottom": return "center bottom";
				default: return "center center";
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
			const animatedOffset = _.stackOffset * offsetMultiplier * transitionPercent;
			switch (_.stackDirection) {
				case "right": return {
					offsetX: animatedOffset,
					offsetY: 0
				};
				case "left": return {
					offsetX: -animatedOffset,
					offsetY: 0
				};
				case "top": return {
					offsetX: animatedOffset * .5,
					offsetY: -animatedOffset
				};
				case "bottom": return {
					offsetX: animatedOffset * .5,
					offsetY: animatedOffset
				};
				default: return {
					offsetX: 0,
					offsetY: 0
				};
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
			slide.hide();
			slide.style.zIndex = 0;
			slide.style.transform = "translate3d(0, 0, 0) scale(1)";
			slide.style.transformOrigin = "center center";
			slide.style.transformStyle = "";
		}
		/**
		* Clean up the effect when it's being destroyed or replaced
		* Removes CSS custom properties and resets all slide transforms
		*/
		destroy() {
			super.destroy();
			const _ = this;
			if (_.ctx.viewport && _.ctx.viewport.style) _.ctx.viewport.style.removeProperty("--stack-peek-reserve");
			const slides = _.ctx.store.getSlides();
			for (let i = 0; i < slides.length; i++) {
				const slide = slides[i];
				slide.style.transform = "";
				slide.style.transformOrigin = "";
				slide.style.transformStyle = "";
				slide.style.opacity = "";
				slide.style.zIndex = "";
				slide.show?.();
			}
		}
	};
}
(window.TarotEffectQueue = window.TarotEffectQueue || []).push({
	effectName: "stack",
	factory: createStackEffect
});
//#endregion
export { createStackEffect as default };

//# sourceMappingURL=stack.esm.js.map