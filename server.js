import express from 'express';  // Import express to create a server
import path from 'path';  // Import path for working with file and directory paths
import cors from 'cors';  // Import CORS middleware to allow cross-origin requests
import { fileURLToPath } from 'url';  // To get the current file URL
import { MongoClient } from 'mongodb';  // Import MongoDB client for database interaction
import 'dotenv/config';  // Load environment variables from a .env file

// Get the current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main asynchronous function to start the server
async function start() {
  // Connect to MongoDB using the URI from environment variables
  const url = process.env.MONGODB_URI;
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db('WebStore');  // Connect to the 'WebStore' database

  // Initialize Express app
  const app = express();
  app.use(cors());  // Enable CORS for all routes
  app.use(express.json());  // Parse JSON bodies in requests

  // Log each incoming request with its method, URL, and timestamp
  app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url} at ${new Date().toISOString()}`);
    next();
  });

  // Serve images from the 'public/images' folder
  app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

  // Route to get all lessons from the database
  app.get('/lessons', async (req, res) => {
    try {
      const lessons = await db.collection('lessons')
        .find({})
        .sort({ id: 1 })  // Sort lessons by ID in ascending order
        .toArray();
      res.send(lessons);  // Return the list of lessons as a response
    } catch (error) {
      console.error('Error retrieving lessons:', error);
      res.status(500).send('Internal Server Error');  // Send an error if the DB query fails
    }
  });

  // Route to update lesson spaces (availability)
  app.put('/lessons/:id', async (req, res) => {
    try {
      const lessonId = parseInt(req.params.id);  // Get the lesson ID from the URL parameter
      const { spaces } = req.body;  // Get the updated space value from the request body

      // Validate spaces value
      if (spaces === undefined || spaces < 0) {
        return res.status(400).json({ message: "Valid spaces value is required." });
      }

      // Update the spaces for the specified lesson
      const result = await db.collection('lessons').updateOne(
        { id: lessonId },
        { $set: { spaces } }
      );

      // If no lesson was updated, return a 404 error
      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "Lesson not available or no change in spaces." });
      }

      // Return the updated lesson data
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
  
      // Validate the request body fields
      if (!name || !phoneNumber || !items || items.length === 0) {
        return res.status(400).json({ message: "All fields are required." });
      }
  
      // Find lessons from the database based on item IDs
      const lessons = await db.collection('lessons').find({ 
        id: { $in: items.map(item => item.id) } 
      }).toArray();
  
      // Check if all lessons exist in the database
      if (lessons.length !== items.length) {
        return res.status(404).json({ message: "Some lessons were not found." });
      }
  
      // Check if there are enough spaces available for each lesson in the order
      for (const item of items) {
        const lesson = lessons.find(lesson => lesson.id === item.id);
        if (!lesson || lesson.spaces < item.quantity) {
          return res.status(400).json({ 
            message: `Not enough spaces for lesson: ${lesson?.subject || item.id}` 
          });
        }
      }
  
      // Calculate the total price for the order
      const order = {
        name,
        phoneNumber,
        items,
        totalPrice: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      };
  
      // Insert the order into the database
      await db.collection('orders').insertOne(order);
  
      // Return the created order
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "An error occurred while creating the order." });
    }
  });
  
  // Route for search functionality with dynamic query
  app.get('/search', async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ message: "Search query is required." });
      }

      // Case-insensitive search across multiple fields (subject, location, price, spaces)
      const regex = new RegExp(query, 'i');  // Regular expression for case-insensitive matching

      const searchQuery = {
        $or: [
          { subject: { $regex: regex } },
          { location: { $regex: regex } },
        ]
      };

      const priceQuery = parseFloat(query);
      const spacesQuery = parseInt(query);

      // Search by price or spaces if the query is a number
      if (!isNaN(priceQuery)) {
        searchQuery.$or.push({ price: priceQuery });
      }

      if (!isNaN(spacesQuery)) {
        searchQuery.$or.push({ spaces: spacesQuery });
      }

      // Execute search query and return the results
      const results = await db.collection('lessons').find(searchQuery).toArray();
      res.json(results);
    } catch (error) {
      console.error("Error during search:", error);
      res.status(500).json({ message: "An error occurred during search!" });
    }
  });

  // Default route (homepage)
  app.get('/', async (req, res) => {
    res.send('Welcome to The store to see the lessons go to /lessons');
  });

  // Start the server
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}!!`);
  });
}

// Call the start function to run the app
start();
