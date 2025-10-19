# Tarot Carousel Development Guide

A sophisticated, modular web component carousel system built with modern JavaScript and an event-driven architecture.

## Build Commands

- Build: `npm run build` - Production build
- Development: `npm run dev` - Watch mode with development settings
- Production: `npm run prod` - Watch mode with production settings
- Format: `npm run format` - Run prettier on the codebase
- Lint: `npm run lint` - Run ESLint on src/ and rollup.config.mjs

## Code Style Guidelines

- **Imports**: Use ES Modules with explicit paths
- **Naming**: PascalCase for classes, camelCase for methods/variables, # prefix for private fields
- **Formatting**: Tabs for indentation, semicolons required, braces on same line
- **Classes**: OOP patterns with initialization in constructor→init(), static registration methods
- **Variables**: Use `const _ = this;` for context preservation in classes, group declarations at top
  - If the function has < 4 lines of code or only calls 'this' a few times then don't use `const _ = this;` to maintain brevity and keep the code shorter - less code that's easier to read is the goal.
- **Error Handling**: Try/catch in critical sections, defensive programming with null checks
- **Documentation**: JSDoc for methods, document params/returns, use inline comments for complex logic
- **Architecture**: Web Component based with modular design, plugin system, and event-driven communication

## Project Structure

- `src/` - Source code
  - `scripts/` - JavaScript modules
    - `core/` - Core carousel infrastructure
      - `utils/` - Helper functions and tools
    - `effects/` - Visual effect implementations (core + optional)
    - `plugins/` - Core feature plugins (built-in)
    - `core/lib/` - Foundational primitives (EventEmitter, PhysicsEngine)
  - `effect-entries/` - Individual effect entry points for optional effects
  - `styles/` - SCSS stylesheets
- `dist/` - Distribution files
  - `effects/` - Individual optional effect files
- `demo/` - Demo implementations
  - `effects/` - Individual optional effect files for GitHub Pages

## Core vs Optional Effects

### Core Package (Always Included)
The main `@magic-spells/tarot` package includes:
- **Core Effects**: `carousel` and `fade` (most commonly used)
- **Core Plugins**: `autoplay`, `buttons`, `lazy-load`, `pagination`, `scrollbar` (essential functionality)

### Optional Effects (Tree-shakable)
Advanced visual effects are available as separate imports:
- `butterfly`, `cube`, `flip`, `peacock`, `ripple`, `sliding-window`, `spotlight`, `stack`

### Usage Patterns

**Basic usage (core functionality only):**
```javascript
import Tarot from '@magic-spells/tarot';
// Gets carousel + fade effects + all core plugins built-in
```

**With optional effects:**
```javascript
import Tarot from '@magic-spells/tarot';
import CubeEffect from '@magic-spells/tarot/effects/cube';
import ButterflyEffect from '@magic-spells/tarot/effects/butterfly';

// Register optional effects
Tarot.registerEffect(CubeEffect);
Tarot.registerEffect(ButterflyEffect);
```

**CDN usage:**
```html
<script type="module">
  import Tarot from 'https://unpkg.com/@magic-spells/tarot';
  import CubeEffect from 'https://unpkg.com/@magic-spells/tarot/effects/cube.js';
  
  Tarot.registerEffect(CubeEffect);
</script>
```

## Architecture Overview

### Core Architecture Pattern: Context-Driven Modular Design

The Tarot Carousel follows a sophisticated modular architecture where all core managers receive a shared **context object (`ctx`)** rather than the full carousel instance. This design provides several key benefits:

1. **Reduced coupling** - Managers only access what they need via explicit context properties
2. **Clear API boundaries** - The frozen context object defines exactly what's available to managers
3. **Easier testing** - Mock contexts can be provided for isolated unit testing
4. **Performance** - Smaller surface area and frozen objects reduce memory overhead and prevent accidental mutations
5. **Maintainability** - Changes to the carousel class don't affect managers unless the context changes

### The Context Object (`ctx`)

The context object is created in `TarotCarousel#createModuleContext()` and serves as the central communication hub:

```javascript
const ctx = Object.freeze({
  // Event system
  emitter: eventEmitterInstance,    // Pub/sub event bus
  events: EVENTS,                   // Event name constants

  // Centralized data store
  store: dataStoreInstance,         // Single source of truth for all state

  // DOM references
  carousel: carouselElement,        // Host custom element
  viewport: viewportElement,        // Scrollable container
  track: trackElement,              // Slides container

  // Utilities
  utils: utilityFunctions,          // Helper functions

  // Commands (imperative API)
  commands: {
    goToSlide: (index, velocity) => ...,
    jumpToSlide: (index) => ...,
    getEffect: () => ...
  }
});
```

All core managers receive this frozen context object, ensuring consistent access patterns and preventing accidental mutations.

## Data Store: Centralized State Management

**Location**: `src/scripts/core/data-store.js`

The DataStore serves as the single source of truth for all carousel state, implementing a pub/sub pattern where all state changes emit events automatically.

### Data Structure

The store manages five main data slices:

#### 1. Options Slice

```javascript
// User configuration and defaults
{
  effect: 'carousel',           // Active effect name
  loop: false,                  // Enable infinite looping
  slidesPerView: 1,            // Visible slides count
  slidesPerMove: 1,            // Slides to move per navigation
  centerSelectedSlide: false,   // Center the active slide
  breakpoints: {},            // Breakpoint options
  // ... additional options
}
```

#### 2. State Slice

```javascript
// Runtime carousel state
{
  trackPosition: 0,       // Current track transform position
  selectedIndex: 0,       // Logically selected slide
  renderIndex: 0,         // Currently rendered/visible slide
  pageIndex: 0,          // Current page in pagination
  pageCount: 1,          // Total number of pages
  isDragging: false,     // User drag state
  slideCount: 0          // Total slides available
}
```

#### 3. Widths Slice

```javascript
// Layout measurements (recalculated on resize)
{
  viewport: 1200,        // Viewport container width
  track: 2400,          // Total track width
  slide: 400,           // Individual slide width
  slideMin: 200,        // Minimum slide width
  gap: 20,              // Gap between slides
  slideAndGap: 420,     // slide + gap combined
  paddingLeft: 40,      // Left viewport padding
  paddingRight: 40      // Right viewport padding
}
```

#### 4. Slides Slice

```javascript
// Array of slide DOM elements (actual <tarot-slide> elements)
// Note: Slides are the actual DOM elements, not wrapper objects
// Properties are set directly on the DOM elements:
// slide.renderIndex - Current render position
// slide.trackPosition - X position in track coordinates
// slide.centerPoint - Center point for range calculations
// slide.renderPosition - Final render position on track
```

#### 5. Transform Points Slice

```javascript
// Named positions for effects (calculated by calculateTransformPoints in metrics.js)
// These values represent the center points of the slides on the viewport
// If slide is 400px wide with 0px gap and 2 slides per view:
{
  'L3': -1000,    // Far left position
  'L2': -600,    // Medium left
  'L1': -200,    // Near left
  'CL1': 200,      // Center left 1
  'CL2': 600,      // Center left 2
  'CR2': 200,      // Center right 2
  'CR1': 600,      // Center right 1
  'R1': 1000,     // Near right
  'R2': 1400,     // Medium right
  'R3': 1800      // Far right position
}
// Notice how CLN and CRN have the same values but in the opposite direction
```

#### 6. Animation Slice

```javascript
// Current animation data for frame-based rendering
{
  type: 'animate',          // 'animate' | 'jump' | 'settle' | 'drag'
  trackPosition: 0,         // Current track transform position
  trackDelta: 0,            // Change in track position this frame
  velocity: 0,              // Current velocity
  progress: 1,              // Animation progress (0-1)
  isAnimating: false        // Whether animation is active
}
```

### Store API Methods

The DataStore provides type-safe methods for all mutations. Every setter automatically emits the appropriate events:

```javascript
// Options management
store.getOptions(); // Returns frozen options copy
store.setOptions({ loop: true }); // Merges patch, emits 'options:changed'

// State management
store.getState(); // Returns frozen state copy
store.setState({ selectedIndex: 2 }); // Merges patch, emits 'state:changed' + fine-grained events

// Layout management
store.getWidths(); // Returns frozen widths copy
store.setWidths(newWidths); // Replaces all widths, emits 'layout:changed'

// Slides management
store.getSlides(); // Returns frozen slides array
store.setSlides(slideDescriptors); // Replaces slides, syncs slideCount, emits 'slides:changed'

// Transform points (used by effects)
store.getTransformPoints(); // Returns frozen points object
store.setTransformPoints(points); // Updates points, emits 'transform-points:changed'

// Animation data for frame-based rendering
store.getAnimation(); // Returns frozen animation copy
store.setAnimation(animationData); // Updates animation state
store.clearAnimation(); // Resets animation to default state
// Whenever the datastore data changes it's marked as dirty and the frame engine is notified and request a new rAF so that the effect is re-rendered in the DOM with the new data.
```

### Important Store Patterns

1. **Immutability** - All getters return frozen copies to prevent accidental mutations
2. **Event-Driven Animation** - Animation requests are handled via events, not direct store methods
3. **Auto Events** - Every mutation automatically emits the appropriate event(s)
4. **Fine-grained Events** - State changes emit both coarse and fine-grained events for flexibility

## Event System: Comprehensive Pub/Sub Architecture

**Location**: `src/scripts/core/events.js`

The event system provides fine-grained notifications for all carousel operations, enabling loose coupling between modules.

### Event Categories

#### Store Events

```javascript
// Data changes
'options:changed'; // { prevOptions, nextOptions }
'state:changed'; // { prevState, nextState }
'layout:changed'; // { prevWidths, nextWidths }
'slides:changed'; // { count }

// Fine-grained selection events
'selected-index:changed'; // { oldIndex, newIndex }
'render-index:changed'; // { oldIndex, newIndex }
'page-index:changed'; // { oldPageIndex, newPageIndex }
'page-count:changed'; // { count }
'transform-points:changed'; // { prevPoints, nextPoints }
```

#### Animation Events

```javascript
'animation:requested'; // { renderIndex, pageIndex, velocity, type, timestamp }
'animation:started'; // { renderIndex, pageIndex, velocity, type }
'animation:completed'; // { renderIndex, pageIndex, type }
```

#### User Interaction Events

```javascript
'drag:start'; // { x, y, pointerId }
'drag:move'; // { x, y, pointerId }
'drag:end'; // { x, y, velocityX, velocityY, pointerId }
'drag:cancel'; // { reason }

'slides:click'; // { index, renderIndex, event }
'user:interacted'; // { via: 'hover'|'drag'|'click'|'wheel'|'key'|'focus', event }
```

#### Lifecycle Events

```javascript
'carousel:init'; // { }
'carousel:ready'; // { }
'carousel:reinit'; // { reason }
'carousel:destroy'; // { }

'effect:loaded'; // { effect, effectName }
'effect:changed'; // { previousEffect, currentEffect, effectName }
'effect:destroyed'; // { effectName }
```

#### Environment Events

```javascript
'window:resize'; // { }
'window:visibility-change'; // { hidden: boolean }
'window:has-focus'; // { }
'window:lost-focus'; // { }
```

### Event Usage Patterns

**Subscribing to events:**

```javascript
// In manager constructors
ctx.emitter.on(ctx.events.store.optionsChanged, this.handleOptionsChange);
ctx.emitter.on(ctx.events.animation.requested, this.handleAnimationRequest);
```

**Emitting events (done automatically by store):**

```javascript
// Store methods automatically emit appropriate events
ctx.store.setState({ selectedIndex: 2 }); // Emits 'selected-index:changed'
ctx.store.setOptions({ loop: true }); // Emits 'options:changed'
```

## Core Manager Architecture

All core managers follow consistent patterns for lifecycle management and event handling:

### Manager Base Pattern

```javascript
export default class ManagerName {
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx; // Store frozen context reference

    // Define all event handlers upfront for clean binding/unbinding
    _.handlers = {
      eventName: (payload) => _.handleEvent(payload),
      // Arrow functions preserve 'this' context
    };

    _.bindEvents(); // Subscribe to events
    _.init(); // Perform initial setup
  }

  init() {
    // Initial setup logic
    // Called once when manager is created
  }

  reInit() {
    // Reinitialize when configuration changes
    // Called when options change or window resizes
  }

  bindEvents() {
    // Subscribe to relevant events using handlers object
    const { emitter, events } = this.ctx;
    emitter.on(events.store.optionsChanged, this.handlers.optionsChanged);
  }

  destroy() {
    // Cleanup: unsubscribe from all events
    const { emitter, events } = this.ctx;
    emitter.off(events.store.optionsChanged, this.handlers.optionsChanged);
    // Release any resources
  }
}
```

### Manager Initialization Order

Managers are created in a specific order in `TarotCarousel.connectedCallback()`:

1. **OptionsManager** - Handles user options and validation
2. **WindowEvents** - Monitors window resize, focus, visibility
3. **SlideManager** - Manages slide DOM elements and filtering
4. **EffectManager** - Loads and manages visual effects
5. **DragHandler** - Handles pointer/touch/mouse interactions
6. **TrackAnimator** - Physics-based animation engine
7. **TrackManager** - Coordinates slide positioning and animation requests
8. **FrameEngine** - Aggregates and coordinates rendering frames

### Key Managers

#### SlideManager (`src/scripts/core/slide-manager.js`)

- **Purpose**: DOM slide management, wrapping, filtering
- **Responsibilities**:
  - Ensures all content is wrapped in `<tarot-slide>` elements
  - Handles slide filtering by CSS class
  - Manages MutationObserver for dynamic content
  - Updates slide selection states
  - Preps slides for rendering in the frame engine by setting the slides.renderIndex value and sorting the array before being passed to the effect.render() function
- **Key Methods**: `wrapSlides()`, `loadFilteredSlides()`, `renderSelectedIndex()`

#### TrackManager (`src/scripts/core/track-manager.js`)

- **Purpose**: Coordinate track position and animation requests
- **Responsibilities**:
  - Convert slide indices to track positions
  - Coordinate with TrackAnimator for actual movement
    - TrackAnimator handles looping logic for infinite carousels
  - Emit animation lifecycle events
- **Key Methods**: `animateToSlide()`, `getTrackPosForIndex()`, `settleTrack()`

#### EffectManager (`src/scripts/core/effect-manager.js`)

- **Purpose**: Load and manage visual effects
- **Responsibilities**:
  - Load effect classes from registry
  - Handle effect switching and cleanup
  - Provide effect rules and configuration
  - Emit effect lifecycle events
- **Key Methods**: `loadEffect()`, `getRules()`, `getEffect()`

#### FrameEngine (`src/scripts/core/frame-engine.js`)

- **Purpose**: Coordinate rendering pipeline using frame-based architecture
- **Responsibilities**:
  - Aggregate frame data (state, widths, slides, animation)
  - Pass frames to active effect's render method
  - Manage rendering lifecycle
  - Emit frame lifecycle events
  - Runs main rAF loop and tells the physics engine to render next frame
- **Key Methods**: `requestFrame()`, `onFrame()`, `renderFrame()`

#### ClassManager (`src/scripts/core/class-manager.js`)

- **Purpose**: Manage DOM class and ARIA state updates
- **Responsibilities**:
  - Update slide visibility classes based on viewport position
  - Manage ARIA attributes for accessibility
  - Handle focus management
  - Coordinate with frame engine for efficient updates
- **Key Methods**: `updateSlides()`, `updateVisibility()`

##### Frame-Based Architecture

The FrameEngine implements a sophisticated frame-based rendering pipeline borrowed from game engine architecture:

1. **Frame as Snapshot**: Each render cycle creates an immutable "frame" object containing the complete carousel state at that moment
2. **Data Aggregation**: All rendering data is collected into a single frozen object before processing
3. **Unidirectional Data Flow**: The frozen frame ensures data flows in one direction through the pipeline without side effects

##### Frame Object Structure

```javascript
const frame = Object.freeze({
  state, // All carousel state: trackPosition, displayIndex, page, etc.
  widths, // All measured widths: viewport, slide, gap, etc.
  slides, // Sorted slides array with calculated positions
  animation, // {trackPosition, trackDelta, velocity, progress, animationType}
  drag, // {x, velocity} or null if not dragging
  transformPoints, // Named position points from store
});
```

##### Processing Pipeline

1. **Frame Request** → Triggered by animation updates or user interactions
2. **Data Aggregation** → Collect state, widths, slides, animation, drag data
3. **Slide Preparation** → Update render indices, sort slides, calculate positions
4. **Before Render Event** → Extension point for plugins
5. **Effect Rendering** → Pass frame to active effect's render method
6. **Class/ARIA Updates** → Update DOM states via ClassManager
7. **After Render Event** → Extension point for post-processing

This architecture provides:

- **Predictability**: Each frame is self-contained with all needed data
- **Testability**: Effects become pure functions transforming frame data
- **Extensibility**: Before/after render events allow non-invasive plugins
- **Debugging**: Frames can be logged/replayed for debugging

## Effect System

**Base Class**: `src/scripts/effects/tarot-effect.js`

Effects handle the visual presentation and transform logic for slides.

### Effect Structure

```javascript
export default class CustomEffect extends TarotEffect {
  static effectName = 'custom'; // Registration name

  static rules = {
    // Layout constraints
    min_slideWidth: 1,
    max_slideWidth: Infinity,
    min_slidesPerView: 1,
    max_slidesPerView: Infinity,
    loopBuffer: { left: 0, right: 0 },
  };

  constructor(ctx) {
    super(ctx); // Receives context, not carousel
    this.init();
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
    const { slides, widths, state, animation } = frame;
    // Transform slides based on effect logic
    slides.forEach((slide) => {
      // Apply transforms using slide.style.transform
    });
  }
}
```

### Transform Points System

The base `TarotEffect` class provides a named point system for consistent positioning:

```javascript
// Generated automatically based on viewport and slide dimensions
// Named positions for effects (calculated by calculateTransformPoints in metrics.js)
// These example values represent the center points of the slides on the viewport
// If slide is 400px wide with 0px gap and 2 slides per view:
transformPoints = {
  L3: -1000, // Far left position
  L2: -600, // Medium left
  L1: -200, // Near left
  CL1: 200, // Center left 1
  CL2: 600, // Center left 2
  CR2: 200, // Center right 2
  CR1: 600, // Center right 1
  R1: 1000, // Near right
  R2: 1400, // Medium right
  R3: 1800, // Far right position
};
```

Effects use these points with helper methods:

```javascript
// Check if slide is between two named points
const inRange = this.isSlideInRange(slide, 'L1', 'CL1', trackPosition);
if (inRange.isInRange) {
  // Apply transforms based on inRange.percent (0-1)
  continue;
}
```

### Frame-Based Rendering with Utilities

**Location**: `src/scripts/core/utils/frame-utils.js`

Effects receive a complete frame object and utility functions via dependency injection. This modern architecture provides better separation of concerns, testability, and reusability.

#### Effect Render Signature

```javascript
render(frame, utils) {
  const { slides, widths, state, animation, transformPoints } = frame;

  // Use utilities for position calculations
  const { isInRange, percent } = utils.isSlideInRange(slide, 'CR1', 'R1');
}
```

#### Frame Object Structure

The frame contains all data needed for rendering:

```javascript
const frame = Object.freeze({
  state: { trackPosition, selectedIndex, renderIndex, pageIndex, ... },
  widths: { viewport, slide, gap, slideAndGap, ... },
  slides: [...slideElements], // Array of <tarot-slide> DOM elements with calculated positions
  animation: { type, velocity, progress, isAnimating, ... },
  transformPoints: { L1: -420, C: 0, R1: 420, ... }, // Named position points
  options: { loop, slidesPerView, ... }
});
```

#### Utility Functions

**`utils.getPointValue(pointName)`**

- Resolves named points like `'L1'`, `'CL1'`, `'R2'` to absolute positions
- Supports infinite sentinels: `'L+'` → `-Infinity`, `'R+'` → `Infinity`
- Automatically offsets by current track position

**`utils.getRange(pointNameA, pointNameB)`**

- Returns `{ start, end }` range between two named points
- Always returns with `start >= end` for consistent calculations

**`utils.isSlideInRange(slide, pointNameA, pointNameB)`**

- Checks if slide's center is within the given point range
- Returns `{ isInRange: boolean, percent: number, start: number, end: number }`
- `percent` is 0-1 progress through the range (0 = at end, 1 = at start)

#### Example Effect Implementation

```javascript
export default class FadeEffect {
  static effectName = 'fade';

  render(frame, utils) {
    const { slides } = frame;

    slides.forEach((slide) => {
      // Check if slide is in the visible range
      const { isInRange, percent } = utils.isSlideInRange(slide, 'L1', 'R1');

      if (isInRange) {
        // Fade based on distance from center
        const centerDistance = Math.abs(percent - 0.5) * 2; // 0-1
        const opacity = 1 - centerDistance;
        slide.style.opacity = opacity;
        slide.style.transform = `translateX(${slide.trackPosition}px)`;
      } else {
        slide.style.opacity = 0;
      }
    });
  }
}
```

#### Slide Properties

Each slide element has positioning properties calculated by the frame engine:

```javascript
// Properties set on <tarot-slide> DOM elements
slide.renderIndex = 2; // Current render position
slide.trackPosition = 840; // X position in track coordinates
slide.centerPoint = 1040; // Center point (trackPosition + slideWidth/2)
slide.renderPosition = 0; // The final render position of the slide
```

#### Frame Utils Benefits

1. **Pure Functions**: Utilities are stateless and predictable
2. **Dependency Injection**: No inheritance or complex binding patterns
3. **Testability**: Utils can be unit tested independently
4. **Reusability**: Multiple effects share the same utilities
5. **Performance**: Pre-bound functions with frame data
6. **Modern Pattern**: Follows React hooks/Vue composables architecture

## Plugin System

**Example**: `src/scripts/plugins/buttons.js`

Plugins extend carousel functionality and can receive either the context object or full carousel instance depending on the plugin:

```javascript
export default class PluginName {
  constructor(ctx) {
    this.ctx = ctx; // Context object (recommended)
    this.handlers = {
      // Event handlers
    };
    this.init();
  }

  init() {
    // Plugin setup
    this.bindEvents();
  }

  bindEvents() {
    // Subscribe to context events
    this.ctx.emitter.on(this.ctx.events.eventName, this.handlers.eventHandler);
  }

  destroy() {
    // Cleanup
    this.ctx.emitter.off(this.ctx.events.eventName, this.handlers.eventHandler);
  }
}

// Registration
TarotCarousel.use(PluginName);
```

## Scrollbar Plugin

**Location**: `src/scripts/plugins/scrollbar.js`

The Scrollbar plugin provides an interactive progress bar with draggable thumb and clickable snap points for precise navigation. It's included as a core plugin and follows the same architecture patterns as other plugins.

### Configuration Options

Add scrollbar options to the `navigation` object in carousel options:

```javascript
{
  navigation: {
    // Scrollbar settings
    showScrollbar: false,              // Enable/disable scrollbar
    scrollbarSelector: false,          // Custom selector for external scrollbar element
    scrollbarPosition: 'bottom',       // 'top' | 'bottom' position relative to carousel
    scrollbarSize: 'normal',           // 'small' | 'normal' | 'large' sizing
    scrollbarAutoHide: false,          // Auto-hide when only one page exists
    scrollbarShowSnapPoints: true,     // Show clickable page indicator dots
    scrollbarClickToNavigate: true,    // Allow clicking track to jump to position
    scrollbarDragToNavigate: true,     // Allow dragging thumb to navigate
  }
}
```

### DOM Structure

The scrollbar generates the following HTML structure:

```html
<div class="tarot-scrollbar tarot-scrollbar--bottom tarot-scrollbar--normal">
  <div class="tarot-scrollbar-track">
    <div class="tarot-scrollbar-snap-points">
      <div class="tarot-scrollbar-snap-point" data-page="0"></div>
      <div class="tarot-scrollbar-snap-point" data-page="1"></div>
      <!-- One snap point per page -->
    </div>
    <div class="tarot-scrollbar-thumb" role="slider" tabindex="0"></div>
  </div>
</div>
```

### Interaction Methods

1. **Drag Navigation**
   - Pointer events (mouse/touch) with unified handling
   - Smooth thumb dragging with real-time position updates
   - Throttled navigation calls for performance
   - Pointer capture prevents conflicts with carousel drag

2. **Click Navigation**
   - Click track to jump to position
   - Click snap points for precise page navigation
   - Respects `scrollbarClickToNavigate` option

3. **Keyboard Navigation**
   - Focus scrollbar thumb with Tab key
   - Arrow Left/Right: Navigate between pages
   - Home/End: Jump to first/last page
   - Respects loop settings for boundary behavior

### External Scrollbar Elements

Use `scrollbarSelector` to render the scrollbar in a custom element:

```html
<tarot-carousel>
  <script type="application/json" data-tarot-options>
    { 
      "navigation": { 
        "showScrollbar": true,
        "scrollbarSelector": "#my-custom-scrollbar" 
      } 
    }
  </script>
  <tarot-viewport>
    <!-- slides -->
  </tarot-viewport>
</tarot-carousel>

<div id="my-custom-scrollbar"></div>
```

### Accessibility Features

- **ARIA Support**: Full `role="slider"` implementation with proper labels
- **Keyboard Navigation**: Complete arrow key and Home/End support
- **Screen Reader**: Updates `aria-valuenow` and descriptive labels
- **Touch Targets**: 44px+ minimum touch targets on mobile devices
- **High Contrast**: Adapts colors for high contrast mode
- **Reduced Motion**: Respects `prefers-reduced-motion` setting

### Styling & Theming

The scrollbar uses CSS custom properties for easy theming:

```css
:root {
  --tarot-scrollbar-height: 8px;
  --tarot-scrollbar-bg: rgba(0, 0, 0, 0.1);
  --tarot-scrollbar-thumb-bg: rgba(0, 0, 0, 0.3);
  --tarot-scrollbar-thumb-hover-bg: rgba(0, 0, 0, 0.5);
  --tarot-scrollbar-border-radius: 4px;
  --tarot-scrollbar-transition: all 0.2s ease;
}
```

Size variants include automatic sizing adjustments:
- **Small**: 4px height, compact appearance
- **Normal**: 8px height, balanced design  
- **Large**: 12px height, prominent visibility

### Integration Points

- **Event System**: Emits `user:interacted` events with `via: 'scrollbar'`
- **Commands API**: Uses `ctx.commands.goToPage()` for navigation
- **Store Coordination**: Listens to page changes, updates visual position
- **Performance**: Throttled updates during drag, debounced renders
- **Lifecycle**: Full init/reInit/destroy cycle with proper cleanup

## Animation Flow

The animation system follows a carefully orchestrated flow with clear separation of concerns:

1. **User Action** → Public API method call (`goToSlide()`, `next()`, `prev()`, etc.)
2. **Event Emission** → Public API methods emit `animation:requested` events with target index and velocity
3. **TrackManager Response** → Listens for `animation:requested`, calculates track position for target slide, handles looping logic
4. **TrackAnimator Execution** → Uses physics engine for smooth, interruptible animations with attraction/friction physics
5. **Position Updates** → TrackAnimator updates store animation data during animation with position, velocity, progress
6. **FrameEngine Coordination** → Aggregates frame data and passes to effect's render method with frame-utils injection
7. **Effect Rendering** → Applies visual transforms to slides based on current track position and animation state
8. **Lifecycle Events** → `animation:started` emitted at begin, `animation:completed` when finished

### Animation Types

- **`animate`** - Smooth animation with velocity and physics
- **`jump`** - Instant position change without animation
- **`settle`** - Return to rest position after drag below threshold

Note: Track shifting for infinite loops is handled transparently within TrackAnimator. Effects receive normal position updates and render accordingly without knowledge of the shift.

## Key Design Principles

1. **Single Source of Truth**: All state lives in DataStore
2. **Event-Driven Communication**: Managers communicate via events, not direct calls
3. **Immutable Data**: All getters return frozen copies to prevent accidental mutations
4. **Context Injection**: Managers receive minimal context, not full carousel
5. **Lifecycle Management**: Consistent init/reInit/destroy patterns
6. **Plugin Architecture**: Optional features as composable plugins
7. **Effect Modularity**: Visual effects as swappable, self-contained modules

## Development Workflow

1. **Adding Features**: Create new managers or plugins following established patterns
2. **State Changes**: Always use DataStore methods to trigger proper events
3. **Event Handling**: Subscribe to fine-grained events for reactive updates
4. **Effect Development**: Extend TarotEffect base class with custom render logic
5. **Testing**: Mock the context object for isolated unit testing
6. **Debugging**: Use event logging to trace state changes and interactions

This architecture enables sophisticated carousel behaviors while maintaining clean separation of concerns and excellent extensibility for custom requirements.

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.

## Macro Software Architecture Patterns

The Tarot Carousel implements several sophisticated architectural patterns:

### 1. Context-Driven Dependency Injection

- **Pattern**: All managers receive a minimal, frozen context object instead of the full carousel instance
- **Benefits**: Reduced coupling, clear API boundaries, easier testing, better performance
- **Implementation**: `createModuleContext()` creates a frozen object with only necessary dependencies

### 2. Centralized State Management (Store Pattern)

- **Pattern**: Single source of truth with immutable getters and event-driven mutations
- **Benefits**: Predictable state changes, automatic event emission, fine-grained reactivity
- **Implementation**: DataStore class with slice-based organization and frozen return values

### 3. Frame-Based Rendering Architecture

- **Pattern**: Game engine inspired rendering pipeline with complete state snapshots
- **Benefits**: Unidirectional data flow, predictable renders, easier debugging
- **Implementation**: FrameEngine aggregates complete state into immutable frame objects

### 4. Event-Driven Communication

- **Pattern**: Comprehensive pub/sub system with detailed event taxonomy
- **Benefits**: Loose coupling, extensibility, clear interaction patterns
- **Implementation**: EventEmitter with namespaced events and consistent payload structures

### 5. Physics-Based Animation System

- **Pattern**: Separate physics engine with external time coordination
- **Benefits**: Natural motion, smooth interruptions, consistent timing
- **Implementation**: PhysicsEngine with attraction/friction and external tick system

### 6. Transform Point System

- **Pattern**: Named positioning system with utility injection
- **Benefits**: Consistent effect development, reusable calculations, clear semantics
- **Implementation**: Transform points (L1, C, R1) with frame-utils dependency injection

### 7. Sophisticated Loop Management

- **Pattern**: Dynamic slide positioning with viewport-based visibility calculation
- **Benefits**: Efficient infinite loops, smooth track shifting, effect-specific optimizations
- **Implementation**: SlideManager with buffer management and automatic repositioning

### 8. Modern Plugin Architecture

- **Pattern**: Static registration with flexible initialization patterns
- **Benefits**: Easy extensibility, clear lifecycle management, context flexibility
- **Implementation**: Static `use()` method with context or carousel instance injection

## Distribution & Build System

The project uses Rollup for building multiple distribution formats:

- **ES Module**: `dist/tarot.esm.min.js`
- **CommonJS**: `dist/tarot.cjs.min.js`
- **UMD**: `dist/tarot.min.js`
- **CSS**: `dist/tarot.min.css`
- **SCSS**: `dist/tarot.scss`

### Build Process

1. **Source Processing**: ES modules compiled and bundled
2. **Style Processing**: SCSS compiled with PostCSS and LightningCSS
3. **Multiple Outputs**: ES, CJS, and UMD formats generated
4. **Development Mode**: Live reload and source maps for debugging

### Package Configuration

The package.json includes proper exports map for modern bundlers:

- `import` → ES module
- `require` → CommonJS
- `default` → ES module fallback

## Performance Considerations

### Frame-Based Optimizations

- **Frozen Objects**: Prevent accidental mutations and enable browser optimizations
- **Batch Updates**: Single render cycle aggregates all changes
- **Dirty Tracking**: Store tracks changes to minimize unnecessary work
- **Half-Pixel Rounding**: Eliminates floating-point precision issues

### Loop Management Optimizations

- **Viewport Culling**: Only processes slides visible in viewport + buffers
- **Effect Buffers**: Each effect can specify additional slides needed for transforms
- **Track Shifting**: Seamless infinite loops without content duplication
- **Position Caching**: Slides cache their calculated positions to avoid recalculation

### Animation Performance

- **Physics Integration**: External tick system synchronized with frame engine
- **Interruptible Animations**: Can smoothly transition between different targets
- **GPU Optimization**: Uses translate3d for hardware acceleration during animations
- **Velocity Preservation**: Maintains momentum across animation transitions

## Effects Usage (Bundlers vs CDN)

Optional effects compile separately and auto-register with Tarot. Choose the approach that matches your environment.

### Bundlers (ESM)

```js
import Tarot from '@magic-spells/tarot';
import Ripple from '@magic-spells/tarot/effects/ripple';

// Ripple auto-registers on import
// If importing dynamically after carousels are connected, re-apply:
// document.querySelectorAll('tarot-carousel').forEach(c => c.updateOptions({ effect: 'ripple' }));
```

### CDN (UMD via <script>)

```html
<!-- Load core UMD (defines global `Tarot`) -->
<script src="https://unpkg.com/@magic-spells/tarot/dist/tarot.min.js"></script>

<!-- Load an optional effect UMD (auto-registers with global `Tarot`) -->
<script src="https://unpkg.com/@magic-spells/tarot/dist/effects/ripple.min.js"></script>

<tarot-carousel>
  <script type="application/json" data-tarot-options>{ "effect": "ripple" }</script>
  <tarot-viewport><tarot-slides><!-- slides --></tarot-slides></tarot-viewport>
</tarot-carousel>
```

Notes:
- Load `tarot.min.js` before any `effects/*.min.js` so the `Tarot` global exists.
- Effects auto-register when their script executes.

### CDN (Native ESM with import map)

```html
<!-- Map the package name to the ESM build -->
<script type="importmap">
{
  "imports": {
    "@magic-spells/tarot": "https://unpkg.com/@magic-spells/tarot/dist/tarot.esm.min.js"
  }
}
</script>

<!-- Import Tarot and an effect (ESM) -->
<script type="module">
  import Tarot from '@magic-spells/tarot';
  // Effect ESM also imports '@magic-spells/tarot', which the import map resolves
  import 'https://unpkg.com/@magic-spells/tarot/dist/effects/ripple.js';
  // Ripple auto-registers on import
}
</script>
```

Notes:
- For native ESM from a CDN, use an import map so the effect files can resolve `@magic-spells/tarot`.
- If effects are imported after carousels have already connected, call `updateOptions({ effect: 'ripple' })` on instances to apply the effect.
