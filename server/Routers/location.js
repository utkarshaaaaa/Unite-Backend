const express = require("express");
const router = express.Router();
const authMiddleware = require("../Middlewares/authMiddleware");
const {
  reverseGeocode,
  getPlaceSuggestions,
  getPlaceDetails,
} = require("../utils/geocoding");

/**
 * POST /location/update
 * Update user location with automatic address lookup
 * 
 * Body: {
 *   latitude: number,
 *   longitude: number
 * }
 */
router.post("/update", authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        message: "latitude and longitude are required",
      });
    }

    // Get address from coordinates
    const addressInfo = await reverseGeocode(latitude, longitude);

    const User = require("../Schema/User");
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          location: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          locationName: addressInfo.formattedAddress,
        },
      },
      { new: true }
    ).select("-password");

    res.json({
      message: "Location updated successfully",
      location: {
        coordinates: [longitude, latitude],
        locationName: addressInfo.formattedAddress,
        city: addressInfo.city,
        country: addressInfo.country,
      },
    });
  } catch (err) {
    console.error("Update location error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/**
 * POST /location/reverse-geocode
 * Convert coordinates to address
 * 
 * Body: {
 *   latitude: number,
 *   longitude: number
 * }
 */
router.post("/reverse-geocode", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        message: "latitude and longitude are required",
      });
    }

    const addressInfo = await reverseGeocode(latitude, longitude);
    res.json({
      success: true,
      data: addressInfo,
    });
  } catch (err) {
    console.error("Reverse geocode error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/**
 * GET /location/search?query=Mumbai
 * Search for places/addresses
 */
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { query, latitude, longitude } = req.query;

    if (!query) {
      return res.status(400).json({
        message: "query parameter is required",
      });
    }

    const suggestions = await getPlaceSuggestions(
      query,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null
    );

    res.json({
      success: true,
      count: suggestions.length,
      suggestions,
    });
  } catch (err) {
    console.error("Place search error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/**
 * GET /location/place/:placeId
 * Get detailed information about a place
 */
router.get("/place/:placeId", authMiddleware, async (req, res) => {
  try {
    const { placeId } = req.params;

    const placeDetails = await getPlaceDetails(placeId);

    res.json({
      success: true,
      data: placeDetails,
    });
  } catch (err) {
    console.error("Get place details error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
