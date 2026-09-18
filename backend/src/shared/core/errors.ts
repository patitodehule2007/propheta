/**
 * Base class for all typed application errors.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor(statusCode: number, code: string, message: string) {
        super(message);
        this.name = new.target.name;
        this.statusCode = statusCode;
        this.code = code;
    }
}

/**
 * Thrown when user input fails validation.
 */
export class ValidationError extends AppError {
    constructor(message: string) {
        super(400, "VALIDATION_ERROR", message);
    }
}

/**
 * Thrown when a requested resource does not exist.
 */
export class NotFoundError extends AppError {
    constructor(message: string) {
        super(404, "NOT_FOUND", message);
    }
}

/**
 * Thrown when authentication fails or a session is invalid.
 */
export class AuthenticationError extends AppError {
    constructor(message: string) {
        super(401, "AUTHENTICATION_ERROR", message);
    }
}

/**
 * Thrown when a call to an upstream third-party API fails or returns an
 * unexpected response.
 */
export class ExternalServiceError extends AppError {
    /**
     * The upstream HTTP status, when known. Never sent to the client (the
     * middleware only reads `statusCode`/`code`/`message`) -- kept for
     * callers that need to distinguish upstream failure modes internally,
     * e.g. treating a Kalshi 409 (duplicate client_order_id) as idempotent
     * success rather than a genuine error.
     */
    public readonly upstreamStatus?: number;

    constructor(message: string, upstreamStatus?: number) {
        super(502, "EXTERNAL_SERVICE_ERROR", message);
        this.upstreamStatus = upstreamStatus;
    }
}

/**
 * Thrown when a request conflicts with the current state of a resource
 * (e.g. a unique constraint violation).
 */
export class ConflictError extends AppError {
    constructor(message: string) {
        super(409, "CONFLICT", message);
    }
}
