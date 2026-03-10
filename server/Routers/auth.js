
const express = require("express");
const router = express.Router();
const { V2 } = require("paseto");
const User = require("../Schema/User");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const authMiddleware = require("../Middlewares/authMiddleware");

dotenv.config();

const PRIVATE_KEY = process.env.PASETO_PRIVATE_KEY.replace(/\\n/g, "\n");

// Register
router.post("/register", async (req, res) => {
  try {
    const { userName, userEmail, password } = req.body;

    if (!userName || !userEmail || !password) {
      return res.status(400).json({
        message: "userName, userEmail, and password are required",
      });
    }

    const existEmail = await User.findOne({ userEmail });
    if (existEmail) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const existUsername = await User.findOne({
      userName: { $regex: new RegExp(`^${userName}$`, "i") },
    });
    if (existUsername) {
      return res.status(400).json({ message: "Username is already taken" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      userName,
      userEmail,
      password: hashed,
    });

    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser._id,
        userName: newUser.userName,
        userEmail: newUser.userEmail,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});


// login
router.post("/login", async (req, res) => {
  try {
    const { userEmail, password } = req.body;

    if (!userEmail || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const user = await User.findOne({ userEmail });
    if (!user) return res.status(400).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = await V2.sign(
      {
        id: user._id.toString(),
        userEmail: user.userEmail,
        userName: user.userName,
      },
      PRIVATE_KEY,
      { expiresIn: "7d" }
    );

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: false, // true in production (HTTPS)
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        userName: user.userName,
        userEmail: user.userEmail,
        profileImageUrl: user.profileImageUrl,
        location:user.location,
        locationName:user.locationName,
        bio:user.bio,
        interests:user.interests,


      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("access_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  res.json({ message: "Logged out successfully" });
});


// PROTECTED ROUTE TEST
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      source:
        req.cookies?.access_token
          ? "cookie"
          : "authorization-header",
      user,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

//Search users by username
router.get("/search-users", authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({
        message: "Search query must be at least 2 characters",
      });
    }

    const users = await User.find({
      userName: { $regex: query, $options: 'i' },
      _id: { $ne: req.user.id }, 
    })
      .select('userName userEmail bio profileImageUrl')
      .limit(10);

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    console.error("Search users error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

//check username availability
router.get("/check-username", async (req, res) => {
  try {
    const { userName } = req.query;

    if (!userName) {
      return res.status(400).json({
        message: "userName is required",
      });
    }

    const existingUser = await User.findOne({ 
      userName: { $regex: new RegExp(`^${userName}$`, 'i') } 
    });

    res.json({
      available: !existingUser,
      userName: userName,
    });
  } catch (err) {
    console.error("Check username error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});



//Update user profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { userName, bio, profileImageUrl, interests, locationName } = req.body;

    if (userName && userName.trim()) {
      const existing = await User.findOne({
        userName: { $regex: new RegExp(`^${userName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        _id: { $ne: req.user.id },
      });
      if (existing) {
        return res.status(400).json({ message: "Username is already taken." });
      }
    }

    const updates = {};
    if (userName        !== undefined && userName.trim())        updates.userName        = userName.trim();
    if (bio             !== undefined)                           updates.bio             = bio.trim();
    if (profileImageUrl !== undefined)                           updates.profileImageUrl = profileImageUrl.trim();
    if (interests       !== undefined && Array.isArray(interests)) updates.interests     = interests;
    if (locationName    !== undefined)                           updates.locationName    = locationName.trim();

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ success: true, message: "Profile updated successfully.", user: updated });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
