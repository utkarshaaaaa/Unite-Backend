// const express = require("express");
// const http = require("http");
// const cors = require("cors");
// const mongoose = require("mongoose");
// const cookieParser = require("cookie-parser");
// // const router = require("./Routers/router");
// const auth = require("./Routers/auth");

// const authRouter = require("./Routers/auth");
// const groupRouter = require("./Routers/group");
// const messageRouter = require("./Routers/message");
// const notificationRouter = require("./Routers/notification");
// const locationRouter = require("./Routers/location");
// const setupSocket = require("./config/socket");
// const User = require("./Schema/User");
// const Group = require("./Schema/Group");
// const Message = require("./Schema/Message");
// const Notification = require("./Schema/Notification");

// require("dotenv").config();

// const app = express();
// const server = http.createServer(app);
// app.use(
//   cors({
//     origin: "https://unite0.onrender.com", //localhost:5173
//     credentials: true,               
//     methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

// mongoose
//   .connect(process.env.MONGODB_CONNECT_URI)
//   .then(() => console.log("MongoDB connected"))
//   .catch((err) => console.error("MongoDB connection error:", err));

// const io = setupSocket(server);
// app.use((req, res, next) => {
//   req.io = io;
//   next();
// });

// app.use("/auth", authRouter);
// app.use("/groups", groupRouter);
// app.use("/messages", messageRouter);
// app.use("/notifications", notificationRouter);
// app.use("/location", locationRouter);

// // Add dashboard route
// app.get("/dashboard", (req, res) => {
//   res.json({ message: "Dashboard endpoint - implement your dashboard logic here" });
// });

// // 404 Handler
// app.use((req, res) => {
//   res.status(404).json({ message: "Route not found" });
// });

// app.use((err, req, res, next) => {
//   console.error("Error:", err);
//   res.status(err.status || 500).json({
//     message: err.message || "Internal Server Error",
//     error: process.env.NODE_ENV === "development" ? err : {},
//   });
// });

// const PORT = process.env.PORT || 5000;

// server.listen(PORT, () => {
//   console.log(` Server running at http://localhost:${PORT}`);
// });
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const authRouter = require("./Routers/auth");
const groupRouter = require("./Routers/group");
const messageRouter = require("./Routers/message");
const notificationRouter = require("./Routers/notification");
const locationRouter = require("./Routers/location");
const { initSocket } = require("./Routers/socketServer");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

const allowedOrigins = [
  "https://unite0.onrender.com",
  "http://localhost:5173", // Vite
  "http://localhost:3000", // CRA
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req, _res, next) => {
  req.io = io;
  next();
});

mongoose
  .connect(process.env.MONGODB_CONNECT_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/groups", groupRouter);
app.use("/messages", messageRouter);
app.use("/notifications", notificationRouter);
app.use("/location", locationRouter);

app.get("/dashboard", (_req, res) =>
  res.json({ message: "Dashboard endpoint" }),
);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));


app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT,'0.0.0.0', () =>
  console.log(`Server running at http://localhost:${PORT}`),
);
