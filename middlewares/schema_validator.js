const {registrationSchema, loginSchema, riderSchema, providerSchema, propertySchema, contactSchema} = require('../utils/validation_schemas');
const {getZipcodeDetails} = require("../utils/zipcode_details");

/* UTILITY FUNCTION TO GET ERROR MESSAGES */

function errorModifier (error) {
	return error.details.map(err => {
		const msg = err.message;
		const at = err.context.label;
		return {msg, at};
	});
}

/* VALIDATION FUNCTIONS */

function validateRegistration (req, res, next) {
	const {email, pass, confirmPass, role, name} = req.body;
	const {error} = registrationSchema.validate({
		email, pass, confirmPass, role, name
	});

	if (error) {
		const errors = errorModifier(error);
		return res.status(406).send({error: true, errors});
	}

	next();
}

function validateLogin (req, res, next) {
	const {email, pass} = req.body;
	const {error} = loginSchema.validate({
		email, pass
	});

	if (error) {
		const errors = errorModifier(error);
		return res.status(406).send({error: true, errors});
	}

	next();
}

function validateRiderDetails (req, res, next) {
	const {phone, gender, dob, occupation, emContactName, emContactRelation, emContactPhone} = req.body;
	const {error} = riderSchema.validate({
		phone, gender, dob, occupation, emContactName, emContactRelation, emContactPhone
	});

	if (error) {
		const errors = errorModifier(error);
		return res.status(406).send({error: true, errors});
	}

	next();
}

// Minimal offline ZIP-to-State mapping (you can expand as needed)
const zipStateMap = {
    '400001': 'Maharashtra',
    '400602': 'Maharashtra',
    '410201': 'Maharashtra', // Karjat
    '560001': 'Karnataka',
    '110001': 'Delhi',
    '700001': 'West Bengal',
    '600001': 'Tamil Nadu'
};


async function validateProviderDetails(req, res, next) {
    try {
        const { phone, dob, gst, addBuilding, addL1, landmark, state, city, zipCode } = req.body;

        // Validate schema using Joi or your existing validator
        const { error } = providerSchema.validate({ phone, dob, gst, addBuilding, addL1, landmark, state, city, zipCode });
        if (error) {
            const errors = errorModifier(error);
            return res.status(406).send({ error: true, errors });
        }

        // Local ZIP validation (offline)
        const expectedState = zipStateMap[zipCode];
        if (!expectedState) {
            console.warn(`⚠️ Unknown ZIP code: ${zipCode}, skipping verification.`);
        } else if (expectedState !== state) {
            console.warn(`⚠️ ZIP mismatch — Expected: ${expectedState}, Got: ${state}`);
        }

        // Continue to next handler
        next();
    } catch (err) {
        console.error('Error in validateProviderDetails middleware:', err);
        res.status(500).send({ error: true, message: 'Internal validation error!' });
    }
}


async function validatePropertyDetails (req, res, next) {
	const {
		name, addBuilding, addL1, landmark, state, city, zipCode, maxOccupancy,
		type, desc, occupancy, rate, tagLine, since, bookingMoney
	} = req.body;

	const {error} = propertySchema.validate({
		name, addBuilding, addL1, landmark, state, city, zipCode, maxOccupancy,
		type, desc, occupancy, rate, tagLine, since, bookingMoney
	});

	if (error) {
		const errors = errorModifier(error);
		return res.status(406).send({error: true, errors});
	}

	

	if (zipDetails.error)
		return res.status(406).send({error: true, errors: [
				{msg: 'Zip Details could not be verified!'}
			]});

	if (zipDetails.state !== state)
		return res.status(406).send({error: true, errors: [
				{msg: 'Zip details invalid!'}
			]});

	next();
}

function validateContact (req, res, next) {
	const {email, subject, content} = req.body;
	const {error} = contactSchema.validate({
		email, subject, content
	});

	if (error) {
		const errors = errorModifier(error);
		return res.status(406).send({error: true, errors});
	}

	next();
}

module.exports = {
	validateRegistration,
	validateLogin,
	validateRiderDetails,
	validateProviderDetails,
	validatePropertyDetails,
	validateContact
}