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

/**
 * EventEmitter - A simple event system that allows subscribing to and emitting events
 * @class
 */
class EventEmitter {
	/** @type {Map} - Private map of event names to arrays of listener functions */
	#events;

	/**
	 * Creates a new EventEmitter instance
	 */
	constructor() {
		this.#events = new Map();
	}

	/**
	 * Binds a listener to an event.
	 * @param {string} event - The event to bind the listener to.
	 * @param {Function} listener - The listener function to bind.
	 * @returns {EventEmitter} The current instance for chaining.
	 * @throws {TypeError} If the listener is not a function.
	 */
	on(event, listener) {
		if (typeof listener !== 'function') {
			throw new TypeError('Listener must be a function');
		}

		const listeners = this.#events.get(event) || [];
		if (!listeners.includes(listener)) {
			listeners.push(listener);
		}
		this.#events.set(event, listeners);

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

		const index = listeners.indexOf(listener);
		if (index !== -1) {
			listeners.splice(index, 1);
			if (listeners.length === 0) {
				this.#events.delete(event);
			} else {
				this.#events.set(event, listeners);
			}
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
		const listeners = this.#events.get(event);
		if (!listeners || listeners.length === 0) return false;

		for (let i = 0, n = listeners.length; i < n; ++i) {
			try {
				if (listeners[i] !== undefined) {
					listeners[i].apply(this, args);
				}
			} catch (error) {
				console.error(`Error in listener for event '${event}':`, error);
			}
		}

		return true;
	}

	destroy() {
		this.#events.clear();
	}
}

/**
 * Direction constants for tracking touch/drag movements
 * @enum {number}
 */
const DIRECTION = {
	UNKNOWN: 0,
	VERTICAL: -1,
	HORIZONTAL: 1,
};

/**
 * Handles all drag, touch, and scroll interactions with the carousel
 * @class DragHandler
 */
class DragHandler {
	/**
	 * Creates a new drag handler for the carousel
	 * @param {Object} ctx - The context object containing carousel references and services
	 */
	constructor(ctx) {
		const _ = this;
		/** @type {Object} - Reference to context object */
		_.ctx = ctx;

		/** @type {HTMLElement} - Element to bind touch/drag events to */
		_.track = ctx.track;

		/** @type {number} - Minimum pixels of movement required before a drag is recognized */
		_.dragThreshold = 3;

		// Apply CSS to prevent scroll inertia
		// _.track.style.overscrollBehaviorX = 'none';
		// _.track.style.scrollBehavior = 'auto';
		// Ensure touch-action is set to none to prevent any native scrolling
		// _.track.style.touchAction = 'none';

		/**
		 * @type {Object} - Object containing all drag state information
		 */
		_.drag = {
			/** @type {boolean} - Whether a drag is currently active */
			isDragging: false,
			/** @type {number} - Starting position of the drag */
			start: 0,
			/** @type {number} - Current position during drag */
			current: 0,
			/** @type {number} - Previous position during drag */
			prev: 0,
			/** @type {number} - Distance moved since drag started */
			delta: 0,
			/** @type {number} - Speed of movement */
			velocity: 0,
			/** @type {boolean} - Whether drag exceeds minimum threshold */
			dragThresholdMet: false,
			/** @type {number} - Accumulated delta from wheel events */
			scrollWheelDelta: 0,
			/** @type {boolean} - Whether wheel scrolling is active */
			scrollWheelActive: false,
		};

		/** @type {Function} - Debounced function to handle the end of scroll wheel events */
		_.debouncedScrollEnd = _.ctx.utils.debounce((e) => {
			_.drag.scrollWheelDelta = 0;
			_.handleScrollEnd(e);
		}, 80);

		/** @type {Object} - Bound event handlers for proper cleanup */
		_.handlers = {
			click: (e) => _.handleClick(e),
			pointerdown: (e) => _.handleDragStart(e),
			pointermove: (e) => _.handleDragMove(e),
			pointerup: (e) => _.handleDragEnd(e),
			pointerleave: (e) => _.handleDragEnd(e),
			pointercancel: (e) => _.handleDragEnd(e),
			touchstart: (e) => _.handleTouchStart(e),
			touchmove: (e) => _.handleTouchMove(e),
			dblclick: (e) => {
				e.preventDefault();
				e.stopPropagation();
				return false;
			},
			wheel: (e) => _.handleSidewaysScroll(e),
		};

		_.bindUI();
	}

	/**
	 * Initialize drag events on the carousel track element.
	 * Binds all necessary event listeners for different interaction methods.
	 */
	bindUI() {
		const _ = this;
		const track = _.track;

		track.addEventListener('click', _.handlers.click);
		track.addEventListener('pointerdown', _.handlers.pointerdown, {
			passive: false,
		});
		track.addEventListener('pointermove', _.handlers.pointermove, {
			passive: false,
		});
		track.addEventListener('pointerup', _.handlers.pointerup, {
			passive: false,
		});
		track.addEventListener('pointerleave', _.handlers.pointerleave, {
			passive: false,
		});
		track.addEventListener('pointercancel', _.handlers.pointercancel, {
			passive: false,
		});
		track.addEventListener('touchstart', _.handlers.touchstart, {
			passive: false,
		});
		track.addEventListener('touchmove', _.handlers.touchmove, {
			passive: false,
		});

		// Prevent double taps
		track.addEventListener('dblclick', _.handlers.dblclick);

		// Add sideways scrolling with two fingers
		// track.addEventListener('wheel', _.handlers.wheel, {
		// 	passive: false,
		// });
	}

	/**
	 * Handle sideways scroll events on the track.
	 * This allows for horizontal scrolling using a trackpad.
	 * @param {WheelEvent} e - The wheel event.
	 */
	handleSidewaysScroll(e) {
		const _ = this;
		// check if there is significant horizontal movement
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			e.preventDefault(); // prevent page scrolling

			const drag = _.drag;

			if (drag.delta === 0) {
				_.ctx.emitter.emit(_.ctx.events.drag.start, { event: e, drag });
			}

			// use the deltaX to move the carousel accordingly
			drag.delta += e.deltaX * -1;

			// let plugin know the movement
			_.ctx.emitter.emit(_.ctx.events.drag.move, { event: e, drag });

			_.debouncedScrollEnd(e);
		}
	}

	/**
	 * Handles the end of a scroll wheel event
	 * Notifies the carousel effect when scrolling has stopped
	 *
	 * @param {WheelEvent} e - The wheel event
	 */
	handleScrollEnd(e) {
		const _ = this;
		const drag = _.drag;

		// Tell plugin the drag has ended
		_.ctx.emitter.emit(_.ctx.events.drag.end, { event: e, drag });

		// Reset the delta
		drag.delta = 0;
	}

	/**
	 * Handle click events on the track.
	 * Prevents click if drag threshold was met.
	 * @param {Event} e - The click event.
	 */
	handleClick(e) {
		const _ = this;

		// user was dragging - not a click
		if (_.drag.dragThresholdMet) {
			e.preventDefault();
			return;
		}

		// emit click event
		const slide = e.target.closest('tarot-slide');
		if (slide) {
			const index = parseInt(slide.getAttribute('index')) || 0;
			const renderIndex = slide.renderIndex;
			_.ctx.emitter.emit(_.ctx.events.slides.click, {
				index,
				renderIndex,
				event: e,
			});
		}
	}

	/**
	 * Handle touch start events on the track.
	 * Disables dragging if more than one touch is detected.
	 * @param {TouchEvent} e - The touch start event.
	 */
	handleTouchStart(e) {
		const _ = this;

		// tell plugin user clicked on slide
		if (e.touches.length > 1) {
			_.drag.isDragging = false;
		}
	}

	/**
	 * Handle touch move events on the track.
	 * Determines the direction of touch movement and
	 * prevents vertical scrolling if horizontal movement is detected.
	 * @param {TouchEvent} e - The touch move event.
	 */
	handleTouchMove(e) {
		const _ = this;
		const drag = _.drag;

		// exit if a touchstart drag wasn't initiated
		if (!drag.isDragging) return;

		// exit if we have already determined we are
		// scrolling horizontally and not vertically
		if (drag.touchDirection === DIRECTION.HORIZONTAL) {
			// prevent scrolling on page
			e.preventDefault();
			return;
		}

		// calculate delta X and Y values from touchmove events
		const deltaX = Math.abs(drag.startX - e.touches[0].screenX);
		const deltaY = Math.abs(drag.startY - e.touches[0].screenY);

		// confirm we are scrolling horizontially
		if (deltaX * 1.15 > deltaY) {
			// prevent scrolling on page
			e.preventDefault();
			// save touch direction as horizontal
			drag.touchDirection = DIRECTION.HORIZONTAL;
			return;
		}

		// cancel drag because drag direction is vertical
		drag.isDragging = false;
		drag.touchDirection = DIRECTION.VERTICAL;
		drag.delta = 0;

		// tell plugin we are ending drag because direction is vertical
		_.ctx.emitter.emit(_.ctx.events.drag.end, { event: e, drag });
	}

	/**
	 * Handle drag start events on the track.
	 * Initializes drag data and notifies the plugin.
	 * @param {PointerEvent} e - The pointer down event.
	 */
	handleDragStart(e) {
		// we need this to properly capture drag events
		e.preventDefault();

		const _ = this;
		const drag = _.drag;

		drag.hasTouch = e.pointerType === 'touch';
		drag.touchDirection = DIRECTION.UNKNOWN;

		// save initial drag start values
		drag.isDragging = true;
		drag.dragThresholdMet = false;
		drag.startX = e.screenX;
		drag.startY = e.screenY;
		drag.velocity = 0;
		drag.delta = 0;

		// let plugin know drag start has begin
		_.ctx.emitter.emit(_.ctx.events.drag.start, { event: e, drag });
	}

	/**
	 * Handle drag move events on the track.
	 * Updates drag data and notifies the plugin if the drag threshold is met.
	 * @param {PointerEvent} e - The pointer move event.
	 */
	handleDragMove(e) {
		const _ = this;
		const drag = _.drag;

		// exit if we are not actively dragging
		if (!drag.isDragging) return;

		// check to see what direction we're going
		const deltaX = Math.abs(drag.startX - e.screenX);
		const deltaY = Math.abs(drag.startY - e.screenY);

		// direction still unknown but looks to be going horizontal
		if (drag.touchDirection === DIRECTION.UNKNOWN && deltaX * 1.15 > deltaY) {
			// we are going horizontal!!
			drag.touchDirection = DIRECTION.HORIZONTAL;
		}

		// exit if has touch and direction is vertical or undefined
		if (drag.hasTouch && drag.touchDirection != DIRECTION.HORIZONTAL) {
			// don't scroll and don't prevent default
			return;
		}

		// we are dragging horizontally so we must prevent scrolling on page
		e.preventDefault();

		// update drag event values with current event data
		drag.prev = drag.current;
		drag.current = e.screenX;
		drag.delta = drag.current - drag.startX;
		drag.velocity = drag.current - drag.prev;

		// check to see if drag threshold has been met
		if (!drag.dragThresholdMet && Math.abs(drag.delta) > _.dragThreshold) {
			drag.dragThresholdMet = true;
		}

		// exit and don't move if threshold hasn't been met yet
		if (!drag.dragThresholdMet) return;

		// tell plugin a drag move has occured
		_.ctx.emitter.emit(_.ctx.events.drag.move, { event: e, drag });
		return false;
	}

	/**
	 * Handle drag end events on the track.
	 * Finalizes drag data and notifies the plugin.
	 * @param {PointerEvent} e - The pointer up or pointer leave event.
	 */
	handleDragEnd(e) {
		const _ = this;
		const drag = _.drag;

		// exit if we are not actively dragging
		if (!drag.isDragging) return;

		// prevent scrolling on page
		e.preventDefault();

		// we are now done dragging
		drag.isDragging = false;

		// tell plugin the drag has ended
		_.ctx.emitter.emit(_.ctx.events.drag.end, { event: e, drag });

		// clear drag delta
		drag.delta = 0;
	}

	/**
	 * Clean up event listeners and cancel any pending operations
	 * Should be called when the carousel is destroyed to prevent memory leaks
	 */
	destroy() {
		const _ = this;
		const track = _.track;

		// Cancel debounced function
		if (_.debouncedScrollEnd) {
			_.debouncedScrollEnd.cancel();
		}

		// Remove all event listeners using stored handlers
		track.removeEventListener('click', _.handlers.click);
		track.removeEventListener('pointerdown', _.handlers.pointerdown);
		track.removeEventListener('pointermove', _.handlers.pointermove);
		track.removeEventListener('pointerup', _.handlers.pointerup);
		track.removeEventListener('pointerleave', _.handlers.pointerleave);
		track.removeEventListener('pointercancel', _.handlers.pointercancel);
		track.removeEventListener('touchstart', _.handlers.touchstart);
		track.removeEventListener('touchmove', _.handlers.touchmove);
		track.removeEventListener('dblclick', _.handlers.dblclick);
		track.removeEventListener('wheel', _.handlers.wheel);
	}
}

/**
 * manages the different display effects for the carousel
 */
class EffectManager {
	static defaultRules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: Infinity,
		loopBuffer: { left: 0, right: 0 },
	};

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

		// define all event handlers in one object
        _.handlers = {
            // handler for store's optionsChanged event
            optionsChanged: ({ currentOptions }) => {
                const currentEffectName =
                    _.#currentEffect?.constructor?.effectName || _.#currentEffect?.constructor?.name;

                // only load new effect if the name has changed
                if (currentOptions.effect !== currentEffectName) {
                    _.loadEffect(currentOptions.effect);
                }
            },
        };

		_.bindEvents();

		// listen for late effect registrations so we can swap automatically
		_.handlers.effectRegistered = (e) => {
			try {
				const registered = e?.detail?.effectName;
				const desired = String(_.#ctx.store.getOptions().effect || '').toLowerCase();
				if (registered && desired && registered === desired) {
					_.loadEffect(desired);
				}
			} catch (err) {
				// ignore
			}
		};
		if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
			window.addEventListener('tarot:effect-registered', _.handlers.effectRegistered);
		}
	}

	init() {
		// implementation as needed
	}

	// reinitialize on options changes
	reInit() {
		this.loadCurrentEffect();
	}

	// bind store events to handlers
	bindEvents() {
		this.#ctx.emitter.on(this.#ctx.events.store.optionsChanged, this.handlers.optionsChanged);
	}

	// load the current effect based on current options
	loadCurrentEffect() {
		const options = this.#ctx.store.getOptions();
		this.loadEffect(options.effect);
	}

	/**
	 * load a specific effect by name
	 * @param {string} effectName - name of the effect to load
	 */
	loadEffect(effectName) {
		const _ = this;
		if (!effectName) {
			console.error('Error: no effect detected or could not load effect ', effectName);
			return;
		}

		const NewEffectClass = _.#effectRegistry[effectName];

		if (!NewEffectClass) {
			console.warn(`Effect '${effectName}' not registered yet; falling back to 'carousel' until it loads`);
			// Fallback to carousel effect to prevent broken state
			if (effectName !== 'carousel') {
				this.loadEffect('carousel');
			}
			return;
		}

		// store reference to previous effect for event
		const previousEffect = _.#currentEffect;
		const previousEffectName =
			previousEffect?.constructor?.effectName || previousEffect?.constructor?.name;

		// clear out old effect
		if (_.#currentEffect) {
			_.#currentEffect.destroy();

			// emit destroyed event
			_.#ctx.emitter.emit(_.#ctx.events.effect.destroyed, {
				effectName: previousEffectName,
			});
		}

		// create new effect instance (pass ctx instead of carousel)
		_.#currentEffect = new NewEffectClass(_.#ctx);

		// set name in DOM
		_.#ctx.carousel.setAttribute('effect', effectName);

		// emit loaded event
		_.#ctx.emitter.emit(_.#ctx.events.effect.loaded, {
			effect: _.#currentEffect,
			effectName,
		});

		// emit changed event
		_.#ctx.emitter.emit(_.#ctx.events.effect.changed, {
			previousEffect,
			currentEffect: _.#currentEffect,
			effectName,
		});

		// tell effect to do initial render (if it has this method)
		if (_.#currentEffect.render) {
			_.#ctx.store.getState();
			// _.#currentEffect.render({ trackPosition: state.trackPosition });
		}
	}

	// returns the rules for the effect
	// returns default rule set if effect doesn't have rules
	getRules() {
		const _ = this;

		// if no effect, return default rule set
		if (!_.#currentEffect || !_.#currentEffect.rules) {
			return _.constructor.defaultRules;
		}

		// return effect rules
		return _.#currentEffect.rules;
	}

	/**
	 * get the current effect instance
	 * @returns {Object|null} current effect instance
	 */
	getEffect() {
		return this.#currentEffect;
	}

	/**
	 * get the current effect name
	 * @returns {string|null} current effect name
	 */
	getEffectName() {
		if (!this.#currentEffect) return null;
		return (
			this.#currentEffect.constructor?.effectName || this.#currentEffect.constructor?.name || null
		);
	}

	/**
	 * check if an effect is currently loaded
	 * @returns {boolean} true if effect is loaded
	 */
	hasEffect() {
		return this.#currentEffect !== null;
	}

	/**
	 * destroy the effect manager, unbinding all events
	 */
		destroy() {
		const _ = this;

		// unbind from global + store events
		if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && _.handlers?.effectRegistered) {
			window.removeEventListener('tarot:effect-registered', _.handlers.effectRegistered);
		}
		_.#ctx.emitter.off(_.#ctx.events.store.optionsChanged, _.handlers.optionsChanged);

		// destroy current effect if exists
		if (_.#currentEffect) {
			const effectName = _.getEffectName();
			_.#currentEffect.destroy();

			// emit destroyed event
			_.#ctx.emitter.emit(_.#ctx.events.effect.destroyed, {
				effectName,
			});

			_.#currentEffect = null;
		}
	}
}

// core/events.js

/*
event naming guide
------------------
- use kebab-case strings with a clear namespace: "namespace:event" or "namespace:sub-event"
- keep nouns on the left (subject) and verbs on the right, e.g. "slides:changed", "track:rest"
- prefer explicit phases when useful: "carousel:before-transition", "carousel:after-transition"
- payloads are plain objects; keys are stable and documented below

payload cheat sheet (subscribe payload shapes)
----------------------------------------------
Carousel
carousel:init                { }
carousel:ready               { }
carousel:reinit              { reason?:string }
carousel:destroy             { }
carousel:error               { message:string, error?:any }
carousel:before-transition   { currentIndex:number, nextIndex:number, kind:'slide'|'page'|'position' }
carousel:after-transition    { prevIndex:number, currentIndex:number, kind:'slide'|'page'|'position' }
carousel:has-focus           { }
carousel:lost-focus          { }

Store
options:changed              { prevOptions, currentOptions }
state:changed                { prevState, currentState }
render-index:changed         { prevIndex, currentIndex, velocity?, animate? }
selected-index:changed       { prevIndex, currentIndex }
page-index:changed           { prevPageIndex, currentPageIndex }
page-count:changed           { count }
layout:changed               { prevWidths, currentWidths }
slides:changed               { prevSlides, currentSlides }
transform-points:changed     { prevPoints, currentPoints }
store:changed-dirty          { }
store:changed-clean          { }

Drag
drag:start                   { x, y, pointerId? }
drag:move                    { x, y, pointerId? }
drag:end                     { x, y, velocityX?, velocityY?, pointerId? }
drag:cancel                  { reason? }

Frame / effect render
frame:before-render          { state, widths, slides, animation }
frame:after-render           { state, widths, slides, animation }

Slides
slide:click                  { index, renderIndex, event }
slides:visible-changed       { visibleRenderIndices:number[] }

Window
window:resize                { }
window:visibility-change     { hidden:boolean }
window:has-focus             { }
window:lost-focus            { }

Track
track:looped                 { } - for when track loops
track:request-frame          { time:number } - for animation frame continuation

Effect
effect:changed               { previousEffect?, currentEffect, effectName }
effect:loaded                { effect, effectName }
effect:destroyed             { effectName }

Animation
animation:requested          { index, velocity, type }
animation:started            { renderIndex, pageIndex, velocity, type }
animation:completed          { renderIndex, pageIndex, type }

Engine
engine:position-changed      { position, velocity, progress, delta }
engine:finished              { position, finalVelocity }

User
user:interacted              { via:'hover|'drag'|'click'|'wheel'|'key'|'focus', event }

Keyboard
keyboard:arrow               { direction:-1|1, event }
*/

const EVENTS = Object.freeze({
	// lifecycle (component-level)
	carousel: Object.freeze({
		init: 'carousel:init',
		ready: 'carousel:ready',
		reinit: 'carousel:reinit',
		destroy: 'carousel:destroy',
		error: 'carousel:error',
		beforeTransition: 'carousel:before-transition',
		afterTransition: 'carousel:after-transition',
		hasFocus: 'carousel:has-focus',
		lostFocus: 'carousel:lost-focus',
	}),

	// data store slices
	store: Object.freeze({
		optionsChanged: 'options:changed',
		stateChanged: 'state:changed',
		layoutChanged: 'layout:changed',
		slidesChanged: 'slides:changed',
		pageIndexChanged: 'page-index:changed',
		pageCountChanged: 'page-count:changed',
		selectedIndexChanged: 'selected-index:changed',
		renderIndexChanged: 'render-index:changed',
		transformPointsChanged: 'transform-points:changed',
		changedDirty: 'store:changed-dirty',
		changedClean: 'store:changed-clean',
	}),

	// user input (raw)
	drag: Object.freeze({
		start: 'drag:start',
		move: 'drag:move',
		end: 'drag:end',
		cancel: 'drag:cancel',
	}),

	// frame + effect pipeline
	frame: Object.freeze({
		beforeRender: 'frame:before-render',
		afterRender: 'frame:after-render',
	}),

	// slides (ui interactions)
	slides: Object.freeze({
		click: 'slides:click',
		visibleChanged: 'slides:visible-changed',
	}),

	// window (host environment)
	window: Object.freeze({
		resize: 'window:resize',
		orientationChange: 'window:orientation-change',
		visibilityChange: 'window:visibility-change',
		hasFocus: 'window:has-focus',
		lostFocus: 'window:lost-focus',
	}),

	// track / loop
	track: Object.freeze({
		looped: 'track:looped',
		shifted: 'track:shifted',
		requestFrame: 'track:request-frame',
		positionChanged: 'track:position-changed',
	}),

	// effect loading and changes
	effect: Object.freeze({
		changed: 'effect:changed',
		loaded: 'effect:loaded',
		destroyed: 'effect:destroyed',
	}),

	// animation lifecycle
	animation: Object.freeze({
		requested: 'animation:requested',
		started: 'animation:started',
		completed: 'animation:completed',
	}),

	// physics engine events
	engine: Object.freeze({
		positionChanged: 'engine:position-changed',
		finished: 'engine:finished',
	}),

	user: Object.freeze({
		interacted: 'user:interacted',
	}),

	keyboard: Object.freeze({
		arrow: 'keyboard:arrow',
	}),
});

/**
 * @class OptionsManager
 * Manages carousel options, responsive breakpoints, and merged settings.
 * - merges default options, user options, and a single active breakpoint (non-cumulative)
 * - reads options from a DOM element or programmatic updates
 * - writes merged options to the data store
 * - re-evaluates the current breakpoint on window resize/orientation change
 */
class OptionsManager {
	/**
	 * Creates a new OptionsManager instance
	 * @param {object} ctx - Shared module context (should contain .carousel, .viewport, .emitter, etc)
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;

		/**
		 * TODO: better implement rules from effects
		 *	ripple: min_slideWidth: 0,
		 * 	        max_slideWidth: 0,
		 *  fade:   min_slidesPerView: 1
		 *          max_slidesPerView: 1
		 *  butterfly: loopBuffer: { left: 2, right: 2 }
		 *
		 * */

		/** @type {object} - Default carousel options */
		_.defaultOptions = {
			/** @type {boolean|string} - Selector for carousel to sync navigation with */
			asNavFor: false,

			/** @type {object} - Physics-based animation settings */
			animation: {
				/** @type {number} - Spring attraction coefficient */
				attraction: 0.026,
				/** @type {number} - Friction coefficient for dampening */
				friction: 0.24,
				/** @type {number} - Base animation speed */
				speed: 5,
				/** @type {number} - Multiplier for initial velocity */
				velocityBoost: 1.1,
			},

			/** @type {object} - Autoplay settings */
			autoplay: {
				/** @type {number} - Time between slides in ms (0 = disabled) */
				interval: 0,
				/** @type {boolean} - Whether to stop autoplay after user interaction */
				stopAfterInteraction: true,
				/** @type {string} - What happens to autoplay after user interaction */
				afterInteraction: 'pause', // stop or pause
			},

			/** @type {object} - Responsive breakpoint settings: { [minWidth:number]: optionsObject } */
			breakpoints: {},

			/** @type {string} - Uses either "viewport" or "window" for breakpoints */
			breakpointElement: 'window',

			/** @type {boolean} - Visually center the selected slide */
			centerSelectedSlide: false,

			/** @type {number} - Minimum drag distance to trigger slide change */
			dragThreshold: 40,

			/** @type {string} - Class to filter which slides are included */
			filterClass: '',

			/** @type {boolean} - Whether clicking a slide selects it */
			focusOnSelect: false,

			/** @type {number} - Starting slide index */
			initialIndex: 0,

			/** @type {boolean} - Whether carousel should loop */
			loop: false,

			/** @type {string} - Display effect ('carousel', 'fade', etc) */
			effect: 'carousel',

			/** @type {number|string} - Gap between slides (px or CSS string) */
			gap: 0,

			/** @type {number|string} - Left padding (px or CSS string) */
			paddingLeft: 0,

			/** @type {number|string} - Right padding (px or CSS string)  */
			paddingRight: 0,

			/** @type {string} - Min width for slides */
			slideMinWidth: '50px',

			/** @type {number} - Slides visible at once */
			slidesPerView: 1,

			/** @type {number} - Slides to move on navigation */
			slidesPerMove: 1,

			/** @type {object} - Navigation controls settings */
			navigation: {
				/** @type {boolean} - Whether to show navigation buttons */
				showButtons: true,
				/** @type {boolean} - Whether to show previous button */
				showPrevButton: true,
				/** @type {boolean} - Whether to show next button */
				showNextButton: true,
				/** @type {boolean|string} - Custom selector for prev button */
				prevButtonSelector: false,
				/** @type {boolean|string} - Custom selector for next button */
				nextButtonSelector: false,
				/** @type {boolean} - Whether buttons should hide when navigation limit reached */
				smartButtons: false,
				/** @type {boolean} - Whether to show pagination */
				showPagination: true,
				/** @type {boolean|string} - Custom selector for pagination container */
				paginationSelector: false,
				// TODO: Scrollbar options commented out - not working yet
				// /** @type {boolean} - Whether to show scrollbar */
				// showScrollbar: false,
				// /** @type {boolean|string} - Custom selector for scrollbar container */
				// scrollbarSelector: false,
				// /** @type {string} - Scrollbar position ('top' | 'bottom') */
				// scrollbarPosition: 'bottom',
				// /** @type {string} - Scrollbar size ('small' | 'normal' | 'large') */
				// scrollbarSize: 'normal',
				// /** @type {boolean} - Auto hide scrollbar when only one page */
				// scrollbarAutoHide: false,
				// /** @type {boolean} - Show page indicator dots on scrollbar */
				// scrollbarShowSnapPoints: true,
				// /** @type {boolean} - Allow clicking track to navigate */
				// scrollbarClickToNavigate: true,
				// /** @type {boolean} - Allow dragging thumb to navigate */
				// scrollbarDragToNavigate: true,
			},

			/** @type {boolean} - Automatically go to selected slide */
			goToSelectedSlide: false,

			/** @type {boolean|string} - Selector for carousel to sync with */
			syncWith: false,

			/** @type {boolean} - Enable screen reader announcements for slide navigation */
			announcements: true,
		};

		/** @type {object} - User-provided options (pre-merge) */
		_.userOptions = {};

		/** @type {HTMLElement|null} - Element containing data-tarot-options JSON */
		_.userOptionsElement = _.ctx.carousel.querySelector(':scope > [data-tarot-options]');

		/** @type {{minWidth:number,options:object}} - Current active breakpoint */
		_.currentBreakpoint = { minWidth: 0, options: {} };

		/** @type {{minWidth:number,options:object}} - Previous active breakpoint */
		_.prevBreakpoint = { minWidth: 0, options: {} };

		/**
		 * debounced version of checkBreakpoints used only for noisy window events
		 * - we use trailing execution so multiple rapid events collapse into one
		 * - programmatic calls (reInit/setUserOptions) still run immediately
		 * @type {Function}
		 */
		_.checkBreakpointsDebounced = _.ctx.utils.debounce(() => _.checkBreakpoints(), 4);

		// event handlers bundle (debounced)
		_.handlers = {
			/** @type {Function} - Called on window resize; debounced to avoid duplicate work */
			onWindowResize: _.checkBreakpointsDebounced,
			/** @type {Function} - Called on orientation change; debounced to coalesce with resize */
			onOrientationChange: _.checkBreakpointsDebounced,
		};

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
		_.bindEvents();
		_.loadUserOptions();
		_.currentBreakpoint = _.getCurrentBreakpoint();
		_.applyMergedOptions();
	}

	/**
	 * Triggers a re-evaluation of breakpoints and updates merged options if needed
	 * - this is intentionally immediate (not debounced) for programmatic calls
	 */
	reInit() {
		const _ = this;
		_.checkBreakpoints();
	}

	/**
	 * Binds to relevant window events for breakpoints
	 */
	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.onWindowResize);
		_.ctx.emitter.on(_.ctx.events.window.orientationChange, _.handlers.onOrientationChange);
	}

	/**
	 * Cleans up event listeners and cancels any pending debounced breakpoint checks
	 */
	destroy() {
		const _ = this;
		_.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.onWindowResize);
		_.ctx.emitter.off(_.ctx.events.window.orientationChange, _.handlers.onOrientationChange);
		if (_.checkBreakpointsDebounced && typeof _.checkBreakpointsDebounced.cancel === 'function') {
			_.checkBreakpointsDebounced.cancel();
		}
	}

	/**
	 * Updates user options (programmatic API), merges, and checks breakpoints
	 * @param {object} newOptions - New user-supplied options
	 * @returns {OptionsManager}
	 */
	setUserOptions(newOptions = {}) {
		const _ = this;
		if (newOptions.slidesPerMove < 1) newOptions.slidesPerMove = 1;
		if (newOptions.slidesPerView < 1) newOptions.slidesPerView = 1;

		_.userOptions = _.ctx.utils.deepMerge(_.userOptions, newOptions);
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

		let txt = _.userOptionsElement.textContent || '';
		txt = txt.replace(/\n/g, '').trim();
		txt = txt.replace(/(\w+)\s*:/g, '"$1":');

		try {
			_.userOptions = JSON.parse(txt);
		} catch (err) {
			console.error('tarot options: failed to parse data-tarot-options json', err);
		}
	}

	/**
	 * Computes which breakpoint applies based on the current measured width
	 * @returns {{ minWidth:number, options:object }}
	 */
	getCurrentBreakpoint() {
		const _ = this;

		// isolate breakpoints and build a base (defaults + user) to know what to measure
		const { breakpoints = {}, ...userBase } = _.userOptions;
		const baseOptions = _.ctx.utils.deepMerge(_.defaultOptions, userBase);

		// get width of either the viewport element or the window
		let currentWidth;
		if (baseOptions.breakpointElement === 'viewport' && _.ctx.viewport) {
			currentWidth = _.ctx.viewport.offsetWidth;
		} else {
			currentWidth = window.innerWidth;
		}

		// no breakpoints defined → return empty descriptor
		if (!breakpoints || typeof breakpoints !== 'object') {
			return { minWidth: 0, options: {} };
		}

		// convert keys to numbers and sort ascending
		const breakpointWidths = Object.keys(breakpoints)
			.map(Number)
			.filter((n) => !Number.isNaN(n))
			.sort((a, b) => a - b);

		// pick the largest breakpoint ≤ currentWidth
		let matchingBreakpointWidth = 0;
		for (let i = 0; i < breakpointWidths.length; i++) {
			const breakpointWidth = breakpointWidths[i];

			if (currentWidth >= breakpointWidth) {
				matchingBreakpointWidth = breakpointWidth;
			} else {
				break;
			}
		}

		return {
			minWidth: matchingBreakpointWidth,
			options: breakpoints[matchingBreakpointWidth] || {},
		};
	}

	/**
	 * Checks if breakpoint has changed, applies merged options if so
	 */
	checkBreakpoints() {
		const _ = this;
		const active = _.getCurrentBreakpoint();
		if (active.minWidth === _.currentBreakpoint.minWidth) return;

		_.prevBreakpoint = _.currentBreakpoint;
		_.currentBreakpoint = active;
		_.applyMergedOptions();
	}

	/**
	 * Merges default, user, and active breakpoint options and writes to data store
	 */
	applyMergedOptions() {
		const _ = this;
		const { breakpoints: _unused, ...userBase } = _.userOptions;
		let merged = _.ctx.utils.deepMerge(_.defaultOptions, userBase);
		merged = _.ctx.utils.deepMerge(merged, _.currentBreakpoint.options || {});
		delete merged.breakpoints;

		if (merged.slidesPerMove < 1) merged.slidesPerMove = 1;
		if (merged.slidesPerView < 1) merged.slidesPerView = 1;

		_.ctx.store.setOptions(merged);
	}
}

/**
 * @class SlideManager
 * manages slides in a carousel including slide creation, selection, filtering, and dom updates
 */
class SlideManager {
	/**
	 * @constructor
	 * @param {Object} ctx - shared module context containing emitter, events, store, etc.
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.coreSlides = null;
		_.observer = null;

		// debounce the reload so it only happens once per microbatch
		_.debouncedSlideRefresh = _.ctx.utils.debounce(() => {
			_.reInit();
		}, 4);

        _.handlers = {
            selectedIndexChanged: ({ currentIndex }) => {
                _.renderSelectedIndex(currentIndex);
            },
        };

		_.bindEvents();
		_.init();
		_.observeDOMChanges();
	}

	init() {
		this.reInit();
	}

	reInit() {
		const _ = this;
		_.wrapSlides();
		_.coreSlides = _.ctx.track.querySelectorAll(':scope > tarot-slide');
		_.loadFilteredSlides(true);
		_.renderSelectedIndex(_.ctx.store.getState().selectedIndex);
	}

	bindEvents() {
		this.ctx.emitter.on(
			this.ctx.events.store.selectedIndexChanged,
			this.handlers.selectedIndexChanged
		);
	}

	/**
	 * ensures all carousel children are properly wrapped in tarot-slide elements
	 */
	wrapSlides() {
		const _ = this;
		const track = _.ctx.track;
		const childrenArray = Array.from(track.children);

		childrenArray.forEach((child) => {
			if (child.tagName.toLowerCase() !== 'tarot-slide') {
				const wrapper = document.createElement('tarot-slide');
				track.replaceChild(wrapper, child);
				wrapper.appendChild(child);
			}
		});
	}

	/**
	 * sets up a mutationobserver to watch for dom changes to slides
	 */
	observeDOMChanges() {
		const _ = this;

		_.observer = new MutationObserver((mutationsList) => {
			for (const mutation of mutationsList) {
				if (mutation.type === 'childList') {
					// trigger debounced refresh instead of instant reInit
					_.debouncedSlideRefresh();
					break;
				}
			}
		});

		_.observer.observe(_.ctx.track, {
			childList: true,
			subtree: false,
		});
	}

	resetSlideIndexes(slides) {
		for (let i = 0, n = slides.length; i < n; ++i) {
			slides[i].renderIndex = i;
			slides[i].index = i;
			slides[i].setAttribute('index', i);
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

		// Calculate slide positioning using sophisticated loop logic
		_.updateSlidePositions(animation.trackPosition, slides, widths, options);

		// Round to nearest half-pixel to eliminate floating-point precision issues
		function roundToHalfPixel(value) {
			return Math.round(value * 2) / 2;
		}

		// Update trackPosition and centerPoint properties for all slides
		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i]; // This is the actual <tarot-slide> DOM element

			// Calculate trackPosition: renderIndex * slideAndGap
			slide.trackPosition = roundToHalfPixel(slide.renderIndex * widths.slideAndGap);

			// Calculate centerPoint: trackPosition + (slide width / 2)
			slide.centerPoint = roundToHalfPixel(slide.trackPosition + widths.slide / 2);
		}
	}

	/**
	 * Update slide positions based on track position using sophisticated loop logic
	 * Moved from loop-manager.js to ensure sync between track position and slide positioning
	 */
	updateSlidePositions(trackPosition, slides, widths, options) {
		const _ = this;

		if (!_.ctx.utils.canLoop(slides.length, options)) {
			_.resetAllSlides(slides);
			return;
		}

		// Get viewport bounds
		const viewportWidth = widths.viewport;
		const slideWidth = widths.slide;
		const gapWidth = widths.gap;
		const slideAndGapWidth = slideWidth + gapWidth;

		// Convert track position to viewport bounds
		const viewportStart = -trackPosition;
		const viewportEnd = viewportStart + viewportWidth;

		// Find all slide positions visible in the viewport
		const visibleIndices = new Set();
		const firstIndex = Math.floor(viewportStart / slideAndGapWidth) - 2;
		const lastIndex = Math.ceil(viewportEnd / slideAndGapWidth) + 2;

		for (let i = firstIndex; i <= lastIndex; i++) {
			const slideStart = i * slideAndGapWidth;
			const slideEnd = slideStart + slideWidth;

			if (slideEnd > viewportStart && slideStart < viewportEnd) {
				visibleIndices.add(i);
			}
		}

		// Add effect buffers
		const effect = _.ctx.commands.getEffect();
		const loopBuffer = effect?.constructor?.rules?.loopBuffer || { left: 0, right: 0 };

		if (visibleIndices.size > 0) {
			const indices = Array.from(visibleIndices);
			const minIndex = Math.min(...indices);
			const maxIndex = Math.max(...indices);

			for (let i = 1; i <= loopBuffer.left; i++) {
				visibleIndices.add(minIndex - i);
			}
			for (let i = 1; i <= loopBuffer.right; i++) {
				visibleIndices.add(maxIndex + i);
			}
		}

		// Add remaining slides symmetrically
		const slideCount = slides.length;
		const usedSlides = new Set();
		for (const idx of visibleIndices) {
			const slideIndex = ((idx % slideCount) + slideCount) % slideCount;
			usedSlides.add(slideIndex);
		}

		if (usedSlides.size < slideCount) {
			const indices = Array.from(visibleIndices);
			if (indices.length > 0) {
				const minIndex = Math.min(...indices);
				const maxIndex = Math.max(...indices);
				const remaining = slideCount - usedSlides.size;
				const leftToAdd = Math.floor(remaining / 2);
				const rightToAdd = remaining - leftToAdd;

				for (let i = 1; i <= leftToAdd; i++) {
					visibleIndices.add(minIndex - i);
				}
				for (let i = 1; i <= rightToAdd; i++) {
					visibleIndices.add(maxIndex + i);
				}
			}
		}

		// Apply render indices
		const assignments = new Map();

		for (const logicalIndex of visibleIndices) {
			const slideIndex = ((logicalIndex % slideCount) + slideCount) % slideCount;
			assignments.set(slides[slideIndex], logicalIndex);
		}

		// Update slide render indices
		for (const slide of slides) {
			const targetIndex = assignments.get(slide);
			if (targetIndex !== undefined) {
				slide.renderIndex = targetIndex;
			}
		}
	}


	/**
	 * Reset all slides to their natural indices (no looping)
	 */
	resetAllSlides(slides) {
		for (let i = 0; i < slides.length; i++) {
			slides[i].renderIndex = i;
		}
	}

	loadFilteredSlides(isInitialLoad = false) {
		const _ = this;
		const filterClass = _.ctx.store.getOptions().filterClass;
		const coreSlides = _.coreSlides;
		const track = _.ctx.track;

		_.resetSlideIndexes(coreSlides);

		// if no filter class, ensure all slides are in DOM and use them all
		if (!filterClass) {
			// restore all slides to DOM if they were filtered before
			track.innerHTML = '';
			coreSlides.forEach((slide) => track.appendChild(slide));
			_.ctx.store.setSlides(Array.from(coreSlides));
			return;
		}

		// filter slides: keep matching ones in DOM, remove others
		const filteredSlides = [];
		track.innerHTML = '';

		coreSlides.forEach((slide) => {
			if (slide.classList.contains(filterClass)) {
				track.appendChild(slide); // add to DOM
				filteredSlides.push(slide); // add to filtered array
			}
			// non-matching slides stay in memory (coreSlides) but not in DOM
		});

		_.ctx.store.setSlides(filteredSlides);
	}

	addSlide(element, index) {
		const _ = this;
		const track = _.ctx.track;

		let newSlide;
		if (typeof element === 'string') {
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = `<tarot-slide>${element.trim()}</tarot-slide>`;
			newSlide = tempDiv.firstChild;
		} else {
			const wrapper = document.createElement('tarot-slide');
			wrapper.appendChild(element);
			newSlide = wrapper;
		}

		const slides = Array.from(_.ctx.store.getSlides());
		if (typeof index === 'number' && index >= 0 && index < slides.length) {
			track.insertBefore(newSlide, slides[index]);
		} else {
			track.appendChild(newSlide);
		}

		_.loadFilteredSlides();
	}

	removeSlide(index) {
		const _ = this;
		const track = _.ctx.track;
		const slides = Array.from(_.coreSlides);

		if (index < 0 || index >= slides.length) return;

		track.removeChild(slides[index]);
		_.loadFilteredSlides();
	}

	renderSelectedIndex(newIndex) {
		const _ = this;
		const slides = _.ctx.store.getSlides();

		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i];
			slide.selected = slide.index === newIndex;
		}
	}

	destroy() {
		const _ = this;

		_.ctx.emitter.off(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);

		if (_.observer) {
			_.observer.disconnect();
			_.observer = null;
		}

		// cancel debounced function if it has a cancel method
		if (_.debouncedSlideRefresh && typeof _.debouncedSlideRefresh.cancel === 'function') {
			_.debouncedSlideRefresh.cancel();
		}
		_.debouncedSlideRefresh = null;
		_.coreSlides = null;
	}
}

class PhysicsEngine {
	#attraction;
	#friction;
	#frictionFactor;
	#velocity;
	#currentValue;
	#targetValue;
	#startValue;
	#isAnimating;
	#prevTime;
	#eventEmitter;
	#accumulatedTime;
	#animationId;

	/**
	 * creates an instance of physicsengine.
	 * @param {number} [attraction=0.026] - the attraction value for physics-based animation (0 < attraction < 1).
	 * @param {number} [friction=0.28] - the friction value for physics-based animation (0 < friction < 1).
	 */
	constructor({ attraction = 0.026, friction = 0.28 } = {}) {
		const _ = this;
		_.#validateAttraction(attraction);
		_.#validateFriction(friction);

		_.#attraction = attraction;
		_.#friction = friction;
		_.#frictionFactor = 1 - friction;

		_.#velocity = 0;
		_.#currentValue = 0;
		_.#targetValue = 0;
		_.#startValue = 0;

		_.#isAnimating = false;
		_.#prevTime = null;
		_.#animationId = 0; // start at zero

		_.#eventEmitter = new EventEmitter();
	}

	/**
	 * animates from a start value to an end value.
	 * @param {number} startValue - the starting value.
	 * @param {number} endValue - the target value.
	 * @param {number} initialVelocity - the initial velocity.
	 */
	animateTo(startValue, endValue, initialVelocity) {
		const _ = this;

		// if something is already animating, stop it first
		if (_.#isAnimating) {
			_.stop();
		}

		if (isNaN(endValue)) {
			console.log('end value is not a number');
			return;
		}

		// increment #animationId to mark this as our "active" animation
		++_.#animationId;

		// apply a velocity boost
		initialVelocity *= 1.4;

		_.#startValue = startValue;
		_.#currentValue = startValue;
		_.#targetValue = endValue;
		_.#velocity = initialVelocity;
		_.#isAnimating = true;
		_.#prevTime = null;

		// emit initial position to trigger first frame
		_.#eventEmitter.emit('engine:position-changed', {
			position: _.#currentValue,
			positionDelta: 0,
			progress: 0,
			velocity: _.#velocity,
		});
	}

	/**
	 * Advances the physics simulation by one frame.
	 * Called externally by the frame engine to sync with main render loop.
	 * @param {number} time - the timestamp from the frame engine
	 */
	tick(time) {
		const _ = this;

		// exit if not animating
		if (!_.#isAnimating) {
			return;
		}

		// figure out how much time has passed
		// min timeDelta value is 8.33 becaues that's 120hz displays
		const timeDelta = _.#prevTime == null ? 8.33 : time - _.#prevTime;

		// save current time to prevTime
		_.#prevTime = time;

		const totalDistance = _.#targetValue - _.#startValue;
		const totalDistanceAbs = Math.max(Math.abs(totalDistance) - 230, 1);

		// figure out ratio based on total distance (the user wants 300px reference)
		let ratio = totalDistanceAbs / 200;
		// clamp within range
		ratio = Math.max(0.8, Math.min(ratio, 1.3));

		// compute the actual time factor
		const timeDeltaFactor = timeDelta / (13 * ratio);

		// calculate force based on distance to target and attraction
		const displacement = _.#targetValue - _.#currentValue;
		const force = displacement * _.#attraction;

		// apply force to velocity
		_.#velocity += force * timeDeltaFactor;
		// apply friction based on time between frames
		_.#velocity *= Math.pow(_.#frictionFactor, timeDeltaFactor);

		// calculate amount for this move
		const posDelta = _.#velocity * timeDeltaFactor;
		// apply move to current value
		_.#currentValue += posDelta;

		// figue our total distance covered
		const distanceCovered = _.#currentValue - _.#startValue;
		// progress percent
		let progress = totalDistance !== 0 ? distanceCovered / totalDistance : 0;

		// check if we've arrived at target
		if (Math.abs(posDelta) < 0.01 && Math.abs(_.#currentValue - _.#targetValue) < 0.1) {
			_.#isAnimating = false;
			// set current value to target
			_.#currentValue = _.#targetValue;
			// emit last change event with final values
			_.#eventEmitter.emit('engine:position-changed', {
				position: _.#currentValue,
				positionDelta: 0,
				progress: 1,
				velocity: 0,
			});
			// emit animation finished event
			_.#eventEmitter.emit('engine:finished');
			return;
		}

		// otherwise emit a position change event
		_.#eventEmitter.emit('engine:position-changed', {
			position: _.#currentValue,
			positionDelta: posDelta,
			progress,
			velocity: _.#velocity,
		});
	}

	/**
	 * stops the ongoing animation immediately.
	 */
	stop() {
		this.#isAnimating = false;
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
	}

	/**
	 * sets the friction value
	 * @param {number} friction - must be a number between 0 and 1 (exclusive).
	 */
	setFriction(friction) {
		this.#validateFriction(friction);
		this.#friction = friction;
		this.#frictionFactor = 1 - friction;
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
		if (typeof attraction !== 'number' || attraction <= 0 || attraction >= 1) {
			throw new Error('Attraction must be a number between 0 and 1 (exclusive).');
		}
	}

	#validateFriction(friction) {
		if (typeof friction !== 'number' || friction <= 0 || friction >= 1) {
			throw new Error('Friction must be a number between 0 and 1 (exclusive).');
		}
	}

	destroy() {
		// stop any ongoing animation
		this.stop();

		this.#eventEmitter.destroy();
		// clear event emitter reference
		this.#eventEmitter = null;
	}
}

// Manages track animations using physics-based motion
class TrackAnimator {
	#currentPos = 0;
	#dragStartPos = 0;
	#minVelocity = 0;
	#targetPos = 0;
	#animationType = '';
	#direction = 0;

	/**
	 * @param {Object} ctx - The context object containing carousel references and services
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;

		// get initial animation options from store
		const options = _.ctx.store.getOptions();

		// load new physics engine with attraction and friction options
		_.engine = new PhysicsEngine({
			attraction: options.animation.attraction,
			friction: options.animation.friction,
		});

		_.#dragStartPos = 1;

		// Define event handlers to enable proper cleanup
        _.handlers = {
            optionsChanged: ({ currentOptions }) => {
                _.engine.setAttraction(currentOptions.animation?.attraction || 0.1);
                _.engine.setFriction(currentOptions.animation?.friction || 0.8);
            },
			dragStart: ({ event, drag }) => {
				_.stop();
				_.#dragStartPos = _.#currentPos;
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'drag', event });
			},
			dragMove: ({ event, drag }) => {
				_.setPos(_.#dragStartPos + drag.delta, 1, null, 'drag', 0); // direction = 0 for drag
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'drag', event });
			},
			dragEnd: ({ event, drag }) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'drag', event });

				if (Math.abs(drag.delta) < _.ctx.store.getOptions().dragThreshold) {
					_.ctx.commands.getTrackManager().settleTrack();
					return;
				}

				// trigger prev or next movement
				if (drag.delta < 0) {
					_.ctx.commands.next(drag.velocity);
				} else {
					_.ctx.commands.prev(drag.velocity);
				}
			},
			enginePositionChanged: ({ position, positionDelta, progress, velocity }) => {
				if (progress === 1) {
					// we have reached the end
					_.setPos(_.#targetPos, progress, velocity, _.#animationType, _.#direction);
				} else {
					// add delta to current position
					_.setPos(_.#currentPos + positionDelta, progress, velocity, _.#animationType, _.#direction);
				}
			},
			engineAnimationFinished: () => {
				// relay finished event to context emitter
				_.ctx.emitter.emit('animationFinished', _.#targetPos);
			},
			trackRequestFrame: ({ time }) => {
				// tick the physics engine when frame engine requests it
				_.engine.tick(time);
			},
		};

		_.bindEvents();
	}

	init() {}

	reInit() {}

	bindEvents() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// Bind context events using handlers object for proper cleanup
		emitter.on(events.store.optionsChanged, _.handlers.optionsChanged);
		emitter.on(events.drag.start, _.handlers.dragStart);
		emitter.on(events.drag.move, _.handlers.dragMove);
		emitter.on(events.drag.end, _.handlers.dragEnd);
		emitter.on(events.track.requestFrame, _.handlers.trackRequestFrame);

		// Bind physics engine events
		_.engine.on('engine:position-changed', _.handlers.enginePositionChanged);
		_.engine.on('engine:finished', _.handlers.engineAnimationFinished);
	}

	// @returns {number} - The current X position.
	get currentPos() {
		return this.#currentPos;
	}

	getIsAnimating() {
		return this.engine.isAnimating();
	}

	/**
	 * Check if we can loop based on options and slide count
	 * @returns {boolean} - true if looping is possible
	 */
	canLoop() {
		const _ = this;
		const options = _.ctx.store.getOptions();
		const slideCount = _.ctx.store.getSlides().length;
		return _.ctx.utils.canLoop(slideCount, options);
	}

	stop() {
		this.engine.stop();
	}

	animateToPosition(targetPos, velocity, animationType, direction = 0) {
		const _ = this;

		_.stop();

		// save animation type and direction for later
		_.#animationType = animationType;
		_.#direction = direction;

		if (animationType === 'jump') {
			this.setPos(targetPos, 1, 0, 'jump', direction);
			return;
		}

		// don't animate if we're already going to that position
		if (_.engine.isAnimating() && _.#targetPos == targetPos) {
			return;
		}

		// calculate min velocity
		if (!velocity) {
			if (targetPos < _.#currentPos) {
				velocity = _.#minVelocity * -1;
			} else {
				velocity = _.#minVelocity;
			}
		}

		// save target position
		_.#targetPos = targetPos;

		// tell engine to go to target with velocity
		_.engine.animateTo(_.#currentPos, targetPos, velocity);
	}

	// type = 'animate', 'jump', settle
	setPos(newPosition, progress, velocity = 0, animationType, direction = null) {
		const _ = this;
		let trackDelta = newPosition - _.#currentPos;
		_.#currentPos;

		// final delta is 0
		if (animationType !== 'drag' && progress == 1) {
			trackDelta = 0;
		}

		// save new position
		_.#currentPos = newPosition;

		// check for automatic loop shifting (only if loop is enabled and not during a shift)
		if (_.canLoop()) {
			const widths = _.ctx.store.getWidths();
			const trackWidth = widths.track;

			if (_.#currentPos > 0) {
				// track has moved too far right, shift forwards (left)
				_.shiftTrack('forwards');
			} else if (_.#currentPos <= -trackWidth) {
				// track has moved too far left, shift backwards (right)
				_.shiftTrack('backwards');
			}
		}

		// update track position in animation data
		_.ctx.store.setAnimation({
			type: animationType,
			trackPosition: newPosition,
			trackDelta,
			velocity,
			progress,
			isAnimating: _.engine.isAnimating(),
			direction: direction !== null ? direction : _.#direction,
		});
	}

	// direction = 'forwards' (shift left) or 'backwards' (shift right), or numeric value
	shiftTrack(direction = 1) {
		const _ = this;
		const widths = _.ctx.store.getWidths();
		const trackWidth = widths.track;

		// convert string directions to numeric values
		let value;
		if (direction === 'forwards') {
			value = -1; // shift left (towards negative)
		} else if (direction === 'backwards') {
			value = 1; // shift right (towards positive)
		} else {
			value = direction; // assume numeric value
		}

		// shift track by full length
		_.#currentPos += trackWidth * value;
		_.#dragStartPos += trackWidth * value;
		_.#targetPos += trackWidth * value;

		// emit track shift event
		_.ctx.emitter.emit(_.ctx.events.track.shifted, {
			trackPosition: _.#currentPos,
			animationType: 'shift',
		});
	}

	destroy() {
		const _ = this;

		// clean up physics engine and its events
		if (_.engine) {
			_.engine.off('engine:position-changed', _.handlers.enginePositionChanged);
			_.engine.off('engine:finished', _.handlers.engineAnimationFinished);
			_.engine.stop();
			_.engine = null;
		}

		// remove context event listeners using specific handler references
		if (_.ctx) {
			const { emitter, events } = _.ctx;
			emitter.off(events.store.optionsChanged, _.handlers.optionsChanged);
			emitter.off(events.drag.start, _.handlers.dragStart);
			emitter.off(events.drag.move, _.handlers.dragMove);
			emitter.off(events.drag.end, _.handlers.dragEnd);
			emitter.off(events.track.requestFrame, _.handlers.trackRequestFrame);
		}

		// clear handlers reference
		_.handlers = null;
	}
}

/**
 * Manages track animator state
 * Converts slide indexes to track positions
 * Tells animator to animate or jump to new position
 * Relays and emits events back to the carousel
 *
 **/
class TrackManager {
	constructor(ctx, animator) {
		const _ = this;

		_.ctx = ctx;
		_.animator = animator;

		_.handlers = {
			animationRequested: (payload) => {
				const { index, trackPosition, velocity, type } = payload;
				if (trackPosition !== undefined) {
					// Direct track position request (continuous positioning)
					this.animateToTrackPosition(trackPosition, velocity, type);
				} else if (index !== undefined) {
					// Slide index request (discrete positioning)
					this.animateToSlide(index, velocity, type);
				}
			},
		};

		_.bindEvents();
	}

	init() {}

	reInit() {}

	bindEvents() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// Listen for animation requests from the main carousel
		emitter.on(events.animation.requested, _.handlers.animationRequested);
	}

	// settling track happens when the track has moved
	// but the dragThreshold hasn't been reached
	// this can be used in the effect render for certain animations
	settleTrack() {
		const renderIndex = this.ctx.store.getState().renderIndex;
		this.animateToSlide(renderIndex, 0, 'settle');
	}

	// calculates position on track and tells animator to go
	animateToSlide(slideIndex, velocity, animationType) {
		// Convert slide index to track position and delegate to animateToTrackPosition
		const trackPosition = this.getTrackPosForIndex(slideIndex);
		this.animateToTrackPosition(trackPosition, velocity, animationType);
	}

	// Direct track position animation for continuous positioning
	animateToTrackPosition(trackPosition, velocity, animationType) {
		const _ = this;
		const currentPos = _.animator.currentPos;
		let newPos = trackPosition; // Direct position, no conversion needed
		const trackWidth = _.ctx.store.getWidths().track;

		// Handle jump animation immediately
		if (animationType === 'jump') {
			_.animator.animateToPosition(newPos, 0, 'jump', 0); // direction = 0 for jump
			return;
		}

		// Apply same looping logic as animateToSlide for consistency
		if (_.ctx.store.getOptions().loop) {
			const posDelta = Math.abs(currentPos - newPos);

			// If move distance equals half track width, use velocity to decide direction
			if (posDelta === trackWidth / 2) {
				if (velocity && velocity != 0) {
					if (velocity < 0) {
						// Negative velocity: go next
						if (newPos > currentPos) {
							newPos -= trackWidth;
						}
					} else {
						// Positive velocity: go previous
						if (newPos <= currentPos) {
							newPos += trackWidth;
						}
					}
				} else if (newPos > currentPos) {
					// No velocity control: go forward
					newPos -= trackWidth;
				}
			} else if (posDelta > trackWidth / 2) {
				// Take shortest path for long distances
				if (newPos >= currentPos) {
					newPos -= trackWidth;
				} else {
					newPos += trackWidth;
				}
			}
		}

		// Apply velocity logic if none provided
		if (velocity === undefined) {
			velocity = newPos < currentPos ? -15 : 15;
		} else {
			// Give provided velocity a boost
			velocity *= 1.2;
			// Minimum velocity threshold
			if (Math.abs(velocity) < 15) velocity *= 1.3;
		}

		// Calculate direction: -1 for left, 1 for right, 0 for no movement
		let direction = 0;
		if (newPos < currentPos) {
			direction = -1; // moving left
		} else if (newPos > currentPos) {
			direction = 1; // moving right
		}

		// Trigger animation
		_.animator.animateToPosition(newPos, velocity, animationType, direction);
	}

	// new jumpToSlide function that calls animator.jumpToPosition
	// jumpToSlide(slideIndex, animationType) {
	// 	this.animator.jumpToPosition(this.getTrackPosForIndex(slideIndex), animationType);
	// }

	/**
	 * calculates the track position for a given slide index
	 * @param {number} slideIndex - the index of the slide
	 * @returns {number} the position on the track (negative for transform)
	 */
	getTrackPosForIndex(slideIndex) {
		const _ = this;
		const options = _.ctx.store.getOptions();
		const widths = _.ctx.store.getWidths();

		// we're including the left and right padding in these calculations
		let pos = slideIndex * (widths.slide + widths.gap);
		const minPos = 0 - widths.paddingLeft;
		const maxPos = widths.track - widths.viewport - widths.gap + widths.paddingRight - 0.1;

		// are we centering selected slides?
		if (pos != minPos && pos != maxPos && options.centerSelectedSlide) {
			// center selected slide
			pos -= widths.viewport / 2;
			pos += widths.slide / 2;
		} else {
			// account for left padding
			pos -= widths.paddingLeft;
		}

		// keep left side in viewport range
		// notice we ignore leftPadding and gapWidth here
		if (!options.loop && pos < 0) {
			pos = minPos;
		}

		// keep right side in viewport range
		// notice we ignore rightPadding here
		// clamp if we are not looping
		if (!options.loop && pos > maxPos) {
			pos = maxPos;
		}

		// transforms are negative
		if (pos !== 0) pos *= -1;

		return pos;
	}

	/**
	 * destroy the track manager and clean up event listeners
	 */
	destroy() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// Clean up event listeners
		emitter.off(events.animation.requested, _.handlers.animationRequested);
	}
}

/**
 * handles window and viewport events for the carousel
 */
class WindowEvents {
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

		// save ctx and frequently used refs
		_.ctx = ctx;
		_.carousel = ctx.carousel;
		_.viewport = ctx.viewport;

		// helper: check if an event originated inside the carousel
		_.isInsideCarousel = (e) => {
			const path = e?.composedPath?.() || [];
			if (path.length) return path.includes(_.carousel);
			return _.carousel.contains(e?.target);
		};

		// define all event handlers in one object
		_.handlers = {
			// emit a canonical window:resize
			handleResize: (event) => {
				_.ctx.emitter.emit(_.ctx.events.window.resize, { event });
			},

			// focus carousel on click for keyboard navigation
			handleCarouselClick: (event) => {
				// only focus if clicking on the carousel itself or viewport/track, not interactive elements
				const isInteractive = event.target.matches('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
				if (!isInteractive) {
					_.carousel.focus({ preventScroll: true });
				}
			},

			// window focus/blur
			handleWindowFocus: (event) => {
				_.ctx.emitter.emit(_.ctx.events.window.hasFocus, {});
			},
			handleWindowBlur: (event) => {
				_.ctx.emitter.emit(_.ctx.events.window.lostFocus, {});
			},

			// carousel focus/blur (component-level)
			handleCarouselFocus: (event) => {
				// notify plugins/features about focus entering the carousel
				_.ctx.emitter.emit(_.ctx.events.carousel.hasFocus, {});
				// treat entering focus as user interaction (pause autoplay etc.)
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'focus', event });
			},
			handleCarouselBlur: (event) => {
				_.ctx.emitter.emit(_.ctx.events.carousel.lostFocus, {});
			},

			// visibility change
			handleVisibilityChange: () => {
				_.ctx.emitter.emit(_.ctx.events.window.visibilityChange, { hidden: document.hidden });
			},

			// user inputs that imply interaction (for autoplay pause)
			handleKeyDown: (event) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'key', event });
				
				// core arrow key support only when carousel itself has focus
				// plugins handle their own keyboard events and call stopPropagation()
				if (['ArrowLeft', 'ArrowRight'].includes(event.key) && event.target === _.carousel) {
					event.preventDefault();
					const direction = event.key === 'ArrowLeft' ? -1 : 1;
					_.ctx.emitter.emit(_.ctx.events.keyboard.arrow, { direction, event });
				}
			},
			handleWheel: (event) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'wheel', event });
			},

			// unified debounced handler for resize and orientation change
			unifiedResizeHandler: _.ctx.utils.debounce((event) => {
				_.handlers.handleResize(event);
			}, 4),
		};

		// create a resize observer for the viewport element (in case its size changes independently)
		_.viewportObserver = new ResizeObserver((entries) => {
			// trigger unified handler
			_.handlers.unifiedResizeHandler(entries?.[0]);
		});

		_.init();
	}

	/**
	 * initializes focus events, window resize events, and viewport observer
	 */
	init() {
		const _ = this;

		// window resize and orientation change: both use the unified handler
		window.addEventListener('resize', _.handlers.unifiedResizeHandler);
		window.addEventListener('orientationchange', _.handlers.unifiedResizeHandler);

		// focus and blur events for window and carousel
		window.addEventListener('focus', _.handlers.handleWindowFocus);
		window.addEventListener('blur', _.handlers.handleWindowBlur);
		_.carousel.addEventListener('focus', _.handlers.handleCarouselFocus, true);
		_.carousel.addEventListener('blur', _.handlers.handleCarouselBlur, true);

		// visibility change
		document.addEventListener('visibilitychange', _.handlers.handleVisibilityChange);

		// user inputs that imply interaction (for autoplay pause)
		_.carousel.addEventListener('keydown', _.handlers.handleKeyDown, true);
		_.carousel.addEventListener('wheel', _.handlers.handleWheel, { passive: true });
		_.carousel.addEventListener('click', _.handlers.handleCarouselClick, true);

		// start observing the viewport for size changes
		if (_.viewport) {
			_.viewportObserver.observe(_.viewport);
		}
	}

	/**
	 * cleans up events and observers
	 */
	destroy() {
		const _ = this;

		// remove window resize and orientation change
		window.removeEventListener('resize', _.handlers.unifiedResizeHandler);
		window.removeEventListener('orientationchange', _.handlers.unifiedResizeHandler);

		// remove focus/blur events for window
		window.removeEventListener('focus', _.handlers.handleWindowFocus);
		window.removeEventListener('blur', _.handlers.handleWindowBlur);

		// remove focus/blur events for carousel
		_.carousel.removeEventListener('focus', _.handlers.handleCarouselFocus, true);
		_.carousel.removeEventListener('blur', _.handlers.handleCarouselBlur, true);

		// remove visibility change
		document.removeEventListener('visibilitychange', _.handlers.handleVisibilityChange);

		// remove user input listeners
		_.carousel.removeEventListener('keydown', _.handlers.handleKeyDown, true);
		_.carousel.removeEventListener('wheel', _.handlers.handleWheel, { passive: true });
		_.carousel.removeEventListener('click', _.handlers.handleCarouselClick, true);

		// disconnect the viewport observer
		if (_.viewportObserver) {
			_.viewportObserver.disconnect();
			_.viewportObserver = null;
		}
	}
}

/**
 * slide-state-manager
 * manages slide DOM state including classes, CSS custom properties, and ARIA attributes
 * - called directly by frame-engine at the end of the render pipeline
 * - updates slide visibility classes, selection state, and animation CSS variables
 * - handles accessibility attributes and keyboard navigation state
 * - coordinates slide state based on viewport position and carousel interactions
 */
class SlideStateManager {
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

		// bind event handlers for announcement system
		_.handlers = {
			renderIndexChanged: ({ currentIndex }) => {
				_.handleSlideNavigation(currentIndex);
			},
		};

		// listen for slide navigation events (renderIndex changes during normal navigation)
		_.ctx.emitter.on(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
	}

	/**
	 * updates visibility classes and aria attributes for all slides
	 * @param {number|null} [trackPosition=null] - optional track position override
	 */
	updateSlides(trackPosition = null) {
		const _ = this;

		// read current track position from the store if not provided
		if (trackPosition === null) {
			trackPosition = _.ctx.store.getAnimation().trackPosition || 0;
		}

		// update selection state on ALL slides (not just visible ones)
		_.updateAllSlidesSelection();

		// collect the current set of slide elements using ctx data store
		const slideInfos = _.ctx.utils.getSlidesInViewport(_.ctx, trackPosition);
		for (const info of slideInfos) {
			_.updateSlideState(info);
		}

		// emit a convenience event announcing which render indices are visible (optional)
		// if your getSlidesInViewport returns indices, map them here
		// _.ctx.emitter.emit(_.ctx.events.slides.visibleChanged, { visibleRenderIndices });
	}

	/**
	 * updates selection state (tarot-selected class) on all slides
	 */
	updateAllSlidesSelection() {
		const _ = this;
		const allSlides = _.ctx.store.getSlides();

		for (const slide of allSlides) {
			if (slide.selected) {
				slide.classList.add('tarot-selected');
			} else {
				slide.classList.remove('tarot-selected');
			}
		}
	}

	/**
	 * updates a single slide's visibility classes and aria attributes
	 * @param {{ slide:HTMLElement, isVisible:boolean, isFullyVisible:boolean, visibilityPercent:number, leftVisibility:number, rightVisibility:number, parallax:number, parallaxVisibility:number }} slideInfo
	 */
	updateSlideState(slideInfo) {
		const _ = this;
		const {
			slide,
			isVisible,
			isFullyVisible,
			visibilityPercent,
			leftVisibility,
			rightVisibility,
			parallax,
			parallaxVisibility,
		} = slideInfo;

		// set visibility percentages as CSS custom properties for animations
		slide.style.setProperty('--tarot-visibility', visibilityPercent.toFixed(3));
		slide.style.setProperty('--tarot-left-visibility', leftVisibility.toFixed(3));
		slide.style.setProperty('--tarot-right-visibility', rightVisibility.toFixed(3));
		slide.style.setProperty('--tarot-parallax', parallax.toFixed(3));
		slide.style.setProperty('--tarot-parallax-visibility', parallaxVisibility.toFixed(3));

		// remove all visibility classes first
		slide.classList.remove('tarot-hidden', 'tarot-visible', 'tarot-fully-visible');

		// add appropriate visibility class
		if (!isVisible) {
			slide.classList.add('tarot-hidden');
		} else {
			slide.classList.add('tarot-visible');
			if (isFullyVisible) {
				slide.classList.add('tarot-fully-visible');
			}
		}

		// update aria attributes and keyboard affordances
		_.updateSlideARIA(slide, isVisible, visibilityPercent);
		_.updateSlideTabindex(slide, isVisible);
	}

	/**
	 * updates aria attributes for a slide
	 * @param {HTMLElement} slide - the slide element
	 * @param {boolean} isVisible - whether the slide is visible in viewport
	 * @param {number} visibilityPercent - percentage of slide visible (0..1)
	 */
	updateSlideARIA(slide, isVisible, visibilityPercent) {
		const _ = this;

		// mark offscreen content for assistive tech
		slide.setAttribute('aria-hidden', String(!isVisible));

		// give each slide a semantic group role if none present
		if (!slide.hasAttribute('role')) {
			slide.setAttribute('role', 'group');
		}

		// build an aria-label if not present
		if (!slide.hasAttribute('aria-label') && !slide.hasAttribute('aria-labelledby')) {
			const indexAttr = slide.getAttribute('index') || '0';
			const index = parseInt(indexAttr, 10) || 0;
			const total = _.ctx.store.getState().slideCount || _.ctx.store.getSlides().length || 0;
			slide.setAttribute('aria-label', `slide ${index + 1} of ${total}`);
		}

		// aria-live removed - now handled by dedicated announcement region in tarot.js

		// set aria-current on the slide that matches the current render index if author provided a mapping
		const renderIndex = _.ctx.store.getState().renderIndex;
		const slideIndexAttr = slide.getAttribute('index');
		if (slideIndexAttr != null && Number(slideIndexAttr) === renderIndex) {
			slide.setAttribute('aria-current', 'true');
		} else {
			slide.removeAttribute('aria-current');
		}
	}

	/**
	 * updates tabindex for keyboard navigation
	 * @param {HTMLElement} slide - the slide element
	 * @param {boolean} isVisible - whether the slide is visible in viewport
	 */
	updateSlideTabindex(slide, isVisible) {

		// find focusable elements within the slide
		const focusableElements = slide.querySelectorAll(
			'a, button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
		);

		focusableElements.forEach((element) => {
			if (isVisible) {
				// restore original tabindex or leave untouched
				const originalTabindex = element.getAttribute('data-original-tabindex');
				if (originalTabindex !== null) {
					element.setAttribute('tabindex', originalTabindex);
					element.removeAttribute('data-original-tabindex');
				}
			} else {
				// store original tabindex (if any) and make unfocusable
				const currentTabindex = element.getAttribute('tabindex');
				if (currentTabindex !== '-1') {
					if (currentTabindex !== null) {
						element.setAttribute('data-original-tabindex', currentTabindex);
					}
					element.setAttribute('tabindex', '-1');
				}
			}
		});
	}

	/**
	 * gets current visibility state for all slides
	 * @returns {Array<{ slide:HTMLElement, isVisible:boolean, isFullyVisible:boolean, visibilityPercent:number }>}
	 */
	getSlideVisibility() {
		const _ = this;
		const trackPosition = _.ctx.store.getAnimation().trackPosition || 0;
		return _.ctx.utils.getSlidesInViewport(_.ctx, trackPosition);
	}

	/**
	 * gets slides that are currently visible
	 * @returns {HTMLElement[]} array of visible slides
	 */
	getVisibleSlides() {
		const _ = this;
		return _.getSlideVisibility()
			.filter((info) => info.isVisible)
			.map((info) => info.slide);
	}

	/**
	 * gets slides that are fully visible (66%+)
	 * @returns {HTMLElement[]} array of fully visible slides
	 */
	getFullyVisibleSlides() {
		const _ = this;
		return _.getSlideVisibility()
			.filter((info) => info.isFullyVisible)
			.map((info) => info.slide);
	}

	/** reset classes/attributes */
	destroy() {
		const _ = this;

		// reset slide state
		const slides = _.ctx.carousel.querySelectorAll('tarot-slide');
		for (const slide of slides) {
			slide.classList.remove(
				'tarot-hidden',
				'tarot-visible',
				'tarot-fully-visible',
				'tarot-selected'
			);
			slide.style.removeProperty('--tarot-visibility');
			slide.style.removeProperty('--tarot-left-visibility');
			slide.style.removeProperty('--tarot-right-visibility');
			slide.style.removeProperty('--tarot-parallax');
			slide.style.removeProperty('--tarot-parallax-visibility');
			slide.removeAttribute('aria-hidden');
			// aria-live cleanup no longer needed - handled by dedicated announcement region
			slide.removeAttribute('aria-current');

			// restore original tabindex values
			const focusables = slide.querySelectorAll('[data-original-tabindex]');
			focusables.forEach((element) => {
				const original = element.getAttribute('data-original-tabindex');
				if (original !== null) {
					element.setAttribute('tabindex', original);
				} else {
					element.removeAttribute('tabindex');
				}
				element.removeAttribute('data-original-tabindex');
			});
		}
	}

	/**
	 * handles slide navigation announcements for screen readers
	 * @param {number} slideIndex - the newly selected slide index
	 */
	handleSlideNavigation(slideIndex) {
		const _ = this;
		const options = _.ctx.store.getOptions();
		
		// check if announcements are enabled
		if (!options.announcements || !_.ctx.announcements) return;
		
		const slides = _.ctx.store.getSlides();
		const total = slides.length;
		
		// create announcement text
		const announcement = `Slide ${slideIndex + 1} of ${total}`;
		
		// update announcement element content
		_.ctx.announcements.textContent = announcement;
	}

	/**
	 * cleanup method for destroying the manager
	 */
	destroy() {
		const _ = this;
		
		// unbind event handlers
		if (_.handlers?.renderIndexChanged) {
			_.ctx.emitter.off(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
		}
	}
}

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
	// Handle infinite sentinels
	if (pointName === 'L+') return Number.NEGATIVE_INFINITY;
	if (pointName === 'R+') return Number.POSITIVE_INFINITY;

	// Get base point value
	const base = transformPoints?.[pointName];
	if (base == null) {
		throw new Error(
			`getPointValue: unknown point "${pointName}". Available points: ${Object.keys(transformPoints || {}).join(', ')}`
		);
	}

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
	return a > b ? { start: a, end: b } : { start: b, end: a };
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
	// Round to nearest half-pixel to eliminate floating-point precision issues
	function roundToHalfPixel(value) {
		return Math.round(value * 2) / 2;
	}

	const { start, end } = getRange(pointNameA, pointNameB, trackPosition, transformPoints);
	const roundedStart = roundToHalfPixel(start);
	const roundedEnd = roundToHalfPixel(end);
	const roundedCenter = roundToHalfPixel(slide.centerPoint);

	const isInRange = roundedCenter <= roundedStart && roundedCenter > roundedEnd;

	let percent = 0;
	if (isInRange) {
		if (Number.isFinite(roundedStart) && Number.isFinite(roundedEnd)) {
			const full = roundedStart - roundedEnd;
			// Avoid division by zero, although range rule should prevent this
			percent = full > 0 ? Math.max(0, Math.min(1, (roundedCenter - roundedEnd) / full)) : 1;
		} else {
			// For infinite ranges, percent is 1 if in range, 0 otherwise.
			percent = 1;
		}
	}

	return { isInRange, percent, start: roundedStart, end: roundedEnd };
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
		getRange: (pointNameA, pointNameB) =>
			getRange(pointNameA, pointNameB, trackPosition, transformPoints),

		/**
		 * Check if slide is in range and get progress
		 * @param {HTMLElement} slide - Slide element
		 * @param {string} pointNameA - First point name
		 * @param {string} pointNameB - Second point name
		 * @returns {{ isInRange: boolean, percent: number, start: number, end: number }}
		 */
		isSlideInRange: (slide, pointNameA, pointNameB) =>
			isSlideInRange(slide, pointNameA, pointNameB, trackPosition, transformPoints),

		// Direct access to frame data for convenience
		trackPosition,
		transformPoints,
		frame,
	};
}

class FrameEngine {
	#slideStateManager;
	ctx;

	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;

		_.#slideStateManager = new SlideStateManager(ctx);

		_.effect = null;
		_.rafId = null;

		_.handlers = {
			effectChanged: () => {
				_.effect = ctx.commands.getEffect();
				_.requestFrame();
			},
			storeDirty: () => {
				_.requestFrame();
			},
		};
		_.bindEvents();
	}

	bindEvents() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// effect swapped
		emitter.on(events.effect.changed, _.handlers.effectChanged);

		// store changed → request frame
		emitter.on(events.store.changedDirty, _.handlers.storeDirty);
	}

	requestFrame() {
		const _ = this;
		if (_.rafId !== null) return; // already pending
		_.rafId = requestAnimationFrame(_.onFrame.bind(_));
	}

	cancel() {
		const _ = this;
		if (_.rafId !== null) {
			cancelAnimationFrame(_.rafId);
			_.rafId = null;
		}
	}

	onFrame(time) {
		const _ = this;

		// clear rafId
		_.rafId = null;

		// Step 1: Tell SlideManager to prep slides (updates datastore)
		_.ctx.commands.getSlideManager().prepSlidesForFrame();

		// Step 2: Get fresh snapshot with prepped slides
		const snapshot = _.ctx.store.getSnapshot();

		// Sort slides by renderIndex (important for transform calculations)
		// Create a copy for sorting since we shouldn't mutate the original array
		const sortedSlides = [...snapshot.slides].sort((a, b) => a.renderIndex - b.renderIndex);

		// Step 3: Build frame object with all data
		const frame = Object.freeze({
			state: snapshot.state, // all carousel state: selectedIndex, renderIndex, page, etc.
			widths: snapshot.widths, // all measured widths: viewport, slide, gap, etc.
			options: snapshot.options, // current active options in datastore
			slides: sortedSlides, // prepped slides array with calculated positions
			animation: snapshot.animation, // { type, trackPosition, trackDelta, velocity, progress }
			transformPoints: snapshot.transformPoints, // named position points for effects
			time: time, // current animation frame timestamp from requestAnimationFrame
		});

		// render frame
		_.renderFrame(frame);

		// mark store as clean after processing
		_.ctx.store.markAsClean();

		// schedule next frame only while an animation is in progress
		if (snapshot.animation.isAnimating) {
			// Emit event to tell track animator to continue physics calculations
			// The physics engine uses time delta between frames to calculate movement
			_.ctx.emitter.emit(_.ctx.events.track.requestFrame, { time });

			// request next frame
			_.requestFrame();
		}
	}

	renderFrame(frame) {
		const _ = this;

		// emit before render event
		_.ctx.emitter.emit(_.ctx.events.frame.beforeRender, frame);

		// pass frame and utils to effect.render(frame, utils)
		const utils = createFrameUtils(frame);
		_.effect.render(frame, utils);

		// update classes and ARIA states based on visibility in viewport
		_.#slideStateManager.updateSlides(frame.animation.trackPosition);

		// emit after render event
		_.ctx.emitter.emit(_.ctx.events.frame.afterRender, frame);
	}

	destroy() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// Cancel any pending animation frame
		_.cancel();

		// Unbind events
		emitter.off(events.effect.changed, _.handlers.effectChanged);
		emitter.off(events.store.changedDirty, _.handlers.storeDirty);

		// Destroy slide state manager
		if (_.#slideStateManager) {
			_.#slideStateManager.destroy();
			_.#slideStateManager = null;
		}

		// Clear references
		_.effect = null;
	}
}

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
class DataStore {
	/** @type {any} private emitter */
	#emitter;

	/** @type {object} private live objects (never expose directly) */
	#options;
	#state;
	#widths;
	#slides;
	#transformPoints;
	#animation;

	/** @type {boolean} private dirty state tracking */
	#isDirty;

	/**
	 * creates a new datastore instance
	 * @param {object} emitter - shared emitter for pub/sub (must implement emit)
	 */
	constructor(emitter) {
		const _ = this;

		// simple emitter validation to avoid silent failures
		if (!emitter || typeof emitter.emit !== 'function') {
			throw new Error('data-store requires an emitter with an emit method');
		}
		_.#emitter = emitter;

		// canonical defaults
		_.#isDirty = false;
		_.#options = {};
		_.#state = {
			selectedIndex: 0,
			renderIndex: 0,
			pageIndex: 0,
			pageCount: 1,
			isDragging: false,
			slideCount: 0,
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
		};
		_.#slides = [];
		_.#transformPoints = {};
		_.#animation = {
			type: 'jump', // 'jump', 'animate', 'settle'
			trackPosition: 0,
			trackDelta: 0,
			velocity: 0,
			progress: 1,
			isAnimating: false,
			direction: 0, // -1 for left, 1 for right, 0 for no movement/jump
		};
	}

	// ---------------------------------------------------------------------
	// options slice
	// ---------------------------------------------------------------------

	/**
	 * returns a readonly copy of options
	 * @returns {Readonly<object>}
	 */
	getOptions() {
		// all lowercase comments: shallow copy + freeze for safety
		return Object.freeze({ ...this.#options });
	}

	/**
	 * merges a patch into options and emits options:changed
	 * @param {object} [patch={}] - partial options to merge
	 */
	setOptions(patch = {}) {
		const _ = this;

    const prevOptions = _.getOptions();
    _.#options = { ..._.#options, ...patch };
    const currentOptions = _.getOptions();

		_.#markAsDirty();

    _.#emitter.emit(EVENTS.store.optionsChanged, {
        prevOptions,
        currentOptions,
    });
	}

	// ---------------------------------------------------------------------
	// state slice
	// ---------------------------------------------------------------------

	/**
	 * returns a readonly copy of state
	 * @returns {Readonly<object>}
	 */
	getState() {
		return Object.freeze({ ...this.#state });
	}

	/**
	 * merges a patch into state, emits state:changed,
	 * and fires fine-grained index events when applicable
	 * @param {object} [patch={}] - partial state updates
	 */
	setState(patch = {}) {
		const _ = this;

    const prevState = _.getState();
    _.#state = { ..._.#state, ...patch };
    const currentState = _.getState();

		_.#markAsDirty();

		// coarse event for any state change
    _.#emitter.emit(EVENTS.store.stateChanged, { prevState, currentState });

		// fine-grained signals for common keys
    if (patch.selectedIndex !== undefined && patch.selectedIndex !== prevState.selectedIndex) {
        _.#emitter.emit(EVENTS.store.selectedIndexChanged, {
            prevIndex: prevState.selectedIndex,
            currentIndex: patch.selectedIndex,
        });
    }

    if (patch.renderIndex !== undefined && patch.renderIndex !== prevState.renderIndex) {
        _.#emitter.emit(EVENTS.store.renderIndexChanged, {
            prevIndex: prevState.renderIndex,
            currentIndex: patch.renderIndex,
        });
    }

    if (patch.pageIndex !== undefined && patch.pageIndex !== prevState.pageIndex) {
        _.#emitter.emit(EVENTS.store.pageIndexChanged, {
            prevPageIndex: prevState.pageIndex,
            currentPageIndex: patch.pageIndex,
        });
    }

		if (patch.pageCount !== undefined && patch.pageCount !== prevState.pageCount) {
			_.#emitter.emit(EVENTS.store.pageCountChanged, {
				count: patch.pageCount,
			});
		}
	}

	// ---------------------------------------------------------------------
	// widths slice
	// ---------------------------------------------------------------------

	/**
	 * returns a readonly copy of widths
	 * @returns {Readonly<object>}
	 */
	getWidths() {
		return Object.freeze({ ...this.#widths });
	}

	/**
	 * replaces all width metrics and emits layout:changed
	 * @param {object} [nextWidths={}] - full set of layout metrics
	 */
	setWidths(nextWidths = {}) {
		const _ = this;

    const prevWidths = _.getWidths();
    _.#widths = { ...nextWidths };
    const currentWidths = _.getWidths();

		_.#markAsDirty();

    _.#emitter.emit(EVENTS.store.layoutChanged, {
        prevWidths,
        currentWidths,
    });
	}

	// ---------------------------------------------------------------------
	// slides slice
	// ---------------------------------------------------------------------

	/**
	 * returns a readonly copy of slides (array)
	 * @returns {Readonly<Array>}
	 */
	getSlides() {
		// freeze the array reference so callers can't push/pop
		return Object.freeze([...this.#slides]);
	}

	/**
	 * replaces the slides array, syncs slideCount in state,
	 * and emits slides:changed
	 * @param {Array} [slides=[]] - new slide descriptors
	 */
	setSlides(slides = []) {
		const _ = this;

    // cache previous and set slides
    const prevSlides = _.getSlides();
    _.#slides = [...slides];
    const currentSlides = _.getSlides();

		// keep slideCount in sync via state setter (also emits fine-grained events)
		_.setState({ slideCount: _.#slides.length });

		_.#markAsDirty();

    _.#emitter.emit(EVENTS.store.slidesChanged, {
        prevSlides,
        currentSlides,
    });
	}

	// ---------------------------------------------------------------------
	// transformPoints slice
	// ---------------------------------------------------------------------

	/**
	 * returns a readonly copy of transformPoints
	 * @returns {Readonly<object>}
	 */
	getTransformPoints() {
		// return frozen copy to prevent mutations
		return Object.freeze({ ...this.#transformPoints });
	}

	/**
	 * replaces the transformPoints object and emits transformPoints:changed
	 * @param {object} [nextPoints={}] - new transform points mapping
	 */
	setTransformPoints(nextPoints = {}) {
		const _ = this;

		// cache previous points
    const prevPoints = _.getTransformPoints();

		// replace transformPoints
		_.#transformPoints = { ...nextPoints };

		_.#markAsDirty();

		// emit event so subscribers can react
    _.#emitter.emit(EVENTS.store.transformPointsChanged, {
        prevPoints,
        currentPoints: Object.freeze({ ..._.#transformPoints }),
    });
	}

	// ---------------------------------------------------------------------
	// animation slice
	// ---------------------------------------------------------------------

	/**
	 * updates animation state for frame-based rendering
	 * @param {object} animationData - animation data
	 * @param {string} animationData.type - animation type ('animate' | 'jump' | 'settle')
	 * @param {number} [animationData.trackPosition] - current track position
	 * @param {number} [animationData.trackDelta] - change in track position
	 * @param {number} [animationData.velocity] - current velocity
	 * @param {number} [animationData.progress] - animation progress (0-1)
	 * @param {boolean} [animationData.isAnimating] - whether animation is active
	 */
	setAnimation(animationData = {}) {
		const _ = this;

		// capture previous animation data for change detection
		const prevAnimation = { ..._.#animation };

		// merge new animation data with existing structure
		_.#animation = {
			..._.#animation,
			...animationData,
		};

		_.#markAsDirty();

		// emit fine-grained event for track position changes
		if (animationData.trackPosition !== undefined && animationData.trackPosition !== prevAnimation.trackPosition) {
			_.#emitter.emit(EVENTS.track.positionChanged, {
				prevTrackPosition: prevAnimation.trackPosition,
				currentTrackPosition: animationData.trackPosition,
				trackDelta: (animationData.trackPosition - prevAnimation.trackPosition),
				animationType: animationData.type || 'unknown',
			});
		}
	}

	/**
	 * returns a readonly copy of animation
	 * @returns {Readonly<object>}
	 */
	getAnimation() {
		return Object.freeze({ ...this.#animation });
	}

	/**
	 * clears the current animation without emitting events
	 */
	clearAnimation() {
		this.#animation = {
			type: 'jump',
			trackPosition: 0,
			trackDelta: 0,
			velocity: 0,
			progress: 1,
		};
	}

	// ---------------------------------------------------------------------
	// dirty state tracking
	// ---------------------------------------------------------------------

	/**
	 * returns the current dirty state
	 * @returns {boolean} true if store has pending changes
	 */
	isDirty() {
		return this.#isDirty;
	}

	/**
	 * marks the store as clean (no pending changes)
	 * emits store:changed-clean event
	 */
	markAsClean() {
		const _ = this;
		if (_.#isDirty) {
			_.#isDirty = false;
			_.#emitter.emit(EVENTS.store.changedClean);
		}
	}

	/**
	 * private method to mark store as dirty and emit event
	 * @private
	 */
	#markAsDirty() {
		const _ = this;
		if (!_.#isDirty) {
			_.#isDirty = true;
			_.#emitter.emit(EVENTS.store.changedDirty);
		}
	}

	// ---------------------------------------------------------------------
	// snapshot (for frame engine)
	// ---------------------------------------------------------------------

	/**
	 * returns a complete snapshot of all store data for frame rendering
	 * @returns {Readonly<object>} complete frozen snapshot with all data slices
	 */
	getSnapshot() {
		const _ = this;
		return Object.freeze({
			state: _.getState(),
			widths: _.getWidths(),
			slides: _.getSlides(),
			transformPoints: _.getTransformPoints(),
			options: _.getOptions(),
			animation: _.getAnimation(),
		});
	}

	/**
	 * cleans up the data store and clears all references
	 * should be called when the carousel is destroyed to prevent memory leaks
	 */
	destroy() {
		const _ = this;

		// clear emitter reference
		_.#emitter = null;

		// clear all data slices
		_.#options = null;
		_.#state = null;
		_.#widths = null;
		_.#slides = null;
		_.#transformPoints = null;
		_.#animation = null;

		// reset dirty state
		_.#isDirty = false;
	}
}

// core/utils/utils.js
// Consolidated utility functions for the tarot carousel system

/**
 * throttle calls a function at most once every `limit` milliseconds
 * @param {Function} callback - function to be throttled
 * @param {number} limit - number of milliseconds to wait before allowing another call
 * @returns {Function} a throttled function
 */
function throttle(callback, limit) {
	var waiting = false;
	return function (...args) {
		if (!waiting) {
			callback.apply(this, args);
			waiting = true;
			setTimeout(function () {
				waiting = false;
			}, limit);
		}
	};
}

/**
 * debounce calls a function after a specified delay has passed since the last time it was invoked.
 * @param {Function} func - the function to debounce
 * @param {number} wait - the number of milliseconds to wait before calling func
 * @param {boolean} [immediate=false] - if true, func is called on the leading edge of the timeout
 * @returns {Function} a debounced function that delays invoking func
 */
function debounce(func, wait, immediate) {
	var timeout;
	return function (...args) {
		var context = this;
		var later = function () {
			timeout = null;
			if (!immediate) {
				func.apply(context, args);
			}
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) {
			func.apply(context, args);
		}
	};
}

/**
 * Deep merge two objects.
 * @param {Object} target - The target object.
 * @param {Object} source - The source object.
 * @returns {Object} - The merged object.
 */
function deepMerge(target, source) {
	const isObject = (obj) => obj && typeof obj === 'object';

	return Object.keys(source).reduce(
		(acc, key) => {
			if (Array.isArray(acc[key]) && Array.isArray(source[key])) {
				acc[key] = acc[key].concat(source[key]);
			} else if (isObject(acc[key]) && isObject(source[key])) {
				acc[key] = deepMerge({ ...acc[key] }, source[key]);
			} else {
				acc[key] = source[key];
			}
			return acc;
		},
		{ ...target }
	);
}

// accepts number (int or float), Pixel value "10px", or percent "10%"
// returns a numerical value
function convertValueToNumber(value, width) {
	if (typeof value == 'number') {
		// if value is a percent between 0 and 1
		if (value > 0 && value < 1) {
			return value * width;
		}
		// else it's just a number
		return value;
	}
	if (value.indexOf('px') > -1) {
		return parseFloat(value.replace('px', ''));
	} else if (value.indexOf('%') > -1) {
		return (parseFloat(value.replace('%', '')) / 100) * width;
	}
	return 0;
}

function areOptionsEqual(obj1, obj2) {
	// Check for reference equality
	if (obj1 === obj2) return true;

	// Check if both are objects
	if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
		return false;
	}

	// Handle arrays
	if (Array.isArray(obj1) && Array.isArray(obj2)) {
		if (obj1.length !== obj2.length) return false;
		for (let i = 0; i < obj1.length; i++) {
			if (!areOptionsEqual(obj1[i], obj2[i])) {
				return false;
			}
		}
		return true;
	}

	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);

	// Check if the number of keys is the same
	if (keys1.length !== keys2.length) return false;

	// Compare keys and their values
	for (const key of keys1) {
		if (!keys2.includes(key) || !areOptionsEqual(obj1[key], obj2[key])) {
			return false;
		}
	}

	return true;
}

/**
 * Determines if looping is possible and should be enabled
 * @param {number} slideCount - Total number of slides
 * @param {Object} options - Carousel options containing loop and slidesPerView settings
 * @returns {boolean} true if looping should be enabled, false otherwise
 */
function canLoop(slideCount, options) {
	const slidesPerView = options.slidesPerView || 1;
	return !!(options.loop && slideCount > slidesPerView);
}

/**
 * Calculate which slides are visible in the viewport and their visibility percentages
 * @param {Object} ctx - shared module context containing store, emitter, etc.
 * @param {number} [trackPosition] - track position (if not provided, reads from store)
 * @param {number} [buffer=0] - additional buffer around viewport
 * @returns {Array} array of objects with slide info: {slide, index, visibilityPercent, isVisible, isFullyVisible}
 */
function getSlidesInViewport(ctx, trackPosition = null, buffer = 0) {
	// Get current data from the store
	const widths = ctx.store.getWidths();
	const slides = ctx.store.getSlides();
	ctx.store.getState();

	// Use provided trackPosition or get from store
	if (trackPosition === null) {
		const animation = ctx.store.getAnimation();
		trackPosition = animation.trackPosition || 0;
	}

	const viewportWidth = widths.viewport;
	const slideWidth = widths.slide;
	widths.gap;
	const slideAndGapWidth = widths.slideAndGap;

	// Convert track position to viewport bounds (with buffer)
	const viewportStart = -trackPosition - buffer;
	const viewportEnd = viewportStart + viewportWidth + buffer * 2;
	// Center of the actual visible viewport (not including buffer)
	const viewportCenter = -trackPosition + viewportWidth / 2;

	const slideInfo = [];

	for (let i = 0; i < slides.length; i++) {
		const slide = slides[i];
		const renderIndex = slide.renderIndex !== undefined ? slide.renderIndex : i;

		// Calculate slide bounds in the viewport
		const slideStart = renderIndex * slideAndGapWidth;
		const slideEnd = slideStart + slideWidth;

		// Check if slide intersects with viewport
		const intersectionStart = Math.max(slideStart, viewportStart);
		const intersectionEnd = Math.min(slideEnd, viewportEnd);
		const intersection = Math.max(0, intersectionEnd - intersectionStart);

		const visibilityPercent = Math.max(0, Math.min(1, intersection / slideWidth));
		const isVisible = visibilityPercent > 0;
		const isFullyVisible = visibilityPercent >= 0.66;

		// Calculate directional visibility for animations
		let leftVisibility = 0;
		let rightVisibility = 0;
		let parallax = 0;
		let parallaxVisibility = 1; // 1 is default

		if (intersection > 0) {
			// Calculate slide's center position relative to viewport center
			const slideCenter = slideStart + slideWidth / 2;
			const distanceFromCenter = slideCenter - viewportCenter;

			// Parallax: -1.0 (left) → 0.0 (center) → 1.0 (right)
			// Normalize by half viewport width for smooth transitions
			parallax = Math.max(-1, Math.min(1, distanceFromCenter / (viewportWidth / 2)));

			// Right visibility: 0.0 when entering from right → 1.0 when fully visible
			// Based on how far the slide has progressed into the viewport
			if (distanceFromCenter > 0) {
				// Slide is to the right of center - entering phase
				rightVisibility = Math.max(0, Math.min(1, visibilityPercent));
				// parallax visibility fade right
				parallaxVisibility = 1 - rightVisibility;
			} else {
				// Slide is at or past center - fully entered
				rightVisibility = 1.0;
			}

			// Left visibility: 0.0 when exiting to left → 1.0 when fully visible
			if (distanceFromCenter < 0) {
				// Slide is to the left of center - exiting phase
				leftVisibility = Math.max(0, Math.min(1, visibilityPercent));
				// parallax visibility fade left
				parallaxVisibility = (1 - leftVisibility) * -1;
			} else {
				// Slide is at or before center - not exiting yet
				leftVisibility = 1.0;
			}

			// When slide is fully visible, both should definitely be 1.0
			if (visibilityPercent >= 1.0) {
				leftVisibility = 1.0;
				rightVisibility = 1.0;
				parallaxVisibility = 0; // 0 when fully visible
			}
		} else {
			// Calculate slide's center position relative to viewport center
			const slideCenter = slideStart + slideWidth / 2;
			const distanceFromCenter = slideCenter - viewportCenter;

			// parallax visibility when hidden
			if (distanceFromCenter > 0) {
				parallaxVisibility = 1;
			}

			if (distanceFromCenter < 0) {
				parallaxVisibility = -1;
			}
		}

		slideInfo.push({
			slide,
			index: i,
			renderIndex,
			visibilityPercent,
			isVisible,
			isFullyVisible,
			leftVisibility,
			rightVisibility,
			parallax,
			parallaxVisibility,
			slideStart,
			slideEnd,
		});
	}

	return slideInfo;
}

// Create utils object containing all functions for ctx usage
const utils = Object.freeze({
	throttle,
	debounce,
	deepMerge,
	convertValueToNumber,
	areOptionsEqual,
	canLoop,
	getSlidesInViewport,
});

//  calculates widths exactly like your _calculateWidths()
//  provide viewportWidth (number), options (object), slideCount (number)
//  pass in convertValueToNumber so this stays pure and testable
function calculateWidths({ viewportEl, options, slideCount }) {
	const viewport = viewportEl.offsetWidth || 0;

	//  guard inputs
	const slidesPerView = Math.max(1, Number(options.slidesPerView) || 1);

	//  gap and padding (responsive units resolved against viewport width)
	const gap = convertValueToNumber(options.gap, viewport);
	const paddingLeft = convertValueToNumber(options.paddingLeft, viewport);
	const paddingRight = convertValueToNumber(options.paddingRight, viewport);

	//  total widths to remove from viewport
	const totalPaddingWidth = paddingLeft + paddingRight;
	const totalGapWidth = gap * (slidesPerView - 1);

	//  slide width derived from the remaining space
	// totalSlideWidth = viewportWidth - totalGapWidth - totalPaddingWidth
	const totalSlideWidth = Math.max(0, viewport - totalGapWidth - totalPaddingWidth);
	let slide = slidesPerView > 0 ? Math.round((totalSlideWidth / slidesPerView) * 1000) / 1000 : 0;

	//  slide min width resolved against the computed slide width
	const slideMin = convertValueToNumber(options.slideMinWidth, slide);
	if (slide < slideMin) {
		slide = slideMin;
	}

	//  track width: contains gap at the end for looping
	const track = Math.max(0, slideCount) * (slide + gap);

	//  return a flat object that maps to _.widths.* plus track
	return {
		viewport,
		track,
		slide,
		slideMin,
		gap,
		slideAndGap: Math.round((slide + gap) * 1000) / 1000,
		paddingLeft,
		paddingRight,
	};
}

//  calculates page count based on navigation semantics
//  pageCount = number of valid page indices where pageIndex * slidesPerMove = valid slideIndex
function calculatePageCount({ loop, slidesPerMove, slidesPerView, slideCount }) {
	//  looped mode: ceil(slideCount / slidesPerMove)
	if (loop) {
		return Math.max(1, Math.ceil(slideCount / slidesPerMove));
	}

	//  non-looped: count valid starting positions for the viewport
	//  viewport can start at slideIndex 0 through (slideCount - slidesPerView)
	//  since navigation uses pageIndex * slidesPerMove = slideIndex,
	//  we need: ceil((validSlidePositions) / slidesPerMove)
	if (slideCount <= slidesPerView) {
		return 1; // All slides fit in one page
	}
	const validSlidePositions = slideCount - slidesPerView;
	return Math.ceil(validSlidePositions / slidesPerMove) + 1;
}

//  calculates transform points for effects positioning
//  provides named positioning points like L1, L2, C, R1, R2, etc.
//  extends all the way to L10 and R10 for maximum flexibility
function calculateTransformPoints(ctx) {
	const { store } = ctx;
	const widths = store.getWidths();
	const options = store.getOptions();

	// base geometry
	const halfSlideWidth = widths.slide / 2;
	const stepDistance = widths.slideAndGap;

	// visible slide count (at least 1)
	const visibleSlides = options.slidesPerView;

	// CL1 = center of the leftmost visible slide in viewport
	// This is where the first slide's center is when at rest position
	const CL1 = widths.paddingLeft + halfSlideWidth;

	const points = { CL1 };

	// generate CL1..CLN (left → right across the viewport)
	// These are the center positions of each visible slide
	for (let i = 1; i <= visibleSlides; i++) {
		points[`CL${i}`] = CL1 + stepDistance * (i - 1);
	}

	// generate CR1..CRN (right → left mirror of CL)
	// CR1 = center of rightmost visible slide (CLN), CR2 = CL(N-1), ...
	for (let i = 1; i <= visibleSlides; i++) {
		const mirroredIndex = visibleSlides - i + 1; // N, N-1, ..., 1
		points[`CR${i}`] = points[`CL${mirroredIndex}`];
	}

	// add center point (C) - average of all visible slide positions
	if (visibleSlides === 1) {
		points.C = points.CL1;
	} else {
		// center is the midpoint between first and last visible slides
		points.C = (points.CL1 + points[`CL${visibleSlides}`]) / 2;
	}

	// generate L1..L10 to the left of CL1
	for (let i = 1; i <= 10; i++) {
		points[`L${i}`] = CL1 - stepDistance * i;
	}

	// generate R1..R10 to the right of the rightmost visible slide
	const lastVisiblePos = points[`CL${visibleSlides}`];
	for (let i = 1; i <= 10; i++) {
		points[`R${i}`] = lastVisiblePos + stepDistance * i;
	}

	return points;
}

/*
	Here's how to build a new effect using the TarotEffect class!

	1. Extend it like this: "class NewEffect extends TarotEffect"

	2. Build a list of functions for each transformation range between points.
			The points reflect the center of each slide and where it settles.
			The points on the viewport look like this:
			L+ L2 L1 [ CL1 CR1 ] R1 R2 R+
			where L+ = -Infinity and R+ = Infinity.
			The brackets represent the viewport and CL1 and CR1 represent the slides in the viewport.
			If only 1 slide is visible in the viewport then technically CL1 and CR1 should have the samve value!
 
	3. Build out your render function and use the 'isSlideInRange' function to calcualte 
			when a slide is in a certain range. It will return the progress in that range from 
			0 on the left to 1 on the right. 

	4. Build out functions for each range and call those to apply the transformations.
	 		You might even name your functions 'L1toC1' so they're easy to understand.

	5. More complex effects might require doing your own math, which can be frustrating but fun.

*/

class TarotEffect {
	static rules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: Infinity,
		loopBuffer: { left: 0, right: 0 },
	};

	/**
	 * @param {object} ctx - The shared context object containing emitter, store, etc.
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		// cache latest width
		_.currentSlideWidth = 0;
		_.currentTrackWidth = 0;
	}

	init() {}

	reInit() {}

	renderSlideWidth(width) {
		if (this.currentSlideWidth !== width) {
			this.currentSlideWidth = width;
			this.ctx.viewport.style.setProperty('--tarot-slide-width', `${width}px`);
		}
	}

	// animation object from frame
	renderTrackPosition(animation) {
		// some people say translateX produces sharper text than translate3d
		// but translate3d is better for GPU optimized animations
		let transformValue = animation.isAnimating
			? `translate3d(${animation.trackPosition}px,0,0)`
			: `translateX(${animation.trackPosition}px)`;
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
	render(frame, utils) {
		// Override this method in child effects to implement visual transformations
	}

	get rules() {
		return this.constructor.rules;
	}

	/**
	 * Cleanup method called when the effect is destroyed.
	 * Child classes should override and call super.destroy() if they have resources to clean up.
	 */
	destroy() {
		// Base class has no resources to clean up since we don't bind events anymore
	}
}

class CarouselEffect extends TarotEffect {
	static effectName = 'carousel';

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
	render(frame, utils) {
		const { slides, widths, state, animation } = frame;
		const _ = this;

		// must call these if you want to set the slide width and track position
		_.renderTrackWidth(widths.track);
		_.renderSlideWidth(widths.slide);
		_.renderTrackPosition(animation);

		// position each slide based on its calculated trackPosition
		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i]; // This is the actual <tarot-slide> DOM element
			if (slide && slide.style) {
				// clear any transitions for immediate positioning
				slide.style.transition = 'none';

				// position slide using its trackPosition property (set by frame engine)
				slide.style.transform = `translateX(${slide.trackPosition}px)`;
			}
		}
	}

	destroy() {
		// this.ctx.viewport.style.setProperty('--tarot-slide-width', ``);
		// reset track position
		this.ctx.track.style.transform = '';
		// clear track width
		this.ctx.track.style.width = '';
	}
}

class Fade extends TarotEffect {
	static effectName = 'fade';

	static rules = {
		min_slideWidth: 1,
		max_slideWidth: Infinity,
		min_slidesPerView: 1,
		max_slidesPerView: 1,
		loopBuffer: { left: 0, right: 0 },
	};

	constructor(ctx) {
		super(ctx);
		const _ = this;
		_.blurAmount = 10;
		_.scaleAmount = 0.1;
		_.lastState = new WeakMap();
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

		// Fade effect uses calculated slide width, track position is virtual only
		_.renderSlideWidth(widths.slide);
		// Note: renderTrackPosition() not called - track DOM position irrelevant for fade

		const lastState = _.lastState;

		for (let i = 0, n = slides.length; i < n; ++i) {
			const slide = slides[i];
			// Frame engine has already set trackPosition and centerPoint properties

			const hiddenLeft = utils.isSlideInRange(slide, 'L+', 'L1');
			if (hiddenLeft.isInRange) {
				if (lastState.get(slide) !== 'hiddenLeft') {
					_.applyHiddenLeftFilter(slide);
					lastState.set(slide, 'hiddenLeft');
				}
				continue;
			}

			const fadeLeft = utils.isSlideInRange(slide, 'CL1', 'L1');
			if (fadeLeft.isInRange) {
				const key = `fadeLeft:${Math.round(fadeLeft.percent * 100)}`;
				if (lastState.get(slide) !== key) {
					_.applyFadeLeftFilter(slide, fadeLeft.percent);
					lastState.set(slide, key);
				}
				continue;
			}

			const fadeRight = utils.isSlideInRange(slide, 'R1', 'CL1');
			if (fadeRight.isInRange) {
				if (lastState.get(slide) !== 'fadeRight') {
					_.applyFadeRightFilter(slide);
					lastState.set(slide, 'fadeRight');
				}
				continue;
			}

			const hiddenRight = utils.isSlideInRange(slide, 'R+', 'R1');
			if (hiddenRight.isInRange) {
				if (lastState.get(slide) !== 'hiddenRight') {
					_.applyHiddenRightFilter(slide);
					lastState.set(slide, 'hiddenRight');
				}
				continue;
			}
		}
	}

	applyHiddenLeftFilter(slide) {
		slide.style.opacity = '0';
		slide.style.display = 'none';
		slide.style.zIndex = '1';
		slide.style.filter = `blur(${this.blurAmount}px)`;
		slide.style.transform = `scale(${1 + this.scaleAmount})`;
	}

	applyFadeLeftFilter(slide, percent) {
		// account for subpixel rounding
		if (percent > 0.995) percent = 1;

		const blur = (1 - percent) * this.blurAmount;
		const scale = 1 + (1 - percent) * this.scaleAmount;

		slide.style.opacity = String(percent);
		slide.style.display = 'block';
		slide.style.zIndex = '1';
		slide.style.filter = `blur(${blur}px)`;
		slide.style.transform = `scale(${scale})`;
	}

	applyFadeRightFilter(slide) {
		slide.style.opacity = '1';
		slide.style.display = 'block';
		slide.style.zIndex = '0';
		slide.style.filter = 'blur(0px)';
		slide.style.transform = 'scale(1)';
	}

	applyHiddenRightFilter(slide) {
		slide.style.opacity = '0';
		slide.style.display = 'none';
		slide.style.zIndex = '0';
		slide.style.filter = 'blur(0px)';
		slide.style.transform = 'scale(1)';
	}

	destroy() {
		super.destroy();
		// slides are now DOM elements directly, not wrapper objects
		const slides = this.ctx.store.getSlides() || [];
		for (let i = 0; i < slides.length; i++) {
			const slide = slides[i];
			if (!slide || !slide.style) continue;
			slide.style.opacity = '';
			slide.style.display = '';
			slide.style.zIndex = '';
			slide.style.filter = '';
			slide.style.transform = '';
		}
		this.lastState = null;
	}
}

/*
	Navigation carousel plugin - syncs with another carousel and provides nav-specific functionality:
	- Always centers the selected slide
	- Provides arrow key navigation
	- Adds navigation-specific styling classes
	- Syncs bidirectionally with target carousel
*/
class AsNavFor {
	/**
	 * @constructor
	 * @param {Object} ctx - the carousel context that will be synced with another
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.otherCarousel = null;
		_.isNavCarousel = true; // Flag to identify this as a navigation carousel
		_.isActive = false; // Only active when asNavFor is configured and found

		// define all event handlers in one object
		_.handlers = {
			// handler for other carousel's animation requested event
			otherAnimationRequested: ({ index, velocity, type }) => {
				const currentIndex = _.ctx.store.getState().selectedIndex;
				// return if we are already going to that index or already at it
				if (currentIndex === index) {
					return;
				}
				// go to same selected index as other carousel (always center for nav)
				setTimeout(() => {
					_.ctx.commands.goToSlide(index);
				}, 1);
			},

			// keep selectedIndex in lockstep with renderIndex (only when active)
			renderIndexChanged: ({ currentIndex }) => {
				if (!_.isActive) return;
				const state = _.ctx.store.getState();
				if (state.selectedIndex !== currentIndex) {
					_.ctx.store.setState({ selectedIndex: currentIndex });
				}
			},

			// handler for carousel's optionsChanged event
			optionsChanged: () => {
				_.reInit();
			},

			// handler for carousel's selectedIndexChanged event
			selectedIndexChanged: ({ prevIndex, currentIndex }) => {
				if (!_.isActive) return;
				_.updateOtherCarousel();
				_.updateNavClasses(prevIndex, currentIndex);
			},

			// handler for keyboard navigation
			keyDown: (event) => {
				if (!_.isActive) return;
				_.handleKeyDown(event);
			},

			// handler for slide clicks (nav-specific)
			slideClick: ({ index, renderIndex, event }) => {
				if (!_.isActive) return;
				// Focus the clicked slide for consistent keyboard capture
				const slides = _.ctx.store.getSlides();
				const targetSlide = slides[index];
				if (targetSlide && typeof targetSlide.focus === 'function') {
					try {
						targetSlide.focus({ preventScroll: true });
					} catch (_) {}
				}
				// When nav slide is clicked, go to that slide and update main carousel
				_.ctx.commands.goToSlide(index);
			},
		};

		_.bindEvents();
		_.init();
	}

	/**
	 * initialize the sync functionality and nav-specific features
	 */
	init() {
		const _ = this;
		const options = _.ctx.store.getOptions();
		const otherCarouselSelector = options.asNavFor;

		// exit (and disable) if no value
		if (!otherCarouselSelector) {
			_.disableNavUI?.();
			_.isActive = false;
			return;
		}

		const otherCarousel = document.querySelector(otherCarouselSelector);
		// can't find it -> disable
		if (!otherCarousel) {
			_.disableNavUI?.();
			_.isActive = false;
			return;
		}

		_.otherCarousel = otherCarousel;
		_.isActive = true;

		// Set nav-specific options on this carousel
		_.setupNavOptions();

		// Add nav-specific styling + keyboard
		_.enableNavUI?.();

		// give DOM a few ms to load the custom elements
		setTimeout(() => {
			_.otherCarousel.on(_.ctx.events.animation.requested, _.handlers.otherAnimationRequested);
			// Initialize nav classes
			_.updateNavClasses(-1, _.ctx.store.getState().selectedIndex);
			// Ensure selection matches render index at startup
			const { renderIndex, selectedIndex } = _.ctx.store.getState();
			if (renderIndex !== selectedIndex) {
				_.ctx.store.setState({ selectedIndex: renderIndex });
			}
		}, 40);
	}

	/**
	 * reinitialize on carousel option changes
	 */
	reInit() {
		const _ = this;
		// cleanup existing connection
		if (_.otherCarousel) {
			_.otherCarousel.off(_.ctx.events.animation.requested, _.handlers.otherAnimationRequested);
			_.otherCarousel = null;
		}
		// disable UI until proven active again
		_.disableNavUI();
		_.isActive = false;
		// reinitialize with new options
		_.init();
	}

	/**
	 * bind carousel events to handlers
	 */
	bindEvents() {
		const _ = this;
		// bind to carousel events using new event system
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.on(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
		_.ctx.emitter.on(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
		_.ctx.emitter.on(_.ctx.events.slides.click, _.handlers.slideClick);
	}

	/** enable nav-specific UI and keyboard only when active */
	enableNavUI() {
		const _ = this;
		if (!_.isActive) return;
		_.ctx.carousel.classList.add('tarot-nav-carousel');
		_.ctx.track.addEventListener('keydown', _.handlers.keyDown, true);
		_.ctx.carousel.setAttribute('tabindex', '0');
		_.ctx.carousel.setAttribute('role', 'tablist');
		_.ctx.carousel.setAttribute('aria-label', 'Carousel Navigation');

		// Ensure slides have correct roles and initial roving tabindex
		const slides = _.ctx.store.getSlides();
		const sel = _.ctx.store.getState().selectedIndex;
		for (let i = 0; i < slides.length; i++) {
			const s = slides[i];
			s.setAttribute('role', 'tab');
			s.setAttribute('tabindex', i === sel ? '0' : '-1');
		}
	}

	/** disable nav-specific UI and keyboard when not active */
	disableNavUI() {
		const _ = this;
		_.ctx.carousel.classList.remove('tarot-nav-carousel');
		_.ctx.track.removeEventListener('keydown', _.handlers.keyDown, true);
		// Don't remove tabindex - core carousel needs it for arrow key support
		_.ctx.carousel.removeAttribute('role');
		_.ctx.carousel.removeAttribute('aria-label');

		// Clean up nav-specific ARIA attributes from slides
		const slides = _.ctx.store.getSlides();
		slides.forEach((slide) => {
			slide.removeAttribute('aria-selected');
			slide.removeAttribute('role');
		});
	}

	/**
	 * Setup navigation-specific options
	 */
	setupNavOptions() {
		const _ = this;
		// Force navigation carousels to always center selected slide
		const currentOptions = _.ctx.store.getOptions();
		if (!currentOptions.centerSelectedSlide) {
			_.ctx.store.setOptions({ centerSelectedSlide: true });
		}
	}

	/**
	 * Handle keyboard navigation for nav carousel
	 */
	handleKeyDown(event) {
		const _ = this;
		const currentIndex = _.ctx.store.getState().selectedIndex;
		const totalSlides = _.ctx.store.getState().slideCount;
		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				event.stopPropagation(); // prevent core carousel arrow handling
				const prevIndex =
					currentIndex > 0
						? currentIndex - 1
						: _.ctx.store.getOptions().loop
							? totalSlides - 1
							: currentIndex;
				_.ctx.commands.goToSlide(prevIndex);
				// Move focus to the newly selected tab
				const prevSlides = _.ctx.store.getSlides();
				const prevTarget = prevSlides[prevIndex];
				if (prevTarget && typeof prevTarget.focus === 'function') {
					setTimeout(() => {
						try {
							prevTarget.focus({ preventScroll: true });
						} catch (_) {}
					}, 0);
				}
				break;

			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault();
				event.stopPropagation(); // prevent core carousel arrow handling
				const nextIndex =
					currentIndex < totalSlides - 1
						? currentIndex + 1
						: _.ctx.store.getOptions().loop
							? 0
							: currentIndex;
				_.ctx.commands.goToSlide(nextIndex);
				// Move focus to the newly selected tab
				const nextSlides = _.ctx.store.getSlides();
				const nextTarget = nextSlides[nextIndex];
				if (nextTarget && typeof nextTarget.focus === 'function') {
					setTimeout(() => {
						try {
							nextTarget.focus({ preventScroll: true });
						} catch (_) {}
					}, 0);
				}
				break;

			case 'Home':
				event.preventDefault();
				event.stopPropagation(); // prevent core carousel arrow handling
				_.ctx.commands.goToSlide(0);
				// Focus first tab
				const slides = _.ctx.store.getSlides();
				if (slides[0]?.focus)
					setTimeout(() => {
						try {
							slides[0].focus({ preventScroll: true });
						} catch (_) {}
					}, 0);
				break;

			case 'End':
				event.preventDefault();
				event.stopPropagation(); // prevent core carousel arrow handling
				_.ctx.commands.goToSlide(totalSlides - 1);
				// Focus last tab
				const slides2 = _.ctx.store.getSlides();
				const last = totalSlides - 1;
				if (slides2[last]?.focus)
					setTimeout(() => {
						try {
							slides2[last].focus({ preventScroll: true });
						} catch (_) {}
					}, 0);
				break;
		}
	}

	/**
	 * Update navigation-specific classes on slides
	 * Note: The main tarot-selected class is handled by ClassManager,
	 * but we add nav-specific ARIA attributes for accessibility
	 */
	updateNavClasses(prevIndex, currentIndex) {
		const _ = this;
		const slides = _.ctx.store.getSlides();

		// Update ARIA attributes for navigation
		if (prevIndex >= 0 && slides[prevIndex]) {
			slides[prevIndex].setAttribute('aria-selected', 'false');
			// roving tabindex: make previous non-focusable
			slides[prevIndex].setAttribute('tabindex', '-1');
		}

		// Add ARIA attributes to current slide
		if (slides[currentIndex]) {
			slides[currentIndex].setAttribute('aria-selected', 'true');
			slides[currentIndex].setAttribute('role', 'tab');
			// roving tabindex: make current focusable
			slides[currentIndex].setAttribute('tabindex', '0');
		}

		// The tarot-selected class is automatically managed by ClassManager
		// based on slide.selected property, so we don't need to manually manage it here
	}

	/**
	 * update the other carousel to match this one
	 */
	updateOtherCarousel() {
		const _ = this;
		// return if we don't have a carousel to update
		if (!_.otherCarousel) return;

		// get current selected index from store
		const currentIndex = _.ctx.store.getState().selectedIndex;
		// tell carousel to go to the same selected index
		// async hack
		setTimeout(() => {
			_.otherCarousel.goToSlide(currentIndex);
		}, 1);
	}

	/**
	 * destroy the sync, unbinding all events and cleaning up nav functionality
	 */
	destroy() {
		const _ = this;

		// unbind from carousel events using new event system
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
		_.ctx.emitter.off(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
		_.ctx.emitter.off(_.ctx.events.slides.click, _.handlers.slideClick);

		// Remove nav-specific UI
		_.disableNavUI();

		// unbind from other carousel events
		if (_.otherCarousel) {
			_.otherCarousel.off(_.ctx.events.animation.requested, _.handlers.otherAnimationRequested);
		}

		_.otherCarousel = null;
		_.isActive = false;
	}
}

/**
 * Sync two carousels by mirroring renderIndex in both directions.
 * - When the other carousel requests an animation, mirror its index here.
 * - When this carousel's renderIndex changes, push that index to the other.
 */
class SyncWith {
	/**
	 * @constructor
	 * @param {Object} ctx - the carousel context that will be synced with another
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.otherCarousel = null;

		// define all event handlers in one object
		_.handlers = {
			// handler for other carousel's animation requested event
			otherAnimationRequested: ({ index, velocity, type }) => {
				const currentIndex = _.ctx.store.getState().renderIndex;
				// return if we are already going to that index or already at it
				if (currentIndex === index) return;

				// go to same selected index as other carousel
				_.ctx.commands.goToSlide(index);
			},

			// handler for carousel's optionsChanged event
			optionsChanged: (data) => {
				// check options to see if we still have SyncWith
				// disconnect or connect to new carousel
				_.reInit();
			},

			// handler for carousel's renderIndexChanged event
			renderIndexChanged: ({ prevIndex, currentIndex }) => {
				// tell other carousel to go to this render index
				_.updateSyncWithCarousel();
			},
		};

		_.bindEvents();
		_.init();
	}

	/**
	 * initialize the sync functionality
	 */
	init() {
		const _ = this;
		const options = _.ctx.store.getOptions();
		const otherCarouselId = options.syncWith;

		// exit if no value
		if (!otherCarouselId) return;

		// get syncWith value from options
		_.otherCarousel = document.querySelector(otherCarouselId);

		// can't find it
		if (!_.otherCarousel) return;

		// give DOM a few ms to load the custom elements
		setTimeout(() => {
			_.otherCarousel.on(_.ctx.events.animation.requested, _.handlers.otherAnimationRequested);
		}, 100);
	}

	/**
	 * reinitialize on carousel option changes
	 */
	reInit() {
		const _ = this;
		// cleanup existing connection
		if (_.otherCarousel) {
			_.otherCarousel.off(_.ctx.events.animation.requested, _.handlers.otherAnimationRequested);
			_.otherCarousel = null;
		}
		// reinitialize with new options
		_.init();
	}

	/**
	 * bind carousel events to handlers
	 */
	bindEvents() {
		const _ = this;
		// bind to carousel events using new event system
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.on(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
	}

	/**
	 * update the other carousel to match this one
	 */
	updateSyncWithCarousel() {
		const _ = this;
		// return if we don't have a carousel to update
		if (!_.otherCarousel) return;
		
		// get current render index from store
		const currentRenderIndex = _.ctx.store.getState().renderIndex;
		// tell other carousel to go to the same render index
		_.otherCarousel.goToSlide(currentRenderIndex);
	}

	/**
	 * destroy the sync, unbinding all events
	 */
	destroy() {
		const _ = this;

		// unbind from carousel events using new event system
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);

		// unbind from other carousel events
		if (_.otherCarousel) {
			_.otherCarousel.off(_.ctx.events.animation.requested, _.handlers.otherAnimationRequested);
		}

		_.otherCarousel = null;
	}
}

/**
 * controls automatic play/advance of the carousel
 */
class Autoplay {
	/**
	 * @constructor
	 * @param {Object} ctx - the carousel context to control autoplay for
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.autoplayTimer = null;
		_.autoplayOptions = _.ctx.store.getOptions().autoplay || {};

		// create debounced resume function
		_.debouncedResume = _.ctx.utils.debounce(() => _.start(), 10000);

		// define all event handlers in one object
		_.handlers = {
			// handler for user interaction event
			userInteracted: () => {
				_.pause();
			},

			// handler for options changed event
			optionsChanged: () => {
				_.autoplayOptions = _.ctx.store.getOptions().autoplay || {};
				_.reInit();
			},

			// handler for the interval timer
			tick: () => {
				// exit if document doesn't have focus
				if (!document.hasFocus?.()) return;
				
				// go to next page
				_.ctx.commands.next(-5);
			},
		};

		_.bindEvents();
		_.reInit();
	}

	/**
	 * reinitialize on carousel option changes
	 */
	reInit() {
		const _ = this;

		// reload options
		_.autoplayOptions = _.ctx.store.getOptions().autoplay || {};

		// check options
		if (_.autoplayOptions.interval) {
			_.start();
		} else {
			_.stop();
		}
	}

	/**
	 * bind carousel events to handlers
	 */
	bindEvents() {
		const _ = this;
		// pause when user interacts with carousel
		_.ctx.emitter.on(_.ctx.events.user.interacted, _.handlers.userInteracted);
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
	}

	/**
	 * start the autoplay timer
	 */
	start() {
		const _ = this;
		// clear existing timer
		_.stop();

		// exit if it's turned off
		if (!_.autoplayOptions.interval) return;

		let interval = _.autoplayOptions.interval;
		if (interval === 0 || interval === false) return;
		if (interval === true) interval = 4000;

		_.autoplayTimer = setInterval(_.handlers.tick, interval);
	}

	/**
	 * stop the autoplay timer
	 */
	stop() {
		const _ = this;
		clearInterval(_.autoplayTimer);
		_.autoplayTimer = null;
	}

	/**
	 * pause autoplay temporarily
	 */
	pause() {
		const _ = this;
		// stops the current timer
		_.stop();

		// restarts in 10 seconds if no interaction
		if (_.autoplayOptions.interval) {
			_.debouncedResume();
		}
	}

	/**
	 * destroy the autoplay, unbinding all events and clearing timers
	 */
	destroy() {
		const _ = this;

		// stop any running timer
		_.stop();

		// unbind from carousel events
		_.ctx.emitter.off(_.ctx.events.user.interacted, _.handlers.userInteracted);
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);

		// clear the debounced function
		if (_.debouncedResume.cancel) {
			_.debouncedResume.cancel();
		}
	}
}

class Buttons {
	/**
	 * @constructor
	 * @param {Object} ctx - the carousel context that the buttons will control
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.navOptions = {};
		_.prevButtonButton = null;
		_.nextButtonButton = null;

		// define all event handlers in one object
		_.handlers = {
			// handler for prev button click
			prevClick: (e) => {
				// trigger user interacted event
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'button', event: e });
				_.ctx.commands.prev(5);
			},

			// handler for next button click
			nextClick: (e) => {
				// trigger user interacted event
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'button', event: e });
				_.ctx.commands.next(-5);
			},

			// handler for button focus
			buttonFocus: (e) => {
				// pause autoplay on focus if enabled
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'focus', event: e });
			},

			// handler for button blur
			buttonBlur: (e) => {
				// autoplay will resume automatically via debounced timer
			},

			// handler for options changed event
			optionsChanged: () => {
				_.reInit();
			},

			// handler for page changed event
			pageChanged: () => {
				_.checkDisabledState();
			},

			windowResize: () => {
				_.updateSmartButtons();
			},
		};

		_.init();
	}

	/**
	 * initialize the navigation buttons
	 */
	init() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};

		// pull buttons from DOM
		_.queryButtons();
		// build them if they don't exist
		// must be in this order for in the DOM
		if (!_.nextButton) _.buildNextButton();
		if (!_.prevButton) _.buildPrevButton();

		// bind to UI
		_.checkButtonOptions();
		_.bindUI();
		_.bindEvents();
		_.checkDisabledState();

		setTimeout(() => {
			_.updateSmartButtons();
		}, 8);

		setTimeout(() => {
			_.updateSmartButtons();
		}, 30);
	}

	/**
	 * reinitialize on carousel option changes
	 */
	reInit() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};
		_.checkButtonOptions();
		_.checkDisabledState();
		_.updateSmartButtons();
	}

	/**
	 * bind ui events to button handlers
	 */
	bindUI() {
		const _ = this;
		// make sure we don't double bind
		_.unbindUI();
		if (_.prevButton) {
			_.prevButton.addEventListener('click', _.handlers.prevClick, true);
			_.prevButton.addEventListener('focus', _.handlers.buttonFocus);
			_.prevButton.addEventListener('blur', _.handlers.buttonBlur);
		}
		if (_.nextButton) {
			_.nextButton.addEventListener('click', _.handlers.nextClick, true);
			_.nextButton.addEventListener('focus', _.handlers.buttonFocus);
			_.nextButton.addEventListener('blur', _.handlers.buttonBlur);
		}

		// bind to first image load
		const slides = _.ctx.store.getSlides();
		if (slides.length > 0) {
			let firstImage = slides[0].el?.querySelector('img') || false;
			if (firstImage && firstImage.complete) {
				_.updateSmartButtons(firstImage);
			} else if (firstImage) {
				firstImage.onload = function () {
					_.updateSmartButtons(firstImage);
				};
			}
		}
	}

	/**
	 * unbind ui events from button handlers
	 */
	unbindUI() {
		const _ = this;
		if (_.prevButton) {
			_.prevButton.removeEventListener('click', _.handlers.prevClick, true);
			_.prevButton.removeEventListener('focus', _.handlers.buttonFocus);
			_.prevButton.removeEventListener('blur', _.handlers.buttonBlur);
		}
		if (_.nextButton) {
			_.nextButton.removeEventListener('click', _.handlers.nextClick, true);
			_.nextButton.removeEventListener('focus', _.handlers.buttonFocus);
			_.nextButton.removeEventListener('blur', _.handlers.buttonBlur);
		}
	}

	/**
	 * bind carousel events to handlers
	 */
	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.on(_.ctx.events.store.pageIndexChanged, _.handlers.pageChanged);
		_.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.windowResize);
	}

	/**
	 * check button options and show/hide buttons accordingly
	 */
	checkButtonOptions() {
		const _ = this;
		_.navOptions.showButtons ? _.showButtons() : _.hideButtons();
	}

	/**
	 * query buttons from the dom
	 */
	queryButtons() {
		const _ = this;
		const navOptions = _.navOptions;

		// first check to see if the user gave us a selector
		if (navOptions.prevButtonSelector) {
			_.prevButton = document.querySelector(navOptions.prevButtonSelector);
		}

		if (navOptions.nextButtonSelector) {
			_.nextButton = document.querySelector(navOptions.nextButtonSelector);
		}

		// then check to see if there are any buttons inside the carousel
		if (!_.prevButton) {
			// query all child buttons
			const allPrevButtons = _.ctx.carousel.querySelectorAll('[data-action="tarot-prev"]');
			// filter them so that their closest ancestor carousel is the current one.
			_.prevButton =
				Array.from(allPrevButtons).find((btn) => btn.closest('tarot-carousel') === _.ctx.carousel) ||
				null;
		}

		if (!_.nextButton) {
			const allNextButtons = _.ctx.carousel.querySelectorAll('[data-action="tarot-next"]');
			_.nextButton =
				Array.from(allNextButtons).find((btn) => btn.closest('tarot-carousel') === _.ctx.carousel) ||
				null;
		}
	}

	/**
	 * build the prev button if it doesn't exist
	 */
	buildPrevButton() {
		const _ = this;
		const prevButtonHTML = `
			<button class="tarot-button" data-action="tarot-prev" aria-label="previous slide">
				<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
					<title>angle left</title>
					<path d="m21 7-9 9 9 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		`;
		// add button to DOM
		_.ctx.carousel.insertAdjacentHTML('afterbegin', prevButtonHTML);
		// query DOM for button
		_.prevButton = _.ctx.carousel.querySelector('[data-action="tarot-prev"]');
	}

	/**
	 * build the next button if it doesn't exist
	 */
	buildNextButton() {
		const _ = this;
		const nextButtonHTML = `
			<button class="tarot-button" data-action="tarot-next" aria-label="next slide">
				<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
					<title>angle right</title>
					<path d="m11 25 9-9-9-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		`;
		_.ctx.carousel.insertAdjacentHTML('afterbegin', nextButtonHTML);
		_.nextButton = _.ctx.carousel.querySelector('[data-action="tarot-next"]');
	}

	/**
	 * show the navigation buttons
	 */
	showButtons() {
		const _ = this;
		const prevButton = _.prevButton;
		const nextButton = _.nextButton;

		// Even if showButtons: true they can set each button like
		// showPrevButton: false to only show one
		if (prevButton && _.navOptions.showPrevButton !== false) {
			prevButton.style.display = '';
			prevButton.setAttribute('aria-label', 'previous');
			prevButton.classList.add('tarot-button', 'tarot-prev');
		} else {
			_.hidePrevButton();
		}

		if (nextButton && _.navOptions.showNextButton !== false) {
			nextButton.style.display = '';
			nextButton.setAttribute('aria-label', 'next');
			nextButton.classList.add('tarot-button', 'tarot-next');
		} else {
			_.hideNextButton();
		}
	}

	/**
	 * hide both buttons
	 */
	hideButtons() {
		this.hidePrevButton();
		this.hideNextButton();
	}

	/**
	 * hide the prev button
	 */
	hidePrevButton() {
		const _ = this;
		if (_.prevButton) _.prevButton.style.display = 'none';
	}

	/**
	 * hide the next button
	 */
	hideNextButton() {
		const _ = this;
		if (_.nextButton) _.nextButton.style.display = 'none';
	}

	// smart buttons
	updateSmartButtons() {
		const _ = this;
		const smartButtons = _.ctx.store.getOptions().navigation?.smartButtons || false;
		const prevButton = _.prevButton;
		const nextButton = _.nextButton;
		const minDistance = 40;
		const viewport = _.ctx.viewport;
		const viewportWidth = viewport?.offsetWidth || 0;
		const slides = _.ctx.store.getSlides();

		// bail if we don't have a viewport or any slides
		if (!viewport) return;
		if (!slides || slides.length === 0) return;

		// remove classes if not using smart buttons
		if (!smartButtons) {
			if (prevButton) {
				prevButton.classList.remove('tarot-smart-position');
			}
			if (nextButton) {
				nextButton.classList.remove('tarot-smart-position');
			}
			return;
		}

		// fetch info from the carousel
		const firstSlide = slides[0]?.el;
		if (!firstSlide) return;

		// read computed styles in case we need padding
		const viewportStyles = window.getComputedStyle(viewport);
		const viewportTopPadding = parseInt(viewportStyles.paddingTop) || 0;

		// figure out a rough button vertical position
		let buttonTopPos = viewport.offsetHeight;

		// if the first slide has an <img>, maybe use its height
		const firstImage = firstSlide.querySelector('img');
		if (firstImage && firstImage.offsetHeight < buttonTopPos) {
			// add top padding if relevant
			buttonTopPos = firstImage.height + viewportTopPadding * 2;
		}

		// half it so it's approximately centered
		buttonTopPos = buttonTopPos / 2;

		// get widths from store
		const widths = _.ctx.store.getWidths();
		const paddingLeftWidth = widths.paddingLeft || 0;
		const paddingRightWidth = widths.paddingRight || 0;
		const gapWidth = widths.gap || 0;

		// set prev button
		if (prevButton) {
			prevButton.classList.add('tarot-smart-position');
			prevButton.style.top = `${buttonTopPos}px`;

			// figure out potential positions
			let leftPos = minDistance;
			let leftPosWithGap = paddingLeftWidth - gapWidth / 2;
			let leftPosOnlyPadding = paddingLeftWidth;

			// if the carousel is edge-to-edge
			if (window.innerWidth === viewportWidth) {
				if (leftPosWithGap < minDistance) {
					if (leftPosOnlyPadding >= minDistance) {
						leftPos = leftPosOnlyPadding;
					} else if (gapWidth > 0) {
						leftPos += gapWidth;
					}
				} else if (leftPosWithGap >= minDistance) {
					leftPos = leftPosWithGap;
				}
			} else {
				// if it's not edge-to-edge
				leftPos = leftPosOnlyPadding;
			}

			prevButton.style.left = `${leftPos}px`;
		}

		// set next button
		if (nextButton) {
			nextButton.classList.add('tarot-smart-position');
			nextButton.style.top = `${buttonTopPos}px`;

			// figure out potential positions for the right side
			let rightPos = minDistance;
			let rightPosWithGap = paddingRightWidth - gapWidth / 2;
			let rightPosOnlyPadding = paddingRightWidth;

			if (window.innerWidth === viewportWidth) {
				if (rightPosWithGap < minDistance) {
					if (rightPosOnlyPadding >= minDistance) {
						rightPos = rightPosOnlyPadding;
					} else if (gapWidth > 0) {
						rightPos += gapWidth;
					}
				} else if (rightPosWithGap >= minDistance) {
					rightPos = rightPosWithGap;
				}
			} else {
				rightPos = rightPosOnlyPadding;
			}

			nextButton.style.right = `${rightPos}px`;
		}
	}

	/**
	 * check and update disabled state of buttons
	 */
	checkDisabledState() {
		const _ = this;
		const state = _.ctx.store.getState();
		const options = _.ctx.store.getOptions();
		const page = state.pageIndex;
		const pageCount = state.pageCount;

		// if we aren't looping
		if (!options.loop) {
			// check prev button
			if (_.prevButton) {
				if (page == 0) {
					_.prevButton.disabled = true;
				} else {
					_.prevButton.disabled = false;
				}
			}

			// check next button
			if (_.nextButton) {
				if (page == pageCount - 1) {
					_.nextButton.disabled = true;
				} else {
					_.nextButton.disabled = false;
				}
			}
		}
	}

	/**
	 * destroy the buttons, unbinding all events
	 */
	destroy() {
		const _ = this;
		_.unbindUI();

		// unbind carousel events
		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.pageIndexChanged, _.handlers.pageChanged);
		_.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.windowResize);

		_.prevButtonButton = null;
		_.nextButtonButton = null;
	}
}

/**
 * lazy-load plugin (ctx-based)
 * - accepts a ctx object (emitter, events, store, carousel)
 * - removes loading="lazy" attributes from images on first user interaction
 * - re-checks images when slides change
 * - subscribes to user:interacted and slides:changed events
 */
class LazyLoad {
	/**
	 * @param {object} ctx - shared module context from tarot-carousel
	 * @param {object} ctx.emitter
	 * @param {object} ctx.events
	 * @param {object} ctx.store
	 * @param {HTMLElement} ctx.carousel
	 */
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;

		// Save handlers for later removal
		_.handlers = {
			userInteracted: () => {
				_.checkLazyImages();
				// Remove this handler after first interaction since we only need to run it once
				_.ctx.emitter.off(_.ctx.events.user.interacted, _.handlers.userInteracted);
			},
			slidesChanged: () => {
				_.reInit();
			},
		};

		_.init();
	}

	init() {
		const _ = this;
		_.bindEvents();
		_.checkLazyImages(); // Check on init as well
	}

	reInit() {
		const _ = this;
		_.checkLazyImages();
	}

	bindEvents() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// Load images when user interacts with the carousel
		emitter.on(events.user.interacted, _.handlers.userInteracted);

		// Rebind when slides change
		emitter.on(events.store.slidesChanged, _.handlers.slidesChanged);
	}

	checkLazyImages() {
		const _ = this;
		const slides = _.ctx.store.getSlides();

		// Guard against slides being undefined or not having a length property
		if (!slides || typeof slides.length === 'undefined') {
			console.warn('LazyLoad: Slides not available');
			return;
		}

		let images;

		// remove all loading="lazy" attributes from images
		// to force them to load
		for (let i = 0, n = slides.length; i < n; ++i) {
			if (!slides[i] || !slides[i].el) continue;

			images = slides[i].el.querySelectorAll('img[loading="lazy"]');

			for (let k = 0, l = images.length; k < l; ++k) {
				images[k].removeAttribute('loading');
			}
		}
	}

	destroy() {
		const _ = this;
		const { emitter, events } = _.ctx;

		// Remove all event listeners
		emitter.off(events.user.interacted, _.handlers.userInteracted);
		emitter.off(events.store.slidesChanged, _.handlers.slidesChanged);
	}
}

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

class Pagination {
	constructor(ctx) {
		const _ = this;
		_.ctx = ctx;
		_.navOptions = {};
		_.paginationContainer = null;
		_.dotsList = null;
		_.isAutoGeneratedNav = false;

		//  debounce render so rapid changes do not rebuild repeatedly
		_.debouncedRender = _.ctx.utils.debounce(() => _.render(), 20);

		_.handlers = {
			//  handle clicks on pagination dots
			paginationClick: (event) => {
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'pagination', event });
				const target = event.target.closest('[data-action="tarot-go-to-page"]');
				if (!target) return;
				const pageIndex = parseInt(target.getAttribute('data-page-index'), 10);
				_.activateDot(pageIndex);
			},

			//  keyboard navigation with auto-activation
			keyDown: (event) => {
				const allowedKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
				if (!allowedKeys.includes(event.key)) return;

				const tabs = Array.from(_.paginationContainer.querySelectorAll('.tarot-dots-button'));
				const currentIndex = tabs.findIndex((tab) => tab.getAttribute('tabIndex') === '0');
				let newIndex = currentIndex;

				const options = _.ctx.store.getOptions();

				switch (event.key) {
					case 'ArrowRight':
						newIndex = currentIndex + 1;
						if (newIndex >= tabs.length) newIndex = options.loop ? 0 : currentIndex;
						break;
					case 'ArrowLeft':
						newIndex = currentIndex - 1;
						if (newIndex < 0) newIndex = options.loop ? tabs.length - 1 : currentIndex;
						break;
					case 'Home':
						newIndex = 0;
						break;
					case 'End':
						newIndex = tabs.length - 1;
						break;
					default:
						return;
				}

				event.preventDefault();
				event.stopPropagation();

				//  move focus and auto-activate (proper ARIA pattern for instant content)
				tabs.forEach((tab, i) => {
					tab.tabIndex = i === newIndex ? 0 : -1;
				});
				tabs[newIndex].focus();

				// auto-activate the focused dot
				_.ctx.emitter.emit(_.ctx.events.user.interacted, { via: 'key', event });
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
			},
		};

		_.init();
	}

	//  bind carousel events to pagination handlers
	bindEvents() {
		const _ = this;
		_.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.on(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.on(_.ctx.events.store.pageIndexChanged, _.handlers.pageChanged);

		//  add event listeners for pagination container events
		_.paginationContainer.addEventListener('click', _.handlers.paginationClick, false);
		_.paginationContainer.addEventListener('keydown', _.handlers.keyDown, false);
	}

	//  initialize the pagination container and build the dots
	init() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};
		_.isAutoGeneratedNav = false;

		//  if a pagination element is provided via selector, use it
		if (_.navOptions && _.navOptions.paginationSelector) {
			const paginationElement = document.querySelector(_.navOptions.paginationSelector);
			if (paginationElement) _.paginationContainer = paginationElement;
		}

		//  if no container provided, generate one
		if (!_.paginationContainer) {
			_.isAutoGeneratedNav = true;
			const nav = document.createElement('nav');
			nav.setAttribute('aria-label', 'carousel navigation');
			_.paginationContainer = document.createElement('div');
			nav.appendChild(_.paginationContainer);
			_.ctx.carousel.appendChild(nav);
		}

		//  clear existing content and set up the container
		_.paginationContainer.innerHTML = '';
		_.paginationContainer.classList.add('tarot-dots-container');

		//  create the <ul> element for dots with role="tablist"
		_.dotsList = document.createElement('ul');
		_.dotsList.classList.add('tarot-dots-list');
		_.dotsList.setAttribute('role', 'tablist');
		_.dotsList.setAttribute('aria-orientation', 'horizontal');
		_.paginationContainer.appendChild(_.dotsList);

		_.bindEvents();

		//  build the dots
		_.render();
	}

	//  reinitialize pagination when carousel options or slides change
	reInit() {
		const _ = this;
		_.navOptions = _.ctx.store.getOptions().navigation || {};
		_.debouncedRender();
	}

	//  build the pagination buttons (dots)
	render() {
		const _ = this;
		const state = _.ctx.store.getState();
		const page = state.pageIndex;
		const pageCount = state.pageCount;
		const carouselID = _.ctx.carousel.id || '';

		_.dotsList.innerHTML = '';

		for (let i = 0; i < pageCount; ++i) {
			const listItem = document.createElement('li');
			listItem.setAttribute('role', 'presentation');

			const button = document.createElement('button');
			button.type = 'button';
			button.classList.add('tarot-dots-button');
			button.setAttribute('role', 'tab');
			button.setAttribute('data-page-index', i);
			button.setAttribute('data-action', 'tarot-go-to-page');
			button.setAttribute('aria-selected', page === i ? 'true' : 'false');
			button.tabIndex = page === i ? 0 : -1;
			button.setAttribute('aria-label', `page ${i + 1}`);
			button.id = `carousel-tab-${i + 1}`;
			if (carouselID) button.setAttribute('aria-controls', carouselID);

			const span = document.createElement('span');
			span.className = 'tarot-visually-hidden';
			span.textContent = `slide ${i + 1}`;

			button.appendChild(span);
			listItem.appendChild(button);
			_.dotsList.appendChild(listItem);
		}

		_.updateSelectedDot();

		if (_.navOptions && _.navOptions.showPagination) _.show();
		else _.hide();
	}

	//  activate a dot and change the carousel page
	activateDot(index) {
		const _ = this;
		_.ctx.commands.goToPage(index);
		_.updateSelectedDot();
	}

	//  update the selected pagination dot based on the carousel state
	updateSelectedDot() {
		const _ = this;
		const dots = _.paginationContainer.querySelectorAll('.tarot-dots-button');
		const currentPage = `${_.ctx.store.getState().pageIndex}`;
		dots.forEach((dot) => {
			if (dot.dataset.pageIndex === currentPage) {
				dot.setAttribute('aria-selected', 'true');
				dot.tabIndex = 0;
			} else {
				dot.setAttribute('aria-selected', 'false');
				dot.tabIndex = -1;
			}
		});
	}

	//  show the pagination container
	show() {
		if (this.paginationContainer.parentElement) {
			this.paginationContainer.parentElement.style.display = '';
		} else {
			this.paginationContainer.style.display = '';
		}
	}

	//  hide the pagination container
	hide() {
		if (this.paginationContainer.parentElement) {
			this.paginationContainer.parentElement.style.display = 'none';
		} else {
			this.paginationContainer.style.display = 'none';
		}
	}

	//  destroy the pagination and unbind everything
	destroy() {
		const _ = this;

		if (_.paginationContainer) {
			_.paginationContainer.removeEventListener('click', _.handlers.paginationClick, false);
			_.paginationContainer.removeEventListener('keydown', _.handlers.keyDown, false);
		}

		_.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
		_.ctx.emitter.off(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
		_.ctx.emitter.off(_.ctx.events.store.pageIndexChanged, _.handlers.pageChanged);

		// cancel debounced function if it has a cancel method
		if (_.debouncedRender && typeof _.debouncedRender.cancel === 'function') {
			_.debouncedRender.cancel();
		}

		if (
			_.isAutoGeneratedNav &&
			_.paginationContainer &&
			_.paginationContainer.parentNode &&
			_.paginationContainer.parentNode.parentNode === _.ctx.carousel
		) {
			_.ctx.carousel.removeChild(_.paginationContainer.parentNode);
		}

		_.paginationContainer = null;
		_.dotsList = null;
		_.debouncedRender = null;
	}
}

// tarot-carousel.js
// import Scrollbar from './plugins/scrollbar.js'; // TODO: not working yet

/** 🔮 ✨ 🕯️ 🍄 🌙 ⭐ TAROT ⭐ 🌙 🍄 🕯️ ✨ 🔮 */
class Tarot extends HTMLElement {
	// ---------------------------------------------------------------------
	// static registries & helpers
	// ---------------------------------------------------------------------

	/** core effects (always included) */
	static effects = {
		carousel: CarouselEffect,
		fade: Fade,
	};

	/** @type {Array<Function>} core plugins (always included) */
	static plugins = [AsNavFor, SyncWith, Autoplay, Buttons, LazyLoad, Pagination /* Scrollbar */];

	/** @type {number} count of carousel instances created */
	static instanceCount = 0;

	/**
	 * register an effect class using a canonical key
	 * prefers a static identifier (effectName/slug/key), falls back to class name
	 * @param {Function} effectClass
	 */
	static registerEffect(effectClass) {
		const _ = this;

		// basic guard
		if (!effectClass) {
			console.warn('tarot-carousel.registerEffect requires an effect class');
			return;
		}

		// prefer explicit static id
		let effectName = effectClass.effectName;

		// final sanity check
		if (!effectName) {
			console.warn(
				'tarot-carousel.registerEffect: effect must have a static string id (e.g., effectName)'
			);
			return;
		}

		// normalize to canonical key
		const key = String(effectName)
			.trim()
			.toLowerCase()
			.replace(/effect$/, '');

		// warn on overwrite
		if (_.effects[key]) {
			console.warn(`tarot-carousel: overwriting existing effect '${key}'`);
		}

		_.effects[key] = effectClass;

		// notify listeners (e.g., EffectManager instances) that a new effect is available
		try {
			if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
				window.dispatchEvent(
					new CustomEvent('tarot:effect-registered', { detail: { effectName: key } })
				);
			}
		} catch (e) {
			// no-op if CustomEvent/window is unavailable
		}
	}

	/**
	 * register a plugin class to be initialized on new instances
	 * @param {Function} plugin
	 * @returns {typeof TarotCarousel}
	 */
	static use(plugin) {
		const _ = this;
		if (!_.plugins) _.plugins = [];
		_.plugins.push(plugin);
		return _;
	}

	// ---------------------------------------------------------------------
	// private fields
	// ---------------------------------------------------------------------

	#eventEmitter; // shared emitter for this instance
	#store; // datastore for options/state/widths/slides
	#ctx; // frozen module context passed to managers

	#trackManager;
	#trackAnimator;
	#slideManager;
	#optionsManager;
	#effectManager;
	#dragHandler;
	#windowEvents;
	#frameEngine;

	#pluginInstances = [];
	#viewport;
	#track;
	#announcements;

	// ---------------------------------------------------------------------
	// lifecycle
	// ---------------------------------------------------------------------

	/** creates a new tarotcarousel instance */
	constructor() {
		super();
		const _ = this;

		// set a unique id for this carousel instance
		if (!_.id) {
			_.id = `tarot-carousel-${Tarot.instanceCount}`;
		}
		Tarot.instanceCount++;

		// initialize private emitter
		_.#eventEmitter = new EventEmitter();

		// initialize store with default shapes
		_.#store = new DataStore(_.#eventEmitter);
	}

	/** custom element connected lifecycle hook */
	async connectedCallback() {
		const _ = this;

		// make sure tarot-slide component is registered
		if (!customElements.get('tarot-slide')) {
			await customElements.whenDefined('tarot-slide');

			// wait one frame to ensure children are connected
			await new Promise(requestAnimationFrame);
		}

		// query and normalize required child elements
		_.#queryDOMElements();

		// make carousel focusable for keyboard navigation
		_.setAttribute('tabindex', '0');

		// now that dom refs exist, build the shared context
		_.#ctx = _.#createModuleContext();
		const ctx = _.#ctx; // local ref for faster property access

		// create managers (all receive ctx, not the whole carousel)
		_.#optionsManager = new OptionsManager(ctx);
		_.#windowEvents = new WindowEvents(ctx);
		_.#slideManager = new SlideManager(ctx);
		_.#effectManager = new EffectManager(ctx, _.constructor.effects);
		_.#dragHandler = new DragHandler(ctx);
		_.#trackAnimator = new TrackAnimator(ctx);
		_.#trackManager = new TrackManager(ctx, _.#trackAnimator);
		_.#frameEngine = new FrameEngine(ctx);

		// cross-module wiring
		_.#bindCoreEvents();

		// load effect and collect slides
		_.#effectManager.loadCurrentEffect();

		// compute initial widths + page count
		_.#recomputeLayout();

		// initialize plugins (errors should not break the instance)
		const plugins = _.constructor.plugins;
		plugins.forEach((PluginClass) => {
			try {
				// you can choose to pass ctx to plugins if you prefer
				const pluginInstance = new PluginClass(ctx);
				_.#pluginInstances.push(pluginInstance);
			} catch (error) {
				console.error(`plugin ${PluginClass?.name || '(anonymous)'} failed to initialize:`, error);
			}
		});

		// perform first paint by jumping to initial slide without animation
		const initial = _.#store.getOptions().initialIndex ?? 0;
		_.jumpToSlide(initial);

		_.#frameEngine.requestFrame();
	}

	// ---------------------------------------------------------------------
	// context / bus
	// ---------------------------------------------------------------------

	/**
	 * build and freeze a shared module context
	 * @returns {object} ctx
	 */
	#createModuleContext() {
		const _ = this;

		// all lowercase comments: keep this surface tiny and explicit
		return Object.freeze({
			// pub/sub
			emitter: _.#eventEmitter,
			events: EVENTS,

			// data store
			store: _.#store,

			// utilities
			utils,

			// dom refs used during rendering
			carousel: _, // host element (custom element instance)
			viewport: _.#viewport,
			track: _.#track,
			announcements: _.#announcements,

			// minimal imperative api
			commands: {
				goToSlide: (index, velocity = 0) => _.goToSlide(index, velocity),
				jumpToSlide: (index) => _.jumpToSlide(index),
				next: (velocity = 0) => _.next(velocity),
				prev: (velocity = 0) => _.prev(velocity),
				goToPage: (page, velocity = 0) => _.goToPage(page, velocity),
				jumpToPage: (page) => _.jumpToPage(page),
				requestTrackPosition: (position) => _.requestTrackPosition(position),
				getEffect: () => _.#effectManager.getEffect(),
				getSlideManager: () => _.#slideManager,
				getTrackManager: () => _.#trackManager,
				requestFrame: () => _.#frameEngine.requestFrame(0),
			},
		});
	}

	// ---------------------------------------------------------------------
	// dom setup
	// ---------------------------------------------------------------------

	/**
	 * find or create required child elements
	 * ensures there is a <tarot-viewport> wrapping a <tarot-slides>
	 * creates announcement element for screen reader navigation feedback
	 */
	#queryDOMElements() {
		const _ = this;

		// query viewport and track
		let viewport = _.querySelector(':scope tarot-viewport');
		let track = _.querySelector(':scope tarot-slides');

		// throw if both are missing
		if (!viewport && !track) {
			throw new Error('tarot-carousel: missing both <tarot-viewport> and <tarot-slides> elements');
		}

		// ensure viewport wraps track
		if (track && !viewport) {
			viewport = document.createElement('tarot-viewport');
			track.parentNode.insertBefore(viewport, track);
			viewport.appendChild(track);
		}
		if (viewport && !track) {
			track = document.createElement('tarot-slides');
			while (viewport.firstChild) track.appendChild(viewport.firstChild);
			viewport.appendChild(track);
		}

		// create announcement element for screen reader navigation feedback
		const announcements = document.createElement('div');
		announcements.className = 'tarot-visually-hidden tarot-announcements';
		announcements.id = `tarot-announcements-${_.id}`;
		announcements.setAttribute('aria-live', 'polite');
		announcements.setAttribute('aria-atomic', 'true');

		// insert as first child for screen reader discovery
		_.insertBefore(announcements, _.firstChild);

		_.#viewport = viewport;
		_.#track = track;
		_.#announcements = announcements;
	}

	// ---------------------------------------------------------------------
	// cross-module wiring (orchestration)
	// ---------------------------------------------------------------------

	/** subscribe to core events and coordinate managers */
	#bindCoreEvents() {
		const _ = this;
		const { emitter, events, store } = _.#ctx;

		// when options change, recompute widths + pageCount and reinit effect
		emitter.on(events.store.optionsChanged, ({ currentOptions }) => {
			_.#recomputeLayout(currentOptions);
			_.#effectManager.reInit();
			// keep current render index visible after layout change
			_.jumpToSlide(store.getState().renderIndex);
		});

		// pipe window resizes into a layout recompute (window-events may debounce)
		emitter.on(events.window.resize, () => {
			_.#recomputeLayout(store.getOptions());
			_.#effectManager.reInit();
			_.jumpToSlide(store.getState().renderIndex);
		});

		// handle slide clicks to navigate to clicked slide
		emitter.on(events.slides.click, ({ index }) => {
			_.#store.setState({
				selectedIndex: index,
			});
			// should we go to slide on select?
			if (_.#store.getOptions().goToSelectedSlide) {
				_.goToSlide(index);
			}
		});

		// handle core arrow key navigation
		emitter.on(events.keyboard.arrow, ({ direction }) => {
			if (direction === -1) {
				_.prev();
			} else {
				_.next();
			}
		});
	}

	/**
	 * recompute layout widths and page count using current slides/options
	 * @param {object} [optOverride] - optional options to use for this pass
	 */
	#recomputeLayout(optOverride) {
		const _ = this;
		const options = optOverride || _.#store.getOptions();
		const slides = _.#store.getSlides();

		// recalc width metrics
		const widths = calculateWidths({
			viewportEl: _.#viewport,
			options,
			slideCount: slides.length,
		});
		_.#store.setWidths(widths);

		// recalc transform points (after widths are updated)
		const transformPoints = calculateTransformPoints(_.#ctx);
		_.#store.setTransformPoints(transformPoints);

		// recalc page count
		const pageCount = calculatePageCount({
			loop: options.loop,
			slidesPerMove: options.slidesPerMove,
			slidesPerView: options.slidesPerView,
			slideCount: slides.length,
		});
		_.#store.setState({ pageCount });
	}

	// ---------------------------------------------------------------------
	// public api (pure model updates; no direct dom writes)
	// ---------------------------------------------------------------------

	/**
	 * advance to the next page
	 * @param {number} [velocity=0]
	 */
	next(velocity = 0) {
		this.goToPage(this.state.pageIndex + 1, velocity);
	}

	/**
	 * go back to the previous page
	 * @param {number} [velocity=0]
	 */
	prev(velocity = 0) {
		this.goToPage(this.state.pageIndex - 1, velocity);
	}

	/**
	 * animate to a specific slide index (logical)
	 * @param {number} index
	 * @param {number} [velocity=0]
	 */
	goToSlide(index, velocity = 0) {
		// exit if no index passed in
		if (index === undefined) return;

		const _ = this;

		const state = _.#store.getState();
		const slides = _.#store.getSlides();
		const slideCount = state.slideCount ?? slides.length;

		// bounds + looping
		if (index < 0) {
			const options = _.#store.getOptions();
			index = options.loop ? ((index % slideCount) + slideCount) % slideCount : 0;
			if (!options.loop && !velocity) velocity = 10;
		} else if (index >= slideCount) {
			const options = _.#store.getOptions();
			index = options.loop ? index % slideCount : slideCount - 1;
			if (!options.loop && !velocity) velocity = -10;
		}

		// update state for frame-based animation
		_.#store.setState({
			renderIndex: index,
			pageIndex: _.#getPageIndexForSlide(index),
		});

		// emit animation request event instead of calling track manager directly
		_.#eventEmitter.emit(EVENTS.animation.requested, {
			index,
			velocity,
			type: 'animate',
		});
	}

	/**
	 * jump (no animation) to a specific slide
	 * @param {number} index
	 */
	jumpToSlide(index) {
		// exit if no index passed in
		if (index === undefined) return;

		const _ = this;

		const state = _.#store.getState();
		const slides = _.#store.getSlides();
		const max = (state.slideCount ?? slides.length) - 1;

		if (index < 0 || index > max) {
			throw new Error(`slide index ${index} is out of bounds. valid range is 0 to ${max}.`);
		}

		// update state for frame-based rendering
		_.#store.setState({
			renderIndex: index,
			pageIndex: _.#getPageIndexForSlide(index),
		});

		// emit animation request event instead of calling track manager directly
		_.#eventEmitter.emit(EVENTS.animation.requested, {
			index,
			velocity: 0,
			type: 'jump',
		});
	}

	/**
	 * go to a page (converts page -> slide) with animation
	 * @param {number} newPage
	 * @param {number} [velocity=0]
	 */
	goToPage(newPage, velocity = 0) {
		// exit if no index passed in
		if (newPage === undefined) return;

		const _ = this;

		const state = _.#store.getState();
		const options = _.#store.getOptions();

		// clamp or wrap
		if (newPage < 0) {
			newPage = options.loop
				? ((newPage % state.pageCount) + state.pageCount) % state.pageCount
				: 0;
			if (!options.loop && !velocity) velocity = 10;
		} else if (newPage >= state.pageCount) {
			newPage = options.loop ? 0 : state.pageCount - 1;
			if (!options.loop && !velocity) velocity = -10;
		}

		// every goToPage is actually converted to a goToSlide
		const newIndex = newPage * (options.slidesPerMove ?? 1);
		_.goToSlide(newIndex, velocity);
	}

	/**
	 * jump directly to a page (no animation)
	 * @param {number} newPage
	 */
	jumpToPage(newPage) {
		// exit if no index passed in
		if (newPage === undefined) return;

		const _ = this;

		const state = _.#store.getState();
		const options = _.#store.getOptions();

		if (newPage < 0) {
			newPage = options.loop
				? ((newPage % state.pageCount) + state.pageCount) % state.pageCount
				: 0;
		} else if (newPage >= state.pageCount) {
			newPage = options.loop ? 0 : state.pageCount - 1;
		}

		// every jumpToPage is actually converted to a jumpToSlide
		const newIndex = newPage * (options.slidesPerMove ?? 1);
		_.jumpToSlide(newIndex);
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
		
		// exit if no position passed in
		if (position === undefined || position === null) return;

		_.#store.getState();
		_.#store.getOptions();
		
		let trackPosition = 0;

		// parse the position input
		if (typeof position === 'string') {
			if (position.endsWith('px')) {
				// pixel position
				trackPosition = parseFloat(position.replace('px', ''));
			} else if (position.endsWith('%')) {
				// percentage position
				const percent = parseFloat(position.replace('%', ''));
				trackPosition = _.#convertPercentToTrackPos(percent);
			} else {
				// assume it's a number string (percentage)
				const percent = parseFloat(position);
				trackPosition = _.#convertPercentToTrackPos(percent);
			}
		} else if (typeof position === 'number') {
			// assume number is percentage
			trackPosition = _.#convertPercentToTrackPos(position);
		} else {
			console.warn('requestTrackPosition: invalid position type', position);
			return;
		}

		// emit animation request event to follow the same pattern as jumpToSlide
		_.#eventEmitter.emit(EVENTS.animation.requested, {
			trackPosition, // direct track position instead of index
			velocity: 0,
			type: 'jump',
		});
	}

	/**
	 * convert percentage (0-100) to track position based on last page position
	 * @param {number} percent - percentage from 0 to 100
	 * @returns {number} track position in pixels
	 * @private
	 */
	#convertPercentToTrackPos(percent) {
		const _ = this;
		const state = _.#store.getState();
		const options = _.#store.getOptions();
		
		// ensure percent is within bounds
		percent = Math.max(0, Math.min(100, percent));
		
		// if no pages or only one page, return 0
		if (state.pageCount <= 1) return 0;
		
		// calculate the slide index of the last page
		const lastPageIndex = state.pageCount - 1;
		const lastPageSlideIndex = lastPageIndex * (options.slidesPerMove ?? 1);
		
		// get the track position for the last page using track manager
		const lastPageTrackPos = _.#trackManager.getTrackPosForIndex(lastPageSlideIndex);
		
		// convert percentage to track position
		// 0% = position 0, 100% = lastPageTrackPos
		return (percent / 100) * lastPageTrackPos;
	}

	// ---------------------------------------------------------------------
	// internal helpers (state mutation + derived values)
	// ---------------------------------------------------------------------

	/** compute page index for a given slide index */
	#getPageIndexForSlide(slideIndex) {
		const options = this.#store.getOptions();
		const perMove = options.slidesPerMove ?? 1;
		return Math.floor(slideIndex / perMove);
	}

	// ---------------------------------------------------------------------
	// getters (public readonly snapshots and convenience)
	// ---------------------------------------------------------------------

	/** immutable runtime state snapshot */
	get state() {
		return this.#store.getState();
	}

	/** readonly slides (internal descriptors) */
	get slides() {
		return this.#store.getSlides();
	}

	/** immutable options snapshot */
	get options() {
		return this.#store.getOptions();
	}

	get viewport() {
		return this.#viewport;
	}

	get track() {
		return this.#track;
	}

	/** expose registered effects as canonical keys */
	getEffects() {
		return Object.keys(this.constructor.effects);
	}

	getUserOptions() {
		return this.#optionsManager.getUserOptions?.();
	}

	// convenience getters expected by external api
	getIndex() {
		return this.state.renderIndex;
	}
	getPage() {
		return this.state.pageIndex;
	}
	getSelectedIndex() {
		return this.state.selectedIndex;
	}
	setSelectedIndex(index) {
		const _ = this;
		const slides = _.#store.getSlides();
		const slideCount = slides.length;

		// bounds check
		if (index < 0 || index >= slideCount) {
			console.warn(`setSelectedIndex: index ${index} out of bounds (0-${slideCount - 1})`);
			return;
		}

		// update selected index in store (triggers selection events)
		_.#store.setState({ selectedIndex: index });
	}
	getSelectedSlide() {
		return this.#store.getSlides()[this.state.selectedIndex];
	}
	getSlideAtIndex(index) {
		return this.#store.getSlides()[index];
	}

	updateOptions(newOptions) {
		this.#optionsManager.updateOptions?.(newOptions);
	}

	// ---------------------------------------------------------------------
	// event subscription api (public)
	// ---------------------------------------------------------------------

	/**
	 * subscribe to an event
	 * @param {string} event
	 * @param {Function} listener
	 */
	on(event, listener) {
		this.#eventEmitter.on(event, listener);
	}

	/**
	 * unsubscribe from an event
	 * @param {string} event
	 * @param {Function} listener
	 */
	off(event, listener) {
		this.#eventEmitter.off(event, listener);
	}

	/** private emit helper (kept for compatibility) */
	_emit(event, ...args) {
		this.#eventEmitter.emit(event, ...args);
	}

	// ---------------------------------------------------------------------
	// teardown
	// ---------------------------------------------------------------------

	/** destroy the carousel and clean up plugins and managers */
	destroy() {
		const _ = this;

		_.#pluginInstances.forEach((plugin) => plugin?.destroy?.());
		_.#pluginInstances.length = 0;

		_.#trackManager?.destroy?.();
		_.#effectManager?.destroy?.();
		_.#slideManager?.destroy?.();
		_.#dragHandler?.destroy?.();
		_.#windowEvents?.destroy?.();
		_.#frameEngine?.destroy?.();

		// clean up announcement element
		if (_.#announcements?.parentNode) {
			_.#announcements.parentNode.removeChild(_.#announcements);
		}
		_.#announcements = null;

		_.#eventEmitter?.removeAllListeners?.();
	}
}

// No alias needed anymore - class is already named Tarot!

class TarotViewport extends HTMLElement {
	constructor() {
		super();
	}
}

class TarotSlides extends HTMLElement {
	constructor() {
		super();
	}
}

class TarotSlide extends HTMLElement {
	// This is the index the slide will render at
	// The SlideManager uses this to loop slides on the track
	// The renderIndex might be different from the slide index
	// #renderIndex;

	constructor() {
		super();

		// the original slide index position loaded from the DOM (logical index)
		this.index = 0;
		// the render index of the slide on the track
		// used by the slide manager to loop the slides around the viewport
		this.renderIndex = 0;
		// whether this slide is currently selected
		this.selected = false;
		// the original slide index position loaded from the DOM
		this.trackPosition = 0;
		// renderPosition - the final render position used in the DOM
		// usually used after trimming the slides on the left and right
		this.renderPosition = 0;
		// the center point of the slide based on the renderIndex
		// used in transform regions to calculate the percent
		// between two points on the track to apply transforms
		this.centerPoint = 0;
	}
}

class TarotContent extends HTMLElement {
	constructor() {
		super();
	}
}

class TarotSlideIcon extends HTMLElement {
	constructor() {
		super();
	}
}

customElements.define('tarot-viewport', TarotViewport);
customElements.define('tarot-slides', TarotSlides);
customElements.define('tarot-slide', TarotSlide);
customElements.define('tarot-content', TarotContent);
customElements.define('tarot-slide-icon', TarotSlideIcon);

// styles

// Core plugins are now built-in to Tarot

// register as custom element (class name != tag name is totally normal!)
customElements.define('tarot-carousel', Tarot);

export { Tarot, TarotEffect, Tarot as default };
//# sourceMappingURL=tarot.esm.js.map
