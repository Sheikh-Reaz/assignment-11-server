const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const admin = require("firebase-admin");
const app = express();
const crypto = require("crypto");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

/* ================================
   FIREBASE ADMIN INITIALIZATION
================================= */

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


function generateProductId() {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PROD-${randomPart}`;
}

/* ================================
   MIDDLEWARES
================================= */

app.use(
  cors({
    origin: "http://localhost:5173", // ✅ your frontend
    credentials: true, // ✅ allow cookies
  })
);

app.use(express.json());
app.use(cookieParser()); // ✅ required for reading HttpOnly cookies

/* ================================
   MONGODB CONNECTION
================================= */

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.esrwang.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

/* ================================
   VERIFY TOKEN MIDDLEWARE
================================= */









const verifyFBToken = async (req, res, next) => {
  const token = req.cookies.token; // ✅ read from HttpOnly cookie

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded_email = decoded.email; // ✅ attach user email
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

/* ================================
   SERVER RUN FUNCTION
================================= */

async function run() {
  try {
    await client.connect();

    const db = client.db("assignment-11");
    const usersCollection = db.collection("users");
    const productsCollection = db.collection("products")

/* ================================
   JWT ROUTE → SAVE TOKEN TO COOKIE
================================= */
app.post("/jwt", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).send({ message: "Token is required" });
  }

  try {
    // Verify Firebase ID token
    const decoded = await admin.auth().verifyIdToken(token);

    // Send cookie with proper settings
    res
      .cookie("token", token, {
        httpOnly: true,                      // cannot be accessed by JS
        secure: process.env.NODE_ENV === "production", // true in prod
        sameSite: "strict",                  // CSRF protection
        maxAge: 60 * 60 * 1000,              // 1 hour (matches Firebase token)
      })
      .status(200)
      .send({ success: true, email: decoded.email });
  } catch (error) {
    console.error("JWT Error:", error);
    res.status(401).send({ message: "Invalid Firebase Token" });
  }
});


    /* ================================
       LOGOUT → CLEAR COOKIE
    ================================= */

    app.post("/logout", (req, res) => {
      res.clearCookie("token").send({ success: true });
    });
    app.post("/logout", (req, res) => {
      res.clearCookie("token").send({ success: true });
    });
    app.post("/logout", (req, res) => {
      res.clearCookie("token").send({ success: true });
    });

       /* ================================
       PROTECTED APIS
    ================================= */

    {/**User Related APIS */}


 






    // Ping Test
    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB Connected Successfully!");
  } finally {
    // keep connection alive
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Assignment 11 server is running");
});

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
