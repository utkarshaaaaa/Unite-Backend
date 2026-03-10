const { Server } = require("socket.io");
const { V2 } = require("paseto");
const Message = require("../Schema/Message");
const Group = require("../Schema/Group");

const PUBLIC_KEY = process.env.PASETO_PUBLIC_KEY.replace(/\\n/g, "\n");

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const payload = await V2.verify(token, PUBLIC_KEY);
      socket.userId = payload.id;
      socket.userEmail = payload.userEmail;
      socket.userName = payload.userName;
      next();
    } catch (err) {
      console.error("Socket auth error:", err);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userName} (${socket.userId})`);

    // Join a group room
    socket.on("join_group", async (groupId) => {
      try {
        // Verify user is a member of the group
        const group = await Group.findById(groupId);
        if (!group) {
          socket.emit("error", { message: "Group not found" });
          return;
        }

        const isMember = group.members.some(
          (member) => member.user.toString() === socket.userId
        );

        if (!isMember && group.creator.toString() !== socket.userId) {
          socket.emit("error", { message: "You are not a member of this group" });
          return;
        }

        socket.join(groupId);
        console.log(`User ${socket.userName} joined group ${groupId}`);
        
        // Notify others in the group
        socket.to(groupId).emit("user_joined", {
          userId: socket.userId,
          userName: socket.userName,
        });
      } catch (err) {
        console.error("Error joining group:", err);
        socket.emit("error", { message: "Failed to join group" });
      }
    });

    // Leave a group room
    socket.on("leave_group", (groupId) => {
      socket.leave(groupId);
      console.log(`User ${socket.userName} left group ${groupId}`);
      
      socket.to(groupId).emit("user_left", {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    // Send message to a group
    socket.on("send_message", async (data) => {
      try {
        const { groupId, content, messageType = "text", attachmentUrl = "" } = data;

        // Verify user is a member
        const group = await Group.findById(groupId);
        if (!group) {
          socket.emit("error", { message: "Group not found" });
          return;
        }

        const isMember = group.members.some(
          (member) => member.user.toString() === socket.userId
        );

        if (!isMember && group.creator.toString() !== socket.userId) {
          socket.emit("error", { message: "You are not a member of this group" });
          return;
        }

        // Save message to database
        const message = new Message({
          group: groupId,
          sender: socket.userId,
          content,
          messageType,
          attachmentUrl,
        });

        await message.save();
        await message.populate("sender", "userName profileImageUrl");

        // Emit message to all users in the group
        io.to(groupId).emit("new_message", {
          _id: message._id,
          group: message.group,
          sender: message.sender,
          content: message.content,
          messageType: message.messageType,
          attachmentUrl: message.attachmentUrl,
          createdAt: message.createdAt,
        });
      } catch (err) {
        console.error("Error sending message:", err);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Typing indicator
    socket.on("typing", (data) => {
      socket.to(data.groupId).emit("user_typing", {
        userId: socket.userId,
        userName: socket.userName,
        groupId: data.groupId,
      });
    });

    socket.on("stop_typing", (data) => {
      socket.to(data.groupId).emit("user_stop_typing", {
        userId: socket.userId,
        groupId: data.groupId,
      });
    });

    // Mark messages as read
    socket.on("mark_read", async (data) => {
      try {
        const { messageIds, groupId } = data;

        await Message.updateMany(
          { _id: { $in: messageIds } },
          {
            $addToSet: {
              readBy: {
                user: socket.userId,
                readAt: new Date(),
              },
            },
          }
        );

        socket.to(groupId).emit("messages_read", {
          userId: socket.userId,
          messageIds,
        });
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userName} (${socket.userId})`);
    });
  });

  return io;
}

module.exports = setupSocket;
