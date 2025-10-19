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
 * Sliding Window Effect - width scaling without rotation
 * Creates a sliding window reveal effect
 */
class SlidingWindowEffect extends TarotEffect {
	static effectName = 'sliding-window';

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

		// Door configuration - use full width instead of artificial margins
		_.featherRotation = 10;
		_.featherScale = 0.9;

		_.init();
	}

	init() {
		super.init();
	}

	reInit() {
		super.reInit();
	}


	/**
	 * Main render function
	 */
	render(frame, utils) {
		const _ = this;
		const { slides, widths, animation } = frame;

		// Use full slide width and respect carousel's paddingLeft for positioning  
		_.slideWidth = widths.slide;
		_.paddingLeft = widths.paddingLeft;
		_.gap = widths.gap || 0;
		_.doorWidth = (_.slideWidth - _.gap) / 2; // Gap-controlled door width

		// Set slide width to full calculated width
		_.renderSlideWidth(_.slideWidth);

		// Process each slide
		for (let slideIndex = 0, totalSlides = slides.length; slideIndex < totalSlides; slideIndex++) {
			const slide = slides[slideIndex];

			// Near left transition - CL1 to L1 range (split into two halves)
			const nearLeft = utils.isSlideInRange(slide, 'CL1', 'L1');
			if (nearLeft.isInRange) {
				if (nearLeft.percent >= 0.5) {
					// normalize percent for this half range (center half)
					_.applyNearLeft0(slide, (nearLeft.percent - 0.5) / 0.5);
					continue;
				}
				// normalize percent for this half range (edge half)
				_.applyNearLeft1(slide, nearLeft.percent / 0.5);
				continue;
			}

			// Center slide - CL1 to CR1 range
			const centerSlide = utils.isSlideInRange(slide, 'CL1', 'CR1');
			if (centerSlide.isInRange) {
				_.applyCenterSlide(slide, centerSlide.percent);
				continue;
			}

			// Near right transition - CR1 to R1 range (split into two halves)
			const nearRight = utils.isSlideInRange(slide, 'CR1', 'R1');
			if (nearRight.isInRange) {
				if (nearRight.percent < 0.5) {
					// normalize percent for this half range (center half)
					_.applyNearRight0(slide, nearRight.percent / 0.5);
					continue;
				}
				// normalize percent for this half range (edge half)
				_.applyNearRight1(slide, (nearRight.percent - 0.5) / 0.5);
				continue;
			}

			// All other slides are hidden
			_.applyHiddenState(slide);
		}
	}

	/**
	 * Apply near left transition
	 * CL1 to L1 range - slide width scaling on left side
	 */
	applyNearLeft1(slide, percent) {
		const offsetX = this.paddingLeft; // Use carousel's paddingLeft

		// Use gap-based door width
		const narrowSlideWidth = this.doorWidth;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'left bottom';
		slide.style.zIndex = 2;
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${narrowSlideWidth}px`;
	}

	/**
	 * Apply near left transition (center half)
	 * CL1 to L1 range - slide width scaling from narrow to full width
	 */
	applyNearLeft0(slide, percent) {
		const offsetX = this.paddingLeft; // Use carousel's paddingLeft

		// Width transition: door width at percent=0 → full width at percent=1
		const slideWidth = this.doorWidth + (this.slideWidth - this.doorWidth) * percent;

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'left bottom';
		slide.style.zIndex = 3; // Center gets highest z-index
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${slideWidth}px`;
	}

	/**
	 * Apply near right transition (first half)
	 * CR1 to R1 range - slide width scaling on right side (center to mid)
	 */
	applyNearRight0(slide, percent) {
		// Width transition: full width at percent=0 → door width at percent=1
		const slideWidth = this.slideWidth + (this.doorWidth - this.slideWidth) * percent;

		// Right-align within slide space
		const offsetX = this.paddingLeft + (this.slideWidth - slideWidth);

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'right bottom';
		slide.style.zIndex = 3;
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${slideWidth}px`;
	}

	/**
	 * Apply near right transition (second half)
	 * CR1 to R1 range - slide width scaling on right side (mid to edge)
	 */
	applyNearRight1(slide, percent) {
		// Use gap-based door width
		const narrowSlideWidth = this.doorWidth;

		// Right-align within slide space
		const offsetX = this.paddingLeft + (this.slideWidth - narrowSlideWidth);

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'right bottom';
		slide.style.zIndex = 2;
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${narrowSlideWidth}px`;
	}

	/**
	 * Apply center slide: [] (z-index 3)
	 * CL1 to CR1 range - main center slide
	 */
	applyCenterSlide(slide, percent) {
		const offsetX = this.paddingLeft; // Use carousel's paddingLeft

		slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
		slide.style.transformOrigin = 'center center';
		slide.style.zIndex = 3; // Highest z-index for center
		slide.style.opacity = 1;
		slide.style.display = 'block';
		slide.style.width = `${this.slideWidth}px`;
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
  Tarot.registerEffect(SlidingWindowEffect);
}

export { SlidingWindowEffect as default };
