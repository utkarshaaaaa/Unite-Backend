const express = require("express");
const router = express.Router();
const Message = require("../Schema/Message");
const Group = require("../Schema/Group");
const authMiddleware = require("../Middlewares/authMiddleware");

// Get messages for a group
router.get("/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50, before } = req.query;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some(
      (member) => member.user.toString() === req.user.id
    );

    if (!isMember && group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You must be a member of this group to view messages",
      });
    }

    // Build query
    const query = { group: groupId };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Fetch messages
    const messages = await Message.find(query)
      .populate("sender", "userName profileImageUrl")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      count: messages.length,
      messages: messages.reverse(), // Reverse to get oldest first
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Send a message (primarily handled via Socket.IO, but this is a REST fallback)
router.post("/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, messageType = "text", attachmentUrl = "" } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Message content is required" });
    }
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some(
      (member) => member.user.toString() === req.user.id
    );

    if (!isMember && group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You must be a member of this group to send messages",
      });
    }

    // Create message
    const message = new Message({
      group: groupId,
      sender: req.user.id,
      content,
      messageType,
      attachmentUrl,
    });

    await message.save();
    await message.populate("sender", "userName profileImageUrl");

    // Emit via Socket.IO if available
    if (req.io) {
      req.io.to(groupId).emit("new_message", {
        _id: message._id,
        group: message.group,
        sender: message.sender,
        content: message.content,
        messageType: message.messageType,
        attachmentUrl: message.attachmentUrl,
        createdAt: message.createdAt,
      });
    }

    res.status(201).json({
      message: "Message sent successfully",
      data: message,
    });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Edit a message
router.put("/:messageId", authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Message content is required" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You can only edit your own messages",
      });
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();
    await message.populate("sender", "userName profileImageUrl");

    if (req.io) {
      req.io.to(message.group.toString()).emit("message_edited", {
        messageId: message._id,
        content: message.content,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
      });
    }

    res.json({
      message: "Message edited successfully",
      data: message,
    });
  } catch (err) {
    console.error("Edit message error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Delete a message
router.delete("/:messageId", authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const group = await Group.findById(message.group);

    if (
      message.sender.toString() !== req.user.id &&
      group.creator.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message: "You can only delete your own messages or as group creator",
      });
    }

    const groupId = message.group.toString();
    await Message.findByIdAndDelete(messageId);

    if (req.io) {
      req.io.to(groupId).emit("message_deleted", {
        messageId: message._id,
        groupId: groupId,
      });
    }

    res.json({
      message: "Message deleted successfully",
    });
  } catch (err) {
    console.error("Delete message error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
