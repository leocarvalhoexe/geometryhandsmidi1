import { drawConnectors, drawLandmarks } from './drawing_utils.js'; // Placeholder, actual path might differ or need to be webpacked
import { selectedShape, updateShapeRadius, updateShapeSides } from './shape16.js'; // Assuming these exist
import { HAND_CONNECTIONS } from './drawing_utils.js'; // Assuming this is also needed

export function setupHands(onResultsCallback) {
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });
  hands.onResults(onResultsCallback);
  return hands;
}

export function onResults(results, canvas, ctx, videoElement) {
  if (!canvas || !ctx || !videoElement) {
    console.error("onResults called without canvas, ctx, or videoElement");
    return;
  }

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw the video frame
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  let handOpen = false;
  let handClosed = false;
  let pinchDetected = false;

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let index = 0; index < results.multiHandLandmarks.length; index++) {
      const classification = results.multiHandedness[index];
      const isRightHand = classification.label === 'Right'; // Example: only process right hand for gestures
      const landmarks = results.multiHandLandmarks[index];

      // Draw landmarks and connectors
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
      drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2 });

      if (isRightHand && selectedShape) { // Process gestures only for the right hand and if a shape is selected
        // Simple gesture detection logic (placeholder - needs refinement)
        // This is a very basic example. Real gesture detection is more complex.

        // Tip of thumb and index finger
        const thumbTip = landmarks[4]; // THUMB_TIP
        const indexTip = landmarks[8]; // INDEX_FINGER_TIP
        const middleTip = landmarks[12]; // MIDDLE_FINGER_TIP
        const pinkyTip = landmarks[20]; // PINKY_TIP
        const wrist = landmarks[0]; // WRIST

        // Pinch detection: Distance between thumb tip and index finger tip
        const pinchDistance = Math.sqrt(
          Math.pow(thumbTip.x - indexTip.x, 2) +
          Math.pow(thumbTip.y - indexTip.y, 2) +
          Math.pow(thumbTip.z - indexTip.z, 2) // Consider Z for 3D distance
        );

        if (pinchDistance < 0.05) { // Threshold for pinch, needs tuning
          pinchDetected = true;
          // Debounce or use a state machine for changing sides once per gesture
          // For now, let's assume a simple increment/decrement on detection
          // updateShapeSides(selectedShape.sides + 1); // Example action
        }

        // Open/Closed hand detection (very simplified)
        // Check distance of fingertips from the palm center (or wrist)
        const avgFingerTipY = (indexTip.y + middleTip.y + pinkyTip.y) / 3;
        const wristY = wrist.y;

        if (avgFingerTipY < wristY - 0.1) { // Fingers are above wrist (relative to image orientation) - simplified open
            handOpen = true;
            // updateShapeRadius(selectedShape.radius + 5); // Example action
        } else if (avgFingerTipY > wristY - 0.05 && pinchDistance > 0.1) { // Fingers are closer to wrist level, and not pinching - simplified closed
            handClosed = true;
            // updateShapeRadius(selectedShape.radius - 5); // Example action
        }

        // --- Apply gesture effects ---
        // This part needs careful state management to avoid rapid changes.
        // For now, a simple direct modification for demonstration.
        // A better approach would be to set a flag and apply change once per gesture cycle.
        if (pinchDetected) {
            // Placeholder: For now, let's log, actual side change needs careful implementation
            // to avoid changing too rapidly or too slowly.
            // A common pattern is to change on the *start* of a gesture.
            console.log("Pinch detected - potential side change");
            // updateShapeSides(true); // true for increment, false for decrement - needs a proper function
        }
        if (handOpen) {
            console.log("Hand open - potential radius increase");
            updateShapeRadius(selectedShape.radius + 2); // Small increment
        } else if (handClosed) {
            console.log("Hand closed - potential radius decrease");
            updateShapeRadius(selectedShape.radius - 2); // Small decrement
        }
      }
    }
  }
  ctx.restore();
}
