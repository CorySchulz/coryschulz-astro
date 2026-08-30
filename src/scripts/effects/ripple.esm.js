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
//#region src/effects/ripple/ripple-window.js
var RippleWindow = class {
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
		_.viewportWidth = widths.viewport;
		_.gapWidth = widths.gap;
		_.slideWidth = widths.slide;
		_.slideAndGapWidth = widths.slideAndGap;
		_.trackStartPos = widths.paddingLeft;
		_.trackEndPos = widths.viewport - widths.track + widths.gap - widths.paddingRight;
	}
	setMaxValue(maxValue) {
		this.#maxValue = maxValue;
	}
	addAmount(trackDelta, trackPos = 0) {
		const _ = this;
		if (!_.options.loop) {
			if (trackPos > _.trackStartPos) return;
			if (trackPos < _.trackEndPos) return;
		}
		if (!_.options.loop && trackDelta > 0 && trackPos > -1 * _.slideWidth) _.#value -= trackDelta;
		else if (!_.options.loop && trackDelta < 0 && trackPos < _.trackEndPos + _.slideAndGapWidth) _.#value -= trackDelta;
		else _.#value += trackDelta;
		if (_.#value < 0) _.#value = 0;
		else if (_.#value > _.#maxValue) _.#value = _.#maxValue;
		return _.#value;
	}
	getPercent() {
		return this.#maxValue > 0 ? this.#value / this.#maxValue : 0;
	}
	snapToValue(trackDelta, trackPos) {
		const _ = this;
		if (_.#value === 0 || _.#value === _.#maxValue) return;
		const addSettleAmount = Math.abs(trackDelta) * 1.25;
		if (_.#value > _.#maxValue / 2) _.addAmount(addSettleAmount, trackPos);
		else _.addAmount(-addSettleAmount, trackPos);
	}
	destroy() {
		const _ = this;
		_.ctx = null;
		_.effect = null;
		_.handlers = null;
	}
};
//#endregion
//#region src/effects/ripple/transform-region.js
var TransformRegion = class {
	constructor(options) {
		const _ = this;
		const { name, property, roundSubPixel } = options;
		_.enabled = true;
		_.name = name;
		_.property = property;
		_.roundSubPixel = roundSubPixel;
	}
	updateOptions({ startPos, endPos, startValue, endValue, enabled = true }) {
		Object.assign(this, {
			enabled,
			startPos,
			endPos,
			startValue,
			endValue
		});
	}
	applyTransform(slide, percent, trackPos) {
		const _ = this;
		if (!_.enabled || percent === 0) return;
		trackPos *= -1;
		const startPos = _.roundSubPixel(trackPos + _.startPos);
		const endPos = _.roundSubPixel(trackPos + _.endPos);
		const centerPos = _.roundSubPixel(slide._centerPoint || 0);
		let percentInRange = 0;
		if (startPos > endPos) {
			if (centerPos >= endPos && centerPos <= startPos) {
				const range = startPos - endPos;
				percentInRange = (centerPos - endPos) / range;
			}
		} else if (centerPos >= startPos && centerPos < endPos) {
			const range = endPos - startPos;
			percentInRange = 1 - (centerPos - startPos) / range;
		}
		if (percentInRange <= 0) return;
		const valueRange = _.startValue - _.endValue;
		const valueChange = percentInRange * valueRange;
		const finalValueApplied = percent * (_.endValue + valueChange);
		slide[_.property] += finalValueApplied;
	}
	destroy() {
		const _ = this;
		_.enabled = false;
		_.name = null;
		_.property = null;
		_.roundSubPixel = null;
		_.startPos = null;
		_.endPos = null;
		_.startValue = null;
		_.endValue = null;
	}
};
//#endregion
//#region src/effects/ripple/ripple-transforms.js
var RippleTransforms = class {
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.paddingLeftWidth = 0;
		_.slideMinWidth = 0;
		_.handlers = {
			windowResize: () => _.reInit(),
			optionsChanged: () => _.reInit()
		};
		const region = (options) => new TransformRegion({
			...options,
			roundSubPixel: ctx.utils.roundSubPixel
		});
		_.leftEndToMin = region({ property: "_leftWidthTrimmed" });
		_.leftMinToSquished = region({ property: "_leftWidthTrimmed" });
		_.leftSquishedToFull = region({ property: "_leftWidthTrimmed" });
		_.leftFullToMin = region({ property: "_leftWidthTrimmed" });
		_.leftFullToMinEnd = region({ property: "_leftWidthTrimmed" });
		_.rightEndToMin = region({
			name: "right width end",
			property: "_rightWidthTrimmed"
		});
		_.rightMinToSquished = region({ property: "_rightWidthTrimmed" });
		_.rightSquishedToFull = region({ property: "_rightWidthTrimmed" });
		_.rightFullToMin = region({ property: "_rightWidthTrimmed" });
		_.rightFullToMinEnd = region({ property: "_rightWidthTrimmed" });
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
		const pointL2 = halfSlideWidth + _.paddingLeftWidth;
		const pointL1 = pointL2 - slideAndGapWidth;
		const pointLMaskOut = pointL2 - slideWidth + slideMinWidth;
		const pointL3 = pointL2 + slideAndGapWidth;
		_.leftEndToMin.updateOptions({
			startPos: pointL1 - _.trackWidth,
			endPos: pointL1,
			startValue: minSize,
			endValue: minSize
		});
		_.leftMinToSquished.updateOptions({
			startPos: pointL1,
			endPos: pointL2,
			startValue: minSize,
			endValue: removedAmount
		});
		_.leftSquishedToFull.updateOptions({
			startPos: pointL2,
			endPos: pointL3,
			startValue: removedAmount,
			endValue: 0
		});
		_.leftFullToMin.updateOptions({
			startPos: pointLMaskOut,
			endPos: pointL2,
			startValue: minSize,
			endValue: 0
		});
		_.leftFullToMinEnd.updateOptions({
			startPos: pointLMaskOut - _.trackWidth,
			endPos: pointLMaskOut,
			startValue: minSize,
			endValue: minSize
		});
		const pointR2 = _.viewportWidth - halfSlideWidth - _.paddingRightWidth;
		const pointR1 = pointR2 - slideAndGapWidth;
		const pointR3 = pointR2 + slideAndGapWidth;
		const pointR4 = pointR3 + _.trackWidth;
		const pointRMaskOut = pointR2 + slideWidth - slideMinWidth;
		_.rightSquishedToFull.updateOptions({
			startPos: pointR2,
			endPos: pointR1,
			startValue: removedAmount,
			endValue: 0
		});
		_.rightMinToSquished.updateOptions({
			startPos: pointR3,
			endPos: pointR2,
			startValue: minSize,
			endValue: removedAmount
		});
		_.rightEndToMin.updateOptions({
			startPos: pointR4,
			endPos: pointR3,
			startValue: minSize,
			endValue: minSize
		});
		_.rightFullToMin.updateOptions({
			startPos: pointRMaskOut,
			endPos: pointR2,
			startValue: minSize,
			endValue: 0
		});
		_.rightFullToMinEnd.updateOptions({
			startPos: pointRMaskOut + _.trackWidth,
			endPos: pointRMaskOut,
			startValue: minSize,
			endValue: minSize
		});
	}
	applyTransforms(slide, trackPos, percent, _frame) {
		const _ = this;
		_.leftEndToMin.applyTransform(slide, percent, trackPos);
		_.leftMinToSquished.applyTransform(slide, percent, trackPos);
		_.leftSquishedToFull.applyTransform(slide, percent, trackPos);
		_.leftFullToMin.applyTransform(slide, 1 - percent, trackPos);
		_.leftFullToMinEnd.applyTransform(slide, 1 - percent, trackPos);
		_.rightEndToMin.applyTransform(slide, 1 - percent, trackPos);
		_.rightMinToSquished.applyTransform(slide, 1 - percent, trackPos);
		_.rightSquishedToFull.applyTransform(slide, 1 - percent, trackPos);
		_.rightFullToMin.applyTransform(slide, percent, trackPos);
		_.rightFullToMinEnd.applyTransform(slide, percent, trackPos);
		if (slide._leftWidthTrimmed < 0) slide._leftWidthTrimmed = Math.abs(slide._leftWidthTrimmed);
		if (slide._rightWidthTrimmed < 0) slide._rightWidthTrimmed = Math.abs(slide._rightWidthTrimmed);
	}
	destroy() {
		const _ = this;
		_.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.windowResize);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
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
		_.ctx = null;
		_.handlers = null;
	}
};
//#endregion
//#region src/effects/ripple.js
function createRippleEffect(TarotEffect) {
	return class RippleEffect extends TarotEffect {
		static effectName = "ripple";
		static rules = {
			minSlidesPerView: 1,
			maxSlidesPerView: Infinity,
			loopBuffer: {
				left: 2,
				right: 2
			}
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
		render(frame, _utils) {
			const _ = this;
			const { slides, widths, animation } = frame;
			_.rippleWindow.setMaxValue(widths.slide - widths.slideMin);
			_.renderTrackWidth(widths.track);
			_.renderTrackPosition(animation);
			_.renderSlideWidth(widths.slide);
			const trackPosition = animation.trackPosition;
			const trackDelta = animation.trackDelta || 0;
			const movementType = animation.movementType || "jump";
			const progress = animation.progress || 1;
			if (movementType === "scroll" || (movementType === "animate" || movementType === "drag") && progress <= 1) _.rippleWindow.addAmount(trackDelta, trackPosition);
			if (movementType === "settle" || movementType === "animate" && progress > .75) _.rippleWindow.snapToValue(trackDelta, trackPosition);
			const transformPercent = _.rippleWindow.getPercent();
			let totalRemovedRight = 0;
			let slide;
			for (let i = 0, n = slides.length; i < n; ++i) {
				slide = slides[i];
				slide._rightWidthTrimmed = 0;
				slide._leftWidthTrimmed = 0;
				_.rippleTransforms.applyTransforms(slide, trackPosition, transformPercent, frame);
				const displayWidth = widths.slide - slide._rightWidthTrimmed - slide._leftWidthTrimmed;
				slide.style.transition = "none";
				slide.style.width = `${displayWidth}px`;
				slide._renderPosition = slide._trackPosition - totalRemovedRight;
				totalRemovedRight += slide._rightWidthTrimmed;
			}
			let totalRemovedLeft = 0;
			for (let k = slides.length - 1; k >= 0; --k) {
				slide = slides[k];
				totalRemovedLeft += slide._leftWidthTrimmed;
				slide._renderPosition += totalRemovedLeft;
				slide.style.transform = `translateX(${slide._renderPosition}px)`;
			}
		}
		destroy() {
			super.destroy();
			const _ = this;
			_.rippleWindow?.destroy();
			_.rippleTransforms?.destroy();
			const slides = _.ctx.store.getSlides() || [];
			for (let i = 0, n = slides.length; i < n; ++i) {
				const slide = slides[i];
				if (!slide || !slide.style) continue;
				slide.removeAttribute("aria-hidden");
				slide.style.width = "";
				slide.style.transform = "";
				slide.style.transition = "";
			}
			_.rippleWindow = null;
			_.rippleTransforms = null;
		}
	};
}
(window.TarotEffectQueue = window.TarotEffectQueue || []).push({
	effectName: "ripple",
	factory: createRippleEffect
});
//#endregion
export { createRippleEffect as default };

//# sourceMappingURL=ripple.esm.js.map