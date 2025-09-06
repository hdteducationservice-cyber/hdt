const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const classLevels = [
  'Form I', 'Form II', 'Form III', 'Form IV', 'Form V', 'Form VI', 'Other'
];

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

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: function() {
      return this.role !== 'other' || !this.phoneNumber;
    },
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        if (!email) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please enter a valid email address'
    }
  },
  phoneNumber: {
    type: String,
    required: function() {
      return this.role === 'other' && !this.email;
    },
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    required: true,
    enum: ['student', 'teacher', 'other'],
    default: 'student'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function() {
      return this.role === 'teacher' ? 'pending' : 'approved';
    }
  },
  
  // Student specific fields
  classLevel: {
    type: String,
    required: function() {
      return this.role === 'student';
    },
    enum: classLevels
  },
  
  // Teacher specific fields
  profileImage: {
  type: String, // Secure URL to uploaded profile photo (Cloudinary)
    required: function() {
      return this.role === 'teacher';
    }
  },
  phoneContact: {
    type: String,
    required: function() {
      return this.role === 'teacher';
    },
    trim: true
  },
  gender: {
    type: String,
    required: function() {
      return this.role === 'teacher';
    },
    enum: ['Male', 'Female', 'Other']
  },
  school: {
    type: String,
    required: function() {
      return this.role === 'teacher';
    },
    trim: true
  },
  assignedClassLevels: [{
    type: String,
    enum: classLevels,
    required: function() {
      return this.role === 'teacher';
    }
  }],
  assignedSubjects: {
    type: [{
      type: String,
      enum: subjects
    }],
    validate: {
      validator: function(subjects) {
        return this.role !== 'teacher' || subjects.length <= 4;
      },
      message: 'Teachers can be assigned maximum 4 subjects'
    }
  },
  cv: {
    type: String, // Secure URL to uploaded CV (Cloudinary)
    required: function() {
      return this.role === 'teacher';
    }
  },
  profileImagePublicId: {
    type: String
  },
  cvPublicId: {
    type: String
  },
  // Persisted JWT tokens for server-side session revocation (teachers/users)
  tokens: {
    type: [String],
    default: []
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  approvedAt: {
    type: Date
  },
  
  // Comments system
  comments: [{
    message: {
      type: String,
      required: true
    },
    targetAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    adminReply: {
      type: String
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    repliedAt: {
      type: Date
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Email update tracking
  emailUpdateHistory: [{
    oldEmail: String,
    newEmail: String,
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Login tracking
  lastLogin: {
    type: Date
  },
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'comments.targetAdmin': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get initials for profile icon
userSchema.methods.getInitials = function() {
  return this.fullName.split(' ').map(name => name[0]).join('').toUpperCase();
};

// Check if teacher is approved
userSchema.methods.isApproved = function() {
  return this.status === 'approved';
};

module.exports = mongoose.model('User', userSchema);
