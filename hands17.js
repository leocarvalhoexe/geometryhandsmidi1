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

export function onResults(results) {
  // Aqui vai a lógica para alterar lados, raio etc com gestos
  // Você pode colar aqui a parte do `onResults` original e adaptá-la com imports das funções
}
