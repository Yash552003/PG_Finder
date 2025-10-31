// middlewares/file_uploader.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ensure upload directories exist
const ensureDir = (p) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

const PROPERTY_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'properties');
const RIDER_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'riders');

ensureDir(PROPERTY_UPLOAD_DIR);
ensureDir(RIDER_UPLOAD_DIR);

const propertyStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PROPERTY_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // unique filename
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + ext);
  }
});

const riderStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, RIDER_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + ext);
  }
});

function imageFileFilter(req, file, cb) {
  // allow common image files and pdf (for identity) if needed
  const allow = /\.(jpg|jpeg|png|gif|pdf)$/i;
  if (!file.originalname.match(allow)) {
    return cb(new Error('Only image (jpg|jpeg|png|gif) or pdf allowed'));
  }
  cb(null, true);
}

const uploadPropertyImages = multer({
  storage: propertyStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter
});

const uploadRiderFiles = multer({
  storage: riderStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

module.exports = {
  uploadPropertyImages, // usage: uploadPropertyImages.array('property-image', 5)
  uploadRiderFiles // usage: uploadRiderFiles.fields([...])
};
