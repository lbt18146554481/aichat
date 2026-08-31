// Shared auth types — safe to import from client or server.

export type AuthProvider = "google" | "apple" | "wechat" | "email";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  provider: AuthProvider;
  createdAt: number;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
