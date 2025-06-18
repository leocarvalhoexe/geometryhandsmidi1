import {
  updateSelectedShapeRadius,
  updateSelectedShapeSides,
  getSelectedShapeRadius,
  getSelectedShapeSides
} from './shape17.js';

// Helper function for distance
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper function for touch detection
function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) {
  const d = distance(x, y, cx, cy);
  return Math.abs(d - r) <= tolerance;
}

export function drawHandLandmarks(ctx, landmarksArray, canvasWidth, canvasHeight) {
  if (!landmarksArray || landmarksArray.length === 0) {
    return;
  }
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
    [5, 9], [9, 10], [10, 11], [11, 12], // Middle finger
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring finger
    [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [0, 17] // Palm
  ];

  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;

  for (const handLandmarks of landmarksArray) {
    for (const connection of connections) {
      const p1 = handLandmarks[connection[0]];
      const p2 = handLandmarks[connection[1]];
      if (p1 && p2) {
        // Apply X-coordinate mirroring for drawing
        const x1 = canvasWidth - (p1.x * canvasWidth);
        const y1 = p1.y * canvasHeight;
        const x2 = canvasWidth - (p2.x * canvasWidth);
        const y2 = p2.y * canvasHeight;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'red';
    for (const point of handLandmarks) {
      if (point) {
        // Apply X-coordinate mirroring for drawing points
        const x = canvasWidth - (point.x * canvasWidth);
        const y = point.y * canvasHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
}

export function setupHands(onResultsCallbackFromMain) {
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });
  hands.onResults(onResultsCallbackFromMain);
  return hands;
}

export function processHandsUpdate(results, canvasElement, shapeModule) {
  let rightHandLandmarksForLiquify = null;
  let landmarksToDraw = [];

  const canvasWidth = canvasElement.width;
  const canvasHeight = canvasElement.height;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  let isThumbResizingActive = false;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    landmarksToDraw = results.multiHandLandmarks;

    if (results.multiHandLandmarks.length === 2 && results.multiHandedness) {
      let leftHand, rightHand;
      // Determine left and right hands based on handedness label
      if (results.multiHandedness[0].label === 'Left') {
        leftHand = results.multiHandLandmarks[0];
        rightHand = results.multiHandLandmarks[1];
      } else {
        leftHand = results.multiHandLandmarks[1];
        rightHand = results.multiHandLandmarks[0];
      }

      const isThumbUp = (landmarks, handednessLabel) => {
        if (!landmarks || landmarks.length < 21) return false;
        const thumbIsOpen = landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y;
        // Mirrored X for gesture logic: X coordinate for 'Right' hand landmarks is effectively 1 - original_x.
        // So, for a "thumb out" pose:
        // - Right hand (original x is small, e.g., 0.1 for thumb right): mirrored x becomes large (e.g., 0.9). Thumb tip (landmark 4) x > base (landmark 2) x.
        // - Left hand (original x is large, e.g., 0.9 for thumb left): mirrored x becomes small (e.g., 0.1). Thumb tip (landmark 4) x < base (landmark 2) x.
        // The original main10.js logic for thumbExtended was:
        // (handednessLabel === "Right" && landmarks[4].x < landmarks[2].x) || (handednessLabel === "Left" && landmarks[4].x > landmarks[2].x)
        // This implies that the landmarks[X].x values it was receiving were *already mirrored* for the right hand if it was drawn mirrored.
        // Since we are applying mirroring *at the drawing stage* and for *coordinate conversion for gestures*,
        // we should use the raw landmark.x values here and apply mirroring when converting to canvas space for gesture logic.

        // Let's use unmirrored logic first, then adapt if needed.
        // The key is consistency. If main10.js's landmarks were globally mirrored before onResults, that's one thing.
        // Here, we're applying mirroring selectively.

        // Using raw landmark data (0 to 1, origin top-left for MediaPipe)
        // For right hand, thumb tip x (e.g. 0.1) should be LESS than thumb base x (e.g. 0.2) for thumb out to its right.
        // For left hand, thumb tip x (e.g. 0.9) should be MORE than thumb base x (e.g. 0.8) for thumb out to its left.
        const thumbExtended = (handednessLabel === "Right" && landmarks[4].x < landmarks[2].x) ||
                              (handednessLabel === "Left" && landmarks[4].x > landmarks[2].x);

        const fingersCurled =
          landmarks[8].y > landmarks[6].y &&
          landmarks[12].y > landmarks[10].y &&
          landmarks[16].y > landmarks[14].y &&
          landmarks[20].y > landmarks[18].y;
        return thumbIsOpen && thumbExtended && fingersCurled;
      };

      if (isThumbUp(leftHand, "Left") && isThumbUp(rightHand, "Right")) {
        isThumbResizingActive = true;
        const leftThumbTip = leftHand[4];
        const rightThumbTip = rightHand[4];

        // Apply X-mirroring for gesture calculation points
        const leftThumbX = canvasWidth - (leftThumbTip.x * canvasWidth);
        const rightThumbX = canvasWidth - (rightThumbTip.x * canvasWidth);

        const thumbDistancePixels = Math.abs(leftThumbX - rightThumbX);
        const minThumbDist = canvasWidth * 0.05;
        const maxThumbDist = canvasWidth * 0.4;
        let normalizedThumbDist = (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist);
        normalizedThumbDist = Math.max(0, Math.min(1, normalizedThumbDist));

        const currentMinRadius = 30;
        const currentMaxRadius = 300;
        const newRadius = currentMinRadius + normalizedThumbDist * (currentMaxRadius - currentMinRadius);
        shapeModule.updateSelectedShapeRadius(newRadius);
      }
    }

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : 'Unknown';

      if (!isThumbResizingActive && handedness === "Right") {
        rightHandLandmarksForLiquify = landmarks; // Return raw normalized landmarks
      }

      if (!isThumbResizingActive && handedness === "Left") {
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];

        // Apply X-mirroring for gesture calculation points
        const ix = canvasWidth - (indexTip.x * canvasWidth);
        const iy = indexTip.y * canvasHeight;
        const tx = canvasWidth - (thumbTip.x * canvasWidth);
        const ty = thumbTip.y * canvasHeight;

        const pinchDistance = distance(ix, iy, tx, ty);
        const pinchX = (ix + tx) / 2;
        const pinchY = (iy + ty) / 2;

        const currentShapeRadius = shapeModule.getSelectedShapeRadius();
        const currentShapeSidesMin = 3;
        const currentShapeSidesMax = 20;

        // The cx, cy for isTouchingCircle should be the visual center of the shape on canvas.
        // If shapes are always drawn centered, then canvasWidth/2, canvasHeight/2 is correct.
        // The pinchX, pinchY are already in mirrored canvas coordinates.
        if (isTouchingCircle(pinchX, pinchY, canvasWidth / 2, canvasHeight / 2, currentShapeRadius, currentShapeRadius * 0.5)) {
          const minPinchDist = 20;
          const maxPinchDist = 150;
          let normalizedPinch = (pinchDistance - minPinchDist) / (maxPinchDist - minPinchDist);
          normalizedPinch = Math.max(0, Math.min(1, normalizedPinch));
          const newSides = Math.round(currentShapeSidesMin + normalizedPinch * (currentShapeSidesMax - currentShapeSidesMin));

          if (newSides !== shapeModule.getSelectedShapeSides()) {
            shapeModule.updateSelectedShapeSides(newSides);
          }
        }
      }
    }
  }

  if (isThumbResizingActive) {
    rightHandLandmarksForLiquify = null;
  }

  return {
    rightHandLandmarksForLiquify: rightHandLandmarksForLiquify,
    landmarksToDraw: landmarksToDraw
  };
}
