import multer from 'multer';

// In-memory buffer storage - absolutely NO local disk writing
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file limit
  },
});

/**
 * Middleware for event media (field names: 'posters', 'slabImage', etc.)
 */
export const uploadPosters = upload.any();

/**
 * Middleware for ambassador avatar (field name: 'picture')
 */
export const uploadAmbassadorPicture = upload.single('picture');

/**
 * Middleware for support ticket attachment (field name: 'image')
 */
export const uploadTicketAttachment = upload.single('image');

export default {
  uploadPosters,
  uploadAmbassadorPicture,
  uploadTicketAttachment,
};
