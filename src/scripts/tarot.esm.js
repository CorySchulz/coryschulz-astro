/*! Tarot Carousel v0.1.0 (beta) | Copyright 2026 Magic Spells LLC | Author: Cory Schulz | Source-available under Non-Commercial, Commercial, and Enterprise licenses: https://www.magicspells.io/licenses */
//#region src/scripts/custom-elements.js
var BaseElement = typeof HTMLElement === "undefined" ? class {} : HTMLElement;
var TarotSlide = class extends BaseElement {
	_index = 0;
	_renderIndex = 0;
	_selected = false;
	_trackPosition = 0;
	_renderPosition = 0;
	_centerPoint = 0;
	/**
	* Stamp the default slide semantics, but only when nothing else owns the
	* role. Custom-element reactions run in tree order, so <tarot-carousel>'s
	* connectedCallback — which synchronously builds its managers and plugins —
	* completes before its <tarot-slide> descendants connect. An unconditional
	* stamp here therefore clobbered the role="tab" that as-nav-for had just
	* applied to every slide, leaving the tablist incomplete for assistive tech.
	* Guarding on `role` keeps the default for plain carousels, late-added
	* slides and reconnections, while leaving a role another owner set — the nav
	* plugin, or the author — intact. Both attributes hang off the one guard so
	* a reconnecting nav slide doesn't regain aria-roledescription="slide";
	* as-nav-for's disableNavUI() still restores the pair explicitly.
	*/
	connectedCallback() {
		if (this.hasAttribute("role")) return;
		this.setAttribute("role", "group");
		this.setAttribute("aria-roledescription", "slide");
	}
	hide() {
		this.style.visibility = "hidden";
		this.style.pointerEvents = "none";
	}
	show() {
		this.style.visibility = "";
		this.style.pointerEvents = "";
	}
};
if (typeof customElements !== "undefined" && !customElements.get("tarot-slide")) customElements.define("tarot-slide", TarotSlide);
//#endregion
//#region src/scripts/lib/event-emitter.js
/**
* EventEmitter - A simple event system that allows subscribing to and emitting events
* @class
*/
var EventEmitter = class {
	/** @type {Map} - Private map of event names to arrays of listener objects */
	#events;
	/** @type {Array} - Queued deferred deliveries: [event, fn, args] tuples */
	#deferredQueue;
	/** @type {boolean} - Whether a deferred flush is already scheduled */
	#flushScheduled;
	/**
	* Creates a new EventEmitter instance
	*/
	constructor() {
		this.#events = /* @__PURE__ */ new Map();
		this.#deferredQueue = [];
		this.#flushScheduled = false;
	}
	/**
	* Binds a listener to an event.
	* @param {string} event - The event to bind the listener to.
	* @param {Function} listener - The listener function to bind.
	* @param {Object} [options] - Optional settings.
	* @param {boolean} [options.defer=false] - If true, listener runs async (next tick).
	* @returns {EventEmitter} The current instance for chaining.
	* @throws {TypeError} If the listener is not a function.
	*/
	on(event, listener, options) {
		if (typeof listener !== "function") throw new TypeError("Listener must be a function");
		let listeners = this.#events.get(event);
		if (!listeners) {
			listeners = [];
			this.#events.set(event, listeners);
		}
		if (!listeners.some((entry) => entry.fn === listener)) listeners.push({
			fn: listener,
			defer: options?.defer || false
		});
		return this;
	}
	/**
	* Unbinds a listener from an event.
	* @param {string} event - The event to unbind the listener from.
	* @param {Function} listener - The listener function to unbind.
	* @returns {EventEmitter} The current instance for chaining.
	*/
	off(event, listener) {
		const listeners = this.#events.get(event);
		if (!listeners) return this;
		const index = listeners.findIndex((entry) => entry.fn === listener);
		if (index !== -1) {
			listeners.splice(index, 1);
			if (listeners.length === 0) this.#events.delete(event);
		}
		return this;
	}
	/**
	* Triggers an event and calls all bound listeners.
	* @param {string} event - The event to trigger.
	* @param {...*} args - Arguments to pass to the listener functions.
	* @returns {boolean} True if the event had listeners, false otherwise.
	*/
	emit(event, ...args) {
		return this.#dispatch(event, args, false);
	}
	/**
	* Delivers an event synchronously to every listener, ignoring defer flags.
	* Used for final lifecycle delivery while the owning instance is still intact.
	* @param {string} event - The event to trigger.
	* @param {...*} args - Arguments to pass to the listener functions.
	* @returns {boolean} True if the event had listeners, false otherwise.
	*/
	emitNow(event, ...args) {
		return this.#dispatch(event, args, true);
	}
	/**
	* Shared delivery loop for emit() and emitNow().
	* @param {string} event - The event to trigger.
	* @param {Array} args - Arguments to pass to the listener functions.
	* @param {boolean} forceSync - Deliver to deferred listeners synchronously too.
	* @returns {boolean} True if the event had listeners, false otherwise.
	*/
	#dispatch(event, args, forceSync) {
		const listeners = this.#events.get(event);
		if (!listeners || listeners.length === 0) return false;
		const snapshot = [...listeners];
		for (let i = 0, n = snapshot.length; i < n; ++i) {
			const entry = snapshot[i];
			if (entry.defer && !forceSync) {
				this.#deferredQueue.push([
					event,
					entry.fn,
					args
				]);
				if (!this.#flushScheduled) {
					this.#flushScheduled = true;
					setTimeout(() => this.#flushDeferred(), 0);
				}
			} else try {
				entry.fn.apply(this, args);
			} catch (error) {
				console.error(`tarot: listener error '${event}':`, error);
			}
		}
		return true;
	}
	/**
	* Delivers all queued deferred listener calls in FIFO order.
	*/
	#flushDeferred() {
		this.#flushScheduled = false;
		const queue = this.#deferredQueue;
		this.#deferredQueue = [];
		for (const [event, fn, args] of queue) try {
			fn.apply(this, args);
		} catch (error) {
			console.error(`tarot: listener error '${event}':`, error);
		}
	}
	destroy() {
		this.#events.clear();
		this.#deferredQueue.length = 0;
	}
};
//#endregion
//#region src/scripts/lib/velocity-calculator.js
/**
* Calculates velocity using decoupled position and time stacks.
* Position deltas are collected at pointer event rate (irregular).
* Time deltas are collected at rAF rate (consistent ~16.67ms).
* Velocity is calculated on-demand by dividing sum of positions by sum of times.
*/
var VelocityCalculator = class {
	/** @type {number[]} - Last N position deltas from pointer events */
	#posDeltas = [];
	/** @type {number[]} - Last N time deltas from rAF ticks */
	#timeDeltas = [];
	/** @type {number} - Number of samples to keep in each stack */
	#historySize = 4;
	/** @type {number} - Timestamp of previous rAF tick */
	#prevTime = 0;
	/** @type {number|null} - rAF ID for cancellation */
	#rafId = null;
	/** @type {boolean} - Whether the calculator is actively running */
	#isRunning = false;
	/** @type {number} - Reference frame time for normalization (60fps = 16.67ms) */
	#referenceTime = 16.67;
	/**
	* Start tracking velocity
	*/
	start() {
		const _ = this;
		_.stop();
		_.#posDeltas = [];
		_.#timeDeltas = [];
		_.#prevTime = performance.now();
		_.#isRunning = true;
		_.#tick();
	}
	/**
	* Add a position delta from a pointer event
	* @param {number} delta - Position change since last pointer event
	*/
	addDelta(delta) {
		this.#posDeltas.push(delta);
		if (this.#posDeltas.length > this.#historySize) this.#posDeltas.shift();
	}
	/**
	* Stop tracking and return the final velocity
	* @returns {number} - Final velocity normalized to 60fps baseline
	*/
	stop() {
		const _ = this;
		_.#isRunning = false;
		if (_.#rafId !== null) {
			cancelAnimationFrame(_.#rafId);
			_.#rafId = null;
		}
		return _.getVelocity();
	}
	/**
	* Get the current velocity without stopping
	* Calculates on-demand from position and time stacks
	* @returns {number} - Current velocity normalized to 60fps baseline
	*/
	getVelocity() {
		const _ = this;
		if (_.#posDeltas.length === 0 || _.#timeDeltas.length === 0) return 0;
		const totalPos = _.#posDeltas.reduce((a, b) => a + b, 0);
		const totalTime = _.#timeDeltas.reduce((a, b) => a + b, 0);
		if (totalTime === 0) return 0;
		const velocity = totalPos / totalTime * _.#referenceTime;
		return Math.max(-5e3, Math.min(5e3, velocity));
	}
	/**
	* Internal rAF tick that collects time deltas
	* @param {number} [time] - rAF timestamp
	*/
	#tick(time) {
		const _ = this;
		if (!_.#isRunning) return;
		if (time !== void 0) {
			const deltaTime = time - _.#prevTime;
			if (deltaTime > 0 && deltaTime <= 100) {
				_.#timeDeltas.push(deltaTime);
				if (_.#timeDeltas.length > _.#historySize) _.#timeDeltas.shift();
			}
			_.#prevTime = time;
		}
		_.#rafId = requestAnimationFrame((t) => _.#tick(t));
	}
};
//#endregion
//#region src/scripts/utils/track-math.js
/**
* Track position calculation utilities
* Pure functions for converting between slide indices and track positions
*/
/**
* Convert slide index to track position
* @param {number} slideIndex - The index of the slide
* @param {Object} widths - Width measurements from store
* @param {Object} options - Carousel options from store
* @param {Object} state - Carousel state from store
* @returns {number} The position on the track (negative for transform)
*/
function getTrackPosForIndex(slideIndex, widths, options, state) {
	if (widths.centerOffset > 0) return widths.paddingLeft + widths.centerOffset;
	const slidePos = slideIndex * (widths.slide + widths.gap);
	let pos;
	if (options.align === "center") pos = slidePos - widths.viewport / 2 + widths.slide / 2;
	else pos = slidePos - widths.paddingLeft;
	if (!state.canLoop) {
		const minPos = -widths.paddingLeft;
		const maxPos = widths.track - widths.viewport - widths.gap + widths.paddingRight;
		pos = Math.max(minPos, Math.min(pos, maxPos));
	}
	return pos !== 0 ? -pos : 0;
}
/**
* Convert track position to slide index (inverse of getTrackPosForIndex)
* @param {number} trackPosition - Current track position (negative for transform)
* @param {Object} widths - Width measurements from store
* @param {Object} options - Carousel options from store
* @param {number} [velocity=0] - Current velocity for tie-breaking
* @param {number} [slideCount=Infinity] - Total number of slides for clamping
* @returns {number} The nearest slide index
*/
function getIndexForTrackPos(trackPosition, widths, options, velocity = 0, slideCount = Infinity) {
	const slideAndGap = widths.slide + widths.gap;
	if (slideAndGap <= 0) return 0;
	if (widths.centerOffset > 0) return 0;
	let pos = -trackPosition;
	if (options.align === "center") pos = pos + widths.viewport / 2 - widths.slide / 2;
	else pos = pos + widths.paddingLeft;
	const rawIndex = pos / slideAndGap;
	let index;
	const fractionalPart = rawIndex - Math.floor(rawIndex);
	if (velocity !== 0 && Math.abs(fractionalPart - .5) < .01) index = velocity < 0 ? Math.ceil(rawIndex) : Math.floor(rawIndex);
	else index = Math.round(rawIndex);
	return Math.max(0, Math.min(index, slideCount - 1));
}
/**
* Project where momentum will coast to and pick the snap target for it.
* Policy extracted from TrackAnimator so every index↔position convention
* (centering, padding, loop unwrapping) lives beside its inverse here.
*
* @param {number} position - Current track position (negative for transform)
* @param {number} velocity - Current momentum velocity
* @param {Object} widths - Width measurements from store
* @param {Object} options - Carousel options from store
* @param {Object} state - Carousel state from store (slideCount, pageCount, canLoop)
* @returns {{ index:number, pageIndex:number, position:number }|null}
*   Snap target, or null when there is no geometry to project onto
*   (zero-width layout, e.g. a carousel inside display:none at init)
*/
function projectMomentumTarget(position, velocity, widths, options, state) {
	const slideAndGap = widths.slide + widths.gap;
	if (slideAndGap <= 0) return null;
	if (widths.centerOffset > 0) return {
		index: 0,
		pageIndex: 0,
		position: getTrackPosForIndex(0, widths, options, state)
	};
	const { slideCount, pageCount, canLoop } = state;
	const friction = options.animation?.freeScrollFriction || .96;
	const safeFriction = Math.min(friction, .999);
	let projectedPosition = -(position + velocity * (safeFriction / (1 - safeFriction)));
	if (options.align === "center") projectedPosition = projectedPosition + widths.viewport / 2 - widths.slide / 2;
	else projectedPosition = projectedPosition + widths.paddingLeft;
	const projectedIndex = projectedPosition / slideAndGap;
	let targetIndex;
	if (velocity < 0) targetIndex = Math.floor(projectedIndex + .6);
	else targetIndex = Math.floor(projectedIndex + .4);
	let positionIndex = targetIndex;
	if (canLoop) targetIndex = (targetIndex % slideCount + slideCount) % slideCount;
	else {
		targetIndex = Math.max(0, Math.min(targetIndex, slideCount - 1));
		positionIndex = targetIndex;
	}
	const slidesPerMove = options.slidesPerMove || 1;
	const pageIndex = Math.max(0, Math.min(Math.floor(targetIndex / slidesPerMove), pageCount - 1));
	return {
		index: targetIndex,
		pageIndex,
		position: getTrackPosForIndex(positionIndex, widths, options, state)
	};
}
/**
* Derive the loop geometry from snap points + track width.
*
* `range` is the normal snap travel (firstSnap - lastSnap, >= 0 in a valid layout).
* `loopRange` is the leftover track distance beyond that range — the "seam" the track
* crosses when wrapping from the last page back to the first.
*
* Non-finite snap points / track width are clamped to 0 so the math never poisons
* downstream values with NaN.
*
* @param {Object} state - Carousel state (firstSnapPoint, lastSnapPoint, canLoop)
* @param {Object} widths - Width measurements (track)
* @returns {{ canLoop: boolean, firstSnap: number, lastSnap: number, range: number, loopRange: number }}
*/
function getTrackGeometry(state, widths) {
	const firstSnap = Number.isFinite(state.firstSnapPoint) ? state.firstSnapPoint : 0;
	const lastSnap = Number.isFinite(state.lastSnapPoint) ? state.lastSnapPoint : 0;
	const trackWidth = Number.isFinite(widths.track) ? widths.track : 0;
	const range = firstSnap - lastSnap;
	const loopRange = trackWidth - Math.abs(range);
	return {
		canLoop: !!state.canLoop,
		firstSnap,
		lastSnap,
		range,
		loopRange
	};
}
/**
* Forward map: absolute track position -> spatial percent.
*
* Returns 0..1 across the normal snap range. When looping, it deliberately extends
* past the bounds across the loop seam — into (1, 2] forward and [-1, 0) backward —
* so motion stays continuous through the wrap instead of snapping. When `!canLoop`
* the elastic overflow is preserved (not clamped) so drag effects can show it.
*
* Exact inverse of {@link percentToTrackPos} — keep the two in sync.
*
* @param {number} trackPosition - Current track position (negative for transform)
* @param {ReturnType<typeof getTrackGeometry>} geometry
* @returns {number} Spatial percent (usually 0-1, may overflow during loop/elastic states)
*/
function trackPosToPercent(trackPosition, geometry) {
	const { canLoop, firstSnap, lastSnap, range, loopRange } = geometry;
	if (!Number.isFinite(trackPosition) || range === 0) return 0;
	const percent = (firstSnap - trackPosition) / range;
	if (!canLoop || percent >= 0 && percent <= 1 || loopRange <= 0) return percent;
	if (percent > 1) return 1 + (lastSnap - trackPosition) / loopRange;
	return -((trackPosition - firstSnap) / loopRange);
}
/**
* Inverse map: spatial percent -> absolute track position.
*
* Exact inverse of {@link trackPosToPercent} — keep the two in sync. Accepts the
* same extended (-1, 2) domain so a percent produced during a loop-seam transition
* resolves back to the position it came from.
*
* @param {number} percent - 0-1 position (may overflow for loop-seam transitions)
* @param {ReturnType<typeof getTrackGeometry>} geometry
* @returns {number} Track position in pixels
*/
function percentToTrackPos(percent, geometry) {
	const { canLoop, firstSnap, lastSnap, range, loopRange } = geometry;
	if (!Number.isFinite(percent) || range === 0) return firstSnap;
	if (!canLoop || percent >= 0 && percent <= 1 || loopRange <= 0) return firstSnap - percent * range;
	if (percent > 1) return lastSnap - (percent - 1) * loopRange;
	return firstSnap + -percent * loopRange;
}
var RUBBERBAND_COEF = .55;
/**
* iOS-style rubber-band resistance for dragging past a track edge.
* Maps a raw overshoot distance to a resisted display distance that grows
* ever more slowly and never exceeds `dimension` (asymptotic cap).
*
* Exact inverse of {@link inverseRubberband} — keep the two in sync.
*
* @param {number} overshoot - Raw drag distance past the edge (px)
* @param {number} dimension - Reference dimension (viewport width, px)
* @returns {number} Resisted overscroll distance (px), 0 <= result < dimension
*/
function rubberband(overshoot, dimension) {
	if (overshoot <= 0 || dimension <= 0) return 0;
	const u = overshoot * RUBBERBAND_COEF / dimension;
	return u / (u + 1) * dimension;
}
/**
* Inverse map: resisted overscroll distance -> raw overshoot distance.
* Used when a drag starts while the track is already past an edge, so the
* drag origin is expressed in unresisted coordinates and resistance is not
* applied on top of an already-resisted position.
*
* Exact inverse of {@link rubberband} — keep the two in sync.
*
* @param {number} resisted - Resisted overscroll distance (px)
* @param {number} dimension - Reference dimension (viewport width, px)
* @returns {number} Raw overshoot distance (px)
*/
function inverseRubberband(resisted, dimension) {
	if (resisted <= 0 || dimension <= 0) return 0;
	const clamped = Math.min(resisted, dimension * .999);
	return dimension * clamped / (RUBBERBAND_COEF * (dimension - clamped));
}
//#endregion
//#region src/scripts/utils/utils.js
var INTERACTIVE_SELECTOR = "input, select, textarea, button, a, label, [contenteditable=\"\"], [contenteditable=\"true\"], [tabindex]:not([tabindex=\"-1\"])";
/**
* debounce calls a function after a specified delay has passed since the last time it was invoked.
* @param {Function} func - the function to debounce
* @param {number} wait - the number of milliseconds to wait before calling func
* @param {boolean} [immediate=false] - if true, func is called on the leading edge of the timeout
* @returns {Function} a debounced function that delays invoking func
*/
function debounce(func, wait, immediate) {
	var timeout;
	var debounced = function(...args) {
		var context = this;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
	debounced.cancel = function() {
		clearTimeout(timeout);
		timeout = null;
	};
	return debounced;
}
/**
* Deep merge two objects.
* @param {Object} target - The target object.
* @param {Object} source - The source object.
* @returns {Object} - The merged object.
*/
function deepMerge(target, source) {
	const isObject = (obj) => obj && typeof obj === "object";
	if (!isObject(source)) return { ...target };
	return Object.keys(source).reduce((acc, key) => {
		if (Array.isArray(source[key])) acc[key] = source[key];
		else if (isObject(acc[key]) && isObject(source[key])) acc[key] = deepMerge({ ...acc[key] }, source[key]);
		else acc[key] = source[key];
		return acc;
	}, { ...target });
}
function convertValueToNumber(value, width) {
	if (typeof value === "number") return value;
	if (typeof value !== "string") return 0;
	if (value.indexOf("px") > -1) return parseFloat(value.replace("px", ""));
	else if (value.indexOf("%") > -1) return parseFloat(value.replace("%", "")) / 100 * width;
	else if (value.indexOf("rem") > -1) return parseFloat(value.replace("rem", "")) * 16;
	if (value.trim() !== "") console.warn(`tarot: bad unit "${value}" — use px, %, or rem`);
	return 0;
}
/**
* Determines if looping is possible and should be enabled
* @param {number} slideCount - Total number of slides
* @param {Object} options - Carousel options containing loop and slidesPerView settings
* @param {Object} [loopBuffer={left:0,right:0}] - Effect buffer requirements for extra slides
* @returns {boolean} true if looping should be enabled, false otherwise
*/
function canLoop(slideCount, options, loopBuffer) {
	if (!options.loop) return false;
	const slidesPerView = options.slidesPerView || 1;
	return slideCount >= Math.max(slidesPerView + loopBuffer.left + loopBuffer.right, slidesPerView + 1);
}
/**
* Calculate which slides are visible in the viewport and their visibility percentages
* Pure over store slices — callers pass the data in, nothing is read here
* @param {Object} widths - width measurements from store (store.getWidths())
* @param {Array} slides - slide elements from store (store.getSlides())
* @param {number} trackPosition - current track position
* @param {number} [buffer=0] - additional buffer around viewport
* @returns {Array} array of objects with slide info: {slide, index, visibilityPercent, isVisible, isFullyVisible}
*/
function getSlidesInViewport(widths, slides, trackPosition, buffer = 0) {
	const viewportWidth = widths.viewport;
	const slideWidth = widths.slide;
	const slideAndGapWidth = widths.slideAndGap;
	const boundsWidth = widths.visibilityBoundsWidth || viewportWidth;
	const boundsOffset = widths.visibilityBoundsOffset || 0;
	const viewportStart = -trackPosition - buffer;
	const viewportEnd = viewportStart + viewportWidth + buffer * 2;
	const viewportCenter = -trackPosition + viewportWidth / 2;
	const visStart = -trackPosition + boundsOffset - buffer;
	const visEnd = visStart + boundsWidth + buffer * 2;
	const slideInfo = [];
	for (let i = 0; i < slides.length; i++) {
		const slide = slides[i];
		const renderIndex = slide._renderIndex !== void 0 ? slide._renderIndex : i;
		const slideStart = renderIndex * slideAndGapWidth;
		const slideEnd = slideStart + slideWidth;
		const viewportIntersection = Math.max(0, Math.min(slideEnd, viewportEnd) - Math.max(slideStart, viewportStart));
		const viewportVisibilityPercent = Math.max(0, Math.min(1, viewportIntersection / slideWidth));
		const intersection = Math.max(0, Math.min(slideEnd, visEnd) - Math.max(slideStart, visStart));
		const visibilityPercent = Math.max(0, Math.min(1, intersection / slideWidth));
		const isPartiallyVisible = visibilityPercent > 0;
		const isMostlyVisible = visibilityPercent >= .66;
		const isFullyVisible = visibilityPercent >= .98;
		let leftVisibility = 0;
		let rightVisibility = 0;
		let parallax = 0;
		let parallaxVisibility = 1;
		if (viewportIntersection > 0) {
			const distanceFromCenter = slideStart + slideWidth / 2 - viewportCenter;
			parallax = Math.max(-1, Math.min(1, distanceFromCenter / (viewportWidth / 2)));
			if (distanceFromCenter > 0) {
				rightVisibility = Math.max(0, Math.min(1, viewportVisibilityPercent));
				parallaxVisibility = 1 - rightVisibility;
			} else rightVisibility = 1;
			if (distanceFromCenter < 0) {
				leftVisibility = Math.max(0, Math.min(1, viewportVisibilityPercent));
				parallaxVisibility = (1 - leftVisibility) * -1;
			} else leftVisibility = 1;
			if (viewportVisibilityPercent >= 1) {
				leftVisibility = 1;
				rightVisibility = 1;
				parallaxVisibility = 0;
			}
		} else {
			const distanceFromCenter = slideStart + slideWidth / 2 - viewportCenter;
			if (distanceFromCenter > 0) parallaxVisibility = 1;
			if (distanceFromCenter < 0) parallaxVisibility = -1;
		}
		slideInfo.push({
			slide,
			index: i,
			renderIndex,
			visibilityPercent,
			isPartiallyVisible,
			isMostlyVisible,
			isFullyVisible,
			leftVisibility,
			rightVisibility,
			parallax,
			parallaxVisibility,
			slideStart,
			slideEnd
		});
	}
	return slideInfo;
}
/**
* Round to nearest hundredth of a pixel to eliminate floating-point precision issues
* without collapsing distinct positions together.
* @param {number} value - The value to round
* @returns {number} Rounded value
*/
function roundSubPixel(value) {
	return Math.round(value * 100) / 100;
}
/**
* Resolves the visibilityBoundsElement option to an actual HTMLElement.
* Falls back to viewportEl for unmatched selectors or invalid input.
* @param {'viewport'|'carousel'|string|HTMLElement} value - the option value
* @param {HTMLElement} carouselEl - the outer tarot-carousel element
* @param {HTMLElement} viewportEl - the tarot-viewport element
* @returns {HTMLElement} resolved bounds element
*/
function resolveVisibilityBoundsElement(value, carouselEl, viewportEl) {
	if (!value || value === "viewport") return viewportEl;
	if (value === "carousel") return carouselEl;
	if (value instanceof HTMLElement) return value;
	if (typeof value === "string") {
		const resolved = carouselEl.closest(value);
		if (resolved) return resolved;
		console.warn(`tarot: visibilityBoundsElement "${value}" matched no ancestor`);
		return viewportEl;
	}
	return viewportEl;
}
var utils = Object.freeze({
	debounce,
	deepMerge,
	convertValueToNumber,
	canLoop,
	getSlidesInViewport,
	roundSubPixel,
	resolveVisibilityBoundsElement,
	trackMath: Object.freeze({
		getTrackPosForIndex,
		getIndexForTrackPos,
		projectMomentumTarget,
		getTrackGeometry,
		trackPosToPercent,
		percentToTrackPos,
		rubberband,
		inverseRubberband
	})
});
//#endregion
//#region src/scripts/drag-handler.js
/**
* Handles all drag interactions with the carousel.
*
* Gesture model (idle → armed → dragging):
* - pointerdown only *arms* the gesture: record the origin and capture the
*   pointer. It does NOT preventDefault/stopPropagation, so native controls
*   (a `<select>`, inputs, buttons, links, custom focusable widgets) keep
*   working — a press that never becomes a horizontal drag is just a click.
* - pointermove *promotes* to a real drag once it passes the threshold and is
*   horizontal. Only then do we preventDefault and emit `drag:start`.
* - Vertical intent on touch is handed to the browser via `touch-action:
*   pan-y` (set in base.css); the browser scrolls and fires `pointercancel`,
*   which we treat as a clean, no-op end.
*
* @class DragHandler
*/
var DragHandler = class {
	/**
	* Creates a new drag handler for the carousel
	* @param {Object} ctx - The context object containing carousel references and services
	*/
	constructor(ctx) {
		const _ = this;
		/** @type {Object} - Reference to context object */
		_.ctx = ctx;
		/** @type {HTMLElement} - Element to bind drag events to */
		_.track = ctx.track;
		/** @type {VelocityCalculator} - Handles velocity calculation with rAF timing */
		_.velocityCalculator = new VelocityCalculator();
		/** @type {number} - Pixels of horizontal movement required to promote a press into a drag */
		_.dragThreshold = 3;
		/**
		* @type {Object} - Object containing all drag state information
		*/
		_.drag = {
			/** @type {boolean} - Pointer is down and a gesture is being evaluated */
			armed: false,
			/** @type {boolean} - Gesture has been promoted to an active drag */
			isDragging: false,
			/** @type {number|null} - pointerId of the gesture we're tracking */
			pointerId: null,
			/** @type {number} - screenX at the (re-based) drag origin */
			startX: 0,
			/** @type {number} - screenY at pointerdown */
			startY: 0,
			/** @type {number} - Current X position during drag */
			currentPos: 0,
			/** @type {number} - Previous X position (for per-move velocity deltas) */
			prevPos: 0,
			/** @type {number} - Distance moved since the drag origin */
			delta: 0,
			/** @type {number} - Speed of movement */
			velocity: 0,
			/** @type {boolean} - Whether the gesture became a real drag (suppresses the trailing click) */
			dragThresholdMet: false
		};
		/** @type {Object} - Bound event handlers for proper cleanup */
		_.handlers = {
			click: (e) => _.handleClick(e),
			pointerdown: (e) => _.handleDragStart(e),
			pointermove: (e) => _.handleDragMove(e),
			pointerup: (e) => _.handleDragEnd(e),
			pointercancel: (e) => {
				if (e.pointerId === _.drag.pointerId) _.cancelActiveDrag("pointercancel");
			},
			lostpointercapture: (e) => _.handleDragEnd(e),
			touchmove: (e) => {
				if (_.drag.isDragging) e.preventDefault();
			},
			dragstart: (e) => {
				if (!_.ctx.store.getOptions().draggable) return;
				if (e.target.closest("input, select, textarea, [contenteditable=\"\"], [contenteditable=\"true\"], [data-tarot-no-drag]")) return;
				e.preventDefault();
			},
			dblclick: (e) => {
				e.preventDefault();
				e.stopPropagation();
				return false;
			},
			optionsChanged: () => _.syncDraggableAttr(),
			slidesChanged: () => _.cancelActiveDrag("slides-changed"),
			windowResize: () => _.cancelActiveDrag("resize")
		};
		_.init();
	}
	/**
	* Initialize the drag handler
	*/
	init() {
		this.bindEvents();
		this.syncDraggableAttr();
	}
	syncDraggableAttr() {
		const draggable = this.ctx.store.getOptions().draggable;
		this.track.classList.toggle("tarot-drag-disabled", !draggable);
	}
	/**
	* Bind drag events on the carousel track element.
	*/
	bindEvents() {
		const _ = this;
		const track = _.track;
		track.addEventListener("click", _.handlers.click);
		track.addEventListener("pointerdown", _.handlers.pointerdown, { passive: false });
		track.addEventListener("pointermove", _.handlers.pointermove, { passive: false });
		track.addEventListener("pointerup", _.handlers.pointerup, { passive: false });
		track.addEventListener("pointercancel", _.handlers.pointercancel, { passive: false });
		track.addEventListener("lostpointercapture", _.handlers.lostpointercapture);
		track.addEventListener("touchmove", _.handlers.touchmove, { passive: false });
		track.addEventListener("dragstart", _.handlers.dragstart);
		track.addEventListener("dblclick", _.handlers.dblclick);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.on(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.windowResize);
	}
	/**
	* Release the track's pointer capture if we still hold it. Best-effort:
	* the browser throws when the pointer is already gone (a released or
	* cancelled pointer id is no longer valid).
	* @param {number|null} pointerId - pointer to release
	*/
	#releasePointerCapture(pointerId) {
		if (pointerId == null) return;
		try {
			if (this.track.hasPointerCapture?.(pointerId)) this.track.releasePointerCapture(pointerId);
		} catch {}
	}
	/**
	* Cancel an in-flight gesture when slides change or the window resizes.
	* The resulting layout refresh jumps the track, so continuing from the stale
	* drag origin would teleport — canceling is the honest outcome.
	*/
	cancelActiveDrag(reason = "cancelled") {
		const _ = this;
		const drag = _.drag;
		if (!drag.armed) return;
		_.#releasePointerCapture(drag.pointerId);
		const wasDragging = drag.isDragging;
		drag.armed = false;
		drag.isDragging = false;
		drag.pointerId = null;
		drag.delta = 0;
		_.velocityCalculator.stop();
		if (!wasDragging) return;
		_.ctx.store.setState({ isDragging: false });
		_.ctx.emitter.emit(_.ctx.events.drag.cancel, { reason });
		_.ctx.commands.settleTrack();
	}
	/**
	* Handle click events on the track.
	* Suppresses the click that trails a real drag; otherwise emits slides:click.
	* @param {Event} e - The click event.
	*/
	handleClick(e) {
		const _ = this;
		if (_.drag.dragThresholdMet) {
			_.drag.dragThresholdMet = false;
			e.preventDefault();
			return;
		}
		const slide = e.target.closest("tarot-slide");
		if (slide) {
			const index = parseInt(slide.getAttribute("index")) || 0;
			const renderIndex = slide._renderIndex;
			_.ctx.emitter.emit(_.ctx.events.slides.click, {
				index,
				renderIndex,
				event: e
			});
		}
	}
	/**
	* Handle pointerdown: arm the gesture without hijacking the pointer.
	* @param {PointerEvent} e - The pointer down event.
	*/
	handleDragStart(e) {
		const _ = this;
		const drag = _.drag;
		if (drag.armed) return;
		drag.dragThresholdMet = false;
		if (!_.ctx.store.getOptions().draggable) return;
		if (e.target.closest("input, select, textarea, [contenteditable=\"\"], [contenteditable=\"true\"], [data-tarot-no-drag]")) return;
		drag.armed = true;
		drag.isDragging = false;
		drag.pointerId = e.pointerId;
		drag.startX = e.screenX;
		drag.startY = e.screenY;
		drag.currentPos = e.screenX;
		drag.prevPos = e.screenX;
		drag.velocity = 0;
		drag.delta = 0;
		_.velocityCalculator.start();
	}
	/**
	* Handle pointermove: decide tap-vs-drag, then drive the active drag.
	* @param {PointerEvent} e - The pointer move event.
	*/
	handleDragMove(e) {
		const _ = this;
		const drag = _.drag;
		if (!drag.armed || e.pointerId !== drag.pointerId) return;
		if (e.pointerType !== "touch" && e.buttons === 0) {
			drag.armed = false;
			drag.isDragging = false;
			drag.pointerId = null;
			_.velocityCalculator.stop();
			return;
		}
		const posDelta = e.screenX - drag.prevPos;
		drag.prevPos = e.screenX;
		_.velocityCalculator.addDelta(posDelta);
		if (!drag.isDragging) {
			const dx = Math.abs(e.screenX - drag.startX);
			if (Math.abs(e.screenY - drag.startY) > dx) return;
			if (dx <= _.dragThreshold) return;
			drag.startX = e.screenX;
			drag.currentPos = e.screenX;
			drag.delta = 0;
			drag.isDragging = true;
			drag.dragThresholdMet = true;
			_.ctx.store.setState({ isDragging: true });
			if (e.pointerType !== "touch") try {
				_.track.setPointerCapture(e.pointerId);
			} catch {}
			_.ctx.emitter.emit(_.ctx.events.drag.start, {
				event: e,
				drag
			});
		}
		e.preventDefault();
		drag.currentPos = e.screenX;
		drag.delta = drag.currentPos - drag.startX;
		drag.velocity = _.velocityCalculator.getVelocity();
		_.ctx.emitter.emit(_.ctx.events.drag.move, {
			event: e,
			drag
		});
	}
	/**
	* Handle pointerup / pointercancel / lostpointercapture: finalize.
	* A press that never promoted is a tap — left completely untouched so
	* the native click (and slides:click) proceed normally.
	* @param {PointerEvent} e - The terminating pointer event.
	*/
	handleDragEnd(e) {
		const _ = this;
		const drag = _.drag;
		if (!drag.armed || e.pointerId !== drag.pointerId) return;
		_.#releasePointerCapture(drag.pointerId);
		const wasDragging = drag.isDragging;
		drag.armed = false;
		drag.isDragging = false;
		drag.pointerId = null;
		if (!wasDragging) {
			_.velocityCalculator.stop();
			return;
		}
		_.ctx.store.setState({ isDragging: false });
		drag.velocity = _.velocityCalculator.stop();
		_.ctx.emitter.emit(_.ctx.events.drag.end, {
			event: e,
			drag
		});
		drag.delta = 0;
	}
	/**
	* Clean up event listeners and cancel any pending operations
	* Should be called when the carousel is destroyed to prevent memory leaks
	*/
	destroy() {
		const _ = this;
		const track = _.track;
		_.velocityCalculator.stop();
		_.#releasePointerCapture(_.drag.pointerId);
		track.removeEventListener("click", _.handlers.click);
		track.removeEventListener("pointerdown", _.handlers.pointerdown);
		track.removeEventListener("pointermove", _.handlers.pointermove);
		track.removeEventListener("pointerup", _.handlers.pointerup);
		track.removeEventListener("pointercancel", _.handlers.pointercancel);
		track.removeEventListener("lostpointercapture", _.handlers.lostpointercapture);
		track.removeEventListener("touchmove", _.handlers.touchmove);
		track.removeEventListener("dragstart", _.handlers.dragstart);
		track.removeEventListener("dblclick", _.handlers.dblclick);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.windowResize);
	}
};
//#endregion
//#region src/scripts/effect-manager.js
/**
* manages the different display effects for the carousel
*/
var EffectManager = class {
	/** @type {Object} shared module context */
	#ctx;
	/** @type {Object} registry of available effects */
	#effectRegistry;
	/** @type {Object|null} current effect instance */
	#currentEffect = null;
	/**
	* @constructor
	* @param {Object} ctx - shared module context containing emitter, events, store, etc.
	* @param {Object} effectRegistry - registry of available effect classes
	*/
	constructor(ctx, effectRegistry) {
		const _ = this;
		_.#ctx = ctx;
		_.#effectRegistry = effectRegistry;
		_.handlers = {
			optionsChanged: ({ currentOptions }) => {
				const currentEffectName = _.#currentEffect?.constructor?.effectName || _.#currentEffect?.constructor?.name;
				if (currentOptions.effect !== currentEffectName) _.loadEffect(currentOptions.effect);
			},
			effectRegistered: (e) => {
				const registered = e.detail?.effectName;
				const desired = String(_.#ctx.store.getOptions().effect || "").toLowerCase();
				if (registered && registered === desired) _.loadEffect(desired);
			}
		};
		_.init();
	}
	init() {
		this.bindEvents();
	}
	bindEvents() {
		const _ = this;
		_.#ctx.emitter.on(_.#ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		window.addEventListener("tarot:effect-registered", _.handlers.effectRegistered);
	}
	loadCurrentEffect() {
		this.loadEffect(this.#ctx.store.getOptions().effect);
	}
	/**
	* load a specific effect by name
	* @param {string} effectName - name of the effect to load
	*/
	loadEffect(effectName) {
		const _ = this;
		const NewEffectClass = _.#effectRegistry[effectName];
		if (!NewEffectClass) {
			if (effectName !== "carousel") this.loadEffect("carousel");
			return;
		}
		if (_.#currentEffect?.constructor === NewEffectClass) return;
		const previousEffect = _.#currentEffect;
		const previousEffectName = previousEffect?.constructor?.effectName || previousEffect?.constructor?.name;
		if (_.#currentEffect) {
			_.#currentEffect.destroy();
			_.#ctx.emitter.emit(_.#ctx.events.effect.destroyed, { effectName: previousEffectName });
		}
		_.#currentEffect = new NewEffectClass(_.#ctx);
		_.#ctx.carousel.setAttribute("effect", effectName);
		_.#ctx.emitter.emit(_.#ctx.events.effect.loaded, {
			effect: _.#currentEffect,
			effectName
		});
		_.#ctx.emitter.emit(_.#ctx.events.effect.changed, {
			previousEffect,
			currentEffect: _.#currentEffect,
			effectName
		});
	}
	/**
	* get the current effect instance
	* @returns {Object|null} current effect instance
	*/
	getEffect() {
		return this.#currentEffect;
	}
	/**
	* destroy the effect manager, unbinding all events
	*/
	destroy() {
		const _ = this;
		window.removeEventListener("tarot:effect-registered", _.handlers.effectRegistered);
		_.#ctx.emitter.off(_.#ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		if (_.#currentEffect) {
			const effectName = _.#currentEffect.constructor?.effectName || _.#currentEffect.constructor?.name || null;
			_.#currentEffect.destroy();
			_.#ctx.emitter.emit(_.#ctx.events.effect.destroyed, { effectName });
			_.#currentEffect = null;
		}
	}
};
//#endregion
//#region src/scripts/options-manager.js
/**
* @class OptionsManager
* Manages carousel options, responsive breakpoints, and merged settings.
* - merges default options, user options, and a single active breakpoint (non-cumulative)
* - reads options from a DOM element or programmatic updates
* - writes merged options to the data store
* - re-evaluates the current breakpoint on window resize/orientation change
*/
var OptionsManager = class {
	/**
	* Creates a new OptionsManager instance
	* @param {object} ctx - Shared module context (should contain .carousel, .viewport, .emitter, etc)
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		/** @type {object} - Default carousel options */
		_.defaultOptions = {
			/** @type {boolean|string} - Selector for carousel to sync navigation with */
			asNavFor: false,
			/** @type {object} - Physics-based animation settings */
			animation: {
				/** @type {number} - Spring attraction coefficient */
				attraction: .026,
				/** @type {number} - Friction coefficient for dampening */
				friction: .25,
				/** @type {number} - Multiplier for initial velocity */
				velocityBoost: 1.4,
				/** @type {number} - Friction for free scroll momentum (0-1, higher = more slippery) */
				freeScrollFriction: .96
			},
			/** @type {object} - Autoplay settings */
			autoplay: {
				/** @type {number} - Time between slides in ms (0 = disabled) */
				interval: 0,
				/** @type {string} - What happens to autoplay after user interaction */
				afterInteraction: "pause",
				/** @type {number} - How long after the last interaction 'pause' resumes (ms) */
				resumeDelay: 1e4
			},
			/** @type {object} - Responsive breakpoint settings: { [minWidth:number]: optionsObject } */
			breakpoints: {},
			/** @type {string} - Uses either "viewport" or "window" for breakpoints */
			breakpointElement: "window",
			/** @type {string} - Viewport alignment anchor: 'start' (default) or 'center' */
			align: "start",
			/** @type {boolean} - Center the slide group in the viewport when slides underfill it */
			centerInsufficientSlides: false,
			/** @type {boolean} - Whether the carousel can be dragged */
			draggable: true,
			/** @type {number} - Minimum drag distance to trigger slide change */
			dragThreshold: 40,
			/** @type {string} - Class to filter which slides are included */
			filterClass: "",
			/** @type {boolean} - Whether clicking a slide selects it */
			focusOnSelect: false,
			/** @type {number} - Starting slide index */
			initialIndex: 0,
			/** @type {boolean} - Whether carousel should loop */
			loop: false,
			/** @type {string} - Snap behavior: 'page' (default), 'slide' (free scroll + snap), 'none' (free scroll) */
			snap: "page",
			/** @type {string} - Display effect ('carousel', 'fade', etc) */
			effect: "carousel",
			/** @type {number|string} - Gap between slides (px or CSS string) */
			gap: 0,
			/** @type {number|string} - Left padding (px or CSS string) */
			paddingLeft: 0,
			/** @type {number|string} - Right padding (px or CSS string)  */
			paddingRight: 0,
			/** @type {string} - Min width for slides */
			slideMinWidth: "50px",
			/** @type {number} - Slides visible at once */
			slidesPerView: 1,
			/** @type {number} - Slides to move on navigation */
			slidesPerMove: "auto",
			/** @type {object} - Navigation controls settings */
			navigation: {
				/** @type {boolean} - Whether to show navigation buttons */
				showButtons: true,
				/** @type {boolean} - Whether to show previous button */
				showPreviousButton: true,
				/** @type {boolean} - Whether to show next button */
				showNextButton: true,
				/** @type {boolean|string} - Custom selector for previous button */
				previousButtonSelector: false,
				/** @type {boolean|string} - Custom selector for next button */
				nextButtonSelector: false,
				/** @type {boolean} - Whether buttons should hide when navigation limit reached */
				smartButtons: false,
				/** @type {boolean} - Whether to show pagination */
				showPagination: true,
				/** @type {boolean|string} - Custom selector for pagination container */
				paginationSelector: false
			},
			/** @type {boolean} - Automatically go to selected slide */
			goToSelectedSlide: false,
			/** @type {boolean|string} - Selector for carousel to sync with */
			syncWith: false,
			/** @type {boolean} - Enable screen reader announcements for slide navigation */
			announcements: true,
			/** @type {boolean} - Write per-frame slide metric CSS vars (--tarot-visibility, --tarot-parallax, etc.) for CSS-driven styling */
			renderSlideMetrics: false,
			/**
			* Element used to compute slide visibility for inert/aria-hidden.
			* Does NOT affect layout, snap, loop, or effect math — only the inert/aria-hidden bounds.
			* @type {'viewport'|'carousel'|string|HTMLElement}
			*   'viewport' (default) - use tarot-viewport (current behavior)
			*   'carousel'           - use the outer tarot-carousel element
			*   string               - CSS selector resolved via carousel.closest(selector)
			*   HTMLElement          - direct element reference
			* The element MUST be in a stable layout relationship with the viewport (i.e. an ancestor).
			*/
			visibilityBoundsElement: "viewport",
			/** @type {object} - Effect rules (not user-settable, overridden by effect class) */
			rules: {
				minSlidesPerView: 1,
				maxSlidesPerView: Infinity,
				loopBuffer: {
					left: 0,
					right: 1
				},
				minPaddingLeft: 0,
				minPaddingRight: 0
			}
		};
		/** @type {object} - User-provided options (pre-merge) */
		_.userOptions = {};
		/** @type {HTMLElement|null} - Element containing data-tarot-options JSON */
		_.userOptionsElement = _.ctx.carousel.querySelector(":scope > [data-tarot-options]");
		/** @type {{minWidth:number,options:object}} - Current active breakpoint */
		_.currentBreakpoint = {
			minWidth: 0,
			options: {}
		};
		/** @type {('window'|'viewport'|null)} - Which event source drives breakpoint re-evaluation (set at load) */
		_.breakpointSource = null;
		_.handlers = { 
		/** @type {Function} - Called on resize / orientation change */
onResize: () => _.checkBreakpoints() };
		_.init();
	}
	/**
	* Initializes the options manager
	* - loads user options from DOM
	* - computes initial breakpoint
	* - writes merged options to the data store
	*/
	init() {
		const _ = this;
		_.loadUserOptions();
		_.bindBreakpointSource();
		_.currentBreakpoint = _.getCurrentBreakpoint();
		_.applyMergedOptions();
	}
	/**
	* Binds the breakpoint re-evaluation trigger to the source implied by
	* `breakpointElement` (resolved once at load — it is not runtime-responsive):
	* - 'window'   → raw DOM window resize/orientationchange, so a window-width
	*                breakpoint crossing fires even when the viewport width is fixed
	*                or capped (the viewport-gated `window:resize` emitter would miss it).
	* - 'viewport' → the viewport-gated `window:resize` emitter event, which is
	*                exactly what viewport-measured breakpoints want.
	* The bound source is recorded on `_.breakpointSource` — it is both the teardown
	* key and the cached answer getCurrentBreakpoint() measures against, so the
	* measured element and its trigger can never disagree. checkBreakpoints() is
	* idempotent, so an extra trigger from a noisy source is a cheap no-op.
	*/
	bindBreakpointSource() {
		const _ = this;
		const mode = _.resolveBreakpointElement() === "viewport" ? "viewport" : "window";
		_.breakpointSource = mode;
		if (mode === "viewport") _.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.onResize);
		else {
			window.addEventListener("resize", _.handlers.onResize);
			window.addEventListener("orientationchange", _.handlers.onResize);
		}
	}
	/**
	* Removes whichever trigger source bindBreakpointSource() attached
	*/
	unbindBreakpointSource() {
		const _ = this;
		if (_.breakpointSource === "viewport") _.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.onResize);
		else if (_.breakpointSource === "window") {
			window.removeEventListener("resize", _.handlers.onResize);
			window.removeEventListener("orientationchange", _.handlers.onResize);
		}
		_.breakpointSource = null;
	}
	/**
	* Cleans up event listeners
	*/
	destroy() {
		const _ = this;
		_.unbindBreakpointSource();
		_.ctx = null;
		_.handlers = null;
		_.userOptionsElement = null;
		_.defaultOptions = null;
		_.userOptions = null;
		_.currentBreakpoint = null;
		_.breakpointSource = null;
	}
	/**
	* Updates user options (programmatic API), merges, and checks breakpoints
	* @param {object} newOptions - New user-supplied options
	* @returns {OptionsManager}
	*/
	setUserOptions(newOptions = {}) {
		const _ = this;
		_.userOptions = _.ctx.utils.deepMerge(_.userOptions, newOptions);
		_.unbindBreakpointSource();
		_.bindBreakpointSource();
		_.currentBreakpoint = _.getCurrentBreakpoint();
		_.applyMergedOptions();
		return _;
	}
	/**
	* Loads user-supplied options from a DOM element (if present)
	*/
	loadUserOptions() {
		const _ = this;
		if (!_.userOptionsElement) return;
		let txt = _.userOptionsElement.textContent || "";
		txt = txt.replace(/\n/g, "").trim();
		txt = txt.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:(?=(?:[^"\\]|\\.|"(?:[^"\\]|\\.)*")*$)/g, "$1\"$2\":");
		txt = txt.replace(/,\s*([}\]])(?=(?:[^"\\]|\\.|"(?:[^"\\]|\\.)*")*$)/g, "$1");
		try {
			_.userOptions = JSON.parse(txt);
		} catch (err) {
			console.error("tarot: bad data-tarot-options json", err);
		}
	}
	/**
	* Resolves the configured breakpointElement ('window' | 'viewport') from base
	* options (defaults + plugin defaults + user options). This is intentionally a
	* base-only, load-time value — per-breakpoint overrides cannot change which
	* element is measured or which event source triggers re-evaluation.
	* @returns {string}
	*/
	resolveBreakpointElement() {
		const _ = this;
		const pluginDefaults = _.ctx.getPluginDefaults();
		let baseOptions = _.ctx.utils.deepMerge(_.defaultOptions, pluginDefaults);
		baseOptions = _.ctx.utils.deepMerge(baseOptions, _.userOptions);
		return baseOptions.breakpointElement;
	}
	/**
	* Computes which breakpoint applies based on the current measured width
	* @returns {{ minWidth:number, options:object }}
	*/
	getCurrentBreakpoint() {
		const _ = this;
		const { breakpoints = {} } = _.userOptions;
		const currentWidth = _.breakpointSource === "viewport" && _.ctx.viewport ? _.ctx.viewport.offsetWidth : window.innerWidth;
		if (!breakpoints || typeof breakpoints !== "object") return {
			minWidth: 0,
			options: {}
		};
		const breakpointWidths = Object.keys(breakpoints).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
		let matchingBreakpointWidth = 0;
		for (let i = 0; i < breakpointWidths.length; i++) {
			const breakpointWidth = breakpointWidths[i];
			if (currentWidth >= breakpointWidth) matchingBreakpointWidth = breakpointWidth;
			else break;
		}
		return {
			minWidth: matchingBreakpointWidth,
			options: breakpoints[matchingBreakpointWidth] || {}
		};
	}
	/**
	* Checks if breakpoint has changed, applies merged options if so
	*/
	checkBreakpoints() {
		const _ = this;
		const active = _.getCurrentBreakpoint();
		if (active.minWidth === _.currentBreakpoint.minWidth) return;
		_.currentBreakpoint = active;
		_.applyMergedOptions();
	}
	/**
	* Merges default, user, and active breakpoint options and writes to data store
	*/
	applyMergedOptions() {
		const _ = this;
		const { breakpoints: _bp, rules: _ur, ...userBase } = _.userOptions;
		const { rules: _br, ...bpBase } = _.currentBreakpoint.options || {};
		const pluginDefaults = _.ctx.getPluginDefaults();
		let merged = _.ctx.utils.deepMerge(_.defaultOptions, pluginDefaults);
		merged = _.ctx.utils.deepMerge(merged, userBase);
		merged = _.ctx.utils.deepMerge(merged, bpBase);
		delete merged.breakpoints;
		const effectClass = _.ctx.getEffectClass(merged.effect);
		if (effectClass?.rules) merged.rules = {
			...merged.rules,
			...effectClass.rules
		};
		merged.slidesPerView = Number(merged.slidesPerView);
		if (!Number.isFinite(merged.slidesPerView) || merged.slidesPerView < 1) merged.slidesPerView = 1;
		const { minSlidesPerView, maxSlidesPerView } = merged.rules;
		merged.slidesPerView = Math.max(minSlidesPerView, Math.min(maxSlidesPerView, merged.slidesPerView));
		if (merged.slidesPerMove === "auto") merged.slidesPerMove = Math.floor(merged.slidesPerView);
		merged.slidesPerMove = Math.floor(Number(merged.slidesPerMove));
		if (!Number.isFinite(merged.slidesPerMove) || merged.slidesPerMove < 1) merged.slidesPerMove = 1;
		_.ctx.store.setOptions(merged);
	}
};
//#endregion
//#region src/scripts/slide-manager.js
/**
* @class SlideManager
* manages slides in a carousel including slide creation, selection, filtering, and dom updates
*/
var SlideManager = class {
	/**
	* @constructor
	* @param {Object} ctx - shared module context containing emitter, events, store, etc.
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.allSlides = null;
		_.observer = null;
		_.handlers = {
			selectedIndexChanged: ({ currentIndex }) => {
				_.updateSelectedIndex(currentIndex);
			},
			optionsChanged: ({ previousOptions, currentOptions }) => {
				if (previousOptions.filterClass !== currentOptions.filterClass) _.loadSlides();
			}
		};
		_.init();
	}
	init() {
		this.loadSlides();
		this.bindEvents();
		this.updateSelectedIndex(this.ctx.store.getState().selectedIndex);
	}
	reInit() {
		this.loadSlides();
		this.updateSelectedIndex(this.ctx.store.getState().selectedIndex);
	}
	queryDOM() {
		this.allSlides = Array.from(this.ctx.track.querySelectorAll(":scope > tarot-slide"));
	}
	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.observer = new MutationObserver(() => {
			_.reInit();
		});
		_.#startObserver();
	}
	/**
	* Orchestrates all slide management: wraps, queries, filters, indexes, updates state, stores
	*/
	loadSlides() {
		const _ = this;
		_.observer?.disconnect();
		_.wrapSlides();
		_.queryDOM();
		const activeSlides = _.filterSlides();
		_.resetSlideIndexes(activeSlides);
		_.updateSlideStates(activeSlides);
		const selectedIndex = _.ctx.store.getState().selectedIndex;
		const clampedIndex = activeSlides.length ? Math.min(selectedIndex, activeSlides.length - 1) : 0;
		_.ctx.store.batch(() => {
			_.ctx.store.setSlides(activeSlides);
			if (clampedIndex !== selectedIndex) _.ctx.store.setState({ selectedIndex: clampedIndex });
		});
		_.#startObserver();
	}
	/**
	* Filters slides based on filterClass option
	* @returns {Array} Active slides that pass the filter
	*/
	filterSlides() {
		const filterClass = this.ctx.store.getOptions().filterClass;
		if (!filterClass) return this.allSlides;
		return this.allSlides.filter((slide) => slide.classList.contains(filterClass));
	}
	/**
	* ensures all carousel children are properly wrapped in tarot-slide elements
	*/
	wrapSlides() {
		Array.from(this.ctx.track.children).forEach((child) => {
			if (child.tagName.toLowerCase() !== "tarot-slide") this.wrapSlide(child);
		});
	}
	/**
	* Wraps an element in tarot-slide if not already wrapped
	* Handles both in-DOM elements (replaces in place) and new elements
	* @param {Element} element - Element to wrap
	* @returns {Element} The tarot-slide element
	*/
	wrapSlide(element) {
		if (element.tagName.toLowerCase() === "tarot-slide") return element;
		const wrapper = document.createElement("tarot-slide");
		const parent = element.parentNode;
		if (parent) parent.replaceChild(wrapper, element);
		wrapper.appendChild(element);
		return wrapper;
	}
	#startObserver() {
		this.observer?.observe(this.ctx.track, {
			childList: true,
			subtree: false
		});
	}
	resetSlideIndexes(slides) {
		for (let i = 0, n = slides.length; i < n; ++i) {
			slides[i]._renderIndex = i;
			slides[i]._index = i;
			slides[i].setAttribute("index", i);
		}
	}
	/**
	* Prepares slides for frame rendering by calculating positions and properties
	* Includes sophisticated loop positioning to prevent frame gaps during track shifts
	* Updates the slides in the datastore with fresh positioning data
	*/
	prepSlidesForFrame() {
		const _ = this;
		const slides = _.ctx.store.getSlides();
		const widths = _.ctx.store.getWidths();
		const animation = _.ctx.store.getAnimation();
		const options = _.ctx.store.getOptions();
		_.updateSlidePositions(animation.trackPosition, slides, widths, options);
		const roundSubPixel = _.ctx.utils.roundSubPixel;
		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i];
			slide._trackPosition = roundSubPixel(slide._renderIndex * widths.slideAndGap);
			slide._centerPoint = roundSubPixel(slide._trackPosition + widths.slide / 2);
		}
	}
	/**
	* Update slide positions based on track position using loop-aware windowing
	*
	* Every slide shares one width, so the logical positions overlapping the viewport
	* are always a contiguous run of integers, and each following step only grows or
	* shrinks that run from its ends: effect buffers widen it, the symmetric fill pads
	* it, and the closest-to-center trim eats it from the far end. What the frame needs
	* is therefore a single window of exactly slideCount positions, walked out to the
	* slides with one modulo counter.
	*
	* @param {number} trackPosition - current track position
	* @param {Array} slides - slide elements from the store
	* @param {Object} widths - measured layout widths
	* @param {Object} options - current options (effect buffers live on options.rules)
	*/
	updateSlidePositions(trackPosition, slides, widths, options) {
		const slideCount = slides.length;
		if (!this.ctx.store.getState().canLoop) {
			for (let i = 0; i < slideCount; i++) slides[i]._renderIndex = i;
			return;
		}
		const loopBuffer = options.rules.loopBuffer;
		const bufferLeft = Math.max(0, Math.floor(loopBuffer.left) || 0);
		const bufferRight = Math.max(0, Math.floor(loopBuffer.right) || 0);
		const slideWidth = widths.slide;
		const step = slideWidth + widths.gap;
		if (!step) return;
		const viewportStart = -trackPosition;
		const viewportEnd = viewportStart + widths.viewport;
		let start = Infinity;
		let end = -Infinity;
		const scanFrom = Math.floor(viewportStart / step) - 2;
		const scanTo = Math.ceil(viewportEnd / step) + 2;
		for (let i = scanFrom; i <= scanTo; i++) {
			const slideStart = i * step;
			if (slideStart + slideWidth > viewportStart && slideStart < viewportEnd) {
				if (i < start) start = i;
				end = i;
			}
		}
		if (end < start) return;
		const visibleStart = start;
		const visibleEnd = end;
		start -= bufferLeft;
		end += bufferRight;
		const overflow = end - start + 1 - slideCount;
		if (overflow < 0) {
			const missing = -overflow;
			const padLeft = Math.floor(missing / 2);
			start -= padLeft;
			end += missing - padLeft;
		} else if (overflow > 0) {
			const viewportCenter = viewportStart + widths.viewport / 2;
			const visibleCount = visibleEnd - visibleStart + 1;
			const distance = (position) => Math.abs(position * step + slideWidth / 2 - viewportCenter);
			const claimOrder = (position) => {
				if (position < visibleStart) return visibleCount + (visibleStart - position - 1);
				if (position > visibleEnd) return visibleCount + bufferLeft + (position - visibleEnd - 1);
				return position - visibleStart;
			};
			for (let i = 0; i < overflow; i++) {
				const startDistance = distance(start);
				const endDistance = distance(end);
				if (startDistance > endDistance || startDistance === endDistance && claimOrder(start) > claimOrder(end)) start++;
				else end--;
			}
		}
		let slideIndex = (start % slideCount + slideCount) % slideCount;
		for (let position = start; position <= end; position++) {
			slides[slideIndex]._renderIndex = position;
			slideIndex = slideIndex + 1 === slideCount ? 0 : slideIndex + 1;
		}
	}
	/**
	* Updates DOM state attributes on slides
	* @param {Array} activeSlides - Slides that should be active
	*/
	updateSlideStates(activeSlides) {
		const activeSet = new Set(activeSlides);
		this.allSlides.forEach((slide) => {
			if (activeSet.has(slide)) slide.setAttribute("state", "active");
			else slide.setAttribute("state", "disabled");
		});
	}
	addSlide(element, index) {
		const _ = this;
		let el = element;
		if (typeof element === "string") {
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = element.trim();
			el = tempDiv.firstElementChild;
			if (!el) {
				console.warn("tarot: addSlide got invalid html", element);
				return;
			}
		}
		const newSlide = _.wrapSlide(el);
		const currentSlides = _.ctx.store.getSlides();
		if (typeof index === "number" && index >= 0 && index < currentSlides.length) _.ctx.track.insertBefore(newSlide, currentSlides[index]);
		else _.ctx.track.appendChild(newSlide);
	}
	removeSlide(index) {
		const activeSlides = this.ctx.store.getSlides();
		if (index < 0 || index >= activeSlides.length) return;
		activeSlides[index].remove();
	}
	/**
	* Updates _selected property on slide objects (not DOM)
	* @param {number} newIndex - The newly selected index
	*/
	updateSelectedIndex(newIndex) {
		const slides = this.ctx.store.getSlides();
		for (let i = 0, n = slides.length; i < n; ++i) slides[i]._selected = slides[i]._index === newIndex;
	}
	destroy() {
		const _ = this;
		_.ctx.emitter.off(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		if (_.observer) {
			_.observer.disconnect();
			_.observer = null;
		}
		_.allSlides = null;
	}
};
//#endregion
//#region src/scripts/lib/physics-engine.js
/**
* One frame at the 60fps baseline, in ms. Time is measured in frames
* throughout so that attraction, friction, and the velocity animateTo()
* accepts all keep the per-frame units they have always had (and match
* MomentumEngine / SettleEngine).
*/
var FRAME_MS = 16.67;
/**
* Fresh animations anchor their clock half a frame in the past, so the very
* first ticked frame already paints movement instead of re-reporting the
* start position. This also offsets half of the frame engine's render-then-
* tick latency (each frame renders the previous tick's position).
*/
var HEAD_START_MS = 8.33;
/** below this, |damping ratio - 1| is treated as critically damped */
var CRITICAL_EPSILON = 1e-9;
/**
* Damped-spring engine solved in closed form.
*
* The engine used to integrate the spring one frame at a time, which made the
* trajectory depend on how the frames happened to land: a 144Hz display and a
* 30Hz display took measurably different paths, and a dropped frame stretched
* the animation. A damped harmonic oscillator has an exact solution, so we
* solve it once per animateTo() and evaluate at absolute elapsed time.
* Frame rate, frame-time jitter, and stalls then only decide when we *sample*
* the motion, never what the motion is. (Same approach as
* @magic-spells/physics-engine v2 — this fork keeps tarot's tick-driven
* shape, shiftPosition, velocityBoost, and event contract.)
*/
var PhysicsEngine = class {
	#attraction;
	#friction;
	#velocityBoost;
	#velocity;
	#currentValue;
	#targetValue;
	#startValue;
	#isAnimating;
	#startTime;
	#freshStart;
	#coefficients;
	#animationId;
	#eventEmitter;
	/**
	* creates an instance of physicsengine.
	* @param {number} [attraction=0.026] - the attraction value for physics-based animation (0 < attraction < 1).
	* @param {number} [friction=0.28] - the friction value for physics-based animation (0 < friction < 1).
	* @param {number} [velocityBoost=1.4] - multiplier applied to initial velocity for snappier response.
	*/
	constructor({ attraction = .026, friction = .28, velocityBoost = 1.4 } = {}) {
		const _ = this;
		_.#validateAttraction(attraction);
		_.#validateFriction(friction);
		_.#attraction = attraction;
		_.#friction = friction;
		_.#velocityBoost = velocityBoost;
		_.#velocity = 0;
		_.#currentValue = 0;
		_.#targetValue = 0;
		_.#startValue = 0;
		_.#isAnimating = false;
		_.#startTime = null;
		_.#freshStart = false;
		_.#coefficients = null;
		_.#animationId = 0;
		_.#eventEmitter = new EventEmitter();
	}
	/**
	* animates from a start value to an end value.
	* @param {number} startValue - the starting value.
	* @param {number} endValue - the target value.
	* @param {number} initialVelocity - the initial velocity, in units per 16.67ms frame.
	*/
	animateTo(startValue, endValue, initialVelocity) {
		const _ = this;
		if (_.#isAnimating) _.stop();
		if (isNaN(endValue)) {
			console.warn("tarot: animateTo got NaN");
			return;
		}
		initialVelocity *= _.#velocityBoost;
		_.#startValue = startValue;
		_.#currentValue = startValue;
		_.#targetValue = endValue;
		_.#velocity = initialVelocity;
		_.#coefficients = _.#deriveCoefficients(startValue - endValue, initialVelocity);
		_.#startTime = null;
		_.#freshStart = true;
		_.#animationId++;
		_.#isAnimating = true;
		_.#eventEmitter.emit("engine:position-changed", {
			position: _.#currentValue,
			positionDelta: 0,
			progress: 0,
			velocity: _.#velocity
		});
	}
	/**
	* Advances the animation to the given timestamp.
	* Called externally by the frame engine to sync with the main render loop.
	* @param {number} time - the timestamp from the frame engine
	*/
	tick(time) {
		const _ = this;
		if (!_.#isAnimating) return;
		if (_.#startTime === null) {
			_.#startTime = time - (_.#freshStart ? HEAD_START_MS : 0);
			_.#freshStart = false;
		}
		const frames = (time - _.#startTime) / FRAME_MS;
		const { displacement, velocity } = _.#solve(frames);
		if (Math.abs(displacement) < .1 && Math.abs(velocity) < .01) {
			_.#isAnimating = false;
			_.#currentValue = _.#targetValue;
			_.#velocity = 0;
			const animationId = _.#animationId;
			_.#eventEmitter.emit("engine:position-changed", {
				position: _.#currentValue,
				positionDelta: 0,
				progress: 1,
				velocity: 0
			});
			if (animationId !== _.#animationId || _.#isAnimating) return;
			_.#eventEmitter.emit("engine:finished");
			return;
		}
		const newPosition = _.#targetValue + displacement;
		const positionDelta = newPosition - _.#currentValue;
		_.#currentValue = newPosition;
		_.#velocity = velocity;
		const totalDistance = _.#targetValue - _.#startValue;
		const progress = totalDistance !== 0 ? (_.#currentValue - _.#startValue) / totalDistance : 0;
		_.#eventEmitter.emit("engine:position-changed", {
			position: _.#currentValue,
			positionDelta,
			progress,
			velocity: _.#velocity
		});
	}
	/**
	* Solves the spring for the current parameters and initial conditions.
	*
	* Reading the old per-frame recurrence as an ODE in frame-time gives the
	* mapping: `v += attraction * (target - x)` is the spring constant, and
	* `v *= 1 - friction` is exponential decay at rate `-ln(1 - friction)`
	* per frame.
	*
	* @param {number} displacement - current position minus target.
	* @param {number} velocity - current velocity, in units per frame.
	* @returns {Object} coefficients consumed by #solve.
	*/
	#deriveCoefficients(displacement, velocity) {
		const naturalFrequency = Math.sqrt(this.#attraction);
		const dampingRatio = -Math.log(1 - this.#friction) / (2 * naturalFrequency);
		if (Math.abs(dampingRatio - 1) < CRITICAL_EPSILON) return {
			regime: "critical",
			naturalFrequency,
			a: displacement,
			b: velocity + naturalFrequency * displacement
		};
		if (dampingRatio < 1) {
			const dampedFrequency = naturalFrequency * Math.sqrt(1 - dampingRatio * dampingRatio);
			return {
				regime: "under",
				naturalFrequency,
				dampingRatio,
				dampedFrequency,
				a: displacement,
				b: (velocity + dampingRatio * naturalFrequency * displacement) / dampedFrequency
			};
		}
		const spread = naturalFrequency * Math.sqrt(dampingRatio * dampingRatio - 1);
		const root1 = -dampingRatio * naturalFrequency + spread;
		const root2 = -dampingRatio * naturalFrequency - spread;
		const a = (velocity - root2 * displacement) / (root1 - root2);
		return {
			regime: "over",
			root1,
			root2,
			a,
			b: displacement - a
		};
	}
	/**
	* Evaluates displacement and velocity at a time offset.
	* @param {number} frames - elapsed time, in 16.67ms frames.
	* @returns {{displacement: number, velocity: number}}
	*/
	#solve(frames) {
		const c = this.#coefficients;
		if (c.regime === "critical") {
			const decay = Math.exp(-c.naturalFrequency * frames);
			const linear = c.a + c.b * frames;
			return {
				displacement: decay * linear,
				velocity: decay * (c.b - c.naturalFrequency * linear)
			};
		}
		if (c.regime === "under") {
			const { naturalFrequency: wn, dampingRatio: z, dampedFrequency: wd, a, b } = c;
			const decay = Math.exp(-z * wn * frames);
			const cos = Math.cos(wd * frames);
			const sin = Math.sin(wd * frames);
			return {
				displacement: decay * (a * cos + b * sin),
				velocity: decay * ((b * wd - z * wn * a) * cos - (a * wd + z * wn * b) * sin)
			};
		}
		const first = c.a * Math.exp(c.root1 * frames);
		const second = c.b * Math.exp(c.root2 * frames);
		return {
			displacement: first + second,
			velocity: c.root1 * first + c.root2 * second
		};
	}
	/**
	* Re-solves from the current position and velocity, restarting the clock.
	* Used when the spring parameters change mid-flight — the coefficients are
	* baked at solve time, so a changed spring has to become a new
	* initial-value problem rather than being picked up on the next frame.
	*/
	#reseed() {
		const _ = this;
		_.#coefficients = _.#deriveCoefficients(_.#currentValue - _.#targetValue, _.#velocity);
		_.#startTime = null;
		_.#freshStart = false;
	}
	/**
	* stops the ongoing animation immediately.
	*/
	stop() {
		this.#isAnimating = false;
		this.#animationId++;
	}
	/**
	* shifts all position values by a delta (used for infinite loop track shifts).
	* keeps current, target, and start in the same coordinate space as the
	* shifted track. No reseed needed: displacement (current − target),
	* positionDelta, and progress are all invariant under a uniform shift, so
	* the baked coefficients stay valid.
	* @param {number} delta - the amount to shift by.
	*/
	shiftPosition(delta) {
		this.#currentValue += delta;
		this.#targetValue += delta;
		this.#startValue += delta;
	}
	/**
	* returns whether we are currently animating.
	* @returns {boolean}
	*/
	isAnimating() {
		return this.#isAnimating;
	}
	/**
	* sets the attraction value
	* @param {number} attraction - must be a number between 0 and 1 (exclusive).
	*/
	setAttraction(attraction) {
		this.#validateAttraction(attraction);
		this.#attraction = attraction;
		if (this.#isAnimating) this.#reseed();
	}
	/**
	* sets the friction value
	* @param {number} friction - must be a number between 0 and 1 (exclusive).
	*/
	setFriction(friction) {
		this.#validateFriction(friction);
		this.#friction = friction;
		if (this.#isAnimating) this.#reseed();
	}
	/**
	* sets the velocity boost multiplier.
	* @param {number} velocityBoost - multiplier for initial velocity.
	*/
	setVelocityBoost(velocityBoost) {
		this.#velocityBoost = velocityBoost;
	}
	/**
	* adds an event listener for the specified event.
	* @param {string} eventName - the name of the event.
	* @param {function} eventFunction - the function to call when the event is triggered.
	*/
	on(eventName, eventFunction) {
		this.#eventEmitter.on(eventName, eventFunction);
	}
	/**
	* remove an event listener for the specified event.
	* @param {string} eventName - the name of the event.
	* @param {function} eventFunction - the function to remove
	*/
	off(eventName, eventFunction) {
		this.#eventEmitter.off(eventName, eventFunction);
	}
	#validateAttraction(attraction) {
		if (!Number.isFinite(attraction) || attraction <= 0 || attraction >= 1) throw new Error("Attraction must be a number between 0 and 1 (exclusive).");
	}
	#validateFriction(friction) {
		if (!Number.isFinite(friction) || friction <= 0 || friction >= 1) throw new Error("Friction must be a number between 0 and 1 (exclusive).");
	}
};
//#endregion
//#region src/scripts/lib/momentum-engine.js
/**
* MomentumEngine - Pure friction-based physics for free scroll
*
* Unlike PhysicsEngine (damped spring with target), this just applies
* friction decay with no attraction. Used for free scroll modes.
*
* TrackAnimator reads position/velocity directly to check for gear shifts.
* No events needed - keeping it simple.
*/
var MomentumEngine = class {
	#position = 0;
	#velocity = 0;
	#friction;
	#prevTime = null;
	#isRunning = false;
	/**
	* @param {Object} options
	* @param {number} [options.friction=0.98] - Friction coefficient (0-1). Higher = more slippery.
	* @throws {RangeError} If friction is not between 0 and 1 (exclusive)
	*/
	constructor({ friction = .98 } = {}) {
		if (friction <= 0 || friction >= 1) throw new RangeError("Friction must be between 0 and 1 (exclusive)");
		this.#friction = friction;
	}
	/**
	* Start momentum animation from position with initial velocity
	* @param {number} position - Starting position
	* @param {number} velocity - Initial velocity
	*/
	start(position, velocity) {
		const _ = this;
		_.#position = position;
		_.#velocity = velocity;
		_.#prevTime = null;
		_.#isRunning = true;
	}
	/**
	* Advance physics by one frame
	* Called by TrackAnimator when momentum gear is engaged
	* @param {number} time - Timestamp from frame engine
	*/
	tick(time) {
		if (!this.#isRunning) return;
		let timeDelta = this.#prevTime == null ? 16.67 : time - this.#prevTime;
		this.#prevTime = time;
		timeDelta = Math.max(0, Math.min(timeDelta, 100));
		const timeFactor = timeDelta / 16.67;
		this.#velocity *= Math.pow(this.#friction, timeFactor);
		this.#position += this.#velocity * timeFactor;
	}
	/**
	* Update position directly (used when track shifts for looping)
	* @param {number} delta - Amount to add to position
	*/
	shiftPosition(delta) {
		this.#position += delta;
	}
	/**
	* Stop immediately (used when shifting to physics gear or stopping)
	*/
	stop() {
		this.#velocity = 0;
		this.#isRunning = false;
	}
	/**
	* Set friction coefficient
	* Invalid values are rejected (kept at current friction) rather than thrown —
	* an options change at runtime must never NaN-poison a live physics loop.
	* @param {number} friction - Value between 0 and 1 (exclusive)
	*/
	setFriction(friction) {
		if (typeof friction !== "number" || friction <= 0 || friction >= 1) return;
		this.#friction = friction;
	}
	get position() {
		return this.#position;
	}
	get velocity() {
		return this.#velocity;
	}
	get isRunning() {
		return this.#isRunning;
	}
};
//#endregion
//#region src/scripts/lib/settle-engine.js
/**
* SettleEngine - Adaptive friction for iOS-like snap-to-settling
*
* Uses adaptive friction to curve smoothly into snap position.
* Primarily decelerating with tiny attraction near target for clean landing.
*
* Algorithm: Each frame, calculate exact friction needed to land on target.
* Add small attraction force when close to ensure we reach the snap point.
*/
var SettleEngine = class {
	#position = 0;
	#velocity = 0;
	#targetPosition = 0;
	#startPosition = 0;
	#effectiveFriction = .92;
	#attraction = .002;
	#prevTime = null;
	#isRunning = false;
	#eventEmitter;
	constructor() {
		this.#eventEmitter = new EventEmitter();
	}
	/**
	* Start settling animation toward target position
	* @param {number} position - Current position
	* @param {number} velocity - Current velocity (from momentum engine)
	* @param {number} targetPosition - Target snap position
	*/
	start(position, velocity, targetPosition) {
		const _ = this;
		_.#position = position;
		_.#startPosition = position;
		_.#targetPosition = targetPosition;
		_.#prevTime = null;
		_.#isRunning = true;
		const direction = Math.sign(targetPosition - position);
		const minVelocity = 3;
		if (Math.abs(velocity) < minVelocity || Math.sign(velocity) !== direction) velocity = direction * minVelocity;
		_.#velocity = velocity;
		_.#eventEmitter.emit("engine:position-changed", {
			position: _.#position,
			positionDelta: 0,
			progress: 0,
			velocity: _.#velocity
		});
	}
	#finish() {
		const _ = this;
		_.#position = _.#targetPosition;
		_.#velocity = 0;
		_.#isRunning = false;
		_.#eventEmitter.emit("engine:position-changed", {
			position: _.#position,
			positionDelta: 0,
			progress: 1,
			velocity: 0
		});
		_.#eventEmitter.emit("engine:finished");
	}
	/**
	* Advance physics by one frame
	* @param {number} time - Timestamp from frame engine
	*/
	tick(time) {
		const _ = this;
		if (!_.#isRunning) return;
		let timeDelta = _.#prevTime == null ? 16.67 : time - _.#prevTime;
		_.#prevTime = time;
		timeDelta = Math.max(0, Math.min(timeDelta, 100));
		const timeFactor = timeDelta / 16.67;
		const remainingDistance = _.#targetPosition - _.#position;
		const absVelocity = Math.abs(_.#velocity);
		const absRemaining = Math.abs(remainingDistance);
		if (absRemaining < .2) return _.#finish();
		_.#effectiveFriction = absRemaining / (absVelocity + absRemaining);
		_.#velocity *= Math.pow(_.#effectiveFriction, timeFactor);
		if (absRemaining < 340) {
			const attractionForce = remainingDistance * _.#attraction * timeFactor;
			_.#velocity += attractionForce;
		}
		const velocitySign = Math.sign(_.#velocity);
		const targetSign = Math.sign(remainingDistance);
		if (velocitySign !== 0 && targetSign !== 0 && velocitySign !== targetSign) _.#velocity *= .5;
		const posDelta = _.#velocity * timeFactor;
		_.#position += posDelta;
		const newRemaining = _.#targetPosition - _.#position;
		if (Math.sign(newRemaining) !== Math.sign(remainingDistance) && absRemaining > 1) return _.#finish();
		const totalDistance = Math.abs(_.#targetPosition - _.#startPosition);
		const progress = totalDistance > 0 ? Math.min(.999, Math.abs(_.#position - _.#startPosition) / totalDistance) : 0;
		_.#eventEmitter.emit("engine:position-changed", {
			position: _.#position,
			positionDelta: posDelta,
			progress,
			velocity: _.#velocity
		});
	}
	/**
	* Update position directly (used when track shifts for looping)
	* @param {number} delta - Amount to add to position
	*/
	shiftPosition(delta) {
		this.#position += delta;
		this.#startPosition += delta;
		this.#targetPosition += delta;
	}
	/**
	* Stop immediately
	*/
	stop() {
		this.#velocity = 0;
		this.#isRunning = false;
	}
	get position() {
		return this.#position;
	}
	get velocity() {
		return this.#velocity;
	}
	get isRunning() {
		return this.#isRunning;
	}
	/**
	* Add event listener
	* @param {string} eventName - Event name
	* @param {function} eventFunction - Handler function
	*/
	on(eventName, eventFunction) {
		this.#eventEmitter.on(eventName, eventFunction);
	}
	/**
	* Remove event listener
	* @param {string} eventName - Event name
	* @param {function} eventFunction - Handler function
	*/
	off(eventName, eventFunction) {
		this.#eventEmitter.off(eventName, eventFunction);
	}
	destroy() {
		this.stop();
		this.#eventEmitter.destroy();
		this.#eventEmitter = null;
	}
};
//#endregion
//#region src/scripts/track-animator.js
var SNAP_THRESHOLD = 14;
var STOP_THRESHOLD = .01;
var EDGE_ATTRACTION = .05;
var EDGE_FRICTION = .27;
var EDGE_OVERSHOOT_PER_VELOCITY = 2.05;
var EDGE_MAX_OVERSHOOT_RATIO = .25;
var TrackAnimator = class {
	#currentPos = 0;
	#dragStartPos = 0;
	#targetPos = 0;
	#movementType = "";
	#direction = 0;
	#driveMovementType = "scroll";
	/** @type {'idle'|'spring'|'momentum'|'settle'|'drive'|'edge'} */
	#gear = "idle";
	#momentumEngine = null;
	#settleEngine = null;
	#edgeEngine = null;
	/**
	* @param {Object} ctx - The context object containing carousel references and services
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		const emitter = ctx.emitter;
		const options = _.ctx.store.getOptions();
		_.engine = new PhysicsEngine({
			attraction: options.animation.attraction,
			friction: options.animation.friction,
			velocityBoost: options.animation.velocityBoost
		});
		_.#momentumEngine = new MomentumEngine({ friction: options.animation.freeScrollFriction });
		_.#settleEngine = new SettleEngine();
		_.#edgeEngine = new PhysicsEngine({
			attraction: EDGE_ATTRACTION,
			friction: EDGE_FRICTION,
			velocityBoost: 1
		});
		_.handlers = {
			optionsChanged: ({ currentOptions }) => {
				_.engine.setAttraction(currentOptions.animation.attraction);
				_.engine.setFriction(currentOptions.animation.friction);
				_.engine.setVelocityBoost(currentOptions.animation.velocityBoost);
				_.#momentumEngine.setFriction(currentOptions.animation.freeScrollFriction);
			},
			dragStart: ({ event }) => {
				_.stop();
				_.#dragStartPos = _.#mapAcrossEdges(_.#currentPos, inverseRubberband);
				emitter.emit(_.ctx.events.user.interacted, {
					via: "drag",
					event
				});
			},
			dragMove: ({ event, drag }) => {
				_.setPos(_.#mapAcrossEdges(_.#dragStartPos + drag.delta, rubberband), 1, null, "drag", 0);
				emitter.emit(_.ctx.events.user.interacted, {
					via: "drag",
					event
				});
			},
			dragEnd: ({ event, drag }) => {
				emitter.emit(_.ctx.events.user.interacted, {
					via: "drag",
					event
				});
				const options = _.ctx.store.getOptions();
				if (Math.abs(drag.delta) < options.dragThreshold) {
					_.ctx.commands.settleTrack();
					return;
				}
				if (options.snap === "page") {
					if (drag.delta < 0) _.ctx.commands.next(drag.velocity);
					else _.ctx.commands.previous(drag.velocity);
				} else _.startMomentum(_.#currentPos, drag.velocity * 1.3);
			},
			enginePositionChanged: ({ positionDelta, progress, velocity }) => {
				if (progress === 1) _.setPos(_.#targetPos, progress, velocity, _.#movementType, _.#direction);
				else _.setPos(_.#currentPos + positionDelta, progress, velocity, _.#movementType, _.#direction);
			},
			engineMovementFinished: () => {
				_.#gear = "idle";
				_.#emitMovementCompleted(_.#movementType);
			}
		};
		_.init();
	}
	/**
	* Advance whichever gear is engaged by one frame.
	* Called by FrameEngine (via its injected tickAnimation pipeline hook) while animating.
	* @param {number} time - rAF timestamp from the frame engine
	*/
	tick(time) {
		const _ = this;
		switch (_.#gear) {
			case "momentum":
				_.#momentumEngine.tick(time);
				_.setPos(_.#momentumEngine.position, 0, _.#momentumEngine.velocity, "momentum", 0);
				_.#checkMomentumTransition();
				break;
			case "settle":
				_.#settleEngine.tick(time);
				break;
			case "edge":
				_.#edgeEngine.tick(time);
				break;
			case "drive": break;
			default: _.engine.tick(time);
		}
	}
	init() {
		this.bindEvents();
	}
	bindEvents() {
		const _ = this;
		const { emitter, events } = _.ctx;
		emitter.on(events.store.optionsChanged, _.handlers.optionsChanged);
		emitter.on(events.drag.start, _.handlers.dragStart);
		emitter.on(events.drag.move, _.handlers.dragMove);
		emitter.on(events.drag.end, _.handlers.dragEnd);
		_.engine.on("engine:position-changed", _.handlers.enginePositionChanged);
		_.engine.on("engine:finished", _.handlers.engineMovementFinished);
		_.#settleEngine.on("engine:position-changed", _.handlers.enginePositionChanged);
		_.#settleEngine.on("engine:finished", _.handlers.engineMovementFinished);
		_.#edgeEngine.on("engine:position-changed", _.handlers.enginePositionChanged);
		_.#edgeEngine.on("engine:finished", _.handlers.engineMovementFinished);
	}
	get currentPos() {
		return this.#currentPos;
	}
	/**
	* Sync renderIndex and pageIndex from a track position
	* Used by driveTrackPosition and momentum to keep indices current
	* @param {number} position - Current track position (post-shift)
	* @param {number} [velocity=0] - Current velocity for direction bias
	*/
	syncIndicesFromPosition(position, velocity = 0) {
		const _ = this;
		const state = _.ctx.store.getState();
		const widths = _.ctx.store.getWidths();
		const options = _.ctx.store.getOptions();
		const currentIndex = getIndexForTrackPos(position, widths, options, velocity, state.slideCount);
		const slidesPerMove = options.slidesPerMove || 1;
		const currentPageIndex = Math.max(0, Math.min(Math.floor(currentIndex / slidesPerMove), state.pageCount - 1));
		if (currentIndex !== state.renderIndex || currentPageIndex !== state.pageIndex) _.ctx.store.setState({
			renderIndex: currentIndex,
			pageIndex: currentPageIndex
		});
	}
	getIsAnimating() {
		return this.engine.isAnimating() || this.#momentumEngine.isRunning || this.#settleEngine.isRunning || this.#edgeEngine.isAnimating();
	}
	stop() {
		const _ = this;
		_.engine.stop();
		_.#momentumEngine.stop();
		_.#settleEngine.stop();
		_.#edgeEngine.stop();
		_.#gear = "idle";
		_.ctx.store.setAnimation({ isAnimating: false });
	}
	goToPosition(targetPos, velocity, movementType, direction = 0) {
		const _ = this;
		if (movementType !== "jump" && _.engine.isAnimating() && _.#targetPos === targetPos) return;
		_.stop();
		_.#movementType = movementType;
		_.#direction = direction;
		if (movementType === "jump") {
			_.#emitMovementStarted(0, "jump");
			_.setPos(targetPos, 1, 0, "jump", direction);
			_.#emitMovementCompleted("jump");
			return;
		}
		_.#targetPos = targetPos;
		_.#gear = "spring";
		_.engine.animateTo(_.#currentPos, targetPos, velocity);
		_.#emitMovementStarted(velocity, movementType);
	}
	setPos(newPosition, progress, velocity = 0, movementType, direction = null) {
		const _ = this;
		let trackDelta = newPosition - _.#currentPos;
		if (movementType !== "drag" && movementType !== "scroll" && progress === 1) trackDelta = 0;
		_.#currentPos = newPosition;
		const state = _.ctx.store.getState();
		if (state.canLoop) {
			const trackWidth = _.ctx.store.getWidths().track;
			const firstSnap = Number.isFinite(state.firstSnapPoint) ? state.firstSnapPoint : 0;
			if (_.#currentPos > firstSnap) _.shiftTrack("forwards");
			else if (_.#currentPos <= firstSnap - trackWidth) _.shiftTrack("backwards");
		}
		_.ctx.store.setAnimation({
			movementType,
			trackPosition: _.#currentPos,
			trackDelta,
			velocity,
			progress,
			isAnimating: _.getIsAnimating(),
			direction: direction !== null ? direction : _.#direction
		});
	}
	shiftTrack(direction) {
		const _ = this;
		const trackWidth = _.ctx.store.getWidths().track;
		const shiftAmount = direction === "forwards" ? -trackWidth : trackWidth;
		_.#currentPos += shiftAmount;
		_.#dragStartPos += shiftAmount;
		_.#targetPos += shiftAmount;
		if (_.#gear === "momentum" && _.#momentumEngine.isRunning) _.#momentumEngine.shiftPosition(shiftAmount);
		else if (_.#gear === "settle" && _.#settleEngine.isRunning) _.#settleEngine.shiftPosition(shiftAmount);
		else if (_.#gear === "edge" && _.#edgeEngine.isAnimating()) _.#edgeEngine.shiftPosition(shiftAmount);
		else if (_.engine.isAnimating()) _.engine.shiftPosition(shiftAmount);
		_.ctx.emitter.emit(_.ctx.events.track.shifted, {
			trackPosition: _.#currentPos,
			movementType: "shift"
		});
	}
	/**
	* Engage momentum gear - for free scroll drag end
	* @param {number} position - Current track position
	* @param {number} velocity - Initial velocity from drag
	*/
	startMomentum(position, velocity) {
		const _ = this;
		_.stop();
		_.#momentumEngine.start(position, velocity);
		_.#gear = "momentum";
		_.#movementType = "momentum";
		_.setPos(position, 0, velocity, "momentum", 0);
		_.#emitMovementStarted(velocity, "momentum");
	}
	/**
	* Drive track position — self-contained, no session management.
	* Plugins describe intent (deltaPx or positionPercent), core handles positioning.
	* Auto-engages on first call, auto-disengages when stop() is called or movementType is 'settle'.
	* @param {Object} params
	* @param {number} [params.deltaPx] - Relative pixel movement ("move by N px this frame")
	* @param {number} [params.positionPercent] - Absolute 0-1 track position
	* @param {number} [params.velocity=0] - Current velocity for direction bias
	* @param {string} [params.movementType='scroll'] - Movement type ('scroll' or 'settle')
	*/
	drivePosition({ deltaPx, positionPercent, velocity = 0, movementType = "scroll" }) {
		const _ = this;
		if (movementType === "settle") {
			_.#gear = "idle";
			_.ctx.commands.settleTrack();
			return;
		}
		let position;
		if (deltaPx !== void 0) position = _.#currentPos + deltaPx;
		else if (positionPercent !== void 0) position = _.#resolvePercentToPosition(positionPercent);
		else return;
		if (_.#gear !== "drive") {
			_.stop();
			_.#gear = "drive";
			_.#driveMovementType = movementType;
		}
		const direction = velocity !== 0 ? Math.sign(velocity) : Math.sign(position - _.#currentPos);
		_.setPos(position, 1, velocity, _.#driveMovementType, direction);
		_.syncIndicesFromPosition(_.#currentPos, velocity);
	}
	/**
	* Resolve a 0-1 percent to an absolute track position (loop-aware)
	* @param {number} percent - 0-1 position (can overflow for loop seam transitions)
	* @returns {number} Track position in pixels
	*/
	#resolvePercentToPosition(percent) {
		return percentToTrackPos(percent, getTrackGeometry(this.ctx.store.getState(), this.ctx.store.getWidths()));
	}
	/**
	* Check if momentum engine should transition to physics (snap) or stop
	* Called each frame when momentum gear is engaged
	*/
	#checkMomentumTransition() {
		const _ = this;
		const velocity = _.#momentumEngine.velocity;
		let position = _.#momentumEngine.position;
		const options = _.ctx.store.getOptions();
		const widths = _.ctx.store.getWidths();
		const state = _.ctx.store.getState();
		const slideCount = state.slideCount;
		if (!state.canLoop) {
			const startEdgePos = getTrackPosForIndex(0, widths, options, state);
			const endEdgePos = getTrackPosForIndex(slideCount - 1, widths, options, state);
			const friction = Math.min(options.animation?.freeScrollFriction || .96, .999);
			const naturalStop = position + velocity * (friction / (1 - friction));
			if (position > startEdgePos) {
				if (velocity < 0 && naturalStop < startEdgePos) {
					_.syncIndicesFromPosition(position, velocity);
					return;
				}
				_.#startEdgeSpring(startEdgePos, velocity);
				return;
			} else if (position < endEdgePos) {
				if (velocity > 0 && naturalStop > endEdgePos) {
					_.syncIndicesFromPosition(position, velocity);
					return;
				}
				_.#startEdgeSpring(endEdgePos, velocity);
				return;
			}
		}
		if (options.snap === "slide" && Math.abs(velocity) < SNAP_THRESHOLD) {
			_.#momentumEngine.stop();
			const target = projectMomentumTarget(position, velocity, widths, options, state);
			if (!target) {
				_.syncIndicesFromPosition(position, 0);
				_.#gear = "idle";
				_.setPos(position, 1, 0, "momentum", 0);
				_.#emitMovementCompleted("momentum");
				return;
			}
			const distanceToTarget = Math.abs(target.position - position);
			_.ctx.store.setState({
				renderIndex: target.index,
				pageIndex: target.pageIndex
			});
			_.#emitMovementCompleted("momentum");
			_.#emitMovementStarted(velocity, "settle");
			if (distanceToTarget < 5) {
				_.setPos(target.position, 1, 0, "settle", 0);
				_.#gear = "idle";
				_.#emitMovementCompleted("settle");
				return;
			}
			_.#targetPos = target.position;
			_.#movementType = "settle";
			_.#settleEngine.start(position, velocity, target.position);
			_.#gear = "settle";
		} else if (options.snap === "none" && Math.abs(velocity) < STOP_THRESHOLD) {
			_.syncIndicesFromPosition(position, velocity);
			_.#momentumEngine.stop();
			_.#gear = "idle";
			_.setPos(position, 1, 0, "momentum", 0);
			_.#emitMovementCompleted("momentum");
		} else _.syncIndicesFromPosition(position, velocity);
	}
	/**
	* Hand off from momentum to the edge-bounce spring: the track overshoots
	* the edge with the surviving velocity and settles back (iOS overscroll).
	* Also covers a drag released out of bounds — the spring starts from the
	* actual current position, so distance already past the edge becomes
	* initial displacement and the track springs back from wherever it was.
	* @param {number} edgePos - Track position of the start or end edge
	* @param {number} velocity - Surviving momentum velocity (px per frame)
	*/
	#startEdgeSpring(edgePos, velocity) {
		const _ = this;
		const velocityCap = _.ctx.store.getWidths().viewport * EDGE_MAX_OVERSHOOT_RATIO / EDGE_OVERSHOOT_PER_VELOCITY;
		const cappedVelocity = Math.max(-velocityCap, Math.min(velocity, velocityCap));
		_.#momentumEngine.stop();
		_.syncIndicesFromPosition(edgePos, 0);
		_.#emitMovementCompleted("momentum");
		_.#targetPos = edgePos;
		_.#movementType = "settle";
		_.#direction = Math.sign(edgePos - _.#currentPos) || 0;
		_.#gear = "edge";
		_.#edgeEngine.animateTo(_.#currentPos, edgePos, cappedVelocity);
		_.#emitMovementStarted(cappedVelocity, "settle");
	}
	/**
	* Apply the rubber-band curve to the part of a position that sits past a
	* non-loop edge. In-bounds positions and loop mode pass through 1:1.
	*
	* `map` picks the direction of the mapping, and the two are exact inverses:
	* - `rubberband` turns a raw drag position (dragStartPos + delta) into the
	*   resisted position to render, so the track moves progressively less than
	*   the finger the further it is pulled
	* - `inverseRubberband` turns an on-screen (possibly resisted) position back
	*   into unresisted drag coordinates, which is what the drag origin needs to
	*   be when a drag starts while the track is already overscrolled — so the
	*   first move neither jumps nor double-applies the resistance
	*
	* @param {number} pos - Position to map
	* @param {Function} map - rubberband or inverseRubberband
	* @returns {number} Mapped position
	*/
	#mapAcrossEdges(pos, map) {
		const _ = this;
		const state = _.ctx.store.getState();
		if (state.canLoop || !state.slideCount) return pos;
		const widths = _.ctx.store.getWidths();
		const options = _.ctx.store.getOptions();
		const startEdgePos = getTrackPosForIndex(0, widths, options, state);
		const endEdgePos = getTrackPosForIndex(state.slideCount - 1, widths, options, state);
		if (pos > startEdgePos) return startEdgePos + map(pos - startEdgePos, widths.viewport);
		if (pos < endEdgePos) return endEdgePos - map(endEdgePos - pos, widths.viewport);
		return pos;
	}
	#emitMovementStarted(velocity, movementType) {
		const ctx = this.ctx;
		const state = ctx.store.getState();
		ctx.emitter.emit(ctx.events.movement.started, {
			renderIndex: state.renderIndex,
			pageIndex: state.pageIndex,
			velocity,
			movementType
		});
	}
	#emitMovementCompleted(movementType) {
		const ctx = this.ctx;
		const state = ctx.store.getState();
		ctx.emitter.emit(ctx.events.movement.completed, {
			renderIndex: state.renderIndex,
			pageIndex: state.pageIndex,
			movementType
		});
	}
	destroy() {
		const _ = this;
		_.engine.off("engine:position-changed", _.handlers.enginePositionChanged);
		_.engine.off("engine:finished", _.handlers.engineMovementFinished);
		_.engine.stop();
		_.engine = null;
		_.#momentumEngine.stop();
		_.#momentumEngine = null;
		_.#settleEngine.off("engine:position-changed", _.handlers.enginePositionChanged);
		_.#settleEngine.off("engine:finished", _.handlers.engineMovementFinished);
		_.#settleEngine.destroy();
		_.#settleEngine = null;
		_.#edgeEngine.off("engine:position-changed", _.handlers.enginePositionChanged);
		_.#edgeEngine.off("engine:finished", _.handlers.engineMovementFinished);
		_.#edgeEngine.stop();
		_.#edgeEngine = null;
		_.#gear = "idle";
		const { emitter, events } = _.ctx;
		emitter.off(events.store.optionsChanged, _.handlers.optionsChanged);
		emitter.off(events.drag.start, _.handlers.dragStart);
		emitter.off(events.drag.move, _.handlers.dragMove);
		emitter.off(events.drag.end, _.handlers.dragEnd);
		_.handlers = null;
	}
};
//#endregion
//#region src/scripts/transition-manager.js
/**
* Manages track transitions
* Converts slide indexes to track positions
* Tells animator to go to new position (via animation or jump)
* Relays and emits events back to the carousel
*
**/
var TransitionManager = class {
	constructor(ctx, animator) {
		const _ = this;
		_.ctx = ctx;
		_.animator = animator;
		_.handlers = { movementRequested: ({ index, pageIndex, trackPosition, velocity, movementType }) => {
			if (trackPosition !== void 0) {
				_.goToTrackPosition(trackPosition, velocity, movementType);
				_.animator.syncIndicesFromPosition(_.animator.currentPos, velocity);
			} else if (index !== void 0) {
				_.ctx.store.setState({
					renderIndex: index,
					pageIndex
				});
				_.goToSlide(index, velocity, movementType);
			}
		} };
		_.init();
	}
	init() {
		this.bindEvents();
	}
	bindEvents() {
		const { emitter, events } = this.ctx;
		emitter.on(events.movement.requested, this.handlers.movementRequested);
	}
	goToSlide(slideIndex, velocity, movementType) {
		const _ = this;
		const widths = _.ctx.store.getWidths();
		const options = _.ctx.store.getOptions();
		const state = _.ctx.store.getState();
		_.goToTrackPosition(getTrackPosForIndex(slideIndex, widths, options, state), velocity, movementType);
	}
	goToTrackPosition(newPos, velocity, movementType) {
		const _ = this;
		if (movementType === "jump") {
			_.animator.goToPosition(newPos, 0, "jump", 0);
			return;
		}
		const currentPos = _.animator.currentPos;
		const trackWidth = _.ctx.store.getWidths().track;
		if (_.ctx.store.getState().canLoop) {
			const pageCount = _.ctx.store.getState().pageCount;
			const hasVelocity = velocity !== void 0 && velocity !== 0;
			if (pageCount <= 2 && hasVelocity) {
				const wantsForward = velocity < 0;
				if (wantsForward && newPos > currentPos) newPos -= trackWidth;
				else if (!wantsForward && newPos <= currentPos) newPos += trackWidth;
			} else {
				const posDelta = Math.abs(currentPos - newPos);
				const halfTrack = trackWidth / 2;
				if (Math.abs(posDelta - halfTrack) < .5) {
					if (hasVelocity) {
						if (velocity < 0 && newPos > currentPos) newPos -= trackWidth;
						else if (velocity > 0 && newPos <= currentPos) newPos += trackWidth;
					} else if (newPos > currentPos) newPos -= trackWidth;
				} else if (posDelta > halfTrack) {
					if (newPos >= currentPos) newPos -= trackWidth;
					else newPos += trackWidth;
				}
			}
		}
		if (velocity === void 0) velocity = newPos < currentPos ? -15 : 15;
		else {
			velocity *= 1.2;
			if (Math.abs(velocity) < 15) velocity *= 1.3;
		}
		let direction = 0;
		if (newPos < currentPos) direction = -1;
		else if (newPos > currentPos) direction = 1;
		_.animator.goToPosition(newPos, velocity, movementType, direction);
	}
	/**
	* Destroy the transition manager and clean up event listeners
	*/
	destroy() {
		const _ = this;
		const { emitter, events } = _.ctx;
		emitter.off(events.movement.requested, _.handlers.movementRequested);
		_.ctx = null;
		_.animator = null;
		_.handlers = null;
	}
};
//#endregion
//#region src/scripts/window-events.js
/**
* handles window and viewport events for the carousel
*/
var WindowEvents = class {
	/**
	* creates a new window events instance
	* @param {object} ctx - shared module context
	* @param {object} ctx.emitter
	* @param {object} ctx.events
	* @param {HTMLElement} ctx.carousel
	* @param {HTMLElement} ctx.viewport
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.carousel = ctx.carousel;
		_.viewport = ctx.viewport;
		_.lastViewportWidth = null;
		_.observedWidths = /* @__PURE__ */ new WeakMap();
		_.boundsElement = null;
		_.handlers = {
			handleResize: (event) => {
				_.ctx.emitter.emit(_.ctx.events.window.resize, { event });
			},
			handleCarouselClick: (event) => {
				const interactive = event.target.closest(INTERACTIVE_SELECTOR);
				if (!interactive || interactive === _.carousel) _.carousel.focus({ preventScroll: true });
			},
			handleWindowFocus: () => {
				_.ctx.emitter.emit(_.ctx.events.window.hasFocus, {});
			},
			handleWindowBlur: () => {
				_.ctx.emitter.emit(_.ctx.events.window.lostFocus, {});
			},
			handleCarouselFocus: (event) => {
				_.ctx.emitter.emit(_.ctx.events.carousel.hasFocus, {});
				if (_.carousel._tarotFocusRescue) return;
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "focus",
					event
				});
			},
			handleCarouselBlur: () => {
				_.ctx.emitter.emit(_.ctx.events.carousel.lostFocus, {});
			},
			handleVisibilityChange: () => {
				_.ctx.emitter.emit(_.ctx.events.window.visibilityChange, { hidden: document.hidden });
			},
			handleKeyDown: (event) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "key",
					event
				});
				if (["ArrowLeft", "ArrowRight"].includes(event.key) && event.target === _.carousel) {
					event.preventDefault();
					const direction = event.key === "ArrowLeft" ? -1 : 1;
					_.ctx.emitter.emit(_.ctx.events.keyboard.arrow, {
						direction,
						event
					});
				}
			},
			handleWheel: (event) => {
				if (event.__tarotWheelHandled || event.__tarotWheelSeen) return;
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "wheel",
					event
				});
			},
			unifiedResizeHandler: (event) => {
				const currentWidth = _.viewport.clientWidth;
				if (event !== void 0 && !(event instanceof ResizeObserverEntry) && _.lastViewportWidth !== null && currentWidth === _.lastViewportWidth) return;
				_.lastViewportWidth = currentWidth;
				_.handlers.handleResize(event);
			},
			handleOptionsChanged: ({ currentOptions, previousOptions }) => {
				if (!currentOptions) return;
				if (previousOptions && previousOptions.visibilityBoundsElement === currentOptions.visibilityBoundsElement) return;
				_.syncBoundsObservation();
			}
		};
		_.unifiedObserver = new ResizeObserver((entries) => {
			let changed = false;
			for (const entry of entries) {
				const w = entry?.contentRect?.width;
				if (w === void 0) continue;
				if (_.observedWidths.get(entry.target) === w) continue;
				_.observedWidths.set(entry.target, w);
				changed = true;
			}
			if (changed) _.handlers.unifiedResizeHandler(entries[0]);
		});
		_.init();
	}
	/**
	* initializes viewport observer and calls bindEvents
	*/
	init() {
		const _ = this;
		if (_.viewport) _.unifiedObserver.observe(_.viewport);
		_.lastViewportWidth = _.viewport.clientWidth;
		_.bindEvents();
		_.syncBoundsObservation();
	}
	/**
	* Resolves the current visibilityBoundsElement option and updates which
	* element is being observed for resize. Called on init and on options changes.
	*/
	syncBoundsObservation() {
		const _ = this;
		const options = _.ctx.store.getOptions();
		const resolved = _.ctx.utils.resolveVisibilityBoundsElement(options.visibilityBoundsElement, _.carousel, _.viewport);
		if (resolved === _.boundsElement) return;
		if (_.boundsElement && _.boundsElement !== _.viewport) {
			_.unifiedObserver.unobserve(_.boundsElement);
			_.observedWidths.delete(_.boundsElement);
		}
		_.boundsElement = resolved;
		if (resolved && resolved !== _.viewport) _.unifiedObserver.observe(resolved);
		_.handlers.unifiedResizeHandler();
	}
	/**
	* binds all event listeners for window, document, and carousel
	*/
	#listeners() {
		const { carousel, handlers } = this;
		return [
			[
				window,
				"resize",
				handlers.unifiedResizeHandler
			],
			[
				window,
				"orientationchange",
				handlers.unifiedResizeHandler
			],
			[
				window,
				"focus",
				handlers.handleWindowFocus
			],
			[
				window,
				"blur",
				handlers.handleWindowBlur
			],
			[
				carousel,
				"focus",
				handlers.handleCarouselFocus,
				true
			],
			[
				carousel,
				"blur",
				handlers.handleCarouselBlur,
				true
			],
			[
				document,
				"visibilitychange",
				handlers.handleVisibilityChange
			],
			[
				carousel,
				"keydown",
				handlers.handleKeyDown,
				true
			],
			[
				carousel,
				"wheel",
				handlers.handleWheel,
				{ passive: true }
			],
			[
				carousel,
				"click",
				handlers.handleCarouselClick,
				true
			]
		];
	}
	bindEvents() {
		const _ = this;
		for (const [target, type, handler, opts] of _.#listeners()) target.addEventListener(type, handler, opts);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.handleOptionsChanged);
	}
	/**
	* cleans up events and observers
	*/
	destroy() {
		const _ = this;
		for (const [target, type, handler, opts] of _.#listeners()) target.removeEventListener(type, handler, opts);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.handleOptionsChanged);
		_.unifiedObserver.disconnect();
		_.unifiedObserver = null;
		_.boundsElement = null;
		_.observedWidths = null;
	}
};
//#endregion
//#region src/scripts/slide-state-manager.js
/**
* slide-state-manager
* manages slide DOM state including classes, CSS custom properties, and ARIA attributes
* - called directly by frame-engine at the end of the render pipeline
* - updates slide visibility classes, selection state, and animation CSS variables
* - handles accessibility attributes and keyboard navigation state
* - coordinates slide state based on viewport position and carousel interactions
*/
var SlideStateManager = class {
	/** @type {object} shared module context */
	ctx;
	/**
	* @constructor
	* @param {object} ctx - shared module context
	* @param {object} ctx.emitter
	* @param {object} ctx.events
	* @param {HTMLElement} ctx.carousel
	* @param {HTMLElement} ctx.viewport
	* @param {import('../core/data-store.js').default} ctx.store
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.handlers = {
			renderIndexChanged: ({ currentIndex }) => {
				_.handleSlideNavigation(currentIndex);
			},
			visibilityChanged: ({ partiallyVisibleSlides, mostlyVisibleSlides, fullyVisibleSlides }) => {
				_.applyVisibilityClasses(partiallyVisibleSlides, mostlyVisibleSlides, fullyVisibleSlides);
			},
			selectedIndexChanged: () => _.updateAllSlidesSelection(),
			slidesChanged: () => _.updateAllSlidesSelection(),
			optionsChanged: () => _.syncRenderMetrics()
		};
		_.init();
	}
	/** @type {boolean} whether per-frame slide metric CSS vars are written (cached from options) */
	#renderMetrics = false;
	/**
	* initialize the slide state manager
	*/
	init() {
		const _ = this;
		_.#renderMetrics = !!_.ctx.store.getOptions().renderSlideMetrics;
		_.bindEvents();
		_.updateAllSlidesSelection();
	}
	/**
	* bind event listeners
	*/
	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
		_.ctx.emitter.on(_.ctx.events.slides.visibleChanged, _.handlers.visibilityChanged);
		_.ctx.emitter.on(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
		_.ctx.emitter.on(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
	}
	/**
	* syncs the cached renderSlideMetrics flag from options; clears stale
	* metric CSS vars from all slides when the option is turned off
	*/
	syncRenderMetrics() {
		const _ = this;
		const enabled = !!_.ctx.store.getOptions().renderSlideMetrics;
		const wasEnabled = _.#renderMetrics;
		_.#renderMetrics = enabled;
		if (wasEnabled && !enabled) {
			const slides = _.ctx.carousel.querySelectorAll("tarot-slide");
			for (const slide of slides) _.#clearSlideMetricProps(slide);
		}
	}
	/**
	* removes the per-frame metric CSS custom properties from a slide
	* @param {HTMLElement} slide - the slide element
	*/
	#clearSlideMetricProps(slide) {
		slide.style.removeProperty("--tarot-visibility");
		slide.style.removeProperty("--tarot-left-visibility");
		slide.style.removeProperty("--tarot-right-visibility");
		slide.style.removeProperty("--tarot-parallax");
		slide.style.removeProperty("--tarot-parallax-visibility");
	}
	/**
	* updates visibility data per-frame: CSS custom properties and store
	* classes/ARIA are applied separately via event subscription (not per-frame)
	* @param {number|null} [trackPosition=null] - optional track position override
	*/
	updateSlides(trackPosition = null) {
		const _ = this;
		if (trackPosition === null) trackPosition = _.ctx.store.getAnimation().trackPosition || 0;
		const slideInfos = _.ctx.utils.getSlidesInViewport(_.ctx.store.getWidths(), _.ctx.store.getSlides(), trackPosition);
		const partiallyVisibleSlides = [];
		const mostlyVisibleSlides = [];
		const fullyVisibleSlides = [];
		for (const info of slideInfos) {
			_.updateSlideProperties(info);
			if (info.isPartiallyVisible) {
				partiallyVisibleSlides.push(info.slide);
				if (info.isMostlyVisible) {
					mostlyVisibleSlides.push(info.slide);
					if (info.isFullyVisible) fullyVisibleSlides.push(info.slide);
				}
			}
		}
		_.ctx.store.setVisibility({
			partiallyVisibleSlides,
			mostlyVisibleSlides,
			fullyVisibleSlides
		});
	}
	/**
	* applies visibility classes and ARIA attributes (event-driven, not per-frame)
	* @param {HTMLElement[]} partiallyVisibleSlides - slides with any visibility (> 0%)
	* @param {HTMLElement[]} mostlyVisibleSlides - slides with >= 66% visibility
	* @param {HTMLElement[]} fullyVisibleSlides - slides with >= 98% visibility
	*/
	applyVisibilityClasses(partiallyVisibleSlides, mostlyVisibleSlides, fullyVisibleSlides) {
		const _ = this;
		const allSlides = _.ctx.store.getSlides();
		const partiallyVisibleSet = new Set(partiallyVisibleSlides);
		const mostlyVisibleSet = new Set(mostlyVisibleSlides);
		const fullyVisibleSet = new Set(fullyVisibleSlides);
		for (const slide of allSlides) {
			const isPartiallyVisible = partiallyVisibleSet.has(slide);
			const isMostlyVisible = mostlyVisibleSet.has(slide);
			const isFullyVisible = fullyVisibleSet.has(slide);
			slide.classList.remove("tarot-hidden", "tarot-partially-visible", "tarot-mostly-visible", "tarot-fully-visible");
			if (isFullyVisible) slide.classList.add("tarot-fully-visible");
			else if (isMostlyVisible) slide.classList.add("tarot-mostly-visible");
			else if (isPartiallyVisible) slide.classList.add("tarot-partially-visible");
			else slide.classList.add("tarot-hidden");
			_.updateSlideARIA(slide, isMostlyVisible);
			if (!isMostlyVisible && slide.contains(document.activeElement)) {
				const carousel = _.ctx.carousel;
				carousel._tarotFocusRescue = true;
				carousel.focus({ preventScroll: true });
				carousel._tarotFocusRescue = false;
			}
			slide.inert = !isMostlyVisible;
		}
	}
	/**
	* updates CSS custom properties for a slide (per-frame for smooth animations)
	* @param {{ slide:HTMLElement, visibilityPercent:number, leftVisibility:number, rightVisibility:number, parallax:number, parallaxVisibility:number }} slideInfo
	*/
	updateSlideProperties(slideInfo) {
		const { slide, visibilityPercent, leftVisibility, rightVisibility, parallax, parallaxVisibility } = slideInfo;
		slide._visibility = visibilityPercent;
		if (!this.#renderMetrics) return;
		slide.style.setProperty("--tarot-visibility", visibilityPercent.toFixed(3));
		slide.style.setProperty("--tarot-left-visibility", leftVisibility.toFixed(3));
		slide.style.setProperty("--tarot-right-visibility", rightVisibility.toFixed(3));
		slide.style.setProperty("--tarot-parallax", parallax.toFixed(3));
		slide.style.setProperty("--tarot-parallax-visibility", parallaxVisibility.toFixed(3));
	}
	/**
	* updates selection state (tarot-selected class) on all slides.
	* derived from the store rather than slide._selected so it is correct no
	* matter which manager's listener ran first for the triggering event
	*/
	updateAllSlidesSelection() {
		const _ = this;
		const selectedIndex = _.ctx.store.getState().selectedIndex;
		for (const slide of _.ctx.store.getSlides()) slide.classList.toggle("tarot-selected", slide._index === selectedIndex);
	}
	/**
	* updates aria attributes for a slide
	* @param {HTMLElement} slide - the slide element
	* @param {boolean} isVisible - whether the slide is visible in viewport
	*/
	updateSlideARIA(slide, isVisible) {
		const _ = this;
		slide.setAttribute("aria-hidden", String(!isVisible));
		const autolabel = slide.getAttribute("data-tarot-autolabel");
		const ariaLabel = slide.getAttribute("aria-label");
		if (!(slide.hasAttribute("aria-labelledby") || ariaLabel !== null && ariaLabel !== autolabel)) {
			const indexAttr = slide.getAttribute("index") || "0";
			const index = parseInt(indexAttr, 10) || 0;
			const total = _.ctx.store.getState().slideCount || _.ctx.store.getSlides().length || 0;
			const label = `${index + 1} of ${total}`;
			slide.setAttribute("aria-label", label);
			slide.setAttribute("data-tarot-autolabel", label);
		}
		const renderIndex = _.ctx.store.getState().renderIndex;
		const slideIndexAttr = slide.getAttribute("index");
		if (slideIndexAttr != null && Number(slideIndexAttr) === renderIndex) slide.setAttribute("aria-current", "true");
		else slide.removeAttribute("aria-current");
	}
	/**
	* handles slide navigation announcements for screen readers
	* @param {number} slideIndex - the newly selected slide index
	*/
	handleSlideNavigation(slideIndex) {
		const _ = this;
		if (!_.ctx.store.getOptions().announcements || !_.ctx.announcements) return;
		const total = _.ctx.store.getSlides().length;
		const announcement = `Slide ${slideIndex + 1} of ${total}`;
		_.ctx.announcements.textContent = announcement;
	}
	/** cleanup: unbind events and reset slide state */
	destroy() {
		const _ = this;
		_.ctx.emitter.off(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
		_.ctx.emitter.off(_.ctx.events.slides.visibleChanged, _.handlers.visibilityChanged);
		_.ctx.emitter.off(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
		_.ctx.emitter.off(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		const slides = _.ctx.carousel.querySelectorAll("tarot-slide");
		for (const slide of slides) {
			slide.classList.remove("tarot-hidden", "tarot-partially-visible", "tarot-mostly-visible", "tarot-fully-visible", "tarot-selected");
			_.#clearSlideMetricProps(slide);
			slide.removeAttribute("aria-hidden");
			slide.removeAttribute("aria-current");
			if (slide.getAttribute("aria-label") === slide.getAttribute("data-tarot-autolabel")) slide.removeAttribute("aria-label");
			slide.removeAttribute("data-tarot-autolabel");
			slide.inert = false;
		}
	}
};
//#endregion
//#region src/scripts/utils/frame-utils.js
/**
* Frame Utilities for Effect Rendering
*
* Pure utility functions for effect rendering calculations.
* These functions are injected into effect render methods to provide
* common positioning and range calculations.
*/
/**
* Resolves a named point into an absolute numeric X position, offset by the current track position.
*
* Supports infinite sentinels:
* - `"L+"` → `-Infinity`
* - `"R+"` → `Infinity`
*
* @param {string} pointName - Point key (e.g. `"L1"`, `"C"`, `"R+"`)
* @param {number} trackPosition - Current track offset in px
* @param {Object} transformPoints - Named position points from frame
* @returns {number} Absolute position in px
* @throws {Error} If pointName is unknown and not an infinity keyword
*/
function getPointValue(pointName, trackPosition, transformPoints) {
	if (pointName === "L+") return Number.NEGATIVE_INFINITY;
	if (pointName === "R+") return Number.POSITIVE_INFINITY;
	const base = transformPoints?.[pointName];
	if (base == null) throw new Error(`getPointValue: unknown point "${pointName}". Available points: ${Object.keys(transformPoints || {}).join(", ")}`);
	return base + trackPosition;
}
/**
* Computes a normalized range between two named points, with start ≥ end.
*
* @param {string} pointNameA - First point name
* @param {string} pointNameB - Second point name
* @param {number} trackPosition - Current track offset in px
* @param {Object} transformPoints - Named position points from frame
* @returns {{ start: number, end: number }} Range in px, offset for the current track position
*/
function getRange(pointNameA, pointNameB, trackPosition, transformPoints) {
	const a = getPointValue(pointNameA, trackPosition, transformPoints);
	const b = getPointValue(pointNameB, trackPosition, transformPoints);
	return a > b ? {
		start: a,
		end: b
	} : {
		start: b,
		end: a
	};
}
/**
* Checks if a slide's center is within the given point range and calculates its normalized position.
*
* @param {HTMLElement} slide - Slide element with centerPoint property
* @param {string} pointNameA - First point name
* @param {string} pointNameB - Second point name
* @param {number} trackPosition - Current track offset in px
* @param {Object} transformPoints - Named position points from frame
* @returns {{
*   isInRange: boolean,
*   percent: number,
*   start: number,
*   end: number
* }} Range check result
*/
function isSlideInRange(slide, pointNameA, pointNameB, trackPosition, transformPoints) {
	const { start, end } = getRange(pointNameA, pointNameB, trackPosition, transformPoints);
	const roundedStart = roundSubPixel(start);
	const roundedEnd = roundSubPixel(end);
	const roundedCenter = roundSubPixel(slide._centerPoint);
	const isInRange = roundedCenter <= roundedStart && roundedCenter > roundedEnd;
	let percent = 0;
	if (isInRange) {
		if (Number.isFinite(roundedStart) && Number.isFinite(roundedEnd)) {
			const full = roundedStart - roundedEnd;
			percent = full > 0 ? Math.max(0, Math.min(1, (roundedCenter - roundedEnd) / full)) : 1;
		} else percent = 1;
	}
	return {
		isInRange,
		percent,
		start: roundedStart,
		end: roundedEnd
	};
}
/**
* Creates a frame utilities object with pre-bound transform points and track position.
* This provides a cleaner API for effects to use.
*
* @param {Object} frame - Complete frame object
* @returns {Object} Utilities object with bound helper functions
*/
function createFrameUtils(frame) {
	const { animation, transformPoints } = frame;
	const trackPosition = animation.trackPosition === 0 ? 0 : -animation.trackPosition;
	return {
		/**
		* Get absolute position for a named point
		* @param {string} pointName - Point name (e.g. "L1", "C", "R2")
		* @returns {number} Absolute position in px
		*/
		getPointValue: (pointName) => getPointValue(pointName, trackPosition, transformPoints),
		/**
		* Get range between two named points
		* @param {string} pointNameA - First point name
		* @param {string} pointNameB - Second point name
		* @returns {{ start: number, end: number }} Range object
		*/
		getRange: (pointNameA, pointNameB) => getRange(pointNameA, pointNameB, trackPosition, transformPoints),
		/**
		* Check if slide is in range and get progress
		* @param {HTMLElement} slide - Slide element
		* @param {string} pointNameA - First point name
		* @param {string} pointNameB - Second point name
		* @returns {{ isInRange: boolean, percent: number, start: number, end: number }}
		*/
		isSlideInRange: (slide, pointNameA, pointNameB) => isSlideInRange(slide, pointNameA, pointNameB, trackPosition, transformPoints),
		trackPosition,
		transformPoints,
		frame
	};
}
//#endregion
//#region src/scripts/frame-engine.js
var MAX_RENDER_FAILURES = 3;
var FrameEngine = class {
	#slideStateManager;
	#renderFailures = 0;
	#layoutDirty = false;
	/** @type {boolean} an options:changed landed — the next flush reports carousel:reinit */
	#reinitPending = false;
	/** @type {boolean} the initial (mount) frame — and its layout flush — has already run */
	#hasFlushed = false;
	#pipeline;
	ctx;
	/**
	* @param {object} ctx - shared module context
	* @param {object} pipeline - privileged cross-module hooks, injected by the
	*   carousel at construction so they never ride the plugin-facing ctx.commands:
	* @param {Function} pipeline.tickAnimation - drive TrackAnimator physics for this frame
	* @param {Function} pipeline.prepSlidesForFrame - SlideManager preps slide positions
	* @param {Function} pipeline.flushLayout - LayoutEngine layout phase (recompute + effect reInit + re-jump)
	* @param {Function} pipeline.loadFallbackEffect - swap a repeatedly-throwing effect for the core carousel
	*/
	constructor(ctx, pipeline) {
		const _ = this;
		_.ctx = ctx;
		_.#pipeline = pipeline;
		_.#slideStateManager = new SlideStateManager(ctx);
		_.effect = null;
		_.rafId = null;
		_.boundOnFrame = (time) => _.onFrame(time);
		_.handlers = {
			effectChanged: ({ currentEffect }) => {
				_.effect = currentEffect;
				_.#renderFailures = 0;
				_.requestFrame();
			},
			storeDirty: () => {
				_.requestFrame();
			},
			layoutInvalidated: () => {
				_.#layoutDirty = true;
				_.requestFrame();
			},
			optionsInvalidated: () => {
				_.#layoutDirty = true;
				_.#reinitPending = true;
				_.requestFrame();
			}
		};
		_.init();
	}
	init() {
		this.bindEvents();
	}
	bindEvents() {
		const { emitter, events } = this.ctx;
		emitter.on(events.effect.changed, this.handlers.effectChanged);
		emitter.on(events.store.changedDirty, this.handlers.storeDirty);
		emitter.on(events.store.optionsChanged, this.handlers.optionsInvalidated);
		emitter.on(events.store.slidesChanged, this.handlers.layoutInvalidated);
		emitter.on(events.window.resize, this.handlers.layoutInvalidated);
	}
	requestFrame() {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(this.boundOnFrame);
	}
	cancel() {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
	onFrame(time) {
		const _ = this;
		if (!_.ctx) return;
		let announceReinit = false;
		if (_.#layoutDirty) {
			_.#layoutDirty = false;
			_.#pipeline.flushLayout();
			announceReinit = _.#reinitPending && _.#hasFlushed;
			_.#reinitPending = false;
		}
		_.#hasFlushed = true;
		_.rafId = null;
		if (announceReinit) _.ctx.emitter.emit(_.ctx.events.carousel.reinit, {});
		if (_.#layoutDirty) _.requestFrame();
		_.#pipeline.prepSlidesForFrame();
		const snapshot = _.ctx.store.getSnapshot();
		const sortedSlides = [...snapshot.slides].sort((a, b) => a._renderIndex - b._renderIndex);
		const frame = Object.freeze({
			state: snapshot.state,
			widths: snapshot.widths,
			options: snapshot.options,
			slides: sortedSlides,
			animation: snapshot.animation,
			transformPoints: snapshot.transformPoints,
			time
		});
		_.renderFrame(frame);
		_.ctx.store.markAsClean();
		if (snapshot.animation.isAnimating) {
			_.#pipeline.tickAnimation(time);
			_.requestFrame();
		}
	}
	renderFrame(frame) {
		const _ = this;
		if (!_.effect) return;
		_.ctx.emitter.emit(_.ctx.events.frame.beforeRender, frame);
		const utils = createFrameUtils(frame);
		try {
			_.effect.render(frame, utils);
			_.#renderFailures = 0;
		} catch (error) {
			_.#handleRenderError(error);
		}
		_.#slideStateManager.updateSlides(frame.animation.trackPosition);
		_.ctx.emitter.emit(_.ctx.events.frame.afterRender, frame);
	}
	/**
	* A throwing effect must not freeze the carousel: report the failure and,
	* if it keeps throwing, swap to the core carousel effect so the user still
	* has a working (if plain) carousel.
	* @param {Error} error - the error thrown by effect.render()
	*/
	#handleRenderError(error) {
		const _ = this;
		_.#renderFailures++;
		const effectName = _.effect?.constructor?.effectName || _.effect?.constructor?.name || "unknown";
		console.error(`tarot: effect '${effectName}' render failed:`, error);
		_.ctx.emitter.emit(_.ctx.events.carousel.error, {
			message: `effect '${effectName}' render failed`,
			error
		});
		if (_.#renderFailures < MAX_RENDER_FAILURES) return;
		_.#renderFailures = 0;
		if (effectName === "carousel") {
			_.effect = null;
			return;
		}
		console.error(`tarot: effect '${effectName}' disabled, using 'carousel'`);
		_.#pipeline.loadFallbackEffect();
	}
	destroy() {
		const _ = this;
		const { emitter, events } = _.ctx;
		_.cancel();
		emitter.off(events.effect.changed, _.handlers.effectChanged);
		emitter.off(events.store.changedDirty, _.handlers.storeDirty);
		emitter.off(events.store.optionsChanged, _.handlers.optionsInvalidated);
		emitter.off(events.store.slidesChanged, _.handlers.layoutInvalidated);
		emitter.off(events.window.resize, _.handlers.layoutInvalidated);
		if (_.#slideStateManager) {
			_.#slideStateManager.destroy();
			_.#slideStateManager = null;
		}
		_.effect = null;
		_.#pipeline = null;
		_.ctx = null;
	}
};
//#endregion
//#region src/scripts/layout-metrics.js
function calculateWidths({ viewportEl, options, slideCount, boundsEl }) {
	const viewport = viewportEl.offsetWidth || 0;
	const resolvedBoundsEl = boundsEl || viewportEl;
	let visibilityBoundsWidth = viewport;
	let visibilityBoundsOffset = 0;
	if (resolvedBoundsEl !== viewportEl) {
		const viewportRect = viewportEl.getBoundingClientRect();
		const boundsRect = resolvedBoundsEl.getBoundingClientRect();
		visibilityBoundsWidth = resolvedBoundsEl.offsetWidth || viewport;
		visibilityBoundsOffset = boundsRect.left - viewportRect.left;
	}
	const slidesPerView = Math.max(1, Number(options.slidesPerView) || 1);
	const gap = convertValueToNumber(options.gap, viewport);
	let paddingLeft = convertValueToNumber(options.paddingLeft, viewport);
	let paddingRight = convertValueToNumber(options.paddingRight, viewport);
	if (options.rules) {
		const minLeft = convertValueToNumber(options.rules.minPaddingLeft, viewport);
		const minRight = convertValueToNumber(options.rules.minPaddingRight, viewport);
		if (paddingLeft < minLeft) paddingLeft = minLeft;
		if (paddingRight < minRight) paddingRight = minRight;
	}
	const totalPaddingWidth = paddingLeft + paddingRight;
	const totalGapWidth = gap * (slidesPerView - 1);
	const totalSlideWidth = Math.max(0, viewport - totalGapWidth - totalPaddingWidth);
	let slide = Math.round(totalSlideWidth / slidesPerView * 1e3) / 1e3;
	const slideMin = convertValueToNumber(options.slideMinWidth, slide);
	if (slide < slideMin) slide = slideMin;
	slide = Math.max(slide, 10);
	const track = Math.max(0, slideCount) * (slide + gap);
	const groupWidth = Math.max(0, slideCount) * slide + Math.max(0, slideCount - 1) * gap;
	const innerViewport = viewport - paddingLeft - paddingRight;
	let centerOffset = 0;
	if (options.centerInsufficientSlides && groupWidth < innerViewport) centerOffset = Math.max(0, (innerViewport - groupWidth) / 2);
	return {
		viewport,
		track,
		slide,
		slideMin,
		gap,
		slideAndGap: Math.round((slide + gap) * 1e3) / 1e3,
		paddingLeft,
		paddingRight,
		centerOffset,
		visibilityBoundsWidth,
		visibilityBoundsOffset
	};
}
function calculatePageCount({ loop, slidesPerMove, slidesPerView, slideCount, align }) {
	slidesPerMove = Number(slidesPerMove);
	if (!Number.isFinite(slidesPerMove) || slidesPerMove < 1) slidesPerMove = 1;
	if (slideCount === 0) return 0;
	if (slideCount <= slidesPerView) return 1;
	if (loop || align === "center") return Math.ceil(slideCount / slidesPerMove);
	const validSlidePositions = slideCount - slidesPerView;
	return Math.ceil(validSlidePositions / slidesPerMove) + 1;
}
function calculateTransformPoints(ctx) {
	const { store } = ctx;
	const widths = store.getWidths();
	const options = store.getOptions();
	const halfSlideWidth = widths.slide / 2;
	const stepDistance = widths.slideAndGap;
	const visibleSlides = Math.ceil(options.slidesPerView) || 1;
	const CL1 = widths.paddingLeft + halfSlideWidth;
	const points = { CL1 };
	for (let i = 1; i <= visibleSlides; i++) points[`CL${i}`] = CL1 + stepDistance * (i - 1);
	for (let i = 1; i <= visibleSlides; i++) {
		const mirroredIndex = visibleSlides - i + 1;
		points[`CR${i}`] = points[`CL${mirroredIndex}`];
	}
	points.C = (points.CL1 + points[`CL${visibleSlides}`]) / 2;
	for (let i = 1; i <= 10; i++) points[`L${i}`] = CL1 - stepDistance * i;
	const lastVisiblePos = points[`CL${visibleSlides}`];
	for (let i = 1; i <= 10; i++) points[`R${i}`] = lastVisiblePos + stepDistance * i;
	return points;
}
/**
* Calculate snap points (track positions) for each page
* @param {Object} widths - Width measurements from store
* @param {Object} options - Carousel options from store
* @param {Object} state - Carousel state from store
* @returns {Object} { snapPoints: number[], firstSnapPoint: number, lastSnapPoint: number }
*/
function calculateSnapPoints(widths, options, state) {
	const { pageCount } = state;
	const { slidesPerMove } = options;
	const snapPoints = [];
	for (let page = 0; page < pageCount; page++) {
		const slideIndex = page * slidesPerMove;
		snapPoints.push(getTrackPosForIndex(slideIndex, widths, options, state));
	}
	return {
		snapPoints,
		firstSnapPoint: snapPoints[0] ?? 0,
		lastSnapPoint: snapPoints[snapPoints.length - 1] ?? 0
	};
}
//#endregion
//#region src/scripts/layout-engine.js
/**
* @class LayoutEngine
* Owns layout recomputation for the frame pipeline.
* - recompute() measures the DOM and commits widths, transform points,
*   page count, canLoop, and snap points as one store transaction
* - flush() is the pipeline's layout phase: recompute, let the effect
*   instance re-read the new geometry, then re-derive the track position
*   for the current slide
* A passive service — binds no events. Invalidation scheduling belongs to
* the FrameEngine (layoutDirty flag); this module only does the work.
*/
var LayoutEngine = class {
	/**
	* @param {object} ctx - shared module context (store, viewport, carousel, utils, commands)
	*/
	constructor(ctx) {
		this.ctx = ctx;
	}
	/**
	* Recomputes layout metrics from current slides/options and commits them
	* @param {object} [optOverride] - optional options to use for this pass
	*/
	recompute(optOverride) {
		const _ = this;
		const { store, utils } = _.ctx;
		const options = optOverride || store.getOptions();
		const slides = store.getSlides();
		const boundsEl = utils.resolveVisibilityBoundsElement(options.visibilityBoundsElement, _.ctx.carousel, _.ctx.viewport);
		const widths = calculateWidths({
			viewportEl: _.ctx.viewport,
			boundsEl,
			options,
			slideCount: slides.length
		});
		const pageCount = calculatePageCount({
			loop: options.loop,
			slidesPerMove: options.slidesPerMove,
			slidesPerView: options.slidesPerView,
			slideCount: slides.length,
			align: options.align
		});
		const canLoop = utils.canLoop(slides.length, options, options.rules.loopBuffer);
		const { snapPoints, firstSnapPoint, lastSnapPoint } = calculateSnapPoints(widths, options, {
			...store.getState(),
			pageCount,
			canLoop
		});
		store.batch(() => {
			store.setWidths(widths);
			store.setTransformPoints(calculateTransformPoints(_.ctx));
			store.setState({
				pageCount,
				canLoop,
				snapPoints,
				firstSnapPoint,
				lastSnapPoint
			});
		});
	}
	/**
	* Layout phase of the frame pipeline (invoked by FrameEngine when
	* options/slides/resize marked layout dirty)
	*/
	flush() {
		const _ = this;
		_.recompute();
		_.ctx.commands.getEffect()?.reInit?.();
		_.ctx.commands.jumpToSlide(_.ctx.store.getState().renderIndex);
	}
	destroy() {
		this.ctx = null;
	}
};
//#endregion
//#region src/scripts/events.js
var EVENTS = Object.freeze({
	carousel: Object.freeze({
		init: "carousel:init",
		ready: "carousel:ready",
		reinit: "carousel:reinit",
		destroy: "carousel:destroy",
		error: "carousel:error",
		hasFocus: "carousel:has-focus",
		lostFocus: "carousel:lost-focus"
	}),
	store: Object.freeze({
		optionsChanged: "options:changed",
		stateChanged: "state:changed",
		layoutChanged: "layout:changed",
		slidesChanged: "slides:changed",
		pageIndexChanged: "page-index:changed",
		pageCountChanged: "page-count:changed",
		canLoopChanged: "can-loop:changed",
		snapPointsChanged: "snap-points:changed",
		selectedIndexChanged: "selected-index:changed",
		renderIndexChanged: "render-index:changed",
		transformPointsChanged: "transform-points:changed",
		changedDirty: "store:changed-dirty"
	}),
	drag: Object.freeze({
		start: "drag:start",
		move: "drag:move",
		end: "drag:end",
		cancel: "drag:cancel"
	}),
	frame: Object.freeze({
		beforeRender: "frame:before-render",
		afterRender: "frame:after-render"
	}),
	slides: Object.freeze({
		click: "slides:click",
		visibleChanged: "slides:visible-changed"
	}),
	window: Object.freeze({
		resize: "window:resize",
		visibilityChange: "window:visibility-change",
		hasFocus: "window:has-focus",
		lostFocus: "window:lost-focus"
	}),
	track: Object.freeze({
		shifted: "track:shifted",
		positionChanged: "track:position-changed"
	}),
	effect: Object.freeze({
		changed: "effect:changed",
		loaded: "effect:loaded",
		destroyed: "effect:destroyed"
	}),
	movement: Object.freeze({
		requested: "movement:requested",
		started: "movement:started",
		completed: "movement:completed"
	}),
	user: Object.freeze({ interacted: "user:interacted" }),
	keyboard: Object.freeze({ arrow: "keyboard:arrow" })
});
//#endregion
//#region src/scripts/utils/object-utils.js
/**
* Object helpers used by the data store.
*
* Deliberately NOT in utils.js: that module builds the frozen `ctx.utils`
* surface handed to plugins and premium effects, and these are internal store
* mechanics rather than part of that published contract.
*/
/**
* @param {*} value - value to test
* @returns {boolean} true for object literals / null-prototype objects
*/
function isPlainObject(value) {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
/**
* Clone and freeze a nested option group so readers can't mutate stored state.
* Only plain objects are copied: an element or class instance passed as an
* option value is returned as-is, because spreading one would flatten it into a
* useless plain object.
* @param {*} value - Option group value
* @returns {*} Frozen clone when value is a plain object, otherwise value
*/
function freezeOptionGroup(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	if (!isPlainObject(value)) return value;
	return Object.freeze({ ...value });
}
/**
* Structural equality for option values: primitives, plain objects and arrays
* are compared by value (recursively), everything else (DOM nodes, functions,
* class instances) by reference. Used to make a no-op setOptions() patch a true
* no-op — no merge, no dirty flag, no options:changed event.
* @param {*} a - first value
* @param {*} b - second value
* @returns {boolean} true when the two values are structurally equal
*/
function optionsValueEqual(a, b) {
	if (Object.is(a, b)) return true;
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, i) => optionsValueEqual(item, b[i]));
	}
	if (!isPlainObject(a) || !isPlainObject(b)) return false;
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && optionsValueEqual(a[key], b[key]));
}
//#endregion
//#region src/scripts/data-store.js
/**
* datastore – central storage for all runtime data slices
* - options: validated configuration (merged patches)
* - state: runtime flags and positions (merged patches)
* - widths: measured layout numbers (replaced wholesale)
* - slides: internal slide descriptors (replaced wholesale)
*
* all writes must go through the mutators so events fire.
* reads return freshly frozen copies to prevent accidental mutation.
*/
var DataStore = class {
	/** @type {any} private emitter */
	#emitter;
	/** @type {object} private live objects (never expose directly) */
	#options;
	/** @type {object|null} cached frozen copy returned by getOptions(), invalidated on setOptions() — getOptions is hot (per-frame callers) and the freeze allocations add up */
	#optionsSnapshot = null;
	#state;
	/** @type {object|null} cached frozen copy returned by getState(), invalidated on setState() */
	#stateSnapshot = null;
	#widths;
	/** @type {object|null} cached frozen copy returned by getWidths(), invalidated on setWidths() */
	#widthsSnapshot = null;
	#slides;
	#transformPoints;
	/** @type {object|null} cached frozen copy returned by getTransformPoints(), invalidated on setTransformPoints() */
	#transformPointsSnapshot = null;
	#animation;
	/** @type {object|null} cached frozen copy returned by getAnimation(), invalidated on setAnimation() */
	#animationSnapshot = null;
	#visibility;
	/** @type {boolean} private dirty state tracking */
	#isDirty;
	/** @type {Array} events queued while a batch() is open: [event, args] tuples */
	#eventQueue = [];
	/** @type {number} batch() nesting depth — events flush when it returns to 0 */
	#batchDepth = 0;
	/**
	* creates a new datastore instance
	* @param {object} emitter - shared emitter for pub/sub (must implement emit)
	*/
	constructor(emitter) {
		const _ = this;
		if (!emitter || typeof emitter.emit !== "function") throw new Error("data-store requires an emitter with an emit method");
		_.#emitter = emitter;
		_.#isDirty = false;
		_.#options = {};
		_.#state = {
			selectedIndex: 0,
			renderIndex: 0,
			pageIndex: 0,
			pageCount: 1,
			canLoop: false,
			isDragging: false,
			slideCount: 0,
			snapPoints: [],
			firstSnapPoint: 0,
			lastSnapPoint: 0
		};
		_.#widths = {
			viewport: 0,
			track: 0,
			slide: 0,
			slideMin: 0,
			gap: 0,
			slideAndGap: 0,
			paddingLeft: 0,
			paddingRight: 0,
			visibilityBoundsWidth: 0,
			visibilityBoundsOffset: 0
		};
		_.#slides = [];
		_.#transformPoints = {};
		_.#animation = {
			movementType: "jump",
			trackPosition: 0,
			trackDelta: 0,
			velocity: 0,
			progress: 1,
			isAnimating: false,
			direction: 0,
			trackPercent: 0
		};
		_.#visibility = {
			partiallyVisibleSlides: [],
			mostlyVisibleSlides: [],
			fullyVisibleSlides: []
		};
	}
	/**
	* emits immediately, or queues while a batch() is open so listeners only
	* run after the whole transaction of mutations has been applied
	* @param {string} event - event name
	* @param {...*} args - event payload
	*/
	#emit(event, ...args) {
		if (this.#batchDepth > 0) {
			this.#eventQueue.push([event, args]);
			return;
		}
		this.#emitter.emit(event, ...args);
	}
	/**
	* applies several mutations as one transaction: events from every setter
	* called inside fn are queued and flushed in order after fn returns, so no
	* listener ever observes a half-applied multi-slice update
	* @param {Function} fn - function performing store mutations
	*/
	batch(fn) {
		const _ = this;
		_.#batchDepth++;
		try {
			fn();
		} finally {
			_.#batchDepth--;
		}
		if (_.#batchDepth > 0) return;
		const queue = _.#eventQueue;
		_.#eventQueue = [];
		for (const [event, args] of queue) _.#emitter.emit(event, ...args);
	}
	/**
	* returns a readonly copy of options
	* @returns {Readonly<object>}
	*/
	getOptions() {
		if (this.#optionsSnapshot) return this.#optionsSnapshot;
		const options = { ...this.#options };
		for (const key of Object.keys(options)) {
			if (key === "rules") continue;
			options[key] = freezeOptionGroup(options[key]);
		}
		if (options.rules && typeof options.rules === "object") options.rules = Object.freeze({
			...options.rules,
			loopBuffer: freezeOptionGroup(options.rules.loopBuffer)
		});
		this.#optionsSnapshot = Object.freeze(options);
		return this.#optionsSnapshot;
	}
	/**
	* merges a patch into options and emits options:changed.
	* a patch that only re-states current values is a complete no-op: no merge,
	* no dirty flag, no event — otherwise a listener that re-applies the same
	* options from an options-driven event (carousel:reinit) loops forever.
	* @param {object} [patch={}] - partial options to merge
	*/
	setOptions(patch = {}) {
		const _ = this;
		if (_.#isNoOpOptionsPatch(patch)) return;
		const previousOptions = _.getOptions();
		_.#options = {
			..._.#options,
			...patch
		};
		_.#optionsSnapshot = null;
		const currentOptions = _.getOptions();
		_.#markAsDirty();
		_.#emit(EVENTS.store.optionsChanged, {
			previousOptions,
			currentOptions
		});
	}
	/**
	* true when merging the patch would leave options byte-for-byte the same
	* @param {object} patch - partial options
	* @returns {boolean}
	* @private
	*/
	#isNoOpOptionsPatch(patch) {
		const _ = this;
		if (!patch || typeof patch !== "object" || !_.#options) return false;
		const keys = Object.keys(patch);
		if (keys.length === 0) return true;
		return keys.every((key) => Object.prototype.hasOwnProperty.call(_.#options, key) && optionsValueEqual(_.#options[key], patch[key]));
	}
	/**
	* returns a readonly copy of state
	* @returns {Readonly<object>}
	*/
	getState() {
		if (this.#stateSnapshot) return this.#stateSnapshot;
		this.#stateSnapshot = Object.freeze({
			...this.#state,
			snapPoints: Object.freeze([...this.#state.snapPoints])
		});
		return this.#stateSnapshot;
	}
	/**
	* merges a patch into state, emits state:changed,
	* and fires fine-grained index events when applicable
	* @param {object} [patch={}] - partial state updates
	*/
	setState(patch = {}) {
		const _ = this;
		const previousState = _.getState();
		_.#state = {
			..._.#state,
			...patch
		};
		_.#stateSnapshot = null;
		const currentState = _.getState();
		_.#markAsDirty();
		_.#emit(EVENTS.store.stateChanged, {
			previousState,
			currentState
		});
		if (patch.selectedIndex !== void 0 && patch.selectedIndex !== previousState.selectedIndex) _.#emit(EVENTS.store.selectedIndexChanged, {
			previousIndex: previousState.selectedIndex,
			currentIndex: patch.selectedIndex
		});
		if (patch.renderIndex !== void 0 && patch.renderIndex !== previousState.renderIndex) _.#emit(EVENTS.store.renderIndexChanged, {
			previousIndex: previousState.renderIndex,
			currentIndex: patch.renderIndex
		});
		if (patch.pageIndex !== void 0 && patch.pageIndex !== previousState.pageIndex) _.#emit(EVENTS.store.pageIndexChanged, {
			previousPageIndex: previousState.pageIndex,
			currentPageIndex: patch.pageIndex
		});
		if (patch.pageCount !== void 0 && patch.pageCount !== previousState.pageCount) _.#emit(EVENTS.store.pageCountChanged, { count: patch.pageCount });
		if (patch.canLoop !== void 0 && patch.canLoop !== previousState.canLoop) _.#emit(EVENTS.store.canLoopChanged, { canLoop: patch.canLoop });
		if (patch.snapPoints !== void 0) _.#emit(EVENTS.store.snapPointsChanged, {
			snapPoints: patch.snapPoints,
			firstSnapPoint: patch.firstSnapPoint,
			lastSnapPoint: patch.lastSnapPoint
		});
	}
	/**
	* returns a readonly copy of widths
	* @returns {Readonly<object>}
	*/
	getWidths() {
		if (this.#widthsSnapshot) return this.#widthsSnapshot;
		this.#widthsSnapshot = Object.freeze({ ...this.#widths });
		return this.#widthsSnapshot;
	}
	/**
	* replaces all width metrics and emits layout:changed
	* @param {object} [nextWidths={}] - full set of layout metrics
	*/
	setWidths(nextWidths = {}) {
		const _ = this;
		const previousWidths = _.getWidths();
		_.#widths = { ...nextWidths };
		_.#widthsSnapshot = null;
		const currentWidths = _.getWidths();
		_.#markAsDirty();
		_.#emit(EVENTS.store.layoutChanged, {
			previousWidths,
			currentWidths
		});
	}
	/**
	* returns a readonly copy of slides (array)
	* @returns {Readonly<Array>}
	*/
	getSlides() {
		return Object.freeze([...this.#slides || []]);
	}
	/**
	* replaces the slides array, syncs slideCount in state,
	* and emits slides:changed
	* @param {Array} [slides=[]] - new slide descriptors
	*/
	setSlides(slides = []) {
		const _ = this;
		const previousSlides = _.getSlides();
		_.#slides = [...slides];
		const currentSlides = _.getSlides();
		_.batch(() => {
			_.setState({ slideCount: _.#slides.length });
			_.#markAsDirty();
			_.#emit(EVENTS.store.slidesChanged, {
				previousSlides,
				currentSlides
			});
		});
	}
	/**
	* returns a readonly copy of transformPoints
	* @returns {Readonly<object>}
	*/
	getTransformPoints() {
		if (this.#transformPointsSnapshot) return this.#transformPointsSnapshot;
		this.#transformPointsSnapshot = Object.freeze({ ...this.#transformPoints });
		return this.#transformPointsSnapshot;
	}
	/**
	* replaces the transformPoints object and emits transformPoints:changed
	* @param {object} [nextPoints={}] - new transform points mapping
	*/
	setTransformPoints(nextPoints = {}) {
		const _ = this;
		const previousPoints = _.getTransformPoints();
		_.#transformPoints = { ...nextPoints };
		_.#transformPointsSnapshot = null;
		_.#markAsDirty();
		_.#emit(EVENTS.store.transformPointsChanged, {
			previousPoints,
			currentPoints: _.getTransformPoints()
		});
	}
	/**
	* updates animation state for frame-based rendering
	* @param {object} animationData - animation data
	* @param {string} animationData.movementType - movement type ('animate' | 'jump' | 'settle' | 'drag' | 'momentum' | 'scroll')
	* @param {number} [animationData.trackPosition] - current track position
	* @param {number} [animationData.trackDelta] - change in track position
	* @param {number} [animationData.velocity] - current velocity
	* @param {number} [animationData.progress] - animation progress (0-1)
	* @param {boolean} [animationData.isAnimating] - whether animation is active
	*/
	setAnimation(animationData = {}) {
		const _ = this;
		const previousAnimation = { ..._.#animation };
		_.#animation = {
			..._.#animation,
			...animationData
		};
		if (animationData.trackPosition !== void 0) _.#animation.trackPercent = _.#calculateTrackPercent(animationData.trackPosition);
		_.#animationSnapshot = null;
		_.#markAsDirty();
		if (animationData.trackPosition !== void 0 && animationData.trackPosition !== previousAnimation.trackPosition) _.#emit(EVENTS.track.positionChanged, {
			previousTrackPosition: previousAnimation.trackPosition,
			currentTrackPosition: animationData.trackPosition,
			trackDelta: animationData.trackPosition - previousAnimation.trackPosition,
			movementType: animationData.movementType || "unknown",
			trackPercent: _.#animation.trackPercent
		});
	}
	/**
	* calculates the track percent (spatial progress) from track position
	* @param {number} trackPosition - current track position
	* @returns {number} progress value: usually 0-1, may overflow (<0 or >1) in elastic/loop states
	* @private
	*/
	#calculateTrackPercent(trackPosition) {
		return trackPosToPercent(trackPosition, getTrackGeometry(this.#state, this.#widths));
	}
	/**
	* returns a readonly copy of animation
	* @returns {Readonly<object>}
	*/
	getAnimation() {
		if (this.#animationSnapshot) return this.#animationSnapshot;
		this.#animationSnapshot = Object.freeze({ ...this.#animation });
		return this.#animationSnapshot;
	}
	/**
	* returns a readonly copy of visibility state
	* @returns {Readonly<{partiallyVisibleSlides: HTMLElement[], mostlyVisibleSlides: HTMLElement[], fullyVisibleSlides: HTMLElement[]}>}
	*/
	getVisibility() {
		return Object.freeze({
			partiallyVisibleSlides: Object.freeze([...this.#visibility.partiallyVisibleSlides]),
			mostlyVisibleSlides: Object.freeze([...this.#visibility.mostlyVisibleSlides]),
			fullyVisibleSlides: Object.freeze([...this.#visibility.fullyVisibleSlides])
		});
	}
	/**
	* updates the visibility state with current visible slides
	* @param {object} visibility - visibility data
	* @param {HTMLElement[]} visibility.partiallyVisibleSlides - slides with any visibility (> 0%)
	* @param {HTMLElement[]} visibility.mostlyVisibleSlides - slides with >= 66% visibility
	* @param {HTMLElement[]} visibility.fullyVisibleSlides - slides with >= 98% visibility
	*/
	setVisibility({ partiallyVisibleSlides = [], mostlyVisibleSlides = [], fullyVisibleSlides = [] } = {}) {
		const _ = this;
		const prev = _.#visibility;
		const partiallyChanged = partiallyVisibleSlides.length !== prev.partiallyVisibleSlides.length || partiallyVisibleSlides.some((s, i) => s !== prev.partiallyVisibleSlides[i]);
		const mostlyChanged = mostlyVisibleSlides.length !== prev.mostlyVisibleSlides.length || mostlyVisibleSlides.some((s, i) => s !== prev.mostlyVisibleSlides[i]);
		const fullyChanged = fullyVisibleSlides.length !== prev.fullyVisibleSlides.length || fullyVisibleSlides.some((s, i) => s !== prev.fullyVisibleSlides[i]);
		if (!partiallyChanged && !mostlyChanged && !fullyChanged) return;
		_.#visibility = {
			partiallyVisibleSlides: [...partiallyVisibleSlides],
			mostlyVisibleSlides: [...mostlyVisibleSlides],
			fullyVisibleSlides: [...fullyVisibleSlides]
		};
		_.#emit(EVENTS.slides.visibleChanged, {
			partiallyVisibleSlides: _.#visibility.partiallyVisibleSlides,
			mostlyVisibleSlides: _.#visibility.mostlyVisibleSlides,
			fullyVisibleSlides: _.#visibility.fullyVisibleSlides,
			partiallyVisibleIndices: _.#visibility.partiallyVisibleSlides.map((s) => s._index),
			mostlyVisibleIndices: _.#visibility.mostlyVisibleSlides.map((s) => s._index),
			fullyVisibleIndices: _.#visibility.fullyVisibleSlides.map((s) => s._index)
		});
	}
	/**
	* marks the store as clean (no pending changes) so the next mutation
	* re-emits store:changed-dirty and schedules a frame
	*/
	markAsClean() {
		this.#isDirty = false;
	}
	/**
	* private method to mark store as dirty and emit event
	* @private
	*/
	#markAsDirty() {
		if (!this.#isDirty) {
			this.#isDirty = true;
			this.#emit(EVENTS.store.changedDirty);
		}
	}
	/**
	* returns a snapshot of the store data the frame pipeline renders from.
	* the visibility slice is deliberately absent — nothing downstream reads it
	* from here (SlideStateManager works off slides:visible-changed), so building
	* and freezing three arrays for it every frame is pure waste. Read it with
	* getVisibility() instead.
	* @returns {Readonly<object>} frozen snapshot of the render data slices
	*/
	getSnapshot() {
		const _ = this;
		return Object.freeze({
			state: _.getState(),
			widths: _.getWidths(),
			slides: _.getSlides(),
			transformPoints: _.getTransformPoints(),
			options: _.getOptions(),
			animation: _.getAnimation()
		});
	}
	/**
	* cleans up the data store and clears all references
	* should be called when the carousel is destroyed to prevent memory leaks
	*/
	destroy() {
		const _ = this;
		_.#emitter = null;
		_.#options = null;
		_.#optionsSnapshot = null;
		_.#state = null;
		_.#stateSnapshot = null;
		_.#widths = null;
		_.#widthsSnapshot = null;
		_.#slides = null;
		_.#transformPoints = null;
		_.#transformPointsSnapshot = null;
		_.#animation = null;
		_.#animationSnapshot = null;
		_.#visibility = null;
		_.#isDirty = false;
		_.#eventQueue = [];
	}
};
//#endregion
//#region src/scripts/effects/tarot-effect.js
var TarotEffect = class {
	static rules = {
		minSlidesPerView: 1,
		maxSlidesPerView: Infinity,
		loopBuffer: {
			left: 0,
			right: 1
		},
		minPaddingLeft: 0,
		minPaddingRight: 0
	};
	/**
	* @param {object} ctx - The shared context object containing emitter, store, etc.
	*/
	constructor(ctx) {
		this.ctx = ctx;
		this.currentSlideWidth = 0;
		this.currentTrackWidth = 0;
	}
	init() {}
	reInit() {}
	renderSlideWidth(width) {
		if (this.currentSlideWidth !== width) {
			this.currentSlideWidth = width;
			this.ctx.viewport.style.setProperty("--tarot-slide-width", `${width}px`);
		}
	}
	renderTrackPosition(animation) {
		let transformValue = animation.isAnimating ? `translate3d(${animation.trackPosition}px,0,0)` : `translateX(${animation.trackPosition}px)`;
		this.ctx.track.style.transform = transformValue;
	}
	renderTrackWidth(width) {
		if (this.currentTrackWidth !== width) {
			this.currentTrackWidth = width;
			this.ctx.track.style.width = `${width}px`;
		}
	}
	/**
	* Render method called by the frame engine for each animation frame.
	* Child effects must override this method to implement their visual transformations.
	* @param {Object} frame - Complete frame object with all carousel data
	* @param {Array} frame.slides - Sorted slides array with calculated positions
	* @param {Object} frame.widths - Layout measurements (viewport, slide, gap, etc.)
	* @param {Object} frame.state - Carousel state (selectedIndex, renderIndex, etc.)
	* @param {Object} frame.animation - Animation data (trackPosition, velocity, progress, etc.)
	* @param {Object} frame.transformPoints - Named position points (L1, C, R1, etc.)
	* @param {Object} frame.options - Current carousel options
	* @param {Object} utils - Frame utilities for position calculations
	* @param {Function} utils.getPointValue - Get absolute position for named point
	* @param {Function} utils.getRange - Get range between two named points
	* @param {Function} utils.isSlideInRange - Check if slide is in range with progress
	*/
	render(_frame, _utils) {}
	get rules() {
		return this.constructor.rules;
	}
	/**
	* Cleanup method called when the effect is destroyed.
	* Child classes should override and call super.destroy() if they have resources to clean up.
	*/
	destroy() {}
};
//#endregion
//#region src/scripts/effects/carousel.js
var CarouselEffect = class extends TarotEffect {
	static effectName = "carousel";
	constructor(ctx) {
		super(ctx);
	}
	/**
	* position all slides on the track using frame-based rendering
	* runs with every animation frame when track is moving
	* @param {Object} frame - complete frame object with all data
	* @param {Array} frame.slides - prepped slides with calculated positions
	* @param {Object} frame.widths - layout measurements
	* @param {Object} frame.state - carousel state (selectedIndex, renderIndex, etc.)
	* @param {Object} frame.animation - animation data
	* @param {Object} frame.transformPoints - named position points
	* @param {Object} utils - frame utilities for position calculations
	* @param {Function} utils.getPointValue - Get absolute position for named point
	* @param {Function} utils.getRange - Get range between two named points
	* @param {Function} utils.isSlideInRange - Check if slide is in range with progress
	* @returns {void}
	*/
	render(frame, _utils) {
		const { slides, widths, animation } = frame;
		this.renderTrackWidth(widths.track);
		this.renderSlideWidth(widths.slide);
		this.renderTrackPosition(animation);
		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i];
			if (slide && slide.style) slide.style.transform = `translateX(${slide._trackPosition}px)`;
		}
	}
	destroy() {
		const track = this.ctx.track;
		track.style.transform = "";
		track.style.width = "";
		for (const slide of track.querySelectorAll("tarot-slide")) slide.style.transform = "";
	}
};
//#endregion
//#region src/scripts/effects/fade.js
var Fade = class extends TarotEffect {
	static effectName = "fade";
	static defaultOptions = { fade: {
		blur: 10,
		scale: .1,
		xOffset: 0,
		yOffset: 0
	} };
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
		this.lastState = /* @__PURE__ */ new WeakMap();
		this.#loadFadeOptions();
	}
	#loadFadeOptions() {
		const _ = this;
		const fadeOpts = _.ctx.store.getOptions().fade || {};
		_.blurAmount = fadeOpts.blur;
		_.scaleAmount = fadeOpts.scale;
		_.xOffset = fadeOpts.xOffset;
		_.yOffset = fadeOpts.yOffset;
	}
	reInit() {
		this.#loadFadeOptions();
		this.lastState = /* @__PURE__ */ new WeakMap();
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
		const { slides, widths } = frame;
		_.renderSlideWidth(widths.slide);
		const l1 = roundSubPixel(utils.getPointValue("L1"));
		const cl1 = roundSubPixel(utils.getPointValue("CL1"));
		const r1 = roundSubPixel(utils.getPointValue("R1"));
		const fadeSpan = cl1 - l1;
		const lastState = _.lastState;
		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i];
			const center = roundSubPixel(slide._centerPoint);
			if (center <= l1) {
				if (lastState.get(slide) !== "hiddenLeft") {
					_.applyHiddenLeftFilter(slide);
					lastState.set(slide, "hiddenLeft");
				}
			} else if (center <= cl1) {
				const percent = fadeSpan > 0 ? Math.max(0, Math.min(1, (center - l1) / fadeSpan)) : 1;
				const key = `fadeLeft:${Math.round(percent * 100)}`;
				if (lastState.get(slide) !== key) {
					_.applyFadeLeftFilter(slide, percent);
					lastState.set(slide, key);
				}
			} else if (center <= r1) {
				if (lastState.get(slide) !== "fadeRight") {
					_.applyFadeRightFilter(slide);
					lastState.set(slide, "fadeRight");
				}
			} else if (center > r1) {
				if (lastState.get(slide) !== "hiddenRight") {
					_.applyHiddenRightFilter(slide);
					lastState.set(slide, "hiddenRight");
				}
			}
		}
	}
	applyHiddenLeftFilter(slide) {
		const _ = this;
		const style = slide.style;
		slide.hide();
		style.opacity = "0";
		style.zIndex = "1";
		style.filter = `blur(${_.blurAmount}px)`;
		style.transform = `scale(${1 + _.scaleAmount}) translateX(${_.xOffset}px) translateY(${_.yOffset}px)`;
	}
	applyFadeLeftFilter(slide, percent) {
		if (percent > .995) percent = 1;
		const _ = this;
		const remaining = 1 - percent;
		const blur = remaining * _.blurAmount;
		const scale = 1 + remaining * _.scaleAmount;
		const tx = remaining * _.xOffset;
		const ty = remaining * _.yOffset;
		const style = slide.style;
		style.opacity = String(percent);
		slide.show();
		style.zIndex = "1";
		style.filter = `blur(${blur}px)`;
		style.transform = `scale(${scale}) translateX(${tx}px) translateY(${ty}px)`;
	}
	applyFadeRightFilter(slide) {
		const style = slide.style;
		style.opacity = "1";
		slide.show();
		style.zIndex = "0";
		style.filter = "blur(0px)";
		style.transform = "scale(1) translateX(0px) translateY(0px)";
	}
	applyHiddenRightFilter(slide) {
		const style = slide.style;
		style.opacity = "0";
		slide.hide();
		style.zIndex = "0";
		style.filter = "blur(0px)";
		style.transform = "scale(1) translateX(0px) translateY(0px)";
	}
	destroy() {
		super.destroy();
		for (const slide of this.ctx.track.querySelectorAll("tarot-slide")) {
			slide.style.opacity = "";
			slide.show();
			slide.style.zIndex = "";
			slide.style.filter = "";
			slide.style.transform = "";
		}
		this.lastState = null;
	}
};
//#endregion
//#region src/scripts/plugins/as-nav-for.js
/** Per-mode wiring: option key, connect delay, warning label. */
var MODES = {
	asNavFor: {
		option: "asNavFor",
		delay: 40,
		label: "AsNavFor"
	},
	syncWith: {
		option: "syncWith",
		delay: 100,
		label: "SyncWith"
	}
};
var AsNavFor = class AsNavFor {
	static pluginName = "as-nav-for";
	/**
	* @constructor
	* @param {Object} ctx - the carousel context that will be synced with another
	* @param {'asNavFor'|'syncWith'} [mode='asNavFor'] - which option this
	*   instance connects; only the nav-mode instance is registered as a plugin
	*/
	constructor(ctx, mode = "asNavFor") {
		const _ = this;
		_.ctx = ctx;
		_.mode = MODES[mode];
		_.isNav = mode === "asNavFor";
		_.otherCarousel = null;
		_.isActive = false;
		_.isSyncing = false;
		_.connectTimer = null;
		_.focusTimers = /* @__PURE__ */ new Set();
		_.mirrorTimers = /* @__PURE__ */ new Map();
		_.handlers = {
			otherMovementRequested: ({ index, velocity, movementType }) => {
				if (_.isSyncing) return;
				const state = _.ctx.store.getState();
				if ((_.isNav ? state.selectedIndex : state.renderIndex) === index) return;
				_.isSyncing = true;
				const run = () => {
					_.mirrorTimers.delete(timer);
					if (_.isNav) _.ctx.commands.goToSlide(index);
					else _.ctx.commands.goToSlide(index, velocity, movementType);
					_.isSyncing = false;
				};
				const timer = setTimeout(run, 1);
				_.mirrorTimers.set(timer, run);
			},
			optionsChanged: () => {
				_.reInit();
			},
			movementRequested: ({ index, velocity, movementType }) => {
				if (_.isSyncing) return;
				if (!_.otherCarousel) return;
				_.isSyncing = true;
				const run = () => {
					_.mirrorTimers.delete(timer);
					if (typeof _.otherCarousel?.goToSlide !== "function") {
						_.isSyncing = false;
						return;
					}
					_.otherCarousel.goToSlide(index, velocity, movementType);
					_.isSyncing = false;
				};
				const timer = setTimeout(run, 1);
				_.mirrorTimers.set(timer, run);
			},
			renderIndexChanged: ({ currentIndex }) => {
				if (!_.isActive) return;
				if (_.ctx.store.getState().selectedIndex !== currentIndex) _.ctx.store.setState({ selectedIndex: currentIndex });
			},
			slidesChanged: () => {
				if (_.isActive) _.applyNavRoles();
			},
			selectedIndexChanged: ({ previousIndex, currentIndex }) => {
				if (!_.isActive) return;
				_.updateOtherCarousel();
				_.updateNavClasses(previousIndex, currentIndex);
			},
			keyDown: (event) => {
				if (!_.isActive) return;
				_.handleKeyDown(event);
			},
			slideClick: ({ index }) => {
				if (!_.isActive) return;
				_.ctx.store.getSlides()[index]?.focus({ preventScroll: true });
				_.ctx.commands.goToSlide(index);
			}
		};
		_.init();
		if (_.isNav) _.syncLink = new AsNavFor(ctx, "syncWith");
	}
	/**
	* query the other carousel from the DOM
	* @returns {boolean} whether a target was found
	*/
	queryDOM() {
		const _ = this;
		const selector = _.ctx.store.getOptions()[_.mode.option];
		if (!selector) {
			_.deactivateNavUI();
			return false;
		}
		const otherCarousel = document.querySelector(selector);
		if (!otherCarousel) {
			_.deactivateNavUI();
			return false;
		}
		_.otherCarousel = otherCarousel;
		if (_.isNav) _.isActive = true;
		return true;
	}
	/**
	* initialize the sync functionality and (in nav mode) nav-specific features
	*/
	init() {
		this.bindEvents();
		this.setupConnection();
	}
	/**
	* setup the connection to the other carousel
	* Called from init() and reInit()
	*/
	setupConnection() {
		const _ = this;
		if (!_.queryDOM()) return;
		if (_.isNav) _.enableNavUI();
		_.connectTimer = setTimeout(async () => {
			_.connectTimer = null;
			try {
				if (_.isNav) await customElements.whenDefined("tarot-carousel");
				if (typeof _.otherCarousel?.on !== "function") throw new Error("Target unavailable");
				_.otherCarousel.on(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
			} catch {
				console.warn(`tarot: ${_.mode.label} target is not a tarot-carousel`);
				if (_.isNav) {
					_.disableNavUI();
					_.isActive = false;
					_.otherCarousel = null;
				}
				return;
			}
			if (!_.isNav) return;
			_.updateNavClasses(-1, _.ctx.store.getState().selectedIndex);
			const { renderIndex, selectedIndex } = _.ctx.store.getState();
			if (renderIndex !== selectedIndex) _.ctx.store.setState({ selectedIndex: renderIndex });
		}, _.mode.delay);
	}
	/**
	* reinitialize on carousel option changes
	*/
	reInit() {
		const _ = this;
		_.clearTimers(true);
		if (typeof _.otherCarousel?.off === "function") _.otherCarousel.off(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
		_.otherCarousel = null;
		_.deactivateNavUI();
		_.setupConnection();
	}
	/**
	* bind carousel events to handlers
	*/
	bindEvents() {
		const _ = this;
		const { emitter, events } = _.ctx;
		const handlers = _.handlers;
		emitter.on(events.store.optionsChanged, handlers.optionsChanged);
		if (!_.isNav) {
			emitter.on(events.movement.requested, handlers.movementRequested);
			return;
		}
		emitter.on(events.store.renderIndexChanged, handlers.renderIndexChanged);
		emitter.on(events.store.selectedIndexChanged, handlers.selectedIndexChanged);
		emitter.on(events.store.slidesChanged, handlers.slidesChanged);
		emitter.on(events.slides.click, handlers.slideClick);
	}
	/** enable nav-specific UI and keyboard only when active */
	enableNavUI() {
		const _ = this;
		const ctx = _.ctx;
		const carousel = ctx.carousel;
		if (!_.isActive) return;
		carousel.classList.add("tarot-nav-carousel");
		ctx.track.addEventListener("keydown", _.handlers.keyDown, true);
		carousel.setAttribute("tabindex", "0");
		carousel.setAttribute("role", "tablist");
		carousel.setAttribute("aria-label", "Carousel Navigation");
		carousel.removeAttribute("aria-roledescription");
		_.applyNavRoles();
	}
	/** Apply tab roles and roving tabindex to the current slide collection. */
	applyNavRoles() {
		const _ = this;
		const slides = _.ctx.store.getSlides();
		const sel = _.ctx.store.getState().selectedIndex;
		for (let i = 0; i < slides.length; i++) {
			const s = slides[i];
			s.setAttribute("role", "tab");
			s.removeAttribute("aria-roledescription");
			s.setAttribute("tabindex", i === sel ? "0" : "-1");
		}
	}
	/** tear the nav UI back down, but only if it was ever applied */
	deactivateNavUI() {
		const _ = this;
		if (!_.isActive) return;
		_.disableNavUI();
		_.isActive = false;
	}
	/**
	* Schedule a focus update and retain its timer for teardown.
	* @param {Function} callback - Focus operation
	*/
	scheduleFocus(callback) {
		const _ = this;
		const timer = setTimeout(() => {
			_.focusTimers.delete(timer);
			callback();
		}, 0);
		_.focusTimers.add(timer);
	}
	/** disable nav-specific UI and keyboard when not active */
	disableNavUI() {
		const _ = this;
		const ctx = _.ctx;
		const carousel = ctx.carousel;
		carousel.classList.remove("tarot-nav-carousel");
		ctx.track.removeEventListener("keydown", _.handlers.keyDown, true);
		carousel.removeAttribute("aria-label");
		carousel.setAttribute("role", "group");
		carousel.setAttribute("aria-roledescription", "carousel");
		ctx.store.getSlides().forEach((slide) => {
			slide.removeAttribute("aria-selected");
			slide.removeAttribute("tabindex");
			slide.setAttribute("role", "group");
			slide.setAttribute("aria-roledescription", "slide");
		});
	}
	/**
	* Handle keyboard navigation for nav carousel (tablist pattern):
	* arrows step one slide, Home/End jump to the ends, and focus follows the
	* selection. Wrapping keys off state.canLoop — the same signal the core
	* arrows and pagination use — so a loop:true layout that cannot actually
	* loop stops at the ends here too.
	* @param {KeyboardEvent} event
	*/
	handleKeyDown(event) {
		const _ = this;
		const { selectedIndex, slideCount, canLoop } = _.ctx.store.getState();
		const lastIndex = slideCount - 1;
		let targetIndex;
		switch (event.key) {
			case "ArrowLeft":
			case "ArrowUp":
				targetIndex = selectedIndex > 0 ? selectedIndex - 1 : canLoop ? lastIndex : selectedIndex;
				break;
			case "ArrowRight":
			case "ArrowDown":
				targetIndex = selectedIndex < lastIndex ? selectedIndex + 1 : canLoop ? 0 : selectedIndex;
				break;
			case "Home":
				targetIndex = 0;
				break;
			case "End":
				targetIndex = lastIndex;
				break;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		_.ctx.commands.goToSlide(targetIndex);
		const targetSlide = _.ctx.store.getSlides()[targetIndex];
		if (targetSlide) _.scheduleFocus(() => targetSlide.focus({ preventScroll: true }));
	}
	/**
	* Update navigation-specific classes on slides
	* Note: The main tarot-selected class is handled by ClassManager,
	* but we add nav-specific ARIA attributes for accessibility
	*/
	updateNavClasses(previousIndex, currentIndex) {
		const slides = this.ctx.store.getSlides();
		if (previousIndex >= 0 && slides[previousIndex]) {
			slides[previousIndex].setAttribute("aria-selected", "false");
			slides[previousIndex].setAttribute("tabindex", "-1");
		}
		if (slides[currentIndex]) {
			slides[currentIndex].setAttribute("aria-selected", "true");
			slides[currentIndex].setAttribute("role", "tab");
			slides[currentIndex].setAttribute("tabindex", "0");
		}
	}
	/**
	* update the other carousel to match this one (nav mode)
	*/
	updateOtherCarousel() {
		const _ = this;
		if (!_.otherCarousel) return;
		if (_.isSyncing) return;
		const currentIndex = _.ctx.store.getState().selectedIndex;
		const otherCarousel = _.otherCarousel;
		const run = () => {
			_.mirrorTimers.delete(timer);
			try {
				otherCarousel.goToSlide(currentIndex);
			} catch {}
		};
		const timer = setTimeout(run, 1);
		_.mirrorTimers.set(timer, run);
	}
	/**
	* Clear the pending connect timer and the movement-mirror timers.
	* @param {boolean} [flush=false] - run pending mirrors synchronously
	*   (reInit) instead of dropping them (destroy)
	*/
	clearTimers(flush = false) {
		const _ = this;
		if (_.connectTimer !== null) clearTimeout(_.connectTimer);
		_.connectTimer = null;
		const pending = [..._.mirrorTimers.values()];
		for (const timer of _.mirrorTimers.keys()) clearTimeout(timer);
		_.mirrorTimers.clear();
		if (flush) for (const run of pending) run();
		_.isSyncing = false;
	}
	/**
	* destroy the sync, unbinding all events and cleaning up nav functionality
	*/
	destroy() {
		const _ = this;
		_.clearTimers();
		for (const timer of _.focusTimers) clearTimeout(timer);
		_.focusTimers.clear();
		const { emitter, events } = _.ctx;
		const handlers = _.handlers;
		emitter.off(events.store.optionsChanged, handlers.optionsChanged);
		if (_.isNav) {
			emitter.off(events.store.renderIndexChanged, handlers.renderIndexChanged);
			emitter.off(events.store.selectedIndexChanged, handlers.selectedIndexChanged);
			emitter.off(events.store.slidesChanged, handlers.slidesChanged);
			emitter.off(events.slides.click, handlers.slideClick);
			_.disableNavUI();
		} else emitter.off(events.movement.requested, handlers.movementRequested);
		if (typeof _.otherCarousel?.off === "function") _.otherCarousel.off(events.movement.requested, handlers.otherMovementRequested);
		_.otherCarousel = null;
		_.isActive = false;
		_.syncLink?.destroy();
	}
};
//#endregion
//#region src/scripts/plugins/autoplay.js
/**
* Controls automatic play/advance of the carousel.
* Uses CSS @keyframes + @property for smooth progress animation
* and setTimeout for slide-advance timing — no rAF loop needed.
*/
var cssInjected = false;
function injectCSS() {
	if (cssInjected) return;
	cssInjected = true;
	const style = document.createElement("style");
	style.textContent = "@property --tarot-autoplay-progress{syntax:\"<number>\";inherits:true;initial-value:0}@keyframes tarot-autoplay-progress{from{--tarot-autoplay-progress:0}to{--tarot-autoplay-progress:1}}";
	document.head.appendChild(style);
}
var Autoplay = class {
	static pluginName = "autoplay";
	/**
	* @constructor
	* @param {Object} ctx - the carousel context to control autoplay for
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.autoplayOptions = _.ctx.store.getOptions().autoplay || {};
		_.isRunning = false;
		_.isSuspended = false;
		_.isUserPaused = false;
		_.interval = 0;
		_.timerId = null;
		_.remainingTime = 0;
		_.runToken = 0;
		_.isAnimating = false;
		_.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		_.debouncedResume = null;
		_.handlers = {
			userInteracted: () => {
				if (!_.autoplayOptions.interval) return;
				_.pause();
			},
			optionsChanged: () => _.reInit(),
			canLoopChanged: ({ canLoop }) => {
				if (_.ctx.store.getOptions().loop && !canLoop) _.stop();
				else if (canLoop && _.autoplayOptions.interval && !_.isRunning && !_.isUserPaused) _.start();
			},
			windowFocused: () => _.resume(),
			windowBlurred: () => _.suspend(),
			visibilityChanged: ({ hidden }) => {
				if (hidden) _.suspend();
				else _.resume();
			},
			reducedMotionChanged: () => {
				_.reInit();
			}
		};
		_.init();
	}
	/**
	* initialize autoplay
	*/
	init() {
		this.bindEvents();
		this.reInit();
	}
	/** (re)create the debounced resume with the configured delay */
	buildDebouncedResume() {
		const _ = this;
		_.debouncedResume?.cancel();
		const delay = Number(_.autoplayOptions.resumeDelay);
		_.debouncedResume = _.ctx.utils.debounce(() => _.start(), Number.isFinite(delay) && delay >= 0 ? delay : 1e4);
	}
	/**
	* reinitialize on carousel option changes
	*/
	reInit() {
		const _ = this;
		_.autoplayOptions = _.ctx.store.getOptions().autoplay || {};
		_.buildDebouncedResume();
		if (_.autoplayOptions.interval) _.start();
		else _.stop();
	}
	/**
	* bind carousel events to handlers
	*/
	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.user.interacted, _.handlers.userInteracted);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.on(_.ctx.events.store.canLoopChanged, _.handlers.canLoopChanged);
		_.ctx.emitter.on(_.ctx.events.window.hasFocus, _.handlers.windowFocused);
		_.ctx.emitter.on(_.ctx.events.window.lostFocus, _.handlers.windowBlurred);
		_.ctx.emitter.on(_.ctx.events.window.visibilityChange, _.handlers.visibilityChanged);
		_.reducedMotionQuery?.addEventListener("change", _.handlers.reducedMotionChanged);
	}
	/**
	* whether autoplay should hold off because the user prefers reduced motion
	* (on by default; opt out with autoplay.respectReducedMotion: false)
	* @returns {boolean}
	*/
	respectsReducedMotion() {
		const _ = this;
		return _.autoplayOptions.respectReducedMotion !== false && !!_.reducedMotionQuery?.matches;
	}
	/** toggle aria-live on the announcements element based on autoplay state */
	updateAriaLive() {
		const announcements = this.ctx.announcements;
		if (!announcements) return;
		announcements.setAttribute("aria-live", this.isRunning ? "off" : "polite");
	}
	/**
	* start the CSS keyframe animation on the carousel element
	*/
	startAnimation() {
		const _ = this;
		const el = _.ctx.carousel;
		injectCSS();
		_.isAnimating = true;
		el.style.animation = "none";
		el.offsetHeight;
		el.style.animation = `tarot-autoplay-progress ${_.interval}ms linear forwards`;
		el.style.animationPlayState = "running";
	}
	/**
	* stop the CSS animation — with no animation running the @property
	* initial-value resets progress to 0. No-op unless the plugin started one, so
	* an author's own animation on the carousel is never clobbered by an autoplay
	* that is switched off.
	*/
	stopAnimation() {
		const _ = this;
		if (!_.isAnimating) return;
		_.isAnimating = false;
		_.ctx.carousel.style.removeProperty("animation");
		_.ctx.carousel.style.removeProperty("animation-play-state");
	}
	/**
	* start the autoplay timer
	*/
	start() {
		const _ = this;
		_.stop();
		if (!_.autoplayOptions.interval) return;
		let interval = _.autoplayOptions.interval;
		if (interval === true) interval = 4e3;
		if (!Number.isFinite(interval) || interval <= 0) return;
		if (_.respectsReducedMotion()) return;
		const options = _.ctx.store.getOptions();
		const state = _.ctx.store.getState();
		if (options.autoscroll && options.autoscroll.speed) {
			console.warn("tarot: autoplay off — autoscroll is running");
			return;
		}
		if (options.loop && !state.canLoop) return;
		if (!options.loop && !_.autoplayOptions.rewind && state.pageIndex >= state.pageCount - 1) return;
		_.interval = interval;
		_.isRunning = true;
		_.isSuspended = false;
		_.isUserPaused = false;
		_.remainingTime = interval;
		_.updateAriaLive();
		_.startAnimation();
		_.armTimer(interval);
	}
	/**
	* arm the advance timer under a fresh run token, so any timer armed earlier
	* (and already invalidated by pause/stop/suspend) can no longer fire
	* @param {number} delay - milliseconds until the next advance
	*/
	armTimer(delay) {
		const _ = this;
		_.runToken++;
		const token = _.runToken;
		_.timerId = setTimeout(() => {
			if (_.runToken === token) _.advance();
		}, delay);
	}
	/**
	* advance to next slide and restart countdown
	*/
	advance() {
		const _ = this;
		const options = _.ctx.store.getOptions();
		const state = _.ctx.store.getState();
		if (!options.loop && state.pageIndex >= state.pageCount - 1) {
			if (_.autoplayOptions.rewind) _.ctx.commands.goToSlide(0, -5);
			else {
				_.stop();
				return;
			}
		} else _.ctx.commands.next(-5);
		const newState = _.ctx.store.getState();
		if (!options.loop && !_.autoplayOptions.rewind && newState.pageIndex >= newState.pageCount - 1) {
			_.stop();
			return;
		}
		_.remainingTime = _.interval;
		_.startAnimation();
		_.armTimer(_.interval);
	}
	/**
	* suspend autoplay (window blur / visibility hidden) — preserves position
	*/
	suspend() {
		const _ = this;
		if (!_.isRunning || _.isSuspended) return;
		_.isSuspended = true;
		_.ctx.carousel.style.animationPlayState = "paused";
		if (_.timerId !== null) {
			clearTimeout(_.timerId);
			_.timerId = null;
		}
		const progress = getComputedStyle(_.ctx.carousel).getPropertyValue("--tarot-autoplay-progress");
		const p = parseFloat(progress);
		const elapsed = Number.isFinite(p) ? p * _.interval : 0;
		_.remainingTime = Math.max(0, Math.min(_.interval, _.interval - elapsed));
	}
	/**
	* resume after suspend — picks up from where it left off
	*/
	resume() {
		const _ = this;
		if (!_.isSuspended) return;
		_.isSuspended = false;
		_.ctx.carousel.style.animationPlayState = "running";
		_.armTimer(_.remainingTime);
	}
	/**
	* pause autoplay temporarily (user interaction) — resets progress to 0
	*/
	pause() {
		const _ = this;
		_.isRunning = false;
		_.isSuspended = false;
		_.isUserPaused = true;
		_.stopAnimation();
		if (_.timerId !== null) {
			clearTimeout(_.timerId);
			_.timerId = null;
		}
		_.runToken++;
		_.updateAriaLive();
		if (_.autoplayOptions.interval && _.autoplayOptions.afterInteraction !== "stop") _.debouncedResume();
	}
	/**
	* stop the autoplay timer completely
	*/
	stop() {
		const _ = this;
		_.isRunning = false;
		_.isSuspended = false;
		_.isUserPaused = false;
		_.runToken++;
		if (_.timerId !== null) {
			clearTimeout(_.timerId);
			_.timerId = null;
		}
		_.stopAnimation();
		_.updateAriaLive();
	}
	/**
	* destroy the autoplay, unbinding all events and clearing timers
	*/
	destroy() {
		const _ = this;
		_.stop();
		_.ctx.emitter.off(_.ctx.events.user.interacted, _.handlers.userInteracted);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.canLoopChanged, _.handlers.canLoopChanged);
		_.ctx.emitter.off(_.ctx.events.window.hasFocus, _.handlers.windowFocused);
		_.ctx.emitter.off(_.ctx.events.window.lostFocus, _.handlers.windowBlurred);
		_.ctx.emitter.off(_.ctx.events.window.visibilityChange, _.handlers.visibilityChanged);
		_.reducedMotionQuery?.removeEventListener("change", _.handlers.reducedMotionChanged);
		_.debouncedResume.cancel();
	}
};
//#endregion
//#region src/scripts/plugins/buttons.js
var Buttons = class {
	static pluginName = "buttons";
	/**
	* @constructor
	* @param {Object} ctx - the carousel context that the buttons will control
	*/
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.navOptions = {};
		_.prevButton = null;
		_.nextButton = null;
		_.smartButtonImages = [];
		_.smartButtonsRaf = 0;
		_.initTimers = [];
		_.viewportObserver = null;
		_.handlers = {
			previousClick: (e) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "button",
					event: e
				});
				_.ctx.commands.previous(5);
			},
			nextClick: (e) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "button",
					event: e
				});
				_.ctx.commands.next(-5);
			},
			buttonFocus: (e) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "focus",
					event: e
				});
			},
			optionsChanged: () => {
				_.reInit();
			},
			debouncedCheckDisabledState: _.ctx.utils.debounce(() => {
				_.checkDisabledState();
			}, 4),
			windowResize: _.ctx.utils.debounce(() => {
				_.#scheduleSmartButtonsUpdate();
			}, 60),
			indexChanged: () => {
				_.#scheduleSmartButtonsUpdate();
			},
			imageLoad: () => {
				_.#scheduleSmartButtonsUpdate();
			}
		};
		_.init();
	}
	/**
	* initialize the navigation buttons
	*/
	init() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};
		_.queryDOM();
		if (!_.nextButton) _.nextButton = _.buildButton("next");
		if (!_.prevButton) _.prevButton = _.buildButton("prev");
		_.checkButtonOptions();
		_.bindEvents();
		_.checkDisabledState();
		if (_.navOptions.smartButtons) for (const delay of [8, 30]) _.initTimers.push(setTimeout(() => _.updateSmartButtons(), delay));
	}
	/**
	* reinitialize on carousel option changes
	*/
	reInit() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};
		_.checkButtonOptions();
		_.checkDisabledState();
		_.#syncViewportObserver();
		_.#scheduleSmartButtonsUpdate();
	}
	#subscriptions() {
		const _ = this;
		const events = _.ctx.events;
		const handlers = _.handlers;
		return [
			[events.store.optionsChanged, handlers.optionsChanged],
			[events.store.pageIndexChanged, handlers.debouncedCheckDisabledState],
			[events.store.pageCountChanged, handlers.debouncedCheckDisabledState],
			[events.store.slidesChanged, handlers.debouncedCheckDisabledState],
			[events.store.canLoopChanged, handlers.debouncedCheckDisabledState],
			[events.store.renderIndexChanged, handlers.indexChanged],
			[events.window.resize, handlers.windowResize]
		];
	}
	#buttonListeners() {
		const _ = this;
		return [
			[
				_.prevButton,
				"click",
				_.handlers.previousClick,
				true
			],
			[
				_.prevButton,
				"focus",
				_.handlers.buttonFocus,
				false
			],
			[
				_.nextButton,
				"click",
				_.handlers.nextClick,
				true
			],
			[
				_.nextButton,
				"focus",
				_.handlers.buttonFocus,
				false
			]
		];
	}
	/**
	* bind all events (DOM and emitter)
	*/
	bindEvents() {
		const _ = this;
		for (const [button, type, handler, capture] of _.#buttonListeners()) button?.addEventListener(type, handler, capture);
		for (const [event, handler] of _.#subscriptions()) _.ctx.emitter.on(event, handler);
		_.#syncViewportObserver();
	}
	/**
	* check button options and show/hide buttons accordingly
	*/
	checkButtonOptions() {
		const _ = this;
		const nav = _.navOptions;
		_.#toggleButton(_.prevButton, nav.showButtons && nav.showPreviousButton !== false, "tarot-previous");
		_.#toggleButton(_.nextButton, nav.showButtons && nav.showNextButton !== false, "tarot-next");
	}
	#toggleButton(button, show, className) {
		if (!button) return;
		button.style.display = show ? "" : "none";
		if (show) button.classList.add("tarot-button", className);
	}
	/**
	* query buttons from the dom
	*/
	queryDOM() {
		const _ = this;
		const nav = _.navOptions;
		_.prevButton = _.#findButton(nav.previousButtonSelector, "data-action-tarot-previous");
		_.nextButton = _.#findButton(nav.nextButtonSelector, "data-action-tarot-next");
	}
	#findButton(selector, attribute) {
		const _ = this;
		if (selector) {
			const supplied = document.querySelector(selector);
			if (supplied) return supplied;
		}
		return Array.from(_.ctx.carousel.querySelectorAll(`[${attribute}]`)).find((button) => button.closest("tarot-carousel") === _.ctx.carousel) || null;
	}
	/**
	* build a navigation button if it doesn't exist
	* @param {string} type - 'prev' or 'next'
	* @returns {Element} the created button element
	*/
	buildButton(type) {
		const isNext = type === "next";
		const dataAttr = isNext ? "data-action-tarot-next" : "data-action-tarot-previous";
		const html = `<button class="tarot-button" ${dataAttr} aria-label="${isNext ? "next slide" : "previous slide"}"><svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>${isNext ? "angle right" : "angle left"}</title><path d="${isNext ? "m11 25 9-9-9-9" : "m21 7-9 9 9 9"}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>`;
		this.ctx.carousel.insertAdjacentHTML("afterbegin", html);
		return this.ctx.carousel.querySelector(`[${dataAttr}]`);
	}
	#slidesOnCurrentPage() {
		const _ = this;
		const slides = _.ctx.store.getSlides();
		if (!slides.length) return [];
		const options = _.ctx.store.getOptions();
		const perView = Math.ceil(options.slidesPerView);
		const renderIndex = _.ctx.store.getState().renderIndex;
		const start = options.loop ? renderIndex : Math.min(renderIndex, Math.max(0, slides.length - perView));
		const page = [];
		for (let i = 0; i < perView; i++) {
			const index = options.loop ? (start + i) % slides.length : start + i;
			if (index >= slides.length) break;
			page.push(slides[index]);
		}
		return page;
	}
	#measurePageImages(pageSlides) {
		const _ = this;
		_.#releasePageImages();
		let tallest = 0;
		for (const slide of pageSlides) {
			const image = slide?.querySelector("img");
			if (!image) continue;
			tallest = Math.max(tallest, image.offsetHeight);
			if (image.complete) continue;
			image.addEventListener("load", _.handlers.imageLoad, { once: true });
			_.smartButtonImages.push(image);
		}
		return tallest;
	}
	#releasePageImages() {
		const _ = this;
		for (const image of _.smartButtonImages) image.removeEventListener("load", _.handlers.imageLoad);
		_.smartButtonImages = [];
	}
	#syncViewportObserver() {
		const _ = this;
		if (!_.navOptions.smartButtons || !_.ctx.viewport) {
			_.#disconnectViewportObserver();
			return;
		}
		if (_.viewportObserver) return;
		_.viewportObserver = new ResizeObserver(() => _.#scheduleSmartButtonsUpdate());
		_.viewportObserver.observe(_.ctx.viewport);
	}
	#disconnectViewportObserver() {
		const _ = this;
		if (!_.viewportObserver) return;
		_.viewportObserver.disconnect();
		_.viewportObserver = null;
	}
	#scheduleSmartButtonsUpdate() {
		const _ = this;
		if (!_.navOptions.smartButtons) {
			if (_.smartButtonsRaf) {
				cancelAnimationFrame(_.smartButtonsRaf);
				_.smartButtonsRaf = 0;
			}
			_.prevButton?.classList.remove("tarot-smart-position");
			_.nextButton?.classList.remove("tarot-smart-position");
			return;
		}
		if (_.smartButtonsRaf) cancelAnimationFrame(_.smartButtonsRaf);
		_.smartButtonsRaf = requestAnimationFrame(() => {
			_.smartButtonsRaf = 0;
			_.updateSmartButtons();
		});
	}
	updateSmartButtons() {
		const _ = this;
		const buttons = [_.prevButton, _.nextButton];
		if (!_.navOptions.smartButtons) {
			for (const button of buttons) button?.classList.remove("tarot-smart-position");
			return;
		}
		const viewport = _.ctx.viewport;
		if (!viewport) return;
		if (!_.ctx.store.getSlides().length) return;
		const viewportTopPadding = parseInt(window.getComputedStyle(viewport).paddingTop) || 0;
		let buttonTopPos = viewport.offsetHeight;
		const tallestImage = _.#measurePageImages(_.#slidesOnCurrentPage());
		if (tallestImage > 0 && tallestImage < buttonTopPos) buttonTopPos = tallestImage + viewportTopPadding * 2;
		buttonTopPos = buttonTopPos / 2;
		for (const button of buttons) {
			if (!button) continue;
			button.classList.add("tarot-smart-position");
			button.style.top = `${buttonTopPos}px`;
		}
	}
	/**
	* check and update disabled state of buttons
	*/
	checkDisabledState() {
		const _ = this;
		const { pageIndex, pageCount, slideCount, canLoop } = _.ctx.store.getState();
		const inert = slideCount === 0 || pageCount <= 1;
		if (_.prevButton) _.prevButton.disabled = inert || !canLoop && pageIndex === 0;
		if (_.nextButton) _.nextButton.disabled = inert || !canLoop && pageIndex === pageCount - 1;
	}
	/**
	* destroy the buttons, unbinding all events
	*/
	destroy() {
		const _ = this;
		for (const [button, type, handler, capture] of _.#buttonListeners()) button?.removeEventListener(type, handler, capture);
		for (const [event, handler] of _.#subscriptions()) _.ctx.emitter.off(event, handler);
		_.#releasePageImages();
		_.#disconnectViewportObserver();
		_.handlers.debouncedCheckDisabledState.cancel();
		_.handlers.windowResize.cancel();
		if (_.smartButtonsRaf) {
			cancelAnimationFrame(_.smartButtonsRaf);
			_.smartButtonsRaf = 0;
		}
		_.initTimers.forEach(clearTimeout);
		_.initTimers.length = 0;
		_.prevButton = null;
		_.nextButton = null;
	}
};
//#endregion
//#region src/scripts/plugins/pagination.js
/**
* I used this link for referencing how to implement the pagedots
* https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
* "It is recommended that tabs activate automatically when they
* receive focus as long as their associated tab panels are displayed
* without noticeable latency. This typically requires tab panel
* content to be preloaded. Otherwise, automatic activation slows
* focus movement, which significantly hampers users' ability
* to navigate efficiently across the tab list."
* */
var paginationInstanceCount = 0;
var Pagination = class {
	static pluginName = "pagination";
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.instanceId = ++paginationInstanceCount;
		_.navOptions = {};
		_.paginationContainer = null;
		_.dotsList = null;
		_.isAutoGenerated = false;
		_.containerDisplay = "";
		_.debouncedRender = _.ctx.utils.debounce(() => _.render(), 20);
		_.handlers = {
			paginationClick: (event) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "pagination",
					event
				});
				const target = event.target.closest("[data-action-tarot-go-to-page]");
				if (!target) return;
				const pageIndex = parseInt(target.getAttribute("data-page-index"), 10);
				_.activateDot(pageIndex);
			},
			keyDown: (event) => {
				if (![
					"ArrowLeft",
					"ArrowRight",
					"Home",
					"End"
				].includes(event.key)) return;
				const tabs = Array.from(_.paginationContainer.querySelectorAll(".tarot-dots-button"));
				const currentIndex = tabs.findIndex((tab) => tab.getAttribute("tabIndex") === "0");
				let newIndex = currentIndex;
				const state = _.ctx.store.getState();
				switch (event.key) {
					case "ArrowRight":
						newIndex = currentIndex + 1;
						if (newIndex >= tabs.length) newIndex = state.canLoop ? 0 : currentIndex;
						break;
					case "ArrowLeft":
						newIndex = currentIndex - 1;
						if (newIndex < 0) newIndex = state.canLoop ? tabs.length - 1 : currentIndex;
						break;
					case "Home":
						newIndex = 0;
						break;
					case "End":
						newIndex = tabs.length - 1;
						break;
					default: return;
				}
				event.preventDefault();
				event.stopPropagation();
				tabs.forEach((tab, i) => {
					tab.tabIndex = i === newIndex ? 0 : -1;
				});
				tabs[newIndex].focus();
				_.ctx.emitter.emit(_.ctx.events.user.interacted, {
					via: "key",
					event
				});
				_.activateDot(newIndex);
			},
			optionsChanged: () => {
				_.reInit();
			},
			slidesChanged: () => {
				_.reInit();
			},
			pageChanged: () => {
				_.updateSelectedDot();
			}
		};
		_.init();
	}
	/**
	* query and setup the pagination container
	*/
	queryDOM() {
		const _ = this;
		let container = null;
		if (_.navOptions && _.navOptions.paginationSelector) container = document.querySelector(_.navOptions.paginationSelector) || null;
		if (!container) {
			const allPaginationContainers = _.ctx.carousel.querySelectorAll("[data-tarot-pagination]");
			container = Array.from(allPaginationContainers).find((el) => el.closest("tarot-carousel") === _.ctx.carousel) || null;
		}
		_.dotsList = document.createElement("ul");
		_.dotsList.classList.add("tarot-dots-list");
		_.dotsList.setAttribute("role", "tablist");
		_.dotsList.setAttribute("aria-orientation", "horizontal");
		_.dotsList.setAttribute("aria-label", "carousel navigation");
		if (container) {
			_.isAutoGenerated = false;
			container.querySelectorAll(":scope > .tarot-dots-list").forEach((list) => list.remove());
			_.containerDisplay = container.style.display;
			container.appendChild(_.dotsList);
			_.paginationContainer = container;
		} else {
			_.isAutoGenerated = true;
			_.ctx.carousel.appendChild(_.dotsList);
			_.paginationContainer = _.dotsList;
		}
	}
	init() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};
		_.isAutoGenerated = false;
		_.queryDOM();
		_.bindEvents();
		_.render();
	}
	reInit() {
		this.navOptions = this.ctx.store.getOptions().navigation || {};
		this.debouncedRender();
	}
	bindEvents() {
		const _ = this;
		const emitter = _.ctx.emitter;
		const events = _.ctx.events.store;
		emitter.on(events.optionsChanged, _.handlers.optionsChanged);
		emitter.on(events.slidesChanged, _.handlers.slidesChanged);
		emitter.on(events.pageIndexChanged, _.handlers.pageChanged);
		_.paginationContainer.addEventListener("click", _.handlers.paginationClick, false);
		_.paginationContainer.addEventListener("keydown", _.handlers.keyDown, false);
	}
	render() {
		const _ = this;
		const { pageIndex: page, pageCount } = _.ctx.store.getState();
		const carouselID = _.ctx.carousel.id || "";
		const tabIdPrefix = carouselID || `tarot-${_.instanceId}`;
		const controls = carouselID ? ` aria-controls="${carouselID}"` : "";
		let html = "";
		for (let i = 0; i < pageCount; ++i) {
			const selected = page === i;
			html += `<li role="presentation"><button type="button" class="tarot-dots-button" role="tab" id="${tabIdPrefix}-tab-${i + 1}" data-page-index="${i}" data-action-tarot-go-to-page aria-selected="${selected}" aria-label="page ${i + 1}"${controls} tabindex="${selected ? 0 : -1}"><span class="tarot-visually-hidden">slide ${i + 1}</span></button></li>`;
		}
		_.dotsList.innerHTML = html;
		_.updateSelectedDot();
		if (_.navOptions && _.navOptions.showPagination) _.show();
		else _.hide();
	}
	activateDot(index) {
		this.ctx.commands.goToPage(index);
	}
	updateSelectedDot() {
		const _ = this;
		const dots = _.paginationContainer.querySelectorAll(".tarot-dots-button");
		const currentPage = `${_.ctx.store.getState().pageIndex}`;
		dots.forEach((dot) => {
			if (dot.dataset.pageIndex === currentPage) {
				dot.setAttribute("aria-selected", "true");
				dot.tabIndex = 0;
			} else {
				dot.setAttribute("aria-selected", "false");
				dot.tabIndex = -1;
			}
		});
	}
	show() {
		this.paginationContainer.style.display = "";
	}
	hide() {
		this.paginationContainer.style.display = "none";
	}
	destroy() {
		const _ = this;
		if (_.paginationContainer) {
			_.paginationContainer.removeEventListener("click", _.handlers.paginationClick, false);
			_.paginationContainer.removeEventListener("keydown", _.handlers.keyDown, false);
		}
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.off(_.ctx.events.store.pageIndexChanged, _.handlers.pageChanged);
		_.debouncedRender?.cancel();
		if (_.isAutoGenerated) {
			if (_.paginationContainer?.parentNode === _.ctx.carousel) _.ctx.carousel.removeChild(_.paginationContainer);
		} else if (_.paginationContainer) {
			_.dotsList?.remove();
			_.paginationContainer.style.display = _.containerDisplay;
		}
		_.paginationContainer = null;
		_.dotsList = null;
		_.debouncedRender = null;
	}
};
//#endregion
//#region src/scripts/tarot.js
/**
* Canonical registry key: trimmed, lowercased, with the type suffix dropped
* (`FadeEffect` → `fade`, `WheelPlugin` → `wheel`)
* @param {string} name - raw static id or class name
* @param {RegExp} suffix - trailing type word to strip
* @returns {string}
*/
function canonicalKey(name, suffix) {
	return String(name).trim().toLowerCase().replace(suffix, "");
}
/**
* Fold a registered effect/plugin class's static defaultOptions into the
* shared defaults every instance merges from.
* @param {typeof Tarot} target - the class owning the registry (subclass-safe)
* @param {Function} registeredClass - effect or plugin class
*/
function collectDefaultOptions(target, registeredClass) {
	const defaults = registeredClass.defaultOptions;
	if (!defaults || typeof defaults !== "object") return;
	target.pluginDefaultOptions = utils.deepMerge(target.pluginDefaultOptions, defaults);
}
/**
* Tell already-connected instances that something new is available.
* @param {string} eventName - window event name
* @param {object} detail - CustomEvent detail
*/
function broadcastRegistration(eventName, detail) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(eventName, { detail }));
}
/** 🔮 ✨ 🕯️ 🍄 🌙 ⭐ TAROT ⭐ 🌙 🍄 🕯️ ✨ 🔮 */
var Tarot = class Tarot extends BaseElement {
	/** core effects (always included) */
	static effects = {
		carousel: CarouselEffect,
		fade: Fade
	};
	/** @type {Array<Function>} core plugins (always included) */
	static plugins = [
		AsNavFor,
		Autoplay,
		Buttons,
		Pagination
	];
	/** @type {Map<string, Function>} optional plugins registered via registerPlugin() */
	static optionalPlugins = /* @__PURE__ */ new Map();
	/** @type {number} count of carousel instances created */
	static instanceCount = 0;
	/** @type {object} accumulated default options from registered plugins */
	static pluginDefaultOptions = {};
	/**
	* register an effect class using a canonical key
	* prefers a static identifier (effectName/slug/key), falls back to class name
	* @param {Function} effectClass
	*/
	static registerEffect(effectClass) {
		const _ = this;
		if (!effectClass) {
			console.warn("tarot: registerEffect needs a class");
			return;
		}
		let effectName = effectClass.effectName;
		if (!effectName) {
			console.warn("tarot: effect needs a static effectName");
			return;
		}
		const key = canonicalKey(effectName, /effect$/);
		if (_.effects[key]) console.warn(`tarot: effect '${key}' overwritten`);
		_.effects[key] = effectClass;
		collectDefaultOptions(_, effectClass);
		broadcastRegistration("tarot:effect-registered", { effectName: key });
	}
	/**
	* derive a canonical key from a plugin class
	* prefers pluginName, falls back to class name
	* @param {Function} pluginClass
	* @returns {string|null}
	*/
	static #getPluginKey(pluginClass) {
		const name = pluginClass.pluginName || pluginClass.name;
		return name ? canonicalKey(name, /plugin$/) : null;
	}
	/**
	* register an optional plugin class
	* adds it to the static plugins array for future instances and
	* dispatches an event so already-connected instances can pick it up
	* @param {Function} pluginClass
	*/
	static registerPlugin(pluginClass) {
		const _ = this;
		if (!pluginClass) {
			console.warn("tarot: registerPlugin needs a class");
			return;
		}
		const key = _.#getPluginKey(pluginClass);
		if (!key) {
			console.warn("tarot: plugin needs a static pluginName");
			return;
		}
		if (!pluginClass.pluginName) console.warn(`tarot: plugin '${key}' needs: static pluginName = '${key}';`);
		if (_.optionalPlugins.has(key)) {
			console.warn(`tarot: plugin '${key}' overwritten`);
			const oldPlugin = _.optionalPlugins.get(key);
			const idx = _.plugins.indexOf(oldPlugin);
			if (idx !== -1) _.plugins.splice(idx, 1);
		}
		_.optionalPlugins.set(key, pluginClass);
		collectDefaultOptions(_, pluginClass);
		if (!_.plugins.includes(pluginClass)) _.plugins.push(pluginClass);
		broadcastRegistration("tarot:plugin-registered", {
			pluginName: key,
			pluginClass
		});
	}
	/**
	* register a plugin class to be initialized on new instances
	* delegates to registerPlugin so late-loaded plugins also reach connected instances
	* @param {Function} plugin
	* @returns {typeof Tarot}
	*/
	static use(plugin) {
		this.registerPlugin(plugin);
		return this;
	}
	#eventEmitter;
	#store;
	#ctx;
	#transitionManager;
	#trackAnimator;
	#slideManager;
	#optionsManager;
	#effectManager;
	#dragHandler;
	#windowEvents;
	#layoutEngine;
	#frameEngine;
	#pluginInstances = [];
	#initializedPluginKeys = /* @__PURE__ */ new Set();
	#pluginRegisteredHandler = null;
	#coreHandlers = null;
	#viewport;
	#track;
	#announcements;
	#initialized = false;
	#isTearingDown = false;
	#connectionVersion = 0;
	#teardownVersion = 0;
	#lifecycle = "idle";
	#readyPromise;
	#resolveReady;
	/** creates a new tarotcarousel instance */
	constructor() {
		super();
		const _ = this;
		_.#eventEmitter = new EventEmitter();
		_.#store = new DataStore(_.#eventEmitter);
		_.#rearmReady();
	}
	/** custom element connected lifecycle hook */
	async connectedCallback() {
		const _ = this;
		if (_.#isTearingDown || _.#initialized) return;
		const connectionVersion = ++_.#connectionVersion;
		if (!_.id) _.id = `tarot-carousel-${Tarot.instanceCount++}`;
		if (!customElements.get("tarot-slide")) {
			await customElements.whenDefined("tarot-slide");
			await new Promise(requestAnimationFrame);
		}
		if (connectionVersion !== _.#connectionVersion || !_.isConnected || _.#isTearingDown || _.#initialized) return;
		if (!_.#eventEmitter) _.#eventEmitter = new EventEmitter();
		if (!_.#store) _.#store = new DataStore(_.#eventEmitter);
		_.#queryDOMElements();
		_.setAttribute("tabindex", "0");
		_.setAttribute("role", "group");
		_.setAttribute("aria-roledescription", "carousel");
		_.#ctx = _.#createModuleContext();
		const ctx = _.#ctx;
		_.#optionsManager = new OptionsManager(ctx);
		_.#windowEvents = new WindowEvents(ctx);
		_.#slideManager = new SlideManager(ctx);
		_.#effectManager = new EffectManager(ctx, _.constructor.effects);
		_.#dragHandler = new DragHandler(ctx);
		_.#trackAnimator = new TrackAnimator(ctx);
		_.#transitionManager = new TransitionManager(ctx, _.#trackAnimator);
		_.#layoutEngine = new LayoutEngine(ctx);
		_.#frameEngine = new FrameEngine(ctx, {
			tickAnimation: (time) => _.#trackAnimator.tick(time),
			prepSlidesForFrame: () => _.#slideManager.prepSlidesForFrame(),
			flushLayout: () => _.#layoutEngine.flush(),
			loadFallbackEffect: () => _.#effectManager.loadEffect("carousel")
		});
		_.#bindCoreEvents();
		_.#effectManager.loadCurrentEffect();
		_.#layoutEngine.recompute();
		_.#effectManager.getEffect()?.reInit?.();
		_.constructor.plugins.forEach((PluginClass) => {
			try {
				const key = _.constructor.#getPluginKey(PluginClass);
				if (key && _.#initializedPluginKeys.has(key)) return;
				const pluginInstance = new PluginClass(ctx);
				_.#pluginInstances.push(pluginInstance);
				if (key) _.#initializedPluginKeys.add(key);
			} catch (error) {
				console.error(`tarot: plugin ${PluginClass?.name} init failed:`, error);
			}
		});
		_.#pluginRegisteredHandler = (e) => {
			const { pluginName, pluginClass } = e.detail;
			if (_.#initializedPluginKeys.has(pluginName)) return;
			try {
				const pluginInstance = new pluginClass(ctx);
				_.#pluginInstances.push(pluginInstance);
				_.#initializedPluginKeys.add(pluginName);
				if (pluginClass.defaultOptions) _.#optionsManager.setUserOptions({});
			} catch (error) {
				console.error(`tarot: plugin ${pluginName} init failed:`, error);
			}
		};
		window.addEventListener("tarot:plugin-registered", _.#pluginRegisteredHandler);
		_.#lifecycle = "initialized";
		_.#initialized = true;
		_.#eventEmitter.emit(EVENTS.carousel.init, {});
		if (!_.isConnected) return;
		const initial = _.#store.getOptions().initialIndex ?? 0;
		_.jumpToSlide(initial);
		_.#frameEngine.requestFrame();
		_.#lifecycle = "ready";
		_.#eventEmitter.emit(EVENTS.carousel.ready, {});
		_.#resolveReady();
	}
	/** create the promise for the next ready lifecycle */
	#rearmReady() {
		this.#readyPromise = new Promise((resolve) => {
			this.#resolveReady = resolve;
		});
	}
	/**
	* build and freeze a shared module context
	* @returns {object} ctx
	*/
	#createModuleContext() {
		const _ = this;
		return Object.freeze({
			emitter: _.#eventEmitter,
			events: EVENTS,
			store: _.#store,
			getPluginDefaults: () => Tarot.pluginDefaultOptions,
			getEffectClass: (name) => _.constructor.effects[name] || null,
			utils,
			carousel: _,
			viewport: _.#viewport,
			track: _.#track,
			announcements: _.#announcements,
			commands: {
				goToSlide: (index, velocity, movementType) => _.goToSlide(index, velocity, movementType),
				jumpToSlide: (index) => _.jumpToSlide(index),
				next: (velocity) => _.next(velocity),
				previous: (velocity) => _.previous(velocity),
				goToPage: (page, velocity, movementType) => _.goToPage(page, velocity, movementType),
				jumpToPage: (page) => _.jumpToPage(page),
				settleTrack: () => _.#settleTrack(),
				stopAnimations: () => _.#trackAnimator.stop(),
				requestTrackPosition: (position) => _.requestTrackPosition(position),
				getEffect: () => _.#effectManager.getEffect(),
				requestFrame: () => _.#frameEngine.requestFrame(),
				driveTrackPosition: (params = {}) => _.#trackAnimator.drivePosition(params)
			}
		});
	}
	/**
	* find or create required child elements
	* ensures there is a <tarot-viewport> wrapping a <tarot-track>
	* creates announcement element for screen reader navigation feedback
	*/
	#queryDOMElements() {
		const _ = this;
		let viewport = _.querySelector(":scope tarot-viewport");
		let track = _.querySelector(":scope tarot-track");
		if (!viewport && !track) throw new Error("tarot-carousel: missing both <tarot-viewport> and <tarot-track> elements");
		if (track && !viewport) {
			viewport = document.createElement("tarot-viewport");
			track.parentNode.insertBefore(viewport, track);
			viewport.appendChild(track);
		}
		if (viewport && !track) {
			track = document.createElement("tarot-track");
			while (viewport.firstChild) track.appendChild(viewport.firstChild);
			viewport.appendChild(track);
		}
		_.querySelector(":scope > .tarot-announcements")?.remove();
		const announcements = document.createElement("div");
		announcements.className = "tarot-visually-hidden tarot-announcements";
		announcements.id = `tarot-announcements-${_.id}`;
		announcements.setAttribute("aria-live", "polite");
		announcements.setAttribute("aria-atomic", "true");
		_.insertBefore(announcements, _.firstChild);
		_.#viewport = viewport;
		_.#track = track;
		_.#announcements = announcements;
	}
	/** subscribe to core events and coordinate managers */
	#bindCoreEvents() {
		const _ = this;
		const { emitter, events } = _.#ctx;
		_.#coreHandlers = {
			effectLoaded: ({ effectName }) => {
				if (effectName !== _.#optionsManager.userOptions?.effect) return;
				_.#optionsManager.applyMergedOptions();
			},
			slidesClick: ({ index }) => {
				if (_.#store.getOptions().focusOnSelect) _.#store.setState({ selectedIndex: index });
			},
			selectedIndexChanged: ({ currentIndex }) => {
				if (!_.#store.getOptions().goToSelectedSlide) return;
				if (currentIndex === _.#store.getState().renderIndex) return;
				_.goToSlide(currentIndex);
			},
			keyboardArrow: ({ direction }) => {
				direction === -1 ? _.previous() : _.next();
			}
		};
		emitter.on(events.effect.loaded, _.#coreHandlers.effectLoaded);
		emitter.on(events.slides.click, _.#coreHandlers.slidesClick);
		emitter.on(events.keyboard.arrow, _.#coreHandlers.keyboardArrow);
		emitter.on(events.store.selectedIndexChanged, _.#coreHandlers.selectedIndexChanged);
	}
	/** unbind all core event handlers registered in #bindCoreEvents */
	#unbindCoreEvents() {
		const _ = this;
		if (!_.#coreHandlers || !_.#ctx) return;
		const { emitter, events } = _.#ctx;
		emitter.off(events.effect.loaded, _.#coreHandlers.effectLoaded);
		emitter.off(events.slides.click, _.#coreHandlers.slidesClick);
		emitter.off(events.keyboard.arrow, _.#coreHandlers.keyboardArrow);
		emitter.off(events.store.selectedIndexChanged, _.#coreHandlers.selectedIndexChanged);
		_.#coreHandlers = null;
	}
	/**
	* advance to the next page
	* @param {number} [velocity=0]
	*/
	next(velocity = 0) {
		if (!this.#store) return;
		this.goToPage(this.state.pageIndex + 1, velocity);
	}
	/**
	* go back to the previous page
	* @param {number} [velocity=0]
	*/
	previous(velocity = 0) {
		if (!this.#store) return;
		this.goToPage(this.state.pageIndex - 1, velocity);
	}
	/**
	* settle the track back to current position
	* used after drag below threshold
	*/
	#settleTrack(velocity = 0) {
		if (!this.#store || !this.#eventEmitter) return;
		const state = this.#store.getState();
		this.#eventEmitter.emit(EVENTS.movement.requested, {
			index: state.renderIndex,
			pageIndex: state.pageIndex,
			velocity,
			movementType: "settle"
		});
	}
	/**
	* animate to a specific slide index (logical)
	* @param {number} index
	* @param {number} [velocity=0]
	*/
	goToSlide(index, velocity = 0, movementType = "animate") {
		if (index === void 0) return;
		if (!this.#store || !this.#eventEmitter) return;
		const _ = this;
		const state = _.#store.getState();
		const slides = _.#store.getSlides();
		const slideCount = state.slideCount ?? slides.length;
		if (slideCount === 0) return;
		if (index < 0) {
			index = state.canLoop ? (index % slideCount + slideCount) % slideCount : 0;
			if (!state.canLoop && !velocity) velocity = 10;
		} else if (index >= slideCount) {
			index = state.canLoop ? index % slideCount : slideCount - 1;
			if (!state.canLoop && !velocity) velocity = -10;
		}
		_.#eventEmitter.emit(EVENTS.movement.requested, {
			index,
			pageIndex: _.#getPageIndexForSlide(index),
			velocity,
			movementType
		});
	}
	/**
	* jump (no animation) to a specific slide
	* @param {number} index
	*/
	jumpToSlide(index) {
		this.goToSlide(index, 0, "jump");
	}
	/**
	* go to a page (converts page -> slide) with animation
	* @param {number} newPage
	* @param {number} [velocity=0]
	* @param {string} [movementType='animate']
	*/
	goToPage(newPage, velocity = 0, movementType = "animate") {
		if (newPage === void 0) return;
		if (!this.#store) return;
		const _ = this;
		const state = _.#store.getState();
		const options = _.#store.getOptions();
		const pageCount = _.#derivePageCount();
		if (pageCount === 0) return;
		if (newPage < 0) {
			newPage = state.canLoop ? (newPage % pageCount + pageCount) % pageCount : 0;
			if (!state.canLoop && !velocity) velocity = 10;
		} else if (newPage >= pageCount) {
			newPage = state.canLoop ? (newPage % pageCount + pageCount) % pageCount : pageCount - 1;
			if (!state.canLoop && !velocity) velocity = -10;
		}
		const newIndex = newPage * (options.slidesPerMove ?? 1);
		_.goToSlide(newIndex, velocity, movementType);
	}
	/**
	* jump directly to a page (no animation)
	* @param {number} newPage
	*/
	jumpToPage(newPage) {
		this.goToPage(newPage, 0, "jump");
	}
	/**
	* request a specific track position (continuous positioning system)
	* @param {number|string} position - position to move to:
	*   - number: treated as percentage (0-100)
	*   - string ending in '%': percentage (e.g., '50%')
	*   - string ending in 'px': pixel position (e.g., '200px')
	*   - other string: treated as percentage number
	*/
	requestTrackPosition(position) {
		const _ = this;
		if (position === void 0 || position === null) return;
		if (!_.#store || !_.#eventEmitter) return;
		const raw = String(position);
		const value = parseFloat(raw);
		if (Number.isNaN(value)) return;
		const trackPosition = raw.endsWith("px") ? value : _.#convertPercentToTrackPos(value);
		_.#eventEmitter.emit(EVENTS.movement.requested, {
			trackPosition,
			velocity: 0,
			movementType: "jump"
		});
	}
	/**
	* convert percentage (0-100) to a track position spanning the snap range
	* (0% = first snap point, 100% = last), delegating to the shared track math
	* so this agrees with every other percent↔position conversion
	* @param {number} percent - percentage from 0 to 100
	* @returns {number} track position in pixels
	* @private
	*/
	#convertPercentToTrackPos(percent) {
		const _ = this;
		return percentToTrackPos(Math.max(0, Math.min(100, percent)) / 100, getTrackGeometry(_.#store.getState(), _.#store.getWidths()));
	}
	/**
	* Page count for the options in the store right now.
	* state.pageCount only catches up on the next frame's Phase-0 layout flush,
	* so navigation called in the same turn as updateOptions() would otherwise
	* clamp against the previous layout.
	* @returns {number}
	*/
	#derivePageCount() {
		const options = this.#store.getOptions();
		return calculatePageCount({
			loop: options.loop,
			slidesPerMove: options.slidesPerMove,
			slidesPerView: options.slidesPerView,
			slideCount: this.#store.getState().slideCount,
			align: options.align
		});
	}
	/** compute page index for a given slide index */
	#getPageIndexForSlide(slideIndex) {
		const perMove = this.#store.getOptions().slidesPerMove ?? 1;
		return Math.max(0, Math.min(Math.floor(slideIndex / perMove), this.#derivePageCount() - 1));
	}
	/** immutable runtime state snapshot (empty after disconnect) */
	get state() {
		return this.#store?.getState() ?? {};
	}
	/** immutable visibility snapshot (empty after disconnect) */
	get visibility() {
		return this.#store?.getVisibility() ?? {};
	}
	/** readonly slides (internal descriptors; empty after disconnect) */
	get slides() {
		return this.#store?.getSlides() ?? [];
	}
	/** immutable options snapshot (empty after disconnect) */
	get options() {
		return this.#store?.getOptions() ?? {};
	}
	get viewport() {
		return this.#viewport;
	}
	get track() {
		return this.#track;
	}
	/** registered effect keys */
	get effects() {
		return Object.keys(this.constructor.effects);
	}
	/** user-provided options (before defaults applied) */
	get userOptions() {
		return this.#optionsManager?.userOptions ?? {};
	}
	/** update options (merges with existing) */
	updateOptions(newOptions) {
		this.#optionsManager?.setUserOptions(newOptions);
	}
	/** current slide index */
	get index() {
		return this.state.renderIndex;
	}
	/** current page index */
	get page() {
		return this.state.pageIndex;
	}
	/** selected slide index */
	get selectedIndex() {
		return this.state.selectedIndex;
	}
	setSelectedIndex(index) {
		const _ = this;
		if (!_.#store) return;
		const slideCount = _.#store.getSlides().length;
		if (index < 0 || index >= slideCount) {
			console.warn(`tarot: index ${index} out of bounds`);
			return;
		}
		_.#store.setState({ selectedIndex: index });
	}
	/** currently selected slide element */
	get selectedSlide() {
		return this.#store?.getSlides()[this.state.selectedIndex];
	}
	getSlideAtIndex(index) {
		return this.#store?.getSlides()[index];
	}
	/**
	* Add a slide to the carousel
	* @param {string|HTMLElement} element - HTML string or DOM element to add
	* @param {number} [index] - Optional index to insert at (appends to end if omitted)
	*/
	addSlide(element, index) {
		this.#slideManager?.addSlide(element, index);
	}
	/**
	* Remove a slide from the carousel
	* @param {number} index - Index of slide to remove
	*/
	removeSlide(index) {
		this.#slideManager?.removeSlide(index);
	}
	/**
	* Set slide state for visibility/transitions
	* @param {string|number} indexOrState - State to apply to all slides, or slide index
	* @param {string} [state] - State when first param is index ('active', 'hidden', 'disabled')
	*/
	setSlideState(indexOrState, state) {
		if (!this.#store) return;
		const slides = this.#store.getSlides();
		if (typeof indexOrState === "string") slides.forEach((slide) => {
			if (slide.getAttribute("state") !== "disabled") slide.setAttribute("state", indexOrState);
		});
		else {
			const slide = slides[indexOrState];
			if (slide) slide.setAttribute("state", state);
		}
	}
	/**
	* subscribe to an event
	* External listeners are deferred to next tick to prevent blocking the carousel
	* @param {string} event
	* @param {Function} listener
	*/
	on(event, listener) {
		const _ = this;
		if (!_.#eventEmitter) _.#eventEmitter = new EventEmitter();
		const emitter = _.#eventEmitter;
		emitter.on(event, listener, { defer: true });
		if (!_.#hasReachedLifecycle(event)) return;
		queueMicrotask(() => {
			if (_.#eventEmitter !== emitter || !_.#hasReachedLifecycle(event)) return;
			try {
				listener.call(emitter, {});
			} catch (error) {
				console.error(`tarot: listener error '${event}':`, error);
			}
		});
	}
	/**
	* unsubscribe from an event
	* @param {string} event
	* @param {Function} listener
	*/
	off(event, listener) {
		this.#eventEmitter?.off(event, listener);
	}
	/**
	* Resolve when the current or next connected instance reaches ready.
	* @returns {Promise<void>}
	*/
	whenReady() {
		if (this.#lifecycle === "ready") return Promise.resolve();
		return this.#readyPromise;
	}
	/**
	* Check whether a sticky lifecycle event has fired for this live instance.
	* @param {string} event
	* @returns {boolean}
	*/
	#hasReachedLifecycle(event) {
		return event === EVENTS.carousel.init && this.#lifecycle !== "idle" || event === EVENTS.carousel.ready && this.#lifecycle === "ready";
	}
	/** custom element disconnected lifecycle hook — defer teardown to distinguish DOM moves */
	disconnectedCallback() {
		const _ = this;
		const teardownVersion = ++_.#teardownVersion;
		queueMicrotask(() => {
			if (teardownVersion !== _.#teardownVersion || _.isConnected || _.#isTearingDown) return;
			_.#teardown();
		});
	}
	/** tear down a genuinely disconnected instance */
	#teardown() {
		const _ = this;
		if (_.#isTearingDown) return;
		_.#isTearingDown = true;
		_.#initialized = false;
		_.#connectionVersion++;
		try {
			_.#eventEmitter?.emitNow(EVENTS.carousel.destroy, {});
			_.#lifecycle = "idle";
			_.#rearmReady();
			if (_.#pluginRegisteredHandler) {
				window.removeEventListener("tarot:plugin-registered", _.#pluginRegisteredHandler);
				_.#pluginRegisteredHandler = null;
			}
			_.#initializedPluginKeys.clear();
			_.#pluginInstances.forEach((plugin) => plugin?.destroy?.());
			_.#pluginInstances.length = 0;
			_.#unbindCoreEvents();
			_.#frameEngine?.destroy();
			_.#layoutEngine?.destroy();
			_.#transitionManager?.destroy();
			_.#trackAnimator?.destroy();
			_.#dragHandler?.destroy();
			_.#effectManager?.destroy();
			_.#slideManager?.destroy();
			_.#windowEvents?.destroy();
			_.#optionsManager?.destroy();
			_.#frameEngine = null;
			_.#layoutEngine = null;
			_.#transitionManager = null;
			_.#trackAnimator = null;
			_.#dragHandler = null;
			_.#effectManager = null;
			_.#slideManager = null;
			_.#windowEvents = null;
			_.#optionsManager = null;
			_.removeAttribute("role");
			_.removeAttribute("aria-roledescription");
			if (_.#announcements?.parentNode) _.#announcements.parentNode.removeChild(_.#announcements);
			_.#announcements = null;
			_.#store?.destroy();
			_.#store = null;
			_.#eventEmitter?.destroy();
			_.#eventEmitter = null;
			_.#ctx = null;
		} finally {
			_.#teardownVersion++;
			_.#isTearingDown = false;
			if (_.isConnected) _.connectedCallback();
		}
	}
};
for (const effectClass of Object.values(Tarot.effects)) collectDefaultOptions(Tarot, effectClass);
//#endregion
//#region src/index.js
/**
* Register everything queued on a global before Tarot loaded, then replace that
* global with a push proxy so anything loading later registers immediately.
* @param {string} queueName - global queue name ('TarotEffectQueue' | 'TarotPluginQueue')
* @param {Function} register - registers one queued item
*/
function drainQueue(queueName, register) {
	if (typeof window === "undefined") return;
	const queued = window[queueName];
	if (Array.isArray(queued)) queued.forEach((item) => register(item));
	window[queueName] = { push: register };
}
drainQueue("TarotEffectQueue", (item) => {
	if (item && item.factory) Tarot.registerEffect(item.factory(TarotEffect));
	else if (typeof item === "function") Tarot.registerEffect(item);
});
drainQueue("TarotPluginQueue", (item) => {
	if (item && item.plugin) Tarot.registerPlugin(item.plugin);
	else if (typeof item === "function") Tarot.registerPlugin(item);
});
if (typeof customElements !== "undefined" && !customElements.get("tarot-carousel")) customElements.define("tarot-carousel", Tarot);
//#endregion
export { Tarot, Tarot as default, TarotEffect };

//# sourceMappingURL=tarot.esm.js.map