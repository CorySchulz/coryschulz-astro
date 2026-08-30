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
//#region src/effects/spotlight.js
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
function createSpotlightEffect(TarotEffect) {
	return class SpotlightEffect extends TarotEffect {
		static effectName = "spotlight";
		static defaultOptions = { spotlight: {
			scale: .9,
			opacity: .5,
			blur: 7,
			saturation: .4
		} };
		static rules = {
			minSlidesPerView: 1,
			maxSlidesPerView: Infinity,
			loopBuffer: {
				left: 1,
				right: 1
			}
		};
		constructor(ctx) {
			super(ctx);
			this.#loadOptions();
			this.init();
		}
		#loadOptions() {
			const _ = this;
			const opts = _.ctx.store.getOptions().spotlight || _.constructor.defaultOptions.spotlight;
			_.sideScale = opts.scale;
			_.sideOpacity = opts.opacity;
			_.blurValue = opts.blur;
			_.sideSaturation = opts.saturation;
		}
		init() {
			super.init();
		}
		reInit() {
			super.reInit();
			this.#loadOptions();
		}
		/**
		* L+→L1: far left zone (fixed side values)
		* @param {HTMLElement} slide - the slide element to transform
		* @param {number} _percent - ignored for far ranges
		*/
		applyFarLeft(slide, _percent, frameWidths) {
			const _ = this;
			const slideWidth = frameWidths.slide;
			slide._leftWidthTrimmed = slideWidth - slideWidth * _.sideScale;
			slide.style.transformOrigin = "center left";
			slide._scaleTransform = `scale(${_.sideScale})`;
			slide.style.opacity = _.sideOpacity;
			slide.style.filter = `blur(${_.blurValue}px) saturate(${_.sideSaturation})`;
		}
		/**
		* L1→CL1: near left transition (side → center)
		* smoothstep interpolation for nicer easing as slides approach the center
		* @param {HTMLElement} slide - the slide element to transform
		* @param {number} percent - 0 at L1, 1 at CL1
		*/
		applyNearLeft(slide, percent, frameWidths) {
			const _ = this;
			if (percent > .999) percent = 1;
			if (percent < .005) percent = 0;
			const smoothPercent = percent * percent * (3 - 2 * percent);
			const scale = _.sideScale + (1 - _.sideScale) * smoothPercent;
			const fastPercent = Math.min(smoothPercent * 2, 1);
			const opacity = _.sideOpacity + (1 - _.sideOpacity) * fastPercent;
			const blur = _.blurValue * (1 - fastPercent);
			const saturation = _.sideSaturation + (1 - _.sideSaturation) * fastPercent;
			const slideWidth = frameWidths.slide;
			slide._leftWidthTrimmed = slideWidth - slideWidth * scale;
			slide.style.transformOrigin = "center left";
			slide._scaleTransform = `scale(${scale})`;
			slide.style.opacity = opacity;
			slide.style.filter = `blur(${blur}px) saturate(${saturation})`;
		}
		/**
		* CL1→CR1: center spotlight zone (fixed center values)
		* @param {HTMLElement} slide - the slide element to transform
		* @param {number} _percent - unused; all slides in zone use center values
		*/
		applyCenterSpotlight(slide, _percent) {
			slide.style.transformOrigin = "center";
			slide._scaleTransform = `scale(1)`;
			slide.style.opacity = 1;
			slide.style.filter = "blur(0px) saturate(1)";
		}
		/**
		* CR1→R1: near right transition (center → side)
		* smoothstep interpolation to mirror the left-side approach feel
		* @param {HTMLElement} slide - the slide element to transform
		* @param {number} percent - 0 at CR1, 1 at R1
		*/
		applyNearRight(slide, percent, frameWidths) {
			const _ = this;
			if (percent > .999) percent = 1;
			if (percent < .005) percent = 0;
			const smoothPercent = percent * percent * (3 - 2 * percent);
			const scale = 1 + (_.sideScale - 1) * smoothPercent;
			const fastPercent = smoothPercent < .5 ? 0 : (smoothPercent - .5) * 2;
			const opacity = 1 + (_.sideOpacity - 1) * fastPercent;
			const blur = _.blurValue * fastPercent;
			const saturation = 1 + (_.sideSaturation - 1) * fastPercent;
			const slideWidth = frameWidths.slide;
			slide._rightWidthTrimmed = slideWidth - slideWidth * scale;
			slide.style.transformOrigin = "center right";
			slide._scaleTransform = `scale(${scale})`;
			slide.style.opacity = opacity;
			slide.style.filter = `blur(${blur}px) saturate(${saturation})`;
		}
		/**
		* R1→R+: far right zone (fixed side values)
		* @param {HTMLElement} slide - the slide element to transform
		* @param {number} _percent - ignored for far ranges
		*/
		applyFarRight(slide, _percent, frameWidths) {
			const _ = this;
			const slideWidth = frameWidths.slide;
			slide._rightWidthTrimmed = slideWidth - slideWidth * _.sideScale;
			slide.style.transformOrigin = "center right";
			slide._scaleTransform = `scale(${_.sideScale})`;
			slide.style.opacity = _.sideOpacity;
			slide.style.filter = `blur(${_.blurValue}px) saturate(${_.sideSaturation})`;
		}
		/**
		* fallback for slides outside defined ranges
		* (should not normally run with infinity ranges)
		* @param {HTMLElement} slide - the slide element to transform
		*/
		applyHidden(slide, frameWidths) {
			const _ = this;
			const slideWidth = frameWidths.slide;
			slide._rightWidthTrimmed = slideWidth - slideWidth * _.sideScale;
			slide.style.transformOrigin = "center right";
			slide._scaleTransform = `scale(${_.sideScale})`;
			slide.style.opacity = _.sideOpacity;
			slide.style.filter = `blur(${_.blurValue}px) saturate(${_.sideSaturation})`;
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
			_.renderTrackWidth(widths.track);
			_.renderSlideWidth(widths.slide);
			_.renderTrackPosition(animation);
			for (let i = 0, n = slides.length; i < n; i++) {
				const slide = slides[i];
				slide._leftWidthTrimmed = 0;
				slide._rightWidthTrimmed = 0;
				slide._scaleTransform = "";
				slide._renderPosition = slide._trackPosition;
				slide.style.transition = "none";
				const farLeft = utils.isSlideInRange(slide, "L+", "L1");
				if (farLeft.isInRange) {
					_.applyFarLeft(slide, farLeft.percent, widths);
					continue;
				}
				const nearLeft = utils.isSlideInRange(slide, "L1", "CL1");
				if (nearLeft.isInRange) {
					_.applyNearLeft(slide, nearLeft.percent, widths);
					continue;
				}
				const centerSpotlight = utils.isSlideInRange(slide, "CL1", "CR1");
				if (centerSpotlight.isInRange) {
					_.applyCenterSpotlight(slide, centerSpotlight.percent);
					continue;
				}
				const nearRight = utils.isSlideInRange(slide, "CR1", "R1");
				if (nearRight.isInRange) {
					_.applyNearRight(slide, nearRight.percent, widths);
					continue;
				}
				const farRight = utils.isSlideInRange(slide, "R1", "R+");
				if (farRight.isInRange) {
					_.applyFarRight(slide, farRight.percent, widths);
					continue;
				}
				_.applyHidden(slide, widths);
			}
			let totalRightTrim = 0;
			for (let i = 0, n = slides.length; i < n; i++) {
				const slide = slides[i];
				totalRightTrim += slide._rightWidthTrimmed || 0;
				slide._renderPosition -= totalRightTrim;
			}
			let totalLeftTrim = 0;
			for (let i = slides.length - 1; i >= 0; i--) {
				const slide = slides[i];
				totalLeftTrim += slide._leftWidthTrimmed || 0;
				slide._renderPosition += totalLeftTrim;
				slide.style.transform = `translateX(${slide._renderPosition}px) ${slide._scaleTransform || ""}`;
			}
		}
		/**
		* Cleanup method called when the effect is destroyed.
		*/
		destroy() {
			super.destroy();
			const slides = this.ctx.store.getSlides() || [];
			for (let i = 0; i < slides.length; i++) {
				const slide = slides[i];
				if (slide && slide.style) {
					slide.style.transform = "";
					slide.style.opacity = "";
					slide.style.transition = "";
					slide.style.transformOrigin = "";
					slide.style.filter = "";
				}
			}
		}
	};
}
(window.TarotEffectQueue = window.TarotEffectQueue || []).push({
	effectName: "spotlight",
	factory: createSpotlightEffect
});
//#endregion
export { createSpotlightEffect as default };

//# sourceMappingURL=spotlight.esm.js.map