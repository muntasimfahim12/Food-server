import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());

const corsOptions = {
  origin: [
    "https://food-panda-rho-one.vercel.app", 
    "https://food-panda-j3t8zl6m8-fahims-projects-d20ace09.vercel.app"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};


app.use(cors(corsOptions));


// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cq1rtqv.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let foodsCollection;
let ordersCollection;
let usersCollection;

// JWT Middleware
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Unauthorized access 🚫" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden access 🚷" });
    req.decoded = decoded;
    next();
  });
}

// Admin Middleware
async function verifyAdmin(req, res, next) {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email });
  if (user?.role !== "admin" && user?.role !== "super admin") {
    return res.status(403).send({ message: "Admin access only 🚫" });
  }
  next();
}

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected!");

    const db = client.db("foodAll");
    foodsCollection = db.collection("foods");
    ordersCollection = db.collection("orders");
    usersCollection = db.collection("users");

    // JWT Token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
      res.send({ token });
    });

    // Users CRUD
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existing = await usersCollection.findOne({ email: user.email });
      if (existing) return res.send({ message: "User already exists" });
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send(user);
    });

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Foods CRUD
    app.get("/foods", async (req, res) => {
      try {
        const { category } = req.query;
        let query = {};
        if (category) query.category = category.toLowerCase();
        const foods = await foodsCollection.find(query).toArray();
        res.send(foods);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch foods" });
      }
    });

    app.get("/foods/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
        if (!food) return res.status(404).send({ message: "Food not found" });
        res.send(food);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch food" });
      }
    });

    app.post("/foods", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const food = req.body;
        if (!food.name || !food.price || !food.image) {
          return res.status(400).send({ message: "Name, Price, Image required" });
        }
        const result = await foodsCollection.insertOne(food);
        res.send({ message: "Food added successfully", insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to add food" });
      }
    });

    app.delete("/foods/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await foodsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete food" });
      }
    });

    // Orders CRUD
    app.post("/orders", verifyJWT, async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.get("/orders", verifyJWT, async (req, res) => {
      const decoded = req.decoded;
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email query is required" });
      if (decoded.email !== email) return res.status(403).send({ message: "Forbidden 🚫" });
      const orders = await ordersCollection.find({ buyerEmail: email }).toArray();
      res.send(orders);
    });

    app.delete("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const decodedEmail = req.decoded.email;
      const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
      if (!order) return res.status(404).send({ message: "Order not found" });
      if (order.buyerEmail !== decodedEmail) {
        const user = await usersCollection.findOne({ email: decodedEmail });
        if (user?.role !== "admin") return res.status(403).send({ message: "Forbidden 🚫" });
      }
      const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB ping successful!");
  } catch (err) {
    console.error("❌ MongoDB error:", err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🍕 FlavorNest Server is Running!");
});

app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
