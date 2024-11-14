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

  //Displays the lessons from the database
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

//to put the order data in the order collection in mongodb
app.post('/orders', async (req, res) => {
  try {
    const { name, phoneNumber, lessonIds, numberOfSpaces } = req.body;
    
    if (!name || !phoneNumber || !lessonIds || lessonIds.length === 0 || !numberOfSpaces) {
      return res.status(400).json({ message: "All fields are required." });
    }

    console.log('Order Data:', { name, phoneNumber, lessonIds, numberOfSpaces });

    // Fetch lessons matching lessonIds
    const lessons = await db.collection('lessons').find({ id: { $in: lessonIds } }).toArray();
    
    if (lessons.length !== lessonIds.length) {
      console.warn("Some lessons were not found:", lessonIds, lessons.map(l => l.id));
      return res.status(404).json({ message: "Some lessons were not found." });
    }

    // Create the order
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


  app.listen(8000, () => {
    console.log('Server is listening on port 8000');
  });
}

start();
