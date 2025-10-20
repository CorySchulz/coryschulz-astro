function init(canvas) {
	const context = canvas.getContext('2d');

	// Motion effects disabled for now
	// const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
	// if (isIOS && typeof DeviceOrientationEvent.requestPermission === 'function') {
	// 	// On iOS, we need user interaction first, so we'll enable on first touch/click
	// 	// This is handled by the existing event listeners below
	// } else {
	// 	// For non-iOS devices, enable immediately
	// 	enableMotion();
	// }

	const colourCount = 6;
	let currentPalette = 0;
	const totalPalettes = 4;
	let autoTransition = true;
	let lastTransitionTime = Date.now();
	const holdDuration = 8000; // 8 seconds hold
	const fadeDuration = 6000; // 6 seconds fade
	const totalCycleDuration = holdDuration + fadeDuration; // 10 seconds total
	let isFading = false;
	let fadeStartTime = 0;
	let nextPalette = 0;
	let baseColors = [];
	let targetColors = [];

	/**
	 * gets colors for a specific palette
	 * @param {number} paletteIndex
	 * @returns {string[]} array of color hex values
	 */
	function getPaletteColors(paletteIndex) {
		// Hardcoded fallbacks for iOS Safari compatibility
		const palettes = [
			// Blue palette
			['#1e3a5f', '#0f2847', '#0d1929', '#162544', '#0a1628', '#1a4d7a'],
			// Magenta/Pink palette
			['#8b1538', '#a91b60', '#6d1b45', '#b91a6b', '#4a0e29', '#9e1854'],
			// Orange palette
			['#f3a840', '#d87c2c', '#ffd47a', '#e28d36', '#c45537', '#e07b3a'],
			// Purple palette
			['#4a148c', '#6a1b9a', '#311b92', '#512da8', '#1a0d40', '#3f1675']
		];

		// Try to get from CSS custom properties first, fallback to hardcoded
		const root = document.documentElement;
		const colors = [];

		for (let i = 0; i < colourCount; i++) {
			const cssColor = getComputedStyle(root).getPropertyValue(`--palette-${paletteIndex}-${i + 1}`).trim();
			colors.push(cssColor || palettes[paletteIndex][i]);
		}

		return colors;
	}

	/**
	 * interpolates between two colors
	 * @param {string} color1 - hex color
	 * @param {string} color2 - hex color
	 * @param {number} t - interpolation factor (0-1)
	 * @returns {string} interpolated hex color
	 */
	function interpolateColor(color1, color2, t) {
		// convert hex to rgb
		const hex2rgb = (hex) => {
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			return result ? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			} : null;
		};

		const rgb1 = hex2rgb(color1);
		const rgb2 = hex2rgb(color2);

		if (!rgb1 || !rgb2) return color1;

		// interpolate each channel
		const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * t);
		const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * t);
		const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * t);

		// convert back to hex
		return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
	}

	let colours = getPaletteColors(currentPalette);

	// Ensure colors are properly initialized for iOS Safari
	if (!colours || colours.some(color => !color || color === '')) {
		colours = ['#f3a840', '#d87c2c', '#ffd47a', '#e28d36', '#c45537', '#e07b3a'];
	}

	const heightFactors = [1.2, 1.05, 1, 0.9, 1.25, 1.1];

	let width, height;
	let time = 0;
	let pointerY = 0.5;
	let pointerX = 0.5;

	const stripeOverlap = 2.3;
	const horizontalStep = 8;
	const baseAmplitude = 120;
	const secondaryAmplitude = 60;
	const waveLength = 0.003;
	const waveSpeed = 0.00008;
	const verticalShiftFactor = 0.10;

	const stripePhases = Array.from({ length: colourCount }, (_, i) => (Math.PI * 2 / colourCount) * i);

	const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

	function resize() {
		width = canvas.width = window.innerWidth;
		height = canvas.height = window.innerHeight;
	}

	function onPointerMove(event) {
		const clientY = event.touches ? event.touches[0].clientY : event.clientY;
		const clientX = event.touches ? event.touches[0].clientX : event.clientX;
		pointerY = clamp(clientY / height);
		pointerX = clamp(clientX / width);
	}

	function onDeviceOrientation(event) {
		// Use device orientation to control wave behavior
		// gamma: left/right tilt (-90 to 90)
		// beta: front/back tilt (-180 to 180)

		if (event.gamma != null && event.beta != null) {
			// Map gamma (-30 to 30) to pointerX (0 to 1) for more sensitivity
			const sensitiveGamma = Math.max(-30, Math.min(30, event.gamma));
			pointerX = clamp((sensitiveGamma + 30) / 60);

			// Map beta (-30 to 30) to pointerY (0 to 1) for more sensitivity
			// Clamp beta to smaller range and invert for intuitive movement
			const sensitiveBeta = Math.max(-30, Math.min(30, event.beta));
			pointerY = clamp(1 - ((sensitiveBeta + 30) / 60));
		}
	}

	// Double tap detection for mobile
	let lastTouchTime = 0;
	const doubleTapDelay = 300; // milliseconds

	/**
	 * handles double click events to cycle through color palettes
	 */
	function onDoubleClick(event) {
		// manual click disables auto-transition
		autoTransition = false;
		isFading = false;

		currentPalette = (currentPalette + 1) % totalPalettes;
		colours = getPaletteColors(currentPalette);

		// update body class for background color
		document.body.className = currentPalette > 0 ? `palette-${currentPalette}` : '';

		// reset transition timer
		lastTransitionTime = Date.now();
	}

	/**
	 * handles touch events with double tap detection
	 */
	function onTouch(event) {
		const currentTime = new Date().getTime();
		const tapLength = currentTime - lastTouchTime;

		if (tapLength < doubleTapDelay && tapLength > 0) {
			// Double tap detected
			onDoubleClick(event);
		}

		lastTouchTime = currentTime;
	}

	function enableMotion() {
		// Check if DeviceOrientationEvent exists
		if (typeof DeviceOrientationEvent === 'undefined') {
			console.log('DeviceOrientationEvent not supported');
			return;
		}

		// iOS 13+ requires permission request
		if (typeof DeviceOrientationEvent.requestPermission === 'function') {
			DeviceOrientationEvent.requestPermission()
				.then(response => {
					console.log('DeviceOrientation permission:', response);
					if (response === 'granted') {
						window.addEventListener('deviceorientation', onDeviceOrientation, true);
						console.log('DeviceOrientation listener added');
					}
				})
				.catch(err => {
					console.error('DeviceOrientation permission error:', err);
				});
		} else {
			// Non-iOS or older iOS versions
			window.addEventListener('deviceorientation', onDeviceOrientation, true);
			console.log('DeviceOrientation listener added (no permission required)');
		}

		// Also try DeviceMotionEvent for broader compatibility
		if (typeof DeviceMotionEvent !== 'undefined') {
			if (typeof DeviceMotionEvent.requestPermission === 'function') {
				DeviceMotionEvent.requestPermission()
					.then(response => {
						if (response === 'granted') {
							window.addEventListener('devicemotion', onDeviceMotion, true);
						}
					})
					.catch(console.error);
			} else {
				window.addEventListener('devicemotion', onDeviceMotion, true);
			}
		}
	}

	function onDeviceMotion(event) {
		// Alternative using device motion acceleration
		if (event.accelerationIncludingGravity) {
			const x = event.accelerationIncludingGravity.x;
			const y = event.accelerationIncludingGravity.y;

			// Map acceleration to pointer values with higher sensitivity
			// X: -5 to 5 -> 0 to 1 (more sensitive range)
			pointerX = clamp((x + 5) / 10);
			// Y: -5 to 5 -> 0 to 1 (inverted, more sensitive)
			pointerY = clamp(1 - ((y + 5) / 10));
		}
	}

	window.addEventListener('resize', resize);
	window.addEventListener('mousemove', onPointerMove);
	window.addEventListener('touchmove', onPointerMove, { passive: true });
	window.addEventListener('dblclick', onDoubleClick);
	window.addEventListener('touchstart', onTouch);

	// enable device orientation on first interaction (disabled for now)
	// window.addEventListener('click', enableMotion, { once: true });
	// window.addEventListener('touchstart', enableMotion, { once: true });

	resize();

	/**
	 * draws a single wavy stripe layer
	 * @param {string} fillStyle - color for the stripe
	 * @param {number} phase - phase offset for wave animation
	 * @param {number} index - stripe index for positioning
	 */
	function drawStripe(fillStyle, phase, index) {
		// add very subtle dark shadow effect for layered depth
		context.shadowBlur = 20;
		context.shadowColor = 'rgba(0, 0, 0, 0.15)';
		context.shadowOffsetY = 3;

		context.fillStyle = fillStyle;
		context.beginPath();

		const baseStripeHeight = height / colourCount * stripeOverlap;
		const stripeHeight = baseStripeHeight * heightFactors[index];
		const baseY = index * (height / colourCount) - stripeHeight / 2 + height * verticalShiftFactor;

		context.moveTo(0, baseY);

		for (let x = 0; x <= width; x += horizontalStep) {
			// combine multiple wave frequencies for more complex motion
			// Use pointerY for wave amplitude
			const dynamicAmp = baseAmplitude * (0.5 + pointerY);

			// Use pointerY for phase shift instead of pointerX (prevents jumping during horizontal swipes)
			const verticalInfluence = (pointerY - 0.5) * 100;

			const yOffset = Math.sin(x * waveLength + time + phase + verticalInfluence * 0.01) * dynamicAmp +
				Math.sin(x * waveLength * 0.5 + time * 0.8 + phase) * secondaryAmplitude * (0.8 + pointerY * 0.4) +
				Math.sin(x * waveLength * 2 + time * 1.5 + phase + verticalInfluence * 0.02) * 20; // added tertiary wave

			context.lineTo(x, baseY + yOffset);
		}

		context.lineTo(width, baseY + stripeHeight);
		context.lineTo(0, baseY + stripeHeight);
		context.closePath();
		context.fill();
	}

	function animate() {
		// update time with constant speed
		time += waveSpeed * 60;

		// check for auto color transition
		if (autoTransition) {
			const timeSinceLastTransition = Date.now() - lastTransitionTime;

			// after 8 seconds of holding, start the 2 second fade
			if (timeSinceLastTransition > holdDuration && !isFading) {
				// start fade
				isFading = true;
				fadeStartTime = Date.now();
				nextPalette = (currentPalette + 1) % totalPalettes;
				baseColors = [...colours];
				targetColors = getPaletteColors(nextPalette);
			}

			// during fade, interpolate colors
			if (isFading) {
				const fadeProgress = (Date.now() - fadeStartTime) / fadeDuration;

				if (fadeProgress >= 1) {
					// fade complete
					isFading = false;
					currentPalette = nextPalette;
					colours = targetColors;
					lastTransitionTime = Date.now();

					// update body class for background
					document.body.className = currentPalette > 0 ? `palette-${currentPalette}` : '';
				} else {
					// interpolate colors
					colours = baseColors.map((baseColor, i) =>
						interpolateColor(baseColor, targetColors[i], fadeProgress)
					);
				}
			}
		}

		context.clearRect(0, 0, width, height);

		// draw all stripes
		for (let i = 0; i < colourCount; i++) {
			drawStripe(colours[i], stripePhases[i], i);
		}

		requestAnimationFrame(animate);
	}

	animate();
}

init(document.getElementById('lavaCanvas'));
