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
