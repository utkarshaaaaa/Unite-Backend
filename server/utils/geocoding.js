const axios = require("axios");
/**
 * Convert coordinates to human-readable address using Google Maps Geocoding API
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {Promise<Object>} Address details
 */
async function reverseGeocode(latitude, longitude) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.warn("Google Maps API key not configured");
      return {
        formattedAddress: `${latitude}, ${longitude}`,
        city: "",
        country: "",
      };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
    const response = await axios.get(url);

    if (response.data.status === "OK" && response.data.results.length > 0) {
      const result = response.data.results[0];
      let city = "";
      let country = "";
      
      result.address_components.forEach((component) => {
        if (component.types.includes("locality")) {
          city = component.long_name;
        }
        if (component.types.includes("country")) {
          country = component.long_name;
        }
      });

      return {
        formattedAddress: result.formatted_address,
        city,
        country,
        placeId: result.place_id,
      };
    }

    return {
      formattedAddress: `${latitude}, ${longitude}`,
      city: "",
      country: "",
    };
  } catch (err) {
    console.error("Reverse geocoding error:", err.message);
    return {
      formattedAddress: `${latitude}, ${longitude}`,
      city: "",
      country: "",
    };
  }
}

/**
 * Get autocomplete suggestions for a location search query
 * @param {string} query - Search query
 * @param {number} latitude - User's latitude for bias
 * @param {number} longitude - User's longitude for bias
 * @returns {Promise<Array>} Suggestions
 */
async function getPlaceSuggestions(query, latitude = null, longitude = null) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      throw new Error("Google Maps API key not configured");
    }

    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}`;
    
    if (latitude && longitude) {
      url += `&location=${latitude},${longitude}&radius=50000`;
    }

    const response = await axios.get(url);

    if (response.data.status === "OK") {
      return response.data.predictions.map((prediction) => ({
        description: prediction.description,
        placeId: prediction.place_id,
      }));
    }

    return [];
  } catch (err) {
    console.error("Place suggestions error:", err.message);
    return [];
  }
}

/**
 * Get detailed place information by place ID
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object>} Place details
 */
async function getPlaceDetails(placeId) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      throw new Error("Google Maps API key not configured");
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry&key=${apiKey}`;
    const response = await axios.get(url);

    if (response.data.status === "OK") {
      const result = response.data.result;
      return {
        name: result.name,
        address: result.formatted_address,
        coordinates: [
          result.geometry.location.lng,
          result.geometry.location.lat,
        ],
      };
    }

    throw new Error("Place not found");
  } catch (err) {
    console.error("Place details error:", err.message);
    throw err;
  }
}

module.exports = {
  reverseGeocode,
  getPlaceSuggestions,
  getPlaceDetails,
};
