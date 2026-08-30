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
//#region src/effects/peacock.js
/**
* Peacock Effect - a symmetrical rotation around the center slide
* like the feathers of a peacock
*/
function createPeacockEffect(TarotEffect) {
	return class PeacockEffect extends TarotEffect {
		static effectName = "peacock";
		static rules = {
			minSlidesPerView: 1,
			maxSlidesPerView: 1,
			loopBuffer: {
				left: 2,
				right: 2
			},
			minPaddingLeft: "18%",
			minPaddingRight: "18%"
		};
		constructor(ctx) {
			super(ctx);
			const _ = this;
			_.paddingLeft = 0;
			_.slideWidth = 0;
			_.gap = 0;
			_.featherWidth = 0;
			_.featherRotation = 8;
			_.featherScale = .86;
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
			const { slides, widths } = frame;
			_.paddingLeft = widths.paddingLeft;
			_.slideWidth = widths.slide;
			_.gap = widths.gap || 0;
			_.featherWidth = (_.slideWidth - _.gap) / 2;
			_.renderSlideWidth(_.slideWidth);
			for (let slideIndex = 0, totalSlides = slides.length; slideIndex < totalSlides; slideIndex++) {
				const slide = slides[slideIndex];
				const leftFeather3 = utils.isSlideInRange(slide, "L2", "L3");
				if (leftFeather3.isInRange) {
					_.applyLeftFeather3(slide, leftFeather3.percent);
					continue;
				}
				if (utils.isSlideInRange(slide, "L3", "L+").isInRange) {
					_.applyHiddenState(slide);
					continue;
				}
				const leftFeather2 = utils.isSlideInRange(slide, "L1", "L2");
				if (leftFeather2.isInRange) {
					_.applyLeftFeather2(slide, leftFeather2.percent);
					continue;
				}
				const leftFeather1 = utils.isSlideInRange(slide, "CL1", "L1");
				if (leftFeather1.isInRange) {
					if (leftFeather1.percent >= .5) {
						_.applyLeftFeather0(slide, (leftFeather1.percent - .5) / .5);
						continue;
					}
					_.applyLeftFeather1(slide, leftFeather1.percent / .5);
					continue;
				}
				const centerSlide = utils.isSlideInRange(slide, "CL1", "CR1");
				if (centerSlide.isInRange) {
					_.applyCenterSlide(slide, centerSlide.percent);
					continue;
				}
				const rightFeather1 = utils.isSlideInRange(slide, "CR1", "R1");
				if (rightFeather1.isInRange) {
					if (rightFeather1.percent < .5) {
						_.applyRightFeather0(slide, rightFeather1.percent / .5);
						continue;
					}
					_.applyRightFeather1(slide, (rightFeather1.percent - .5) / .5);
					continue;
				}
				const rightFeather2 = utils.isSlideInRange(slide, "R1", "R2");
				if (rightFeather2.isInRange) {
					_.applyRightFeather2(slide, rightFeather2.percent);
					continue;
				}
				const rightFeather3 = utils.isSlideInRange(slide, "R2", "R3");
				if (rightFeather3.isInRange) {
					_.applyRightFeather3(slide, rightFeather3.percent);
					continue;
				}
				if (utils.isSlideInRange(slide, "R3", "R+").isInRange) {
					_.applyHiddenState(slide);
					continue;
				}
				_.applyHiddenState(slide);
			}
		}
		/**
		* Apply left feather 3: fade out transition
		* L2 to L3 range - fading out with extra rotation and scaling
		*/
		applyLeftFeather3(slide, percent) {
			const offsetX = this.paddingLeft;
			const feather3SlideWidth = this.featherWidth;
			const startRotation = this.featherRotation + this.featherRotation * this.featherScale;
			const endRotation = startRotation + this.featherRotation * .5;
			const rotationAmount = -(endRotation + (startRotation - endRotation) * percent);
			const startScale = this.featherScale * this.featherScale * this.featherScale;
			const scaleAmount = startScale + (this.featherScale * this.featherScale * .9 - startScale) * percent;
			const opacity = percent > .5 ? 1 : 1 * (percent / .5);
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
			slide.style.transformOrigin = "left bottom";
			slide.style.zIndex = 0;
			slide.style.opacity = opacity;
			slide.show();
			slide.style.width = `${feather3SlideWidth}px`;
		}
		/**
		* Apply left feather 2: \\ (z-index 1)
		* L1 to L2 range - far left feather
		*/
		applyLeftFeather2(slide, percent) {
			const offsetX = this.paddingLeft;
			const feather2SlideWidth = this.featherWidth;
			const startRotation = this.featherRotation + this.featherRotation * this.featherScale;
			const rotationAmount = -(startRotation + (this.featherRotation - startRotation) * percent);
			const startScale = this.featherScale * this.featherScale * .9;
			const scaleAmount = startScale + (this.featherScale - startScale) * percent;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
			slide.style.transformOrigin = "left bottom";
			slide.style.zIndex = 1;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${feather2SlideWidth}px`;
		}
		/**
		* Apply left feather 1: \ (z-index 2)
		* CL1 to L1 range - near left feather (handles center at percent=1)
		*/
		applyLeftFeather1(slide, percent) {
			const offsetX = this.paddingLeft;
			const featherSlideWidth = this.featherWidth;
			const rotationAmount = -this.featherRotation * (1 - percent);
			const scaleAmount = this.featherScale + (1 - this.featherScale) * percent;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
			slide.style.transformOrigin = "left bottom";
			slide.style.zIndex = 2;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${featherSlideWidth}px`;
		}
		/**
		* Apply left feather 0: transition to center
		* CL1 to L1 range - transitions from feather width to full width
		*/
		applyLeftFeather0(slide, percent) {
			const offsetX = this.paddingLeft;
			const slideWidth = this.featherWidth + (this.slideWidth - this.featherWidth) * percent;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "left bottom";
			slide.style.zIndex = 3;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${slideWidth}px`;
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
		* Apply right feather 0: transition to center
		* CR1 to R1 range - transitions from full width to feather width
		*/
		applyRightFeather0(slide, percent) {
			const slideWidth = this.slideWidth + (this.featherWidth - this.slideWidth) * percent;
			const offsetX = this.paddingLeft + (this.slideWidth - slideWidth);
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px)`;
			slide.style.transformOrigin = "right bottom";
			slide.style.zIndex = 3;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${slideWidth}px`;
		}
		/**
		* Apply right feather 1: / (z-index 2)
		* R1 to CR1 range - near right feather (handles center at percent=1)
		*/
		applyRightFeather1(slide, percent) {
			const featherSlideWidth = this.featherWidth;
			const offsetX = this.paddingLeft + (this.slideWidth - featherSlideWidth);
			const rotationAmount = this.featherRotation * percent;
			const scaleAmount = 1 + (this.featherScale - 1) * percent;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
			slide.style.transformOrigin = "right bottom";
			slide.style.zIndex = 2;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${featherSlideWidth}px`;
		}
		/**
		* Apply right feather 2: // (z-index 1)
		* R2 to R1 range - far right feather
		*/
		applyRightFeather2(slide, percent) {
			const feather2SlideWidth = this.featherWidth;
			const offsetX = this.paddingLeft + (this.slideWidth - feather2SlideWidth);
			const startRotation = this.featherRotation;
			const rotationAmount = startRotation + (this.featherRotation + this.featherRotation * this.featherScale - startRotation) * percent;
			const startScale = this.featherScale;
			const scaleAmount = startScale + (this.featherScale * this.featherScale * .9 - startScale) * percent;
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
			slide.style.transformOrigin = "right bottom";
			slide.style.zIndex = 1;
			slide.style.opacity = 1;
			slide.show();
			slide.style.width = `${feather2SlideWidth}px`;
		}
		/**
		* Apply right feather 3: fade out transition
		* R2 to R3 range - fading out with extra rotation and scaling
		*/
		applyRightFeather3(slide, percent) {
			const feather3SlideWidth = this.featherWidth;
			const offsetX = this.paddingLeft + (this.slideWidth - feather3SlideWidth);
			const startRotation = this.featherRotation + this.featherRotation * this.featherScale;
			const rotationAmount = startRotation + (startRotation + this.featherRotation * .5 - startRotation) * percent;
			const startScale = this.featherScale * this.featherScale * .9;
			const scaleAmount = startScale + (startScale * this.featherScale - startScale) * percent;
			const opacity = percent < .5 ? 1 : 1 * (1 - (percent - .5) / .5);
			slide.style.transform = `translate3d(${offsetX}px, 0px, 0px) rotate(${rotationAmount}deg) scale(${scaleAmount})`;
			slide.style.transformOrigin = "right bottom";
			slide.style.zIndex = 0;
			slide.style.opacity = opacity;
			slide.show();
			slide.style.width = `${feather3SlideWidth}px`;
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
	effectName: "peacock",
	factory: createPeacockEffect
});
//#endregion
export { createPeacockEffect as default };

//# sourceMappingURL=peacock.esm.js.map