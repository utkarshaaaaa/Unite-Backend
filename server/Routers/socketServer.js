// /**
//  * socketServer.js
//  * ───────────────
//  * Drop this file next to your Express app entry (e.g. server.js / index.js)
//  * and call  initSocket(httpServer)  after creating your HTTP server.
//  *
//  * Required: npm install socket.io
//  *
//  * Usage in server.js / index.js:
//  *
//  *   const { createServer } = require("http");
//  *   const { initSocket }   = require("./socketServer");
//  *   const app              = require("./app"); // your express app
//  *
//  *   const httpServer = createServer(app);
//  *   initSocket(httpServer);
//  *   httpServer.listen(PORT);
//  *
//  * The socket instance is also attached to every Express request as req.io
//  * so existing REST routes (message.js) can emit events without changes.
//  */

// const { Server } = require("socket.io");

// // ── In-memory state ──────────────────────────────────────────────────────────
// // Map<groupId, Set<socketId>>   — which sockets are in which room
// const roomMembers = new Map();

// // Map<socketId, { userId, userName, groupIds: Set }>  — socket metadata
// const socketMeta  = new Map();

// // ─────────────────────────────────────────────────────────────────────────────
// function initSocket(httpServer) {
//   const io = new Server(httpServer, {
//     cors: {
//       origin: [
//         "http://localhost:5173",   // Vite dev
//         "http://localhost:3000",   // CRA dev
//         "https://unite0.onrender.com", // ← replace with your production URL
//       ],
//       credentials: true,
//       methods: ["GET", "POST"],
//     },
//     transports: ["websocket", "polling"],
//     pingTimeout:  30000,
//     pingInterval: 10000,
//   });

//   // ── Attach io to every Express request (used by REST fallback routes) ──────
//   httpServer.on("request", (req, _res) => { req.io = io; });

//   // ── Optional: simple auth guard ──────────────────────────────────────────
//   // Uncomment if you want to validate the session cookie / JWT on connect.
//   //
//   // io.use(async (socket, next) => {
//   //   try {
//   //     // e.g. verify JWT from socket.handshake.auth.token
//   //     const user = await verifyToken(socket.handshake.auth.token);
//   //     socket.data.userId   = String(user._id);
//   //     socket.data.userName = user.userName;
//   //     next();
//   //   } catch (err) {
//   //     next(new Error("Unauthorized"));
//   //   }
//   // });

//   io.on("connection", (socket) => {
//     console.log(`[socket] connected: ${socket.id}`);

//     // ── join_group ─────────────────────────────────────────────────────────
//     socket.on("join_group", (groupId) => {
//       if (!groupId) return;
//       const gid = String(groupId);
//       socket.join(gid);

//       // Track room membership
//       if (!roomMembers.has(gid)) roomMembers.set(gid, new Set());
//       roomMembers.get(gid).add(socket.id);

//       // Track which groups this socket is in
//       const meta = socketMeta.get(socket.id) ?? { groupIds: new Set() };
//       meta.groupIds.add(gid);
//       socketMeta.set(socket.id, meta);

//       console.log(`[socket] ${socket.id} joined group ${gid}`);
//     });

//     // ── leave_group ────────────────────────────────────────────────────────
//     socket.on("leave_group", (groupId) => {
//       if (!groupId) return;
//       const gid = String(groupId);
//       socket.leave(gid);
//       roomMembers.get(gid)?.delete(socket.id);
//       socketMeta.get(socket.id)?.groupIds.delete(gid);

//       // If user was typing, broadcast stop
//       io.to(gid).emit("user_stopped_typing", {
//         userId:   socketMeta.get(socket.id)?.userId,
//         groupId:  gid,
//       });

//       console.log(`[socket] ${socket.id} left group ${gid}`);
//     });

//     // ── send_message ───────────────────────────────────────────────────────
//     // Primary path: frontend calls the REST API (messagesAPI.send) which
//     // saves the message and then calls req.io.to(groupId).emit("new_message").
//     //
//     // This event is kept as a direct-socket fallback / for future use.
//     socket.on("send_message", (payload) => {
//       const { groupId, message } = payload ?? {};
//       if (!groupId || !message) return;
//       io.to(String(groupId)).emit("new_message", message);
//     });

//     // ── typing_start ───────────────────────────────────────────────────────
//     socket.on("typing_start", ({ groupId, userId, userName }) => {
//       if (!groupId || !userId) return;
//       const gid = String(groupId);

//       // Store metadata on socket for cleanup on disconnect
//       const meta = socketMeta.get(socket.id) ?? { groupIds: new Set() };
//       meta.userId   = String(userId);
//       meta.userName = userName;
//       socketMeta.set(socket.id, meta);

//       // Broadcast to everyone in room EXCEPT the sender
//       socket.to(gid).emit("user_typing", {
//         userId:   String(userId),
//         userName: userName ?? "Someone",
//         groupId:  gid,
//       });
//     });

//     // ── typing_stop ────────────────────────────────────────────────────────
//     socket.on("typing_stop", ({ groupId, userId }) => {
//       if (!groupId || !userId) return;
//       socket.to(String(groupId)).emit("user_stopped_typing", {
//         userId:  String(userId),
//         groupId: String(groupId),
//       });
//     });

//     // ── disconnect ─────────────────────────────────────────────────────────
//     socket.on("disconnect", (reason) => {
//       console.log(`[socket] disconnected: ${socket.id} (${reason})`);

//       const meta = socketMeta.get(socket.id);
//       if (meta) {
//         // Broadcast typing-stop to all rooms this socket was in
//         meta.groupIds.forEach((gid) => {
//           if (meta.userId) {
//             io.to(gid).emit("user_stopped_typing", {
//               userId:  meta.userId,
//               groupId: gid,
//             });
//           }
//           roomMembers.get(gid)?.delete(socket.id);
//         });
//         socketMeta.delete(socket.id);
//       }
//     });

//     // ── error ──────────────────────────────────────────────────────────────
//     socket.on("error", (err) => {
//       console.error(`[socket] error on ${socket.id}:`, err.message);
//     });
//   });

//   console.log("[socket] Socket.IO server initialized");
//   return io;
// }

// module.exports = { initSocket };


const { Server } = require("socket.io");
const { V2 }     = require("paseto");
require("dotenv").config();

const PUBLIC_KEY = process.env.PASETO_PUBLIC_KEY?.replace(/\\n/g, "\n");

// ── In-memory state ──────────────────────────────────────────────────────────
// groupId  → Set<socketId>
const roomMembers = new Map();

// socketId → { userId, userName, groupIds: Set<groupId> }
const socketMeta  = new Map();

// ─────────────────────────────────────────────────────────────────────────────
function initSocket(httpServer) {
  const allowedOrigins = [
    "https://unite0.onrender.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error(`Socket CORS blocked: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingTimeout:  30000,
    pingInterval: 10000,
  });

  // ── Optional PASETO auth on handshake ──────────────────────────────────────
  // The frontend sends the token via:
  //   io(URL, { auth: { token: "v2.public.…" }, withCredentials: true })
  // Cookie-based sessions work automatically; this adds Bearer-token support.
  io.use(async (socket, next) => {
    try {
      // 1. Try auth.token (frontend can pass it explicitly)
      const rawToken = socket.handshake.auth?.token;

      // 2. Try cookie (sent automatically with withCredentials: true)
      const cookieHeader = socket.handshake.headers?.cookie ?? "";
      const cookieToken  = cookieHeader
        .split(";")
        .map(c => c.trim())
        .find(c => c.startsWith("access_token="))
        ?.split("=")[1];

      const token = rawToken || cookieToken;

      if (!token) {
        // Allow connection but mark as unauthenticated
        socket.data.userId   = null;
        socket.data.userName = "Guest";
        return next();
      }

      const payload = await V2.verify(token, PUBLIC_KEY);
      socket.data.userId   = String(payload.id);
      socket.data.userName = payload.userName ?? "Member";
      next();
    } catch (err) {
      // Don't block connection on bad token — REST routes guard writes
      console.warn("[socket] token verify failed:", err.message);
      socket.data.userId   = null;
      socket.data.userName = "Guest";
      next();
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { userId, userName } = socket.data;
    console.log(`[socket] + connected  ${socket.id}  user=${userId ?? "anon"}`);

    socketMeta.set(socket.id, {
      userId:   userId ?? null,
      userName: userName ?? "Member",
      groupIds: new Set(),
    });

    // ── join_group ───────────────────────────────────────────────────────────
    socket.on("join_group", (groupId) => {
      if (!groupId) return;
      const gid = String(groupId);

      socket.join(gid);

      if (!roomMembers.has(gid)) roomMembers.set(gid, new Set());
      roomMembers.get(gid).add(socket.id);

      const meta = socketMeta.get(socket.id);
      if (meta) meta.groupIds.add(gid);

      console.log(`[socket] ${socket.id} joined  group=${gid}  size=${roomMembers.get(gid).size}`);
    });

    // ── leave_group ──────────────────────────────────────────────────────────
    socket.on("leave_group", (groupId) => {
      if (!groupId) return;
      const gid  = String(groupId);
      const meta = socketMeta.get(socket.id);

      socket.leave(gid);
      roomMembers.get(gid)?.delete(socket.id);
      meta?.groupIds.delete(gid);

      if (meta?.userId) {
        socket.to(gid).emit("user_stopped_typing", {
          userId:  meta.userId,
          groupId: gid,
        });
      }

      console.log(`[socket] ${socket.id} left    group=${gid}`);
    });

    // ── send_message (direct socket fallback) ────────────────────────────────
    // Normal path: frontend → REST POST /messages/:groupId → req.io.emit
    socket.on("send_message", ({ groupId, message } = {}) => {
      if (!groupId || !message) return;
      io.to(String(groupId)).emit("new_message", message);
    });

    // ── typing_start ─────────────────────────────────────────────────────────
    socket.on("typing_start", ({ groupId, userId: uid, userName: uname } = {}) => {
      if (!groupId) return;
      const gid  = String(groupId);
      const meta = socketMeta.get(socket.id);

      if (meta) {
        if (uid)   meta.userId   = String(uid);
        if (uname) meta.userName = uname;
      }

      const resolvedId   = meta?.userId   ?? String(uid   ?? "");
      const resolvedName = meta?.userName ?? uname ?? "Someone";

      if (!resolvedId) return;

      socket.to(gid).emit("user_typing", {
        userId:   resolvedId,
        userName: resolvedName,
        groupId:  gid,
      });
    });

    // ── typing_stop ──────────────────────────────────────────────────────────
    socket.on("typing_stop", ({ groupId, userId: uid } = {}) => {
      if (!groupId) return;
      const meta       = socketMeta.get(socket.id);
      const resolvedId = meta?.userId ?? String(uid ?? "");
      if (!resolvedId) return;

      socket.to(String(groupId)).emit("user_stopped_typing", {
        userId:  resolvedId,
        groupId: String(groupId),
      });
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log(`[socket] - disconnected ${socket.id}  reason=${reason}`);

      const meta = socketMeta.get(socket.id);
      if (meta) {
        meta.groupIds.forEach((gid) => {
          roomMembers.get(gid)?.delete(socket.id);

          if (meta.userId) {
            io.to(gid).emit("user_stopped_typing", {
              userId:  meta.userId,
              groupId: gid,
            });
          }
        });
        socketMeta.delete(socket.id);
      }
    });

    // ── error ────────────────────────────────────────────────────────────────
    socket.on("error", (err) => {
      console.error(`[socket] error on ${socket.id}:`, err.message);
    });
  });

  console.log("[socket] Socket.IO server ready");
  return io;
}

module.exports = { initSocket };
