const mongoose = require('mongoose');

// Enhanced Message Schema
const messageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  sender: {
    id: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: true,
      enum: ['User', 'Admin'],
      default: 'User'
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['student', 'teacher', 'admin', 'other', 'parent', 'sponsor'],
      default: 'student'
    },
    avatar: {
      type: String,
      default: '👤'
    }
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'file', 'image', 'video', 'audio'],
    default: 'text'
  },
  attachment: {
  data: { type: String }, // URL or Base64 encoded data
  type: { type: String }, // MIME type
  name: { type: String }, // Original filename
  size: { type: Number } // File size in bytes
  },
  replyTo: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    senderName: String,
    content: String,
    truncated: {
      type: Boolean,
      default: false
    }
  },
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    users: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'reactions.users.model'
      },
      model: {
        type: String,
        enum: ['User', 'Admin'],
        default: 'User'
      },
      name: String
    }],
    count: {
      type: Number,
      default: 0
    }
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'readBy.model'
    },
    model: {
      type: String,
      enum: ['User', 'Admin'],
      default: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  deleted: {
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'deleted.deletedByModel'
    },
    deletedByModel: {
      type: String,
      enum: ['User', 'Admin']
    }
  },
  edited: {
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,
    originalContent: String
  }
}, {
  timestamps: true
});

// Pre-save middleware to normalize role to lowercase
messageSchema.pre('save', function(next) {
  if (this.sender && this.sender.role) {
    this.sender.role = this.sender.role.toLowerCase();
  }
  next();
});

// Indexes for efficient querying
messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ 'sender.id': 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ 'deleted.isDeleted': 1 });

// Virtual for formatted timestamp
messageSchema.virtual('timeFormatted').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  
  return this.createdAt.toLocaleDateString();
});

// Enhanced Chat Room Schema
const chatRoomSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['public', 'private', 'subject', 'group', 'study'],
    required: true,
    default: 'public'
  },
  avatar: {
    type: String,
    default: '💬'
  },
  createdBy: {
    type: String,
    required: true
  },
  createdByModel: {
    type: String,
    enum: ['User', 'Admin'],
    default: 'User'
  },
  members: [{
    user: {
      type: String,
      required: true
    },
    model: {
      type: String,
      enum: ['User', 'Admin'],
      default: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    permissions: {
      canSendMessages: {
        type: Boolean,
        default: true
      },
      canDeleteMessages: {
        type: Boolean,
        default: false
      },
      canAddMembers: {
        type: Boolean,
        default: false
      },
      canRemoveMembers: {
        type: Boolean,
        default: false
      }
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowVoiceMessages: {
      type: Boolean,
      default: true
    },
    allowVideoMessages: {
      type: Boolean,
      default: true
    },
    moderationEnabled: {
      type: Boolean,
      default: false
    },
    maxFileSize: {
      type: Number,
      default: 10485760 // 10MB
    },
    allowedFileTypes: {
      type: [String],
      default: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*']
    }
  },
  lastMessage: {
    content: String,
    timestamp: Date,
    senderName: String,
    messageType: {
      type: String,
      default: 'text'
    }
  },
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalMembers: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    subject: String,
    class: String,
    tags: [String],
    category: String
  }
}, {
  timestamps: true
});

// Indexes for chat rooms
chatRoomSchema.index({ type: 1 });
chatRoomSchema.index({ 'members.user': 1 });
chatRoomSchema.index({ createdAt: -1 });
chatRoomSchema.index({ 'stats.lastActivity': -1 });

// Method to add a member to the room
chatRoomSchema.methods.addMember = function(userId, userModel = 'User', role = 'member') {
  const existingMember = this.members.find(
    member => member.user.toString() === userId.toString()
  );
  
  if (!existingMember) {
    this.members.push({
      user: userId,
      model: userModel,
      role: role,
      joinedAt: new Date()
    });
    this.stats.totalMembers = this.members.length;
  }
  
  return this.save();
};

// Method to remove a member from the room
chatRoomSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(
    member => member.user.toString() !== userId.toString()
  );
  this.stats.totalMembers = this.members.length;
  return this.save();
};

// Method to update last message
chatRoomSchema.methods.updateLastMessage = function(content, senderName, messageType = 'text') {
  this.lastMessage = {
    content: content.substring(0, 100), // Limit preview length
    timestamp: new Date(),
    senderName: senderName,
    messageType: messageType
  };
  this.stats.lastActivity = new Date();
  return this.save();
};

// Legacy Simple Message Schema (for backward compatibility)
const simpleChatSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  username: String,
  text: String,
  fileData: String,
  fileType: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimpleMessage'
  },
  replyToMessage: {
    fullName: String,
    username: String,
    text: String
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for simple messages
simpleChatSchema.index({ roomId: 1, timestamp: -1 });
simpleChatSchema.index({ userId: 1 });

const Message = mongoose.model('Message', messageSchema);
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
const SimpleMessage = mongoose.model('SimpleMessage', simpleChatSchema);

module.exports = { 
  Message, 
  ChatRoom, 
  SimpleMessage 
};
