// Placeholder for MediaPipe Drawing Utils
// In a real scenario, you'd use the actual library or a UMD bundle.

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle finger
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring finger
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0,17] // Palm
];

export function drawConnectors(ctx, landmarks, connections, options) {
  ctx.beginPath();
  for (const connection of connections) {
    const start = landmarks[connection[0]];
    const end = landmarks[connection[1]];
    if (start && end) {
      ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
      ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
    }
  }
  ctx.strokeStyle = options.color || 'white';
  ctx.lineWidth = options.lineWidth || 1;
  ctx.stroke();
}

export function drawLandmarks(ctx, landmarks, options) {
  ctx.fillStyle = options.color || 'red';
  for (const landmark of landmarks) {
    if (landmark) {
      ctx.beginPath();
      ctx.arc(landmark.x * ctx.canvas.width, landmark.y * ctx.canvas.height, options.radius || 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
