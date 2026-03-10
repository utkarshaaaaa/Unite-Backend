const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupUnite",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "uniteUser",
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "location", "system"],
      default: "text",
    },
    attachmentUrl: {
      type: String,
      default: "",
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "uniteUser",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

messageSchema.index({ group: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

const Message = mongoose.model("MessageUnite", messageSchema);

module.exports = Message;
