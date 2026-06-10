/**
 * Input validation helpers.
 *
 * `checkLength` throws a ValidationError (HTTP 400) that the global error handler
 * turns into a JSON response — use it in route handlers for friendly per-field
 * limits. `limitBodyStrings` is an Express middleware: a blanket safety net that
 * rejects any oversized string anywhere in the request body.
 */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

// Hard ceiling on any single string field (abuse guard).
const MAX_STRING = 10000;

// Friendly per-field limits for common free-text inputs.
const LIMITS = {
  name: 80, // list names
  title: 300, // title text
  shortText: 200, // streaming service, platform, person, source, etc.
  notes: 5000, // notes / reviews / descriptions
};

/**
 * Throw a 400 if a string value exceeds `max`. Non-strings/null pass through.
 * @returns the value (for convenient inline use)
 */
function checkLength(value, max, label) {
  if (typeof value === 'string' && value.length > max) {
    throw new ValidationError(`${label} is too long (max ${max} characters).`);
  }
  return value;
}

/**
 * Express middleware — reject a request whose body contains any string longer
 * than MAX_STRING (checked recursively through arrays and objects).
 */
function limitBodyStrings(req, res, next) {
  const tooLong = (v) => {
    if (typeof v === 'string') return v.length > MAX_STRING;
    if (Array.isArray(v)) return v.some(tooLong);
    if (v && typeof v === 'object') return Object.values(v).some(tooLong);
    return false;
  };
  if (req.body && tooLong(req.body)) {
    return res.status(400).json({ error: `A field exceeds the ${MAX_STRING}-character limit.` });
  }
  next();
}

module.exports = { ValidationError, LIMITS, checkLength, limitBodyStrings };
