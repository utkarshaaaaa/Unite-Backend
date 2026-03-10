const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "uniteUser",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "uniteUser",
    },
    type: {
      type: String,
      enum: [
        "group_invite",
        "join_request",
        "request_accepted",
        "request_rejected",
        "new_member",
        "group_updated",
        "meeting_reminder",
        "meeting_cancelled",
      ],
      required: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupUnite",
    },
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
