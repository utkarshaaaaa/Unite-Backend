// const { V2 } = require("paseto");
// const dotenv = require("dotenv");

// dotenv.config();

// const PUBLIC_KEY = process.env.PASETO_PUBLIC_KEY.replace(/\\n/g, "\n");

// async function authMiddleware(req, res, next) {
//   try {
   
//     let token = req.cookies?.access_token;
    
//     if (!token) {
//       const authToken = req.headers.authorization;
//       if (!authToken) {
//         return res.status(401).json({ message: "No token provided" });
//       }
//       token = authToken.split(" ")[1];
//     }

//     if (!token) {
//       return res.status(401).json({ message: "No token provided" });
//     }

//     const payload = await V2.verify(token, PUBLIC_KEY);

//     req.user = payload;
//     next();
//   } catch (err) {
//     console.error(err);
//     return res.status(401).json({ message: "Invalid or expired token" });
//   }
// }

// module.exports = authMiddleware;



// const { V2 } = require("paseto");
// const dotenv = require("dotenv");

// dotenv.config();

// const PUBLIC_KEY = process.env.PASETO_PUBLIC_KEY.replace(/\\n/g, "\n");

// async function authMiddleware(req, res, next) {
//   try {
//     const token = req.cookies?.access_token;

//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: "Not authenticated",
//       });
//     }

//     const payload = await V2.verify(token, PUBLIC_KEY);

//     req.user = payload;

//     next();
//   } catch (err) {
//     console.error("Auth Error:", err.message);
//     return res.status(401).json({
//       success: false,
//       message: "Session expired. Please login again.",
//     });
//   }
// }

// module.exports = authMiddleware;

// authMiddleware.js
const { V2 } = require("paseto");
const dotenv = require("dotenv");

dotenv.config();

const PUBLIC_KEY = process.env.PASETO_PUBLIC_KEY?.replace(/\\n/g, "\n");

async function authMiddleware(req, res, next) {
  try {
    let token = null;

    // try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }

    // fall back to cookie
    if (!token && req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    // further fallback: token in query or body (helps debugging clients that can't send cookies)
    if (!token && req.query?.token) {
      token = req.query.token;
    }
    if (!token && req.body?.token) {
      token = req.body.token;
    }

    console.log("Auth Debug:", {
      hasAuthHeader: !!authHeader,
      authHeaderStart: authHeader?.substring(0, 20),
      rawCookieHeader: req.headers.cookie,
      parsedCookie: req.cookies?.access_token,
      tokenUsed: token ? token.slice(0, 10) + "…" : null,
      tokenLength: token?.length,
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });

    if (!token) {
      // give hint in response for debugging
      return res.status(401).json({
        success: false,
        message: "Not authenticated - no token found. Send credentials or Authorization header.",
      });
    }

    const payload = await V2.verify(token, PUBLIC_KEY);
    req.user = payload;            // e.g. { id, email, … }
    return next();
  } catch (err) {
    console.error("Auth Error:", err.message);
    return res.status(401).json({
      success: false,
      message: "Session expired. Please login again.",
    });
  }
}

module.exports = authMiddleware;