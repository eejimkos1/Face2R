/**
 * confidence.js — Pure confidence score calculator with diversity multiplier.
 * ES module, no dependencies, no side effects, no DOM access.
 */

/**
 * Compute euclidean distance between two numeric arrays.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Return a base score bracket based on photo count.
 * @param {number} count
 * @returns {number}
 */
function getBaseScore(count) {
  if (count >= 11) return 90;
  if (count >= 7) return 78;
  if (count >= 4) return 62;
  if (count >= 2) return 40;
  if (count === 1) return 20;
  return 0;
}

/**
 * Extract embeddings from a photo list, compute average pairwise euclidean
 * distance, and return the diversity multiplier.
 * @param {object[]} photoList — array of photo objects, each with an `embedding` field
 * @returns {number}
 */
function getDiversityMultiplier(photoList) {
  const embeddings = photoList
    .map((p) => p.embedding)
    .filter((e) => Array.isArray(e) && e.length > 0);

  if (embeddings.length < 2) return 1.0;

  let totalDistance = 0;
  let pairCount = 0;

  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      totalDistance += euclideanDistance(embeddings[i], embeddings[j]);
      pairCount++;
    }
  }

  const avgDistance = totalDistance / pairCount;

  if (avgDistance < 0.3) return 0.6;
  if (avgDistance < 0.5) return 0.8;
  if (avgDistance < 0.8) return 1.0;
  return 1.1;
}

/**
 * Calculate a confidence score for a set of photos.
 * @param {object|null|undefined} photos — Firebase photos object keyed by photoId
 * @returns {number} integer confidence score clamped to 0-95
 */
export function calculateConfidence(photos) {
  if (!photos || typeof photos !== "object") return 0;

  const photoList = Object.values(photos);
  if (photoList.length === 0) return 0;

  const baseScore = getBaseScore(photoList.length);
  const multiplier = getDiversityMultiplier(photoList);
  const raw = Math.round(baseScore * multiplier);

  return Math.max(0, Math.min(95, raw));
}

/**
 * Return a recommendation object based on confidence and photo count.
 * @param {number} confidence
 * @param {number} photoCount
 * @returns {{ text: string, color: string }}
 */
export function getRecommendation(confidence, photoCount) {
  if (confidence < 30) {
    return {
      text: "Very low! Add 6+ more photos from different angles",
      color: "#f44336",
    };
  }
  if (confidence < 50) {
    return {
      text: "Add more photos. Try: left profile, right profile",
      color: "#ff9800",
    };
  }
  if (confidence < 70) {
    return {
      text: "Getting better. Try: different lighting, with/without glasses",
      color: "#ff9800",
    };
  }
  if (confidence < 85) {
    return {
      text: "Good coverage. A few more varied photos would help",
      color: "#4caf50",
    };
  }
  return {
    text: "Good recognition coverage",
    color: "#4caf50",
  };
}

/**
 * Return a hex color representing the confidence level.
 * @param {number} confidence
 * @returns {string}
 */
export function getConfidenceColor(confidence) {
  if (confidence < 30) return "#f44336";
  if (confidence < 70) return "#ff9800";
  return "#4caf50";
}
