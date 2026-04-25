/**
 * camera.js — Camera module for Face2R
 *
 * Wraps getUserMedia for camera access, switching, frame capture,
 * and torch control. Targets mobile browsers (iOS Safari, Android Chrome).
 */

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let videoElement = null;
let currentStream = null;
let facingMode = 'environment';

// ---------------------------------------------------------------------------
// Internal function
// ---------------------------------------------------------------------------

/**
 * Stops any existing stream, acquires a new camera stream with the
 * current facingMode, and pipes it into the stored videoElement.
 *
 * @returns {Promise<void>} resolves when the video metadata has loaded
 *   and the video is ready for use.
 */
async function requestCamera() {
  // Stop existing tracks before requesting a new stream
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  const constraints = {
    video: {
      facingMode: facingMode,
      width: { ideal: 640 },
      height: { ideal: 480 }
    },
    audio: false
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  currentStream = stream;
  videoElement.srcObject = stream;

  // Wait for the video dimensions to be known before resolving
  return new Promise((resolve) => {
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      resolve();
    };
  });
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Initializes the camera module with the given <video> element and
 * starts the camera stream.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<void>}
 */
export function startCamera(videoEl) {
  videoElement = videoEl;
  return requestCamera();
}

/**
 * Toggles the camera between 'environment' (rear) and 'user' (front)
 * facing modes and restarts the stream.
 *
 * @returns {Promise<void>}
 */
export function switchCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  return requestCamera();
}

/**
 * Stops all tracks on the current stream, releasing the camera.
 */
export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}

/**
 * Captures the current video frame to a canvas element.
 *
 * @returns {HTMLCanvasElement} canvas with the current frame drawn at
 *   the native video resolution (videoWidth x videoHeight).
 */
export function captureFrame() {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Captures a cropped region of the current video frame, scaled to 300x300.
 * Used for extracting a single face from the video for embedding or display.
 *
 * @param {{ x: number, y: number, width: number, height: number }} box
 *   Crop coordinates in video-pixel space.
 * @returns {HTMLCanvasElement} 300x300 canvas with the cropped face.
 */
export function captureFaceCrop(box) {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    videoElement,
    box.x, box.y, box.width, box.height,
    0, 0, 300, 300
  );
  return canvas;
}

/**
 * Converts a canvas to a JPEG Blob at 0.85 quality.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export function captureFrameAsBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.85);
  });
}

/**
 * Returns the stored <video> element reference.
 *
 * @returns {HTMLVideoElement | null}
 */
export function getVideoElement() {
  return videoElement;
}

/**
 * Checks whether the camera stream is currently active.
 *
 * @returns {boolean}
 */
export function isCameraActive() {
  return currentStream !== null && currentStream.active === true;
}

/**
 * Toggles the torch (flashlight) on the rear camera, if supported.
 *
 * @param {boolean} on — true to enable, false to disable.
 * @returns {Promise<void>}
 */
export async function toggleTorch(on) {
  if (!currentStream) {
    return;
  }

  const track = currentStream.getVideoTracks()[0];
  if (!track) {
    return;
  }

  const capabilities = track.getCapabilities();
  if (capabilities.torch) {
    await track.applyConstraints({ advanced: [{ torch: on }] });
  }
}
