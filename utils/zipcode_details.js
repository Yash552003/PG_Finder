// utils/zipcode_details.js
// Simple local zipcode lookup to avoid external API keys.
// If you want more coverage, extend zipcodes.json with more entries.

const path = require('path');
const fs = require('fs');

let zipDB = {};
try {
  const dataPath = path.join(__dirname, 'zipcodes.json');
  if (fs.existsSync(dataPath)) {
    zipDB = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch (err) {
  console.warn('Could not load local zipcodes.json', err);
}

// Exposed function used by middlewares. It returns a Promise for parity with
// async network lookups.
function getZipcodeDetails(zip) {
  return new Promise((resolve) => {
    // 1) try exact match in zipDB
    if (zip && zipDB[zip]) {
      return resolve({ success: true, data: zipDB[zip] });
    }

    // 2) fallback deterministic mock: derive a lat/lng from zip string so UI can
    // "place" a marker without calling an external API.
    const defaultLat = 20.5937; // India's rough mid-lat
    const defaultLng = 78.9629;

    // crude deterministic offset
    let hash = 0;
    for (let i = 0; i < (zip || '').length; i++) {
      hash = (hash * 31 + zip.charCodeAt(i)) % 1000;
    }
    const lat = defaultLat + (hash % 50) * 0.01 - 0.25;
    const lng = defaultLng + (hash % 50) * 0.01 - 0.25;

    resolve({
      success: true,
      data: {
        zip,
        city: 'Unknown',
        state: 'Unknown',
        latitude: lat,
        longitude: lng
      }
    });
  });
}

module.exports = { getZipcodeDetails };
