import express from 'express';
import {
  lookupGuest,
  getGuestSession,
  getGuestRsvp,
  updateGuestRsvp,
  getGuestQr,
  listGuests,
  createGuest,
  updateGuest,
  rotateGuestCode,
  archiveGuest,
  undoCheckIn,
  importGuests,
  scanCheckIn,
  checkInSummary,
  lookupDoorCode,
  confirmCheckIn,
  searchDoorGuests,
  recentCheckIns,
  listInvitationDeliveries
} from '../controllers/guestController.js';
import {
  getPublicWedding,
  getWeddingForGuest,
  getWeddingDetails,
  updateWeddingDetails,
  listStaff,
  createStaff,
  resetStaffPassword,
  setStaffActive
} from '../controllers/weddingController.js';
import {
  getSeating,
  createTable,
  updateTable,
  deleteTable,
  assignGuestTable,
  setTableVisibility
} from '../controllers/seatingController.js';
import {
  startOnlineGift,
  getGiftStatus,
  reportTransferGift,
  listMyGifts,
  listGifts,
  setTransferReceived
} from '../controllers/giftController.js';
import { admin, protect, protectGuest, staff } from '../middleware/auth.js';
import { checkInLimiter, giftLimiter, guestLookupLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Express 4 does not forward rejected promises, so route async failures to the error handler
['get', 'post', 'put', 'delete'].forEach((method) => {
  const register = router[method].bind(router);
  router[method] = (path, ...handlers) => register(path, ...handlers.map((handler) =>
    (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)));
});

router.get('/wedding', getPublicWedding);
router.post('/access/lookup', guestLookupLimiter, lookupGuest);
router.get('/access/me', protectGuest, getGuestSession);
router.get('/access/wedding', protectGuest, getWeddingForGuest);
router.get('/access/qr', protectGuest, getGuestQr);
router.get('/rsvp', protectGuest, getGuestRsvp);
router.put('/rsvp', protectGuest, updateGuestRsvp);
router.get('/access/gifts', protectGuest, listMyGifts);
router.post('/access/gifts/online', protectGuest, giftLimiter, startOnlineGift);
router.post('/access/gifts/transfer', protectGuest, giftLimiter, reportTransferGift);
router.get('/access/gifts/:reference', protectGuest, getGiftStatus);

router.get('/admin/wedding', protect, admin, getWeddingDetails);
router.put('/admin/wedding', protect, admin, updateWeddingDetails);
router.get('/admin/staff', protect, admin, listStaff);
router.post('/admin/staff', protect, admin, createStaff);
router.put('/admin/staff/:id', protect, admin, setStaffActive);
router.put('/admin/staff/:id/password', protect, admin, resetStaffPassword);
router.get('/admin/seating', protect, admin, getSeating);
router.post('/admin/seating/tables', protect, admin, createTable);
router.put('/admin/seating/tables/:id', protect, admin, updateTable);
router.delete('/admin/seating/tables/:id', protect, admin, deleteTable);
router.put('/admin/seating/guests/:id', protect, admin, assignGuestTable);
router.put('/admin/seating/visibility', protect, admin, setTableVisibility);
router.get('/admin/gifts', protect, admin, listGifts);
router.put('/admin/gifts/:id/received', protect, admin, setTransferReceived);
router.get('/admin/guests', protect, admin, listGuests);
router.post('/admin/guests', protect, admin, createGuest);
router.post('/admin/guests/import', protect, admin, importGuests);
router.put('/admin/guests/:id', protect, admin, updateGuest);
router.post('/admin/guests/:id/rotate-code', protect, admin, rotateGuestCode);
router.post('/admin/guests/:id/archive', protect, admin, archiveGuest);
router.get('/admin/guests/:id/invitations', protect, admin, listInvitationDeliveries);
router.post('/admin/check-ins/scan', protect, staff, checkInLimiter, scanCheckIn);
router.post('/admin/check-ins/lookup', protect, staff, checkInLimiter, lookupDoorCode);
router.post('/admin/check-ins/confirm', protect, staff, checkInLimiter, confirmCheckIn);
router.post('/admin/check-ins/:id/undo', protect, staff, undoCheckIn);
router.get('/admin/check-ins/summary', protect, staff, checkInSummary);
router.get('/admin/check-ins/recent', protect, staff, recentCheckIns);
router.get('/admin/check-ins/search', protect, staff, checkInLimiter, searchDoorGuests);

export default router;
