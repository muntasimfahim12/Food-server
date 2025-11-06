import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

console.log("DB_PASS:", process.env.DB_PASS);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cq1rtqv.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Unauthorized access" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden access" });
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully!");

    // Collections
    const servicesCollection = client.db("foodAll").collection("food"); // existing food items
    const foodsCollection = client.db("foodAll").collection("foods"); // additional foods
    const ordersCollection = client.db("foodAll").collection("orders"); // orders

    
    app.post("/jwt", (req, res) => {
      const user = req.body; // expects { email: "user@example.com" }
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
      res.send({ token });
    });


    
    app.get("/food", async (req, res) => {
      const cursor = servicesCollection.find();
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = {
        projection: { name: 1, price: 1, service_id: 1, img: 1, description: 1 },
      };
      const result = await servicesCollection.findOne(query, options);
      res.send(result);
    });

    

    
    app.post("/foods", async (req, res) => {
      const food = req.body;
      const result = await foodsCollection.insertOne(food);
      res.send(result);
    });

    app.post("/orders", async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

  
    app.get("/orders", verifyJWT, async (req, res) => {
      const decoded = req.decoded;
      const email = req.query.email;

      if (decoded.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { buyerEmail: email };
      const orders = await ordersCollection.find(query).toArray();
      res.send(orders);
    });

    
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB pinged successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🍔 Food Server with JWT is ready!");
});

app.listen(PORT, () => {
  console.log(`🚀 Food Server is running on port ${PORT}`);
});
