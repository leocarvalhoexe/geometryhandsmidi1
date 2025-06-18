const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const ctx = canvasElement.getContext('2d');

canvasElement.addEventListener('contextmenu', (e) => e.preventDefault());

function resizeCanvas() {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const DEFAULT_RADIUS = 100;
const DEFAULT_SIDES = 100;

let circleRadius = DEFAULT_RADIUS;
let shapeSides = DEFAULT_SIDES;

let rightHandLandmarks = null;
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
let lastPulseValue = 0;
const centerX = () => canvasElement.width / 2;
const centerY = () => canvasElement.height / 2;

let isMouseDown = false;
let isRightButton = false;
let lastMouseX = 0;
let lastMouseY = 0;
const MIN_RADIUS = 30;
const MAX_RADIUS = 300;
const MIN_SIDES = 3;
const MAX_SIDES = 100;

let mouseControlsActive = true;
let currentMusicalScale = 'pentatonic';

const PENTATONIC_SCALE_C_MAJOR = [60, 62, 64, 67, 69];
const MAJOR_SCALE_NOTES = [60, 62, 64, 65, 67, 69, 71];
const HARMONIC_MINOR_SCALE_NOTES = [60, 62, 63, 65, 67, 68, 71];

let demoModeActive = false;
let demoAngle = 0;
let demoPulseTimer = 0;
let demoDistortionTimer = 0;
const DEMO_ROTATION_SPEED = 0.005;
const DEMO_PULSE_INTERVAL = 200;
const DEMO_DISTORTION_INTERVAL = 150;
const DEMO_EVENT_DURATION = 60;
let demoIsPulsing = false;
let demoIsDistorting = false;

let performanceModeActive = false;
let isDraggingShape = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

let shapes = [];
const MAX_SHAPES = 3;
const MIDI_CHANNELS = [0, 1, 2];
let selectedShape = null;

const mouseSimToggle = document.getElementById('mouseSimToggle');
const resetMidiButton = document.getElementById('resetMidiButton');
const shapeSidesInput = document.getElementById('shapeSidesInput');
const musicalScaleSelect = document.getElementById('musicalScaleSelect');
const resetShapeButton = document.getElementById('resetShapeButton');

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7});
hands.onResults(onResults);

let midiAccess = null;
let midiOutput = null;
let availableMidiOutputs = new Map();
let midiEnabled = false;

const settingsButton = document.getElementById('settingsButton');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const openOutputPopupButton = document.getElementById('openOutputPopupButton');
let outputPopupWindow = null;
let popupCanvasCtx = null;

function updateMidiOutputList() { availableMidiOutputs.clear(); if (midiAccess) { midiAccess.outputs.forEach(output => { availableMidiOutputs.set(output.id, output); }); } populateMidiOutputSelect(); }
function populateMidiOutputSelect() { const p = midiOutput ? midiOutput.id : null; midiOutputSelect.innerHTML = ''; if (availableMidiOutputs.size === 0) { const o=document.createElement('option');o.textContent='Nenhuma porta MIDI encontrada';o.disabled=true;midiOutputSelect.appendChild(o);midiOutput=null;return; } availableMidiOutputs.forEach(o => { const opt=document.createElement('option');opt.value=o.id;opt.textContent=o.name;midiOutputSelect.appendChild(opt); }); if (p&&availableMidiOutputs.has(p)){midiOutputSelect.value=p;midiOutput=availableMidiOutputs.get(p);}else if(availableMidiOutputs.size>0){const f=availableMidiOutputs.keys().next().value;midiOutputSelect.value=f;midiOutput=availableMidiOutputs.get(f);}else{midiOutput=null;} if(midiOutput)console.log("Populated MIDI Selected:", midiOutput.name); else console.warn("No MIDI output selected.");}
async function initMidi() { try { if (navigator.requestMIDIAccess) { midiAccess = await navigator.requestMIDIAccess({sysex:false}); console.log("MIDI Access Granted"); updateMidiOutputList(); midiAccess.onstatechange=(e) => {console.log("MIDI state change:",e.port.name,e.port.state,e.port.type);updateMidiOutputList();if(e.port.type==="output"&&e.port.state==="disconnected"){if(midiOutput&&e.port.id===midiOutput.id)console.warn("Sel MIDI Output disconnected:",e.port.name);}else if(e.port.type==="output"&&e.port.state==="connected")console.log("New MIDI Output connected:",e.port.name);};} else { console.warn("Web MIDI API not supported."); populateMidiOutputSelect();}} catch(err){console.error("Could not access MIDI.",err);populateMidiOutputSelect();}}
initMidi();

midiOutputSelect.addEventListener('change', () => {
    const id=midiOutputSelect.value; if(availableMidiOutputs.has(id)){midiOutput=availableMidiOutputs.get(id);console.log("MIDI Output to:",midiOutput.name);turnOffAllActiveNotesGlobally();}else{console.warn("Selected MIDI ID not found:",id);midiOutput=null;}
});

function sendMidiNoteOn(note, velocity, channel) { if (midiOutput && midiEnabled) midiOutput.send([0x90 + channel, note, velocity]); }
function sendMidiNoteOff(note, channel) { if (midiOutput && midiEnabled) midiOutput.send([0x80 + channel, note, 0]); }
function sendPitchBend(bendValue, channel) { if (midiOutput && midiEnabled) midiOutput.send([0xE0 + channel, bendValue & 0x7F, (bendValue >> 7) & 0x7F]); }
function getScaleNote(index, baseOctaveOffset = 0) { let s; switch(currentMusicalScale){case 'major':s=MAJOR_SCALE_NOTES;break;case 'harmonicMinor':s=HARMONIC_MINOR_SCALE_NOTES;break;default:s=PENTATONIC_SCALE_C_MAJOR;} const sl=s.length; const o=baseOctaveOffset+Math.floor(index/sl); const n=s[index%sl]; return n+(o*12); }

function turnOffAllActiveNotesForShape(shape) {
    if (!shape || !shape.activeNotes) return;
    if (Object.keys(shape.activeNotes).length > 0) {
        const oME = midiEnabled; midiEnabled = true;
        Object.keys(shape.activeNotes).forEach(edgeIdx => {
            const nI = shape.activeNotes[edgeIdx]; if (nI.playing) sendMidiNoteOff(nI.note, shape.midiChannel);
        });
        midiEnabled = oME;
    }
    shape.activeNotes = {};
}
function turnOffAllActiveNotesGlobally() { shapes.forEach(s => turnOffAllActiveNotesForShape(s)); }

const camera = new Camera(videoElement, {onFrame: async () => await hands.send({ image: videoElement }), width: 640, height: 480});
camera.start();

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    if (performanceModeActive) return; demoModeActive = !demoModeActive;
    if (demoModeActive) { console.log("Demo ACTIVATED"); demoAngle=0; demoPulseTimer=0; demoDistortionTimer=0; demoIsPulsing=false; demoIsDistorting=false; if(selectedShape){selectedShape.radius=DEFAULT_RADIUS; selectedShape.sides=DEFAULT_SIDES; circleRadius=DEFAULT_RADIUS; shapeSides=DEFAULT_SIDES; if(shapeSidesInput)shapeSidesInput.value=DEFAULT_SIDES;}else{initShapes();} turnOffAllActiveNotesGlobally(); }
    else { console.log("Demo DEACTIVATED"); demoIsPulsing=false; demoIsDistorting=false; if(pulseModeActive&&demoPulseTimer>0)pulseModeActive=false; rightHandLandmarks=null; turnOffAllActiveNotesGlobally(); } return;
  }
  if (e.key === 'e' || e.key === 'E') {
    if (demoModeActive) return; performanceModeActive = !performanceModeActive;
    if (performanceModeActive) {
        console.log("Perf mode ACTIVATED"); turnOffAllActiveNotesGlobally(); shapes=[]; selectedShape=null;
        const pos=[{x:centerX(),y:centerY()-cH*0.25},{x:centerX()-cW*0.25,y:centerY()+cH*0.15},{x:centerX()+cW*0.25,y:centerY()+cH*0.15}];
        const clrs=['#FF69B4','#20B2AA','#FFD700'];
        for(let i=0;i<MAX_SHAPES;i++){const nS={id:i,x:pos[i%pos.length].x,y:pos[i%pos.length].y,radius:DEFAULT_RADIUS*0.8,sides:DEFAULT_SIDES,midiChannel:MIDI_CHANNELS[i%MIDI_CHANNELS.length],activeNotes:{},rotationAngle:Math.random()*Math.PI,color:clrs[i%clrs.length],liquifyPoints:null,isSelected:(i===0)};shapes.push(nS);if(i===0)selectedShape=nS;}
        if(selectedShape){circleRadius=selectedShape.radius;shapeSides=selectedShape.sides;if(shapeSidesInput)shapeSidesInput.value=selectedShape.sides;}
    } else { console.log("Perf mode DEACTIVATED"); turnOffAllActiveNotesGlobally(); initShapes(); if(selectedShape){circleRadius=selectedShape.radius;shapeSides=selectedShape.sides;if(shapeSidesInput)shapeSidesInput.value=selectedShape.sides;}} return;
  }

  if (demoModeActive) return;
  if (e.key === '+') { if(selectedShape){selectedShape.radius=Math.min(selectedShape.radius+10,MAX_RADIUS); circleRadius=selectedShape.radius;}}
  if (e.key === '-') { if(selectedShape){selectedShape.radius=Math.max(selectedShape.radius-10,MIN_RADIUS); circleRadius=selectedShape.radius;}}
  if (e.key === 'p' || e.key === 'P') { pulseModeActive=!pulseModeActive;if(pulseModeActive)console.log("Pulse ACTIVE");else console.log("Pulse INACTIVE");pulseTime=0;}
  if (e.key === 'm' || e.key === 'M') { midiEnabled=!midiEnabled;if(midiEnabled)console.log("MIDI ENABLED");else{console.log("MIDI DISABLED");turnOffAllActiveNotesGlobally();}}
});

canvasElement.addEventListener('mousedown', (e) => {
  if (demoModeActive || !mouseControlsActive) return;

  isDraggingShape = false;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (performanceModeActive && e.button === 0) {
    let clickedOnShape = false;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        const dist = distance(e.clientX, e.clientY, shape.x, shape.y);
        if (dist < shape.radius) {
            if (selectedShape && selectedShape.id !== shape.id) selectedShape.isSelected = false;
            selectedShape = shape;
            selectedShape.isSelected = true;
            isDraggingShape = true;
            dragOffsetX = e.clientX - selectedShape.x;
            dragOffsetY = e.clientY - selectedShape.y;

            circleRadius = selectedShape.radius; shapeSides = selectedShape.sides;
            if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;

            clickedOnShape = true;
            break;
        }
    }
    // If a shape was clicked for dragging, set mousedown and return
    if (clickedOnShape) {
        isMouseDown = true;
        e.preventDefault();
        return;
    }
  }

  // If not dragging a new shape, or not in performance mode left-click, proceed.
  // This allows radius/sides adjustment for the *currently* selectedShape.
  isMouseDown = true;
  isRightButton = (e.button === 2);
  e.preventDefault();
});

window.addEventListener('mouseup', (e) => {
  if (isMouseDown) isMouseDown = false;
  isDraggingShape = false;
});

canvasElement.addEventListener('mousemove', (e) => {
  if (demoModeActive || !mouseControlsActive ) return;

  if (performanceModeActive && isDraggingShape && selectedShape && isMouseDown) { // Ensure mouse is still down for dragging
    selectedShape.x = e.clientX - dragOffsetX;
    selectedShape.y = e.clientY - dragOffsetY;
    lastMouseX = e.clientX; lastMouseY = e.clientY; // Update lastMouse for continuous dragging
    return;
  }

  // This part executes if not dragging a shape OR if not in performance mode dragging.
  // It modifies the selectedShape's radius or sides.
  if (!isMouseDown || !selectedShape) return;

  const cX = e.clientX; const cY = e.clientY;
  if (isRightButton) { // Right-click drag for radius
    const deltaY = cY - lastMouseY;
    selectedShape.radius -= deltaY * 0.5;
    selectedShape.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, selectedShape.radius));
    circleRadius = selectedShape.radius; // Sync global
  } else { // Left-click drag for sides (if not dragging shape itself)
    // Using simple deltaX for sides, no isTouchingCircle for now for mouse-based side control.
    // This was the behavior before performance mode for the single shape.
    const deltaX = cX - lastMouseX;
    const oldSides = selectedShape.sides;
    selectedShape.sides += deltaX * 0.1;
    selectedShape.sides = Math.round(Math.max(MIN_SIDES, Math.min(MAX_SIDES, selectedShape.sides)));
    shapeSides = selectedShape.sides; // Sync global
    if(shapeSidesInput) shapeSidesInput.value = selectedShape.sides;

    if (midiEnabled && selectedShape.sides < oldSides) {
        const notesToTurnOff = {};
        for (let k = selectedShape.sides; k < oldSides; k++) {
            if (selectedShape.activeNotes[k] && selectedShape.activeNotes[k].playing) {
                notesToTurnOff[k] = { ...selectedShape.activeNotes[k] };
            }
        }
        const origMidi = midiEnabled; midiEnabled = true;
        Object.keys(notesToTurnOff).forEach(edgeIdx => {
            sendMidiNoteOff(notesToTurnOff[edgeIdx].note, selectedShape.midiChannel);
            if (selectedShape.activeNotes[edgeIdx]) selectedShape.activeNotes[edgeIdx].playing = false;
        });
        midiEnabled = origMidi;
    }
  }
  lastMouseX = cX; lastMouseY = cY;
});

infoButton.addEventListener('click', () => infoModal.style.display = 'flex');
closeModalButton.addEventListener('click', () => infoModal.style.display = 'none');
if (settingsButton && settingsModal && closeSettingsModalButton) {
    settingsButton.addEventListener('click',()=>{if(mouseSimToggle)mouseSimToggle.checked=mouseControlsActive;if(shapeSidesInput)shapeSidesInput.value=selectedShape?selectedShape.sides:DEFAULT_SIDES;if(musicalScaleSelect)musicalScaleSelect.value=currentMusicalScale;settingsModal.style.display='flex';});closeSettingsModalButton.addEventListener('click',()=>{settingsModal.style.display='none';});
} else console.error("Settings modal elements missing.");

if (mouseSimToggle) mouseSimToggle.addEventListener('change', () => { if(demoModeActive||performanceModeActive){mouseSimToggle.checked=mouseControlsActive;return;} mouseControlsActive=mouseSimToggle.checked; console.log("Mouse controls:",mouseControlsActive); if(!mouseControlsActive)isMouseDown=false;});
if (resetMidiButton) resetMidiButton.addEventListener('click', () => { console.log("Reset MIDI."); turnOffAllActiveNotesGlobally(); });
if (shapeSidesInput) shapeSidesInput.addEventListener('change', () => {
    if(demoModeActive||!selectedShape){shapeSidesInput.value=selectedShape?selectedShape.sides:DEFAULT_SIDES;return;}
    let nS=parseInt(shapeSidesInput.value,10); nS=Math.round(Math.max(MIN_SIDES,Math.min(MAX_SIDES,nS)));
    if(nS!==selectedShape.sides){
        const oS=selectedShape.sides; selectedShape.sides=nS; shapeSides = nS;
        if(midiEnabled&&nS<oS){const notesToTurnOff={};for(let k=nS;k<oS;k++)if(selectedShape.activeNotes[k]&&selectedShape.activeNotes[k].playing)notesToTurnOff[k]={...selectedShape.activeNotes[k]};const oM=midiEnabled;midiEnabled=true;Object.keys(notesToTurnOff).forEach(eI=>{sendMidiNoteOff(notesToTurnOff[eI].note,selectedShape.midiChannel);if(selectedShape.activeNotes[eI])selectedShape.activeNotes[eI].playing=false;});midiEnabled=oM;}
        shapeSidesInput.value=nS; console.log(`Shape ${selectedShape.id} sides:`,nS);
    }
});
if (musicalScaleSelect) musicalScaleSelect.addEventListener('change', () => {if(demoModeActive){musicalScaleSelect.value=currentMusicalScale;return;}currentMusicalScale=musicalScaleSelect.value;console.log("Scale:",currentMusicalScale);turnOffAllActiveNotesGlobally();});
if (resetShapeButton) resetShapeButton.addEventListener('click', () => {
    if(demoModeActive)return;
    if (performanceModeActive) {
        shapes.forEach(s => { s.radius = DEFAULT_RADIUS; s.sides = DEFAULT_SIDES; });
        if (selectedShape) {circleRadius=selectedShape.radius; shapeSides=selectedShape.sides; if(shapeSidesInput)shapeSidesInput.value=selectedShape.sides;}
        turnOffAllActiveNotesGlobally();
    } else if (selectedShape) {
        selectedShape.radius=DEFAULT_RADIUS; selectedShape.sides=DEFAULT_SIDES;
        circleRadius=DEFAULT_RADIUS; shapeSides=DEFAULT_SIDES;
        if(shapeSidesInput)shapeSidesInput.value=DEFAULT_SIDES;
        turnOffAllActiveNotesForShape(selectedShape);
    }
    console.log("Shape(s) reset.");
});

document.addEventListener('DOMContentLoaded', () => { initShapes(); if (mouseSimToggle) mouseSimToggle.checked = mouseControlsActive; if (shapeSidesInput)shapeSidesInput.value = selectedShape?selectedShape.sides:DEFAULT_SIDES; if (musicalScaleSelect) musicalScaleSelect.value = currentMusicalScale; });
window.addEventListener('click', (e) => {if(e.target===infoModal)infoModal.style.display='none';if(e.target===settingsModal)settingsModal.style.display='none';});

const drawLandmarks = (landmarks) => { const cns=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];ctx.strokeStyle='lime';ctx.lineWidth=2;for(const [a,b] of cns){const x1=cW-(landmarks[a].x*cW),y1=landmarks[a].y*cH,x2=cW-(landmarks[b].x*cW),y2=landmarks[b].y*cH;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}};
function distance(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;return Math.sqrt(dx*dx+dy*dy);}
function isTouchingCircle(x,y,cx,cy,r,tol=20){return Math.abs(distance(x,y,cx,cy)-r)<=tol;}

function initShapes() {
    shapes = [];
    const defaultShape = {
      id: 0, x: centerX(), y: centerY(), radius: DEFAULT_RADIUS, sides: DEFAULT_SIDES,
      midiChannel: MIDI_CHANNELS[0], activeNotes: {}, rotationAngle: 0, color: 'cyan',
      liquifyPoints: null, isSelected: true
    };
    shapes.push(defaultShape); selectedShape = defaultShape;
    circleRadius = selectedShape.radius; shapeSides = selectedShape.sides;
    console.log("Shapes initialized, selected shape:", selectedShape);
}

function drawShape(shape, currentPulsedRadius, isPulsingActive, pulseCycleValue, currentDemoAngle, isDemoDistortingFlag) {
  ctx.beginPath();
  const cDS = Math.round(Math.max(MIN_SIDES, Math.min(MAX_SIDES, shape.sides)));
  const cX = shape.x; const cY = shape.y; // Local consts for clarity

  for (let i = 0; i < cDS; i++) {
    const angB = (i/cDS)*Math.PI*2; let curAng = angB + shape.rotationAngle;
    let vXo = currentPulsedRadius * Math.cos(curAng); let vYo = currentPulsedRadius * Math.sin(curAng);
    if (demoModeActive && currentDemoAngle && shape.isSelected) { let rX=vXo*Math.cos(currentDemoAngle)-vYo*Math.sin(currentDemoAngle);let rY=vXo*Math.sin(currentDemoAngle)+vYo*Math.cos(currentDemoAngle);vXo=rX;vYo=rY;}
    let tDX=0; let tDY=0;
    let applyML = false; if(rightHandLandmarks&&!demoModeActive&&shape.isSelected){if(mouseControlsActive&&!isMouseDown)applyML=true;else if(!mouseControlsActive)applyML=true;}
    if(applyML){const vCX=shape.x+vXo;const vCY=shape.y+vYo;const fTs=[4,8,12,16,20];const mID=150;const mF=25;for(const lI of fTs){const ft=rightHandLandmarks[lI];const fX=cW-(ft.x*cW);const fY=ft.y*cH;const d=distance(vCX,vCY,fX,fY);if(d<mID&&d>0){const vx=vCX-fX;const vy=vCY-fY;const nvx=vx/d;const nvy=vy/d;const mag=mF*(1-d/mID);tDX+=nvx*mag;tDY+=nvy*mag;}}}
    if(demoModeActive&&isDemoDistortingFlag&&shape.isSelected){tDX+=(Math.random()-0.5)*30;tDY+=(Math.random()-0.5)*30;}
    const fX=shape.x+vXo+tDX; const fY=shape.y+vYo+tDY;
    if(midiEnabled&&cDS>0){const eI=i;const n=getScaleNote(eI);let vel=Math.max(0,Math.min(127,Math.round(30+(currentPulsedRadius-MIN_RADIUS)*((127-30)/(MAX_RADIUS-MIN_RADIUS)))));if(isPulsingActive){let f=0.6+((pulseCycleValue+1)/2)*0.4;vel=Math.round(vel*f);vel=Math.max(0,Math.min(127,vel));}const dM=Math.sqrt(tDX*tDX+tDY*tDY);const mOD=50.0;const pbs=2048;let pb=8192;if(dM>0.5){const bA=Math.min(1.0,dM/mOD)*pbs;pb=8192+Math.round(bA);pb=Math.max(0,Math.min(16383,pb));}
    if(shape.activeNotes[eI]&&shape.activeNotes[eI].playing){if(shape.activeNotes[eI].note!==n){sendMidiNoteOff(shape.activeNotes[eI].note,shape.midiChannel);sendMidiNoteOn(n,vel,shape.midiChannel);shape.activeNotes[eI].note=n;shape.activeNotes[eI].lastVelocity=vel;shape.activeNotes[eI].lastPitchBend=8192;sendPitchBend(8192,shape.midiChannel);}else{if(Math.abs(pb-shape.activeNotes[eI].lastPitchBend)>10){sendPitchBend(pb,shape.midiChannel);shape.activeNotes[eI].lastPitchBend=pb;}if(Math.abs(vel-shape.activeNotes[eI].lastVelocity)>5)shape.activeNotes[eI].lastVelocity=vel;}}
    else{sendMidiNoteOn(n,vel,shape.midiChannel);shape.activeNotes[eI]={note:n,channel:shape.midiChannel,lastVelocity:vel,lastPitchBend:pb,playing:true};if(pb!==8192)sendPitchBend(pb,shape.midiChannel);}}
    if(i===0)ctx.moveTo(fX,fY);else ctx.lineTo(fX,fY);
  }
  if(Object.keys(shape.activeNotes).length>0){if(midiEnabled&&cDS>0){Object.keys(shape.activeNotes).forEach(iS=>{const iN=Number(iS);if(shape.activeNotes[iN]&&shape.activeNotes[iN].playing){if(iN>=cDS){sendMidiNoteOff(shape.activeNotes[iN].note,shape.midiChannel);shape.activeNotes[iN].playing=false;}}});Object.keys(shape.activeNotes).forEach(iS=>{if(shape.activeNotes[iS]&&!shape.activeNotes[iS].playing)delete shape.activeNotes[iS];});}
  else if(!midiEnabled||cDS===0)turnOffAllActiveNotesForShape(shape);}
  ctx.closePath();
  ctx.strokeStyle = shape.isSelected ? 'yellow' : shape.color;
  ctx.lineWidth = shape.isSelected ? 6 : 4;
  ctx.stroke();
}

function onResults(results) {
  if(selectedShape&&!demoModeActive){circleRadius=selectedShape.radius;shapeSides=selectedShape.sides;}
  if(demoModeActive){demoAngle+=DEMO_ROTATION_SPEED;demoPulseTimer++;demoDistortionTimer++;if(demoPulseTimer>DEMO_PULSE_INTERVAL+DEMO_EVENT_DURATION){demoPulseTimer=0;demoIsPulsing=false;pulseModeActive=false;}else if(demoPulseTimer>DEMO_PULSE_INTERVAL){demoIsPulsing=true;pulseModeActive=true;}if(demoDistortionTimer>DEMO_DISTORTION_INTERVAL+DEMO_EVENT_DURATION){demoDistortionTimer=0;demoIsDistorting=false;}else if(demoDistortionTimer>DEMO_DISTORTION_INTERVAL){demoIsDistorting=true;}rightHandLandmarks=null;}
  else if (!performanceModeActive) { // Normal mode (single shape) hand controls
    if ((!mouseControlsActive || !isMouseDown) && results.multiHandLandmarks && results.multiHandLandmarks.length > 0 && selectedShape) {
        let lH,rH;if(results.multiHandedness.length===1){if(results.multiHandedness[0].label==="Left")lH=results.multiHandLandmarks[0];else rH=results.multiHandLandmarks[0];}else if(results.multiHandedness.length===2){if(results.multiHandedness[0].label==="Left"){lH=results.multiHandLandmarks[0];rH=results.multiHandLandmarks[1];}else{lH=results.multiHandLandmarks[1];rH=results.multiHandLandmarks[0];}}
        const iTU=(l,hL)=>{if(!l)return false;const tO=l[4].y<l[3].y&&l[3].y<l[2].y;const tE=(hL==="Right"&&l[4].x<l[2].x)||(hL==="Left"&&l[4].x>l[2].x);const fC=l[8].y>l[6].y&&l[12].y>l[10].y&&l[16].y>l[14].y&&l[20].y>l[18].y;return tO&&tE&&fC;};
        let isTR=false;if(lH&&rH&&iTU(lH,"Left")&&iTU(rH,"Right")){isTR=true;const lTT=lH[4];const rTT=rH[4];const tDP=distance(lTT.x*cW,lTT.y*cH,rTT.x*cW,rTT.y*cH);const mnTD=cW*0.05;const mxTD=cW*0.5;const nTD=Math.max(0,Math.min(1,(tDP-mnTD)/(mxTD-mnTD)));selectedShape.radius=MIN_RADIUS+nTD*(MAX_RADIUS-MIN_RADIUS);circleRadius=selectedShape.radius;}
        if(rH&&!isTR)rightHandLandmarks=rH;else if(!isTR)rightHandLandmarks=null;
        if(lH)drawLandmarks(lH);if(rH)drawLandmarks(rH);
        if(lH&&!isTR){const iT=lH[8];const tT=lH[4];const ix=cW-(iT.x*cW);const iy=iT.y*cH;const tx=cW-(tT.x*cW);const ty=tT.y*cH;const pD=distance(ix,iy,tx,ty);const pX=(ix+tx)/2;const pY=(iy+ty)/2;
          if(isTouchingCircle(pX,pY,selectedShape.x,selectedShape.y,selectedShape.radius)){const nP=Math.max(0,Math.min(1,(pD-20)/150));const nSV=MIN_SIDES+nP*(MAX_SIDES-MIN_SIDES);
            if(Math.abs(nSV-selectedShape.sides)>0.5){const oS=selectedShape.sides;selectedShape.sides=Math.round(Math.min(Math.max(nSV,MIN_SIDES),MAX_SIDES));shapeSides=selectedShape.sides;if(shapeSidesInput)shapeSidesInput.value=selectedShape.sides;
              if(midiEnabled&&selectedShape.sides<oS){for(let k=selectedShape.sides;k<oS;k++)if(selectedShape.activeNotes[k]&&selectedShape.activeNotes[k].playing){sendMidiNoteOff(selectedShape.activeNotes[k].note,selectedShape.midiChannel);selectedShape.activeNotes[k].playing=false;}}}}}}}
    else if(!results.multiHandLandmarks||results.multiHandLandmarks.length===0)rightHandLandmarks=null;
  } // No specific hand landmark processing for performance mode yet (beyond drawing them if present)

  if(!midiEnabled&&shapes.some(s=>Object.keys(s.activeNotes).length>0))turnOffAllActiveNotesGlobally();
  ctx.fillStyle='rgba(0,0,0,0.1)';ctx.fillRect(0,0,cW,cH);
  let cOP=pulseModeActive||(demoModeActive&&demoIsPulsing);let actualPCV=0;
  if(cOP){pulseTime=performance.now()*0.001;actualPCV=Math.sin(pulseTime*pulseFrequency*2*Math.PI);}
  for(const shape of shapes){let rTD=shape.radius;let iPFT=cOP&&shape.isSelected;if(demoModeActive&&demoIsPulsing&&shape.isSelected)iPFT=true;if(iPFT){let pRMF=0.25*actualPCV;rTD=shape.radius*(1+pRMF);rTD=Math.max(10,rTD);}drawShape(shape,rTD,iPFT,actualPCV,demoAngle,demoIsDistorting&&shape.isSelected);}
  if(outputPopupWindow&&!outputPopupWindow.closed&&popupCanvasCtx){try{const pC=outputPopupWindow.document.getElementById('popupCanvas');if(pC){if(pC.width!==outputPopupWindow.innerWidth||pC.height!==outputPopupWindow.innerHeight){pC.width=outputPopupWindow.innerWidth;pC.height=outputPopupWindow.innerHeight;}popupCanvasCtx.fillStyle='rgba(0,0,0,0.1)';popupCanvasCtx.fillRect(0,0,pC.width,pC.height);popupCanvasCtx.drawImage(canvasElement,0,0,pC.width,pC.height);}}catch(e){}}
}

if(openOutputPopupButton){openOutputPopupButton.addEventListener('click',()=>{if(outputPopupWindow&&!outputPopupWindow.closed)outputPopupWindow.focus();else{outputPopupWindow=window.open('','OutputWindow','width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');if(outputPopupWindow){outputPopupWindow.document.write("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><title>Visual Output</title><style>body{margin:0;overflow:hidden;background:#111;display:flex;justify-content:center;align-items:center;}canvas{display:block;width:100%;height:100%;}</style></head><body><canvas id=\"popupCanvas\"></canvas></body></html>");outputPopupWindow.document.close();const pCO=outputPopupWindow.document.getElementById('popupCanvas');if(pCO){popupCanvasCtx=pCO.getContext('2d');pCO.width=outputPopupWindow.innerWidth;pCO.height=outputPopupWindow.innerHeight;}else{console.error("No popupCanvas");outputPopupWindow.close();outputPopupWindow=null;return;}outputPopupWindow.addEventListener('beforeunload',()=>{console.log("Popup closing.");popupCanvasCtx=null;outputPopupWindow=null;});}else console.error("Failed to open popup.");}});}else console.error("openOutputPopupButton not found.");

const cW = canvasElement.width;
const cH = canvasElement.height;
// initShapes(); // Called in DOMContentLoaded
