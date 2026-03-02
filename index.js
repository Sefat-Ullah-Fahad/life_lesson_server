const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());



app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://digital-life-lessons.vercel.app' // এখানে আপনার ফ্রন্টএন্ডের লাইভ ইউআরএলটি দিন
  ],
  credentials: true
}));




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fvgkirv.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    const db = client.db("life_lesson_db");
    const userCollection = db.collection("users");
    const lessonCollection = db.collection("lessons");
    const favoritesCollection = db.collection("favorites");
    const reportsCollection = db.collection("lessonsReports");

    // --------------------------------------------------
    // ১. ইউজার ম্যানেজমেন্ট API
    // --------------------------------------------------

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // ডাইনামিক লেসন কাউন্ট সহ ইউজার লিস্ট (Admin এর জন্য)
    app.get('/users', async (req, res) => {
      const result = await userCollection.aggregate([
        {
          $lookup: {
            from: 'lessons',
            localField: 'email',
            foreignField: 'authorEmail',
            as: 'userLessons'
          }
        },
        {
          $addFields: {
            totalLessons: { $size: { $ifNull: ["$userLessons", []] } }
          }
        },
        { $project: { userLessons: 0 } }
      ]).toArray();
      res.send(result);
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send({ admin: user?.role === 'admin' });
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });



    app.patch('/users/make-admin/:email', async (req, res) => {
    const email = req.params.email;
    const filter = { email: email };
    const updateDoc = {
        $set: { role: 'admin' },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
});





    // --------------------------------------------------
    // ২. লেসন ম্যানেজমেন্ট API
    // --------------------------------------------------

    app.post('/lessons', async (req, res) => {
      const newLesson = {
        ...req.body,
        createdAt: new Date().toISOString(), // চার্টের জন্য সময় যোগ করা
        isFeatured: false
      };
      const result = await lessonCollection.insertOne(newLesson);
      res.send(result);
    });

    app.get('/lessons', async (req, res) => {
      const result = await lessonCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.get('/lessons/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await lessonCollection.findOne(query);
      res.send(result);
    });

    app.get('/my-lessons/:email', async (req, res) => {
      const query = { authorEmail: req.params.email };
      const result = await lessonCollection.find(query).toArray();
      res.send(result);
    });

    app.patch('/lessons/:id', async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updatedLesson = req.body;
      const updateDoc = { $set: updatedLesson };
      const result = await lessonCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete('/lessons/:id', async (req, res) => {
      const result = await lessonCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // অ্যাডমিনের জন্য লেসন ফিচারড করা
    app.patch('/lessons/feature/:id', async (req, res) => {
      const { featuredStatus } = req.body;
      const filter = { _id: new ObjectId(req.params.id) };
      const result = await lessonCollection.updateOne(filter, { $set: { isFeatured: featuredStatus } });
      res.send(result);
    });

    // --------------------------------------------------
    // ৩. ইন্টারেকশন ও ফেভারিট API (Fixed)
    // --------------------------------------------------

    app.patch('/lessons/like/:id', async (req, res) => {
      const id = req.params.id;
      const { userId } = req.body;
      const query = { _id: new ObjectId(id) };
      const lesson = await lessonCollection.findOne(query);
      const isLiked = lesson.likes?.includes(userId);
      let updateDoc = isLiked
        ? { $pull: { likes: userId }, $inc: { likesCount: -1 } }
        : { $addToSet: { likes: userId }, $inc: { likesCount: 1 } };
      const result = await lessonCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // ফেভারিট যোগ করা (Fixed Logic)
    app.post('/favorites', async (req, res) => {
      const favorite = req.body;
      const query = { userEmail: favorite.userEmail, lessonId: favorite.lessonId };
      const alreadyExists = await favoritesCollection.findOne(query);
      if (alreadyExists) return res.send({ message: "Exists", insertedId: null });
      const result = await favoritesCollection.insertOne(favorite);
      res.send(result);
    });

    // ফেভারিট গেট করা (Fixed Email Query)
    app.get('/my-favorites', async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email required" });
      const result = await favoritesCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.delete('/my-favorites/:id', async (req, res) => {
      const result = await favoritesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // --------------------------------------------------
    // ৪. রিপোর্ট ম্যানেজমেন্ট API
    // --------------------------------------------------

    app.post('/reports', async (req, res) => {
      const result = await reportsCollection.insertOne(req.body);
      res.send(result);
    });

    app.get('/reports-admin', async (req, res) => {
      const result = await reportsCollection.aggregate([
        {
          $addFields: { lessonIdObj: { $toObjectId: "$lessonId" } } // lessonId string hole convert kora
        },
        {
          $lookup: {
            from: 'lessons',
            localField: 'lessonIdObj',
            foreignField: '_id',
            as: 'lessonDetails'
          }
        },
        { $unwind: { path: '$lessonDetails', preserveNullAndEmptyArrays: true } }
      ]).toArray();
      res.send(result);
    });

    app.delete('/reports/:id', async (req, res) => {
      const result = await reportsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // --------------------------------------------------
    // ৫. অ্যাডমিন ড্যাশবোর্ড স্ট্যাটস (Fixed Chart & Data)
    // --------------------------------------------------

    app.get('/admin-stats', async (req, res) => {
      try {
        const usersCount = await userCollection.estimatedDocumentCount();
        const lessonsCount = await lessonCollection.estimatedDocumentCount();
        const reportedCount = await reportsCollection.estimatedDocumentCount();

        const topContributors = await lessonCollection.aggregate([
          { $group: { _id: "$authorEmail", count: { $sum: 1 }, name: { $first: "$authorName" }, photo: { $first: "$authorPhoto" } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();

        const chartData = await lessonCollection.aggregate([
          { $project: { date: { $toDate: "$createdAt" } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, lessons: { $sum: 1 } } },
          { $sort: { "_id": 1 } },
          { $limit: 7 }
        ]).toArray();

        res.send({
          usersCount,
          lessonsCount,
          reportedCount,
          topContributors,
          chartData: chartData.length > 0 ? chartData.map(d => ({ name: d._id, lessons: d.lessons })) : [{ name: 'No Data', lessons: 0 }]
        });
      } catch (e) { res.status(500).send({ message: "Error" }); }
    });


// ইউজারের প্রোফাইল আপডেট করা
app.patch('/users/update/:email', async (req, res) => {
    const email = req.params.email;
    const updatedData = req.body;
    const filter = { email: email };
    const updatedDoc = {
        $set: {
            name: updatedData.name,
            photo: updatedData.photo,
            bio: updatedData.bio,
            phone: updatedData.phone,
            address: updatedData.address
        }
    };
    const result = await userCollection.updateOne(filter, updatedDoc);
    res.send(result);
});









    // await client.db("admin").command({ ping: 1 });
    // console.log("Connected to MongoDB!");

  } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => { res.send('Digital life lesson server is running...') });
app.listen(port, () => { console.log(`Server listening on port ${port}`); });