'use strict';

let mainCanvasWidth = 0;
let mainCanvasHeight = 0;

// --- Helper Functions ---
export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

// --- Initialization ---
export function initDrawing(mainCanvas) {
    if (mainCanvas) {
        mainCanvasWidth = mainCanvas.width;
        mainCanvasHeight = mainCanvas.height;
    }
    console.log("drawing.js initialized");
}

// --- Canvas Operations ---

export function clearCanvases(mainCtx, popupCtx, mainCanvas, popupCanvas) {
    if (mainCtx && mainCanvas) {
        mainCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Afterimage effect
        mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
    }
    if (popupCtx && popupCanvas) {
        popupCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        popupCtx.fillRect(0, 0, popupCanvas.width, popupCanvas.height);
    }
}

/**
 * Draws the main interactive shape.
 * @param {CanvasRenderingContext2D} ctx - The context to draw on.
 * @param {object} shapeParams - Parameters for drawing the shape.
 * @returns {Array<object>} - Array of vertex distortion data for MIDI processing.
 */
export function drawShape(ctx, canvasWidth, canvasHeight, shapeParams) {
    const {
        cx, cy, radius, sides,
        rightHandLandmarks, // For distortion, can be null
        distortionSensitivityFactor, // 0.0 to 1.0+
        pulseValue, // for visual pulse effect, if any.
        isPulsing // boolean
    } = shapeParams;

    const vertexDistortions = []; // To store data for MIDI later

    ctx.beginPath();
    // Adjust these based on distortionSensitivityFactor. Lower factor = less sensitive = larger maxInfluenceDistance/smaller maxForce
    const baseMaxInfluenceDistance = 150;
    const baseMaxForce = 25;

    // Sensitivity: Higher factor means MORE sensitive to distortion.
    // Max influence distance should DECREASE with higher sensitivity (more localized effect)
    // Max force should INCREASE with higher sensitivity (stronger effect)
    const effectiveMaxInfluenceDistance = baseMaxInfluenceDistance / (distortionSensitivityFactor || 1);
    const effectiveMaxForce = baseMaxForce * (distortionSensitivityFactor || 1);

    const fingertipsToUse = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky tips

    let actualRadius = radius;
    if (isPulsing) {
        // Example: Modulate visual radius slightly by pulse.
        // pulseValue is -1 to 1. (pulseValue + 1) / 2 gives 0 to 1.
        let radiusModulation = 0.1 * actualRadius * pulseValue; // Modulate by up to 10%
        actualRadius = radius + radiusModulation;
        actualRadius = Math.max(10, actualRadius);
    }


    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        let vertexX_orig = actualRadius * Math.cos(angle);
        let vertexY_orig = actualRadius * Math.sin(angle);

        let totalDisplacementX = 0;
        let totalDisplacementY = 0;

        if (rightHandLandmarks) {
            const currentVertexCanvasX = cx + vertexX_orig;
            const currentVertexCanvasY = cy + vertexY_orig;

            for (const landmarkIndex of fingertipsToUse) {
                if (rightHandLandmarks[landmarkIndex]) {
                    const fingertip = rightHandLandmarks[landmarkIndex];
                    // Landmark coordinates are normalized (0.0 - 1.0). Convert to canvas coordinates.
                    // Assuming landmarks are mirrored for right hand if coming from MediaPipe default
                    const fingertipX = (1 - fingertip.x) * canvasWidth;
                    const fingertipY = fingertip.y * canvasHeight;

                    const distToFingertip = distance(currentVertexCanvasX, currentVertexCanvasY, fingertipX, fingertipY);

                    if (distToFingertip < effectiveMaxInfluenceDistance && distToFingertip > 0) {
                        const vecX = currentVertexCanvasX - fingertipX;
                        const vecY = currentVertexCanvasY - fingertipY;
                        const normVecX = vecX / distToFingertip;
                        const normVecY = vecY / distToFingertip;
                        const forceMagnitude = effectiveMaxForce * (1 - distToFingertip / effectiveMaxInfluenceDistance);
                        totalDisplacementX += normVecX * forceMagnitude;
                        totalDisplacementY += normVecY * forceMagnitude;
                    }
                }
            }
        }

        const deformedX = vertexX_orig + totalDisplacementX;
        const deformedY = vertexY_orig + totalDisplacementY;
        const finalX = cx + deformedX;
        const finalY = cy + deformedY;

        // Store distortion data for this vertex
        const displacementMagnitude = Math.sqrt(totalDisplacementX * totalDisplacementX + totalDisplacementY * totalDisplacementY);
        vertexDistortions.push({
            edgeIndex: i,
            displacementMagnitude: displacementMagnitude,
            // Potentially add originalX, originalY, deformedX, deformedY if needed elsewhere
        });

        if (i === 0) ctx.moveTo(finalX, finalY);
        else ctx.lineTo(finalX, finalY);
    }

    ctx.closePath();
    ctx.strokeStyle = 'cyan';
    ctx.lineWidth = 4;
    ctx.stroke();

    return vertexDistortions; // Return data for main module to handle MIDI
}


export function drawLandmarks(ctx, landmarks, canvasWidth, canvasHeight, doNotDraw) {
    if (doNotDraw || !landmarks || !ctx) return;

    // Define connections if not passed or managed elsewhere
    const connections = [
        [0,1],[1,2],[2,3],[3,4], // Thumb
        [0,5],[5,6],[6,7],[7,8], // Index
        [5,9],[9,10],[10,11],[11,12], // Middle
        [9,13],[13,14],[14,15],[15,16], // Ring
        [13,17],[17,18],[18,19],[19,20], // Pinky
        [0,17] // Palm
    ];

    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;

    for (const landmark of landmarks) {
        // Assuming landmarks are mirrored for right hand if that's the default
        const x = (1 - landmark.x) * canvasWidth;
        const y = landmark.y * canvasHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI); // Draw a small circle for each landmark point
        ctx.fillStyle = 'red';
        ctx.fill();
    }

    for (const [a, b] of connections) {
        if (landmarks[a] && landmarks[b]) {
            const x1 = (1 - landmarks[a].x) * canvasWidth;
            const y1 = landmarks[a].y * canvasHeight;
            const x2 = (1 - landmarks[b].x) * canvasWidth;
            const y2 = landmarks[b].y * canvasHeight;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }
}

export function drawToPopup(popupCtx, mainCanvasElement, popupCanvas) {
    if (popupCtx && mainCanvasElement && popupCanvas) {
        // Ensure popup canvas is correctly sized (might be redundant if getPopupCanvasContext handles it)
        if (popupCanvas.width !== popupCanvas.clientWidth || popupCanvas.height !== popupCanvas.clientHeight) {
            if (popupCanvas.clientWidth > 0 && popupCanvas.clientHeight > 0) {
             // Use clientWidth/Height if available and different, as window.innerWidth/Height might not be what we want for the canvas element itself
                popupCanvas.width = popupCanvas.clientWidth;
                popupCanvas.height = popupCanvas.clientHeight;
            }
        }
        // The prompt said: "Na janela de popup, exibir apenas a forma distorcida com afterimage."
        // This implies the popup should render its own version of the shape, not just blit the main canvas.
        // So, this function might not be used if drawShape is called directly for the popup.
        // However, if a direct copy is desired for simplicity for now:
        // popupCtx.drawImage(mainCanvasElement, 0, 0, popupCanvas.width, popupCanvas.height);

        // For now, let's assume main11.js will call drawShape separately for the popup.
        // This function can be a no-op or draw a placeholder if direct blitting is not the final design.
        // console.log("drawToPopup called - currently a no-op as popup draws its own shape.");
    }
}

console.log("drawing.js loaded");
