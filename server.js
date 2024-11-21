import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

// get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function start() {
  const url = process.env.MONGODB_URI;
  const client = new MongoClient(url);

  await client.connect();
  const db = client.db('WebStore');

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Logs any incoming request made to the server
  app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url} at ${new Date().toISOString()}`);
    next();
  });

  // Serves images from the 'public/images' folder
  app.use('/images', express.static(path.join(__dirname, 'public/images')));

  // Route to get all lessons
  app.get('/lessons', async (req, res) => {
    try {
      const lessons = await db.collection('lessons')
        .find({})
        .sort({ id: 1 })  // sorts the retrieved data
        .toArray();
      res.send(lessons);
    } catch (error) {
      console.error('Error retrieving lessons:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Route to update lesson spaces
  app.put('/lessons/:id', async (req, res) => {
    try {
      const lessonId = parseInt(req.params.id);
      const { spaces } = req.body;

      if (spaces === undefined || spaces < 0) {
        return res.status(400).json({ message: "Valid spaces value is required." });
      }

      const result = await db.collection('lessons').updateOne(
        { id: lessonId },
        { $set: { spaces } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "Leeson not available or no change in spaces." });
      }

      const updatedLesson = await db.collection('lessons').findOne({ id: lessonId });
      res.json(updatedLesson);
    } catch (error) {
      console.error("Error updating lesson:", error);
      res.status(500).json({ message: "An error occurred while updating the lesson." });
    }
  });

  // Route to create a new order
  app.post('/orders', async (req, res) => {
    try {
      const { name, phoneNumber, items } = req.body;
  
      if (!name || !phoneNumber || !items || items.length === 0) {
        return res.status(400).json({ message: "All fields are required." });
      }
  
      const lessons = await db.collection('lessons').find({ id: { $in: items.map(item => item.id) } }).toArray();
  
      if (lessons.length !== items.length) {
        return res.status(404).json({ message: "Some lessons were not found." });
      }
  
      for (const item of items) {
        const lesson = lessons.find(lesson => lesson.id === item.id);
        if (!lesson || lesson.spaces < item.quantity) {
          return res.status(400).json({ message: `Not enough spaces for lesson: ${lesson?.subject || item.id}` });
        }
      }
  
      const order = {
        name,
        phoneNumber,
        items,
        totalPrice: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      };
  
      await db.collection('orders').insertOne(order);
  
      // Deduct spaces from lessons
      for (const item of items) {
        await db.collection('lessons').updateOne(
          { id: item.id },
          { $inc: { spaces: -item.quantity } }
        );
      }
  
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "An error occurred while creating the order." });
    }
  });
  

  // handle search as you type
  app.get('/search', async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ message: "Search query is required." });
      }

      // Case-insensitive search on 'title' field
      const results = await db.collection('lessons').find({
        subject: { $regex: query, $options: 'i' }
      }).toArray();

      res.json(results);
    } catch (error) {
      console.error("Error during search:", error);
      res.status(500).json({ message: "An error occurred during search!" });
    }
  });

  app.get('/', async (req, res) => {
    res.send('Welcome to The store to see the lessons go to /lessons');
  });

  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}!`);
  });
}

start();