const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
// const router = require("./Routers/router");
const auth = require("./Routers/auth");
const authRouter = require("./Routers/auth");
const groupRouter = require("./Routers/group");
const messageRouter = require("./Routers/message");
const notificationRouter = require("./Routers/notification");
const locationRouter = require("./Routers/location");
const setupSocket = require("./config/socket");

// Import all schemas to register models with Mongoose
const User = require("./Schema/User");
const Group = require("./Schema/Group");
const Message = require("./Schema/Message");
const Notification = require("./Schema/Notification");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
app.use(
  cors({
    origin: "https://unite0.onrender.com",//localhost:5173
    credentials: true,               
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

mongoose
  .connect(process.env.MONGODB_CONNECT_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const io = setupSocket(server);
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use("/auth", authRouter);
app.use("/groups", groupRouter);
app.use("/messages", messageRouter);
app.use("/notifications", notificationRouter);
app.use("/location", locationRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(` Server running at http://localhost:${PORT}`);
});
