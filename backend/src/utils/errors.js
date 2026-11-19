'use strict';

/**
 * Application-level HTTP error.
 *
 * Controllers and services throw these; the centralized error middleware
 * converts them into a consistent JSON response.
 */
class HttpError extends Error {
  /**
   * @param {number} status  HTTP status code (e.g. 404)
   * @param {string} message human-readable message for the API client
   * @param {object} [details] optional field-level details (e.g. validation errors)
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details !== undefined) this.fields = details;
  }

  static badRequest(message, details) {
    return new HttpError(400, message, details);
  }

  static notFound(message) {
    return new HttpError(404, message);
  }

  static internal(message) {
    return new HttpError(500, message);
  }
}

module.exports = { HttpError };
