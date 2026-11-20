export type KeystoneErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTEGRATION_ERROR";

export class KeystoneError extends Error {
  constructor(
    readonly code: KeystoneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends KeystoneError {
  constructor() {
    super("UNAUTHENTICATED", "You need to sign in.");
  }
}

export class PermissionDeniedError extends KeystoneError {
  constructor(
    readonly permission: string,
    message = `Missing permission: ${permission}`,
  ) {
    super("FORBIDDEN", message);
  }
}

export class SelfApprovalError extends PermissionDeniedError {
  constructor(permission: string) {
    super(permission, "You can't approve or reject your own request.");
  }
}

export class ValidationError extends KeystoneError {
  constructor(
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super("INVALID_INPUT", message);
  }
}

export class NotFoundError extends KeystoneError {
  constructor(what: string) {
    super("NOT_FOUND", `${what} not found.`);
  }
}

export class ConflictError extends KeystoneError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}
