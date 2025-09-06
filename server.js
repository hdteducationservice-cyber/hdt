const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const streamifier = require('streamifier');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import Models
const Admin = require('./models/Admin');
const Book = require('./models/Book');
const Video = require('./models/Video');
const Question = require('./models/Question');
const Paper = require('./models/Paper');
const Sports = require('./models/Sports');
const User = require('./models/User');
const Announcement = require('./models/Announcement');
const { Message, ChatRoom } = require('./models/Chat');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));
// Note: uploads will be stored in Cloudinary. Keep the static uploads route for backward
// compatibility if some legacy references exist, but prefer Cloudinary URLs.
app.use('/uploads', express.static('uploads'));

// Cloudinary config - requires these env vars to be set
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function isCloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

if (!isCloudinaryConfigured()) {
  console.warn('Warning: Cloudinary credentials are not set. Uploads to Cloudinary will fail. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
}

if (isCloudinaryConfigured()) {
  console.log(`Cloudinary configured: ${process.env.CLOUDINARY_CLOUD_NAME}`);
}

function uploadBufferToCloudinary(buffer, options = {}) {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(new Error('Cloudinary not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your environment.'));
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// Chat attachment uploads: support /api/chat/upload and /api/chat/upload-audio
const fs = require('fs');
const uploadMemory = multer.memoryStorage();
const chatUpload = multer({ storage: uploadMemory, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// POST /api/chat/upload - multipart/form-data file upload
app.post('/api/chat/upload', chatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { originalname, mimetype, size, buffer } = req.file;
    if (isCloudinaryConfigured()) {
      const result = await uploadBufferToCloudinary(buffer, { resource_type: 'auto', folder: 'chat_uploads' });
      return res.json({
        success: true,
        file: {
          originalname,
          path: result.secure_url,
          mimetype,
          size,
          provider: 'cloudinary',
          public_id: result.public_id
        }
      });
    } else {
      // fallback: write to uploads folder
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filename = `attachments-${Date.now()}-${originalname.replace(/[^a-z0-9.\-]/gi, '_')}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer);
      const relPath = `/uploads/${filename}`;
      return res.json({
        success: true,
        file: {
          originalname,
          path: relPath,
          mimetype,
          size,
          provider: 'local'
        }
      });
    }
  } catch (error) {
    console.error('Chat upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// POST /api/chat/upload-audio - accepts base64 JSON audio data
app.post('/api/chat/upload-audio', async (req, res) => {
  try {
    const { audioData, fileName, duration } = req.body;
    if (!audioData) return res.status(400).json({ error: 'No audio data provided' });
    // audioData may be DataURL like 'data:audio/wav;base64,...'
    const matches = typeof audioData === 'string' && audioData.match(/^data:(.+);base64,(.+)$/);
    let mime = 'audio/mpeg';
    let base64 = audioData;
    if (matches) {
      mime = matches[1];
      base64 = matches[2];
    }
    const buffer = Buffer.from(base64, 'base64');
    if (isCloudinaryConfigured()) {
      const result = await uploadBufferToCloudinary(buffer, { resource_type: 'auto', folder: 'chat_uploads' });
      return res.json({
        success: true,
        file: {
          originalname: fileName || `voice-${Date.now()}.webm`,
          path: result.secure_url,
          mimetype: mime,
          size: buffer.length,
          duration: duration || null,
          provider: 'cloudinary',
          public_id: result.public_id
        }
      });
    } else {
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${Date.now()}-${(fileName || 'voice')}.webm`.replace(/[^a-z0-9.\-]/gi, '_');
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer);
      const relPath = `/uploads/${filename}`;
      return res.json({
        success: true,
        file: {
          originalname: fileName || filename,
          path: relPath,
          mimetype: mime,
          size: buffer.length,
          duration: duration || null,
          provider: 'local'
        }
      });
    }
  } catch (error) {
    console.error('Chat audio upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/educational_platform')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Chat API Routes

// Chat file upload endpoint removed

// Chat audio upload endpoint removed

// Get chat rooms for a user
app.get('/api/chats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userRole = req.query.role || 'student';

    let chatRooms = [];

    // Get rooms where user is a member
    const memberChats = await ChatRoom.find({
      $or: [
        { 'members.userId': userId },
        { type: 'public' }, // Show all public chats
        { type: 'class' } // Show class chats
      ]
    }).sort({ lastMessage: -1 });

    for (let chat of memberChats) {
      chatRooms.push({
        id: chat.id,
        name: chat.name,
        type: chat.type,
        lastMessage: chat.lastMessage,
        unreadCount: 0, // TODO: Implement unread count logic
        createdAt: chat.createdAt
      });
    }

    res.json({ success: true, chatRooms });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chat rooms' });
  }
});

// Create new chat room
app.post('/api/chats', async (req, res) => {
  try {
    const { name, type, createdBy } = req.body;

    const chatId = Date.now().toString();
    
    const chatRoom = new ChatRoom({
      id: chatId,
      name: name,
      type: type,
      createdBy: createdBy,
      members: [{ userId: createdBy, role: 'admin' }]
    });

    await chatRoom.save();

    res.json({ success: true, chatRoom });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to create chat room' });
  }
});

// Get messages for a chat room
app.get('/api/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({ chatId: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Reverse to show oldest first
    const reversedMessages = messages.reverse();

    res.json({ success: true, messages: reversedMessages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// Join chat room
app.post('/api/chats/:chatId/join', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, userRole } = req.body;

    const chatRoom = await ChatRoom.findOne({ id: chatId });
    if (!chatRoom) {
      return res.status(404).json({ success: false, message: 'Chat room not found' });
    }

    // Check if user is already a member
    const existingMember = chatRoom.members.find(m => m.userId === userId);
    if (!existingMember) {
      chatRoom.members.push({ userId: userId, role: userRole });
      await chatRoom.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Join chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to join chat room' });
  }
});

// Get messages for a specific room (used by chat.html)
app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const messages = await Message.find({ 
      roomId: roomId,
      'deleted.isDeleted': { $ne: true }
    })
      .populate('replyTo')
      .sort({ createdAt: 1 })
      .limit(limit);

    // Transform messages to match frontend expectations
    const transformedMessages = messages.map(message => {
      const baseMessage = {
        _id: message._id,
        userId: message.sender.id,
        fullName: message.sender.name || 'User',
        username: message.sender.name || 'User', // For backward compatibility
        text: message.content,
        timestamp: message.createdAt || message.timestamp || new Date(),
        roomId: message.roomId,
        userType: message.sender.role,
        replyTo: message.replyTo?.messageId,
        replyToMessage: message.replyTo ? {
          fullName: message.replyTo.senderName,
          text: message.replyTo.content
        } : null
      };

      // Add file attachment data if exists
      if (message.attachment) {
        baseMessage.fileData = message.attachment.data;
        baseMessage.fileType = message.attachment.type;
        baseMessage.fileName = message.attachment.name;
        baseMessage.filePath = message.attachment.data;
        baseMessage.fileSize = message.attachment.size;
      }

      return baseMessage;
    });

    res.json(transformedMessages);
  } catch (error) {
    console.error('Get room messages error:', error);
    res.status(500).json([]);
  }
});

  // Create/save a message via REST (for SMS/HTTP clients)
  app.post('/api/messages', async (req, res) => {
    try {
      const { roomId, userId, fullName, text, filePath, fileType, fileName, fileSize, replyTo } = req.body;
      if (!roomId || !userId) return res.status(400).json({ success: false, message: 'roomId and userId required' });

      const normalizedRole = normalizeRole(undefined);
      const message = new Message({
        roomId: roomId,
        sender: { id: userId, model: 'User', name: fullName || 'User', role: normalizedRole },
        content: text || (fileName || 'File'),
        type: filePath ? 'file' : 'text',
        attachment: filePath ? { data: filePath, type: fileType || 'application/octet-stream', name: fileName || 'file', size: fileSize || 0 } : undefined,
        replyTo: replyTo || undefined
      });

      await message.save();

      // Broadcast via sockets to room
      const payload = {
        _id: message._id,
        userId: userId,
        fullName: fullName || 'User',
        text: message.content,
        filePath: message.attachment?.data || null,
        fileType: message.attachment?.type || null,
        fileName: message.attachment?.name || null,
        fileSize: message.attachment?.size || null,
        timestamp: message.createdAt,
        roomId: roomId
      };
      io.to(`room:${roomId}`).emit('message', payload);

      // Update ChatRoom lastMessage
      try {
        const chatRoom = await ChatRoom.findOne({ id: roomId });
        if (chatRoom) {
          chatRoom.lastMessage = { content: payload.text?.substring(0,100) || '', timestamp: new Date(), senderName: payload.fullName, messageType: payload.filePath ? 'file' : 'text' };
          chatRoom.stats = chatRoom.stats || {};
          chatRoom.stats.totalMessages = (chatRoom.stats.totalMessages || 0) + 1;
          chatRoom.stats.lastActivity = new Date();
          await chatRoom.save();
        }
      } catch (err) {
        console.error('Error updating chatroom from REST save:', err);
      }

      res.json(payload);
    } catch (error) {
      console.error('REST save message error:', error);
      res.status(500).json({ success: false, message: 'Failed to save message' });
    }
  });

  // Mark messages as read in a room by a user
  app.post('/api/messages/:roomId/mark-read', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;
      if (!roomId || !userId) return res.status(400).json({ success: false, message: 'roomId and userId required' });

      await Message.updateMany({ roomId: roomId, 'deleted.isDeleted': { $ne: true } }, { $addToSet: { readBy: { user: userId, model: 'User', readAt: new Date() } } });

      res.json({ success: true });
    } catch (error) {
      console.error('Mark read error:', error);
      res.status(500).json({ success: false, message: 'Failed to mark messages read' });
    }
  });

// Create a new chat room
app.post('/api/create-room', async (req, res) => {
  try {
    const { name, description, subject, class: className, type, createdBy } = req.body;
    
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Room name is required' });
    }
    
    if (!createdBy) {
      return res.status(400).json({ success: false, message: 'Creator ID is required' });
    }
    
    const roomId = `${type || 'public'}-${Date.now()}`;
    
    const chatRoom = new ChatRoom({
      id: roomId,
      name: name.trim(),
      description: description || '',
      type: type || 'public',
      subject: subject || '',
      className: className || '',
      createdBy: createdBy,
      members: [{ 
        user: createdBy,
        model: 'User',
        role: 'admin',
        joinedAt: new Date()
      }],
      createdAt: new Date()
    });

    await chatRoom.save();

    // Broadcast new room to connected clients so UI can update live
    try {
      if (typeof io !== 'undefined' && io && io.emit) {
        io.emit('room:created', chatRoom.toObject ? chatRoom.toObject() : chatRoom);
      }
    } catch (emitErr) {
      console.error('Failed to emit room:created event:', emitErr);
    }

    res.json({ success: true, roomId: roomId });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ success: false, message: 'Failed to create room' });
  }
});

// Multer configuration - use memory storage and Cloudinary for storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    // Define allowed file types for different uploads
    const imageTypes = /jpeg|jpg|png|gif|webp/;
    const videoTypes = /mp4|avi|mov|wmv|flv|webm/;
    const documentTypes = /pdf|doc|docx|txt|rtf/;

    const extname = imageTypes.test(path.extname(file.originalname).toLowerCase()) ||
                   videoTypes.test(path.extname(file.originalname).toLowerCase()) ||
                   documentTypes.test(path.extname(file.originalname).toLowerCase());

    const mimetype = file.mimetype.startsWith('image/') ||
                    file.mimetype.startsWith('video/') ||
                    file.mimetype.startsWith('application/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type!'));
    }
  }
});

// Email Configuration
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// JWT Middleware for Admin (removed duplicate simple implementation; a full authenticateToken
// implementation is defined later to support admin and user tokens and attach DB objects.)

// JWT Middleware for Users (checks header, cookie, body, query and verifies DB-stored tokens when present)
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // If no token in header, check cookies, body, query
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';');
      const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('token='));
      if (tokenCookie) token = tokenCookie.split('=')[1];
    }
    if (!token && req.body && req.body.token) token = req.body.token;
    if (!token && req.query && req.query.token) token = req.query.token;

    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const userId = decoded.userId || decoded.id || decoded._id;
    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    const dbUser = await User.findById(userId);
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    // If tokens array exists and is non-empty, token must be present (revocation support)
    if (Array.isArray(dbUser.tokens) && dbUser.tokens.length > 0 && !dbUser.tokens.includes(token)) {
      return res.status(401).json({ error: 'Access token required' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('authenticateUser error:', err);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Teacher authentication middleware with subject/class validation
const authenticateTeacher = async (req, res, next) => {
  console.log('Teacher authentication started');
  
  // Check for token in Authorization header first
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  // If no token in header, check cookies
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('token='));
    if (tokenCookie) {
      token = tokenCookie.split('=')[1];
    }
  }

  console.log('Token found:', !!token);

  if (!token) {
    console.log('No token found');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    console.log('Token decoded:', decoded);

    // If token belongs to an admin, allow access and attach admin to request
    if (decoded.adminId) {
      console.log('Admin token detected in authenticateTeacher middleware');
      const admin = await Admin.findById(decoded.adminId);
      if (!admin) {
        console.log('Admin not found in database');
        return res.status(401).json({ error: 'Admin not found' });
      }
      // Verify token still present in admin.tokens if admin.tokens has been used
      // Backwards compatibility: if admin.tokens is empty (older records), allow existing tokens
      if (admin.tokens && admin.tokens.length > 0) {
        if (!admin.tokens.includes(token)) {
          console.log('Admin token not present in DB (possibly revoked)');
          return res.status(401).json({ error: 'Access token required' });
        }
      } else {
        console.log('Admin tokens list empty — allowing token for backward compatibility');
      }
      req.admin = admin;
      // Also set req.user for compatibility with handlers that expect user info
      req.user = { userId: admin._id, role: 'admin', email: admin.email };
      console.log('Admin authentication successful');
      return next();
    }

    // Otherwise treat as a normal user token
    console.log('User token detected in authenticateTeacher middleware');
    // Get full user data from database
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('User found:', user.fullName, 'Role:', user.role, 'Status:', user.status);

    // Enforce token revocation for teachers when tokens array exists
    if (Array.isArray(user.tokens) && user.tokens.length > 0) {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1] || (req.cookies && req.cookies.token) || (req.body && req.body.token) || (req.query && req.query.token);
      if (!token || !user.tokens.includes(token)) {
        console.log('Teacher token revoked or not present in DB tokens list');
        return res.status(401).json({ error: 'Access token required' });
      }
    }

    // Check if user is a teacher
    if (user.role !== 'teacher') {
      console.log('User is not a teacher');
      return res.status(403).json({ error: 'Access denied. Teachers only.' });
    }

    // Check if teacher is approved
    if (user.status !== 'approved') {
      console.log('Teacher not approved');
      return res.status(403).json({ error: 'Your account needs admin approval before you can upload content.' });
    }

    console.log('Teacher authentication successful');
    // Add user data to request for use in route handlers
    req.user = decoded;
    req.teacher = user;
    next();
  } catch (error) {
    console.error('Teacher authentication error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Middleware to validate teacher's subject and class level permissions
const validateTeacherPermissions = (req, res, next) => {
  const { subject, classLevel } = req.body;
  // If an admin is performing the action, bypass teacher permission checks
  if (req.admin) {
    console.log('Admin performing upload - bypassing teacher permission checks:', req.admin.fullName);
    return next();
  }

  const teacher = req.teacher;
  if (!teacher) {
    console.log('No teacher info available on request - denying access');
    return res.status(403).json({ error: 'Teacher authentication required' });
  }

  console.log('Validating permissions for teacher:', teacher.fullName);
  console.log('Upload data - Subject:', subject, 'Class Level:', classLevel);
  console.log('Teacher subjects:', teacher.assignedSubjects);
  console.log('Teacher class levels:', teacher.assignedClassLevels);

  // Check subject permission
  if (subject && teacher.assignedSubjects && !teacher.assignedSubjects.includes(subject)) {
    console.log('Subject validation failed');
    return res.status(403).json({ 
      error: `You are not authorized to upload content for ${subject}. Your assigned subjects are: ${teacher.assignedSubjects.join(', ')}` 
    });
  }

  // Check class level permission
  if (classLevel && teacher.assignedClassLevels && !teacher.assignedClassLevels.includes(classLevel)) {
    console.log('Class level validation failed');
    return res.status(403).json({ 
      error: `You are not authorized to upload content for ${classLevel}. Your assigned class levels are: ${teacher.assignedClassLevels.join(', ')}` 
    });
  }

  console.log('Permission validation passed');
  next();
};

// Generic token authenticator used by update routes (allows admin or user tokens)
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Check cookies, body and query as fallbacks
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';');
      const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('token='));
      if (tokenCookie) token = tokenCookie.split('=')[1];
    }
    if (!token && req.body && req.body.token) token = req.body.token;
    if (!token && req.query && req.query.token) token = req.query.token;

    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

    // If token belongs to an admin
    if (decoded.adminId) {
      const admin = await Admin.findById(decoded.adminId);
      if (!admin) return res.status(401).json({ error: 'Admin not found' });
      if (Array.isArray(admin.tokens) && admin.tokens.length > 0 && !admin.tokens.includes(token)) {
        return res.status(401).json({ error: 'Access token required' });
      }
      req.admin = admin;
      req.user = { userId: admin._id, role: 'admin', email: admin.email };
      return next();
    }

    // Otherwise treat as normal user token
    const userId = decoded.userId || decoded.id || decoded._id;
    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    const dbUser = await User.findById(userId);
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    if (Array.isArray(dbUser.tokens) && dbUser.tokens.length > 0 && !dbUser.tokens.includes(token)) {
      return res.status(401).json({ error: 'Access token required' });
    }

    req.user = decoded;
    // If this user is a teacher, attach teacher object for compatibility
    if (dbUser.role === 'teacher') req.teacher = dbUser;
    next();
  } catch (err) {
    console.error('authenticateToken error:', err);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Routes

// Admin Registration
app.post('/api/admin/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin already exists with this email' });
    }

    // Create new admin
    const admin = new Admin({
      fullName,
      email,
      password
    });

    await admin.save();

    // Send verification email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Admin Registration Confirmation - HDT EDUCATION SERVICES',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Registrations Confirmation</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 20px;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background: white; 
                    border-radius: 20px; 
                    overflow: hidden;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 40px 30px; 
                    text-align: center; 
                }
                .logo { 
                    width: 80px; 
                    height: 80px; 
                    border-radius: 50%; 
                    object-fit: cover; 
                    border: 4px solid white; 
                    margin-bottom: 20px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                .header h1 { 
                    font-size: 28px; 
                    margin-bottom: 10px; 
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                }
                .header p { 
                    font-size: 16px; 
                    opacity: 0.9; 
                }
                .content { 
                    padding: 40px 30px; 
                    line-height: 1.6; 
                }
                .welcome-message { 
                    font-size: 24px; 
                    color: #333; 
                    margin-bottom: 20px; 
                    text-align: center;
                }
                .message-text { 
                    color: #666; 
                    font-size: 16px; 
                    margin-bottom: 30px; 
                    text-align: center;
                }
                .btn { 
                    display: inline-block; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 25px; 
                    font-weight: 600;
                    margin: 20px auto;
                    display: block;
                    width: fit-content;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                }
                .footer { 
                    background: #f8f9fa; 
                    padding: 30px; 
                    text-align: center; 
                    border-top: 1px solid #eee;
                }
                .footer-logo { 
                    width: 40px; 
                    height: 40px; 
                    border-radius: 50%; 
                    object-fit: cover; 
                    border: 2px solid #3498db;
                    margin-bottom: 15px;
                }
                .contact-info { 
                    color: #666; 
                    font-size: 14px; 
                    margin-bottom: 10px; 
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="cid:logo" alt="HDT Education Logo" class="logo">
                    <h1>HDT EDUCATION SERVICES</h1>
                    <p>Excellence in Education • Quality Learning • Future Leaders</p>
                </div>
                <div class="content">
                    <h2 class="welcome-message">🎉 Welcome Administrator!</h2>
                    <p class="message-text">Dear <strong>${fullName}</strong>,</p>
                    <p class="message-text">
                        Congratulations! Your administrator account has been successfully created for HDT EDUCATION SERVICES. 
                        You now have full access to manage our educational platform and help students achieve excellence.
                    </p>
                    <a href="${req.get('origin') || 'http://localhost:3000'}/adminlog.html" class="btn">
                        🚀 Access Admin Dashboard
                    </a>
                    <p class="message-text">
                        As an administrator, you can now manage content, oversee user accounts, and ensure the best 
                        educational experience for our students and teachers.
                    </p>
                </div>
                <div class="footer">
                    <img src="cid:logo" alt="HDT Logo" class="footer-logo">
                    <div class="contact-info">📧 info@hdteducation.ac.tz</div>
                    <div class="contact-info">📱 +255 123 456 789</div>
                    <div class="contact-info">📍 Uhuru Street, Ilala, Dar es Salaam</div>
                    <p style="margin-top: 20px; color: #999; font-size: 12px;">
                        © 2025 HDT EDUCATION SERVICES. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
      `,
      attachments: [{
        filename: 'logo.jpg',
        path: './public/WhatsApp Image 2025-08-08 at 11.41.10_148b0047.jpg',
        cid: 'logo'
      }]
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Email error:', error);
      } else {
        console.log('Email sent:', info.response);
      }
    });

    res.status(201).json({ 
      message: 'Admin registered successfully',
      adminId: admin._id
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { adminId: admin._id, email: admin.email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    // Save token to admin record for server-side revocation support
    try {
      admin.tokens = admin.tokens || [];
      admin.tokens.push(token);
      await admin.save();
    } catch (err) {
      console.error('Failed to save admin token to DB:', err);
    }

    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        profileInitial: admin.getProfileInitial()
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get Admin Profile
app.get('/api/admin/profile', authenticateToken, async (req, res) => {
  try {
    // derive admin id from middleware (req.admin is the DB object) or from token payload
    const adminId = (req.admin && (req.admin._id || req.admin.id)) || (req.user && (req.user.adminId || req.user.userId || req.user.id));
    if (!adminId) return res.status(401).json({ error: 'Admin id not found in request' });

    const admin = await Admin.findById(adminId).select('-password');
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    res.json({
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        profileInitial: admin.getProfileInitial(),
        registrationDate: admin.registrationDate
      }
    });
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Admin logout (invalidate token server-side)
app.post('/api/admin/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(400).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    if (decoded && decoded.adminId) {
      const admin = await Admin.findById(decoded.adminId);
      if (admin && admin.tokens && admin.tokens.length) {
        admin.tokens = admin.tokens.filter(t => t !== token);
        await admin.save();
      }
    }

    // Clear client cookie if present
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Book Routes
app.post('/api/books', authenticateTeacher, validateTeacherPermissions, upload.fields([
  { name: 'bookImage', maxCount: 1 },
  { name: 'bookFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, classLevel, subject, description } = req.body;

    if (!req.files || !req.files.bookImage || !req.files.bookFile) {
      return res.status(400).json({ error: 'Both book image and file are required' });
    }

    const imageResult = await uploadBufferToCloudinary(req.files.bookImage[0].buffer, { folder: 'books/images', resource_type: 'image' });
    const fileResult = await uploadBufferToCloudinary(req.files.bookFile[0].buffer, { folder: 'books/files', resource_type: 'raw' });

    const uploaderId = req.teacher ? req.teacher._id : (req.admin ? req.admin._id : null);
    const uploaderName = req.teacher ? req.teacher.fullName : (req.admin ? req.admin.fullName : 'Admin');

    const book = new Book({
      title,
      classLevel,
      subject,
      description,
      bookImage: imageResult.secure_url,
      bookImagePublicId: imageResult.public_id,
      bookFile: fileResult.secure_url,
      bookFilePublicId: fileResult.public_id,
      uploadedBy: uploaderId,
      uploadedByName: uploaderName,
      fileSize: req.files.bookFile[0].size,
      fileName: req.files.bookFile[0].originalname,
      mimeType: req.files.bookFile[0].mimetype
    });

    await book.save();
    res.status(201).json({ message: 'Book uploaded successfully', book });
  } catch (error) {
  console.error('Book upload error:', error && error.stack ? error.stack : error);
  res.status(500).json({ error: 'Failed to upload book', detail: error.message || String(error) });
  }
});

// Get all books
app.get('/api/books', async (req, res) => {
  try {
    const { classLevel, subject, title } = req.query;
    let filter = {};
    
    if (classLevel) filter.classLevel = classLevel;
    if (subject) filter.subject = subject;
    if (title) filter.title = { $regex: title, $options: 'i' };

    const books = await Book.find(filter)
      .populate('uploadedBy', 'fullName')
      .sort({ uploadDate: -1 });
    
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// Update book
app.put('/api/books/:id', authenticateTeacher, upload.fields([
  { name: 'bookImage', maxCount: 1 },
  { name: 'bookFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    const updateData = { ...req.body };

    if (req.files && req.files.bookImage) {
      const imageResult = await uploadBufferToCloudinary(req.files.bookImage[0].buffer, { folder: 'books/images', resource_type: 'image' });
      updateData.bookImage = imageResult.secure_url;
      updateData.bookImagePublicId = imageResult.public_id;
    }

    if (req.files && req.files.bookFile) {
      const fileResult = await uploadBufferToCloudinary(req.files.bookFile[0].buffer, { folder: 'books/files', resource_type: 'raw' });
      updateData.bookFile = fileResult.secure_url;
      updateData.bookFilePublicId = fileResult.public_id;
      updateData.fileSize = req.files.bookFile[0].size;
      updateData.fileName = req.files.bookFile[0].originalname;
      updateData.mimeType = req.files.bookFile[0].mimetype;
    }

    const updatedBook = await Book.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: 'Book updated successfully', book: updatedBook });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// Delete book
app.delete('/api/books/:id', authenticateTeacher, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Delete Cloudinary assets if present
    try {
      if (book.bookFilePublicId) {
        await cloudinary.uploader.destroy(book.bookFilePublicId, { resource_type: 'auto' });
      } else if (book.bookFile) {
        // legacy local file
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(book.bookFile)); } catch (e) { /* ignore */ }
      }

      if (book.bookImagePublicId) {
        await cloudinary.uploader.destroy(book.bookImagePublicId, { resource_type: 'auto' });
      } else if (book.bookImage) {
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(book.bookImage)); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Error deleting Cloudinary book assets:', err);
    }

    await Book.findByIdAndDelete(req.params.id);
    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// Serve book files
app.get('/api/books/:id/read', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    // If bookFile is a remote URL (Cloudinary) proxy it and stream to the client so
    // it can be displayed inline inside the website (e.g., in an <iframe> or <embed>).
    if (book.bookFile && (book.bookFile.startsWith('http://') || book.bookFile.startsWith('https://'))) {
      try {
        const fileUrl = book.bookFile;
        const client = fileUrl.startsWith('https://') ? require('https') : require('http');

        client.get(fileUrl, (proxRes) => {
          const chunks = [];
          proxRes.on('data', (chunk) => chunks.push(chunk));
          proxRes.on('end', () => {
            try {
              const buffer = Buffer.concat(chunks);
              const contentType = proxRes.headers['content-type'] || 'application/octet-stream';
              const filename = book.fileName || path.basename(fileUrl);
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
              return res.send(buffer);
            } catch (err) {
              console.error('Error sending buffered book file:', err);
              return res.status(500).json({ error: 'Failed to send book file' });
            }
          });
          proxRes.on('error', (err) => {
            console.error('Error fetching book file:', err);
            return res.status(500).json({ error: 'Failed to fetch book file' });
          });
        }).on('error', (err) => {
          console.error('HTTP client error fetching book file:', err);
          return res.status(500).json({ error: 'Failed to fetch book file' });
        });

        return;
      } catch (err) {
        console.error('Proxy error for book file:', err);
        return res.status(500).json({ error: 'Failed to serve book file' });
      }
    }

    // Local file fallback - read into buffer and send
    if (book.bookFile) {
      try {
        const fs = require('fs');
        const filePath = path.resolve(book.bookFile);
        const buffer = fs.readFileSync(filePath);
        const filename = book.fileName || path.basename(filePath);
        const lower = (filename || '').toLowerCase();
        let contentType = 'application/octet-stream';
        if (lower.endsWith('.pdf')) contentType = 'application/pdf';
        else if (lower.endsWith('.doc')) contentType = 'application/msword';
        else if (lower.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (lower.endsWith('.txt')) contentType = 'text/plain';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(buffer);
      } catch (err) {
        console.error('Error reading local book file:', err);
        return res.status(500).json({ error: 'Failed to serve book file' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve book file' });
  }
});

// Video Routes
app.post('/api/videos', authenticateTeacher, validateTeacherPermissions, upload.single('videoFile'), async (req, res) => {
  try {
    const { description, classLevel, subject } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, { folder: 'videos', resource_type: 'auto' });

    const uploaderId = req.teacher ? req.teacher._id : (req.admin ? req.admin._id : null);
    const uploaderName = req.teacher ? req.teacher.fullName : (req.admin ? req.admin.fullName : 'Admin');

    const video = new Video({
      description,
      classLevel,
      subject,
      videoFile: result.secure_url,
      videoFilePublicId: result.public_id,
      uploadedBy: uploaderId,
      uploadedByName: uploaderName,
      fileSize: req.file.size,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    });

    await video.save();
    res.status(201).json({ message: 'Video uploaded successfully', video });
  } catch (error) {
  console.error('Video upload error:', error && error.stack ? error.stack : error);
  res.status(500).json({ error: 'Failed to upload video', detail: error.message || String(error) });
  }
});

// Get all videos
app.get('/api/videos', async (req, res) => {
  try {
    const { classLevel, subject } = req.query;
    let filter = {};
    
    if (classLevel) filter.classLevel = classLevel;
    if (subject) filter.subject = subject;

    const videos = await Video.find(filter)
      .populate('uploadedBy', 'fullName')
      .sort({ uploadDate: -1 });
    
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Update video
app.put('/api/videos/:id', authenticateTeacher, upload.single('videoFile'), async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const updateData = { ...req.body };

    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, { folder: 'videos', resource_type: 'auto' });
      updateData.videoFile = result.secure_url;
      updateData.videoFilePublicId = result.public_id;
      updateData.fileSize = req.file.size;
      updateData.fileName = req.file.originalname;
      updateData.mimeType = req.file.mimetype;
    }

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: 'Video updated successfully', video: updatedVideo });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update video' });
  }
});

// Delete video
app.delete('/api/videos/:id', authenticateTeacher, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    try {
      if (video.videoFilePublicId) {
        await cloudinary.uploader.destroy(video.videoFilePublicId, { resource_type: 'auto' });
      } else if (video.videoFile) {
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(video.videoFile)); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Error deleting Cloudinary video asset:', err);
    }

    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// Question Routes
app.post('/api/questions', authenticateTeacher, validateTeacherPermissions, upload.fields([
  { name: 'questionImage', maxCount: 1 },
  { name: 'questionFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const { questionType, questionText, answer, classLevel, subject, difficulty, tags } = req.body;

    const uploaderId = req.teacher ? req.teacher._id : (req.admin ? req.admin._id : null);
    const uploaderName = req.teacher ? req.teacher.fullName : (req.admin ? req.admin.fullName : 'Admin');

    const questionData = {
      questionType,
      answer,
      classLevel,
      subject,
      uploadedBy: uploaderId,
      uploadedByName: uploaderName,
      difficulty: difficulty || 'Medium'
    };

    if (tags) {
      questionData.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    }

    if (questionType === 'text') {
      questionData.questionText = questionText;
    } else if (questionType === 'image' && req.files && req.files.questionImage) {
      const img = await uploadBufferToCloudinary(req.files.questionImage[0].buffer, { folder: 'questions/images', resource_type: 'image' });
      questionData.questionImage = img.secure_url;
      questionData.questionImagePublicId = img.public_id;
    } else if (questionType === 'file' && req.files && req.files.questionFile) {
      const f = await uploadBufferToCloudinary(req.files.questionFile[0].buffer, { folder: 'questions/files', resource_type: 'raw' });
      questionData.questionFile = f.secure_url;
      questionData.fileName = req.files.questionFile[0].originalname;
      questionData.mimeType = req.files.questionFile[0].mimetype;
      questionData.questionFilePublicId = f.public_id;
    } else {
      return res.status(400).json({ error: 'Invalid question type or missing file' });
    }

    const question = new Question(questionData);
    await question.save();

    res.status(201).json({ message: 'Question uploaded successfully', question });
  } catch (error) {
  console.error('Question upload error:', error && error.stack ? error.stack : error);
  res.status(500).json({ error: 'Failed to upload question', detail: error.message || String(error) });
  }
});

// Get all questions
app.get('/api/questions', async (req, res) => {
  try {
    const { classLevel, subject } = req.query;
    let filter = {};
    
    if (classLevel) filter.classLevel = classLevel;
    if (subject) filter.subject = subject;

    const questions = await Question.find(filter)
      .populate('uploadedBy', 'fullName')
      .sort({ uploadDate: -1 });
    
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Update question
app.put('/api/questions/:id', authenticateTeacher, upload.fields([
  { name: 'questionImage', maxCount: 1 },
  { name: 'questionFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const updateData = { ...req.body };

    if (req.files && req.files.questionImage) {
      const img = await uploadBufferToCloudinary(req.files.questionImage[0].buffer, { folder: 'questions/images', resource_type: 'image' });
      updateData.questionImage = img.secure_url;
      updateData.questionImagePublicId = img.public_id;
    }

    if (req.files && req.files.questionFile) {
      const f = await uploadBufferToCloudinary(req.files.questionFile[0].buffer, { folder: 'questions/files', resource_type: 'raw' });
      updateData.questionFile = f.secure_url;
      updateData.questionFilePublicId = f.public_id;
      updateData.fileName = req.files.questionFile[0].originalname;
      updateData.mimeType = req.files.questionFile[0].mimetype;
    }

    const updatedQuestion = await Question.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: 'Question updated successfully', question: updatedQuestion });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
app.delete('/api/questions/:id', authenticateTeacher, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    try {
      if (question.questionFilePublicId) {
        await cloudinary.uploader.destroy(question.questionFilePublicId, { resource_type: 'auto' });
      } else if (question.questionFile) {
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(question.questionFile)); } catch (e) { /* ignore */ }
      }

      if (question.questionImagePublicId) {
        await cloudinary.uploader.destroy(question.questionImagePublicId, { resource_type: 'auto' });
      } else if (question.questionImage) {
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(question.questionImage)); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Error deleting Cloudinary question assets:', err);
    }

    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Paper Routes
app.post('/api/papers', authenticateTeacher, validateTeacherPermissions, upload.single('paperFile'), async (req, res) => {
  try {
    const { classLevel, subject, year, examType, paperType } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Paper file is required' });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, { folder: 'papers', resource_type: 'raw' });

    const uploaderId = req.teacher ? req.teacher._id : (req.admin ? req.admin._id : null);
    const uploaderName = req.teacher ? req.teacher.fullName : (req.admin ? req.admin.fullName : 'Admin');

    const paper = new Paper({
      classLevel,
      subject,
      year: parseInt(year),
      examType: examType || 'Practice',
      paperType: paperType || 'Paper 1',
      paperFile: result.secure_url,
      paperFilePublicId: result.public_id,
      uploadedBy: uploaderId,
      uploadedByName: uploaderName,
      fileSize: req.file.size,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    });

    await paper.save();
    res.status(201).json({ message: 'Paper uploaded successfully', paper });
  } catch (error) {
  console.error('Paper upload error:', error && error.stack ? error.stack : error);
  res.status(500).json({ error: 'Failed to upload paper', detail: error.message || String(error) });
  }
});

// Get all papers
app.get('/api/papers', async (req, res) => {
  try {
    const { classLevel, subject, year } = req.query;
    let filter = {};
    
    if (classLevel) filter.classLevel = classLevel;
    if (subject) filter.subject = subject;
    if (year) filter.year = parseInt(year);

    const papers = await Paper.find(filter)
      .populate('uploadedBy', 'fullName')
      .sort({ year: -1, uploadDate: -1 });
    
    res.json(papers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch papers' });
  }
});

// Update paper
app.put('/api/papers/:id', authenticateTeacher, upload.single('paperFile'), async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    const updateData = { ...req.body };
    if (updateData.year) updateData.year = parseInt(updateData.year);

    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, { folder: 'papers', resource_type: 'raw' });
      updateData.paperFile = result.secure_url;
      updateData.paperFilePublicId = result.public_id;
      updateData.fileSize = req.file.size;
      updateData.fileName = req.file.originalname;
      updateData.mimeType = req.file.mimetype;
    }

    const updatedPaper = await Paper.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: 'Paper updated successfully', paper: updatedPaper });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update paper' });
  }
});

// Delete paper
app.delete('/api/papers/:id', authenticateTeacher, async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    try {
      if (paper.paperFilePublicId) {
        await cloudinary.uploader.destroy(paper.paperFilePublicId, { resource_type: 'auto' });
      } else if (paper.paperFile) {
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(paper.paperFile)); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Error deleting Cloudinary paper asset:', err);
    }

    await Paper.findByIdAndDelete(req.params.id);
    res.json({ message: 'Paper deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete paper' });
  }
});

// Serve paper files
app.get('/api/papers/:id/view', async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    
    // Increment download count
    paper.downloads += 1;
    await paper.save();
    // If remote (Cloudinary) file, fetch it into a buffer and send it using res.send
    if (paper.paperFile && (paper.paperFile.startsWith('http://') || paper.paperFile.startsWith('https://'))) {
      try {
        const fileUrl = paper.paperFile;
        const client = fileUrl.startsWith('https://') ? require('https') : require('http');

        client.get(fileUrl, (proxRes) => {
          const chunks = [];
          proxRes.on('data', (chunk) => chunks.push(chunk));
          proxRes.on('end', () => {
            try {
              const buffer = Buffer.concat(chunks);
              const contentType = proxRes.headers['content-type'] || 'application/octet-stream';
              const filename = paper.fileName || path.basename(fileUrl);
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
              return res.send(buffer);
            } catch (err) {
              console.error('Error sending buffered paper file:', err);
              return res.status(500).json({ error: 'Failed to send paper file' });
            }
          });
          proxRes.on('error', (err) => {
            console.error('Error fetching paper file:', err);
            return res.status(500).json({ error: 'Failed to fetch paper file' });
          });
        }).on('error', (err) => {
          console.error('HTTP client error fetching paper file:', err);
          return res.status(500).json({ error: 'Failed to fetch paper file' });
        });

        return;
      } catch (err) {
        console.error('Proxy error for paper file:', err);
        return res.status(500).json({ error: 'Failed to serve paper file' });
      }
    }

    // Local file fallback - read into buffer and send
    if (paper.paperFile) {
      try {
        const fs = require('fs');
        const filePath = path.resolve(paper.paperFile);
        const buffer = fs.readFileSync(filePath);
        const filename = paper.fileName || path.basename(filePath);
        // Basic content-type inference
        const lower = (filename || '').toLowerCase();
        let contentType = 'application/octet-stream';
        if (lower.endsWith('.pdf')) contentType = 'application/pdf';
        else if (lower.endsWith('.doc')) contentType = 'application/msword';
        else if (lower.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (lower.endsWith('.txt')) contentType = 'text/plain';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.send(buffer);
      } catch (err) {
        console.error('Error reading local paper file:', err);
        return res.status(500).json({ error: 'Failed to serve paper file' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve paper file' });
  }
});

// Sports Routes
app.post('/api/sports', authenticateTeacher, upload.single('sportsMedia'), async (req, res) => {
  try {
    const { description, category, eventDate, location } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required' });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, { folder: 'sports', resource_type: 'auto' });

    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

    const uploaderId = req.teacher ? req.teacher._id : (req.admin ? req.admin._id : null);
    const uploaderName = req.teacher ? req.teacher.fullName : (req.admin ? req.admin.fullName : 'Admin');

    const sports = new Sports({
      mediaType,
      mediaFile: result.secure_url,
      mediaFilePublicId: result.public_id,
      description,
      category: category || 'Other',
      eventDate: eventDate ? new Date(eventDate) : undefined,
      location,
      uploadedBy: uploaderId,
      uploadedByName: uploaderName,
      fileSize: req.file.size,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    });

    await sports.save();
    res.status(201).json({ message: 'Sports media uploaded successfully', sports });
  } catch (error) {
  console.error('Sports upload error:', error && error.stack ? error.stack : error);
  res.status(500).json({ error: 'Failed to upload sports media', detail: error.message || String(error) });
  }
});

// Get all sports media
app.get('/api/sports', async (req, res) => {
  try {
    const { category } = req.query;
    let filter = {};
    
    if (category) filter.category = category;

    const sports = await Sports.find(filter)
      .populate('uploadedBy', 'fullName')
      .sort({ uploadDate: -1 });
    
    res.json(sports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sports media' });
  }
});

// Update sports media
app.put('/api/sports/:id', authenticateTeacher, upload.single('sportsMedia'), async (req, res) => {
  try {
    const sports = await Sports.findById(req.params.id);
    if (!sports) {
      return res.status(404).json({ error: 'Sports media not found' });
    }
    const updateData = { ...req.body };
    if (updateData.eventDate) updateData.eventDate = new Date(updateData.eventDate);

    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, { folder: 'sports', resource_type: 'auto' });
      updateData.mediaFile = result.secure_url;
      updateData.mediaFilePublicId = result.public_id;
      updateData.mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
      updateData.fileSize = req.file.size;
      updateData.fileName = req.file.originalname;
      updateData.mimeType = req.file.mimetype;
    }

    const updatedSports = await Sports.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: 'Sports media updated successfully', sports: updatedSports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update sports media' });
  }
});

// Delete sports media
app.delete('/api/sports/:id', authenticateTeacher, async (req, res) => {
  try {
    const sports = await Sports.findById(req.params.id);
    if (!sports) return res.status(404).json({ error: 'Sports media not found' });

    try {
      if (sports.mediaFilePublicId) {
        await cloudinary.uploader.destroy(sports.mediaFilePublicId, { resource_type: 'auto' });
      } else if (sports.mediaFile) {
        const fs = require('fs');
        try { fs.unlinkSync(path.resolve(sports.mediaFile)); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Error deleting Cloudinary sports asset:', err);
    }

    await Sports.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sports media deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete sports media' });
  }
});

// Like/Dislike endpoints for Sports
app.post('/api/sports/:id/like', async (req, res) => {
  try {
    const sports = await Sports.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    
    if (!sports) {
      return res.status(404).json({ error: 'Sports media not found' });
    }
    
    res.json({ likes: sports.likes, dislikes: sports.dislikes });
  } catch (error) {
    console.error('Error liking sports media:', error);
    res.status(500).json({ error: 'Failed to like sports media' });
  }
});

app.post('/api/sports/:id/dislike', async (req, res) => {
  try {
    const sports = await Sports.findByIdAndUpdate(
      req.params.id,
      { $inc: { dislikes: 1 } },
      { new: true }
    );
    
    if (!sports) {
      return res.status(404).json({ error: 'Sports media not found' });
    }
    
    res.json({ likes: sports.likes, dislikes: sports.dislikes });
  } catch (error) {
    console.error('Error disliking sports media:', error);
    res.status(500).json({ error: 'Failed to dislike sports media' });
  }
});

// Like/Dislike endpoints for Questions
app.post('/api/questions/:id/like', async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ likes: question.likes, dislikes: question.dislikes });
  } catch (error) {
    console.error('Error liking question:', error);
    res.status(500).json({ error: 'Failed to like question' });
  }
});

app.post('/api/questions/:id/dislike', async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { $inc: { dislikes: 1 } },
      { new: true }
    );
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ likes: question.likes, dislikes: question.dislikes });
  } catch (error) {
    console.error('Error disliking question:', error);
    res.status(500).json({ error: 'Failed to dislike question' });
  }
});

// Like/Dislike endpoints for Videos
app.post('/api/videos/:id/like', async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json({ likes: video.likes, dislikes: video.dislikes });
  } catch (error) {
    console.error('Error liking video:', error);
    res.status(500).json({ error: 'Failed to like video' });
  }
});

app.post('/api/videos/:id/dislike', async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { dislikes: 1 } },
      { new: true }
    );
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json({ likes: video.likes, dislikes: video.dislikes });
  } catch (error) {
    console.error('Error disliking video:', error);
    res.status(500).json({ error: 'Failed to dislike video' });
  }
});

// Like/Dislike endpoints for Papers
app.post('/api/papers/:id/like', async (req, res) => {
  try {
    const paper = await Paper.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    
    res.json({ likes: paper.likes, dislikes: paper.dislikes });
  } catch (error) {
    console.error('Error liking paper:', error);
    res.status(500).json({ error: 'Failed to like paper' });
  }
});

app.post('/api/papers/:id/dislike', async (req, res) => {
  try {
    const paper = await Paper.findByIdAndUpdate(
      req.params.id,
      { $inc: { dislikes: 1 } },
      { new: true }
    );
    
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    
    res.json({ likes: paper.likes, dislikes: paper.dislikes });
  } catch (error) {
    console.error('Error disliking paper:', error);
    res.status(500).json({ error: 'Failed to dislike paper' });
  }
});

// Add video view count increment endpoint
app.post('/api/videos/:id/view', async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json({ views: video.views });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ error: 'Failed to increment view count' });
  }
});

// Get reference data (class levels and subjects) - updated for chat
app.get('/api/reference-data', (req, res) => {
  const classLevels = ['Form I', 'Form II', 'Form III', 'Form IV', 'Form V', 'Form VI', 'Other'];
  const subjects = [
    'Civics', 'History', 'Geography', 'Kiswahili', 'English Language',
    'Biology', 'Basic Mathematics', 'Physics', 'Chemistry', 'Bookkeeping',
    'Commerce', 'Information and Computer Studies (ICS)', 'Islamic Religion',
    'Christian Religion', 'Agriculture', 'Home Economics', 'Technical Drawing',
    'Food and Nutrition', 'Fine Art', 'Music', 'Advanced Mathematics',
    'Physics (A-Level)', 'Chemistry (A-Level)', 'Biology (A-Level)',
    'Geography (A-Level)', 'History (A-Level)', 'Economics', 'Accountancy',
    'Business Studies', 'Computer Science', 'Literature in English',
    'Political Science', 'Sociology', 'Philosophy', 'French', 'Arabic'
  ];
  
  const sportsCategories = [
    'Football', 'Netball', 'Basketball', 'Athletics', 'Swimming', 'Tennis',
    'Volleyball', 'Table Tennis', 'Badminton', 'Cross Country', 'Hockey',
    'Rugby', 'Cricket', 'Martial Arts', 'Chess', 'Drama', 'Music', 'Dance',
    'Debate', 'Science Fair', 'Art Competition', 'Cultural Events'
  ];
  
  const examTypes = [
    'Mid-term Examination', 'Terminal Examination', 'Annual Examination',
    'Form II National Examination', 'Form IV National Examination (CSEE)',
    'Form VI National Examination (ACSEE)', 'Mock Examination', 'Pre-National Examination'
  ];
  
  res.json({ classLevels, subjects, sportsCategories, examTypes });
});

// Dedicated subjects endpoint
app.get('/api/subjects', (req, res) => {
  const subjects = [
    'Civics', 'History', 'Geography', 'Kiswahili', 'English Language',
    'Biology', 'Basic Mathematics', 'Physics', 'Chemistry', 'Bookkeeping',
    'Commerce', 'Information and Computer Studies (ICS)', 'Islamic Religion',
    'Christian Religion', 'Agriculture', 'Home Economics', 'Technical Drawing',
    'Food and Nutrition', 'Fine Art', 'Music', 'Advanced Mathematics',
    'Physics (A-Level)', 'Chemistry (A-Level)', 'Biology (A-Level)',
    'Geography (A-Level)', 'History (A-Level)', 'Economics', 'Accountancy',
    'Business Studies', 'Computer Science', 'Literature in English',
    'Political Science', 'Sociology', 'Philosophy', 'French', 'Arabic'
  ];
  
  // Return as objects with name property for consistency
  const subjectObjects = subjects.map((subject, index) => ({
    _id: `subject_${index}`,
    name: subject
  }));
  
  res.json(subjectObjects);
});

// Dedicated classes endpoint  
app.get('/api/classes', (req, res) => {
  const classLevels = ['Form I', 'Form II', 'Form III', 'Form IV', 'Form V', 'Form VI', 'Other'];
  
  // Return as objects with name property for consistency
  const classObjects = classLevels.map((cls, index) => ({
    _id: `class_${index}`,
    name: cls
  }));
  
  res.json(classObjects);
});

// ================================
// USER AUTHENTICATION & MANAGEMENT ROUTES
// ================================

// Check email availability
app.post('/api/users/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    res.json({ 
      available: !existingUser,
      message: existingUser ? 'Email already registered' : 'Email is available'
    });
    
  } catch (error) {
    console.error('Email check error:', error);
    res.status(500).json({ error: 'Failed to check email availability' });
  }
});

// User Registration
app.post('/api/users/register', upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req, res) => {
  try {
    const { role, fullName, email, password, confirmPassword } = req.body;
    
    // Basic validation
    if (!role || !fullName || !email || !password) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }
    // Additional email validation
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Prepare user data
    const userData = {
      role,
      fullName,
      email: email.toLowerCase(),
      password // Will be hashed by the schema pre-save hook
    };
    
    // Role-specific validation and data
    if (role === 'student') {
      const { classLevel } = req.body;
      if (!classLevel) {
        return res.status(400).json({ error: 'Class level is required for students' });
      }
      userData.classLevel = classLevel;
      userData.approved = true; // Students are automatically approved
      
    } else if (role === 'teacher') {
      const { phoneContact, gender, school, assignedSubjects, assignedClassLevels } = req.body;
      
      if (!phoneContact || !gender || !school) {
        return res.status(400).json({ error: 'All teacher fields are required' });
      }
      
      if (!req.files?.profileImage || !req.files?.cv) {
        return res.status(400).json({ error: 'Profile image and CV are required for teachers' });
      }
      
      // Parse subjects and class levels
      const subjects = Array.isArray(assignedSubjects) ? assignedSubjects : [assignedSubjects].filter(Boolean);
      const classLevels = Array.isArray(assignedClassLevels) ? assignedClassLevels : [assignedClassLevels].filter(Boolean);
      
      if (subjects.length === 0 || subjects.length > 4) {
        return res.status(400).json({ error: 'Please select 1-4 subjects' });
      }
      
      if (classLevels.length === 0) {
        return res.status(400).json({ error: 'Please select at least one class level' });
      }
      
  userData.phoneContact = phoneContact;
  userData.gender = gender;
  userData.school = school;
  userData.assignedSubjects = subjects;
  userData.assignedClassLevels = classLevels;

  // Upload profile image and CV to Cloudinary
  const profileImageRes = await uploadBufferToCloudinary(req.files.profileImage[0].buffer, { folder: 'users/profile_images', resource_type: 'image' });
  const cvRes = await uploadBufferToCloudinary(req.files.cv[0].buffer, { folder: 'users/cvs', resource_type: 'raw' });

  userData.profileImage = profileImageRes.secure_url;
  userData.profileImagePublicId = profileImageRes.public_id;
  userData.cv = cvRes.secure_url;
  userData.cvPublicId = cvRes.public_id;
  userData.approved = false; // Teachers need approval
      
    } else if (role === 'other') {
      const { contactMethod, phoneNumber } = req.body;
      
      if (contactMethod === 'phone') {
        if (!phoneNumber) {
          return res.status(400).json({ error: 'Phone number is required' });
        }
        userData.phoneNumber = phoneNumber;
        userData.email = undefined; // Remove email if using phone
      }
      userData.approved = true; // Other users (parents/sponsors/guests) are automatically approved
    }
    
    // Create user
    const newUser = new User(userData);
    await newUser.save();
    
    // Send confirmation email (if email is provided)
    if (userData.email) {
      try {
        let emailSubject = '';
        let emailHtml = '';
        
        const getEmailTemplate = (title, message, buttonText, buttonLink) => `
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${title}</title>
              <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body { 
                      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      padding: 20px;
                  }
                  .container { 
                      max-width: 600px; 
                      margin: 0 auto; 
                      background: white; 
                      border-radius: 20px; 
                      overflow: hidden;
                      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                  }
                  .header { 
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 40px 30px; 
                      text-align: center; 
                  }
                  .logo { 
                      width: 80px; 
                      height: 80px; 
                      border-radius: 50%; 
                      object-fit: cover; 
                      border: 4px solid white; 
                      margin-bottom: 20px;
                      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                  }
                  .header h1 { 
                      font-size: 28px; 
                      margin-bottom: 10px; 
                      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                  }
                  .header p { 
                      font-size: 16px; 
                      opacity: 0.9; 
                  }
                  .content { 
                      padding: 40px 30px; 
                      line-height: 1.6; 
                  }
                  .welcome-message { 
                      font-size: 24px; 
                      color: #333; 
                      margin-bottom: 20px; 
                      text-align: center;
                  }
                  .message-text { 
                      color: #666; 
                      font-size: 16px; 
                      margin-bottom: 20px; 
                      text-align: center;
                  }
                  .btn { 
                      display: inline-block; 
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: 600;
                      margin: 20px auto;
                      display: block;
                      width: fit-content;
                      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                  }
                  .footer { 
                      background: #f8f9fa; 
                      padding: 30px; 
                      text-align: center; 
                      border-top: 1px solid #eee;
                  }
                  .footer-logo { 
                      width: 40px; 
                      height: 40px; 
                      border-radius: 50%; 
                      object-fit: cover; 
                      border: 2px solid #3498db;
                      margin-bottom: 15px;
                  }
                  .contact-info { 
                      color: #666; 
                      font-size: 14px; 
                      margin-bottom: 10px; 
                  }
              </style>
          </head>
          <body>
              <div class="container">
                  <div class="header">
                      <img src="cid:logo" alt="HDT Education Logo" class="logo">
                      <h1>HDT EDUCATION SERVICES</h1>
                      <p>Excellence in Education • Quality Learning • Future Leaders</p>
                  </div>
                  <div class="content">
                      <h2 class="welcome-message">${title}</h2>
                      <p class="message-text">Dear <strong>${fullName}</strong>,</p>
                      <p class="message-text">${message}</p>
                      ${buttonText && buttonLink ? `<a href="${buttonLink}" class="btn">${buttonText}</a>` : ''}
                  </div>
                  <div class="footer">
                      <img src="cid:logo" alt="HDT Logo" class="footer-logo">
                      <div class="contact-info">📧 info@hdteducation.ac.tz</div>
                      <div class="contact-info">📱 +255 123 456 789</div>
                      <div class="contact-info">📍 Uhuru Street, Ilala, Dar es Salaam</div>
                      <p style="margin-top: 20px; color: #999; font-size: 12px;">
                          © 2025 HDT EDUCATION SERVICES. All rights reserved.
                      </p>
                  </div>
              </div>
          </body>
          </html>
        `;
        
        if (role === 'teacher') {
          emailSubject = 'Teacher Registration - Pending Approval - HDT EDUCATION SERVICES';
          emailHtml = getEmailTemplate(
            '⏳ Registration Pending Approval',
            'Thank you for registering as a teacher with HDT EDUCATION SERVICES. Your application is currently under review by our administration team. You will receive another email once your account is approved and you can start contributing to our educational mission.',
            '📚 Learn More About Teaching',
            `${req.get('origin') || 'http://localhost:3000'}/index.html`
          );
        } else {
          emailSubject = 'Welcome to HDT EDUCATION SERVICES - Registration Successful';
          emailHtml = getEmailTemplate(
            '🎉 Welcome to HDT Education!',
            'Congratulations! Your account has been successfully created. You now have access to our comprehensive educational platform with books, videos, past papers, Q&A sessions, and much more. Start your journey to academic excellence today!',
            '🚀 Start Learning Now',
            `${req.get('origin') || 'http://localhost:3000'}/ulogin.html`
          );
        }
        
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: userData.email,
          subject: emailSubject,
          html: emailHtml,
          attachments: [{
            filename: 'logo.jpg',
            path: './public/WhatsApp Image 2025-08-08 at 11.41.10_148b0047.jpg',
            cid: 'logo'
          }]
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Don't fail registration if email fails
      }
    }
    
    let successMessage = 'Registration successful!';
    if (role === 'teacher') {
      successMessage = 'Teacher registration successful! Your account is pending admin approval.';
    }
    
    res.status(201).json({
      message: successMessage,
      userId: newUser._id,
      role: newUser.role,
      approved: newUser.approved !== undefined ? newUser.approved : true
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// User Login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate JWT token
    const tokenExpiry = rememberMe ? '30d' : '24h';
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role, 
        email: user.email 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: tokenExpiry }
    );
    
    // Prepare user data for response (excluding sensitive info)
    const userData = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      approved: user.role === 'teacher' ? (user.approved || false) : true, // Only teachers need approval
      classLevel: user.classLevel,
      profileImage: user.profileImage
    };
    
    // Persist token for server-side revocation and set cookie
    try {
      user.tokens = user.tokens || [];
      user.tokens.push(token);
      await user.save();
    } catch (e) {
      console.error('Failed to save user token to DB:', e);
    }

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 30 days or 24 hours
    });

    res.json({
      message: 'Login successful',
      user: userData,
      token: token // Also send token for client-side storage if needed
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Check existing session
app.get('/api/users/check-session', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ user: user });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ error: 'Failed to check session' });
  }
});

// User Logout
app.post('/api/users/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || (req.body && req.body.token) || null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const userId = decoded.userId || decoded.id || decoded._id;
        if (userId) {
          const dbUser = await User.findById(userId);
          if (dbUser && Array.isArray(dbUser.tokens) && dbUser.tokens.length) {
            dbUser.tokens = dbUser.tokens.filter(t => t !== token);
            await dbUser.save();
          }
        }
      } catch (e) {
        // ignore token verification errors during logout
      }
    }

    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Forgot Password
app.post('/api/users/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success message for security (don't reveal if email exists)
    const message = 'If an account with this email exists, password reset instructions have been sent.';
    
    if (user) {
      // Generate resetZ token
      const resetToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );
      
      // In a real application, you would send an email with reset link
      // For now, we'll just log the reset token
      console.log(`Password reset token for ${email}: ${resetToken}`);
      
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Password Reset Request',
          text: `You requested a password reset. Use this token to reset your password: ${resetToken}\n\nThis token expires in 1 hour.\n\nIf you didn't request this, please ignore this email.`
        });
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError);
      }
    }
    
    res.json({ message });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Get User Profile
app.get('/api/users/profile', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get Teacher Profile
app.get('/api/teacher/profile', authenticateTeacher, async (req, res) => {
  try {
    const teacher = await User.findById(req.teacher._id).select('-password');
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json({ teacher });
  } catch (error) {
    console.error('Teacher profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch teacher profile' });
  }
});

// Update User Profile
app.put('/api/users/profile', authenticateUser, upload.single('profileImage'), async (req, res) => {
  try {
    console.log('Profile update request by', req.user && (req.user.userId || req.user._id));
    console.log('Request body keys:', Object.keys(req.body || {}));
  if (req.file) console.log('Received file:', req.file.originalname, req.file.mimetype, req.file.size);
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { fullName, phoneContact, school, email, gender } = req.body;

    // Validate email uniqueness if changing
    if (email && email !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ error: 'Email already in use by another account' });
      }
    }

    // Update allowed fields
    if (fullName) user.fullName = fullName;
    if (phoneContact && user.role === 'teacher') user.phoneContact = phoneContact;
    if (school && user.role === 'teacher') user.school = school;
    if (email) user.email = email.toLowerCase();
    if (gender && user.role === 'teacher') user.gender = gender;

    // Update profile image if provided (upload to Cloudinary)
    if (req.file) {
      // If Cloudinary configured, delete old image then upload new
      if (isCloudinaryConfigured()) {
        if (user.profileImagePublicId) {
          try {
            await cloudinary.uploader.destroy(user.profileImagePublicId);
            console.log('Deleted old Cloudinary image:', user.profileImagePublicId);
          } catch (err) {
            console.warn('Failed to delete old profile image from Cloudinary:', err.message);
          }
        }
        const profileImageRes = await uploadBufferToCloudinary(req.file.buffer, { folder: 'users/profile_images', resource_type: 'image' });
        user.profileImage = profileImageRes.secure_url;
        user.profileImagePublicId = profileImageRes.public_id;
      } else {
        // fallback: write to uploads folder and set local path
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const filename = `profile-${user._id}-${Date.now()}-${req.file.originalname.replace(/[^a-z0-9.\-]/gi, '_')}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        // delete previous local file if existed and is local
        if (user.profileImage && user.profileImage.startsWith('/uploads/')) {
          const prev = path.join(__dirname, user.profileImage);
          try { if (fs.existsSync(prev)) fs.unlinkSync(prev); } catch(e) { console.warn('Failed to delete old local profile image', e.message); }
        }
        user.profileImage = `/uploads/${filename}`;
        user.profileImagePublicId = undefined;
      }
    }

    await user.save();

    res.json({ 
      message: 'Profile updated successfully',
      user: await User.findById(user._id).select('-password')
    });

  } catch (error) {
    console.error('Profile update error:', error);
    // Return the error message if available for easier frontend debugging
    const msg = error && error.message ? error.message : 'Failed to update profile';
    res.status(500).json({ error: msg });
  }
});

// ================================
// ADMIN USER MANAGEMENT ROUTES
// ================================

// Get all users (public access for admin panel)
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    
    res.json(users);
    
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Approve teacher (public access for admin panel)
app.post('/api/admin/users/:userId/approve', async (req, res) => {
  try {
    const { userId } = req.params;
    const { comment } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'teacher') {
      return res.status(400).json({ error: 'Only teachers require approval' });
    }
    
    // Update user approval status
    user.status = 'approved';
    
    // Add admin comment if provided
    if (comment) {
      if (!user.adminComments) user.adminComments = [];
      user.adminComments.push({
        message: comment,
        date: new Date(),
        action: 'approved'
      });
    }
    
    await user.save();
    
    // Send approval email
    if (user.email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Teacher Account Approved - HDT EDUCATION SERVICES',
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Teacher Account Approved</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 20px;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background: white; 
                        border-radius: 20px; 
                        overflow: hidden;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                        color: white; 
                        padding: 40px 30px; 
                        text-align: center; 
                    }
                    .logo { 
                        width: 80px; 
                        height: 80px; 
                        border-radius: 50%; 
                        object-fit: cover; 
                        border: 4px solid white; 
                        margin-bottom: 20px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    }
                    .header h1 { 
                        font-size: 28px; 
                        margin-bottom: 10px; 
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                    }
                    .header p { 
                        font-size: 16px; 
                        opacity: 0.9; 
                    }
                    .content { 
                        padding: 40px 30px; 
                        line-height: 1.6; 
                    }
                    .welcome-message { 
                        font-size: 24px; 
                        color: #28a745; 
                        margin-bottom: 20px; 
                        text-align: center;
                    }
                    .message-text { 
                        color: #666; 
                        font-size: 16px; 
                        margin-bottom: 20px; 
                        text-align: center;
                    }
                    .admin-note { 
                        background: #f8f9fa; 
                        border-left: 4px solid #28a745; 
                        padding: 20px; 
                        margin: 20px 0; 
                        border-radius: 5px;
                    }
                    .btn { 
                        display: inline-block; 
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: 600;
                        margin: 20px auto;
                        display: block;
                        width: fit-content;
                        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
                    }
                    .footer { 
                        background: #f8f9fa; 
                        padding: 30px; 
                        text-align: center; 
                        border-top: 1px solid #eee;
                    }
                    .footer-logo { 
                        width: 40px; 
                        height: 40px; 
                        border-radius: 50%; 
                        object-fit: cover; 
                        border: 2px solid #3498db;
                        margin-bottom: 15px;
                    }
                    .contact-info { 
                        color: #666; 
                        font-size: 14px; 
                        margin-bottom: 10px; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="cid:logo" alt="HDT Education Logo" class="logo">
                        <h1>HDT EDUCATION SERVICES</h1>
                        <p>Excellence in Education • Quality Learning • Future Leaders</p>
                    </div>
                    <div class="content">
                        <h2 class="welcome-message">🎉 Congratulations! Account Approved</h2>
                        <p class="message-text">Dear <strong>${user.fullName}</strong>,</p>
                        <p class="message-text">
                            Excellent news! Your teacher application has been approved by our administration team. 
                            You are now officially part of the HDT EDUCATION SERVICES teaching community!
                        </p>
                        ${comment ? `
                        <div class="admin-note">
                            <h4 style="color: #28a745; margin-bottom: 10px;">📝 Admin Note:</h4>
                            <p style="color: #666; margin: 0;">${comment}</p>
                        </div>
                        ` : ''}
                        <p class="message-text">
                            You now have full access to all teaching tools and can start creating educational content, 
                            uploading resources, and helping our students achieve academic excellence.
                        </p>
                        <a href="${req.get('origin') || 'http://localhost:3000'}/ulogin.html" class="btn">
                            🚀 Access Teacher Dashboard
                        </a>
                        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin-top: 20px;">
                            <h4 style="color: #28a745; margin-bottom: 15px;">🎯 What You Can Do Now:</h4>
                            <ul style="color: #666; padding-left: 20px;">
                                <li>Upload educational books and materials</li>
                                <li>Create and share video lessons</li>
                                <li>Upload past papers and exams</li>
                                <li>Answer student questions in Q&A</li>
                                <li>Manage sports and activity content</li>
                                <li>Participate in community discussions</li>
                            </ul>
                        </div>
                    </div>
                    <div class="footer">
                        <img src="cid:logo" alt="HDT Logo" class="footer-logo">
                        <div class="contact-info">📧 info@hdteducation.ac.tz</div>
                        <div class="contact-info">📱 +255 123 456 789</div>
                        <div class="contact-info">📍 Uhuru Street, Ilala, Dar es Salaam</div>
                        <p style="margin-top: 20px; color: #999; font-size: 12px;">
                            © 2025 HDT EDUCATION SERVICES. All rights reserved.
                        </p>
                    </div>
                </div>
            </body>
            </html>
          `,
          attachments: [{
            filename: 'logo.jpg',
            path: './public/WhatsApp Image 2025-08-08 at 11.41.10_148b0047.jpg',
            cid: 'logo'
          }]
        });
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
      }
    }
    
    res.json({ 
      message: 'Teacher approved successfully',
      user: await User.findById(userId).select('-password')
    });
    
  } catch (error) {
    console.error('User approval error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Reject teacher (public access for admin panel)
app.post('/api/admin/users/:userId/reject', async (req, res) => {
  try {
    const { userId } = req.params;
    const { comment } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'teacher') {
      return res.status(400).json({ error: 'Only teachers require approval/rejection' });
    }
    
    // Update user approval status
    user.status = 'rejected';
    
    // Add admin comment
    if (!user.adminComments) user.adminComments = [];
    user.adminComments.push({
      message: comment || 'Application rejected',
      date: new Date(),
      action: 'rejected'
    });
    
    await user.save();
    
    // Send rejection email
    if (user.email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Teacher Account Application Update - HDT EDUCATION SERVICES',
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Teacher Account Application Update</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 20px;
                    }
                    .container { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background: white; 
                        border-radius: 20px; 
                        overflow: hidden;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    }
                    .header { 
                        background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); 
                        color: white; 
                        padding: 40px 30px; 
                        text-align: center; 
                    }
                    .logo { 
                        width: 80px; 
                        height: 80px; 
                        border-radius: 50%; 
                        object-fit: cover; 
                        border: 4px solid white; 
                        margin-bottom: 20px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    }
                    .header h1 { 
                        font-size: 28px; 
                        margin-bottom: 10px; 
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                    }
                    .header p { 
                        font-size: 16px; 
                        opacity: 0.9; 
                    }
                    .content { 
                        padding: 40px 30px; 
                        line-height: 1.6; 
                    }
                    .message-title { 
                        font-size: 24px; 
                        color: #dc3545; 
                        margin-bottom: 20px; 
                        text-align: center;
                    }
                    .message-text { 
                        color: #666; 
                        font-size: 16px; 
                        margin-bottom: 20px; 
                        text-align: center;
                    }
                    .reason-note { 
                        background: #ffeaea; 
                        border-left: 4px solid #dc3545; 
                        padding: 20px; 
                        margin: 20px 0; 
                        border-radius: 5px;
                    }
                    .btn { 
                        display: inline-block; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: 600;
                        margin: 20px auto;
                        display: block;
                        width: fit-content;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                    }
                    .footer { 
                        background: #f8f9fa; 
                        padding: 30px; 
                        text-align: center; 
                        border-top: 1px solid #eee;
                    }
                    .footer-logo { 
                        width: 40px; 
                        height: 40px; 
                        border-radius: 50%; 
                        object-fit: cover; 
                        border: 2px solid #3498db;
                        margin-bottom: 15px;
                    }
                    .contact-info { 
                        color: #666; 
                        font-size: 14px; 
                        margin-bottom: 10px; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <img src="cid:logo" alt="HDT Education Logo" class="logo">
                        <h1>HDT EDUCATION SERVICES</h1>
                        <p>Excellence in Education • Quality Learning • Future Leaders</p>
                    </div>
                    <div class="content">
                        <h2 class="message-title">📋 Application Status Update</h2>
                        <p class="message-text">Dear <strong>${user.fullName}</strong>,</p>
                        <p class="message-text">
                            Thank you for your interest in joining HDT EDUCATION SERVICES as a teacher. 
                            We appreciate the time you took to complete your application.
                        </p>
                        <p class="message-text">
                            After careful review of your application, we are unable to approve your teacher account at this time.
                        </p>
                        ${comment ? `
                        <div class="reason-note">
                            <h4 style="color: #dc3545; margin-bottom: 10px;">📝 Feedback from Administration:</h4>
                            <p style="color: #666; margin: 0;">${comment}</p>
                        </div>
                        ` : ''}
                        <p class="message-text">
                            If you believe this decision was made in error or would like to reapply in the future, 
                            please don't hesitate to contact our administration team.
                        </p>
                        <a href="${req.get('origin') || 'http://localhost:3000'}/index.html" class="btn">
                            🏠 Visit Our Website
                        </a>
                        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; margin-top: 20px;">
                            <h4 style="color: #1976d2; margin-bottom: 15px;">💡 Alternative Ways to Get Involved:</h4>
                            <ul style="color: #666; padding-left: 20px;">
                                <li>Join as a student and access our educational resources</li>
                                <li>Participate in our community discussions</li>
                                <li>Stay updated with our latest educational content</li>
                                <li>Consider reapplying when you meet our requirements</li>
                            </ul>
                        </div>
                    </div>
                    <div class="footer">
                        <img src="cid:logo" alt="HDT Logo" class="footer-logo">
                        <div class="contact-info">📧 info@hdteducation.ac.tz</div>
                        <div class="contact-info">📱 +255 123 456 789</div>
                        <div class="contact-info">📍 Uhuru Street, Ilala, Dar es Salaam</div>
                        <p style="margin-top: 20px; color: #999; font-size: 12px;">
                            © 2025 HDT EDUCATION SERVICES. All rights reserved.
                        </p>
                    </div>
                </div>
            </body>
            </html>
          `,
          attachments: [{
            filename: 'logo.jpg',
            path: './public/WhatsApp Image 2025-08-08 at 11.41.10_148b0047.jpg',
            cid: 'logo'
          }]
        });
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
      }
    }
    
    res.json({ 
      message: 'Teacher application rejected',
      user: await User.findById(userId).select('-password')
    });
    
  } catch (error) {
    console.error('User rejection error:', error);
    res.status(500).json({ error: 'Failed to reject user' });
  }
});

// Delete user (public access for admin panel)
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user files if they exist
    const fs = require('fs');
    const path = require('path');
    
    if (user.profileImage) {
      try {
        fs.unlinkSync(path.join(__dirname, user.profileImage));
      } catch (fileError) {
        console.error('Failed to delete profile image:', fileError);
      }
    }
    
    if (user.cv) {
      try {
        fs.unlinkSync(path.join(__dirname, user.cv));
      } catch (fileError) {
        console.error('Failed to delete CV:', fileError);
      }
    }
    
    await User.findByIdAndDelete(userId);
    
    res.json({ message: 'User deleted successfully' });
    
  } catch (error) {
    console.error('User deletion error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Bulk actions on users (Admin only)
app.post('/api/admin/users/bulk-action', authenticateToken, async (req, res) => {
  try {
    const { action, userIds } = req.body;
    
    if (!action || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: 'Invalid action or user IDs' });
    }
    
    let result = { success: 0, failed: 0, errors: [] };
    
    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          result.failed++;
          result.errors.push(`User ${userId} not found`);
          continue;
        }
        
        switch (action) {
          case 'approve':
            if (user.role === 'teacher') {
              user.approved = true;
              await user.save();
              
              // Send approval email
              if (user.email) {
                try {
                  await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: 'Teacher Account Approved - HDT EDUCATION SERVICES',
                    html: `
                      <!DOCTYPE html>
                      <html lang="en">
                      <head>
                          <meta charset="UTF-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                          <title>Teacher Account Approved</title>
                          <style>
                              * { margin: 0; padding: 0; box-sizing: border-box; }
                              body { 
                                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                  padding: 20px;
                              }
                              .container { 
                                  max-width: 600px; 
                                  margin: 0 auto; 
                                  background: white; 
                                  border-radius: 20px; 
                                  overflow: hidden;
                                  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                              }
                              .header { 
                                  background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                                  color: white; 
                                  padding: 40px 30px; 
                                  text-align: center; 
                              }
                              .logo { 
                                  width: 80px; 
                                  height: 80px; 
                                  border-radius: 50%; 
                                  object-fit: cover; 
                                  border: 4px solid white; 
                                  margin-bottom: 20px;
                                  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                              }
                              .header h1 { 
                                  font-size: 28px; 
                                  margin-bottom: 10px; 
                                  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                              }
                              .content { 
                                  padding: 40px 30px; 
                                  line-height: 1.6; 
                                  text-align: center;
                              }
                              .footer { 
                                  background: #f8f9fa; 
                                  padding: 30px; 
                                  text-align: center; 
                                  border-top: 1px solid #eee;
                              }
                          </style>
                      </head>
                      <body>
                          <div class="container">
                              <div class="header">
                                  <img src="cid:logo" alt="HDT Education Logo" class="logo">
                                  <h1>HDT EDUCATION SERVICES</h1>
                              </div>
                              <div class="content">
                                  <h2 style="color: #28a745; margin-bottom: 20px;">🎉 Teacher Account Approved!</h2>
                                  <p style="color: #666; font-size: 16px; margin-bottom: 20px;">Dear <strong>${user.fullName}</strong>,</p>
                                  <p style="color: #666; font-size: 16px;">
                                      Your teacher account has been approved! You now have access to all teaching tools and can start contributing to our educational mission.
                                  </p>
                              </div>
                              <div class="footer">
                                  <p style="color: #999; font-size: 12px;">© 2025 HDT EDUCATION SERVICES</p>
                              </div>
                          </div>
                      </body>
                      </html>
                    `,
                    attachments: [{
                      filename: 'logo.jpg',
                      path: './public/WhatsApp Image 2025-08-08 at 11.41.10_148b0047.jpg',
                      cid: 'logo'
                    }]
                  });
                } catch (emailError) {
                  console.error('Failed to send bulk approval email:', emailError);
                }
              }
              
              result.success++;
            } else {
              result.failed++;
              result.errors.push(`User ${userId} is not a teacher`);
            }
            break;
            
          case 'reject':
            if (user.role === 'teacher') {
              user.approved = false;
              if (!user.adminComments) user.adminComments = [];
              user.adminComments.push({
                message: 'Application rejected via bulk action',
                date: new Date(),
                action: 'rejected'
              });
              await user.save();
              
              // Send rejection email
              if (user.email) {
                try {
                  await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: 'Teacher Account Application Update - HDT EDUCATION SERVICES',
                    html: `
                      <!DOCTYPE html>
                      <html lang="en">
                      <head>
                          <meta charset="UTF-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                          <title>Application Status Update</title>
                          <style>
                              * { margin: 0; padding: 0; box-sizing: border-box; }
                              body { 
                                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                  padding: 20px;
                              }
                              .container { 
                                  max-width: 600px; 
                                  margin: 0 auto; 
                                  background: white; 
                                  border-radius: 20px; 
                                  overflow: hidden;
                                  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                              }
                              .header { 
                                  background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); 
                                  color: white; 
                                  padding: 40px 30px; 
                                  text-align: center; 
                              }
                              .logo { 
                                  width: 80px; 
                                  height: 80px; 
                                  border-radius: 50%; 
                                  object-fit: cover; 
                                  border: 4px solid white; 
                                  margin-bottom: 20px;
                                  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                              }
                              .header h1 { 
                                  font-size: 28px; 
                                  margin-bottom: 10px; 
                                  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                              }
                              .content { 
                                  padding: 40px 30px; 
                                  line-height: 1.6; 
                                  text-align: center;
                              }
                              .footer { 
                                  background: #f8f9fa; 
                                  padding: 30px; 
                                  text-align: center; 
                                  border-top: 1px solid #eee;
                              }
                          </style>
                      </head>
                      <body>
                          <div class="container">
                              <div class="header">
                                  <img src="cid:logo" alt="HDT Education Logo" class="logo">
                                  <h1>HDT EDUCATION SERVICES</h1>
                              </div>
                              <div class="content">
                                  <h2 style="color: #dc3545; margin-bottom: 20px;">📋 Application Status Update</h2>
                                  <p style="color: #666; font-size: 16px; margin-bottom: 20px;">Dear <strong>${user.fullName}</strong>,</p>
                                  <p style="color: #666; font-size: 16px;">
                                      Your teacher account application has been reviewed. Please contact our administration for more information about your application status.
                                  </p>
                              </div>
                              <div class="footer">
                                  <p style="color: #999; font-size: 12px;">© 2025 HDT EDUCATION SERVICES</p>
                              </div>
                          </div>
                      </body>
                      </html>
                    `,
                    attachments: [{
                      filename: 'logo.jpg',
                      path: './public/WhatsApp Image 2025-08-08 at 11.41.10_148b0047.jpg',
                      cid: 'logo'
                    }]
                  });
                } catch (emailError) {
                  console.error('Failed to send bulk rejection email:', emailError);
                }
              }
              
              result.success++;
            } else {
              result.failed++;
              result.errors.push(`User ${userId} is not a teacher`);
            }
            break;
            
            case 'delete':
            // Delete user files (Cloudinary-aware)
            try {
              if (user.profileImagePublicId) {
                try {
                  await cloudinary.uploader.destroy(user.profileImagePublicId, { resource_type: 'image' });
                } catch (err) {
                  console.error('Failed to destroy Cloudinary profile image:', err);
                }
              } else if (user.profileImage) {
                // legacy local file
                const fs = require('fs');
                const path = require('path');
                try {
                  fs.unlinkSync(path.join(__dirname, user.profileImage));
                } catch (fileError) {
                  console.error('Failed to delete profile image:', fileError);
                }
              }

              if (user.cvPublicId) {
                try {
                  await cloudinary.uploader.destroy(user.cvPublicId, { resource_type: 'raw' });
                } catch (err) {
                  console.error('Failed to destroy Cloudinary CV:', err);
                }
              } else if (user.cv) {
                const fs = require('fs');
                const path = require('path');
                try {
                  fs.unlinkSync(path.join(__dirname, user.cv));
                } catch (fileError) {
                  console.error('Failed to delete CV:', fileError);
                }
              }

            } catch (err) {
              console.error('Error during user file deletion:', err);
            }

            await User.findByIdAndDelete(userId);
            result.success++;
            break;
            
          default:
            result.failed++;
            result.errors.push(`Invalid action: ${action}`);
        }
      } catch (userError) {
        result.failed++;
        result.errors.push(`Error processing user ${userId}: ${userError.message}`);
      }
    }
    
    res.json({
      message: `Bulk ${action} completed`,
      result: result
    });
    
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ error: 'Failed to execute bulk action' });
  }
});

// ================================
// ANNOUNCEMENT ROUTES
// ================================

// Create announcement (Admin only)
app.post('/api/announcements', authenticateToken, upload.array('attachments', 5), async (req, res) => {
  try {
    const { title, content, priority, targetAudience, classLevels, expiryDate } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const announcementData = {
      title,
      content,
      priority: priority || 'medium',
      targetAudience: Array.isArray(targetAudience) ? targetAudience : [targetAudience].filter(Boolean),
      classLevels: Array.isArray(classLevels) ? classLevels : [classLevels].filter(Boolean),
      createdBy: req.admin.adminId
    };
    
    if (expiryDate) {
      announcementData.expiryDate = new Date(expiryDate);
    }
    
    // Handle attachments - upload to Cloudinary and store URLs/public IDs
    if (req.files && req.files.length > 0) {
      const uploaded = [];
      for (const file of req.files) {
        const res = await uploadBufferToCloudinary(file.buffer, { folder: 'announcements/attachments', resource_type: 'auto' });
        uploaded.push({
          fileName: file.originalname,
          url: res.secure_url,
          publicId: res.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          resourceType: res.resource_type
        });
      }
      announcementData.attachments = uploaded;
    }
    
    const announcement = new Announcement(announcementData);
    await announcement.save();
    
    // Send email notifications to relevant users
    await sendAnnouncementEmails(announcement);
    
    res.status(201).json({ 
      message: 'Announcement created successfully',
      announcement: await Announcement.findById(announcement._id).populate('createdBy', 'fullName')
    });
    
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Get announcements for students
app.get('/api/announcements/student', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Find announcements for this student
    const query = {
      isActive: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gte: new Date() } }
      ],
      $and: [
        {
          $or: [
            { targetAudience: 'all' },
            { targetAudience: 'students' },
            { targetAudience: { $in: [user.role] } }
          ]
        },
        {
          $or: [
            { classLevels: { $size: 0 } },
            { classLevels: 'All' },
            { classLevels: user.classLevel }
          ]
        }
      ]
    };
    
    const announcements = await Announcement.find(query)
      .populate('createdBy', 'fullName')
      .sort({ priority: -1, createdAt: -1 })
      .limit(10);
    
    // Mark announcements as read and add read status
    const announcementsWithReadStatus = announcements.map(announcement => {
      const isRead = announcement.isReadBy(user._id);
      return {
        ...announcement.toObject(),
        isRead,
        priorityIcon: announcement.priorityIcon
      };
    });
    
    res.json(announcementsWithReadStatus);
    
  } catch (error) {
    console.error('Get student announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Mark announcement as read
app.post('/api/announcements/:id/read', authenticateUser, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    
    await announcement.markAsRead(req.user.userId);
    
    res.json({ message: 'Announcement marked as read' });
    
  } catch (error) {
    console.error('Mark announcement read error:', error);
    res.status(500).json({ error: 'Failed to mark announcement as read' });
  }
});

// Get all announcements (Admin only)
app.get('/api/admin/announcements', authenticateToken, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 });
    
    res.json(announcements);
    
  } catch (error) {
    console.error('Get admin announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Update announcement (Admin only)
app.put('/api/announcements/:id', authenticateToken, upload.array('attachments', 5), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    
    const { title, content, priority, targetAudience, classLevels, expiryDate, isActive } = req.body;
    
    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (priority) announcement.priority = priority;
    if (targetAudience) announcement.targetAudience = Array.isArray(targetAudience) ? targetAudience : [targetAudience].filter(Boolean);
    if (classLevels) announcement.classLevels = Array.isArray(classLevels) ? classLevels : [classLevels].filter(Boolean);
    if (expiryDate) announcement.expiryDate = new Date(expiryDate);
    if (isActive !== undefined) announcement.isActive = isActive;
    
    // Handle new attachments - upload to Cloudinary
    if (req.files && req.files.length > 0) {
      const newAttachments = [];
      for (const file of req.files) {
        const res = await uploadBufferToCloudinary(file.buffer, { folder: 'announcements/attachments', resource_type: 'auto' });
        newAttachments.push({
          fileName: file.originalname,
          url: res.secure_url,
          publicId: res.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          resourceType: res.resource_type
        });
      }
      announcement.attachments = [...announcement.attachments, ...newAttachments];
    }
    
    await announcement.save();
    
    res.json({ 
      message: 'Announcement updated successfully',
      announcement: await Announcement.findById(announcement._id).populate('createdBy', 'fullName')
    });
    
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete announcement (Admin only)
app.delete('/api/announcements/:id', authenticateToken, async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    
    // Delete attachment files (Cloudinary-aware)
    if (announcement.attachments && announcement.attachments.length > 0) {
      for (const attachment of announcement.attachments) {
        if (attachment.publicId) {
          try {
            await cloudinary.uploader.destroy(attachment.publicId, { resource_type: attachment.resourceType || 'auto' });
          } catch (err) {
            console.error('Failed to destroy Cloudinary attachment:', err);
          }
        } else if (attachment.filePath) {
          const fs = require('fs');
          try {
            fs.unlinkSync(path.join(__dirname, attachment.filePath));
          } catch (fileError) {
            console.error('Failed to delete attachment:', fileError);
          }
        }
      }
    }
    
    res.json({ message: 'Announcement deleted successfully' });
    
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Function to send announcement emails
async function sendAnnouncementEmails(announcement) {
  try {
    console.log('Starting email send for announcement:', announcement.title);
    console.log('Target audience:', announcement.targetAudience);
    console.log('Class levels:', announcement.classLevels);
    
    // Get target users based on announcement criteria
    let userQuery = {};
    
    // Filter by target audience
    if (announcement.targetAudience.includes('all')) {
      userQuery = {}; // All users
    } else {
      userQuery.role = { $in: announcement.targetAudience };
    }
    
    // Filter by class levels for students
    if (announcement.classLevels && announcement.classLevels.length > 0 && !announcement.classLevels.includes('All')) {
      if (userQuery.role && userQuery.role.$in && userQuery.role.$in.includes('student')) {
        userQuery.classLevel = { $in: announcement.classLevels };
      }
    }
    
    // Only get users with email addresses
    userQuery.email = { $exists: true, $ne: null };
    
    console.log('User query:', JSON.stringify(userQuery));
    
    const users = await User.find(userQuery).select('fullName email role classLevel');
    console.log(`Found ${users.length} users matching criteria`);
    
    if (users.length === 0) {
      console.log('No users found matching announcement criteria');
      return [];
    }
    
    const emailPromises = users.map(async (user) => {
      try {
        console.log(`Sending email to: ${user.email} (${user.fullName})`);
        
        const emailSubject = `${announcement.priorityIcon || '📢'} ${announcement.title}`;
        const emailBody = `
Dear ${user.fullName || 'User'},

${announcement.title}

${announcement.content}

${announcement.attachments && announcement.attachments.length > 0 ? 
  '\nAttachments are available in your student dashboard.' : ''}

Best regards,
HDT EDUCATION SERVICES Administration
        `;
        
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: emailSubject,
          text: emailBody
        });
        
        console.log(`Email sent successfully to: ${user.email}`);
        
        // Record successful email send
        announcement.emailRecipients.push({
          email: user.email,
          name: user.fullName,
          sentAt: new Date(),
          status: 'sent'
        });
        
        return { success: true, user: user.email };
      } catch (emailError) {
        console.error(`Failed to send email to ${user.email}:`, emailError.message);
        
        // Record failed email send
        announcement.emailRecipients.push({
          email: user.email,
          name: user.fullName,
          sentAt: new Date(),
          status: 'failed'
        });
        
        return { success: false, user: user.email, error: emailError.message };
      }
    });
    
    const results = await Promise.all(emailPromises);
    
    // Update announcement with email status
    announcement.emailSent = true;
    announcement.emailSentAt = new Date();
    await announcement.save();
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`Announcement emails sent: ${successCount} successful, ${failCount} failed`);
    
    return results;
    
  } catch (error) {
    console.error('Send announcement emails error:', error);
    return [];
  }
}

// Default route to serve main index page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== USER MANAGEMENT API ENDPOINTS =====

// Get all admins (public access)
app.get('/api/admin/all-admins', async (req, res) => {
  try {
    const admins = await Admin.find({}).select('-password');
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// Get all users (public access)
app.get('/api/admin/all-users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get online users for private messaging
app.get('/api/online-users', authenticateUser, async (req, res) => {
  try {
    // Get all registered users from different collections
    
    // Get all students
    const students = await User.find({
      role: { $in: ['student'] }
    }).select('_id fullName username role email');

    // Get all teachers (stored in User collection with role 'teacher')
    const teachers = await User.find({
      role: { $in: ['teacher'] }
    }).select('_id fullName username role email');

    // Get all admins
    const admins = await Admin.find({}).select('_id fullName username email');

    // Get all "other" users (parents, sponsors, etc.)
    const otherUsers = await User.find({
      role: { $in: ['other', 'parent', 'sponsor'] }
    }).select('_id fullName username role email');

    // Format students
    const formattedStudents = students.map(user => ({
      userId: user._id.toString(),
      fullName: user.fullName || user.username,
      username: user.username,
      userType: 'student',
      email: user.email,
      isOnline: true // For now, assume all users are online - can be enhanced with real-time socket tracking
    }));

    // Format teachers
    const formattedTeachers = teachers.map(teacher => ({
      userId: teacher._id.toString(),
      fullName: teacher.fullName || teacher.username,
      username: teacher.username,
      userType: 'teacher',
      email: teacher.email,
      isOnline: true
    }));

    // Format admins
    const formattedAdmins = admins.map(admin => ({
      userId: admin._id.toString(),
      fullName: admin.fullName || admin.username,
      username: admin.username,
      userType: 'admin',
      email: admin.email,
      isOnline: true
    }));

    // Format other users
    const formattedOthers = otherUsers.map(user => ({
      userId: user._id.toString(),
      fullName: user.fullName || user.username,
      username: user.username,
      userType: user.role || 'other', // parent, sponsor, or other
      email: user.email,
      isOnline: true
    }));

    // Combine all users
    const allUsers = [...formattedStudents, ...formattedTeachers, ...formattedAdmins, ...formattedOthers];

    // Sort by user type and name for better organization
    allUsers.sort((a, b) => {
      const typeOrder = { admin: 1, teacher: 2, student: 3, other: 4, parent: 4, sponsor: 4 };
      const aOrder = typeOrder[a.userType] || 5;
      const bOrder = typeOrder[b.userType] || 5;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return (a.fullName || '').localeCompare(b.fullName || '');
    });

    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({ error: 'Failed to fetch online users' });
  }
});

// Get detailed user information (public access)
app.get('/api/admin/user-details/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Get detailed admin information (public access)
app.get('/api/admin/admin-details/:id', async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select('-password');
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error('Error fetching admin details:', error);
    res.status(500).json({ error: 'Failed to fetch admin details' });
  }
});

// Delete admin (public access)
app.delete('/api/admin/delete-admin/:id', async (req, res) => {
  try {
    const adminId = req.params.id;
    
    const deletedAdmin = await Admin.findByIdAndDelete(adminId);
    if (!deletedAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// Delete user (public access)
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const deletedUser = await User.findByIdAndDelete(userId);
    
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Approve user (public access)
app.put('/api/admin/users/:id/approve', async (req, res) => {
  try {
    const userId = req.params.id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { status: 'approved' },
      { new: true }
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User approved successfully', user: updatedUser });
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Reject user (public access)
app.put('/api/admin/users/:id/reject', async (req, res) => {
  try {
    const userId = req.params.id;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { status: 'rejected' },
      { new: true }
    ).select('-password');
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User rejected successfully', user: updatedUser });
  } catch (error) {
    console.error('Error rejecting user:', error);
    res.status(500).json({ error: 'Failed to reject user' });
  }
});

// Update user details (admin access)
app.put('/api/admin/users/:id/update', async (req, res) => {
  try {
    const userId = req.params.id;
    const { fullName, email, phoneContact, school, role, status } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update allowed fields
    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) user.email = email;
    if (phoneContact !== undefined) user.phoneContact = phoneContact;
    if (school !== undefined) user.school = school;
    if (role !== undefined) user.role = role;
    if (status !== undefined) user.status = status;

    user.updatedAt = new Date();
    await user.save();

    res.json({ 
      message: 'User updated successfully',
      user: await User.findById(userId).select('-password')
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ===== ANNOUNCEMENT MANAGEMENT API ENDPOINTS (PUBLIC ACCESS) =====

// Create announcement (public access)
app.post('/api/admin/announcements/create', upload.array('attachments', 5), async (req, res) => {
  try {
    const { title, content, priority, targetAudience, classLevels, expiryDate } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    // Find the first admin to use as createdBy, or create a default if none exists
    let defaultAdmin = await Admin.findOne();
    if (!defaultAdmin) {
      // Create a default admin if none exists
      defaultAdmin = new Admin({
        fullName: 'System Admin',
        email: 'admin@system.com',
        password: 'defaultpassword'
      });
      await defaultAdmin.save();
    }
    
    const announcementData = {
      title,
      content,
      priority: priority || 'medium',
      targetAudience: Array.isArray(targetAudience) ? targetAudience : [targetAudience].filter(Boolean),
      classLevels: Array.isArray(classLevels) ? classLevels : [classLevels].filter(Boolean),
      createdBy: defaultAdmin._id // Use the ObjectId of the admin
    };
    
    if (expiryDate) {
      announcementData.expiryDate = new Date(expiryDate);
    }
    
    // Handle attachments - upload to Cloudinary
    if (req.files && req.files.length > 0) {
      const uploaded = [];
      for (const file of req.files) {
        const res = await uploadBufferToCloudinary(file.buffer, { folder: 'announcements/attachments', resource_type: 'auto' });
        uploaded.push({
          fileName: file.originalname,
          url: res.secure_url,
          publicId: res.public_id,
          fileSize: file.size,
          mimeType: file.mimetype,
          resourceType: res.resource_type
        });
      }
      announcementData.attachments = uploaded;
    }
    
    const announcement = new Announcement(announcementData);
    await announcement.save();
    
    // Send email notifications to relevant users
    try {
      await sendAnnouncementEmails(announcement);
    } catch (emailError) {
      console.log('Email notification failed:', emailError.message);
    }
    
    res.status(201).json({ 
      message: 'Announcement created successfully',
      announcement: announcement
    });
    
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Get all announcements (public access)
app.get('/api/admin/announcements/all', async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1 });
    
    res.json(announcements);
    
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Delete announcement (public access)
app.delete('/api/admin/announcements/:id', async (req, res) => {
  try {
    const announcementId = req.params.id;
    const deletedAnnouncement = await Announcement.findByIdAndDelete(announcementId);
    
    if (!deletedAnnouncement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    
    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Enhanced Chat API Routes

// Get all available chat rooms for a user
app.get('/api/chat/rooms', async (req, res) => {
  try {
    const { userId, userRole, subject, classLevel } = req.query;

    // Helper to escape regex special chars
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build base query
    let roomQuery = { isActive: true, isArchived: false };

    // Collect extra filter clauses to AND together
    const andClauses = [];

    if (subject && String(subject).trim()) {
      const s = String(subject).trim();
      const rx = new RegExp(`^${escapeRegex(s)}$`, 'i');
      andClauses.push({ $or: [ { subject: rx }, { 'metadata.subject': rx } ] });
    }

    if (classLevel && String(classLevel).trim()) {
      const c = String(classLevel).trim();
      const rx = new RegExp(`^${escapeRegex(c)}$`, 'i');
      andClauses.push({ $or: [ { classLevel: rx }, { className: rx }, { 'metadata.class': rx } ] });
    }

    if (andClauses.length) {
      roomQuery = { ...roomQuery, $and: andClauses };
    }

    // Public forum is available to everyone
    // Subject and class rooms based on user permissions/filters
    const rooms = await ChatRoom.find(roomQuery)
      .sort({ 'stats.lastActivity': -1 })
      .limit(50)
      .lean();
    
    // Add member count and online status
    const roomsWithStats = rooms.map(room => ({
      ...room,
      memberCount: room.stats?.totalMembers || 0,
      hasNewMessages: false, // TODO: Implement new message tracking
      isOnline: true // TODO: Implement online status
    }));
    
    res.json(roomsWithStats);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({ error: 'Failed to fetch chat rooms' });
  }
});

// Get messages for a specific room with pagination
app.get('/api/chat/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { page = 1, limit = 50, before } = req.query;
    
    let query = { 
      roomId: roomId, 
      'deleted.isDeleted': { $ne: true } 
    };
    
    // If 'before' timestamp is provided, get messages before that time
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('replyTo.messageId', 'content sender.name')
      .lean();
    
    // Reverse to get chronological order
    const sortedMessages = messages.reverse();
    
    res.json({
      messages: sortedMessages,
      hasMore: messages.length === parseInt(limit),
      page: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new chat room
app.post('/api/chat/rooms', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      type, 
      subject, 
      classLevel, 
      settings = {},
      createdBy 
    } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Room name and type are required' });
    }
    
    // Generate unique room ID
    const roomId = `${type}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    const roomData = {
      id: roomId,
      name: name.trim(),
      description: description?.trim(),
      type: type,
      settings: {
        allowFileSharing: settings.allowFileSharing !== false,
        allowVoiceMessages: settings.allowVoiceMessages !== false,
        allowImageSharing: settings.allowImageSharing !== false,
        moderationEnabled: settings.moderationEnabled || false,
        maxMembers: settings.maxMembers || 500
      },
      stats: {
        totalMessages: 0,
        totalMembers: 0,
        lastActivity: new Date(),
        createdBy: {
          userId: createdBy.userId,
          model: createdBy.model || 'User',
          name: createdBy.name
        }
      }
    };
    
    // Add subject or class level if specified
    if (type === 'subject-room' && subject) {
      roomData.subject = subject;
      roomData.avatar = '📚';
    }
    
    if (type === 'class-room' && classLevel) {
      roomData.classLevel = classLevel;
      roomData.avatar = '🎓';
    }
    
    if (type === 'public-forum') {
      roomData.avatar = '🌍';
    }
    
    const newRoom = new ChatRoom(roomData);
    
    // Add creator as owner
    if (createdBy.userId) {
      await newRoom.addMember(createdBy.userId, createdBy.model || 'User', 'owner');
    }
    
    await newRoom.save();
    
    res.status(201).json({
      message: 'Room created successfully',
      room: newRoom
    });
    
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Join a chat room
app.post('/api/chat/rooms/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, userModel = 'User', userName } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const room = await ChatRoom.findOne({ id: roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user is already a member
    const existingMember = room.members.find(
      member => member.user.toString() === userId.toString()
    );
    
    if (existingMember) {
      // Update last seen
      existingMember.lastSeen = new Date();
      await room.save();
      return res.json({ message: 'Already a member', room });
    }
    
    // Add as new member
    await room.addMember(userId, userModel, 'member');
    
    // Send system message
    const systemMessage = new Message({
      roomId: roomId,
      sender: {
        id: userId,
        model: 'User',
        name: 'System',
        role: 'admin',
        avatar: '🤖'
      },
      content: `${userName || 'Someone'} joined the room`,
      type: 'system',
      priority: 'low'
    });
    
    await systemMessage.save();
    
    res.json({
      message: 'Successfully joined room',
      room: room
    });
    
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Leave a chat room
app.post('/api/chat/rooms/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, userName } = req.body;
    
    const room = await ChatRoom.findOne({ id: roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    await room.removeMember(userId);
    
    // Send system message
    const systemMessage = new Message({
      roomId: roomId,
      sender: {
        id: userId,
        model: 'User',
        name: 'System',
        role: 'admin',
        avatar: '🤖'
      },
      content: `${userName || 'Someone'} left the room`,
      type: 'system',
      priority: 'low'
    });
    
    await systemMessage.save();
    
    res.json({ message: 'Successfully left room' });
    
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Send a message to a room
app.post('/api/chat/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { 
      senderId, 
      senderModel = 'User',
      senderName, 
      senderRole,
      content, 
      type = 'text',
      replyToId,
      attachment 
    } = req.body;
    
    if (!senderId || !senderName) {
      return res.status(400).json({ error: 'Sender information is required' });
    }
    
    if (!content && type === 'text') {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    const normalizedSenderRole = normalizeRole(senderRole || senderModel);
    const messageData = {
      roomId: roomId,
      sender: {
        id: senderId,
        model: normalizedSenderRole === 'admin' ? 'Admin' : senderModel,
        name: senderName,
        role: normalizedSenderRole,
        avatar: '👤'
      },
      content: content?.trim(),
      type: type
    };
    
    // Handle reply
    if (replyToId) {
      const replyToMessage = await Message.findById(replyToId);
      if (replyToMessage) {
        messageData.replyTo = {
          messageId: replyToId,
          senderName: replyToMessage.sender.name,
          content: replyToMessage.content.substring(0, 100),
          truncated: replyToMessage.content.length > 100
        };
      }
    }
    
    // Handle file attachment
    if (attachment) {
      messageData.attachment = {
        data: attachment.path || attachment.url || attachment.data,
        type: attachment.mimeType || attachment.type,
        name: attachment.name || attachment.originalName,
        size: attachment.size || 0
      };
    }
    
    const message = new Message(messageData);
    await message.save();
    
    // Update room stats
    const room = await ChatRoom.findOne({ id: roomId });
    if (room) {
      room.stats.totalMessages += 1;
      await room.updateLastMessage(content, senderName, type);
    }
    
    // Populate reply information
    await message.populate('replyTo.messageId', 'content sender.name');
    
    res.status(201).json({
      message: 'Message sent successfully',
      data: message
    });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete a message
app.delete('/api/chat/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, userRole } = req.body;
    // normalize role locally to avoid depending on socket scope helper
    const normalizeRoleLocal = (role) => {
      if (!role) return 'student';
      const r = String(role).toLowerCase();
      if (['admin', 'teacher', 'student', 'other', 'parent', 'sponsor'].includes(r)) return r;
      return 'other';
    };

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check permissions (use normalized role)
    const normRole = normalizeRoleLocal(userRole);
    const senderId = message.sender && message.sender.id ? message.sender.id.toString() : null;
    const providedUserId = userId ? userId.toString() : null;

    const canDelete = (
      (senderId && providedUserId && senderId === providedUserId) ||
      normRole === 'admin' ||
      normRole === 'teacher'
    );

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // Soft delete and record who deleted it
    message.deleted = {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: providedUserId,
      deletedByModel: normRole === 'admin' ? 'Admin' : (normRole === 'teacher' ? 'Teacher' : 'User')
    };
    
    await message.save();
    
    res.json({ message: 'Message deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Add reaction to message
app.post('/api/chat/messages/:messageId/reactions', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, userModel = 'User', userName, emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Find existing reaction
    let reaction = message.reactions.find(r => r.emoji === emoji);
    
    if (reaction) {
      // Check if user already reacted
      const userReactionIndex = reaction.users.findIndex(
        u => u.userId.toString() === userId.toString()
      );
      
      if (userReactionIndex > -1) {
        // Remove user's reaction
        reaction.users.splice(userReactionIndex, 1);
        reaction.count = reaction.users.length;
        
        // Remove reaction if no users left
        if (reaction.users.length === 0) {
          message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        // Add user's reaction
        reaction.users.push({
          userId: userId,
          model: userModel,
          name: userName
        });
        reaction.count = reaction.users.length;
      }
    } else {
      // Create new reaction
      message.reactions.push({
        emoji: emoji,
        users: [{
          userId: userId,
          model: userModel,
          name: userName
        }],
        count: 1
      });
    }
    
    await message.save();
    
    res.json({
      message: 'Reaction updated successfully',
      reactions: message.reactions
    });
    
  } catch (error) {
    console.error('Error updating reaction:', error);
    res.status(500).json({ error: 'Failed to update reaction' });
  }
});

// Get messages for a specific room
app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await Message.find({ 
      roomId: roomId,
      'deleted.isDeleted': { $ne: true }
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('replyTo.messageId', 'content sender.name')
      .lean();
    
    // Transform messages to match frontend expectations
    const transformedMessages = messages.map(message => ({
      _id: message._id,
      userId: message.sender.id,
      fullName: message.sender.name,
      username: message.sender.name, // For backward compatibility
      text: message.content,
      timestamp: message.createdAt || message.timestamp || new Date(),
      roomId: message.roomId,
      userType: message.sender.role,
      fileData: message.attachment?.data,
      fileType: message.attachment?.type,
      replyTo: message.replyTo?.messageId,
      replyToMessage: message.replyTo ? {
        fullName: message.replyTo.senderName || 'Unknown',
        text: message.replyTo.content || 'Reply message'
      } : null
    }));

    res.json(transformedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create new chat room (legacy endpoint)
app.post('/api/create-room', async (req, res) => {
  try {
    const { name, description, subject, class: classLevel, type, createdBy } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }
    
    const roomId = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    
    const roomData = {
      id: roomId,
      name: name,
      description: description,
      type: type || 'subject-room',
      settings: {
        allowFileSharing: true,
        allowVoiceMessages: true,
        allowImageSharing: true,
        moderationEnabled: false
      }
    };
    
    if (subject) {
      roomData.subject = subject;
      roomData.avatar = '📚';
    }
    
    if (classLevel) {
      roomData.classLevel = classLevel;
      roomData.avatar = '🎓';
    }
    
    const newRoom = new ChatRoom(roomData);
    
    if (createdBy) {
      newRoom.stats.createdBy = {
        userId: createdBy,
        model: 'User',
        name: 'User'
      };
    }
    
    await newRoom.save();
    
    res.status(201).json({
      message: 'Room created successfully',
      roomId: roomId,
      room: newRoom
    });
    
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Enhanced Socket.IO Chat Functionality
const connectedUsers = new Map();
const activeRooms = new Map();
const typingUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Helper to normalize and validate roles
  function normalizeRole(role) {
    if (!role) return 'student';
    const r = String(role).toLowerCase();
    if (['admin', 'teacher', 'student', 'other', 'parent', 'sponsor'].includes(r)) return r;
    return 'other';
  }

  // User authentication and join
  socket.on('user:join', (userData) => {
    const { userId, name, role, avatar } = userData;
  const normalizedRole = normalizeRole(role);
    
  socket.userId = userId;
  socket.userName = name;
  socket.userRole = normalizedRole;
    socket.userAvatar = avatar || '👤';
    
    // Store user connection
    connectedUsers.set(userId, {
      socketId: socket.id,
      name: name,
      role: normalizedRole,
      avatar: avatar,
      connectedAt: new Date(),
      activeRoom: null
    });
    
    socket.emit('user:connected', {
      message: 'Successfully connected to chat server',
      userId: userId
    });
    
  console.log(`${name} (${normalizedRole}) connected`);
  });

  // Join a chat room
  socket.on('room:join', async (data) => {
    try {
      const { roomId, userId, userName } = data;
      
      // Leave previous rooms
      socket.rooms.forEach(room => {
        if (room !== socket.id && room.startsWith('room:')) {
          socket.leave(room);
        }
      });
      
      // Join new room
      const roomName = `room:${roomId}`;
      socket.join(roomName);
      socket.currentRoom = roomId;
      
      // Update user's active room
      if (connectedUsers.has(userId)) {
        connectedUsers.get(userId).activeRoom = roomId;
      }
      
      // Add to active rooms tracking
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, new Set());
      }
      activeRooms.get(roomId).add(userId);
      
      // Notify others in the room
      socket.to(roomName).emit('user:joined', {
        userId: userId,
        userName: userName,
        joinedAt: new Date()
      });
      
      // Send room statistics
      const roomUsers = Array.from(activeRooms.get(roomId) || []);
      socket.emit('room:joined', {
        roomId: roomId,
        onlineUsers: roomUsers.length,
        users: roomUsers
      });
      
      console.log(`${userName} joined room: ${roomId}`);
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Leave a room
  socket.on('room:leave', async (data) => {
    try {
      const { roomId, userId, userName } = data;
      const roomName = `room:${roomId}`;
      
      socket.leave(roomName);
      
      // Remove from active rooms
      if (activeRooms.has(roomId)) {
        activeRooms.get(roomId).delete(userId);
        if (activeRooms.get(roomId).size === 0) {
          activeRooms.delete(roomId);
        }
      }
      
      // Update user's active room
      if (connectedUsers.has(userId)) {
        connectedUsers.get(userId).activeRoom = null;
      }
      
      // Notify others
      socket.to(roomName).emit('user:left', {
        userId: userId,
        userName: userName,
        leftAt: new Date()
      });
      
      console.log(`${userName} left room: ${roomId}`);
      
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  });

  // Send message
  socket.on('message:send', async (messageData) => {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      const { 
        roomId, 
        content, 
        type = 'text', 
        replyToId,
        attachment 
      } = messageData;

      if (!roomId || (!content && type === 'text')) {
        socket.emit('error', { message: 'Invalid message data' });
        return;
      }

      // Create message
      const normalizedSocketRole = normalizeRole(socket.userRole);
      const message = new Message({
        roomId: roomId,
        sender: {
          id: socket.userId,
          model: normalizedSocketRole === 'admin' ? 'Admin' : 'User',
          name: socket.userName,
          role: normalizedSocketRole,
          avatar: socket.userAvatar
        },
        content: content?.trim(),
        type: type,
        attachment: attachment
      });

      // Handle reply
      if (replyToId) {
        const replyToMessage = await Message.findById(replyToId);
        if (replyToMessage) {
          message.replyTo = {
            messageId: replyToId,
            senderName: replyToMessage.sender.name,
            content: replyToMessage.content.substring(0, 100),
            truncated: replyToMessage.content.length > 100
          };
        }
      }

      await message.save();
      
      // Update room statistics
      const room = await ChatRoom.findOne({ id: roomId });
      if (room) {
        room.stats.totalMessages += 1;
        await room.updateLastMessage(content, socket.userName, type);
      }

      // Populate reply data
      await message.populate('replyTo.messageId', 'content sender.name');

      // Broadcast to room
      const messageToSend = {
        _id: message._id,
        roomId: message.roomId,
        sender: message.sender,
        content: message.content,
        type: message.type,
        attachment: message.attachment,
        replyTo: message.replyTo,
        reactions: message.reactions,
        timestamp: message.createdAt,
        timeFormatted: message.timeFormatted
      };

      io.to(`room:${roomId}`).emit('message:new', messageToSend);

      console.log(`Message sent in ${roomId} by ${socket.userName}`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Delete message
  socket.on('message:delete', async (data) => {
    try {
      const { messageId, roomId } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Normalize socket role and check permissions
      const normalizeRoleLocal = (role) => {
        if (!role) return 'student';
        const r = String(role).toLowerCase();
        if (['admin', 'teacher', 'student', 'other', 'parent', 'sponsor'].includes(r)) return r;
        return 'other';
      };

      const normRole = normalizeRoleLocal(socket.userRole);
      const canDelete = (
        (message.sender.id && message.sender.id.toString() === socket.userId.toString()) ||
        normRole === 'admin' ||
        normRole === 'teacher'
      );

      if (!canDelete) {
        socket.emit('error', { message: 'Not authorized to delete this message' });
        return;
      }

      // Soft delete
      message.deleted = {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: socket.userId,
        deletedByModel: normRole === 'admin' ? 'Admin' : (normRole === 'teacher' ? 'Teacher' : 'User')
      };

      await message.save();

      // Broadcast deletion
      io.to(`room:${roomId}`).emit('message:deleted', {
        messageId: messageId,
        deletedBy: socket.userName,
        deletedAt: new Date()
      });

      console.log(`Message ${messageId} deleted by ${socket.userName}`);

    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Handle typing indicators
  socket.on('typing:start', (data) => {
    const { roomId } = data;
    const roomName = `room:${roomId}`;
    
    // Add to typing users
    if (!typingUsers.has(roomId)) {
      typingUsers.set(roomId, new Set());
    }
    typingUsers.get(roomId).add({
      userId: socket.userId,
      userName: socket.userName
    });
    
    socket.to(roomName).emit('typing:started', {
      userId: socket.userId,
      userName: socket.userName,
      roomId: roomId
    });
  });

  socket.on('typing:stop', (data) => {
    const { roomId } = data;
    const roomName = `room:${roomId}`;
    
    // Remove from typing users
    if (typingUsers.has(roomId)) {
      const roomTyping = typingUsers.get(roomId);
      roomTyping.forEach(user => {
        if (user.userId === socket.userId) {
          roomTyping.delete(user);
        }
      });
      
      if (roomTyping.size === 0) {
        typingUsers.delete(roomId);
      }
    }
    
    socket.to(roomName).emit('typing:stopped', {
      userId: socket.userId,
      userName: socket.userName,
      roomId: roomId
    });
  });

  // Handle message reactions
  socket.on('message:react', async (data) => {
    try {
      const { messageId, emoji, roomId } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Find existing reaction
      let reaction = message.reactions.find(r => r.emoji === emoji);
      
      if (reaction) {
        const userIndex = reaction.users.findIndex(
          u => u.userId.toString() === socket.userId.toString()
        );
        
        if (userIndex > -1) {
          // Remove reaction
          reaction.users.splice(userIndex, 1);
          reaction.count = reaction.users.length;
          
          if (reaction.users.length === 0) {
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          // Add reaction
          reaction.users.push({
            userId: socket.userId,
            model: socket.userRole === 'admin' ? 'Admin' : 'User',
            name: socket.userName
          });
          reaction.count = reaction.users.length;
        }
      } else {
        // Create new reaction
        message.reactions.push({
          emoji: emoji,
          users: [{
            userId: socket.userId,
            model: socket.userRole === 'admin' ? 'Admin' : 'User',
            name: socket.userName
          }],
          count: 1
        });
      }

      await message.save();

      // Broadcast reaction update
      io.to(`room:${roomId}`).emit('message:reaction-updated', {
        messageId: messageId,
        reactions: message.reactions,
        updatedBy: socket.userName
      });

    } catch (error) {
      console.error('Reaction error:', error);
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  });

  // Get room online users
  socket.on('room:get-online-users', (data) => {
    const { roomId } = data;
    const roomUsers = activeRooms.get(roomId) || new Set();
    
    const onlineUsers = Array.from(roomUsers).map(userId => {
      const userInfo = connectedUsers.get(userId);
      return userInfo ? {
        userId: userId,
        name: userInfo.name,
        role: userInfo.role,
        avatar: userInfo.avatar
      } : null;
    }).filter(Boolean);
    
    socket.emit('room:online-users', {
      roomId: roomId,
      users: onlineUsers,
      count: onlineUsers.length
    });
  });

  // Legacy handlers for backward compatibility
  socket.on('join room', (data) => {
    const { roomId, userId, fullName, userType } = data;
  const normalizedRole = normalizeRole(userType);
    
  socket.userId = userId;
  socket.userName = fullName;
  socket.fullName = fullName; // Store fullName for message handling
  socket.userRole = normalizedRole;
    socket.currentRoom = roomId;
    
    socket.join(`room:${roomId}`);
    
    if (!activeRooms.has(roomId)) {
      activeRooms.set(roomId, new Set());
    }
    activeRooms.get(roomId).add(userId);
    
    // Store connected user info for reference
    connectedUsers.set(socket.id, {
      userId: userId,
      name: fullName,
      role: normalizedRole,
      avatar: fullName ? fullName.charAt(0).toUpperCase() : 'U'
    });
    
    socket.to(`room:${roomId}`).emit('user joined', {
      fullName: fullName,
      username: fullName
    });
    
    console.log(`${fullName} joined room: ${roomId} (legacy)`);
  });

  socket.on('message', async (messageData, callback) => {
    try {
      const { text, userId, fullName, roomId, userType, fileData, fileType, replyTo, fileName, filePath, fileSize } = messageData;
      
      // Ensure we have proper user information
      const senderName = fullName || socket.fullName || 'User';
      const senderUserId = userId || socket.userId;
      
      if (!senderUserId || !senderName) {
        console.error('Missing user information in message:', messageData);
        return;
      }
      
      // Convert userType to lowercase database format
  const dbRole = normalizeRole(userType || socket.userRole || 'student');
      
      // Handle reply to message
      let replyToMessage = null;
      if (replyTo) {
        try {
          replyToMessage = await Message.findById(replyTo);
        } catch (error) {
          console.log('Reply message not found:', replyTo);
        }
      }
      
      // Determine message type and content
      let messageType = 'text';
      let messageContent = text || '';
      let attachmentData = null;
      
  if (filePath || fileData) {
        messageType = 'file';
        messageContent = fileName || text || 'File attachment';
        attachmentData = {
          data: filePath || fileData, // Use filePath for uploaded files, fileData for base64
          type: fileType || 'application/octet-stream',
          name: fileName || 'file',
          size: fileSize || 0
        };
      }
      
      // Create message using new schema
    const message = new Message({
        roomId: roomId,
        sender: {
          id: senderUserId,
      model: dbRole === 'admin' ? 'Admin' : 'User',
      name: senderName,
      role: dbRole
        },
        content: messageContent,
        type: messageType,
        attachment: attachmentData,
        replyTo: replyToMessage ? {
          messageId: replyToMessage._id,
          senderName: replyToMessage.sender.name,
          content: replyToMessage.content.substring(0, 100) + (replyToMessage.content.length > 100 ? '...' : ''),
          truncated: replyToMessage.content.length > 100
        } : undefined
      });

  await message.save();
  console.log('Message saved to database:', {
        id: message._id,
        type: message.type,
        hasAttachment: !!message.attachment,
        attachmentPath: message.attachment?.data
      });

      // Update chat room metadata: lastMessage and stats
      try {
        const chatRoom = await ChatRoom.findOne({ id: roomId });
        if (chatRoom) {
          chatRoom.lastMessage = {
            content: message.content ? message.content.substring(0,100) : '',
            timestamp: message.createdAt || new Date(),
            senderName: message.sender.name,
            messageType: messageType
          };
          chatRoom.stats = chatRoom.stats || {};
          chatRoom.stats.totalMessages = (chatRoom.stats.totalMessages || 0) + 1;
          chatRoom.stats.lastActivity = new Date();
          await chatRoom.save();
        }
      } catch (err) {
        console.error('Error updating chat room metadata:', err);
      }

      // Broadcast to room with complete data for immediate display
      const messageToSend = {
        _id: message._id,
        userId: message.sender.id,
        fullName: message.sender.name,
        username: message.sender.name, // For backward compatibility
        text: message.content,
        fileData: messageType === 'file' ? message.attachment.data : null,
        fileType: messageType === 'file' ? message.attachment.type : null,
        fileName: messageType === 'file' ? message.attachment.name : null,
        filePath: messageType === 'file' ? message.attachment.data : null,
        fileSize: messageType === 'file' ? message.attachment.size : null,
        timestamp: message.createdAt,
        replyTo: replyTo,
        replyToMessage: replyToMessage ? {
          _id: replyToMessage._id,
          fullName: replyToMessage.sender.name,
          text: replyToMessage.content,
          userId: replyToMessage.sender.id
        } : null
      };

      // Return saved message to sender via acknowledgement callback (if provided)
      try {
        if (typeof callback === 'function') callback(messageToSend);
      } catch (err) {
        console.warn('Callback error when acknowledging message:', err);
      }

      // Then broadcast to room so other clients receive it
      io.to(`room:${roomId}`).emit('message', messageToSend);
      
    } catch (error) {
      console.error('Legacy message error:', error);
    }
  });

  socket.on('delete-message', async (data) => {
    try {
      const { messageId, userId } = data;
      
      const message = await Message.findById(messageId);
      if (message && message.sender.id === userId) {
        // Soft delete
        message.deleted = {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId,
          deletedByModel: 'User'
        };
        await message.save();
        
        io.to(`room:${socket.currentRoom}`).emit('message deleted', messageId);
      }
      
    } catch (error) {
      console.error('Legacy delete error:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.userId) {
      // Remove from connected users
      connectedUsers.delete(socket.userId);
      
      // Remove from active rooms
      activeRooms.forEach((users, roomId) => {
        if (users.has(socket.userId)) {
          users.delete(socket.userId);
          
          // Notify room about user leaving
          socket.to(`room:${roomId}`).emit('user:left', {
            userId: socket.userId,
            userName: socket.userName,
            leftAt: new Date()
          });
          
          // Clean up empty rooms
          if (users.size === 0) {
            activeRooms.delete(roomId);
          }
        }
      });
      
      // Remove from typing indicators
      typingUsers.forEach((users, roomId) => {
        users.forEach(user => {
          if (user.userId === socket.userId) {
            users.delete(user);
            socket.to(`room:${roomId}`).emit('typing:stopped', {
              userId: socket.userId,
              userName: socket.userName,
              roomId: roomId
            });
          }
        });
      });
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;

// Initialize default chat rooms
async function initializeDefaultChats() {
  try {
    // Check if general chat exists
    const generalChat = await ChatRoom.findOne({ id: 'general' });
    if (!generalChat) {
      const defaultChat = new ChatRoom({
        id: 'general',
        name: 'General Discussion',
        type: 'public',
        createdBy: 'system',
        lastMessage: {
          content: 'Welcome to the general discussion room!',
          timestamp: new Date(),
          sender: 'System'
        }
      });
      await defaultChat.save();
      console.log('Created default general chat room');
    }

    // Create students group chat
    const studentsChat = await ChatRoom.findOne({ id: 'students' });
    if (!studentsChat) {
      const studentGroup = new ChatRoom({
        id: 'students',
        name: 'Students Group',
        type: 'public',
        createdBy: 'system',
        lastMessage: {
          content: 'Students group chat created!',
          timestamp: new Date(),
          sender: 'System'
        }
      });
      await studentGroup.save();
      console.log('Created students group chat room');
    }

    // Create teachers group chat
    const teachersChat = await ChatRoom.findOne({ id: 'teachers' });
    if (!teachersChat) {
      const teacherGroup = new ChatRoom({
        id: 'teachers',
        name: 'Teachers Group',
        type: 'public',
        createdBy: 'system',
        lastMessage: {
          content: 'Teachers group chat created!',
          timestamp: new Date(),
          sender: 'System'
        }
      });
      await teacherGroup.save();
      console.log('Created teachers group chat room');
    }

  } catch (error) {
    console.error('Error initializing default chats:', error);
  }
}

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin login: http://localhost:${PORT}`);
  
  // Initialize default chat rooms
  await initializeDefaultChats();
});


