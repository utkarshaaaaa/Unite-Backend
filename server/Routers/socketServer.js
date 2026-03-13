
const { Server } = require("socket.io");
const { V2 }     = require("paseto");
require("dotenv").config();

const PUBLIC_KEY = process.env.PASETO_PUBLIC_KEY?.replace(/\\n/g, "\n");

const roomMembers = new Map();

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

    // join_group
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

    // leave_group 
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

    // send_message (direct socket fallback)
    socket.on("send_message", ({ groupId, message } = {}) => {
      if (!groupId || !message) return;
      io.to(String(groupId)).emit("new_message", message);
    });

    // typing_start
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
