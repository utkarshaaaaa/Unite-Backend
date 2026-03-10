const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Sports",
        "Technology",
        "Music",
        "Arts",
        "Food",
        "Education",
        "Gaming",
        "Health",
        "Business",
        "Travel",
        "Social",
        "Other",
      ],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "uniteUser",
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    locationName: {
      type: String,
      required: true,
    },
    meetingDate: {
      type: Date,
      required: true,
    },
    meetingTime: {
      type: String,
      required: true,
    },
    duration: {
      type: Number, // in minutes
      default: 60,
    },
    maxParticipants: {
      type: Number,
      default: null, // null means unlimited
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "uniteUser",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["joined", "invited", "requested"],
          default: "joined",
        },
      },
    ],
    pendingRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "uniteUser",
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    groupImage: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    rules: {
      type: String,
      maxlength: 2000,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);


groupSchema.index({ location: "2dsphere" });
groupSchema.index({ category: 1, isPrivate: 1, isActive: 1 });
groupSchema.index({ creator: 1 });
groupSchema.index({ meetingDate: 1 });
groupSchema.index({ "members.user": 1 });

// Text index for searching groups
groupSchema.index({ groupName: "text", description: "text", tags: "text" });

const Group = mongoose.model("GroupUnite", groupSchema);

module.exports = Group;
