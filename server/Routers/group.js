const express = require("express");
const router = express.Router();
const Group = require("../Schema/Group");
const User = require("../Schema/User");
const Notification = require("../Schema/Notification");
const authMiddleware = require("../Middlewares/authMiddleware");
const { calculateDistance, formatDistance } = require("../utils/distance");

// Create a new group (public or private)
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const {
      groupName,
      description,
      category,
      isPrivate,
      location,
      locationName,
      meetingDate,
      meetingTime,
      duration,
      maxParticipants,
      groupImage,
      tags,
      rules,
    } = req.body;

    // Validate required fields
    if (
      !groupName ||
      !description ||
      !category ||
      !location ||
      !locationName ||
      !meetingDate ||
      !meetingTime
    ) {
      return res.status(400).json({
        message:
          "groupName, description, category, location, locationName, meetingDate, and meetingTime are required",
      });
    }

    // Validate location coordinates
    if (!location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({
        message:
          "Valid location coordinates [longitude, latitude] are required",
      });
    }

    // Create group
    const group = new Group({
      groupName,
      description,
      category,
      isPrivate: isPrivate || false,
      creator: req.user.id,
      location: {
        type: "Point",
        coordinates: location.coordinates,
      },
      locationName,
      meetingDate,
      meetingTime,
      duration: duration || 60,
      maxParticipants: maxParticipants || null,
      groupImage: groupImage || "",
      tags: tags || [],
      rules: rules || "",
      members: [
        {
          user: req.user.id,
          status: "joined",
        },
      ],
    });

    await group.save();

    // Update user's created groups
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        [isPrivate ? "userPrivateGroupsCreated" : "userPublicGroupsCreated"]:
          group._id,
        userGroupsJoined: group._id,
      },
    });

    const populatedGroup = await Group.findById(group._id).populate(
      "creator",
      "userName profileImageUrl",
    );

    res.status(201).json({
      message: "Group created successfully",
      group: populatedGroup,
    });
  } catch (err) {
    console.error("Create group error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Get nearby public groups
router.get("/nearby", authMiddleware, async (req, res) => {
  try {
    const { longitude, latitude, maxDistance, category } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        message: "longitude and latitude are required",
      });
    }

    const maxDist =
      parseInt(maxDistance) ||
      parseInt(process.env.MAX_SEARCH_DISTANCE) ||
      50000;

    const query = {
      isPrivate: false,
      isActive: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: maxDist,
        },
      },
    };

    if (category && category !== "All") {
      query.category = category;
    }

    const groups = await Group.find(query)
      .populate("creator", "userName profileImageUrl")
      .populate("members.user", "userName profileImageUrl")
      .limit(50);

    // Calculate distance for each group
    const groupsWithDistance = groups.map((group) => {
      const distance = calculateDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        group.location.coordinates[1],
        group.location.coordinates[0],
      );

      return {
        ...group.toObject(),
        distance: distance,
        distanceFormatted: formatDistance(distance),
      };
    });

    res.json({
      count: groupsWithDistance.length,
      groups: groupsWithDistance,
    });
  } catch (err) {
    console.error("Get nearby groups error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Search groups
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { query, category, longitude, latitude, maxDistance } = req.query;
    const base = { isActive: true };

    if (category && category !== "All") {
      base.category = category;
    }

    if (longitude && latitude) {
      const maxDist = parseInt(maxDistance) || 50000;
      base.location = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: maxDist,
        },
      };
    }

    let groups = [];
    const q = (query || "").trim();

    if (q.length > 0) {
      try {
        groups = await Group.find({
          ...base,
          isPrivate: false,
          $text: { $search: q },
        })
          .populate("creator", "userName profileImageUrl")
          .populate("members.user", "userName profileImageUrl")
          .sort({ score: { $meta: "textScore" } })
          .limit(50);
      } catch (_) {
        groups = [];
      }

      // Runs when text search returns nothing OR when text index not available.
      if (groups.length === 0) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(escaped, "i");
        groups = await Group.find({
          ...base,
          isPrivate: false,
          $or: [
            { groupName: re },
            { description: re },
            { locationName: re },
            { category: re },
            { tags: re },
          ],
        })
          .populate("creator", "userName profileImageUrl")
          .populate("members.user", "userName profileImageUrl")
          .sort({ createdAt: -1 })
          .limit(50);
      }
    } else {
      groups = await Group.find({ ...base, isPrivate: false })
        .populate("creator", "userName profileImageUrl")
        .populate("members.user", "userName profileImageUrl")
        .sort({ createdAt: -1 })
        .limit(30);
    }

    res.json({ count: groups.length, groups });
  } catch (err) {
    console.error("Search groups error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Get group by ID
router.get("/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate("creator", "userName profileImageUrl userEmail")
      .populate("members.user", "userName profileImageUrl userEmail")
      .populate("pendingRequests.user", "userName profileImageUrl userEmail");

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (group.isPrivate) {
      const isMember = group.members.some(
        (member) => member.user._id.toString() === req.user.id,
      );
      const isCreator = group.creator._id.toString() === req.user.id;

      if (!isMember && !isCreator) {
        return res.status(403).json({
          message: "Access denied. This is a private group.",
        });
      }
    }

    res.json({ group });
  } catch (err) {
    console.error("Get group error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Invite user to group (creator or members can invite)
router.post("/:groupId/invite/:userId", authMiddleware, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isCreator = group.creator.toString() === req.user.id;
    const isMember = group.members.some(
      (member) =>
        member.user.toString() === req.user.id && member.status === "approved",
    );

    if (!isCreator && !isMember) {
      return res.status(403).json({
        message: "Only group creator or members can invite users",
      });
    }

    // Check if user is already a member
    const alreadyMember = group.members.some(
      (member) => member.user.toString() === userId,
    );

    if (alreadyMember) {
      return res.status(400).json({
        message: "User is already a member or has a pending request",
      });
    }

    // Check if user is the creator
    if (group.creator.toString() === userId) {
      return res.status(400).json({
        message: "User is the group creator",
      });
    }

    group.members.push({
      user: userId,
      status: "invited", // or 'pending' based on status
      joinedAt: new Date(),
    });

    await group.save();

    const Notification = require("../Schema/Notification");
    await Notification.create({
      recipient: userId,
      sender: req.user.id,
      group: groupId,
      type: "group_invite",
      message: `You've been invited to join ${group.groupName}`,
    });

    res.json({
      message: "User invited successfully",
      group,
    });
  } catch (err) {
    console.error("Invite user error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Join a public group
router.post("/:groupId/join", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.isActive) {
      return res.status(400).json({ message: "Group is no longer active" });
    }

    if (group.isPrivate) {
      return res.status(403).json({
        message: "Cannot join private group. Request to join instead.",
      });
    }

    // Check if already a member
    const isMember = group.members.some(
      (member) => member.user.toString() === req.user.id,
    );

    if (isMember) {
      return res
        .status(400)
        .json({ message: "Already a member of this group" });
    }

    // Check max participants
    if (
      group.maxParticipants &&
      group.members.length >= group.maxParticipants
    ) {
      return res.status(400).json({ message: "Group is full" });
    }

    // Add user to group
    group.members.push({
      user: req.user.id,
      status: "joined",
    });

    await group.save();

    // Update user's joined groups
    await User.findByIdAndUpdate(req.user.id, {
      $push: { userGroupsJoined: group._id },
    });

    // Create notification for group creator
    const notification = new Notification({
      recipient: group.creator,
      sender: req.user.id,
      type: "new_member",
      group: group._id,
      message: `${req.user.userName} joined your group "${group.groupName}"`,
    });
    await notification.save();

    if (req.io) {
      req.io.to(groupId).emit("member_joined", {
        groupId: group._id,
        userId: req.user.id,
        userName: req.user.userName,
      });
    }

    res.json({
      message: "Successfully joined the group",
      group,
    });
  } catch (err) {
    console.error("Join group error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Request to join a private group
router.post("/:groupId/request", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!group.isActive) {
      return res.status(400).json({ message: "Group is no longer active" });
    }

    if (!group.isPrivate) {
      return res.status(400).json({
        message: "This is a public group. Use join endpoint instead.",
      });
    }

    // Check if already a member
    const isMember = group.members.some(
      (member) => member.user.toString() === req.user.id,
    );

    if (isMember) {
      return res
        .status(400)
        .json({ message: "Already a member of this group" });
    }

    // Check if already requested
    const hasRequested = group.pendingRequests.some(
      (request) => request.user.toString() === req.user.id,
    );

    if (hasRequested) {
      return res.status(400).json({
        message: "You have already requested to join this group",
      });
    }

    // Add to pending requests
    group.pendingRequests.push({
      user: req.user.id,
    });

    await group.save();

    // Create notification for group creator
    const notification = new Notification({
      recipient: group.creator,
      sender: req.user.id,
      type: "join_request",
      group: group._id,
      message: `${req.user.userName} requested to join your group "${group.groupName}"`,
    });
    await notification.save();

    res.json({
      message: "Join request sent successfully",
    });
  } catch (err) {
    console.error("Request join error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Accept join request (creator only)
router.post("/:groupId/accept/:userId", authMiddleware, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Only the group creator can accept join requests",
      });
    }

    // Find the pending request
    const requestIndex = group.pendingRequests.findIndex(
      (request) => request.user.toString() === userId,
    );

    if (requestIndex === -1) {
      return res.status(404).json({ message: "Join request not found" });
    }

    // Check max participants
    if (
      group.maxParticipants &&
      group.members.length >= group.maxParticipants
    ) {
      return res.status(400).json({ message: "Group is full" });
    }

    // Remove from pending requests and add to members
    group.pendingRequests.splice(requestIndex, 1);
    group.members.push({
      user: userId,
      status: "joined",
    });

    await group.save();

    // Update user's joined groups
    await User.findByIdAndUpdate(userId, {
      $push: { userGroupsJoined: group._id },
    });

    // Create notification for the user
    const notification = new Notification({
      recipient: userId,
      sender: req.user.id,
      type: "request_accepted",
      group: group._id,
      message: `Your request to join "${group.groupName}" has been accepted`,
    });
    await notification.save();

    res.json({
      message: "Join request accepted",
      group,
    });
  } catch (err) {
    console.error("Accept request error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Reject join request (creator only)
router.post("/:groupId/reject/:userId", authMiddleware, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Only the group creator can reject join requests",
      });
    }

    const requestIndex = group.pendingRequests.findIndex(
      (request) => request.user.toString() === userId,
    );

    if (requestIndex === -1) {
      return res.status(404).json({ message: "Join request not found" });
    }

    group.pendingRequests.splice(requestIndex, 1);
    await group.save();

    res.json({
      message: "Join request rejected",
    });
  } catch (err) {
    console.error("Reject request error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

//Accept group Invite
router.post("/:groupId/accept-invite", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.isActive)
      return res.status(400).json({ message: "Group is no longer active" });

    const memberEntry = group.members.find(
      (m) => m.user.toString() === req.user.id && m.status === "invited",
    );

    if (!memberEntry) {
      return res
        .status(404)
        .json({ message: "No pending invite found for this group" });
    }

    const joinedCount = group.members.filter(
      (m) => m.status === "joined",
    ).length;
    if (group.maxParticipants && joinedCount >= group.maxParticipants) {
      return res.status(400).json({ message: "Group is full" });
    }

    memberEntry.status = "joined";
    memberEntry.joinedAt = new Date();
    await group.save();

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { userGroupsJoined: group._id },
    });

    // Notify the creator
    await Notification.create({
      recipient: group.creator,
      sender: req.user.id,
      type: "new_member",
      group: group._id,
      message: `${req.user.userName} accepted your invite to "${group.groupName}"`,
    });

    if (req.io) {
      req.io.to(groupId).emit("member_joined", {
        groupId: group._id,
        userId: req.user.id,
        userName: req.user.userName,
      });
    }

    res.json({ message: "Invite accepted. You are now a member.", group });
  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reject / decline a group invite  (the invited user declines)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:groupId/reject-invite", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);

    if (!group) return res.status(404).json({ message: "Group not found" });

    const memberIndex = group.members.findIndex(
      (m) => m.user.toString() === req.user.id && m.status === "invited",
    );

    if (memberIndex === -1) {
      return res
        .status(404)
        .json({ message: "No pending invite found for this group" });
    }

    // Remove the invited entry entirely
    group.members.splice(memberIndex, 1);
    await group.save();

    // Let the creator know the invite was declined
    await Notification.create({
      recipient: group.creator,
      sender: req.user.id,
      type: "request_rejected",
      group: group._id,
      message: `${req.user.userName} declined your invite to "${group.groupName}"`,
    });

    res.json({ message: "Invite declined." });
  } catch (err) {
    console.error("Reject invite error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Leave a group
router.post("/:groupId/leave", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is the creator
    if (group.creator.toString() === req.user.id) {
      return res.status(400).json({
        message:
          "Group creator cannot leave. Delete the group or transfer ownership.",
      });
    }

    // Find member index
    const memberIndex = group.members.findIndex(
      (member) => member.user.toString() === req.user.id,
    );

    if (memberIndex === -1) {
      return res
        .status(400)
        .json({ message: "You are not a member of this group" });
    }

    group.members.splice(memberIndex, 1);
    await group.save();

    // Update user's joined groups
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { userGroupsJoined: group._id },
    });

    // Emit socket event
    if (req.io) {
      req.io.to(groupId).emit("member_left", {
        groupId: group._id,
        userId: req.user.id,
        userName: req.user.userName,
      });
    }

    res.json({
      message: "Successfully left the group",
    });
  } catch (err) {
    console.error("Leave group error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Remove a member from group (creator only)
router.delete("/:groupId/members/:userId", authMiddleware, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Only the group creator can remove members",
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        message: "Creator cannot remove themselves from the group",
      });
    }

    const memberIndex = group.members.findIndex(
      (member) => member.user.toString() === userId,
    );

    if (memberIndex === -1) {
      return res
        .status(404)
        .json({ message: "Member not found in this group" });
    }

    group.members.splice(memberIndex, 1);
    await group.save();

    await User.findByIdAndUpdate(userId, {
      $pull: { userGroupsJoined: group._id },
    });

    await Notification.create({
      recipient: userId,
      sender: req.user.id,
      type: "meeting_cancelled",
      group: group._id,
      message: `You have been removed from the group "${group.groupName}"`,
    });

    // Socket event so the removed user's UI updates in real time
    if (req.io) {
      req.io.to(groupId).emit("member_removed", {
        groupId: group._id,
        userId,
      });
    }

    res.json({ message: "Member removed successfully" });
  } catch (err) {
    console.error("Remove member error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Update group (creator only)
router.put("/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const {
      groupName,
      description,
      category,
      location,
      locationName,
      meetingDate,
      meetingTime,
      duration,
      maxParticipants,
      groupImage,
      tags,
      rules,
    } = req.body;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Only the group creator can update the group",
      });
    }

    if (groupName) group.groupName = groupName;
    if (description) group.description = description;
    if (category) group.category = category;
    if (locationName) group.locationName = locationName;
    if (meetingDate) group.meetingDate = meetingDate;
    if (meetingTime) group.meetingTime = meetingTime;
    if (duration) group.duration = duration;
    if (maxParticipants !== undefined) group.maxParticipants = maxParticipants;
    if (groupImage) group.groupImage = groupImage;
    if (tags) group.tags = tags;
    if (rules !== undefined) group.rules = rules;

    if (location && location.coordinates && location.coordinates.length === 2) {
      group.location = {
        type: "Point",
        coordinates: location.coordinates,
      };
    }

    await group.save();

    // Notify all members
    const memberIds = group.members.map((m) => m.user);
    const notifications = memberIds
      .filter((id) => id.toString() !== req.user.id)
      .map((id) => ({
        recipient: id,
        sender: req.user.id,
        type: "group_updated",
        group: group._id,
        message: `"${group.groupName}" has been updated`,
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Emit socket event
    if (req.io) {
      req.io.to(groupId).emit("group_updated", {
        groupId: group._id,
        group,
      });
    }

    res.json({
      message: "Group updated successfully",
      group,
    });
  } catch (err) {
    console.error("Update group error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Delete group (creator only)
router.delete("/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is the creator
    if (group.creator.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Only the group creator can delete the group",
      });
    }

    // Remove group from all members' joined groups
    const memberIds = group.members.map((m) => m.user);
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $pull: { userGroupsJoined: group._id } },
    );

    // Remove from creator's created groups
    await User.findByIdAndUpdate(req.user.id, {
      $pull: {
        userPublicGroupsCreated: group._id,
        userPrivateGroupsCreated: group._id,
      },
    });

    await Group.findByIdAndDelete(groupId);

    // Emit socket event
    if (req.io) {
      req.io.to(groupId).emit("group_deleted", {
        groupId: group._id,
      });
    }

    res.json({
      message: "Group deleted successfully",
    });
  } catch (err) {
    console.error("Delete group error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Get user's groups
router.get("/user/my-groups", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: "userGroupsJoined",
        model: "GroupUnite",
        populate: { path: "creator", select: "userName profileImageUrl" },
      })
      .populate({
        path: "userPublicGroupsCreated",
        model: "GroupUnite",
        populate: { path: "creator", select: "userName profileImageUrl" },
      })
      .populate({
        path: "userPrivateGroupsCreated",
        model: "GroupUnite",
        populate: { path: "creator", select: "userName profileImageUrl" },
      });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      joinedGroups: user.userGroupsJoined,
      publicGroupsCreated: user.userPublicGroupsCreated,
      privateGroupsCreated: user.userPrivateGroupsCreated,
    });
  } catch (err) {
    console.error("Get user groups error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

//Give the user or group creater notification about the event for the day and notify them about the event from about 2 hours

router.get("/user/upcoming-events", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const userGroups = await Group.find({
      _id: { $in: user.userGroupsJoined },
      isActive: true,
    });

    const now = new Date();
    const upcomingEvents = userGroups.filter((group) => {
      const eventDateTime = new Date(
        `${group.meetingDate}T${group.meetingTime}`,
      );
      return eventDateTime > now && eventDateTime - now <= 24 * 60 * 60 * 1000;
    });
    res.json({ upcomingEvents });
  } catch (err) {
    console.error("Get upcoming events error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Delete the group if the event is done and notify the user in notification section about the event is done and the group is deleted
router.delete("/cleanup/past-events", async (req, res) => {
  try {
    const now = new Date();//current date and time
    const pastGroups = await Group.find({
      isActive: true,
      $expr: {
        $lt: [
          {
            $dateFromString: {
              dateString: {
                $concat: ["$meetingDate", "T", "$meetingTime"],
              },
            },
          },
          now,
        ],
      },
    });

    for (const group of pastGroups) {
      group.isActive = false;
      await group.save();

      const memberIds = group.members.map((m) => m.user);
      await User.updateMany(
        { _id: { $in: memberIds } },
        { $pull: { userGroupsJoined: group._id } }
      );
    }
    res.json({ message:"Past events cleaned up successfully" });
  } catch (err) {
    console.error("Cleanup past events error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});


// Total number of active public groups currently for the Login page display

router.get("/stats/total-groups-user", async (req, res) => {
  try {
    const totalPublicGroups = await Group.countDocuments({ isPrivate: false, isActive: true });
    const totalUsers = await User.countDocuments({ isActive: true });
    const totalEvents=await Group.countDocuments({ isActive: true });
    res.json({ totalPublicGroups, totalUsers, totalEvents });
  } catch (err) {
    console.error("Get total groups error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});


module.exports = router;
