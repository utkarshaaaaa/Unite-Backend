const express = require("express");
const router = express.Router();
const Notification = require("../Schema/Notification");
const authMiddleware = require("../Middlewares/authMiddleware");

// Get all notifications for the current user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { limit = 50, unreadOnly } = req.query;

    const query = { recipient: req.user.id };

    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .populate("sender", "userName profileImageUrl")
      .populate("group", "groupName")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      isRead: false,
    });

    res.json({
      count: notifications.length,
      unreadCount,
      notifications,
    });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Mark notification as read
router.put("/:notificationId/read", authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Check if user is the recipient
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You can only mark your own notifications as read",
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();

    await notification.save();

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Mark all notifications as read
router.put("/read-all", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("Mark all notifications read error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Delete a notification
router.delete("/:notificationId", authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Check if user is the recipient
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You can only delete your own notifications",
      });
    }

    await Notification.findByIdAndDelete(notificationId);

    res.json({
      message: "Notification deleted successfully",
    });
  } catch (err) {
    console.error("Delete notification error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Clear all notifications
router.delete("/", authMiddleware, async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user.id });

    res.json({
      message: "All notifications cleared",
    });
  } catch (err) {
    console.error("Clear notifications error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
