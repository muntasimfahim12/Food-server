import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// CORS
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://food-panda-rho-one.vercel.app"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cq1rtqv.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

let foodsCollection;
let ordersCollection;
let usersCollection;

// 🔐 Verify JWT
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).send({ message: "Unauthorized 🚫" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden 🚷" });
    req.decoded = decoded;
    next();
  });
}

// 🔐 Verify Admin
async function verifyAdmin(req, res, next) {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "admin" && user?.role !== "super admin") {
    return res.status(403).send({ message: "Admin only 🚫" });
  }
  next();
}

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("foodAll");
    foodsCollection = db.collection("foods");
    ordersCollection = db.collection("orders");
    usersCollection = db.collection("users");

    // JWT Authentication
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // USERS ---------------------------------------

    // Register user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) return res.send({ message: "User already exists" });

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Get a single user
    app.get("/users/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send(user);
    });

    // Admin: Get all users
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // FOODS ---------------------------------------

    // Get all foods
    app.get("/foods", async (req, res) => {
      try {
        const { category } = req.query;

        let query = {};
        if (category && category !== "all") {
          query.category = category.toLowerCase();
        }

        const foods = await foodsCollection.find(query).toArray();
        res.send(foods);
      } catch {
        res.status(500).send({ message: "Error fetching foods" });
      }
    });

    // Get single food
    app.get("/foods/:id", async (req, res) => {
      try {
        const food = await foodsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!food) return res.status(404).send({ message: "Food not found" });
        res.send(food);
      } catch {
        res.status(500).send({ message: "Failed to fetch food" });
      }
    });

    // Add food (Admin only)
    app.post("/foods", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const food = req.body;

        if (!food.name || !food.price || !food.image) {
          return res.status(400).send({ message: "Missing fields" });
        }

        // Normalize category
        food.category = food.category.toLowerCase();

        const result = await foodsCollection.insertOne(food);
        res.send({ insertedId: result.insertedId });
      } catch {
        res.status(500).send({ message: "Failed to add food" });
      }
    });

    // Delete food
    app.delete("/foods/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await foodsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // ORDERS --------------------------------------

    app.post("/orders", verifyJWT, async (req, res) => {
      const order = req.body;
      order.createdAt = new Date();

      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.get("/orders", verifyJWT, async (req, res) => {
      const email = req.query.email;

      // Only owner or admin can view orders
      if (email !== req.decoded.email) {
        const user = await usersCollection.findOne({ email: req.decoded.email });
        if (user?.role !== "admin")
          return res.status(403).send({ message: "Forbidden" });
      }

      const orders = await ordersCollection
        .find({ buyerEmail: email })
        .toArray();

      res.send(orders);
    });

    app.delete("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

      if (!order) return res.status(404).send({ message: "Order not found" });

      const requester = req.decoded.email;

      if (order.buyerEmail !== requester) {
        const user = await usersCollection.findOne({ email: requester });
        if (user?.role !== "admin")
          return res.status(403).send({ message: "Forbidden" });
      }

      const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Health check
    await client.db("admin").command({ ping: 1 });
    console.log("🔥 Server Ready!");

  } catch (err) {
    console.error(err);
  }
}

run();

// Root
app.get("/", (req, res) => {
  res.send("🍕 FlavorNest Server is Running!");
});

app.listen(port, () =>
  console.log(`🚀 Server running at http://localhost:${port}`)
);
