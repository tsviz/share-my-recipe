// Express session and Flash augmentations
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
      created_at?: string;
      profile_image?: string | null;
      bio?: string | null;
    }
    interface Request {
      flash(type: string, message?: any): any;
      logout(callback: (err: any) => void): void;
    }
  }
}

// Makes this file a module
export {};