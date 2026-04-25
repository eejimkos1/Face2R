/**
 * Face Recognition Module
 * Wraps vladmandic/human for face detection, embedding extraction, and matching.
 */

const MATCH_THRESHOLD = 0.5;

const humanConfig = {
  backend: 'humangl',
  modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
  face: {
    enabled: true,
    detector: {
      return: true,
      rotation: false,
      maxDetected: 5,
      minConfidence: 0.2,
      iouThreshold: 0.25
    },
    mesh: { enabled: true },
    description: { enabled: true }
  },
  hand: { enabled: false },
  gesture: { enabled: false },
  body: { enabled: false },
  segmentation: { enabled: false },
  filter: {
    enabled: true,
    equalization: true
  }
};

let human = null;
let ready = false;

/**
 * Initialize the Human library by dynamically importing from CDN.
 * @param {function} onProgress - Callback receiving (message, percent)
 */
export async function initHuman(onProgress) {
  const { Human } = await import('https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.esm.js');
  human = new Human(humanConfig);

  onProgress('Loading models...', 30);
  await human.load();

  onProgress('Warming up...', 60);
  await human.warmup('face');

  onProgress('Ready', 90);
  ready = true;
}

/**
 * Detect faces in the given input (image, video, or canvas element).
 * @param {HTMLElement} input - Image, video, or canvas element
 * @returns {Array} Array of detected face objects with box, embedding, score, and demographics
 */
export async function detectFaces(input) {
  const result = await human.detect(input);

  return result.face
    .filter((face) => face.embedding)
    .map((face) => ({
      box: {
        x: face.box[0],
        y: face.box[1],
        width: face.box[2],
        height: face.box[3]
      },
      embedding: face.embedding,
      score: face.score,
      faceScore: face.faceScore,
      age: face.age,
      gender: face.gender,
      genderScore: face.genderScore
    }));
}

/**
 * Match a face embedding against all persons in the database.
 * @param {Array<number>} embedding - 1024-dimensional face embedding to match
 * @param {Object} personsDb - Database of persons with their photo embeddings
 * @returns {Object|null} Best match above threshold or null
 */
export function matchFace(embedding, personsDb) {
  let bestMatch = null;
  let bestSimilarity = 0;

  for (const personId of Object.keys(personsDb)) {
    const person = personsDb[personId];
    const photos = person.photos || {};

    for (const photoId of Object.keys(photos)) {
      const photo = photos[photoId];

      if (!photo.embedding || !Array.isArray(photo.embedding)) {
        continue;
      }

      const similarity = human.match.similarity(embedding, photo.embedding);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = { personId, person, similarity };
      }
    }
  }

  if (bestSimilarity >= MATCH_THRESHOLD && bestMatch) {
    return {
      personId: bestMatch.personId,
      person: bestMatch.person,
      similarity: bestMatch.similarity,
      matchPercent: Math.round(bestMatch.similarity * 100)
    };
  }

  return null;
}

/**
 * Check if the Human library is initialized and ready.
 * @returns {boolean}
 */
export function isReady() {
  return ready;
}
