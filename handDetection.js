'use strict';

// Assuming Hands and Camera are available globally via CDN scripts,
// or would be imported if using a bundler:
// import { Hands } from '@mediapipe/hands';
// import { Camera } from '@mediapipe/camera_utils';

let hands = null;
let camera = null;
let coreCallbacks = {
    onRadiusChange: (newRadius) => {},
    onSidesChange: (newSides) => {},
    onRightHandUpdate: (landmarks) => {}, // For distortion
    onBothHandsPresent: (present) => {},
    getShapeParameters: () => ({ radius: 100, sides: 100, canvasWidth: 640, canvasHeight: 480 }),
    getSensitivitySettings: () => ({ sidesPrecision: 50, distortion: 50 }), // Default values
    onFrameProcessed: () => {}, // Callback after each frame is processed by hands
};
let internalCanvasElement = null; // Keep a reference for coordinate calculations

// --- Utility Functions ---
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) {
    const d = distance(x, y, cx, cy);
    return Math.abs(d - r) <= tolerance;
}


// --- Main Logic ---
function onHandsResults(results) {
    const shapeParams = coreCallbacks.getShapeParameters();
    const sensitivity = coreCallbacks.getSensitivitySettings();

    const canvasWidth = shapeParams.canvasWidth;
    const canvasHeight = shapeParams.canvasHeight;
    const currentCircleRadius = shapeParams.radius;
    // const currentShapeSides = shapeParams.sides; // Not directly used for newSides calculation logic from main10

    let isThumbResizing = false;
    let detectedRightHandLandmarks = null;

    coreCallbacks.onBothHandsPresent(results.multiHandLandmarks && results.multiHandLandmarks.length == 2);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length == 2) {
        let leftHand, rightHand;
        if (results.multiHandedness[0].label === "Left") {
            leftHand = results.multiHandLandmarks[0];
            rightHand = results.multiHandLandmarks[1];
        } else {
            leftHand = results.multiHandLandmarks[1];
            rightHand = results.multiHandLandmarks[0];
        }

        const isThumbUp = (landmarks, handednessLabel) => {
            if (!landmarks) return false;
            // Simplified thumb up: Thumb tip above MCP joint, and somewhat extended
            const thumbIsOpen = landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y;
             // Check if thumb is extended to the side relative to the wrist/palm
            const thumbExtended = (handednessLabel === "Right" && landmarks[4].x < landmarks[2].x && landmarks[4].x < landmarks[0].x) ||
                                (handednessLabel === "Left" && landmarks[4].x > landmarks[2].x && landmarks[4].x > landmarks[0].x);

            // Check if other fingers are generally curled (tip is higher Y than joint further down)
            const fingersCurled =
                landmarks[8].y > landmarks[6].y &&   // Index
                landmarks[12].y > landmarks[10].y && // Middle
                landmarks[16].y > landmarks[14].y && // Ring
                landmarks[20].y > landmarks[18].y;  // Pinky
            return thumbIsOpen && thumbExtended && fingersCurled;
        };

        if (isThumbUp(leftHand, "Left") && isThumbUp(rightHand, "Right")) {
            isThumbResizing = true;
            const leftThumbTip = leftHand[4]; // Landmark 4 is the tip of the thumb
            const rightThumbTip = rightHand[4];

            // Convert normalized coordinates to pixel values
            // Note: MediaPipe landmarks are usually flipped horizontally for the right hand if using mirrored video.
            // Assuming video is NOT mirrored for landmark processing, or already handled.
            // If video IS mirrored, right hand X coordinates might need (1 - x).
            // For consistency, let's assume raw, non-mirrored landmarks for calculations.
            // The drawing module handles mirroring for display if needed.
            const leftThumbX = leftThumbTip.x * canvasWidth;
            const leftThumbY = leftThumbTip.y * canvasHeight;
            const rightThumbX = rightThumbTip.x * canvasWidth; // If this hand's X is mirrored, adjust here
            const rightThumbY = rightThumbTip.y * canvasHeight;

            const thumbDistancePixels = distance(leftThumbX, leftThumbY, rightThumbX, rightThumbY);

            const minThumbDist = canvasWidth * 0.05; // e.g., 5% of canvas width
            const maxThumbDist = canvasWidth * 0.6;  // e.g., 60% of canvas width

            const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));

            const newRadius = 30 + normalizedThumbDist * 270; // Maps to 30-300 range
            coreCallbacks.onRadiusChange(newRadius);
        }
    }

    // Process single or multiple hands for other gestures
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;

            // Right hand for distortion - only if not thumb resizing
            if (!isThumbResizing && handedness === "Right") {
                detectedRightHandLandmarks = landmarks;
            }

            // Left hand for changing number of sides - only if not thumb resizing
            if (!isThumbResizing && handedness === "Left") {
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];

                // Convert to canvas coordinates (remembering Y is often top-to-bottom from 0)
                // X-coordinates for left hand are generally fine as is (not mirrored)
                const ix = indexTip.x * canvasWidth;
                const iy = indexTip.y * canvasHeight;
                const tx = thumbTip.x * canvasWidth;
                const ty = thumbTip.y * canvasHeight;

                const pinchDistance = distance(ix, iy, tx, ty);
                const pinchX = (ix + tx) / 2;
                const pinchY = (iy + ty) / 2;

                const cx = canvasWidth / 2;
                const cy = canvasHeight / 2;

                if (isTouchingCircle(pinchX, pinchY, cx, cy, currentCircleRadius)) {
                    // Sensitivity for sides precision (0-100)
                    // Higher sensitivity = pinch distance has more impact (smaller pinch changes sides more)
                    // Lower sensitivity = pinch distance has less impact (need bigger pinch change)
                    // Default sensitivity (50) maps to original `(pinchDistance - 10) / 5 + 3`
                    // Max sensitivity (100) could be `(pinchDistance - 10) / 2.5 + 3` (twice as sensitive)
                    // Min sensitivity (1) could be `(pinchDistance - 10) / 10 + 3` (half as sensitive)
                    const baseDivisor = 5;
                    // Map sensitivity (1-100) to a divisor (e.g., 10 down to 2.5)
                    // When sensitivity is 1, divisor = 10. When sensitivity is 50, divisor = 5. When 100, divisor = 2.5.
                    const sidesSensitivityDivisor = 10 - ( (sensitivity.sidesPrecision / 100) * 7.5 );


                    const newSides = Math.round(Math.min(Math.max((pinchDistance - 10) / sidesSensitivityDivisor + 3, 3), 100));
                    coreCallbacks.onSidesChange(newSides);
                }
            }
        }
    }

    // If thumb resizing was active, it overrides right hand for distortion
    coreCallbacks.onRightHandUpdate(isThumbResizing ? null : detectedRightHandLandmarks);

    if(coreCallbacks.onFrameProcessed) {
        coreCallbacks.onFrameProcessed();
    }
}


// --- Exported Functions ---

export function initHandDetection(videoEl, canvasEl, callbacksObj) {
    internalCanvasElement = canvasEl; // Used for width/height in onResults
    coreCallbacks = { ...coreCallbacks, ...callbacksObj };

    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1, // 0 or 1. Higher = more accurate but slower.
        minDetectionConfidence: 0.7, // Increased from 0.5 for potentially more stable tracking
        minTrackingConfidence: 0.7,  // Increased from 0.5
    });

    hands.onResults(onHandsResults);

    camera = new Camera(videoEl, {
        onFrame: async () => {
            if (videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) { // Ensure video is ready
                await hands.send({ image: videoEl });
            }
        },
        width: 640, // Default, can be overridden by videoEl properties if needed
        height: 480
    });
    console.log("handDetection.js initialized");
}

export function startHandDetection() {
    if (camera) {
        camera.start()
            .then(() => console.log("Camera started successfully via handDetection.js"))
            .catch(err => console.error("Failed to start camera via handDetection.js:", err));
    } else {
        console.error("Camera not initialized before startHandDetection call.");
    }
}

export function stopHandDetection() {
    // Camera class from camera_utils doesn't have an explicit stop method.
    // To stop it, you typically stop the video stream it's using.
    // This might be handled by main11.js by stopping the video element.
    // For now, this function is a placeholder.
    console.log("stopHandDetection called - camera stop might need to be handled by managing video stream.");
}

console.log("handDetection.js loaded");
