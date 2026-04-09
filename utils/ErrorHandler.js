// utils/ErrorHandler.js
class ErrorHandler {
  static logError(context, error, additionalData = {}) {
    console.error(JSON.stringify({
      event: 'error',
      context,
      message: error.message,
      stack: error.stack,
      ...additionalData,
      ts: new Date().toISOString()
    }));
  }

  static createResponse(statusCode, error, code = null) {
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error.message || error,
        code
      })
    };
  }
}

module.exports = ErrorHandler;