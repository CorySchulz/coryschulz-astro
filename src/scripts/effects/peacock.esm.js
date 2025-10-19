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
 * Peacock Effect - a symmetrical rotation around the center slide
 * like the feathers of a peacock
 */
class PeacockEffect extends TarotEffect {
	static effectName = 'peacock';

	static rules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: 1,
		loopBuffer: { left: 2, right: 2 },
	};

	constructor(ctx) {
		super(ctx);
		const _ = this;

		_.viewportWidth = 0;

		// Percentage-based margins (18% on each side)
		_.percentMargin = 0.18;
		_.leftMargin = 0;
		_.rightMargin = 0;
		_.availableWidth = 0;

		// Feather configuration
		_.featherRotation = 8;
		_.featherScale = 0.86;

		_.init();
	}

	init() {
		super.init();
	}

	reInit() {
		super.reInit();
	}

	/**
	 * Calculate margins and available width based on current viewport
	 */
	calculateLayout() {
		const _ = this;
		_.leftMargin = _.viewportWidth * _.percentMargin;
		_.rightMargin = _.viewportWidth * _.percentMargin;
		_.availableWidth = _.viewportWidth - _.leftMargin - _.rightMargin;

		// Ensure minimum width
		if (_.availableWidth < 200) {
			_.availableWidth = 200;
			_.leftMargin = (_.viewportWidth - _.availableWidth) / 2;
			_.rightMargin = _.leftMargin;
		}
	}

	/**
	 * Main render function
	 */
	render(frame, utils) {
		const _ = this;
		const { slides, widths, animation } = frame;

		_.viewportWidth = widths.viewport;
		_.calculateLayout();

		// Calculate gap-based widths
		_.gap = widths.gap || 0;
		_.featherWidth = (_.availableWidth - _.gap) / 2; // Gap-controlled feather width

		// Set slide width based on available width within margins
		_.renderSlideWidth(_.availableWidth);

		// Process each slide
		for (let slideIndex = 0, totalSlides = slides.length; slideIndex < totalSlides; slideIndex++) {
			const slide = slides[slideIndex];

			// Left feather 3: fade out - L2 to L3 range
			const leftFeather3 = utils.isSlideInRange(slide, 'L2', 'L3');
			if (leftFeather3.isInRange) {
				_.applyLeftFeather3(slide, leftFeather3.percent);
				continue;
			}

			// Hidden left slides
			const hiddenLeft = utils.isSlideInRange(slide, 'L3', 'L+');
			if (hiddenLeft.isInRange) {
				_.applyHiddenState(slide);
				continue;
			}

			// Left feather 2: \\ (z-index 1) - L1 to L2 range
			const leftFeather2 = utils.isSlideInRange(slide, 'L1', 'L2');
			if (leftFeather2.isInRange) {
				_.applyLeftFeather2(slide, leftFeather2.percent);
				continue;
			}

			// Left feather 1: \ (z-index 2) - CL1 to L1 range
			const leftFeather1 = utils.isSlideInRange(slide, 'CL1', 'L1');
			if (leftFeather1.isInRange) {
				if (leftFeather1.percent >= 0.5) {
					// normalize percent for this half range
					_.applyLeftFeather0(slide, (leftFeather1.percent - 0.5) / 0.5);
					continue;
				}
				// normalize percent for this half range
				_.applyLeftFeather1(slide, leftFeather1.percent / 0.5);
				continue;
			}

			// Center slide: [] (z-index 3) - CL1 to CR1 range
			const centerSlide = utils.isSlideInRange(slide, 'CL1', 'CR1');
			if (centerSlide.isInRange) {
				_.applyCenterSlide(slide, centerSlide.percent);
				continue;
			}

			// Right feather 1: / (z-index 2) - R1 to CR1 range
			const rightFeather1 = utils.isSlideInRange(slide, 'CR1', 'R1');
			if (rightFeather1.isInRange) {
				if (rightFeather1.percent < 0.5) {
					// normalize percent for this half range
					_.applyRightFeather0(slide, rightFeather1.percent / 0.5);
					continue;
				}
				// normalize percent for this half range
				_.applyRightFeather1(slide, (rightFeather1.percent - 0.5) / 0.5);

				continue;
			}

			// Right feather 2: // (z-index 1) - R1 to R2 range
			const rightFeather2 = utils.isSlideInRange(slide, 'R1', 'R2');
			if (rightFeather2.isInRange) {
				_.applyRightFeather2(slide, rightFeather2.percent);
				continue;
			}

			// Right feather 3: fade out - R2 to R3 range
			const rightFeather3 = utils.isSlideInRange(slide, 'R2', 'R3');
			if (rightFeather3.isInRange) {
				_.applyRightFeather3(slide, rightFeather3.percent);
				continue;
			}

			// Hidden right slides
			const hiddenRight = utils.isSlideInRange(slide, 'R3', 'R+');
			if (hiddenRight.isInRange) {
				_.applyHiddenState(slide);
				continue;
			}

			// Fallback
			_.applyHiddenState(slide);
		}
	}

	/**
	 * Apply left feather 3: fade out transition
	 * L2 to L3 range - fading out with extra rotation and scaling
	 */
	applyLeftFeather3(slide, percent) {
		const offsetX = this.leftMargin; // Left margin position

		// Use consistent feather width (scale() handles size reduction)
		const feather3SlideWidth = this.featherWidth;

		// Progressive rotation: start at feather2 max, add more rotation as it fades
		// percent=0 at L3 (furthest edge), percent=1 at L2 (closer to center)
		const startRotation = this.featherRotation + this.featherRotation * this.featherScale; // From feather2
		const additionalRotation = this.featherRotation * 0.5; // Extra 50% more rotation
		const endRotation = startRotation + additionalRotation;
		const rotationAmount = -(endRotation + (startRotation - endRotation) * percent);

		// Progressive scale: featherScale³ at L3 (percent=0) → featherScale² at L2 (percent=1)
		const startScale = this.featherScale * this.featherScale * this.featherScale; // Triple compounded at edge
		const endScale = this.featherScale * this.featherScale * 0.9; // From feather2
		const scaleAmount = startScale + (endScale - startScale) * percent;

		// Fade out in last half: full opacity first 50% (closer to center), then fade in last 50% (furthest from center)
		// percent=0 at L3 (furthest edge), percent=1 at L2 (closer to center)
		const opacity = percent > 0.5 ? 1 : 1 * (percent / 0.5);

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
		slide.style.transformOrigin = 'left bottom';
		slide.style.zIndex = 0; // Behind everything
		slide.style.opacity = opacity;
		slide.style.display = 'block';
		slide.style.width = `${feather3SlideWidth}px`;
	}

	/**
	 * Apply left feather 2: \\ (z-index 1)
	 * L1 to L2 range - far left feather
	 */
	applyLeftFeather2(slide, percent) {
		const offsetX = this.leftMargin; // Left margin position

		// Use consistent feather width (scale() handles size reduction)
		const feather2SlideWidth = this.featherWidth;

		// Progressive rotation: start at featherRotation, go to featherRotation + (featherRotation * featherScale)
		// percent=0 at L2 (edge), percent=1 at L1 (closer to center)
		const startRotation = this.featherRotation + this.featherRotation * this.featherScale; // Max rotation at edge
		const endRotation = this.featherRotation; // Base rotation closer to center
		const rotationAmount = -(startRotation + (endRotation - startRotation) * percent);

		// Progressive scale: featherScale² at L2 (percent=0) → featherScale at L1 (percent=1)
		const startScale = this.featherScale * this.featherScale * 0.9; // Most compressed at edge
		const endScale = this.featherScale; // Less compressed closer to center
		const scaleAmount = startScale + (endScale - startScale) * percent;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
		slide.style.transformOrigin = 'left bottom';
		slide.style.zIndex = 1;
		slide.style.opacity = 1; // Slightly transparent for layered effect
		slide.style.display = 'block';
		slide.style.width = `${feather2SlideWidth}px`;
	}

	/**
	 * Apply left feather 1: \ (z-index 2)
	 * CL1 to L1 range - near left feather (handles center at percent=1)
	 */
	applyLeftFeather1(slide, percent) {
		const offsetX = this.leftMargin; // Left margin position

		// Use gap-based feather width
		const featherSlideWidth = this.featherWidth;

		// Calculate rotation: more rotation further from center
		// percent=1 at CL1 (center), percent=0 at L1 (edge)
		const rotationAmount = -this.featherRotation * (1 - percent);

		// Calculate scale: featherScale at edge (percent=0) → 1.0 at center (percent=1)
		const scaleAmount = this.featherScale + (1 - this.featherScale) * percent;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
		slide.style.transformOrigin = 'left bottom';
		slide.style.zIndex = 2;
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${featherSlideWidth}px`;
	}

	/**
	 * Apply left feather 0: transition to center
	 * CL1 to L1 range - transitions from feather width to full width
	 */
	applyLeftFeather0(slide, percent) {
		const offsetX = this.leftMargin; // Left margin position

		// Width transition: feather width at percent=0 → full width at percent=1
		const slideWidth = this.featherWidth + (this.availableWidth - this.featherWidth) * percent;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'left bottom';
		slide.style.zIndex = 3; // Center gets highest z-index
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${slideWidth}px`;
	}

	/**
	 * Apply center slide: [] (z-index 3)
	 * CL1 to CR1 range - main center slide
	 */
	applyCenterSlide(slide, percent) {
		const offsetX = this.leftMargin; // Left margin position

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'center center';
		slide.style.zIndex = 3; // Highest z-index for center
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${this.availableWidth}px`;
	}

	/**
	 * Apply right feather 0: transition to center
	 * CR1 to R1 range - transitions from full width to feather width
	 */
	applyRightFeather0(slide, percent) {
		// Width transition: full width at percent=0 → feather width at percent=1
		const slideWidth = this.availableWidth + (this.featherWidth - this.availableWidth) * percent;

		// Right-align within available space
		const offsetX = this.leftMargin + (this.availableWidth - slideWidth);

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'right bottom';
		slide.style.zIndex = 3; // Center gets highest z-index
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${slideWidth}px`;
	}

	/**
	 * Apply right feather 1: / (z-index 2)
	 * R1 to CR1 range - near right feather (handles center at percent=1)
	 */
	applyRightFeather1(slide, percent) {
		// Use gap-based feather width
		const featherSlideWidth = this.featherWidth;

		// Right-align within available space
		const offsetX = this.leftMargin + (this.availableWidth - featherSlideWidth);

		// Calculate rotation: more rotation further from center
		// percent=0 at CR1 (center), percent=1 at R1 (edge)
		const rotationAmount = this.featherRotation * percent;

		// Calculate scale: 1.0 at center (percent=0) → featherScale at edge (percent=1)
		const scaleAmount = 1 + (this.featherScale - 1) * percent;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
		slide.style.transformOrigin = 'right bottom';
		slide.style.zIndex = 2;
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${featherSlideWidth}px`;
	}

	/**
	 * Apply right feather 2: // (z-index 1)
	 * R2 to R1 range - far right feather
	 */
	applyRightFeather2(slide, percent) {
		// Use consistent feather width (scale() handles size reduction)
		const feather2SlideWidth = this.featherWidth;

		// Right-align within available space
		const offsetX = this.leftMargin + (this.availableWidth - feather2SlideWidth);

		// Progressive rotation: start at featherRotation, go to featherRotation + (featherRotation * featherScale)
		// percent=0 at R1 (closer to center), percent=1 at R2 (edge)
		const startRotation = this.featherRotation; // Base rotation closer to center
		const endRotation = this.featherRotation + this.featherRotation * this.featherScale; // Max rotation at edge
		const rotationAmount = startRotation + (endRotation - startRotation) * percent;

		// Progressive scale: featherScale at R1 (percent=0) → featherScale² at R2 (percent=1)
		const startScale = this.featherScale; // Less compressed closer to center
		const endScale = this.featherScale * this.featherScale * 0.9; // Most compressed at edge
		const scaleAmount = startScale + (endScale - startScale) * percent;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
		slide.style.transformOrigin = 'right bottom';
		slide.style.zIndex = 1;
		slide.style.opacity = 1; // Slightly transparent for layered effect
		slide.style.display = 'block';
		slide.style.width = `${feather2SlideWidth}px`;
	}

	/**
	 * Apply right feather 3: fade out transition
	 * R2 to R3 range - fading out with extra rotation and scaling
	 */
	applyRightFeather3(slide, percent) {
		// Use consistent feather width (scale() handles size reduction)
		const feather3SlideWidth = this.featherWidth;

		// Right-align within available space
		const offsetX = this.leftMargin + (this.availableWidth - feather3SlideWidth);

		// Progressive rotation: start at feather2 max, add more rotation as it fades
		// percent=0 at R2, percent=1 at R3 (furthest edge)
		const startRotation = this.featherRotation + this.featherRotation * this.featherScale; // From feather2
		const additionalRotation = this.featherRotation * 0.5; // Extra 50% more rotation
		const endRotation = startRotation + additionalRotation;
		const rotationAmount = startRotation + (endRotation - startRotation) * percent;

		// Progressive scale: featherScale² at R2 (percent=0) → featherScale³ at R3 (percent=1)
		const startScale = this.featherScale * this.featherScale * 0.9; // From feather2
		const endScale = startScale * this.featherScale; // Triple compounded
		const scaleAmount = startScale + (endScale - startScale) * percent;

		// Fade out in last half: full opacity first 50%, then fade in last 50%
		// percent=0 at R2 (closer to center), percent=1 at R3 (furthest edge)
		const opacity = percent < 0.5 ? 1 : 1 * (1 - (percent - 0.5) / 0.5);

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
		slide.style.transformOrigin = 'right bottom';
		slide.style.zIndex = 0; // Behind everything
		slide.style.opacity = opacity;
		slide.style.display = 'block';
		slide.style.width = `${feather3SlideWidth}px`;
	}

	/**
	 * Hide slides outside visible range
	 */
	applyHiddenState(slide) {
		slide.style.opacity = 0;
		slide.style.display = 'none';
		slide.style.zIndex = 0;
		slide.style.transform = 'translate3d(0px, 0px, 0px)';
		slide.style.transformOrigin = 'center center';
		slide.style.width = '';
	}

	/**
	 * Cleanup
	 */
	destroy() {
		super.destroy();
		const _ = this;

		// Reset all slides
		const slides = _.ctx.store.getSlides();
		for (let i = 0; i < slides.length; i++) {
			const slide = slides[i];
			if (!slide || !slide.style) continue;

			slide.style.transform = '';
			slide.style.transformOrigin = '';
			slide.style.opacity = '';
			slide.style.zIndex = '';
			slide.style.display = '';
			slide.style.width = '';
		}
	}
}


// Smart auto-registration - works with ESM bundlers and CDN/UMD
if (typeof Tarot !== 'undefined') {
  Tarot.registerEffect(PeacockEffect);
}

export { PeacockEffect as default };
