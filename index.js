const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const admin = require("firebase-admin");
const app = express();
const crypto = require("crypto");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const { ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

//-------------FIREBASE ADMIN

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
//Product Id
function generateProductId() {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PROD-${randomPart}`;
}
//Order Id
function generateOrderId() {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  const timestampPart = Date.now().toString().slice(-5);
  return `ORD-${timestampPart}-${randomPart}`;
}

//---------- MIDDLEWARES
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(cookieParser());

// MONGODB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.esrwang.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ----------VERIFY FIREBASE TOKEN

const verifyFBToken = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded_email = decoded.email;
    next();
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

async function run() {
  try {
    await client.connect();
    const db = client.db("assignment-11");
    const usersCollection = db.collection("users");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");
    const trackingCollection = db.collection("orderTrackings");

    /* ================================
       VERIFY MANAGER (✅ FIXED)
    ================================ */

    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded_email;
        const user = await usersCollection.findOne({ email });

        if (!user || user.role !== "admin") {
          return res.status(403).send({ message: "Forbidden access" });
        }
        next();
      } catch (err) {
        console.error("verifyAdmin error:", err);
        res.status(500).send({ message: "Server error" });
      }
    };
    const verifyManager = async (req, res, next) => {
      try {
        const email = req.decoded_email;
        const user = await usersCollection.findOne({ email });

        if (!user || user.role !== "manager") {
          return res.status(403).send({ message: "Forbidden access" });
        }
        next();
      } catch (err) {
        console.error("verifyManager error:", err);
        res.status(500).send({ message: "Server error" });
      }
    };

    //cookie verification
    app.post("/jwt", async (req, res) => {
      const { token } = req.body;
      const decoded = await admin.auth().verifyIdToken(token);

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 60 * 60 * 1000,
        })
        .send({ email: decoded.email });
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token").send({ success: true });
    });

    //Use related apis...............................

    app.get("/users/:email/role", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({
        role: user?.role || "buyer",
        status: user?.status || "pending", // add status
      });
    });

    app.post("/users", verifyFBToken, async (req, res) => {
      try {
        const newUser = req.body;

        // ✅ Normalize role (default to "user" for first-time Google login)
        let role = newUser.role?.toLowerCase() || "buyer";

        // ✅ Strict role validation
        if (role !== "manager" && role !== "buyer") {
          return res.status(400).send({ message: "Invalid role" });
        }
        newUser.role = role;

        // ✅ Check if user already exists
        const existingUser = await usersCollection.findOne({
          email: newUser.email,
        });

        if (existingUser) {
          // ✅ User exists, just return it
          return res.send(existingUser);
        }

        // ✅ Set status
        if (!req.body.role) {
          // First-time Google login → status null
          newUser.status = null;
        } else if (role === "manager") {
          newUser.status = "pending";
        } else {
          newUser.status = "approved";
        }

        // ✅ Add createdAt timestamp
        newUser.createdAt = new Date();

        // ✅ Insert new user into DB
        const result = await usersCollection.insertOne(newUser);

        // ✅ Attach MongoDB ID to newUser and return it
        newUser._id = result.insertedId;
        res.send(newUser);
      } catch (error) {
        console.error("User insert error:", error);
        res.status(500).send({ message: "Failed to create user" });
      }
    });
    /////profile page api --------------
    app.get("/users/profile/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne(
        { email },
        { projection: { password: 0 } } // safe
      );

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(user);
    });

    //admin get users
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { role, status, suspendReason, suspendFeedback } = req.body;

          const SUPER_ADMIN_EMAIL = "skreazuddin87@gmail.com";

          // Correct query using _id
          const user = await usersCollection.findOne({ _id: new ObjectId(id) });
          if (!user) return res.status(404).send({ message: "User not found" });

          // Super Admin protection
          if (user.email === SUPER_ADMIN_EMAIL) {
            if (
              (role && role !== "admin") ||
              (status && status !== "approved")
            ) {
              return res
                .status(403)
                .send({ message: "Super Admin role/status cannot be changed" });
            }
          }

          const updateDoc = {};
          if (role) updateDoc.role = role;
          if (status) updateDoc.status = status;

          // Add suspend reason & feedback if suspending
          if (status === "suspended") {
            updateDoc.suspendReason = suspendReason || "";
            updateDoc.suspendFeedback = suspendFeedback || "";
          }

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateDoc }
          );

          res.send({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Update user error:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );



    //Products related apis............................

    app.post("/add-product", async (req, res) => {
      const product = req.body;
      product.productId = generateProductId();
      product.createdAt = new Date();
      await productsCollection.insertOne(product);
      res.send({ success: true });
    });
    // DELETE product by productId
    app.delete("/product/:productId", async (req, res) => {
      try {
        const { productId } = req.params;

        const result = await productsCollection.deleteOne({ productId });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            message: "Product not found",
            deletedCount: 0,
          });
        }

        res.send({
          message: "Product deleted successfully",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Delete product error:", error);
        res.status(500).send({ message: "Server error" });
      }
    });
    // PATCH update product
    app.patch("/update-product/:productId", async (req, res) => {
      const { productId } = req.params;
      const updatedData = req.body;

      try {
        const result = await productsCollection.updateOne(
          { productId },
          { $set: updatedData }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Product updated successfully" });
        } else {
          res.send({ success: false, message: "No changes were made" });
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.get("/products", async (req, res) => {
      const products = await productsCollection.find().toArray();
      res.send(products);
    });
    // GET my-products for logged in user
    app.get("/my-products", verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;

        const products = await productsCollection
          .find({ sellerEmail: email })
          .toArray();

        res.send(products);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/product/:productId", verifyFBToken, async (req, res) => {
      try {
        const { productId } = req.params;
        const product = await productsCollection.findOne({ productId });

        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send(product);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });
    app.get("/latest-products", async (req, res) => {
      const result = await productsCollection
        .find({ showOnHome: true }) // ✅ filter first
        .sort({ createdAt: -1 }) // ✅ correct field name
        .limit(6)
        .toArray();

      res.send(result);
    });

    // ======================================================
    // ORDER RELATED APIS (SAFE REFACTOR – FRONTEND COMPATIBLE)
    // ======================================================

    // ------------------------------------
    // CREATE ORDER (Buyer)
    // ------------------------------------
    app.post("/order", async (req, res) => {
      try {
        const order = req.body;
        order.orderId = generateOrderId();
        order.status = "pending";
        order.createdAt = new Date();

        await ordersCollection.insertOne(order);
        res.send({ success: true });
      } catch (err) {
        console.error("Create order error:", err);
        res.status(500).send({ message: "Failed to create order" });
      }
    });

    // ------------------------------------
    // UPDATE ORDER STATUS (Seller: Approve / Reject)
    // USED BY: PendingOrders.jsx
    // ------------------------------------
    app.patch(
      "/orders/:orderId",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        try {
          const { status } = req.body;
          const allowedStatus = ["Approved", "Rejected"];

          if (!allowedStatus.includes(status)) {
            return res.status(400).send({ message: "Invalid status" });
          }

          const update = { status };
          if (status === "Approved") {
            update.approvedAt = new Date();
          }

          const result = await ordersCollection.updateOne(
            { orderId: req.params.orderId },
            { $set: update }
          );

          res.send({ success: result.modifiedCount > 0 });
        } catch (err) {
          console.error("Update order status error:", err);
          res.status(500).send({ message: "Failed to update order status" });
        }
      }
    );

    // ------------------------------------
    // CANCEL ORDER (Buyer)
    // USED BY: MyOrders.jsx
    // ------------------------------------
    app.patch("/orders/:orderId/cancel", verifyFBToken, async (req, res) => {
      try {
        const { orderId } = req.params;
        const buyerEmail = req.decoded_email;

        const order = await ordersCollection.findOne({ orderId });

        if (!order) {
          return res.status(404).send({ message: "Order not found" });
        }

        // Ensure buyer owns the order
        if (order.buyerEmail !== buyerEmail) {
          return res.status(403).send({ message: "Forbidden" });
        }

        if (order.status !== "pending") {
          return res.status(400).send({ message: "Order cannot be cancelled" });
        }

        await ordersCollection.updateOne(
          { orderId },
          { $set: { status: "Cancelled" } }
        );

        res.send({ success: true });
      } catch (err) {
        console.error("Cancel order error:", err);
        res.status(500).send({ message: "Failed to cancel order" });
      }
    });

    // ------------------------------------
    // GET ORDERS (Buyer & Admin – SMART ROUTE)
    // USED BY:
    // - Buyer: MyOrders.jsx
    // - Admin: AllOrders.jsx
    // ------------------------------------
    app.get("/orders", verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const user = await usersCollection.findOne({ email });

        let query = {};

        // Buyer → only own orders
        if (user.role === "buyer") {
          query.buyerEmail = email;
        }

        // Admin → optional status filter
        if (user.role === "admin" && req.query.status) {
          query.status = req.query.status;
        }

        const orders = await ordersCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(orders);
      } catch (err) {
        console.error("Fetch orders error:", err);
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });

    // ------------------------------------
    // SELLER: GET PENDING ORDERS
    // USED BY: PendingOrders.jsx
    // ------------------------------------
    app.get(
      "/orders/pending",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        try {
          const sellerEmail = req.decoded_email;

          const orders = await ordersCollection
            .find({
              sellerEmail,
              status: "pending",
            })
            .sort({ createdAt: -1 })
            .toArray();

          res.send(orders);
        } catch (error) {
          console.error("Pending orders error:", error);
          res.status(500).send({ message: "Failed to fetch pending orders" });
        }
      }
    );

    // ------------------------------------
    // SELLER: GET APPROVED ORDERS
    // USED BY: ApprovedOrders.jsx (tracking untouched)
    // ------------------------------------
    app.get(
      "/orders/approved",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        try {
          const sellerEmail = req.decoded_email;

          const orders = await ordersCollection
            .find({
              sellerEmail,
              status: "Approved",
            })
            .sort({ approvedAt: -1 })
            .toArray();

          res.send(orders);
        } catch (err) {
          console.error("Approved orders error:", err);
          res.status(500).send({ message: "Failed to fetch approved orders" });
        }
      }
    );

    //Payment related apis
    // ------------------------------------
    // STRIPE PAYMENT API (USD)
    // ------------------------------------
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const {
          cost,
          productId,
          productTitle,
          email,
          orderQuantity = 1,
          unitPrice = 0,
        } = req.body;

        if (!cost || !productId || !productTitle || !email)
          return res.status(400).send({ message: "Missing required fields" });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: productTitle },
                unit_amount: Math.round(Number(cost) * 100),
              },
              quantity: Number(orderQuantity),
            },
          ],
          mode: "payment",
          customer_email: email,
          metadata: {
            productId,
            orderQuantity: Number(orderQuantity),
            unitPrice: Number(unitPrice),
          },
          success_url: `${process.env.SITE_DOMAIN}/order/${productId}?success=true`,
          cancel_url: `${process.env.SITE_DOMAIN}/order/${productId}?canceled=true`,
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error("Stripe checkout error:", err);
        res
          .status(500)
          .send({
            message: "Failed to create checkout session",
            error: err.message,
          });
      }
    });

    //Trackings related apis

    app.patch(
      "/orders/:orderId/tracking",
      verifyFBToken,
      verifyManager,
      async (req, res) => {
        const update = {
          ...req.body,
          createdAt: new Date(),
          updatedBy: req.decoded_email,
        };

        await trackingCollection.updateOne(
          { orderId: req.params.orderId },
          {
            $push: { updates: update },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );

        res.send({ success: true });
      }
    );
    app.get("/orders/:orderId/tracking", async (req, res) => {
      try {
        const { orderId } = req.params;

        // Find tracking info
        const tracking = await trackingCollection.findOne({ orderId });

        if (!tracking) {
          return res.status(404).send({ updates: [] });
        }

        res.send(tracking);
      } catch (err) {
        console.error("Track order error:", err);
        res.status(500).send({ updates: [] });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error(err);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Assignment 11 server is running");
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
