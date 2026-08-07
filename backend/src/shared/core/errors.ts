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
