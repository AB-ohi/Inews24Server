const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const serviceAccount = require("./config/firebaseConfig");

// Firebase Admin Import
const admin = require("firebase-admin");

// ✅ Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json()); 
app.use(cookieParser());

// ✅ Firebase Admin Initialize
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("✅ Firebase Admin initialized");

// MongoDB
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qthn2pl.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("MongoDB connected successfully!");

    const userCollection = client.db("i_news").collection("users");
    const NewsPostCollection = client.db("i_news").collection("post");

    // =========================
    // 🔹 Register API
    // =========================
    app.post("/register", async (req, res) => {
      const { name, displayName, email, password, photoURL, number, uid } =
        req.body;

      try {
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res
            .status(400)
            .json({ success: false, message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
          displayName,
          name,
          email,
          password: hashedPassword,
          role: "user",
          createdAt: new Date(),
          photoURL,
          number,
          uid,
        };

        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Registration failed",
          error: error.message,
        });
      }
    });

    // =========================
    // 🔹 Post News API
    // =========================
    app.post("/api/post-news", async (req, res) => {
      const {
        post_detail,
        heading,
        category,
        post_time,
        images,
        imageCount,
        createdAt,
      } = req.body;

      console.log("📦 body:", req.body);

      try {
        const existingPost = await NewsPostCollection.findOne({ heading });
        if (existingPost) {
          return res
            .status(400)
            .json({ success: false, message: "This post already exists" });
        }

        const newPost = {
          post_detail,
          heading,
          category,
          post_time,
          images,
          imageCount,
          createdAt,
          status: "holding",
        };

        const result = await NewsPostCollection.insertOne(newPost);
        res.send(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "New post failed",
          error: error.message,
        });
      }
    });

    // =========================
    // 🔹 Get All Users
    // =========================
    app.get("/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      return res.json(users);
    });

    // =========================
    // 🔹 Get Single User
    // =========================
    app.get("/singleUser/:displayName", async (req, res) => {
      const { displayName } = req.params;

      try {
        const finedUser = await userCollection.findOne({ displayName });
        if (finedUser) {
          return res.send(finedUser);
        } else {
          return res.status(404).send({ error: "User not found" });
        }
      } catch (error) {
        return res
          .status(500)
          .send({ error: "An error occurred", details: error.message });
      }
    });

    app.get("/all-post", async (req, res) => {
      const allPost = NewsPostCollection.find();
      const result = await allPost.toArray();
      res.send(result);
    });
 
    app.get('/post/:category',async(req,res)=>{
      const{category} = req.params;
      console.log(category)
      try{
        const sliceCategory = await NewsPostCollection.find({category, status:"post"}).toArray()
        if(sliceCategory.length > 0 ){
          return res.send(sliceCategory)
        }else{
          return res.status(400).send({error:"category cna't divide"})
        }
      }catch(error){
        return res.status(500).send({error: "An error occurred", details: error.message})
      }
    })
    app.get('/api/news/details/:id', async(req,res)=>{
      const id = req.params.id;
      console.log(id)
      const newsDetails = await NewsPostCollection.findOne({_id: new ObjectId(id)})
      res.send(newsDetails)
    })

    // =========================
    // 🔹 Delete User (MongoDB + Firebase)
    // =========================
    app.delete("/user_delete/:id", async (req, res) => {
      const id = req.params.id;

      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID",
          });
        }

        const user = await userCollection.findOne({ _id: new ObjectId(id) });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found in database",
          });
        }

        if (user.uid) {
          try {
            await admin.auth().deleteUser(user.uid);
            console.log("✅ User deleted from Firebase with UID:", user.uid);
          } catch (firebaseError) {
            console.error("⚠️ Firebase delete error:", firebaseError.message);
          }
        } else {
          console.log("⚠️ No Firebase UID found for this user");
        }

        const result = await userCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          console.log("✅ User deleted from MongoDB with _id:", id);
          return res.json({
            success: true,
            message:
              "User deleted successfully from both Firebase and Database",
          });
        } else {
          return res.status(500).json({
            success: false,
            message: "Failed to delete from database",
          });
        }
      } catch (error) {
        console.error("❌ Error deleting user:", error);
        return res.status(500).json({
          success: false,
          message: "Error deleting user",
          error: error.message,
        });
      }
    });

    app.delete("/api/post-delete/:id", async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid post Id",
          });
        }
        const singlePost = await NewsPostCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Post not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Post deleted successfully",
          singlePost,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "Error deleting post",
          error: error.message,
        });
      }
    });
    // =========================
    // 🔹 Update User Role
    // =========================
    app.patch("/user-role/:_id", async (req, res) => {
      const id = req.params._id;
      const { role } = req.body;

      if (!role || !["admin", "user", "editor"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };

      try {
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to update role" });
      }
    });

    app.patch("/api/update-post-status/:_id", async (req, res) => {
      const id = req.params._id;
      const { status } = req.body;
      console.log(status);
      if (!status || !["holding", "post", "height"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      try {
        const result = await NewsPostCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        (res, status(500).json({ error: "Failed to change status" }));
      }
    });
  } finally {
    // Optional: client.close();
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("API is running...");
});
// Start server
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`🚀 Server running locally on port ${port}`);
  });
}

module.exports = app;

