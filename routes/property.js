// routes/property.js (corrected)
const express = require('express');
const { isLoggedIn, isRoleProvider, isRoleAdminOrProvider, isRoleRider, isRoleAdmin } = require("../middlewares/role_validator");
const { validatePropertyDetails } = require('../middlewares/schema_validator');
const router = express.Router();
const providers = require('../models/provider');
const properties = require('../models/property');
const riders = require('../models/rider');
const keys = require('../models/key');
const { uploadPropertyImages } = require("../middlewares/file_uploader");
const { convertToArray } = require('../utils/some_methods');
const { paymentKeyGenerator } = require('../utils/key_generator');
const { stripePrivateKey, serverURL } = require('../config');
const bookings = require("../models/booking");
const stripe = require('stripe')(stripePrivateKey);
const fs = require('fs');
const path = require('path');

/* --- ADMIN: list properties --- */
router.get('/all', isLoggedIn, isRoleAdmin, async (req, res) => {
  try {
    let { skip } = req.query;
    skip = Number(skip) || 0;
    req.query.skip = skip;
    const results = await properties.find({}).skip(skip).limit(10);
    console.log(`GET /property/all -> found ${results.length} properties (skip=${skip})`);
    return res.render('admin-details', {
      type: 'property', results, query: req.query,
      isFirst: skip === 0, isLast: results.length < 10
    });
  } catch (e) {
    console.error('GET /property/all error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Search home --- */
router.get('/search', async (req, res) => {
  try {
    const topProperty = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/top_property.json'), 'utf-8')) || [];
    res.render('search-home', { topProperty });
  } catch (e) {
    console.error('GET /property/search error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Listing / search results --- */
router.get('/', async (req, res) => {
  try {
    let { searchType, searchText, gender, rating, rate, skip, resCount } = req.query;

    // If no search query provided, show recent/all
    if (!searchType || !searchText) {
      const allProperties = await properties.find({}).limit(20).populate('owner');
      console.log(`GET /property -> returning recent ${allProperties.length} properties`);
      return res.render('search-result', {
        results: allProperties,
        isFirst: true,
        isLast: allProperties.length < 20,
        query: {}
      });
    }

    let filter = {};
    if (gender) filter.type = gender;
    if (rating) filter.rating = { $gte: rating };
    if (rate) filter.rate = { $lte: Number(rate) };
    if (searchType === 'zip') filter['address.zipcode'] = searchText;
    else filter['$text'] = { $search: searchText };

  // coerce pagination params to numbers
  resCount = Number(resCount) || 10;
  req.query.resCount = resCount;
  skip = Number(skip) || 0;
  req.query.skip = skip;
  let isFirst = (skip === 0);

    let result;
    if (searchType === 'zip')
      result = await properties.find(filter).sort({ name: 1 }).skip(skip).limit(resCount).populate('owner');
    else
      result = await properties.find(filter, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" }, name: 1 }).skip(skip).limit(resCount).populate('owner');

    console.log(`GET /property -> filter=${JSON.stringify(filter)}; returned=${result.length}; skip=${skip}; resCount=${resCount}`);

    let isLast = result.length < resCount;
    return res.render('search-result', { results: result, isFirst, isLast, query: req.query });
  } catch (e) {
    console.error('GET /property error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Show new property form --- */
router.get('/new', isLoggedIn, isRoleProvider, (req, res) => {
  try { res.render('register-pg'); }
  catch (e) { console.error(e); res.render('error', { code: 500, error: 'Internal server error' }); }
});

/* --- Create property --- */
router.post('/',
  isLoggedIn,
  isRoleProvider,
  uploadPropertyImages.array('property-image', 5),
  validatePropertyDetails,
  async (req, res) => {
    try {
      console.log('🟢 Property creation request');
      console.log('Session userRoleID:', req.session.userRoleID);
      console.log('User role:', req.user ? req.user.role : 'No user in session');
      console.log('--- Add Property Request ---');
      console.log('req.user =', req.user ? req.user.username : null);
      console.log('req.session.userRoleID =', req.session ? req.session.userRoleID : null);
      console.log('req.files count =', (req.files || []).length);
      
      // Build address & arrays
      let {
        name, addBuilding, addL1, addL2, landmark, state, city, zipCode,
        maxOccupancy, type, desc, food, foodText,
        amenities, rules, otherCharges, otherChargesText, occupancy, rate, tagLine, since, bookingMoney
      } = req.body;

      const address = { building: addBuilding, addL1, addL2, landmark, state, city, zipcode: zipCode, country: 'India' };

      const foodProp = [];
      food = convertToArray(food);
      foodText = convertToArray(foodText);
      food.forEach((v, idx) => foodProp.push({ name: v, detail: foodText[idx] || '', path: `images/svg/${v}` }));

      const amenityProp = [];
      amenities = convertToArray(amenities);
      amenities.forEach(v => amenityProp.push({ name: v, path: `images/svg/${v}` }));

      const allRules = ['visitor', 'non-veg-food', 'other-gender', 'smoking', 'drinking', 'loud-music', 'party'];
      const rulesProp = [];
      rules = convertToArray(rules);
      allRules.forEach(v => rulesProp.push({ name: v, allowed: rules.includes(v), path: `images/svg/${v}` }));

      const otherChargesProp = [];
      otherCharges = convertToArray(otherCharges);
      otherChargesText = convertToArray(otherChargesText);
      otherCharges.forEach((v, idx) => otherChargesProp.push({ name: v, detail: otherChargesText[idx] || '', path: `images/svg/${v}` }));

      occupancy = convertToArray(occupancy || []);

      // Determine owner id (prefer req.user from passport)
      const ownerId = (req.user && req.user._id) ? req.user._id.toString() : (req.session && req.session.userRoleID ? req.session.userRoleID.toString() : null);
      if (!ownerId) {
        console.error('No owner id available in req.user or session');
        return res.status(403).render('error', { code: 403, error: 'You must be logged in as provider' });
      }

      const owner = await providers.findById(ownerId);
      if (!owner) {
        console.error('Provider not found for id:', ownerId);
        return res.status(404).render('error', { code: 404, error: 'Owner not found' });
      }

      // Convert uploaded file paths to relative web paths
      const images = (req.files || []).map(f => {
        // Use path.relative to remove 'public' prefix and normalize separators
        const rel = path.relative(path.join(__dirname, '..', 'public'), f.path);
        return '/' + rel.split(path.sep).join('/'); // ensure forward slashes for browser
      });

      // Create property
      const propertyCreated = await properties.create({
        name, isLoggedIn,
        address,
        maxOcc: maxOccupancy,
        type,
        desc,
        food: foodProp,
        amenities: amenityProp,
        rules: rulesProp,
        otherCharges: otherChargesProp,
        occupancy,
        rate,
    tagline: tagLine,
        since,
        interested: 0,
        rating: 0.0,
        owner: owner._id,
        bookingMoney,
        images
      });

      // Link property to provider
      owner.properties = owner.properties || [];
      owner.properties.push(propertyCreated._id);
      await owner.save();

      console.log('Property created:', propertyCreated._id.toString());
      return res.redirect('/provider/dashboard'); // provider can see it immediately
    } catch (e) {
      console.error('Error creating property:', e);
      res.render('error', { code: 500, error: 'Internal server error' });
    }
  });

/* --- View property page --- */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const property = await properties.findById(id);
    if (!property) return res.status(404).render('error', { error: 'Property not found!', code: 404 });

    await property.populate({ path: 'reviews', populate: { path: 'userID' }, options: { sort: { date: -1 } } });
    await property.populate('owner');
    res.render('property-page', { property });
  } catch (e) {
    console.error('GET /property/:id error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Edit property page --- */
router.get('/:id/edit', isLoggedIn, isRoleProvider, async (req, res) => {
  try {
    const { id } = req.params;
    const property = await properties.findById(id);
    if (!property) return res.status(404).render('error', { error: 'Property not found!', code: 404 });

    // Compare owner string IDs to avoid ObjectId/str mismatch
    const ownerId = (req.user && req.user._id) ? req.user._id.toString() : (req.session.userRoleID || '').toString();
    if (property.owner.toString() !== ownerId) return res.status(403).send({ error: 'Not Authorized!' });

    res.render('edit-pg', { property });
  } catch (e) {
    console.error('GET /property/:id/edit error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Update property (PATCH recommended) --- */
router.post('/:id', isLoggedIn, isRoleProvider, validatePropertyDetails, async (req, res) => {
  try {
    const { id } = req.params;
    const property = await properties.findById(id);
    if (!property) return res.status(404).render('error', { error: 'Property not found!', code: 404 });

    const ownerId = (req.user && req.user._id) ? req.user._id.toString() : (req.session.userRoleID || '').toString();
    if (property.owner.toString() !== ownerId) return res.status(403).send({ error: 'Not Authorized!' });

    let {
      maxOccupancy, type, desc, food, foodText,
      amenities, rules, otherCharges, otherChargesText, occupancy, rate, tagLine, since
    } = req.body;

    property.food = [];
    food = convertToArray(food);
    foodText = convertToArray(foodText);
    food.forEach((v, idx) => property.food.push({ name: v, detail: foodText[idx] || '', path: `images/svg/${v}` }));

    property.amenities = [];
    amenities = convertToArray(amenities);
    amenities.forEach(v => property.amenities.push({ name: v, path: `images/svg/${v}` }));

    const allRules = ['visitor-entry', 'non-veg-food', 'opposite-gender', 'smoking', 'drinking', 'loud-music', 'party'];
    property.rules = [];
    rules = convertToArray(rules);
    allRules.forEach(v => property.rules.push({ name: v, allowed: rules.includes(v), path: `images/svg/${v}` }));

    property.otherCharges = [];
    otherCharges = convertToArray(otherCharges);
    otherChargesText = convertToArray(otherChargesText);
    otherCharges.forEach((v, idx) => property.otherCharges.push({ name: v, detail: otherChargesText[idx] || '', path: `images/svg/${v}` }));

    occupancy = convertToArray(occupancy || []);

    property.maxOccupancy = maxOccupancy;
    property.type = type;
    property.desc = desc;
    property.occupancy = occupancy;
    property.rate = rate;
  property.tagline = tagLine;
    property.since = since;

    await property.save();
    res.send({ success: 'property edited successfully' });
  } catch (e) {
    console.error('POST /property/:id update error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Delete property --- */
router.delete('/:id', isLoggedIn, isRoleAdminOrProvider, async (req, res) => {
  try {
    const { id } = req.params;
    const property = await properties.findById(id);
    if (!property) return res.status(404).send({ error: 'Property not found!' });

    // Admin can delete anyone, provider only if owner
    if (req.user.role !== 'admin' && property.owner.toString() !== (req.user._id ? req.user._id.toString() : (req.session.userRoleID || '').toString()))
      return res.status(403).send({ error: 'Not Authorized!' });

    const owner = await providers.findById(property.owner);
    if (owner) {
      await bookings.deleteMany({ $and: [{ property: id }, { completed: false }] });
      owner.properties = (owner.properties || []).filter(pId => pId.toString() !== id.toString());
      await owner.save();
    }

    await riders.updateMany({}, { $pull: { bookings: { $elemMatch: { property: id, completed: false } } } });
    await properties.deleteOne({ _id: id });

    return res.send({ success: 'property deleted successfully' });
  } catch (e) {
    console.error('DELETE /property/:id error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Toggle like --- */
router.post('/:id/toggle', isLoggedIn, isRoleRider, async (req, res) => {
  try {
    const userId = (req.user && req.user._id) ? req.user._id.toString() : (req.session.userRoleID || '').toString();
    const user = await riders.findById(userId);
    const { id } = req.params;
    const property = await properties.findById(id);
    if (!property || !user) return res.status(404).send({ error: 'Not found' });

    let state;
    if (user.likes.map(l => l.toString()).includes(id.toString())) {
      property.interested = Math.max(0, (property.interested || 1) - 1);
      await riders.findByIdAndUpdate(userId, { $pull: { likes: property._id } });
      state = false;
    } else {
      property.interested = (property.interested || 0) + 1;
      await riders.findByIdAndUpdate(userId, { $push: { likes: property._id } });
      state = true;
    }
    await property.save();
    res.send({ success: 'updated successfully', state });
  } catch (e) {
    console.error('POST /property/:id/toggle error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

/* --- Stripe checkout --- */
router.get('/:id/makePayment', isLoggedIn, isRoleRider, async (req, res) => {
  try {
    const { id } = req.params;
    const property = await properties.findById(id);
    if (!property) return res.status(404).send({ error: 'Property not found' });

    const paymentKey = paymentKeyGenerator();
    const paymentSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'inr',
          product_data: { name: property.name },
          unit_amount: Math.round((property.bookingMoney || 0) * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${serverURL}/booking/payment-successful?propertyID=${id}&key=${paymentKey}`,
      cancel_url: `${serverURL}/property/${id}`
    });

    // respond JSON correctly
    res.json({ url: paymentSession.url });

    await keys.create({
      key: paymentKey,
      content: {
        user: (req.user && req.user._id) ? req.user._id.toString() : (req.session.userRoleID || ''),
        prop: property._id.toString(),
        paymentID: paymentSession.id,
      },
      purpose: 'payment'
    });
  } catch (e) {
    console.error('GET /property/:id/makePayment error:', e);
    res.render('error', { code: 500, error: 'Internal server error' });
  }
});

module.exports = router;
