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

class ButterflyEffect extends TarotEffect {
  static effectName = 'butterfly';

  static rules = {
    min_slideWidth: 1,
    max_slideWidth: Infinity,
    min_slidesPerView: 1,
    max_slidesPerView: Infinity,
    loopBuffer: { left: 2, right: 2 },
  };

  // @param {object} ctx - the shared context object
  constructor(ctx) {
    super(ctx);
    const _ = this;

    // how many named points to compute on each side (l1..l3 and r1..r3)
    _.stepsLeft = 3;
    _.stepsRight = 3;

    // target scales for bands
    _.L1Scale = 0.85;
    _.L2Scale = 0.7;
    _.L3Scale = 0.7; // same as l2 to keep l3 constant like butterfly.js

    // angles are computed in calculateWidths()
    _.L1Angle = 0;
    _.L2Angle = 0;
    _.L3Angle = 0;

    // cached geometry
    _.slideWidth = 0;
    _.gapWidth = 0;
    _.slideAndGapWidth = 0;

    _.init();
  }

  init() {
    super.init();
    // calculateWidths will be called from render with frame data
  }

  reInit() {
    super.reInit();
    // calculateWidths will be called from render with frame data
  }

  /**
   * re-calc geometry and target angles whenever layout/options change
   * (also calls super.reInit() to regenerate named points)
   */
  calculateWidths(frameWidths) {
    const _ = this;

    _.viewportWidth = frameWidths.viewport;

    // cache geometry from carousel
    _.slideWidth = _.viewportWidth / 2;
    _.gapWidth = frameWidths.gap;
    _.slideAndGapWidth = _.slideWidth + _.gapWidth;

    // set slide width on viewport
    _.ctx.viewport.style.setProperty('--tarot-slide-width', `${_.slideWidth}px`);

    // compute target rotation angles so that projected widths land nicely in side space
    const sideSpace = _.slideWidth / 2 - _.gapWidth * 2;

    const w1 = _.slideWidth * _.L1Scale;
    const w2 = _.slideWidth * _.L2Scale;
    const w3 = _.slideWidth * _.L3Scale;

    // desired projected widths on each band (same proportions as butterfly.js)
    const target1 = sideSpace * 0.6;
    const target2 = sideSpace * 0.4;
    const target3 = sideSpace * 0.4; // l3 matches l2

    _.L1Angle = _.getAngleFromFinalWidth(w1, target1);
    _.L2Angle = _.getAngleFromFinalWidth(w2, target2);
    _.L3Angle = _.getAngleFromFinalWidth(w3, target3);
  }

  // ------------------------- math helpers -------------------------

  /**
   * calculates the projected width after rotatey(angle) under perspective(perspective)
   * with transform-origin: left|right center (symmetric for width)
   * @param {number} angleDeg - rotation in degrees
   * @param {number} originalWidth - pre-transform width in pixels
   * @param {number} [perspective=this.perspective] - perspective distance in px
   * @returns {number} final width in px
   */
  getRotatedWidth(angleDeg, originalWidth, perspective = 1500) {
    const radians = (angleDeg * Math.PI) / 180;
    return (
      (originalWidth * Math.cos(radians)) / (1 + (originalWidth * Math.sin(radians)) / perspective)
    );
  }

  /**
   * returns the y-rotation (deg) that produces finalWidth under perspective(p) rotatey(theta)
   * with transform-origin: left center
   * @param {number} originalWidth - original width before transforms
   * @param {number} finalWidth - desired projected width
   * @param {number} [p=this.perspective] - perspective distance
   * @returns {number|null} angle in degrees or null if impossible
   */
  getAngleFromFinalWidth(originalWidth, finalWidth, perspective = 1500) {
    if (finalWidth >= originalWidth) return 0;
    if (finalWidth <= 0 || originalWidth <= 0 || perspective <= 0) return null;

    const r = (originalWidth * finalWidth) / perspective;
    const A = originalWidth * originalWidth + r * r;
    const B = 2 * finalWidth * r;
    const C = finalWidth * finalWidth - originalWidth * originalWidth;

    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    const root1 = (-B + sqrtDisc) / (2 * A);
    const root2 = (-B - sqrtDisc) / (2 * A);

    const sinTheta = root1 >= 0 && root1 <= 1 ? root1 : root2 >= 0 && root2 <= 1 ? root2 : null;
    if (sinTheta === null) return null;

    return (Math.asin(sinTheta) * 180) / Math.PI;
  }

  // ------------------------- band applicators (left) -------------------------

  /**
   * l1 band: between cl1 → l1
   * @param {HTMLElement} slide - slide element
   * @param {number} percent - 0 at l1 → 1 at cl1
   */
  applyL1(slide, percent) {
    // interpolate scale up to 1 and rotation down to 0 as we approach the center
    const scaleAmount = this.L1Scale + (1 - this.L1Scale) * percent;
    const rotateAmount = this.L1Angle * (1 - percent);
    slide.style.transformOrigin = 'left center';
    slide._scaleTransform = `scale(${scaleAmount})`;
    slide._rotateTransform = `rotateY(${rotateAmount}deg)`;
    slide.leftWidthTrimmed =
      this.slideWidth - this.getRotatedWidth(rotateAmount, this.slideWidth * scaleAmount);
  }

  /**
   * l2 band: between l1 → l2
   * @param {HTMLElement} slide - slide element
   * @param {number} percent - 0 at l2 → 1 at l1
   */
  applyL2(slide, percent) {
    const p = 1 - percent;
    const scaleAmount = this.L1Scale + (this.L2Scale - this.L1Scale) * p;
    const rotateAmount = this.L1Angle + (this.L2Angle - this.L1Angle) * p;
    slide.style.transformOrigin = 'left center';
    slide._scaleTransform = `scale(${scaleAmount})`;
    slide._rotateTransform = `rotateY(${rotateAmount}deg)`;
    slide.leftWidthTrimmed =
      this.slideWidth - this.getRotatedWidth(rotateAmount, this.slideWidth * scaleAmount);
  }

  /**
   * l3 band: between l2 → l3 (kept constant like butterfly.js)
   * @param {HTMLElement} slide - slide element
   * @param {number} percent - 0 at l3 → 1 at l2 (unused; kept for symmetry)
   */
  applyL3(slide, percent) {
    const p = 1 - percent; // included for completeness; l3 == l2 in this effect
    const scaleAmount = this.L2Scale + (this.L3Scale - this.L2Scale) * p;
    const rotateAmount = this.L2Angle + (this.L3Angle - this.L2Angle) * p;
    slide.style.transformOrigin = 'left center';
    slide._scaleTransform = `scale(${scaleAmount})`;
    slide._rotateTransform = `rotateY(${rotateAmount}deg)`;
    slide.leftWidthTrimmed =
      this.slideWidth - this.getRotatedWidth(rotateAmount, this.slideWidth * scaleAmount);
  }

  // ------------------------- band applicators (right) -------------------------

  /**
   * r1 band: between cr1 → r1
   * @param {HTMLElement} slide - slide element
   * @param {number} percent - 0 at cr1 → 1 at r1
   */
  applyR1(slide, percent) {
    const scaleAmount = 1 + (this.L1Scale - 1) * percent;
    const rotateAmount = this.L1Angle * percent;
    slide.style.transformOrigin = 'right center';
    slide._scaleTransform = `scale(${scaleAmount})`;
    slide._rotateTransform = `rotateY(-${rotateAmount}deg)`;
    slide.rightWidthTrimmed =
      this.slideWidth - this.getRotatedWidth(rotateAmount, this.slideWidth * scaleAmount);
  }

  /**
   * r2 band: between r1 → r2
   * @param {HTMLElement} slide - slide element
   * @param {number} percent - 0 at r1 → 1 at r2
   */
  applyR2(slide, percent) {
    const scaleAmount = this.L1Scale + (this.L2Scale - this.L1Scale) * percent;
    const rotateAmount = this.L1Angle + (this.L2Angle - this.L1Angle) * percent;
    slide.style.transformOrigin = 'right center';
    slide._scaleTransform = `scale(${scaleAmount})`;
    slide._rotateTransform = `rotateY(-${rotateAmount}deg)`;
    slide.rightWidthTrimmed =
      this.slideWidth - this.getRotatedWidth(rotateAmount, this.slideWidth * scaleAmount);
  }

  /**
   * r3 band: between r2 → r3 (kept constant like butterfly.js)
   * @param {HTMLElement} slide - slide element
   * @param {number} percent - 0 at r2 → 1 at r3 (unused; kept for symmetry)
   */
  applyR3(slide, percent) {
    const scaleAmount = this.L2Scale + (this.L3Scale - this.L2Scale) * percent;
    const rotateAmount = this.L2Angle + (this.L3Angle - this.L2Angle) * percent;
    slide.style.transformOrigin = 'right center';
    slide._scaleTransform = `scale(${scaleAmount})`;
    slide._rotateTransform = `rotateY(-${rotateAmount}deg)`;
    slide.rightWidthTrimmed =
      this.slideWidth - this.getRotatedWidth(rotateAmount, this.slideWidth * scaleAmount);
  }

  // ------------------------- main render -------------------------

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

    // Update cached widths for this frame
    _.calculateWidths(widths);

    // Butterfly effect controls both slide width and track position in DOM
    _.renderSlideWidth(_.slideWidth);
    _.renderTrackPosition(animation);

    // Note: frame utils already handle track position conversion internally,
    // so we don't need to convert to positive here

    // slides are already sorted by render index from frame engine
    const slidesArray = [...slides];

    // pass 1: classify each slide, compute trims and transforms
    for (let i = 0, n = slidesArray.length; i < n; i++) {
      const slide = slidesArray[i];

      // Frame engine has already set trackPosition and centerPoint properties

      // reset derived props
      slide.leftWidthTrimmed = 0;
      slide.rightWidthTrimmed = 0;
      slide._scaleTransform = '';
      slide._rotateTransform = '';

      // place at its track position before trimming
      // slide.renderPosition = slide.trackPosition;

      // check bands using frame utils (order matters)
      // Note: utils.isSlideInRange already handles track position conversion
      const inL1 = utils.isSlideInRange(slide, 'CL1', 'L1');
      if (inL1.isInRange) {
        _.applyL1(slide, inL1.percent);
        continue;
      }

      const inL2 = utils.isSlideInRange(slide, 'L1', 'L2');
      if (inL2.isInRange) {
        _.applyL2(slide, inL2.percent);
        continue;
      }

      const inL3 = utils.isSlideInRange(slide, 'L2', 'L3');
      if (inL3.isInRange) {
        _.applyL3(slide, inL3.percent);
        continue;
      }

      const inR1 = utils.isSlideInRange(slide, 'CR1', 'R1');
      if (inR1.isInRange) {
        _.applyR1(slide, inR1.percent);
        continue;
      }

      const inR2 = utils.isSlideInRange(slide, 'R1', 'R2');
      if (inR2.isInRange) {
        _.applyR2(slide, inR2.percent);
        continue;
      }

      const inR3 = utils.isSlideInRange(slide, 'R2', 'R3');
      if (inR3.isInRange) {
        _.applyR3(slide, inR3.percent);
        continue;
      }
    }

    // pass 2: accumulate right trims and shift slides left
    let totalRightTrim = 0;
    for (let i = 0, n = slidesArray.length; i < n; i++) {
      const slide = slidesArray[i];
      totalRightTrim += slide.rightWidthTrimmed || 0;
      slide.renderPosition = slide.trackPosition - totalRightTrim;
    }

    // pass 3: accumulate left trims and apply transforms to DOM
    let totalLeftTrim = 0;
    for (let i = slidesArray.length - 1; i >= 0; i--) {
      const slide = slidesArray[i];
      totalLeftTrim += slide.leftWidthTrimmed || 0;
      slide.renderPosition += totalLeftTrim;

      // commit transforms
      slide.style.transform =
        `translateX(${slide.renderPosition}px) ` +
        `perspective(1500px) ` +
        `${slide._scaleTransform || ''} ` +
        `${slide._rotateTransform || ''}`;
    }
  }

  // clean up any style hooks
  destroy() {
    const _ = this;
    if (_.ctx?.viewport?.style) {
      _.ctx.viewport.style.removeProperty('--tarot-slide-width');
    }
    super.destroy();
  }
}


// Smart auto-registration - works with ESM bundlers and CDN/UMD
if (typeof Tarot !== 'undefined') {
  Tarot.registerEffect(ButterflyEffect);
}

export { ButterflyEffect as default };
