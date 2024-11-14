import express from 'express';
import path from 'path'; 
import cors from 'cors'; 
import { fileURLToPath } from 'url'; 
import { MongoClient } from 'mongodb';
import 'dotenv/config';

//to get the __dirname
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

  //This logs any inocoming request made to the server.
  app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url} at ${new Date().toISOString()}`);
    next(); 
  });

  // gets the images from the images folder. 
  app.use('/images', express.static(path.join(__dirname, 'public/images')));

  app.get('/lessons', async (req, res) => {
    try {
      const lessons = await db.collection('lessons')
        .find({})
        .sort({ id: 1 })  //sorts the retrieved data
        .toArray();
      res.send(lessons);
    } catch (error) {
      console.error('Error retrieving lessons:', error);  //error catcher
      res.status(500).send('Internal Server Error');
    }
  });
  
  

  async function populateCartIds(ids) {
    const lessons = await Promise.all(
      ids.map(id => db.collection('lessons').findOne({ id }))
    );
    return lessons.filter(lesson => lesson !== null);
  }

  app.get('/users/:userId/cart', async (req, res) => {
    const user = await db.collection('users').findOne({ id: req.params.userId });
    const populatedCart = await populateCartIds(user.cartItems);
    res.json(populatedCart);
  });

  app.get('/lessons/:id', async (req, res) => {
    const lessonId = parseInt(req.params.id);
    const lesson = await db.collection('lessons').findOne({ id: lessonId });
    if (lesson) {
      res.json(lesson);
    } else {
      res.status(404).json({ message: 'Lesson not found' });
    }
  });

  // PUT route to update lesson attributes 
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
      return res.status(404).json({ message: "Lesson not found or no change in spaces." });
    }

   
    const updatedLesson = await db.collection('lessons').findOne({ id: lessonId });
    res.json(updatedLesson);
  } catch (error) {
    console.error("Error updating lesson:", error);
    res.status(500).json({ message: "An error occurred while updating the lesson." });
  }
});



  app.post('/users/:userId/cart', async (req, res) => {
    try {
      const userId = req.params.userId;
      const lessonId = req.body.id;
  
      if (!lessonId) {
        return res.status(400).json({ message: "Lesson ID is required." });
      }
  
      await db.collection('users').updateOne(
        { id: userId },
        { $addToSet: { cartItems: lessonId } },
        { upsert: true }
      );
  
      const user = await db.collection('users').findOne({ id: userId });
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
  
      user.cartItems = user.cartItems || [];
  
      const populatedCart = await populateCartIds(user.cartItems);
      res.json(populatedCart);
    } catch (error) {
      console.error("Error updating cart:", error);
      res.status(500).json({ message: "An error occurred while updating the cart." });
    }
  });

  app.post('/orders', async (req, res) => {
    try {
      const { name, phoneNumber, lessonIds, numberOfSpaces } = req.body;
  
      if (!name || !phoneNumber || !lessonIds || lessonIds.length === 0 || !numberOfSpaces) {
        return res.status(400).json({ message: "All fields are required." });
      }

      const lessons = await db.collection('lessons').find({ id: { $in: lessonIds } }).toArray();
     
      if (lessons.length !== lessonIds.length) {
        return res.status(404).json({ message: "Some lessons were not found." });
      }
  
      const order = {
        name,
        phoneNumber,
        lessonIds,
        numberOfSpaces,
        lessons: lessons.map(lesson => ({
          id: lesson.id,
          subject: lesson.subject,
          price: lesson.price,
          location: lesson.location,
        }))
      };
  
      const result = await db.collection('orders').insertOne(order);
  
      const createdOrder = await db.collection('orders').findOne({ _id: result.insertedId });
      res.status(201).json(createdOrder);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "An error occurred while creating the order." });
    }
  });

  app.delete('/users/:userId/cart/:lessonsId', async (req, res) => {
    const userId = req.params.userId;
    const lessonId = parseInt(req.params.lessonsId); 
  
    await db.collection('users').updateOne({ id: userId }, {
      $pull: { cartItems: lessonId },
    });
  
    const user = await db.collection('users').findOne({ id:  req.params.userId });
    const populatedCart = await populateCartIds(user.cartItems);
    res.json(populatedCart);
  });

  app.listen(8000, () => {
    console.log('Server is listening on port 8000');
  });
}

start();
