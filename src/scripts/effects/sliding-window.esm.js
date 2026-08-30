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
//#region src/effects/sliding-window.js
/**
* Sliding Window Effect - width scaling without rotation
* Creates a sliding window reveal effect
*/
function createSlidingWindowEffect(TarotEffect) {
	return class SlidingWindowEffect extends TarotEffect {
		static effectName = "sliding-window";
		static rules = {
			minSlidesPerView: 1,
			maxSlidesPerView: 1,
			loopBuffer: {
				left: 0,
				right: 1
			}
		};
		constructor(ctx) {
			super(ctx);
			this.init();
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
			const { slides, widths } = frame;
			_.slideWidth = widths.slide;
			_.paddingLeft = widths.paddingLeft;
			_.gap = widths.gap || 0;
			_.doorWidth = (_.slideWidth - _.gap) / 2;
			_.renderSlideWidth(_.slideWidth);
			for (let slideIndex = 0, totalSlides = slides.length; slideIndex < totalSlides; slideIndex++) {
				const slide = slides[slideIndex];
				const nearLeft = utils.isSlideInRange(slide, "CL1", "L1");
				if (nearLeft.isInRange) {
					if (nearLeft.percent >= .5) {
						_.applyNearLeft0(slide, (nearLeft.percent - .5) / .5);
						continue;
					}
					_.applyNearLeft1(slide, nearLeft.percent / .5);
					continue;
				}
				const centerSlide = utils.isSlideInRange(slide, "CL1", "CR1");
				if (centerSlide.isInRange) {
					_.applyCenterSlide(slide, centerSlide.percent);
					continue;
				}
				const nearRight = utils.isSlideInRange(slide, "CR1", "R1");
				if (nearRight.isInRange) {
					if (nearRight.percent < .5) {
						_.applyNearRight0(slide, nearRight.percent / .5);
						continue;
					}
					_.applyNearRight1(slide, (nearRight.percent - .5) / .5);
					continue;
				}
				_.applyHiddenState(slide);
			}
		}
		/**
		* Apply near left transition
		* CL1 to L1 range - slide width scaling on left side
		*/
		applyNearLeft1(slide, _percent) {
			const offsetX = this.paddingLeft;
			const narrowSlideWidth = this.doorWidth;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "left bottom";
			slide.style.zIndex = 2;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${narrowSlideWidth}px`;
		}
		/**
		* Apply near left transition (center half)
		* CL1 to L1 range - slide width scaling from narrow to full width
		*/
		applyNearLeft0(slide, percent) {
			const offsetX = this.paddingLeft;
			const slideWidth = this.doorWidth + (this.slideWidth - this.doorWidth) * percent;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "left bottom";
			slide.style.zIndex = 3;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${slideWidth}px`;
		}
		/**
		* Apply near right transition (first half)
		* CR1 to R1 range - slide width scaling on right side (center to mid)
		*/
		applyNearRight0(slide, percent) {
			const slideWidth = this.slideWidth + (this.doorWidth - this.slideWidth) * percent;
			const offsetX = this.paddingLeft + (this.slideWidth - slideWidth);
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "right bottom";
			slide.style.zIndex = 3;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${slideWidth}px`;
		}
		/**
		* Apply near right transition (second half)
		* CR1 to R1 range - slide width scaling on right side (mid to edge)
		*/
		applyNearRight1(slide, _percent) {
			const narrowSlideWidth = this.doorWidth;
			const offsetX = this.paddingLeft + (this.slideWidth - narrowSlideWidth);
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "right bottom";
			slide.style.zIndex = 2;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${narrowSlideWidth}px`;
		}
		/**
		* Apply center slide: [] (z-index 3)
		* CL1 to CR1 range - main center slide
		*/
		applyCenterSlide(slide, _percent) {
			const offsetX = this.paddingLeft;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "center center";
			slide.style.zIndex = 3;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${this.slideWidth}px`;
		}
		/**
		* Hide slides outside visible range
		*/
		applyHiddenState(slide) {
			slide.style.opacity = 0;
			slide.hide();
			slide.style.zIndex = 0;
			slide.style.transform = "translate3d(0px, 0px, 0px)";
			slide.style.transformOrigin = "center center";
			slide.style.width = "";
		}
		/**
		* Cleanup
		*/
		destroy() {
			super.destroy();
			const slides = this.ctx.store.getSlides();
			for (let i = 0; i < slides.length; i++) {
				const slide = slides[i];
				if (!slide || !slide.style) continue;
				slide.style.transform = "";
				slide.style.transformOrigin = "";
				slide.style.opacity = "";
				slide.style.zIndex = "";
				slide.show?.();
				slide.style.width = "";
			}
		}
	};
}
(window.TarotEffectQueue = window.TarotEffectQueue || []).push({
	effectName: "sliding-window",
	factory: createSlidingWindowEffect
});
//#endregion
export { createSlidingWindowEffect as default };

//# sourceMappingURL=sliding-window.esm.js.map